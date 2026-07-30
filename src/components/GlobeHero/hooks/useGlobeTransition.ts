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
 * out of the hero and settles into the footer instead of stopping dead.
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

  // Land on the correct pose before the first paint — including on a reload
  // that restores a mid-page scroll position.
  useLayoutEffect(() => {
    applied.current = enabled ? progressRef.current : 0;
    apply(applied.current);
  }, [apply, enabled, progressRef]);

  useFrame((_, delta) => {
    const target = enabled ? progressRef.current : 0;

    if (applied.current !== target) {
      const k = damp(SCROLL.damping, Math.min(delta, MOTION.maxDelta));
      applied.current += (target - applied.current) * k;
      // Snap the last sliver so we stop writing transforms once at rest.
      if (Math.abs(target - applied.current) < 1e-4) applied.current = target;
      apply(applied.current);
    }
  });
}
