import type { ThemeName } from '../../theme/context';
import { GRAVITY, LAUNCH_Y, type Flyer } from '../ninjaField';
import { NinjaScene, type NinjaCut, type NinjaView } from './scene';

/**
 * Pico Ninja on a catalogue card: a still painted by the round's own scene —
 * the moonlit market (or its morning), the lanterns, Pico in his headband on
 * the boards — with three foods in the air and the blade going through the
 * middle one, which is already in two halves with its juice flying. The moment
 * the game is about, held still.
 *
 * The foods and where they hang are `PREVIEW.ninja` in `content.ts`, as before;
 * each is placed by the round's own flight (`positionAt`) half a second into a
 * throw that peaks where the card wants it, so the scene draws them exactly as
 * it draws a round.
 */

export interface NinjaPreviewFood {
  kind: number;
  /** Across the band, 0..1. */
  x: number;
  /** Down the band from its top, 0..1. */
  y: number;
  sliced?: boolean;
}

/** The round's clock at the frame, and how far into its throw each food is. */
const MS = 10_000;
const AIRBORNE = 0.5;

export function paintNinjaMiniature(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  foods: readonly NinjaPreviewFood[],
  theme: ThemeName,
): void {
  const scene = new NinjaScene();
  scene.setTheme(theme);
  /* In the right-hand corner: the card sets its name over the band's lower left. */
  scene.setSide(-1);
  /* A throw whose height after `AIRBORNE` seconds is the card's spot. */
  const flyers: Flyer[] = foods.map((food, i) => ({
    id: i * 2,
    kind: food.kind,
    t: MS - AIRBORNE * 1000,
    x: food.x,
    vx: 0,
    vy: (1 - food.y - LAUNCH_Y + 0.5 * GRAVITY * AIRBORNE * AIRBORNE) / AIRBORNE,
  }));
  const sliced = new Set<number>();
  const cuts: NinjaCut[] = [];
  const view: NinjaView = { flyers, sliced, cuts, trail: [], trailMs: 140, ms: MS, phase: 'playing' };
  const ratio = ctx.getTransform().a || 1;

  /* The cut: a stroke rising through the sliced food, left to right. */
  const target = foods.findIndex((food) => food.sliced);
  if (target >= 0) {
    const food = foods[target];
    const cx = food.x * w;
    const cy = food.y * h;
    sliced.add(flyers[target].id);
    cuts.push({ flyer: flyers[target], at: 0, x: cx, y: cy });
    view.trail = [
      { x: cx - w * 0.2, y: cy + h * 0.12, at: 0 },
      { x: cx - w * 0.1, y: cy + h * 0.06, at: 0 },
      { x: cx, y: cy, at: 0 },
    ];
  }
  ctx.save();
  scene.render(ctx, w, h, ratio, view, 0);
  ctx.restore();
  /* A beat later: the halves parted, the juice out, the blade past. */
  if (target >= 0) {
    const food = foods[target];
    const cx = food.x * w;
    const cy = food.y * h;
    view.trail = [
      { x: cx - w * 0.16, y: cy + h * 0.1, at: 60 },
      { x: cx - w * 0.05, y: cy + h * 0.03, at: 80 },
      { x: cx + w * 0.07, y: cy - h * 0.04, at: 100 },
      { x: cx + w * 0.17, y: cy - h * 0.1, at: 120 },
    ];
  }
  view.ms = MS + 120;
  ctx.save();
  scene.render(ctx, w, h, ratio, view, 120);
  ctx.restore();
}
