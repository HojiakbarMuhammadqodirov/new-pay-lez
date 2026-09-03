import { useState } from 'react';
import { VOUCHER_RULE_ICONS, VOUCHER_STEP_ICONS } from './content';
import { Icon } from './icons';
import { useCopy, useLanguage, useMoneyParts } from './i18n/context';
import { CURRENCIES, fill } from './i18n/currency';
import { initialOf } from './adminMetrics';
import { useApi } from './api/useApi';
import { cheapestCost, faceValue, GIFT_CARDS_PATH, type GiftCardStock } from './api/wallet';
import { PATHS } from './router';
import { useCountUp } from './useReveal';

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
 * The backdrop is `StubDrift` — the tickets themselves, notched and tear-lined,
 * sinking slowly down the page. It replaced a static CSS perforation; see the
 * backdrop note in CLAUDE.md.
 */

/* ───────────────────────────────────────────────────────────── the wallet ── */

/**
 * The wallet, with its two tabs live.
 *
 * The tabs are the one interactive thing on the page, and they are real state
 * rather than a picture of a tab strip: the whole argument of the section is
 * that a spent voucher does not vanish — it moves — and the only way to show
 * "moves" is to let someone move it.
 *
 * **It is an illustration, and everything on it is copy.** It used to carry
 * "3 active · 11 used" and a face value read off the catalogue in `content.ts`,
 * which made it a claim about stock: a wallet somebody had, holding a card the
 * shelf sold. It holds neither now. The counts are gone — the picture makes its
 * point without them — and the brand, the price and the code are the
 * dictionary's, in the reader's own language, the way every other caption on a
 * marketing page is. The **real** catalogue is `VouchersCatalogue` below, and it
 * asks the server.
 */
function Wallet() {
  const copy = useCopy();
  const [tab, setTab] = useState<'active' | 'used'>('active');
  const wallet = copy.vouchers.wallet;
  const spent = tab === 'used';

  return (
    <div className="console wallet">
      <div className="wallet-head">
        <div>
          <b>{wallet.title}</b>
          <span>{wallet.example}</span>
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
          {wallet.tabs.active}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={spent}
          data-on={spent ? 'true' : undefined}
          onClick={() => setTab('used')}
        >
          {wallet.tabs.used}
        </button>
      </div>

      {/* One card, in two states, rather than two lists. A used voucher is the
          same object with its code spent — showing it as a separate item would
          say it was a different thing. */}
      <div className="vcard" data-spent={spent ? 'true' : undefined}>
        <span className="pv-logo" aria-hidden>
          {initialOf(wallet.card.brand)}
        </span>

        <div className="vcard-main">
          <b>{wallet.card.brand}</b>
          <span>{wallet.card.meta}</span>
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

/**
 * The three figures under the hero, and two of them are counted off the shelf.
 *
 * They used to be `VOUCHER_STATS` — "8 partner brands", "from 100 points" — two
 * claims about a catalogue written in `content.ts`. Both are now `null` until
 * `GET /v1/gift-cards` answers, and `null` draws an em dash rather than a zero
 * counting up: "we have not been told" and "there are none" are different, and
 * a hero stat is exactly where somebody would believe the wrong one.
 *
 * The third has no shelf behind it and never had: **redeeming costs no money**
 * is a property of the product, so it is a real zero and keeps its currency
 * symbol.
 */
function VouchersHero({ shelf }: { shelf: GiftCardStock[] | null }) {
  const copy = useCopy();
  const moneyParts = useMoneyParts();

  const stats: Array<{ value: number | null; suffix: string; money?: true }> = [
    { value: shelf ? shelf.length : null, suffix: '' },
    { value: shelf ? cheapestCost(shelf) : null, suffix: ' pts' },
    { value: 0, suffix: '', money: true },
  ];

  return (
    <section className="hero business-hero" id="vouchers-top">
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
            {stats.map((stat, i) => {
              // The last stat is a price — zero, but a price — so it carries the
              // reader's currency symbol rather than a hardcoded one.
              const parts = stat.money && stat.value !== null ? moneyParts(stat.value, 'exact') : null;

              return (
                <div className="hero-stat-row" key={copy.vouchers.hero.stats[i]}>
                  {i > 0 && <span className="hero-stat-div" />}
                  <div className="hero-stat">
                    {/* The count-up target is the *converted* figure, because
                        the affixes beside it are already the reader's. Counting
                        `stat.value` up while wearing a pound sign would put the
                        euro amount under a £ — masked here only because this
                        one happens to be zero. `DashTiles` in `business.tsx` is the
                        same line. */}
                    {stat.value === null ? (
                      <b>—</b>
                    ) : (
                      <b
                        data-count={parts ? parts.value : stat.value}
                        data-prefix={parts?.prefix}
                        data-suffix={parts ? parts.suffix : stat.suffix}
                        data-group={parts?.group}
                      >
                        0
                      </b>
                    )}
                    <span>{copy.vouchers.hero.stats[i]}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="business-trust" data-reveal>
            {copy.vouchers.hero.trust}
          </p>
        </div>

        <div className="hero-visual business-visual" data-reveal>
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
 * **The real shelf, on a marketing page.** It was eight brands in `content.ts`,
 * each with a points price, a face value and a "3 of 10 left" allocation, and
 * every one of those numbers was written by hand. `GET /v1/gift-cards` is
 * public — a visitor deciding whether to sign up should be able to look in the
 * shop window before earning anything — so this reads the same rows the
 * signed-in wallet buys from, and the two cannot disagree about a price.
 *
 * The stock **bar** did not survive with it: the old rows carried `left` *and*
 * `of`, so a share could be drawn; `gift_card_stock` carries only `stock`, and
 * a bar needs a denominator that would have to be invented. The count is
 * printed instead.
 *
 * Two states rather than one. An empty shelf is the ordinary state of a new
 * market and says so; a request that did not come back says *that*, because a
 * catalogue that renders "nothing available" when the server is down has told a
 * visitor the product is empty.
 */
/* Nothing on `#/vouchers` reports an impression, and the reason is the same for
   every card on it: this page has no venue and no deal to report *about*. The
   wallet above is an illustration, and the catalogue below is gift-card stock
   at a brand — neither has a venue whose funnel an impression would belong to.
   See `api/reach.ts`. */
function VouchersCatalogue({
  shelf,
  down,
  onRetry,
}: {
  shelf: GiftCardStock[] | null;
  down: boolean;
  onRetry: () => void;
}) {
  const copy = useCopy();
  const [language] = useLanguage();
  const catalogue = copy.vouchers.catalogue;

  return (
    <section className="section" id="vouchers-catalogue">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{catalogue.eyebrow}</span>
          <h2>{catalogue.title}</h2>
          <p>{catalogue.lede}</p>
        </div>

        {down ? (
          <div className="console wal-empty" data-reveal>
            <p>{catalogue.down}</p>
            <button type="button" className="btn btn-ghost" onClick={onRetry}>
              {catalogue.retry}
            </button>
          </div>
        ) : shelf === null ? (
          <p className="adm-empty">{catalogue.loading}</p>
        ) : shelf.length === 0 ? (
          <div className="console wal-empty" data-reveal>
            <p>{catalogue.none}</p>
          </div>
        ) : (
          <div className="gifts">
            {shelf.map((card) => (
              <article className="gift" key={card.id} data-reveal>
                <div className="gift-top">
                  <span className="pv-logo" aria-hidden>
                    {card.logo || initialOf(card.brand)}
                  </span>
                  <span className="gift-left">
                    {card.stock <= 0
                      ? catalogue.soldOut
                      : fill(catalogue.left, { n: String(card.stock) })}
                  </span>
                </div>

                <b className="gift-brand">{card.brand}</b>
                {/* The face value in the card's own currency, not the reader's:
                    it is a thing on a shelf. See `faceValue` in `api/wallet.ts`;
                    it is the one money rule on this site that runs the other
                    way. */}
                <span className="gift-where">
                  {faceValue(card, CURRENCIES[language].group)} · {catalogue.everywhere}
                </span>

                <span className="gift-cost">
                  <b>{card.points_cost}</b> {catalogue.cost}
                </span>
              </article>
            ))}
          </div>
        )}

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

        <div className="games business-why-grid rules-grid">
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

/**
 * The page, in order.
 *
 * The shelf is fetched **once, here**, and handed to the two sections that need
 * it: the hero counts it and the catalogue lists it. Two `useApi` calls for one
 * endpoint would be two requests that can land at different times and disagree
 * on the same screen — the hero saying eight brands over a grid showing none.
 */
export function VouchersPage() {
  const shelf = useApi<GiftCardStock[]>(GIFT_CARDS_PATH);
  const rows = shelf.state.status === 'ready' ? shelf.state.data : null;

  /*
   * A second count-up scan, keyed on the answer landing.
   *
   * `Site` scans once per route, and that scan happens before this request
   * comes back. `useCountUp` writes digits into `textContent` imperatively and
   * only when its key changes, so the two shelf-derived hero stats would render
   * with a `data-count` nobody ever read and sit on the literal `0` inside the
   * tag — a measured-looking zero over a shelf that has cards on it. The key
   * changes exactly once, when the shelf resolves.
   */
  useCountUp(`shelf:${shelf.state.status}:${rows?.length ?? 0}`);

  return (
    <main>
      <VouchersHero shelf={rows} />
      <VouchersSteps />
      <VouchersCatalogue
        shelf={rows}
        down={shelf.state.status === 'error'}
        onRetry={shelf.reload}
      />
      <VouchersRules />
      <VouchersFaq />
      <VouchersCta />
    </main>
  );
}
