import { useCallback, useEffect, useState } from 'react';
import { Icon } from './icons';
import { useAuth } from './auth/context';
import { PATHS } from './router';
import { matchCities, savePlace, useCities, type City } from './api/profile';
import { hasToken } from './api/client';
import { finishRound, sendMove, startRound } from './api/consumer';
import { GAMES } from './content';
import { WELCOME_POINTS } from './auth/users';
import { LANGUAGES, LANGUAGE_ORDER, useCopy, useLanguage, type LanguageCode } from './i18n/context';
import { fill } from './i18n/currency';
import { flagGlyph } from './games/banks';
import { buildFlagRound, type Question } from './games/rounds';
import { gameName, rulesFor } from './games/rules';
import { useSpotlight } from './pointer';
/* Chromium on Windows ships no glyphs for regional-indicator pairs, so a flag
   renders as the two letters it is built from unless this family is loaded —
   which would make "which country is this?" answer itself. Imported the way
   `games.tsx` and `relocate.tsx` import it, rather than declared again. */
import '../components/GlobeHero/ui/flagFont.css';

/**
 * `#/welcome` — the first minute, and the web half of the app's first run.
 *
 * The mobile flow (`lib/screens/first_run_screens.dart`, `lib/state/first_run.dart`)
 * is five screens: language, city, why this exists, one flag game, the points it
 * paid. Its ordering is the opposite of the usual one and it is deliberate —
 * **nothing is gated behind signing up**, so by the time the sign-up sheet
 * appears the person is holding points they earned and the sheet's job is to
 * stop them losing those rather than to admit them to the product.
 *
 * This is the same *shape* and not the same screens, because the web arrives at
 * it from the other side. Two differences, both forced:
 *
 * - **The account already exists.** The site's sign-up form creates it before
 *   anything else happens, so there is no provisional identity to mint and
 *   nothing to merge: the round's points are banked onto a player state that is
 *   already there. What survives is the rule that the welcome gift is paid for
 *   *finishing this*, not for opening an account — see `WELCOME_POINTS`.
 * - **There is no city step.** On the phone that question comes before any
 *   account exists, so it is asked from a shortcut list and resolved later. Here
 *   the profile form asks it from the served list (`GET /v1/cities`), and asking
 *   twice with two different lists is how the two answers start to disagree.
 *
 * So: language, three rounds of flags, the payoff. Three steps, the way the
 * phone counts them.
 *
 * **The questions are the real bank.** `buildFlagRound` draws through
 * `games/bag.ts` out of the same 196-row flag bank L-Earn plays, which means
 * two things at once: the flags are translated into whichever language was just
 * chosen, and the three asked here are three the player will not be asked again
 * until the bank is exhausted. Inventing five hard-coded flags — which is what
 * the phone does, because it has no bank — would have been a second source of
 * questions to keep in step.
 *
 * The flow is in-memory and a refresh restarts it. That is the honest answer
 * rather than a gap: the points are not banked until the last screen, so a
 * half-finished run has nothing in it worth persisting, and the alternative is
 * a fourth storage key holding a game state that exists for ninety seconds.
 */

/**
 * Five flags at ten points each: fifty for the round.
 *
 * Flat rather than escalating, because every question is drawn from the same
 * short list of well-known flags -- there is no last-one-is-harder to pay for,
 * and a flat rate is the one a player can predict while they are answering.
 *
 * Fifty is deliberately **half** of the first hundred, and `CONFIG.earn.onboarding`
 * is the other half. So the two ends of the welcome are:
 *
 *   skip everything   50   the gift, for opening the account
 *   answer all five  100   the gift plus the round
 *
 * Anything between is what they actually scored, ten at a time -- the round is
 * paid per question rather than for a clean sweep, so four right is forty and
 * not nothing.
 */
const ROUND_POINTS = [10, 10, 10, 10, 10];

/** What the whole round is worth. Summed, never written down twice. */
const ROUND_TOTAL = ROUND_POINTS.reduce((sum, points) => sum + points, 0);

/**
 * The flags the welcome round is allowed to ask.
 *
 * The bank is all 196 countries and the draw was uniform, which made the first
 * ninety seconds of an account a geography exam: real runs opened with Sao Tome
 * and Principe against Benin, Togo and Guinea. Somebody who has just signed up
 * is being shown what the product *is*; getting four of five wrong teaches them
 * they are bad at it, which is the opposite lesson.
 *
 * So the welcome round draws from flags most people can name -- the big
 * economies, the neighbours of the markets Paylez is in, and the handful of
 * flags that are famous for their design. The real game keeps the whole bank:
 * this list exists for one round, once, and `buildFlagRound` ignores it
 * everywhere else.
 *
 * ISO 3166-1 alpha-2, matching the `codes` column of the flags bank.
 */
const EASY_FLAGS = [
  'PL',
  'UZ',
  'UA',
  'RU',
  'TR',
  'DE',
  'FR',
  'IT',
  'ES',
  'GB',
  'US',
  'CA',
  'BR',
  'AR',
  'MX',
  'CN',
  'JP',
  'KR',
  'IN',
  'ID',
  'SA',
  'EG',
  'ZA',
  'NG',
  'AU',
  'NL',
  'BE',
  'SE',
  'NO',
  'FI',
  'DK',
  'CH',
  'AT',
  'PT',
  'GR',
  'CZ',
  'KZ',
  'AZ',
  'GE',
  'IE',
] as const;

/**
 * The first reward worth having, and so the denominator of the payoff bar.
 *
 * `kFirstTier` on the phone. It is a *bar* rather than a number on its own
 * because 200 points means nothing to somebody who has held points for ninety
 * seconds; how far along the first real thing is means something immediately.
 */
const FIRST_TIER = 250;

type Step = 'lang' | 'place' | 'game' | 'payoff';

/* ────────────────────────────────────────────────────────────── the shell ── */

function Steps({ at }: { at: number }) {
  const copy = useCopy().onboarding;

  return (
    <div className="onb-head">
      <div className="onb-pips" aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <i key={index} data-on={index <= at ? 'true' : undefined} />
        ))}
      </div>
      <span className="onb-count">{fill(copy.step, { n: String(at + 1), total: '4' })}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── step one ── */

function LanguageStep({ onNext }: { onNext: () => void }) {
  const [language, setLanguage] = useLanguage();
  const copy = useCopy().onboarding;
  const { signOut } = useAuth();

  return (
    <>
      <Steps at={0} />
      <h1 className="onb-title">{copy.langTitle}</h1>
      <p className="onb-lede">{copy.langLede}</p>

      <div className="onb-langs" role="radiogroup" aria-label={copy.langTitle}>
        {LANGUAGE_ORDER.map((code: LanguageCode) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={code === language}
            className="onb-lang"
            data-on={code === language ? 'true' : undefined}
            onClick={() => setLanguage(code)}
          >
            {/* Its own name in its own language. A picker that writes "Polish"
                to somebody who only reads Polish is a picker they cannot use. */}
            <b>{LANGUAGES[code].label}</b>
            <span>{LANGUAGES[code].short}</span>
          </button>
        ))}
      </div>

      <div className="onb-actions">
        <button type="button" className="btn btn-solid btn-lg" onClick={onNext}>
          {copy.langNext}
        </button>
        <button
          type="button"
          className="link-btn"
          /* Sign out and stop. The hash is *not* set here: `resolveRoute` now
             answers `landing` for a signed-out visitor on this route, and the
             correcting effect in `Site` follows it. Setting it here as well was
             the bug — the guard ran against the new account and the old route
             and replaced `#top` with `#/sign-in`. See the note in `router.ts`. */
          onClick={signOut}
        >
          {copy.back}
        </button>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────── step one and a half ── */

/**
 * Where you are, and whether you want to be seen.
 *
 * Two questions on one screen because they are one decision: the leaderboard is
 * ranked by city and by country, so "where" is what makes the board mean
 * anything, and "may we list you" is the consent that has to be asked before a
 * name goes on a public table. Splitting them across two steps would ask for a
 * city and then, a screen later, reveal what it was for.
 *
 * **It is skippable, and skipping it costs nothing that matters.** A player
 * with no city still plays, still earns, and still appears on the global board
 * — the server falls back rather than dropping them. A step that blocked the
 * flow on a question about *where somebody lives* would be trading sign-ups for
 * a nicer table.
 *
 * The consent defaults to **off**. Being listed to a whole country is not a
 * setting to flip on somebody's behalf, and a board that fills up because
 * nobody noticed the default is not consent.
 *
 * The city is written back **from the response**, not from what was typed: the
 * server canonicalises it (`resolveCity`), so "kraków" is stored as `Krakow`,
 * and a screen that kept the typed form would show a different city from the
 * one it just saved.
 */
function PlaceStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const copy = useCopy().onboarding;
  const cities = useCities();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<City | null>(null);
  const [listed, setListed] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = cities.state.status === 'ready' ? cities.state.data : null;
  const matches = list && query.trim() && !picked ? matchCities(list, query) : [];

  const save = async () => {
    if (busy) return;
    if (!picked) {
      /* Nothing chosen is a valid answer — see the note above. */
      onNext();
      return;
    }
    setBusy(true);
    try {
      await savePlace({
        city: picked.name,
        countryCode: picked.country,
        leaderboardOptIn: listed,
      });
    } catch {
      /* A place that did not save is not a reason to trap somebody in
         onboarding. The profile page asks the same two questions and the
         board falls back to global until then. */
    } finally {
      setBusy(false);
      onNext();
    }
  };

  return (
    <>
      <Steps at={1} />
      <h1 className="onb-title">{copy.placeTitle}</h1>
      <p className="onb-lede">{copy.placeLede}</p>

      <div className="onb-place">
        <label className="field">
          <span className="field-label">{copy.placeCity}</span>
          <input
            type="text"
            autoComplete="address-level2"
            placeholder={copy.placeCityPlaceholder}
            value={picked ? `${picked.name}, ${picked.country}` : query}
            onChange={(event) => {
              setPicked(null);
              setQuery(event.target.value);
            }}
          />
        </label>

        {matches.length > 0 && (
          <ul className="onb-cities">
            {matches.map((city) => (
              <li key={`${city.name}-${city.country}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(city);
                    setQuery('');
                  }}
                >
                  <b>{city.name}</b>
                  <span>{city.country}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* The consent, and it says what it does rather than naming a setting.
            "Show me on the leaderboard" is a thing somebody can decide; a
            checkbox labelled `leaderboardOptIn` is not. */}
        <button
          type="button"
          className="onb-consent"
          role="switch"
          aria-checked={listed}
          onClick={() => setListed((on) => !on)}
        >
          <span className="onb-switch" data-on={listed ? 'true' : undefined} aria-hidden />
          <span>
            <b>{copy.placeListed}</b>
            <span>{copy.placeListedNote}</span>
          </span>
        </button>
      </div>

      <div className="onb-actions">
        <button
          type="button"
          className="btn btn-solid btn-lg"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? copy.placeSaving : copy.langNext}
        </button>
        <button type="button" className="link-btn" onClick={onBack}>
          {copy.back}
        </button>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── step two ── */

function FlagStep({
  language,
  onBack,
  onDone,
}: {
  language: LanguageCode;
  onBack: () => void;
  onDone: (points: number) => void;
}) {
  const copy = useCopy().onboarding;
  const [round, setRound] = useState<Question[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [points, setPoints] = useState(0);
  const [attempt, setAttempt] = useState(0);
  /* The server round, when there is a session to open one on. */
  const [session, setSession] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<number | null>(null);
  /*
   * Whether the pick was right, as a separate fact from *which* option was.
   *
   * The server answers both — `correct` and `answer` — and they can arrive
   * apart: a dropped response, or a game whose move reports a verdict without
   * an index. One state for the pair meant `-1` had to stand for "not told",
   * and `-1` matches no option, so a correct answer with a missing index was
   * struck through as wrong while the score went up behind it. Two states
   * cannot disagree that way: the verdict marks the button that was pressed,
   * the index marks the button that was right, and either can be missing.
   */
  const [verdict, setVerdict] = useState<boolean | null>(null);
  /* The round does not begin until the offer above has been read. */
  const [started, setStarted] = useState(false);

  /*
   * **The first round is a real round.**
   *
   * It used to be three questions off the local bank, scored 30/30/40 by this
   * file, and the total was deliberately 100 so the payoff screen could say
   * "you earned as much as we gave you". That was a nice line about a number
   * that existed nowhere: a new player finished onboarding reading 130 while
   * the database held 100, and the difference was three questions this browser
   * had scored for itself.
   *
   * So it opens a `flags` session like any other round now. The server sends
   * the questions and keeps the answers, scores what was answered, and writes
   * the ledger entry — which means the first thing a player does on this site
   * is also the first thing that counts. It costs one energy out of four, and
   * that is the mechanic being taught rather than a tax.
   *
   * The three-question shape is kept: the server sends five and this asks the
   * first three, because `finish` scores what was answered rather than what was
   * offered. A four-screen welcome is not the place to sit somebody down for a
   * full round.
   *
   * Built once on mount, rebuilt only on a retry — `buildFlagRound` draws from
   * the bag, so calling it again would take three *more* rows out of the pool.
   */
  useEffect(() => {
    let live = true;
    setRound(null);
    setFailed(false);
    setSession(null);

    if (hasToken()) {
      startRound('flags', language, false, true)
        .then((started) => {
          if (!live) return;
          const content = started.content as {
            questions: { index: number; prompt: string; options: string[] }[];
          };
          setSession(started.sessionId);
          setRound(
            content.questions.slice(0, ROUND_POINTS.length).map((q) => ({
              /* The server's flags bank prompts with the **ISO code** and keeps
                 the emoji out of the database on purpose, so the code is turned
                 into the flag here. `buildFlagRound` below already hands this
                 slot a glyph, which is why the welcome round drew flags on the
                 local path and two letters on the server one. */
              glyph: flagGlyph(q.prompt),
              prompt: copy.gameTitle,
              options: q.options,
              /* Unknown by design: the server holds it. */
              answer: -1,
            })),
          );
        })
        .catch(() => {
          if (live) setFailed(true);
        });
      return () => {
        live = false;
      };
    }

    buildFlagRound(language, ROUND_POINTS.length, copy.gameTitle, EASY_FLAGS)
      .then((built) => {
        if (live) setRound(built);
      })
      .catch(() => {
        /* One dropped chunk request is not a broken product. The bank cache
           evicts a rejection, so the retry below is a real second attempt. */
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [language, attempt, copy.gameTitle]);

  if (failed) {
    return (
      <>
        <Steps at={2} />
        <h1 className="onb-title">{copy.gameFailed}</h1>
        <div className="onb-actions">
          <button
            type="button"
            className="btn btn-solid btn-lg"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {copy.gameRetry}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            {copy.gameBack}
          </button>
        </div>
      </>
    );
  }

  if (!round) {
    return (
      <>
        <Steps at={2} />
        <p className="onb-lede" role="status">
          {copy.gameLoading}
        </p>
      </>
    );
  }

  /*
   * The offer, before the first question.
   *
   * The round used to open straight onto a flag, which asks somebody to answer
   * before they have been told there is anything in it for them. This screen is
   * the deal in one line -- five questions, this many points -- and a button
   * that starts it. It costs one tap and is the difference between a quiz
   * somebody was given and one they agreed to.
   *
   * The total is summed from `ROUND_POINTS` rather than written in the copy, so
   * the promise on this screen and the points the questions actually pay are
   * the same number by construction.
   */
  if (!started) {
    return (
      <>
        <Steps at={2} />
        <span className="onb-prize-mark" aria-hidden>
          <Icon name="trophy" size={30} strokeWidth={2} />
        </span>
        <b className="onb-prize-pts">+{ROUND_TOTAL}</b>
        <h1 className="onb-title">{copy.introTitle}</h1>
        <p className="onb-lede">
          {fill(copy.introLede, {
            n: String(ROUND_POINTS.length),
            points: String(ROUND_TOTAL),
          })}
        </p>
        <div className="onb-actions">
          <button type="button" className="btn btn-solid btn-lg" onClick={() => setStarted(true)}>
            {copy.introGo}
            <Icon name="arrow" size={16} />
          </button>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            {copy.gameBack}
          </button>
        </div>
      </>
    );
  }

  const question = round[at];
  const answered = picked !== null;
  /* On a server round the answer arrives with the verdict; until then there is
     nothing honest to mark. See the same rule in `Round` in `games.tsx`. */
  const rightIndex = session ? revealed : question.answer;
  /* `-1` is "not told" on both paths — the server round stores it in `answer`
     when it builds the question, and `setRevealed(-1)` writes it when a reply
     carries no index. It is not an option, so it must not be compared against
     one. */
  const known = rightIndex !== null && rightIndex >= 0;
  const right = verdict ?? (known && picked === rightIndex);
  /*
   * Whether the outcome is in.
   *
   * On a server round the press and the verdict are one request apart, and in
   * that gap `right` is false — not because the answer was wrong but because
   * nothing has been said yet. The line below read that as "Wrong" and then
   * corrected itself when the reply landed, which is the one thing a quiz must
   * never do: tell somebody they were wrong and take it back.
   */
  const settled = verdict !== null || known;
  const last = at === round.length - 1;

  /**
   * What one option is, once the question has been answered.
   *
   * **The right answer is marked whatever was pressed**, which is the whole
   * point of the reveal: the moment you most want to be told what the answer
   * was is the moment you got it wrong. The pressed one is struck through, the
   * two that were neither fade, and the pair being compared are the only things
   * left at full strength.
   *
   * The last branch is the honest degradation. With no index there is nothing
   * to point at, so only the button that was pressed is marked, and it is
   * marked from the verdict — right or wrong — rather than assumed wrong.
   */
  const stateOf = (index: number): string | undefined => {
    if (!answered) return undefined;
    if (known) {
      if (index === rightIndex) return 'right';
      if (index === picked) return 'wrong';
      return 'dim';
    }
    if (index !== picked) return 'dim';
    return verdict === null ? 'picked' : verdict ? 'right' : 'wrong';
  };

  /* One-way per round: the buttons repaint to show which was right, so a second
     tap must not score again. Same rule as the phone's `answer`. */
  const answer = (index: number) => {
    if (answered) return;
    setPicked(index);

    if (!session) {
      const won = index === question.answer;
      if (won) setPoints((total) => total + ROUND_POINTS[at]);
      setVerdict(won);
      setRevealed(question.answer);
      return;
    }

    /* The server's verdict, and its answer to show. `seq` is the question's
       index in the round the server sent, which is `at` because this asks its
       questions in order from the first. */
    void sendMove(session, at, { index: at, choice: index })
      .then((move) => {
        setRevealed(typeof move.answer === 'number' ? move.answer : -1);
        setVerdict(typeof move.correct === 'boolean' ? move.correct : null);
        /* The points shown are still the flow's own 30/30/40 — what the round
           *pays* is the server's arithmetic, banked at `finish`, and the payoff
           screen reads the real balance rather than this. See `PayoffStep`. */
        if (move.correct) setPoints((total) => total + ROUND_POINTS[at]);
      })
      .catch(() => setRevealed(-1));
  };

  const next = () => {
    if (last) {
      if (session) {
        const id = session;
        setSession(null);
        /* Bank it, then move on regardless: a welcome flow that could strand
           somebody on a network error is worse than one that loses a round. */
        finishRound(id)
          .then((done) => onDone(done.score))
          .catch(() => onDone(0));
        return;
      }
      onDone(points);
      return;
    }
    setAt((n) => n + 1);
    setPicked(null);
    setRevealed(null);
    setVerdict(null);
  };

  return (
    <>
      <Steps at={2} />

      <div className="onb-scoreline">
        <div className="onb-rounds" aria-hidden>
          {round.map((_, index) => (
            <i key={index} data-on={index <= at ? 'true' : undefined} />
          ))}
        </div>
        <span className="onb-score">
          <b>{points}</b> {copy.gamePts}
        </span>
      </div>

      <span className="onb-round">
        {fill(copy.gameRound, {
          n: String(at + 1),
          total: String(round.length),
        })}
      </span>

      {/* The flag is the question, so it is the largest thing on the screen. It
          is emoji from the self-hosted Twemoji subset rather than an image —
          `flagOf` builds it from the ISO code, and this site makes no
          third-party runtime requests. */}
      <span className="onb-flag" aria-hidden>
        {question.glyph}
      </span>

      <h1 className="onb-title">{question.prompt}</h1>

      <div className="onb-options">
        {question.options.map((option, index) => {
          const state = stateOf(index);
          return (
            <button
              key={option}
              type="button"
              className="onb-option"
              disabled={answered}
              data-state={state}
              onClick={() => answer(index)}
            >
              <span className="onb-option-tx">{option}</span>
              {/* The tick, on whichever option was right — the one mark that
                  says "this is the answer" without a word to translate. It is
                  `aria-hidden` because the verdict line below announces the
                  outcome to a screen reader as a `role="status"`, and a second
                  voice saying "check" on one of four buttons is noise. */}
              {state === 'right' && (
                <span className="onb-option-mark" aria-hidden>
                  <Icon name="check" size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {answered && settled && (
        <div className="onb-verdict" role="status">
          <b>{right ? copy.gameRight : copy.gameWrong}</b>
          {right && <span>+{ROUND_POINTS[at]}</span>}
        </div>
      )}

      <div className="onb-actions">
        <button type="button" className="btn btn-solid btn-lg" disabled={!answered} onClick={next}>
          {last ? copy.gameLast : copy.gameNext}
        </button>
        {at === 0 && !answered && (
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            {copy.gameBack}
          </button>
        )}
      </div>

      {/*
        Skip *this question*, not the round.

        It calls `next` -- the same function the Next button calls -- so the
        skipped question simply goes unanswered and pays nothing, and the one
        after it opens. On the last question `next` finishes the round and
        banks whatever was earned, which is the same ending answering it would
        have reached.

        Nothing special happens on the server: `finishRound` scores what was
        *answered*, so a skipped question is worth zero without needing to be
        reported as anything.

        Quietest control on the screen and set apart from the actions row: it
        is the alternative to answering, not a second offer.
      */}
      <button type="button" className="onb-skip" onClick={next}>
        {copy.gameSkip}
      </button>
    </>
  );
}

/* ───────────────────────────────────────────────────────────── step three ── */

/**
 * How long one game holds the reel.
 *
 * The Guide carousel on the landing page runs at 2400ms and this is a beat
 * slower, because the card here carries a rule sentence rather than a two-word
 * blurb — the interval has to clear reading it, not glancing at it. Under three
 * seconds either way: a reel a reader has to *wait* on has stopped being a
 * preview and become a queue.
 */
const REEL_INTERVAL = 2600;

/**
 * The other seven games, one at a time.
 *
 * A grid of seven cards is a list to be scanned; a reel is a thing to be
 * watched, and the difference is what this screen needs — a player who has just
 * finished their first round is being *shown* what else is here, not asked to
 * audit a catalogue. Each card carries the game's name, the rule it is played
 * by and what it pays, which together are the answer to "what would I be
 * playing?".
 *
 * The construction is the Guide carousel's, deliberately and line for line: a
 * flex track translated by whole cards off a `--index` custom property, dots
 * that are `role="tablist"`, the interval suspended while a pointer or the
 * keyboard is on it, and no interval at all under `prefers-reduced-motion` —
 * an auto-advancing panel is the exact thing that preference is asked for. Only
 * the class names and the card differ, because this is a different surface in a
 * 30rem column rather than the same component in a new place.
 *
 * `aria-hidden` on the cards that are not showing, so a screen reader is handed
 * one game rather than seven read out in a row from a region that keeps moving.
 */
function GameReel({ label }: { label: string }) {
  const dict = useCopy();
  const copy = dict.onboarding;
  /* Paired with the index before filtering: `gameName` takes a position in
     `GAMES`, and a filtered array renumbers every row after the one removed —
     which would name each game as the one after it. */
  const shelf = GAMES.map((game, index) => ({ game, index })).filter(
    (entry) => entry.game.id !== 'flag',
  );
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);

  /* Wraps in both directions. A reel that stops at either end has two dead
     controls on a panel whose whole point is that it keeps going. */
  const go = (step: number) =>
    setAt((i) => (i + step + shelf.length) % shelf.length);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(
      () => setAt((i) => (i + 1) % shelf.length),
      REEL_INTERVAL,
    );
    return () => window.clearInterval(timer);
    /*
     * `at` is a dependency, and that is the behaviour rather than an oversight:
     * changing the card restarts the clock, so a game reached by pressing an
     * arrow or a dot gets the full 2.6 seconds like every other one. Without it
     * a press made halfway through an interval would be answered by the reel
     * moving on a second later — the panel arguing with the hand that just used
     * it. Hovering already suspends the interval, so on a pointer device the
     * press is inside a pause; this is what makes it right on a touchscreen,
     * where there is no hover to suspend anything.
     */
  }, [paused, shelf.length, at]);

  return (
    <div
      className="onb-reel"
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/*
        * The two arrows, on the edges of the window rather than beside it.
        *
        * Beside it they would take width from a card that is already only 30rem
        * wide; on it they sit over the plate's own margin, clear of the name and
        * the rule. They are the manual half of a panel that advances on its own
        * — pressing one is also what pauses the reel, because a reader who has
        * reached for a control is no longer watching.
        */}
      <button
        type="button"
        className="onb-reel-arrow"
        data-side="prev"
        aria-label={copy.reelPrev}
        onClick={() => go(-1)}
      >
        <Icon name="chevron" size={16} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        className="onb-reel-arrow"
        data-side="next"
        aria-label={copy.reelNext}
        onClick={() => go(1)}
      >
        <Icon name="chevron" size={16} strokeWidth={2.4} />
      </button>

      <div className="onb-reel-win">
        <div className="onb-reel-track" style={{ ['--index' as string]: at }}>
          {shelf.map(({ game, index }, slot) => {
            const [rule, reward] = rulesFor(game, dict.games);
            return (
              <article
                className="onb-reel-card"
                key={game.id}
                aria-hidden={slot !== at}
                data-on={slot === at ? 'true' : undefined}
              >
                {/* The game's own mark at cabinet-art size, bleeding off the
                    corner and clipped by the plate. It is the same glyph as the
                    badge above it rather than a second picture: a card that
                    carries its subject twice, once to identify it and once
                    because a panel with nothing in the lower right is a form. */}
                <span className="onb-reel-art" aria-hidden>
                  <Icon name={game.icon} size={120} />
                </span>

                <span className="onb-reel-head">
                  <span className="onb-reel-ico" aria-hidden>
                    <Icon name={game.icon} size={20} />
                  </span>
                  {/* The slot, two digits over two. Numerals only, so it needs
                      no dictionary entry and reads the same in five languages —
                      and a numbered slot is what a shelf of games is. */}
                  <span className="onb-reel-slot" aria-hidden>
                    {String(slot + 1).padStart(2, '0')}
                    <i>/</i>
                    {String(shelf.length).padStart(2, '0')}
                  </span>
                </span>

                <b>{gameName(index, dict.games, 'pl', 'PL')}</b>
                <p>{rule}</p>
                <span className="onb-reel-meta">{reward}</span>
              </article>
            );
          })}
        </div>
      </div>

      <div className="onb-reel-dots" role="tablist" aria-label={label}>
        {shelf.map(({ game }, slot) => (
          <button
            key={game.id}
            type="button"
            role="tab"
            aria-selected={slot === at}
            aria-label={gameName(shelf[slot].index, dict.games, 'pl', 'PL')}
            className="onb-reel-dot"
            data-on={slot === at ? 'true' : undefined}
            onClick={() => setAt(slot)}
          />
        ))}
      </div>
    </div>
  );
}

function PayoffStep({ earned, onFinish }: { earned: number; onFinish: () => void }) {
  const dict = useCopy();
  const copy = dict.onboarding;
  const total = earned + WELCOME_POINTS;
  const pct = Math.min(100, Math.round((total / FIRST_TIER) * 100));

  /*
   * The total arrives rather than being printed, and the bar fills rather than
   * being drawn full.
   *
   * This is the one screen in the product where a number is a *reward*, and a
   * reward that is simply already there is a receipt. Both of these are the
   * same trick — start at zero, land on the value — and both are one-shot.
   *
   * The count is local rather than the site's `[data-count]` scan, and that is
   * not a preference: `useCountUp` queries the document once when the route
   * mounts and has no observer for what arrives later, and this screen mounts
   * three steps into the flow. It would never be scanned. A dozen lines here
   * beat teaching a shared hook about a screen it cannot see.
   */
  const [shown, setShown] = useState(0);
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(total);
      setFilled(pct);
      return;
    }

    /* The bar is a CSS transition on `width`; it only needs the value to change
       once, a frame after the mount, for the transition to have somewhere to
       travel from. */
    const bar = requestAnimationFrame(() => setFilled(pct));

    const DURATION = 1100;
    let start: number | null = null;
    let frame = 0;
    const step = (at: number) => {
      start ??= at;
      const t = Math.min(1, (at - start) / DURATION);
      /* easeOutCubic — fast off the mark, gentle landing. The same curve the
         site's other count-ups use, so the two never look like two devices. */
      setShown(Math.round(total * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(bar);
      cancelAnimationFrame(frame);
    };
  }, [total, pct]);

  return (
    <>
      <Steps at={3} />

      {/*
       * `display: contents`, so the cascade below can be written as
       * `.onb-pay > *` without this wrapper becoming a flex item and
       * collapsing seven rows into one.
       */}
      <div className="onb-pay">
        <span className="onb-total" aria-hidden>
          {shown}
        </span>
        <h1 className="onb-title">{copy.payTitle}</h1>

        <ul className="onb-split">
          <li>
            <span>{copy.payEarned}</span>
            <b>+{earned}</b>
          </li>
          <li>
            <span>{copy.payGift}</span>
            <b>+{WELCOME_POINTS}</b>
          </li>
          <li data-total="true">
            <span>{copy.payTotal}</span>
            <b>{total}</b>
          </li>
        </ul>

        <div className="onb-tier">
          <div className="onb-bar">
            <i style={{ width: `${filled}%` }} />
          </div>
          <span>{fill(copy.payTier, { n: String(FIRST_TIER) })}</span>
        </div>

        <p className="onb-lede">{copy.payLede}</p>

        {/*
        The rest of the product, offered where somebody has just finished the
        only part of it they have seen.

        This screen used to end the flow with a button and nothing else, which
        left a new player knowing that flags exist. Seven other games do, and
        the count is `GAMES.length - 1` rather than a number in the sentence --
        the L-Earn marketing section already shipped the bug where a page
        claimed three games after five had launched, and the rule that came out
        of it is that a page renders the list it is describing.

        The icons are the games' own, so this is a picture of the shelf rather
        than a promise about it.

        **And each one is named.** It was seven bare icons in a bulleted list,
        which is a row of small shapes a player has no way to read: the whole
        claim of the paragraph above is that seven more games exist, and seven
        anonymous glyphs are not evidence of that. `gameName` is the same
        function the L-Earn page and the signed-in grid name their cards with,
        so the shelf cannot start calling a game something the rest of the site
        does not.

        Mapped with the index and skipped rather than filtered first, because
        `gameName` takes a position in `GAMES` — a filtered array renumbers
        every row after the one removed, which would name each game as the one
        after it.
      */}
        <div className="onb-more">
          <b className="onb-more-title">{fill(copy.moreTitle, { n: String(GAMES.length - 1) })}</b>
          <p>{copy.moreLede}</p>
          {/*
            One at a time, on a reel.

            It was a grid of seven cards, and before that seven bare icons in a
            bulleted list. A grid is a catalogue to be audited; the thing this
            screen wants is to *show* somebody what else is here, one game at a
            time, while they are still looking at what they just won.

            `rulesFor` is the pair the L-Earn page and the signed-in Play grid
            both open a card with — the rule and what it pays — so a player
            reads the same description here that they will read when they get
            there, and there is no second wording to keep in step.
          */}
          <GameReel label={fill(copy.moreTitle, { n: String(GAMES.length - 1) })} />

          <a className="btn btn-ghost" href={PATHS.learn}>
            {copy.moreGo}
            <Icon name="arrow" size={15} />
          </a>
        </div>

        <div className="onb-actions">
          {/*
          This button ends onboarding and nothing else. It must **not**
          navigate: `finishOnboarding` changes the session, and a handler that
          also sets the hash would have the guard run once against the new
          account and the old route. `resolveRoute` already answers `landing`
          for `onboarding` once the stamp is set, and the correcting effect in
          `Site` follows it — see the note in `router.ts`.
        */}
          <button type="button" className="btn btn-solid btn-lg" onClick={onFinish}>
            {copy.payGo}
            <Icon name="arrow" size={16} />
          </button>
          <a className="btn btn-ghost" href="#/profile">
            {copy.payProfile}
          </a>
        </div>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────── page ── */

export function OnboardingPage() {
  const { account, finishOnboarding } = useAuth();
  const [language] = useLanguage();
  /* The field below reads the cursor off these two properties. Same hook, same
     two names, same construction as the plan cards on the landing page. */
  const field = useSpotlight<HTMLElement>();
  const [step, setStep] = useState<Step>('lang');
  const [earned, setEarned] = useState(0);

  const finish = useCallback(() => void finishOnboarding(earned), [finishOnboarding, earned]);

  if (!account) return null;

  return (
    <main className="onb" id="welcome-top" ref={field}>
      {/*
       * The ruled field the whole gate is printed on.
       *
       * No canvas, no context and no frame loop — two repeating hairline
       * gradients under a mask that follows the pointer, which is the same
       * device the subscription section uses and deliberately so: a player
       * meets it here on their first screen and again on the page that sells
       * them a plan. This route has no backdrop of its own (`Site.tsx` renders
       * none for `onboarding`), so nothing is competing with it.
       */}
      <span className="onb-field" aria-hidden="true" />

      <div className="onb-shell">
        {/* Lowercase, like every other surface: the word is the mark. */}
        <span className="brand">paylez</span>

        {step === 'lang' ? (
          <LanguageStep onNext={() => setStep('place')} />
        ) : step === 'place' ? (
          <PlaceStep onNext={() => setStep('game')} onBack={() => setStep('lang')} />
        ) : step === 'game' ? (
          <FlagStep
            /* Keyed on the language so changing it and coming back builds the
               round in the new one rather than re-rendering the old prompts. */
            key={language}
            language={language}
            onBack={() => setStep('lang')}
            onDone={(points) => {
              setEarned(points);
              setStep('payoff');
            }}
          />
        ) : (
          <PayoffStep earned={earned} onFinish={finish} />
        )}
      </div>
    </main>
  );
}
