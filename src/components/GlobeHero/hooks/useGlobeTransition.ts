import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { MOTION, SCROLL } from '../config';
import { damp, lerp, smoothstep } from '../geo/math';
import type { GlobeLayout } from './useGlobeLayout';

/**
 * Drives the globe between its hero and end states from scroll position.
 *
 * Scroll is treated as a *target*, not a direct binding: the applied value
 * chases it with frame-rate independent exponential smoothing, so trackpad
 * momentum and scroll-jumps arrive as a glide rather than a snap. On top of
 * that, `smoothstep` flattens the derivative at both ends so the globe eases
 * out of the hero and settles into the footer instead of stopping dead. All of
 * that starts on the *second* frame: the first one snaps, because it is
 * establishing a starting pose rather than following a gesture.
 *
 * Everything is written straight to the camera and the frame group — no state,
 * no re-render, no matrix churn beyond the one transform that actually moved.
 */
export function useGlobeTransition(
  frameRef: RefObject<Group | null>,
  layout: GlobeLayout,
  progressRef: RefObject<number>,
  enabled: boolean,
): void {
  const camera = useThree((state) => state.camera);
  const applied = useRef(0);
  // Whether `applied` has ever been reconciled with a real scroll reading.
  const primed = useRef(false);

  const apply = useCallback(
    (raw: number) => {
      const t = smoothstep(raw);
      const { hero, end } = layout;

      camera.position.set(0, 0, lerp(hero.distance, end.distance, t));
      camera.updateMatrixWorld();

      const frame = frameRef.current;
      if (frame) {
        frame.position.set(lerp(hero.x, end.x, t), lerp(hero.y, end.y, t), 0);
        frame.rotation.x = lerp(hero.tilt, end.tilt, t);
      }
    },
    [camera, frameRef, layout],
  );

  /*
   * Pose the scene at commit, so the camera and the frame group are never left
   * at their constructed defaults.
   *
   * This is *not* what handles a reload into a mid-page scroll position, and a
   * comment here used to claim it was. It cannot: `progressRef` is filled by
   * `useScrollProgress`, which sits in the DOM tree outside the Canvas, and
   * this hook runs inside a separate React root — there is no ordering
   * relationship between the two, so the ref read here can still be its initial
   * 0 no matter where the page is scrolled to. The first frame below is what
   * guarantees the pose; this only guarantees a sane one.
   */
  useLayoutEffect(() => {
    applied.current = enabled ? progressRef.current : 0;
    apply(applied.current);
  }, [apply, enabled, progressRef]);

  useFrame((_, delta) => {
    const target = enabled ? progressRef.current : 0;

    /*
     * The first tick *lands* on the target rather than chasing it. By now the
     * page has committed and `useScrollProgress` has taken its layout-time
     * reading, so this is the true scroll position — which on a deep link or a
     * reload partway down the page is the footer arc, not the hero. Damping
     * into it from 0 is the half-second glide-in that made the globe look like
     * it was arriving late to a page the reader was already reading. Smoothing
     * exists to absorb a *gesture*, and there has not been one yet.
     */
    if (!primed.current) {
      primed.current = true;
      if (applied.current !== target) {
        applied.current = target;
        apply(target);
      }
      return;
    }

    if (applied.current !== target) {
      const k = damp(SCROLL.damping, Math.min(delta, MOTION.maxDelta));
      applied.current += (target - applied.current) * k;
      // Snap the last sliver so we stop writing transforms once at rest.
      if (Math.abs(target - applied.current) < 1e-4) applied.current = target;
      apply(applied.current);
    }
  });
}
