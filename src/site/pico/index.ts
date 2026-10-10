/**
 * Pico — the Paylez mascot, a teal parrot — for every web game and card.
 *
 * **Import Pico from here and nowhere else.** The module is two halves:
 *
 * - **The API** (this file's exports): `drawPico` for canvas games, `Pico` and
 *   `AnimatedPico` for the DOM, the pose names, the design-box constants a game
 *   aligns its hit circle with, and the palette entry points.
 * - **The art** — `palette.ts`, `geometry.ts`, `paint.ts` — a port of the app's
 *   `lib/widgets/pico.dart`, which was drawn from a written brief. The owner's
 *   Claude Design original is expected to replace it, and a caller that only
 *   ever imported this file will not have to change when it does.
 *
 * ```ts
 * // A canvas game, every frame — the body circle *is* the hit circle:
 * const size = picoSizeForBodyRadius(hit.r);
 * drawPico(ctx, { x: hit.x, y: hit.y, size, anchor: 'body', pose: 'flap',
 *                 flap: seconds * 3, facing: vx < 0 ? -1 : 1, tilt: pitch });
 *
 * // A card:
 * <AnimatedPico size={96} pose={won ? 'happy' : 'sad'} />
 * ```
 */
export {
  drawPico,
  picoBodyRadiusAt,
  picoSizeForBodyRadius,
  PICO_BODY_CENTRE,
  PICO_BODY_RADIUS,
  PICO_BOX,
  type DrawPicoOptions,
} from './draw';
export { PICO_BRAND, picoMono, type PicoPalette } from './palette';
export { PICO_POSES, type PicoContext, type PicoFacing, type PicoPose } from './types';
export { PICO_MOTION } from './config';
export { picoBlinkAt } from './stage';
export { AnimatedPico, Pico, type AnimatedPicoProps, type PicoProps } from './Pico';
