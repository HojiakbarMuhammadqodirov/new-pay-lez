import { useState, type FormEvent } from 'react';
import { ACCOUNT_TYPES } from './content';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import { PATHS } from './router';
import { useAuth } from './auth/context';
import { GoogleButton } from './auth/GoogleButton';
import {
  MIN_PASSWORD,
  type ChoosableType,
  type SignInError,
  type SignUpError,
} from './auth/users';

/**
 * The front door — two ways in on one route.
 *
 * **Sign in** if you already exist; **sign up** if you do not, and the sign-up
 * form is where the individual-or-business question is asked. That is the whole
 * change from the previous arrangement, which created the account first and then
 * held it at a second screen until it answered: an account that exists but does
 * not know what it is has to be guarded everywhere, and there is no reason to
 * create that state when the form can ask before there is an account at all.
 *
 * Which form shows is local state, because it is a preference about this screen
 * and nothing else on the site depends on it. Which *step* shows is not: an
 * account with no type still resolves back here (see `resolveRoute`), so a
 * session written by the older build finishes the question rather than getting
 * stuck, and a refresh mid-way lands where it left off.
 *
 * See `auth/users.ts` for why this is a prototype door and not authentication.
 */

/* ─────────────────────────────────────────────────────────── credentials ── */

function Credentials({ onSwap }: { onSwap: () => void }) {
  const copy = useCopy();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<SignInError | 'empty' | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('empty');
      return;
    }
    /* Locked while it is in flight. Signing in is a round trip now, and a form
       that can be submitted twice opens two sessions. */
    if (busy) return;
    setBusy(true);
    void signIn(email, password)
      .then((result) => {
        /*
         * No navigation on success. Signing in changes the session, which
         * changes what `resolveRoute` returns for this very route — the
         * console, the setup form, or the landing page. Pushing a hash here as
         * well would race that.
         */
        setError(result.ok ? null : result.error);
      })
      .finally(() => setBusy(false));
  };

  return (
    <form className="auth-card" onSubmit={onSubmit} noValidate>
      <span className="eyebrow">{copy.auth.eyebrow}</span>
      <h1>{copy.auth.title}</h1>
      <p className="auth-lede">{copy.auth.lede}</p>

      <label className="field">
        <span className="field-label">{copy.auth.email}</span>
        <input
          type="email"
          autoComplete="username"
          placeholder={copy.auth.emailPlaceholder}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          aria-invalid={error === 'email' || error === 'empty' ? true : undefined}
        />
      </label>

      <label className="field">
        <span className="field-label">{copy.auth.password}</span>
        <input
          type="password"
          autoComplete="current-password"
          placeholder={copy.auth.passwordPlaceholder}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          aria-invalid={error === 'password' || error === 'empty' ? true : undefined}
        />
      </label>

      {/* `role="alert"` rather than a bare paragraph: the message appears after
          a submit the reader may not be looking at. */}
      {error && (
        <p className="field-error" role="alert">
          {copy.auth.errors[error]}
        </p>
      )}

      <button type="submit" className="btn btn-solid btn-lg auth-submit">
        {copy.auth.submit}
      </button>

      {/* Under the password form, not above it. The address-and-password pair is
          what this prototype is still built around; Google is the alternative,
          and putting an alternative first reads as the main route. */}
      <GoogleButton />

      <p className="auth-swap">
        {copy.auth.noAccount}{' '}
        <button type="button" className="link-btn" onClick={onSwap}>
          {copy.auth.toSignUp}
        </button>
      </p>

      {/*
        There is no list of accounts under this form.

        There used to be: while the seeds lived in the bundle, printing them cost
        nothing — view-source was already enough — and a demo nobody can get into
        is not a demo. Now that `server/` holds real accounts behind scrypt, the
        same block would be a working credential pair on the front door of a
        system where credentials mean something. The argument that justified it
        was "these are readable anyway", and that argument has expired.
      */}
    </form>
  );
}

/* ────────────────────────────────────────────────────────────── sign up ── */

/**
 * The type picker, shared by the two screens that ask the question.
 *
 * Sign-up asks it inline; `ChooseType` below asks it on its own for a session
 * that arrived without an answer. Same control either way, so the two cannot
 * drift apart.
 */
function TypeChoice({
  picked,
  onPick,
  label,
}: {
  picked: ChoosableType | null;
  onPick: (type: ChoosableType) => void;
  label: string;
}) {
  const copy = useCopy();

  return (
    <div className="type-grid" role="radiogroup" aria-label={label}>
      {ACCOUNT_TYPES.map((type, index) => (
        <button
          key={type.id}
          type="button"
          role="radio"
          aria-checked={picked === type.id}
          className="type-card"
          data-on={picked === type.id ? 'true' : undefined}
          onClick={() => onPick(type.id)}
        >
          <span className="type-ico">
            <Icon name={type.icon} size={22} />
          </span>
          <b>{copy.auth.types[index].name}</b>
          <span>{copy.auth.types[index].blurb}</span>
        </button>
      ))}
    </div>
  );
}

function SignUp({ onSwap }: { onSwap: () => void }) {
  const copy = useCopy();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [type, setType] = useState<ChoosableType | null>(null);
  const [error, setError] = useState<SignUpError | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    void signUp({ name, email, password, type })
      .then((result) => {
        /* Nothing to navigate to here either: an owner resolves to setup and an
           individual to the landing page, both from the account this just
           made. */
        setError(result.ok ? null : result.error);
      })
      .finally(() => setBusy(false));
  };

  /* One `<p>` under the form rather than a message per field: the validation
     runs in form order and stops at the first problem, so there is only ever one
     thing to say, and it names the field it is about. */
  const invalid = (field: SignUpError) => (error === field ? true : undefined);

  return (
    <form className="auth-card auth-card-wide" onSubmit={onSubmit} noValidate>
      <span className="eyebrow">{copy.auth.signUpEyebrow}</span>
      <h1>{copy.auth.signUpTitle}</h1>
      <p className="auth-lede">{copy.auth.signUpLede}</p>

      <label className="field">
        <span className="field-label">{copy.auth.name}</span>
        <input
          type="text"
          autoComplete="name"
          placeholder={copy.auth.namePlaceholder}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          aria-invalid={invalid('name')}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">{copy.auth.email}</span>
          <input
            type="email"
            autoComplete="email"
            placeholder={copy.auth.emailPlaceholder}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            aria-invalid={error === 'email' || error === 'taken' ? true : undefined}
          />
        </label>

        <label className="field">
          <span className="field-label">{copy.auth.password}</span>
          <input
            type="password"
            autoComplete="new-password"
            placeholder={fill(copy.auth.newPasswordPlaceholder, {
              n: String(MIN_PASSWORD),
            })}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            aria-invalid={invalid('password')}
          />
        </label>
      </div>

      <div className="field">
        <span className="field-label">{copy.auth.typeQuestion}</span>
        <TypeChoice
          picked={type}
          label={copy.auth.typeQuestion}
          onPick={(next) => {
            setType(next);
            setError(null);
          }}
        />
        <span className="field-help">{copy.auth.typeNote}</span>
      </div>

      {/* One hole, and only the length message has it — `fill` leaves any
          template without it untouched, so every message goes through the same
          call rather than the component knowing which one needs it. */}
      {error && (
        <p className="field-error" role="alert">
          {fill(copy.auth.signUpErrors[error], { n: String(MIN_PASSWORD) })}
        </p>
      )}

      <button type="submit" className="btn btn-solid btn-lg auth-submit">
        {copy.auth.signUpSubmit}
      </button>

      {/* Also on sign-up: continuing with Google *is* opening an account when
          the address is new, so making somebody fill the form first to reach
          the shortcut would be the wrong way round. */}
      <GoogleButton />

      <p className="auth-swap">
        {copy.auth.haveAccount}{' '}
        <button type="button" className="link-btn" onClick={onSwap}>
          {copy.auth.toSignIn}
        </button>
      </p>
    </form>
  );
}

/* ────────────────────────────────────────────────────────── account type ── */

/**
 * The question, on its own.
 *
 * Reachable only by a session that predates sign-up asking it — `resolveRoute`
 * sends an account whose type is still `null` back here from every route. Kept
 * rather than deleted because that session is somebody's open tab, and the
 * alternative to finishing the question is signing them out of a browser they
 * never asked to be signed out of.
 */
function ChooseType({ name }: { name: string }) {
  const copy = useCopy();
  const { setType, signOut } = useAuth();
  const [picked, setPicked] = useState<ChoosableType | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!picked) return;
    /*
     * Answer the question and stop. Where this goes next — the landing page for
     * an individual, setup for an owner with no listing — is `resolveRoute`'s
     * job, and navigating here as well would set the hash before React has
     * re-rendered, leaving the guard to run against the new account and the old
     * route and redirect over the top of it.
     */
    setType(picked);
  };

  const onCancel = () => {
    // If the user does not want to answer the question now, sign them out
    // and return to the landing page so they can continue browsing.
    signOut();
    window.location.hash = PATHS.landing;
  };

  return (
    <form className="auth-card auth-card-wide" onSubmit={onSubmit}>
      <span className="eyebrow">{copy.auth.typeEyebrow}</span>
      {/* First name only — the whole name in a headline reads like a form. */}
      <h1>{fill(copy.auth.typeTitle, { name: name.split(' ')[0] })}</h1>
      <p className="auth-lede">{copy.auth.typeLede}</p>

      <TypeChoice picked={picked} onPick={setPicked} label={copy.auth.typeEyebrow} />

      <button
        type="submit"
        className="btn btn-solid btn-lg auth-submit"
        disabled={!picked}
      >
        {copy.auth.typeSubmit}
      </button>
      {!picked && <p className="auth-demo">{copy.auth.typeHint}</p>}
      <div className="auth-cancel">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {copy.auth.cancel}
        </button>
      </div>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────────── page ── */

export function SignInPage() {
  const { account } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');

  return (
    <main>
      <section className="section auth" id="signin-top">
        <div className="wrap auth-wrap">
          {account ? (
            <ChooseType name={account.name} />
          ) : mode === 'in' ? (
            <Credentials onSwap={() => setMode('up')} />
          ) : (
            <SignUp onSwap={() => setMode('in')} />
          )}
        </div>
      </section>
    </main>
  );
}
