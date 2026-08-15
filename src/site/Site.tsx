import { useEffect, useState } from 'react';
import { GlobeHero } from '../components/GlobeHero';
import { PaylezIntro } from '../components/PaylezIntro';
import { AdminPage } from './admin';
import { AnalyticsPage } from './analytics';
import { ArcadeTrail } from './arcade/ArcadeTrail';
import { AssistantDock } from './AssistantDock';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth, useIsPlayer } from './auth/context';
import { GamesApp } from './games';
import { WalletApp } from './wallet';
import { B2bPage } from './b2b';
import { BusinessSetupPage } from './business';
import { ContactPage } from './contact';
import { DashboardPage } from './dashboard';
import { LevelRun } from './level/LevelRun';
import { Header } from './Header';
import { useLanguage } from './i18n/context';
import { LanguageProvider } from './i18n/LanguageProvider';
import { LearnPage } from './learn';
import { MarketTape } from './market/MarketTape';
import { NetworkWeb } from './network/NetworkWeb';
import { RelocatePage } from './relocate';
import { navigate, resolveRoute, useRoute } from './router';
import { SignInPage } from './signin';
import { StubDrift } from './stubs/StubDrift';
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
 * across borders, so the globe hands over to the arcade trail and the hero's
 * reserved column gets the controller instead. Swapping the layer does cost a
 * WebGL context teardown and a re-parse of the atlas on the way back, which is
 * why it is the *only* thing that swaps besides `<main>`.
 */
function SiteContent() {
  const [introDone, setIntroDone] = useState(false);
  const palette = usePalette();
  const requested = useRoute();
  const [language] = useLanguage();
  const { account } = useAuth();
  const isPlayer = useIsPlayer();

  /*
   * The route the session actually allows. Resolved during render rather than
   * corrected in an effect, so a page this account may not see is never mounted
   * for a frame — see `resolveRoute` in `router.ts`.
   */
  const route = resolveRoute(requested, account);

  /* The address bar still says otherwise, though, and a refresh would replay
     the same redirect. Catch it up afterwards, where a navigation is allowed. */
  useEffect(() => {
    if (route !== requested) navigate(route);
  }, [route, requested]);

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
  /*
   * The account is part of the key for the same reason the language is: signing
   * in or out swaps whole subtrees — the header's chip, the nav minus two items,
   * an entire dashboard — and elements mounted after the observer was built
   * carry no `data-shown`, so they would stay at `opacity: 0` forever.
   */
  const scanKey = `${route}:${language}:${account?.type ?? 'anon'}`;
  useReveal(scanKey);
  useCountUp(scanKey);

  /*
   * The two app frames, not pages: no marketing header, no footer, no backdrop.
   * Returning early keeps them out of the ternary chains below, which are about
   * the site.
   *
   * The console has no assistant dock, and that is the one difference between
   * the two. The assistant answers out of *your* points, vouchers and city; an
   * admin has none of those, and a panel that opened onto somebody else's would
   * be the worst thing on this screen.
   */
  if (route === 'dashboard') {
    return (
      <div className="site site-app" id="top" data-intro="done">
        <DashboardPage />
        <AssistantDock />
      </div>
    );
  }

  if (route === 'admin') {
    return (
      <div className="site site-app" id="top" data-intro="done">
        <AdminPage />
      </div>
    );
  }

  return (
    <div className="site" id="top" data-intro={introDone ? 'done' : 'running'}>
      {/* Two colours and nothing else: the sequence is the wordmark, so it needs
          the accent and the ground and has no tile to place ink on. */}
      <PaylezIntro
        onComplete={() => setIntroDone(true)}
        primaryColor={palette.primary}
        backgroundColor={palette.background}
      />

      {/*
        One backdrop per route, and never two at once: each canvas costs a
        context on a page that already spends one on the controller, and
        browsers cap how many a document may hold. Only one route is ever
        mounted, which is what makes five canvas components affordable — the
        document still holds at most one backdrop context at a time, and only
        the globe's is WebGL.

        Each backdrop is the page's own subject drawn out: the globe is a
        border being crossed (landing, Contact); the arcade trail is Squawk's
        Flight itself, the game L-Earn is selling; the node web is the player
        base whose behaviour Analytics measures; the market tape is repeat
        custom compounding into B2B revenue; the stubs are the vouchers,
        settling into a wallet; Relocate's rings are distance from where you
        stand. A backdrop that cannot say what it means like that is wallpaper,
        and does not ship.
      */}
      {route === 'analytics' ? (
        /*
         * The node web, moved here from L-Earn. The picture always was
         * "drifting points that wire themselves to their neighbours", and that
         * is a truer image of this page than of the arcade: every dot a
         * customer, every link a pattern the dashboards surface. L-Earn got
         * the arcade trail in exchange — its own game, not borrowed imagery.
         */
        <NetworkWeb
          className="site__web"
          primaryColor={palette.primary}
          tone={palette.tone}
        />
      ) : route === 'vouchers' ? (
        <StubDrift
          className="site__web"
          primaryColor={palette.primary}
          tone={palette.tone}
        />
      ) : route === 'relocate' ? (
        /*
         * Rings, not the globe.
         *
         * The globe was a border being crossed, which was right when this page
         * was about sending money over one. It is a guide to the place you have
         * already arrived in and a converter — so the picture is distance from
         * where you are standing: contour rings spreading out from a point, the
         * way a map draws "near you". CSS, not a canvas, which also means
         * Relocate no longer spends the document's one WebGL context.
         */
        <div className="site__rings" aria-hidden />
      ) : route === 'b2b' || route === 'business-setup' ? (
        /* Business setup takes the market tape, which is already what B2B
           means: repeat custom compounding into revenue. Describing your venue
           is the first move in that, and reusing the canvas costs nothing. */
        <MarketTape
          className="site__web"
          primaryColor={palette.primary}
          tone={palette.tone}
        />
      ) : route === 'learn' ? (
        /*
         * L-Earn is the one route whose backdrop turns on who is reading, and
         * the split is the same one `<main>` already makes. Signed out, the
         * page is *selling* the arcade, so it shows the arcade. Signed in it is
         * no longer a pitch — you are the one playing — so it shows a level
         * being played: a runner breaking blocks, taking a power-up out of a
         * lucky box, growing, and leaving down a pipe, forever. Still one
         * context at a time: only ever one of these mounts.
         */
        isPlayer ? (
          <LevelRun
            className="site__web"
            primaryColor={palette.primary}
            tone={palette.tone}
          />
        ) : (
          <ArcadeTrail
            className="site__web"
            primaryColor={palette.primary}
            tone={palette.tone}
          />
        )
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
          /*
           * No country label. The flag-and-name card that popped in beside the
           * globe is off: it was competing with the hero copy it sat next to,
           * and the globe reads as "a border being crossed" without narrating
           * which border. Off here rather than deleted — the detection loop and
           * the card are intact behind this one prop, and turning it back on is
           * changing `false` to `true`. See `GlobeHero/README.md`.
           */
          showLabels={false}
          /*
           * Sign-in is one screenful with nothing below it, so there is no
           * scroll for the globe to travel through and it holds the hero pose.
           * Contact is not that — it has a channel grid and a form under the
           * fold, and a pinned globe sits straight on top of them.
           */
          scrollTransition={route !== 'signin'}
          /*
           * Anchored to the page's *third* section — the point by which the
           * globe has finished being the hero's right-hand column and has
           * settled into the arc the page rides on. The second section is too
           * early: the globe is still large when the content arrives, and it
           * ends up behind a card rather than under a carousel. Renaming either
           * section changes when it settles.
           */
          scrollAnchorId={route === 'contact' ? 'contact-form' : 'guide'}
        />
      )}

      <Header route={route} />

      {route === 'signin' ? (
        <SignInPage />
      ) : route === 'business-setup' ? (
        <BusinessSetupPage />
      ) : route === 'analytics' ? (
        <AnalyticsPage />
      ) : route === 'b2b' ? (
        <B2bPage />
      ) : route === 'vouchers' ? (
        /* Signed in as a player, these two stop being pages *about* the product
           and become the product. A business owner keeps the marketing version —
           those pages describe their customers' experience, not their own. */
        isPlayer ? (
          <WalletApp />
        ) : (
          <VouchersPage />
        )
      ) : route === 'relocate' ? (
        <RelocatePage />
      ) : route === 'contact' ? (
        <ContactPage />
      ) : route === 'learn' ? (
        isPlayer ? (
          <GamesApp />
        ) : (
          <LearnPage />
        )
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

      {/* Sign-in is one card on an otherwise empty screen; a full sitemap under
          it turns the front door into a footer with a form on top. */}
      {route !== 'signin' && <SiteFooter />}

      <AssistantDock />
    </div>
  );
}

export function Site() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        {/* Innermost of the three: the session decides what renders, and both
            the theme and the language have to be readable while it does. */}
        <AuthProvider>
          <SiteContent />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
