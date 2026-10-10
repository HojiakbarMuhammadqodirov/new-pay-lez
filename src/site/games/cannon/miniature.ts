import { ASPECT, BALL, CANNON } from './config';
import type { HarbourTheme } from './look';
import { createHarbourScene, type HarbourTarget, type HarbourView } from './scene';

/**
 * Canon Numbers on a catalogue card: a still of the round painted by the
 * round's own harbour — balloons over the bay, the bronze cannon, Pico at his
 * post — at the instant a shot is on its way to the answer.
 *
 * The sum is the card's ("3 + 4 = ?", set over the canvas in the markup), and
 * the balloons are the round's own kind of near misses: 6 and 8 either side of
 * the 7 the ball is flying at. Fixed rather than dealt, like every preview.
 * Cover-fitted on the lower part of the field, where the balloons meet the
 * cannon, because a whole 3 : 4 field in a card's band is too small to read —
 * so the balloons are placed low, under the sum, where a wide band still shows them.
 */
const NOW = 10_000;
const AIM = { x: 0.74, y: 0.93 };
const angle = Math.atan2(AIM.x - CANNON.x, CANNON.y - AIM.y);
const muzzle = { x: CANNON.x + Math.sin(angle) * CANNON.barrelLength, y: CANNON.y - Math.cos(angle) * CANNON.barrelLength };
const along = 0.55;

const balloon = (id: number, value: number, x: number, y: number): HarbourTarget => ({
  id,
  value,
  x,
  y,
  sway: id * 1.7,
  born: NOW - 2000,
  state: 'live',
  endAt: 0,
});

const VIEW: HarbourView = {
  targets: [balloon(1, 6, 0.2, 0.9), balloon(2, 7, AIM.x, AIM.y), balloon(4, 8, 0.93, 1.0)],
  balls: [
    {
      x: muzzle.x + (AIM.x - muzzle.x) * along,
      y: muzzle.y + (AIM.y - muzzle.y) * along,
      vx: Math.sin(angle) * BALL.speed,
      vy: -Math.cos(angle) * BALL.speed,
    },
  ],
  floats: [],
  angle,
  shotAt: NOW - 150,
  phase: 'playing',
  score: 3,
};
/** The top of the window, in field units: everything below it is shown. */
const TOP = 0.6;

export function paintHarbourMiniature(ctx: CanvasRenderingContext2D, w: number, h: number, theme: HarbourTheme, font: string): void {
  const k = Math.max(w, h / (ASPECT - TOP));
  const ratio = ctx.getTransform().a || 1;
  const scene = createHarbourScene(false);
  scene.resize(k, ratio, theme, font);
  ctx.save();
  ctx.translate((w - k) / 2, h - ASPECT * k);
  scene.paint(ctx, NOW, VIEW);
  ctx.restore();
}
