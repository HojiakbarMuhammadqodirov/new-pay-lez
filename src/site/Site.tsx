import { useEffect, useState } from 'react';
import { GlobeHero } from '../components/GlobeHero';
import { PaylezIntro } from '../components/PaylezIntro';
import { AdminPage } from './admin';
import { ErrorBoundary } from './ErrorBoundary';
import { AnalyticsPage } from './analytics';
import { AssistantDock } from './AssistantDock';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth, useIsPlayer } from './auth/context';
import { GamesApp } from './games';
import { WalletApp } from './wallet';
import { BusinessPage } from './business';
import { BusinessSetupPage } from './businessSetup';
import { ContactPage } from './contact';
import { DashboardPage } from './dashboard';
import { CityRise } from './city/CityRise';
import { LevelRun } from './level/LevelRun';
import { Header } from './Header';
import { useLanguage } from './i18n/context';
import { LanguageProvider } from './i18n/LanguageProvider';
import { startTraffic, trackView } from './api/traffic';
import { LearnPage } from './learn';
import { PrivacyPage, TermsPage } from './legal';
import { MarketTape } from './market/MarketTape';
import { NetworkWeb } from './network/NetworkWeb';
import { OnboardingPage } from './onboarding';
import { ProfilePage } from './profile';
import { RelocatePage } from './relocate';
import { PATHS, navigate, resolveRoute, useRoute } from './router';
import { SignInPage } from './signin';
import { StreetMap } from './streets/StreetMap';
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
  Subscription,
  Value,
  Voices,
} from './sections';
import { useHeroCopyDepth } from './heroFloor';
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
 * across borders, so the globe hands over to the platformer and the hero's
 * reserved column gets the controller instead. Swapping the layer does cost a
 * WebGL context teardown and a re-parse of the atlas on the way back, which is
 * why it is the *only* thing that swaps besides `<main>`.
 */
function SiteContent() {
  const [introDone, setIntroDone] = useState(false);
  const palette = usePalette();
  /* Published by the landing hero's own copy column — see `heroFloor.ts`. */
  const heroCopyDepth = useHeroCopyDepth();
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
     the same redirect. Catch it up afterwards, where a navigation is allowed —
     and *replace* rather than push, because the hash we are correcting away
     from resolves here again and Back would bounce straight off it. */
  useEffect(() => {
    if (route !== requested) navigate(route, true);
  }, [route, requested]);

  /*
   * The traffic beacon. Started once, and told about the *resolved* route rather
   * than the requested one — a visitor bounced from `#/dashboard` to sign-in
   * saw sign-in, and recording the page they were refused would make the most
   * popular page on the site one nobody ever read.
   *
   * It is fire-and-forget and swallows every failure, so the usual case — no
   * server running — costs nothing and says nothing. See `api/traffic.ts` for
   * the three things it must never start doing.
   */
  useEffect(() => startTraffic(), []);
  useEffect(() => {
    /* `PATHS[route]`, not the route's *name*: four of the eleven names are not
       hashes this site has — `#/landing`, `#/learn`, `#/signin` and
       `#/business-setup` are really `#top`, `#/l-earn`, `#/sign-in` and
       `#/business/setup`. The console's "top pages" table is an operator
       reading URLs, and it was listing four they could not open. */
    trackView(PATHS[route]);
  }, [route]);

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

  /*
   * Onboarding is the third frame, and it is one for a reason the other two do
   * not have: `resolveRoute` holds a new player *here from every route*, so a
   * marketing header above it would be a nav bar whose every link bounces
   * straight back to this page. A footer sitemap under a gate is the same
   * mistake the sign-in page already refuses.
   *
   * No backdrop either — the frames have never had one — and no assistant dock.
   * The dock answers out of your points, your vouchers and your city, and
   * somebody on this screen has none of the three yet; it is the same argument
   * the console's missing dock makes, one screen earlier in the account's life.
   *
   * It still renders a `<main>`, and must: `.site > main` is the only thing the
   * sheet gives `z-index: 1`, so a frame in a plain `<div>` sits behind the
   * page background.
   */
  if (route === 'onboarding') {
    return (
      <div className="site site-app" id="top" data-intro="done">
        <OnboardingPage />
      </div>
    );
  }

  return (
    /*
     * `data-route` is a styling hook, not routing: it lets `site.css` reach a
     * single page without a class per page. The marketing routes share every
     * component they have, so the only way to say "this button, on Home" is to
     * name the route on the root and select through it. The two app frames
     * above deliberately do not carry it — nothing scoped this way may reach
     * the dashboard or the console.
     */
    <div
      className="site"
      id="top"
      data-route={route}
      data-intro={introDone ? 'done' : 'running'}
    >
      {/* Two colours and nothing else: the sequence is the wordmark, so it needs
          the accent and the ground and has no tile to place ink on.

          `oncePerSession` is load-bearing rather than a nicety: the dashboard
          and the console return early above, which *unmounts* this, and a
          remount with the default would replay the whole 2.8s cold-open over
          the landing page every time an owner clicked "Back to site" — with
          `introDone` still true, so the wrapper would claim the intro was done
          while a fixed, full-viewport overlay covered the page. The component
          keeps the flag in `sessionStorage`, which is exactly what survives an
          unmount and not a new tab. */}
      <PaylezIntro
        oncePerSession
        onComplete={() => setIntroDone(true)}
        primaryColor={palette.primary}
        backgroundColor={palette.background}
      />

      {/*
        One backdrop per route, and never two at once: each canvas costs a
        context on a page that already spends one on the controller, and
        browsers cap how many a document may hold. Only one route is ever
        mounted, which is what makes four canvas components affordable — the
        document still holds at most one backdrop context at a time, and only
        the globe's is WebGL.

        Each backdrop is the page's own subject drawn out: the globe is a
        border being crossed (landing, Contact); the platformer is L-Earn's own
        promise — play, get bigger, cash out; the node web is the player base
        whose behaviour Analytics measures; the candle tape is repeat custom
        compounding into Business revenue; the stubs are the vouchers, settling
        into a wallet; the city rising is an unfamiliar place becoming known;
        the street map is the route to reach us. A
        backdrop that cannot say what it means like that is wallpaper, and does
        not ship.
      */}
      {route === 'analytics' ? (
        /*
         * The node web, moved here from L-Earn. The picture always was
         * "drifting points that wire themselves to their neighbours", and that
         * is a truer image of this page than of a game: every dot a customer,
         * every link a pattern the dashboards surface. L-Earn got a level being
         * played in exchange — its own game, not borrowed imagery.
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
         * A city building itself around you — the route's third backdrop, and
         * the first two are the argument for this one.
         *
         * The globe was a border being crossed, which was right when this page
         * was about sending money over one. `.site__rings` replaced it and meant
         * distance from where you are standing: true, and the only backdrop here
         * that never moved, on the one page whose subject is something you are
         * in the middle of doing. Then a street map drew itself in plan, which
         * said the right thing and looked like a wiring diagram — hairlines on
         * black, no mass, nothing a page can stand on.
         *
         * A city is areas and volumes, so this one is built from them: opaque
         * blocks standing up in a wave, streets as the gaps between them, and a
         * horizon the far ones dissolve into. Still canvas 2D, so Relocate does
         * not spend the document's one WebGL context — and still the same
         * sentence, which is what the route needed all along: an unfamiliar
         * place becoming legible, with always more of it than you have learnt.
         */
        <CityRise
          className="site__web"
          primaryColor={palette.primary}
          backgroundColor={palette.background}
          tone={palette.tone}
        />
      ) : route === 'contact' ? (
        /*
         * A route drawing itself — and the reason Contact has one again.
         *
         * It had the globe, and losing it was right for a reason that does not
         * generalise: a **scroll transition** needs a page long enough to retire
         * the hero pose through, and a one-section form has nothing below the
         * fold. That is an argument about `scrollAnchorId`, not about backdrops.
         * A flat canvas has no hero pose and no transition — it is a layer, and
         * a layer over one screen is what a layer is for.
         *
         * The picture is the page's own: getting in touch is a **route**, not a
         * place. An avenue reaches out, side-streets come off it, landmarks
         * light where the map arrives at something, and then another starts from
         * somewhere else — because this page is asked the same question by a
         * different person every day and the answer is always a way through.
         *
         * It was Relocate's for an afternoon and was the wrong picture there:
         * that page's subject is a whole place becoming legible, which is areas
         * and volumes and is now `city/CityRise`. Here the subject genuinely is
         * lines. Same drawing, and only one of the two routes was ever right for
         * it — which is what "one route per backdrop" is actually about.
         */
        <StreetMap
          className="site__web"
          primaryColor={palette.primary}
          tone={palette.tone}
        />
      ) : route === 'privacy' || route === 'terms' || route === 'profile' ? (
        /*
         * No backdrop at all, and that is the point rather than an omission.
         *
         * Every other backdrop on this site is the page's own subject drawn out,
         * and a legal document's subject is the text. There is no honest picture
         * of a retention schedule, so anything here would be the wallpaper the
         * rule against one more canvas exists to prevent — and worse, a moving
         * field under six pages of clauses is a readability cost paid for
         * decoration.
         *
         * Contact was here for a while and has left again — it is one screen,
         * which rules out the *globe* and rules out nothing else; see the branch
         * above. What keeps the two legal pages on this list is the subject
         * rather than the length.
         *
         * The profile is the third, on both counts at once. It is one section
         * — a form and a rail — so there is nothing for the globe to travel
         * through and it would sit straight on top of the fields; and the
         * subject is somebody's own name, city and photograph, which no
         * backdrop on this site is a picture of. A globe behind it would be the
         * wallpaper the one-backdrop-per-route rule exists to prevent.
         */
        null
      ) : route === 'business' || route === 'business-setup' ? (
        /* Business setup takes the candle tape, which is already what the
           Business page means: repeat custom compounding into revenue.
           Describing your venue is the first move in that, and reusing the
           canvas costs nothing. */
        <MarketTape
          className="site__web"
          primaryColor={palette.primary}
          tone={palette.tone}
        />
      ) : route === 'learn' ? (
        /*
         * The level, for everybody.
         *
         * L-Earn used to be the one route whose backdrop turned on who was
         * reading — the arcade trail signed out, the platformer signed in — on
         * the argument that a visitor is being *sold* the games and a player is
         * playing them. Two backdrops for one page turned out to be the weaker
         * half of that argument: the platformer is the page's promise in the one
         * grammar nobody has to be taught — a runner breaks blocks, takes a
         * power-up out of a lucky box, grows, and leaves down a pipe, which is
         * play, get bigger, cash out — and that is *more* useful to somebody who
         * has not signed up than to somebody who already has. A visitor who has
         * to be told what L-Earn is gets shown it instead.
         *
         * Still one context at a time; there is simply only one of these now.
         */
        <LevelRun
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
          /*
           * Measured, not assumed. On a phone the globe sinks into the slot
           * below the hero copy, and the constant it used to be aimed with is
           * only correct on a ~844px-tall screen — see `heroFloor.ts`.
           */
          copyDepth={heroCopyDepth}
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
           * It is also the only page left in this branch that is like that —
           * Contact was the other one, and it lost the globe when it lost the
           * two sections that gave it something to scroll through.
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
          scrollAnchorId="guide"
        />
      )}

      <Header route={route} />

      {route === 'signin' ? (
        <SignInPage />
      ) : route === 'business-setup' ? (
        <BusinessSetupPage />
      ) : route === 'analytics' ? (
        <AnalyticsPage />
      ) : route === 'business' ? (
        <BusinessPage />
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
      ) : route === 'profile' ? (
        /* A page rather than a frame, unlike the three above it: an account
           reading its own record is still inside the site, and the header is
           how it got here and how it leaves. */
        <ProfilePage />
      ) : route === 'contact' ? (
        <ContactPage />
      ) : route === 'privacy' ? (
        <PrivacyPage />
      ) : route === 'terms' ? (
        <TermsPage />
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
          <Subscription />
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
    /* Outermost of the four, and it has to be: a boundary catches only what is
       below it, and the three providers are as capable of throwing as the
       screens are. It is also why its panel is not translated — see
       `ErrorBoundary`, and the black dashboard that is the reason it exists. */
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          {/* Innermost of the three: the session decides what renders, and both
              the theme and the language have to be readable while it does. */}
          <AuthProvider>
            <SiteContent />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
