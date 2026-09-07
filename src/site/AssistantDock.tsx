import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ASSISTANT_OPEN_EVENT, type AssistantOpenDetail } from './content';
import { Icon } from './icons';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import { PATHS } from './router';
import {
  ask,
  isOutOfAsks,
  isUnreachable,
  resultLabel,
  resultMeta,
  startConversation,
  type AssistantAnswer,
} from './api/assistant';

/**
 * The assistant: a button in the bottom-left, and the screen it opens.
 *
 * The screen is a panel *over* the page rather than a route or a column beside
 * it — the assistant is something you consult while reading, so sending someone
 * to a different address to ask a question loses the thing they were asking
 * about. It grows out of the button that opened it, in the corner that button
 * sits in.
 *
 * **It is not modal, and it used to be.** It was a full-height drawer down the
 * left edge under a 42%-black scrim with the page behind it blurred and trapped
 * — which is the shape of an *alert*: something that has interrupted you and
 * must be dealt with before the page comes back. That contradicted the sentence
 * above it. You consult an assistant *while* reading, and a panel that blacks
 * out the thing you were reading has taken away the reason you opened it.
 *
 * So: a card in the corner, the page live behind it, no scrim, no focus trap
 * (`aria-modal` is gone with it — a non-modal dialog that claimed to be modal
 * would be lying to a screen reader). Escape closes it, the cross closes it, the
 * button toggles it, and focus goes back to the button every time. A press on
 * the *page* deliberately does not close it — see the note in the effect.
 *
 * Button and panel are one component with one piece of state rather than two
 * components and a context: they are siblings that only ever talk to each
 * other, and a context for a boolean is a context too many.
 *
 * ## The answers are real now, and that changes what has to be drawn
 *
 * This file used to end with "the composer is real; the answers are not" — the
 * reply was a canned line saying no model was connected, on the argument that a
 * fake answer dressed as a real one is the wrong kind of finished. That was
 * right, and it has expired: `api/assistant.ts` calls the server's retrieval
 * assistant, which composes from **this account's own points, vouchers, streak
 * and city** and may hand the sentence to a model to reword before returning it.
 *
 * Three things follow, and each of them is a state this panel now has to draw
 * rather than a line of copy it can print:
 *
 * - **A real call takes time**, and the model leg has a three-second timeout on
 *   the server. So there is a *thinking* turn, put in the thread the instant the
 *   question is sent rather than a spinner somewhere else: the question you just
 *   asked stays on screen with something happening under it, which is the whole
 *   difference between "it is working" and "did that send?".
 * - **The facts are the receipt, not decoration.** Every figure in the sentence
 *   was checked against `answer.facts` on the server before it was returned
 *   (`onlyKnownNumbers`), so drawing the facts under the answer is what makes
 *   "640 points" something a reader can verify rather than something they have
 *   to trust. A panel that hid them would be asking for exactly the trust the
 *   server went to the trouble of not needing.
 * - **A refusal is a state and not an error.** Over the daily allowance the
 *   server refuses rather than quietly answering from a cheaper path — the note
 *   in `http/routes/consumer.ts` argues that — so "that is your questions for
 *   today", "the server is not there" and "something broke" are three different
 *   panels here, the same distinction `useApi` draws with its union one file
 *   over. Never collapse them: the first is the product working as designed and
 *   the other two are not.
 *
 * The results and the action are drawn as **text and one link**, not as cards
 * you can press. A venue row has an id and this site has no venue route to open
 * it in, and a row styled like a control that does nothing is the "picture of a
 * control" this repo's own rule forbids. The one thing that *is* pressable is
 * `answer.action`, because the server sent somewhere real to go.
 */

/* ────────────────────────────────────────────────────────────────── turns ── */

/**
 * One entry in the thread.
 *
 * A discriminated union rather than a row with four optional fields, because
 * the four states are genuinely different things to draw and the compiler
 * should be the thing that notices a new one has not been handled — a
 * `text?: string` that is empty during `thinking` is a state machine written in
 * `undefined`.
 */
/**
 * A question the dock was opened with, and the press it came from.
 *
 * `seq` is what makes two presses of one chip two questions and one press one
 * question — see the effect in `Panel` that reads it, which is the only place
 * either field is used.
 */
interface Opening {
  text: string;
  seq: number;
}

type Turn =
  | { id: number; from: 'you'; text: string }
  | { id: number; from: 'bot'; state: 'thinking' }
  | { id: number; from: 'bot'; state: 'answer'; answer: AssistantAnswer }
  | {
      id: number;
      from: 'bot';
      state: 'error';
      kind: 'limit' | 'offline' | 'failed';
      detail: string | null;
    };

/* ─────────────────────────────────────────────────────────────── the reply ── */

/** The three dots. Motion is CSS; `prefers-reduced-motion` stills them there. */
function Thinking({ label }: { label: string }) {
  return (
    <p className="ai-typing" role="status">
      <span className="visually-hidden">{label}</span>
      <span className="ai-dot" aria-hidden />
      <span className="ai-dot" aria-hidden />
      <span className="ai-dot" aria-hidden />
    </p>
  );
}

/**
 * The figures the sentence above was built from.
 *
 * Rendered as label/value pairs rather than as prose, because that is what they
 * are — the server's `facts` array, one entry per number it was allowed to use.
 * Reading them should feel like checking a receipt, not like a second paragraph.
 */
function Facts({ answer }: { answer: AssistantAnswer }) {
  if (answer.facts.length === 0) return null;
  return (
    <ul className="ai-facts">
      {answer.facts.map((fact, at) => (
        <li className="ai-fact" key={`${fact.kind}-${fact.id ?? at}`}>
          <b>{fact.value}</b>
          <span>{fact.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The rows behind an answer — venues, guidance services, deals.
 *
 * Deliberately not pressable; see the header note. A row with no readable name
 * is dropped rather than drawn empty, which is `resultLabel` returning null.
 */
function Results({ answer }: { answer: AssistantAnswer }) {
  const rows = answer.results
    .map((row) => ({ row, label: resultLabel(row) }))
    .filter((entry): entry is { row: (typeof entry)['row']; label: string } => entry.label !== null);

  if (rows.length === 0) return null;

  return (
    <ul className="ai-results">
      {rows.map((entry, at) => (
        <li className="ai-result" key={entry.row.id ?? `${entry.label}-${at}`}>
          <b>{entry.label}</b>
          {resultMeta(entry.row) && <span>{resultMeta(entry.row)}</span>}
        </li>
      ))}
    </ul>
  );
}

function Answer({ answer, onNavigate }: { answer: AssistantAnswer; onNavigate: () => void }) {
  return (
    <>
      <p>{answer.text}</p>
      <Facts answer={answer} />
      <Results answer={answer} />
      {answer.action && (
        <a className="ai-action" href={answer.action.href} onClick={onNavigate}>
          {answer.action.label}
          <Icon name="arrow" size={14} strokeWidth={2.4} />
        </a>
      )}
    </>
  );
}

/* ───────────────────────────────────────────────────────────────── thread ── */

function Thread({
  turns,
  copy,
  onNavigate,
  onRetry,
}: {
  turns: Turn[];
  copy: ReturnType<typeof useCopy>['assistantPanel'];
  onNavigate: () => void;
  onRetry: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  /* Keep the newest turn in view as the thread grows. `turns` rather than its
     length: a turn that goes from thinking to answered is the same length and
     is exactly when the view needs to move. */
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  return (
    <div className="ai-thread">
      {turns.map((turn) => (
        <div className="ai-turn" key={turn.id} data-from={turn.from}>
          {turn.from === 'you' ? (
            <p>{turn.text}</p>
          ) : turn.state === 'thinking' ? (
            <Thinking label={copy.thinking} />
          ) : turn.state === 'answer' ? (
            <Answer answer={turn.answer} onNavigate={onNavigate} />
          ) : (
            <div className="ai-error">
              <p>
                {turn.kind === 'limit'
                  ? copy.limitReached
                  : turn.kind === 'offline'
                    ? copy.offline
                    : copy.failed}
                {/* The server's own words, verbatim and untranslated — the same
                    rule the admin console states. These refusals name which gate
                    closed, and a dictionary sentence general enough to cover
                    them all would name none. */}
                {turn.detail && <span className="ai-error-why">{turn.detail}</span>}
              </p>
              {/* No retry on `limit`: pressing it would spend a request to be
                  told the same thing, which is a button that exists to fail. */}
              {turn.kind !== 'limit' && (
                <button type="button" className="ai-retry" onClick={onRetry}>
                  {copy.retry}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── composer ── */

function Composer({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const copy = useCopy();
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue('');
    // Reset the grown height with the content.
    if (ref.current) ref.current.style.height = 'auto';
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line — the convention every chat
    // composer has trained people into.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="ai-composer">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        /* 500 is the server's own ceiling on `text`. Enforced here as well so a
           long question is trimmed while it is being typed rather than refused
           after it has been sent. */
        maxLength={500}
        placeholder={copy.assistantPanel.placeholder}
        aria-label={copy.assistantPanel.placeholder}
        onChange={(event) => {
          setValue(event.target.value);
          /* Grow to fit. Measured off `scrollHeight` after collapsing to auto,
             which is the only way to let it shrink again as well as grow. */
          const node = event.target;
          node.style.height = 'auto';
          node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="ai-send"
        onClick={submit}
        disabled={!value.trim() || busy}
        aria-label={copy.assistantPanel.send}
      >
        <Icon name="send" size={17} strokeWidth={2} />
      </button>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── panel ── */

function Panel({
  onClose,
  titleId,
  opening,
  onOpeningAsked,
}: {
  onClose: () => void;
  titleId: string;
  /** A question the panel was opened *with* — see `openAssistant`. */
  opening: Opening | null;
  onOpeningAsked: () => void;
}) {
  const copy = useCopy();
  const [language] = useLanguage();
  const { account } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  const nextId = useRef(0);
  /*
   * The conversation this panel is in, and the last thing asked.
   *
   * Both are refs rather than state because nothing renders from them: the id
   * is bookkeeping the server needs and the question is what a retry re-sends.
   * Putting either in state would re-render the thread to store a string.
   */
  const sessionRef = useRef<string | null>(null);
  const lastAskRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  /* A question in flight when the panel closes is a question nobody is waiting
     for; letting it land would set state on an unmounted tree. */
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      lastAskRef.current = text;

      const youId = nextId.current;
      const botId = youId + 1;
      nextId.current += 2;

      setTurns((current) => [
        ...current,
        { id: youId, from: 'you', text },
        { id: botId, from: 'bot', state: 'thinking' },
      ]);
      setBusy(true);

      /* Replaces the thinking turn in place, so the answer arrives where the
         dots were rather than under them. */
      const settle = (turn: Turn) =>
        setTurns((current) => current.map((row) => (row.id === botId ? turn : row)));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        /*
         * Open the conversation on the first question, not when the panel
         * opens: a panel somebody glanced at and closed should not leave a row
         * on the server. Failing to open one is deliberately **not** fatal —
         * the ask endpoint mints its own session when none is named, so a
         * bookkeeping call that did not land must not cost the person their
         * answer.
         */
        if (!sessionRef.current) {
          try {
            sessionRef.current = await startConversation(language);
          } catch {
            sessionRef.current = null;
          }
        }

        const answer = await ask({
          text,
          sessionId: sessionRef.current ?? undefined,
          language,
          signal: controller.signal,
        });
        settle({ id: botId, from: 'bot', state: 'answer', answer });
      } catch (error) {
        /*
         * An abandoned question leaves nothing behind.
         *
         * This used to `return` and leave the pair in the thread: a question
         * with dots under it that never resolve, because the only thing that
         * settles them is the reply that was cancelled. It is visible in dev
         * every time — StrictMode tears the panel's effects down and runs them
         * again, and the teardown above aborts whatever is in flight — and it
         * is visible in production the moment a request is abandoned for any
         * other reason. A thread is a record of the conversation; an exchange
         * that did not happen should not be in it.
         */
        if (controller.signal.aborted) {
          setTurns((current) => current.filter((row) => row.id !== youId && row.id !== botId));
          return;
        }
        settle({
          id: botId,
          from: 'bot',
          state: 'error',
          kind: isOutOfAsks(error) ? 'limit' : isUnreachable(error) ? 'offline' : 'failed',
          /* The plan's own limit is in the server's message ("plan allows 5"),
             and it is the one number this screen cannot compute for itself. */
          detail: error instanceof Error && error.message ? error.message : null,
        });
      } finally {
        if (!controller.signal.aborted) setBusy(false);
        abortRef.current = null;
      }
    },
    [language],
  );

  /*
   * A question the panel was opened with is asked once, here.
   *
   * It has to live below `send` and above the signed-out return, which is the
   * only place all three of those things exist.
   *
   * **The guard is the `seq`, and both halves of that are load-bearing.**
   * Clearing the dock's state and testing for non-null was the first version
   * and it asked everything twice: StrictMode runs an effect, tears it down and
   * runs it again against the *same* props, and the clear had not committed in
   * between — two identical questions in the thread, the first still spinning
   * under the second. And a plain string cannot be the guard either, because
   * setting state to the string it already holds is a bail-out in React: the
   * same chip pressed a second time would not re-render, so the second press
   * would do nothing at all. A number that goes up on every dispatch says
   * "asked once each" and "asked again" with one comparison.
   *
   * Signed out it is dropped rather than queued: the panel below is the pitch,
   * and holding a question against a sign-in that may never happen means
   * something somebody pressed minutes ago arriving out of nowhere.
   */
  const askedRef = useRef(-1);
  useEffect(() => {
    if (!opening || !account) return;
    if (askedRef.current === opening.seq) return;
    askedRef.current = opening.seq;
    onOpeningAsked();
    void send(opening.text);

    /* And the guard has to let a *re-run* through. StrictMode proves an effect
       can be restarted by tearing it down and running it again, and the
       teardown one effect up aborts the request in between — a guard that
       refused the second run would leave the question hanging with nothing
       coming back, which is exactly what it did before this line existed. */
    return () => {
      askedRef.current = -1;
    };
  }, [opening, account, send, onOpeningAsked]);

  /* Retry drops the failed exchange and asks again, rather than appending a
     second copy of the question under the first. The thread is a record of the
     conversation, and a question asked once should appear once. */
  const retry = useCallback(() => {
    const text = lastAskRef.current;
    if (!text || busy) return;
    setTurns((current) => current.slice(0, -2));
    void send(text);
  }, [busy, send]);

  /*
   * Signed out: the same panel, showing what it is for.
   *
   * It was a centred icon, a heading, a sentence and a button — the layout of a
   * permission dialog, which is exactly the thing this panel was accused of
   * being. It reads as a wall in front of a feature nobody has seen. Now the
   * suggestions are visible (they *are* the pitch — three questions this thing
   * can answer), the composer is where it will be, and the sign-in row is the
   * last thing rather than the only thing.
   */
  if (!account) {
    return (
      <div className="ai-body">
        <div className="ai-greet">
          <h2 id={titleId}>{copy.assistantPanel.lockedTitle}</h2>
          <p>{copy.assistantPanel.lockedBody}</p>
        </div>

        <div className="ai-foot">
          {/*
            Links, not decorated spans.

            These were `<span className="chip">` inside an `aria-hidden` wrapper:
            pixel-identical to the chips a signed-in reader presses, and inert.
            That is the "picture of a control" this repo's own rule forbids, and
            the rule is at its sharpest here — a question you are *invited* to
            ask, that does nothing when you ask it, is the panel demonstrating
            the opposite of what it claims to do.

            They go where the button under them goes. Pressing a question is a
            reader saying "I want to ask this", and sign-in is the honest next
            step for it.
          */}
          <div className="chips ai-suggestions">
            {copy.assistantPanel.suggestions.map((suggestion) => (
              <a className="chip" key={suggestion} href={PATHS.signin} onClick={onClose}>
                {suggestion}
              </a>
            ))}
          </div>
          <a className="btn btn-solid ai-signin" href={PATHS.signin} onClick={onClose}>
            {copy.assistantPanel.lockedAction}
          </a>
        </div>
      </div>
    );
  }

  const empty = turns.length === 0;

  return (
    <div className="ai-body">
      {empty ? (
        <div className="ai-greet">
          <h2 id={titleId}>
            {/* First name: "Hello, Ali Akbarov" reads like a letter from a bank. */}
            {fill(copy.assistantPanel.greeting, { name: account.name.split(' ')[0] })}
          </h2>
          <p>{copy.assistantPanel.lede}</p>
        </div>
      ) : (
        <>
          <h2 id={titleId} className="visually-hidden">
            {copy.assistantPanel.title}
          </h2>
          <Thread
            turns={turns}
            copy={copy.assistantPanel}
            onNavigate={onClose}
            onRetry={retry}
          />
        </>
      )}

      <div className="ai-foot">
        <Composer onSend={(text) => void send(text)} busy={busy} />
        {empty && (
          <div className="chips ai-suggestions">
            {copy.assistantPanel.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="chip"
                onClick={() => void send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── the dock ── */

export function AssistantDock() {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  /* A question an opener sent along with the open. State rather than a ref
     because the panel renders from it — it is the thing that gets asked. */
  const [opening, setOpening] = useState<Opening | null>(null);
  const seqRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    /* A question that never got asked must not survive the panel — reopening
       from the button would then ask something the person walked away from. */
    setOpening(null);
    // Back where they came from, or the tab order restarts at the top of the page.
    triggerRef.current?.focus();
  }, []);

  /* Opened from somewhere that is not this button — the footer's "AI Assistant"
     entry, which names the dock rather than a page, and Relocate's suggested
     questions, which name a question and now carry it. See `openAssistant`. */
  useEffect(() => {
    const onOpen = (event: Event) => {
      /* Read defensively: the footer opens with no detail at all, and the cast
         is the only place this file trusts the event's shape. */
      const detail = (event as CustomEvent<AssistantOpenDetail>).detail;
      setOpen(true);
      seqRef.current += 1;
      setOpening(detail?.text ? { text: detail.text, seq: seqRef.current } : null);
    };
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
  }, []);

  const clearOpening = useCallback(() => setOpening(null), []);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    /*
     * **A press on the page does not close it**, and that is the whole reason
     * this panel stopped being modal.
     *
     * An outside-press handler was here, inherited from the scrim it replaced,
     * and it undid the change: the panel exists so you can consult it *while
     * reading*, and dismissing it on any press means selecting a word, following
     * a link or tapping a card takes it away mid-question. A scrim closing on a
     * press is right — the scrim is a "get out of the way" target and nothing
     * else. A live page is not one.
     *
     * Three ways out is already one more than most things here get: the cross in
     * the header, Escape, and the button, which toggles.
     *
     * There is deliberately **no focus trap** either. Tab out of the composer
     * and you are in the page, which is correct for a non-modal dialog and is
     * the point of this one: the page is still there to be read.
     */
    document.addEventListener('keydown', onKey);

    // Move focus into the panel so the composer is one Tab away, not thirty.
    panelRef.current?.focus();

    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="assistant-fab"
        aria-label={copy.assistant}
        aria-expanded={open}
        /* Toggles, because there is no scrim to press any more and the button
           is the thing the panel visibly came out of. */
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="bot" size={24} strokeWidth={1.9} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="ai-panel"
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <div className="ai-head">
            <span className="ai-title">
              <span className="ai-title-dot" aria-hidden />
              {copy.assistantPanel.title}
            </span>
            <button
              type="button"
              className="ai-close"
              onClick={close}
              aria-label={copy.assistantPanel.close}
            >
              <Icon name="close" size={15} strokeWidth={2.4} />
            </button>
          </div>

          <Panel
            onClose={close}
            titleId={titleId}
            opening={opening}
            onOpeningAsked={clearOpening}
          />
        </div>
      )}
    </>
  );
}
