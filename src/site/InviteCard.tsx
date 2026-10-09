/**
 * "Invite friends" — the Play screen's way to actually send an invite.
 *
 * What stood here first was a rotating line, "Invite a friend to get 100", with
 * nothing behind it. The card that replaced it showed the code and a Copy
 * button, but still printed three figures of its own (`INVITE_POINTS` and the
 * milestone pair in `content.ts`), never showed the link it copied, and put
 * "0 joined · 0 visited · 0 points earned" in one grey line.
 *
 * In the order somebody uses them:
 *
 * - **The link, visible, with Copy beside it.** A link rather than the bare
 *   code because a link carries the code into the sign-up form
 *   (`auth/referral.ts`). Printed in a read-only field so it can be checked
 *   before it is sent and selected by hand where the clipboard API is missing
 *   (an `http:` page, an older in-app browser) — Copy falls back to that
 *   selection rather than being a press that does nothing. The code is printed
 *   too, for the friend whose link opened in an in-app browser and who has to
 *   type it.
 * - **The rule, from the server, with its condition.** `GET /v1/referrals`
 *   carries `referrerReward`, `inviteeReward` and the milestone straight out of
 *   `CONFIG.earn` (rulebook §7.3: 100 each, on the friend's first *confirmed
 *   visit*, 500 at five). The card states the visit condition because "get
 *   100" alone promises the points at sign-up, which is not when they pay.
 * - **Progress, from the server**: joined, visited, points actually received
 *   (the ledger, reversals netted), the milestone as a bar, and the friends
 *   themselves.
 *
 * **Why the web link is `/sign-in?ref=` and not the server's `link`.** The
 * server's is `/i/<code>`, built for the phone: the app claims that path, and
 * the page behind it on the web is a "get the app" card. A friend opening a
 * link a *web* player sent should land on the web sign-up with the code in the
 * field, on a phone or a laptop alike — and `/i/<code>` now also remembers the
 * code and offers the web sign-up, so either link ends in the same place.
 *
 * Nothing is drawn while the answer is loading, and a failed request says so
 * with a retry rather than showing zeros — "we could not ask" and "nobody
 * joined yet" are different findings (the `useApi` rule).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Referrals } from './api/consumer';
import { useApi } from './api/useApi';
import { inviteLink } from './auth/referral';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';

/** How many friends the card names; the counts above it cover the rest. */
const PEOPLE_SHOWN = 5;

/**
 * Copy text, the modern way first and the old way second.
 *
 * `navigator.clipboard` exists only in a secure context and is refused by some
 * in-app browsers; `execCommand('copy')` on a selected field still works in
 * most of those. Resolves `false` when neither did, and the field is left
 * selected so a long-press copies it by hand.
 */
async function copyText(text: string, field: HTMLInputElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Refused — fall through to the selection. */
  }
  if (!field) return false;
  field.focus();
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

export function InviteCard() {
  const copy = useCopy().games.inviteCard;
  const { state, reload } = useApi<Referrals>('/v1/referrals');
  const [copied, setCopied] = useState<'yes' | 'manual' | null>(null);
  const field = useRef<HTMLInputElement | null>(null);

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
        <button type="button" className="link-btn play-invite-retry" onClick={reload}>
          {copy.retry}
        </button>
      </section>
    );
  }

  const r = state.data;
  const link = inviteLink(r.code);
  const shareText = fill(copy.shareText, { link });
  /* Only where the platform has a share sheet — a phone, mostly. A desktop
     "Share" that opened nothing would be a button that exists to fail. */
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  /* One sentence when both sides are paid the same, two figures when not —
     the server owns both numbers and they need not stay equal. */
  const rule =
    r.referrerReward === r.inviteeReward
      ? fill(copy.ruleBoth, { n: String(r.referrerReward) })
      : fill(copy.ruleSplit, { mine: String(r.referrerReward), theirs: String(r.inviteeReward) });

  const goal = Math.max(1, r.friendMilestoneAt);
  const reached = r.completed >= goal;
  const toward = Math.min(r.completed, goal);

  const onCopy = () => {
    void copyText(link, field.current).then((ok) => {
      setCopied(ok ? 'yes' : 'manual');
      if (revert.current !== null) clearTimeout(revert.current);
      revert.current = setTimeout(() => setCopied(null), ok ? 1800 : 4000);
    });
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

      <p className="play-invite-line">{rule}</p>

      {/* The link, in a field that fills the row so any tap selects it. */}
      <div className="field play-invite-field">
        <label className="field-label" htmlFor="play-invite-link">
          {copy.linkLabel}
        </label>
        <div className="play-invite-linkrow">
          <input
            id="play-invite-link"
            ref={field}
            className="play-invite-link"
            readOnly
            value={link}
            translate="no"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className="btn btn-solid play-invite-copy" onClick={onCopy}>
            <Icon name={copied === 'yes' ? 'check' : 'copy'} size={15} />
            {copied === 'yes' ? copy.copied : copy.copy}
          </button>
        </div>
        {copied === 'manual' && <p className="field-help">{copy.copyManual}</p>}
      </div>

      <div className="play-invite-row">
        {/* `translate="no"`: a translated page must not turn a code into a word. */}
        <span className="play-invite-code" translate="no">
          <span className="play-invite-code-label">{copy.codeLabel}</span>
          <b>{r.code}</b>
        </span>
        {canShare && (
          <button type="button" className="btn btn-ghost play-invite-share" onClick={onShare}>
            <Icon name="send" size={15} />
            {copy.share}
          </button>
        )}
      </div>

      {/* Three figures as three tiles: the line of grey text they were read as
          one number with two dots in it. */}
      <dl className="play-invite-stats">
        <div>
          <dt>{copy.joined}</dt>
          <dd>{r.joined}</dd>
        </div>
        <div>
          <dt>{copy.visited}</dt>
          <dd>{r.completed}</dd>
        </div>
        <div>
          <dt>{copy.earned}</dt>
          <dd>{r.pointsEarned}</dd>
        </div>
      </dl>

      {/* The milestone is paid once (`friend_milestone` is keyed on the
          threshold in the ledger), so past it the bar becomes a fact. */}
      <div className="play-invite-goal">
        <p className="play-invite-goal-line">
          {reached
            ? fill(copy.goalDone, { bonus: String(r.friendMilestone), n: String(goal) })
            : fill(copy.goal, { done: String(toward), n: String(goal), bonus: String(r.friendMilestone) })}
        </p>
        <div
          className="play-invite-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={toward}
          aria-label={copy.goalLabel}
          style={{ '--fill': toward / goal } as CSSProperties}
        >
          <span />
        </div>
      </div>

      {r.people.length > 0 && (
        <ul className="play-invite-people" aria-label={copy.friends}>
          {r.people.slice(0, PEOPLE_SHOWN).map((p, i) => (
            <li key={`${p.joinedAt}-${i}`}>
              <span className="play-invite-name">{p.name}</span>
              <span className="play-invite-state" data-state={p.status}>
                {p.status === 'completed'
                  ? p.pointsAwarded > 0
                    ? fill(copy.statusPaid, { n: String(p.pointsAwarded) })
                    : copy.statusVisited
                  : copy.statusJoined}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Announced from here, so the button keeps its name. */}
      <span className="visually-hidden" role="status">
        {copied === 'yes' ? copy.copied : ''}
      </span>
    </section>
  );
}
