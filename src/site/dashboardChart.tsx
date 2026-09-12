/**
 * The partner dashboard's "Visits and voucher redemptions" plot.
 *
 * ── Why this is not the chart it replaces ─────────────────────────────────
 *
 * The one before it drew its paths with `preserveAspectRatio="none"` and put
 * every label *outside* the SVG, because stretched lettering is unreadable.
 * That works for the line and fails for the axis: three numbers in a flex
 * column, spaced `space-between` down the left edge, cannot land on the
 * gridlines they name — the gridlines are at fractions of the plot's *height*
 * and the labels are at fractions of the *column's*, and the two only agree
 * when the padding happens to match. So the numbers named nothing.
 *
 * The fix is to stop stretching. The box is measured with a `ResizeObserver`
 * and the `viewBox` is set to the measured pixel size, so one SVG unit is one
 * CSS pixel and text drawn inside the plot is drawn at its true size, on the
 * same y its gridline is on, by construction. Measuring is what buys that, and
 * it is the *only* thing here that costs a render on resize — see the note on
 * the observer below.
 *
 * ── Nothing here animates ─────────────────────────────────────────────────
 *
 * A line that draws itself in cannot be read until it has finished, and a
 * cursor that eases toward the pointer reads as lag rather than as polish.
 * The one transition is the hover marks fading in and out, and the stylesheet
 * drops that under `prefers-reduced-motion`.
 *
 * ── This file owns no copy ────────────────────────────────────────────────
 *
 * Every string and every formatter arrives as a prop. The dashboard is
 * translated into five languages and prices itself in the reader's currency;
 * a `toLocaleDateString` called in here would be a sixth place that decides
 * what locale means, and it would be the one nobody remembers to change.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from 'react';

export interface ChartPoint {
  day: string;
  visits: number;
  redemptions: number;
}

/*
 * ── the value axis ───────────────────────────────────────────────────────
 *
 * The rungs a tick step is allowed to land on, before the power of ten. A step
 * off this ladder is one a reader can add up in their head — 2, 20, 200 — and
 * anything else (3, 7, 250) makes the reader do arithmetic to answer "how far
 * is this point above that line".
 *
 * 4 is deliberately *not* a rung, which is worth knowing because it is the one
 * that gets asked for: a peak of 1,240 lands on 0/500/1000/1500 here rather
 * than 0/400/800/1200. 400 would need 4 on the ladder, and a ladder with 4 on
 * it loses the property that every rung is a half or a fifth of the next —
 * which is what makes 0/500/1000 readable at a glance. If the four-step is
 * genuinely wanted, it is one number in this array.
 */
const STEP_RUNGS = [1, 2, 5, 10];

/*
 * Intervals aimed for between the baseline and the top gridline — so six
 * labels at most, four at worst once the step is rounded onto a rung. Fewer
 * than four and the eye has nothing to interpolate against; more than six and
 * the gridlines are louder than the series they are there to measure.
 */
const TARGET_INTERVALS = 5;

/* Headroom above the top gridline, so its label is not cut by the panel and a
   series that reaches the top does not read as clipped. */
const PAD_TOP = 18;
const PAD_RIGHT = 12;
/* The date row. */
const PAD_BOTTOM = 28;

/* The value axis is as wide as its widest label needs, never narrower than
   this — a two-digit axis should not leave the plot floating in the middle of
   the panel. */
const GUTTER_MIN = 34;

/*
 * The digit advance of the 11px tabular face `.pa-chart-tick` is set in.
 *
 * A text node cannot be measured before it is drawn, and drawing it to measure
 * it costs a second layout pass on every render. One estimate here is cheaper
 * and it only ever has to be *generous*: too wide moves the plot a few pixels
 * right, too narrow clips a digit. Tabular figures make it an estimate of one
 * number rather than of a string, which is why the axis is tabular.
 */
const TICK_CHAR_W = 6.6;
/* Between the axis label and the plot's left edge. */
const TICK_GAP = 12;

/*
 * How much room a date label needs before it may be drawn. "12 Aug" is about
 * 38px in this face; the rest is the gap that stops two labels reading as one
 * word. Also the collision test for the final tick — see `dateTicks`.
 */
const DATE_LABEL_W = 58;

/* The hovered value's pill on the axis, and the breathing room the tooltip
   keeps from the plot's edges. */
const PILL_H = 16;
const TIP_EDGE = 6;

/**
 * The nearest rung at or above `rough`, scaled to `rough`'s own magnitude.
 *
 * At-or-above rather than nearest: rounding a step *down* puts more gridlines
 * on the plot than were asked for, and the count is the thing being controlled.
 */
function niceStep(rough: number): number {
  if (!(rough > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  /* 1e-9 because 0.1 * 3 / 0.1 is 2.9999999999999996, and a peak that lands on
     a rung exactly must not be pushed up to the next one by float error. */
  const rung = STEP_RUNGS.find((rungValue) => normalised <= rungValue + 1e-9) ?? 10;
  return rung * magnitude;
}

/**
 * The gridline values for a series peaking at `peak`, and the value the top of
 * the plot stands for.
 *
 * The step is floored at 1 because every figure this chart draws is a count of
 * things that happened — visits, redemptions — and an axis reading 0, 0.5, 1
 * offers a reader half a visit. That floor is also what makes a quiet day
 * legible: a peak of 3 draws 0/1/2/3 rather than four labels of the same
 * rounded number.
 *
 * The top is the first multiple of the step at or above the peak, so the
 * highest point on the plot always has a gridline at or above it and the line
 * is never drawn outside its own axis.
 */
function buildScale(peak: number): { top: number; ticks: number[] } {
  const safe = Math.max(peak, 1);
  const step = Math.max(1, Math.round(niceStep(safe / TARGET_INTERVALS)));
  const top = Math.ceil(safe / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + 1e-9; value += step) ticks.push(value);
  return { top, ticks };
}

/**
 * Which points get a date under them.
 *
 * Every Nth, where N is whatever fits the measured width — and then the *last*
 * point unconditionally, because "where does the series end" is the one date a
 * reader goes looking for. That makes the final regular tick a collision risk
 * rather than a label, so the walk stops as soon as it comes within a label's
 * width of the end: the second-to-last is dropped, not nudged, since a nudged
 * label sits under the wrong column.
 */
function dateTicks(count: number, plotWidth: number): number[] {
  const last = count - 1;
  if (last <= 0) return [0];

  const room = Math.max(2, Math.floor(plotWidth / DATE_LABEL_W));
  const stride = Math.max(1, Math.ceil(count / room));
  const spacing = plotWidth / last;

  const out: number[] = [];
  for (let index = 0; index < last; index += stride) {
    if ((last - index) * spacing < DATE_LABEL_W) break;
    out.push(index);
  }
  out.push(last);
  return out;
}

export function AnalyticsChart({
  points,
  formatTick,
  formatFull,
  formatNumber,
  labelVisits,
  labelRedeemed,
  emptyText,
}: {
  points: ChartPoint[];
  /** Localised formatters, passed in so this file owns no i18n. */
  formatTick: (isoDay: string) => string;
  formatFull: (isoDay: string) => string;
  formatNumber: (value: number) => string;
  labelVisits: string;
  labelRedeemed: string;
  emptyText?: string;
}): ReactElement {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  /*
   * The index the tooltip is currently showing, mirrored out of state.
   *
   * `pointermove` fires on every pixel and has something new to say only when
   * the *snapped* index changes — perhaps thirty times across a whole panel.
   * Comparing against a ref rather than against `hover` means the guard reads
   * the value written by the previous move rather than the one captured when
   * this handler was created, so a fast sweep cannot re-render per pixel.
   */
  const shownRef = useRef<number | null>(null);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  /*
   * The plot's box, in CSS pixels.
   *
   * This is the one thing here that goes through React state, and it is
   * allowed to because a resize is an event and not a frame: the observer
   * fires when the panel changes shape, not sixty times a second. The equality
   * guard is what keeps that true — a `ResizeObserver` re-reports the same box
   * whenever an ancestor reflows, and returning `prev` bails React out of the
   * render instead of laying the whole panel out again.
   */
  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize((prev) =>
        prev && Math.abs(prev.w - box.width) < 0.5 && Math.abs(prev.h - box.height) < 0.5
          ? prev
          : { w: box.width, h: box.height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* The only pass over the data worth memoising: everything below is a handful
     of multiplications the browser does faster than a dependency check. */
  const scale = useMemo(() => {
    let peak = 0;
    for (const point of points) peak = Math.max(peak, point.visits, point.redemptions);
    return buildScale(peak);
  }, [points]);

  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const count = points.length;

  const gutter = Math.max(
    GUTTER_MIN,
    formatNumber(scale.top).length * TICK_CHAR_W + TICK_GAP,
  );
  const plotW = Math.max(w - gutter - PAD_RIGHT, 1);
  const plotH = Math.max(h - PAD_TOP - PAD_BOTTOM, 1);
  const baseline = PAD_TOP + plotH;
  /* `count - 1` is the number of gaps, and it is what the x scale divides by;
     a single point would divide by zero and a series of none never gets here. */
  const spread = Math.max(count - 1, 1);

  const xOf = (index: number) => gutter + (index * plotW) / spread;
  const yOf = (value: number) => baseline - (value / scale.top) * plotH;

  const line = (pick: (point: ChartPoint) => number) =>
    points
      .map((point, index) => `${index ? 'L' : 'M'}${xOf(index).toFixed(1)} ${yOf(pick(point)).toFixed(1)}`)
      .join(' ');

  const visitsLine = line((point) => point.visits);
  /* The fill belongs to the first series only. Two translucent areas on one
     plot make their overlap a third tone that stands for nothing. */
  const visitsArea = `${visitsLine} L${xOf(count - 1).toFixed(1)} ${baseline.toFixed(1)} L${xOf(0).toFixed(1)} ${baseline.toFixed(1)} Z`;
  const redeemedLine = line((point) => point.redemptions);

  /*
   * Where the tooltip is pinned.
   *
   * Its width is five languages' worth of label, so it cannot be a constant
   * and a fixed width would clip Ukrainian. Measuring it and writing `left`
   * straight onto the node keeps the clamp to one layout read — putting the
   * measurement into state would render the panel a second time for every
   * point the pointer crosses. `left` is never set in JSX, so React has
   * nothing here to overwrite.
   */
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip || hover === null || w <= 0) return;
    const half = tip.offsetWidth / 2;
    const anchor = gutter + (hover * plotW) / spread;
    const limit = Math.max(TIP_EDGE + half, w - half - TIP_EDGE);
    tip.style.left = `${Math.min(Math.max(anchor, half + TIP_EDGE), limit)}px`;
  }, [hover, w, gutter, plotW, spread]);

  const show = (next: number | null) => {
    if (shownRef.current === next) return;
    shownRef.current = next;
    setHover(next);
  };

  const trackPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || count < 2) return;
    /* The viewBox is the measured box, so one unit is one pixel and the
       pointer needs no scaling factor — only the plot's own origin taken off. */
    const along = (event.clientX - box.left - gutter) / (plotW / spread);
    show(Math.min(Math.max(Math.round(along), 0), count - 1));
  };

  const trackKeys = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (count < 2) return;
    const from = shownRef.current ?? count - 1;
    const step = (delta: number) => {
      event.preventDefault();
      show(Math.min(Math.max(from + delta, 0), count - 1));
    };
    /* The keyboard reads the same cursor the pointer does rather than a
       separate focus ring, so what a keyboard reader is told and what a mouse
       reader is shown cannot drift apart. */
    if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'Home') step(-count);
    else if (event.key === 'End') step(count);
    else if (event.key === 'Escape') show(null);
  };

  /* Hooks first, and the early return after them: an empty panel that returned
     before `useEffect` would change the hook order the frame the first day of
     data arrived. */
  if (count < 2) return <p className="pa-chart-empty">{emptyText}</p>;

  /* Clamped rather than trusted: the panel's date range is a control, so
     `points` can shrink under a hover that is already held, and an index one
     past the end reads `undefined` and takes React's whole tree down with the
     first property read off it. */
  const active = Math.min(Math.max(hover ?? count - 1, 0), count - 1);
  const activePoint = points[active];
  const dates = dateTicks(count, plotW);

  return (
    <figure className="pa-chart">
      {/*
        No legend here.

        It was a `<figcaption>` above the plot, and the panel that mounts this
        draws its own on the right of the head, on the same line as the note
        under the title — which is where the design puts it and where it can be
        laid out against the heading instead of floating over the data. Two
        legends for one chart is one of them wrong wherever it sits, so the one
        that cannot see the heading is the one that goes.

        `labelVisits` and `labelRedeemed` are still props and still used: they
        name the two rows of the hover tooltip, which is the other place a
        reader has to be told which line is which.
      */}
      <div className="pa-chart-plot" ref={plotRef}>
        {w > 0 && h > 0 && (
          <svg
            className="pa-chart-svg"
            viewBox={`0 0 ${w} ${h}`}
            role="img"
            aria-label={`${labelVisits} · ${labelRedeemed}`}
            tabIndex={0}
            onPointerMove={trackPointer}
            onPointerDown={trackPointer}
            onPointerLeave={() => show(null)}
            onBlur={() => show(null)}
            onKeyDown={trackKeys}
          >
            {/* The gridline and its label are one pair drawn in one space, at
                one y. That is the whole point of the rewrite: they cannot
                disagree, because there is no second coordinate system for them
                to disagree in. */}
            {scale.ticks.map((value) => (
              <g key={value}>
                <line
                  className="pa-chart-grid"
                  data-base={value === 0 ? 'true' : undefined}
                  x1={gutter}
                  x2={w - PAD_RIGHT}
                  y1={yOf(value)}
                  y2={yOf(value)}
                />
                <text
                  className="pa-chart-tick"
                  x={gutter - TICK_GAP + 4}
                  y={yOf(value)}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {formatNumber(value)}
                </text>
              </g>
            ))}

            <path className="pa-chart-area" d={visitsArea} />
            <path className="pa-chart-line" d={visitsLine} />
            <path className="pa-chart-line" data-series="redeemed" d={redeemedLine} />

            {dates.map((index) => (
              <text
                key={index}
                className="pa-chart-date"
                x={xOf(index)}
                y={baseline + 17}
                textAnchor={index === count - 1 ? 'end' : index === 0 ? 'start' : 'middle'}
              >
                {formatTick(points[index].day)}
              </text>
            ))}

            {/*
              The cursor is always mounted and hidden with opacity rather than
              conditionally rendered, so it has something to transition from —
              a node that arrives already at its destination has no entrance to
              fade. `pointer-events: none` in the sheet keeps it out of the
              way of the move handler it is drawn by.
            */}
            <g className="pa-chart-cursor" data-on={hover === null ? 'false' : 'true'}>
              <line
                className="pa-chart-cursor-line"
                x1={xOf(active)}
                x2={xOf(active)}
                y1={PAD_TOP}
                y2={baseline}
              />
              <circle
                className="pa-chart-dot"
                data-series="redeemed"
                cx={xOf(active)}
                cy={yOf(activePoint.redemptions)}
                r={3.5}
              />
              <circle
                className="pa-chart-dot"
                cx={xOf(active)}
                cy={yOf(activePoint.visits)}
                r={4}
              />

              {/* The hovered figure written against the axis it is measured
                  on, covering the tick it lands between. A tooltip alone says
                  what the number is; this says where it sits. */}
              <rect
                className="pa-chart-pill"
                x={0}
                y={yOf(activePoint.visits) - PILL_H / 2}
                width={Math.max(gutter - 4, 0)}
                height={PILL_H}
                rx={3}
              />
              <text
                className="pa-chart-pill-text"
                x={gutter - TICK_GAP + 4}
                y={yOf(activePoint.visits)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatNumber(activePoint.visits)}
              </text>
            </g>
          </svg>
        )}

        <div className="pa-chart-tip" ref={tipRef} data-on={hover === null ? 'false' : 'true'}>
          <span className="pa-chart-tip-day">{formatFull(activePoint.day)}</span>
          <span className="pa-chart-tip-row">
            <i />
            {labelVisits}
            <b>{formatNumber(activePoint.visits)}</b>
          </span>
          <span className="pa-chart-tip-row">
            <i data-series="redeemed" />
            {labelRedeemed}
            <b>{formatNumber(activePoint.redemptions)}</b>
          </span>
        </div>
      </div>
    </figure>
  );
}
