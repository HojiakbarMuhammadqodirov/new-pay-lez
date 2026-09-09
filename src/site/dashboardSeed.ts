import { DEMO_MODE } from './demoMode';

/*
 * The reference design's own numbers, so the dashboard can be *seen*.
 *
 * ── why this file exists, and what it is not ──────────────────────────────
 *
 * `Paylez Partner Dashboard.html` draws a full screen: a fourteen-day line
 * chart, a sparkline and a period delta on every tile. The server behind
 * `#/dashboard` answers none of those — there is no daily-series endpoint and
 * no previous-period comparison — so those panels render as "not measured",
 * which is the honest state and is also a screen with nothing on it to look at.
 * This file supplies the mock's figures for exactly those panels so the design
 * can be compared against the export it was ported from.
 *
 * **It is demo material, not a data source, and the distinction is the whole
 * point of the repository's "nothing is seeded" rule.** Three things keep it
 * from becoming one:
 *
 *   1. `PD_SEED` is a single switch. Set it to `false` and every panel below
 *      returns `null`, and the screens fall back to the "not measured" state
 *      they had before — which is what should ship to a real venue owner.
 *   2. Nothing here is ever *mixed* with a server figure. A panel either draws
 *      a measured value or draws a seeded one; `seeded` on each shape says
 *      which, and the panels that use it mark themselves on screen.
 *   3. It is only ever reached where the server returned nothing. A venue with
 *      real numbers never sees a value from this file.
 *
 * The numbers are the mock's own, copied rather than invented — the same sine
 * series, the same three deltas, the same 2.4× repeat multiple — because the
 * job was to match that file and a second set of made-up figures would make
 * the comparison meaningless.
 */

/*
 * The switch. `true` while the dashboard is being matched against the export;
 * `false` is the shipping value.
 *
 * Deliberately a plain constant and not an env flag: a flag is set once on a
 * box and forgotten, and the rows it produced are then indistinguishable from
 * measured ones — which is the argument `bootOrdering` makes on the server for
 * the demo seeds it refuses to write.
 *
 * **It arrived here `true` and is now the demo switch instead.** The branch
 * this came from set it while the screen was being matched against the export,
 * which is what it is for. Shipped on, ten panels draw the mock's numbers — a
 * sine-wave fortnight, three period deltas, and a 2.4× repeat multiple sitting
 * under the words "the one thing we can prove" — and a venue owner has no way
 * to tell those from their own takings. There are twelve real venues on the box.
 *
 * So it is neither hard-coded value any more: it follows `DEMO_MODE`, which is
 * off unless this browser has been sent `?demo=1`. Somebody who typed that has
 * asked for demonstration figures; a venue owner who has not still gets the
 * "not measured" state, which is the honest one. See `demoMode.ts` for why the
 * switch is per browser rather than per deployment.
 */
export const PD_SEED = DEMO_MODE;

/*
 * The mock's series, verbatim: two sine components on a 38-visit base, with a
 * fifth-day bump, and redemptions riding a slower third wave under them.
 *
 * `n` is capped at 45 the way the mock caps it — the range picker offers 7, 14,
 * 30 and 90 days, and past 45 points a 1000-unit-wide chart stops resolving one
 * day from the next.
 */
export function seedSeries(days: number): { visits: number[]; redemptions: number[] } {
  const n = Math.min(Math.max(days, 2), 45);
  const visits: number[] = [];
  const redemptions: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const w = 1 + 0.3 * Math.sin(i / 2.4) + 0.14 * Math.sin(i / 6.1);
    visits.push(Math.round(38 * w) + (i % 5 === 0 ? 4 : 0));
    redemptions.push(Math.round(8 * w * (0.82 + 0.2 * Math.sin(i / 3.1)) * 0.719));
  }
  return { visits, redemptions };
}

/*
 * The period deltas the mock prints under each tile figure. Four entries, in
 * the order the tiles are drawn: visits, deals claimed, vouchers used, rewards
 * used. The fourth has none in the mock either — it is quoted "in August"
 * rather than against a previous period — so it is `null` here and the tile
 * draws no chip at all rather than a zero.
 */
export const SEED_DELTAS: (number | null)[] = [12.4, 8.1, -3.6, null];

/*
 * The repeat multiple behind "the one thing we can prove": members visit 2.4
 * times a month against 1.5 before they joined.
 */
export const SEED_REPEAT = { now: 2.4, before: 1.5 };

/*
 * A sparkline path, in the mock's own 76 × 30 box.
 *
 * Returned as geometry rather than as an element so the caller owns the colour
 * — the two series are drawn in the accent and in the ink, and which is which
 * is a decision for the component, not for a data file.
 */
export function sparkPath(values: number[]): { line: string; area: string } | null {
  if (values.length < 2) return null;
  const W = 76;
  const H = 30;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const x = (i: number) => (i * W) / (values.length - 1);
  const y = (v: number) => H - 2 - ((v - min) / Math.max(max - min, 1)) * (H - 6);
  const line = values
    .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  return { line, area: `${line} L${W} ${H} L0 ${H} Z` };
}
