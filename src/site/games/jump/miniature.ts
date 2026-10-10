import { DOODLE_JUMP_SPEED, doodleCentre, doodleHeights, type DoodleState } from '../arcade';
import { THEMES, type ThemeName } from '../../theme/context';
import { JUMP_SCENE } from './config';
import { JumpScene, type JumpView } from './scene';

/**
 * Pico Jump on a catalogue card: a still of the climb, painted by the round's
 * own scene — the same branches, canopy, moonbeams or sunbeams, and Pico — so
 * the card cannot advertise a different jungle from the one the round plays
 * in.
 *
 * A fixed climb, not a dealt one: Pico on his way up off one branch toward
 * the next, a cloud waiting above, which is the whole game in one look.
 * Cover-fitted on the band — a field the band's width, cut to the slice where
 * he is — and painted as the reduced-motion still (no squash, no drift),
 * because a card is still until it is played.
 */

/** The dealt places across the field (0..1, as `content.platforms` deals them). */
const DEALT = [0.5, 0.18, 0.74, 0.32, 0.86, 0.12, 0.6, 0.28, 0.82, 0.4, 0.08, 0.62, 0.22, 0.7, 0.36, 0.9, 0.46, 0.2];
/** Pico is leaving this platform (index) for the next. */
const FROM = 13;

export function paintJumpMiniature(ctx: CanvasRenderingContext2D, w: number, h: number, theme: ThemeName): void {
  const centres = DEALT.map(doodleCentre);
  const heights = doodleHeights(DEALT.length);
  const fw = Math.max(w, h * 0.75);
  const fh = (fw * 4) / 3;
  const ratio = ctx.getTransform().a || 1;
  const scene = new JumpScene();
  scene.setLevel(centres, heights);
  scene.configure(fw, fh, ratio, theme, THEMES[theme].primary);
  const jumper: DoodleState = {
    x: centres[FROM] + 0.08,
    y: heights[FROM] + 0.13,
    vy: DOODLE_JUMP_SPEED * 0.55,
    camera: heights[FROM] - 0.32,
    reached: FROM + 1,
    steps: 0,
    carry: 0,
    end: null,
  };
  const view: JumpView = { phase: 'playing', end: null, steer: 0.6, reduced: true };
  /* Where Pico's body lands in the field, so the band can be cut around him. */
  const picoY = fh * (1 - JUMP_SCENE.lift) - (jumper.y - jumper.camera) * fh;
  ctx.save();
  ctx.translate((w - fw) / 2, h * 0.58 - picoY);
  scene.paint(ctx, jumper, view, 0);
  ctx.restore();
}
