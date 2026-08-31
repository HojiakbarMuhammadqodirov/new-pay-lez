/**
 * The wallet, as the server holds it.
 *
 * ## What can and cannot move here
 *
 * Points, gift cards, vouchers and stamp cards are all real rows on the server
 * and this file reads them. One thing is deliberately missing and its absence
 * is the interesting part:
 *
 * **A claim is not postable by a client.** `POST /v1/deals/:id/events` accepts
 * `impression` and `open` and nothing else — a *claim* is written by the gate
 * from a confirmed scan at the venue (§6.3), which is the whole point of it. A
 * hot deal is a venue paying for somebody to walk in; a claim a phone could
 * mint is a claim worth nothing to the venue and a figure the partner dashboard
 * could not argue from. So the site cannot move "I claimed this deal" to the
 * server, because there is nowhere honest to put it, and it should not grow an
 * endpoint to make the screen tidier.
 *
 * That leaves a real split, and it is worth stating rather than papering over:
 * what somebody *holds* is the server's, and the app's claim flow ends at a QR
 * code the venue scans. The web wallet shows what is on offer and what is held;
 * the walking-in happens elsewhere.
 *
 * ## The one thing that spends points here
 *
 * `redeemGiftCard` is a real purchase — it takes points off the ledger and
 * issues a card with a code. It is `idempotent: true` on the server, so the
 * key below is not decoration: a retry after a dropped response must issue one
 * card, not two, and this is the only call in the file that moves value.
 */
import { call } from './client';

/* ═════════════════════════════════════════════════════════ what is held ══ */

export interface WalletVoucher {
  id: string;
  code: string;
  status: string;
  venue_name?: string | null;
  discount_pct?: number | null;
  expires_at?: string | null;
}

export interface WalletGiftCard {
  id: string;
  code: string;
  status: string;
  brand: string;
  logo: string | null;
  face_minor: number;
  currency: string;
  issued_at: string;
  expires_at: string | null;
}

export interface WalletStampCard {
  id?: string;
  venue_id?: string;
  venue_name?: string | null;
  stamps: number;
  required: number;
  reward?: string | null;
}

export interface Wallet {
  points: number;
  vouchers: WalletVoucher[];
  rewards: unknown[];
  stampCards: WalletStampCard[];
  giftCards: WalletGiftCard[];
}

export const wallet = () => call<Wallet>('/v1/wallet');

/* ══════════════════════════════════════════════════════ what is on offer ══ */

/**
 * The gift-card shelf.
 *
 * `auth: 'none'` on the server, so a signed-out visitor can see what points buy
 * before deciding to earn any — the same argument the leaderboard makes for
 * being public.
 *
 * `points_cost` is the price and `face_minor` the value, in `currency`'s minor
 * units. The site converts nothing here: a 50 zł card is 50 zł whoever is
 * reading, because it is a *thing on a shelf* rather than a price quoted to
 * the reader. That is the opposite of the rule for the site's own prices and
 * the distinction is real — see the money note in the root `CLAUDE.md`.
 */
export interface GiftCardStock {
  id: string;
  brand: string;
  logo: string | null;
  face_minor: number;
  currency: string;
  points_cost: number;
  stock: number;
  priority_only: number;
}

export const giftCardStock = () => call<GiftCardStock[]>('/v1/gift-cards');

/** Buy one. Spends points, issues a code. */
export const redeemGiftCard = (stockId: string) =>
  call<{ id: string; code: string }>('/v1/gift-cards', {
    method: 'POST',
    body: { stockId },
    /* The one call here that moves value: a retry must issue one card. */
    idempotencyKey: `gift:${stockId}:${Date.now()}`,
  });

/* ═══════════════════════════════════════════════════════════ the board ══ */

export interface BrowsedDeal {
  id: string;
  partner_name: string;
  city: string | null;
  category: string | null;
  discount_text: string | null;
  image_url: string | null;
  valid_to: string | null;
  title?: string | null;
  description?: string | null;
}

/**
 * What is on offer, optionally in one city or category.
 *
 * Public, like the shelf: the deals are the product's shop window and a visitor
 * deciding whether to sign up should be able to look in it.
 */
export const browseDeals = (input: { city?: string; category?: string; limit?: number } = {}) => {
  const q = new URLSearchParams();
  if (input.city) q.set('city', input.city);
  if (input.category) q.set('category', input.category);
  q.set('limit', String(input.limit ?? 50));
  return call<BrowsedDeal[]>(`/v1/deals?${q.toString()}`);
};
