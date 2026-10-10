import { drawPico } from '../../pico';
import { BAKERY, type BakeryTheme } from './config';
import { paintTile, paintTrayOn, trayGeometry } from './scene';

/**
 * 2048's hover miniature: the round's own tray, tiles and Pico, painted once
 * into a card's band by the same functions the scene uses (`paintTrayOn`,
 * `paintTile`), so the card and the round cannot drift apart. Still, because
 * the board moves only when somebody swipes.
 */
export function paintBakeryMiniature(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  board: readonly number[],
  theme: BakeryTheme,
  font: string,
): void {
  const p = BAKERY.palette[theme];
  /* Pico stands on the rim, so the tray leaves him a quarter of its height above it. */
  const bs = Math.min(w * 0.86, h / 1.26);
  const bx = (w - bs) / 2;
  const by = h - bs - Math.max(3, bs * 0.03);
  const tray = trayGeometry(bx, by, bs);
  paintTrayOn(ctx, tray, p, theme === 'dark');
  board.forEach((value, i) => {
    if (value <= 0) return;
    const glaze = p.tiles[value] ?? p.tileBeyond;
    paintTile(ctx, tray.cells[i].x, tray.cells[i].y, tray.cell, value, glaze, p, font);
  });
  const size = bs * 0.3;
  drawPico(ctx, {
    x: bx + bs - size * 0.46,
    y: by + tray.frame * 0.55 - size * 0.36,
    size,
    facing: -1,
    tilt: 0.1,
  });
}
