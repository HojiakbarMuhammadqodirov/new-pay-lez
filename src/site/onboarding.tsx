import { useCallback, useEffect, useState } from 'react';
import { Icon } from './icons';
import { useAuth } from './auth/context';
import { matchCities, savePlace, useCities, type City } from './api/profile';
import { WELCOME_POINTS } from './auth/users';
import { LANGUAGES, LANGUAGE_ORDER, useCopy, useLanguage, type LanguageCode } from './i18n/context';
import { fill } from './i18n/currency';
import { buildFlagRound, type Question } from './games/rounds';
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
 * Three rounds, worth 30, 30 and 40.
 *
 * The phone's own `kFlagRounds` values, kept rather than rounded off, because
 * the last round being worth more is the small thing that makes three rounds a
 * *round* instead of a list — and the total, 100, is deliberately the same as
 * the welcome gift, so the payoff screen reads as "you earned as much as we
 * gave you" rather than as a tip beside a grant.
 */
const ROUND_POINTS = [30, 30, 40];

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
      <span className="onb-count">
        {fill(copy.step, { n: String(at + 1), total: '4' })}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── step one ── */

function LanguageStep({ onNext }: { onNext: () => void }) {
  const [language, setLanguage] = useLanguage();
  const copy = useCopy().onboarding;

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
        <button type="button" className="btn btn-solid btn-lg" disabled={busy} onClick={() => void save()}>
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

  /*
   * Built once, when this step mounts, and rebuilt only on a retry. Not on
   * every render and not per question: `buildFlagRound` draws from the bag, so
   * calling it again would take three *more* rows out of the pool and the
   * player would be asked six questions to answer three.
   */
  useEffect(() => {
    let live = true;
    setRound(null);
    setFailed(false);
    buildFlagRound(language, ROUND_POINTS.length, copy.gameTitle)
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

  const question = round[at];
  const answered = picked !== null;
  const right = answered && picked === question.answer;
  const last = at === round.length - 1;

  /* One-way per round: the buttons repaint to show which was right, so a second
     tap must not score again. Same rule as the phone's `answer`. */
  const answer = (index: number) => {
    if (answered) return;
    setPicked(index);
    if (index === question.answer) setPoints((total) => total + ROUND_POINTS[at]);
  };

  const next = () => {
    if (last) {
      onDone(points);
      return;
    }
    setAt((n) => n + 1);
    setPicked(null);
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
        {fill(copy.gameRound, { n: String(at + 1), total: String(round.length) })}
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
        {question.options.map((option, index) => (
          <button
            key={option}
            type="button"
            className="onb-option"
            disabled={answered}
            data-state={
              !answered
                ? undefined
                : index === question.answer
                  ? 'right'
                  : index === picked
                    ? 'wrong'
                    : 'dim'
            }
            onClick={() => answer(index)}
          >
            {option}
          </button>
        ))}
      </div>

      {answered && (
        <div className="onb-verdict" role="status">
          <b>{right ? copy.gameRight : copy.gameWrong}</b>
          {right && <span>+{ROUND_POINTS[at]}</span>}
        </div>
      )}

      <div className="onb-actions">
        <button
          type="button"
          className="btn btn-solid btn-lg"
          disabled={!answered}
          onClick={next}
        >
          {last ? copy.gameLast : copy.gameNext}
        </button>
        {at === 0 && !answered && (
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            {copy.gameBack}
          </button>
        )}
      </div>
    </>
  );
}

/* ───────────────────────────────────────────────────────────── step three ── */

function PayoffStep({ earned, onFinish }: { earned: number; onFinish: () => void }) {
  const copy = useCopy().onboarding;
  const total = earned + WELCOME_POINTS;
  const pct = Math.min(100, Math.round((total / FIRST_TIER) * 100));

  return (
    <>
      <Steps at={3} />

      <span className="onb-total" aria-hidden>
        {total}
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
          <i style={{ width: `${pct}%` }} />
        </div>
        <span>{fill(copy.payTier, { n: String(FIRST_TIER) })}</span>
      </div>

      <p className="onb-lede">{copy.payLede}</p>

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
    </>
  );
}

/* ────────────────────────────────────────────────────────────────── page ── */

export function OnboardingPage() {
  const { account, finishOnboarding } = useAuth();
  const [language] = useLanguage();
  const [step, setStep] = useState<Step>('lang');
  const [earned, setEarned] = useState(0);

  const finish = useCallback(() => finishOnboarding(earned), [finishOnboarding, earned]);

  if (!account) return null;

  return (
    <main className="onb" id="welcome-top">
      <div className="onb-shell">
        <span className="brand">Paylez</span>

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
