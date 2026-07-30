import { memo, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { NoToneMapping } from 'three';
import { DEFAULTS, RESPONSIVE, SCROLL, UI } from './config';
import type { GlobeHeroProps } from './types';
import { GlobeScene } from './scene/GlobeScene';
import { Effects } from './scene/Effects';
import { CountryCard } from './ui/CountryCard';
import { createFocusStore } from './state/focusStore';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useScrollProgress } from './hooks/useScrollProgress';
import './GlobeHero.css';

/**
 * Procedural globe hero.
 *
 * Renders a rotating wireframe planet built entirely from GeoJSON country
 * polygons — no textures, no models, no image assets — with animated
 * great-circle routes and an Apple-Maps-style label for whichever country is
 * currently closest to the centre of the screen.
 *
 * With `scrollTransition` on, the globe also travels: scrolling grows it,
 * sinks it below the fold and turns its axis to face the viewer, so it comes
 * to rest as a wide arc across the bottom of the page.
 *
 * The whole scene is two colours: `backgroundColor` and `primaryColor`.
 *
 * Frame budget (1440p, integrated GPU): 3 draw calls for the globe
 * (surface / borders / routes) plus one bloom pass. Per frame the CPU writes
 * two numbers at rest — `rotation.y` and the routes' `uTime` — and four more
 * while a scroll transition is in flight.
 */
export const GlobeHero = memo(function GlobeHero({
  rotationSpeed = DEFAULTS.rotationSpeed,
  primaryColor = DEFAULTS.primaryColor,
  backgroundColor = DEFAULTS.backgroundColor,
  showRoutes = DEFAULTS.showRoutes,
  showLabels = DEFAULTS.showLabels,
  routeCount = DEFAULTS.routeCount,
  glowStrength = DEFAULTS.glowStrength,
  offsetX = DEFAULTS.offsetX,
  heightCoverage = DEFAULTS.heightCoverage,
  scrollTransition = DEFAULTS.scrollTransition,
  scrollAnchorId,
  className,
  style,
}: GlobeHeroProps) {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  // One store per instance; created once and never re-created.
  const focusStore = useMemo(() => createFocusStore(), []);

  // Published as a CSS variable so the overlay can react to scroll without a
  // single React render — see `CountryCard.css`.
  const publishProgress = useCallback((progress: number, exit: number) => {
    const node = rootRef.current;
    if (!node) return;
    node.style.setProperty('--gh-scroll', progress.toFixed(4));
    node.style.setProperty('--gh-exit', exit.toFixed(4));
  }, []);

  // The country badge sits beside the globe, so it needs the globe's silhouette
  // in page pixels. Published as CSS variables rather than props so the overlay
  // repositions without a React render.
  const publishSilhouette = useCallback((centreX: number, radius: number) => {
    const node = rootRef.current;
    if (!node) return;
    node.style.setProperty('--gh-globe-left', `${centreX - radius}px`);
    node.style.setProperty('--gh-globe-right', `${centreX + radius}px`);
  }, []);

  const { progress: scrollProgress } = useScrollProgress({
    enabled: scrollTransition,
    rangeVh: SCROLL.rangeVh,
    anchorId: scrollAnchorId,
    onChange: publishProgress,
  });

  const rootStyle = useMemo<CSSProperties>(
    () =>
      ({
        '--gh-primary': primaryColor,
        '--gh-background': backgroundColor,
        '--gh-duration': `${UI.transitionMs}ms`,
        '--gh-scroll': 0,
        '--gh-exit': 0,
        background: backgroundColor,
        ...style,
      }) as CSSProperties,
    [primaryColor, backgroundColor, style],
  );

  return (
    <div
      ref={rootRef}
      className={className ? `gh-root ${className}` : 'gh-root'}
      style={rootStyle}
    >
      <Canvas
        dpr={RESPONSIVE.dpr}
        gl={{
          // With bloom on, the composer does its own MSAA — a second AA pass
          // on the default framebuffer would be paid for and thrown away.
          antialias: glowStrength <= 0,
          alpha: false,
          powerPreference: 'high-performance',
          // Exact brand hue: any tone mapping would desaturate the accent.
          toneMapping: NoToneMapping,
        }}
        camera={{ position: [0, 0, 5] }}
        // The scene animates by design, so there is nothing for `demand` to
        // skip. Render cost is 4 draw calls plus one bloom pass; the savings
        // that matter are on the React side (see `focusStore`).
        frameloop="always"
      >
        <color attach="background" args={[backgroundColor]} />

        <GlobeScene
          rotationSpeed={rotationSpeed}
          primaryColor={primaryColor}
          backgroundColor={backgroundColor}
          showRoutes={showRoutes}
          showLabels={showLabels}
          routeCount={routeCount}
          offsetX={offsetX}
          heightCoverage={heightCoverage}
          paused={reducedMotion}
          scrollTransition={scrollTransition}
          scrollProgress={scrollProgress}
          focusStore={focusStore}
          onSilhouette={publishSilhouette}
        />

        {glowStrength > 0 && <Effects glowStrength={glowStrength} />}
      </Canvas>

      {showLabels && <CountryCard store={focusStore} />}
    </div>
  );
});
