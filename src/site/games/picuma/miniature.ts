import type { ThemeName } from '../../theme/context';
import { PicumaScene, type PicumaBall, type PicumaView } from './scene';

/**
 * Picuma on a catalogue card: a still painted by the round's own scene — the
 * same flagstones, carved causeway, portal, sun-idol, orbs and Pico on his
 * branch — so the card cannot advertise a different temple from the one the
 * round is played in.
 *
 * **A diorama, not a crop.** The band is two or three times as wide as it is
 * tall and the round's field is taller than it is wide, with the chain and
 * the shooter most of a field apart, so a crop shows one or the other. The
 * miniature hands the scene a geometry of its own — one straight run of
 * causeway out of the portal and into the idol, Pico on his branch under it —
 * and the scene draws everything at the round's own sizes (orb, bird, idol are
 * the field's widths); only the distances are folded up.
 *
 * The moment held is the game's: two dots in the chain and a third on its way
 * to them from Pico's beak, with its wake behind it. Fixed, like every
 * preview: the same chain and the same shot every time.
 */

/** The chain, front first: the two dots at 3 and 4 are what the shot is for. */
const CHAIN = [1, 3, 2, 0, 0, 2, 1, 1, 3, 0, 2, 3];
const BALL = 0.06;

export function paintPicumaMiniature(ctx: CanvasRenderingContext2D, w: number, h: number, theme: ThemeName): void {
  const H = h / w;
  const y = Math.min(0.14, H * 0.32);
  /* The causeway: out of the portal at the left, into the idol at the right. */
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i <= 24; i += 1) pts.push([0.08 + (i / 24) * 0.8, y]);
  const at = pts.map((p) => p[0] - pts[0][0]);
  /* Right of centre: the card sets its name over the band's lower left. */
  const shooter = { x: 0.6, y: H - 0.1 };
  const scene = new PicumaScene({ track: { pts, at }, ball: BALL, shooter, aspect: H, dressing: 'miniature' });
  scene.setTheme(theme);

  const head = 0.7;
  const chain: PicumaBall[] = CHAIN.map((kind) => ({ kind }));
  /* Aimed just in front of the pair, and a little over half way there. */
  const target = { x: pts[0][0] + head - 2.5 * BALL, y };
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const span = Math.hypot(dx, dy) || 1;
  const shot = { x: shooter.x + dx * 0.56, y: shooter.y + dy * 0.56, vx: (dx / span) * 1.7, vy: (dy / span) * 1.7, kind: 0 };
  const view: PicumaView = { chain, head, shot, loaded: [2, 1], aim: target, phase: 'playing', end: null };

  const ratio = ctx.getTransform().a || 1;
  /* Twice: the first settles Pico's lean at once, the second is the frame
     (the shot on its real line, its wake drawn). */
  scene.setReduced(true);
  ctx.save();
  scene.render(ctx, w, h, ratio, view, 0);
  ctx.restore();
  scene.setReduced(false);
  ctx.save();
  scene.render(ctx, w, h, ratio, view, 400);
  ctx.restore();
}
