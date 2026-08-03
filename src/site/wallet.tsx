import { useState } from 'react';
import { VOUCHER_CARDS } from './content';
import { Icon } from './icons';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import {
  activeVouchers,
  canAfford,
  CHEAPEST_VOUCHER,
  markUsed,
  redeem,
  usedVouchers,
  type OwnedVoucher,
} from './auth/player';
import { PATHS } from './router';

/**
 * The wallet, for someone who is signed in.
 *
 * The marketing version of this page spends most of its length explaining what
 * a voucher is, how one is generated and why the code is single-use. None of
 * that survives here: a signed-in player has a balance, four vouchers and a
 * catalogue, and the explanation has been replaced by the thing it was
 * explaining. The one rule that still has to be *said* is said at the moment it
 * bites — pressing "Show QR code" spends the voucher, and the card says so
 * afterwards rather than in a paragraph three screens up.
 */

/* ─────────────────────────────────────────────────────────────────── card ── */

function VoucherCard({
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

  const show = (id: string) => {
    /* `DD.MM` to match the expiry format already on the card, rather than a
       locale string that would disagree with it in four languages. */
    const now = new Date();
    const stamp = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
    setPlayer(markUsed(player, id, stamp));
  };

  return (
    <main>
      <section className="section wal" id="wallet-top">
        <div className="wrap wrap-narrow">
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

          {/* ── the wallet ── */}
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
                <VoucherCard key={voucher.id} voucher={voucher} onShow={show} />
              ))}
            </div>
          )}

          {/* ── the catalogue ── */}
          <div className="section-head left cat-head" data-reveal>
            <h2>{wallet.catalogue}</h2>
            <p>{wallet.catalogueLede}</p>
          </div>

          <div className="gifts">
            {VOUCHER_CARDS.map((card) => {
              const out = card.left === 0;
              const afford = canAfford(player, card.points);
              /* Face value follows the point cost at the site's own rate — 500
                 points is the €11.63 gift card the L-Earn FAQ quotes, and the
                 rest scale from it rather than being invented per row. */
              const eur = (card.points / 100) * 4.65;

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
                  <span className="gift-value">{money(eur)}</span>
                  <button
                    type="button"
                    className="btn btn-solid gift-buy"
                    disabled={out || !afford}
                    onClick={() =>
                      setPlayer(
                        redeem(
                          player,
                          { brand: card.brand, logo: card.logo, points: card.points, eur },
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
