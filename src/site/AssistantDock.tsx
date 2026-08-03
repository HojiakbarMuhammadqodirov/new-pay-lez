import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
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
 * about. It slides in from the same corner as the button that opened it.
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

function Thread({ turns, tag }: { turns: Turn[]; tag: string }) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the thread grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length]);

  return (
    <div className="ai-thread">
      {turns.map((turn) => (
        <div className="ai-turn" key={turn.id} data-from={turn.from}>
          {turn.from === 'bot' && <span className="ai-tag">{tag}</span>}
          <p>{turn.text}</p>
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

  if (!account) {
    return (
      <div className="ai-body ai-locked">
        <span className="ai-lock-ico">
          <Icon name="bot" size={26} strokeWidth={1.7} />
        </span>
        <h2 id={titleId}>{copy.assistantPanel.lockedTitle}</h2>
        <p>{copy.assistantPanel.lockedBody}</p>
        <a className="btn btn-solid" href={PATHS.signin} onClick={onClose}>
          {copy.assistantPanel.lockedAction}
        </a>
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
          <Thread turns={turns} tag={copy.assistantPanel.stubTag} />
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

  useEffect(() => {
    if (!open) return;

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
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
        onClick={() => setOpen(true)}
      >
        <Icon name="bot" size={24} strokeWidth={1.9} />
      </button>

      {open && (
        <>
          {/* The scrim closes on click and is inert to a screen reader — the
              dialog below carries the semantics. */}
          <div className="ai-scrim" onClick={close} aria-hidden />

          <div
            ref={panelRef}
            className="ai-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
          >
            <div className="ai-head">
              <span className="ai-title">
                <Icon name="bot" size={18} strokeWidth={1.9} />
                {copy.assistantPanel.title}
              </span>
              <button
                type="button"
                className="ai-close"
                onClick={close}
                aria-label={copy.assistantPanel.close}
              >
                <Icon name="chevron" size={17} strokeWidth={2.2} />
              </button>
            </div>

            <Panel onClose={close} titleId={titleId} />
          </div>
        </>
      )}
    </>
  );
}
