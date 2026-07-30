import { Vector3, type BufferGeometry } from 'three';
import { GLOBE, ROUTES } from '../config';
import type { CountryFeature } from '../types';
import { angularDistance, latLonToVec3, mulberry32, slerpUnit } from './math';
import { buildRibbon, type RibbonSpine } from './ribbon';

/**
 * Bakes `count` great-circle routes into a single merged ribbon geometry.
 *
 * Endpoint pairs come from a seeded PRNG, so the same `count` always yields the
 * same network: no re-shuffle on re-mount, no layout pop during HMR.
 *
 * Ribbon construction itself lives in `buildRibbon`, shared with the intro.
 */
export function buildRouteGeometry(
  features: CountryFeature[],
  count: number,
): BufferGeometry {
  const random = mulberry32(ROUTES.seed);
  // Skip slivers — their centroids are noisy anchors for an arc endpoint.
  const pool = features.filter((f) => f.rings.some((ring) => ring.length >= 12));
  const pairs = pickPairs(pool, count, random);

  const spines: RibbonSpine[] = pairs.map(([a, b]) => ({
    points: greatCircleArc(
      latLonToVec3(a.centroid[1], a.centroid[0]),
      latLonToVec3(b.centroid[1], b.centroid[0]),
      ROUTES.segments,
      ROUTES.minAltitude,
      ROUTES.altitudeFactor,
      ROUTES.maxAltitude,
    ),
    phase: random(),
    speed: ROUTES.speed * (1 + (random() * 2 - 1) * ROUTES.speedJitter),
  }));

  return buildRibbon(spines);
}

/**
 * Samples a great circle between two unit vectors, lifted off the surface by a
 * sine profile so it leaves and lands flush.
 */
export function greatCircleArc(
  start: Vector3,
  end: Vector3,
  segments: number,
  minAltitude: number,
  altitudeFactor: number,
  maxAltitude: number,
): Vector3[] {
  const omega = Math.acos(Math.min(1, Math.max(-1, start.dot(end))));
  const altitude = Math.min(
    maxAltitude,
    minAltitude + (omega / Math.PI) * altitudeFactor,
  );

  const points: Vector3[] = [];
  for (let s = 0; s < segments; s++) {
    const t = s / (segments - 1);
    const point = slerpUnit(start, end, t, new Vector3());
    point.multiplyScalar(GLOBE.radius * (1 + Math.sin(Math.PI * t) * altitude));
    points.push(point);
  }
  return points;
}

/** Random distinct country pairs whose separation reads well on screen. */
function pickPairs(
  pool: CountryFeature[],
  count: number,
  random: () => number,
): Array<[CountryFeature, CountryFeature]> {
  const pairs: Array<[CountryFeature, CountryFeature]> = [];
  if (pool.length < 2) return pairs;

  const maxAttempts = Math.max(count, 1) * 80;
  for (let attempt = 0; pairs.length < count && attempt < maxAttempts; attempt++) {
    const a = pool[(random() * pool.length) | 0];
    const b = pool[(random() * pool.length) | 0];
    if (a === b) continue;

    const degrees =
      (angularDistance(a.centroid[0], a.centroid[1], b.centroid[0], b.centroid[1]) *
        180) /
      Math.PI;
    // Too short reads as a smudge; too long wraps behind the globe for most of
    // its life and never resolves as a route.
    if (degrees < ROUTES.minArcDegrees || degrees > ROUTES.maxArcDegrees) continue;

    pairs.push([a, b]);
  }
  return pairs;
}
