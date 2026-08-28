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
  tone = DEFAULTS.tone,
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

  /*
   * Bloom is additive light, and a light page has no headroom left above it:
   * every flare would clip to flat white and take the borders with it. So the
   * ink tone forbids it rather than trusting each caller to pass 0.
   */
  const glow = tone === 'ink' ? 0 : glowStrength;

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
          /*
           * Unconditional, even though with bloom on the composer does its own
           * MSAA and this one is largely paid for and thrown away.
           *
           * `antialias` is a *context creation* attribute: it is read once,
           * when the WebGL context is made, and `WebGLRenderer` has no settable
           * counterpart. R3F re-applies `gl` props onto the existing renderer;
           * it never re-creates the context. So `glow <= 0` here was frozen at
           * first paint — load in dark, toggle to light, and the composer
           * unmounts while the context stays antialias-free, leaving the border
           * hairlines jagged. On a light page those hairlines *are* the globe,
           * so it is the most conspicuous surface in the scene.
           *
           * The alternative is keying the Canvas on `tone` to force a remount,
           * and that costs far more than a resolve: a new context (browsers cap
           * how many a document may hold), every geometry rebuilt and
           * re-uploaded, every shader recompiled, and a black frame across the
           * whole viewport on a theme toggle. A multisampled backbuffer that
           * only ever resolves the composer's full-screen triangle is the
           * cheaper mistake, and its cost is constant rather than per-vertex.
           */
          antialias: true,
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
          tone={tone}
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

        {glow > 0 && <Effects glowStrength={glow} />}
      </Canvas>

      {showLabels && <CountryCard store={focusStore} />}
    </div>
  );
});
