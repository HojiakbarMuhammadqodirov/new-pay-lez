import { useState } from 'react';
import { GlobeHero } from '../components/GlobeHero';
import { PaylezIntro } from '../components/PaylezIntro';
import { AnalyticsPage } from './analytics';
import { AssistantButton } from './AssistantButton';
import { B2bPage } from './b2b';
import { Header } from './Header';
import { useLanguage } from './i18n/context';
import { LanguageProvider } from './i18n/LanguageProvider';
import { LearnPage } from './learn';
import { MarketTape } from './market/MarketTape';
import { NetworkWeb } from './network/NetworkWeb';
import { RelocatePage } from './relocate';
import { useRoute } from './router';
import { VouchersPage } from './vouchers';
import { usePalette } from './theme/context';
import { ThemeProvider } from './theme/ThemeProvider';
import {
  Features,
  FinalCta,
  Guide,
  Hero,
  Proof,
  SiteFooter,
  Value,
  Voices,
} from './sections';
import { useCountUp, useReveal } from './useReveal';
import './site.css';

/**
 * The Paylez landing page.
 *
 * Structure and copy follow the original `Paylez Home.html`; the surface is
 * rebuilt in the globe's two-colour system.
 *
 * The globe is a single fixed layer behind the whole page rather than a
 * per-section visual. It starts as the hero's right-hand column — where the
 * original design had a phone mockup — and its scroll transition is anchored to
 * the `#guide` section, so by the time "Discover services in your city" arrives
 * it has settled into the half-bottom arc and the service carousel rides on
 * top of it. Past that section it retires.
 *
 * The canvases take their colours from the theme by prop: CSS custom properties
 * are invisible to WebGL, so `theme/context.ts` is where the two palettes agree.
 *
 * L-Earn is the second route. It shares this shell — one header, one footer,
 * one intro — but not the backdrop: L-Earn is about playing, not about paying
 * across borders, so the globe hands over to a neon node web and the hero's
 * reserved column gets the controller instead. Swapping the layer does cost a
 * WebGL context teardown and a re-parse of the atlas on the way back, which is
 * why it is the *only* thing that swaps besides `<main>`.
 */
function SiteContent() {
  const [introDone, setIntroDone] = useState(false);
  const palette = usePalette();
  const route = useRoute();
  const [language] = useLanguage();

  /*
   * Re-scan on navigation *and* on a language change. Both hooks bind to the
   * DOM that exists when they run, and both events replace some of it.
   *
   * The route case is obvious — it replaces the whole page. The language case is
   * not: most lists here are keyed by a translated string, so switching language
   * changes the keys and React remounts those elements. The replacements arrive
   * with no `data-shown` and are invisible to an observer built from the
   * previous scan, so without this a mid-page language switch blanks every card
   * that was already on screen. The count-up needs it for a second reason: a
   * money figure's target depends on the currency the language picks (see
   * `i18n/currency.ts`), and it writes the digits into `textContent`
   * imperatively, where React cannot see that they went stale.
   */
  useReveal(`${route}:${language}`);
  useCountUp(`${route}:${language}`);

  return (
    <div className="site" id="top" data-intro={introDone ? 'done' : 'running'}>
      <PaylezIntro
        onComplete={() => setIntroDone(true)}
        primaryColor={palette.primary}
        backgroundColor={palette.background}
        onPrimaryColor={palette.onPrimary}
      />

      {/*
        One backdrop per route, and never two at once: each canvas costs a WebGL
        or 2D context on a page that already spends one on the controller, and
        browsers cap how many a document may hold.

        Six routes, three canvases. Analytics and Vouchers are CSS only — a plot
        grid and a run of ticket perforations — which is not a compromise on
        either: a dashboard brochure full of its own charts does not want a
        fourth thing moving behind them, and a perforation is a thing that does
        not move.

        Relocate keeps the globe, and it is the one route besides the landing
        page that should: the globe is a border being crossed, which is the whole
        subject of the page. Rendering it twice costs nothing, because only one
        route is ever mounted.
      */}
      {route === 'analytics' ? (
        <div className="site__grid" aria-hidden />
      ) : route === 'vouchers' ? (
        <div className="site__stubs" aria-hidden />
      ) : route === 'b2b' ? (
        <MarketTape
          className="site__web"
          primaryColor={palette.primary}
          tone={palette.tone}
        />
      ) : route === 'learn' ? (
        <NetworkWeb
          className="site__web"
          primaryColor={palette.primary}
          tone={palette.tone}
        />
      ) : (
        <GlobeHero
          className="site__globe"
          primaryColor={palette.primary}
          backgroundColor={palette.background}
          tone={palette.tone}
          glowStrength={palette.glow}
          offsetX={0.18}
          heightCoverage={0.62}
          routeCount={16}
          scrollTransition
          /*
           * Each page anchors the transition to its own *third* section — the
           * point by which the globe has finished being the hero's right-hand
           * column and has settled into the arc the page rides on. The second
           * section is too early on both: the globe is still large when the
           * content arrives, and it ends up behind a card rather than under a
           * carousel. Renaming either section changes when it settles.
           */
          scrollAnchorId={route === 'relocate' ? 'relocate-guide' : 'guide'}
        />
      )}

      <Header route={route} />

      {route === 'analytics' ? (
        <AnalyticsPage />
      ) : route === 'b2b' ? (
        <B2bPage />
      ) : route === 'vouchers' ? (
        <VouchersPage />
      ) : route === 'relocate' ? (
        <RelocatePage />
      ) : route === 'learn' ? (
        <LearnPage />
      ) : (
        <main>
          <Hero />
          <Proof />
          <Guide />
          <Features />
          <Value />
          <Voices />
          <FinalCta />
        </main>
      )}

      <SiteFooter />

      <AssistantButton />
    </div>
  );
}

export function Site() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <SiteContent />
      </LanguageProvider>
    </ThemeProvider>
  );
}
