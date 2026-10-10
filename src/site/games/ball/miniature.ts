import { BREAKOUT_COLS } from '../arcade';
import { THEMES, type ThemeName } from '../../theme/context';
import { BALL_SCENE } from './config';
import { BallScene, type BallFrame, type BallView } from './scene';

/**
 * Pico's Ball on a catalogue card: a still painted by the round's own scene —
 * the same sand blocks, beach ball, surfboard, sea and Pico — so the card
 * cannot advertise a different beach from the one the round plays on.
 *
 * **A diorama, not a crop.** The band is about three times as wide as it is
 * tall, and the round's field is taller than it is wide, with the wall and the
 * board most of a field apart: any crop of it shows either the wall or Pico,
 * never the game. So the miniature hands the scene a geometry of its own —
 * two courses of the wall over the horizon, the ball on its way up, Pico under
 * his board at the foot — sized from the band's proportions. Everything drawn
 * is drawn by the round's painter at the round's sizes (block, ball, board and
 * bird are the field's own widths); only the distances between them are
 * folded up. The wall is fixed, like every preview: a gap knocked in, one wet
 * block already cracked.
 */

const START = [2, 2, 1, 2, 1, 2, 2, 1, 1, 1, 2, 1, 1, 2, 1, 1];
const NOW = [2, 1, 0, 2, 1, 0, 2, 1, 1, 0, 2, 1, 0, 1, 1, 1];
const GAP = 0.008;
const BALL_R = 0.016;

export function paintBallMiniature(ctx: CanvasRenderingContext2D, w: number, h: number, theme: ThemeName): void {
  const H = h / w;
  const brickW = (1 - GAP * (BREAKOUT_COLS + 1)) / BREAKOUT_COLS;
  const brickH = Math.min(0.05, H * 0.11);
  const wallTop = H * 0.06;
  const aspect = H - BALL_SCENE.strip;
  const paddleY = aspect - 0.07;
  const brick = (i: number) => {
    const col = i % BREAKOUT_COLS;
    const row = Math.floor(i / BREAKOUT_COLS);
    return { x: GAP + col * (brickW + GAP), y: wallTop + row * (brickH + GAP), w: brickW, h: brickH };
  };
  const scene = new BallScene(
    { aspect, paddleW: 0.2, paddleH: 0.022, paddleY, ballR: BALL_R, horizon: H * 0.44, brick },
    START,
  );
  scene.settle(NOW);
  const ratio = ctx.getTransform().a || 1;
  scene.configure(w, h, ratio, theme, THEMES[theme].primary);
  const wallFoot = wallTop + 2 * brickH + GAP;
  const frame: BallFrame = { wall: NOW, paddle: 0.46, ball: { x: 0, y: 0, vx: -0.26, vy: -0.55 } };
  const view: BallView = { phase: 'playing', end: null, reduced: true };
  /* A few frames along the ball's path, so it carries its trail. */
  const endX = 0.6;
  const endY = (wallFoot + paddleY) / 2;
  for (let n = 6; n >= 0; n -= 1) {
    frame.ball.x = endX - frame.ball.vx * n * 0.016;
    frame.ball.y = endY - frame.ball.vy * n * 0.016;
    ctx.save();
    scene.paint(ctx, frame, view, (6 - n) * 16);
    ctx.restore();
  }
}
