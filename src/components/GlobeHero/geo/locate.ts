import type { CountryFeature } from '../types';
import { DETECTION } from '../config';
import { pointInRing } from './math';

/**
 * Point -> country resolution on the sphere.
 *
 * Two passes, cheapest first:
 *   1. bounding-box reject, then even-odd ring test (handles holes and
 *      multi-part countries for free — a point inside a hole crosses an even
 *      number of rings and correctly falls through);
 *   2. if the point is over water, the nearest coastline within
 *      `DETECTION.maxOceanDegrees`, so the label survives a coastal sweep but
 *      disappears over open ocean.
 */
export function locateCountry(
  features: CountryFeature[],
  lat: number,
  lon: number,
  maxFallbackDegrees: number = DETECTION.maxOceanDegrees,
): CountryFeature | null {
  for (const feature of features) {
    const [minLon, minLat, maxLon, maxLat] = feature.bbox;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;

    let inside = false;
    for (const ring of feature.rings) {
      if (pointInRing(ring, lon, lat)) inside = !inside;
    }
    if (inside) return feature;
  }

  return nearestCoast(features, lat, lon, maxFallbackDegrees);
}

function nearestCoast(
  features: CountryFeature[],
  lat: number,
  lon: number,
  maxDeg: number,
): CountryFeature | null {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const coarse = DETECTION.centroidSearchDegrees;

  let best: CountryFeature | null = null;
  let bestSq = maxDeg * maxDeg;

  for (const feature of features) {
    // Coarse centroid reject before touching per-vertex data.
    if (approxDegSq(lon, lat, feature.centroid[0], feature.centroid[1], cosLat) >
      coarse * coarse
    ) {
      continue;
    }

    for (const ring of feature.rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const d = approxDegSq(lon, lat, ring[i], ring[i + 1], cosLat);
        if (d < bestSq) {
          bestSq = d;
          best = feature;
        }
      }
    }
  }

  return best;
}

/**
 * Equirectangular approximation of angular distance, squared, in degrees².
 * Accurate to well under a degree at the ~10° scale we threshold on, and an
 * order of magnitude cheaper than haversine across ~10k vertices.
 */
function approxDegSq(
  lonA: number,
  latA: number,
  lonB: number,
  latB: number,
  cosLat: number,
): number {
  let dLon = lonB - lonA;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  const x = dLon * cosLat;
  const y = latB - latA;
  return x * x + y * y;
}
