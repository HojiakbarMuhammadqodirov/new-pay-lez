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
import { resolveRoute, type Route } from '../src/site/router';
import type { Account } from '../src/site/auth/context';
import {
  blankBusiness,
  isBusinessReady,
  profileCompleteness,
  REQUIRED_FIELDS,
} from '../src/site/auth/business';
import {
  DEMO_USERS,
  findUser,
  MIN_PASSWORD,
  newUser,
  SEED_USERS,
  validateSignUp,
} from '../src/site/auth/users';
import {
  activeVouchers,
  awardRound,
  canAfford,
  markUsed,
  MAX_LIVES,
  redeem,
  refillLives,
  seedPlayer,
  usedVouchers,
} from '../src/site/auth/player';
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
  const stages: Array<[string, { delay: number; duration: number }]> = [
    ['markIn', t.markIn],
    ['nameOpen', t.nameOpen],
    ['barIn', t.barIn],
    ['barFill', t.barFill],
    ['outro', t.outro],
  ];

  check(
    'every stage fits inside the run time',
    stages.every(([, s]) => s.delay + s.duration <= t.duration),
    `duration ${t.duration}ms`,
  );
  // The name has to start opening while the mark is still settling, or the
  // mark's slide left reads as a separate second move.
  check(
    'the name opens before the mark has finished landing',
    t.nameOpen.delay < t.markIn.delay + t.markIn.duration,
    `mark lands ${t.markIn.delay + t.markIn.duration}ms, name starts ${t.nameOpen.delay}ms`,
  );
  check(
    'the mark lands before the name starts',
    t.nameOpen.delay > t.markIn.delay,
  );
  check(
    'the bar appears before it fills',
    t.barIn.delay < t.barFill.delay,
  );
  check(
    'the bar finishes filling before the fade',
    t.barFill.delay + t.barFill.duration <= t.outro.delay,
    `fill ends ${t.barFill.delay + t.barFill.duration}ms, fade starts ${t.outro.delay}ms`,
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
    'landing', 'learn', 'analytics', 'b2b', 'vouchers', 'relocate',
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
  const base = { ...seedPlayer(), points: 0, streak: 0, answered: 0, correct: 0, lastPlayed: null };
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

  /* The console reads every account on the platform. It is in the bundle like
     everything else, but it is not advertised on the front door. */
  check('the demo list is the two visitors', DEMO_USERS.length === 2);
  check('…and never the admin', DEMO_USERS.every((u) => u.type !== 'admin'));
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

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
