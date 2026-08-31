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
import {
  LOCAL_COUNTRIES,
  QUIZ_BANK_FOR_COUNTRY,
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
  activeVouchers,
  awardFlight,
  awardRound,
  bankableGaps,
  canAfford,
  claimDeal,
  dealsOf,
  filterByCategory,
  flightAward,
  flightPoints,
  freezesOf,
  inCategory,
  isCardFull,
  markUsed,
  MAX_FLIGHT_POINTS,
  MAX_FREEZES,
  MAX_ENERGY,
  memoryPoints,
  quizAward,
  quizSpeedBonus,
  openDeals,
  openNow,
  redeem,
  ENERGY_REGEN_MINUTES,
  energyOf,
  newPlayer as freshPlayer,
  seedPlayer,
  streakWeek,
  today,
  stampsLeft,
  stampsOf,
  stampVisit,
  usedVouchers,
  wordPoints,
  wordRoundPoints,
  type PlayerState,
  type StampCard,
} from '../src/site/auth/player';
import { toAccount } from '../src/site/auth/directory';
import { FLIGHT } from '../src/site/flight/config';
import { crossed, flap, gapCentre, hits, hitsBounds, spawnPipe, speedAt, stepBird } from '../src/site/flight/engine';
import { PARROT_PARTS, PART_STYLES } from '../src/site/flight/parrot';
import {
  DEAL_CATEGORIES,
  GAMES,
  PREVIEW,
  SUB_BADGE_ROW,
  SUB_HERO,
  SUB_PLANS,
  SUB_ROWS,
  WALLET_DEALS,
  type HotDeal,
} from '../src/site/content';
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
import { LANGUAGE_ORDER, LANGUAGES } from '../src/site/i18n/context';
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
    profile: EMPTY_PROFILE,
    /*
     * A date rather than `null` on the fixtures that stand for *established*
     * accounts, because `null` now means something: an individual carrying it
     * is held at onboarding from every route, and every assertion below about
     * where an individual goes would quietly become an assertion about the
     * welcome screen. `newPlayer` is the fixture that carries the `null`.
     */
    onboardedAt: '2026-01-01',
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
  check('a set-up owner lands on the landing page', resolveRoute('signin', ownerSet) === 'landing');

  /* ── the profile, and the hold at onboarding ─────────────────────────── */

  /*
   * `#/profile` is private and belongs to *everybody who exists*, including the
   * operator: the console replaces an admin's venue screens because they have
   * no venue, and it does not replace their own name and city.
   */
  check('anon is sent from the profile to sign-in', resolveRoute('profile', anon) === 'signin');
  check('anon is sent from onboarding to sign-in', resolveRoute('onboarding', anon) === 'signin');
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

  const directory: UserRecord[] = [
    { ...SEED_USERS[2] },
    {
      id: 'u_other', name: 'B', email: 'b@b.c', password: 'x', created: '2026-01-01',
      type: 'individual', business: null, player: null,
      profile: { ...EMPTY_PROFILE, username: 'KasiaPL' },
      onboardedAt: '2026-01-01',
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

  /* The seeded player is furnished for the same reason her wallet is, and she
     is the account somebody signs in as to look at these screens. */
  const seeded = SEED_USERS.find((user) => user.type === 'individual');
  check('the seeded player has a profile', Boolean(seeded?.profile?.username));
  check('…and has been through onboarding', seeded?.onboardedAt !== null);
  check(
    '…with one birthday correction spent',
    seeded?.profile?.birthDateChangesLeft === BIRTH_DATE_WRITES - 1,
  );

  /* A brand-new account is the one case where `null` is *known* rather than
     inferred, and it is what the routing hold reads. */
  const fresh = newUser(
    { name: 'N', email: 'n@b.c', password: 'secret', type: 'individual' },
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

console.log('\nthe wallet');
{
  const seeded = seedPlayer();

  /*
   * A stamp card rolls over; it does not overflow.
   *
   * This is the rule that decides what the number on the card *means*. The
   * eleventh visit to a ten-visit card is the first stamp of the next card, not
   * an eleventh stamp on a card that cannot hold one — and `cycles` is what
   * keeps that from losing anything, because "0 of 6, filled twice before" and
   * "0 of 6" are different cards in front of different people.
   */
  const nearly = stampsOf(seeded).find((card) => stampsLeft(card) === 1);
  check('a card exists that is one visit from full', Boolean(nearly));
  const rolled = stampVisit(seeded, nearly!.id);
  const after = stampsOf(rolled).find((card) => card.id === nearly!.id)!;
  check('the last stamp rolls the card over', after.stamps === 0, `${after.stamps} stamps`);
  check('…and the fill is counted', after.cycles === nearly!.cycles + 1);
  check('…so nothing is lost by it', after.required === nearly!.required);

  const midway = stampsOf(seeded).find((card) => card.stamps > 0 && stampsLeft(card) > 1)!;
  const stamped = stampsOf(stampVisit(seeded, midway.id)).find((c) => c.id === midway.id)!;
  check('an ordinary visit just adds one', stamped.stamps === midway.stamps + 1);
  check('a full card reads as full', isCardFull({ ...midway, stamps: midway.required }));
  check('and stamps left never goes negative', stampsLeft({ ...midway, stamps: 99 }) === 0);

  /* A stamp is not a point, and adding one must not move the balance. That is
     the whole of what "visits are not points" means in code. */
  check('a visit does not touch the balance', stampVisit(seeded, midway.id).points === seeded.points);

  /*
   * A hot deal is one offer, not stock.
   *
   * Two guards, and the second is the one worth having: a button pressed twice
   * would otherwise put two of the same offer in the wallet and charge for both.
   *
   * Annotated `HotDeal` rather than left to inference. The row now carries the
   * venue's own facts — where it is, when its door is open, and in which zone
   * — and an invented deal missing them is one the wallet would happily store
   * and the card could not draw. The annotation is what puts the next field
   * added to that type here rather than on a screen.
   */
  const free: HotDeal = {
    id: 'd-test-free',
    venue: 'V',
    logo: 'V',
    badge: '2+1',
    points: 0,
    expires: '31.12',
    category: 'coffee',
    city: 'Kraków',
    address: 'ul. Testowa 1',
    rating: 4.2,
    reviews: 12,
    hours: '09:00 – 17:00',
    zone: 'Europe/Warsaw',
  };
  const claimed = claimDeal(seeded, free, 'PLZ-TEST', '01.08');
  check('claiming a free deal costs nothing', claimed.points === seeded.points);
  check('…and puts it in the wallet', dealsOf(claimed).length === dealsOf(seeded).length + 1);
  check(
    'claiming it again changes nothing',
    dealsOf(claimDeal(claimed, free, 'PLZ-TWICE', '01.08')).length === dealsOf(claimed).length,
  );

  const paid = { ...free, id: 'd-test-paid', points: seeded.points + 1 };
  check(
    'a deal the balance will not cover is refused',
    claimDeal(seeded, paid, 'PLZ-NOPE', '01.08') === seeded,
  );

  const affordable = { ...free, id: 'd-test-cheap', points: 50 };
  check(
    'and one it will cover is charged for',
    claimDeal(seeded, affordable, 'PLZ-OK', '01.08').points === seeded.points - 50,
  );

  /* The two fields postdate the stored shape, so a session saved by an earlier
     build has neither. Reading a missing one as empty is what stops the wallet
     throwing on a page somebody is already looking at. */
  const old = { ...seeded, stamps: undefined, deals: undefined };
  check('a session that predates stamp cards reads as empty', stampsOf(old).length === 0);
  check('…and so does one that predates deals', dealsOf(old).length === 0);

  /*
   * ── the board and the wallet are two lists, and a deal is in exactly one ──
   *
   * The page puts what is on offer above what has already been taken, and the
   * whole layout rests on nothing being in both: a row under "Hot deals" that
   * is also under "Redeemed" offers a claim on something already held, and
   * charges for it. Only one of the two lists is stored — `openDeals` derives
   * the other — so the only way they can drift is if somebody computes the
   * board a second way.
   */
  const board = openDeals(WALLET_DEALS, seeded);
  const dubai = WALLET_DEALS[0];
  const inWallet = dealsOf(seeded)[0];
  check('the seeded claim is off the board', !board.some((deal) => deal.id === inWallet.id), inWallet.id);
  check(
    '…and the two lists exhaust the board',
    board.length + dealsOf(seeded).length === WALLET_DEALS.length,
    `${board.length} open + ${dealsOf(seeded).length} held of ${WALLET_DEALS.length}`,
  );

  /* Claiming moves a row across rather than copying it. */
  const next = board.find((deal) => deal.points === 0)!;
  const took = claimDeal(seeded, next, 'PLZ-BOARD', '02.08');
  const shorter = openDeals(WALLET_DEALS, took);
  check('claiming takes it off the board', !shorter.some((deal) => deal.id === next.id), next.id);
  check('…and the board is one shorter', shorter.length === board.length - 1, `${shorter.length} open`);
  check('…with every other row untouched', shorter.every((deal) => board.some((was) => was.id === deal.id)));

  /*
   * ── the category strip ──
   *
   * "All" is the absence of a filter rather than a sixth category: a venue
   * cannot *be* in it, which is why it is drawn from `copy.wallet.deals.all`
   * and why the predicate takes `null` instead of a string every row would
   * have to be compared against. A chip called "all" in the list would be a
   * category nothing could ever be filed under.
   */
  check(
    'nothing on the strip is an "all" category',
    !DEAL_CATEGORIES.some((category) => String(category).toLowerCase() === 'all'),
    DEAL_CATEGORIES.join(' '),
  );
  check('the "All" chip matches every deal', WALLET_DEALS.every((deal) => inCategory(deal, null)));

  /*
   * A row with **no** category matches only "All". "We have not filed this one"
   * is not the same claim as "this one is a bakery", and a filter that let
   * unfiled rows fall through would put somebody's barber under Coffee. The
   * field is optional because stamp cards existed before it did, not because a
   * new one may skip it.
   */
  const unfiled: StampCard = {
    id: 's0',
    venue: 'Stary Kleparz',
    logo: 'S',
    reward: 'a free coffee',
    stamps: 2,
    required: 6,
    cycles: 0,
  };
  check('an unfiled card shows under "All"', inCategory(unfiled, null));
  check('…and under no chip at all', DEAL_CATEGORIES.every((category) => !inCategory(unfiled, category)));
  check(
    '…so filtering never invents a filing',
    filterByCategory([...stampsOf(seeded), unfiled], 'coffee').every((card) => card.category === 'coffee'),
  );
  check(
    'and no chip drops a filed row',
    filterByCategory([...stampsOf(seeded), unfiled], null).length === stampsOf(seeded).length + 1,
  );

  /*
   * The number on a chip and the number in the list under it are one predicate,
   * which is the only arrangement in which they cannot disagree.
   */
  for (const category of DEAL_CATEGORIES) {
    const under = filterByCategory(WALLET_DEALS, category);
    const counted = WALLET_DEALS.filter((deal) => inCategory(deal, category)).length;
    check(`the ${category} chip lists what it counts`, under.length === counted, `${under.length}`);
    /* A chip that can only ever be empty is a chip that should not be on the
       strip. Nine rows is the size that keeps all five of them honest. */
    check(`…and has something behind it`, under.length > 0, `${under.length} deals`);
  }

  check(
    'every deal is filed under a real chip',
    WALLET_DEALS.every((deal) => DEAL_CATEGORIES.includes(deal.category)),
  );
  check(
    'and so is every seeded stamp card',
    stampsOf(seeded).every(
      (card) => card.category !== undefined && DEAL_CATEGORIES.includes(card.category),
    ),
  );

  /*
   * ── the offers, in five languages ──
   *
   * `Dictionary` is `typeof en`, which makes a missing *key* a compile error
   * and says nothing about a missing array *element*: a tenth deal with nine
   * lines of copy renders `undefined` under a badge and typechecks perfectly.
   * The badge itself is the venue's own words and is never translated; this
   * half is the app saying what they mean, so it has to exist wherever the
   * board does.
   */
  for (const code of LANGUAGE_ORDER) {
    const deals = LANGUAGES[code].wallet.deals;
    check(`${code} explains every offer`, deals.offers.length === WALLET_DEALS.length,
      `${deals.offers.length} of ${WALLET_DEALS.length}`);
    check(`…and none of them is blank`, deals.offers.every((line) => line.trim().length > 0));
    check(`…and names every chip`, deals.categories.length === DEAL_CATEGORIES.length,
      `${deals.categories.length} of ${DEAL_CATEGORIES.length}`);
  }

  /*
   * ── the door ──
   *
   * "Open now" is answered on the **venue's** clock. A Kraków café keeps Kraków
   * hours to a reader standing in Tashkent, and the machine the page is
   * rendered on is the one thing that cannot be asked — which is why every row
   * carries a `zone`, and why this block pins an instant rather than letting
   * `openNow` reach for `new Date()`.
   */
  const sevenInKrakow = new Date('2026-06-15T05:00:00Z'); /* 07:00 CEST */
  check('a venue that opens at 07:30 is shut at 07:00', openNow(dubai, sevenInKrakow) === false, dubai.hours);
  check('…and open an hour later', openNow(dubai, new Date('2026-06-15T06:00:00Z')) === true);
  /* The proof that the zone is what decides: one instant, one span, two zones,
     two answers — which no single clock can produce, whichever clock the
     machine running this suite happens to be set to. */
  check(
    'the zone answers, not the reader',
    openNow(dubai, sevenInKrakow) === false &&
      openNow({ hours: dubai.hours, zone: 'Asia/Tashkent' }, sevenInKrakow) === true,
  );

  /* A span that ends before it starts has crossed midnight, and the test flips
     from "between" to "outside" for it — otherwise every late venue on the
     board reads as shut for exactly the evening it is open. */
  const late = { hours: '22:00 – 02:00', zone: 'Europe/Warsaw' };
  check('a late venue is open at 23:00', openNow(late, new Date('2026-06-15T21:00:00Z')) === true);
  check('…and still open at 01:00', openNow(late, new Date('2026-06-15T23:00:00Z')) === true);
  check('…and shut at midday', openNow(late, new Date('2026-06-15T10:00:00Z')) === false);

  /*
   * **Unreadable is `null`, never `false`.** "Closed now" is a claim about a
   * venue and a malformed seed row must not make it: the third state is the
   * only answer that says "nothing here to read" without saying something
   * untrue about the place.
   */
  const warsaw = 'Europe/Warsaw';
  check('no hours at all says nothing', openNow({ hours: '', zone: warsaw }, sevenInKrakow) === null);
  check('…and neither does a span with no separator',
    openNow({ hours: '07:30', zone: warsaw }, sevenInKrakow) === null);
  check('…nor a span that is not a clock',
    openNow({ hours: 'from dawn – till dusk', zone: warsaw }, sevenInKrakow) === null);
  check('…nor an hour past 24:00',
    openNow({ hours: '25:00 – 26:00', zone: warsaw }, sevenInKrakow) === null);
  check('…nor a zone nobody has heard of',
    openNow({ hours: dubai.hours, zone: 'Mars/Olympus' }, sevenInKrakow) === null);

  /*
   * A claimed deal carries the venue with it. The card in the wallet is spread
   * off the board row rather than written out beside it, because two copies of
   * one venue drift the first time an address is corrected in only one of them
   * — the same argument the seeded vouchers make against hand-written face
   * values.
   */
  check('the claimed deal is the board row', inWallet.id === dubai.id, inWallet.id);
  check(
    '…with the venue still on it',
    inWallet.address === dubai.address &&
      inWallet.rating === dubai.rating &&
      inWallet.category === dubai.category,
    `${inWallet.address} · ★${inWallet.rating} · ${inWallet.category}`,
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
  /* And the payout does not know how many of them have been played. That is the
     other half of "energy is the only limiter", and the half a reintroduced
     curve would break first — a whole day of one game pays a flat rate. */
  let allDay = awardRound(base, win, day('2026-08-03'));
  for (let i = 1; i < perDay; i += 1) allDay = awardRound(allDay, win, day('2026-08-03'));
  check('…and every one of them pays the same as the first',
    allDay.points === first.points * perDay, `${allDay.points} pts over ${perDay} rounds`);
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
    ...seedPlayer(),
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
    ...seedPlayer(),
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
    ...seedPlayer(),
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
    /* Not `EMPTY_PROFILE`: the round trip is only worth running over an object
       with something in it, and the profile is the second nested object on the
       account — the first one this check would have missed. */
    profile: { ...EMPTY_PROFILE, username: 'marta', city: 'Kraków' },
    onboardedAt: null,
  };
  const back = JSON.parse(JSON.stringify(account)) as Account;
  check('an account survives a round trip', back.id === account.id && back.type === 'business');
  check('…including the listing', back.business?.spoken.join(',') === 'pl,en');
  check('…and the profile', back.profile.username === 'marta' && back.profile.city === 'Kraków');

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

  /*
   * **Two seeds, and neither is an operator.**
   *
   * There were three, and the third was an admin whose password sat in this
   * file and therefore in the shipped bundle. It was defensible while the
   * console only read this device's own `localStorage`; it stopped being so
   * when two of its tabs started reading the live database, and it was always
   * confusing to use — an operator signed in twice, with two different
   * accounts, to see one screen.
   *
   * An operator is now whoever the *server* has given the `admin` role, learned
   * off `roles` on the session. The checks below are the property that
   * guarantees it stays that way: nothing in the bundle can grant the console.
   */
  check('two seeds exist', Boolean(owner && player), `${SEED_USERS.length} accounts`);
  check('no operator is seeded', admin === undefined);
  check('…and no seed can reach the console',
    SEED_USERS.every((u) => u.type !== 'admin'));
  check('…and the address that used to is gone',
    !SEED_USERS.some((u) => sameEmail(u.email, 'admin@pay-lez.com')));

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
  /*
   * The seed's streak has days behind it, and they are the right days.
   *
   * `lastPlayed` was `null` here, which is the one value that cannot lapse and
   * was the right answer while a streak was only a number. It stopped being one
   * when the Play screen started drawing the week: `streakWeek` reads the run
   * back off `streak` + `lastPlayed`, so a seven-day streak with no last day
   * played rendered as a great big 7 over seven empty circles.
   *
   * Yesterday is the only date that satisfies both — it is exactly the day that
   * *continues* a streak, so this account's next round takes it to eight rather
   * than resetting it, and it is a state the app could actually have produced.
   * Checked against `today()` on a fresh `Date` rather than against a literal,
   * because the seed computes it when the directory is first written.
   */
  const seedDay = new Date();
  seedDay.setDate(seedDay.getDate() - 1);
  check('…and a streak with days behind it',
    player?.player?.lastPlayed === today(seedDay),
    `${player?.player?.lastPlayed}`);
  check('…which the next round continues rather than resets',
    awardRound(player!.player!, { game: 'brain', correct: 5, total: 5, perCorrect: 1, seconds: 20 })
      .streak === 8);
  /*
   * Drawn from the last day played, **not from today**, and that is the fix for
   * a check that failed every Monday.
   *
   * `streakWeek` shows the week that `now` falls in, Monday-first. The seed's
   * `lastPlayed` is yesterday; on a Monday, yesterday is Sunday and belongs to
   * the *previous* week, so a seven-day run ending then correctly draws an
   * empty strip — the player has not played yet this week. Asserting against
   * `new Date()` was therefore asserting something untrue one day in seven,
   * which is the same shape as the month-end fixture in `server/verify.ts`.
   *
   * What is actually invariant is that the run is drawable in the week it
   * happened in, and that is what this checks.
   */
  check('…and a week the row can actually draw',
    streakWeek(player!.player!, seedDay).some((day) => day.kept));

  const ids = new Set(SEED_USERS.map((u) => u.id));
  const emails = new Set(SEED_USERS.map((u) => u.email.toLowerCase()));
  check('ids are unique', ids.size === SEED_USERS.length);
  check('addresses are unique', emails.size === SEED_USERS.length);

  /* Nothing prints these on the sign-in form any more — see the note where
     `DEMO_USERS` used to be exported. What is checked instead is the property
     that made the admin unprintable in the first place, now taken to its
     conclusion: sign-up cannot produce one at the type level, and no seed is
     one either, so nothing shipped to a browser can open the console. */
  check('no seed is an operator', SEED_USERS.filter((u) => u.type === 'admin').length === 0);
  check('and both seeds are ordinary accounts', SEED_USERS.filter((u) => u.type !== 'admin').length === 2);
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
  check('…an empty wallet', fresh.vouchers.length === 0);
  check('…no stamp cards', (fresh.stamps ?? []).length === 0);
  check('…and nothing claimed', (fresh.deals ?? []).length === 0);
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

  /* And the demo account is still the demo account — the separation is the
     fix, not deleting the seeded wallet, which is what makes the printed
     credentials on the sign-in form worth signing in with. */
  const demo = seedPlayer();
  check('the demo player still has a wallet to look at', demo.vouchers.length > 0);
  check('…and is not what a new account gets', demo.points !== fresh.points);

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
  }, 'u_fresh', '2026-08-31');
  check('a sign-up produces an empty player', signedUp.player?.points === 0,
    String(signedUp.player?.points));
  check('…with nothing in the wallet', (signedUp.player?.vouchers ?? []).length === 0);
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

  for (const code of LANGUAGE_ORDER) {
    const sub = LANGUAGES[code].subscription;
    check(`${code} labels every row`, sub.rows.length === SUB_ROWS.length,
      `${sub.rows.length} of ${SUB_ROWS.length}`);
    check(`…and every figure in the strip`, sub.heroRows.length === SUB_HERO,
      `${sub.heroRows.length} of ${SUB_HERO}`);
    check(`…and names both seals`, sub.badges.length === 2);
    check(`…and its seal label has a name to put in it`, sub.mark.includes('{name}'),
      sub.mark);
    check(`…and nothing in the strip is blank`,
      sub.heroRows.every((label) => label.trim().length > 0));
    /* The unit lives in the label, which is the rule that keeps "hours" and
       "days" translatable. A stray unit welded to a figure would show up as a
       Latin letter in the Cyrillic dictionaries, so this is checked where it
       can actually be seen. */
    check(`…and every plan is named`, sub.plans.length === SUB_PLANS.length);
  }
}

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
