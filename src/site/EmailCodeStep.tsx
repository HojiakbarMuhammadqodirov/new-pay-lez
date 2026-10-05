import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { useAuth } from './auth/context';
import { hasToken, ApiError } from './api/client';
import { confirmCode, me, sendCode } from './api/consumer';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';

/**
 * Whether a new account should be asked for its email code before anything
 * else — the welcome round for a player, the listing form for an owner.
 *
 * Asked of the server directly rather than read off the session, because the
 * session's copy arrives on its own schedule and a gate decided before it lands
 * would flash the next screen and then jump. No token (the offline path) or no
 * answer means no step: a code nobody could check is not worth holding
 * somebody at.
 */
export function useEmailCodeGate(): ['checking' | 'code' | 'open', () => void] {
  const [gate, setGate] = useState<'checking' | 'code' | 'open'>(() => (hasToken() ? 'checking' : 'open'));
  useEffect(() => {
    if (gate !== 'checking') return;
    let live = true;
    const giveUp = window.setTimeout(() => live && setGate('open'), 5000);
    me()
      .then((answer) => {
        if (!live) return;
        setGate(answer.user.emailVerificationRequired === true && answer.user.emailVerifiedAt === null ? 'code' : 'open');
      })
      .catch(() => live && setGate('open'))
      .finally(() => window.clearTimeout(giveUp));
    return () => {
      live = false;
      window.clearTimeout(giveUp);
    };
  }, [gate]);
  return [gate, () => setGate('open')];
}


/**
 * "Check your inbox" — the six-digit code, asked for before the welcome round.
 *
 * Sign-up has already sent the code, so the first thing a new account sees is
 * the box to type it into, while the email is the newest thing in their inbox.
 * `VerifyEmail` still exists for everybody who leaves this for later: it is the
 * panel on Play and the wallet, and spending stays gated by the server either
 * way, so "later" is honest — nothing is skipped, only deferred.
 *
 * Shown only when the server says so (`emailVerificationRequired` and no
 * stamp) — never for a Google account, which arrives proved, nor on a server
 * with no mail configured, where a code is something nobody could receive.
 */
export function EmailCodeStep({ onDone }: { onDone: () => void }) {
  const copy = useCopy().auth.verify;
  const { account, refreshAccount } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);

  const explain = (cause: unknown): string => {
    if (cause instanceof ApiError && cause.status === 0) return copy.offline;
    const left = cause instanceof ApiError ? cause.detail.attemptsLeft : undefined;
    if (typeof left === 'number') return fill(copy.wrongWithTries, { n: String(left) });
    return cause instanceof ApiError ? cause.message : copy.failed;
  };

  const digits = code.replace(/\D/g, '');

  const submit = () => {
    if (busy || digits.length !== 6) return;
    setBusy(true);
    setNote(null);
    confirmCode(digits)
      .then(async () => {
        /* The session's own stamp is what the Play and wallet panels read, so
           it is asked for again rather than assumed. */
        await refreshAccount();
        onDone();
      })
      .catch((cause: unknown) => setNote({ kind: 'error', text: explain(cause) }))
      .finally(() => setBusy(false));
  };

  const resend = () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    sendCode()
      .then((sent) => setNote({ kind: 'status', text: sent.sent ? copy.onItsWay : copy.tooSoon }))
      .catch((cause: unknown) => setNote({ kind: 'error', text: explain(cause) }))
      .finally(() => setBusy(false));
  };

  return (
    <form
      className="onb-verify"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      noValidate
    >
      <span className="onb-kicker">
        <Icon name="lock" size={13} strokeWidth={2} /> {copy.kicker}
      </span>
      <h1 className="onb-title">{copy.title}</h1>
      <p className="onb-lede">
        {copy.lede}
        {account?.email ? <b> {account.email}</b> : null}
      </p>

      <label className="field onb-code">
        <span className="field-label">{copy.codeLabel}</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          placeholder={copy.codePlaceholder}
          value={code}
          autoFocus
          onChange={(event) => {
            setCode(event.target.value);
            if (note?.kind === 'error') setNote(null);
          }}
          aria-invalid={note?.kind === 'error' ? true : undefined}
        />
      </label>

      {note && (
        <p className={note.kind === 'error' ? 'field-error' : 'field-help'} role={note.kind === 'error' ? 'alert' : 'status'}>
          {note.text}
        </p>
      )}

      <div className="onb-actions">
        <button type="submit" className="btn btn-solid btn-lg" disabled={busy || digits.length !== 6}>
          {busy ? copy.working : copy.confirm}
        </button>
        <button type="button" className="link-btn" onClick={resend} disabled={busy}>
          {copy.resend}
        </button>
        <button type="button" className="link-btn" onClick={onDone} disabled={busy}>
          {copy.later}
        </button>
      </div>
    </form>
  );
}

