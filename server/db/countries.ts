/**
 * Country name → ISO 3166-1 alpha-2, for the flags bank.
 *
 * The old database's `CountryCapital` export carries country names in four
 * languages and a continent, and no code — so a flag question built from it had
 * nothing to draw a flag *with*. A flag emoji is two regional-indicator letters
 * derived from the country's two-letter code (`PL` → 🇵🇱), which is why this
 * table is the whole difference between "no flags bank" and 780 flag questions.
 *
 * Two things about how it is written:
 *
 *   * **The keys are the export's own spellings**, verbatim, including the ones
 *     nobody else uses — `Congo, Dem. Rep.`, `St. Vincent & Grenadines`,
 *     `Turkey (Türkiye)`. Normalising the export to some canonical list first
 *     would mean maintaining the mapping *and* the normalisation, and the export
 *     is the thing that actually has to be looked up.
 *   * **`codeFor` normalises the lookup, not the table.** Accents are stripped,
 *     punctuation and case are ignored, and `and`/`&`/`the` are dropped — so
 *     `Côte d'Ivoire`, `Cote d Ivoire` and `COTE DIVOIRE` all find `CI`. That
 *     matters because a future export may respell any of these and a mapping that
 *     only matches one spelling fails silently: the question simply disappears.
 *
 * `assertComplete` is exported and called by the import, so a country the table
 * does not know is a loud failure at import time rather than a bank that is
 * quietly three questions short.
 */

/** ISO 3166-1 alpha-2, keyed by the export's spelling. */
export const COUNTRY_CODES: Record<string, string> = {
  Afghanistan: 'AF',
  Albania: 'AL',
  Algeria: 'DZ',
  Andorra: 'AD',
  Angola: 'AO',
  'Antigua and Barbuda': 'AG',
  Argentina: 'AR',
  Armenia: 'AM',
  Australia: 'AU',
  Austria: 'AT',
  Azerbaijan: 'AZ',
  Bahamas: 'BS',
  Bahrain: 'BH',
  Bangladesh: 'BD',
  Barbados: 'BB',
  Belarus: 'BY',
  Belgium: 'BE',
  Belize: 'BZ',
  Benin: 'BJ',
  Bhutan: 'BT',
  Bolivia: 'BO',
  'Bosnia and Herzegovina': 'BA',
  Botswana: 'BW',
  Brazil: 'BR',
  Brunei: 'BN',
  Bulgaria: 'BG',
  'Burkina Faso': 'BF',
  Burundi: 'BI',
  'Cabo Verde': 'CV',
  Cambodia: 'KH',
  Cameroon: 'CM',
  Canada: 'CA',
  'Central African Republic': 'CF',
  Chad: 'TD',
  Chile: 'CL',
  China: 'CN',
  Colombia: 'CO',
  Comoros: 'KM',
  /* The two Congos, in the export's own shorthand. Kinshasa is CD, Brazzaville
     is CG, and getting them the wrong way round is the classic error here. */
  'Congo, Dem. Rep.': 'CD',
  'Congo, Rep.': 'CG',
  'Costa Rica': 'CR',
  "Côte d'Ivoire": 'CI',
  Croatia: 'HR',
  Cuba: 'CU',
  Cyprus: 'CY',
  'Czech Republic': 'CZ',
  Denmark: 'DK',
  Djibouti: 'DJ',
  Dominica: 'DM',
  'Dominican Republic': 'DO',
  Ecuador: 'EC',
  Egypt: 'EG',
  'El Salvador': 'SV',
  'Equatorial Guinea': 'GQ',
  Eritrea: 'ER',
  Estonia: 'EE',
  /* Renamed from Swaziland in 2018; the code did not change. */
  Eswatini: 'SZ',
  Ethiopia: 'ET',
  Fiji: 'FJ',
  Finland: 'FI',
  France: 'FR',
  Gabon: 'GA',
  Gambia: 'GM',
  Georgia: 'GE',
  Germany: 'DE',
  Ghana: 'GH',
  Greece: 'GR',
  Grenada: 'GD',
  Guatemala: 'GT',
  Guinea: 'GN',
  'Guinea-Bissau': 'GW',
  Guyana: 'GY',
  Haiti: 'HT',
  Honduras: 'HN',
  Hungary: 'HU',
  Iceland: 'IS',
  India: 'IN',
  Indonesia: 'ID',
  Iran: 'IR',
  Iraq: 'IQ',
  Ireland: 'IE',
  Israel: 'IL',
  Italy: 'IT',
  Jamaica: 'JM',
  Japan: 'JP',
  Jordan: 'JO',
  Kazakhstan: 'KZ',
  Kenya: 'KE',
  Kiribati: 'KI',
  Kuwait: 'KW',
  Kyrgyzstan: 'KG',
  Laos: 'LA',
  Latvia: 'LV',
  Lebanon: 'LB',
  Lesotho: 'LS',
  Liberia: 'LR',
  Libya: 'LY',
  Liechtenstein: 'LI',
  Lithuania: 'LT',
  Luxembourg: 'LU',
  Madagascar: 'MG',
  Malawi: 'MW',
  Malaysia: 'MY',
  Maldives: 'MV',
  Mali: 'ML',
  Malta: 'MT',
  'Marshall Islands': 'MH',
  Mauritania: 'MR',
  Mauritius: 'MU',
  Mexico: 'MX',
  Micronesia: 'FM',
  Moldova: 'MD',
  Monaco: 'MC',
  Mongolia: 'MN',
  Montenegro: 'ME',
  Morocco: 'MA',
  Mozambique: 'MZ',
  /* MM, not BU: Burma's old code was withdrawn when the name changed. */
  Myanmar: 'MM',
  Namibia: 'NA',
  Nauru: 'NR',
  Nepal: 'NP',
  Netherlands: 'NL',
  'New Zealand': 'NZ',
  Nicaragua: 'NI',
  /* NE is the country, NG is Nigeria. One letter, two very different flags. */
  Niger: 'NE',
  Nigeria: 'NG',
  'North Korea': 'KP',
  'North Macedonia': 'MK',
  Norway: 'NO',
  Oman: 'OM',
  Pakistan: 'PK',
  Palau: 'PW',
  Palestine: 'PS',
  Panama: 'PA',
  'Papua New Guinea': 'PG',
  Paraguay: 'PY',
  Peru: 'PE',
  Philippines: 'PH',
  Poland: 'PL',
  Portugal: 'PT',
  Qatar: 'QA',
  Romania: 'RO',
  Russia: 'RU',
  Rwanda: 'RW',
  'Saint Kitts and Nevis': 'KN',
  'Saint Lucia': 'LC',
  'St. Vincent & Grenadines': 'VC',
  Samoa: 'WS',
  'San Marino': 'SM',
  'São Tomé and Príncipe': 'ST',
  'Saudi Arabia': 'SA',
  Senegal: 'SN',
  Serbia: 'RS',
  Seychelles: 'SC',
  'Sierra Leone': 'SL',
  Singapore: 'SG',
  Slovakia: 'SK',
  Slovenia: 'SI',
  'Solomon Islands': 'SB',
  Somalia: 'SO',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  'South Sudan': 'SS',
  Spain: 'ES',
  'Sri Lanka': 'LK',
  Sudan: 'SD',
  Suriname: 'SR',
  Sweden: 'SE',
  Switzerland: 'CH',
  Syria: 'SY',
  /* Not a UN member; ISO assigns TW and the emoji exists, which is all the
     quiz needs. Some platforms decline to render it — that is a font question,
     not a data one. */
  Taiwan: 'TW',
  Tajikistan: 'TJ',
  Tanzania: 'TZ',
  Thailand: 'TH',
  'Timor-Leste': 'TL',
  Togo: 'TG',
  Tonga: 'TO',
  'Trinidad and Tobago': 'TT',
  Tunisia: 'TN',
  'Turkey (Türkiye)': 'TR',
  Turkmenistan: 'TM',
  Tuvalu: 'TV',
  Uganda: 'UG',
  Ukraine: 'UA',
  'United Arab Emirates': 'AE',
  /* GB, not UK. UK is "exceptionally reserved" and is not the alpha-2 code —
     and the emoji built from UK does not exist. */
  'United Kingdom': 'GB',
  'United States': 'US',
  Uruguay: 'UY',
  Uzbekistan: 'UZ',
  Vanuatu: 'VU',
  /* The Holy See. VA, not VC — VC is St Vincent. */
  'Vatican City': 'VA',
  Venezuela: 'VE',
  Vietnam: 'VN',
  Yemen: 'YE',
  Zambia: 'ZM',
  Zimbabwe: 'ZW',
};

/**
 * A spelling reduced to something two exports can agree on: no accents, no
 * punctuation, no case, and none of the joining words that get respelled.
 *
 * **"Republic" and "Democratic" are not joining words**, and dropping them was a
 * bug in the first version of this file: `Congo, Dem. Rep.` and `Congo, Rep.`
 * both reduced to `congo`, the second silently overwrote the first, and every
 * Kinshasa question in the bank got Brazzaville's flag. The words that carry
 * meaning stay; only `the`, `of` and `and` go, plus `st` → `saint`, which is the
 * one abbreviation exports genuinely disagree about.
 */
function normalise(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bst\b/g, 'saint')
    .replace(/\b(and|the|of)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/* Built once, from the table above, so there is exactly one list to maintain. */
const NORMALISED = new Map<string, string>();
for (const [name, code] of Object.entries(COUNTRY_CODES)) {
  const key = normalise(name);
  const clash = NORMALISED.get(key);
  /* Loud, at module load. A collision here is two countries sharing one code —
     which is exactly how the two Congos got confused — and it is invisible
     afterwards: the table looks right and the bank looks full. */
  if (clash && clash !== code) {
    throw new Error(
      `country name collision: "${name}" (${code}) normalises to "${key}", already held by ${clash}`,
    );
  }
  NORMALISED.set(key, code);
}
/* The handful of alternates a re-export might plausibly use. Alternates rather
   than a second table: each of these resolves to a name already above. */
for (const [alias, name] of [
  ['Democratic Republic of the Congo', 'Congo, Dem. Rep.'],
  ['DR Congo', 'Congo, Dem. Rep.'],
  ['Republic of the Congo', 'Congo, Rep.'],
  ['Ivory Coast', "Côte d'Ivoire"],
  ['Cape Verde', 'Cabo Verde'],
  ['Swaziland', 'Eswatini'],
  ['Turkey', 'Turkey (Türkiye)'],
  ['Türkiye', 'Turkey (Türkiye)'],
  ['Burma', 'Myanmar'],
  ['Holy See', 'Vatican City'],
  ['USA', 'United States'],
  ['United States of America', 'United States'],
  ['Great Britain', 'United Kingdom'],
  ['Czechia', 'Czech Republic'],
  ['Macedonia', 'North Macedonia'],
  ['East Timor', 'Timor-Leste'],
  ['Korea, South', 'South Korea'],
  ['Korea, North', 'North Korea'],
  ['Federated States of Micronesia', 'Micronesia'],
  ['Saint Vincent and the Grenadines', 'St. Vincent & Grenadines'],
  ['Sao Tome and Principe', 'São Tomé and Príncipe'],
] as const) {
  const code = COUNTRY_CODES[name];
  if (code) NORMALISED.set(normalise(alias), code);
}

/** The code for a country name, or `null` if this table has never seen it. */
export const codeFor = (name: string): string | null =>
  NORMALISED.get(normalise(name)) ?? null;

/**
 * The flag emoji: two regional indicator symbols.
 *
 * `PL` → U+1F1F5 U+1F1F1. Computed rather than stored, because a table of 195
 * surrogate pairs is a table of 195 chances to paste the wrong one.
 */
export const flagOf = (code: string): string =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/**
 * Throw if any name in the export is unknown.
 *
 * Loudly, at import time. A missing country is otherwise invisible: the bank is
 * simply smaller, every test still passes, and nobody finds out until a player
 * notices their own country is never asked about.
 */
export function assertComplete(names: string[]): void {
  const missing = [...new Set(names.filter((name) => name.trim() && !codeFor(name)))];
  if (missing.length > 0) {
    throw new Error(
      `countries.ts has no ISO code for: ${missing.join(', ')}. ` +
        'Add them to COUNTRY_CODES rather than letting the flags bank shrink silently.',
    );
  }
}
