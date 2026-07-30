import { memo, useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { TONE } from '../config';
import type { GlobeTone } from '../types';

interface CountryBordersProps {
  positions: Float32Array;
  primaryColor: string;
  tone: GlobeTone;
}

/**
 * Every country frontier as a single merged `LineSegments` — one draw call for
 * the entire world.
 *
 * `LineBasicMaterial` renders a true 1-device-pixel stroke (WebGL ignores
 * `linewidth`), which is exactly the "extremely thin" hairline we want; a
 * fat-line implementation would only make it heavier and slower.
 */
export const CountryBorders = memo(function CountryBorders({
  positions,
  primaryColor,
  tone,
}: CountryBordersProps) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.computeBoundingSphere();
    return g;
  }, [positions]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={1}>
      <lineBasicMaterial
        color={primaryColor}
        transparent
        opacity={TONE[tone].borderOpacity}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
});
