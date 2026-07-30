/**
 * ISO 3166-1 numeric -> alpha-2, plus display-name tidy-ups.
 *
 * The atlas keys features by numeric code; flag emoji are built from alpha-2
 * regional indicator pairs, so we need the bridge. Stored as a compact string
 * and expanded once at module load (~250 entries, negligible cost).
 */

const NUMERIC_TO_ALPHA2_RAW =
  '004AF008AL010AQ012DZ016AS020AD024AO028AG031AZ032AR036AU040AT044BS048BH050BD' +
  '051AM052BB056BE060BM064BT068BO070BA072BW074BV076BR084BZ086IO090SB092VG096BN' +
  '100BG104MM108BI112BY116KH120CM124CA132CV136KY140CF144LK148TD152CL156CN158TW' +
  '162CX166CC170CO174KM175YT178CG180CD184CK188CR191HR192CU196CY203CZ204BJ208DK' +
  '212DM214DO218EC222SV226GQ231ET232ER233EE234FO238FK239GS242FJ246FI248AX250FR' +
  '254GF258PF260TF262DJ266GA268GE270GM275PS276DE288GH292GI296KI300GR304GL308GD' +
  '312GP316GU320GT324GN328GY332HT334HM336VA340HN344HK348HU352IS356IN360ID364IR' +
  '368IQ372IE376IL380IT384CI388JM392JP398KZ400JO404KE408KP410KR414KW417KG418LA' +
  '422LB426LS428LV430LR434LY438LI440LT442LU446MO450MG454MW458MY462MV466ML470MT' +
  '474MQ478MR480MU484MX492MC496MN498MD499ME500MS504MA508MZ512OM516NA520NR524NP' +
  '528NL531CW533AW534SX535BQ540NC548VU554NZ558NI562NE566NG570NU574NF578NO580MP' +
  '581UM583FM584MH585PW586PK591PA598PG600PY604PE608PH612PN616PL620PT624GW626TL' +
  '630PR634QA638RE642RO643RU646RW652BL654SH659KN660AI662LC663MF666PM670VC674SM' +
  '678ST682SA686SN688RS690SC694SL702SG703SK704VN705SI706SO710ZA716ZW724ES728SS' +
  '729SD732EH740SR744SJ748SZ752SE756CH760SY762TJ764TH768TG772TK776TO780TT784AE' +
  '788TN792TR795TM796TC798TV800UG804UA807MK818EG826GB831GG832JE833IM834TZ840US' +
  '850VI854BF858UY860UZ862VE876WF882WS887YE894ZM383XK';

const NUMERIC_TO_ALPHA2 = ((): Record<string, string> => {
  const map: Record<string, string> = {};
  for (let i = 0; i < NUMERIC_TO_ALPHA2_RAW.length; i += 5) {
    map[NUMERIC_TO_ALPHA2_RAW.slice(i, i + 3)] = NUMERIC_TO_ALPHA2_RAW.slice(i + 3, i + 5);
  }
  return map;
})();

/** Natural Earth abbreviates aggressively; restore readable names. */
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'United States of America': 'United States',
  'Dem. Rep. Congo': 'DR Congo',
  'Central African Rep.': 'Central African Republic',
  'Bosnia and Herz.': 'Bosnia & Herzegovina',
  'Dominican Rep.': 'Dominican Republic',
  'Eq. Guinea': 'Equatorial Guinea',
  'S. Sudan': 'South Sudan',
  'W. Sahara': 'Western Sahara',
  'Solomon Is.': 'Solomon Islands',
  'Falkland Is.': 'Falkland Islands',
  'Fr. S. Antarctic Lands': 'French Southern Territories',
  'N. Cyprus': 'Northern Cyprus',
  'Antigua and Barb.': 'Antigua & Barbuda',
  'St. Vin. and Gren.': 'St. Vincent & the Grenadines',
  'Trinidad and Tobago': 'Trinidad & Tobago',
  'Turks and Caicos Is.': 'Turks & Caicos Islands',
  'São Tomé and Principe': 'São Tomé & Príncipe',
  'Å land': 'Åland Islands',
  'Br. Indian Ocean Ter.': 'British Indian Ocean Territory',
  'Siachen Glacier': 'Siachen Glacier',
};

/** Codes that exist in Natural Earth but have no ISO flag. */
const NO_FLAG = new Set(['-99', '', 'undefined']);

export function alpha2FromNumeric(numericId: string | number | undefined): string | null {
  if (numericId === undefined) return null;
  const key = String(numericId).padStart(3, '0');
  if (NO_FLAG.has(String(numericId))) return null;
  return NUMERIC_TO_ALPHA2[key] ?? null;
}

export function displayName(rawName: string): string {
  return DISPLAY_NAME_OVERRIDES[rawName] ?? rawName;
}

/** Alpha-2 -> regional-indicator flag emoji, e.g. `US` -> 🇺🇸. */
export function flagEmoji(alpha2: string | null): string {
  if (!alpha2 || alpha2.length !== 2) return '';
  const base = 0x1f1e6;
  const a = alpha2.toUpperCase().charCodeAt(0) - 65;
  const b = alpha2.toUpperCase().charCodeAt(1) - 65;
  if (a < 0 || a > 25 || b < 0 || b > 25) return '';
  return String.fromCodePoint(base + a, base + b);
}
