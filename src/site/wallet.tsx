import { useCallback, useEffect, useRef, useState } from 'react';
import { DEAL_CATEGORIES, VOUCHER_CARDS, WALLET_DEALS, type DealCategory, type HotDeal } from './content';
import { Icon } from './icons';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { dealOpen, useImpressionRef } from './api/reach';
import { useAuth } from './auth/context';
import {
  activeVouchers,
  canAfford,
  CHEAPEST_VOUCHER,
  claimDeal,
  dealsOf,
  filterByCategory,
  heldWithVenue,
  isCardFull,
  markUsed,
  openDeals,
  openNow,
  redeem,
  stampsLeft,
  stampsOf,
  stampVisit,
  stampWithVenue,
  usedVouchers,
  type ClaimedDeal,
  type OwnedVoucher,
  type StampCard,
} from './auth/player';
import { PATHS } from './router';

/**
 * The wallet, for someone who is signed in.
 *
 * The marketing version of this page spends most of its length explaining what
 * a voucher is, how one is generated and why the code is single-use. None of
 * that survives here: a signed-in player has a balance and three kinds of
 * holding, and the explanation has been replaced by the thing it was
 * explaining. The one rule that still has to be *said* is said at the moment it
 * bites — pressing "Show QR code" spends the gift card, and the card says so
 * afterwards rather than in a paragraph three screens up.
 *
 * ── the page is a board and then a wallet ────────────────────────────────
 *
 * The order is the argument. **What is on offer comes first** — the hot deals
 * and the stamp cards, filtered by one strip of category chips — because that
 * is what somebody opens this page to decide from before going out. **What has
 * already been taken comes below it**: the claimed deals with their codes, then
 * the gift cards. A deal is in exactly one of the two lists and the split is
 * derived (`openDeals` in `auth/player.ts`) rather than tracked, so the board
 * and the wallet cannot drift.
 *
 * That is a change from the layout before it, which put the deals and the stamp
 * cards in two columns side by side and mixed claimed offers in among the
 * unclaimed. The columns answered "what have I got, and where am I nearly
 * there" in one look, which was worth having; what they could not do is
 * separate an offer from a holding, and the two grew different cards and
 * different buttons anyway.
 *
 * ── the three holdings, and why they are three ───────────────────────────
 *
 * This page used to hold one thing and call it "vouchers". The app it is the
 * web half of (`Pay-lez mobile`, `lib/screens/wallet_screen.dart`) holds three,
 * and they are genuinely different objects rather than three views of one:
 *
 * - a **hot deal** is one venue running one offer for a fixed window. Claiming
 *   is usually free, because the venue is paying for it;
 * - a **gift card** is stock — a fixed face value at a named brand, bought with
 *   points off a catalogue with a monthly allocation;
 * - a **stamp card** counts *visits to one venue*, and a visit is not a point.
 *   It cannot be spent anywhere but the venue that gave it.
 *
 * Collapsing any two of those loses the rule that distinguishes them, and each
 * of those rules is one a player will otherwise learn by being wrong at a
 * counter. So: three sections, and each states its own rule under its heading.
 */

/*
 * ── strings ──
 *
 * There are none. Every word on this screen comes out of `copy.wallet`, and the
 * offer line under each venue is `copy.wallet.deals.offers`, index-aligned with
 * `WALLET_DEALS` the way every list in `content.ts` is. If a slot on a card had
 * nothing to say it is left empty rather than filled with English, which is
 * what the app's own card does when a line has nothing to say.
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
 *
 * The Play screen made the same substitution for its own mock's six hues once,
 * with the same seven pattern names — its cards carry a preview of the round
 * instead now, which is the better answer where there is a round to preview and
 * no answer at all here, because a gift card has no gameplay to show. The names
 * stayed on this side. Modulo rather than a fixed length, because a player can
 * hold any number of stamp cards and gift cards.
 */
const WAL_TEXTURES = ['dots', 'stripe', 'orbit', 'weave', 'chevron', 'grid', 'hatch'] as const;

const textureAt = (index: number): string => WAL_TEXTURES[index % WAL_TEXTURES.length];

/**
 * How long a just-claimed card stays on the board before it moves down.
 *
 * It has to be long enough for the ring to finish expanding and the code to
 * finish landing, and short enough that nobody wonders whether the press
 * worked. The two animations are 620ms and 400ms from a common start, so this
 * is the longer of them plus a beat to read the line that appeared.
 */
const CLAIM_HOLD_MS = 1150;

/** Whether the reader has asked for less movement. Read at the moment of use —
 *  the setting can change while the tab is open. */
const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The status pill that sits on the band — the app's `_DealPill`.
 *
 * `live` is the pulsing 6px dot and it means the same thing the app's does:
 * **open now**. That claim used to be unavailable here — the note this replaces
 * said so, because a `DD.MM` with no year is not a week and deriving one would
 * have been a guess dressed as a fact. `VenueFacts` carries the venue's span
 * and its timezone now, so `openNow` can answer it on the venue's own clock
 * rather than on the reader's.
 */
function BandPill({ text, live }: { text: string; live: boolean }) {
  return (
    <span className="wal-pill" data-live={live ? 'true' : undefined}>
      {live && <i aria-hidden />}
      {text}
    </span>
  );
}

/**
 * The tile in the top-left corner of every band.
 *
 * One letter on the accent, and it is the brand's mark in the only form this
 * site has one: no venue or brand ships an image asset here, and a logo fetched
 * from a partner's CDN would be the third-party runtime request the whole
 * front end is built to avoid. `.pv-logo` is the shared tile; `.wal-mark` is the
 * corner it sits in.
 */
function BrandMark({ letter }: { letter: string }) {
  return (
    <span className="pv-logo wal-mark" aria-hidden>
      {letter}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────── gift card ── */

/**
 * A gift card in the wallet.
 *
 * The plate is the **face value**, because that is what the object is: a fixed
 * amount at a named brand. It is `money(voucher.eur)` like every other amount on
 * the site — euros in the model, converted on the way out — so a Polish reader
 * sees złoty on the plate and the catalogue below quotes the same card in the
 * same currency. The brand's mark is the top-left box, in the same corner the
 * catalogue tile below puts it and the deal cards above put theirs.
 */
function GiftCardRow({
  voucher,
  texture,
  onShow,
}: {
  voucher: OwnedVoucher;
  texture: string;
  onShow: (id: string) => void;
}) {
  const copy = useCopy().wallet;
  const money = useMoney();
  const spent = voucher.usedOn !== null;

  return (
    <article className="wcard" data-spent={spent ? 'true' : undefined} data-reveal>
      <div className="wal-band" data-texture={texture}>
        <div className="wal-band-top">
          <BrandMark letter={voucher.logo} />
          <BandPill
            live={!spent}
            text={
              spent
                ? fill(copy.usedOn, { date: voucher.usedOn! })
                : fill(copy.valid, { date: voucher.expires })
            }
          />
        </div>
        <span className="wal-fig">{money(voucher.eur)}</span>
      </div>

      <div className="wal-body">
        <b className="wal-name">{voucher.brand}</b>
        <span className="wal-meta">{fill(copy.cost, { n: String(voucher.points) })}</span>

        <div className="wal-act">
          {spent ? (
            /* The code stays visible once spent — it is the receipt, and the till
               may still want to see it. */
            <span className="wcard-code">{voucher.code}</span>
          ) : (
            <button type="button" className="btn btn-solid wal-cta" onClick={() => onShow(voucher.id)}>
              <Icon name="qr" size={15} />
              {copy.show}
            </button>
          )}
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
 * needed: a row of six discs says how far along you are and says nothing at all
 * about what is at the end of it. Ported from the app's `StampWords`, including
 * the branch count — **three states, not two**. A card with no visits on it
 * reads differently from one in progress, and it is the state every card starts
 * in, so "0 of 6" on its own is the least useful thing the card could say.
 *
 * The slots are what goes on the plate. They are the one holding whose subject
 * is already a picture, so the band does not need a figure invented for it —
 * where a deal puts its offer and a gift card puts its face value, this puts the
 * row of discs, and the count moves up into the pill beside them.
 */
/* No reach wiring here on purpose: `card.id` is a *stamp card*, not the venue
   it belongs to, and nothing on this row carries a venue id to report against.
   Inventing one would put another venue's impressions in somebody's funnel. */
function StampRow({
  card,
  texture,
  landed,
  onVisit,
}: {
  card: StampCard;
  texture: string;
  landed: boolean;
  onVisit: (id: string) => void;
}) {
  const copy = useCopy().wallet;
  const full = isCardFull(card);
  const left = stampsLeft(card);

  const words = full
    ? fill(copy.stamps.full, { reward: card.reward })
    : card.stamps === 0
      ? fill(copy.stamps.empty, { of: String(card.required), reward: card.reward })
      : left === 1
        ? fill(copy.stamps.goingOne, { reward: card.reward })
        : fill(copy.stamps.going, { left: String(left), reward: card.reward });

  return (
    <article className="wal-stamp" data-full={full ? 'true' : undefined} data-reveal>
      <div className="wal-band" data-texture={texture}>
        <div className="wal-band-top">
          <BrandMark letter={card.logo} />
          {/* The dot fires on a full card and on nothing else. That is the one
              state on this page that is an *event* rather than a status — there
              is something waiting at a counter. */}
          <BandPill
            live={full}
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

          `data-landed` marks the disc the last visit filled, which is the app's
          `pl-stamp` landing — it drops in oversized and settles, with a ring
          going out behind it. Only ever one, and only until the next render
          that is not a visit.
        */}
        <div className="wal-slots" aria-hidden>
          {Array.from({ length: card.required }, (_, i) => (
            <span
              key={i}
              data-on={i < card.stamps ? 'true' : undefined}
              data-landed={landed && i === card.stamps - 1 ? 'true' : undefined}
            />
          ))}
        </div>
      </div>

      <div className="wal-body">
        <div className="wal-name-row">
          <b className="wal-name">{card.venue}</b>
          {/* Only on a card that has been round at least once. On a first card it
              would be "filled 0× before", which is a sentence about nothing. */}
          {card.cycles > 0 && (
            <span className="wal-cycles">{fill(copy.stamps.cycles, { n: String(card.cycles) })}</span>
          )}
        </div>

        <p className="wal-stamp-words">{words}</p>

        {/*
          A visit is added by scanning at the counter, which this page cannot do.
          The button is here because the rule it demonstrates — a full card rolls
          over into the next one rather than overflowing — is invisible without a
          way to reach it, and it is the one thing about a stamp card somebody is
          likely to get wrong.
        */}
        <div className="wal-act">
          <button type="button" className="btn btn-ghost wal-cta" onClick={() => onVisit(card.id)}>
            <Icon name="qr" size={15} />
            {copy.stamps.visit}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ──────────────────────────────────────────────────────────────── hot deal ── */

/**
 * Where the place is, and what it is rated — the two lines under its name.
 *
 * `category · address · city` is the app's `_metaLine` (`venue_screen.dart`),
 * and so is the rule it is written to: **it degrades to the parts that are
 * actually known** rather than printing a separator around a hole. A deal
 * claimed before these fields existed carries none of them and gets no lines at
 * all, which is the honest rendering of a row that does not say.
 */
function VenueMeta({ deal }: { deal: HotDeal | ClaimedDeal }) {
  const copy = useCopy().wallet.deals;

  const where = [
    deal.category ? copy.categories[DEAL_CATEGORIES.indexOf(deal.category)] : '',
    deal.address ?? '',
    deal.city ?? '',
  ].filter(Boolean);

  return (
    <>
      {where.length > 0 && <span className="wal-where">{where.join(' · ')}</span>}

      {/* The rating is two facts and they are drawn as one: a figure the eye
          reads as a score, and the count that says how much to trust it. A
          rating with no cohort behind it is the thing `suppressed` exists to
          prevent one screen over, so the pair is never split. */}
      {deal.rating !== undefined && deal.reviews !== undefined && (
        <span className="wal-rate">
          <b>
            <i aria-hidden>★</i>
            {deal.rating.toFixed(1)}
          </b>
          {fill(copy.reviews, { n: String(deal.reviews) })}
        </span>
      )}
    </>
  );
}

/**
 * When you can take it — the app's `when` line, last on the card.
 *
 * Two clauses joined by a middle dot rather than one sentence with two holes:
 * the door and the offer's last day are separate facts about separate things,
 * and a venue may publish one without the other. Each is finished on its own by
 * `fill`, which is the rule for anything quoting a figure.
 */
function VenueWhen({ deal }: { deal: HotDeal | ClaimedDeal }) {
  const copy = useCopy().wallet.deals;

  const when = [
    deal.hours ? fill(copy.everyDay, { hours: deal.hours }) : '',
    fill(copy.until, { date: deal.expires }),
  ].filter(Boolean);

  return <span className="wal-when">{when.join(' · ')}</span>;
}

/**
 * A hot deal on the board, in the app's own card.
 *
 * Every slot maps to one the app's `_DealCard` has, and nothing is said twice:
 *
 * - the **plate** is the offer — `2+1`, `20%`, `FREE` — which is what the
 *   photograph is for on the phone, the thing you scan a column of cards for;
 * - the **pill** is the venue's state on its own clock, which is the app's pill
 *   exactly: `Open now` with the live dot, or `Closed now`;
 * - the **name** is the venue, not the offer. That is the app's `_titleFor` and
 *   it is the whole reason this card carries an address at all;
 * - the **accent line** is what the offer gives you, said once — the app's teal
 *   line, `copy.deals.offers` here;
 * - the **action** is the claim, priced when it costs points and saying how far
 *   short the balance is when it will not reach.
 *
 * The one slot the app has and this does not is the **distance**. Nothing here
 * has a position fix either, and the app's own note says it renders nothing
 * rather than a guess; a seeded "1.2 km away" would be the one fact on this
 * card that is about the reader rather than about the venue, and it would be
 * invented.
 */
function DealCard({
  deal,
  offer,
  texture,
  claiming,
  code,
  onClaim,
  balance,
}: {
  deal: HotDeal;
  offer: string;
  texture: string;
  /** True for the beat between the press and the card moving to Redeemed. */
  claiming: boolean;
  /** The code the claim minted, shown while `claiming`. */
  code: string | null;
  onClaim: () => void;
  balance: number;
}) {
  const copy = useCopy().wallet;
  const deals = copy.deals;
  /* Seen and opened, reported to the venue that is paying for this offer —
     `api/reach.ts`. `deal.id` is the site's own seed id today (`WALLET_DEALS`),
     which the collector drops rather than posting; the wiring is here so the
     surface is already right when these cards come from `GET /v1/deals`. */
  const seen = useImpressionRef('deal', deal.id, 'wallet');

  const open = openNow(deal);
  const short = Math.max(0, deal.points - balance);

  return (
    <article
      ref={seen}
      className="wal-deal"
      data-claiming={claiming ? 'true' : undefined}
      data-reveal
    >
      <div className="wal-band" data-texture={texture}>
        <div className="wal-band-top">
          <BrandMark letter={deal.logo} />
          {/* `open === null` is "the row does not say", and the pill stays off
              rather than asserting either state. Nothing in the seed is in that
              case; a row from `GET /v1/deals` with no hours would be. */}
          {open !== null && (
            <BandPill live={open} text={open ? deals.openNow : deals.closedNow} />
          )}
        </div>
        <span className="wal-fig">{deal.badge}</span>

        {/* The claim's own animation. Both are decoration and both are
            `aria-hidden`: what actually changed is said in words by the line
            below, which is what a screen reader is given. */}
        {claiming && (
          <>
            <span className="wal-burst" aria-hidden />
            <span className="wal-sheen" aria-hidden />
          </>
        )}
      </div>

      <div className="wal-body">
        <b className="wal-name">{deal.venue}</b>
        <VenueMeta deal={deal} />
        <span className="wal-offer">{offer}</span>
        {deal.points === 0 && <span className="wal-free">{deals.free}</span>}
        <VenueWhen deal={deal} />

        <div className="wal-act">
          {claiming ? (
            /* The button is gone the moment it is pressed — pressing it twice
               is the thing `claimDeal` guards against, and a control that
               cannot do anything any more should not still look like one. */
            <span className="wal-won">
              <Icon name="check" size={16} />
              <span>
                {deals.justClaimed}
                {code && <b className="wcard-code">{code}</b>}
              </span>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-solid wal-cta"
              disabled={short > 0}
              /* An open, not a claim: a claim is written by the gate from a
                 confirmed scan and is deliberately not postable by a client. */
              onClick={() => {
                dealOpen(deal.id, 'wallet');
                onClaim();
              }}
            >
              {short > 0
                ? fill(deals.shortBy, { n: String(short) })
                : deal.points === 0
                  ? deals.claim
                  : `${deals.claim} · ${fill(copy.cost, { n: String(deal.points) })}`}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * A hot deal that has already been claimed.
 *
 * The same card with the offer settled: the pill says it is held rather than
 * whether the door is open, the accent line is replaced by the date it was
 * taken — what an offer *costs* stops being news once it has been paid — and
 * the button's place is taken by the code, which is the thing the till wants.
 */
function HeldDealCard({ deal, texture }: { deal: ClaimedDeal; texture: string }) {
  const copy = useCopy().wallet.deals;

  return (
    <article className="wal-deal" data-held="true" data-reveal>
      <div className="wal-band" data-texture={texture}>
        <div className="wal-band-top">
          <BrandMark letter={deal.logo} />
          <BandPill live={false} text={copy.held} />
        </div>
        <span className="wal-fig">{deal.badge}</span>
      </div>

      <div className="wal-body">
        <b className="wal-name">{deal.venue}</b>
        <VenueMeta deal={deal} />
        <span className="wal-offer">{fill(copy.claimed, { date: deal.claimedOn })}</span>
        <VenueWhen deal={deal} />

        <div className="wal-act">
          <span className="wal-code-block">
            <i>{copy.code}</i>
            <b className="wcard-code">{deal.code}</b>
          </span>
        </div>
      </div>
    </article>
  );
}

/* ───────────────────────────────────────────────────────── category strip ── */

/**
 * The chips above the board — the app's `_CategoryStrip`.
 *
 * `null` is the "All" chip. It is not a category and is not in
 * `DEAL_CATEGORIES`, because a venue cannot be filed in it; it is the absence
 * of a filter, which is what makes "All" the only chip that can never be empty.
 *
 * Every chip carries its own count, and the count comes from the same predicate
 * the list is filtered with (`inCategory`) rather than from a second walk of the
 * data. A chip reading 3 over a list of 2 is the class of bug that is invisible
 * until somebody counts.
 */
function CategoryStrip({
  label,
  counts,
  selected,
  onPick,
}: {
  label: string;
  counts: Map<DealCategory | null, number>;
  selected: DealCategory | null;
  onPick: (next: DealCategory | null) => void;
}) {
  const copy = useCopy().wallet.deals;

  const chips: Array<{ key: DealCategory | null; text: string }> = [
    { key: null, text: copy.all },
    ...DEAL_CATEGORIES.map((id, index) => ({ key: id, text: copy.categories[index] })),
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
  const money = useMoney();
  const { account, setPlayer } = useAuth();
  const [tab, setTab] = useState(0);
  const [category, setCategory] = useState<DealCategory | null>(null);

  /*
   * The claim in flight, and the code it minted.
   *
   * Both are one-off transitions rather than continuous state, so `useState` is
   * the right tool here — the rule about keeping per-frame work out of React
   * (see the root `CLAUDE.md`) is about things that update every frame, and this
   * updates twice per press. The card stays on the board for `CLAIM_HOLD_MS`
   * while the ring and the code land, then the timer clears and `openDeals`
   * moves it down to Redeemed on the next render.
   */
  const [claiming, setClaiming] = useState<{ id: string; code: string } | null>(null);
  /** The card whose last slot just filled, for the stamp landing. */
  const [landed, setLanded] = useState<string | null>(null);

  /* Both timers are cleared on unmount: a route change while a claim is in
     flight would otherwise call `setState` on a component that is gone. */
  const claimTimer = useRef<number | undefined>(undefined);
  const landTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(claimTimer.current);
      window.clearTimeout(landTimer.current);
    },
    [],
  );

  const player = account?.player;

  /* `DD.MM` to match the expiry format already on every card, rather than a
     locale string that would disagree with it in four languages. */
  const stamp = useCallback(() => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const onClaim = useCallback(
    (deal: HotDeal) => {
      if (!player) return;
      const code = `PLZ-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const next = claimDeal(player, deal, code, stamp());
      /* Unchanged means refused — already held, or the balance will not cover
         it. Neither is worth an animation. */
      if (next === player) return;

      setPlayer(next);
      if (reducedMotion()) return;

      setClaiming({ id: deal.id, code });
      window.clearTimeout(claimTimer.current);
      claimTimer.current = window.setTimeout(() => setClaiming(null), CLAIM_HOLD_MS);
    },
    [player, setPlayer, stamp],
  );

  const onVisit = useCallback(
    (id: string) => {
      if (!player) return;
      setPlayer(stampVisit(player, id));
      if (reducedMotion()) return;

      setLanded(id);
      window.clearTimeout(landTimer.current);
      landTimer.current = window.setTimeout(() => setLanded(null), 1000);
    },
    [player, setPlayer],
  );

  if (!player) return null;

  const active = activeVouchers(player);
  const used = usedVouchers(player);
  const shown = tab === 0 ? active : used;
  const short = Math.max(0, CHEAPEST_VOUCHER - player.points);

  const claimed = dealsOf(player);
  /* Filed against the board before anything counts or filters them, so the
     chip counts and the list below are computed from one list — see
     `stampWithVenue`, which only ever fills a gap. */
  const cards = stampsOf(player).map((card) => stampWithVenue(card, WALLET_DEALS));

  /*
   * The board, minus what has been claimed — except for the card currently
   * being claimed, which is held in place until its animation finishes. Without
   * that exception the card would vanish on the same frame as the press, which
   * is the one moment it has something to say.
   */
  const board = openDeals(WALLET_DEALS, player);
  const onBoard = claiming
    ? [...board, ...WALLET_DEALS.filter((deal) => deal.id === claiming.id)].sort(
        (a, b) => WALLET_DEALS.indexOf(a) - WALLET_DEALS.indexOf(b),
      )
    : board;

  const deals = filterByCategory(onBoard, category);
  const stampCards = filterByCategory(cards, category);

  /* One count per chip, over both lists — the strip filters the whole board,
     and a chip that said "2" while hiding a stamp card would be lying about
     what pressing it does. */
  const counts = new Map<DealCategory | null, number>([
    [null, onBoard.length + cards.length],
    ...DEAL_CATEGORIES.map(
      (id) =>
        [id, filterByCategory(onBoard, id).length + filterByCategory(cards, id).length] as const,
    ),
  ]);

  const chipLabel =
    category === null
      ? wallet.deals.all
      : wallet.deals.categories[DEAL_CATEGORIES.indexOf(category)];

  const show = (id: string) => setPlayer(markUsed(player, id, stamp()));

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
                {player.points} <i>{wallet.points}</i>
              </b>
            </div>
            <span className="balance-note">
              {short > 0
                ? fill(wallet.shortBy, { n: String(short) })
                : wallet.canRedeem}
            </span>
          </div>

          {/* ══ the board ══
              What is on offer, first, because it is what somebody opens this
              page to decide from. One strip of chips filters both lists under
              it — a venue is a venue whether it is running an offer or holding
              your stamps, and two strips asking the same question would be one
              too many. */}
          <div className="section-head left cat-head" id="wallet-deals" data-reveal>
            <h2>{wallet.deals.title}</h2>
            <p>{wallet.deals.lede}</p>
          </div>

          <CategoryStrip
            label={wallet.deals.filter}
            counts={counts}
            selected={category}
            onPick={setCategory}
          />

          {deals.length === 0 ? (
            <div className="console wal-empty" data-reveal>
              <p>{fill(wallet.deals.noneHere, { category: chipLabel })}</p>
              <button type="button" className="btn btn-ghost" onClick={() => setCategory(null)}>
                {wallet.deals.showAll}
              </button>
            </div>
          ) : (
            <div className="wal-deals">
              {deals.map((deal) => {
                const index = WALLET_DEALS.indexOf(deal);
                return (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    offer={wallet.deals.offers[index]}
                    texture={textureAt(index)}
                    claiming={claiming?.id === deal.id}
                    code={claiming?.id === deal.id ? claiming.code : null}
                    balance={player.points}
                    onClaim={() => onClaim(deal)}
                  />
                );
              })}
            </div>
          )}

          {/* ── stamp cards, under the same strip ── */}
          <div className="section-head left cat-head" id="wallet-stamps" data-reveal>
            <h2>{wallet.stamps.title}</h2>
            <p>{wallet.stamps.lede}</p>
          </div>

          {stampCards.length === 0 ? (
            <div className="console wal-empty" data-reveal>
              <p>
                {cards.length === 0
                  ? wallet.stamps.none
                  : fill(wallet.stamps.noneHere, { category: chipLabel })}
              </p>
            </div>
          ) : (
            <div className="wal-stamps">
              {stampCards.map((card, index) => (
                <StampRow
                  key={card.id}
                  card={card}
                  /* Offset so the first stamp card and the first deal do not
                     land on the same pattern in two lists on one page. Any
                     constant does; this one is the deal grid's row length. */
                  texture={textureAt(index + 2)}
                  landed={landed === card.id}
                  onVisit={onVisit}
                />
              ))}
            </div>
          )}

          {/* ══ what has already been taken ══
              Below the board, and below it on purpose: these are holdings
              rather than offers, and the difference is the one thing about this
              page that has to be legible at a glance. */}
          <div className="section-head left cat-head" id="wallet-redeemed" data-reveal>
            <h2>{wallet.redeemed.title}</h2>
            <p>{wallet.redeemed.lede}</p>
          </div>

          <h3 className="wal-subhead" data-reveal>
            {wallet.redeemed.dealsTitle}
            <span>{wallet.redeemed.dealsLede}</span>
          </h3>

          {claimed.length === 0 ? (
            <div className="console wal-empty" data-reveal>
              <p>{wallet.deals.none}</p>
            </div>
          ) : (
            <div className="wal-deals">
              {claimed.map((deal, index) => (
                <HeldDealCard
                  key={deal.id}
                  /* The board's facts where the board still has this offer —
                     see `heldWithVenue`. A deal claimed before the card carried
                     an address would otherwise show a name and nothing else. */
                  deal={heldWithVenue(deal, WALLET_DEALS)}
                  texture={textureAt(index)}
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
                <i>{index === 0 ? active.length : used.length}</i>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
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
              {shown.map((voucher, index) => (
                <GiftCardRow
                  key={voucher.id}
                  voucher={voucher}
                  texture={textureAt(index + 4)}
                  onShow={show}
                />
              ))}
            </div>
          )}

          {/* ── the catalogue ──
              No band, and that is the hierarchy: a band is what a thing you
              *hold* gets. These are stock on a shelf — the point of the grid is
              comparing eight of them by price — and giving them the same plate
              as the cards above would make the page one long run of identical
              objects with nothing to say which are yours. The brand's mark still
              sits in the top-left box, because that is how a shelf is read.

              No reach wiring either: a gift card is *stock at a brand*
              (`gift_card_stock`), not a venue with a listing, so there is no
              venue whose funnel these impressions would belong to. */}
          <div className="section-head left cat-head" data-reveal>
            <h2>{wallet.catalogue}</h2>
            <p>{wallet.catalogueLede}</p>
          </div>

          <div className="gifts">
            {VOUCHER_CARDS.map((card) => {
              const out = card.left === 0;
              const afford = canAfford(player, card.points);

              return (
                <article className="gift" key={card.brand} data-reveal>
                  <div className="gift-top">
                    <span className="pv-logo" aria-hidden>
                      {card.logo}
                    </span>
                    <span className="gift-left">
                      {out
                        ? wallet.soldOut
                        : fill(wallet.left, { left: String(card.left), of: String(card.of) })}
                    </span>
                  </div>
                  <b>{card.brand}</b>
                  {/* Face value comes off the row rather than being recomputed
                      here. It used to be `(card.points / 100) * 4.65`, which
                      made this the third of four opinions about what a card is
                      worth: the wallet a screen above priced the same Zalando
                      card one way, this rate priced it another, and the L-Earn
                      FAQ a page over quoted a third. `VOUCHER_CARDS` owns it. */}
                  <span className="gift-value">{money(card.eur)}</span>
                  <button
                    type="button"
                    className="btn btn-solid gift-buy"
                    disabled={out || !afford}
                    onClick={() =>
                      setPlayer(
                        redeem(
                          player,
                          { brand: card.brand, logo: card.logo, points: card.points, eur: card.eur },
                          `PLZ-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                          '30.09',
                        ),
                      )
                    }
                  >
                    {out
                      ? wallet.soldOut
                      : afford
                        ? `${wallet.redeem} · ${fill(wallet.cost, { n: String(card.points) })}`
                        : wallet.short}
                  </button>
                </article>
              );
            })}
          </div>

          <p className="wal-rule" data-reveal>
            <Icon name="qr" size={15} />
            {wallet.shown}
          </p>
        </div>
      </section>
    </main>
  );
}
