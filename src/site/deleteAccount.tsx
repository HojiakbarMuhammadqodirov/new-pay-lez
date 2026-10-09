import { useState } from 'react';
import { ApiError, call, hasToken } from './api/client';
import { useAuth } from './auth/context';
import { SALES_EMAIL } from './content';
import { PATHS } from './router';

/**
 * `/delete-account` — the account-deletion URL Google Play requires.
 *
 * Play's rule is that the page names the app, says how to ask for deletion and
 * says what is deleted and what is kept, and that it is reachable without the
 * app. So it answers anybody: signed out it is the instructions; signed in it
 * is also the button.
 *
 * The button is the same `DELETE /v1/me` the app calls, with the same
 * confirmation — the account's own email typed out — because an erasure a
 * stray press can trigger is one nobody can undo. What the server clears and
 * keeps is `consent.eraseUser`; the two lists below describe that function and
 * must change when it does.
 *
 * English only, like the invite and tag pages, and `noindex`.
 */

/* The account's email may be missing from an old local mirror; the server
   checks against its own copy, so this is only the hint in the field. */
export function DeleteAccountPage() {
  const { account, signOut } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const signedIn = account !== null && hasToken();
  const matches = signedIn && typed.trim().toLowerCase() === account.email.toLowerCase();

  async function erase() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await call<{ erased: true }>('/v1/me', { method: 'DELETE', body: { confirmEmail: typed.trim() } });
      setDone(true);
      signOut();
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError && failure.status === 422
          ? 'That is not the email this account signs in with.'
          : 'We could not reach the server. Nothing was deleted — try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="section auth" id="delete-top">
        <div className="wrap auth-wrap">
          <div className="auth-card">
            <span className="eyebrow">Paylez account</span>
            {done ? (
              <>
                <h1>Your account is deleted</h1>
                <p className="auth-lede">
                  You have been signed out on this device, and every other session has ended.
                  Thank you for trying Paylez.
                </p>
                <a className="btn btn-ghost auth-submit" href={PATHS.landing}>
                  Back to the home page
                </a>
              </>
            ) : (
              <>
                <h1>Delete your Paylez account</h1>
                <p className="auth-lede">
                  This deletes the account you use in the Paylez app and on pay-lez.com. It cannot
                  be undone, and any points, vouchers and streak on it are lost.
                </p>

                <h2 className="field-label">How to delete it</h2>
                <ol className="auth-lede">
                  <li>
                    {signedIn ? 'Type your email below and press Delete.' : <>
                      <a href={PATHS.signin}>Sign in</a> on this website, come back to this page, type
                      your email and press Delete.
                    </>}
                  </li>
                  <li>
                    Or email <a href={`mailto:${SALES_EMAIL}?subject=Account%20deletion`}>{SALES_EMAIL}</a>{' '}
                    from the address on the account, with the subject “Account deletion”. We
                    delete it within 30 days and reply when it is done.
                  </li>
                </ol>

                <h2 className="field-label">What is deleted</h2>
                <ul className="auth-lede">
                  <li>Your name, email, username, phone, birthday, city and profile photo</li>
                  <li>Your sign-in sessions, devices and push notifications</li>
                  <li>Your friends list, the words of any review, and every venue’s access to your profile</li>
                </ul>

                <h2 className="field-label">What is kept</h2>
                <ul className="auth-lede">
                  <li>
                    A venue’s record of past visits and payments, with nothing that names you, because
                    the venue’s accounts must still add up
                  </li>
                  <li>A note that the account was erased and when, which the law requires us to keep</li>
                </ul>

                {signedIn && (
                  <>
                    <label className="field">
                      <span className="field-label">Type {account.email} to confirm</span>
                      <input
                        type="email"
                        autoComplete="off"
                        value={typed}
                        onChange={(event) => {
                          setTyped(event.target.value);
                          setError(null);
                        }}
                      />
                    </label>
                    {error && (
                      <p className="field-error" role="alert">
                        {error}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn btn-solid btn-lg auth-submit"
                      disabled={!matches || busy}
                      onClick={() => void erase()}
                    >
                      {busy ? 'Deleting…' : 'Delete my account'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
