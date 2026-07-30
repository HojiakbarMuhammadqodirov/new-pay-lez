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
  /** Ink for the brand mark, which is filled with `primaryColor`. */
  onPrimaryColor?: string;
  /**
   * Play only on the first visit of a browser session. Off by default so the
   * sequence is easy to iterate on; turn it on for production.
   */
  oncePerSession?: boolean;
  /** Allow click / Esc / Space to skip. */
  skippable?: boolean;
}

const SESSION_KEY = 'paylez-intro-played';

/**
 * Brand cold-open: the mark pops in centred, then the name unfolds beside it —
 * pushing the mark left as it grows — with a neon loading bar underneath.
 *
 * Pure DOM and CSS. The whole thing is transform and opacity on five elements,
 * so it runs entirely on the compositor and costs the page no JavaScript per
 * frame; the only timer is the one that ends it.
 */
export const PaylezIntro = memo(function PaylezIntro({
  onComplete,
  primaryColor = COLORS.primary,
  backgroundColor = COLORS.background,
  onPrimaryColor = INTRO.onPrimary,
  oncePerSession = false,
  skippable = true,
}: PaylezIntroProps) {
  const reducedMotion = useReducedMotion();
  const doneRef = useRef(false);

  // Decided synchronously so the site never flashes behind a skipped intro.
  const [active, setActive] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (oncePerSession && sessionStorage.getItem(SESSION_KEY)) return false;
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
          '--pz-on-accent': onPrimaryColor,
          '--pz-name-w': `${INTRO.nameWidthCh}ch`,
          '--pz-mark-in': `${INTRO.markIn.duration}ms`,
          '--pz-mark-delay': `${INTRO.markIn.delay}ms`,
          '--pz-name-in': `${INTRO.nameOpen.duration}ms`,
          '--pz-name-delay': `${INTRO.nameOpen.delay}ms`,
          '--pz-bar-in': `${INTRO.barIn.duration}ms`,
          '--pz-bar-delay': `${INTRO.barIn.delay}ms`,
          '--pz-fill-in': `${INTRO.barFill.duration}ms`,
          '--pz-fill-delay': `${INTRO.barFill.delay}ms`,
          '--pz-out': `${INTRO.outro.duration}ms`,
          '--pz-out-delay': `${INTRO.outro.delay}ms`,
        } as CSSProperties
      }
      onClick={skippable ? finish : undefined}
      role="presentation"
      aria-hidden
    >
      <div className="pz-stage">
        {/* Centred row: the name growing from zero width is what pushes the
            mark to the left. No second animation to keep in sync. */}
        <div className="pz-brand">
          <span className="pz-mark">
            <span>p</span>
          </span>
          <span className="pz-name">
            <span>paylez</span>
          </span>
        </div>

        <div className="pz-bar">
          <i />
        </div>
      </div>

      {skippable && <span className="pz-skip">Skip</span>}
    </div>
  );
});
