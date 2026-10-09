import { useEffect, useRef, useState, type Ref } from 'react';
import { hasToken } from './api/client';
import { checkHandle, handleSuggestions, type HandleProblem } from './api/profile';
import { useAuth } from './auth/context';
import { listUsers } from './auth/directory';
import { DEMO_ACCOUNT } from './demoMode';
import { checkUsername, foldUsername, USERNAME_MAX, USERNAME_MIN } from './auth/users';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';

/**
 * The username input, with the answer to "can I have this?" under it as it is
 * typed — the onboarding step and the profile editor both draw this one.
 *
 * ## Two judges, in order
 *
 * **The rules first, here, with no request.** Length, shape and the reserved
 * and blocked lists are `checkUsername`'s, which is the server's rule restated
 * (see the banner in `auth/users.ts`), so a misshapen name is refused on the
 * keystroke that made it rather than after a round trip that could only say
 * the same thing.
 *
 * **Then the table, through the server** — `GET /v1/usernames/:name`, debounced,
 * the previous question aborted when a new one is asked, because an answer
 * about `kasi` arriving after the one about `kasia` would paint the wrong
 * verdict under the right name. Without a server (an account this browser
 * opened offline, or the demo) the local directory is the only evidence there
 * is, which is the rule `saveProfile` already follows for the same question.
 *
 * ## It is advice, and the screen says nothing stronger
 *
 * "Free" here is the server's "free right now"; the save claims the name and
 * can still be refused if somebody took it in between, and the caller shows
 * that refusal under the same field. A check that **failed** is its own state,
 * `unchecked`, rather than a guess in either direction: the caller may still
 * let the reader try to save, and the save is the real judge.
 *
 * ## Suggestions
 *
 * Offered when the name asked for cannot be had (the server's three, near what
 * was typed) and, with `suggestFirst`, before anything has been typed
 * (`GET /v1/usernames`, built from the account's name). A press fills the
 * field and is checked like anything typed — a suggestion is advice too.
 */

export type HandleStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'free' }
  | { kind: 'mine' }
  | { kind: 'bad'; reason: HandleProblem }
  | { kind: 'unchecked' };

/** How long the typing has to pause before the server is asked. */
const DEBOUNCE_MS = 350;

export function UsernameField({
  value,
  onChange,
  onStatus,
  inputRef,
  labelledBy,
  suggestFirst = false,
  autoFocus = false,
  invalid = false,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Every verdict as it changes, so a caller can hold its button. */
  onStatus?: (status: HandleStatus) => void;
  inputRef?: Ref<HTMLInputElement>;
  /** The id of the visible caption, which this input is named by. */
  labelledBy?: string;
  /** Ask for three free names before anything is typed. */
  suggestFirst?: boolean;
  autoFocus?: boolean;
  /** A refusal the caller is showing (the save's), which outranks ours. */
  invalid?: boolean;
  placeholder?: string;
}) {
  const { account } = useAuth();
  const copy = useCopy().profile;
  const [status, setStatus] = useState<HandleStatus>({ kind: 'idle' });
  const [ideas, setIdeas] = useState<string[]>([]);
  const [opening, setOpening] = useState<string[]>([]);
  /* Read through a ref so a caller passing a fresh arrow each render does not
     re-run the check below. */
  const statusRef = useRef(onStatus);
  useEffect(() => {
    statusRef.current = onStatus;
  }, [onStatus]);

  const selfId = account?.id ?? '';
  const own = account?.profile.username ?? '';
  const online = hasToken() && selfId !== DEMO_ACCOUNT.id;

  /* The opening three, once. A failure leaves none, which is a field with no
     hints — not a field that does not work. */
  useEffect(() => {
    if (!suggestFirst || !online) return;
    const abort = new AbortController();
    handleSuggestions(abort.signal)
      .then((answer) => setOpening(answer.suggestions.slice(0, 3)))
      .catch(() => {});
    return () => abort.abort();
  }, [suggestFirst, online]);

  useEffect(() => {
    const report = (next: HandleStatus, near: string[] = []) => {
      setStatus(next);
      setIdeas(near);
      statusRef.current?.(next);
    };

    const typed = value.trim();
    if (!typed) {
      report({ kind: 'idle' });
      return;
    }
    if (own && foldUsername(typed) === foldUsername(own)) {
      report({ kind: 'mine' });
      return;
    }

    /* The rules, against an empty directory: only "taken" needs the table. */
    const shaped = checkUsername([], typed, selfId);
    if (!shaped.ok) {
      /* Too short is what every name is on its way to being long enough, so
         that one waits for the pause rather than scolding each keystroke. */
      if (shaped.error === 'length' && typed.length < USERNAME_MIN) {
        const timer = window.setTimeout(() => report({ kind: 'bad', reason: 'length' }), DEBOUNCE_MS * 2);
        report({ kind: 'idle' });
        return () => window.clearTimeout(timer);
      }
      report({ kind: 'bad', reason: shaped.error });
      return;
    }

    if (!online) {
      const local = checkUsername(listUsers(), typed, selfId);
      report(local.ok ? { kind: 'free' } : { kind: 'bad', reason: local.error });
      return;
    }

    report({ kind: 'checking' });
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      checkHandle(typed, abort.signal)
        .then((answer) => {
          if (answer.available) report({ kind: answer.mine ? 'mine' : 'free' });
          else report({ kind: 'bad', reason: answer.reason ?? 'taken' }, answer.suggestions.slice(0, 3));
        })
        .catch(() => {
          /* Rate-limited, offline, a server error: none of them is a verdict
             about the name. An abort is this effect being replaced. */
          if (!abort.signal.aborted) report({ kind: 'unchecked' });
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [value, own, selfId, online]);

  const shown = status.kind === 'bad' ? ideas : value.trim() ? [] : opening;
  const tone =
    status.kind === 'free' || status.kind === 'mine'
      ? 'ok'
      : status.kind === 'bad'
        ? 'bad'
        : 'wait';
  const line =
    status.kind === 'checking'
      ? copy.usernameChecking
      : status.kind === 'free'
        ? fill(copy.usernameFree, { name: value.trim() })
        : status.kind === 'mine'
          ? copy.usernameMine
          : status.kind === 'bad'
            ? fill(copy.usernameErrors[status.reason], { min: String(USERNAME_MIN), max: String(USERNAME_MAX) })
            : status.kind === 'unchecked'
              ? copy.usernameUnchecked
              : '';

  return (
    <div className="uname">
      <div className="uname-input">
        <span className="uname-at" aria-hidden>
          @
        </span>
        <input
          ref={inputRef}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="text"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          autoFocus={autoFocus}
          placeholder={placeholder ?? copy.usernamePlaceholder}
          value={value}
          aria-labelledby={labelledBy}
          aria-invalid={invalid || status.kind === 'bad' ? true : undefined}
          onChange={(event) => onChange(event.target.value.replace(/^@+/, ''))}
        />
      </div>

      {/* Always mounted, so the verdict is announced: a live region mounted
          together with its text is one many screen readers never read. A
          refusal from the save outranks this line, so it steps aside. */}
      <p className="uname-status" data-tone={invalid ? undefined : tone} role="status">
        {invalid ? '' : line}
      </p>

      {shown.length > 0 && (
        <div className="uname-ideas">
          <span>{copy.usernameIdeas}</span>
          {shown.map((idea) => (
            <button key={idea} type="button" className="uname-idea" onClick={() => onChange(idea)}>
              @{idea}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
