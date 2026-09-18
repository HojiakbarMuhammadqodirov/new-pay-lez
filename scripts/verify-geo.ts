/**
 * Headless sanity check for the parts of the globe that are pure maths.
 *
 * The 3D layer needs a browser, but the atlas parser, the sphere projection,
 * the country hit-test and the route baker are all deterministic — so they get
 * checked here instead of by eye.
 *
 *   npm run verify
 */
import { readFileSync } from 'node:fs';
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
  RESPONSIVE,
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
import { DAILY_POOL, dailyGame, dailyGameIndex } from '../src/site/games/rules';
import { SCOPES } from '../src/site/api/board';
import { lineCap, longestLine } from '../src/site/heroLines';
import { ratesFrom } from '../src/site/api/fx';
import {
  CURRENCY_FOR_LANGUAGE,
  CURRENCY_ORDER,
  GROUP_FOR_LANGUAGE,
  isCurrencyCode,
} from '../src/site/i18n/currency';
import { ApiError } from '../src/site/api/client';
import { FX } from '../src/site/i18n/fx';
import { wordListFor } from '../src/site/games/banks';
import { isAskable } from '../src/site/games/rounds';
import {
  LOCAL_COUNTRIES,
  QUIZ_BANK_FOR_COUNTRY,
  flagGlyph,
  flagOf,
  quizBankFor,
  quizCountryFor,
} from '../src/site/games/banks';
import { EMPTY_PROFILE, type Account } from '../src/site/auth/context';
import {
  blankBusiness,
  isBusinessReady,
  profileCompleteness,
  REQUIRED_FIELDS,
} from '../src/site/auth/business';
import {
  BIRTH_DATE_WRITES,
  checkBirthDate,
  checkUsername,
  findUser,
  OCCUPATIONS,
  isOccupation,
  isPhone,
  MIN_PASSWORD,
  newUser,
  profileGaps,
  profilePercent,
  SEED_USERS,
  sameEmail,
  USERNAME_MAX,
  USERNAME_MIN,
  WELCOME_POINTS,
  validateSignUp,
  type UserRecord,
} from '../src/site/auth/users';
import {
  awardFlight,
  awardRound,
  bankableGaps,
  canAfford,
  flightAward,
  flightPoints,
  freezesOf,
  MAX_FLIGHT_POINTS,
  MAX_FREEZES,
  MAX_ENERGY,
  memoryPoints,
  quizAward,
  quizSpeedBonus,
  ENERGY_REGEN_MINUTES,
  energyOf,
  newPlayer as freshPlayer,
  streakWeek,
  wordPoints,
  wordRoundPoints,
  type PlayerState,
} from '../src/site/auth/player';
import { RETIRED_IDS, toAccount } from '../src/site/auth/directory';
import { FLIGHT } from '../src/site/flight/config';
import { crossed, flap, gapCentre, hits, hitsBounds, spawnPipe, speedAt, stepBird } from '../src/site/flight/engine';
import { PARROT_PARTS, PART_STYLES } from '../src/site/flight/parrot';
import {
  ADMIN_TABS,
  BUSINESS_CATEGORIES,
  DASH_SCREENS,
  PARTNER_PLAN_HERO,
  PARTNER_PLAN_ROWS,
  DEAL_KINDS,
  GAMES,
  LEARN_STATS,
  PREVIEW,
  SUB_BADGE_ROW,
  SUB_HERO,
  SUB_PLANS,
  SUB_ROWS,
  subBeatsFree,
  subRoundsPerDay,
} from '../src/site/content';
import {
  cheapestCost,
  dealsPath,
  faceValue,
  nextRung,
  type GiftCardStock,
} from '../src/site/api/wallet';
/* The source dictionary, read for its *shapes* rather than its words: the
   dashboard's arrays are index-aligned with the seeds below, and a stale index
   renders `undefined` instead of throwing. */
import { en } from '../src/site/i18n/en';
import { CURRENCIES, fill, money } from '../src/site/i18n/currency';
import {
  HEAT_HOURS,
  PD_ALLOCATION,
  PD_ASSIST,
  PD_ASSIST_COPY,
  PD_CAMPAIGN_MODEL,
  PD_COST_ROWS,
  PD_COST_TOTAL,
  PD_HEAT,
  PD_HEAT_MAX,
  PD_MAX_PER_VOUCHER,
  PD_PER_NEW,
  PD_RANGES,
  PD_SCAN_PAGE,
  PD_SCAN_TOTAL,
  PD_SCANS,
  PD_SERIES,
  PD_TOTALS,
  AVG_SPEND,
  PD_VOUCHER_BUDGET,
  PD_VOUCHER_MODEL,
  RANGE_DAYS,
  dealFromApi,
  dealNotify,
  heatFromApi,
  metricsFor,
  voucherModelFor,
  polyarea,
  polyline,
} from '../src/site/partnerMetrics';
import { LANGUAGE_ORDER, LANGUAGES, type LanguageCode } from '../src/site/i18n/context';
import { LOADERS as LEGAL } from '../src/site/legal/load';
import {
  dayLabel,
  inRange,
  RANGES,
  redemptionsFor,
  scanRowsFor,
  serviceMetrics,
  serviceMetricsFrom,
  toCsv,
  voucherRowsFor,
  categoryLabel,
  initialOf,
} from '../src/site/adminMetrics';
import { Vector3 } from 'three';
/* Accounts and listings coming home from the server — see the section of the
   same name near the end. */
import type { GamesState, Me } from '../src/site/api/consumer';
import {
  businessFromSource,
  categoryOf,
  countryOf,
  listingState,
  listingWrite,
  pickDescription,
  sourceFromRow,
  subcategoryIndex,
  subcategoryWord,
  webAddress,
  type ListingSource,
} from '../src/site/api/listing';
import {
  awaitsServer,
  foldServer,
  playerFromGames,
  profileFromServer,
  profileRefusal,
  profileWrite,
  typeFromRoles,
} from '../src/site/auth/mirror';
import { isPicture } from '../src/site/auth/picture';
import type { BusinessProfile } from '../src/site/auth/business';

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
  check('a wide viewport does not sink the globe', hero.y === 0);
}

console.log('\nlayout — hero state in portrait');
{
  /*
   * Portrait stacks the hero copy and reserves `min-height: 46vh` under it for
   * the globe, so the copy's floor is at 54% of the viewport — this is that
   * plus the clearance `RESPONSIVE.portraitCopyDepth` buys. Above this line is
   * text; a globe drawn through it is the bug these checks exist for.
   */
  const COPY_FLOOR = 0.55;

  // Screen fraction measured down from the top edge. The globe centre lies on
  // z = 0, which is where the top and bottom of the disc live too, so no
  // perspective correction is needed.
  const fromTop = (y: number, state: { visibleHeight: number }) =>
    0.5 - y / state.visibleHeight;

  /*
   * Both prop sets: `Site.tsx` renders the landing globe at 0.18 / 0.62, and
   * `DEFAULTS` is what any other caller gets. The framing has to hold for the
   * layout, not for one call site.
   */
  for (const [offsetX, heightCoverage, label] of [
    [0.18, 0.62, 'site props'],
    [DEFAULTS.offsetX, DEFAULTS.heightCoverage, 'defaults'],
  ] as const) {
    const { hero } = resolveLayout(390, 844, offsetX, heightCoverage);
    const visibleWidth = hero.visibleHeight * (390 / 844);
    const top = fromTop(hero.y + GLOBE.radius, hero);
    const bottom = fromTop(hero.y - GLOBE.radius, hero);

    check(
      `phone ${label}: the globe clears the copy`,
      top >= COPY_FLOOR - 1e-9,
      `top edge at ${(top * 100).toFixed(1)}% of the viewport`,
    );
    check(
      `phone ${label}: …and the whole disc is still on screen`,
      top >= 0 && bottom <= 1 + 1e-9,
      `${(top * 100).toFixed(1)}% – ${(bottom * 100).toFixed(1)}%`,
    );
    check(
      `phone ${label}: …sideways too`,
      Math.abs(hero.x) + GLOBE.radius <= visibleWidth / 2 + 1e-9,
      `half-width ${(Math.abs(hero.x) + GLOBE.radius).toFixed(3)} vs ${(visibleWidth / 2).toFixed(3)}`,
    );
    check(
      `phone ${label}: …and it lands in the reserved slot, not on the fold`,
      hero.y < 0 && bottom > 0.9,
      `bottom edge at ${(bottom * 100).toFixed(1)}%`,
    );
  }

  /*
   * A portrait tablet is the case where the vertical cap does the work: the
   * horizontal clamp would allow 58% of the viewport height, which is a globe
   * a third taller than the slot it has to fit in.
   */
  {
    const { hero } = resolveLayout(820, 1180, 0.18, 0.62);
    const top = fromTop(hero.y + GLOBE.radius, hero);
    const bottom = fromTop(hero.y - GLOBE.radius, hero);

    check(
      'tablet portrait: the globe is capped to the slot, not to the screen',
      Math.abs(bottom - top - (1 - RESPONSIVE.portraitCopyDepth)) < 1e-9,
      `${((bottom - top) * 100).toFixed(1)}% tall`,
    );
    check(
      'tablet portrait: …which puts it exactly between the copy and the fold',
      Math.abs(top - RESPONSIVE.portraitCopyDepth) < 1e-9 &&
        Math.abs(bottom - 1) < 1e-9,
      `${(top * 100).toFixed(1)}% – ${(bottom * 100).toFixed(1)}%`,
    );
  }

  /*
   * Nothing above phone width may move. The last of these is the width gate:
   * an iPad Pro is portrait by aspect, but the stylesheet keeps its hero in two
   * columns, so there is no slot to sink into.
   */
  for (const [w, h, label] of [
    [1920, 1080, '16:9'],
    [1280, 800, '16:10'],
    [3440, 1440, 'ultrawide'],
    [1024, 1366, 'portrait tablet, two columns'],
  ] as const) {
    const { hero } = resolveLayout(w, h, 0.18, 0.62);
    check(`${label}: no vertical offset`, hero.y === 0, `y ${hero.y}`);
  }

  /*
   * The sink ramps with aspect instead of switching, so a tablet rotating past
   * square glides. Sweep a fixed width through the whole ramp and check no two
   * neighbouring aspects disagree by more than a hair of the viewport — a hard
   * switch would show up here as a single 27.5% step.
   *
   * The heights are deliberately left fractional. Rounding them to whole pixels
   * makes the sample spacing jitter by up to a pixel, which shows up as a step
   * several times the real one and would have this flake on a threshold tight
   * enough to be worth asserting. What is under test is the function's
   * continuity in aspect, so it is sampled in aspect.
   */
  {
    const SAMPLES = 2000;
    let worst = 0;
    let prev: number | null = null;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const aspect = 1.3 - (i / SAMPLES) * 0.9; // 1.3 → 0.4
      const { hero } = resolveLayout(800, 800 / aspect, 0.18, 0.62);
      const centre = fromTop(hero.y, hero);
      if (prev !== null) worst = Math.max(worst, Math.abs(centre - prev));
      prev = centre;
    }
    check(
      'the sink ramps in with aspect rather than switching',
      worst < 0.01,
      `largest step ${(worst * 100).toFixed(3)}% of the viewport`,
    );
  }
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
   * Six versions of this screen have shared these checks, because none of them
   * is about the picture. They are about the sequence being a sequence: the
   * parts overlapping rather than queueing, the exit landing exactly where the
   * timer expects it, the Skip being reachable, and the light's own geometry
   * staying coherent.
   */

  const arrives = t.light.arrive.delay + t.light.arrive.duration;
  const unfolds = t.unfold.delay + t.unfold.duration;
  const ruleEnds = t.rule.delay + t.rule.duration;

  check(
    'every stage fits inside the run time',
    unfolds <= t.duration &&
      ruleEnds <= t.duration &&
      t.exit.delay + t.exit.duration <= t.duration,
    `duration ${t.duration}ms`,
  );
  /* The light lands on the mark and *waits* there. Without the beat the p is
     uncovered and abandoned inside one gesture, and it reads as a letter the
     sweep happened to pass rather than as the thing the screen is about. */
  check(
    'the mark is held before it unfolds',
    t.unfold.delay > arrives,
    `lands ${arrives}ms, unfolds ${t.unfold.delay}ms — a ${t.unfold.delay - arrives}ms beat`,
  );
  check(
    'the word finishes unfolding before the screen leaves',
    unfolds <= t.exit.delay,
    `unfold ends ${unfolds}ms, exit at ${t.exit.delay}ms`,
  );
  /* The hairline has to start while the p is still travelling, or it reads as a
     flourish after the word rather than as part of one gesture. */
  check(
    'the rule starts before the unfold finishes',
    t.rule.delay < unfolds,
    `rule ${t.rule.delay}ms, unfold ends ${unfolds}ms`,
  );
  check(
    'the rule finishes drawing before the screen leaves',
    ruleEnds <= t.exit.delay,
    `rule ends ${ruleEnds}ms, exit at ${t.exit.delay}ms`,
  );
  /* The travelling p hands off to the word's own first letter, so the fade has
     to sit *inside* the unfold — by its end the two glyphs are identical and in
     the same place, which is the only moment a crossfade is invisible. */
  check(
    'the mark hands off inside the unfold',
    t.markFade > 0 && t.markFade < t.unfold.duration,
    `${t.markFade}ms of a ${t.unfold.duration}ms unfold`,
  );
  check(
    'the exit completes exactly at the end',
    t.exit.delay + t.exit.duration === t.duration,
    `${t.exit.delay + t.exit.duration}ms vs ${t.duration}ms`,
  );
  /*
   * The site is uncovered **as** the screen leaves, not after it. This ground is
   * the page's ground, so an overlay fading off a page still hidden behind
   * `data-intro='running'` fades onto a rectangle of the colour it just removed.
   */
  check(
    'the site is uncovered while the screen is still leaving',
    t.exit.delay < t.duration,
    `revealed at ${t.exit.delay}ms, overlay gone at ${t.duration}ms`,
  );

  /* ── the Skip has to be reachable ────────────────────────────────────────── */

  /*
   * **This is the check that exists because the screen failed it.** The Skip
   * used to appear with the hairline, two thirds of the way through a
   * 1.9-second sequence, which left about a second to notice a control in the
   * corner, move to it and press it — and in practice that is not enough. A
   * skippable sequence is one you can actually skip.
   */
  const reachable = t.duration - t.skip.delay;
  check(
    'the Skip is on screen long enough to press',
    reachable >= 2000,
    `visible from ${t.skip.delay}ms, ${reachable}ms of screen time`,
  );
  check(
    'the Skip does not precede the thing it skips',
    t.skip.delay >= t.light.arrive.delay,
    `skip ${t.skip.delay}ms, light enters ${t.light.arrive.delay}ms`,
  );
  /* …and the whole thing still has to be short. A brand screen is a courtesy
     the visitor did not ask for. */
  check('intro stays under three and a half seconds', t.duration <= 3500, `${t.duration}ms`);
  /* The wait for the brand face is dead time *before* `duration`, not inside it,
     so on a cold cache it is time a visitor spends on this screen too. */
  check(
    'the wait for the face cannot outlast the sequence',
    t.fontWait < t.duration,
    `${t.fontWait}ms wait, ${t.duration}ms sequence`,
  );

  /* ── the light's geometry ────────────────────────────────────────────────── */

  /* It enters and leaves outside the frame. A light that appears at the left
     edge and stops at the right is a thing being switched on and off. */
  check(
    'the light crosses from off-screen to off-screen',
    t.light.from < 0 && t.light.to > 1,
    `${t.light.from} → ${t.light.to} of the viewport width`,
  );
  /*
   * The pool is alpha-composited over the destination every frame, so its price
   * is the *square* of the radius. Uncapped, `0.3` of a 1920×1080 diagonal on a
   * 2× display is seven megapixels of blending a frame and measured 18ms
   * against `StubDrift`'s 7ms on the same screen; the cap brought it to 12.
   */
  check(
    'the light has a ceiling on its reach',
    t.light.maxRadius > 0 && t.light.maxRadius < 1000,
    `${t.light.radius} of the diagonal, capped at ${t.light.maxRadius}px`,
  );
  /* The node count goes as the square of the radius too, so the cell widens on a
     large screen rather than the lattice multiplying. */
  check(
    'the lattice is bounded by node count, not by pitch',
    t.lattice.maxSpan > 0 && t.lattice.maxSpan <= 80,
    `at most ${t.lattice.maxSpan} nodes across`,
  );
  /* The pointer moves the light toward itself, never *to* itself: at a pull of
     1 a cursor in a corner takes the light off the lockup entirely, and the
     brand screen goes dark while somebody is looking at it. */
  check(
    'the pointer pulls the light without owning it',
    t.light.pull > 0 && t.light.pull < 1,
    `pull ${t.light.pull}`,
  );
  /* The easing is a lerp factor, so it has to stay inside 0..1 or the light
     overshoots its target every frame and oscillates. */
  check(
    'the light has weight and does not snap',
    t.light.follow > 0 && t.light.follow < 0.5,
    `follow ${t.light.follow} per frame`,
  );

  /* ── the lockup ──────────────────────────────────────────────────────────── */

  /* The mark has to be unmistakably bigger than the type it becomes, or the
     unfold is a letter nudging sideways rather than an icon opening. */
  check(
    'the mark stands well above type size',
    t.markScale >= 2,
    `${t.markScale}× the wordmark`,
  );
  /* The word gains something when the specular arrives. Already at full
     strength, there is nothing for the glint to add and it stops reading as
     light falling on a surface. */
  check(
    'the word has headroom for the glint',
    t.word.base > 0 && t.word.base < 1,
    `base ${t.word.base}`,
  );
  /*
   * Both grounds, because they are two sets of values rather than one with a
   * switch on it — and `ink` is the easy half to leave behind, being the theme
   * the author is not looking at. The pool is the one that has to differ: the
   * same soft disc that is a glow on black is a pale cloud on near-white, with
   * the wordmark floating in the middle of it.
   */
  check(
    'paper takes a fraction of the pool',
    t.tone.ink.pool < t.tone.glow.pool / 2,
    `glow ${t.tone.glow.pool}, ink ${t.tone.ink.pool}`,
  );
  /* …and gets it back in the engraving, which is a mark rather than a glow and
     reads perfectly well on white. */
  check(
    'paper gets the strength back in the engraving',
    t.tone.ink.lattice > t.tone.glow.lattice,
    `glow ${t.tone.glow.lattice}, ink ${t.tone.ink.lattice}`,
  );
  /* There is no headroom above white, so a specular on paper can only ever land
     the letter on solid accent — never past it. */
  check(
    'the specular cannot overshoot on paper',
    t.tone.ink.spark + t.word.base <= 1.2 && t.tone.ink.spark < t.tone.glow.spark,
    `ink ${t.word.base} + ${t.tone.ink.spark}`,
  );
  /* One bucket is a flat disc and two is a poster; the alpha range is wide
     enough that the banding shows below about six. */
  check(
    'enough distance buckets to hide the banding',
    t.lattice.buckets >= 6,
    `${t.lattice.buckets} buckets`,
  );
  /* The parallax is a fraction of the pointer's offset from centre. Past a few
     percent the lattice slides further than the light does and the surface
     stops reading as something the light is moving over. */
  check(
    'the parallax is a hint rather than a slide',
    t.lattice.parallax > 0 && t.lattice.parallax <= 0.08,
    `${t.lattice.parallax} of the pointer offset`,
  );
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
    profile: EMPTY_PROFILE,
    /*
     * A date rather than `null` on the fixtures that stand for *established*
     * accounts, because `null` now means something: an individual carrying it
     * is held at onboarding from every route, and every assertion below about
     * where an individual goes would quietly become an assertion about the
     * welcome screen. `newPlayer` is the fixture that carries the `null`.
     */
    onboardedAt: '2026-01-01',
    /* `null` on every fixture here: the profile bonus is not what any of these
       assertions are about, and a stamp would only make one of them read as if
       it were. */
    profileCompletedAt: null,
  };
  const person: Account = { ...undecided, type: 'individual' };
  const newPlayer: Account = { ...person, onboardedAt: null };
  const ownerNew: Account = { ...undecided, type: 'business' };
  const ownerSet: Account = { ...ownerNew, business: blankBusiness() };
  /* An owner who has never been through onboarding, because none of them has:
     it is the player app's first minute and an owner has no player state. The
     hold must be by *type*, so this account has to behave exactly like
     `ownerSet`. */
  const ownerRaw: Account = { ...ownerSet, onboardedAt: null };
  const admin: Account = { ...undecided, type: 'admin' };
  const adminRaw: Account = { ...admin, onboardedAt: null };

  const consumer: Route[] = ['landing', 'learn', 'vouchers', 'relocate'];

  for (const route of consumer) {
    check(`anon keeps ${route}`, resolveRoute(route, anon) === route);
    check(`individual keeps ${route}`, resolveRoute(route, person) === route);
  }

  check('anon keeps business', resolveRoute('business', anon) === 'business');
  /*
   * Analytics is a venue owner's screen and nobody else's.
   *
   * This assertion used to be its opposite — a visitor "kept" analytics,
   * because the page was read as part of the pitch. It is a month of a venue's
   * takings, so a reader who owns no venue is looking at either somebody's real
   * numbers or invented ones. `landing` rather than `signin`, because signing
   * in does not earn a player access either: the page is not locked, it is not
   * theirs.
   */
  check('anon is sent away from analytics', resolveRoute('analytics', anon) === 'landing');
  check(
    'a player is sent away from analytics',
    resolveRoute('analytics', person) === 'landing',
  );
  check('an owner keeps analytics', resolveRoute('analytics', ownerSet) === 'analytics');
  check('anon is sent from the dashboard to sign-in', resolveRoute('dashboard', anon) === 'signin');
  check('anon is sent from setup to sign-in', resolveRoute('business-setup', anon) === 'signin');
  check('anon is sent from the console to sign-in', resolveRoute('admin', anon) === 'signin');
  check('anon may reach sign-in', resolveRoute('signin', anon) === 'signin');

  check('an undecided account is held at sign-in', resolveRoute('landing', undecided) === 'signin');
  check('…from every route', consumer.every((r) => resolveRoute(r, undecided) === 'signin'));

  check('individual loses business', resolveRoute('business', person) === 'landing');
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
    ['landing', 'learn', 'business', 'analytics', 'vouchers', 'relocate'].every(
      (r) => resolveRoute(r as Route, admin) === r,
    ),
  );

  check('an owner with no listing is sent to setup', resolveRoute('dashboard', ownerNew) === 'business-setup');
  check('an owner with a listing reaches the dashboard', resolveRoute('dashboard', ownerSet) === 'dashboard');
  check('an owner keeps business', resolveRoute('business', ownerSet) === 'business');

  /*
   * Where sign-in lands is the whole of the post-sign-in routing, so it is
   * checked per account rather than as one case. This is also the pair that
   * used to be done by calling `navigate` from the form, which raced the guard.
   */
  check('an individual lands on the landing page', resolveRoute('signin', person) === 'landing');
  check('a new owner lands on setup', resolveRoute('signin', ownerNew) === 'business-setup');
  /* The dashboard, not the landing page: an owner signing in has come to run the
     venue, the same way an operator lands on the console. */
  check('a set-up owner lands on their dashboard', resolveRoute('signin', ownerSet) === 'dashboard');

  /* ── the profile, and the hold at onboarding ─────────────────────────── */

  /*
   * `#/profile` is private and belongs to *everybody who exists*, including the
   * operator: the console replaces an admin's venue screens because they have
   * no venue, and it does not replace their own name and city.
   */
  check('anon is sent from the profile to sign-in', resolveRoute('profile', anon) === 'signin');
  /*
   * Onboarding is the exception, and it exists to make sense of the Back
   * button on the welcome flow. Signing out of onboarding has to resolve to a
   * page, and `signin` made the flow's own "Back" land on the login form: the
   * handler sets `#top`, the guard runs against the new account and the old
   * route, and replaces it. `analytics` set the precedent — a private route
   * whose signed-out answer is the marketing page, because signing in would
   * not get an anonymous visitor there either.
   */
  check(
    'anon is sent from onboarding to the landing page',
    resolveRoute('onboarding', anon) === 'landing',
  );
  check('an individual keeps the profile', resolveRoute('profile', person) === 'profile');
  check('an owner keeps the profile', resolveRoute('profile', ownerSet) === 'profile');
  check('an admin keeps the profile', resolveRoute('profile', admin) === 'profile');

  /*
   * The hold. A player who has not been through onboarding goes there from
   * every route — the same shape as the undecided account being held at
   * sign-in, and for the same reason: it is one short step, and the welcome
   * gift is paid at the end of it rather than at sign-up, so skipping it would
   * leave somebody looking at a zero.
   */
  check('a new player is held at onboarding', resolveRoute('landing', newPlayer) === 'onboarding');
  check(
    '…from every route',
    ([...consumer, 'business', 'analytics', 'dashboard', 'admin', 'profile', 'signin'] as Route[])
      .every((r) => resolveRoute(r, newPlayer) === 'onboarding'),
  );
  check(
    'a player who finished it is never sent back',
    resolveRoute('onboarding', person) === 'landing',
  );

  /* Exempt by *type*, not by the stamp: neither of these has a player state, so
     neither has a first minute. Both have to behave exactly as they did before
     the field existed. */
  check('an owner is never held at onboarding', resolveRoute('landing', ownerRaw) === 'landing');
  check('…and reaches their dashboard', resolveRoute('dashboard', ownerRaw) === 'dashboard');
  check('an admin is never held at onboarding', resolveRoute('admin', adminRaw) === 'admin');
  check('an owner loses onboarding', resolveRoute('onboarding', ownerSet) === 'landing');
  check('an admin loses onboarding', resolveRoute('onboarding', admin) === 'admin');

  /* An undecided account is still held at sign-in *first*: it has no type, so
     "is this an individual who has not onboarded?" has no answer yet. */
  check(
    'the type question comes before the welcome',
    resolveRoute('onboarding', { ...undecided, onboardedAt: null }) === 'signin',
  );

  /* Every redirect must land somewhere that does not itself redirect, or the
     effect in `Site` navigates in a loop. */
  /* Derived from `PATHS` rather than listed, so a route added tomorrow is in
     this matrix without anybody remembering to add it. The hand-written list
     that used to be here had already fallen two behind. */
  const all = Object.keys(PATHS) as Route[];
  const accounts = [
    anon, undecided, { ...undecided, onboardedAt: null },
    person, newPlayer, ownerNew, ownerSet, ownerRaw, admin, adminRaw,
  ];
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

console.log('\nthe profile');
{
  /*
   * The seven answers, and the three rules on them that are not "is it a
   * string". All three are the *server's* rules restated in `auth/users.ts`
   * (see the banner there), so a check that passes here is a check that the two
   * halves of Paylez still agree about what a username is.
   */

  /* The one constant that is written twice, because `context.ts` cannot import
     it back without a runtime import cycle. */
  check(
    'a blank profile carries both birthday writes',
    EMPTY_PROFILE.birthDateChangesLeft === BIRTH_DATE_WRITES,
    `${EMPTY_PROFILE.birthDateChangesLeft} vs ${BIRTH_DATE_WRITES}`,
  );

  /* ── the handle ─────────────────────────────────────────────────────── */

  /* Two rows built here rather than taken off `SEED_USERS`, which is empty:
     what `checkUsername` needs is a directory with a handle already in it, and
     the seeds it used to borrow were an account with a password in the bundle.
     A fixture is the honest way to get one. */
  const directory: UserRecord[] = [
    {
      id: 'u_me', name: 'A', email: 'a@a.c', password: 'x', created: '2026-01-01',
      type: 'individual', business: null, player: null,
      profile: { ...EMPTY_PROFILE, username: 'dilnoza' },
      onboardedAt: '2026-01-01',
      profileCompletedAt: null,
    },
    {
      id: 'u_other', name: 'B', email: 'b@b.c', password: 'x', created: '2026-01-01',
      type: 'individual', business: null, player: null,
      profile: { ...EMPTY_PROFILE, username: 'KasiaPL' },
      onboardedAt: '2026-01-01',
      profileCompletedAt: null,
    },
  ];

  const ok = (value: string) => checkUsername(directory, value, 'u_me');
  const why = (value: string) => {
    const result = ok(value);
    return result.ok ? 'ok' : result.error;
  };

  check('a plain handle passes', why('kasia_pl') === 'ok');
  check('…and is kept as it was typed', (() => {
    const result = ok('  KasiaNowa  ');
    return result.ok && result.username === 'KasiaNowa' && result.norm === 'kasianowa';
  })());
  check(`under ${USERNAME_MIN} is refused`, why('ab') === 'length');
  check(`over ${USERNAME_MAX} is refused`, why('a'.repeat(USERNAME_MAX + 1)) === 'length');
  /* The three ways to look like somebody else, all invisible at a glance. */
  check('a leading underscore is refused', why('_kasia') === 'shape');
  check('a trailing underscore is refused', why('kasia_') === 'shape');
  check('a doubled underscore is refused', why('kasia__pl') === 'shape');
  check('a dot is refused', why('kasia.pl') === 'shape');
  /* ASCII only: a Cyrillic `а` in an otherwise Latin word is a working
     impersonation that no amount of case folding catches. */
  check('a non-ASCII letter is refused', why('kаsia') === 'shape');
  check('a claim about who is speaking is refused', why('support') === 'reserved');
  check('…in any case', why('AdMiN') === 'reserved');
  check('a handle somebody else holds is refused', why('kasiapl') === 'taken');
  check('…ignoring case', why('KASIAPL') === 'taken');
  check(
    'and holding it yourself is not a clash',
    (() => {
      const result = checkUsername(directory, 'KasiaPL', 'u_other');
      return result.ok;
    })(),
  );

  /* ── the birthday ───────────────────────────────────────────────────── */

  const today = '2026-08-30';
  const day = (value: string) => {
    const result = checkBirthDate(value, today);
    return result.ok ? 'ok' : result.error;
  };

  check('an ordinary birthday passes', day('1998-03-14') === 'ok');
  check('a malformed date is refused', day('14/03/1998') === 'format');
  /*
   * The one that a regex plus a `new Date` gets wrong: `2026-02-30` does not
   * throw, it rolls forward to March 2nd — so the naive version accepts a day
   * that does not exist and then stores a different one.
   */
  check('a day that does not exist is refused', day('2025-02-30') === 'nonexistent');
  check('…and one that does is not', day('2004-02-29') === 'ok');
  check('today is not a birthday', day(today) === 'future');
  check('tomorrow is not either', day('2026-08-31') === 'future');
  check('under thirteen is refused', day('2015-08-30') === 'young');
  /* Exactly thirteen, on the day: the boundary is inclusive, and the
     birthday-aware year count is what makes the day before it fail. */
  check('exactly thirteen passes', day('2013-08-30') === 'ok');
  check('a day short of thirteen does not', day('2013-08-31') === 'young');
  check('a typo in the century is refused', day('1825-01-01') === 'old');

  /* ── the rest ───────────────────────────────────────────────────────── */

  check('a phone number passes', isPhone('+48 600 000 000'));
  check('…in brackets too', isPhone('(0048) 600-000.000'));
  check('a sentence is not a phone number', !isPhone('call me'));
  check('four digits is not one', !isPhone('1234'));
  check('sixteen digits is not one', !isPhone('1234567890123456'));

  /* ── completeness ───────────────────────────────────────────────────── */

  /*
   * All seven, or it is not finished — the server's own definition, and it has
   * to be, because the server *pays* for a complete profile. A meter reading
   * 100% while the bonus had not landed would be the site calling the server
   * wrong.
   */
  const blank = EMPTY_PROFILE;
  check('a blank profile is missing six of the seven', profileGaps(blank, 'a@b.c').length === 6);
  check('…and no address makes it seven', profileGaps(blank, '').length === 7);
  check('a blank profile with an address reads 14%', profilePercent(blank, 'a@b.c') === 14);

  const full = {
    username: 'kasia', occupation: 'student' as const, city: 'Krakow', countryCode: 'PL',
    phone: '+48 600 000 000', birthDate: '1998-03-14', birthDateChangesLeft: 1,
    avatar: 'data:image/jpeg;base64,x',
  };
  check('a finished profile has no gaps', profileGaps(full, 'a@b.c').length === 0);
  check('…and reads 100%', profilePercent(full, 'a@b.c') === 100);
  /* Six of seven must not round up to 100: a meter that says finished while
     something is blank is the one reading nobody can act on. */
  check(
    'six of the seven does not read 100%',
    profilePercent({ ...full, phone: '' }, 'a@b.c') === 85,
  );

  /*
   * Status is a closed set, and the set is the server's.
   *
   * There is no validator to test here — that is the point of the change. The
   * free line this replaced needed a length rule and a refusal path; five
   * literals need neither, because the only value that can arrive is one the
   * type system already allows. What *can* still drift is the set itself, in
   * either of two directions: a value renamed on the server and not here, or a
   * sixth added to the menu that `PATCH /v1/me` will refuse. So the list is
   * checked verbatim, in order, and `other` is checked to be last because that
   * is where a catch-all belongs in the menu the array renders.
   */
  check(
    'status is the five values the server stores',
    OCCUPATIONS.join(',') === 'student,worker,business,freelancer,other',
    OCCUPATIONS.join(', '),
  );
  check('…and a stored value outside them is not one', !isOccupation('headline'));
  check('…while each of the five is', OCCUPATIONS.every(isOccupation));

  /* There was a furnished seed here — a profile, an onboarding stamp and one
     birthday correction already spent — and three checks that it stayed
     furnished. It is gone, and what replaces it is the property that made it
     go: a profile is something a person fills in, so the only profile the
     bundle may contain is the blank one. */
  check('nothing ships with a profile filled in', SEED_USERS.length === 0);
  check(
    '…and a blank one has both birthday writes unspent',
    EMPTY_PROFILE.birthDateChangesLeft === BIRTH_DATE_WRITES,
  );

  /* A brand-new account is the one case where `null` is *known* rather than
     inferred, and it is what the routing hold reads. */
  const fresh = newUser(
    { name: 'N', email: 'n@b.c', password: 'secret', type: 'individual', acceptTerms: true },
    'u_new',
    '2026-08-30',
  );
  check('a new account has not been onboarded', fresh.onboardedAt === null);
  check('…and its profile is blank', profileGaps(fresh.profile!, fresh.email).length === 6);
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
    ['#business-cta', 'business'],
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

  /*
   * The sitemap is committed and generated, so it can be stale.
   *
   * `npm run build` regenerates it, which is what keeps a deploy honest — but a
   * route added and committed without a build leaves the file in the repository
   * disagreeing with the router, and the symptom is a page Google is never told
   * about. `resolveRoute(route, null) === route` is the same test the generator
   * uses to decide what is public, so this is checking the *output* against the
   * rule rather than restating the rule.
   *
   * `#/sign-in` is excluded there on purpose — a password field is not a search
   * result — so it is excluded here by the same name rather than by a second
   * judgement.
   */
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  for (const [route, path] of Object.entries(PATHS) as Array<[Route, string]>) {
    const isPublic = resolveRoute(route, null) === route && route !== 'signin';
    const listed = sitemap.includes(`<loc>https://new.pay-lez.com/${path}</loc>`);
    if (route === 'landing') {
      /* Its hash is `#top`, an anchor rather than a route, so the document
         itself is listed bare. */
      check('the sitemap lists the document itself',
        sitemap.includes('<loc>https://new.pay-lez.com/</loc>'));
      continue;
    }
    check(`the sitemap ${isPublic ? 'lists' : 'omits'} ${path}`, listed === isPublic,
      `${path} is ${isPublic ? 'public' : 'not public'} and is ${listed ? 'listed' : 'absent'}`);
  }
  /* And the namespace, because a sitemap with the wrong one is rejected whole
     by Search Console and looks like a 404 from the outside. */
  check('…in the schema Search Console reads',
    sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
}

console.log('\nlegal — five languages, one set of anchors');
{
  /*
   * `LegalText` catches a *missing field* on a translation and says nothing at
   * all about the ids inside the two arrays, which is where the damage would
   * be: the contents list is what a reader clicks, `ANCHOR_ROUTES` is what keeps
   * that click on the page, and a reader who switches language mid-document
   * keeps their place only because every language agrees about them. One
   * mistyped id in one translation is a dead link in one language — invisible in
   * a type check, invisible in English, and invisible to anybody who does not
   * read that language.
   *
   * Walked over `LANGUAGE_ORDER` rather than over a list written here, so a
   * sixth language is checked the moment it is added rather than the moment
   * somebody remembers this file.
   */
  const loaded = await Promise.all(
    LANGUAGE_ORDER.map(async (code) => [code, (await LEGAL[code]()).default] as const),
  );
  check('every language has a legal module', loaded.length === LANGUAGE_ORDER.length);

  const idsOf = (rows: Array<[string, string]>) => rows.map(([id]) => id).join(' ');
  const [, english] = loaded.find(([code]) => code === 'en')!;
  const privacyIds = idsOf(english.privacyContents);
  const termsIds = idsOf(english.termsContents);

  for (const [code, text] of loaded) {
    check(`${code} lists the same privacy sections, in order`,
      idsOf(text.privacyContents) === privacyIds);
    check(`${code} lists the same terms sections, in order`,
      idsOf(text.termsContents) === termsIds);
    /* A label is what the reader actually clicks. An id with an empty one is a
       row in the contents that cannot be seen or hit. */
    check(`…and every ${code} label says something`,
      [...text.privacyContents, ...text.termsContents].every(([, label]) => label.trim() !== ''));
  }

  /*
   * The other half of the same rule, and the one the prefix table exists for:
   * every anchor either document offers has to resolve back to its own page.
   * An id that misses `ANCHOR_ROUTES` resolves to `landing`, which drops a
   * reader onto marketing copy from the middle of a clause.
   */
  for (const [id] of [...english.privacyContents, ...english.termsContents]) {
    const expected = id.startsWith('privacy-') ? 'privacy' : 'terms';
    check(`#${id} stays on ${expected}`, routeOf(`#${id}`) === expected);
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

  /*
   * `flagGlyph` is the same conversion applied to a *prompt*, and it exists
   * because the server's flags bank stores the ISO code and derives the emoji
   * beside it — "storing the emoji as the prompt would put a rendering decision
   * in the database", which is right, and makes the conversion the client's job.
   * It was not being done: a signed-in flag round asked "which country is UZ?",
   * with the answer written on the front of the card.
   *
   * The pass-through half is not decoration. `flagOf` returns `''` for anything
   * that is not two characters, so a server that ever sent the emoji would draw
   * a blank question rather than a wrong one — which is the worse of the two.
   */
  check('a prompt that is an ISO code becomes the flag', flagGlyph('UZ') === flagOf('uz'));
  check('…and one that is already a flag is left alone', flagGlyph('🇺🇿') === '🇺🇿');
  check('…as is anything else a prompt might be', flagGlyph('Which country?') === 'Which country?');
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

console.log('\nthe wallet reads the server');
{
  /*
   * ── what this block used to check, and why it does not any more ──
   *
   * It checked a board of nine hot deals and a shelf of eight gift cards, both
   * written out in `content.ts`: that claiming moved a row from one list to the
   * other, that a stamp card rolled over, that a chip counted what it listed,
   * that `openNow` answered on the venue's own clock. Every one of those rules
   * was real; every one of them operated on data the site had invented, and all
   * of it is gone — the board is `GET /v1/deals`, the shelf is
   * `GET /v1/gift-cards`, and what somebody holds is `GET /v1/wallet`.
   *
   * So the checks moved with the arithmetic. What is left in `src/` that a
   * suite can hold to an invariant is the handful of pure functions that turn
   * those responses into a screen — the shelf ladder, the face-value formatter,
   * the category labeller — and those are what is checked here. They are not
   * decorative: each one has a failure mode that would put a wrong number or a
   * wrong currency in front of somebody.
   */

  /* A shelf, in the shape the server actually sends (`snake_case`, minor
     units, EUR unless a row says otherwise — checked against a running
     server). Built here rather than imported, because a fixture in a test is
     not data the product ships. */
  const shelf: GiftCardStock[] = [
    { id: 'gcs_a', brand: 'Media Expert', logo: 'M', face_minor: 465, currency: 'EUR', points_cost: 100, stock: 250, priority_only: 0 },
    { id: 'gcs_b', brand: 'Douglas', logo: 'D', face_minor: 698, currency: 'EUR', points_cost: 300, stock: 4, priority_only: 0 },
    { id: 'gcs_c', brand: 'Zalando', logo: 'Z', face_minor: 1163, currency: 'EUR', points_cost: 500, stock: 0, priority_only: 1 },
  ];

  /*
   * ── the ladder, and the two ways it is allowed to say nothing ──
   *
   * `cheapestCost` answers "what is enough", and the wallet's balance note, the
   * Play screen's stat and the result card all read it. `null` is the state
   * this whole pass exists to protect: with nothing stocked there is no price
   * to be short of, and the screens drop the line rather than print the 100
   * points that used to be written in `content.ts`.
   */
  check('the cheapest rung is the cheapest card', cheapestCost(shelf) === 100, String(cheapestCost(shelf)));
  check('an empty shelf has no cheapest', cheapestCost([]) === null);
  check('…which is not zero', cheapestCost([]) !== 0);

  /*
   * `nextRung` is what the points bar fills toward, and it has to be the
   * cheapest card *above* the balance rather than the cheapest overall —
   * otherwise the bar is full for every player past their first afternoon.
   */
  check('a new balance aims at the first rung', nextRung(shelf, 0) === 100);
  check('…a balance on a rung aims at the next', nextRung(shelf, 100) === 300, String(nextRung(shelf, 100)));
  check('…and one just under it still aims at it', nextRung(shelf, 299) === 300);
  /* Both reasons for "no rung" are the same answer, and the screen does the
     same thing with either: it draws no bar. */
  check('a balance past the top has no rung', nextRung(shelf, 9999) === null);
  check('…and neither does an empty shelf', nextRung([], 50) === null);

  /*
   * ── a face value is written in the card's own currency ──
   *
   * The one money rule on this site that runs the *other* way. Every price the
   * site quotes is euros converted for whoever is reading; a gift card is a
   * thing on a shelf, and a card a shop will honour for 50 zł is 50 zł to a
   * reader in London. Converting it is the bug this checks for, and it would be
   * invisible — the number would simply be wrong by an exchange rate.
   */
  check('a euro card is written in euros', faceValue(shelf[0], ' ') === '€4.65', faceValue(shelf[0], ' '));
  check(
    '…a złoty card in złoty, whoever is reading',
    faceValue({ face_minor: 5000, currency: 'PLN' }, ' ') === '50.00\u00a0zł',
    faceValue({ face_minor: 5000, currency: 'PLN' }, ' '),
  );
  /* The separator is the *reader's* — digit grouping belongs to the language,
     not to the currency being written (`i18n/fx.ts` declines to carry one for
     exactly this reason). */
  check(
    'the reader supplies the separator, not the currency',
    faceValue({ face_minor: 1234500, currency: 'PLN' }, ' ') === '12 345.00\u00a0zł' &&
      faceValue({ face_minor: 1234500, currency: 'PLN' }, ',') === '12,345.00\u00a0zł',
    faceValue({ face_minor: 1234500, currency: 'PLN' }, ','),
  );
  /* Soum has no minor unit, and a fractional soum is a number nobody can act
     on. `decimals` comes off the currency, not off the caller. */
  check(
    'a currency with no minor unit grows no decimals',
    faceValue({ face_minor: 5000000, currency: 'UZS' }, ' ') === "50 000\u00a0so'm",
    faceValue({ face_minor: 5000000, currency: 'UZS' }, ' '),
  );
  /* An unknown code falls back rather than throwing: the column is free text on
     the server, and a card nobody can price is worse than one priced in the
     platform's own unit. */
  check('an unknown currency still prices', faceValue({ face_minor: 100, currency: 'XXX' }, ' ') === '€1.00');

  /*
   * ── the deals path ──
   *
   * The board's request. A missing `limit` is what made the first version of
   * this return the server's default of 50 silently; the filters are optional
   * and must not appear as empty parameters, because `?city=` is a *filter on
   * the empty string* rather than no filter.
   */
  check('the board asks for a limit', dealsPath() === '/v1/deals?limit=50', dealsPath());
  check('…and carries a city when there is one', dealsPath({ city: 'Kraków' }).includes('city=Krak'));
  check('…and omits one when there is not', !dealsPath({ limit: 10 }).includes('city='));
  check('…and takes the limit it is given', dealsPath({ limit: 10 }) === '/v1/deals?limit=10');

  /*
   * ── a category is the server's word, and it may be a word this site has not
   *    got ──
   *
   * The board's chips used to be five categories written in `content.ts`
   * (Coffee, Food, Bakery, Services, Beauty) and a deal's category on the
   * server is the *venue's* taxonomy — `cafe`, `restaurant`, `hotels`. The two
   * never matched, so every chip would have been empty.
   *
   * **Two taxonomies reach `categoryLabel`.** The dashboard's drawer files a
   * deal by *offer kind* into the same column — `percentage`, `free_item` — so
   * both arrive here. The checks below used to assert that an id with no word
   * "prints itself", and that is what put the string `free_item` on a chip in
   * front of a customer. An operator reading a raw id knows what a row is; a
   * customer does not, and reads it as a typo.
   *
   * So the property is no longer "prints itself". It is that nothing reaches a
   * screen with an underscore in it, and that a kind gets its real word when the
   * caller has the words.
   */
  const names = en.listing.categories;
  check(
    'the taxonomy and its words are the same length',
    names.length === BUSINESS_CATEGORIES.length,
    `${names.length} words, ${BUSINESS_CATEGORIES.length} ids`,
  );
  check('a known category is translated', categoryLabel('cafe', names) === names[0], categoryLabel('cafe', names));
  check(
    '…every one of them, and none to undefined',
    BUSINESS_CATEGORIES.every((row, i) => categoryLabel(row.id, names) === names[i]),
  );
  /* `hotels` and `bakery` are on the server and are not in this site's listing
     form. Neither may render as `undefined` under a venue's name, and neither
     may arrive looking like a column name. */
  for (const [id, expected] of [
    ['hotels', 'Hotels'],
    ['bakery', 'Bakery'],
    ['something_new', 'Something new'],
  ] as const) {
    check(`an unknown category is readable (${id})`, categoryLabel(id, names) === expected,
      categoryLabel(id, names));
  }
  check(
    'nothing reaches a screen with an underscore in it',
    [...BUSINESS_CATEGORIES.map((r) => r.id), ...DEAL_KINDS, 'hotels', 'a_b_c'].every(
      (id) => !categoryLabel(id, names).includes('_'),
    ),
  );

  /* The offer kinds the drawer files a deal under. Given the drawer's own words
     they translate; given none they are still words. */
  const kinds = en.dashboard.drawer.deal.kinds;
  check('the kinds and their words are the same length', kinds.length === DEAL_KINDS.length,
    `${kinds.length} words, ${DEAL_KINDS.length} ids`);
  check(
    'an offer kind takes the drawer’s word for it',
    DEAL_KINDS.every((id, i) => categoryLabel(id, names, kinds) === kinds[i]),
    categoryLabel('free_item', names, kinds),
  );
  check(
    '…and is still readable without them',
    categoryLabel('free_item', names) === 'Free item',
    categoryLabel('free_item', names),
  );

  /* The tile letter. A venue with a blank name is a row the server will accept
     and a `''` in a circle is a hole in the layout. */
  check('a tile takes the initial', initialOf('Kawiarnia Bratysławska') === 'K');
  check('…upper-cased', initialOf('dubai cafe') === 'D');
  check('…and a nameless row still gets one', initialOf('   ') === '?' && initialOf('') === '?');

  /*
   * ── what a balance can reach ──
   *
   * The last piece of wallet arithmetic left in `auth/player.ts`, and it stays
   * because the catalogue has to decide whether a button is pressable *before*
   * it posts: a button you can press that always fails is worse than one that
   * says why it is dark.
   */
  const purse: PlayerState = { ...freshPlayer(), points: 300 };
  check('a balance covers what it covers', canAfford(purse, 300) && canAfford(purse, 100));
  check('…and not a penny more', !canAfford(purse, 301));
  check('an empty balance covers a free thing', canAfford(freshPlayer(), 0));

  /*
   * ── and a new player holds nothing ──
   *
   * `seedPlayer` is gone: it furnished a demo wallet with four gift cards off
   * the deleted catalogue, three stamp cards and a claimed deal. What a player
   * holds is the server's answer now, so the only local player state is the
   * mirror of `GET /v1/games/state` — and it starts empty.
   */
  const fresh = freshPlayer();
  check('a new player has no balance', fresh.points === 0);
  check('…and a full tank', fresh.energy === MAX_ENERGY);
  check(
    '…and holds nothing at all, because holdings are not stored here',
    !('vouchers' in fresh) && !('stamps' in fresh) && !('deals' in fresh),
    Object.keys(fresh).join(','),
  );
}

console.log('\nplaying');
{
  const day = (iso: string) => new Date(`${iso}T12:00:00`);
  const base = {
    ...freshPlayer(),
    points: 0,
    streak: 0,
    answered: 0,
    correct: 0,
    lastPlayed: null,
    /* No freeze. A freeze would absorb every lapse below — which is the freeze
       block's business, not this one's. */
    freezes: 0,
  };
  /* One point an answer, one for a clean sweep and two for doing it inside ten
     seconds, so a perfect fast round is eight. `perCorrect` comes from the game's
     own row and is 1 for all four quizzes — the 5/2/2/1 spread is what made
     Poland the worst-paying game on the page for exactly the same five
     questions. `seconds` is the whole round, first question to last answer. */
  const win = { game: 'brain' as const, correct: 5, total: 5, perCorrect: 1, seconds: 8 };

  const first = awardRound(base, win, day('2026-08-03'));
  check('a round scores per correct answer, the sweep and the clock',
    first.points === 8, `${first.points} pts`);
  check('a first round starts the streak', first.streak === 1);
  check('answered and correct both move', first.answered === 5 && first.correct === 5);
  /* **A win costs energy too.** It costs exactly what a loss costs, which is
     the whole of the change: the pool used to charge only the player who was
     losing, and two of the seven games cannot be lost at all, so it bounded a
     minority and decorated the screen for everybody else. */
  check('a won round spends one energy', first.energy === MAX_ENERGY - 1,
    `${first.energy} left`);

  const nextDay = awardRound(first, win, day('2026-08-04'));
  check('the next day continues the streak', nextDay.streak === 2);
  check('…and the balance carries', nextDay.points === 16, `${nextDay.points} pts`);

  const twice = awardRound(first, win, day('2026-08-03'));
  check('a second round the same day does not advance the streak', twice.streak === 1);
  /* But it pays what it scored, which is the rule that replaced the decay
     curve. That curve paid a repeat of the *same* game 100/60/40/20/0% and was
     the only brake there was when play was unlimited; energy is the brake now,
     and `player.ts` says at length why it must not come back — a result card
     that has to explain why the same five right answers paid ten and then four
     is explaining a rule the player never agreed to. This is the check that
     notices it coming back. */
  check('…and pays it exactly what the first one paid', twice.points === first.points * 2,
    `${twice.points} pts`);

  /* **A lapse no longer takes the balance.** It used to, and the backend
     deliberately never did — points are an auditable ledger there and a bad
     week is not a reason it recognises for a negative entry. The two halves of
     one product cannot disagree about that, so this half moved. The streak
     still resets; that is the whole punishment. */
  const lapsed = awardRound(first, win, day('2026-08-06'));
  check('missing the window resets the streak', lapsed.streak === 1);
  check('…and the balance survives it', lapsed.points === 16, `${lapsed.points} pts`);

  /* And a loss costs the same one, which is what makes the pips mean "rounds
     left" rather than "mistakes you are allowed". What makes charging fair at
     all is that energy comes back on a clock rather than at midnight, so an
     empty tank is a wait of hours and not a day. */
  const lost = awardRound(base, { ...win, correct: 2 }, day('2026-08-03'));
  check('a lost round spends the same one', lost.energy === MAX_ENERGY - 1, `${lost.energy} left`);
  check('…and still banks what was right', lost.points === 2, `${lost.points} pts`);
  check('a win and a loss cost exactly the same', first.energy === lost.energy);

  /*
   * Energy regenerates one at a time on a clock, not all at once at midnight.
   *
   * The old rule refilled the tank on a new calendar day and only when the Play
   * screen mounted, which made the wait wildly unfair by hour — empty it at
   * nine in the morning and you waited fifteen hours; empty it at nine at
   * night and you waited three — and never fired at all in a tab left open
   * past midnight.
   *
   * Counted from a stored anchor rather than a running timer: the same answer
   * with none of the moving parts, and it survives a closed laptop.
   */
  const hour = 3_600_000;
  const t0 = day('2026-08-03').getTime();
  const drained = { ...base, energy: 0, energyAt: t0 };
  const at = (ms: number) => energyOf(drained, new Date(t0 + ms));

  check('an empty tank is empty', at(0).count === 0, `${at(0).count}`);
  check('…and says when the next one lands', at(0).nextAt === t0 + ENERGY_REGEN_MINUTES * 60_000);
  check('nothing arrives before the interval is up', at(hour * 1.5).count === 0);
  check('one at two hours', at(hour * 2).count === 1, `${at(hour * 2).count}`);
  check('two at four', at(hour * 4).count === 2, `${at(hour * 4).count}`);
  check('three at six', at(hour * 6).count === 3, `${at(hour * 6).count}`);
  check('full at eight', at(hour * 8).count === MAX_ENERGY, `${at(hour * 8).count}`);
  /* And it stops there — a tank that kept counting would hand back a week of
     rounds to somebody returning from holiday. */
  check('and never overfills', at(hour * 200).count === MAX_ENERGY, `${at(hour * 200).count}`);
  check('a full tank has nothing to count down to', at(hour * 200).nextAt === null);

  /* A state saved before the anchor existed reads as a full tank, never as an
     empty one: punishing an existing player for a schema change is the one
     outcome that is clearly wrong. */
  /* Built by dropping the key rather than by casting to a bag of unknowns and
     deleting it: `energyAt` is *optional* on `PlayerState`, so a state that
     genuinely lacks it is a state the type already admits, and the rest pattern
     is what says so. The cast that used to be here asserted the fixture back
     into a type it had just been widened out of — which is a cast that can only
     ever succeed, over a shape nothing checked. */
  const { energyAt: _noAnchor, ...legacy } = base;
  check('a state with no anchor reads as a full tank',
    energyOf(legacy, new Date(t0)).count === MAX_ENERGY);

  /* And so does a state stored under the *old* field names, which is the same
     branch reached for a different reason: `lives` / `livesAt` were what this
     pair was called before the pool became energy, so a session saved by that
     build has neither field. It is whole again rather than empty, which is the
     forgiving direction and the only defensible one — the alternative charges a
     player for a rename they had no part in. */
  /* This one is not expressible as a `PlayerState` and must not be pretended
     into one: `energy` is required and `lives` is not a field at all. That is
     the whole fixture — it is not a state this build can *construct*, it is a
     state this build has to be able to *read*, so it is built the way it
     arrives, parsed out of storage. The round trip is the assertion: whatever
     survives `JSON` is what a session written by that build actually is. */
  const renamed = JSON.parse(
    JSON.stringify({ ...base, energy: undefined, energyAt: undefined, lives: 0, livesAt: t0 }),
  ) as PlayerState;
  check('a session stored under the old names reads as a full tank',
    energyOf(renamed, new Date(t0)).count === MAX_ENERGY);

  /*
   * **How big a day is, now that every round costs one.**
   *
   * The tank once, plus what the clock returns over twenty-four hours. It is
   * asserted rather than left as arithmetic in a comment because it is the
   * *whole* bound on a day: the decay curve that used to sit beside it is gone,
   * so if this number moves nothing else is left to notice.
   */
  const perDay = MAX_ENERGY + Math.floor(1440 / ENERGY_REGEN_MINUTES);
  check('a day is sixteen finished rounds from a full tank', perDay === 16, `${perDay}`);
  /*
   * And the payout does not know how many of them have been played. That is the
   * other half of "energy is the only limiter", and the half a reintroduced
   * curve would break first — a whole day of one game pays a flat rate.
   *
   * **The sixteen have to be played across the day rather than at one instant.**
   * They used to be handed the same `Date` sixteen times, which passed only
   * because a round on an empty tank still banked: four came out of the tank and
   * twelve were free. Practice rounds made that visible — twelve of the sixteen
   * now pay nothing — and the fixture was the thing that was wrong, because
   * sixteen rounds in one moment is not a day, it is a burst on a four-unit
   * tank. So the tank is emptied at noon and the remaining twelve are played one
   * per refill interval, which is what `perDay` has always *meant*.
   */
  const noon = day('2026-08-03').getTime();
  const regenMs = ENERGY_REGEN_MINUTES * 60_000;
  /* Annotated, because `base` is a literal whose `lastPlayed` narrows to `null`
     and the first award widens it to a date. */
  let allDay: PlayerState = base;
  for (let i = 0; i < MAX_ENERGY; i += 1) allDay = awardRound(allDay, win, new Date(noon));
  for (let i = 1; i <= perDay - MAX_ENERGY; i += 1) {
    allDay = awardRound(allDay, win, new Date(noon + i * regenMs));
  }
  check('…and every one of them pays the same as the first',
    allDay.points === first.points * perDay, `${allDay.points} pts over ${perDay} rounds`);

  /*
   * ── the seventeenth round ──
   *
   * Which is a *practice* round: the day's energy is gone and the screen offers
   * the round anyway rather than a locked door. What it must not do is pay, and
   * that is the whole of the rule — the account comes back byte for byte the
   * same, so nothing downstream has to know a practice round happened.
   *
   * Asserted on the state and not on the points alone, because "banks nothing"
   * has five parts and only one of them is the balance: the streak, the freezes,
   * the tallies and `lastPlayed` are the other four, and a rule that leaked into
   * any of them would make the tank optional rather than unpaid.
   */
  const overrun = awardRound(allDay, win, new Date(noon + (perDay - MAX_ENERGY) * regenMs));
  check('a round played on an empty tank pays nothing',
    overrun.points === allDay.points, `${overrun.points} pts`);
  check('…and changes nothing else about the account either',
    JSON.stringify(overrun) === JSON.stringify(allDay));
  /* And it costs nothing, which is the other half: a practice round that took
     the refill somebody was waiting for would be worse than the locked door. */
  check('…and leaves the refill clock exactly where it was',
    energyOf(overrun, new Date(noon)).nextAt === energyOf(allDay, new Date(noon)).nextAt);
}

console.log('\nplaying — streak freezes');
{
  const day = (iso: string) => new Date(`${iso}T12:00:00`);
  /* Twenty seconds, so the speed band pays nothing and the six points here are
     five answers plus the sweep. This block is about the streak; a fixture whose
     score moved with the clock would make every balance below a second thing to
     keep in step. */
  const win = { game: 'brain' as const, correct: 5, total: 5, perCorrect: 1, seconds: 20 };
  const held = (n: number) => ({
    ...freshPlayer(),
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
     the two have always been one rule.

     The 5th and not some later date: a freeze is worth exactly one missed day,
     so the day it covers is the 4th and the round has to land on the 5th. This
     fixture used to sit six days out and pass, which is the bug the length test
     in `awardPoints` closed — see the absence below. */
  const saved = awardRound(held(1), win, day('2026-08-05'));
  check('a freeze absorbs a missed window', saved.streak === 5, `streak ${saved.streak}`);
  check('…and the balance survives with it', saved.points === 106, `${saved.points} pts`);
  check('…and the freeze is spent', freezesOf(saved) === 0, `${freezesOf(saved)} held`);

  const unsaved = awardRound(held(0), win, day('2026-08-05'));
  check('without one, the streak still resets', unsaved.streak === 1);
  check('…and the balance survives anyway', unsaved.points === 106, `${unsaved.points} pts`);

  /* One day, and only one. "Lapsed" means no more than "not today and not
     yesterday", which a two-year absence satisfies exactly as a missed Tuesday
     does — so a freeze tested on that alone kept a returning player's whole
     balance and incremented a streak they had not been near for a year. All
     three are checked because the freeze protects all three. */
  const away = awardRound(held(1), win, day('2026-08-09'));
  check('a longer absence is not what a freeze covers', away.streak === 1,
    `streak ${away.streak}`);
  check('…and the balance survives even that', away.points === 106, `${away.points} pts`);
  check('…and the freeze is not spent on it', freezesOf(away) === 1,
    `${freezesOf(away)} held`);

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

  /* A session stored before the field existed. Optional on `PlayerState`, so
     the key is dropped rather than cast away — see the anchor fixture above. */
  const { freezes: _noneHeld, ...old } = held(0);
  check('a state with no freezes field reads as zero', freezesOf(old) === 0);
}

console.log('\nplaying — the week the streak draws');
{
  /*
   * `streakWeek` is the seven circles on the Play screen, and it is **derived**
   * — a `streak` of five ending on Thursday already says "Sunday through
   * Thursday", so the row reads that back rather than keeping a second history
   * beside it. Two records of one fact disagree the first time either is
   * written without the other, and the number printed next to those circles is
   * the one they would disagree with.
   *
   * Which makes this the block that owns the reading-back. Every case below is
   * a thing the row got wrong at some point on paper: a week that starts on
   * Sunday, a future day drawn as a missed one, a streak longer than the week
   * it is being drawn in, and a run that crosses a month end.
   */
  const at = (iso: string) => new Date(`${iso}T12:00:00`);
  const player = (streak: number, lastPlayed: string | null): PlayerState => ({
    ...freshPlayer(),
    streak,
    lastPlayed,
  });

  /* Wednesday 2026-08-05. */
  const week = streakWeek(player(3, '2026-08-05'), at('2026-08-05'));

  check('the week is seven days', week.length === 7, `${week.length}`);
  /* Monday first, in every language this site is read in. `getDay()` puts
     Sunday first and would have shifted the whole row by one. */
  check('…starting on Monday', week[0].date === '2026-08-03', week[0].date);
  check('…and ending on Sunday', week[6].date === '2026-08-09', week[6].date);
  check('…with the weekday index matching the position',
    week.every((day, i) => day.weekday === i));

  check('exactly one day is today', week.filter((day) => day.now).length === 1);
  check('…and it is the right one',
    week.find((day) => day.now)?.date === '2026-08-05');

  /* Three days ending today: Monday, Tuesday, Wednesday. */
  check('the streak fills backwards, covering exactly `streak` days',
    week.filter((day) => day.kept).length === 3,
    `${week.filter((day) => day.kept).length}`);
  check('…and ending on the day it was last played',
    week[2].kept && !week[3].kept);

  /*
   * A day that has not happened is `ahead`, not missed. Thursday onward on a
   * Wednesday is not a week already lost, and drawing it flat says it is — the
   * row would tell a player who has kept every single day so far that they have
   * missed four.
   */
  check('the rest of the week is still to come',
    week.slice(3).every((day) => day.ahead && !day.kept));
  check('…and nothing before today is', week.slice(0, 3).every((day) => !day.ahead));

  /* A genuine miss: played Monday, back on Wednesday, streak restarted. */
  const missed = streakWeek(player(1, '2026-08-05'), at('2026-08-05'));
  check('a missed day is neither kept nor ahead',
    !missed[0].kept && !missed[0].ahead && !missed[1].kept && !missed[1].ahead);

  /* A streak longer than the week it is drawn in fills the week and stops
     there — the row is seven circles, not a scrollbar. */
  const long = streakWeek(player(40, '2026-08-05'), at('2026-08-05'));
  check('a long streak fills every day up to today',
    long.slice(0, 3).every((day) => day.kept) && long.slice(3).every((day) => !day.kept));

  /*
   * A run that crosses a month end. The first day covered is computed by
   * walking a `Date` rather than by subtracting from the `YYYY-MM-DD` string,
   * and this is what says so: five days ending 2026-09-02 starts on 2026-08-29,
   * which string arithmetic would have put at 2026-09--2.
   */
  const across = streakWeek(player(5, '2026-09-02'), at('2026-09-02'));
  check('a run reaches back across a month end',
    across[0].date === '2026-08-31' && across[0].kept, across[0].date);

  /* A brand-new account has never played, so nothing is kept and nothing
     crashes on the `null`. */
  const fresh = streakWeek(player(0, null), at('2026-08-05'));
  check('a player who has never played keeps no days',
    fresh.every((day) => !day.kept));
  check('…and their week still has a today', fresh.filter((day) => day.now).length === 1);

  /*
   * A **live streak with no last day played** — `streak: 7`, `lastPlayed: null`.
   *
   * The app cannot produce it, because a finished round always writes
   * `lastPlayed`. Stored directories can and do: it is what `seededPlayer` wrote
   * before it started dating the seed, and one is sitting in the
   * `localStorage` of every device that has opened this site. Found on the
   * deployed build, where the demo account drew a great big 7 over seven empty
   * circles.
   *
   * It reads as ending **yesterday**, because that is the reading `awardPoints`
   * already gives it — `played === null` takes the same `continued` branch an
   * actual yesterday does. The row must not contradict the number beside it, and
   * the number is what the next round will act on.
   */
  const undated = streakWeek(player(7, null), at('2026-08-05'));
  check('a live streak with no last day played still fills its week',
    undated.filter((day) => day.kept).length > 0,
    `${undated.filter((day) => day.kept).length} kept`);
  check('…ending yesterday, which is where `awardPoints` already puts it',
    undated[1].kept && !undated[2].kept,
    undated.map((day) => (day.kept ? 'x' : '.')).join(''));
  check('…and today is left open rather than claimed',
    !undated.find((day) => day.now)?.kept);
  /* And a *dead* streak with no last day played keeps nothing, which is the
     genuinely new account and must not be swept into the same branch. */
  check('…while a zero streak with no last day played keeps nothing',
    streakWeek(player(0, null), at('2026-08-05')).every((day) => !day.kept));

  /* Sunday is the last circle, not the first. The off-by-one this guards is the
     one that only shows up one day in seven. */
  const sunday = streakWeek(player(1, '2026-08-09'), at('2026-08-09'));
  check('a Sunday is the seventh circle',
    sunday[6].now && sunday[6].kept && sunday[0].date === '2026-08-03');
}

console.log('\ncopy that quotes a constant');
{
  /*
   * The L-Earn FAQ says, in five languages, that it comes back "every four
   * hours, up to four".
   *
   * The two *figures* survived the rename — the interval and the ceiling did
   * not move — but the sentences around them still call the pool lives, and
   * `src/site/i18n/` is not this change's to edit. Both checks below are about
   * the numbers and neither reads the noun, so they hold either way; the copy
   * pass that renames the word has to leave "four hours" and "up to four"
   * where they are, and this is what will say so if it does not.
   *
   * Those two figures are written as **words**, not as holes, and that is
   * deliberate against the usual rule. Substituting a numeral where a word
   * stands breaks agreement in three of the five languages the moment the value
   * changes — Russian wants "часа" at four and "часов" at five, Polish
   * "godziny" against "godzin" — so a hole would trade a sentence that goes
   * stale for one that goes ungrammatical, and nothing would catch the second.
   *
   * This catches the first. If either constant moves, five strings move with
   * it, and this is the thing that says so.
   */
  check(`the FAQ line "every two hours" still matches the code`,
    ENERGY_REGEN_MINUTES === 120,
    `${ENERGY_REGEN_MINUTES} min · the copy says two hours`);
  check('…and its "up to four" still matches MAX_ENERGY',
    MAX_ENERGY === 4,
    `${MAX_ENERGY} · the copy says four`);

  /* And the copy really does still say it, so the check above cannot pass
     against a sentence that was quietly reworded. */
  const faq = en.learn.faq.items.map((item) => item.a).join(' ');
  check('…and the English FAQ still quotes both figures',
    /four hours/.test(faq) && /up to four/.test(faq));

  /*
   * The countdown beside the energy count is a **frame around a hole**, and the
   * hole is the only part of it that carries the number.
   *
   * `untilNextEnergy` writes the duration itself — "3h 12m", or "45m" under the
   * hour — out of `Intl.NumberFormat`, because units and their plurals belong to
   * the reader's language and the platform knows all five. What the dictionary
   * owns is the sentence around it. A translation that dropped `{time}` would
   * print "+1 in" beside a full battery and say nothing at all, which is the one
   * failure here that looks deliberate.
   */
  for (const code of LANGUAGE_ORDER) {
    check(`${code}'s energy countdown keeps its hole`,
      LANGUAGES[code].games.energyNext.includes('{time}'),
      LANGUAGES[code].games.energyNext);
  }
}

console.log('\nplaying — the two scored games');
{
  /*
   * Word Builder pays **the word's own tier**, and nothing else. The speed and
   * first-try terms are gone: between them they were worth twice the word, which
   * made the game a reflex test — which is what the other five already are.
   */
  check('a word is worth its tier', wordPoints({ tier: 1, hinted: false }) === 1,
    `${wordPoints({ tier: 1, hinted: false })} pts`);
  check('a medium word is worth two', wordPoints({ tier: 2, hinted: false }) === 2);
  check('a hard word is worth three', wordPoints({ tier: 3, hinted: false }) === 3);

  /*
   * **A hint halves the word**, where it used to forfeit the tier and leave a
   * base of one. That paid the same single point for a hinted three-letter word
   * and a hinted nine-letter one, which made the hint free on exactly the words
   * it should cost most on. Half of three is more than half of one, which is the
   * shape a hint should have.
   */
  check('a hint halves a hard word',
    wordPoints({ tier: 3, hinted: true }) === 1.5,
    `${wordPoints({ tier: 3, hinted: true })} pts`);
  check('…and halves an easy one too', wordPoints({ tier: 1, hinted: true }) === 0.5);
  check('no solved word is ever worth nothing', wordPoints({ tier: 1, hinted: true }) > 0);
  check('an out-of-range tier clamps', wordPoints({ tier: 9, hinted: false }) === 3);

  /*
   * The halves are resolved **once, over the round**, and that is the rule worth
   * a test of its own: flooring each word instead would charge the same hint
   * twice, and a round with three hinted words would lose a point and a half
   * rather than a half.
   */
  const ramp = [1, 1, 2, 2, 3].map((tier) => ({ tier, hinted: false }));
  check('a clean round pays the ramp plus the bonus',
    wordRoundPoints(ramp, true) === 10, `${wordRoundPoints(ramp, true)} pts`);
  check('…and without the sweep, just the ramp', wordRoundPoints(ramp, false) === 9);

  const hintedOnce = ramp.map((word, i) => (i === 4 ? { ...word, hinted: true } : word));
  check('one hint on the hardest word costs half of three',
    wordRoundPoints(hintedOnce, false) === 7,
    `${wordRoundPoints(hintedOnce, false)} pts`);

  /* Three halves in one round is 1.5 points of fraction; floored once that is a
     single point lost, not three. */
  const hintedThrice = ramp.map((word, i) => (i < 3 ? { ...word, hinted: true } : word));
  check('three halves floor once, not three times',
    wordRoundPoints(hintedThrice, false) === 7,
    `${wordRoundPoints(hintedThrice, false)} pts`);

  /*
   * Memory Match is scored on elapsed seconds and nothing else. It used to pay a
   * guaranteed 36 for six pairs that cannot be lost, which made it the richest
   * round on the page for the least asked of anybody.
   *
   * Both sides of a boundary are checked because the bands are **inclusive**
   * now — `throughSeconds` with a `<=` — and an off-by-one there is the
   * difference between a player's best board paying 8 and paying 6. The rename
   * was the fix: a field called `underSeconds` compared with `<=` is a trap
   * that survives every rewrite.
   */
  check('a fast board takes the top band', memoryPoints(10) === 8, `${memoryPoints(10)} pts`);
  check('…up to and including the boundary', memoryPoints(18) === 8);
  check('…and one second past it drops a band', memoryPoints(19) === 6);
  check('the middle band pays six', memoryPoints(22) === 6);
  check('…up to and including its own boundary', memoryPoints(23) === 6);
  check('past the last boundary pays the floor', memoryPoints(24) === 3);
  /* Finishing always pays something — that is what keeps the board the
     approachable one of the set now that it is measured rather than counted. */
  check('the floor is never nothing', memoryPoints(99_999) === 3);
  check('an instant board still scores', memoryPoints(0) === 8);
  check('a negative clock cannot pay more than the top band', memoryPoints(-5) === 8);
}

console.log('\nflying — scoring');
{
  const day = (iso: string) => new Date(`${iso}T12:00:00`);
  const base = {
    ...freshPlayer(),
    points: 0,
    streak: 0,
    answered: 0,
    correct: 0,
    lastPlayed: null,
    freezes: 0,
  };
  /* Five gaps banks the round and each pays one, so the bank line is worth 5
     and the ceiling is reached at twenty. The site and the server agree on
     both numbers now; they used to bank at 5 and 12 respectively. */
  /* Half a point a gap, which is what the row and `FLIGHT.perGap` both say. The
     halves are the reason every expectation below is a floor rather than a
     multiplication: five gaps earn two and a half and bank two. */
  const full = { game: 'flight' as const, cleared: 5, target: 5, perGap: 0.5, won: true };

  const cleared = awardFlight(base, full, day('2026-08-03'));
  check('a cleared flight pays half a point a gap', cleared.points === 2,
    `${cleared.points} pts`);
  check('a cleared flight spends one energy', cleared.energy === MAX_ENERGY - 1,
    `${cleared.energy} left`);

  const crash = awardFlight(base, { ...full, cleared: 3, won: false }, day('2026-08-03'));
  /* And a crash spends the same one. Squawk is the game where crashing *is* the
     mechanic, so it used to be the one that emptied the tank while the other six
     left it alone — which is exactly the asymmetry that went when every finished
     round started costing. Two hours a unit is what keeps three bad flights a
     wait you can sit out rather than the rest of the day. */
  check('a crashed flight spends the same one', crash.energy === MAX_ENERGY - 1,
    `${crash.energy} left`);
  /* Three gaps is a point and a half, and a point and a half banks one. The
     half is dropped, never rounded up — a gap that was not flown must not pay. */
  check('…and still banks the gaps flown, floored', crash.points === 1,
    `${crash.points} pts`);
  check('the whole round is charged to answered', crash.answered === 5, `${crash.answered}`);
  check('…and only the gaps flown count as correct', crash.correct === 3, `${crash.correct}`);

  /*
   * The load-bearing one. `awardFlight` delegates to `awardRound`, and this is
   * what asserts it never stops doing so — the streak window and the lapse are
   * stated in the FAQ and on the vouchers page, and a second implementation of
   * them is how one of the three quietly becomes a lie.
   */
  /* Six points each way: a clean five-question quiz answered in no hurry is
     5 + 1, and twelve gaps at half a point apiece is six. The two have to arrive
     at the same balance for the comparison below to be about the streak rather
     than about the scoring — which is the whole reason the numbers are chosen
     rather than convenient. */
  const quizArgs = { game: 'brain' as const, correct: 5, total: 5, perCorrect: 1, seconds: 20 };
  const tenGaps = { ...full, cleared: 12 };
  for (const [label, on] of [
    ['a fresh account', '2026-08-03'],
    ['the next day', '2026-08-04'],
    ['after a missed window', '2026-08-09'],
  ] as const) {
    const seeded = { ...base, streak: 4, points: 60, lastPlayed: '2026-08-03' };
    const byFlight = awardFlight(seeded, tenGaps, day(on));
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
  const long = awardFlight(base, { ...full, cleared: 15 }, day('2026-08-03'));
  check('gaps past the target still pay', long.points === 7, `${long.points} pts`);
  check('…while correct saturates at the target', long.correct === 5, `${long.correct}`);
  check('…and answered still counts one round', long.answered === 5, `${long.answered}`);
  check('…and it costs the one energy every finished round costs',
    long.energy === MAX_ENERGY - 1);

  check('the payout helper and the balance agree',
    flightPoints(15, 0.5) === 7 && bankableGaps(15) === 15);
  /* An even gap count has no half to lose, which is the other side of the same
     rule and the one a reader checks the first against. */
  check('…and an even count loses nothing', flightPoints(16, 0.5) === 8);
  /* The ceiling, which is the whole reason the old 99-gap clamp is gone: one
     lucky run used to be worth four days of every other game on the page. */
  check('a long flight stops at the ceiling', flightPoints(80, 0.5) === MAX_FLIGHT_POINTS,
    `${flightPoints(80, 0.5)} pts`);

  /* What `awardFlight` owns on top: a score that arrived from a rAF loop. */
  const absurd = awardFlight(base, { ...full, cleared: 10_000 }, day('2026-08-03'));
  check('an impossible score is capped', absurd.points === MAX_FLIGHT_POINTS,
    `${absurd.points} pts`);

  /* A `won` the client claims but the gap count does not support is recorded as
     the loss it was. The flag no longer decides what the round costs — both
     sides pay one — so what it still buys a modified client is the streak, the
     accuracy column and the word on the result card, and it is still worth
     refusing: the flight reports a single integer and posts no moves, so this
     is the only claim in the game nothing else can check. */
  const fake = awardFlight(base, { ...full, cleared: 4, won: true }, day('2026-08-03'));
  check('a win that did not reach the target is a loss',
    flightAward({ ...full, cleared: 4, won: true }).won === false);
  check('…and is charged the same energy either way', fake.energy === MAX_ENERGY - 1,
    `${fake.energy} left`);

  const fractional = awardFlight(base, { ...full, cleared: 3.9, won: false }, day('2026-08-03'));
  /* 3.9 gaps is three whole ones, and three halves is one and a half, which
     banks one. Two floors on one round, and they are both right: the gap count
     floors because half a gap was not crossed, and the payout floors because
     half a point cannot be paid. */
  check('a fractional score floors twice, correctly', fractional.points === 1,
    `${fractional.points} pts`);

  const negative = awardFlight(base, { ...full, cleared: -2, won: false }, day('2026-08-03'));
  check('a negative score clamps to nothing', negative.points === 0 && negative.correct === 0);

  /* A lapse resets the streak and leaves the balance alone, so the change in
     balance *is* what the round paid — which it was not before. */
  const lapsedFlight = awardFlight(
    { ...base, points: 900, streak: 5, lastPlayed: '2026-07-20', freezes: 0 },
    { ...full, cleared: 5, won: false },
    day('2026-08-03'),
  );
  check('a lapsed flight still reports what it earned',
    lapsedFlight.points === 902 && flightPoints(5, 0.5) === 2,
    `balance ${lapsedFlight.points}, earned ${flightPoints(5, 0.5)}`);
}

console.log('\nplaying — a quiz cannot be lost, and a fast one pays more');
{
  const day = () => new Date('2026-08-03T12:00:00');
  const base = {
    ...freshPlayer(),
    points: 0,
    streak: 0,
    answered: 0,
    correct: 0,
    lastPlayed: null,
    freezes: 0,
  };
  const round = (correct: number, seconds: number) =>
    quizAward({ game: 'brain' as const, correct, total: 5, perCorrect: 1, seconds });

  /*
   * **The mistake allowance is gone**, and this is the block that says so.
   *
   * A quiz used to end at the second wrong answer, which closed a round the
   * player had paid energy for and left three questions they never saw — a fail
   * state on a game whose whole promise is "answer five things". Four wrong
   * answers now bank the fifth right one, and nothing about the round is
   * "lost": `won` means the clean sweep, because that is the only distinction
   * left that means anything and it is the one the bonuses are paid on.
   */
  check('a round with four mistakes still banks what it earned',
    round(1, 30).points === 1, `${round(1, 30).points} pts`);
  check('…and answers all five either way', round(1, 30).answered === 5);
  check('…and is not a win', round(1, 30).won === false);
  check('a round with none right pays nothing and still costs the round',
    round(0, 30).points === 0 && round(0, 30).answered === 5);

  /*
   * The sweep and the clock, which are only ever earned together.
   *
   * Five answers, one for the sweep, two for doing it inside ten seconds: eight
   * is the most a quiz can pay and it takes both. The bands are checked on both
   * sides of each boundary because they are inclusive — `throughSeconds` with a
   * `<=` — and an off-by-one there is a player's best round quietly paying one
   * less than the card promised.
   */
  check('a clean sweep adds the perfect bonus', round(5, 30).points === 6,
    `${round(5, 30).points} pts`);
  check('…and the fastest band takes it to eight', round(5, 4).points === 8,
    `${round(5, 4).points} pts`);
  check('…up to and including ten seconds', round(5, 10).points === 8);
  check('…eleven seconds drops to the middle band', round(5, 11).points === 7);
  check('…up to and including fifteen', round(5, 15).points === 7);
  check('…and sixteen earns the sweep alone', round(5, 16).points === 6);

  /* Speed alone is worth nothing, which is the rule that stops the fastest way
     to earn from being five deliberate wrong answers hammered out in two
     seconds. */
  check('four right in two seconds beats nobody', round(4, 2).points === 4,
    `${round(4, 2).points} pts`);
  check('…and a clean sweep at any speed still beats it', round(5, 99).points === 6);

  /* The bands read directly, so a table edited without the function moving is a
     failure here rather than a surprise on a result card. */
  check('the speed bands are what the table says',
    quizSpeedBonus(0) === 2 && quizSpeedBonus(12) === 1 && quizSpeedBonus(600) === 0);
  check('a negative clock cannot pay more than the top band', quizSpeedBonus(-5) === 2);

  const banked = awardRound(base, { game: 'brain', correct: 5, total: 5, perCorrect: 1, seconds: 4 }, day());
  check('and the balance carries the whole eight', banked.points === 8,
    `${banked.points} pts`);
}

console.log('\nflying — the difficulty ramp');
{
  /*
   * The scroll accelerates as a run goes on, and then stops accelerating.
   *
   * The ceiling matters more than the rate: an unbounded ramp turns every long
   * run into the same run, ending the instant the scroll passes what a hand can
   * answer, and the skill it measures stops being flying and becomes reaction
   * time. Doubling and holding leaves a good run genuinely open-ended.
   *
   * Linear on the **base**, not compounding — four steps of a quarter is exactly
   * double, and a reader can check that against the config without a calculator.
   */
  const base = FLIGHT.pipe.speed;
  check('a run starts at the base speed', speedAt(0) === base, `${speedAt(0)}`);
  check('…and holds it until the first step', speedAt(9.9) === base);
  check('the first step is a quarter more', speedAt(10) === base * 1.25, `${speedAt(10)}`);
  check('…and they keep coming', speedAt(20) === base * 1.5 && speedAt(30) === base * 1.75);
  check('four steps is exactly double', speedAt(40) === base * 2, `${speedAt(40)}`);

  /* The freeze. Fifty seconds in and beyond, the world stops getting faster —
     this is the check that keeps a long flight from becoming unplayable rather
     than merely hard. */
  check('it stops climbing at fifty seconds', speedAt(50) === base * 2, `${speedAt(50)}`);
  check('…and stays there for as long as the run lasts',
    speedAt(300) === base * 2 && speedAt(86_400) === base * 2);
  check('a negative clock is still the base speed', speedAt(-10) === base);

  /* The columns keep arriving on the same beat however fast the world moves —
     `interval` is a time, not a distance — which is what keeps the altitude
     available between two gates the same at the end of a run as at the start,
     and that is the assumption `maxStep` is written against. */
  check('the gate cadence is a time, not a distance',
    FLIGHT.pipe.interval === 1.75 && FLIGHT.pipe.ramp.steps * FLIGHT.pipe.ramp.step === 1);
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
  /*
   * `slop` is how imprecise the pilot is, in world units of aim error and in
   * frames of reaction delay. Zero is the ideal pilot — a rule follower with
   * perfect timing — and it is the right thing to ask "is this game beatable?"
   *
   * It is the wrong thing to ask "can this game still kill?". Once the hole is
   * wide enough, a pilot that never mistimes a flap simply never dies, and the
   * check reads as "too easy" when what it has actually measured is that the
   * simulation has no hands. A human misses by a few units and a few frames;
   * that is the failure mode the game has to punish, so that is what the
   * killable check flies.
   */
  const play = (seed: number, frames: number, slop = 0) => {
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
      /* The aim error is redrawn from the same LCG, so a seeded course is
         still exactly reproducible — a flaky physics test is worse than none. */
      const wobble = slop === 0 ? 0 : (next() - 0.5) * 2 * slop;
      const delay = slop === 0 ? 6 : 6 + Math.floor(slop);
      const aim = (ahead ? ahead.gapY : FLIGHT.worldHeight / 2) + wobble;
      const arc = (FLIGHT.flap * FLIGHT.flap) / (2 * FLIGHT.gravity);
      if (bird.vy > 0 && bird.y > aim + arc / 2 && i - lastFlap >= delay) {
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
   * Too easy and there is no game; too hard and the bank line is an energy
   * shredder — though less so than it was: every round costs one now whether it
   * is flown well or badly, so a hard bank line costs points rather than the
   * tank. The original is famously brutal, so the bar is not
   * "always survives" — it is that a plain rule-following pilot banks a round
   * most of the time and still, eventually, dies.
   */
  check(`a simple pilot banks the ${target}-gap round on most courses`,
    reached >= Math.ceil(runs.length * 0.6), `${reached} of ${runs.length}: ${scores.join(', ')}`);
  check('…and its median run is past the bank line', median >= target,
    `median ${median}`);
  /*
   * Killability is measured on a pilot with hands. The precise one above no
   * longer dies at all, and that is not the game being broken — the hole was
   * widened and the scroll slowed on purpose, so a player who times every flap
   * correctly *should* be able to fly indefinitely. What must still be true is
   * that being a few units and a few frames out kills you, because that is the
   * only thing standing between this and an idle animation.
   */
  const sloppy = [1, 7, 42, 1337, 90210, 555, 8675309, 31337].map((seed) =>
    play(seed, 60 * 120, 6));
  const crashed = sloppy.filter((r) => !r.survived).length;
  check('…but an imprecise pilot still dies, so the game can kill',
    crashed > 0, `${crashed} of ${sloppy.length} crashed`);
  check('…and the courses differ, so that is not one lucky seed',
    new Set(sloppy.map((r) => r.cleared)).size > 2,
    sloppy.map((r) => r.cleared).join(', '));

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
   * The ratio that shapes the game, and the band has now been moved twice — in
   * opposite directions, for reasons worth keeping.
   *
   * It began as `apex < 0.6 * gap`, a fairness rule on the reasoning that a flap
   * crossing the whole hole leaves no room to correct. That was raised to a
   * 0.45–0.65 band around the original's 0.54, because at 0.54 a single flap
   * *nearly overshoots* and the game becomes a constant correction rather than
   * a glide — which is what makes the original the original.
   *
   * It is now 0.30–0.45, and that is a deliberate departure rather than drift.
   * At 0.54 the apex was 1.05× the gap's half-height, so a flap taken in the
   * middle of the hole clipped the roof and the only way to fly was to fall
   * below centre first — a technique nothing teaches and few players find. The
   * game sits behind a reward here, and one nobody clears five gaps on pays
   * nothing at all.
   *
   * The floor is still the load-bearing half: below 0.30 the bird is floaty and
   * the hole stops mattering. What replaces the old ceiling as the guard
   * against "too easy" is the imprecise pilot above — a rule follower with
   * perfect timing is *meant* to be able to fly this forever now.
   */
  const ratio = apex / FLIGHT.pipe.gap;
  check('one flap covers about a third of the gap, so the obvious play works',
    ratio > 0.3 && ratio < 0.45, `${ratio.toFixed(2)} (the original ≈ 0.54)`);
  /* The number that actually decides whether a centred flap is survivable. */
  check('…and a flap from the middle of the hole does not clip the roof',
    apex < FLIGHT.pipe.gap / 2, `apex ${apex.toFixed(1)} vs half-gap ${(FLIGHT.pipe.gap / 2).toFixed(1)}`);

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

console.log('\nthe local quiz follows the profile, not the language');
{
  /*
   * The local-knowledge card is the one game whose **content** depends on where
   * the player says they live rather than on which of five languages they read.
   * An Uzbek speaker in Kraków is asked about Poland, in Uzbek; a Pole in
   * Tashkent is asked about Uzbekistan, in Polish. Those are two different axes
   * and this block is what keeps them from being collapsed into one.
   */
  check('a Polish profile gets the Poland bank', quizBankFor('PL') === 'poland');
  check('an Uzbek profile gets the Uzbekistan bank', quizBankFor('UZ') === 'uzbekistan');
  /* Folded the way every other country lookup on the site folds: the profile
     accepts a *typed* country when the city was not on the served list, so what
     arrives here is only usually a code. */
  check('…however the code was typed', quizBankFor('uz') === 'uzbekistan'
    && quizBankFor(' Uz ') === 'uzbekistan');
  /* Poland is the fallback and it is a real answer, not a shrug: this site is a
     guide to having moved to Poland. */
  check('a country with no bank falls back to the market', quizBankFor('DE') === 'poland');
  check('…and so does an empty profile',
    quizBankFor('') === 'poland' && quizBankFor(undefined) === 'poland');
  check('a country name rather than a code is not a code',
    quizBankFor('Uzbekistan') === 'poland');

  /* The country and the bank are one fold, not two — three things key off the
     country (the bank, the card's name, the hover sample) and a second
     resolution is a second place for them to disagree. */
  check('the country and the bank resolve together',
    LOCAL_COUNTRIES.every((code) => quizBankFor(code) === QUIZ_BANK_FOR_COUNTRY[quizCountryFor(code)]));

  /*
   * Every language has to name every country's quiz and preview one of its
   * questions. `Dictionary` catches a missing *key* but says nothing about a
   * missing entry in a map keyed by country — a fourth country would render a
   * blank card in four languages and typecheck perfectly.
   */
  for (const code of LANGUAGE_ORDER) {
    const games = LANGUAGES[code].games;
    check(`${code} names every local quiz`,
      LOCAL_COUNTRIES.every((country) => (games.localQuiz[country] ?? '').trim().length > 0),
      LOCAL_COUNTRIES.map((c) => games.localQuiz[c]).join(' · '));
    check(`${code} previews every local quiz`,
      LOCAL_COUNTRIES.every((country) => {
        const sample = games.preview.local[country];
        return sample && sample.q.trim().length > 0
          && sample.options.length === 3
          && sample.options.every((option) => option.trim().length > 0);
      }));
  }

  /*
   * The bank itself. Built by `npm run banks` from the export in `updates/`, and
   * read here off disk rather than imported, because what the check is about is
   * the file the game will actually fetch.
   */
  const bank = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`../src/site/games/data/${name}`, import.meta.url), 'utf8'));

  const meta = bank('uzbekistan.meta.json') as { a: number[] };
  check('the Uzbekistan bank was built', meta.a.length > 0, `${meta.a.length} questions`);

  for (const code of LANGUAGE_ORDER) {
    const rows = bank(`uzbekistan.${code}.json`) as string[][];
    check(`…and carries all of it in ${code}`, rows.length === meta.a.length,
      `${rows.length} of ${meta.a.length}`);
    check(`…as a prompt and four options`, rows.every((row) => row.length === 5));
    check(`…with nothing blank`,
      rows.every((row) => row.every((cell) => cell.trim().length > 0)));
  }

  /*
   * The stored answer is index 0 on every row of this export, which is only
   * harmless because `buildQuizRound` shuffles the options at play time. If that
   * shuffle ever goes, this bank becomes "always press the first button" — so
   * the shuffle is the thing under test, not the export.
   */
  check('the export answers in one position…', meta.a.every((a) => a === 0));
  const shuffled = new Set<number>();
  for (let seed = 0; seed < 40; seed += 1) {
    const order = shuffledRange(4);
    shuffled.add(order.indexOf(0));
  }
  check('…which is why the round shuffles them', shuffled.size > 1,
    `answer landed in ${shuffled.size} of 4 positions`);

  /*
   * **Every question in every bank offers the same number of answers.**
   *
   * A question with two buttons instead of four is not a harder question, it is
   * a cheaper one: it pays the same point for a coin flip, and it is
   * conspicuous to the player in a way no log line notices. The server's own
   * bank had exactly that defect — `pickDistractors` in `server/db/import.ts`
   * walked its candidate pool with a stride that shared a factor with the pool
   * size, so 14 of the 196 flags and 14 of the 196 capitals came back short —
   * and the reason to check it *here* is that the two banks are built by two
   * different generators from the same exports. This one is
   * `scripts/build-question-banks.mjs`; the defect it would have is its own.
   *
   * Capitals is the exception and is checked for what it actually is: the export
   * is a country → capital table with no wrong answers in it, so a row is a
   * pair and the distractors are drawn at play time by `buildCapitalRound`.
   * What is checked there is that the continent it groups on is present on
   * every row, because the grouping is what keeps the round a test rather than
   * a formality.
   */
  const OPTIONS = 4;
  for (const name of ['flags', 'general', 'poland', 'uzbekistan'] as const) {
    /* The flags bank stores the options alone (the prompt is the ISO code, kept
       in the meta), the three quiz banks store the prompt in front of them. */
    const width = name === 'flags' ? OPTIONS : OPTIONS + 1;
    for (const code of LANGUAGE_ORDER) {
      const rows = bank(`${name}.${code}.json`) as string[][];
      const short = rows.filter((row) => row.length !== width);
      check(`every ${name}.${code} question offers ${OPTIONS} answers`, short.length === 0,
        `${short.length} of ${rows.length} rows are not ${width} wide`);
      const blank = rows.filter((row) => row.some((cell) => cell.trim().length === 0));
      check(`…and none of them is blank`, blank.length === 0, `${blank.length} rows`);
      /*
       * **A duplicated option is the same failure wearing four buttons**: two
       * of them are the same word, so the question is a three-way guess and one
       * of the presses is arbitrarily wrong.
       *
       * It is not asserted to zero, because it is **upstream and real**: the
       * exports are translated per language, and two different English
       * distractors can land on one word — "Как называется группа ворон?"
       * offers `Стая`, `Стая`, `Убийство`, `Группа`. Twelve rows across the
       * Russian and Uzbek general bank are like this, and the files in
       * `updates/` are hand-delivered material rather than something this
       * repository edits.
       *
       * So what is checked is the thing that is actually in our control:
       * `isAskable` rejects them, `buildQuizRound` draws past them, and
       * **filtering still leaves a bank big enough to play**. A defect that
       * grew until it ate a bank would fail here; one that stays at twelve rows
       * in ten thousand is reported and lived with.
       */
      const options = (row: string[]) => (name === 'flags' ? row : row.slice(1));
      const askable = rows.filter((row) => isAskable(options(row)));
      check(`…and filtering ${name}.${code} leaves a bank worth playing`,
        askable.length >= Math.max(20, Math.floor(rows.length * 0.95)),
        `${askable.length} of ${rows.length} askable`);
      check(`…with every unaskable row genuinely unaskable`,
        rows.every((row) => isAskable(options(row)) || new Set(options(row)).size !== options(row).length),
        'a row was rejected for something other than a repeated option');
    }
  }

  const capitalsMeta = bank('capitals.meta.json') as { continent: string[] };
  for (const code of LANGUAGE_ORDER) {
    const rows = bank(`capitals.${code}.json`) as string[][];
    check(`every capitals.${code} row is a country and its capital`,
      rows.every((row) => row.length === 2 && row.every((cell) => cell.trim().length > 0)));
    check(`…and carries a continent to draw distractors from`,
      capitalsMeta.continent.length === rows.length
        && capitalsMeta.continent.every((value) => value.trim().length > 0));
  }
}

console.log("\ntoday's list - one prompt per seeded task, in five languages");
{
  /*
   * The rotating daily-task panel reads its sentence from
   * `copy.games.tasks[copyKey]`, where `copyKey` comes from the **server's**
   * `daily_tasks` table. That is a lookup across a boundary, and a lookup that
   * misses is the failure this repo has already shipped twice: the dashboard's
   * findings panel printed `quiet hours` and a customer status rendered its own
   * raw id, both because a miss fell through to the key.
   *
   * `Dictionary` cannot catch it - every language having *a* `tasks` block is
   * all the type system knows about a set of keys chosen on the server. So the
   * seed list is read out of `domain/settings.ts` and every key it names is
   * required in all five dictionaries.
   *
   * Read from the source text rather than imported, because `settings.ts` is
   * server code: importing it pulls `node:sqlite` into a Vite module graph for
   * the sake of four strings.
   */
  const settings = readFileSync(
    new URL('../server/domain/settings.ts', import.meta.url),
    'utf8',
  );
  const seeded = [...settings.matchAll(/\{ key: '[a-z_]+', copyKey: '([A-Za-z]+)'/g)].map(
    (match) => match[1],
  );
  check('the server seeds some daily tasks', seeded.length >= 4, seeded.join(', '));

  for (const code of LANGUAGE_ORDER) {
    const tasks = LANGUAGES[code].games.tasks as unknown as Record<string, string | undefined>;
    for (const key of seeded) {
      check(`${code} has a prompt for the ${key} task`,
        typeof tasks[key] === 'string' && (tasks[key] ?? '').trim().length > 0);
      /* And it carries the hole the figure goes in. A prompt with no `{reward}`
         renders a nudge with no number in it, which is the one thing these
         sentences are for - and it is invisible in the language nobody on the
         team reads. */
      check(`…with the reward hole in it`, (tasks[key] ?? '').includes('{reward}'));
    }
    /* The two noun phrases that go in that hole, and `{points}` in both. `upTo`
       is not optional: a game round pays what the round scored, and without it
       the panel promises a ceiling nobody guaranteed. */
    for (const key of ['exact', 'upTo'] as const) {
      check(`${code} says how a ${key} reward reads`,
        (tasks[key] ?? '').includes('{points}'), tasks[key]);
    }
    /* Three empty states and they must be three different sentences: "the list
       is done" is a good day, "we are loading" is a moment, and "the server did
       not answer" is neither - and a panel that renders the third as the first
       congratulates somebody for a failed request. */
    const empties = ['allDone', 'loading', 'offline'].map((key) => tasks[key]);
    check(`${code} keeps the three empty states apart`,
      new Set(empties).size === 3 && empties.every((value) => (value ?? '').trim().length > 0),
      empties.join(' | '));
  }
}

console.log('\nthe card previews show real game content');
{
  /*
   * A hovered card plays a **working miniature of its own round**, and the
   * whole claim it makes is that what you are looking at is the game.
   *
   * That claim is one edit away from being false at any time. `PREVIEW` in
   * `content.ts` copies three cards out of a deck and one row out of each word
   * list rather than pulling 3.5 kB and two 5.4 kB files into the main bundle
   * for a decoration — a copy is the right trade there, and it is also the kind
   * of copy that is true on the day it is typed and quietly wrong a fortnight
   * later. This block reads the real files and holds it to it.
   *
   * `readFileSync` rather than an `import` of the JSON, so the test reads what
   * is actually on disk — which is the thing the claim is about.
   */
  const dataFile = (name: string): unknown =>
    JSON.parse(
      readFileSync(new URL(`../src/site/games/data/${name}`, import.meta.url), 'utf8'),
    );

  const decks = dataFile('decks.json') as Array<{
    pairs: Array<{ icon: string; label: string }>;
  }>;
  const inDecks = new Set(
    decks.flatMap((deck) => deck.pairs.map((pair) => `${pair.icon}|${pair.label}`)),
  );

  for (const card of PREVIEW.memory) {
    check(`the memory preview's ${card.label} is a real deck card`,
      inDecks.has(`${card.icon}|${card.label}`), `${card.icon} ${card.label}`);
  }
  /* Three *different* cards, and it is worth asserting: the board draws six
     tiles as three pairs, and a duplicate would quietly make it two pairs and a
     lie. The board in `preview.tsx` is `[0, 1, 2, 1, 0, 2]`, which only indexes
     safely while there are exactly three. */
  check('…and the three are three',
    new Set(PREVIEW.memory.map((card) => card.label)).size === 3
      && PREVIEW.memory.length === 3);

  for (const list of ['en', 'pl'] as const) {
    const rows = dataFile(`words.${list}.json`) as Array<[string, string, number]>;
    const row = PREVIEW.word[list];
    const real = rows.find((entry) => entry[0] === row.word);
    check(`the ${list} word preview builds a real word`, real !== undefined, row.word);
    check(`…carrying that word's own hint`, real?.[1] === row.hint, row.hint);
  }
  /* The two cards must not preview the same word: they are two rows of `GAMES`
     precisely because they deal two different lists, and a catalogue that
     previewed one word twice would be arguing against itself. */
  /* Widened on the way in, because `PREVIEW` is `as const`: with two different
     literals TypeScript calls the comparison unintentional and refuses to
     compile it, and with two identical ones it compiles and this fires. The
     cast keeps the check that matters and drops the one the compiler already
     owns. */
  check('…and the two lists preview different words',
    (PREVIEW.word.en.word as string) !== PREVIEW.word.pl.word);

  /* The flag is built from the code rather than fetched — `flagOf` turns two
     letters into the two regional indicators the self-hosted font draws. A
     malformed code renders as nothing at all, which on a card whose whole
     subject is the flag is the one failure worth a check. */
  check('the flag preview shows a real flag',
    flagOf(PREVIEW.flagCode).length === 4,
    `${PREVIEW.flagCode} → ${flagOf(PREVIEW.flagCode)}`);

  /*
   * Every language answers, and answers with the same number of chips.
   *
   * `options[0]` is the right answer **by position** — the preview lights the
   * first one and there is no second field naming it — so a translation that
   * reordered the options would mark the wrong answer correct with nothing to
   * notice it. That one needs a reader. What a test can hold is the shape: a
   * set that changed size is the same edit half-done.
   */
  for (const code of LANGUAGE_ORDER) {
    const dict = LANGUAGES[code];
    const preview = dict.games.preview;

    check(`${code} previews three countries`, preview.flag.length === 3);
    check(`${code} previews three capitals`, preview.capital.options.length === 3);
    check(`${code} previews three answers on both quizzes`,
      preview.brain.options.length === 3
        && LOCAL_COUNTRIES.every((country) => preview.local[country].options.length === 3));

    /* The capital preview asks with the round's own prompt, so the country has
       to be a hole that prompt actually has — otherwise the card asks a
       question with a `{country}` printed in it. */
    check(`${code}'s capital preview fills the round's own question`,
      dict.games.whichCapital.includes('{country}')
        && fill(dict.games.whichCapital, { country: preview.capital.country })
          .includes(preview.capital.country));

    /* Nothing may be blank: an empty chip is a card advertising a round with a
       missing answer in it. */
    check(`${code} leaves nothing blank`,
      [
        ...preview.flag,
        ...preview.capital.options,
        ...preview.brain.options,
        ...LOCAL_COUNTRIES.flatMap((country) => preview.local[country].options),
        preview.brain.q,
        ...LOCAL_COUNTRIES.map((country) => preview.local[country].q),
        preview.capital.country,
      ].every((text) => text.trim().length > 0));
  }
}

console.log('\none sentence, one line — the headline cap');
{
  /*
   * `site.css` keeps each hero sentence on a single line by capping the
   * headline's font size against three things: the column's own width
   * (`100cqi`), the face's character advance, and **how many characters the
   * longest sentence has**. The first two live in the stylesheet; the third
   * cannot, because it is a different number in each of five languages and on
   * each of six heroes — 20 in English on Relocate, 17 in Uzbek, 25 in Russian
   * on the landing page.
   *
   * So `longestLine` measures the real copy at render, and what is checked here
   * is that it measures it *correctly* for every string the site actually
   * ships. A count that came back low would not fail a build or throw — it
   * would quietly let a headline wrap in one language, which is exactly the bug
   * this whole mechanism exists to fix.
   *
   * The wrapping itself is verified where it has to be, in a browser: the
   * headless sweep over seven routes, five languages and nine widths in both
   * themes. This is the arithmetic under it.
   */
  const HEROES: Array<[string, (d: (typeof LANGUAGES)[LanguageCode]) => readonly string[]]> = [
    ['landing', (d) => d.hero.lines],
    ['l-earn', (d) => d.learn.hero.lines],
    ['analytics', (d) => d.analytics.hero.lines],
    ['business', (d) => d.business.hero.lines],
    ['vouchers', (d) => d.vouchers.hero.lines],
    ['relocate', (d) => d.relocate.hero.lines],
  ];

  for (const [name, pick] of HEROES) {
    for (const code of LANGUAGE_ORDER) {
      const lines = pick(LANGUAGES[code]);
      const longest = longestLine(lines);
      /* Every hero has copy, and the cap divides by this number: a zero would
         collapse the headline to nothing. `lineCap` returns `undefined` rather
         than publishing one, and this is the check that the case never
         arises. */
      check(`${name}/${code} has a longest line`, longest > 0, String(longest));
      check(`…and it is the longest one`,
        longest === Math.max(...lines.map((line) => [...line.trim()].length)),
        `${longest} vs ${lines.map((line) => line.length).join(',')}`);
      /* Counted in characters, not UTF-16 code units. None of the current copy
         has an astral character in it; the next translation might, and the
         failure would be a headline shrunk for a glyph that is one wide. */
      check(`…counted in characters`,
        longest === Math.max(...lines.map((line) => [...line.trim()].length)));
      /* The published value is the same number, and it is unitless: a `px` or a
         `ch` here would make the `calc()` in `site.css` invalid and the cap
         silently inert. */
      const style = lineCap(lines) as Record<string, unknown> | undefined;
      check(`…and is published as a bare number`, style?.['--ln-chars'] === longest,
        String(style?.['--ln-chars']));
    }
  }

  check('empty copy publishes nothing rather than a zero', lineCap([]) === undefined);
  check('…and so does whitespace', lineCap(['   ']) === undefined);
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

/* The board's tabs are index-aligned with `SCOPES` in `api/board.ts` the same
   way the names are with `GAMES`, and the same blind spot applies: `Dictionary`
   makes a missing *key* a compile error and says nothing about a short array.
   Dropping the city board meant editing six files, and the one that would have
   been missed silently is a dictionary — leaving a tab labelled "My city" over
   a country board, or an unlabelled tab. */
  for (const code of LANGUAGE_ORDER) {
    const scopes = LANGUAGES[code].games.boardScopes;
    check(`${code} labels every board scope`, scopes.length === SCOPES.length,
      `${scopes.length} of ${SCOPES.length}`);
    check(`…and none is blank`, scopes.every((label) => label.trim().length > 0));
  }
  /* And the city board is off this client's menu. Pinned because the endpoint
     behind it stays — the Flutter app calls it — so nothing else would notice
     it coming back. */
  check('the city board is not offered here',
    !(SCOPES as readonly string[]).includes('city'), SCOPES.join(', '));
}

console.log('\nthe daily game, and the region rule');
{
  /*
   * The poster rotates. Three properties, and each of them is a way the
   * rotation could have been wrong:
   *
   *  1. **Deterministic and shared.** No user id, no randomness, no stored
   *     choice — everybody opening the screen on the same day sees the same
   *     game, which is the only thing that makes "today's game" a phrase two
   *     people can use.
   *  2. **Every game gets its turn.** A hashed pick is indistinguishable from a
   *     rotation on any one day and can leave a game unposted for a fortnight;
   *     walking the pool in order cannot.
   *  3. **It only ever points at a card that is on the screen.** The local Word
   *     Builder is not a card everybody has — see the region rule below — so it
   *     is out of the pool. A poster pointing at a missing card is a poster
   *     that cannot be pressed.
   */
  check('the daily pool leaves out the one card not everybody has',
    !DAILY_POOL.some((game) => game.id === 'wordLocal'),
    DAILY_POOL.map((game) => game.id).join(', '));
  check('…and contains everything else', DAILY_POOL.length === GAMES.length - 1);

  check('the same day is the same game', dailyGame('2026-03-04') === dailyGame('2026-03-04'));
  check('…and the index points back at it',
    GAMES[dailyGameIndex('2026-03-04')].id === dailyGame('2026-03-04'));

  /* One full cycle of days covers the pool exactly once. */
  const cycle = new Set<string>();
  for (let i = 0; i < DAILY_POOL.length; i += 1) {
    const day = new Date(Date.UTC(2026, 2, 4) + i * 86_400_000).toISOString().slice(0, 10);
    cycle.add(dailyGame(day));
  }
  check('a full cycle posts every game once', cycle.size === DAILY_POOL.length,
    `${cycle.size} of ${DAILY_POOL.length}`);

  /* Consecutive days are different games, which is the thing a player notices
     and the one a modulo gets wrong if the pool is ever length 1. */
  check('consecutive days differ', dailyGame('2026-03-04') !== dailyGame('2026-03-05'));

  /* A broken clock must not crash the screen: `dailyGameIndex` is read during
     render and a throw there is a black page (see `ErrorBoundary`). */
  check('nonsense resolves to a real game', GAMES.some((game) => game.id === dailyGame('banana')));

  /*
   * ── the region rule ──
   *
   * The local Word Builder promises "practise the language of the place you
   * moved to". Uzbekistan had no word list and was being handed the **Polish**
   * one, which is the card saying something false — and worse than saying
   * nothing, because a player cannot tell until they are five words in.
   *
   * Three answers, and the third is the new one: a list where there is one, the
   * Poland default for a country the product has not localised for at all
   * (including an account with no city), and *nothing* for a country it has
   * localised for and has no list for.
   */
  check('Poland gets the Polish list', wordListFor('PL') === 'pl');
  check('an unknown country still gets the market default', wordListFor('FR') === 'pl');
  check('…and so does an account with no city yet', wordListFor(undefined) === 'pl');
  check('Uzbekistan gets no local word list rather than the Polish one',
    wordListFor('UZ') === null);
  check('…folded, so `uz` and ` UZ ` are the same country', wordListFor(' uz ') === null);

  /* And the card is then not drawn. The filter is `games.tsx`'s and is restated
     here as the property it has to have, because the alternative — a card whose
     `list` is null — is a crash on the Play screen. */
  const visible = (list: 'en' | 'pl' | null) =>
    GAMES.filter((game) => game.id !== 'wordLocal' || list !== null);
  check('a player with no local list sees one Word Builder',
    visible(wordListFor('UZ')).filter((game) => game.kind === 'word').length === 1);
  check('…and a player with one sees two',
    visible(wordListFor('PL')).filter((game) => game.kind === 'word').length === 2);

  /*
   * ── the order of the grid ──
   *
   * A product decision rather than a derivation, so it is pinned: the flight
   * leads and Memory Match follows it. And the names array has to have moved
   * with the table — `copy.games.names` is index-aligned with `GAMES`, and a
   * reorder of one alone renames every game on the page, which is a failure the
   * length check one block up cannot see.
   */
  check('the flight leads the grid', GAMES[0].id === 'flight');
  check('…and Memory Match follows it', GAMES[1].id === 'memory');
  for (const code of LANGUAGE_ORDER) {
    const names = LANGUAGES[code].games.names;
    /* The flight's name is the one game in the set named after the product's
       own character, in every language — which is what makes it checkable
       without a table of eight translations here. */
    check(`${code}'s first name is the flight's`, /squawk|сквок/i.test(names[0]), names[0]);
    /* And the local Word Builder is last, because it is the row the region rule
       removes: a filtered list keeps every other index where it was. */
    check(`${code} still holds a hole for the local list`, names[GAMES.length - 1].includes('{language}'));
  }
  check('the local Word Builder is the last row', GAMES[GAMES.length - 1].id === 'wordLocal');
}

console.log('\nthe live rate table, over the built-in one');
{
  /*
   * `i18n/fx.ts` is nineteen rates compiled into the bundle and its own header
   * admits what they are: a snapshot, refreshed whenever somebody edited a
   * TypeScript file. `/v1/fx` is the same nineteen, synced twice a day — and
   * `ratesFrom` is the fold between them.
   *
   * Every check here is about the **fallback**, because that is where a live
   * feed hurts a page that was working: an answer that is absent, empty, or
   * wrong in one row must leave every rate exactly where the built-in table had
   * it. A converter is allowed to be a month out of date and say so; it is not
   * allowed to divide by zero.
   */
  const built = ratesFrom({ status: 'loading' });
  check('a request in flight uses the built-in table', !built.live);
  check('…with the built-in figures', ratesFrom({ status: 'loading' }).rateOf('PLN') === FX.PLN.rate);
  check('…and claims no timestamp', built.updatedAt === null && built.stale === false);

  const failed = ratesFrom({
    status: 'error',
    error: new ApiError(0, 'offline', 'nothing listening'),
  });
  check('an unreachable server is the same as no answer',
    !failed.live && failed.rateOf('UZS') === FX.UZS.rate);

  const answer = (rows: Array<{ code: string; rate: number }>, extra = {}) =>
    ratesFrom({
      status: 'ready',
      data: {
        base: 'EUR',
        updatedAt: '2026-03-01T00:00:00.000Z',
        attemptedAt: '2026-03-01T00:00:00.000Z',
        attemptStatus: 'ok',
        stale: false,
        rates: rows.map((row) => ({ ...row, base: 'EUR', decimals: 2, updated_at: '2026-03-01T00:00:00.000Z' })),
        ...extra,
      },
    });

  const live = answer([{ code: 'EUR', rate: 1 }, { code: 'PLN', rate: 4.341 }]);
  check('a live rate wins', live.live && live.rateOf('PLN') === 4.341);
  check('…and a currency the answer omits keeps the built-in one',
    live.rateOf('GBP') === FX.GBP.rate);
  check('…and the timestamp comes through', live.updatedAt === '2026-03-01T00:00:00.000Z');

  /*
   * The three ways a row can be wrong, and all three must fall back rather than
   * reach the screen. A zero divides a conversion to Infinity; a negative one
   * prints a negative amount; and an anchor that is not 1 scales **every**
   * conversion on the page by that factor — silently, because the one rate
   * nobody would think to check is the one that is 1 by definition.
   */
  check('a zero rate is ignored',
    answer([{ code: 'PLN', rate: 0 }]).rateOf('PLN') === FX.PLN.rate);
  check('a negative rate is ignored',
    answer([{ code: 'PLN', rate: -4 }]).rateOf('PLN') === FX.PLN.rate);
  check('an anchor that is not 1 is dropped rather than applied',
    answer([{ code: 'EUR', rate: 1.2 }, { code: 'PLN', rate: 4.341 }]).rateOf('EUR') === 1);
  check('a currency this site does not know is ignored',
    !answer([{ code: 'XTS', rate: 2 }]).live);

  /* Staleness is the *server's* judgement (`CONFIG.rates.staleHours`), passed
     through rather than recomputed here — a client comparing dates would be a
     second copy of a threshold. It only means anything when something is live:
     the built-in table is not stale, it is built in. */
  check('the server decides what stale means',
    answer([{ code: 'EUR', rate: 1 }], { stale: true }).stale === true);
  check('…and the built-in table is never called stale', !built.stale);

  /* The cross rate stays exact, which is the reason the overlay is per code.
     Every rate on both sides is units per euro, so `to / from` is a single
     division however the two were sourced. */
  const mixed = answer([{ code: 'EUR', rate: 1 }, { code: 'PLN', rate: 4.341 }]);
  check('a cross rate mixing a live and a built-in leg is one division',
    Math.abs(mixed.rateOf('GBP') / mixed.rateOf('PLN') - FX.GBP.rate / 4.341) < 1e-12);
}

console.log('\nthe currency is its own setting');
{
  /*
   * The language used to pick the currency — `CURRENCIES[language]` — so a
   * visitor who wanted prices in zloty had to read the site in Polish. They
   * were never the same question: a Russian speaker in Krakow is paid in zloty
   * and an English speaker may be in Tashkent.
   *
   * Four properties, and the last two are the ones that make "separate" mean
   * something rather than just "two controls":
   */

  /* 1. Every language still has a default, because it is the one thing a
        visitor tells us before they tell us anything else. */
  for (const code of LANGUAGE_ORDER) {
    const fallback = CURRENCY_FOR_LANGUAGE[code];
    check(`${code} defaults to a currency`, isCurrencyCode(fallback), fallback);
    check(`…and it is one the site can price in`, CURRENCIES[fallback] !== undefined);
  }

  /* 2. Every offered currency has the two things a *price tag* needs, which is
        why this set is five and not the nineteen `fx.ts` carries: a rounding
        step, so a converted price is not an exchange-rate artefact, and a rate
        read from the one anchored table. */
  for (const code of CURRENCY_ORDER) {
    const currency = CURRENCIES[code];
    check(`${code} has a rounding step`, currency.step > 0, String(currency.step));
    check(`…a rate from fx.ts`, currency.rate === FX[code].rate);
    check(`…and its own symbol`, currency.symbol === FX[code].symbol);
  }

  /* 3. The two axes are genuinely independent: the same amount in one currency
        reads the same whatever language is set, and in one language reads
        differently per currency. If either failed, the settings would still be
        joined somewhere. */
  const amount = 1299;
  const inGbp = LANGUAGE_ORDER.map((lang) =>
    money(amount, CURRENCIES.GBP, 'price', GROUP_FOR_LANGUAGE[lang]),
  );
  check('the currency decides the symbol, not the language',
    inGbp.every((written) => written.startsWith('£')), inGbp.join(' | '));
  const perCurrency = new Set(
    CURRENCY_ORDER.map((code) => money(amount, CURRENCIES[code], 'price', GROUP_FOR_LANGUAGE.en)),
  );
  check('…and five currencies write five different prices',
    perCurrency.size === CURRENCY_ORDER.length, [...perCurrency].join(' | '));

  /* 4. Grouping follows the **reader**, not the currency — the rule `fx.ts`
        has always stated and which was true only by accident while the table
        was keyed by language. A Pole looking at pounds groups with a narrow
        no-break space; an English reader looking at zloty groups with a comma.
        This is the check that would have caught the coincidence. */
  const poleInPounds = money(1299, CURRENCIES.GBP, 'price', GROUP_FOR_LANGUAGE.pl);
  const britInZloty = money(1299, CURRENCIES.PLN, 'price', GROUP_FOR_LANGUAGE.en);
  check('a Polish reader groups pounds their own way',
    poleInPounds.includes(GROUP_FOR_LANGUAGE.pl) && !poleInPounds.includes(','),
    poleInPounds);
  check('…and an English reader groups zloty theirs',
    britInZloty.includes(','), britInZloty);
  /* And the separator is a *narrow no-break* space rather than a plain one, or
     a price wraps between its digits and its symbol. */
  check('the space is no-break', GROUP_FOR_LANGUAGE.pl === ' ');

  /* Every offered currency is named in every language. The names are reused
     from the Relocate converter's table, which is already the currency's name
     in the reader's language — five new strings in five dictionaries would have
     been ten copies of a word the site already has. */
  for (const lang of LANGUAGE_ORDER) {
    for (const code of CURRENCY_ORDER) {
      const name = LANGUAGES[lang].relocate.rates.names[code];
      check(`${lang} names ${code}`, typeof name === 'string' && name.trim().length > 0, name);
    }
  }
}

console.log('\nthe shelf, in five languages');
{
  /*
   * This block checked `redeem` and `markUsed` — buying a gift card off the
   * catalogue in `content.ts` and spending it, both by editing an object in
   * `localStorage`. Buying is `POST /v1/gift-cards` now: it takes points off a
   * real ledger and issues a code, which is a request rather than a function
   * and is not something a pure suite can hold to an invariant. What *is*
   * checkable is the copy around it, and it is worth checking for a specific
   * reason — the shelf's screens have three renderings (a shelf, an empty
   * shelf, an unreachable server) and every language needs all three, or a
   * Polish reader gets an English sentence at the worst possible moment.
   */
  for (const code of LANGUAGE_ORDER) {
    const wallet = LANGUAGES[code].wallet;
    const catalogue = LANGUAGES[code].vouchers.catalogue;

    /* The three states, said differently. `Dictionary` makes a *missing* key a
       build error and says nothing about two keys carrying the same sentence —
       and "nothing here" reading identically to "we could not ask" is exactly
       the failure this whole pass is about. */
    check(
      `${code} tells an empty shelf from an unreachable one`,
      catalogue.none.trim() !== '' &&
        catalogue.down.trim() !== '' &&
        catalogue.none !== catalogue.down,
    );
    check(
      `…and the signed-in wallet does too`,
      wallet.noShelfYet.trim() !== '' &&
        wallet.down.unreachable.trim() !== '' &&
        wallet.noShelfYet !== wallet.down.unreachable,
    );
    /* An empty board is not a filter coming up short, either. */
    check(
      `…and an empty board from an empty chip`,
      wallet.deals.noneAtAll.trim() !== '' && wallet.deals.noneAtAll !== wallet.deals.noneHere,
    );

    /* The stock caption lost its denominator when the shelf became
       `gift_card_stock`, which records how many are left and not what the
       allocation was. A `{of}` left in any language renders the word "{of}". */
    check(`${code} counts stock without a denominator`, !catalogue.left.includes('{of}'));
    check(`…and still says how many`, catalogue.left.includes('{n}'));
    check(`…in the wallet as well`, wallet.left.includes('{n}') && !wallet.left.includes('{of}'));

    /* The claim button is a disclosure now, and the sentence under it is the
       one thing on the board a reader has to be told: the claim happens at the
       counter, on the venue's scan. */
    check(`${code} says where a claim happens`, wallet.deals.claimAtCounter.trim().length > 20);
    check(`…and labels the control that shows it`, wallet.deals.howToClaim.trim() !== '');

    /* Five tiles on the console, one label each. The array is index-aligned
       with `admin.tsx` and a short one renders `undefined` under a figure. */
    check(
      `${code} names every console tile`,
      LANGUAGES[code].admin.kpis.length === 5,
      `${LANGUAGES[code].admin.kpis.length}`,
    );
    /* Two hero stats on L-Earn, and `LEARN_STATS` is what they count. */
    check(
      `…and every L-Earn hero stat`,
      LANGUAGES[code].learn.hero.stats.length === LEARN_STATS.length,
      `${LANGUAGES[code].learn.hero.stats.length} of ${LEARN_STATS.length}`,
    );
  }

  /*
   * And nothing anywhere still quotes a price off the shelf that was deleted.
   *
   * `{amount}` is the hole `fill()` finishes with a converted euro figure, and
   * three marketing surfaces used to put a gift card's face value through it —
   * Home's value card, the L-Earn FAQ and the Vouchers page's wallet mock. A
   * gift card is priced in *its own* currency (`faceValue`), so a `{amount}`
   * left on any of those three is both a wrong number and the wrong rule.
   */
  for (const code of LANGUAGE_ORDER) {
    const d = LANGUAGES[code];
    check(`${code} quotes no gift-card price on Home`, !d.value.card.meta.includes('{amount}'));
    check(`…nor in the Vouchers mock`, !d.vouchers.wallet.card.meta.includes('{amount}'));
    check(
      `…nor in the L-Earn FAQ`,
      d.learn.faq.items.every((item) => !item.a.includes('{amount}')),
    );
  }
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
    /* Not `EMPTY_PROFILE`: the round trip is only worth running over an object
       with something in it, and the profile is the second nested object on the
       account — the first one this check would have missed. */
    profile: { ...EMPTY_PROFILE, username: 'marta', city: 'Kraków' },
    onboardedAt: null,
    profileCompletedAt: null,
  };
  const back = JSON.parse(JSON.stringify(account)) as Account;
  check('an account survives a round trip', back.id === account.id && back.type === 'business');
  check('…including the listing', back.business?.spoken.join(',') === 'pl,en');
  check('…and the profile', back.profile.username === 'marta' && back.profile.city === 'Kraków');

  /* `findUser` over a fixture, not over `SEED_USERS` — which is empty, and an
     assertion that a lookup fails over an empty list proves nothing about the
     lookup. The rule is still worth checking; the data it needs is one row. */
  const fixture: UserRecord[] = [{
    id: 'u_fix', name: 'Fixture', email: 'fixture@example.com', password: 'hunter22',
    created: '2026-01-01', type: 'individual', business: null, player: null,
  }];
  const found = findUser(fixture, 'FIXTURE@EXAMPLE.COM', 'hunter22');
  check('the address is matched case-insensitively', found.ok);
  check('a wrong password is refused', findUser(fixture, 'fixture@example.com', 'nope').ok === false);
  check('an unknown address is refused', findUser(fixture, 'nobody@example.com', 'hunter22').ok === false);
}

console.log('\nthe directory');
{
  /*
   * **The directory ships empty, and that is the check.**
   *
   * There were three seeded people here, then two, and this suite asked of each
   * of them the thing that made its screen worth opening: that the owner landed
   * on a finished listing rather than a form, that the player had a balance and
   * a streak with the right days behind it, that neither could reach the
   * console. Twenty-odd checks, all of them passing, all of them guarding
   * accounts that should not exist.
   *
   * They are gone. A seeded account is a password in the shipped bundle — and,
   * since `server/` arrived, a *working* password to a system that hashes them
   * — a real café’s name on a listing nobody at that café wrote, and a points
   * balance the ledger has no entry for. What is checked now is the absence,
   * stated four ways, so that putting any part of it back fails here rather
   * than on somebody’s dashboard.
   */
  check('the directory ships empty', SEED_USERS.length === 0, `${SEED_USERS.length} accounts`);
  check('so nothing in the bundle carries a password', SEED_USERS.every((u) => !u.password));
  check('nothing in it can reach the console', !SEED_USERS.some((u) => u.type === 'admin'));
  check(
    '…and the address that used to is gone',
    !SEED_USERS.some((u) => sameEmail(u.email, 'admin@pay-lez.com')),
  );

  /*
   * The merge in `directory.ts` is still a merge, and still has to be correct
   * over the empty set — `listUsers` appends the seeds a stored directory has
   * not seen, and an empty append must leave the stored rows exactly as found.
   * Modelled here rather than called, because `listUsers` reaches for
   * `localStorage` and this file runs in Node.
   */
  const stored: UserRecord[] = [{
    id: 'u_real', name: 'Somebody', email: 'somebody@example.com', password: 'hunter22',
    created: '2026-01-01', type: 'individual', business: null, player: null,
  }];
  const known = new Set(stored.map((u) => u.id));
  const merged = [...stored, ...SEED_USERS.filter((seed) => !known.has(seed.id))];
  check('merging no seeds into a stored directory changes nothing', merged.length === 1);
  check('…and leaves the row that was there', merged[0]!.id === 'u_real');

  /*
   * And the sweep that takes the two retired rows off a device that already has
   * them. Deleting a seed from `users.ts` stops it being written; it does
   * nothing about the copy in `localStorage`, and a stored row wins over a seed
   * by design — so the demo café and the demo player would have outlived their
   * own deletion on exactly the devices that had seen them.
   */
  const haunted: UserRecord[] = [
    { ...stored[0]! },
    { id: 'u_marta', name: 'M', email: 'user1@pay-lez.com', password: 'user123',
      created: '2026-04-02', type: 'business', business: null, player: null },
    { id: 'u_dilnoza', name: 'D', email: 'user2@pay-lez.com', password: 'user123',
      created: '2026-05-19', type: 'individual', business: null, player: null },
  ];
  const swept = haunted.filter((u) => !RETIRED_IDS.has(u.id));
  check('a device that stored the seeds loses them', swept.length === 1);
  check('…and keeps the account that is somebody’s', swept[0]!.id === 'u_real');
  check(
    '…and no retired id is one a new account could be given',
    [...RETIRED_IDS].every((id) => !SEED_USERS.some((u) => u.id === id)),
  );
}

console.log('\nsigning up');
{
  const good = {
    name: 'Anna Kowalska',
    email: 'anna@example.com',
    password: 'secret1',
    type: 'individual' as const,
    acceptTerms: true,
  };

  /* Validated against a directory built here. `SEED_USERS` is empty, and
     `taken` is the one rule that needs a directory with somebody already in
     it — an address cannot collide with nobody, so over the empty list that
     one check would have passed by accident for ever. */
  const roster: UserRecord[] = [{
    id: 'u_taken', name: 'Kasia', email: 'kasia@example.com', password: 'hunter22',
    created: '2026-01-01', type: 'individual', business: null, player: null,
  }];

  check('a complete sign-up is accepted', validateSignUp(roster, good) === null);
  check('a blank name is refused', validateSignUp(roster, { ...good, name: '  ' }) === 'name');
  check('a malformed address is refused', validateSignUp(roster, { ...good, email: 'anna@' }) === 'email');
  check(
    'an address already in the directory is refused',
    validateSignUp(roster, { ...good, email: 'KASIA@example.com' }) === 'taken',
  );
  check(
    '…and over an empty directory nothing is taken',
    validateSignUp(SEED_USERS, good) === null,
  );
  check(
    'a short password is refused',
    validateSignUp(roster, { ...good, password: 'x'.repeat(MIN_PASSWORD - 1) }) === 'password',
  );
  check('an unanswered type is refused', validateSignUp(roster, { ...good, type: null }) === 'type');
  /*
   * And the agreement, which is **last on purpose**: the order of these checks
   * is the order the eye goes down the form, so the message always points at
   * the first field that needs attention. The box is at the bottom because it
   * is about the whole form rather than about any one field.
   *
   * Refused here *and* on the server (§1.3 in `domain/accounts.ts`), which is
   * not redundancy: a checkbox is a courtesy and the `consent_records` row is
   * evidence. Two `consent_records` rows used to be written unconditionally at
   * account creation — a consent nobody had given.
   */
  check('an unaccepted agreement is refused',
    validateSignUp(roster, { ...good, acceptTerms: false }) === 'terms');
  check('…and it is checked after everything about the person',
    validateSignUp(roster, { ...good, name: '  ', acceptTerms: false }) === 'name');

  /* The order matters: the message points at the first field that needs
     attention, so a form with two problems must name the earlier one. */
  check(
    'the first problem is the one reported',
    validateSignUp(roster, { ...good, name: '', email: 'nope' }) === 'name',
  );

  const person = newUser(good, 'u_test', '2026-08-03');
  check('a new player starts with a wallet', person.player !== null);
  check('…and with no listing', person.business === null);

  const owner = newUser({ ...good, email: 'b@example.com', type: 'business' }, 'u_test2', '2026-08-03');
  check('a new owner starts with no listing', owner.business === null);
  /* Through `toAccount`, not through a hand-copied literal. The literal that
     used to be here restated six of the record's fields and was already two
     short of an account — `profile` and `onboardedAt` postdate it — so it was
     asserting about a shape the app never builds. `toAccount` is the one
     conversion the directory actually performs, and the row it is handed is the
     one `newUser` just produced. */
  check('…which is what sends them to setup',
    resolveRoute('signin', toAccount(owner)) === 'business-setup');
  check('…and with no wallet', owner.player === null);
  check('the address is trimmed, the password is not touched', newUser({ ...good, email: ' a@b.co ' }, 'u_t3', '2026-08-03').email === 'a@b.co');
}

console.log('\nthe console');
{
  /*
   * The analytics view used to derive a whole month from one seeded `scale`.
   * It derives nothing now — `GET /v1/admin/venues` answers a visit count and a
   * customer count and nothing else — so the checks here are the ones *that*
   * can get wrong: a headline that disagrees with the cards under it, a figure
   * nobody counted rendered as a zero somebody could read as a finding, and a
   * date filter that does not filter.
   */
  const row = (visits: number, customers: number) => ({
    id: 'v-test', name: 'Test', city: 'Kraków', category: 'cafe', status: 'live',
    verified_at: null, created_at: '2026-08-03', owner: null, visits, customers,
  });
  const busy = serviceMetricsFrom(row(40, 12));
  const quiet = serviceMetricsFrom(row(4, 2));
  const fresh = serviceMetrics();

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

  /* "Quieter everywhere" was the whole argument for deriving a month from one
     seed. Three figures have a source now, so it is those three it has to hold
     across — and it still has to hold, because the header, the card and the
     venue list all read the same object. */
  check(
    'a quieter venue is quieter in every figure that has a source',
    quiet.scans < busy.scans && quiet.customers < busy.customers &&
      quiet.engagement < busy.engagement,
  );
  check('…and both of them know they were counted', busy.measured && quiet.measured);
  check('every count is a whole number', Number.isInteger(quiet.scans) && Number.isInteger(quiet.engagement));

  /* A venue with no traffic is the state every reference screenshot was taken
     in, and the state the one real listing on this console is genuinely in. */
  check('a new venue has nothing', fresh.engagement === 0 && fresh.scans === 0);
  /* All three tables are empty, and take no argument to be empty with. They
     were slices of hand-written rows cut to `rows.length × scale`; there is no
     operator-facing endpoint behind any of them. */
  check(
    '…no rows',
    redemptionsFor().length === 0 && scanRowsFor().length === 0 && voucherRowsFor().length === 0,
  );
  check('…and no insights', fresh.cities.length === 0 && fresh.languages.length === 0);
  /*
   * And it says so, rather than saying zero.
   *
   * The inversion of the check that used to stand here — the unmeasured month
   * kept its loyalty settings, because a `scale: 0` venue was a real venue with
   * a real `perVisit`. Nothing on this object came off a count now, so the one
   * field that is not a number is what every panel branches on, and every field
   * that *is* a number has to be a plain zero underneath it. A plausible
   * default (a "1 point per visit" nobody set) is the failure mode: it reads as
   * a finding, and the console exists to tell an operator things they cannot
   * see from anywhere else.
   */
  const zeroed = (value: unknown): boolean =>
    typeof value === 'number'
      ? value === 0
      : typeof value === 'boolean'
        ? value === false
        : Array.isArray(value)
          ? value.every(zeroed)
          : typeof value === 'object' && value !== null
            ? Object.values(value).every(zeroed)
            : true;
  check('…and is marked unmeasured rather than empty', fresh.measured === false);
  check('…with nothing standing in for a figure nobody counted', zeroed(fresh));
  check('…including a discount it never gave', fresh.discount === 0);
  check('…and an average basket nobody filled', fresh.voucherCampaign.basket === 0);

  check('the trend is a month long', fresh.trend.length === 30 && fresh.scanTrend.length === 30);

  /* The four ranges on every table. Rows carry "days ago", so the filter is the
     same comparison the table itself runs — checked against a fixture, because
     the tables it used to run over are empty and a filter proved on no rows is
     not proved at all. */
  const ago = [0, 3, 6, 12, 45, 200];
  check('all time keeps everything', ago.filter((a) => inRange(a, RANGES[0])).length === ago.length);
  check(
    'last 7 days drops the older rows',
    ago.filter((a) => inRange(a, RANGES[1])).length < ago.length,
  );
  check(
    'the ranges nest',
    ago.filter((a) => inRange(a, RANGES[1])).length <=
      ago.filter((a) => inRange(a, RANGES[2])).length &&
      ago.filter((a) => inRange(a, RANGES[2])).length <=
        ago.filter((a) => inRange(a, RANGES[3])).length,
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
  /*
   * The pool's three fields are typeable now, so the invariant above has to
   * hold at whatever gets typed — not only at the seeded figures. A budget an
   * owner halves must still be exhausted by spent + set aside + available, or
   * the bar lets them commit the same money twice, which is the thing that
   * check exists to stop.
   */
  for (const budget of [0, PD_VOUCHER_BUDGET / 2, PD_VOUCHER_BUDGET * 3]) {
    const m = voucherModelFor(budget, AVG_SPEND, PD_MAX_PER_VOUCHER);
    check(
      `the pool still adds up at a budget of ${Math.round(budget)}`,
      Math.abs(m.spent + m.reserved + m.available - budget) < 1e-6,
    );
  }

  /* The cap is the reason that field exists, and it has to bind at every value
     it can be given — an uncapped 15% on a large order is an unbounded bite out
     of a fixed monthly budget. */
  for (const cap of [0, 1, PD_MAX_PER_VOUCHER, PD_MAX_PER_VOUCHER * 10]) {
    const m = voucherModelFor(PD_VOUCHER_BUDGET, AVG_SPEND, cap);
    check(
      `no tier beats a cap of ${cap.toFixed(2)}`,
      m.tiers.every((t) => t.unit <= cap + 1e-9),
    );
  }

  /* Raising the average transaction can only cost more, never less: every unit
     is a percentage of it under a cap that does not move. */
  const cheap = voucherModelFor(PD_VOUCHER_BUDGET, AVG_SPEND / 2, PD_MAX_PER_VOUCHER);
  check(
    'a smaller average transaction never spends more',
    cheap.spent <= PD_VOUCHER_MODEL.spent + 1e-9,
    `${cheap.spent.toFixed(2)} vs ${PD_VOUCHER_MODEL.spent.toFixed(2)}`,
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
  /*
   * The trend beside that headline is empty, and empty is the finding.
   *
   * It used to be three months ending on `PD_PER_NEW` — the same number twice,
   * which was the property checked here. Three *zeros* would not be the same
   * bug, it would be a worse one: a cost-per-new-customer history is three
   * measurements, and three zeros is three months of claiming the venue spent
   * nothing to win nobody. So the length is what is asserted now, and the
   * headline it used to end on is covered by the check above it.
   */
  check(
    'the cost-per-new-customer trend is empty rather than zeroed',
    metricsFor(RANGE_DAYS).perNewTrend.length === 0,
  );

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
  /* Each window is built and memoised separately, so the empty trend has to be
     empty in all four and not only in the default one. */
  check(
    'the trend is empty in every window',
    windows.every((m) => m.perNewTrend.length === 0),
  );
  check(
    'each window knows its own place in the label arrays',
    windows.every((m, i) => m.index === i),
  );

  /*
   * The heat map is alpha on one accent, so an empty cell and a busy one differ
   * by density alone — which needs a real range to work with. The seeded week
   * that supplied one is gone: it was three gaussians with a hard cut on
   * Tuesday and Wednesday afternoons, and the quiet block it invented was
   * quoted as a *finding* on two screens and by the assistant.
   *
   * So the shape is what is checked here, and the narrowing that fills it —
   * `analytics.heatmap` returns a 7 × 24 grid and this map draws fourteen of
   * those hours.
   */
  check('the heat map is a week', PD_HEAT.length === 7);
  check('…fourteen hours wide', PD_HEAT.every((row) => row.length === HEAT_HOURS.length));
  /* Nothing in it, and a max of 0 is what the screen reads as "no range to
     shade" — it renders its empty state rather than a uniformly blank grid,
     which would look like a week nobody came in. */
  check('…with no range to shade until something is counted', PD_HEAT_MAX === 0);

  const hour15 = HEAT_HOURS.indexOf(15);
  const week = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) =>
      /* 04:00 is not a hole in the trade, it is a shut door — the hours outside
         the map have to be dropped rather than shaded, so the fixture puts its
         largest number in one. */
      hour === 3 ? 999 : day === 2 && hour === 15 ? 500 : day + hour,
    ),
  );
  const narrowed = heatFromApi(week);
  check(
    'the server week narrows to the hours the map draws',
    narrowed.length === 7 && narrowed.every((row) => row.length === HEAT_HOURS.length),
  );
  check(
    '…keeping the busiest hour where it happened',
    narrowed[2][hour15] === 500 && Math.max(...narrowed.flat()) === 500,
  );
  check('…and dropping the hours nobody is open for', narrowed.flat().every((n) => n !== 999));
  /* A grid with a day missing is what a venue open six days a week can return,
     and an `undefined` row would put `NaN` through the alpha of every cell. */
  check(
    '…while a grid short of a day reads as zeros, not as nothing',
    heatFromApi([[]]).length === 7 && heatFromApi([[]]).flat().every((n) => n === 0),
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

  /*
   * **What used to be here, and why none of it is.**
   *
   * The roster and the deals table were checked as index alignments into
   * `en.dashboard.customers` and `en.dashboard.deals`: a pattern, a reward, an
   * audience, a campaign, a tier, a name, a window, a forecast date. Nine
   * checks, all of the form `PD_X.every(...)`.
   *
   * `PD_ROSTER` and `PD_DEALS` are `[]` now — an identified customer and a live
   * deal both arrive from the server carrying their own words, and the
   * dictionary arrays beside them are unreachable copy — and `RosterEntry` and
   * `PartnerDeal` no longer have most of the fields those checks read. But
   * `.every()` over an empty array is `true`, so all nine went on passing by
   * having nothing to look at. An assertion that cannot fail is worse than no
   * assertion, so they are deleted rather than re-typed around.
   *
   * What replaces them is the part that is still live: the pure functions a
   * deal goes through on its way to the screen. `dealFromApi` is what
   * `#/dashboard` calls on every row `GET /v1/partner/venues/:id/deals`
   * returns — three call sites — and it is what a renamed response field breaks
   * first.
   */
  const dealRow: Parameters<typeof dealFromApi>[0] = {
    id: 'd_1',
    venue_id: 'v_1',
    discount_text: '  Free filter coffee  ',
    status: 'live',
    valid_from: '2026-08-01',
    valid_to: '2026-08-31',
    target_audience: null,
    target_weekdays: 'mon,tue,wed,thu,fri',
    target_from_min: 7 * 60,
    target_to_min: 10 * 60,
    cap_claims: null,
    spend_minor: 12_300,
    seen_count: 400,
    opened_count: 90,
    claimed_count: 31,
    funnel: {
      seen: 400,
      opened: 90,
      claimed: 31,
      openRate: 0.225,
      claimRate: 0.0775,
      spendMinor: 12_300,
      capClaims: null,
      capSpendMinor: null,
    },
    translations: {
      languages: ['en', 'pl', 'uz', 'ru', 'uk'],
      filled: ['en', 'pl'],
      missing: ['uz', 'ru', 'uk'],
    },
    copy: {
      title: 'Free filter with any bake',
      description: 'A filter coffee on us with anything from the counter.',
      terms: 'One per customer per day.',
      language: 'en',
    },
    series: [2, 0, 5, 4, 0, 9, 11],
    push: {
      status: 'sent',
      scheduledAt: '2026-08-12T07:30:00.000Z',
      sentAt: '2026-08-12T07:30:04.000Z',
      delivered: 940,
      opened: 312,
      cameIn: 112,
    },
  };
  const deal = dealFromApi(dealRow, (minor) => minor / 100);

  check(
    'a server deal keeps its funnel',
    deal.seen === 400 && deal.opened === 90 && deal.claimed === 31,
  );
  /* The mapper takes the row's minor units and the caller's rate, and the two
     meet exactly once — a second division somewhere down the screen is how a
     spend figure ends up a hundredth of itself. */
  check('…with its spend converted once, by the caller', deal.cost === 123, `${deal.cost}`);
  /* `cap_claims: null` is "no limit", and the screen branches on `limit > 0`.
     Reading it as anything but 0 would put a forecast on a deal that has
     nothing to hit. */
  check('…and no cap reading as no limit', deal.limit === 0);
  check('…the badge trimmed to the venue’s own words', deal.badge === 'Free filter coffee');
  /*
   * The badge and the name are two fields, and conflating them is what the row
   * looked like before `dealsFor` joined the copy: `discount_text` printed
   * twice, once as a chip and once as a heading. The chip is what the deal
   * *gives*; the name is what it is *called*.
   */
  check(
    '…and the name coming from the copy, not the badge',
    deal.name === 'Free filter with any bake' && deal.name !== deal.badge,
  );
  /* A deal can exist before it is written, and an unwritten one has no name —
     which the row draws as "no title yet" rather than as a blank heading. */
  check(
    '…with an unwritten deal having no name at all',
    dealFromApi({ ...dealRow, copy: null }, (m) => m).name === '',
  );
  /* A deal with nothing written on it says nothing, rather than rendering the
     empty string as a gap in a bold tag — the `|| ''` in the mapper. */
  check(
    '…and an untitled deal staying untitled',
    dealFromApi({ ...dealRow, discount_text: null }, (m) => m).badge === '',
  );
  check(
    'the language count is what is filled, not what is offered',
    deal.langs === 2 && deal.missing.length === 3,
  );

  /*
   * The schedule is one line, and the weekday run is folded.
   *
   * `mon,tue,wed,thu,fri` printed long is five chips in a cell that already
   * carries a name, a date range and an audience, which is what made the
   * reference row wrap. Folding is only correct for a *contiguous* run — a
   * Mon/Wed/Fri deal folded to "Mon–Fri" would be the row claiming the offer
   * runs on two days it does not — so both cases are checked.
   */
  check('a weekday run folds to a range', deal.schedule === 'Mon–Fri, 07:00–10:00', `${deal.schedule}`);
  check(
    '…and a set that is not a run is listed',
    dealFromApi({ ...dealRow, target_weekdays: 'mon,wed,fri' }, (m) => m).schedule ===
      'Mon, Wed, Fri, 07:00–10:00',
  );
  /* Minutes to a clock face, both halves padded: 7:0 is not a time, and the
     column is tabular. */
  check(
    '…with both halves of the clock padded',
    dealFromApi({ ...dealRow, target_from_min: 9 * 60 + 5, target_to_min: 60 }, (m) => m)
      .schedule === 'Mon–Fri, 09:05–01:00',
  );
  /*
   * A deal with no window at all says nothing. "Every day" is a different
   * offer from one that simply runs whenever it is live, and the row must not
   * invent the stronger claim.
   */
  check(
    '…and no window at all reading as no schedule',
    dealFromApi(
      { ...dealRow, target_weekdays: null, target_from_min: null, target_to_min: null },
      (m) => m,
    ).schedule === null,
  );
  /* Seven days, oldest first, carried through unchanged — the sparkline is
     drawn straight off it and a reversed series draws the week backwards. */
  check('the claim series survives the mapper', deal.series.length === 7 && deal.series[6] === 11);
  /*
   * `deal_pushes.status` has five values and the row draws three. The two that
   * fold together are `cancelled` and `failed` — both "it is not going" — and
   * neither may fold into *null*, which is the deal that never had one.
   */
  check('a sent push reads as sent', deal.push?.kind === 'sent' && deal.push?.cameIn === 112);
  check(
    '…a cancelled one as stopped, not as none',
    dealFromApi({ ...dealRow, push: { ...dealRow.push!, status: 'cancelled' } }, (m) => m).push
      ?.kind === 'stopped',
  );
  check(
    '…a scheduled one as scheduled',
    dealFromApi({ ...dealRow, push: { ...dealRow.push!, status: 'scheduled' } }, (m) => m).push
      ?.kind === 'scheduled',
  );
  check(
    '…and no push at all as null',
    dealFromApi({ ...dealRow, push: null }, (m) => m).push === null,
  );

  /*
   * The expanded row draws the notification as a funnel — notified, opened,
   * came in — and a funnel that widens is not a funnel. `dealNotify` cannot see
   * the sends (`partners.dealsFor` does not join `deal_pushes`), so every stage
   * is zero and every claim is unattributed. Both halves are checked, because
   * the failure that matters is a stage quietly acquiring a share of claims it
   * cannot account for — and `measured` is what the panel branches on, so a
   * zero funnel drawn as a *measured* one is the same lie one screen over.
   */
  const notify = dealNotify(deal);
  check(
    'the notification funnel reads downward',
    notify.opened <= notify.notified && notify.camein <= notify.opened,
  );
  check(
    'a notification never claims more than the deal got',
    notify.camein + notify.alone === deal.claimed,
  );
  check('…and an unmeasured funnel says so', notify.measured === false);

  /* `en.dashboard.deals.act` — the row's second button, by state — was checked
     here as `act[d.state] !== undefined` over the empty `PD_DEALS`. It is not
     re-pointed at the state union because it cannot pass: `PartnerDeal['state']`
     gained `'draft'` and `'ended'`, and the map still holds four keys. Nothing
     reads `act` today (the deals table lost its second button with the invented
     rows), so nothing is broken on screen — but the identical four-of-six gap
     is in `deals.states`, which the table *does* read, behind a
     `?? deal.state` fallback that prints the raw lowercase key. Both need the
     two keys in all five dictionaries before either is worth asserting, and the
     dictionaries are not this change's to edit. */

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
   * The budget warning used to be checked from both sides — the smallest offer
   * fitting the month's remaining room and the largest not — and `hotRoom` was
   * the seed that made both reachable. It was also a claim about a venue that
   * nobody had measured, so it is 0 now, and so is every other claim on this
   * object.
   *
   * That is the state the screen is built for: with nothing measured the
   * assistant refuses to draft rather than filling a `fill()` hole with a zero
   * it cannot stand behind, which is exactly the failure CLAUDE.md's rule for
   * this panel exists to prevent. The refusal itself is a branch in a React
   * component, so what is checked here is its condition — and the thing that
   * would silently re-arm the panel is one of these fields quietly acquiring a
   * plausible default.
   */
  check('the assistant has nothing measured to quote', PD_ASSIST.measured === false);
  check(
    '…and no figure standing in for one',
    Object.entries(PD_ASSIST)
      .filter(([key]) => key !== 'measured' && key !== 'budgets' && key !== 'weeks')
      .every(([, value]) =>
        typeof value === 'number'
          ? value === 0
          : typeof value === 'string'
            ? value === ''
            : Array.isArray(value) && value.length === 0,
      ),
  );
  /* `budgets` and `weeks` survive the cut because they are not measurements —
     they are the steps on a chooser, and a chooser with no steps is a broken
     control rather than an honest one. Checked just above.

     And the panel needs something to say instead of a draft. `empty` is
     index-aligned with the rail's screens minus the profile — the one screen
     that is a form rather than a report — and the assistant reads index 5, so a
     short array renders `undefined` here rather than throwing. */
  check(
    'every screen but the profile says what would fill it',
    en.dashboard.empty.length === en.dashboard.screens.length - 1,
    `${en.dashboard.empty.length} of ${en.dashboard.screens.length}`,
  );
  check(
    '…including the one the assistant falls back to',
    en.dashboard.empty.every((e) => e.title.trim() !== '' && e.body.trim() !== ''),
  );

  /*
   * Item 22: **grouping follows the reader, and it is read rather than
   * inferred.**
   *
   * `fx.ts` has always stated the rule — digit grouping belongs to the person
   * reading, the symbol to the money — and until the currency became a setting
   * of its own it was true by *accident*: `CURRENCIES` was keyed by language, so
   * a currency's own `group` happened to be the reader's. Separating the two
   * broke that coincidence in four places at once, and every one of them was a
   * screen writing two number formats on one row: a Polish reader who chose
   * pounds got counts grouped with commas beside prices grouped with a narrow
   * no-break space.
   *
   * The behavioural half is checked above (`money` takes the separator and five
   * currencies write five prices). What cannot be checked that way is whether
   * the *hooks* pass it — they are React hooks, and the failure is a `.group`
   * read off the wrong object rather than a wrong answer from a pure function.
   * So this reads the source, which is the `sqliteOnlySql` pattern one repo half
   * over: one banned token, the offending file named.
   *
   * `parts.group` and `parts?.group` are fine and are the point — `useMoneyParts`
   * puts the reader's separator on that field. What is banned is reaching for a
   * *currency's* own.
   */
  {
    const FORMATTERS = [
      'src/site/dashboardFormat.ts',
      'src/site/business.tsx',
      'src/site/vouchers.tsx',
      'src/site/admin.tsx',
      'src/site/adminAnalytics.tsx',
      'src/site/adminWebsite.tsx',
    ];
    for (const file of FORMATTERS) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
        /* Comments say the word while explaining the rule, which is exactly
           what the rule wants them to do. */
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      check(
        `${file} does not group by the currency`,
        !/\bcurrency\.group\b/.test(source) && !/\breader\.group\b/.test(source),
        source.match(/\b\w+\.group\b/g)?.join(', ') ?? 'none',
      );
      /* And a hard-coded separator is the other half of the same mistake: the
         console wrote `data-group=" "` for every reader, a plain space where
         English wants a comma — and a plain one, which lets a number break
         across two lines between its own digits. */
      check(
        `…and does not hard-code one`,
        !/data-group="[^{]/.test(source),
        source.match(/data-group="[^"]*"/g)?.join(', ') ?? 'none',
      );
    }
  }

  /*
   * The light dashboard clears WCAG AA (item 25).
   *
   * ## Why this is arithmetic and not a screenshot
   *
   * Contrast is a pure function of two colours, so the one thing this suite
   * *can* check about a stylesheet is exactly the thing that was wrong: the
   * light dashboard's greys were transcribed from `b2b/Paylez Partner Dashboard
   * v2.dc.html` and four of them fail the bar. `--text-fnt` measured **2.26:1**
   * against a `.pd-deals` panel and it is the colour of every `data-quiet` cell
   * in the Hot Deals table — the figures an owner opens the report for were the
   * least legible thing on the screen.
   *
   * The values are read out of `site.css` rather than restated here, because a
   * check that carries its own copy of the number it is checking passes when
   * the stylesheet changes and the copy does not.
   *
   * ## The grounds, and why three
   *
   * A token is only as good as the worst ground it lands on, and the light
   * dashboard has three: a white card (`--panel-rgb` at opacity), the
   * `--surface` wash a table head and a well take, and the `--surface-2` step
   * under a chip. Sizing against the card alone is what let `--accent-ink`
   * clear 4.96:1 there and fail at 4.06:1 on a chip.
   *
   * Dark is deliberately **not** checked: its own ramp is white at alpha on
   * near-black and measures past 7:1 everywhere, and item 25's second half is
   * that dark stays untouched.
   */
  {
    const css = readFileSync(new URL('../src/site/site.css', import.meta.url), 'utf8');

    /* The light dashboard's block, and only it: the same token names exist in
       `:root`, in the dark `.pd-app` and inside `[data-ink]`, and picking the
       wrong one would check a colour nobody sees on paper. */
    /*
     * **The last of three blocks with that selector, not the first.**
     *
     * `site.css` opens one near the top for `--font-pd` and one inside the
     * `[data-ink]` family, and neither carries a colour token — so an
     * `indexOf` found a block with nothing in it and every lookup below fell
     * through to its own `#000000` default, which then *passed* against a white
     * card at 21:1. A check that cannot find what it is checking and reports a
     * pass is worse than no check, so the block is pinned to the one that
     * actually holds the ramp.
     */
    const open = css.lastIndexOf(":root[data-theme='light'] .pd-app {");
    check('the light dashboard has a token block', open > 0);
    const block = css.slice(open, css.indexOf('\n}', open));
    check('…and it is the one carrying the ramp', block.includes('--text-mut:'), String(open));

    const token = (name: string): string => {
      const hit = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block);
      check(`--${name} is a hex in the light dashboard`, hit !== null, name);
      return hit ? hit[1] : '#000000';
    };

    /* sRGB relative luminance, WCAG 2.x. */
    const channel = (v: number): number => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const luminance = (hex: string): number => {
      const n = Number.parseInt(hex.slice(1), 16);
      return (
        0.2126 * channel((n >> 16) & 255) +
        0.7152 * channel((n >> 8) & 255) +
        0.0722 * channel(n & 255)
      );
    };
    const contrast = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    /* The grounds a light dashboard token lands on. `#ffffff` is the card
       — `--panel-rgb` is `255, 255, 255` and `--pd-glass` is opaque on this
       screen — and the surface steps are read from the block like everything
       else. */
    const flats: Array<[string, string]> = [
      ['a white card', '#ffffff'],
      ['the surface wash', token('surface')],
      ['the second surface step', token('surface-2')],
    ];

    /*
     * And the fourth ground, which three misses: an **accent chip**.
     *
     * `.ps-points` and `.ps-first[data-on='true']` are
     * `rgba(var(--accent-rgb), 0.14)`, so the accent is composited into the
     * ground and the ink then lands on a surface tinted toward the ink itself.
     * That is strictly darker than the flat ground under it, and sizing against
     * the flats alone is what let `--accent-ink` pass at 4.51:1 and draw the
     * points figure on a till receipt at **3.79:1**.
     *
     * Composited here rather than read, because the chip colour exists nowhere
     * as a token — it is an `rgba()` in a rule, which is the whole reason a
     * ground can go unnoticed.
     */
    const chip = (ground: string): string => {
      const accent = /--accent-rgb:\s*(\d+),\s*(\d+),\s*(\d+)/.exec(block);
      check('the light dashboard names an accent in rgb', accent !== null);
      const [r, g, b] = accent ? [+accent[1], +accent[2], +accent[3]] : [0, 0, 0];
      const under = Number.parseInt(ground.slice(1), 16);
      const mix = (top: number, bottom: number) => Math.round(top * 0.14 + bottom * (1 - 0.14));
      const hex = (v: number) => v.toString(16).padStart(2, '0');
      return `#${hex(mix(r, (under >> 16) & 255))}${hex(mix(g, (under >> 8) & 255))}${hex(
        mix(b, under & 255),
      )}`;
    };

    const grounds: Array<[string, string]> = [
      ...flats,
      ...flats.map(([where, ground]): [string, string] => [`an accent chip on ${where}`, chip(ground)]),
    ];

    /*
     * 4.5:1 for text this size (every one of these draws 10–13px), 3:1 for a
     * hairline — WCAG 1.4.11, which governs a text input's outline and the rules
     * of a table dense enough that they carry meaning.
     *
     * Each token is checked against the grounds it is **actually drawn on**,
     * which is the half worth being careful about. Holding everything to every
     * ground reads as more rigorous and is simply wrong: it failed `--text-fnt`
     * on an accent chip, and no rule in the sheet ever puts it there — both chip
     * rules set `color: var(--accent-ink)`. A check that fails on a combination
     * the product cannot render teaches the next person to widen a token for no
     * reason, or to delete the check.
     */
    const bars: Array<[string, number, Array<[string, string]>]> = [
      /* Body copy and quiet figures: panels, table cells, wells. Flat. */
      ['text-mut', 4.5, flats],
      ['text-fnt', 4.5, flats],
      /* The ink is the one that lands on both — an eyebrow on a panel, and the
         figure inside `.ps-points`. */
      ['accent-ink', 4.5, grounds],
      /* Hairlines rule a table and outline a field, never the inside of a chip. */
      ['border', 3, flats],
      ['border-2', 3, flats],
    ];

    for (const [name, need, against] of bars) {
      const value = token(name);
      for (const [where, ground] of against) {
        const got = contrast(value, ground);
        check(
          `--${name} clears ${need}:1 against ${where}`,
          got >= need - 0.005,
          `${value} on ${ground} is ${got.toFixed(2)}:1`,
        );
      }
    }

    /*
     * And the assignment above is only true while the chip rules still draw in
     * the ink. If one grows its own colour, the ground it composites goes
     * unchecked again — so the sheet is read for it rather than trusted.
     */
    for (const rule of ['.ps-points', ".ps-first[data-on='true']"]) {
      const open = css.indexOf(`\n${rule} {`);
      check(`${rule} is still a rule`, open > 0, rule);
      const body = css.slice(open, css.indexOf('\n}', open));
      check(
        `…and still draws its text in the ink`,
        body.includes('color: var(--accent-ink)'),
        rule,
      );
      check(
        `…on a 0.14 accent chip, which is the ground composited above`,
        body.includes('rgba(var(--accent-rgb), 0.14)'),
        rule,
      );
    }

    /* And the ramp is still a ramp. Three text steps that all clear the bar but
       land on top of each other is a screen with one grey, which is the failure
       mode of fixing contrast by darkening everything — the comment on
       `--text-fnt` in `site.css` says so, and this is what holds it. */
    const steps = ['text', 'text-mut', 'text-fnt'].map(token).map(luminance);
    check(
      'the light text ramp still climbs',
      steps[0] < steps[1] && steps[1] < steps[2],
      steps.map((one) => one.toFixed(3)).join(' < '),
    );
    check(
      '\u2026and its steps are far enough apart to read as three',
      steps[2] - steps[1] > 0.01 && steps[1] - steps[0] > 0.01,
      `${(steps[1] - steps[0]).toFixed(3)} and ${(steps[2] - steps[1]).toFixed(3)}`,
    );

    /*
     * Dark is untouched, checked as the absence of a change rather than as a
     * ratio: every value item 25 moved sits inside the light block above, so
     * the dark `.pd-app` block must still carry its own originals.
     */
    /* And the dark block by what it contains, for the reason the light one is:
       `.pd-app` opens a layout block long before it opens a token block, and
       an `indexOf` reads the wrong one. */
    const darkOpen = css.indexOf('--border: rgba(255, 255, 255, 0.09)');
    const dark = css.slice(Math.max(0, darkOpen - 1200), css.indexOf('\n}', darkOpen));
    check(
      "the dark dashboard's hairlines are untouched",
      dark.includes('--border: rgba(255, 255, 255, 0.09)') &&
        dark.includes('--border-2: rgba(255, 255, 255, 0.16)'),
    );
    check(
      "\u2026and so is its text ramp",
      dark.includes('--text-mut: rgba(242, 246, 244, 0.66)') &&
        dark.includes('--text-fnt: rgba(242, 246, 244, 0.44)'),
    );
  }

  /*
   * The two sanctioned hues clear AA on paper (item 25).
   *
   * `CLAUDE.md` licenses a warm red and an amber outside the palette, and that
   * licence is about the palette rather than about contrast -- both draw words
   * and figures, so both owe 4.5:1. Checked here because they are the two
   * colours in the sheet nobody thinks of as tokens: they are declared inside
   * the component that spends them, which is exactly why they were left at the
   * value dark mode uses.
   *
   * **Each is its own ground**, which is the trap this repeats from the accent
   * chip. A paused card washes itself in the amber at 0.05 and then puts the
   * amber on it at 0.18, so the ink sits on a surface tinted toward the ink and
   * a value that clears every flat ground can still fail by a mile.
   */
  {
    const css = readFileSync(new URL('../src/site/site.css', import.meta.url), 'utf8');

    const channel = (v: number): number => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const lum = ([r, g, b]: number[]): number =>
      0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    const ratio = (a: number[], b: number[]): number => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const hex = (value: string): number[] => {
      const n = Number.parseInt(value.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const over = (top: number[], alpha: number, ground: number[]): number[] =>
      top.map((c, i) => c * alpha + ground[i] * (1 - alpha));

    /* The light dashboard's grounds, restated rather than shared: this block
       reads its own values so a rename in the block above cannot silently stop
       it checking anything. */
    const FLATS = ['#ffffff', '#eef1f0', '#e6e9e8'].map(hex);

    /* Read a declaration out of one light-scoped rule. Anchored on the selector
       so it cannot pick up the dark value of the same property name -- which is
       the whole point of these being scoped. */
    const scoped = (selector: string, prop: string): string | null => {
      const open = css.indexOf(`:root[data-theme='light'] ${selector} {`);
      if (open < 0) return null;
      const body = css.slice(open, css.indexOf('\n}', open));
      /* `\\s` and not `\s`: inside a template literal the single
         backslash is dropped, so this read `--prop:s*(...)` and matched only
         because `.trim()` tidied the space it failed to consume. */
      const hit = new RegExp(`--${prop}:\\s*([^;]+);`).exec(body);
      return hit ? hit[1].trim() : null;
    };

    /*
     * The warm red. One value, three rules -- a custom property does not escape
     * the selector that declares it, so `.pd-danger`, `.pc-roster` and
     * `.pl-total` each restate it, and all three have to move together. That is
     * the failure this checks: two of three darkened reads as a theme bug on
     * whichever screen kept the old one.
     */
    const reds: Array<[string, string]> = [
      ['.pd-danger', 'danger'],
      ['.pc-roster', 'pc-risk'],
      [".pl-total[data-gap='true'] b", 'pl-gap'],
    ];
    const seen = new Set<string>();
    for (const [selector, prop] of reds) {
      const value = scoped(selector, prop);
      check(`${selector} scopes its warm red to light`, value !== null, selector);
      if (!value) continue;
      seen.add(value);
      const worst = Math.min(...FLATS.map((ground) => ratio(hex(value), ground)));
      check(
        `…and it clears 4.5:1 on paper`,
        worst >= 4.5 - 0.005,
        `${value} is ${worst.toFixed(2)}:1 at worst`,
      );
    }
    check('all three warm reds are the same value', seen.size === 1, [...seen].join(', '));

    /*
     * The amber, against its own tint. `0.05` is the paused card's wash and
     * `0.18` the pill on it, both read from the sheet rather than restated, so a
     * chip made stronger fails here instead of on paper.
     */
    const amber = scoped(".pl-card[data-live='false']", 'pl-amber-rgb');
    check('the paused card scopes its amber to light', amber !== null);
    if (amber) {
      const ink = amber.split(',').map((one) => Number(one.trim()));
      check('…as three channels', ink.length === 3 && ink.every(Number.isFinite), amber);
      /*
       * Only the alphas that are a **ground behind amber text**, which is a
       * narrower set than "every amber alpha in the sheet" and the difference
       * matters: a first pass swept up `0.34` (a border-color) and `0.38` (a
       * gradient stop) and failed at 3.30:1 against grounds no text is ever
       * drawn on. A check that fails on a combination the product cannot render
       * teaches the next person to darken a token for no reason.
       *
       * So the pairing is read: a rule that sets `background: rgba(amber, a)`
       * *and* `color: rgb(amber)` is a chip, and its `a` is a real ground. Today
       * that is `.pl-pill` at 0.18 and `.pl-chip` at 0.14.
       */
      const alphas: number[] = [];
      for (const body of css.split('}')) {
        if (!body.includes('color: rgb(var(--pl-amber-rgb))')) continue;
        const bg = /background:\s*rgba\(var\(--pl-amber-rgb\),\s*(0\.\d+)\)/.exec(body);
        if (bg) alphas.push(Number(bg[1]));
      }
      check('the amber chips are still amber-on-amber', alphas.length >= 2, alphas.join(', '));
      let worst = Infinity;
      for (const flat of FLATS) {
        const card = over(ink, 0.05, flat);
        worst = Math.min(worst, ratio(ink, card));
        for (const alpha of alphas) worst = Math.min(worst, ratio(ink, over(ink, alpha, card)));
      }
      check(
        '…and the amber clears 4.5:1 on its own chip',
        worst >= 4.5 - 0.005,
        `rgb(${amber}) is ${worst.toFixed(2)}:1 at worst`,
      );
    }

    /*
     * And dark is untouched. Checked as the presence of the originals, because
     * contrast is directional: the same darkening that fixes paper moves these
     * toward a near-black ground rather than away from it.
     */
    check(
      "the dark dashboard keeps its own warm red",
      css.includes('--danger: #d9483b') && css.includes('--pc-risk: #d9483b'),
    );
    check(
      '…and its own amber',
      css.includes('--pl-amber-rgb: 226, 170, 90'),
    );
  }

  /*
   * The partner plan panel (item 24).
   *
   * `PARTNER_PLAN_ROWS` holds the comparison's order and **none of its
   * figures** — every number comes from `plan_entitlements` on the server — so
   * what there is to check here is the alignment and the labels, which is
   * exactly the half a type can not catch: `Dictionary` proves `rows` exists
   * and says nothing about its length.
   *
   * The failure it prevents is the one this repo has had twice. A row added to
   * the table without a label in five dictionaries renders `undefined`, and the
   * version of the same mistake that survives longer is a *short* array: the
   * last row of the comparison silently loses its name in four languages and
   * nobody who reads English ever sees it.
   */
  {
    for (const code of LANGUAGE_ORDER) {
      const panel = LANGUAGES[code].dashboard.planPanel;
      check(
        `${code} labels every comparison row`,
        panel.rows.length === PARTNER_PLAN_ROWS.length,
        `${panel.rows.length} labels, ${PARTNER_PLAN_ROWS.length} rows`,
      );
      check(
        `…and none of them is blank`,
        panel.rows.every((row) => row.trim() !== ''),
        panel.rows.filter((row) => row.trim() === '').length + ' blank',
      );
      /* The four `subscriptions.source` values, named. A venue owner reading a
         plan they did not buy needs to know whether somebody paid for it. */
      for (const source of ['manual', 'stripe', 'apple', 'google'] as const) {
        check(
          `${code} names the ${source} source on the panel`,
          typeof panel.sources[source] === 'string' && panel.sources[source].trim() !== '',
        );
      }
      /* The holes. `usage` is the pairing the panel exists for — "3 of 5" —
         and a string that lost either half is a figure with no comparison. */
      check(
        `${code}: the usage pairing says both halves`,
        panel.usage.includes('{used}') && panel.usage.includes('{total}'),
        panel.usage,
      );
      check(`${code}: the price says the amount`, panel.perMonth.includes('{amount}'));
      check(`${code}: the renewal says the date`, panel.renews.includes('{date}'));
      check(`${code}: the dated change says the date`, panel.until.includes('{date}'));
      /* And the plan box's own two keys, which the rail reads when the session
         has not answered yet. `unknown` must not be a plan *name*: falling back
         to "Growth" would label every venue as the middle tier. */
      const box = LANGUAGES[code].dashboard.plan;
      check(`${code}: the box has a word for an unknown plan`, box.unknown.trim() !== '');
      check(`${code}: …and one for what the press does`, box.open.trim() !== '');
    }

    /* The hero split has to fit inside the table, or `slice` silently draws
       fewer rows than the panel claims. Four, which is the capacity block. */
    check(
      'the panel headline rows are a prefix of the comparison',
      PARTNER_PLAN_HERO > 0 && PARTNER_PLAN_HERO < PARTNER_PLAN_ROWS.length,
      String(PARTNER_PLAN_HERO),
    );
    /* The first four are the *counted* ones, because only a count can be shown
       as "3 of 5" — a yes/no entitlement has nothing to be three of, and the
       panel's usage list would draw a tick where a pairing belongs. */
    check(
      '…and every one of them is a number',
      PARTNER_PLAN_ROWS.slice(0, PARTNER_PLAN_HERO).every((row) => row.kind === 'number'),
      PARTNER_PLAN_ROWS.slice(0, PARTNER_PLAN_HERO).map((row) => row.kind).join(', '),
    );
    /* No key twice: the comparison reads each by name out of the server's
       entitlement rows, so a duplicate would draw one row twice and hide
       whichever it displaced. */
    check(
      'no entitlement key appears twice',
      new Set(PARTNER_PLAN_ROWS.map((row) => row.key)).size === PARTNER_PLAN_ROWS.length,
    );
  }

  /*
   * The console's Tiers tab (item 23).
   *
   * `ADMIN_TABS` is icons and `copy.admin.tabs` is labels, and they are held
   * together by position alone — a sixth of one without a sixth of the other
   * renders a tab with no name or a name with no icon, in whichever languages
   * were missed. The tab was **appended** rather than inserted, so nothing that
   * branches on `tab === 0..4` in `admin.tsx` moved; this pins that, because
   * inserting it later would be the change that silently re-points four
   * branches.
   *
   * The copy checks are the two sentences that are rules rather than labels.
   * `propagation` is the one an operator acts on — it says the server answers
   * with the new plan at once and a browser somebody else has open does not —
   * and `noteHelp` says what the reason field is for, which is the only thing
   * the audit row cannot say for itself.
   */
  {
    check(
      'every console tab has an icon',
      ADMIN_TABS.length === en.admin.tabs.length,
      `${ADMIN_TABS.length} icons, ${en.admin.tabs.length} labels`,
    );
    check('the Tiers tab is the sixth', en.admin.tabs.length === 6, en.admin.tabs.join(', '));
    /* Appended, so the four `tab === n` branches in `admin.tsx` still point at
       the screens they were written for. */
    check(
      '…and the first five are where they were',
      ADMIN_TABS.slice(0, 5).join() === 'briefcase,ticket,people,bars,send',
      ADMIN_TABS.join(),
    );
    check(
      'its icon is not one another tab already uses',
      ADMIN_TABS.filter((icon) => icon === ADMIN_TABS[5]).length === 1,
      ADMIN_TABS[5],
    );

    /* `subscriptions.source` is a CHECK-constrained set of four on the server,
       and the console names each — a miss falls through to the raw value, which
       is checked in the component rather than here, but a *missing* name is a
       badge reading `apple` to a Russian operator. */
    const SOURCES = ['manual', 'stripe', 'apple', 'google'] as const;
    for (const code of LANGUAGE_ORDER) {
      const tiers = LANGUAGES[code].admin.tiers;
      check(`${code} names the Tiers tab`, LANGUAGES[code].admin.tabs[5].trim() !== '');
      for (const source of SOURCES) {
        check(
          `${code} names the ${source} source`,
          typeof tiers.sources[source] === 'string' && tiers.sources[source].trim() !== '',
          tiers.sources[source],
        );
      }
      check(
        `${code} labels all five columns`,
        tiers.columns.length === 5 && tiers.columns.every((one) => one.trim() !== ''),
        tiers.columns.join(', '),
      );
      /* The holes, by the sentence that needs them. A confirmation that lost
         its `{plan}` says a tier was assigned without saying which. */
      check(`${code}: the confirmation names the plan`, tiers.didAssign.includes('{plan}'));
      check(
        `${code}: the scheduled one names the plan and the date`,
        tiers.didSchedule.includes('{plan}') && tiers.didSchedule.includes('{from}'),
        tiers.didSchedule,
      );
      /* And the two sentences that carry a rule rather than a label. */
      check(
        `${code}: propagation is explained rather than claimed`,
        tiers.propagation.length > 60,
        String(tiers.propagation.length),
      );
      check(`${code}: the reason field says what it is for`, tiers.noteHelp.length > 20);
      /* Two dates and two states: "in force from today" and "nothing changes
         until that day" are the pair an operator reads before pressing, and a
         screen that said only one of them would be the screen that surprises
         somebody. */
      check(`${code}: today is explained`, tiers.fromNow.trim() !== '');
      check(`${code}: a dated change is explained`, tiers.fromLater.trim() !== '');
    }
  }

  /*
   * The voucher register (item 21) — the screen and its copy.
   *
   * Three things it has to be true of, and each has already been the failure
   * mode of adding a screen to this rail:
   *
   *  - The **index**. `DASH_SCREENS`, `copy.dashboard.screens`, the `SCREENS`
   *    table in `dashboardScreens.tsx` and every hard-coded `empty[n]` are four
   *    lists held together by position alone. The length check above catches a
   *    short array and says nothing about the *order*, so the register is
   *    pinned where it is: immediately after the ladder it is the other half
   *    of, which is also where the rail draws it.
   *  - Every **status** is named. `copy.register.status` is indexed by the
   *    column's own vocabulary, so a fifth status added to `issued_vouchers`
   *    would render its raw id — the lookup-that-misses failure this dashboard
   *    has already had twice (`quiet hours`, `newcomer`).
   *  - Every **hole** is there. A `fill()` target whose string lost its hole
   *    prints the sentence without the number, which is the one thing a count
   *    against a limit cannot do.
   */
  {
    check(
      'the register sits straight after the ladder',
      DASH_SCREENS[4].id === 'issued',
      DASH_SCREENS[4].id,
    );
    check('…and the ladder is still where it was', DASH_SCREENS[3].id === 'vouchers');
    /* The profile stays last: `DashboardPage` renders it from
       `DASH_SCREENS.length - 1` rather than by id. */
    check(
      '…and the profile is still last',
      DASH_SCREENS[DASH_SCREENS.length - 1].id === 'profile',
    );
    check(
      'its icon is not one the rail already uses twice',
      DASH_SCREENS.filter((entry) => entry.icon === DASH_SCREENS[4].icon).length === 1,
      DASH_SCREENS[4].icon,
    );

    /* The four statuses `issued_vouchers.status` can hold, plus the filter's
       own word for "do not filter". Written out rather than imported: `server/`
       and `src/` share no code, which is the whole architecture, so this list
       being a copy is the point — and a copy that drifts is exactly what this
       check is for. */
    const STATUSES = ['all', 'active', 'redeemed', 'expired', 'cancelled'] as const;
    for (const code of LANGUAGE_ORDER) {
      const register = LANGUAGES[code].dashboard.register;
      for (const status of STATUSES) {
        check(
          `${code} names the ${status} status`,
          typeof register.status[status] === 'string' && register.status[status].trim() !== '',
          register.status[status],
        );
      }
      check(`${code} names the screen`, LANGUAGES[code].dashboard.screens[4].name.trim() !== '');
      check(`${code} says what would fill it`, LANGUAGES[code].dashboard.empty[4].body.trim() !== '');
      /* The holes, by the sentence that needs them. */
      check(`${code}: the rung names its percentage`, register.caps.rung.includes('{pct}'));
      check(
        `${code}: a count against a cap says both`,
        register.caps.taken.includes('{n}') && register.caps.taken.includes('{total}'),
        register.caps.taken,
      );
      check(`${code}: an uncapped count still says the count`, register.caps.takenNoCap.includes('{n}'));
      check(
        `${code}: the page count says both`,
        register.list.count.includes('{n}') && register.list.count.includes('{total}'),
      );
      check(`${code}: the lapsing note says how many`, register.totals.lapsing.includes('{n}'));
      /* And the two sentences that are rules rather than labels — see the block
         comment on `register` in `en.ts`. A withheld name has to say *why* it is
         missing, or the em dash reads as a figure nobody could read. */
      check(
        `${code}: a withheld holder explains itself`,
        register.table.withheld.length > 30,
        register.table.withheld,
      );
      check(
        `${code}: the limits note says an empty field means none`,
        register.caps.noLimitNote.length > 30,
      );
    }
  }

  /*
   * The scan log is the same story as the roster above: forty-eight rows were
   * generated from the row index — a campaign card with a `done`/`need`
   * progress bar, a name looked up in `PD_SCAN_NAMES` — and there is no
   * endpoint that lists a venue's scans, so `PD_SCANS` is `[]` and `ScanRow`
   * has none of those fields. Three of the five checks read them and would not
   * compile; the other two passed over nothing. All five are gone, and the
   * screen says the log is unavailable rather than drawing one.
   *
   * `PD_SCAN_TOTAL` is what is left, and it is worth one line: the pager
   * divides by `PD_SCAN_PAGE`, and a page size of 0 is a division by zero on a
   * screen with nothing to page.
   */
  check(
    'an empty scan log still has a page size to divide by',
    PD_SCANS.length === 0 && PD_SCAN_TOTAL === 0 && PD_SCAN_PAGE > 0,
  );

  /*
   * `unit` money, which this screen is the reason for. A cost per claim is
   * under a pound, and the other three rounding modes all take it to "£1" —
   * which turned three different figures in the ROI panel into the same one.
   */
  /* Keyed by **currency** now rather than by language — the two came apart, so
     a table indexed by `LanguageCode` could no longer express "reading in
     Russian, paying in zloty". See `CURRENCIES` in `i18n/currency.ts`. */
  const gbp = CURRENCIES.GBP;
  const soum = CURRENCIES.UZS;
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

/* ═══════════════════════════════════════════ what a new account holds ══ */

console.log('\na new account has earned nothing');

{
  /*
   * The bug this exists to stop shipped once and was visible on the first
   * screen: every new sign-up was handed the *demo* player — 340 points, a
   * three-day streak, 45 answered, four vouchers and three stamp cards — so
   * somebody who had played nothing opened L-Earn on 340, took the 100-point
   * welcome gift, and read 440 before their first round.
   *
   * The rule is one sentence: **the only points a new player has not earned are
   * the welcome gift.** Everything below is that sentence, checked.
   */
  const fresh = freshPlayer();

  check('a new player starts on zero points', fresh.points === 0, String(fresh.points));
  check('…with no streak', fresh.streak === 0);
  check('…having answered nothing', fresh.answered === 0 && fresh.correct === 0);
  check('…and never having played', fresh.lastPlayed === null);
  /* A freeze is earned at a streak milestone. Handing one over at sign-up is
     the same category of gift as the points. */
  check('…and no freeze in hand', fresh.freezes === 0);
  /* There is no wallet on this object any more to be empty. What somebody holds
     is `GET /v1/wallet`, so the check that matters is that nothing here is
     pretending to hold anything — a `vouchers: []` left behind would be a shape
     the next screen could start writing to again. */
  check(
    '…and no wallet on it at all',
    !('vouchers' in fresh) && !('stamps' in fresh) && !('deals' in fresh),
    Object.keys(fresh).join(','),
  );
  /* The tank is the one thing that *is* full, and it has to be: energy is not
     earned, it is the limiter on a day, and a new player who cannot play is a
     new player who leaves. */
  check('…but a full tank', fresh.energy === MAX_ENERGY, String(fresh.energy));
  check('…with no regen clock running', fresh.energyAt === null);

  /* The first balance anybody can honestly see. */
  check(
    'the first balance a player can see is the welcome gift alone',
    fresh.points + WELCOME_POINTS === WELCOME_POINTS,
    String(fresh.points + WELCOME_POINTS),
  );

  /*
   * And nothing ships ahead of a new one.
   *
   * There was a demo account here, and this checked it was *further along*
   * than a fresh sign-up — it had points and a streak, and the failure being
   * guarded against was a build that handed a new player the demo’s numbers.
   * The account is gone, so the guard inverts: what must be true now is that
   * the bundle contains no balance at all, because a balance is something the
   * ledger says a person earned, and there is no ledger in a JavaScript file.
   */
  check('no account ships with a balance', SEED_USERS.every((u) => !u.player));
  check('…because no account ships at all', SEED_USERS.length === 0);

  /*
   * **The path an actual sign-up takes**, which is the one that was still
   * wrong after the first fix.
   *
   * `newPlayer` was pointed at from `AuthProvider.setType` and from the
   * directory's backfill, and both of those are the *unusual* routes — a
   * session that predates the field, or a visitor answering the account-type
   * question late. The ordinary route is `newUser`, it had its own
   * `seedPlayer()` call, and it kept handing out 340 points to every sign-up
   * until a browser check caught it. So it is checked here rather than
   * anywhere else: this is the function the form calls.
   */
  const signedUp = newUser({
    name: 'Fresh Tester',
    email: 'fresh@example.com',
    password: 'testing-1234',
    type: 'individual',
    acceptTerms: true,
  }, 'u_fresh', '2026-08-31');
  check('a sign-up produces an empty player', signedUp.player?.points === 0,
    String(signedUp.player?.points));
  check('…and no streak', signedUp.player?.streak === 0);
  check('…and it is exactly `newPlayer`',
    JSON.stringify(signedUp.player) === JSON.stringify(fresh));
  /* A business sign-up has no player at all, which is a different answer from
     an empty one and has to stay that way. */
  const owner = newUser({
    name: 'Venue Owner',
    email: 'owner@example.com',
    password: 'testing-1234',
    type: 'business',
    acceptTerms: true,
  }, 'u_owner', '2026-08-31');
  check('a business sign-up has no player state', owner.player === null);
}

/* ══════════════════════════════════════════════════ the plan table ══ */

console.log('\nthe plan table says what the product does');

{
  /*
   * The drift this exists to catch has already happened once.
   *
   * The free tank went from three to four when energy started being spent on
   * every round, and this table kept advertising three for a day — the landing
   * page offering a smaller free tier than the product was handing out. The
   * front end cannot see the server's `CONFIG.points`, so the mirror is
   * manual; what it *can* see is `player.ts`, which holds the same two free-plan
   * figures for the same reason. Checking the free column against those is the
   * one end of the mirror this side of the wire can hold.
   */
  const [energy, refill, multiplier] = SUB_ROWS;
  check('the free tank on the plan table is the tank the site gives you',
    energy.values[0] === MAX_ENERGY, `${energy.values[0]} vs ${MAX_ENERGY}`);
  check('…and its refill is the site’s, in minutes',
    refill.values[0] === ENERGY_REGEN_MINUTES,
    `${refill.values[0]} vs ${ENERGY_REGEN_MINUTES}min`);
  check('…and the free plan pays a plain single rate', multiplier.values[0] === 1);

  /* Every paid tier is an improvement on the one below it, on the three figures
     the card leads with. A plan that charged more for less energy would be a
     typo nobody would notice in a table this wide. */
  check('energy climbs with the price', energy.values[1]! > energy.values[0]!
    && energy.values[2]! > energy.values[1]!);
  check('…and the wait comes down', refill.values[1]! < refill.values[0]!
    && refill.values[2]! < refill.values[1]!);
  check('…and a round pays more', multiplier.values[1]! > multiplier.values[0]!
    && multiplier.values[2]! > multiplier.values[1]!);

  /* The card splits the table by index, so the indices have to be inside it and
     the three parts have to exhaust it — a row that fell in the gap between the
     strip and the list would simply stop being shown, silently. */
  check('the strip and the seal are inside the table',
    SUB_HERO < SUB_BADGE_ROW && SUB_BADGE_ROW === SUB_ROWS.length - 1);
  check('…and the three parts exhaust it',
    SUB_HERO + (SUB_BADGE_ROW - SUB_HERO) + 1 === SUB_ROWS.length);
  check('the seal row is the badge row', SUB_ROWS[SUB_BADGE_ROW].kind === 'badge');
  check('…and it is the only one', SUB_ROWS.filter((r) => r.kind === 'badge').length === 1);

  /* A seal is an index into `copy.badges`, so a third value would print
     `undefined` on the card rather than fail anywhere. */
  check('every seal names a badge the dictionaries carry',
    SUB_ROWS[SUB_BADGE_ROW].values.every((v) => v === 0 || (v === 1 || v === 2)));

  /* The three columns are the three plans, read straight across. */
  check('every row has one value per plan',
    SUB_ROWS.every((row) => row.values.length === SUB_PLANS.length));

  /*
   * The day the card leads with, and the two things it must never stop being.
   *
   * `subRoundsPerDay` is the tank plus what the refill clock hands back, and it
   * is the one figure on the section that is not printed anywhere in the table
   * it is derived from — so nothing else would notice if it drifted. The two
   * rows behind it are checked above; these check the multiplication and, more
   * importantly, its *direction*: the chip beside the figure is written "+{n}",
   * so a paid plan whose day came out no bigger than the free one would print a
   * plus sign in front of nothing, or a minus after one.
   */
  const days = SUB_PLANS.map((_, i) => subRoundsPerDay(i));
  check('a day is the tank plus what the clock gives back',
    days.every((day, i) => day === (SUB_ROWS[0].values[i] as number)
      + Math.floor((24 * 60) / (SUB_ROWS[1].values[i] as number))),
    String(days));
  check('…and every paid day is bigger than the free one',
    days[1] > days[0] && days[2] > days[1], String(days));
  /* The floor in `subRoundsPerDay` is there for a refill that does not divide
     the day, and while all three do, the figure on the card is the whole of
     what the clock hands back rather than a rounding of it. The day one of them
     stops dividing, this is what says so — the card will then be advertising a
     round short, which is the right direction to be wrong in and still worth
     knowing about rather than discovering. */
  check('…and every refill divides the day, so the floor takes nothing',
    SUB_ROWS[1].values.every((m) => (24 * 60) % (m as number) === 0),
    String(SUB_ROWS[1].values));

  /*
   * The lit cells. The free column may never light one — it is the column the
   * others are measured against — and each paid tier must light at least one,
   * or a card is charging for a table it does not improve.
   */
  const listRows = SUB_ROWS.map((_, i) => i).slice(SUB_HERO, SUB_BADGE_ROW);
  check('the free column marks nothing as a gain',
    listRows.every((row) => !subBeatsFree(row, 0)));
  check('…and both paid columns mark something',
    listRows.some((row) => subBeatsFree(row, 1))
    && listRows.some((row) => subBeatsFree(row, 2)));
  /* The one row where less is better. Read straight, 60 minutes would be the
     worse cell on the more expensive card. */
  check('…and a faster refill counts as a gain, not a loss',
    subBeatsFree(1, 1) && subBeatsFree(1, 2));

  for (const code of LANGUAGE_ORDER) {
    const sub = LANGUAGES[code].subscription;
    check(`${code} labels every row`, sub.rows.length === SUB_ROWS.length,
      `${sub.rows.length} of ${SUB_ROWS.length}`);
    check(`…and every figure in the strip`, sub.heroRows.length === SUB_HERO,
      `${sub.heroRows.length} of ${SUB_HERO}`);
    check(`…and names both seals`, sub.badges.length === 2);
    check(`…and its seal label has a name to put in it`, sub.mark.includes('{name}'),
      sub.mark);
    /* The step-up chip names the plan it counts from, so it cannot start
       calling the free tier something the card above it does not. */
    check(`…and its step-up chip has both holes`,
      sub.day.vs.includes('{n}') && sub.day.vs.includes('{plan}'), sub.day.vs);
    check(`…and the day carries its unit and its reading`,
      sub.day.rounds.trim().length > 0 && sub.day.from.trim().length > 0);
    check(`…and nothing in the strip is blank`,
      sub.heroRows.every((label) => label.trim().length > 0));
    /* The unit lives in the label, which is the rule that keeps "hours" and
       "days" translatable. A stray unit welded to a figure would show up as a
       Latin letter in the Cyrillic dictionaries, so this is checked where it
       can actually be seen. */
    check(`…and every plan is named`, sub.plans.length === SUB_PLANS.length);
  }
}

/* ═══════════════════════════════════════ accounts and listings come home ══ */

/*
 * A listing as the partner routes answer it, shared by the two sections below:
 * a café waiting for review, with a description in two languages, a link kind
 * the form has no field for, and a spoken language its chips do not offer —
 * the three cases the mapping in `api/listing.ts` exists to get right.
 */
const LISTING_FIXTURE: ListingSource = {
  id: 'ven_fixture',
  name: 'Café Bratysławska',
  category: 'cafe',
  subcategory: 'Specialty coffee',
  city: 'Krakow',
  countryCode: 'PL',
  address: 'Bratysławska 6',
  priceRange: '18–45 zł',
  phone: '+48 512 340 118',
  email: 'hello@bratyslawska.pl',
  imageUrl: 'data:image/jpeg;base64,xyz',
  status: 'pending_review',
  verifiedAt: null,
  verification: { status: 'pending', submittedAt: '2026-09-01T10:00:00Z', note: null },
  description: { en: 'A small neighbourhood café.', pl: 'Mała kawiarnia na Kleparzu.' },
  links: [
    { kind: 'website', value: 'https://bratyslawska.pl' },
    { kind: 'google_maps', value: 'https://maps.google.com/?q=bratyslawska' },
    { kind: 'tiktok', value: 'https://tiktok.com/@bratyslawska' },
  ],
  languages: ['pl', 'en', 'de'],
};

console.log('\nhydration — what the server says an account is');
{
  /*
   * The bug this section exists for: a sign-in wrote the server's id and name
   * into the mirror and nothing else, so an owner on a second device was asked
   * "individual or business?" again, a returning player was walked through
   * onboarding again, and the profile page was empty while the server held it.
   */
  check('an operator is an operator whatever this browser thought',
    typeFromRoles(['consumer', 'admin'], 'individual', null) === 'admin');
  check('an owner is an owner on a device that never heard of them',
    typeFromRoles(['consumer', 'partner_owner'], null, null) === 'business');
  check('a consumer role keeps the answer this browser had',
    typeFromRoles(['consumer'], 'individual', null) === 'individual');
  check('…including "business", chosen before the role landed',
    typeFromRoles(['consumer'], 'business', null) === 'business');
  check('an account nobody typed that finished onboarding is a player',
    typeFromRoles(['consumer'], null, '2026-05-01T10:00:00Z') === 'individual');
  check('one that has answered nothing anywhere stays undecided',
    typeFromRoles(['consumer'], null, null) === null);
  check('a local admin the server no longer vouches for is not kept',
    typeFromRoles(['consumer'], 'admin', null) === null);

  const me = (
    user: Partial<Me['user']> = {},
    roles: string[] = ['consumer'],
    venues: Me['venues'] = [],
  ): Me => ({
    user: {
      id: 'u_server', email: 'kasia@example.com', name: 'Kasia', username: null, language: 'en',
      city: null, countryCode: null, avatar: null, phone: null, occupation: null, birthDate: null,
      birthDateChangesLeft: 2, profileCompletedAt: null, onboardedAt: null, trustTier: 0,
      /* Proved, because this fixture stands in for an account the mirror is
         being asked to fold — and the unverified case is not what these checks
         are about. The server's own suite has a section for it. */
      emailVerifiedAt: '2026-03-01T09:05:00Z',
      /* On, which is the default — these checks are about the mirror folding a
         server answer, not about §1.4. */
      venueSharingDefault: true,
      leaderboardOptIn: false, referralCode: 'KASIA1', createdAt: '2026-03-01T09:00:00Z',
      ...user,
    },
    roles,
    mode: 'consumer',
    points: 140,
    plan: { code: 'free', name: 'Free', audience: 'consumer' },
    entitlements: { daily_energy: '4', energy_regen_minutes: '120' },
    venues,
  });

  /* What a sign-in leaves on a device that has never seen this account. */
  const blank: Account = {
    id: 'u_server', name: 'Kasia', email: 'kasia@example.com', type: null, business: null,
    player: null, profile: EMPTY_PROFILE, onboardedAt: null, profileCompletedAt: null,
  };
  const answers = (server: Me, listing: ListingSource | null = null) =>
    ({ me: server, games: null, listing });

  const player = foldServer(blank, answers(me({
    username: 'kasia', city: 'Krakow', countryCode: 'PL', phone: '+48 600 000 000',
    occupation: 'student', birthDate: '1998-03-14', birthDateChangesLeft: 1,
    onboardedAt: '2026-03-02T10:00:00Z', profileCompletedAt: '2026-03-03T10:00:00Z',
  })), 'en');
  check('a returning player comes home as a player', player.type === 'individual');
  check('…and is not walked through onboarding again', resolveRoute('landing', player) === 'landing');
  check('…with the profile the server holds',
    player.profile.username === 'kasia' && player.profile.city === 'Krakow'
      && player.profile.countryCode === 'PL' && player.profile.occupation === 'student'
      && player.profile.birthDate === '1998-03-14');
  check('…the birthday correction the server has counted', player.profile.birthDateChangesLeft === 1);
  check('…the completion stamp, so the bonus is not offered twice',
    player.profileCompletedAt === '2026-03-03T10:00:00Z');
  check('…and the ledger balance', player.player?.points === 140);

  const edited: Account = {
    ...blank, type: 'individual', onboardedAt: '2026-03-02',
    profile: { ...EMPTY_PROFILE, phone: '+48 511 111 111' },
  };
  check('an answer the server was never given keeps the one saved here',
    profileFromServer(me().user, edited.profile).phone === '+48 511 111 111');
  check('…and an answer it has wins',
    profileFromServer(me({ phone: '+48 600 000 000' }).user, edited.profile).phone === '+48 600 000 000');
  check('a status outside the five is not adopted',
    profileFromServer(me({ occupation: 'headline' }).user, EMPTY_PROFILE).occupation === '');
  check('a city and its country move as a pair', (() => {
    const place = profileFromServer(
      me({ city: 'Berlin', countryCode: 'DE' }).user,
      { ...EMPTY_PROFILE, city: 'Krakow', countryCode: 'PL' },
    );
    return place.city === 'Berlin' && place.countryCode === 'DE';
  })());
  check('a completion stamp this browser holds is not cleared',
    foldServer({ ...edited, profileCompletedAt: '2026-04-01' }, answers(me()), 'en')
      .profileCompletedAt === '2026-04-01');
  check('…nor a finished welcome flow', foldServer(edited, answers(me()), 'en').onboardedAt === '2026-03-02');

  const owner = foldServer(blank, answers(
    me({}, ['consumer', 'partner_owner'], [
      { id: 'ven_fixture', name: 'Café Bratysławska', city: 'Krakow', status: 'pending_review' },
    ]),
    LISTING_FIXTURE,
  ), 'en');
  check('an owner on a new device comes home as an owner', owner.type === 'business' && owner.player === null);
  check('…with the listing the server holds',
    owner.business?.name === 'Café Bratysławska' && owner.business?.venueId === 'ven_fixture');
  check('…so signing in lands on the dashboard, not on setup', resolveRoute('signin', owner) === 'dashboard');
  check('…and the dashboard keeps them', resolveRoute('dashboard', owner) === 'dashboard');
  const unlisted = foldServer(blank, answers(me({}, ['consumer', 'partner_owner'])), 'en');
  check('an owner with nothing on the server still goes to setup',
    resolveRoute('signin', unlisted) === 'business-setup');

  let unstable = '';
  for (const account of [player, owner, unlisted, foldServer(blank, answers(me()), 'en')]) {
    for (const route of Object.keys(PATHS) as Route[]) {
      const once = resolveRoute(route, account);
      if (resolveRoute(once, account) !== once) unstable = `${account.type}: ${route} → ${once}`;
    }
  }
  check('every account the server hands back resolves to a fixed point', unstable === '', unstable || 'no loops');

  /* The reload hold: which stored sessions wait for the server before a page is
     drawn, so that a fact this browser never saw cannot route anybody. */
  const unseenPlayer: Account = { ...blank, type: 'individual' };
  const unseenListing: Account = { ...blank, type: 'business' };
  check('a player whose finished onboarding this browser never saw waits before any page is drawn',
    awaitsServer(unseenPlayer, 'profile') && awaitsServer(unseenPlayer, 'landing'));
  check('…including a reload on the welcome flow itself', awaitsServer(unseenPlayer, 'onboarding'));
  check('an owner whose listing this browser never saw waits before being sent to setup',
    awaitsServer(unseenListing, 'dashboard') && awaitsServer(unseenListing, 'business-setup'));
  check('…but not on a page where nothing would move', !awaitsServer(unseenListing, 'landing'));
  check('an account whose type is unknown here waits', awaitsServer(blank, 'landing') && awaitsServer(blank, 'signin'));
  check('an account holding every routing fact never waits',
    !awaitsServer(player, 'profile') && !awaitsServer(owner, 'dashboard') && !awaitsServer(unlisted, 'landing'));
  check('nobody signed in never waits', !awaitsServer(null, 'dashboard'));

  /* The tank, converted from "this many, the next at" to the mirror's anchor. */
  const nextAt = '2026-09-11T13:10:00.000Z';
  const games: GamesState = {
    energy: { energy: 2, max: 4, nextAt }, streak: 7, longestStreak: 9, freezes: 1,
    answered: 50, correct: 41, points: 640, lastPlayed: '2026-09-11', dailyWord: null,
  };
  const mirrored = playerFromGames(freshPlayer(), games, 120);
  const tank = energyOf(mirrored, new Date('2026-09-11T12:00:00Z'), { max: 4, regenMinutes: 120 });
  check('the mirrored tank reads the count the server gave', tank.count === 2, `${tank.count}`);
  check('…and the same wait', tank.nextAt === Date.parse(nextAt));
  check('…and every other figure is the server’s',
    mirrored.points === 640 && mirrored.streak === 7 && mirrored.freezes === 1
      && mirrored.answered === 50 && mirrored.lastPlayed === '2026-09-11');
  const topped = playerFromGames(freshPlayer(), { ...games, energy: { energy: 4, max: 4, nextAt: null } }, 120);
  check('a full tank is stored with no clock running',
    topped.energyAt === null && energyOf(topped, new Date()).count === MAX_ENERGY);

  const body = profileWrite({
    username: ' kasia ', occupation: '', phone: '', birthDate: '1998-03-14',
    avatar: 'https://base44.app/api/face.png', place: { city: 'Nowhere', countryCode: 'pl' },
  });
  check('a save leaves blank answers out', !('phone' in body) && !('occupation' in body));
  check('…trims what it sends', body.username === 'kasia' && body.birthDate === '1998-03-14');
  check('…sends a country as its code', body.city === 'Nowhere' && body.countryCode === 'PL');
  check('…and never a picture this site did not make',
    !('avatar' in body) && profileWrite({ avatar: 'data:image/jpeg;base64,x' }).avatar === 'data:image/jpeg;base64,x');
  check('only a data URL is a picture this site draws',
    isPicture('data:image/png;base64,x') && !isPicture('https://base44.app/a.png') && !isPicture(''));

  const refused = (status: number, code: string, field: string | null, message: string) => {
    const result = profileRefusal(status, code, field, message);
    return result.ok ? 'ok' : `${result.field}:${result.error}`;
  };
  check('a handle somebody holds is taken',
    refused(409, 'conflict', 'username', 'that username is taken') === 'username:taken');
  check('a reserved handle is reserved',
    refused(400, 'validation_failed', 'username', 'that username is reserved') === 'username:reserved');
  check('a short handle is its length',
    refused(400, 'validation_failed', 'username', 'a username is 3 to 20 characters') === 'username:length');
  check('the birthday limit is spent',
    refused(409, 'conflict', 'birthDate', 'a birthday can be corrected once — contact support to have it changed again')
      === 'birthDate:spent');
  check('a birthday not in the past is in the future',
    refused(400, 'validation_failed', 'birthDate', 'a birthday is in the past') === 'birthDate:future');
  check('a phone refusal is its shape',
    refused(400, 'validation_failed', 'phone', 'that does not look like a phone number') === 'phone:shape');
  check('an unknown city with no country asks for the country',
    refused(400, 'validation_failed', 'countryCode', 'we do not know that city — pick the country it is in')
      === 'country:needed');
  check('a country that is not a code says so',
    refused(400, 'validation_failed', 'countryCode', 'a country is a two-letter code, like PL') === 'country:shape');
  check('an expired sign-in is its own answer', refused(401, 'unauthenticated', null, 'sign in first') === 'null:session');
  check('anything else refuses the save as a whole',
    refused(500, 'internal', null, 'something went wrong') === 'null:refused');
}

console.log('\nthe listing, both ways');
{
  const read = businessFromSource(LISTING_FIXTURE, 'pl', null);
  check('a listing reads onto the form',
    read.name === 'Café Bratysławska' && read.street === 'Bratysławska 6' && read.price === '18–45 zł'
      && read.logo === LISTING_FIXTURE.imageUrl && read.country === 'pl' && read.city === 'Krakow');
  check('…its category and subcategory by their words',
    read.category === 'cafe' && read.subcategory === 0 && read.unmapped === undefined);
  check('…its description in the reader’s language',
    read.description === 'Mała kawiarnia na Kleparzu.' && read.descriptionLanguage === 'pl');
  check('…its links by kind',
    read.website === 'https://bratyslawska.pl'
      && read.maps === 'https://maps.google.com/?q=bratyslawska' && read.instagram === '');
  check('…the languages its chips offer', read.spoken.join(',') === 'pl,en');
  check('…and a finished one reads back as publishable', isBusinessReady(read));
  check('an English reader gets English',
    businessFromSource(LISTING_FIXTURE, 'en', null).description === 'A small neighbourhood café.');
  check('a reader in a language with no text falls back to English',
    pickDescription(LISTING_FIXTURE.description, 'uk')?.language === 'en');
  check('…and with no English, to the first language there is',
    pickDescription({ pl: 'Tekst' }, 'uz')?.language === 'pl');

  const unchanged = listingWrite(read, LISTING_FIXTURE, 'pl');
  check('an unchanged description is not sent again', unchanged.description === undefined);
  check('a link the form cannot show goes back as it came',
    (unchanged.links ?? []).some((link) => link.kind === 'tiktok'));
  check('…beside the ones it can',
    (unchanged.links ?? []).find((link) => link.kind === 'google_maps')?.value
      === 'https://maps.google.com/?q=bratyslawska');
  check('a language the chips do not offer is kept',
    (unchanged.languages ?? []).includes('de') && (unchanged.languages ?? []).includes('pl'));
  check('a subcategory is written as its English label', unchanged.subcategory === 'Specialty coffee');
  check('…and every label reads back to its own index',
    BUSINESS_CATEGORIES.every(({ id, subs }) =>
      Array.from({ length: subs }, (_, index) => subcategoryIndex(id, subcategoryWord(id, index)) === index)
        .every(Boolean)));
  check('…including a Polish one written by another client', subcategoryIndex('cafe', 'Kawa specialty') === 0);
  check('every language names as many subcategories as the form offers',
    LANGUAGE_ORDER.every((code) =>
      BUSINESS_CATEGORIES.every(({ subs }, at) => LANGUAGES[code].listing.subcategories[at]?.length === subs)));

  const rewritten = listingWrite({ ...read, description: 'Nowy opis.' }, LISTING_FIXTURE, 'en');
  check('an edited description goes back to the language it came from',
    rewritten.description?.pl === 'Nowy opis.' && !('en' in (rewritten.description ?? {})));
  check('emptying it deletes that language',
    listingWrite({ ...read, description: '' }, LISTING_FIXTURE, 'pl').description?.pl === '');

  /* An imported venue, read off its row while the listing endpoint does not
     answer: words from another category system, a logo on somebody else's
     host, and none of the three sets. */
  const row = sourceFromRow({
    id: 'ven_legacy', name: 'Chayxana', category: 'places', subcategory: 'halal_food', city: 'Krakow',
    country_code: 'DE', address: null, price_range: '30-70 PLN', phone: null, email: null,
    image_url: 'https://base44.app/api/chayxana.png', status: 'live', verified_at: '2026-01-01T00:00:00Z',
  });
  const held: BusinessProfile = {
    ...blankBusiness(), venueId: 'ven_legacy', description: 'Kept here.',
    website: 'https://kept.example', spoken: ['uz'],
  };
  const halves = businessFromSource(row, 'en', held);
  check('a venue row keeps what it cannot know',
    halves.description === 'Kept here.' && halves.website === 'https://kept.example' && halves.spoken.join(',') === 'uz');
  check('words the form has no list entry for are carried',
    halves.unmapped?.category === 'places' && halves.unmapped?.subcategory === 'halal_food'
      && halves.unmapped?.country === 'DE');
  check('…without anything throwing on them',
    categoryOf('places') === null && categoryOf(undefined) === null && countryOf('DE') === null);
  const legacyWrite = listingWrite(halves, row, 'en');
  check('…and a save leaves those fields alone',
    !('category' in legacyWrite) && !('subcategory' in legacyWrite) && !('countryCode' in legacyWrite));
  check('a kept external logo is not sent back',
    !('imageUrl' in legacyWrite) && halves.logo === 'https://base44.app/api/chayxana.png');
  check('a set that was never read is never replaced',
    legacyWrite.links === undefined && legacyWrite.languages === undefined);
  check('a held listing for another venue is not blended in',
    businessFromSource(row, 'en', { ...held, venueId: 'ven_other' }).description === '');

  const created = listingWrite(
    { ...blankBusiness(), name: 'Choyxona', city: 'Tashkent', country: 'uz', description: 'Salom', website: 'choyxona.uz' },
    null,
    'uz',
  );
  check('a new venue sends its whole listing',
    created.description?.uz === 'Salom' && created.links?.[0]?.kind === 'website'
      && created.timezone === 'Asia/Tashkent' && created.countryCode === 'UZ');

  check('live is live', listingState({ status: 'live', verification: null }) === 'live');
  check('pending review is waiting', listingState({ status: 'pending_review', verification: null }) === 'review');
  check('a refusal is said, not called a draft',
    listingState({
      status: 'draft',
      verification: { status: 'rejected', submittedAt: '2026-09-01T10:00:00Z', note: 'No photo.' },
    }) === 'rejected');
  check('an untouched venue is a draft', listingState({ status: 'draft', verification: null }) === 'draft');

  check('a web address is followed', webAddress('https://cafe.pl/menu') === 'https://cafe.pl/menu');
  check('…a bare domain gets a scheme', webAddress('cafe.pl') === 'https://cafe.pl');
  check('…and a script never reaches an href', webAddress('javascript:alert(1)') === null);
}

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
