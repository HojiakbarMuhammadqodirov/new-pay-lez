/**
 * "Continue with Google" — our button, not Google's.
 *
 * It began as Google's rendered button and that had to go. `renderButton`
 * chooses on its own between a generic pill and a personalised "Continue as …"
 * card, based on the browser's Google session; the choice cannot be forced from
 * the page, and the personalised form ignores the requested shape. So the same
 * screen showed two different controls on two visits and neither matched the
 * primary above it. `requestGoogleCode` drives the flow instead, which leaves
 * the button entirely ours: `.btn` like every other control, in the site's
 * fonts and tokens, in all five languages.
 *
 * **The G stays four-colour, and that is the fourth sanctioned exception to the
 * two-colour rule.** It is the same case as the flag emoji: Google's terms
 * forbid altering the mark, so the thing depicted *is* its colours. It is an
 * inline SVG at 18px inside a control that is otherwise entirely `--solid` and
 * `--border`, and it is not licence for a fifth hue anywhere else — see the
 * note in the root `CLAUDE.md`.
 *
 * Four states, and only one of them is "it worked":
 *
 * - **Not configured** — no `VITE_GOOGLE_CLIENT_ID`. Renders nothing. A button
 *   certain to fail is worse than no button, and this is the normal state of a
 *   local checkout.
 * - **Cancelled** — popup closed or blocked. Silent: the person decided, and
 *   telling them what they just did is noise.
 * - **Unreachable** — script or backend down. Says so, and the password form
 *   beside it still works. Google is an alternative way in, so losing it must
 *   not take the door with it.
 * - **Refused** — the server declined. One message for every reason, matching
 *   what the endpoint returns; the detail is in the server log, because the
 *   difference between "expired" and "wrong audience" only helps a forger.
 */
import { useCallback, useState } from 'react';
import { useAuth } from './context';
import { GoogleCancelled, googleConfigured, requestGoogleCode } from './google';
import { useCopy, useLanguage } from '../i18n/context';

type Status = 'idle' | 'working' | 'unreachable' | 'refused';

/** The Google "G", unaltered. Their mark, their colours, their proportions. */
function GoogleMark() {
  return (
    <svg className="auth-google-g" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleButton() {
  const copy = useCopy();
  const [language] = useLanguage();
  const { signInWithGoogle } = useAuth();
  const [status, setStatus] = useState<Status>('idle');

  const onClick = useCallback(async () => {
    setStatus('working');
    try {
      const code = await requestGoogleCode();
      await signInWithGoogle(code, language);
      /* No navigation on success. Signing in changes what `resolveRoute`
         returns for this very route, and pushing a hash here would race it —
         the same reason the password form does not navigate either. */
      setStatus('idle');
    } catch (error) {
      if (error instanceof GoogleCancelled) {
        setStatus('idle');
        return;
      }
      /* The script not loading and the server refusing are different sentences
         to the reader: one says "try the form below", the other "try again". */
      setStatus(
        error instanceof Error && error.message.includes('google identity') ? 'unreachable' : 'refused',
      );
    }
  }, [language, signInWithGoogle]);

  if (!googleConfigured()) return null;

  return (
    <div className="auth-google">
      <div className="auth-or">
        <span>{copy.auth.orDivider}</span>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-lg auth-google-btn"
        onClick={() => void onClick()}
        disabled={status === 'working'}
      >
        <GoogleMark />
        {status === 'working' ? copy.auth.googleWorking : copy.auth.googleContinue}
      </button>

      {status === 'unreachable' && <p className="field-error">{copy.auth.googleUnreachable}</p>}
      {status === 'refused' && <p className="field-error">{copy.auth.googleRefused}</p>}
    </div>
  );
}
