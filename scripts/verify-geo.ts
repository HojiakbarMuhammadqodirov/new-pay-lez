/**
 * Headless sanity check for the parts of the globe that are pure maths.
 *
 * The 3D layer needs a browser, but the atlas parser, the sphere projection,
 * the country hit-test and the route baker are all deterministic — so they get
 * checked here instead of by eye.
 *
 *   npm run verify
 */
import { loadAtlas } from '../src/components/GlobeHero/geo/atlas';
import { locateCountry } from '../src/components/GlobeHero/geo/locate';
import { buildRouteGeometry } from '../src/components/GlobeHero/geo/routeGeometry';
import { flagEmoji } from '../src/components/GlobeHero/geo/countryCodes';
import { latLonToVec3, vec3ToLatLon, TAU } from '../src/components/GlobeHero/geo/math';
import { resolveLayout } from '../src/components/GlobeHero/geo/layout';
import { INTRO as INTRO_TIMING } from '../src/components/PaylezIntro/config';
import {
  DEFAULTS,
  DETECTION,
  GLOBE,
  MOTION,
  ROUTES,
  SCROLL,
  UI,
} from '../src/components/GlobeHero/config';
import {
  ANCHOR_ROUTES,
  PATHS,
  resolveRoute,
  routeOf,
  type Route,
} from '../src/site/router';
import { draw, shuffledRange } from '../src/site/games/bag';
import { flagOf } from '../src/site/games/banks';
import type { Account } from '../src/site/auth/context';
import {
  blankBusiness,
  isBusinessReady,
  profileCompleteness,
  REQUIRED_FIELDS,
} from '../src/site/auth/business';
import {
  findUser,
  MIN_PASSWORD,
  newUser,
  SEED_USERS,
  validateSignUp,
} from '../src/site/auth/users';
import {
  activeVouchers,
  awardFlight,
  awardRound,
  bankableGaps,
  canAfford,
  flightPoints,
  freezesOf,
  markUsed,
  MAX_FLIGHT_GAPS,
  MAX_FREEZES,
  MAX_LIVES,
  memoryPoints,
  redeem,
  refillLives,
  seedPlayer,
  usedVouchers,
  wordPoints,
} from '../src/site/auth/player';
import { FLIGHT } from '../src/site/flight/config';
import { crossed, flap, gapCentre, hits, hitsBounds, spawnPipe, stepBird } from '../src/site/flight/engine';
import { PARROT_PARTS, PART_STYLES } from '../src/site/flight/parrot';
import { GAMES } from '../src/site/content';
/* The source dictionary, read for its *shapes* rather than its words: the
   dashboard's arrays are index-aligned with the seeds below, and a stale index
   renders `undefined` instead of throwing. */
import { en } from '../src/site/i18n/en';
import { CURRENCIES, money } from '../src/site/i18n/currency';
import {
  HEAT_HOURS,
  PD_ALLOCATION,
  PD_ASSIST,
  PD_ASSIST_COPY,
  PD_AUDIENCES,
  PD_CAMPAIGN_MODEL,
  PD_COST_ROWS,
  PD_COST_TOTAL,
  PD_CUSTOMERS,
  PD_DEALS,
  PD_HEAT,
  PD_HEAT_MAX,
  PD_MAX_PER_VOUCHER,
  PD_PER_NEW,
  PD_RANGES,
  PD_ROSTER,
  PD_SCAN_NAMES,
  PD_SCANS,
  PD_SERIES,
  PD_TOTALS,
  PD_VOUCHER_MODEL,
  RANGE_DAYS,
  dealNotify,
  metricsFor,
  polyarea,
  polyline,
} from '../src/site/partnerMetrics';
import { LANGUAGE_ORDER, LANGUAGES } from '../src/site/i18n/context';
import {
  dayLabel,
  inRange,
  RANGES,
  redemptionsFor,
  scanRowsFor,
  serviceMetrics,
  toCsv,
  voucherRowsFor,
} from '../src/site/adminMetrics';
import { Vector3 } from 'three';

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

const atlas = await loadAtlas();

console.log('\natlas');
check('features parsed', atlas.features.length > 150, `${atlas.features.length} countries`);
check(
  'border buffer is whole segments',
  atlas.borderPositions.length % 6 === 0,
  `${atlas.borderPositions.length / 6} segments`,
);

{
  const expected = GLOBE.radius + GLOBE.borderAltitude;
  let worst = 0;
  for (let i = 0; i < atlas.borderPositions.length; i += 3) {
    const r = Math.hypot(
      atlas.borderPositions[i],
      atlas.borderPositions[i + 1],
      atlas.borderPositions[i + 2],
    );
    worst = Math.max(worst, Math.abs(r - expected));
  }
  check('every border vertex sits on the shell', worst < 1e-4, `max drift ${worst.toExponential(2)}`);
}

console.log('\nprojection round-trip');
{
  let worst = 0;
  for (const [lat, lon] of [
    [0, 0],
    [51.5, -0.13],
    [-33.87, 151.21],
    [41.31, 69.24],
    [-89, 179.9],
  ]) {
    const [rLat, rLon] = vec3ToLatLon(latLonToVec3(lat, lon, GLOBE.radius, new Vector3()));
    worst = Math.max(worst, Math.abs(rLat - lat), Math.abs(rLon - lon));
  }
  check('latLon -> vec3 -> latLon is lossless', worst < 1e-9, `max error ${worst.toExponential(2)}°`);
}

console.log('\ncountry detection');
for (const [lat, lon, expected] of [
  [48.85, 2.35, 'France'],
  [35.68, 139.69, 'Japan'],
  [41.31, 69.24, 'Uzbekistan'],
  [-23.55, -46.63, 'Brazil'],
  [39.9, 116.4, 'China'],
  [40.71, -74.0, 'United States'],
  [-1.29, 36.82, 'Kenya'],
] as const) {
  const found = locateCountry(atlas.features, lat, lon);
  check(`${expected} @ ${lat},${lon}`, found?.name === expected, found?.name ?? 'no match');
}

{
  // Point Nemo — the most remote spot in the ocean. Nothing should be labelled.
  const nemo = locateCountry(atlas.features, -48.87, -123.39);
  check('open ocean yields no label', nemo === null, nemo?.name ?? 'null');
  // Just offshore, the nearest coast should still win.
  const offshore = locateCountry(atlas.features, 43.0, 5.5);
  check('offshore falls back to nearest coast', offshore?.name === 'France', offshore?.name ?? 'null');
}

console.log('\nflags');
for (const [name, iso2] of [
  ['United States', 'US'],
  ['Uzbekistan', 'UZ'],
  ['Japan', 'JP'],
] as const) {
  const feature = atlas.features.find((f) => f.name === name);
  check(`${name} -> ${iso2}`, feature?.iso2 === iso2, feature?.iso2 ?? 'unmapped');
  check(`${iso2} -> emoji`, flagEmoji(iso2).length === 4, flagEmoji(iso2));
}
{
  const mapped = atlas.features.filter((f) => f.iso2).length;
  check('iso2 coverage', mapped / atlas.features.length > 0.95, `${mapped}/${atlas.features.length}`);
}

console.log('\nroutes');
{
  const COUNT = DEFAULTS.routeCount;
  const geometry = buildRouteGeometry(atlas.features, COUNT);
  const position = geometry.getAttribute('position');
  const t = geometry.getAttribute('aT');
  const speed = geometry.getAttribute('aSpeed');
  const side = geometry.getAttribute('aSide');
  const tangent = geometry.getAttribute('aTangent');
  const index = geometry.getIndex();
  const vertsPerRoute = ROUTES.segments * 2; // two ribbon rails per arc point

  check(
    `${COUNT} routes baked`,
    position.count === COUNT * vertsPerRoute,
    `${position.count / vertsPerRoute} routes, ${position.count} verts`,
  );
  check('single draw group', geometry.groups.length === 0);
  check(
    'ribbon is fully indexed',
    index?.count === COUNT * (ROUTES.segments - 1) * 6,
    `${index?.count ?? 0} indices`,
  );
  check(
    'every index is in range',
    !!index && (index.array as ArrayLike<number>).length > 0 &&
      Array.from(index.array as ArrayLike<number>).every(
        (i) => i >= 0 && i < position.count,
      ),
  );

  let minR = Infinity;
  let maxR = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getY(i), position.getZ(i));
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
  }
  check('arcs start on the surface', Math.abs(minR - GLOBE.radius) < 1e-5, `min r ${minR.toFixed(5)}`);
  check(
    'arcs respect maxAltitude',
    maxR <= GLOBE.radius * (1 + ROUTES.maxAltitude) + 1e-5,
    `max r ${maxR.toFixed(4)}`,
  );

  let tOk = true;
  for (let i = 0; i < t.count; i++) {
    if (t.getX(i) < 0 || t.getX(i) > 1) tOk = false;
  }
  check('aT normalised to [0,1]', tOk);

  let speedOk = true;
  for (let i = 0; i < speed.count; i++) if (speed.getX(i) <= 0) speedOk = false;
  check('every route moves forward', speedOk);

  // Rails must alternate -1/+1 or the shader expands both vertices the same
  // way and the ribbon collapses to zero width.
  let sideOk = true;
  for (let i = 0; i < side.count; i++) {
    if (side.getX(i) !== (i % 2 === 0 ? -1 : 1)) sideOk = false;
  }
  check('ribbon rails alternate', sideOk);

  let tangentOk = true;
  let pairedOk = true;
  for (let i = 0; i < tangent.count; i++) {
    const len = Math.hypot(tangent.getX(i), tangent.getY(i), tangent.getZ(i));
    if (Math.abs(len - 1) > 1e-4) tangentOk = false;
  }
  // Both rails of a point must share position + tangent; the shader is what
  // separates them.
  for (let i = 0; i < position.count; i += 2) {
    if (
      position.getX(i) !== position.getX(i + 1) ||
      tangent.getX(i) !== tangent.getX(i + 1)
    ) {
      pairedOk = false;
    }
  }
  check('tangents are unit length', tangentOk);
  check('paired rails share a spine', pairedOk);

  const rebuilt = buildRouteGeometry(atlas.features, COUNT);
  const a = position.array as Float32Array;
  const b = rebuilt.getAttribute('position').array as Float32Array;
  check('route network is deterministic', a.every((v, i) => v === b[i]));
}

console.log('\nlayout — hero state');
{
  const { hero } = resolveLayout(1920, 1080, DEFAULTS.offsetX, DEFAULTS.heightCoverage);
  const visibleWidth = hero.visibleHeight * (1920 / 1080);

  check(
    'globe fills 80% of viewport height',
    Math.abs((2 * GLOBE.radius) / hero.visibleHeight - 0.8) < 1e-9,
    `${(((2 * GLOBE.radius) / hero.visibleHeight) * 100).toFixed(1)}%`,
  );
  check(
    'centre sits 12% of viewport width right',
    Math.abs(hero.x / visibleWidth - 0.12) < 1e-9,
    `${((hero.x / visibleWidth) * 100).toFixed(1)}%`,
  );
  check(
    'whole disc stays on screen',
    hero.x + GLOBE.radius < visibleWidth / 2,
    `right edge ${(hero.x + GLOBE.radius).toFixed(3)} vs ${(visibleWidth / 2).toFixed(3)}`,
  );
}

console.log('\nlayout — scrolled end state');
for (const [w, h, label] of [
  [1920, 1080, '16:9'],
  [1280, 800, '16:10'],
  [3440, 1440, 'ultrawide'],
  [820, 1180, 'tablet portrait'],
  [390, 844, 'phone portrait'],
] as const) {
  const { end } = resolveLayout(w, h, DEFAULTS.offsetX, DEFAULTS.heightCoverage);

  // Everything below is measured on the z = 0 plane through the globe centre,
  // which is exactly where the top-of-globe point lives — so the flat maths is
  // not an approximation here.
  const bottomEdge = -end.visibleHeight / 2;
  const topOfGlobe = end.y + GLOBE.radius;
  const cap = topOfGlobe - bottomEdge;

  const ofScreen = cap / end.visibleHeight;
  const ofGlobe = cap / (2 * GLOBE.radius);

  check(
    `${label}: visible cap is 40% of viewport height`,
    Math.abs(ofScreen - SCROLL.end.heightCoverage) < 1e-9,
    `${(ofScreen * 100).toFixed(1)}%`,
  );
  check(
    `${label}: only 30% of the globe shows`,
    Math.abs(ofGlobe - SCROLL.end.visibleFraction) < 1e-9,
    `${(ofGlobe * 100).toFixed(1)}%`,
  );
  check(
    `${label}: centre is below the fold`,
    end.y + GLOBE.radius > bottomEdge && end.y < bottomEdge,
    `centre y ${end.y.toFixed(3)}, bottom edge ${bottomEdge.toFixed(3)}`,
  );
}

{
  const { hero, end } = resolveLayout(1920, 1080, DEFAULTS.offsetX, DEFAULTS.heightCoverage);
  check(
    'end state is larger than hero',
    end.coverage > hero.coverage && end.distance < hero.distance,
    `coverage ${hero.coverage.toFixed(2)} -> ${end.coverage.toFixed(2)}`,
  );
  check(
    'axis turns 90° to face the camera',
    Math.abs(end.tilt - Math.PI / 2) < 1e-9,
    `${((end.tilt * 180) / Math.PI).toFixed(1)}°`,
  );
  check('end state is horizontally centred', Math.abs(end.x) < 1e-9);
}

console.log('\nlanding globe — country reveals');
{
  const wanted = new Set(DETECTION.spotlight);
  const candidates = atlas.features.filter((f) => f.iso2 && wanted.has(f.iso2));

  check(
    'exactly the requested five',
    candidates.length === 5,
    candidates.map((c) => `${c.iso2} ${c.name}`).join(', '),
  );
  check(
    'every one has a flag glyph',
    candidates.every((c) => flagEmoji(c.iso2).length === 4),
    candidates.map((c) => flagEmoji(c.iso2)).join(' '),
  );

  // Each country must actually resolve to itself when its own territory is at
  // the centre — a filtered candidate list must not change the answer.
  for (const [lat, lon, iso] of [
    [52.1, 19.4, 'PL'],
    [48.4, 31.2, 'UA'],
    [40.3, 47.6, 'AZ'],
    [41.4, 64.6, 'UZ'],
    [61.0, 95.0, 'RU'],
  ] as const) {
    const found = locateCountry(
      candidates,
      lat,
      lon,
      DETECTION.spotlightFallbackDegrees,
    );
    check(`${iso} resolves at its own centroid`, found?.iso2 === iso, found?.name ?? 'null');
  }

  // And somewhere with none of them nearby must resolve to nothing, or the
  // label would sit on screen naming a country a continent away.
  for (const [lat, lon, place] of [
    [-15, -60, 'Brazil'],
    [35, 139, 'Japan'],
    [-30, 25, 'South Africa'],
  ] as const) {
    const found = locateCountry(
      candidates,
      lat,
      lon,
      DETECTION.spotlightFallbackDegrees,
    );
    check(`${place} yields no label`, found === null, found?.name ?? 'null');
  }

  // The reveal cadence has to survive the debounce. All five sit in one band of
  // longitude, so they sweep past in a burst.
  const lons = candidates.map((c) => c.centroid[0]).sort((a, b) => a - b);
  const degreesPerSecond = 360 * DEFAULTS.rotationSpeed;
  const gaps = lons.slice(1).map((lon, i) => (lon - lons[i]) / degreesPerSecond);
  check(
    'reveals outlast the debounce',
    Math.min(...gaps) * 1000 > DETECTION.debounceMs,
    `tightest ${(Math.min(...gaps) * 1000).toFixed(0)}ms vs ${DETECTION.debounceMs}ms debounce`,
  );
  check(
    'detection samples faster than it debounces',
    DETECTION.intervalMs < DETECTION.debounceMs,
    `${DETECTION.intervalMs}ms interval, ${DETECTION.debounceMs}ms debounce`,
  );
  // Strict: the enter animation must finish before the next country arrives,
  // or the tightest reveal never reaches full opacity.
  check(
    'card animation finishes within the tightest reveal',
    UI.transitionMs < Math.min(...gaps) * 1000,
    `${UI.transitionMs}ms card vs ${(Math.min(...gaps) * 1000).toFixed(0)}ms gap`,
  );
}

console.log('\nintro — brand sequence');
{
  const t = INTRO_TIMING;

  /*
   * The sequence is one gesture now, not three: the letters arrive staggered, a
   * rule draws itself underneath, and the whole lockup eases down from a hair
   * oversize. There is no mark and no loading bar, so what is checked changed
   * with them — what has not is that every stage lands before the fade, and that
   * the fade lands exactly on `duration`, which is when the timer in
   * `PaylezIntro` fires `onComplete`. A stage that overran it would leave the
   * site visible underneath a half-finished animation.
   */
  const lastLetter =
    t.letterIn.delay + (t.letters - 1) * t.letterIn.stagger + t.letterIn.duration;

  const stages: Array<[string, { delay: number; duration: number }]> = [
    ['ruleIn', t.ruleIn],
    ['settle', t.settle],
    ['outro', t.outro],
  ];

  check(
    'every stage fits inside the run time',
    stages.every(([, stage]) => stage.delay + stage.duration <= t.duration),
    `duration ${t.duration}ms`,
  );
  check(
    'the last letter lands before the fade',
    lastLetter <= t.outro.delay,
    `last letter ${lastLetter}ms, fade starts ${t.outro.delay}ms`,
  );
  // The rule has to start while letters are still arriving, or it reads as a
  // second event rather than as part of the word being written.
  check(
    'the rule starts before the word finishes',
    t.ruleIn.delay < lastLetter,
    `rule ${t.ruleIn.delay}ms, word ends ${lastLetter}ms`,
  );
  check(
    'the rule finishes drawing before the fade',
    t.ruleIn.delay + t.ruleIn.duration <= t.outro.delay,
    `rule ends ${t.ruleIn.delay + t.ruleIn.duration}ms, fade starts ${t.outro.delay}ms`,
  );
  check(
    'the fade completes exactly at the end',
    t.outro.delay + t.outro.duration === t.duration,
    `${t.outro.delay + t.outro.duration}ms vs ${t.duration}ms`,
  );
  check('intro stays under three seconds', t.duration <= 3000, `${t.duration}ms`);
}

console.log('\nrotation');
{
  // Replays the exact accumulator from useRotation at a punishing frame rate.
  const revsPerSecond = 1 / 5;
  let phase = 0;
  const step = 1 / 240;
  const seconds = 60 * 60; // one hour
  for (let i = 0; i < seconds / step; i++) {
    phase += Math.min(step, MOTION.maxDelta) * revsPerSecond;
    phase -= Math.floor(phase);
  }
  check('phase stays wrapped after 1h', phase >= 0 && phase < 1, `phase ${phase.toFixed(6)}`);
  check('angle stays in one turn', phase * TAU < TAU);

  // 5 s at exactly one revolution must land back on the start angle.
  let exact = 0;
  for (let i = 0; i < 5 / step; i++) {
    exact += step * revsPerSecond;
    exact -= Math.floor(exact);
  }
  check('one revolution per 5 s closes the loop', Math.abs(exact) < 1e-9 || Math.abs(exact - 1) < 1e-9, `phase ${exact.toExponential(2)}`);
}


/* ═════════════════════════════════════════════════════════════════ auth ══ */

console.log('\naccess control');
{
  /*
   * The whole account × route matrix. This is the one place on the site where
   * getting it wrong shows somebody a page that is not theirs, and it is pure,
   * so there is no excuse for checking it by clicking around.
   */
  const anon = null;
  const undecided: Account = {
    id: 'u', name: 'A', email: 'a@b.c', type: null, business: null, player: null,
  };
  const person: Account = { ...undecided, type: 'individual' };
  const ownerNew: Account = { ...undecided, type: 'business' };
  const ownerSet: Account = { ...ownerNew, business: blankBusiness() };
  const admin: Account = { ...undecided, type: 'admin' };

  const consumer: Route[] = ['landing', 'learn', 'vouchers', 'relocate'];

  for (const route of consumer) {
    check(`anon keeps ${route}`, resolveRoute(route, anon) === route);
    check(`individual keeps ${route}`, resolveRoute(route, person) === route);
  }

  check('anon keeps b2b', resolveRoute('b2b', anon) === 'b2b');
  check('anon keeps analytics', resolveRoute('analytics', anon) === 'analytics');
  check('anon is sent from the dashboard to sign-in', resolveRoute('dashboard', anon) === 'signin');
  check('anon is sent from setup to sign-in', resolveRoute('business-setup', anon) === 'signin');
  check('anon is sent from the console to sign-in', resolveRoute('admin', anon) === 'signin');
  check('anon may reach sign-in', resolveRoute('signin', anon) === 'signin');

  check('an undecided account is held at sign-in', resolveRoute('landing', undecided) === 'signin');
  check('…from every route', consumer.every((r) => resolveRoute(r, undecided) === 'signin'));

  check('individual loses b2b', resolveRoute('b2b', person) === 'landing');
  check('individual loses analytics', resolveRoute('analytics', person) === 'landing');
  check('individual loses the dashboard', resolveRoute('dashboard', person) === 'landing');
  /* The hole this closed: an individual who typed the setup address in reached
     the listing form and could save a venue onto an account with nowhere to
     show it. */
  check('individual loses business setup', resolveRoute('business-setup', person) === 'landing');
  check('individual loses the console', resolveRoute('admin', person) === 'landing');
  check('owner loses the console', resolveRoute('admin', ownerSet) === 'landing');

  /* The console *replaces* the partner routes for an admin rather than sitting
     beside them: no venue to set up, no dashboard of their own. */
  check('admin reaches the console', resolveRoute('admin', admin) === 'admin');
  check('admin lands on the console from sign-in', resolveRoute('signin', admin) === 'admin');
  check('admin is sent from the dashboard to the console', resolveRoute('dashboard', admin) === 'admin');
  check('admin is sent from setup to the console', resolveRoute('business-setup', admin) === 'admin');
  check(
    'admin reads the marketing site as written',
    ['landing', 'learn', 'b2b', 'analytics', 'vouchers', 'relocate'].every(
      (r) => resolveRoute(r as Route, admin) === r,
    ),
  );

  check('an owner with no listing is sent to setup', resolveRoute('dashboard', ownerNew) === 'business-setup');
  check('an owner with a listing reaches the dashboard', resolveRoute('dashboard', ownerSet) === 'dashboard');
  check('an owner keeps b2b', resolveRoute('b2b', ownerSet) === 'b2b');

  /*
   * Where sign-in lands is the whole of the post-sign-in routing, so it is
   * checked per account rather than as one case. This is also the pair that
   * used to be done by calling `navigate` from the form, which raced the guard.
   */
  check('an individual lands on the landing page', resolveRoute('signin', person) === 'landing');
  check('a new owner lands on setup', resolveRoute('signin', ownerNew) === 'business-setup');
  check('a set-up owner lands on the landing page', resolveRoute('signin', ownerSet) === 'landing');

  /* Every redirect must land somewhere that does not itself redirect, or the
     effect in `Site` navigates in a loop. */
  const all: Route[] = [
    'landing', 'learn', 'analytics', 'b2b', 'vouchers', 'relocate', 'contact',
    'signin', 'business-setup', 'dashboard', 'admin',
  ];
  const accounts = [anon, undecided, person, ownerNew, ownerSet, admin];
  let unstable = '';
  for (const account of accounts) {
    for (const route of all) {
      const once = resolveRoute(route, account);
      const twice = resolveRoute(once, account);
      if (once !== twice) unstable = `${route} → ${once} → ${twice}`;
    }
  }
  check('every resolution is a fixed point', unstable === '', unstable || 'no loops');

  /* Contact is for everybody — it is where every "Support" link now lands, and
     an account type that could not reach it would be an account type with no
     way to ask for help. */
  for (const [label, account] of [
    ['anon', anon],
    ['an individual', person],
    ['an owner', ownerSet],
    ['an admin', admin],
  ] as const) {
    check(`${label} reaches contact`, resolveRoute('contact', account) === 'contact');
  }
}

console.log('\nrouting — section anchors');
{
  /*
   * The bug this table exists to fix: every hash that is not in `ROUTES` used to
   * resolve to the landing page, so *every in-page link on every other page*
   * went Home. "Open the dashboard" on Analytics pointed at `#analytics-reports`
   * and landed on the marketing front page.
   */
  check('the landing page keeps the unprefixed anchors', routeOf('#value') === 'landing');
  check('…including #top', routeOf('#top') === 'landing');
  check('…and an anchor nobody declared', routeOf('#nonsense') === 'landing');

  for (const [hash, expected] of [
    ['#learn-games', 'learn'],
    ['#games-top', 'learn'],
    ['#analytics-reports', 'analytics'],
    ['#b2b-cta', 'b2b'],
    ['#vouchers-catalogue', 'vouchers'],
    ['#relocate-guide', 'relocate'],
    ['#contact-form', 'contact'],
  ] as const) {
    check(`${hash} stays on ${expected}`, routeOf(hash) === expected);
  }

  /* A real route still wins over anything the prefix table would say. */
  for (const [route, path] of Object.entries(PATHS) as Array<[Route, string]>) {
    check(`${path} is ${route}`, routeOf(path) === route);
  }

  /*
   * Every prefix has to name a route that exists, and no prefix may shadow the
   * landing page's own anchors — `#value`, `#guide`, `#features` and friends
   * carry no prefix, so a table entry with an empty or one-character prefix
   * would swallow them.
   */
  for (const [prefix, route] of ANCHOR_ROUTES) {
    check(`the ${prefix} prefix names a real route`, PATHS[route] !== undefined);
    check(`…and is specific enough`, prefix.length >= 3 && prefix.endsWith('-'));
  }
}

console.log('\nquestions — the no-repeat bag');
{
  /*
   * The property the whole thing exists for: **every index is drawn once before
   * any of them is drawn twice.** Walked over a pool the size of the smallest
   * shipped bank, five at a time, which is how a round actually draws.
   */
  const size = 100;
  const perRound = 5;
  let bag: number[] = [];
  const seen = new Map<number, number>();
  let shortRound = 0;
  let repeatedInRound = 0;

  for (let round = 0; round < size / perRound; round++) {
    const { picked, rest } = draw(bag, size, perRound);
    bag = rest;
    if (picked.length !== perRound) shortRound++;
    if (new Set(picked).size !== picked.length) repeatedInRound++;
    for (const index of picked) seen.set(index, (seen.get(index) ?? 0) + 1);
  }

  check('every round draws a full set', shortRound === 0, `${shortRound} short`);
  check('no round repeats a question', repeatedInRound === 0, `${repeatedInRound} bad`);
  check(
    'nothing repeats before the pool is exhausted',
    seen.size === size && [...seen.values()].every((n) => n === 1),
    `${seen.size} distinct of ${size}`,
  );

  /* Past the end of the pool it refills — and the refill must not hand back
     something this same draw already took. */
  const nearlyEmpty = draw([3], 10, 5);
  check('a refill mid-draw still returns a full set', nearlyEmpty.picked.length === 5);
  check(
    '…with no duplicate across the seam',
    new Set(nearlyEmpty.picked).size === 5,
    nearlyEmpty.picked.join(','),
  );

  /* A stored bag from a larger export. Reading past the end of the rows is the
     failure this drops instead of crashing on. */
  const stale = draw([99, 100, 2], 5, 2);
  check('indices past the pool are dropped',
    stale.picked.every((n) => n >= 0 && n < 5),
    stale.picked.join(','));

  check('a request larger than the pool is clamped', draw([], 3, 10).picked.length === 3);
  check('an empty pool draws nothing', draw([], 0, 5).picked.length === 0);

  /* The range itself, which everything above is a permutation of. */
  const range = shuffledRange(50);
  check('a shuffle keeps every index exactly once',
    new Set(range).size === 50 && Math.max(...range) === 49 && Math.min(...range) === 0);
}

console.log('\nquestions — the flag glyphs');
{
  /* The export points at flagcdn.com and this site makes no third-party runtime
     requests, so the ISO code is turned into a regional-indicator pair the
     self-hosted font already draws. */
  check('pl becomes its flag', flagOf('pl') === '🇵🇱', flagOf('pl'));
  check('uz becomes its flag', flagOf('uz') === '🇺🇿', flagOf('uz'));
  check('case does not matter', flagOf('GB') === flagOf('gb'));
  check('a code that is not two letters yields nothing', flagOf('') === '' && flagOf('pol') === '');
}

console.log('\nbusiness listing');
{
  const blank = blankBusiness();
  const empty = profileCompleteness(blank);
  check('a blank listing is 0%', empty.percent === 0, `${empty.done}/${empty.total}`);
  check('…and names every field it wants', empty.missing.length === REQUIRED_FIELDS.length);
  check('a blank listing is not publishable', !isBusinessReady(blank));

  const full = {
    ...blank,
    name: 'Café Bratysławska',
    description: 'A small neighbourhood café near Nowy Kleparz.',
    price: '18–45 zł',
    logo: 'logo.png',
    city: 'Kraków',
    street: 'Bratysławska 6',
    maps: 'https://maps.google.com/?q=1',
    phone: '+48 512 340 118',
    email: 'hello@bratyslawska.pl',
  };
  const done = profileCompleteness(full);
  check('a finished listing is 100%', done.percent === 100, `${done.done}/${done.total}`);
  check('…and is publishable', isBusinessReady(full));

  /* The one rule that is not "is it blank": a malformed address is missing, not
     filled, or a listing goes live with an unreachable contact on it. */
  const badEmail = profileCompleteness({ ...full, email: 'hello@' });
  check('a malformed email counts as missing', badEmail.missing.includes('email'));
  check('…and only that one', badEmail.missing.length === 1);

  const partial = profileCompleteness({ ...blank, name: 'X', city: 'Y' });
  check('partial rounds rather than truncates', partial.percent === Math.round((2 / 9) * 100), `${partial.percent}%`);
  check(
    'missing is in form order',
    partial.missing.join(',') ===
      REQUIRED_FIELDS.filter((f) => f !== 'name' && f !== 'city').join(','),
  );
}

console.log('\nplaying');
{
  const day = (iso: string) => new Date(`${iso}T12:00:00`);
  const base = {
    ...seedPlayer(),
    points: 0,
    streak: 0,
    answered: 0,
    correct: 0,
    lastPlayed: null,
    /* No freeze. A seeded player now starts with one, and it would absorb
       every lapse below — which is the freeze block's business, not this one's. */
    freezes: 0,
  };
  const win = { correct: 5, total: 5, perCorrect: 2, won: true };

  const first = awardRound(base, win, day('2026-08-03'));
  check('a round scores per correct answer', first.points === 10, `${first.points} pts`);
  check('a first round starts the streak', first.streak === 1);
  check('answered and correct both move', first.answered === 5 && first.correct === 5);
  check('a win costs no life', first.lives === MAX_LIVES);

  const nextDay = awardRound(first, win, day('2026-08-04'));
  check('the next day continues the streak', nextDay.streak === 2);
  check('…and the balance carries', nextDay.points === 20, `${nextDay.points} pts`);

  const twice = awardRound(first, win, day('2026-08-03'));
  check('a second round the same day does not advance the streak', twice.streak === 1);
  check('…but still scores', twice.points === 20);

  /* The rule the FAQ and the vouchers page both now state. If this stops being
     true, three pieces of copy become lies. */
  const lapsed = awardRound(first, win, day('2026-08-06'));
  check('missing the window resets the streak', lapsed.streak === 1);
  check('…and clears the balance before scoring', lapsed.points === 10, `${lapsed.points} pts`);

  const lost = awardRound(base, { ...win, correct: 2, won: false }, day('2026-08-03'));
  check('a loss costs a life', lost.lives === MAX_LIVES - 1);
  check('…and still banks what was right', lost.points === 4);

  const empty = { ...base, lives: 0, lastPlayed: '2026-08-03' };
  check('lives do not refill on the same day', refillLives(empty, day('2026-08-03')).lives === 0);
  check('lives refill on a new day', refillLives(empty, day('2026-08-04')).lives === MAX_LIVES);
}

console.log('\nplaying — streak freezes');
{
  const day = (iso: string) => new Date(`${iso}T12:00:00`);
  const win = { correct: 5, total: 5, perCorrect: 2, won: true };
  const held = (n: number) => ({
    ...seedPlayer(),
    points: 100,
    streak: 4,
    answered: 0,
    correct: 0,
    lastPlayed: '2026-08-03',
    freezes: n,
  });

  /* The rule the streak card states, and the one the FAQ's "goes back to zero"
     is now an exception to. Both halves are checked, because a freeze that
     saved the streak but not the balance would be the confusing half-measure —
     the two have always been one rule. */
  const saved = awardRound(held(1), win, day('2026-08-09'));
  check('a freeze absorbs a missed window', saved.streak === 5, `streak ${saved.streak}`);
  check('…and the balance survives with it', saved.points === 110, `${saved.points} pts`);
  check('…and the freeze is spent', freezesOf(saved) === 0, `${freezesOf(saved)} held`);

  const unsaved = awardRound(held(0), win, day('2026-08-09'));
  check('without one, the streak still resets', unsaved.streak === 1);
  check('…and the balance still clears', unsaved.points === 10, `${unsaved.points} pts`);

  /* Spent only when there is something to spend it on. */
  const onTime = awardRound(held(1), win, day('2026-08-04'));
  check('an unbroken streak spends nothing', freezesOf(onTime) === 1);

  /* Earned every seventh day, and capped. Day seven is the round that produces
     streak 7, so the seventh day pays for itself. */
  const sixth = { ...held(0), streak: 6, lastPlayed: '2026-08-03' };
  const seventh = awardRound(sixth, win, day('2026-08-04'));
  check('day seven earns a freeze', seventh.streak === 7 && freezesOf(seventh) === 1);

  const again = awardRound({ ...seventh, lastPlayed: '2026-08-04' }, win, day('2026-08-04'));
  check('…and a second round that day does not mint another', freezesOf(again) === 1);

  const rich = awardRound({ ...sixth, freezes: MAX_FREEZES }, win, day('2026-08-04'));
  check('holdings are capped', freezesOf(rich) === MAX_FREEZES);

  /* A session stored before the field existed. */
  const old = { ...held(0) } as Record<string, unknown>;
  delete old.freezes;
  check('a state with no freezes field reads as zero',
    freezesOf(old as ReturnType<typeof seedPlayer>) === 0);
}

console.log('\nplaying — the two scored games');
{
  /* Straight off the supplied spec's worked examples. */
  check('an easy word, first try and fast',
    wordPoints({ tier: 1, firstTry: true, hinted: false, seconds: 8 }) === 11,
    `${wordPoints({ tier: 1, firstTry: true, hinted: false, seconds: 8 })} pts`);
  check('a hard word, first try and fast',
    wordPoints({ tier: 3, firstTry: true, hinted: false, seconds: 8 }) === 15);
  check('a medium word, missed once and slow',
    wordPoints({ tier: 2, firstTry: false, hinted: false, seconds: 40 }) === 7);
  check('a hint caps it at base plus tier',
    wordPoints({ tier: 3, firstTry: true, hinted: true, seconds: 1 }) === 9);
  check('the middle speed band pays one',
    wordPoints({ tier: 1, firstTry: false, hinted: false, seconds: 20 }) === 6);
  check('no word is ever worth nothing',
    wordPoints({ tier: 1, firstTry: false, hinted: true, seconds: 999 }) === 5);

  check('a flawless board pays base, efficiency and the bonus',
    memoryPoints(6, 6) === 58, `${memoryPoints(6, 6)} pts`);
  check('ten moves is base plus a partial bonus',
    memoryPoints(6, 10) === 43, `${memoryPoints(6, 10)} pts`);
  check('a scrappy board still pays its base',
    memoryPoints(6, 18) === 36, `${memoryPoints(6, 18)} pts`);
  check('the bonus never goes negative', memoryPoints(6, 400) === 36);
  check('the two games land in the same band',
    memoryPoints(6, 12) >= 35 && memoryPoints(6, 12) <= 70);
}

console.log('\nflying — scoring');
{
  const day = (iso: string) => new Date(`${iso}T12:00:00`);
  const base = {
    ...seedPlayer(),
    points: 0,
    streak: 0,
    answered: 0,
    correct: 0,
    lastPlayed: null,
    freezes: 0,
  };
  const full = { cleared: 12, target: 12, perGap: 2, won: true };

  const cleared = awardFlight(base, full, day('2026-08-03'));
  check('a cleared flight pays per gap', cleared.points === 24, `${cleared.points} pts`);
  check('a win costs no life', cleared.lives === MAX_LIVES);

  const crash = awardFlight(base, { ...full, cleared: 3, won: false }, day('2026-08-03'));
  check('a crash costs exactly one life', crash.lives === MAX_LIVES - 1);
  check('…and still banks the gaps flown', crash.points === 6, `${crash.points} pts`);
  check('the whole round is charged to answered', crash.answered === 12, `${crash.answered}`);
  check('…and only the gaps flown count as correct', crash.correct === 3, `${crash.correct}`);

  /*
   * The load-bearing one. `awardFlight` delegates to `awardRound`, and this is
   * what asserts it never stops doing so — the streak window and the lapse are
   * stated in the FAQ and on the vouchers page, and a second implementation of
   * them is how one of the three quietly becomes a lie.
   */
  const quizArgs = { correct: 12, total: 12, perCorrect: 2, won: true };
  for (const [label, on] of [
    ['a fresh account', '2026-08-03'],
    ['the next day', '2026-08-04'],
    ['after a missed window', '2026-08-09'],
  ] as const) {
    const seeded = { ...base, streak: 4, points: 60, lastPlayed: '2026-08-03' };
    const byFlight = awardFlight(seeded, full, day(on));
    const byQuiz = awardRound(seeded, quizArgs, day(on));
    check(
      `flight and quiz agree on streak and balance — ${label}`,
      byFlight.streak === byQuiz.streak && byFlight.points === byQuiz.points,
      `${byFlight.streak}/${byFlight.points} vs ${byQuiz.streak}/${byQuiz.points}`,
    );
  }

  /*
   * The run is endless, so gaps past the target still pay. `correct` saturates
   * — 20/12 is not a sensible accuracy — while the balance keeps counting.
   */
  const long = awardFlight(base, { ...full, cleared: 20 }, day('2026-08-03'));
  check('gaps past the target still pay', long.points === 40, `${long.points} pts`);
  check('…while correct saturates at the target', long.correct === 12, `${long.correct}`);
  check('…and answered still counts one round', long.answered === 12, `${long.answered}`);
  check('…and the round is banked, so it costs no life', long.lives === MAX_LIVES);

  check('the payout helper and the balance agree',
    flightPoints(20, 2) === 40 && bankableGaps(20) === 20);

  /* What `awardFlight` owns on top: a score that arrived from a rAF loop. */
  const absurd = awardFlight(base, { ...full, cleared: 10_000 }, day('2026-08-03'));
  check('an impossible score is capped', absurd.points === MAX_FLIGHT_GAPS * 2,
    `${absurd.points} pts`);

  const fake = awardFlight(base, { ...full, cleared: 4, won: true }, day('2026-08-03'));
  check('a win that did not reach the target is a loss', fake.lives === MAX_LIVES - 1);

  const fractional = awardFlight(base, { ...full, cleared: 3.9, won: false }, day('2026-08-03'));
  check('a fractional score floors', fractional.points === 6, `${fractional.points} pts`);

  const negative = awardFlight(base, { ...full, cleared: -2, won: false }, day('2026-08-03'));
  check('a negative score clamps to nothing', negative.points === 0 && negative.correct === 0);

  /* The shortcut this deliberately avoids: a lapsed streak zeroes the balance
     before scoring, so the change in balance is not what the round paid. */
  const lapsedFlight = awardFlight(
    { ...base, points: 900, streak: 5, lastPlayed: '2026-07-20', freezes: 0 },
    { ...full, cleared: 5, won: false },
    day('2026-08-03'),
  );
  check('a lapsed flight still reports what it earned',
    lapsedFlight.points === 10 && flightPoints(5, 2) === 10,
    `balance ${lapsedFlight.points}, earned ${flightPoints(5, 2)}`);
}

console.log('\nflying — physics');
{
  /*
   * The check that could not be made by playing. With the cheap semi-implicit
   * integration the apex of a flap depends on the frame rate — a 144Hz monitor
   * gets a measurably easier game than a throttled phone — and no amount of
   * testing on one machine would show it.
   */
  const apexAt = (hz: number) => {
    const dt = Math.min(1 / hz, 0.05);
    let bird = flap({ y: 50, vy: 0 });
    let peak = bird.y;
    for (let t = 0; t < 4; t += dt) {
      bird = stepBird(bird, dt);
      peak = Math.min(peak, bird.y);
    }
    return 50 - peak;
  };

  const fast = apexAt(240);
  const slow = apexAt(20);
  check('the arc does not depend on frame rate', Math.abs(fast - slow) < 0.5,
    `${fast.toFixed(2)} at 240Hz vs ${slow.toFixed(2)} at 20Hz`);

  const closedForm = (FLIGHT.flap * FLIGHT.flap) / (2 * FLIGHT.gravity);
  check('…and matches the closed form', Math.abs(fast - closedForm) < 0.1,
    `${fast.toFixed(3)} vs ${closedForm.toFixed(3)}`);

  let falling = { y: 5, vy: 0 };
  let fastest = 0;
  for (let t = 0; t < 10; t += 0.05) {
    falling = stepBird(falling, 0.05);
    fastest = Math.max(fastest, falling.vy);
  }
  check('terminal velocity is honoured', fastest <= FLIGHT.maxFall, `${fastest.toFixed(1)}`);

  /* One long frame after a tab switch must not skip a column's payout. */
  let pipe = spawnPipe(FLIGHT.worldHeight, 0.5);
  let payouts = 0;
  for (let t = 0; t < 6; t += 0.05) {
    pipe = { ...pipe, x: pipe.x - FLIGHT.pipe.speed * 0.05 };
    if (!pipe.scored && crossed(pipe, FLIGHT.bird.x)) {
      pipe.scored = true;
      payouts += 1;
    }
  }
  check('a column pays out exactly once at the worst step', payouts === 1, `${payouts}`);
}

console.log('\nflying — is it playable');
{
  /*
   * The check the first build of this game most needed and did not have.
   *
   * Every other test here says the parts are individually correct; none of them
   * said the thing could be *played*. It shipped with a gap 60% wider than the
   * original's and pipes 65% faster, and all the unit checks passed, because
   * "playable" is not a property of any one constant — it is whether a
   * competent run survives, and that only shows up when the whole loop runs.
   *
   * So: run the real loop against a deliberately simple pilot. It sees only
   * what a player sees — its own height and the centre of the next gap — flaps
   * when it is sinking below that line, and cannot flap faster than a thumb.
   * If a rule that crude cannot clear the target, the tuning is wrong.
   */
  const play = (seed: number, frames: number) => {
    let rand = seed;
    const next = () => {
      // A small LCG: the pilot must beat a repeatable course, not a lucky one.
      rand = (rand * 1103515245 + 12345) % 2147483648;
      return rand / 2147483648;
    };

    let lastGap = FLIGHT.worldHeight / 2;
    const spawn = (x: number) => {
      const pipe = spawnPipe(x, next(), lastGap);
      lastGap = pipe.gapY;
      return pipe;
    };

    let bird = { y: FLIGHT.worldHeight / 2, vy: 0 };
    let pipes = [spawn(FLIGHT.worldWidth)];
    let cleared = 0;
    let spawnClock = 0;
    let lastFlap = -99;
    const dt = 1 / 60;

    for (let i = 0; i < frames; i++) {
      /*
       * ── the pilot ──
       *
       * It aims *half an arc below* the gap's centre, and that offset is the
       * whole character of the game rather than a fudge in this test. One flap
       * rises 9.9 units against a gap half-height of 9.5, so a pilot that flaps
       * on reaching the centre arrives at the ceiling of the hole and clips the
       * top column — which is exactly what the first version of this check did,
       * and why it reported the game unplayable when the game was right.
       *
       * Flapping late, near the floor of the gap, is the discipline the original
       * teaches in its first thirty seconds. If the apex/gap ratio ever drifts
       * away from the band asserted below, this pilot stops working, which is
       * the point of flying it here.
       */
      const ahead = pipes
        .filter((p) => p.x + FLIGHT.pipe.width > FLIGHT.bird.x - 2)
        .sort((a, b) => a.x - b.x)[0];
      const aim = ahead ? ahead.gapY : FLIGHT.worldHeight / 2;
      const arc = (FLIGHT.flap * FLIGHT.flap) / (2 * FLIGHT.gravity);
      if (bird.vy > 0 && bird.y > aim + arc / 2 && i - lastFlap >= 6) {
        bird = flap(bird);
        lastFlap = i;
      }

      // ── the world, exactly as `FlightGame` steps it ──
      bird = stepBird(bird, dt);
      spawnClock += dt;
      if (spawnClock >= FLIGHT.pipe.interval) {
        spawnClock -= FLIGHT.pipe.interval;
        pipes.push(spawn(FLIGHT.worldWidth));
      }
      for (const p of pipes) p.x -= FLIGHT.pipe.speed * dt;
      for (const p of pipes) {
        if (p.scored || !crossed(p, FLIGHT.bird.x)) continue;
        p.scored = true;
        cleared += 1;
      }
      pipes = pipes.filter((p) => p.x + FLIGHT.pipe.width > -1);
      if (hitsBounds(bird) || pipes.some((p) => hits(FLIGHT.bird.x, bird, p))) {
        return { cleared, survived: false, frames: i };
      }
    }
    return { cleared, survived: true, frames };
  };

  // Two minutes of flying on eight different courses.
  const runs = [1, 7, 42, 1337, 90210, 555, 8675309, 31337].map((seed) => play(seed, 60 * 120));
  const scores = runs.map((r) => r.cleared).sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];
  const target = FLIGHT.target;
  const reached = scores.filter((n) => n >= target).length;

  /*
   * Both halves matter, and the first build had neither.
   *
   * Too easy and there is no game; too hard and the bank line is a life
   * shredder, because crashing is the whole mechanic and three crashes closes
   * L-Earn for the day. The original is famously brutal, so the bar is not
   * "always survives" — it is that a plain rule-following pilot banks a round
   * most of the time and still, eventually, dies.
   */
  check(`a simple pilot banks the ${target}-gap round on most courses`,
    reached >= Math.ceil(runs.length * 0.6), `${reached} of ${runs.length}: ${scores.join(', ')}`);
  check('…and its median run is past the bank line', median >= target,
    `median ${median}`);
  check('…but it does not fly forever, so the game can still kill',
    runs.some((r) => !r.survived), `${runs.filter((r) => !r.survived).length} crashed`);
  check('…and the courses differ, so that is not one lucky seed',
    new Set(scores).size > 2, scores.join(', '));

  /* The other half of playable: it must be possible to lose. A pilot that never
     flaps has to hit the floor, or gravity is not doing anything. */
  let idle = { y: FLIGHT.worldHeight / 2, vy: 0 };
  let idleFrames = 0;
  while (!hitsBounds(idle) && idleFrames < 600) {
    idle = stepBird(idle, 1 / 60);
    idleFrames++;
  }
  const fall = idleFrames / 60;
  check('a bird that is never flapped hits the floor', hitsBounds(idle), `${fall.toFixed(2)}s`);
  /* Long enough to react to, short enough to punish inattention — the original
     gives about a second from mid-screen. */
  check('…in about a second, as the original does', fall > 0.6 && fall < 1.4,
    `${fall.toFixed(2)}s`);
}

console.log('\nflying — geometry');
{
  const half = FLIGHT.pipe.gap / 2;
  const low = FLIGHT.pipe.margin + half;
  const high = FLIGHT.worldHeight - FLIGHT.pipe.margin - half;

  let outside = 0;
  for (let i = 0; i <= 10000; i++) {
    const centre = gapCentre(i / 10000);
    if (centre < low - 1e-9 || centre > high + 1e-9) outside++;
  }
  check('every generated gap clears both rails', outside === 0, `${outside} of 10001 outside`);

  /* The solvability rule: a gap must be reachable from the one before it. Swept
     across the whole band, from every starting height, at both extremes of the
     draw — this is the invariant that stopped courses being undealable. */
  let unreachable = 0;
  let stillClears = true;
  for (let p = 0; p <= 100; p++) {
    const previous = low + ((high - low) * p) / 100;
    for (let i = 0; i <= 100; i++) {
      const centre = gapCentre(i / 100, previous);
      if (Math.abs(centre - previous) > FLIGHT.pipe.maxStep + 1e-9) unreachable++;
      if (centre < low - 1e-9 || centre > high + 1e-9) stillClears = false;
    }
  }
  check('…and sits within one interval of climb from the last one', unreachable === 0,
    `${unreachable} of 10201 out of reach`);
  check('…without the reach limit pushing it into a rail', stillClears);

  /* What `maxStep` is measured against: sustained climb over one interval. */
  const climbPerFlap = (FLIGHT.flap * FLIGHT.flap) / (2 * FLIGHT.gravity);
  const flapPeriod = -FLIGHT.flap / FLIGHT.gravity;
  const reachable = (climbPerFlap / flapPeriod) * FLIGHT.pipe.interval;
  check('the reach limit leaves climb in hand', FLIGHT.pipe.maxStep < reachable * 0.8,
    `step ${FLIGHT.pipe.maxStep} vs ${reachable.toFixed(1)} available`);

  const pipe = spawnPipe(FLIGHT.bird.x - FLIGHT.pipe.width / 2, 0.5);
  check('a bird centred in a gap flies clean through',
    !hits(FLIGHT.bird.x, { y: pipe.gapY, vy: 0 }, pipe));
  check('…and one at the gap edge does not',
    hits(FLIGHT.bird.x, { y: pipe.gapY + half + FLIGHT.bird.radius - 0.5, vy: 0 }, pipe));
  check('a column already behind the bird is clear',
    !hits(FLIGHT.bird.x, { y: pipe.gapY + half + FLIGHT.bird.radius - 0.5, vy: 0 },
      { ...pipe, x: FLIGHT.bird.x + FLIGHT.bird.radius + 1 }));

  check('the ceiling ends a run', hitsBounds({ y: FLIGHT.bird.radius - 0.1, vy: 0 }));
  check('the floor ends a run',
    hitsBounds({ y: FLIGHT.worldHeight - FLIGHT.bird.radius + 0.1, vy: 0 }));
  check('mid-stage does not', !hitsBounds({ y: FLIGHT.worldHeight / 2, vy: 0 }));
}

console.log('\nflying — tuning');
{
  const apex = (FLIGHT.flap * FLIGHT.flap) / (2 * FLIGHT.gravity);

  check('the gap is wider than the bird', FLIGHT.pipe.gap > FLIGHT.bird.size * 2,
    `${FLIGHT.pipe.gap} vs ${FLIGHT.bird.size * 2}`);

  /*
   * The ratio that IS the game, and the check this file previously got exactly
   * backwards.
   *
   * It used to assert `apex < 0.6 * gap` as a fairness rule, on the reasoning
   * that a flap which crosses the whole gap leaves no room to correct. That is
   * true and it is also the point: in the original, one flap covers a little
   * over half the hole (390²/(2*1080) = 70px against a 130px gap = 0.54), which
   * is why the game is a constant correction rather than a glide. Tuned to a
   * third the whole thing goes floaty, which is what shipped first. A band, not
   * a ceiling — and the floor is the load-bearing half.
   */
  const ratio = apex / FLIGHT.pipe.gap;
  check('one flap covers about half the gap, as the original does',
    ratio > 0.45 && ratio < 0.65, `${ratio.toFixed(2)} (original ≈ 0.54)`);

  check('columns never touch',
    FLIGHT.pipe.interval * FLIGHT.pipe.speed > FLIGHT.pipe.width * 2);
  check('the gap fits between the rails',
    FLIGHT.pipe.margin * 2 + FLIGHT.pipe.gap < FLIGHT.worldHeight);

  /* Two columns on screen at once, which is what makes the next gap plannable
     while the current one is still being flown. */
  const onScreen = (FLIGHT.worldWidth - FLIGHT.bird.x) / (FLIGHT.pipe.interval * FLIGHT.pipe.speed);
  check('at least one full column is visible ahead of the bird', onScreen >= 1,
    `${onScreen.toFixed(2)} columns of track ahead`);

  /* The stage is portrait because the original's constants were tuned in a
     portrait screen; a landscape playfield silently triples the track. */
  check('the playfield is portrait',
    FLIGHT.worldWidth < FLIGHT.worldHeight,
    `${FLIGHT.worldWidth} x ${FLIGHT.worldHeight}`);

  const flight = GAMES.find((g) => g.kind === 'flight');
  const richest = Math.max(...GAMES.map((g) => g.questions * g.perCorrect));
  check('the arcade round exists in the table', flight !== undefined);
  check('…and is not the biggest payday on the page',
    flight !== undefined && flight.questions * flight.perCorrect <= richest,
    `${flight ? flight.questions * flight.perCorrect : 0} vs ${richest}`);
  /* The row and the config are two statements of the same round; the component
     reads the row, the tuning checks above read the config. */
  check('…and its row agrees with the config',
    flight?.questions === FLIGHT.target && flight?.perCorrect === FLIGHT.perGap,
    `${flight?.questions}x${flight?.perCorrect} vs ${FLIGHT.target}x${FLIGHT.perGap}`);
}

console.log('\nflying — the sprite');
{
  /* Four style slots, and the two-colour rule is why. A fifth would be a third
     hue on a site that documents having exactly two. */
  const stray = PARROT_PARTS.filter((part) => !PART_STYLES.includes(part.style));
  check('the parrot uses only the sanctioned styles', stray.length === 0, `${stray.length} stray`);

  const escaped = PARROT_PARTS.filter(
    (p) => p.x < -0.4 || p.y < -0.4 || p.x + p.w > 1.15 || p.y + p.h > 1.15,
  );
  check('every part stays inside the sprite box', escaped.length === 0, `${escaped.length} outside`);
  check('every part has a positive size', PARROT_PARTS.every((p) => p.w > 0 && p.h > 0));
}

console.log('\nevery game is named in every language');
{
  /*
   * `Dictionary` is `typeof en`, which makes a missing *key* a compile error but
   * says nothing about a missing array *element* — a fifth game with four names
   * renders `undefined` on a card and typechecks perfectly. This is the only
   * thing standing between that and production.
   */
  for (const code of LANGUAGE_ORDER) {
    const names = LANGUAGES[code].games.names;
    check(`${code} names every game`, names.length === GAMES.length,
      `${names.length} of ${GAMES.length}`);
    check(`…and none is blank`, names.every((n) => n.trim().length > 0));
  }
}

console.log('\nwallet');
{
  const seeded = seedPlayer();
  check('a new wallet has something in it', seeded.vouchers.length > 0, `${seeded.vouchers.length} cards`);
  check('…both active and spent', activeVouchers(seeded).length > 0 && usedVouchers(seeded).length > 0,
    `${activeVouchers(seeded).length} active, ${usedVouchers(seeded).length} used`);

  const card = { brand: 'Zalando', logo: 'Z', points: 100, eur: 4.65 };
  const rich = { ...seeded, points: 250 };
  const bought = redeem(rich, card, 'PLZ-TEST', '30.09');
  check('redeeming spends the points', bought.points === 150, `${bought.points} left`);
  check('…and adds a card', bought.vouchers.length === seeded.vouchers.length + 1);
  check('…which starts active', activeVouchers(bought).some((v) => v.code === 'PLZ-TEST'));

  const poor = { ...seeded, points: 50 };
  check('an unaffordable card is refused', redeem(poor, card, 'X', '30.09') === poor);
  check('canAfford agrees', !canAfford(poor, 100) && canAfford(rich, 100));

  const id = activeVouchers(seeded)[0].id;
  const spent = markUsed(seeded, id, '03.08');
  check('showing the QR spends the voucher', usedVouchers(spent).length === usedVouchers(seeded).length + 1);
  /* Idempotent on purpose: a double click must not rewrite the date on a
     voucher that was already spent last month. */
  check('spending twice is a no-op', markUsed(spent, id, '09.09').vouchers.find((v) => v.id === id)?.usedOn === '03.08');
}

console.log('\nsession');
{
  /* The provider stores the account as JSON and narrows it on the way back in.
     A round trip has to survive both halves or a refresh signs everybody out. */
  const account: Account = {
    id: 'u_marta',
    name: 'Marta Wiśniewska',
    email: 'user1@pay-lez.com',
    type: 'business',
    business: blankBusiness(),
    player: null,
  };
  const back = JSON.parse(JSON.stringify(account)) as Account;
  check('an account survives a round trip', back.id === account.id && back.type === 'business');
  check('…including the listing', back.business?.spoken.join(',') === 'pl,en');

  const found = findUser(SEED_USERS, 'USER1@PAY-LEZ.COM', 'user123');
  check('the address is matched case-insensitively', found.ok);
  check('a wrong password is refused', findUser(SEED_USERS, 'user1@pay-lez.com', 'nope').ok === false);
  check('an unknown address is refused', findUser(SEED_USERS, 'nobody@pay-lez.com', 'user123').ok === false);
}

console.log('\nthe directory');
{
  /*
   * The three seeded people, and what each of them is *for*. A demo account that
   * signs in to a blank screen demonstrates nothing, so each seed is checked for
   * the state that makes its screen worth opening — not merely for existing.
   */
  const byEmail = (email: string) => SEED_USERS.find((u) => u.email === email);

  const admin = byEmail('admin@pay-lez.com');
  const owner = byEmail('user1@pay-lez.com');
  const player = byEmail('user2@pay-lez.com');

  check('all three seeds exist', Boolean(admin && owner && player), `${SEED_USERS.length} accounts`);
  check('the admin is an admin', admin?.type === 'admin');
  check('…and owns nothing on the platform', admin?.business === null && admin?.player === null);
  check('the admin credential works', findUser(SEED_USERS, 'admin@pay-lez.com', 'pay-lez26').ok);

  check('the owner is a business', owner?.type === 'business');
  check(
    'the owner lands on a working dashboard, not a form',
    Boolean(owner?.business && isBusinessReady(owner.business)),
    owner?.business ? `${profileCompleteness(owner.business).percent}%` : 'no listing',
  );

  check('the player is an individual', player?.type === 'individual');
  check(
    'the player has something to spend and something to show',
    Boolean(player?.player && player.player.points > 0 && player.player.vouchers.length > 0),
  );
  /* A `lastPlayed` older than yesterday is a *lapsed* streak, and the first
     round this account plays would correctly wipe the balance above. */
  check('…and no stale streak to lose it to', player?.player?.lastPlayed === null);

  const ids = new Set(SEED_USERS.map((u) => u.id));
  const emails = new Set(SEED_USERS.map((u) => u.email.toLowerCase()));
  check('ids are unique', ids.size === SEED_USERS.length);
  check('addresses are unique', emails.size === SEED_USERS.length);

  /* Nothing prints these on the sign-in form any more — see the note where
     `DEMO_USERS` used to be exported. What is checked instead is the property
     that made the admin unprintable in the first place: sign-up cannot produce
     one, at the type level, so the seeds are the only three that exist. */
  check('exactly one admin is seeded', SEED_USERS.filter((u) => u.type === 'admin').length === 1);
  check('and the other two are ordinary accounts', SEED_USERS.filter((u) => u.type !== 'admin').length === 2);
}

console.log('\nsigning up');
{
  const good = { name: 'Anna Kowalska', email: 'anna@example.com', password: 'secret1', type: 'individual' as const };

  check('a complete sign-up is accepted', validateSignUp(SEED_USERS, good) === null);
  check('a blank name is refused', validateSignUp(SEED_USERS, { ...good, name: '  ' }) === 'name');
  check('a malformed address is refused', validateSignUp(SEED_USERS, { ...good, email: 'anna@' }) === 'email');
  check(
    'an address already in the directory is refused',
    validateSignUp(SEED_USERS, { ...good, email: 'USER2@pay-lez.com' }) === 'taken',
  );
  check(
    'a short password is refused',
    validateSignUp(SEED_USERS, { ...good, password: 'x'.repeat(MIN_PASSWORD - 1) }) === 'password',
  );
  check('an unanswered type is refused', validateSignUp(SEED_USERS, { ...good, type: null }) === 'type');

  /* The order matters: the message points at the first field that needs
     attention, so a form with two problems must name the earlier one. */
  check(
    'the first problem is the one reported',
    validateSignUp(SEED_USERS, { ...good, name: '', email: 'nope' }) === 'name',
  );

  const person = newUser(good, 'u_test', '2026-08-03');
  check('a new player starts with a wallet', person.player !== null);
  check('…and with no listing', person.business === null);

  const owner = newUser({ ...good, email: 'b@example.com', type: 'business' }, 'u_test2', '2026-08-03');
  check('a new owner starts with no listing', owner.business === null);
  check('…which is what sends them to setup', resolveRoute('signin', {
    id: owner.id, name: owner.name, email: owner.email, type: 'business', business: null, player: null,
  }) === 'business-setup');
  check('…and with no wallet', owner.player === null);
  check('the address is trimmed, the password is not touched', newUser({ ...good, email: ' a@b.co ' }, 'u_t3', '2026-08-03').email === 'a@b.co');
}

console.log('\nthe console');
{
  /*
   * The analytics view derives a whole month from one number, so the checks here
   * are the ones that derivation can get wrong: a headline that disagrees with
   * the cards under it, a quiet venue showing a fraction of a customer, and a
   * date filter that does not filter.
   */
  const busy = serviceMetrics(1);
  const quiet = serviceMetrics(0.34);
  const fresh = serviceMetrics(0);

  check(
    'engagement is the sum of its parts',
    busy.engagement === busy.maps + busy.website + busy.phone + busy.instagram + busy.scans,
    `${busy.engagement}`,
  );
  check(
    'the voucher total is the sum of its four kinds',
    busy.vouchers ===
      busy.vouchersUsed + busy.vouchersActive + busy.loyaltyUsed + busy.loyaltyActive,
  );
  check(
    'points awarded follow the scans that earned them',
    busy.loyalty.awarded === busy.scans * busy.loyalty.perVisit,
  );

  check('a quieter venue is quieter everywhere', quiet.maps < busy.maps && quiet.scans < busy.scans);
  check('…including its tables', voucherRowsFor(0.34).length < voucherRowsFor(1).length);
  check('every count is a whole number', Number.isInteger(quiet.maps) && Number.isInteger(quiet.engagement));

  /* A venue with no traffic is the state every reference screenshot was taken
     in, and the state the one real listing on this console is genuinely in. */
  check('a new venue has nothing', fresh.engagement === 0 && fresh.scans === 0);
  check('…no rows', redemptionsFor(0).length === 0 && scanRowsFor(0).length === 0);
  check('…and no insights', fresh.cities.length === 0 && fresh.languages.length === 0);
  check('…but it still keeps its settings', fresh.loyalty.perVisit > 0 && fresh.loyalty.cooldown > 0);
  check('…and does not claim a discount it never gave', fresh.discount === 0);
  check('…or an average basket nobody filled', fresh.voucherCampaign.basket === 0);

  check('the trend is a month long', busy.trend.length === 30 && busy.scanTrend.length === 30);

  /* The four ranges on every table. Rows carry "days ago", so the filter is the
     same comparison the table itself runs. */
  const rows = redemptionsFor(1);
  check('all time keeps everything', rows.every((row) => inRange(row.ago, RANGES[0])));
  check(
    'last 7 days drops the older rows',
    rows.filter((row) => inRange(row.ago, RANGES[1])).length < rows.length,
  );
  check(
    'the ranges nest',
    rows.filter((r) => inRange(r.ago, RANGES[1])).length <=
      rows.filter((r) => inRange(r.ago, RANGES[2])).length,
  );

  const day = dayLabel(3, new Date('2026-08-03T12:00:00'));
  check('a row dates itself from today', day === '31.07', day);

  /* Quoting is not optional: these tables carry names, cities and money in five
     locales, and one unescaped comma shifts every column after it. */
  const csv = toCsv(['a', 'b'], [['Kraków, PL', 'say "hi"']]);
  check('the csv quotes every field', csv.startsWith('"a","b"'));
  check('…and doubles a quote inside one', csv.includes('"say ""hi"""'));
  check('…and keeps a comma inside its cell', csv.includes('"Kraków, PL"'));
}

console.log('\nthe partner dashboard');
{
  /*
   * The dashboard derives seven screens from one set of seeds, so the checks
   * here are the ones that derivation can get wrong: a budget whose three
   * slices do not add up to the budget, an attribution that claims more visits
   * than happened, and a series that is not the same series twice — which would
   * make the chart, the totals and the sparklines disagree on one screen.
   */
  const totals = PD_TOTALS;

  check('the series is the window', PD_SERIES.visits.length === RANGE_DAYS);
  check(
    'the series is deterministic',
    JSON.stringify(PD_SERIES) === JSON.stringify(PD_SERIES),
  );
  check(
    'visits are the sum of the days',
    totals.visits === PD_SERIES.visits.reduce((a, b) => a + b, 0),
    String(totals.visits),
  );

  /* Attribution is a subset, never a superset. Both halves have failed this in
     other dashboards by double-counting a newcomer who also claimed a deal. */
  check('what we claim is a subset of what happened', totals.attributed <= totals.visits);
  check('…and at least everyone new', totals.attributed >= totals.newCustomers);
  check(
    '…and worth less than the estimate',
    totals.attributedMoney <= totals.estimate,
  );

  /* A pool has exactly three states and they exhaust it. If they do not, the
     screen lets an owner commit the same money twice. */
  const loyalty = PD_CAMPAIGN_MODEL;
  check(
    'the loyalty pool adds up',
    Math.abs(loyalty.spent + loyalty.aside + loyalty.available - loyalty.allocation) < 1e-6,
  );
  check(
    'the widest gap is the widest',
    loyalty.list.every((c) => c.gap <= loyalty.widestGap),
    `${loyalty.widestGap} unused`,
  );
  check(
    'nothing is used more than was earned',
    loyalty.list.every((c) => c.used + c.expired <= c.earned),
  );

  const vouchers = PD_VOUCHER_MODEL;
  check(
    'the voucher pool adds up',
    Math.abs(vouchers.spent + vouchers.reserved + vouchers.available - vouchers.budget) < 1e-6,
  );
  check(
    'the two pools are the whole budget',
    Math.abs(loyalty.allocation + vouchers.budget - PD_ALLOCATION.total) < 1e-6,
  );
  /* The per-voucher cap is the reason that input exists — an uncapped 15% on a
     large order is an unbounded bite out of a fixed monthly budget. */
  check(
    'no tier costs more than the cap',
    vouchers.tiers.every((t) => t.unit <= PD_MAX_PER_VOUCHER + 1e-9),
  );
  check(
    'the biggest tier is the biggest',
    vouchers.tiers.every((t) => t.spent <= vouchers.tiers[vouchers.biggest].spent),
  );

  /* The cost breakdown is shown twice — as rows on the overview and as tiles on
     customers — and the cost per new customer divides by it. */
  check(
    'the cost total is its rows',
    Math.abs(PD_COST_TOTAL - PD_COST_ROWS.reduce((a, b) => a + b, 0)) < 1e-6,
  );
  check(
    'cost per new customer follows the total',
    Math.abs(PD_PER_NEW * totals.newCustomers - PD_COST_TOTAL) < 1e-6,
  );
  /* The headline figure and the last column of the trend beside it are the same
     number, not two figures for one thing. */
  const trend = metricsFor(RANGE_DAYS).perNewTrend;
  check('the trend ends on that same figure', trend[trend.length - 1] === PD_PER_NEW);
  check('…and is still three months wide', trend.length === 3);

  /*
   * The range picker.
   *
   * Four windows, and the thing that can go wrong is not arithmetic but the
   * split: what moves has to move, and what must not move has to stay put. A
   * window that scaled the monthly fee or the budget pools with it would let an
   * owner read a seven-day view as though they had paid a seventh of the
   * subscription, and it would break the pool invariant checked above.
   */
  check('every window is offered once', new Set(PD_RANGES).size === PD_RANGES.length);
  check('the default is one of them', PD_RANGES.includes(RANGE_DAYS));

  const windows = PD_RANGES.map((days) => metricsFor(days));

  check(
    'a window is memoised, not rebuilt',
    PD_RANGES.every((days) => metricsFor(days) === metricsFor(days)),
  );
  check(
    'a longer window never counts fewer visits',
    windows.every((m, i) => i === 0 || m.totals.visits >= windows[i - 1].totals.visits),
    `${windows.map((m) => m.totals.visits).join(' → ')}`,
  );
  check(
    'the chart never draws more points than it can show',
    windows.every((m) => m.series.visits.length === Math.min(m.days, 45)),
  );
  /* Attribution stays a subset in every window, not just the default one. */
  check(
    'what we claim is a subset in every window',
    windows.every((m) => m.totals.attributed <= m.totals.visits),
  );
  /* The cost side is fixed on purpose, so a short window has to read as *worse*
     value rather than as proportionally the same. That is the whole reason the
     picker is worth having. */
  check(
    'a shorter window earns back less of the same cost',
    windows.every((m, i) => i === 0 || m.roi >= windows[i - 1].roi),
    windows.map((m) => m.roi.toFixed(2)).join(' → '),
  );
  check(
    'cost per new customer follows the total in every window',
    windows.every((m) => Math.abs(m.perNew * m.totals.newCustomers - PD_COST_TOTAL) < 1e-6),
  );
  check(
    'the trend ends on the headline in every window',
    windows.every((m) => m.perNewTrend[m.perNewTrend.length - 1] === m.perNew),
  );
  check(
    'each window knows its own place in the label arrays',
    windows.every((m, i) => m.index === i),
  );

  /* The heat map is alpha on one accent, so an empty cell and a busy one have
     to differ by density alone — which needs a real range to work with. */
  check('the heat map is a week', PD_HEAT.length === 7);
  check('…fourteen hours wide', PD_HEAT.every((row) => row.length === HEAT_HOURS.length));
  check('…with a range to shade', PD_HEAT_MAX > Math.min(...PD_HEAT.flat()));
  /* Tuesday and Wednesday, 14:00–16:00 is the quiet block every "fill your
     quiet hours" prompt in the product points at. If the generator stops
     producing it, three sentences on two screens become false. */
  const hour15 = HEAT_HOURS.indexOf(15);
  check(
    'Tuesday afternoon is the quiet one',
    PD_HEAT[1][hour15] < PD_HEAT[0][hour15] && PD_HEAT[2][hour15] < PD_HEAT[3][hour15],
  );

  /* Normalised paths: every point has to land inside the box, or a line clips
     out of its own card. */
  const line = polyline(PD_SERIES.visits);
  const coords = line.match(/-?\d+\.\d+/g)?.map(Number) ?? [];
  check('a polyline stays in its box', coords.every((n) => n >= 0 && n <= 100));
  check('…and starts at the left edge', line.startsWith('M0.00 '));
  check('a two-point series still draws', polyline([1, 2]).length > 0);
  check('a one-point series draws nothing', polyline([1]) === '');
  check('the area closes to the floor', polyarea(PD_SERIES.visits).endsWith('L0 100 Z'));

  /* Every index in the roster is an index into a dictionary array. A stale one
     renders `undefined` rather than failing, which is why it is checked here. */
  check(
    'roster patterns are in range',
    PD_ROSTER.every((r) => r.pattern >= 0 && r.pattern < en.dashboard.customers.patterns.length),
  );
  check(
    'roster rewards are in range',
    PD_ROSTER.every((r) => r.reward >= 0 && r.reward < en.dashboard.customers.rewards.length),
  );
  check(
    'roster deals point at real deals',
    PD_ROSTER.every((r) => r.deals.every((d) => d >= 0 && d < en.dashboard.deals.rows.length)),
  );
  check(
    'roster campaigns point at real campaigns',
    PD_ROSTER.every((r) => r.camp === -1 || en.dashboard.campaigns.rows[r.camp] !== undefined),
  );
  check(
    'a customer has a tier or stamps, never both',
    PD_ROSTER.every((r) => (r.tier > 0) !== (r.so > 0)),
  );

  /* The deals table is index-aligned with four dictionary arrays at once. */
  check(
    'every deal has a name, a window, hours and an audience',
    PD_DEALS.every(
      (_, i) =>
        en.dashboard.deals.rows[i] !== undefined &&
        en.dashboard.deals.windows[i] !== undefined &&
        en.dashboard.deals.when[i] !== undefined,
    ),
  );
  check(
    'every deal aims at a real audience',
    PD_DEALS.every((d) => PD_AUDIENCES[d.audience] !== undefined),
  );
  check(
    'nobody claims a deal they never saw',
    PD_DEALS.every((d) => d.claimed <= d.opened || d.seen === 0),
  );
  check(
    'a notification never reaches more than the audience',
    PD_DEALS.every((d) => d.notify.reach <= d.notify.match),
  );

  /*
   * The expanded row draws the notification as a funnel — notified, opened,
   * came in — and a funnel that widens is not a funnel. `dealNotify` derives
   * the middle from the send and the last from the *claims*, so the two are
   * only guaranteed to stack while the rates keep that order; this is the check
   * that says so.
   */
  check(
    'the notification funnel reads downward',
    PD_DEALS.every((d) => {
      const n = dealNotify(d);
      return n.opened <= n.notified && n.camein <= n.opened;
    }),
  );
  check(
    'a notification never claims more than the deal got',
    PD_DEALS.every((d) => dealNotify(d).camein + dealNotify(d).alone === d.claimed),
  );
  check(
    'every deal says what it gives away',
    PD_DEALS.every((d) => en.dashboard.deals.act[d.state] !== undefined),
  );
  /* Only a deal with a limit gets the forecast, and the forecast names a date. */
  check(
    'a claim limit has a date to forecast against',
    PD_DEALS.every((d, i) => d.limit === 0 || en.dashboard.deals.limitDates[i] !== ''),
  );

  /*
   * The assistant writes the deal text in every language the product ships, and
   * that is the whole argument for the panel — an owner reading in one sees
   * what a customer reading in another will be shown. A language added to
   * `LANGUAGE_ORDER` without a line here would show that reader a blank field.
   */
  check(
    'the assistant can write a deal in all five languages',
    (['item', 'percent'] as const).every((reward) =>
      LANGUAGE_ORDER.every(
        (code) =>
          PD_ASSIST_COPY[reward][code]?.title.trim() &&
          PD_ASSIST_COPY[reward][code]?.body.trim(),
      ),
    ),
  );
  /* Three budgets, three durations, three ways it can move the days: the chips,
     the retry line and the revision list all count on those being what they
     are. */
  check(
    'the assistant offers three budgets and three durations',
    PD_ASSIST.budgets.length === 3 && PD_ASSIST.weeks.length === 3,
  );
  check(
    'the assistant has somewhere to move the days to',
    en.dashboard.assistant.dayChoices.length === 3,
  );
  /*
   * The budget warning is not a demo switch here — it fires when the budget
   * asked for is more than the month has room for. Both halves have to be
   * reachable or the panel is dead code: the smallest offer must fit and the
   * largest must not.
   */
  check(
    'the assistant sizes down a budget it cannot afford',
    PD_ASSIST.budgets[0] <= PD_ASSIST.hotRoom &&
      PD_ASSIST.budgets[PD_ASSIST.budgets.length - 1] > PD_ASSIST.hotRoom,
  );

  /* Scans are generated per index, so the whole page has to come out stable and
     in range — the progress bar divides by `need`. */
  check('a scan never over-fills its card', PD_SCANS.every((s) => s.done <= s.need));
  check(
    'a scan with no campaign has no card',
    PD_SCANS.every((s) => (s.campaign === -1) === (s.need === 0)),
  );
  check(
    'scan clock times are real',
    PD_SCANS.every((s) => s.hour >= 0 && s.hour < 24 && s.minute >= 0 && s.minute < 60),
  );
  check(
    'every scan names someone',
    PD_SCANS.every((s) => PD_SCAN_NAMES[s.who] !== undefined),
  );
  /* "Newest first" is the screen's own subtitle, so it has to be true. */
  check(
    'scans are newest first',
    PD_SCANS.every(
      (s, i) =>
        i === 0 ||
        PD_SCANS[i - 1].hour * 60 + PD_SCANS[i - 1].minute >= s.hour * 60 + s.minute,
    ),
  );

  /*
   * `unit` money, which this screen is the reason for. A cost per claim is
   * under a pound, and the other three rounding modes all take it to "£1" —
   * which turned three different figures in the ROI panel into the same one.
   */
  const gbp = CURRENCIES.en;
  const soum = CURRENCIES.uz;
  check('a per-unit amount keeps its minor units', money(0.78, gbp, 'unit') === '£0.67', money(0.78, gbp, 'unit'));
  check('…and is not the same as the rounded one', money(0.78, gbp, 'unit') !== money(0.78, gbp, 'exact'));
  check(
    '…and still groups its thousands',
    money(2000, gbp, 'unit') === '£1,714.71',
    money(2000, gbp, 'unit'),
  );
  /* A soum has no minor unit, so `unit` there must not invent one. */
  check('a currency with no minor unit gets no decimals', !money(0.78, soum, 'unit').includes('.'));
  check('the other modes are unchanged', money(126.65, gbp, 'price') === '£110', money(126.65, gbp, 'price'));
  check('…including exact', money(126.65, gbp, 'exact') === '£109', money(126.65, gbp, 'exact'));
  /* Zero keeps its decimals so a column of per-unit costs stays aligned —
     "£0" among "£0.67" is a ragged column, and these are tabular figures. */
  check('…and zero keeps the same shape', money(0, gbp, 'unit') === '£0.00', money(0, gbp, 'unit'));
}

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
