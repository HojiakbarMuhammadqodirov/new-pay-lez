import { memo } from 'react';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { POST } from '../config';

interface EffectsProps {
  glowStrength: number;
}

/**
 * Very subtle bloom, and nothing else.
 *
 * Threshold sits just above the border stroke so frontiers stay crisp while
 * route heads and the atmospheric limb pick up a soft flare. When
 * `glowStrength` is 0 the caller skips this component entirely, which removes
 * the composer's render targets from the frame budget altogether.
 */
export const Effects = memo(function Effects({ glowStrength }: EffectsProps) {
  return (
    <EffectComposer multisampling={POST.multisampling} enableNormalPass={false}>
      <Bloom
        mipmapBlur
        intensity={POST.bloomIntensity * glowStrength}
        luminanceThreshold={POST.bloomThreshold}
        luminanceSmoothing={POST.bloomSmoothing}
        radius={POST.bloomRadius}
      />
    </EffectComposer>
  );
});
