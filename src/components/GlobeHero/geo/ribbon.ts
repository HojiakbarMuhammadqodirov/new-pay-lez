import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/**
 * One path through the ribbon builder.
 *
 * `points` and `target` must be the same length — the builder pairs them
 * vertex-for-vertex so a shader can `mix()` between the two shapes.
 */
export interface RibbonSpine {
  points: Vector3[];
  /** Optional morph destination, same length as `points`. */
  target?: Vector3[];
  /** Per-spine animation offset, 0..1. */
  phase: number;
  /** Per-spine animation rate. */
  speed: number;
}

/**
 * Builds a merged, indexed ribbon mesh from a set of spines.
 *
 * WebGL ignores `LineBasicMaterial.linewidth`, so a stroke with real thickness
 * has to be a triangle strip. Each spine point emits **two** vertices
 * (`aSide` = ∓1) sharing a position and tangent; the vertex shader pushes them
 * apart perpendicular to both the path and the view direction, so the ribbon
 * faces the camera along its whole length with no per-frame CPU work.
 *
 * One continuous indexed strip per spine keeps joints seamless on a curve —
 * the exact place naive fat-line implementations crack open.
 *
 * Shared by the globe's flight routes and by the intro's wordmark morph, so
 * there is only one copy of this to get wrong.
 */
export function buildRibbon(spines: RibbonSpine[]): BufferGeometry {
  const geometry = new BufferGeometry();
  if (!spines.length) return geometry;

  const points = spines[0].points.length;
  const hasTarget = spines.some((spine) => spine.target);
  const vertsPerSpine = points * 2;
  const indicesPerSpine = (points - 1) * 6;

  const positions = new Float32Array(spines.length * vertsPerSpine * 3);
  const tangents = new Float32Array(spines.length * vertsPerSpine * 3);
  const sides = new Float32Array(spines.length * vertsPerSpine);
  const tValues = new Float32Array(spines.length * vertsPerSpine);
  const phases = new Float32Array(spines.length * vertsPerSpine);
  const speeds = new Float32Array(spines.length * vertsPerSpine);
  const indices = new Uint32Array(spines.length * indicesPerSpine);

  const targetPositions = hasTarget
    ? new Float32Array(spines.length * vertsPerSpine * 3)
    : null;
  const targetTangents = hasTarget
    ? new Float32Array(spines.length * vertsPerSpine * 3)
    : null;

  const tangent = new Vector3();

  for (let s = 0; s < spines.length; s++) {
    const spine = spines[s];
    if (spine.points.length !== points) {
      throw new Error(
        `buildRibbon: spine ${s} has ${spine.points.length} points, expected ${points}`,
      );
    }

    const vertexBase = s * vertsPerSpine;

    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      writeTangent(spine.points, i, tangent);

      for (let side = 0; side < 2; side++) {
        const v = vertexBase + i * 2 + side;
        const p = spine.points[i];

        positions[v * 3 + 0] = p.x;
        positions[v * 3 + 1] = p.y;
        positions[v * 3 + 2] = p.z;
        tangents[v * 3 + 0] = tangent.x;
        tangents[v * 3 + 1] = tangent.y;
        tangents[v * 3 + 2] = tangent.z;

        sides[v] = side === 0 ? -1 : 1;
        tValues[v] = t;
        phases[v] = spine.phase;
        speeds[v] = spine.speed;
      }
    }

    if (targetPositions && targetTangents) {
      // Spines without a target morph to themselves, i.e. stay put.
      const target = spine.target ?? spine.points;
      for (let i = 0; i < points; i++) {
        writeTangent(target, i, tangent);
        for (let side = 0; side < 2; side++) {
          const v = vertexBase + i * 2 + side;
          const p = target[i];
          targetPositions[v * 3 + 0] = p.x;
          targetPositions[v * 3 + 1] = p.y;
          targetPositions[v * 3 + 2] = p.z;
          targetTangents[v * 3 + 0] = tangent.x;
          targetTangents[v * 3 + 1] = tangent.y;
          targetTangents[v * 3 + 2] = tangent.z;
        }
      }
    }

    // Two triangles per span, stitching the -1 and +1 rails together.
    const indexBase = s * indicesPerSpine;
    for (let i = 0; i < points - 1; i++) {
      const v = vertexBase + i * 2;
      const o = indexBase + i * 6;
      indices[o + 0] = v;
      indices[o + 1] = v + 1;
      indices[o + 2] = v + 2;
      indices[o + 3] = v + 1;
      indices[o + 4] = v + 3;
      indices[o + 5] = v + 2;
    }
  }

  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aTangent', new BufferAttribute(tangents, 3));
  geometry.setAttribute('aSide', new BufferAttribute(sides, 1));
  geometry.setAttribute('aT', new BufferAttribute(tValues, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new BufferAttribute(speeds, 1));
  if (targetPositions && targetTangents) {
    geometry.setAttribute('aTarget', new BufferAttribute(targetPositions, 3));
    geometry.setAttribute('aTargetTangent', new BufferAttribute(targetTangents, 3));
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Central difference through the curve; endpoints fall back to one-sided.
 * A degenerate span (repeated point) borrows the previous usable direction
 * rather than emitting a zero vector the shader would have to guard against.
 */
function writeTangent(points: Vector3[], i: number, out: Vector3): void {
  const prev = points[Math.max(0, i - 1)];
  const next = points[Math.min(points.length - 1, i + 1)];
  out.subVectors(next, prev);
  if (out.lengthSq() < 1e-12) out.set(0, 1, 0);
  else out.normalize();
}

/**
 * Resamples a polyline to exactly `count` points, evenly spaced by arc length.
 *
 * This is what lets any two paths morph into one another: a great-circle arc
 * and a letter stroke have nothing in common until both are expressed as the
 * same number of uniformly distributed samples.
 */
export function resamplePolyline(source: Vector3[], count: number): Vector3[] {
  if (source.length === 0) return [];
  if (source.length === 1) {
    return Array.from({ length: count }, () => source[0].clone());
  }

  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < source.length; i++) {
    total += source[i].distanceTo(source[i - 1]);
    cumulative.push(total);
  }

  if (total < 1e-9) {
    return Array.from({ length: count }, () => source[0].clone());
  }

  const out: Vector3[] = [];
  let cursor = 1;
  for (let i = 0; i < count; i++) {
    const distance = (i / (count - 1)) * total;
    while (cursor < cumulative.length - 1 && cumulative[cursor] < distance) cursor++;

    const spanStart = cumulative[cursor - 1];
    const spanLength = cumulative[cursor] - spanStart;
    const t = spanLength < 1e-9 ? 0 : (distance - spanStart) / spanLength;

    out.push(source[cursor - 1].clone().lerp(source[cursor], t));
  }
  return out;
}
