import { Vector3 } from 'three';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import type { Atlas, CountryFeature } from '../types';
import { GLOBE } from '../config';
import { DEG2RAD, latLonToVec3, slerpUnit } from './math';
import { alpha2FromNumeric, displayName } from './countryCodes';

/**
 * Loads the Natural Earth 110m country atlas and pre-computes everything the
 * renderer and the hit-tester need.
 *
 * The work happens exactly once per page load and is shared by every
 * <GlobeHero /> instance via the module-level promise cache below.
 */

interface CountryProperties {
  name: string;
  [key: string]: unknown;
}

type CountriesTopology = Topology<{
  countries: GeometryCollection<CountryProperties>;
}>;

let atlasPromise: Promise<Atlas> | null = null;

export function loadAtlas(): Promise<Atlas> {
  atlasPromise ??= import('world-atlas/countries-110m.json').then((module) =>
    buildAtlas((module.default ?? module) as unknown as CountriesTopology),
  );
  return atlasPromise;
}

/* ------------------------------------------------------------------ builder */

function buildAtlas(topology: CountriesTopology): Atlas {
  const collection = feature(topology, topology.objects.countries);
  const features: CountryFeature[] = [];

  for (const raw of collection.features) {
    const geometry = raw.geometry as Polygon | MultiPolygon | null;
    if (!geometry) continue;

    const polygons: Position[][][] =
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

    const rings: Float64Array[] = [];
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    let bestArea = -Infinity;
    let centroid: [number, number] = [0, 0];

    for (const polygon of polygons) {
      for (let r = 0; r < polygon.length; r++) {
        const ring = polygon[r];
        const flat = new Float64Array(ring.length * 2);

        for (let i = 0; i < ring.length; i++) {
          const lon = ring[i][0];
          const lat = ring[i][1];
          flat[i * 2] = lon;
          flat[i * 2 + 1] = lat;
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        rings.push(flat);

        // Anchor the label on the largest outer ring — keeps the US label in
        // the lower 48 rather than dragged out toward Alaska.
        if (r === 0) {
          const { area, cx, cy } = ringCentroid(flat);
          if (area > bestArea) {
            bestArea = area;
            centroid = [cx, cy];
          }
        }
      }
    }

    if (!rings.length) continue;

    features.push({
      id: String(raw.id ?? ''),
      iso2: alpha2FromNumeric(raw.id as string | number | undefined),
      name: displayName(raw.properties?.name ?? 'Unknown'),
      centroid,
      bbox: [minLon, minLat, maxLon, maxLat],
      rings,
    });
  }

  return { features, borderPositions: buildBorderPositions(topology) };
}

/**
 * `topojson.mesh` returns **deduplicated** arcs: a shared frontier is emitted
 * once instead of twice. That halves the vertex count and — critically — stops
 * coincident strokes from doubling up and reading as a thicker line.
 */
function buildBorderPositions(topology: CountriesTopology): Float32Array {
  const lines = mesh(topology, topology.objects.countries);

  const radius = GLOBE.radius + GLOBE.borderAltitude;
  const maxEdge = GLOBE.maxEdgeDegrees * DEG2RAD;
  const out: number[] = [];

  const a = new Vector3();
  const b = new Vector3();
  const current = new Vector3();

  for (const line of lines.coordinates) {
    for (let i = 0; i < line.length - 1; i++) {
      latLonToVec3(line[i][1], line[i][0], 1, a);
      latLonToVec3(line[i + 1][1], line[i + 1][0], 1, b);

      // Long edges are re-cut along the great circle so they hug the sphere
      // instead of chording through it.
      const omega = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
      const steps = omega > maxEdge ? Math.ceil(omega / maxEdge) : 1;

      let px = a.x * radius;
      let py = a.y * radius;
      let pz = a.z * radius;

      for (let s = 1; s <= steps; s++) {
        if (steps === 1) current.copy(b);
        else slerpUnit(a, b, s / steps, current);

        const nx = current.x * radius;
        const ny = current.y * radius;
        const nz = current.z * radius;

        out.push(px, py, pz, nx, ny, nz);

        px = nx;
        py = ny;
        pz = nz;
      }
    }
  }

  return new Float32Array(out);
}

/** Shoelace centroid of a closed lon/lat ring. */
function ringCentroid(flat: Float64Array): { area: number; cx: number; cy: number } {
  const n = flat.length / 2;
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2];
    const yi = flat[i * 2 + 1];
    const xj = flat[j * 2];
    const yj = flat[j * 2 + 1];
    const cross = xj * yi - xi * yj;
    twiceArea += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    return { area: 0, cx: flat[0], cy: flat[1] };
  }

  return {
    area: Math.abs(twiceArea) / 2,
    cx: cx / (3 * twiceArea),
    cy: cy / (3 * twiceArea),
  };
}
