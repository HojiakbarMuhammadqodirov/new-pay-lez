import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three';
import { MOTION, ROUTES } from '../config';
import type { CountryFeature } from '../types';
import { buildRouteGeometry } from '../geo/routeGeometry';
import { routesFragmentShader, routesVertexShader } from '../shaders/routes';

interface RoutesProps {
  features: CountryFeature[];
  count: number;
  primaryColor: string;
  paused: boolean;
}

/**
 * Animated great-circle routes between randomly chosen countries.
 *
 * Drawn as camera-facing ribbons rather than lines, because WebGL ignores
 * `linewidth` — see `buildRouteGeometry`. The whole network is one merged
 * geometry and one draw call; per frame the CPU writes a single float.
 * Depth-testing against the opaque globe body is what makes an arc slide out
 * of sight as it passes round the back.
 */
export const Routes = memo(function Routes({
  features,
  count,
  primaryColor,
  paused,
}: RoutesProps) {
  const materialRef = useRef<ShaderMaterial>(null);
  const time = useRef(0);

  const geometry = useMemo(
    () => buildRouteGeometry(features, count),
    [features, count],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPrimary: { value: new Color(primaryColor) },
      uWidth: { value: ROUTES.width },
      uEdgeSoftness: { value: ROUTES.edgeSoftness },
      uTrailLength: { value: ROUTES.trailLength },
      uTrailCutoff: { value: ROUTES.trailCutoff },
      uHeadSize: { value: ROUTES.headSize },
      uHeadIntensity: { value: ROUTES.headIntensity },
      uTrailIntensity: { value: ROUTES.trailIntensity },
      uBaseOpacity: { value: ROUTES.baseOpacity },
      uOpacity: { value: 1 },
    }),
    [primaryColor],
  );

  useFrame((_, delta) => {
    if (paused || !materialRef.current) return;
    // Clamped delta: returning from a backgrounded tab must not teleport heads.
    time.current += Math.min(delta, MOTION.maxDelta);
    materialRef.current.uniforms.uTime.value = time.current;
  });

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={routesVertexShader}
        fragmentShader={routesFragmentShader}
        uniforms={uniforms}
        blending={AdditiveBlending}
        transparent
        depthWrite={false}
        // The ribbon flips its facing as an arc curves around the globe.
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
});
