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


console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
