import { useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Raycaster, Sphere, Vector2, Vector3 } from 'three';
import { DETECTION, GLOBE } from '../config';
import type { CountryFeature } from '../types';
import { vec3ToLatLon } from '../geo/math';
import { locateCountry } from '../geo/locate';
import type { FocusStore } from '../state/focusStore';

const SCREEN_CENTRE = new Vector2(0, 0);

/**
 * Resolves which country currently sits closest to the **screen centre**.
 *
 * The globe is deliberately off-centre, so this is not simply "the point facing
 * the camera": we cast the centre-screen ray, intersect the globe, and fall
 * back to the closest point on the silhouette when the ray misses entirely
 * (narrow viewports, large offsets).
 *
 * Runs on a fixed `DETECTION.intervalMs` tick rather than every frame, with a
 * debounce so a country has to hold the centre before the label commits —
 * that's what stops border crossings from flickering.
 */
export function useCenteredCountry(
  globeRef: RefObject<Group | null>,
  features: CountryFeature[] | null,
  store: FocusStore,
  enabled: boolean,
): void {
  const camera = useThree((state) => state.camera);

  // Narrowing the candidate set to the spotlight countries is both the feature
  // and the optimisation: the hit test walks 5 features instead of 177.
  const candidates = useMemo(() => {
    if (!features) return null;
    if (!DETECTION.spotlight.length) return features;
    const wanted = new Set(DETECTION.spotlight);
    return features.filter((f) => f.iso2 && wanted.has(f.iso2));
  }, [features]);

  const fallbackDegrees = DETECTION.spotlight.length
    ? DETECTION.spotlightFallbackDegrees
    : DETECTION.maxOceanDegrees;

  const raycaster = useRef(new Raycaster());
  const sphere = useRef(new Sphere(new Vector3(), GLOBE.radius));
  const hit = useRef(new Vector3());
  const worldCentre = useRef(new Vector3());

  const sinceSample = useRef(0);
  const candidateId = useRef<string | null>(null);
  const candidateAge = useRef(0);

  useFrame((_, delta) => {
    const globe = globeRef.current;
    if (!enabled || !candidates || !globe) return;

    sinceSample.current += delta;
    if (sinceSample.current * 1000 < DETECTION.intervalMs) return;
    const elapsed = sinceSample.current;
    sinceSample.current = 0;

    globe.getWorldPosition(worldCentre.current);
    sphere.current.center.copy(worldCentre.current);
    sphere.current.radius = GLOBE.radius;

    raycaster.current.setFromCamera(SCREEN_CENTRE, camera);
    const ray = raycaster.current.ray;

    if (!ray.intersectSphere(sphere.current, hit.current)) {
      // Ray misses the globe: use the silhouette point nearest to the ray.
      ray.closestPointToPoint(worldCentre.current, hit.current);
      hit.current
        .sub(worldCentre.current)
        .normalize()
        .multiplyScalar(GLOBE.radius)
        .add(worldCentre.current);
    }

    // World -> globe-local undoes offset, tilt and the current spin in one step.
    globe.worldToLocal(hit.current);
    const [lat, lon] = vec3ToLatLon(hit.current);

    const found = locateCountry(candidates, lat, lon, fallbackDegrees);
    const foundId = found?.id ?? null;

    if (foundId !== candidateId.current) {
      candidateId.current = foundId;
      candidateAge.current = 0;
      return;
    }

    candidateAge.current += elapsed;
    if (candidateAge.current * 1000 < DETECTION.debounceMs) return;

    store.set(
      found ? { id: found.id, iso2: found.iso2, name: found.name } : null,
    );
  });
}
