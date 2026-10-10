/**
 * The vocabulary every caller speaks to Pico in.  ── API ──
 *
 * Kept apart from the drawing on purpose: the art (`palette.ts`, `geometry.ts`,
 * `paint.ts`) is a stand-in port of the app's `pico.dart` and is expected to be
 * replaced by the Claude Design original. The pose names, and what each one
 * means, are the contract a replacement has to honour — games choose a pose by
 * what is happening to the bird, not by what the current drawing does with it.
 */

/** What the bird is doing. Same names and meanings as the app's `PicoPose`. */
export type PicoPose =
  /** Standing, wing folded, feet down. The default. */
  | 'idle'
  /** In the air: feet tucked, the wing driven by `flap`. */
  | 'flap'
  /** Celebrating: wing up, beak open, smiling eyes. */
  | 'happy'
  /** Downcast: heavy lid, wing and crest drooping. */
  | 'sad'
  /** Knocked out: crossed eyes, beak open, wing and crest splayed. */
  | 'hit'
  /** The front-facing head, for icons, avatars and anything 32px or under. */
  | 'badge';

/** Every pose, in the app's declaration order — for harnesses and pickers. */
export const PICO_POSES: readonly PicoPose[] = ['idle', 'flap', 'happy', 'sad', 'hit', 'badge'];

/** `1` faces right (the drawing's own way), `-1` mirrors it to face left. */
export type PicoFacing = 1 | -1;

/**
 * Either kind of 2D context. A game that pre-renders sprite frames into an
 * `OffscreenCanvas` draws Pico the same way it draws to the screen.
 */
export type PicoContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
