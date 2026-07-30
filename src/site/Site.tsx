import { useState } from 'react';
import { GlobeHero, COLORS } from '../components/GlobeHero';
import { PaylezIntro } from '../components/PaylezIntro';
import { AssistantButton } from './AssistantButton';
import { Header } from './Header';
import { LanguageProvider } from './i18n/LanguageProvider';
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
 */
function SiteContent() {
  const [introDone, setIntroDone] = useState(false);

  useReveal();
  useCountUp();

  return (
    <div className="site" id="top" data-intro={introDone ? 'done' : 'running'}>
      <PaylezIntro onComplete={() => setIntroDone(true)} />

      <GlobeHero
        className="site__globe"
        primaryColor={COLORS.primary}
        backgroundColor={COLORS.background}
        offsetX={0.18}
        heightCoverage={0.62}
        routeCount={16}
        scrollTransition
        scrollAnchorId="guide"
      />

      <Header />

      <main>
        <Hero />
        <Proof />
        <Guide />
        <Features />
        <Value />
        <Voices />
        <FinalCta />
      </main>

      <SiteFooter />

      <AssistantButton />
    </div>
  );
}

export function Site() {
  return (
    <LanguageProvider>
      <SiteContent />
    </LanguageProvider>
  );
}
