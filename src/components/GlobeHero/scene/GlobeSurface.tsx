import { memo, useMemo } from 'react';
import { Color, SphereGeometry, Vector3 } from 'three';
import { GLOBE, TONE } from '../config';
import type { GlobeTone } from '../types';
import { surfaceFragmentShader, surfaceVertexShader } from '../shaders/surface';

interface GlobeSurfaceProps {
  primaryColor: string;
  backgroundColor: string;
  tone: GlobeTone;
}

/**
 * The planet body.
 *
 * Opaque and depth-writing, which is what makes borders and routes on the far
 * side vanish behind the globe instead of ghosting through it.
 */
export const GlobeSurface = memo(function GlobeSurface({
  primaryColor,
  backgroundColor,
  tone,
}: GlobeSurfaceProps) {
  const geometry = useMemo(
    () =>
      new SphereGeometry(GLOBE.radius, GLOBE.widthSegments, GLOBE.heightSegments),
    [],
  );

  const uniforms = useMemo(
    () => ({
      uBackground: { value: new Color(backgroundColor) },
      uPrimary: { value: new Color(primaryColor) },
      uLightDirection: { value: new Vector3(...GLOBE.lightDirection).normalize() },
      uRimPower: { value: GLOBE.rimPower },
      uRimStrength: { value: TONE[tone].rimStrength },
      uAmbient: { value: TONE[tone].ambientStrength },
    }),
    // Colours are cheap to rebuild and change rarely; a fresh uniforms object
    // forces the material to recompile only when the palette actually changes.
    [primaryColor, backgroundColor, tone],
  );

  return (
    <mesh geometry={geometry} renderOrder={0}>
      <shaderMaterial
        vertexShader={surfaceVertexShader}
        fragmentShader={surfaceFragmentShader}
        uniforms={uniforms}
        toneMapped={false}
      />
    </mesh>
  );
});
