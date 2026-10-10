/**
 * "Invite friends" — a button at the top of the Play screen, and the panel it
 * opens down the right-hand edge.
 *
 * **It was a section of the page, and the owner asked for it not to be.** The
 * card sat in the screen's flow under the week, between the readings a player
 * opens this screen for and the games, and the note on it was blunt: it should
 * not be part of the page, it should be a screen of its own that comes in from
 * the right "like the AI assistant". So the page keeps one control — the button
 * beside the title, carrying the server's reward figure — and everything the
 * card did lives in the panel.
 *
 * **Modal, unlike the assistant, and for the reason the assistant is not.** The
 * dock is consulted *while reading*; nothing on the Play screen is what an
 * invite is about, so there is no page to keep live behind it. It is a task —
 * copy the link, send it, see who came — with a scrim, a focus trap, the page
 * held still, and three ways out: the cross, Escape, and a press on the scrim.
 * **One side panel at a time.** Opening this one closes the dock
 * (`closeAssistant`) — the dock is not modal and may be open over this very
 * page, and a card left open under this scrim is a panel nobody can reach — and
 * the dock opening (`ASSISTANT_OPEN_EVENT`) closes this one. The scrim sits
 * above the dock's button too, so neither can land on this panel's controls.
 *
 * In the order somebody uses them:
 *
 * - **The reward, from the server, with its condition.** `GET /v1/referrals`
 *   carries `referrerReward`, `inviteeReward` and the milestone straight out of
 *   `CONFIG.earn` (rulebook §7.3: 100 each, on the friend's first *confirmed
 *   visit*, 500 at five). The panel states the visit condition because "get
 *   100" alone promises the points at sign-up, which is not when they pay — and
 *   the button prints the figure only once the server has said it.
 * - **The link, visible, with Copy beside it.** A link rather than the bare code
 *   because a link carries the code into the sign-up form (`auth/referral.ts`).
 *   Printed in a read-only field so it can be checked before it is sent and
 *   selected by hand where the clipboard API is missing (an `http:` page, an
 *   older in-app browser) — Copy falls back to that selection rather than being
 *   a press that does nothing. The code is printed too, for the friend whose
 *   link opened in an in-app browser and who has to type it.
 * - **Progress, from the server**: joined, visited, points actually received
 *   (the ledger, reversals netted), the milestone as a bar, and the friends
 *   themselves — all of them now, since the panel scrolls on its own and the
 *   page no longer pays for every row.
 *
 * **Why the web link is `/sign-in?ref=` and not the server's `link`.** The
 * server's is `/i/<code>`, built for the phone: the app claims that path, and
 * the page behind it on the web is a "get the app" card. A friend opening a link
 * a *web* player sent should land on the web sign-up with the code in the
 * field, on a phone or a laptop alike — and `/i/<code>` now also remembers the
 * code and offers the web sign-up, so either link ends in the same place.
 *
 * A failed request says so with a retry rather than showing zeros — "we could
 * not ask" and "nobody joined yet" are different findings (the `useApi` rule).
 * The button and the panel read **one** request: the button needs the figure,
 * the panel needs everything, and two fetches of one answer can disagree.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { Referrals } from './api/consumer';
import { useApi, type ApiState } from './api/useApi';
import { inviteLink } from './auth/referral';
import { ASSISTANT_OPEN_EVENT, closeAssistant } from './content';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';

/**
 * How long the panel takes to leave, in ms — the `play-invite-out` keyframe's
 * duration in `site.css`, restated because the panel has to stay mounted until
 * it has finished. Shorter than the way in: a sheet you dismissed should be
 * gone, and one you opened should be seen arriving.
 */
const EXIT_MS = 200;

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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What Tab may land on inside the panel — visible, enabled, in order. */
const focusableIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => node.getClientRects().length > 0,
  );

const reducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/* ═══════════════════════════════════════════════════════════ the button ══ */

/**
 * The Play screen's way in: a button beside the title, with the panel behind it.
 *
 * Beside the title rather than where the card used to stand, because the card's
 * old place was under the deck, the email check and the week — three screens of
 * scroll on a phone — and a door nobody passes is not an entry point. Up here
 * it is the first control on the screen after the header.
 */
export function InviteFriends() {
  const copy = useCopy().games.inviteCard;
  const { state, reload } = useApi<Referrals>('/v1/referrals');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const onOpen = () => {
    /* One side panel at a time. The dock is not modal and may be open over
       this very page; it closes without taking focus back to its own button,
       because focus is about to move in here. */
    closeAssistant();
    setOpen(true);
  };

  /* The figure on the button only once the server has said it — a number typed
     here while the answer is on its way is the invented figure the card was
     rebuilt to remove. */
  const r = state.status === 'ready' ? state.data : null;
  const gift =
    r === null
      ? null
      : r.referrerReward === r.inviteeReward
        ? fill(copy.tileBoth, { n: String(r.referrerReward) })
        : fill(copy.tileSplit, { mine: String(r.referrerReward) });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="play-invite-tile"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onOpen}
      >
        <span className="play-invite-tile-ico" aria-hidden>
          <Icon name="people" size={16} strokeWidth={2} />
        </span>
        <span className="play-invite-tile-label">{copy.kicker}</span>
        {gift && <span className="play-invite-tile-gift">{gift}</span>}
        <span className="play-invite-tile-arrow" aria-hidden>
          <Icon name="arrow" size={14} strokeWidth={2.4} />
        </span>
      </button>

      {open && (
        <InvitePanel
          state={state}
          reload={reload}
          returnFocus={triggerRef}
          onClosed={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════ the panel ══ */

function InvitePanel({
  state,
  reload,
  returnFocus,
  onClosed,
}: {
  state: ApiState<Referrals>;
  reload: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
  /** Called once the panel has finished leaving, to unmount it. */
  onClosed: () => void;
}) {
  const copy = useCopy().games.inviteCard;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * Leaving is a state, because the sheet has to stay on screen while it slides
   * out. One flip per close — nothing per frame goes through React here; the
   * motion is two CSS keyframes keyed off `data-leaving`.
   */
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Whether closing hands focus back to the button. Not when the dock is what
     closed us: focus is on its way into the dock, and taking it back to this
     button would undo that a frame later. */
  const giveBackFocus = useRef(true);

  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  const close = useCallback(() => {
    if (leaveTimer.current !== null) return;
    setLeaving(true);
    leaveTimer.current = setTimeout(() => onClosedRef.current(), reducedMotion() ? 0 : EXIT_MS);
  }, []);

  useEffect(
    () => () => {
      if (leaveTimer.current !== null) clearTimeout(leaveTimer.current);
    },
    [],
  );

  /* The dock opening (the footer's entry, a suggested question) closes this. */
  useEffect(() => {
    const onAssistant = () => {
      giveBackFocus.current = false;
      close();
    };
    window.addEventListener(ASSISTANT_OPEN_EVENT, onAssistant);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onAssistant);
  }, [close]);

  /*
   * Modal, properly — the effect `VenueSheet` and `GetApp` run: Escape closes,
   * Tab and Shift+Tab cycle inside the panel, the page behind does not scroll,
   * and focus goes back to the button that opened it.
   *
   * StrictMode runs this, tears it down and runs it again. Harmless by
   * construction: the teardown restores exactly what the setup changed.
   */
  useEffect(() => {
    const panel = panelRef.current;
    const trigger = returnFocus.current;
    panel?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const targets = focusableIn(panel);
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active) || active === panel;
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    /* Restored rather than cleared: a page that was already locked by
       something else stays locked. */
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      if (giveBackFocus.current && trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [close, returnFocus]);

  /* A text selection dragged out of the panel and released over the scrim is a
     click on the scrim, and it must not throw away the link being selected. */
  const pressedScrim = useRef(false);

  return createPortal(
    <div
      className="play-invite-scrim"
      data-leaving={leaving ? 'true' : undefined}
      onPointerDown={(event) => {
        pressedScrim.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedScrim.current && event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className="play-invite-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="play-invite-head">
          <h2 className="play-invite-title" id={titleId}>
            <span className="play-invite-title-ico" aria-hidden>
              <Icon name="people" size={15} strokeWidth={2} />
            </span>
            {copy.kicker}
          </h2>
          <button type="button" className="play-invite-close" onClick={close} aria-label={copy.close}>
            <Icon name="close" size={15} strokeWidth={2.4} />
          </button>
        </div>

        <div className="play-invite-body">
          {state.status === 'loading' ? (
            <p className="play-invite-note" role="status">
              {copy.loading}
            </p>
          ) : state.status === 'error' ? (
            <div className="play-invite-down" role="alert">
              <p className="play-invite-note">{copy.unavailable}</p>
              <button type="button" className="btn btn-ghost play-invite-retry" onClick={reload}>
                {copy.retry}
              </button>
            </div>
          ) : (
            <InviteBody r={state.data} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════════════ the content ══ */

function InviteBody({ r }: { r: Referrals }) {
  const copy = useCopy().games.inviteCard;
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

  const link = inviteLink(r.code);
  const shareText = fill(copy.shareText, { link });
  /* Only where the platform has a share sheet — a phone, mostly. A desktop
     "Share" that opened nothing would be a button that exists to fail. */
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  /* One sentence when both sides are paid the same, two figures when not —
     the server owns both numbers and they need not stay equal. */
  const same = r.referrerReward === r.inviteeReward;
  const rule = same
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
    <>
      {/* The reward as a figure first and a sentence second: the figure is
          what a glance takes away, the sentence is the condition on it. */}
      <div className="play-invite-reward">
        {same ? (
          <p>
            <b>+{r.referrerReward}</b>
            <span>{copy.rewardEach}</span>
          </p>
        ) : (
          <>
            <p>
              <b>+{r.referrerReward}</b>
              <span>{copy.rewardMine}</span>
            </p>
            <p>
              <b>+{r.inviteeReward}</b>
              <span>{copy.rewardTheirs}</span>
            </p>
          </>
        )}
      </div>
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

      {/* Three figures as three tiles: as a line of grey text they were read
          as one number with two dots in it. */}
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

      <section className="play-invite-friends" aria-labelledby="play-invite-friends">
        <h3 id="play-invite-friends">{copy.friends}</h3>
        {r.people.length > 0 ? (
          <ul className="play-invite-people">
            {r.people.map((p, i) => (
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
        ) : (
          /* "Nobody yet" is a finding, and an empty list under a heading reads
             as one that failed to load. */
          <p className="play-invite-note">{copy.friendsEmpty}</p>
        )}
      </section>

      {/* Announced from here, so the button keeps its name. */}
      <span className="visually-hidden" role="status">
        {copied === 'yes' ? copy.copied : ''}
      </span>
    </>
  );
}
