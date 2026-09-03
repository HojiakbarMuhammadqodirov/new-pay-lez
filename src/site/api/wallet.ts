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
 * the walking-in happens elsewhere. `wallet.tsx` says what the board's button
 * became because of it.
 *
 * ## Paths here, requests in the screen
 *
 * Everything on this page is *read* through `useApi`, so the paths are exported
 * rather than wrapped in a `call()` of their own. That is not indirection for
 * its own sake: `useApi` returns `loading | ready | error` as a union, and this
 * is the file where an empty catalogue and an unreachable server would
 * otherwise be collapsed into the same empty array. The shapes and the URLs
 * stay together; the state stays in the hook that can tell those two apart.
 *
 * ## The one thing that spends points here
 *
 * `redeemGiftCard` is a real purchase — it takes points off the ledger and
 * issues a card with a code — so it is a call rather than a hook. It is
 * `idempotent: true` on the server, so the key below is not decoration: a retry
 * after a dropped response must issue one card, not two, and this is the only
 * call in the file that moves value.
 */
import { call } from './client';
import { FX, formatFx, type FxCode } from '../i18n/fx';

/* ═════════════════════════════════════════════════════════ what is held ══ */

/**
 * A discount voucher a player holds at one venue.
 *
 * `SELECT * FROM issued_vouchers`, so the names are the column names. There is
 * **no venue name on the row** — the table stores `venue_id` and nothing else —
 * which is why the card renders the code and the percentage and does not claim
 * to know where it is for. Joining a name on would be a second request per
 * voucher for one line of a card.
 */
export interface WalletVoucher {
  id: string;
  venue_id: string;
  code: string;
  status: string;
  discount_pct: number;
  points_spent: number;
  issued_at: string;
  expires_at: string;
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

/**
 * A stamp card in progress, as `campaigns.cardsFor` selects it.
 *
 * `label` is the reward in the venue's own words and `cycles` is how many times
 * the card has been filled and started again — the rule that a full card rolls
 * over rather than overflowing, which is the one thing about a stamp card
 * somebody is likely to get wrong.
 */
export interface WalletStampCard {
  campaign_id: string;
  venue_id: string;
  venue_name: string;
  label: string;
  stamps: number;
  required: number;
  cycles: number;
  status: string;
}

export interface Wallet {
  points: number;
  vouchers: WalletVoucher[];
  rewards: unknown[];
  stampCards: WalletStampCard[];
  giftCards: WalletGiftCard[];
}

/** `auth: 'user'` — a token is needed, and the site holds one once signed in. */
export const WALLET_PATH = '/v1/wallet';

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

export const GIFT_CARDS_PATH = '/v1/gift-cards';

/**
 * A face value, written in the card's **own** currency.
 *
 * The rule this applies is the one three paragraphs up, and it is the opposite
 * of `useMoney`: the site's own prices are euros converted for whoever is
 * reading, and a gift card is an object — a fixed amount at a named brand, the same
 * amount to a reader in London as to one in Kraków. Converting it would put
 * "£4" on a card the shop will honour for 50 zł.
 *
 * `separator` is the reader's, and only the separator: digit grouping belongs
 * to the language and not to the currency being written (`i18n/fx.ts` says so
 * at the point it declines to carry one).
 */
export function faceValue(
  card: { face_minor: number; currency: string },
  separator: string,
): string {
  /* Unknown codes fall back to the euro rather than throwing: the column is
     free text on the server, and a card nobody can price is worse than one
     priced in the platform's own unit. */
  const fx = FX[card.currency.toUpperCase() as FxCode] ?? FX.EUR;
  /* Every `*_minor` column on the server is hundredths, whatever the currency's
     own decimal count is; `formatFx` then writes it to that count. */
  const amount = formatFx(card.face_minor / 100, fx, separator);
  /* No-break space on the trailing form, exactly as `money()` writes it:
     "50 zł" must never break between the number and its unit, and the leading
     form has no space at all. Written as an escape because a literal one is
     invisible in a diff and has already been read as an ordinary space once. */
  return fx.before ? `${fx.symbol}${amount}` : `${amount}\u00a0${fx.symbol}`;
}

/** The cheapest thing on the shelf, or `null` when the shelf is empty. */
export const cheapestCost = (shelf: GiftCardStock[]): number | null =>
  shelf.length === 0 ? null : Math.min(...shelf.map((card) => card.points_cost));

/**
 * The rung a balance is filling toward: the cheapest card it will not yet buy.
 *
 * `null` when the shelf is empty **and** when the balance can already afford
 * every card on it — two different reasons for the same answer, and the answer
 * is the same either way: there is no next rung to draw a bar toward. The
 * screen shows the balance on its own rather than a bar with nothing at the end
 * of it.
 */
export function nextRung(shelf: GiftCardStock[], points: number): number | null {
  const above = shelf.map((card) => card.points_cost).filter((cost) => cost > points);
  return above.length === 0 ? null : Math.min(...above);
}

/** Buy one. Spends points, issues a code. */
export const redeemGiftCard = (stockId: string) =>
  call<{ id: string; code: string }>(GIFT_CARDS_PATH, {
    method: 'POST',
    body: { stockId },
    /* The one call here that moves value: a retry must issue one card. */
    idempotencyKey: `gift:${stockId}:${Date.now()}`,
  });

/* ═══════════════════════════════════════════════════════════ the board ══ */

/**
 * One offer on the board, as `deals.browse` composes it.
 *
 * **camelCase, and checked against a running server rather than inferred.** The
 * shape this interface carried before was the `hot_deals` table's column names,
 * which is what `SELECT *` would have returned — but `browse` projects the row
 * into a `DealCard` and joins the translation on, so what actually arrives is
 * this. A mapper written against the guess typechecked perfectly and would have
 * rendered a board of blank cards.
 *
 * `copy` is the offer in the reader's language, already fallen back by the
 * server; `discountText` is the venue's own words ("-15%", "2+1") and is not
 * translated, which is why it is not inside `copy`.
 *
 * There is no address, rating, opening span or timezone on it. The venue's
 * table has the first two and no endpoint carries the last two at all, so the
 * card says what the row says and no more — which is why the "Open now" pill
 * this board used to draw is gone rather than guessed at.
 */
export interface BrowsedDeal {
  id: string;
  venueId: string | null;
  partnerName: string | null;
  city: string | null;
  category: string | null;
  discountText: string | null;
  imageUrl: string | null;
  /** ISO, or `null` for an offer with no last day. */
  validTo: string | null;
  pointsRequired: number;
  copy: { title: string; description: string; terms: string; language: string };
  claimable: boolean;
}

/**
 * What is on offer, optionally in one city or category.
 *
 * Public, like the shelf: the deals are the product's shop window and a visitor
 * deciding whether to sign up should be able to look in it.
 *
 * The **category is the server's** taxonomy (`venues.category` — `cafe`,
 * `bakery`, `hotels`…), not the five-chip customer strip the site used to keep
 * in `content.ts`. Filtering is therefore done over whatever the rows actually
 * carry rather than over a list written in advance; see `wallet.tsx`.
 */
export function dealsPath(input: { city?: string; category?: string; limit?: number } = {}): string {
  const q = new URLSearchParams();
  if (input.city) q.set('city', input.city);
  if (input.category) q.set('category', input.category);
  q.set('limit', String(input.limit ?? 50));
  return `/v1/deals?${q.toString()}`;
}
