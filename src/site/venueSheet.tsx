import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { useCopy, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { categoryLabel } from './adminMetrics';
import { ApiError, call } from './api/client';
import { minorToEuro } from './api/partner';
import { useApi } from './api/useApi';
import { useAuth } from './auth/context';
import {
  clockTime,
  CONSENTS_PATH,
  dayMonth,
  hoursForToday,
  inlineImage,
  issueVoucher,
  pointsMissing,
  purchaseFailure,
  shareProfileWith,
  stopSharingWith,
  venuePath,
  voucherAttemptKey,
  weekdayName,
  type Consents,
  type IssuedVoucher,
  type PurchaseFailure,
  type VenueDetail,
  type VenueRef,
  type VenueStampCard,
  type VenueTier,
} from './api/venue';

/**
 * One venue, opened from the wallet.
 *
 * The wallet used to know a venue only as a name on a card: a deal said who was
 * offering it, a stamp card said where the visits counted, and a voucher said
 * nothing at all — the row is a `venue_id` and a code. None of them could answer
 * the question a player actually has standing outside a café, which is "what do
 * my points get me *here*". This is that answer, from `GET /v1/venues/:id`, and
 * it is the first place on the web where a player can act on a venue rather than
 * read about one: buy a voucher off its ladder, and decide whether it may know
 * who they are.
 *
 * ── every block is conditional on its own field ──────────────────────────
 *
 * The Relocate guide's rule, carried over with its reason: a heading over an em
 * dash promises the row holds something it does not. No address, no address
 * line; no tiers, no ladder; no cards here, no stamp block. The one block that
 * is always drawn is the sharing switch, because it is about the player rather
 * than the venue and the answer is never absent — it is yes or no.
 *
 * ── the construction is the guide's ───────────────────────────────────────
 *
 * `.gs-scrim` / `.gs-panel` / `.gs-close` are reused rather than restyled,
 * which `CLAUDE.md` allows for the same component: this is a listing, opened, in
 * a modal, and it should look like the other one. What it adds is what that one
 * skipped — a real focus trap (Tab cannot walk out onto the page behind a modal
 * that says `aria-modal`), and focus handed back to the control that opened it,
 * which the guide's comment promises and its code does not do. It is portalled
 * to `document.body` because the wallet's cards carry `data-reveal`, and a
 * `position: fixed` scrim inside a transformed ancestor is fixed to that
 * ancestor rather than to the screen.
 */

/** A refused purchase: which rung, why, and — when the server said — by how much. */
interface PurchaseRefusal {
  tierId: string;
  kind: PurchaseFailure;
  missing: number | null;
}

/* ═════════════════════════════════════════════════════════════ the marks ══ */

/**
 * The venue's mark: its own picture when the picture is already in hand, its
 * initial on the accent otherwise.
 *
 * `inlineImage` is the whole policy — a `data:` URL is drawn, anything else
 * would be a request to somebody else's server and is not. Code-point aware for
 * the reason `GuideMark` gives: a name that starts outside the BMP must not be
 * cut in half.
 */
export function VenueMark({
  name,
  image,
  size,
}: {
  name: string;
  image?: string | null;
  size?: 'lg';
}) {
  const src = inlineImage(image);
  return (
    <span className="vsh-mark" data-size={size} aria-hidden="true">
      {src ? <img src={src} alt="" /> : ([...name.trim()][0] ?? '?').toLocaleUpperCase()}
    </span>
  );
}

/**
 * A code somebody reads out at a till, large, with a way to copy it.
 *
 * Voucher codes, reward codes and the player's `@username` are the three
 * strings staff type into the dashboard's counter tool, so all three are drawn
 * by this one component rather than three near-misses: display face, open
 * tracking, `user-select: all` so a long-press takes the whole code and not one
 * character of it.
 *
 * The clipboard is not guaranteed — it needs a secure context and permission —
 * so the code stays visible and selectable whatever happens, and the button only
 * ever adds a shortcut. A refused write confirms nothing rather than claiming a
 * copy that did not happen; the same arrangement `admin.tsx` uses for an id.
 */
export function CounterCode({
  code,
  hint,
  size,
}: {
  code: string;
  /** Replaces "Show this code at the counter" where the card says it better. */
  hint?: string;
  size?: 'hero';
}) {
  const copy = useCopy().wallet.code;
  const [copied, setCopied] = useState(false);

  /* Held in a ref and cleared on unmount: the confirmation outlives a sheet
     closed inside its second and a half, and a timer calling `setCopied` on a
     component that has gone is a timer nobody can see firing. */
  const revert = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (revert.current !== null) clearTimeout(revert.current);
    },
    [],
  );

  const onCopy = () => {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        if (revert.current !== null) clearTimeout(revert.current);
        revert.current = setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  };

  return (
    <div className="wal-code" data-size={size}>
      <div className="wal-code-row">
        {/* `translate="no"`: a browser translating the page must not turn a
            code into a word. `PLZ-KASA` is not Polish for anything. */}
        <b className="wal-code-value" translate="no">
          {code}
        </b>
        <button
          type="button"
          className="wal-copy"
          onClick={onCopy}
          aria-label={fill(copy.copyLabel, { code })}
        >
          <Icon name={copied ? 'check' : 'copy'} size={15} />
          <span aria-hidden="true">{copied ? copy.copied : copy.copy}</span>
        </button>
      </div>
      <span className="wal-code-hint">{hint ?? copy.show}</span>
      {/* The button's name stays "Copy PLZ-…" so it can be found again; the
          confirmation is announced from here instead. */}
      <span className="visually-hidden" role="status">
        {copied ? copy.copied : ''}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ the request ══ */

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; data: VenueDetail }
  | { status: 'error'; error: ApiError };

/**
 * `GET /v1/venues/:id`, kept on screen while it is re-read.
 *
 * Not `useApi`, because a purchase re-reads the ladder and `useApi` answers a
 * re-read by going back to `loading` — which would blank the sheet, the new
 * voucher code with it, at the one moment the player most needs to read it. So
 * the last answer stands while the next is asked. A re-read that fails keeps
 * that answer — it is the server's, from seconds ago — except a 404, which means
 * the venue is gone and has to say so.
 */
function useVenueDetail(venueId: string, language: string) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    /* A retry after a failure has to look like it is doing something. A
       re-read over good data does not, and must not blank it. */
    setState((held) => (held.status === 'error' ? { status: 'loading' } : held));

    call<VenueDetail>(venuePath(venueId), { signal: controller.signal, language })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const error = cause instanceof ApiError ? cause : new ApiError(0, 'unknown', String(cause));
        setState((held) =>
          held.status === 'ready' && error.status !== 404 ? held : { status: 'error', error },
        );
      });

    return () => controller.abort();
  }, [venueId, nonce, language]);

  return { state, reload };
}

/* ═════════════════════════════════════════════════════════════ the sheet ══ */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What Tab may land on inside the panel — visible, enabled, in order. */
const focusableIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => node.getClientRects().length > 0,
  );

export function VenueSheet({
  venue: ref,
  balance,
  returnFocus,
  onClose,
  onChanged,
}: {
  venue: VenueRef;
  /**
   * The wallet's balance, or `null` while `GET /v1/wallet` has not answered.
   *
   * `null` enables every affordable-looking button rather than disabling them
   * all: the server is the judge of a balance either way, and a shortfall it
   * finds is a sentence, not a crash. A guessed balance would disable a button
   * the player can in fact afford.
   */
  balance: number | null;
  /** The control that opened the sheet, given focus back on close. */
  returnFocus: HTMLElement | null;
  onClose: () => void;
  /** Something the wallet shows has changed — a voucher bought. */
  onChanged: () => void;
}) {
  const wallet = useCopy().wallet;
  const copy = wallet.sheet;
  const categories = useCopy().listing.categories;
  const [language] = useLanguage();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const { state, reload } = useVenueDetail(ref.id, language);
  const data = state.status === 'ready' ? state.data : null;

  /* The callbacks the parent re-creates on every render, held so the keyboard
     listener below is attached once per open rather than once per render. */
  const closeRef = useRef(onClose);
  const changedRef = useRef(onChanged);
  useEffect(() => {
    closeRef.current = onClose;
    changedRef.current = onChanged;
  }, [onClose, onChanged]);

  /*
   * Modal, properly: Escape closes, Tab and Shift+Tab cycle inside the panel,
   * the page behind does not scroll, and focus goes back where it came from.
   *
   * StrictMode runs this, tears it down and runs it again. That is harmless
   * here by construction — the teardown restores exactly what the setup
   * changed, so the second run starts from the same page the first did.
   */
  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const targets = focusableIn(panel);
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active) || active === panel;

      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    /* Restored rather than cleared, as the guide does it: a page that was
       already locked by something else stays locked. */
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  /* ── the one press that spends points ── */

  const [buying, setBuying] = useState<string | null>(null);
  const [got, setGot] = useState<IssuedVoucher | null>(null);
  const [failure, setFailure] = useState<PurchaseRefusal | null>(null);

  /*
   * One idempotency key per attempt at a rung, kept only while the attempt's
   * outcome is unknown.
   *
   * A request that never answered may still have issued the voucher, so its
   * retry must carry the same key — the server then hands back the voucher it
   * already issued instead of charging a second time. A request the server
   * *answered* is finished either way, and the next press is a new attempt
   * with a new key; reusing it would replay the refusal forever.
   */
  const attempts = useRef(new Map<string, string>());

  const buy = useCallback(
    async (venueId: string, tier: VenueTier) => {
      if (buying !== null) return;
      const key = attempts.current.get(tier.id) ?? voucherAttemptKey(venueId, tier.id);
      attempts.current.set(tier.id, key);
      setBuying(tier.id);
      setFailure(null);

      try {
        const voucher = await issueVoucher(venueId, tier.id, key);
        attempts.current.delete(tier.id);
        setGot(voucher);
        /* Both halves of what moved are the server's to report: the ladder
           (a pool that just reserved money may close a rung) and the wallet
           (the balance and the new voucher). Neither is patched here. */
        reload();
        changedRef.current();
      } catch (error) {
        const kind = purchaseFailure(error);
        if (kind !== 'unreachable') attempts.current.delete(tier.id);
        setFailure({ tierId: tier.id, kind, missing: pointsMissing(error) });
        /* A refusal means the page was out of date — a balance, a pool, a
           switched-off program — so the page is re-read rather than argued
           with. */
        if (kind !== 'unreachable' && kind !== 'other' && kind !== 'signedOut') {
          reload();
          changedRef.current();
        }
      } finally {
        setBuying(null);
      }
    },
    [buying, reload],
  );

  /* ── the scrim closes only a press that began on it ── */

  /* A text selection dragged out of the panel and released over the scrim is a
     click on the scrim, and it must not throw away the sheet somebody was
     reading. */
  const pressedScrim = useRef(false);

  const name = data?.venue.name ?? ref.name ?? null;
  const category = data?.venue.category ? categoryLabel(data.venue.category, categories) : null;

  return createPortal(
    <div
      className="gs-scrim vsh-scrim"
      onPointerDown={(event) => {
        pressedScrim.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedScrim.current && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="gs-panel vsh-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button type="button" className="gs-close" onClick={onClose} aria-label={copy.close}>
          <Icon name="close" size={16} strokeWidth={2.2} />
        </button>

        <div className="gs-panel-head vsh-head">
          {name && <VenueMark name={name} image={data?.venue.imageUrl} size="lg" />}
          <div>
            <h3 id={titleId}>{name ?? copy.loading}</h3>
            {category && <span className="vsh-category">{category}</span>}
          </div>
        </div>

        {state.status === 'loading' && <p className="vsh-note vsh-pad">{copy.loading}</p>}

        {state.status === 'error' && (
          <div className="vsh-down" role="alert">
            <p>
              {state.error.status === 404
                ? copy.gone
                : state.error.status === 0
                  ? copy.unreachable
                  : copy.refused}
            </p>
            {state.error.status !== 404 && (
              <button type="button" className="btn btn-ghost" onClick={reload}>
                {copy.retry}
              </button>
            )}
          </div>
        )}

        {data && (
          <>
            <Facts detail={data} />

            <Ladder
              detail={data}
              balance={balance}
              buying={buying}
              got={got}
              failure={failure}
              onBuy={(tier) => void buy(data.venue.id, tier)}
            />

            {data.stampCards.length > 0 && (
              <section className="gs-block vsh-block">
                <h4>{copy.stamps}</h4>
                <ul className="vsh-list">
                  {data.stampCards.map((card) => (
                    <StampLine key={card.campaign.id} card={card} />
                  ))}
                </ul>
              </section>
            )}

            {data.rewards.length > 0 && (
              <section className="gs-block vsh-block">
                <h4>{copy.rewards}</h4>
                <ul className="vsh-list">
                  {data.rewards.map((reward) => (
                    <li key={reward.id} className="vsh-item">
                      <b className="vsh-item-name">{reward.label}</b>
                      <CounterCode code={reward.code} />
                      <span className="vsh-until">
                        {fill(wallet.valid, { date: dayMonth(reward.expires_at, language) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.deals.length > 0 && (
              <section className="gs-block vsh-block">
                <h4>{copy.deals}</h4>
                <ul className="vsh-list">
                  {data.deals.map((deal) => (
                    <li key={deal.id} className="vsh-deal">
                      {deal.discountText && (
                        <span className="vsh-deal-fig">{deal.discountText}</span>
                      )}
                      <span className="vsh-deal-tx">
                        <b>{deal.copy.title}</b>
                        {deal.copy.description && <span>{deal.copy.description}</span>}
                        {deal.validTo && (
                          <span className="vsh-until">
                            {fill(wallet.deals.until, { date: dayMonth(deal.validTo, language) })}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="vsh-note">{wallet.deals.claimAtCounter}</p>
              </section>
            )}

            <ShareSwitch venueId={data.venue.id} venueName={data.venue.name} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════════════ the blocks ══ */

/**
 * What the place is, in three lines at most — address, price band, hours.
 *
 * `priceRange` is verbatim and in the venue's own currency: it is what the
 * place charges everybody who walks in, and converting it to the reader's
 * currency would quote a price nobody can pay. The one figure in the sheet that
 * does not go through `useMoney`, for the reason `.gs-price` states.
 */
function Facts({ detail }: { detail: VenueDetail }) {
  const copy = useCopy().wallet.sheet;
  const [language] = useLanguage();
  const { venue } = detail;
  const today = hoursForToday(detail.hours, venue.timezone);

  if (!venue.address && !venue.priceRange && !today && !detail.description) return null;

  /* "Today" only when the day was read on the venue's own clock; otherwise the
     day is named, which stays true wherever the reader is — see
     `hoursForToday`. */
  let hoursLine: string | null = null;
  if (today) {
    const { row } = today;
    const day = weekdayName(today.weekday, language);
    if (row.closed || row.opens_min === null || row.closes_min === null) {
      hoursLine = today.venueClock ? copy.closedToday : fill(copy.closedOn, { day });
    } else {
      const span = {
        from: clockTime(row.opens_min, language),
        to: clockTime(row.closes_min, language),
      };
      hoursLine = today.venueClock
        ? fill(copy.hoursToday, span)
        : fill(copy.hoursOn, { day, ...span });
    }
  }

  return (
    <section className="vsh-facts-block">
      {detail.description && <p className="vsh-about">{detail.description}</p>}
      {(venue.address || venue.priceRange || hoursLine) && (
        <ul className="vsh-facts">
          {venue.address && (
            <li>
              <Icon name="map" size={14} />
              <span>{venue.city ? `${venue.address}, ${venue.city}` : venue.address}</span>
            </li>
          )}
          {venue.priceRange && (
            <li>
              <Icon name="coin" size={14} />
              <span className="vsh-price">{venue.priceRange}</span>
            </li>
          )}
          {hoursLine && (
            <li>
              <Icon name="clock" size={14} />
              <span>{hoursLine}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * The voucher ladder — the reason the sheet exists.
 *
 * Each rung reads "15% off, up to £4.30" and carries its own button, and a
 * button that cannot be pressed says why beside it rather than greying out in
 * silence: a balance short by a stated number, a rung the venue's pool is not
 * issuing right now, or a venue that has vouchers switched off (said once, above
 * the rungs, because it is true of all of them).
 *
 * The cap is converted with `unit` rounding. It is a ceiling at the till, and
 * `exact` would round £3.80 up to "£4" — a promise the till then does not keep.
 */
function Ladder({
  detail,
  balance,
  buying,
  got,
  failure,
  onBuy,
}: {
  detail: VenueDetail;
  balance: number | null;
  buying: string | null;
  got: IssuedVoucher | null;
  failure: PurchaseRefusal | null;
  onBuy: (tier: VenueTier) => void;
}) {
  const wallet = useCopy().wallet;
  const copy = wallet.sheet;
  const money = useMoney();
  const [language] = useLanguage();
  const { venue, tiers } = detail;

  /* Kept on screen after a purchase even if the refreshed ladder comes back
     empty: the code just bought is the thing the player needs, and it must not
     disappear with the block it was bought from. */
  if (tiers.length === 0 && !got) return null;

  const cap = (minor: number) => money(minorToEuro(minor, venue.currency), 'unit');

  return (
    <section className="gs-block vsh-block">
      <h4>{copy.ladder}</h4>
      <p className="vsh-lede">{copy.ladderLede}</p>

      {got && (
        <div className="vsh-got">
          <p className="vsh-got-head" role="status">
            <Icon name="check" size={16} />
            <b>{copy.got}</b>
          </p>
          <span className="vsh-got-what">
            {fill(copy.tier, { pct: String(got.discount_pct), cap: cap(got.max_discount_minor) })}
          </span>
          <CounterCode code={got.code} />
          <span className="vsh-until">
            {fill(wallet.valid, { date: dayMonth(got.expires_at, language) })}
          </span>
        </div>
      )}

      {!venue.acceptsVouchers && tiers.length > 0 && (
        <p className="vsh-note vsh-strong">{copy.noVouchers}</p>
      )}

      {tiers.length > 0 && (
        <ul className="vsh-tiers">
          {tiers.map((tier) => (
            <TierLine
              key={tier.id}
              tier={tier}
              label={fill(copy.tier, { pct: String(tier.discountPct), cap: cap(tier.maxDiscountMinor) })}
              accepts={venue.acceptsVouchers}
              balance={balance}
              buying={buying}
              failure={failure?.tierId === tier.id ? failure : null}
              onBuy={() => onBuy(tier)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TierLine({
  tier,
  label,
  accepts,
  balance,
  buying,
  failure,
  onBuy,
}: {
  tier: VenueTier;
  label: string;
  accepts: boolean;
  balance: number | null;
  buying: string | null;
  failure: PurchaseRefusal | null;
  onBuy: () => void;
}) {
  const copy = useCopy().wallet.sheet;
  const reasonId = useId();

  const short = balance === null ? 0 : Math.max(0, tier.pointsCost - balance);
  /* One reason, the first that applies. The venue-wide one is stated above the
     rungs, so it is not repeated on each. */
  const reason = !accepts
    ? null
    : !tier.available
      ? copy.notIssued
      : short > 0
        ? fill(copy.short, { n: String(short) })
        : null;
  const blocked = !accepts || !tier.available || short > 0;
  const inFlight = buying === tier.id;

  return (
    <li className="vsh-tier" data-blocked={blocked ? 'true' : undefined}>
      <span className="vsh-tier-tx">
        <b>{label}</b>
        {reason && (
          <span id={reasonId} className="vsh-tier-why">
            {reason}
          </span>
        )}
      </span>

      {/*
        `disabled` only for a rung that genuinely cannot be bought. While a
        purchase is in flight the button is `aria-disabled` instead: disabling
        the control somebody just pressed takes keyboard focus off it and drops
        it on the document, which inside a modal is the one place focus is not
        allowed to be.
      */}
      <button
        type="button"
        className="btn btn-solid vsh-get"
        disabled={blocked}
        aria-disabled={buying !== null ? true : undefined}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => {
          if (buying === null) onBuy();
        }}
      >
        {inFlight ? copy.getting : fill(copy.get, { points: String(tier.pointsCost) })}
      </button>

      {failure && (
        <p className="vsh-failed" role="alert">
          <span>
            {/* The shortfall the refusal itself reported, when it reported one:
                the balance on screen may be the stale half of the story. */}
            {failure.kind === 'insufficient' && failure.missing !== null
              ? fill(copy.failed.insufficientBy, { n: String(failure.missing) })
              : copy.failed[failure.kind]}
          </span>
          {/* Only where pressing again can change the outcome: an unanswered
              request (same key, so never a double charge) and an unexplained
              failure. A refusal the server explained would refuse again. */}
          {(failure.kind === 'unreachable' || failure.kind === 'other') && (
            <button
              type="button"
              className="btn btn-ghost vsh-retry"
              onClick={() => {
                if (buying === null) onBuy();
              }}
            >
              {copy.retry}
            </button>
          )}
        </p>
      )}
    </li>
  );
}

/**
 * One stamp card at this venue — including one with no visits on it yet.
 *
 * `progressFor` lists every *active* campaign here whether or not the player has
 * started it, which is the right answer for a venue screen: "eight visits earn a
 * free coffee" is exactly what somebody deciding where to go wants to know. The
 * sentences are the wallet's own, so a card reads the same in both places.
 */
function StampLine({ card }: { card: VenueStampCard }) {
  const stamps = useCopy().wallet.stamps;
  const reward = card.campaign.reward_label;
  const full = card.stamps >= card.required;
  const left = Math.max(0, card.required - card.stamps);

  const words = full
    ? fill(stamps.full, { reward })
    : card.stamps === 0
      ? fill(stamps.empty, { of: String(card.required), reward })
      : left === 1
        ? fill(stamps.goingOne, { reward })
        : fill(stamps.going, { left: String(left), reward });

  return (
    <li className="vsh-item" data-full={full ? 'true' : undefined}>
      <span className="vsh-item-row">
        <b className="vsh-item-name">{reward}</b>
        <span className="vsh-count">
          {fill(stamps.progress, { done: String(card.stamps), of: String(card.required) })}
        </span>
      </span>
      {/* The discs are a picture of the count beside them; see `StampRow`. */}
      <span className="wal-slots vsh-slots" aria-hidden="true">
        {Array.from({ length: card.required }, (_, i) => (
          <span key={i} data-on={i < card.stamps ? 'true' : undefined} />
        ))}
      </span>
      <span className="vsh-note">{words}</span>
    </li>
  );
}

/**
 * "Share my profile with {venue}" — §1.4's consent, one venue at a time.
 *
 * The switch shows the server's answer and nothing else: the first read is
 * `GET /v1/me/consents`, and every later state is the response of the write
 * that changed it (`POST` answers `granted: true`; `DELETE` answers with no
 * grant left either way). There is no optimistic flip — a consent switch that
 * says "on" before the server agreed is a switch that has told somebody their
 * name is being shown when it is not, or the reverse.
 *
 * The sentence under it is the whole disclosure and is deliberately concrete:
 * the name and the photo, visits and spend **at this venue**, never the points
 * balance and never another venue. That is exactly what the dashboard's
 * customer and scan screens read behind `hasSharingGrant`, and exactly what they
 * do not.
 */
function ShareSwitch({ venueId, venueName }: { venueId: string; venueName: string }) {
  const wallet = useCopy().wallet;
  const copy = wallet.sheet;
  const consents = useApi<Consents>(CONSENTS_PATH);
  const [written, setWritten] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const whatId = useId();

  /*
   * **On by default, for a venue nobody has decided about.** Three readings:
   * a live grant is on; a venue this account switched off is off; and a venue
   * it has never touched follows the account's standing answer,
   * `venueSharingDefault` — on unless it was switched off on the profile — because
   * that is exactly what the server will do at the first confirmed visit
   * (`grantSharingByDefault`). Drawing it off there was the switch disagreeing
   * with what was about to happen.
   *
   * Unknown until both answers are in, rather than guessed: a switch that says
   * "on" to somebody who turned the default off is the one reading it must not
   * give.
   */
  const { venueSharingDefault } = useAuth();
  const read =
    consents.state.status !== 'ready'
      ? null
      : consents.state.data.dataSharing.some((row) => row.venue_id === venueId)
        ? true
        : (consents.state.data.sharingWithdrawn ?? []).includes(venueId)
          ? false
          : venueSharingDefault;
  const shared = written ?? read;

  const toggle = async () => {
    if (shared === null || busy) return;
    const next = !shared;
    setBusy(true);
    setFailed(false);
    try {
      if (next) await shareProfileWith(venueId);
      else await stopSharingWith(venueId);
      setWritten(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gs-block vsh-block">
      {shared === null ? (
        consents.state.status === 'error' ? (
          <div className="vsh-down" role="alert">
            <p>
              {consents.state.error.status === 0 ? wallet.down.unreachable : wallet.down.refused}
            </p>
            <button type="button" className="btn btn-ghost" onClick={consents.reload}>
              {wallet.down.retry}
            </button>
          </div>
        ) : (
          <p className="vsh-note">{copy.loading}</p>
        )
      ) : (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={shared}
            aria-describedby={whatId}
            aria-busy={busy || undefined}
            className="vsh-switch"
            onClick={() => void toggle()}
          >
            <span className="vsh-switch-label">{fill(copy.share, { venue: venueName })}</span>
            <span className="vsh-switch-track" aria-hidden="true">
              <span className="vsh-switch-thumb" />
            </span>
          </button>
          <p id={whatId} className="vsh-note">
            {fill(copy.shareWhat, { venue: venueName })}
          </p>
          {failed && (
            <p className="vsh-failed" role="alert">
              <span>{copy.shareFailed}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
