import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ASSISTANT_OPEN_EVENT } from './content';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import { PATHS } from './router';

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
 * **The composer is real; the answers are not.** There is no backend in this
 * repo and no network layer anywhere in `src/` — the thread, the input, the
 * keyboard handling and the account it greets are all working, and the reply
 * says plainly that it is not connected to a model. A canned answer dressed up
 * as a real one would be the wrong kind of finished.
 */

interface Turn {
  id: number;
  from: 'you' | 'bot';
  text: string;
}

/* ───────────────────────────────────────────────────────────── the thread ── */

function Thread({ turns, note }: { turns: Turn[]; note: string }) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the thread grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length]);

  return (
    <div className="ai-thread">
      {turns.map((turn) => (
        <div className="ai-turn" key={turn.id} data-from={turn.from}>
          <p>{turn.text}</p>
          {/* Under the reply, not over it, and set as a footnote rather than as
              a bordered uppercase chip. The disclosure is the same; what changed
              is that the panel no longer opens with a warning label as the first
              thing in it. */}
          {turn.from === 'bot' && <span className="ai-note">{note}</span>}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── composer ── */

function Composer({ onSend }: { onSend: (text: string) => void }) {
  const copy = useCopy();
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
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
        disabled={!value.trim()}
        aria-label={copy.assistantPanel.send}
      >
        <Icon name="arrow" size={18} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── panel ── */

function Panel({ onClose, titleId }: { onClose: () => void; titleId: string }) {
  const copy = useCopy();
  const { account } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const nextId = useRef(0);

  const send = useCallback(
    (text: string) => {
      const id = nextId.current;
      nextId.current += 2;
      setTurns((current) => [
        ...current,
        { id, from: 'you', text },
        { id: id + 1, from: 'bot', text: copy.assistantPanel.stubReply },
      ]);
    },
    [copy.assistantPanel.stubReply],
  );

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
          <Thread turns={turns} note={copy.assistantPanel.stubTag} />
        </>
      )}

      <div className="ai-foot">
        <Composer onSend={send} />
        {empty && (
          <div className="chips ai-suggestions">
            {copy.assistantPanel.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="chip"
                onClick={() => send(suggestion)}
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    // Back where they came from, or the tab order restarts at the top of the page.
    triggerRef.current?.focus();
  }, []);

  /* Opened from somewhere that is not this button — the footer's "AI Assistant"
     entry, which names the dock rather than a page. See `ASSISTANT_OPEN_EVENT`. */
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
  }, []);

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

          <Panel onClose={close} titleId={titleId} />
        </div>
      )}
    </>
  );
}
