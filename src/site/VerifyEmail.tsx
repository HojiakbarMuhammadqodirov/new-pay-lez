/**
 * "Confirm your email" — the panel, and where it is allowed to appear.
 *
 * ## Why this is a panel and not a gate
 *
 * `resolveRoute` holds a new player at `#/welcome` from every route, and it
 * would have been easy to do the same here. It is the wrong shape. An
 * unverified account is not *locked*: it can read the site, open the games,
 * play a round, look at the wallet and the guide. What it cannot do is **earn,
 * redeem, or appear on the board** (`domain/verification.ts` on the server is
 * the list). So the honest interface is a panel on the two screens where that
 * bites, saying what is not happening and offering the remedy — not a wall in
 * front of a product somebody has not seen yet.
 *
 * That is also the stronger position for getting the address proved. A player
 * who has played a round and seen a real "+0, because your email is not
 * confirmed" has a reason to go and find the code. A player stopped at a form
 * before seeing anything has only a chore.
 *
 * ## The four states, and why the last two are separate
 *
 * - **Nothing to do** — verified, or an account with no address at all (a
 *   provisional one). The component renders nothing.
 * - **Asking** — a code field, and a resend.
 * - **Refused by the cooldown**, which is `sent: false` and **not an error**:
 *   asking again too soon is what an honest person does when a message is
 *   slow, so it says when rather than reading as a fault.
 * - **A wrong code**, which is an error and says how many tries are left —
 *   because the server kills the code after five and somebody on their fourth
 *   ought to know.
 *
 * ## The local code
 *
 * `CodeSent.code` is populated only by a server whose email adapter is local,
 * where the message is logged and delivered nowhere. Shown when it is there,
 * because a development sign-up nobody can finish is a feature nobody will
 * touch — and never presented as the normal way to get a code, because on a
 * real deployment the field is simply absent.
 */
import { useCallback, useState } from 'react';
import { confirmCode, sendCode, type CodeSent } from './api/consumer';
import { ApiError } from './api/client';
import { useAuth } from './auth/context';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';

/** Six digits, and nothing else is a code. */
const CODE_LENGTH = 6;

type State =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'sent'; sent: CodeSent }
  | { kind: 'error'; message: string };

export function VerifyEmail({ where }: { where: 'play' | 'wallet' }) {
  const copy = useCopy().auth.verify;
  const { account, emailVerifiedAt, refreshAccount } = useAuth();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [code, setCode] = useState('');

  /*
   * Who this is for.
   *
   * `emailVerifiedAt` is `null` both for "not proved" and for "we have not
   * asked yet", and the panel appearing for a moment on a slow connection is
   * the cheaper of the two mistakes — the alternative is a screen that promises
   * points the server is about to refuse. What it must not do is appear for an
   * account with **no address**: a provisional identity has nothing to prove,
   * and the server agrees (`verified()` returns true for one).
   */
  const needed = account !== null && Boolean(account.email) && emailVerifiedAt === null;

  const send = useCallback(() => {
    setState({ kind: 'working' });
    sendCode()
      .then((sent) => setState({ kind: 'sent', sent }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message:
            error instanceof ApiError && error.status === 0
              ? copy.offline
              : error instanceof ApiError
                ? error.message
                : copy.failed,
        }),
      );
  }, [copy.offline, copy.failed]);

  const submit = useCallback(() => {
    setState({ kind: 'working' });
    confirmCode(code)
      .then(() => {
        /* The session's own copy of the stamp is what every other screen reads,
           so the panel does not hide itself — it asks for the account again and
           disappears because the answer changed. One source of truth, and the
           Play screen's own gauge and the wallet's buttons come right with it. */
        setCode('');
        void refreshAccount();
      })
      .catch((error: unknown) => {
        const detail = error instanceof ApiError ? error.detail : undefined;
        const left = typeof detail?.attemptsLeft === 'number' ? detail.attemptsLeft : null;
        setState({
          kind: 'error',
          message:
            error instanceof ApiError && error.status === 0
              ? copy.offline
              : left !== null
                ? fill(copy.wrongWithTries, { n: String(left) })
                : error instanceof ApiError
                  ? error.message
                  : copy.failed,
        });
      });
  }, [code, copy, refreshAccount]);

  if (!needed) return null;

  const working = state.kind === 'working';
  const ready = code.replace(/\D/g, '').length === CODE_LENGTH;

  return (
    <section className="vfy" data-where={where}>
      <span className="vfy-kicker">
        <i>
          <Icon name="lock" size={13} strokeWidth={2} />
        </i>
        {copy.kicker}
      </span>

      {/* What is not happening, named for the screen it is on. The two are
          different facts — a round that banks nothing and a purchase that will
          be refused — and a single sentence covering both would be vague about
          each. */}
      <p className="vfy-line">
        {where === 'play' ? copy.playLede : copy.walletLede}
        {account?.email ? <b> {account.email}</b> : null}
      </p>

      <form
        className="vfy-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !working) submit();
        }}
      >
        <label className="field vfy-code">
          <span className="field-label">{copy.codeLabel}</span>
          <input
            /* `inputMode` rather than `type="number"`, which would strip a
               leading zero and put spinners on a credential. `autoComplete`
               is the one-time-code hint every mobile keyboard and password
               manager reads, which is what makes the code fillable from the
               notification shade rather than from the inbox. */
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH + 2}
            placeholder={copy.codePlaceholder}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (state.kind === 'error') setState({ kind: 'idle' });
            }}
            aria-invalid={state.kind === 'error' ? true : undefined}
          />
        </label>

        <div className="vfy-acts">
          <button type="submit" className="btn btn-solid" disabled={!ready || working}>
            {working ? copy.working : copy.confirm}
          </button>
          <button type="button" className="link-btn" onClick={send} disabled={working}>
            {copy.resend}
          </button>
        </div>
      </form>

      {/* A cooldown refusal is not an error — see the header. */}
      {state.kind === 'sent' && !state.sent.sent && (
        <p className="field-help" role="status">
          {copy.tooSoon}
        </p>
      )}
      {state.kind === 'sent' && state.sent.sent && (
        <p className="field-help" role="status">
          {copy.onItsWay}
          {/* Only a server whose mail adapter is local ever sends this. */}
          {state.sent.code ? <b> {state.sent.code}</b> : null}
        </p>
      )}
      {state.kind === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </section>
  );
}
