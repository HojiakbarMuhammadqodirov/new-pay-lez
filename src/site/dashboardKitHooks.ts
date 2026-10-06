/**
 * The hooks and pure helpers behind `dashboardKit.tsx`.
 *
 * In their own `.ts` file for the fast-refresh reason `dashboardFormat.ts`
 * states: a module that exports a component and anything else loses React's
 * hot reload, so the kit exports components only and everything else is here.
 */
import { useEffect, useRef } from 'react';

/**
 * What every overlay owes the keyboard.
 *
 * Escape closes; focus moves *into* the panel on open (a slide-over that leaves
 * the keyboard on the page behind it is a modal in appearance only) and goes
 * back to whatever had it when the panel closes — closing unmounts the control
 * that held focus, which otherwise drops it on `<body>`.
 *
 * `onClose` is read through a ref so a caller passing an inline arrow does not
 * re-run the effect, and re-steal focus, on every render.
 */
export function useOverlay<T extends HTMLElement>(onClose: () => void) {
  const panel = useRef<T>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, []);

  return panel;
}

/**
 * A disclosure that closes on a press outside it or on Escape — the bell, the
 * user menu. Returns the ref for the wrapper that counts as "inside".
 */
export function useDismiss<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return ref;
}

/**
 * A sparkline's two paths in a `width × height` box: the line, and the area
 * under it closed along the bottom edge.
 *
 * A flat series draws a flat line through the middle rather than dividing by a
 * zero range, and fewer than two points draws nothing — one point is not a
 * trend, and a line from it would be inventing one.
 */
export function sparkPaths(
  points: readonly number[],
  width: number,
  height: number,
  pad = 2,
): { line: string; area: string } | null {
  if (points.length < 2) return null;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo;
  const step = (width - pad * 2) / (points.length - 1);
  const xy = points.map((value, index) => {
    const x = pad + index * step;
    const y = span === 0 ? height / 2 : pad + (1 - (value - lo) / span) * (height - pad * 2);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
  });
  const line = xy.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const area = `${line} L${xy[xy.length - 1][0]} ${height} L${xy[0][0]} ${height} Z`;
  return { line, area };
}

/**
 * Two letters for an avatar — first and last word. A name is somebody's own
 * text in any script, so this takes code points rather than UTF-16 halves.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** A fraction clamped to 0–1, as the width of a bar. NaN and ±∞ are 0. */
export function share(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(1, Math.max(0, part / whole));
}
