/**
 * What the two email-code screens share: the refusal sentences and the resend
 * cooldown.
 *
 * Two screens ask for the same six digits — `EmailCodeStep` right after
 * sign-up, and the `VerifyEmail` panel on Play and the wallet for everybody who
 * left it for later — and they used to answer a refusal differently. The panel
 * said each of the server's reasons in the reader's language; the step fell
 * back to the server's own `message`, which is English, and printed it verbatim
 * to readers of four other languages. One function now, so the step a new
 * account sees first cannot be the one that drifts.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api/client';
import type { Dictionary } from './i18n/en';
import { fill } from './i18n/currency';

/** Six digits, and nothing else is a code. */
export const CODE_LENGTH = 6;

type VerifyCopy = Dictionary['auth']['verify'];

/**
 * One sentence per refusal, keyed on the server's `code` rather than its
 * English `message`: wrong with tries left, too many tries, expired, nothing
 * sent, the hourly ceiling, another address, the route's rate limit.
 */
export function explainCodeError(error: unknown, copy: VerifyCopy): string {
  if (!(error instanceof ApiError)) return copy.failed;
  if (error.status === 0) return copy.offline;
  if (error.status === 429 || error.code === 'rate_limited') return copy.slowDown;
  switch (error.code) {
    case 'validation_failed': {
      const left = error.detail.attemptsLeft;
      if (typeof left !== 'number') return copy.failed;
      return left > 0 ? fill(copy.wrongWithTries, { n: String(left) }) : copy.spent;
    }
    case 'cap_reached':
      return copy.spent;
    case 'expired':
      return copy.expired;
    case 'not_found':
      return copy.noCode;
    case 'quota_exceeded':
      return copy.hourly;
    case 'conflict':
      return copy.otherAddress;
    default:
      return copy.failed;
  }
}

/** "0:42" — the cooldown is at most a minute or two, so minutes never grow. */
export const clock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The resend button's cooldown.
 *
 * The server refuses a resend inside its cooldown with `sent: false` and
 * `nextSendAt`, which is **not an error** — asking again too soon is what an
 * honest person does when a message is slow. So the button counts down to that
 * moment instead of staying pressable and being refused again. `hold` takes the
 * server's `nextSendAt` from any send answer, sent or not.
 *
 * It ticks once a second and only while there is a countdown. Whole seconds of
 * text, so React state is the right channel — the per-frame rule is about the
 * render loop, and this is a label that changes sixty times a minute at most.
 *
 * `left` is the label to show ("0:42"), or `null` when a resend may go now.
 */
export function useResendCooldown(): { left: string | null; hold: (nextSendAt: string) => void } {
  /* When the server will take another send, as epoch ms; `null` when it will now. */
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (resendAt === null) return;
    const tick = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= resendAt) setResendAt(null);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [resendAt]);

  const hold = useCallback((nextSendAt: string) => {
    const next = Date.parse(nextSendAt);
    if (Number.isFinite(next) && next > Date.now()) {
      setNow(Date.now());
      setResendAt(next);
    }
  }, []);

  return { left: resendAt !== null && resendAt > now ? clock(resendAt - now) : null, hold };
}
