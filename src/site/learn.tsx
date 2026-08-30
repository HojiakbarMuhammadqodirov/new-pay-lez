import { useState } from 'react';
import {
  GAMES,
  LEARN_BOARD,
  LEARN_STATS,
  LEARN_STEP_ICONS,
  LEARN_VOUCHER_EUR,
  STREAK,
} from './content';
import { MAX_FREEZES } from './auth/player';
import { gameName, rulesFor } from './games/rules';
import { Controller3D } from './controller/Controller3D';
import { Icon } from './icons';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { PATHS } from './router';
import { usePalette } from './theme/context';

/**
 * L-Earn — the second page.
 *
 * Same surface as the landing page and largely the same parts: `.section`,
 * `.section-head`, `.btn`, `.benefits` and `.cta-banner` are all shared, so this
 * file only introduces markup for the four things the landing page has no
 * equivalent of — the step rail, the game cards, the streak card and the board.
 *
 * The backdrop is where the two pages part company. The landing page has the
 * globe; this one has the platformer (`level/LevelRun`) behind everything — a
 * runner breaking blocks, taking a power-up out of a lucky box, growing, and
 * leaving down a pipe — and the controller in the hero's right-hand column.
 * Cross-border payments are what the globe is *about*, and none of that is what
 * this page sells; play, get bigger, cash out is.
 */

/* ─────────────────────────────────────────────────────────────── hero ── */

function LearnHero() {
  const copy = useCopy();
  const palette = usePalette();

  return (
    <section className="hero learn-hero" id="learn-top">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <a className="learn-back" href={PATHS.landing} data-reveal>
            <Icon name="arrow" size={15} strokeWidth={2.2} />
            {copy.learn.back}
          </a>

          <span className="eyebrow learn-eyebrow" data-reveal>
            {copy.learn.hero.eyebrow}
          </span>

          <h1 data-reveal>
            {copy.learn.hero.lines.map((line, i) => (
              <span className="ln" key={line}>
                {i === 1 ? <span className="accent-text">{line}</span> : line}
              </span>
            ))}
          </h1>

          <p className="hero-lede" data-reveal>
            {copy.learn.hero.lede}
          </p>

          <div className="hero-cta" data-reveal>
            {/* Both used to point at the catalogue; only the second one says
                "See the games". */}
            <a href={PATHS.signin} className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.learn.hero.primary}
            </a>
            <a href="#learn-games" className="btn btn-ghost btn-lg">
              {copy.learn.hero.secondary}
            </a>
          </div>

          <div className="hero-meta" data-reveal>
            {LEARN_STATS.map((stat, i) => (
              <div className="hero-stat-row" key={copy.learn.hero.stats[i]}>
                {i > 0 && <span className="hero-stat-div" />}
                <div className="hero-stat">
                  <b data-count={stat.value} data-suffix={stat.suffix}>
                    0
                  </b>
                  <span>{copy.learn.hero.stats[i]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/*
          The controller stands in for the globe here. It is in the flow rather
          than in the fixed layer behind the page: it belongs to the hero, and
          the fixed layer is the platformer, which belongs to the whole page.
        */}
        <div className="hero-visual learn-visual" aria-hidden>
          <Controller3D
            className="controller-3d--hero"
            primaryColor={palette.primary}
            tone={palette.tone}
            facing="left"
            // It has a hero column to itself here rather than a slot between
            // two lists, so it fills it.
            fitMargin={1.01}
          />
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── steps ── */

/**
 * How it works.
 *
 * Four steps on one rail rather than four boxed cards: the sequence *is* the
 * information here, and a hairline running through the icons carries it better
 * than borders that fence each step off from the next.
 */
function LearnSteps() {
  const copy = useCopy();

  return (
    <section className="section" id="learn-steps">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.learn.steps.eyebrow}</span>
          <h2>{copy.learn.steps.title}</h2>
          <p>{copy.learn.steps.lede}</p>
        </div>

        <ol className="steps">
          {copy.learn.steps.items.map((step, i) => (
            <li className="step" key={step.title} data-reveal>
              <span className="step-ico">
                <Icon name={LEARN_STEP_ICONS[i]} size={21} />
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

/* ────────────────────────────────────────────────────────────── games ── */

/**
 * The catalogue, read off `GAMES` rather than described again here.
 *
 * This section used to carry its own three cards with their own names and
 * blurbs in five dictionaries, and it was already wrong: the arcade round
 * shipped and the page still said three. It now maps the same table the games
 * screen maps, with the same names and the same per-kind rule lines, so adding
 * a game to `content.ts` adds it here and the marketing page cannot claim a
 * catalogue the product does not have.
 */
function LearnGames() {
  const copy = useCopy();
  const games = copy.games;

  return (
    <section className="section" id="learn-games">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.learn.games.eyebrow}</span>
          <h2>{copy.learn.games.title}</h2>
          <p>{copy.learn.games.lede}</p>
        </div>

        <div className="games">
          {GAMES.map((entry, i) => (
            <article className="game" key={entry.id} data-reveal>
              <span className="game-ico">
                <Icon name={entry.icon} size={24} />
              </span>
              {/* Polish, and hardcoded — this page is read by people who are not
                  signed in, so there is no profile to take the local Word
                  Builder's language off, and Polish is the market this site is a
                  guide to. The signed-in grid reads the real one. */}
              <h3>{gameName(i, games, 'pl')}</h3>
              {/* The same two sentences the signed-in Play grid prints, from the
                  same function. This section already maps `GAMES` so the pitch
                  cannot claim a game the product does not have; the rule lines
                  were the half still written out by hand here, which is how a
                  page starts describing the same seven games two ways. */}
              <p>{rulesFor(entry, games)[0]}</p>
              <span className="game-meta">{rulesFor(entry, games)[1]}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────── streak ── */

/**
 * Streaks.
 *
 * The pips are the whole explanation: seven of them, five filled, and the rule
 * reads off the picture before anyone gets to the copy beside it.
 */
function LearnStreak() {
  const copy = useCopy();
  const days = Array.from({ length: STREAK.length }, (_, i) => i < STREAK.lit);

  return (
    <section className="section" id="learn-streak">
      <div className="wrap split">
        <div className="split-visual" data-reveal>
          <div className="streak-card">
            <div className="streak-head">
              <span>{copy.learn.streak.card.label}</span>
              <b>
                <span data-count={STREAK.lit}>0</span>
                <i>{copy.learn.streak.card.unit}</i>
              </b>
            </div>

            <div
              className="streak-pips"
              role="img"
              aria-label={`${STREAK.lit} / ${STREAK.length}`}
            >
              {days.map((lit, i) => (
                <span className="pip" key={i} data-on={lit ? 'true' : undefined}>
                  {lit && <Icon name="check" size={13} strokeWidth={3.2} />}
                </span>
              ))}
            </div>

            {/*
              Freezes, on the card that explains the streak.
              A rule that only shows up on the day it saves you is a rule
              nobody plans around — the whole value of a freeze is knowing you
              have one, so it is drawn beside the pips it protects.
            */}
            <div className="streak-freeze">
              <span className="streak-freeze-pips" aria-hidden>
                {Array.from({ length: MAX_FREEZES }, (_, i) => (
                  <i key={i}>
                    <Icon name="freeze" size={13} strokeWidth={2.2} />
                  </i>
                ))}
              </span>
              <span>{copy.learn.streak.card.freeze}</span>
            </div>

            <p className="streak-reward">
              <Icon name="trophy" size={15} />
              {copy.learn.streak.card.reward}
            </p>
          </div>
        </div>

        <div className="split-copy">
          <div className="section-head left" data-reveal>
            <span className="eyebrow">{copy.learn.streak.eyebrow}</span>
            <h2>{copy.learn.streak.title}</h2>
            <p>{copy.learn.streak.lede}</p>
          </div>

          <ul className="benefits">
            {copy.learn.streak.benefits.map((benefit) => (
              <li className="benefit" key={benefit.title} data-reveal>
                <span className="benefit-check">
                  <Icon name="check" size={16} strokeWidth={3} />
                </span>
                <div>
                  <h4>{benefit.title}</h4>
                  <p>{benefit.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── board ── */

function LearnBoard() {
  const copy = useCopy();

  return (
    <section className="section" id="learn-board">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.learn.board.eyebrow}</span>
          <h2>{copy.learn.board.title}</h2>
          <p>{copy.learn.board.lede}</p>
        </div>

        <div className="board" data-reveal>
          <table>
            <thead>
              <tr>
                <th scope="col">{copy.learn.board.columns.rank}</th>
                <th scope="col">{copy.learn.board.columns.player}</th>
                <th scope="col">{copy.learn.board.columns.points}</th>
              </tr>
            </thead>
            <tbody>
              {LEARN_BOARD.map((row, i) => (
                <tr key={row.name} data-top={i < 3 ? 'true' : undefined}>
                  <td className="board-rank">{i + 1}</td>
                  <td className="board-player">
                    <span className="tavatar" aria-hidden>
                      {row.name.charAt(0)}
                    </span>
                    {row.name}
                  </td>
                  <td className="board-points" data-count={row.points}>
                    0
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="board-note" data-reveal>
          {copy.learn.board.note}
        </p>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── faq ── */

/**
 * FAQ.
 *
 * The panel animates on `grid-template-rows: 0fr → 1fr` rather than a measured
 * pixel height: the answers are translated into five languages and change
 * length with each, so anything that needs a number up front would be wrong in
 * four of them.
 */
function LearnFaq() {
  const copy = useCopy();
  const money = useMoney();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="section" id="learn-faq">
      <div className="wrap wrap-narrow">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.learn.faq.eyebrow}</span>
          <h2>{copy.learn.faq.title}</h2>
        </div>

        <div className="faq">
          {copy.learn.faq.items.map((item, i) => {
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
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-q-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    {item.q}
                    <Icon name="chevron" size={17} strokeWidth={2.2} />
                  </button>
                </h3>

                {/* No `hidden`: it forces `display: none`, and a collapsed
                    grid row cannot animate from `display: none`. The panel is
                    taken out of the tab order and the a11y tree with
                    `visibility` instead, held until the collapse finishes. */}
                <div
                  className="faq-panel"
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                >
                  <div>
                    {/* One answer quotes a voucher value; it is priced in the reader's
                        currency like every other figure on the site. */}
                    <p>{fill(item.a, { amount: money(LEARN_VOUCHER_EUR) })}</p>
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

/* ─────────────────────────────────────────────────────────────── cta ── */

function LearnCta() {
  const copy = useCopy();

  return (
    <section className="section" id="learn-cta">
      <div className="wrap">
        <div className="cta-banner" data-reveal>
          <h2>{copy.learn.cta.title}</h2>
          <p>{copy.learn.cta.lede}</p>
          <div className="cta-actions">
            {/* "Start playing" starts playing. This page is only ever shown to
                somebody who is not signed in as a player — `useIsPlayer` swaps
                it for the games themselves — so the way to start is sign-in,
                not a scroll back up to the catalogue. */}
            <a href={PATHS.signin} className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.learn.cta.primary}
            </a>
            <a href={PATHS.landing} className="btn btn-ghost btn-lg">
              {copy.learn.cta.secondary}
            </a>
          </div>
          <p className="cta-note">{copy.learn.cta.note}</p>
        </div>
      </div>
    </section>
  );
}

/** The page, in order. */
export function LearnPage() {
  return (
    <main>
      <LearnHero />
      <LearnSteps />
      <LearnGames />
      <LearnStreak />
      <LearnBoard />
      <LearnFaq />
      <LearnCta />
    </main>
  );
}
