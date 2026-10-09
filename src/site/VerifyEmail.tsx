/**
 * "Confirm your email" — the panel, and where it is allowed to appear.
 *
 * ## Why this is a panel and not a gate
 *
 * `resolveRoute` holds a new player at `#/welcome` from every route, and it
 * would have been easy to do the same here. It is the wrong shape. An
 * unverified account is not *locked*: it can play, earn, look at the wallet and
 * the guide. The one thing it may be refused is **spending** — buying a venue
 * voucher or a gift card — and only while the server says so (`domain/verification.ts` on the server
 * is the rule). So the honest
 * interface is a panel on the two screens where points are earned and spent,
 * not a wall in front of a product somebody has not seen yet.
 *
 * ## Two wordings, chosen by the server
 *
 * "You can spend once you confirm" is a promise only while the server is
 * enforcing it, so `emailVerificationRequired` (from `GET /v1/me`) picks the
 * sentence: `spendLede` when spending is gated, `lede` when it is not. A panel
 * that claimed a restriction the server does not apply would be the first
 * thing on the screen that was not true.
 *
 * ## No points, on purpose
 *
 * Confirming pays nothing, and the panel does not hint that it might: the
 * server's `CONFIG.earn` says why in so many words ("a reward for clicking a
 * link in an email was paying for a formality"). Confirmation is idempotent
 * there too — `confirm` stamps `email_verified_at` with a guarded `UPDATE … IS
 * NULL`, so a second confirm, a retry or a race answers `granted: false` and
 * changes nothing. If a bonus is ever added it belongs in that guarded branch,
 * and this panel would then read the figure from the answer, not restate it.
 *
 * ## The states, and why each is separate
 *
 * - **Nothing to do** — verified when the screen opened, or an account with no
 *   address at all (a provisional one). The component renders nothing: a
 *   permanent "confirmed ✓" card is a panel that exists to say nothing happened.
 * - **Just confirmed, here** — a ticked panel that stays until the player leaves
 *   the screen. Without it the press that worked was indistinguishable from the
 *   panel vanishing because something broke.
 * - **Asking** — a code field, and a resend.
 * - **Cooling down** — the server refuses a resend inside its cooldown with
 *   `sent: false` and `nextSendAt`, which is **not an error**: asking again too
 *   soon is what an honest person does when a message is slow. The resend
 *   button counts down to that moment instead of staying pressable and being
 *   refused again.
 * - **A refusal** — each of the server's reasons in the player's language
 *   (wrong with tries left, too many tries, expired, nothing sent, the hourly
 *   ceiling). The server's own `message` is English and was printed verbatim to
 *   readers of four other languages.
 *
 * The code never comes back in a response, local server included: a local
 * server logs it to its console, which is where a development sign-up reads it.
 */
import { useCallback, useId, useState } from 'react';
import { confirmCode, sendCode } from './api/consumer';
import { ApiError } from './api/client';
import { useAuth } from './auth/context';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
/* The refusal sentences and the cooldown are shared with `EmailCodeStep`,
   the step right after sign-up — see `emailCode.ts`. */
import { CODE_LENGTH, explainCodeError as explain, useResendCooldown } from './emailCode';

type Note = { kind: 'status' | 'error'; text: string } | null;

export function VerifyEmail({ where }: { where: 'play' | 'wallet' }) {
  const copy = useCopy().auth.verify;
  const { account, emailVerifiedAt, spendNeedsVerifiedEmail, refreshAccount } = useAuth();
  const fieldId = useId();
  const [busy, setBusy] = useState<'send' | 'confirm' | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [code, setCode] = useState('');
  /* Confirmed on this screen, this visit — see "The states" above. `gated`
     is whether spending was held for it *before* the confirm: the session's
     own flag turns false the moment the refresh lands, and the line saying
     what just opened up must not vanish with it. */
  const [done, setDone] = useState<{ gated: boolean } | null>(null);
  const { left: cooling, hold } = useResendCooldown();

  /*
   * Who this is for.
   *
   * `emailVerifiedAt` is `null` both for "not proved" and for "we have not
   * asked yet", and the panel appearing for a moment on a slow connection is
   * the cheaper of the two mistakes — the alternative is a screen that offers a
   * purchase the server is about to refuse. What it must not do is appear for an
   * account with **no address**: a provisional identity has nothing to prove,
   * and the server agrees (`verified()` returns true for one).
   */
  const needed = account !== null && Boolean(account.email) && emailVerifiedAt === null;

  const send = useCallback(() => {
    setBusy('send');
    setNote(null);
    sendCode()
      .then((sent) => {
        hold(sent.nextSendAt);
        setNote({ kind: 'status', text: sent.sent ? copy.onItsWay : copy.tooSoon });
      })
      .catch((error: unknown) => {
        /* "Already confirmed" — on the phone, or in another tab. Not a failure:
           ask the session again and let the done state say so. */
        if (error instanceof ApiError && error.code === 'conflict') {
          setDone({ gated: spendNeedsVerifiedEmail });
          void refreshAccount();
          return;
        }
        setNote({ kind: 'error', text: explain(error, copy) });
      })
      .finally(() => setBusy(null));
  }, [copy, hold, refreshAccount, spendNeedsVerifiedEmail]);

  const submit = useCallback(() => {
    setBusy('confirm');
    setNote(null);
    confirmCode(code)
      .then(() => {
        /* The session's own copy of the stamp is what every other screen reads,
           so it is asked for again rather than assumed — the wallet's buttons
           and the Play screen's gate come right from the same answer. `done`
           is what keeps this panel on screen to say so. */
        setCode('');
        setDone({ gated: spendNeedsVerifiedEmail });
        void refreshAccount();
      })
      .catch((error: unknown) => setNote({ kind: 'error', text: explain(error, copy) }))
      .finally(() => setBusy(null));
  }, [code, copy, refreshAccount, spendNeedsVerifiedEmail]);

  if (done) {
    return (
      <section className="vfy" data-where={where} data-state="done" role="status">
        <span className="vfy-kicker">
          <i>
            <Icon name="check" size={13} strokeWidth={2.4} />
          </i>
          {copy.doneKicker}
        </span>
        <p className="vfy-line">
          {account?.email ? <b>{account.email}</b> : null} {copy.doneLine}
          {done.gated ? ` ${copy.doneSpend}` : ''}
        </p>
      </section>
    );
  }

  if (!needed) return null;

  const ready = code.length === CODE_LENGTH;

  return (
    <section className="vfy" data-where={where}>
      <span className="vfy-kicker">
        <i>
          <Icon name="lock" size={13} strokeWidth={2} />
        </i>
        {copy.kicker}
      </span>

      {/* Which sentence is the server's call — see "Two wordings" above. */}
      <p className="vfy-line">
        {spendNeedsVerifiedEmail ? copy.spendLede : copy.lede}
        {account?.email ? <b> {account.email}</b> : null}
      </p>

      <form
        className="vfy-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && busy === null) submit();
        }}
      >
        {/*
          The label sits over the whole row rather than inside the field's own
          box. Inside, it was held to the well's six-digit width and wrapped to
          two lines in every language but English, pushing the well down and the
          buttons out of line with it.
        */}
        <div className="field vfy-field">
          <label className="field-label" htmlFor={fieldId}>
            {copy.codeLabel}
          </label>
          <div className="vfy-row">
            <input
              id={fieldId}
              className="vfy-input"
              /* `inputMode` rather than `type="number"`, which would strip a
                 leading zero and put spinners on a credential. `autoComplete`
                 is the one-time-code hint every mobile keyboard and password
                 manager reads, which is what makes the code fillable from the
                 notification shade rather than from the inbox. Digits only, so
                 a code pasted as "123 456" out of a mail client still counts as
                 six — which is why there is no `maxLength`: it truncates a paste
                 before `onChange` sees it, and the slice below is the cap. */
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={copy.codePlaceholder}
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH));
                if (note?.kind === 'error') setNote(null);
              }}
              aria-invalid={note?.kind === 'error' ? true : undefined}
              aria-describedby={`${fieldId}-note`}
            />
            <button type="submit" className="btn btn-solid vfy-confirm" disabled={!ready || busy !== null}>
              {busy === 'confirm' ? copy.working : copy.confirm}
            </button>
          </div>
        </div>

        <p className="vfy-resend">
          <span>{copy.notArrived}</span>
          {/* Disabled through the cooldown with the time left as its label, so
              the press cannot be made only to be told "too soon" again. */}
          <button
            type="button"
            className="link-btn"
            onClick={send}
            disabled={busy !== null || cooling !== null}
          >
            {cooling !== null ? fill(copy.resendIn, { t: cooling }) : copy.resend}
          </button>
        </p>
      </form>

      <p
        id={`${fieldId}-note`}
        className={note?.kind === 'error' ? 'field-error' : 'field-help'}
        role={note?.kind === 'error' ? 'alert' : 'status'}
        hidden={note === null}
      >
        {note?.text}
      </p>
    </section>
  );
}
