import { useEffect, useRef, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { GLOBE, ROUTES } from '../config';
import { useAtlas } from '../hooks/useAtlas';
import { useGlobeLayout } from '../hooks/useGlobeLayout';
import { useGlobeTransition } from '../hooks/useGlobeTransition';
import { useRotation } from '../hooks/useRotation';
import { useCenteredCountry } from '../hooks/useCenteredCountry';
import type { FocusStore } from '../state/focusStore';
import type { GlobeTone } from '../types';
import { CountryBorders } from './CountryBorders';
import { GlobeSurface } from './GlobeSurface';
import { Routes } from './Routes';

interface GlobeSceneProps {
  rotationSpeed: number;
  primaryColor: string;
  backgroundColor: string;
  tone: GlobeTone;
  showRoutes: boolean;
  showLabels: boolean;
  routeCount: number;
  offsetX: number;
  heightCoverage: number;
  paused: boolean;
  scrollTransition: boolean;
  scrollProgress: RefObject<number>;
  focusStore: FocusStore;
  /** Globe silhouette in CSS pixels, so the DOM overlay can sit beside it. */
  onSilhouette: (centreX: number, radius: number) => void;
}

/**
 * Scene graph:
 *
 *   frame   — position + axial tilt; driven by scroll, never by React
 *     └ globe — the only other animated transform: a single `rotation.y`
 *         ├ surface   (opaque, writes depth — occludes everything behind it)
 *         ├ borders   (one merged LineSegments)
 *         └ routes    (one merged ribbon mesh, GPU-animated)
 *
 * The two transforms are deliberately on separate groups: scroll owns the
 * frame's position and tilt, the clock owns the globe's spin, and neither can
 * disturb the other.
 */
export function GlobeScene({
  rotationSpeed,
  primaryColor,
  backgroundColor,
  tone,
  showRoutes,
  showLabels,
  routeCount,
  offsetX,
  heightCoverage,
  paused,
  scrollTransition,
  scrollProgress,
  focusStore,
  onSilhouette,
}: GlobeSceneProps) {
  const frameRef = useRef<Group>(null);
  const globeRef = useRef<Group>(null);
  const atlas = useAtlas();
  const layout = useGlobeLayout(offsetX, heightCoverage);

  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  // Publish the hero-pose silhouette in pixels. Only on resize — the label is
  // gone well before the scroll transition moves the globe anywhere else.
  useEffect(() => {
    const { hero } = layout;
    const visibleWidth = hero.visibleHeight * (width / Math.max(height, 1));
    onSilhouette(
      width / 2 + (hero.x / visibleWidth) * width,
      (GLOBE.radius / hero.visibleHeight) * height,
    );
  }, [layout, width, height, onSilhouette]);

  useGlobeTransition(frameRef, layout, scrollProgress, scrollTransition);
  useRotation(globeRef, rotationSpeed, paused);
  useCenteredCountry(globeRef, atlas?.features ?? null, focusStore, showLabels);

  const routes = Math.max(0, Math.min(routeCount, ROUTES.maxCount));

  return (
    <group ref={frameRef}>
      <group ref={globeRef}>
        <GlobeSurface
          primaryColor={primaryColor}
          backgroundColor={backgroundColor}
          tone={tone}
        />

        {atlas && (
          <CountryBorders
            positions={atlas.borderPositions}
            primaryColor={primaryColor}
            tone={tone}
          />
        )}

        {atlas && showRoutes && routes > 0 && (
          <Routes
            features={atlas.features}
            count={routes}
            primaryColor={primaryColor}
            tone={tone}
            paused={paused}
          />
        )}
      </group>
    </group>
  );
}
