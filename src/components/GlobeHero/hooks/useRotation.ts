import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { MOTION } from '../config';
import { TAU } from '../geo/math';

/**
 * Seamless, drift-free spin.
 *
 * The phase is integrated in **turns** and wrapped into `[0, 1)` every frame,
 * so:
 *   • `rotation.y` only ever crosses 2π -> 0, which is the identity rotation —
 *     mathematically continuous, visually invisible;
 *   • the accumulator never grows, so float32 precision never degrades (a naive
 *     `elapsedTime * ω` visibly stutters after ~20 minutes);
 *   • changing `rotationSpeed` at runtime alters the derivative only — the
 *     current angle is preserved, so the globe cannot jump;
 *   • `delta` is clamped, so returning from a backgrounded tab resumes instead
 *     of teleporting.
 */
export function useRotation(
  target: RefObject<Group | null>,
  revolutionsPerSecond: number,
  paused: boolean,
): void {
  const phase = useRef(0);
  const speed = useRef(revolutionsPerSecond);
  speed.current = revolutionsPerSecond;

  useFrame((_, delta) => {
    const group = target.current;
    if (!group) return;

    if (!paused) {
      phase.current += Math.min(delta, MOTION.maxDelta) * speed.current;
      phase.current -= Math.floor(phase.current); // euclidean wrap, keeps sign
    }

    group.rotation.y = phase.current * TAU;
  });
}
