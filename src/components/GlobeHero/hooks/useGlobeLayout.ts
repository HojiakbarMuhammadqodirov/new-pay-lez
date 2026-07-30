import { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { CAMERA } from '../config';
import { resolveLayout, type GlobeLayout } from '../geo/layout';

export type { GlobeLayout, GlobeState } from '../geo/layout';

/**
 * React wrapper around `resolveLayout`.
 *
 * Only re-runs on resize. The per-frame interpolation between the two states
 * lives in `useGlobeTransition`, which writes to the camera and the frame group
 * directly and never triggers a render.
 */
export function useGlobeLayout(
  offsetX: number,
  heightCoverage: number,
): GlobeLayout {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  const layout = useMemo(
    () => resolveLayout(width, height, offsetX, heightCoverage),
    [width, height, offsetX, heightCoverage],
  );

  // Projection only — position is owned by `useGlobeTransition`.
  useLayoutEffect(() => {
    const cam = camera as PerspectiveCamera;
    cam.fov = CAMERA.fov;
    cam.near = CAMERA.near;
    cam.far = CAMERA.far;
    cam.updateProjectionMatrix();
  }, [camera, layout]);

  return layout;
}
