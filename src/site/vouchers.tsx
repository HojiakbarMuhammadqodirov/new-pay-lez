import { useState, type CSSProperties } from 'react';
import {
  VOUCHER_CARDS,
  VOUCHER_RULE_ICONS,
  VOUCHER_STATS,
  VOUCHER_STEP_ICONS,
  VOUCHER_WALLET,
} from './content';
import { Icon } from './icons';
import { useCopy, useMoney, useMoneyParts } from './i18n/context';
import { fill } from './i18n/currency';
import { PATHS } from './router';

/**
 * Vouchers — the fifth page.
 *
 * The wallet screen in the app is where a voucher is actually spent, and it is
 * the one screen a newcomer meets at a counter with a queue behind them. So this
 * page is not a catalogue with a wallet on it; it is the *rules* with a
 * catalogue on it. The QR is generated once and the voucher is spent the moment
 * it exists, which is the single fact that ruins someone's afternoon if they
 * learn it by finding out, and it is stated three times here on purpose: in the
 * wallet mock, in the steps, and in its own section.
 *
 * Every figure that is money goes through `useMoney` — the reader's language
 * picks the currency, so a gift card's face value is quoted in pounds for an
 * English reader and złoty for a Polish one. See `i18n/currency.ts`.
 *
 * The backdrop is `.site__stubs`, CSS only. The globe, the node web and the
 * market tape are the whole canvas budget; see the backdrop note in CLAUDE.md
 * for why the fifth page does not get a fourth one.
 */

/* ───────────────────────────────────────────────────────────── the wallet ── */

/**
 * The wallet, with its two tabs live.
 *
 * The tabs are the one interactive thing on the page, and they are real state
 * rather than a picture of a tab strip: the whole argument of the section is
 * that a spent voucher does not vanish — it moves — and the only way to show
 * "moves" is to let someone move it.
 */
function Wallet() {
  const copy = useCopy();
  const money = useMoney();
  const [tab, setTab] = useState<'active' | 'used'>('active');
  const wallet = copy.vouchers.wallet;
  const spent = tab === 'used';

  return (
    <div className="console wallet">
      <div className="wallet-head">
        <div>
          <b>{wallet.title}</b>
          <span>
            {fill(wallet.counts, {
              active: String(VOUCHER_WALLET.active),
              used: String(VOUCHER_WALLET.used),
            })}
          </span>
        </div>
        <span className="wallet-mark" aria-hidden>
          <Icon name="ticket" size={16} />
        </span>
      </div>

      <div className="wallet-tabs" role="tablist" aria-label={wallet.title}>
        <button
          type="button"
          role="tab"
          aria-selected={!spent}
          data-on={!spent ? 'true' : undefined}
          onClick={() => setTab('active')}
        >
          {wallet.tabs.active} ({VOUCHER_WALLET.active})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={spent}
          data-on={spent ? 'true' : undefined}
          onClick={() => setTab('used')}
        >
          {wallet.tabs.used} ({VOUCHER_WALLET.used})
        </button>
      </div>

      {/* One card, in two states, rather than two lists. A used voucher is the
          same object with its code spent — showing it as a separate item would
          say it was a different thing. */}
      <div className="vcard" data-spent={spent ? 'true' : undefined}>
        <span className="pv-logo" aria-hidden>
          {VOUCHER_WALLET.card.logo}
        </span>

        <div className="vcard-main">
          <b>{VOUCHER_WALLET.card.brand}</b>
          <span>{fill(wallet.card.meta, { amount: money(25) })}</span>
        </div>

        {/* The perforation. It is the one place on the site where a dashed
            border is the correct drawing rather than a lazy one. */}
        <div className="vcard-tear" aria-hidden />

        <div className="vcard-foot">
          {spent ? (
            <>
              <span className="vcard-code">{wallet.card.code}</span>
              <span className="vcard-state">{wallet.tabs.used}</span>
            </>
          ) : (
            <>
              <span className="vcard-cost">{wallet.card.cost}</span>
              <span className="vcard-go">
                <Icon name="qr" size={14} strokeWidth={2.2} />
                {wallet.card.action}
              </span>
            </>
          )}
        </div>

        <span className="vcard-expiry">{wallet.card.expires}</span>
      </div>

      <p className="wallet-note">
        <Icon name="check" size={14} strokeWidth={3} />
        {wallet.note}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── hero ── */

function VouchersHero() {
  const copy = useCopy();
  const moneyParts = useMoneyParts();

  return (
    <section className="hero b2b-hero" id="vouchers-top">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <a className="learn-back" href={PATHS.landing} data-reveal>
            <Icon name="arrow" size={15} strokeWidth={2.2} />
            {copy.vouchers.back}
          </a>

          <span className="eyebrow learn-eyebrow" data-reveal>
            {copy.vouchers.hero.eyebrow}
          </span>

          <h1 data-reveal>
            {copy.vouchers.hero.lines.map((line, i) => (
              <span className="ln" key={line}>
                {i === copy.vouchers.hero.lines.length - 1 ? (
                  <span className="accent-text">{line}</span>
                ) : (
                  line
                )}
              </span>
            ))}
          </h1>

          <p className="hero-lede" data-reveal>
            {copy.vouchers.hero.lede}
          </p>

          <div className="hero-cta" data-reveal>
            <a href={PATHS.learn} className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.vouchers.hero.primary}
            </a>
            <a href="#vouchers-catalogue" className="btn btn-ghost btn-lg">
              {copy.vouchers.hero.secondary}
            </a>
          </div>

          <div className="hero-meta" data-reveal>
            {VOUCHER_STATS.map((stat, i) => {
              // The last stat is a price — zero, but a price — so it carries the
              // reader's currency symbol rather than a hardcoded one.
              const parts = stat.money ? moneyParts(stat.value, 'exact') : null;

              return (
                <div className="hero-stat-row" key={copy.vouchers.hero.stats[i]}>
                  {i > 0 && <span className="hero-stat-div" />}
                  <div className="hero-stat">
                    <b
                      data-count={stat.value}
                      data-prefix={parts?.prefix}
                      data-suffix={parts ? parts.suffix : stat.suffix}
                      data-group={parts?.group}
                    >
                      0
                    </b>
                    <span>{copy.vouchers.hero.stats[i]}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="b2b-trust" data-reveal>
            {copy.vouchers.hero.trust}
          </p>
        </div>

        <div className="hero-visual b2b-visual" data-reveal>
          <Wallet />
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────── steps ── */

/** The loop, on the shared step rail. */
function VouchersSteps() {
  const copy = useCopy();

  return (
    <section className="section" id="vouchers-steps">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.vouchers.steps.eyebrow}</span>
          <h2>{copy.vouchers.steps.title}</h2>
          <p>{copy.vouchers.steps.lede}</p>
        </div>

        <ol className="steps">
          {copy.vouchers.steps.items.map((step, i) => (
            <li className="step" key={step.title} data-reveal>
              <span className="step-ico">
                <Icon name={VOUCHER_STEP_ICONS[i]} size={21} />
              </span>
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── catalogue ── */

/**
 * What is in the wallet this month.
 *
 * Every card shows its allocation, and one of them is nearly gone. A catalogue
 * where everything is always available is a catalogue nobody opens on the first
 * of the month, and the scarcity is a real property of the product rather than a
 * decoration on it.
 */
function VouchersCatalogue() {
  const copy = useCopy();
  const catalogue = copy.vouchers.catalogue;

  return (
    <section className="section" id="vouchers-catalogue">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{catalogue.eyebrow}</span>
          <h2>{catalogue.title}</h2>
          <p>{catalogue.lede}</p>
        </div>

        <div className="gifts">
          {VOUCHER_CARDS.map((card) => (
            <article className="gift" key={card.brand} data-reveal>
              <div className="gift-top">
                <span className="pv-logo" aria-hidden>
                  {card.logo}
                </span>
                {/* The stock bar is the row's own meter: a number alone ("3 of
                    10") is read as text, and the same number as a length is
                    read before it is read. */}
                <span className="gift-stock">
                  {fill(catalogue.left, {
                    left: String(card.left),
                    of: String(card.of),
                  })}
                  <i style={{ '--share': `${(card.left / card.of) * 100}%` } as CSSProperties} />
                </span>
              </div>

              <b className="gift-brand">{card.brand}</b>
              <span className="gift-where">{catalogue.everywhere}</span>

              <span className="gift-cost">
                <b>{card.points}</b> {catalogue.cost}
              </span>
            </article>
          ))}
        </div>

        <div className="dash-cta" data-reveal>
          <a href={PATHS.learn} className="btn btn-ghost btn-lg">
            {catalogue.action}
            <Icon name="arrow" size={16} strokeWidth={2.2} />
          </a>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────── rules ── */

/**
 * The three facts that cost someone a voucher if they meet them at the counter.
 *
 * On the page rather than in a terms document, because a rule a customer only
 * discovers by breaking it is a rule the product is hiding.
 */
function VouchersRules() {
  const copy = useCopy();

  return (
    <section className="section" id="vouchers-rules">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.vouchers.rules.eyebrow}</span>
          <h2>{copy.vouchers.rules.title}</h2>
        </div>

        <div className="games b2b-why-grid rules-grid">
          {copy.vouchers.rules.items.map((item, i) => (
            <article className="game" key={item.title} data-reveal>
              <span className="game-ico">
                <Icon name={VOUCHER_RULE_ICONS[i]} size={24} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── faq ── */

/** The shared accordion from L-Earn — same markup, same collapse behaviour. */
function VouchersFaq() {
  const copy = useCopy();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="section" id="vouchers-faq">
      <div className="wrap wrap-narrow">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.vouchers.faq.eyebrow}</span>
          <h2>{copy.vouchers.faq.title}</h2>
        </div>

        <div className="faq">
          {copy.vouchers.faq.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                className="faq-item"
                key={item.q}
                data-open={isOpen ? 'true' : undefined}
                data-reveal
              >
                <h3>
                  <button
                    type="button"
                    className="faq-q"
                    aria-expanded={isOpen}
                    aria-controls={`vfaq-panel-${i}`}
                    id={`vfaq-q-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {item.q}
                    <Icon name="chevron" size={17} strokeWidth={2.2} />
                  </button>
                </h3>

                <div
                  className="faq-panel"
                  id={`vfaq-panel-${i}`}
                  role="region"
                  aria-labelledby={`vfaq-q-${i}`}
                >
                  <div>
                    <p>{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── cta ── */

function VouchersCta() {
  const copy = useCopy();

  return (
    <section className="section" id="vouchers-cta">
      <div className="wrap">
        <div className="cta-banner" data-reveal>
          <h2>{copy.vouchers.cta.title}</h2>
          <p>{copy.vouchers.cta.lede}</p>
          <div className="cta-actions">
            <a href={PATHS.learn} className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.vouchers.cta.primary}
            </a>
            {/* "See the games" is the catalogue, not the top of L-Earn — both
                buttons pointed at the same place. Works from here now that a
                section anchor carries its own page (see `router.ts`). */}
            <a href="#learn-games" className="btn btn-ghost btn-lg">
              {copy.vouchers.cta.secondary}
            </a>
          </div>
          <p className="cta-note">{copy.vouchers.cta.note}</p>
        </div>
      </div>
    </section>
  );
}

/** The page, in order. */
export function VouchersPage() {
  return (
    <main>
      <VouchersHero />
      <VouchersSteps />
      <VouchersCatalogue />
      <VouchersRules />
      <VouchersFaq />
      <VouchersCta />
    </main>
  );
}
