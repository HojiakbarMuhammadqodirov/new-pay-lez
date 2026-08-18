/**
 * Loyalty campaigns and stamp cards — §5.
 *
 * The distinction from vouchers is the whole design and B5 says to enforce it at
 * validation time: **a campaign is visits → a fixed item with a known cost**, a
 * voucher is points → a percentage. The consequence is that a campaign's budget
 * reserve is *exact* rather than estimated — a free filter coffee costs what the
 * partner typed, not a share of a bill nobody has rung up yet. Everything below
 * follows from that: no estimate, no drift correction, no tolerance argument.
 *
 * The second rule is one reward per visit (§5.1). When a customer qualifies
 * under several campaigns at once, priority decides, and only the winner fires.
 * Without it, three overlapping campaigns turn one coffee into three.
 */
import type { Db } from '../db/db.ts';
import * as budget from './budget.ts';
import { DomainError } from './errors.ts';
import { newId, shortCode } from './ids.ts';
import { now, plusDays, type Iso } from './time.ts';
import type { Venue } from './venues.ts';

export interface Campaign {
  id: string;
  venue_id: string;
  name: string;
  visits_required: number;
  reward_label: string;
  reward_cost_minor: number;
  priority: number;
  recurring: number;
  min_spend_minor: number | null;
  reward_valid_days: number;
  status: 'draft' | 'active' | 'paused' | 'ended';
}

export interface EarnedReward {
  id: string;
  user_id: string;
  venue_id: string;
  campaign_id: string;
  label: string;
  cost_minor: number;
  reserved_minor: number;
  status: 'available' | 'redeemed' | 'expired' | 'cancelled';
  code: string;
  budget_id: string | null;
  earned_at: string;
  expires_at: string;
  redeemed_at: string | null;
}

export const activeCampaigns = (db: Db, venueId: string): Campaign[] =>
  db.all<Campaign>(
    `SELECT * FROM campaigns WHERE venue_id = $v AND status = 'active'
      ORDER BY priority DESC, visits_required ASC`,
    { v: venueId },
  );

/**
 * B5. What a campaign may and may not be.
 *
 * A percentage reward and a points threshold are both *rejected* rather than
 * quietly converted, because a campaign that pays a percentage has no exact
 * cost — and the exact cost is the only reason a campaign's reserve is allowed
 * to skip the estimate machinery vouchers need.
 */
export function validateCampaign(input: {
  visitsRequired: number;
  rewardCostMinor: number;
  rewardLabel: string;
  rewardKind?: string;
  pointsThreshold?: number;
}): void {
  if (!Number.isInteger(input.visitsRequired) || input.visitsRequired < 1) {
    throw new DomainError('validation_failed', 'a campaign needs at least one visit', {
      field: 'visitsRequired',
    });
  }
  if (input.rewardKind && input.rewardKind !== 'fixed') {
    throw new DomainError('validation_failed', 'percentage rewards are vouchers, not campaigns', {
      field: 'rewardKind',
    });
  }
  if (input.pointsThreshold) {
    throw new DomainError('validation_failed', 'points thresholds are vouchers, not campaigns', {
      field: 'pointsThreshold',
    });
  }
  if (!Number.isInteger(input.rewardCostMinor) || input.rewardCostMinor <= 0) {
    throw new DomainError('validation_failed', 'a reward needs a cost to the partner', {
      field: 'rewardCostMinor',
    });
  }
  if (!input.rewardLabel.trim()) {
    throw new DomainError('validation_failed', 'a reward needs a name', { field: 'rewardLabel' });
  }
}

export interface StampProgress {
  campaign: Campaign;
  stamps: number;
  required: number;
  cycles: number;
}

export function progressFor(db: Db, userId: string, venueId: string): StampProgress[] {
  return activeCampaigns(db, venueId).map((campaign) => {
    const card = db.get<{ stamps: number; cycles: number }>(
      `SELECT stamps, cycles FROM stamp_cards WHERE user_id = $u AND campaign_id = $c`,
      { u: userId, c: campaign.id },
    );
    return {
      campaign,
      stamps: card?.stamps ?? 0,
      required: campaign.visits_required,
      cycles: card?.cycles ?? 0,
    };
  });
}

/**
 * Every card this customer has started, across every venue.
 *
 * `progressFor` answers "what is on offer at this venue", which is the venue
 * screen's question and includes campaigns the customer has never touched.
 * The wallet's question is the other one — "what am I part-way through" — and
 * answering it by walking every venue would be one request per venue on a screen
 * that opens first. The venue name travels with the row for the same reason: a
 * wallet that renders card ids is a wallet nobody can read.
 *
 * A paused campaign's card is still listed. §5.3 keeps stamps already collected
 * valid when a campaign pauses, so hiding the card would look like the stamps
 * were taken away.
 */
export function cardsFor(db: Db, userId: string) {
  return db.all<{
    campaign_id: string;
    venue_id: string;
    venue_name: string;
    label: string;
    stamps: number;
    required: number;
    cycles: number;
    status: string;
    reward_valid_days: number;
    min_spend_minor: number;
    updated_at: string | null;
  }>(
    `SELECT s.campaign_id, c.venue_id, v.name AS venue_name, c.reward_label AS label,
            s.stamps, c.visits_required AS required, s.cycles, c.status,
            c.reward_valid_days, c.min_spend_minor, s.updated_at
       FROM stamp_cards s
       JOIN campaigns c ON c.id = s.campaign_id
       JOIN venues v ON v.id = c.venue_id
      WHERE s.user_id = $u AND c.status <> 'ended' AND v.deleted_at IS NULL
      ORDER BY (CAST(s.stamps AS REAL) / MAX(1, c.visits_required)) DESC, v.name`,
    { u: userId },
  );
}

/**
 * A confirmed qualifying visit, applied to the stamp cards (§5.2).
 *
 * Called from inside the gate's commit. It stamps *every* active campaign the
 * visit qualifies for — a customer's progress on a second card should not stall
 * because a first one paid out — but only the highest-priority *completion*
 * becomes a reward, which is where "one reward per visit" bites.
 *
 * Returns the reward if one fired, so the gate can put it in the receipt.
 */
export function applyVisit(
  db: Db,
  input: {
    userId: string;
    venue: Venue;
    amountMinor: number;
    transactionId: string;
    at?: Iso;
  },
): EarnedReward | null {
  const at = input.at ?? now();
  const campaigns = activeCampaigns(db, input.venue.id);
  const completed: Campaign[] = [];

  for (const campaign of campaigns) {
    const minSpend = campaign.min_spend_minor ?? input.venue.min_spend_minor;
    if (input.amountMinor < minSpend) continue;

    db.run(
      `INSERT INTO stamp_cards (id, user_id, venue_id, campaign_id, stamps, cycles, joined_at, updated_at)
       VALUES ($i, $u, $v, $c, 1, 0, $t, $t)
       ON CONFLICT (user_id, campaign_id)
       DO UPDATE SET stamps = stamps + 1, updated_at = excluded.updated_at`,
      { i: newId('stc'), u: input.userId, v: input.venue.id, c: campaign.id, t: at },
    );

    const card = db.get<{ stamps: number }>(
      `SELECT stamps FROM stamp_cards WHERE user_id = $u AND campaign_id = $c`,
      { u: input.userId, c: campaign.id },
    );
    if ((card?.stamps ?? 0) >= campaign.visits_required) completed.push(campaign);
  }

  if (completed.length === 0) return null;

  /* Highest priority wins; ties break on the *shorter* card, because that is the
     one the customer is more likely to have been counting. */
  completed.sort((a, b) => b.priority - a.priority || a.visits_required - b.visits_required);
  const winner = completed[0];

  const reward = grantReward(db, {
    userId: input.userId,
    venue: input.venue,
    campaign: winner,
    transactionId: input.transactionId,
    at,
  });

  /* The card that paid out resets (or completes); the others keep their stamps,
     which is the honest reading of "one reward per visit" — the visit was spent
     on the winner, not on the cards that merely also advanced. */
  db.run(
    `UPDATE stamp_cards
        SET stamps = CASE WHEN $rec = 1 THEN stamps - $need ELSE stamps END,
            cycles = cycles + 1, updated_at = $t
      WHERE user_id = $u AND campaign_id = $c`,
    { rec: winner.recurring, need: winner.visits_required, t: at, u: input.userId, c: winner.id },
  );

  return reward;
}

/**
 * §5.3. Earn a reward: reserve its exact cost, and start its clock.
 *
 * The reserve can fail — the loyalty allocation can be empty — and when it does
 * the *stamp still counts*. Refusing the stamp would punish a customer for a
 * budget decision they cannot see; refusing the reward is at least honest about
 * whose money ran out, and the partner is notified (§5.4).
 */
export function grantReward(
  db: Db,
  input: {
    userId: string;
    venue: Venue;
    campaign: Campaign;
    transactionId?: string;
    at?: Iso;
  },
): EarnedReward | null {
  const at = input.at ?? now();
  const view = budget.budgetFor(db, input.venue.id, at);

  try {
    budget.reserve(db, view.id, 'loyalty', input.campaign.reward_cost_minor, {
      kind: 'earned_reward',
      ref: input.campaign.id,
    }, at);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'budget_exhausted') return null;
    throw error;
  }

  const id = newId('rwd');
  db.run(
    `INSERT INTO earned_rewards
       (id, user_id, venue_id, campaign_id, label, cost_minor, reserved_minor, status, code,
        budget_id, transaction_id, earned_at, expires_at)
     VALUES ($i, $u, $v, $c, $l, $co, $co, 'available', $code, $b, $x, $at, $e)`,
    {
      i: id,
      u: input.userId,
      v: input.venue.id,
      c: input.campaign.id,
      l: input.campaign.reward_label,
      co: input.campaign.reward_cost_minor,
      code: shortCode(6),
      b: view.id,
      x: input.transactionId ?? null,
      at,
      e: plusDays(at, input.campaign.reward_valid_days),
    },
  );
  return db.get<EarnedReward>(`SELECT * FROM earned_rewards WHERE id = $i`, { i: id })!;
}

export const availableRewards = (db: Db, userId: string, venueId?: string): EarnedReward[] =>
  db.all<EarnedReward>(
    `SELECT * FROM earned_rewards
      WHERE user_id = $u AND status = 'available' AND ($v IS NULL OR venue_id = $v)
      ORDER BY expires_at`,
    { u: userId, v: venueId ?? null },
  );

/**
 * Redeem a reward at the counter, from inside the gate's commit.
 *
 * Release the reserve, debit the same amount. They are equal — that is what an
 * exact cost means — and writing both anyway keeps the movement history
 * readable: a pool's story should show the money being committed and then spent,
 * not appear from nowhere as a debit.
 */
export function redeemReward(
  db: Db,
  reward: EarnedReward,
  transactionId: string,
  at: Iso = now(),
): { costMinor: number } {
  if (reward.status !== 'available') throw new DomainError('already_used', 'reward is not available');
  if (reward.expires_at <= at) throw new DomainError('expired', 'reward has expired');

  if (reward.budget_id) {
    budget.release(db, reward.budget_id, 'loyalty', reward.reserved_minor, {
      kind: 'earned_reward',
      ref: reward.id,
    }, at);
    budget.debit(db, reward.budget_id, 'loyalty', reward.cost_minor, {
      kind: 'earned_reward',
      ref: reward.id,
    }, at);
  }
  db.run(
    `UPDATE earned_rewards SET status = 'redeemed', redeemed_at = $t, transaction_id = $x
      WHERE id = $i AND status = 'available'`,
    { t: at, x: transactionId, i: reward.id },
  );
  return { costMinor: reward.cost_minor };
}

export function expireRewards(db: Db, at: Iso = now()): { expired: number; released: number } {
  const due = db.all<EarnedReward>(
    `SELECT * FROM earned_rewards WHERE status = 'available' AND expires_at <= $t`,
    { t: at },
  );
  let released = 0;
  db.tx(() => {
    for (const reward of due) {
      if (reward.budget_id) {
        budget.release(db, reward.budget_id, 'loyalty', reward.reserved_minor, {
          kind: 'earned_reward',
          ref: reward.id,
        }, at);
        released += reward.reserved_minor;
      }
      db.run(`UPDATE earned_rewards SET status = 'expired' WHERE id = $i`, { i: reward.id });
    }
  });
  return { expired: due.length, released };
}

/**
 * §5.3. Pausing stops new earning; it does not touch existing obligations.
 *
 * "Paused campaigns still hold money" is the whole rule, and it is one line of
 * code precisely because nothing here goes looking for rewards to cancel. A
 * customer who earned a free coffee last week gets it whatever the partner does
 * to the campaign this week.
 */
export function setStatus(
  db: Db,
  campaignId: string,
  status: 'active' | 'paused' | 'ended',
  at: Iso = now(),
): void {
  db.run(`UPDATE campaigns SET status = $s, updated_at = $t WHERE id = $i`, {
    s: status,
    t: at,
    i: campaignId,
  });
}
