import { useState } from 'react';
import { startCheckout } from './api/consumer';
import { useAuth } from './auth/context';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import { Icon } from './icons';
import { PATHS } from './router';

/**
 * "Get Pro" — the one control that takes money.
 *
 * It has three faces, and which one it wears is decided by what the site can
 * honestly do next:
 *
 *   * **Signed out** — a link to sign-in. Checkout needs an account to attach
 *     the subscription to, so the honest next step is the account, and a button
 *     goes where its words say. This is what the whole section used to be: one
 *     press to sign in, because there was no checkout behind any of it.
 *   * **Already on this plan** — a word, not a control. A button that would
 *     charge somebody for what they already have is not a button.
 *   * **Signed in, on something else** — a real press: ask the server for a
 *     Checkout Session and follow it.
 *
 * Nothing is written on the way out. The subscription appears when Stripe's
 * webhook says the money moved, so this component's job ends at the redirect —
 * and the plan badge changes on the next load rather than optimistically here,
 * because a badge that flipped before the payment cleared would be a lie for
 * everybody who abandoned the page.
 */
export function SubscribeButton({
  planCode,
  planName,
  size = 'md',
}: {
  planCode: 'free' | 'pro' | 'premium';
  /** The plan's own name, as the surrounding card already spells it. */
  planName: string;
  size?: 'md' | 'lg';
}) {
  const copy = useCopy().subscription;
  const { account, plan } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /* The free plan is not sold. Nothing to press. */
  if (planCode === 'free') return null;

  const className = `btn btn-solid${size === 'lg' ? ' btn-lg' : ''} sub-buy`;

  if (!account) {
    return (
      <a className={className} href={PATHS.signin}>
        <Icon name="arrow" size={16} strokeWidth={2.2} />
        {fill(copy.get, { plan: planName })}
      </a>
    );
  }

  if (plan?.code === planCode) {
    return (
      <p className="sub-current">
        <Icon name="check" size={15} strokeWidth={2.4} />
        {copy.current}
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const session = await startCheckout(planCode);
            /* `assign` rather than `replace`: coming back from a payment page
               with the browser's own Back button should land on the plans, not
               on whatever preceded them. */
            window.location.assign(session.url);
          } catch {
            /* Deliberately not the server's words. Every failure here is the
               same thing to a reader — the payment page did not open — and the
               useful half is that pressing again is worth trying. */
            setFailed(true);
            setBusy(false);
          }
        }}
      >
        <Icon name="arrow" size={16} strokeWidth={2.2} />
        {busy ? copy.opening : fill(copy.get, { plan: planName })}
      </button>
      {failed && (
        <p className="sub-failed" role="alert">
          {copy.failed}
        </p>
      )}
    </>
  );
}
