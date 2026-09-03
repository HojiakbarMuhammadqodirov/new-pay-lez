/**
 * Anti-fraud — §13. Cross-cutting, and deliberately not a wall.
 *
 * The design principle in the spec is trust tiers: "concentrates friction on the
 * risky minority". So nothing here blocks by default. The checks *open cases*
 * and raise or lower a customer's ceiling; the only hard refusals in the whole
 * backend are the ones that are arithmetic rather than judgement — a replayed
 * QR, a stale NFC counter, a second visit the same day. Those are in the gate,
 * because they are rules rather than suspicions.
 *
 * That split matters. A velocity heuristic that refuses a transaction is a
 * heuristic that eventually refuses a real customer standing at a real counter
 * with a cashier watching, and nobody in that room can appeal it. A heuristic
 * that files a case gets adjudicated by somebody (C3) with the whole picture.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { newId } from './ids.ts';
import { minutesBetween, now, plusDays, type Iso } from './time.ts';
import { distanceKm } from './venues.ts';

export type CaseKind =
  | 'impossible_travel'
  | 'velocity'
  | 'burst'
  | 'multi_account'
  | 'disputed_transaction'
  | 'replay';

export async function openCase(
  db: Db,
  input: {
    kind: CaseKind;
    detail: string;
    severity?: 'low' | 'medium' | 'high';
    userId?: string | null;
    venueId?: string | null;
    transactionId?: string | null;
    deviceId?: string | null;
    at?: Iso;
  },
): Promise<string> {
  const id = newId('frd');
  await db.run(
    `INSERT INTO fraud_cases
       (id, kind, severity, user_id, venue_id, transaction_id, device_id, detail, status, created_at)
     VALUES ($i, $k, $s, $u, $v, $x, $d, $de, 'open', $at)`,
    {
      i: id,
      k: input.kind,
      s: input.severity ?? 'medium',
      u: input.userId ?? null,
      v: input.venueId ?? null,
      x: input.transactionId ?? null,
      d: input.deviceId ?? null,
      de: input.detail,
      at: input.at ?? now(),
    },
  );
  return id;
}

/**
 * Run the velocity checks a committed transaction can trigger.
 *
 * Called *after* the commit, on purpose (see the note at the top): the money has
 * already changed hands at the counter, and the question is whether a human
 * should look at it, not whether to embarrass a customer.
 */
export async function checkTransaction(
  db: Db,
  input: { userId: string; venueId: string; transactionId: string; deviceId?: string | null; at?: Iso },
): Promise<string[]> {
  const at = input.at ?? now();
  const cases: string[] = [];

  /* Impossible travel: the previous confirmed scan, and whether a human body
     could have covered the distance in the elapsed time. 900 km/h is a plane, so
     anything over it is either two people on one account or a forged trigger. */
  const previous = await db.get<{ venue_id: string; confirmed_at: string; lat: number | null; lng: number | null }>(
    `SELECT t.venue_id, t.confirmed_at, v.lat, v.lng
       FROM transactions t JOIN venues v ON v.id = t.venue_id
      WHERE t.user_id = $u AND t.status = 'committed' AND t.id != $x
      ORDER BY t.confirmed_at DESC LIMIT 1`,
    { u: input.userId, x: input.transactionId },
  );
  const here = await db.get<{ lat: number | null; lng: number | null }>(
    `SELECT lat, lng FROM venues WHERE id = $v`,
    { v: input.venueId },
  );

  if (
    previous?.confirmed_at &&
    previous.lat !== null && previous.lng !== null &&
    here?.lat != null && here?.lng != null
  ) {
    const minutes = Math.abs(minutesBetween(previous.confirmed_at, at));
    const km = distanceKm(
      { lat: previous.lat, lng: previous.lng },
      { lat: here.lat, lng: here.lng },
    );
    const possible = (CONFIG.gate.travelKmPerHour * minutes) / 60;
    if (km > 1 && km > possible) {
      cases.push(
        await openCase(db, {
          kind: 'impossible_travel',
          severity: 'high',
          userId: input.userId,
          venueId: input.venueId,
          transactionId: input.transactionId,
          detail: `${km.toFixed(0)} km in ${minutes.toFixed(0)} min`,
          at,
        }),
      );
    }
  }

  const hour = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions
      WHERE user_id = $u AND status = 'committed' AND confirmed_at >= $s`,
    { u: input.userId, s: new Date(new Date(at).getTime() - 3_600_000).toISOString() },
  );
  if ((hour?.n ?? 0) > CONFIG.gate.burstPerHour) {
    cases.push(
      await openCase(db, {
        kind: 'burst',
        userId: input.userId,
        venueId: input.venueId,
        transactionId: input.transactionId,
        detail: `${hour?.n} confirmed scans in an hour`,
        at,
      }),
    );
  }

  if (input.deviceId) {
    const accounts = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM device_users WHERE device_id = $d`,
      { d: input.deviceId },
    );
    if ((accounts?.n ?? 0) > CONFIG.fraud.accountsPerDevice) {
      cases.push(
        await openCase(db, {
          kind: 'multi_account',
          userId: input.userId,
          deviceId: input.deviceId,
          detail: `${accounts?.n} accounts on one device`,
          at,
        }),
      );
    }
  }

  return cases;
}

/**
 * §13 trust tiers.
 *
 * A tier is a count of confirmed transactions, recomputed rather than
 * incremented, so a reversal takes the trust back with it. Tier 0 is a brand-new
 * account: low caps, everything staff-confirmed. What each tier actually permits
 * is read at the point of use, not encoded here — that keeps the tier a fact
 * about the account rather than a policy scattered across the codebase.
 */
export async function refreshTrust(db: Db, userId: string): Promise<number> {
  const confirmed = (await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions WHERE user_id = $u AND status = 'committed'`,
    { u: userId },
  ))?.n ?? 0;

  let tier = 0;
  CONFIG.fraud.tierThresholds.forEach((threshold, index) => {
    if (confirmed >= threshold) tier = index;
  });
  await db.run(`UPDATE users SET trust_tier = $t WHERE id = $u`, { t: tier, u: userId });
  return tier;
}

/**
 * §13. A partner flags a transaction inside the dispute window.
 *
 * The window exists so settlement is not final the instant a scan lands. Outside
 * it, the answer is "talk to support" rather than a silent no — hence the
 * explicit `expired` result rather than a boolean.
 */
export async function dispute(
  db: Db,
  transactionId: string,
  note: string,
  at: Iso = now(),
): Promise<{ ok: boolean; reason?: 'expired' | 'not_committed' }> {
  const txn = await db.get<{ status: string; confirmed_at: string | null; user_id: string; venue_id: string }>(
    `SELECT status, confirmed_at, user_id, venue_id FROM transactions WHERE id = $i`,
    { i: transactionId },
  );
  if (!txn || txn.status !== 'committed' || !txn.confirmed_at) {
    return { ok: false, reason: 'not_committed' };
  }
  const hours = minutesBetween(txn.confirmed_at, at) / 60;
  if (hours > CONFIG.fraud.disputeWindowHours) return { ok: false, reason: 'expired' };

  await db.run(`UPDATE transactions SET disputed_at = $t, dispute_note = $n WHERE id = $i`, {
    t: at,
    n: note,
    i: transactionId,
  });
  await openCase(db, {
    kind: 'disputed_transaction',
    userId: txn.user_id,
    venueId: txn.venue_id,
    transactionId,
    detail: note,
    at,
  });
  return { ok: true };
}

/** Cases a human still has to look at (C3's queue). */
export const openCases = async (db: Db, limit = 100) =>
  await db.all(
    `SELECT * FROM fraud_cases WHERE status IN ('open', 'reviewing')
      ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at
      LIMIT $l`,
    { l: limit },
  );

/** Devices this account has been seen on, for the multi-accounting picture. */
export async function touchDevice(
  db: Db,
  input: { fingerprint: string; userId: string; platform?: string; at?: Iso },
): Promise<string> {
  const at = input.at ?? now();
  const existing = await db.get<{ id: string }>(`SELECT id FROM devices WHERE fingerprint = $f`, {
    f: input.fingerprint,
  });
  const id = existing?.id ?? newId('dev');
  if (existing) {
    await db.run(`UPDATE devices SET last_seen_at = $t WHERE id = $i`, { t: at, i: id });
  } else {
    await db.run(
      `INSERT INTO devices (id, fingerprint, platform, first_user_id, first_seen_at, last_seen_at)
       VALUES ($i, $f, $p, $u, $t, $t)`,
      { i: id, f: input.fingerprint, p: input.platform ?? null, u: input.userId, t: at },
    );
  }
  await db.run(
    `INSERT OR IGNORE INTO device_users (device_id, user_id, seen_at) VALUES ($d, $u, $t)`,
    { d: id, u: input.userId, t: at },
  );
  return id;
}

/** Old cases nobody adjudicated. Surfaced rather than closed — see C3. */
export const staleCases = async (db: Db, at: Iso = now(), days = 14) =>
  await db.all(`SELECT * FROM fraud_cases WHERE status = 'open' AND created_at < $s`, {
    s: plusDays(at, -days),
  });
