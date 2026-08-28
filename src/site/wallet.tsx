import { useState } from 'react';
import { VOUCHER_CARDS, WALLET_DEALS } from './content';
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
  isCardFull,
  markUsed,
  redeem,
  stampsLeft,
  stampsOf,
  stampVisit,
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
 *
 * ── the layout is the one thing that is not the app's ────────────────────
 *
 * The phone puts all of it in a single scroll and explicitly refuses a
 * segmented control — "a tab would hide two thirds of what somebody opened the
 * wallet to check". That argument is about *hiding*, not about scrolling, and
 * it survives the move to a wide screen intact: nothing here is behind a tab
 * that is not already visible somewhere else on the page. What changes is that
 * a desktop can put the deals and the stamp cards side by side instead of a
 * screen apart, so the two are one glance rather than two.
 */

/* ────────────────────────────────────────────────────────────── gift card ── */

function GiftCardRow({
  voucher,
  onShow,
}: {
  voucher: OwnedVoucher;
  onShow: (id: string) => void;
}) {
  const copy = useCopy().wallet;
  const money = useMoney();
  const spent = voucher.usedOn !== null;

  return (
    <article className="wcard" data-spent={spent ? 'true' : undefined} data-reveal>
      <span className="pv-logo" aria-hidden>
        {voucher.logo}
      </span>

      <div className="wcard-tx">
        <b>{voucher.brand}</b>
        <span>{money(voucher.eur)}</span>
        <span className="wcard-when">
          {spent
            ? fill(copy.usedOn, { date: voucher.usedOn! })
            : fill(copy.valid, { date: voucher.expires })}
        </span>
      </div>

      <div className="wcard-act">
        <span className="wcard-cost">{fill(copy.cost, { n: String(voucher.points) })}</span>
        {spent ? (
          /* The code stays visible once spent — it is the receipt, and the till
             may still want to see it. */
          <span className="wcard-code">{voucher.code}</span>
        ) : (
          <button type="button" className="btn btn-solid wcard-show" onClick={() => onShow(voucher.id)}>
            {copy.show}
          </button>
        )}
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
 */
/* No reach wiring here on purpose: `card.id` is a *stamp card*, not the venue
   it belongs to, and nothing on this row carries a venue id to report against.
   Inventing one would put another venue's impressions in somebody's funnel. */
function StampRow({ card, onVisit }: { card: StampCard; onVisit: (id: string) => void }) {
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
      <div className="wal-stamp-head">
        <span className="pv-logo" aria-hidden>
          {card.logo}
        </span>
        <div>
          <b>{card.venue}</b>
          <span>{fill(copy.stamps.progress, { done: String(card.stamps), of: String(card.required) })}</span>
        </div>
        {/* Only on a card that has been round at least once. On a first card it
            would be "filled 0× before", which is a sentence about nothing. */}
        {card.cycles > 0 && (
          <span className="wal-cycles">{fill(copy.stamps.cycles, { n: String(card.cycles) })}</span>
        )}
      </div>

      {/*
        The slots. `aria-hidden` with the count in the heading above doing the
        work for a screen reader: a row of discs is a picture of a number that
        is already written out two lines up, and reading it out as a list of
        eight items is worse than not reading it at all.
      */}
      <div className="wal-slots" aria-hidden>
        {Array.from({ length: card.required }, (_, i) => (
          <span key={i} data-on={i < card.stamps ? 'true' : undefined} />
        ))}
      </div>

      <p className="wal-stamp-words">{words}</p>

      {/*
        A visit is added by scanning at the counter, which this page cannot do.
        The button is here because the rule it demonstrates — a full card rolls
        over into the next one rather than overflowing — is invisible without a
        way to reach it, and it is the one thing about a stamp card somebody is
        likely to get wrong.
      */}
      <button type="button" className="btn btn-ghost wal-visit" onClick={() => onVisit(card.id)}>
        <Icon name="qr" size={15} />
        {copy.stamps.visit}
      </button>
    </article>
  );
}

/* ──────────────────────────────────────────────────────────────── hot deal ── */

function DealCard({
  deal,
  held,
  onClaim,
  afford,
}: {
  deal: { id: string; venue: string; logo: string; badge: string; points: number; expires: string };
  held: ClaimedDeal | undefined;
  onClaim: () => void;
  afford: boolean;
}) {
  const copy = useCopy().wallet;
  /* Seen and opened, reported to the venue that is paying for this offer —
     `api/reach.ts`. `deal.id` is the site's own seed id today (`WALLET_DEALS`),
     which the collector drops rather than posting; the wiring is here so the
     surface is already right when these cards come from `GET /v1/deals`. */
  const seen = useImpressionRef('deal', deal.id, 'wallet');

  return (
    <article
      ref={seen}
      className="wal-deal"
      data-held={held ? 'true' : undefined}
      data-reveal
    >
      <div className="wal-deal-top">
        <span className="pv-logo" aria-hidden>
          {deal.logo}
        </span>
        <span className="wal-badge">{deal.badge}</span>
      </div>
      <b>{deal.venue}</b>
      <span className="wal-deal-when">{fill(copy.deals.until, { date: deal.expires })}</span>

      {held ? (
        <>
          <span className="wcard-code">{held.code}</span>
          <span className="wal-deal-claimed">
            {fill(copy.deals.claimed, { date: held.claimedOn })}
          </span>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-solid wal-deal-claim"
          disabled={!afford}
          /* An open, not a claim: a claim is written by the gate from a
             confirmed scan and is deliberately not postable by a client. */
          onClick={() => {
            dealOpen(deal.id, 'wallet');
            onClaim();
          }}
        >
          {deal.points === 0
            ? copy.deals.claim
            : afford
              ? `${copy.deals.claim} · ${fill(copy.cost, { n: String(deal.points) })}`
              : copy.deals.short}
        </button>
      )}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────── the page ── */

export function WalletApp() {
  const copy = useCopy();
  const wallet = copy.wallet;
  const money = useMoney();
  const { account, setPlayer } = useAuth();
  const [tab, setTab] = useState(0);
  const player = account?.player;

  if (!player) return null;

  const active = activeVouchers(player);
  const used = usedVouchers(player);
  const shown = tab === 0 ? active : used;
  const short = Math.max(0, CHEAPEST_VOUCHER - player.points);
  const cards = stampsOf(player);
  const claimed = dealsOf(player);

  /* `DD.MM` to match the expiry format already on every card, rather than a
     locale string that would disagree with it in four languages. */
  const stamp = () => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

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

          {/*
            Deals and stamp cards, side by side.

            This is the whole of the desktop layout, and it is the only place
            the page departs from the app's single column: the two are the
            holdings a player checks *before going out*, and a wide screen can
            answer "what have I got, and where am I nearly there" in one look
            instead of two scrolls. The gift cards below stay full width because
            they are a shelf as well as a holding, and a shelf wants the room.
          */}
          <div className="wal-split">
            <section className="wal-col" id="wallet-deals">
              <div className="section-head left" data-reveal>
                <h2>{wallet.deals.title}</h2>
                <p>{wallet.deals.lede}</p>
              </div>

              <div className="wal-deals">
                {WALLET_DEALS.map((deal) => {
                  const held = claimed.find((row) => row.id === deal.id);
                  return (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      held={held}
                      afford={canAfford(player, deal.points)}
                      onClaim={() =>
                        setPlayer(
                          claimDeal(
                            player,
                            deal,
                            `PLZ-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                            stamp(),
                          ),
                        )
                      }
                    />
                  );
                })}
              </div>
            </section>

            <section className="wal-col" id="wallet-stamps">
              <div className="section-head left" data-reveal>
                <h2>{wallet.stamps.title}</h2>
                <p>{wallet.stamps.lede}</p>
              </div>

              {cards.length === 0 ? (
                <div className="console wal-empty" data-reveal>
                  <p>{wallet.stamps.none}</p>
                </div>
              ) : (
                <div className="wal-stamps">
                  {cards.map((card) => (
                    <StampRow
                      key={card.id}
                      card={card}
                      onVisit={(id) => setPlayer(stampVisit(player, id))}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ── gift cards: what you hold, then what you can get ── */}
          <div className="section-head left cat-head" id="wallet-gifts" data-reveal>
            <h2>{wallet.giftsTitle}</h2>
            <p>{wallet.giftsLede}</p>
          </div>

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
              {shown.map((voucher) => (
                <GiftCardRow key={voucher.id} voucher={voucher} onShow={show} />
              ))}
            </div>
          )}

          {/* ── the catalogue ──
              No reach wiring: a gift card is *stock at a brand* (`gift_card_stock`),
              not a venue with a listing, so there is no venue whose funnel these
              impressions would belong to. */}
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
