import { Vector3 } from 'three';

/**
 * Spherical helpers.
 *
 * Convention: lon = 0°, lat = 0° maps to +Z (i.e. straight at the camera at
 * rotation phase 0). +Y is north.
 */

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const TAU = Math.PI * 2;

export function latLonToVec3(
  latDeg: number,
  lonDeg: number,
  radius = 1,
  target = new Vector3(),
): Vector3 {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  return target.set(
    radius * cosLat * Math.sin(lon),
    radius * Math.sin(lat),
    radius * cosLat * Math.cos(lon),
  );
}

/** Inverse of {@link latLonToVec3}. Returns `[lat, lon]` in degrees. */
export function vec3ToLatLon(v: Vector3): [number, number] {
  const len = v.length() || 1;
  const lat = Math.asin(v.y / len) * RAD2DEG;
  const lon = Math.atan2(v.x, v.z) * RAD2DEG;
  return [lat, lon];
}

/** Great-circle (central) angle between two lon/lat points, in radians. */
export function angularDistance(
  lonA: number,
  latA: number,
  lonB: number,
  latB: number,
): number {
  const p1 = latA * DEG2RAD;
  const p2 = latB * DEG2RAD;
  const dp = (latB - latA) * DEG2RAD;
  const dl = (lonB - lonA) * DEG2RAD;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Spherical linear interpolation between two unit vectors.
 * Falls back to `lerp` for near-parallel inputs to avoid a 0/0.
 */
export function slerpUnit(
  a: Vector3,
  b: Vector3,
  t: number,
  target = new Vector3(),
): Vector3 {
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  if (sinOmega < 1e-6) {
    return target.copy(a).lerp(b, t).normalize();
  }

  const wa = Math.sin((1 - t) * omega) / sinOmega;
  const wb = Math.sin(t * omega) / sinOmega;
  return target
    .set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb)
    .normalize();
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Hermite ease with zero derivative at both ends. */
export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * Frame-rate independent exponential smoothing factor.
 * `current += (target - current) * damp(rate, delta)` settles at the same rate
 * whether the display runs at 60 Hz or 144 Hz.
 */
export function damp(rate: number, delta: number): number {
  return 1 - Math.exp(-rate * delta);
}

/** Deterministic 32-bit PRNG — stable routes across re-mounts and reloads. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Even-odd ray casting on a flat `[lon, lat, …]` ring.
 * Rings in the atlas are pre-split at the antimeridian, so plain planar
 * testing in degree space is correct.
 */
export function pointInRing(ring: Float64Array, lon: number, lat: number): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2];
    const yi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    if (yi > lat !== yj > lat) {
      const x = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (lon < x) inside = !inside;
    }
  }
  return inside;
}
