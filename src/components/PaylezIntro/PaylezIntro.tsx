import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { COLORS } from '../GlobeHero/config';
import { useReducedMotion } from '../GlobeHero/hooks/useReducedMotion';
import { INTRO } from './config';
import './PaylezIntro.css';

export interface PaylezIntroProps {
  /** Fires once the sequence has finished (or was skipped). */
  onComplete?: () => void;
  primaryColor?: string;
  backgroundColor?: string;
  /**
   * Play only on the first visit of a browser session. Off by default so the
   * sequence is easy to iterate on; turn it on for production.
   */
  oncePerSession?: boolean;
  /** Allow click / Esc / Space to skip. */
  skippable?: boolean;
}

const SESSION_KEY = 'paylez-intro-played';

/** The wordmark, as the letters the sequence animates one at a time. */
const WORD = [...'paylez'];

/**
 * Brand cold-open: the name is written a letter at a time, each one rising out
 * of focus into focus, with a hairline drawing itself underneath as the last
 * letters land.
 *
 * **No mark.** There used to be one — a square tile that popped in and was then
 * pushed left by the name growing beside it — and it is gone for the same reason
 * it is gone from the header, the footer and the dashboard rail: the product has
 * never shown a tile next to the name, so an intro that opened on one was
 * introducing a mark the rest of the site does not have. What is left is the
 * thing the brand actually is, in the face it is actually set in.
 *
 * Pure DOM and CSS. Eight elements, all of them animating transform, opacity or
 * filter, so the whole thing runs on the compositor and costs the page no
 * JavaScript per frame; the only timer is the one that ends it.
 */
export const PaylezIntro = memo(function PaylezIntro({
  onComplete,
  primaryColor = COLORS.primary,
  backgroundColor = COLORS.background,
  oncePerSession = false,
  skippable = true,
}: PaylezIntroProps) {
  const reducedMotion = useReducedMotion();
  const doneRef = useRef(false);

  // Decided synchronously so the site never flashes behind a skipped intro.
  const [active, setActive] = useState(() => {
    if (typeof window === 'undefined') return false;
    /*
     * Wrapped for the same reason the write below is, and it matters more:
     * `sessionStorage.getItem` does not return null when site data is blocked
     * (a sandboxed iframe, Chrome with cookies off, some enterprise policies) —
     * *accessing the object throws*. This runs inside a state initialiser, so
     * an unguarded read takes the whole app down during render rather than
     * costing one replayed intro. It was harmless only while `oncePerSession`
     * defaulted off and the short-circuit never reached it.
     */
    try {
      if (oncePerSession && sessionStorage.getItem(SESSION_KEY)) return false;
    } catch {
      // Storage is unreadable, so "has it played?" is unanswerable. Play it.
    }
    return true;
  });

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (oncePerSession) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        // Private mode — replaying the intro is a better failure than crashing.
      }
    }
    setActive(false);
    onComplete?.();
  }, [onComplete, oncePerSession]);

  // Reduced motion skips straight to the site rather than playing it faster.
  useEffect(() => {
    if (reducedMotion && active) finish();
  }, [reducedMotion, active, finish]);

  /*
   * `onComplete` fires when the sequence is *over*, and a sequence that never
   * started is over — which is what the prop's own doc comment promises ("or
   * was skipped") and what the initialiser above quietly broke.
   *
   * It matters because the site hides its header, main and footer behind
   * `.site[data-intro='running']` until this fires. Under `oncePerSession` the
   * second page load starts at `active === false`, so with no call here the
   * caller's `introDone` would stay false and the entire page would sit at
   * `opacity: 0` forever. `finish` is idempotent through `doneRef`, so this
   * costs nothing on the run that did play.
   */
  useEffect(() => {
    if (!active) finish();
  }, [active, finish]);

  // The one timer in the whole sequence; CSS owns everything visual.
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(finish, INTRO.duration);
    return () => window.clearTimeout(timer);
  }, [active, finish]);

  // The intro owns the viewport while it runs.
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !skippable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, skippable, finish]);

  if (!active) return null;

  return (
    <div
      className="pz-intro"
      style={
        {
          background: backgroundColor,
          '--pz-accent': primaryColor,
          '--pz-letter-in': `${INTRO.letterIn.duration}ms`,
          '--pz-letter-delay': `${INTRO.letterIn.delay}ms`,
          '--pz-stagger': `${INTRO.letterIn.stagger}ms`,
          '--pz-rule-in': `${INTRO.ruleIn.duration}ms`,
          '--pz-rule-delay': `${INTRO.ruleIn.delay}ms`,
          '--pz-settle': `${INTRO.settle.duration}ms`,
          '--pz-settle-delay': `${INTRO.settle.delay}ms`,
          '--pz-out': `${INTRO.outro.duration}ms`,
          '--pz-out-delay': `${INTRO.outro.delay}ms`,
        } as CSSProperties
      }
      onClick={skippable ? finish : undefined}
      role="presentation"
      aria-hidden
    >
      <div className="pz-stage">
        {/*
          One element per letter, each carrying its index. The stagger is done in
          CSS off `--i` rather than by generating six delays here: the timings
          then live entirely in `config.ts` and the stylesheet, and adding a
          letter to the word cannot leave a hardcoded delay behind.
        */}
        <div className="pz-word">
          {WORD.map((letter, index) => (
            <i key={index} style={{ ['--i' as string]: index }}>
              {letter}
            </i>
          ))}
        </div>

        <div className="pz-rule" />
      </div>

      {skippable && <span className="pz-skip">Skip</span>}
    </div>
  );
});
