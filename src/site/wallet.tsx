import { useCallback, useId, useState } from 'react';
import { Icon } from './icons';
import { useCopy, useLanguage } from './i18n/context';
import { CURRENCIES, fill } from './i18n/currency';
import { categoryLabel, initialOf } from './adminMetrics';
import type { Me } from './api/consumer';
import { dealOpen, useImpressionRef, venueClick } from './api/reach';
import { useApi, type ApiResult, type ApiState } from './api/useApi';
import {
  ME_PATH,
  venuesPath,
  type EarnedReward,
  type VenueListRow,
  type VenueRef,
} from './api/venue';
import {
  cheapestCost,
  dealsPath,
  faceValue,
  GIFT_CARDS_PATH,
  redeemGiftCard,
  WALLET_PATH,
  type BrowsedDeal,
  type GiftCardStock,
  type Wallet,
  type WalletGiftCard,
  type WalletStampCard,
  type WalletVoucher,
} from './api/wallet';
import { useAuth } from './auth/context';
import { canAfford } from './auth/player';
import { PATHS } from './router';
import { CounterCode, VenueMark, VenueSheet } from './venueSheet';

/**
 * The wallet, for someone who is signed in.
 *
 * ── everything on this page is the server's ──────────────────────────────
 *
 * It was not. The board was nine hot deals in `content.ts`, the catalogue was
 * eight gift cards in the same file, and the three holdings were arrays inside
 * a `localStorage` record: claiming a deal minted a code in this browser,
 * buying a voucher subtracted from a number in this browser, and "Add a visit"
 * put a stamp on a card nobody had visited. None of it was wrong to look at and
 * all of it was made up.
 *
 * Every read now is a real row:
 *
 *   `GET /v1/deals`         the board — what is on offer
 *   `GET /v1/venues?city=`  the places — who is on Paylez in the player's city
 *   `GET /v1/wallet`        the holdings — vouchers, rewards, stamp cards, gift cards
 *   `GET /v1/gift-cards`    the shelf — what points can buy
 *   `GET /v1/me`            the counter code (the username) and the city
 *   `POST /v1/gift-cards`   a press that moves value
 *
 * and one venue at a time in `venueSheet.tsx`, which adds the other press that
 * moves value — a voucher off that venue's ladder — and the switch that decides
 * whether the venue may know who this is.
 *
 * ── the player and the venue meet at the counter ─────────────────────────
 *
 * The dashboard's counter tool resolves exactly three strings: a player's
 * `@username`, a voucher code and a reward code. So all three are on this page,
 * large and copyable, and each says what it is for. The username is read from
 * `GET /v1/me` here rather than from the session's mirror of the profile, and
 * that is a deliberate second request: it is the one string on the site that
 * has to match the server character for character, and a mirror one rename out
 * of date sends somebody to a till with a handle that resolves to nobody.
 *
 * ── what the claim button became, and why ────────────────────────────────
 *
 * **It is not a claim any more; it is a disclosure.** `POST /v1/deals/:id/events`
 * accepts `impression` and `open` and nothing else — a *claim* is written by the
 * gate from a confirmed scan at the venue, deliberately, because a claim a phone
 * could mint is a claim worth nothing to the venue paying for it and a figure
 * the partner dashboard could not argue from. So there is nothing for a claim
 * button to post.
 *
 * The three ways that could have gone, and why this one:
 *
 * - *keep it, and write the claim to `localStorage`.* This is what it did, and
 *   it is the version this whole pass exists to remove: a code invented by the
 *   browser, sitting in a wallet, that no till will honour.
 * - *delete the button.* Honest, and it takes the card's only affordance with
 *   it — a board of nine offers where nothing is pressable reads as broken
 *   rather than as read-only.
 * - *say what the offer actually requires.* The button opens the offer's
 *   **terms**, which the server sends with every deal and nothing was showing,
 *   and the line under them says where the claim happens: at the counter, on
 *   the venue's scan. That is the one thing a reader needs before walking in,
 *   and it is the truth about how a hot deal works.
 *
 * Pressing it also posts `open`, which is a real funnel step the venue is
 * paying to see — so the button both tells the reader something true and
 * reports something true. The claim animation went with the claim: a ring, a
 * sheen and a code landing were celebrating an event that no longer happens.
 *
 * ── an empty catalogue is a state, and so is a dead server ───────────────
 *
 * They are not the same state and they never share a panel. After the purge
 * there are genuinely no deals and no gift cards until a business signs up, is
 * verified, and publishes — so "nothing here yet" is the *ordinary* reading and
 * it says so in its own words, while "we could not ask" says that instead. That
 * is what the `loading | ready | error` union in `useApi` is for, and it is the
 * rule the console states at length one file over.
 *
 * ── the holdings, and why they are separate ──────────────────────────────
 *
 * - a **discount voucher** is points already spent at one venue — a code and a
 *   percentage, honoured at that venue's till;
 * - a **reward** is what a full stamp card earned — a code for a named thing at
 *   one venue, paid for by the venue rather than by points;
 * - a **gift card** is stock — a fixed face value at a named brand, bought with
 *   points off the shelf below;
 * - a **stamp card** counts *visits to one venue*, and a visit is not a point.
 *   It cannot be spent anywhere but the venue that gave it, and a full card
 *   **rolls over** into the next one rather than overflowing, which is what
 *   `cycles` counts.
 *
 * Collapsing any two of those loses the rule that distinguishes them, and each
 * of those rules is one a player will otherwise learn by being wrong at a
 * counter.
 */

/**
 * The band textures, cycled by position.
 *
 * The app's card leads with a **photograph**, and the photograph is doing work a
 * decoration would not: it is how six cards in a column stop being the same card
 * six times. There are no photographs here — nothing in `src/` ships an image
 * asset, and a CDN placeholder is a third-party runtime request — so the band
 * carries the card's own subject at plate size instead, over a repeating pattern
 * drawn from `--accent-rgb`.
 */
const WAL_TEXTURES = ['dots', 'stripe', 'orbit', 'weave', 'chevron', 'grid', 'hatch'] as const;

const textureAt = (index: number): string => WAL_TEXTURES[index % WAL_TEXTURES.length];

/** Opens the venue sheet, remembering which control to hand focus back to. */
type OpenPlace = (venue: VenueRef, from: HTMLElement) => void;

/**
 * A date the server wrote, in the reader's own locale.
 *
 * The rows carry ISO timestamps rather than the `DD.MM` the seed used, so the
 * format is the reader's rather than one written into the data. `null` is a row
 * with no last day, which is a real state — an open-ended offer — and prints
 * nothing rather than a dash inside a sentence.
 */
const on = (iso: string | null, locale: string): string | null =>
  iso
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso))
    : null;

/**
 * The last answer a request gave, held while it is being asked again.
 *
 * `useApi` answers a reload by going back to `loading`, which is right for a
 * first read and wrong for the re-read after a purchase: the holdings would
 * collapse to "Asking the server…" and back, the page would change height under
 * an open sheet, and the balance would drop for a moment to the session's
 * mirror — a number the purchase has already made stale. So while a re-read is
 * in flight the previous answer stands; an *error* still replaces it, because
 * "we could not ask" must never be drawn as the last thing we heard.
 *
 * State set during render, guarded, is the pattern React documents for keeping
 * a value from a previous render — it re-renders before committing, once.
 */
function useLastReady<T>(state: ApiState<T>): T | null {
  const [kept, setKept] = useState<T | null>(null);
  if (state.status === 'ready' && state.data !== kept) setKept(state.data);
  if (state.status === 'ready') return state.data;
  return state.status === 'loading' ? kept : null;
}

/** The status pill on a band. Static text — see the note about "Open now". */
function BandPill({ text }: { text: string }) {
  return <span className="wal-pill">{text}</span>;
}

/**
 * The tile in the top-left corner of every band.
 *
 * One letter on the accent, and it is the brand's mark in the only form this
 * site has one: no venue or brand ships an image asset here, and a logo fetched
 * from a partner's CDN would be the third-party runtime request the whole
 * front end is built to avoid.
 */
function BrandMark({ letter }: { letter: string }) {
  return (
    <span className="pv-logo wal-mark" aria-hidden>
      {letter}
    </span>
  );
}

/**
 * The button that opens a venue from anything that belongs to one.
 *
 * Drawn only where there is a venue id to open — a deal carried over from the
 * old catalogue can have none, and a control with nothing behind it is not
 * drawn.
 */
function SeePlace({ onOpen }: { onOpen: (from: HTMLElement) => void }) {
  const copy = useCopy().wallet;
  return (
    <button
      type="button"
      className="btn btn-ghost wal-cta"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <Icon name="pin" size={15} />
      {copy.see}
    </button>
  );
}

/**
 * The two panels every list here needs.
 *
 * `error` is "we could not ask"; the empty state is "we asked, and there is
 * nothing". Same split as the console, same reason: a reader believes a zero.
 */
function Down({ result }: { result: ApiResult<unknown> }) {
  const copy = useCopy().wallet.down;
  if (result.state.status !== 'error') return null;

  return (
    <div className="console wal-empty" data-reveal>
      <p>{result.state.error.status === 0 ? copy.unreachable : copy.refused}</p>
      <button type="button" className="btn btn-ghost" onClick={result.reload}>
        {copy.retry}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── counter code ── */

/**
 * The player's counter code — their `@username`, as the server holds it.
 *
 * Three states and a fourth that is not an error. Loading and failure are the
 * page's usual pair. The fourth is an account with no username, which is a real
 * and common state (the handle is optional until somebody picks one), and it has
 * a real next step: the profile, where the Edit button sets one. Drawing an
 * empty code there would be a card telling somebody to show staff nothing.
 */
function CounterCard({ me }: { me: ApiResult<Me> }) {
  const copy = useCopy().wallet;
  const titleId = useId();
  const { state } = me;

  return (
    <section className="wal-counter" aria-labelledby={titleId} data-reveal>
      <h2 id={titleId} className="wal-counter-title">
        {copy.counter.title}
      </h2>

      {state.status === 'loading' ? (
        <p className="wal-counter-note">{copy.loading}</p>
      ) : state.status === 'error' ? (
        <>
          <p className="wal-counter-note">
            {state.error.status === 0 ? copy.down.unreachable : copy.down.refused}
          </p>
          <button type="button" className="btn btn-ghost" onClick={me.reload}>
            {copy.down.retry}
          </button>
        </>
      ) : state.data.user.username ? (
        <CounterCode
          code={`@${state.data.user.username}`}
          hint={copy.counter.lede}
          size="hero"
        />
      ) : (
        <>
          <p className="wal-counter-note">{copy.counter.none}</p>
          <a className="btn btn-solid" href={PATHS.profile}>
            {copy.counter.setUp}
          </a>
        </>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── places ── */

/**
 * One venue in the player's city, as a row you press.
 *
 * **Seen and opened are both reported, through the doors `api/reach.ts` already
 * has.** The impression is `useImpressionRef` — the same one the deal cards use
 * — so it fires once the row has been half on screen for half a second, once per
 * mount, and is coalesced per page load by the module-level set in that file. That
 * last property is also what makes it safe under StrictMode: the ref callback
 * runs twice and the second run is dropped before it is sent. The click is
 * `venueClick`, posted from the press itself and never coalesced, because
 * somebody who opens a place twice opened it twice.
 *
 * Only this row posts a venue click. Opening a venue from a stamp card or a
 * voucher is a player looking at their own holdings, not a listing reaching
 * somebody, and counting it would inflate the one funnel an owner reads to find
 * out whether anyone has heard of them.
 */
function PlaceRow({
  place,
  categories,
  onOpen,
}: {
  place: VenueListRow;
  categories: readonly string[];
  onOpen: OpenPlace;
}) {
  const copy = useCopy().wallet.places;
  const seen = useImpressionRef('venue', place.id, 'wallet');
  const meta = [
    place.category ? categoryLabel(place.category, categories) : '',
    place.address ?? '',
  ].filter(Boolean);
  const takesVouchers = Boolean(place.accepts_vouchers);

  return (
    <div ref={seen} className="wal-place" data-reveal>
      <button
        type="button"
        className="wal-place-hit"
        onClick={(event) => {
          venueClick(place.id, 'wallet');
          onOpen({ id: place.id, name: place.name }, event.currentTarget);
        }}
      >
        <VenueMark name={place.name} image={place.image_url} />
        <span className="wal-place-tx">
          <b className="wal-place-name">{place.name}</b>
          {meta.length > 0 && <span className="wal-place-meta">{meta.join(' · ')}</span>}
          {(place.price_range || takesVouchers) && (
            <span className="wal-place-foot">
              {place.price_range && <span className="wal-place-price">{place.price_range}</span>}
              {takesVouchers && (
                <span className="wal-place-tag">
                  <Icon name="ticket" size={12} />
                  {copy.vouchers}
                </span>
              )}
            </span>
          )}
        </span>
        <Icon name="arrow" size={16} className="wal-place-go" />
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── gift card ── */

/**
 * A gift card in the wallet.
 *
 * The plate is the **face value**, in the card's own currency: it is a thing on
 * a shelf, and a card the shop will honour for 50 zł is 50 zł to a reader in
 * London. That is the opposite of the rule for the site's own prices, and
 * `faceValue` in `api/wallet.ts` carries the reasoning.
 *
 * There is no "Show QR code" button any more. Showing the code *spent* the card
 * when the card was a local object; a real gift card is spent at the till and
 * `status` on the row is what says so, and there is no endpoint for a web page
 * to burn one. The code is simply on the card, which is what the till wants.
 *
 * Its code is not a `CounterCode`: the counter tool resolves vouchers and
 * rewards at a venue, and a gift card is spent at a brand's own till.
 */
function GiftCardRow({
  card,
  texture,
  separator,
  locale,
}: {
  card: WalletGiftCard;
  texture: string;
  separator: string;
  locale: string;
}) {
  const copy = useCopy().wallet;
  const spent = card.status !== 'active';
  const until = on(card.expires_at, locale);

  return (
    <article className="wcard" data-spent={spent ? 'true' : undefined} data-reveal>
      <div className="wal-band" data-texture={texture}>
        <div className="wal-band-top">
          <BrandMark letter={card.logo || initialOf(card.brand)} />
          <BandPill text={until ? fill(copy.valid, { date: until }) : copy.tabs[spent ? 1 : 0]} />
        </div>
        <span className="wal-fig">{faceValue(card, separator)}</span>
      </div>

      <div className="wal-body">
        <b className="wal-name">{card.brand}</b>
        <div className="wal-act">
          <span className="wal-code-block">
            <i>{copy.deals.code}</i>
            <b className="wcard-code">{card.code}</b>
          </span>
        </div>
      </div>
    </article>
  );
}

/* ──────────────────────────────────────────────────── discount voucher ── */

/**
 * A discount voucher: points already spent at one venue.
 *
 * The row is `SELECT * FROM issued_vouchers` and carries **no venue name** —
 * only a `venue_id`. The name is printed when this page already holds it from
 * another list (a stamp card, a place, a deal at the same venue) and left off
 * when it does not; it is never fetched per voucher, and it is never guessed.
 * "See the place" opens the venue either way, because the id is all that needs.
 */
function VoucherRow({
  voucher,
  venueName,
  texture,
  locale,
  onPlace,
}: {
  voucher: WalletVoucher;
  venueName: string | null;
  texture: string;
  locale: string;
  onPlace: OpenPlace;
}) {
  const copy = useCopy().wallet;
  const spent = voucher.status !== 'active';
  const until = on(voucher.expires_at, locale);

  return (
    <article className="wcard" data-spent={spent ? 'true' : undefined} data-reveal>
      <div className="wal-band" data-texture={texture}>
        <div className="wal-band-top">
          <BrandMark letter={venueName ? initialOf(venueName) : '%'} />
          <BandPill text={until ? fill(copy.valid, { date: until }) : copy.tabs[spent ? 1 : 0]} />
        </div>
        <span className="wal-fig">{voucher.discount_pct}%</span>
      </div>

      <div className="wal-body">
        <b className="wal-name">{venueName ?? copy.voucherTitle}</b>
        {venueName && <span className="wal-where">{copy.voucherTitle}</span>}
        <span className="wal-meta">{fill(copy.cost, { n: String(voucher.points_spent) })}</span>

        {/* A used voucher's code is a receipt, not something to show anybody. */}
        {spent ? (
          <span className="wal-code-block">
            <i>{copy.deals.code}</i>
            <b className="wcard-code">{voucher.code}</b>
          </span>
        ) : (
          <CounterCode code={voucher.code} />
        )}

        <div className="wal-act">
          <SeePlace onOpen={(from) => onPlace({ id: voucher.venue_id, name: venueName }, from)} />
        </div>
      </div>
    </article>
  );
}

/* ──────────────────────────────────────────────────────────────── reward ── */

/**
 * A reward a full stamp card earned.
 *
 * `GET /v1/wallet` has always sent these and nothing drew them, so the code the
 * counter needed to hand one over was nowhere a player could find it on the web.
 * The plate is the reward's own label — what the venue called it — because that
 * is what somebody asks for at the till.
 */
function RewardRow({
  reward,
  venueName,
  texture,
  locale,
  onPlace,
}: {
  reward: EarnedReward;
  venueName: string | null;
  texture: string;
  locale: string;
  onPlace: OpenPlace;
}) {
  const copy = useCopy().wallet;
  const until = on(reward.expires_at, locale);

  return (
    <article className="wcard" data-reveal>
      <div className="wal-band" data-texture={texture}>
        <div className="wal-band-top">
          <BrandMark letter={initialOf(venueName ?? reward.label)} />
          {until && <BandPill text={fill(copy.valid, { date: until })} />}
        </div>
        <span className="wal-fig wal-fig-text">{reward.label}</span>
      </div>

      <div className="wal-body">
        {venueName && <b className="wal-name">{venueName}</b>}
        <CounterCode code={reward.code} />
        <div className="wal-act">
          <SeePlace onOpen={(from) => onPlace({ id: reward.venue_id, name: venueName }, from)} />
        </div>
      </div>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────── stamp card ── */

/**
 * The card, and the sentence beside it.
 *
 * The slots are the picture and the sentence is the meaning, and both are
 * needed: a row of discs says how far along you are and says nothing at all
 * about what is at the end of it. Three states, not two — a card with no visits
 * on it reads differently from one in progress, and it is the state every card
 * starts in.
 *
 * **There is no "Add a visit" button.** There was, to demonstrate that a full
 * card rolls over rather than overflowing, and it wrote a stamp to this
 * browser. A stamp is a confirmed visit; the gate writes it from a scan at the
 * counter, and a button here that put one on the card was the clearest example
 * on the site of a screen inventing its own data.
 */
function StampRow({
  card,
  texture,
  onPlace,
}: {
  card: WalletStampCard;
  texture: string;
  onPlace: OpenPlace;
}) {
  const copy = useCopy().wallet;
  const full = card.stamps >= card.required;
  const left = Math.max(0, card.required - card.stamps);

  const words = full
    ? fill(copy.stamps.full, { reward: card.label })
    : card.stamps === 0
      ? fill(copy.stamps.empty, { of: String(card.required), reward: card.label })
      : left === 1
        ? fill(copy.stamps.goingOne, { reward: card.label })
        : fill(copy.stamps.going, { left: String(left), reward: card.label });

  return (
    <article className="wal-stamp" data-full={full ? 'true' : undefined} data-reveal>
      <div className="wal-band" data-texture={texture}>
        <div className="wal-band-top">
          <BrandMark letter={initialOf(card.venue_name)} />
          <BandPill
            text={fill(copy.stamps.progress, {
              done: String(card.stamps),
              of: String(card.required),
            })}
          />
        </div>

        {/*
          The slots. `aria-hidden` with the count in the pill above doing the
          work for a screen reader: a row of discs is a picture of a number that
          is already written out beside it, and reading it out as a list of eight
          items is worse than not reading it at all.
        */}
        <div className="wal-slots" aria-hidden>
          {Array.from({ length: card.required }, (_, i) => (
            <span key={i} data-on={i < card.stamps ? 'true' : undefined} />
          ))}
        </div>
      </div>

      <div className="wal-body">
        <div className="wal-name-row">
          <b className="wal-name">{card.venue_name}</b>
          {/* Only on a card that has been round at least once. On a first card it
              would be "filled 0× before", which is a sentence about nothing. */}
          {card.cycles > 0 && (
            <span className="wal-cycles">{fill(copy.stamps.cycles, { n: String(card.cycles) })}</span>
          )}
        </div>

        <p className="wal-stamp-words">{words}</p>

        <div className="wal-act">
          <SeePlace
            onOpen={(from) => onPlace({ id: card.venue_id, name: card.venue_name }, from)}
          />
        </div>
      </div>
    </article>
  );
}

/* ──────────────────────────────────────────────────────────────── hot deal ── */

/**
 * A hot deal on the board.
 *
 * Every slot maps to a field the server actually sends:
 *
 * - the **plate** is `discountText` — `-15%`, `2+1` — the venue's own words,
 *   never translated, which is what you scan a column of cards for;
 * - the **name** is `partnerName`, the venue rather than the offer;
 * - the **accent line** is `copy.description`, the offer explained, already in
 *   the reader's language with the server's own fallback applied;
 * - the **actions** open `copy.terms` (reporting an `open`) and the venue.
 *
 * Three things the seeded card had are absent, and each is absent because
 * nothing the server returns carries it: the **distance** (no position fix
 * either side), the **address and rating** (`GET /v1/deals` projects the offer,
 * not the venue — the venue sheet is where those live now), and the **"Open
 * now" pill** — that one was answered on the venue's own clock, which needs a
 * timezone, and no endpoint has one. A pill answering it on the *reader's* clock
 * would be worse than no pill.
 */
function DealCard({
  deal,
  texture,
  locale,
  categories,
  balance,
  open,
  onToggle,
  onPlace,
}: {
  deal: BrowsedDeal;
  texture: string;
  locale: string;
  categories: readonly string[];
  balance: number;
  /** Whether this card's terms are showing. */
  open: boolean;
  onToggle: () => void;
  onPlace: OpenPlace;
}) {
  const copy = useCopy().wallet;
  const deals = copy.deals;
  /* Seen, reported to the venue that is paying for this offer. The id is the
     server's own now, so `api/reach.ts`'s gate lets it through — it used to
     drop every one of these, because the board carried ids this site had
     invented. */
  const seen = useImpressionRef('deal', deal.id, 'wallet');

  const short = Math.max(0, deal.pointsRequired - balance);
  const until = on(deal.validTo, locale);
  const where = [
    deal.category ? categoryLabel(deal.category, categories) : '',
    deal.city ?? '',
  ].filter(Boolean);
  const venueId = deal.venueId;

  return (
    <article ref={seen} className="wal-deal" data-reveal>
      <div className="wal-band" data-texture={texture}>
        <div className="wal-band-top">
          <BrandMark letter={initialOf(deal.partnerName ?? deal.copy.title)} />
          {until && <BandPill text={fill(deals.until, { date: until })} />}
        </div>
        <span className="wal-fig">{deal.discountText ?? deal.copy.title}</span>
      </div>

      <div className="wal-body">
        <b className="wal-name">{deal.partnerName ?? deal.copy.title}</b>
        {where.length > 0 && <span className="wal-where">{where.join(' · ')}</span>}
        <span className="wal-offer">{deal.copy.description}</span>
        {deal.pointsRequired === 0 ? (
          <span className="wal-free">{deals.free}</span>
        ) : (
          <span className="wal-meta">{fill(copy.cost, { n: String(deal.pointsRequired) })}</span>
        )}

        <div className="wal-act">
          <button
            type="button"
            className="btn btn-ghost wal-cta"
            aria-expanded={open}
            /* An `open`, not a claim — and the only funnel step this card is
               allowed to post. See the header. */
            onClick={() => {
              dealOpen(deal.id, 'wallet');
              onToggle();
            }}
          >
            <Icon name={open ? 'chevron' : 'qr'} size={15} />
            {open ? deals.hideTerms : deals.howToClaim}
          </button>
          {venueId && (
            <SeePlace onOpen={(from) => onPlace({ id: venueId, name: deal.partnerName }, from)} />
          )}
        </div>

        {/*
          No height animation and nothing to reduce: the panel is present or it
          is not. `prefers-reduced-motion` therefore needs no branch here, which
          is the cheapest way to honour it.
        */}
        {open && (
          <div className="wal-terms">
            {deal.copy.terms && <p>{deal.copy.terms}</p>}
            <p className="wal-terms-how">{deals.claimAtCounter}</p>
            {short > 0 && <p>{fill(deals.shortBy, { n: String(short) })}</p>}
          </div>
        )}
      </div>
    </article>
  );
}

/* ───────────────────────────────────────────────────────── category strip ── */

/**
 * The chips above the board.
 *
 * **Built from the rows, not from a list.** The strip used to be five customer
 * categories written in `content.ts` — Coffee, Food, Bakery, Services, Beauty —
 * and a deal's category on the server is the *venue's* taxonomy: `cafe`,
 * `restaurant`, `hotels`. The two never matched, so every chip would have been
 * empty. It is now the set of categories the fetched deals actually carry,
 * which has the property the old strip only claimed: **a chip that can never
 * match is not drawn.**
 *
 * `null` is the "All" chip. It is not a category — a venue cannot be filed in
 * it — it is the absence of a filter, which is what makes it the only chip that
 * can never be empty.
 */
function CategoryStrip({
  label,
  ids,
  names,
  counts,
  selected,
  onPick,
}: {
  label: string;
  ids: readonly string[];
  names: readonly string[];
  counts: Map<string | null, number>;
  selected: string | null;
  onPick: (next: string | null) => void;
}) {
  const copy = useCopy().wallet.deals;

  const chips: Array<{ key: string | null; text: string }> = [
    { key: null, text: copy.all },
    ...ids.map((id) => ({ key: id, text: categoryLabel(id, names) })),
  ];

  return (
    <div className="wal-cats" role="group" aria-label={label} data-reveal>
      {chips.map((chip) => (
        <button
          key={chip.key ?? 'all'}
          type="button"
          data-on={selected === chip.key ? 'true' : undefined}
          aria-pressed={selected === chip.key}
          onClick={() => onPick(chip.key)}
        >
          {chip.text}
          <i>{counts.get(chip.key) ?? 0}</i>
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── the page ── */

export function WalletApp() {
  const copy = useCopy();
  const wallet = copy.wallet;
  const [language] = useLanguage();
  const separator = CURRENCIES[language].group;
  const { account } = useAuth();

  const [tab, setTab] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [terms, setTerms] = useState<string | null>(null);
  /** The stock id whose purchase is in flight, and how the last one ended. */
  const [buying, setBuying] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /** The venue open in the sheet, and the control that opened it. */
  const [sheet, setSheet] = useState<{ venue: VenueRef; from: HTMLElement | null } | null>(null);

  const board = useApi<BrowsedDeal[]>(dealsPath({ limit: 50 }));
  const held = useApi<Wallet>(WALLET_PATH);
  const shelf = useApi<GiftCardStock[]>(GIFT_CARDS_PATH);
  const me = useApi<Me>(ME_PATH);

  /* The city the server stores on the account — the spelling `GET /v1/venues`
     matches literally. Not asked for until it is known: `useApi(null)` sends
     nothing, and the section below never reads that result until there is a
     city to have asked about. */
  const city = me.state.status === 'ready' ? me.state.data.user.city : null;
  const places = useApi<VenueListRow[]>(city ? venuesPath(city) : null);

  const player = account?.player;

  const dealRows = board.state.status === 'ready' ? board.state.data : [];
  const shelfRows = shelf.state.status === 'ready' ? shelf.state.data : [];
  const placeRows = places.state.status === 'ready' ? places.state.data : [];
  const purse = useLastReady(held.state);
  const holdings: 'loading' | 'error' | 'ready' =
    held.state.status === 'error' ? 'error' : purse ? 'ready' : 'loading';

  /*
   * The balance, and which of the two copies of it wins.
   *
   * `GET /v1/wallet` returns the ledger balance and `player.points` is the
   * mirror `GET /v1/games/state` last wrote into this device's session. They are
   * the same figure from the same ledger; the wallet's is the fresher of the two
   * — it is re-read after every purchase — so it wins when it is there, and the
   * mirror covers the moment before the first response lands. Neither is
   * computed here, which is the property that matters.
   */
  const balance = purse ? purse.points : (player?.points ?? 0);

  const reload = held.reload;
  const buy = useCallback(
    async (stockId: string) => {
      setBuying(stockId);
      setFailed(false);
      try {
        await redeemGiftCard(stockId);
        /* The server is the record of both halves — the new card and the points
           it cost — so the answer is re-read rather than patched locally. A
           subtraction here would be this page inventing a balance again. */
        reload();
      } catch {
        setFailed(true);
      } finally {
        setBuying(null);
      }
    },
    [reload],
  );

  const openPlace = useCallback<OpenPlace>((venue, from) => setSheet({ venue, from }), []);
  const closePlace = useCallback(() => setSheet(null), []);

  if (!player) return null;

  /* The chips, and the counts under them, from one predicate over one list. */
  const categoryIds = [
    ...new Set(dealRows.map((deal) => deal.category).filter((id): id is string => Boolean(id))),
  ].sort();
  const deals = category === null ? dealRows : dealRows.filter((d) => d.category === category);
  const counts = new Map<string | null, number>([
    [null, dealRows.length],
    ...categoryIds.map(
      (id) => [id, dealRows.filter((deal) => deal.category === id).length] as const,
    ),
  ]);
  const chipLabel =
    category === null ? wallet.deals.all : categoryLabel(category, copy.listing.categories);

  /*
   * Venue names this page already holds, by id.
   *
   * A voucher and a reward carry a `venue_id` and nothing else. Every list on
   * this screen that names a venue is the server's answer about that venue, so a
   * name found in one of them is a name, not a guess — and an id found in none
   * prints no name at all. Later lists win because a stamp card joins
   * `venues.name` live, where a deal carries the name it was published under.
   */
  const venueNames = new Map<string, string>();
  for (const deal of dealRows) {
    if (deal.venueId && deal.partnerName) venueNames.set(deal.venueId, deal.partnerName);
  }
  for (const place of placeRows) venueNames.set(place.id, place.name);
  for (const card of purse?.stampCards ?? []) venueNames.set(card.venue_id, card.venue_name);
  const nameOf = (venueId: string): string | null => venueNames.get(venueId) ?? null;

  const giftCards = purse?.giftCards ?? [];
  const shownCards = giftCards.filter((card) =>
    tab === 0 ? card.status === 'active' : card.status !== 'active',
  );
  const activeCount = giftCards.filter((card) => card.status === 'active').length;

  /* What the cheapest thing on the shelf costs — `null` when there is no shelf,
     which is a different sentence from "you are 0 points short". */
  const cheapest = cheapestCost(shelfRows);
  const short = cheapest === null ? 0 : Math.max(0, cheapest - balance);

  return (
    <main>
      <section className="section wal" id="wallet-top">
        <div className="wrap">
          <div className="app-head" data-reveal>
            <h1>{wallet.title}</h1>
            <p>{wallet.lede}</p>
          </div>

          {/* ── balance ── */}
          <div className="balance" data-reveal>
            <div>
              <span>{wallet.balance}</span>
              <b>
                {balance} <i>{wallet.points}</i>
              </b>
            </div>
            <span className="balance-note">
              {cheapest === null
                ? wallet.noShelf
                : short > 0
                  ? fill(wallet.shortBy, { n: String(short) })
                  : wallet.canRedeem}
            </span>
          </div>

          {/* ── the code staff type ── */}
          <CounterCard me={me} />

          {/* ══ the board ══
              What is on offer, first, because it is what somebody opens this
              page to decide from. */}
          <div className="section-head left cat-head" id="wallet-deals" data-reveal>
            <h2>{wallet.deals.title}</h2>
            <p>{wallet.deals.lede}</p>
          </div>

          {board.state.status === 'error' ? (
            <Down result={board} />
          ) : board.state.status === 'loading' ? (
            <p className="adm-empty">{wallet.loading}</p>
          ) : dealRows.length === 0 ? (
            /* Not a failed request and not a filter coming up short: there are
               no live offers on the platform. It is what a new market looks
               like, and it says so. */
            <div className="console wal-empty" data-reveal>
              <p>{wallet.deals.noneAtAll}</p>
            </div>
          ) : (
            <>
              {categoryIds.length > 0 && (
                <CategoryStrip
                  label={wallet.deals.filter}
                  ids={categoryIds}
                  names={copy.listing.categories}
                  counts={counts}
                  selected={category}
                  onPick={setCategory}
                />
              )}

              {deals.length === 0 ? (
                <div className="console wal-empty" data-reveal>
                  <p>{fill(wallet.deals.noneHere, { category: chipLabel })}</p>
                  <button type="button" className="btn btn-ghost" onClick={() => setCategory(null)}>
                    {wallet.deals.showAll}
                  </button>
                </div>
              ) : (
                <div className="wal-deals">
                  {deals.map((deal, index) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      texture={textureAt(index)}
                      locale={language}
                      categories={copy.listing.categories}
                      balance={balance}
                      open={terms === deal.id}
                      onToggle={() => setTerms(terms === deal.id ? null : deal.id)}
                      onPlace={openPlace}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ══ places near you ══
              Five states, and each is its own sentence: still asking who the
              player is, could not ask, no city to ask about, asked and nobody
              has joined, and the list. "No city" is not a failure — it is the
              profile's next step, and it links there. */}
          <div className="section-head left cat-head" id="wallet-places" data-reveal>
            <h2>{wallet.places.title}</h2>
            {city && <p>{fill(wallet.places.lede, { city })}</p>}
          </div>

          {me.state.status === 'error' ? (
            <Down result={me} />
          ) : me.state.status === 'loading' ? (
            <p className="adm-empty">{wallet.loading}</p>
          ) : !city ? (
            <div className="console wal-empty" data-reveal>
              <p>{wallet.places.noCity}</p>
              <a className="btn btn-ghost" href={PATHS.profile}>
                {wallet.places.setCity}
              </a>
            </div>
          ) : places.state.status === 'error' ? (
            <Down result={places} />
          ) : places.state.status === 'loading' ? (
            <p className="adm-empty">{wallet.loading}</p>
          ) : placeRows.length === 0 ? (
            <div className="console wal-empty" data-reveal>
              <p>{fill(wallet.places.none, { city })}</p>
            </div>
          ) : (
            <div className="wal-places">
              {placeRows.map((place) => (
                <PlaceRow
                  key={place.id}
                  place={place}
                  categories={copy.listing.categories}
                  onOpen={openPlace}
                />
              ))}
            </div>
          )}

          {/* ── stamp cards ── */}
          <div className="section-head left cat-head" id="wallet-stamps" data-reveal>
            <h2>{wallet.stamps.title}</h2>
            <p>{wallet.stamps.lede}</p>
          </div>

          {holdings === 'error' ? (
            <Down result={held} />
          ) : holdings === 'loading' ? (
            <p className="adm-empty">{wallet.loading}</p>
          ) : (purse?.stampCards ?? []).length === 0 ? (
            <div className="console wal-empty" data-reveal>
              <p>{wallet.stamps.none}</p>
            </div>
          ) : (
            <div className="wal-stamps">
              {(purse?.stampCards ?? []).map((card, index) => (
                <StampRow
                  key={card.campaign_id}
                  card={card}
                  /* Offset so the first stamp card and the first deal do not
                     land on the same pattern in two lists on one page. */
                  texture={textureAt(index + 2)}
                  onPlace={openPlace}
                />
              ))}
            </div>
          )}

          {/* ══ what has already been taken ══
              All three lists are one request, so they share one failure. Three
              "the server refused" panels down one page is noise where one is
              information — and the wallet request is the only one on this screen
              that needs a token, so it is the one that fails on its own while
              the board and the shelf above and below it are fine. */}
          <div className="section-head left cat-head" id="wallet-redeemed" data-reveal>
            <h2>{wallet.redeemed.title}</h2>
            <p>{wallet.redeemed.lede}</p>
          </div>

          {holdings === 'error' ? (
            <Down result={held} />
          ) : holdings === 'loading' ? (
            <p className="adm-empty">{wallet.loading}</p>
          ) : (
            <>
              <h3 className="wal-subhead" data-reveal>
                {wallet.redeemed.vouchersTitle}
                <span>{wallet.redeemed.vouchersLede}</span>
              </h3>

              {(purse?.vouchers ?? []).length === 0 ? (
                <div className="console wal-empty" data-reveal>
                  <p>{wallet.noVouchers}</p>
                </div>
              ) : (
                <div className="wcards">
                  {(purse?.vouchers ?? []).map((voucher, index) => (
                    <VoucherRow
                      key={voucher.id}
                      voucher={voucher}
                      venueName={nameOf(voucher.venue_id)}
                      texture={textureAt(index)}
                      locale={language}
                      onPlace={openPlace}
                    />
                  ))}
                </div>
              )}

              {/* ── rewards held ── */}
              <h3 className="wal-subhead" id="wallet-rewards" data-reveal>
                {wallet.rewards.title}
                <span>{wallet.rewards.lede}</span>
              </h3>

              {(purse?.rewards ?? []).length === 0 ? (
                <div className="console wal-empty" data-reveal>
                  <p>{wallet.rewards.none}</p>
                </div>
              ) : (
                <div className="wcards">
                  {(purse?.rewards ?? []).map((reward, index) => (
                    <RewardRow
                      key={reward.id}
                      reward={reward}
                      venueName={nameOf(reward.venue_id)}
                      texture={textureAt(index + 3)}
                      locale={language}
                      onPlace={openPlace}
                    />
                  ))}
                </div>
              )}

              {/* ── gift cards held ── */}
              <h3 className="wal-subhead" id="wallet-gifts" data-reveal>
                {wallet.giftsTitle}
                <span>{wallet.giftsLede}</span>
              </h3>

              <div className="wal-tabs" data-reveal>
                {wallet.tabs.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    data-on={tab === index ? 'true' : undefined}
                    onClick={() => setTab(index)}
                  >
                    {label}
                    <i>{index === 0 ? activeCount : giftCards.length - activeCount}</i>
                  </button>
                ))}
              </div>

              {shownCards.length === 0 ? (
                <div className="console wal-empty" data-reveal>
                  <p>{tab === 0 ? wallet.emptyActive : wallet.emptyUsed}</p>
                  {tab === 0 && (
                    <a className="btn btn-solid" href={PATHS.learn}>
                      {wallet.play}
                    </a>
                  )}
                </div>
              ) : (
                <div className="wcards">
                  {shownCards.map((card, index) => (
                    <GiftCardRow
                      key={card.id}
                      card={card}
                      texture={textureAt(index + 4)}
                      separator={separator}
                      locale={language}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── the shelf ──
              No band, and that is the hierarchy: a band is what a thing you
              *hold* gets. These are stock — the point of the grid is comparing
              them by price — and giving them the same plate as the cards above
              would make the page one long run of identical objects with nothing
              to say which are yours.

              No reach wiring either: a gift card is *stock at a brand*
              (`gift_card_stock`), not a venue with a listing, so there is no
              venue whose funnel these impressions would belong to. */}
          <div className="section-head left cat-head" data-reveal>
            <h2>{wallet.catalogue}</h2>
            <p>{wallet.catalogueLede}</p>
          </div>

          {shelf.state.status === 'error' ? (
            <Down result={shelf} />
          ) : shelf.state.status === 'loading' ? (
            <p className="adm-empty">{wallet.loading}</p>
          ) : shelfRows.length === 0 ? (
            <div className="console wal-empty" data-reveal>
              <p>{wallet.noShelfYet}</p>
            </div>
          ) : (
            <div className="gifts">
              {shelfRows.map((card) => {
                const out = card.stock <= 0;
                const afford = canAfford({ ...player, points: balance }, card.points_cost);
                const inFlight = buying === card.id;

                return (
                  <article className="gift" key={card.id} data-reveal>
                    <div className="gift-top">
                      <span className="pv-logo" aria-hidden>
                        {card.logo || initialOf(card.brand)}
                      </span>
                      <span className="gift-left">
                        {out ? wallet.soldOut : fill(wallet.left, { n: String(card.stock) })}
                      </span>
                    </div>
                    <b>{card.brand}</b>
                    {/* The face value in the card's own currency — see the note
                        on `faceValue`. The site's own prices convert; a thing on
                        a shelf does not. */}
                    <span className="gift-value">{faceValue(card, separator)}</span>
                    {card.priority_only === 1 && (
                      <span className="gift-where">{wallet.priorityOnly}</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-solid gift-buy"
                      disabled={out || !afford || inFlight}
                      onClick={() => void buy(card.id)}
                    >
                      {out
                        ? wallet.soldOut
                        : inFlight
                          ? wallet.buying
                          : afford
                            ? `${wallet.redeem} · ${fill(wallet.cost, { n: String(card.points_cost) })}`
                            : wallet.short}
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {/* A refused purchase is said out loud. It is the one press on this
              page that moves value, and a button that goes quiet is a button
              somebody presses again. */}
          {failed && (
            <p className="wal-rule" data-reveal>
              <Icon name="shield" size={15} />
              {wallet.buyFailed}
            </p>
          )}

          <p className="wal-rule" data-reveal>
            <Icon name="qr" size={15} />
            {wallet.atCounter}
          </p>
        </div>
      </section>

      {/* Keyed by venue, so opening a second place starts a fresh sheet — its
          own request, its own purchase state — instead of reusing the first
          one's. It portals itself out of this tree; see `venueSheet.tsx`. */}
      {sheet && (
        <VenueSheet
          key={sheet.venue.id}
          venue={sheet.venue}
          balance={purse ? purse.points : null}
          returnFocus={sheet.from}
          onClose={closePlace}
          onChanged={reload}
        />
      )}
    </main>
  );
}
