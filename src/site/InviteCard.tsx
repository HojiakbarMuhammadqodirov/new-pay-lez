/**
 * "Invite friends" — the Play screen's way to actually send an invite.
 *
 * What stood here was a rotating line, "Invite a friend to get 100", with
 * nothing behind it: no code, no link, nothing to press. The server has always
 * had a code per account and `GET /v1/referrals`; the web simply never showed
 * either, so no invite could start on the website at all.
 *
 * Three things on the card, and the order is the order somebody uses them:
 *
 * - **The link**, copied or handed to the phone's share sheet. A link rather
 *   than the bare code because a link carries the code into the sign-up form
 *   (`auth/referral.ts`); the code is printed too, for the friend whose link
 *   opened in an in-app browser and who has to type it.
 * - **The rule, stated with its condition.** The reward is paid on the
 *   friend's first counted visit to a partner venue, not at sign-up, and a
 *   card that said only "get 100" would be promising it earlier than it pays.
 * - **Progress**, from the server: joined, visited, points actually received.
 *
 * Nothing is drawn while the answer is loading, and a failed request says so in
 * one line rather than showing zeros — "we could not ask" and "nobody joined
 * yet" are different findings (the `useApi` rule).
 */
import { useEffect, useRef, useState } from 'react';
import type { Referrals } from './api/consumer';
import { useApi } from './api/useApi';
import { inviteLink } from './auth/referral';
import { FRIEND_MILESTONE_AT, FRIEND_MILESTONE_POINTS, INVITE_POINTS } from './content';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';

export function InviteCard() {
  const copy = useCopy().games.inviteCard;
  const { state } = useApi<Referrals>('/v1/referrals');
  const [copied, setCopied] = useState(false);

  /* Cleared on unmount — the same reason `CounterCode` gives in venueSheet.tsx. */
  const revert = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (revert.current !== null) clearTimeout(revert.current);
    },
    [],
  );

  if (state.status === 'loading') return null;
  if (state.status === 'error') {
    return (
      <section className="play-invite" data-reveal>
        <span className="play-invite-kicker">
          <i>
            <Icon name="people" size={13} strokeWidth={2} />
          </i>
          {copy.kicker}
        </span>
        <p className="field-help">{copy.unavailable}</p>
      </section>
    );
  }

  const { code, joined, completed, pointsEarned } = state.data;
  const link = inviteLink(code);
  const shareText = fill(copy.shareText, { link });
  /* Only where the platform has a share sheet — a phone, mostly. A desktop
     "Share" that opened nothing would be a button that exists to fail. */
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const onCopy = () => {
    navigator.clipboard?.writeText(link).then(
      () => {
        setCopied(true);
        if (revert.current !== null) clearTimeout(revert.current);
        revert.current = setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  };

  const onShare = () => {
    /* A cancelled share sheet rejects, and that is the person deciding. */
    navigator.share?.({ title: 'Paylez', text: shareText, url: link }).catch(() => undefined);
  };

  return (
    <section className="play-invite" data-reveal>
      <span className="play-invite-kicker">
        <i>
          <Icon name="people" size={13} strokeWidth={2} />
        </i>
        {copy.kicker}
      </span>

      <p className="play-invite-line">{fill(copy.rule, { n: String(INVITE_POINTS) })}</p>

      <div className="play-invite-row">
        {/* `translate="no"`: a translated page must not turn a code into a word. */}
        <span className="play-invite-code" translate="no">
          <span className="play-invite-code-label">{copy.codeLabel}</span>
          <b>{code}</b>
        </span>
        <div className="play-invite-acts">
          <button type="button" className="btn btn-solid" onClick={onCopy}>
            <Icon name={copied ? 'check' : 'link'} size={15} />
            {copied ? copy.copied : copy.copy}
          </button>
          {canShare && (
            <button type="button" className="btn btn-ghost" onClick={onShare}>
              <Icon name="send" size={15} />
              {copy.share}
            </button>
          )}
        </div>
      </div>

      <p className="play-invite-progress">
        {fill(copy.progress, {
          joined: String(joined),
          visited: String(completed),
          points: String(pointsEarned),
        })}
      </p>
      <p className="field-help">
        {fill(copy.milestone, { n: String(FRIEND_MILESTONE_AT), bonus: String(FRIEND_MILESTONE_POINTS) })}
      </p>

      {/* Announced from here, so the button keeps its name. */}
      <span className="visually-hidden" role="status">
        {copied ? copy.copied : ''}
      </span>
    </section>
  );
}
