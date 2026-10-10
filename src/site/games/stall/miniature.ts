import { drawPico } from '../../pico';
import { withAlpha } from '../sceneStage';
import { STALL, type StallTheme } from './config';
import { paintFood } from './foods';
import { crateGeometry, paintCrateOn } from './scene';

/**
 * Food Cross's hover miniature: a 4×4 corner of the round's crate and gingham,
 * the round's own food drawings on it, and Pico on the rim — painted once by
 * the scene's functions (`paintCrateOn`, `paintFood`), so the card is the
 * board rather than a picture of one.
 */
export function paintStallMiniature(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kinds: readonly number[],
  theme: StallTheme,
): void {
  const p = STALL.palette[theme];
  const n = 4;
  const bs = Math.min(w * 0.86, h / 1.22);
  const bx = (w - bs) / 2;
  const by = h - bs - Math.max(3, bs * 0.03);
  const crate = crateGeometry(bx, by, bs, n);
  paintCrateOn(ctx, crate, p, theme === 'dark', n);
  const food = crate.cell * STALL.layout.food;
  kinds.forEach((kind, i) => {
    const x = crate.ix + ((i % n) + 0.5) * crate.cell;
    const y = crate.iy + (Math.floor(i / n) + 0.5) * crate.cell;
    ctx.fillStyle = withAlpha(p.shadow, theme === 'dark' ? 0.3 : 0.12);
    ctx.beginPath();
    ctx.ellipse(x, y + food * 0.38, food * 0.34, food * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    paintFood(ctx, kind, 0, x, y, food);
  });
  const size = bs * 0.27;
  drawPico(ctx, { x: bx + size * 0.44, y: by + crate.frame * 0.5 - size * 0.36, size, facing: 1, tilt: 0.1 });
}
