import { SNAKE_COLS } from '../arcade';
import { FLOCK, type FlockTheme } from './config';
import { createFlockScene, type FlockView } from './scene';

/**
 * Pico's Flock on a catalogue card: a still of the round, painted by the
 * round's own scene — the same lawn, hedge, chicks, treat and Pico — so the
 * card cannot advertise a different garden from the one the round plays in.
 *
 * A fixed board, not a dealt one: Pico heading for a cherry with five chicks
 * behind him, the line turning a corner, which is the whole game in one look.
 * Cover-fitted on a window about nine cells across, centred on the flock, and
 * painted as the reduced-motion still (no hop, no flyers) because a card is
 * still until it is played.
 */
const ROW = 6;
const at = (x: number, y: number) => y * SNAKE_COLS + x;
const BODY: readonly number[] = [at(7, ROW), at(6, ROW), at(5, ROW), at(4, ROW), at(4, ROW + 1), at(4, ROW + 2), at(3, ROW + 2)];
const VIEW: FlockView = { body: BODY, from: BODY, p: 1, food: at(9, ROW), eaten: 0, phase: 'ready', end: null };
/** The window: this many cells across and down, centred here (in cells). */
const WINDOW = { cols: 8.6, rows: 5.6, x: 6.3, y: 7.1 };

export function paintFlockMiniature(ctx: CanvasRenderingContext2D, w: number, h: number, theme: FlockTheme): void {
  const cell = Math.max(w / WINDOW.cols, h / WINDOW.rows);
  const board = cell * (SNAKE_COLS + FLOCK.margin * 2);
  const ratio = ctx.getTransform().a || 1;
  const scene = createFlockScene(true);
  scene.resize(board, ratio, theme);
  const origin = FLOCK.margin * cell;
  ctx.save();
  ctx.translate(w / 2 - (origin + WINDOW.x * cell), h / 2 - (origin + WINDOW.y * cell));
  scene.paint(ctx, 0, VIEW);
  ctx.restore();
}
