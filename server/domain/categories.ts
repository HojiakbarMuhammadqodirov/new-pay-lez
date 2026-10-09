/**
 * The venue taxonomy: the categories and subcategories a customer filters by,
 * defined here and nowhere else.
 *
 * ## Keys
 *
 * A category is a bare word (`restaurant`), a subcategory is its category, a
 * dot and a word (`restaurant.turkish`). Keys are stable and never translated;
 * the labels are what change. A client renders the tree `GET /v1/categories`
 * sends, in the order sent, and filters by key.
 *
 * ## A venue carries a list, not one category
 *
 * Halal cuts across everything else — a Turkish kebab house is both
 * `restaurant.kebabs` and `halal.kebabs` — so a venue holds a *list* of keys
 * (`venues.tags`, a JSON array). A subcategory implies its category: a venue
 * tagged `restaurant.turkish` is under Restaurant without also saying
 * `restaurant`. A bare category is allowed too, for a place that is a
 * restaurant and nothing more specific.
 *
 * ## A venue's own kind: one category, one subcategory
 *
 * Beside the list, a venue has exactly one `category` (a bare key from this
 * tree — `restaurant`) and at most one `subcategory` (a dotted key *under that
 * category* — `restaurant.turkish`). Those are the owner's answer to "what are
 * you", picked on the listing form; [checkKind] is the rule for writing them.
 * The average-check defaults (`category_defaults`) and the market benchmarks
 * are keyed on `category`, so they are keyed on this tree too, and the
 * taxonomy is the one list everywhere: there is no second, older set of
 * categories behind it.
 *
 * ## Venues that predate the tree
 *
 * Older rows carry words instead (`cafe`, `places` + `halal_food`, the old
 * website form's `Specialty coffee`, …). Boot rewrites every one it can place
 * ([normaliseStoredKinds], through [kindOf] and [LEGACY]); a word that maps
 * nowhere (`dental`, `language`) is left as it is — the column is NOT NULL and
 * no key would be honest — and such a venue is simply in no category until its
 * owner picks one. Until a venue saves its own list, [tagsOf] derives the list
 * from its category and subcategory the same way.
 */
import type { Db } from '../db/db.ts';
import { DomainError } from './errors.ts';

/** en, then the four languages the apps ship besides it. */
export type Labels = { en: string; pl: string; ru: string; uk: string; uz: string };

export interface TaxonomyNode {
  key: string;
  labels: Labels;
  subcategories: Array<{ key: string; labels: Labels }>;
}

const L = (en: string, pl: string, ru: string, uk: string, uz: string): Labels => ({ en, pl, ru, uk, uz });

const RESTAURANT = L('Restaurant', 'Restauracja', 'Ресторан', 'Ресторан', 'Restoran');
const BURGERS = L('Burgers', 'Burgery', 'Бургеры', 'Бургери', 'Burgerlar');
const KEBABS = L('Kebabs', 'Kebaby', 'Кебабы', 'Кебаби', 'Kaboblar');

/** The whole tree, in the order the filter strip shows it. */
export const TAXONOMY: readonly TaxonomyNode[] = [
  {
    key: 'coffee',
    labels: L('Coffee', 'Kawa', 'Кофе', 'Кава', 'Qahva'),
    subcategories: [
      { key: 'coffee.coffee_shop', labels: L('Coffee shop', 'Kawiarnia', 'Кофейня', 'Кавʼярня', 'Qahvaxona') },
    ],
  },
  {
    key: 'restaurant',
    labels: RESTAURANT,
    subcategories: [
      { key: 'restaurant.turkish', labels: L('Turkish', 'Turecka', 'Турецкая', 'Турецька', 'Turk') },
      { key: 'restaurant.indian', labels: L('Indian', 'Indyjska', 'Индийская', 'Індійська', 'Hind') },
      { key: 'restaurant.polish', labels: L('Polish', 'Polska', 'Польская', 'Польська', 'Polsha') },
      { key: 'restaurant.asian', labels: L('Asian', 'Azjatycka', 'Азиатская', 'Азійська', 'Osiyo') },
      { key: 'restaurant.pizza', labels: L('Pizza', 'Pizza', 'Пицца', 'Піца', 'Pitsa') },
      { key: 'restaurant.burgers', labels: BURGERS },
      { key: 'restaurant.kebabs', labels: KEBABS },
      { key: 'restaurant.sushi', labels: L('Sushi', 'Sushi', 'Суши', 'Суші', 'Sushi') },
    ],
  },
  {
    key: 'shopping',
    labels: L('Shopping', 'Zakupy', 'Покупки', 'Покупки', 'Xaridlar'),
    subcategories: [
      { key: 'shopping.turkish_store', labels: L('Turkish store', 'Sklep turecki', 'Турецкий магазин', 'Турецька крамниця', 'Turk doʻkoni') },
      { key: 'shopping.indian_store', labels: L('Indian store', 'Sklep indyjski', 'Индийский магазин', 'Індійська крамниця', 'Hind doʻkoni') },
      { key: 'shopping.korean_store', labels: L('Korean store', 'Sklep koreański', 'Корейский магазин', 'Корейська крамниця', 'Koreys doʻkoni') },
      { key: 'shopping.beauty_store', labels: L('Beauty store', 'Drogeria', 'Магазин косметики', 'Магазин косметики', 'Kosmetika doʻkoni') },
      { key: 'shopping.electronics', labels: L('Electronics', 'Elektronika', 'Электроника', 'Електроніка', 'Elektronika') },
      { key: 'shopping.fashion', labels: L('Fashion', 'Moda', 'Одежда', 'Одяг', 'Kiyim-kechak') },
      { key: 'shopping.home', labels: L('Home', 'Dom', 'Для дома', 'Для дому', 'Uy uchun') },
    ],
  },
  {
    key: 'leisure',
    labels: L('Leisure', 'Rozrywka', 'Досуг', 'Дозвілля', 'Dam olish'),
    subcategories: [
      { key: 'leisure.gaming', labels: L('Gaming', 'Gry', 'Игры', 'Ігри', 'Oʻyinlar') },
      { key: 'leisure.culture', labels: L('Culture', 'Kultura', 'Культура', 'Культура', 'Madaniyat') },
      { key: 'leisure.sports', labels: L('Sports', 'Sport', 'Спорт', 'Спорт', 'Sport') },
      { key: 'leisure.wellness', labels: L('Wellness', 'Wellness', 'Велнес', 'Велнес', 'Salomatlik') },
    ],
  },
  {
    key: 'beauty',
    labels: L('Beauty', 'Uroda', 'Красота', 'Краса', 'Goʻzallik'),
    subcategories: [
      { key: 'beauty.hair_salon', labels: L('Hair salon', 'Salon fryzjerski', 'Парикмахерская', 'Перукарня', 'Soch saloni') },
      { key: 'beauty.barbershop', labels: L('Barbershop', 'Barber', 'Барбершоп', 'Барбершоп', 'Sartaroshxona') },
      { key: 'beauty.nail_salon', labels: L('Nail salon', 'Salon paznokci', 'Маникюрный салон', 'Манікюрний салон', 'Manikyur saloni') },
      { key: 'beauty.massage', labels: L('Massage', 'Masaż', 'Массаж', 'Масаж', 'Massaj') },
    ],
  },
  {
    key: 'housing',
    labels: L('Housing', 'Zakwaterowanie', 'Жильё', 'Житло', 'Turar joy'),
    subcategories: [
      { key: 'housing.student_house', labels: L('Student house', 'Dom studencki', 'Студенческое жильё', 'Студентське житло', 'Talabalar uyi') },
      { key: 'housing.long_term_rentals', labels: L('Long-term rentals', 'Najem długoterminowy', 'Долгосрочная аренда', 'Довгострокова оренда', 'Uzoq muddatli ijara') },
      { key: 'housing.hotels', labels: L('Hotels', 'Hotele', 'Отели', 'Готелі', 'Mehmonxonalar') },
    ],
  },
  {
    key: 'bakery',
    labels: L('Bakery', 'Piekarnia', 'Пекарня', 'Пекарня', 'Novvoyxona'),
    subcategories: [
      { key: 'bakery.bakery_cafe', labels: L('Bakery cafe', 'Piekarnia z kawiarnią', 'Пекарня-кафе', 'Пекарня-кафе', 'Novvoyxona-kafe') },
    ],
  },
  {
    key: 'halal',
    labels: L('Halal', 'Halal', 'Халяль', 'Халяль', 'Halol'),
    subcategories: [
      { key: 'halal.restaurant', labels: RESTAURANT },
      { key: 'halal.meat_store', labels: L('Meat store', 'Sklep mięsny', 'Мясной магазин', 'Мʼясна крамниця', 'Goʻsht doʻkoni') },
      { key: 'halal.burgers', labels: BURGERS },
      { key: 'halal.kebabs', labels: KEBABS },
    ],
  },
];

/** Every valid key, categories and subcategories alike. */
export const TAXONOMY_KEYS: ReadonlySet<string> = new Set(
  TAXONOMY.flatMap((node) => [node.key, ...node.subcategories.map((sub) => sub.key)]),
);

/** The eight category keys, in order — what `venues.category` holds. */
export const CATEGORY_KEYS: readonly string[] = TAXONOMY.map((node) => node.key);

/** A venue's own kind: one category key, and a subcategory key under it or none. */
export interface VenueKind {
  category: string;
  subcategory: string | null;
}

/**
 * A subcategory as a client may send it, resolved under [category]: the full
 * key (`restaurant.turkish`) or its last part (`turkish`). `null` when it is
 * not one of that category's.
 */
function subUnder(category: string, value: string | null | undefined): string | null {
  const node = TAXONOMY.find((n) => n.key === category);
  const raw = (value ?? '').trim().toLowerCase();
  if (!node || !raw) return null;
  const key = raw.includes('.') ? raw : `${category}.${norm(raw)}`;
  return node.subcategories.some((sub) => sub.key === key) ? key : null;
}

/**
 * Where a stored or sent pair of words files a venue in the tree, or `null`
 * when it files it nowhere. Keys pass through (a subcategory that is not under
 * its category is dropped, not moved); older words go through [LEGACY], taking
 * the first key they derive — taxonomy order, so Halal only when nothing else
 * applies, which is what a single category has to give up.
 */
export function kindOf(category: string | null | undefined, subcategory?: string | null, name?: string | null): VenueKind | null {
  const word = (category ?? '').trim().toLowerCase();
  if (CATEGORY_KEYS.includes(word)) return { category: word, subcategory: subUnder(word, subcategory) };
  const first = legacyTags({ category, subcategory, name })[0];
  if (!first) return null;
  const [top] = first.split('.');
  return { category: top, subcategory: first.includes('.') ? first : null };
}

/**
 * The rule for writing a venue's kind. A category key or a word [LEGACY] can
 * place (an app built before the tree still sends `cafe`) is accepted and
 * stored as its key; anything else is refused naming `category`. A subcategory
 * sent beside a category key must be under it, or it is refused naming
 * `subcategory` — beside a legacy word it is read as a legacy word too.
 */
export function checkKind(category: string, subcategory?: string | null): VenueKind {
  const word = category.trim().toLowerCase();
  const kind = kindOf(word, subcategory);
  if (!kind) {
    throw new DomainError('validation_failed', `unknown category: ${category}`, {
      field: 'category',
      allowed: CATEGORY_KEYS,
    });
  }
  if (CATEGORY_KEYS.includes(word) && subcategory != null && subcategory.trim() !== '' && kind.subcategory === null) {
    throw new DomainError('validation_failed', `${subcategory} is not a subcategory of ${word}`, {
      field: 'subcategory',
      allowed: TAXONOMY.find((n) => n.key === word)?.subcategories.map((sub) => sub.key) ?? [],
    });
  }
  return kind;
}

/**
 * A PATCH's kind, checked. `current` is the venue's stored category. A
 * subcategory sent alone is checked against it; a category that changes
 * without a subcategory that fits clears the old one, which belonged to the
 * old category. Absent fields stay absent, so a patch that does not touch the
 * kind does not touch it.
 */
export function checkKindPatch(
  sent: { category?: string; subcategory?: string; clearSubcategory?: boolean },
  current: string,
): { category?: string; subcategory?: string; clearSubcategory: boolean } {
  const clear = sent.clearSubcategory === true;
  if (sent.category !== undefined) {
    const kind = checkKind(sent.category, clear ? null : sent.subcategory);
    return {
      category: kind.category,
      subcategory: kind.subcategory ?? undefined,
      clearSubcategory: clear || (kind.subcategory === null && kind.category !== current),
    };
  }
  if (sent.subcategory !== undefined) {
    const kind = checkKind(current, sent.subcategory);
    return { subcategory: kind.subcategory ?? undefined, clearSubcategory: kind.subcategory === null };
  }
  return { clearSubcategory: clear };
}

/**
 * Boot's one-way tidy of rows written before the tree: every venue (and every
 * deal, which copies its venue's category) whose `category` is not a key is
 * rewritten to the key [kindOf] gives it. A word that places nowhere is left
 * alone — see the note at the top. Idempotent, and a no-op on a database that
 * is already tidy, so it runs on every boot. Returns how many rows it moved.
 */
export async function normaliseStoredKinds(db: Db): Promise<number> {
  const placeholders = CATEGORY_KEYS.map((_, i) => `$k${i}`).join(', ');
  const keys = Object.fromEntries(CATEGORY_KEYS.map((key, i) => [`k${i}`, key]));
  let moved = 0;
  const venues = await db.all<{ id: string; category: string; subcategory: string | null; name: string | null }>(
    `SELECT id, category, subcategory, name FROM venues WHERE category NOT IN (${placeholders})`,
    keys,
  );
  for (const venue of venues) {
    const kind = kindOf(venue.category, venue.subcategory, venue.name);
    if (!kind) continue;
    await db.run(`UPDATE venues SET category = $c, subcategory = $s WHERE id = $i`, {
      c: kind.category,
      s: kind.subcategory,
      i: venue.id,
    });
    moved++;
  }
  /* A deal's category is its venue's, copied at creation, or an offer kind
     the dashboard's drawer filed (`percentage`, `free_item`, …). Only a word
     [LEGACY] places is moved, so an offer kind is never mistaken for one. */
  const deals = await db.all<{ id: string; category: string }>(
    `SELECT id, category FROM hot_deals WHERE category IS NOT NULL AND category NOT IN (${placeholders})`,
    keys,
  );
  for (const deal of deals) {
    const kind = kindOf(deal.category);
    if (!kind) continue;
    await db.run(`UPDATE hot_deals SET category = $c WHERE id = $i`, { c: kind.category, i: deal.id });
    moved++;
  }
  return moved;
}

/** How many keys one venue may carry — enough for a kebab house with a shop. */
export const MAX_TAGS = 8;

type Lang = keyof Labels;
const LANGS: readonly Lang[] = ['en', 'pl', 'ru', 'uk', 'uz'];

/**
 * The tree as `GET /v1/categories` sends it. `label` is in the reader's
 * language (English when it has none of the five); `labels` carries all five,
 * so a client that switches language does not have to ask again.
 */
export function taxonomyFor(language?: string | null) {
  const lang: Lang = LANGS.includes(language as Lang) ? (language as Lang) : 'en';
  return {
    version: 1,
    categories: TAXONOMY.map((node) => ({
      key: node.key,
      label: node.labels[lang],
      labels: node.labels,
      subcategories: node.subcategories.map((sub) => ({
        key: sub.key,
        label: sub.labels[lang],
        labels: sub.labels,
      })),
    })),
  };
}

/**
 * A venue's list as a client sent it, checked: an array of known keys, at most
 * [MAX_TAGS], duplicates dropped, in taxonomy order. An unknown key is a 422,
 * not silently dropped — a form that sent it has a stale tree and should say so.
 */
export function checkTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new DomainError('validation_failed', 'tags is a list of category keys', { field: 'tags' });
  }
  const keys = new Set<string>();
  for (const value of raw) {
    const key = typeof value === 'string' ? value.trim() : '';
    if (!TAXONOMY_KEYS.has(key)) {
      throw new DomainError('validation_failed', `unknown category key: ${String(value)}`, {
        field: 'tags',
        key: String(value),
      });
    }
    keys.add(key);
  }
  if (keys.size > MAX_TAGS) {
    throw new DomainError('validation_failed', `at most ${MAX_TAGS} categories`, { field: 'tags', max: MAX_TAGS });
  }
  return ordered(keys);
}

/** Keys in the tree's own order, so a stored list reads the same however it was picked. */
function ordered(keys: ReadonlySet<string>): string[] {
  return [...TAXONOMY_KEYS].filter((key) => keys.has(key));
}

/** The stored column, read tolerantly: anything but a JSON array of known keys is "not picked". */
export function parseStored(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) return [];
    return ordered(new Set(value.filter((key): key is string => typeof key === 'string' && TAXONOMY_KEYS.has(key))));
  } catch {
    return [];
  }
}

/**
 * The legacy words, and where each one files a venue.
 *
 * The words come from four places: the importer (`places` + `cafe`,
 * `restaurant`, `halal_food`, …), the website's old seven-category form
 * (`cafe`, `barbershop`, `dental`, … with English subcategory labels such as
 * `Specialty coffee`), the guide's subcategory keys and `category_defaults`.
 * Normalised by [norm] before lookup. A word missing here files the venue
 * nowhere — it is still listed under All.
 */
export const LEGACY: Readonly<Record<string, readonly string[]>> = {
  // coffee
  cafe: ['coffee.coffee_shop'],
  cafes: ['coffee.coffee_shop'],
  coffee: ['coffee.coffee_shop'],
  coffee_shop: ['coffee.coffee_shop'],
  kawiarnia: ['coffee.coffee_shop'],
  specialty_coffee: ['coffee.coffee_shop'],
  brunch_spot: ['coffee.coffee_shop'],
  tea: ['coffee.coffee_shop'],
  tea_house: ['coffee.coffee_shop'],
  // bakery
  bakery: ['bakery'],
  bakeries: ['bakery'],
  piekarnia: ['bakery'],
  pastry: ['bakery'],
  patisserie: ['bakery'],
  cake: ['bakery'],
  cakes: ['bakery'],
  desserts: ['bakery'],
  bakery_cafe: ['bakery.bakery_cafe'],
  // restaurant
  restaurant: ['restaurant'],
  restaurants: ['restaurant'],
  food: ['restaurant'],
  dining: ['restaurant'],
  fast_food: ['restaurant'],
  street_food: ['restaurant'],
  georgian: ['restaurant'],
  turkish: ['restaurant.turkish'],
  indian: ['restaurant.indian'],
  polish: ['restaurant.polish'],
  asian: ['restaurant.asian'],
  pizza: ['restaurant.pizza'],
  burger: ['restaurant.burgers'],
  burgers: ['restaurant.burgers'],
  kebab: ['restaurant.kebabs'],
  kebabs: ['restaurant.kebabs'],
  sushi: ['restaurant.sushi'],
  // halal
  halal: ['halal'],
  halal_food: ['halal'],
  // shopping
  shopping: ['shopping'],
  shop: ['shopping'],
  shops: ['shopping'],
  store: ['shopping'],
  retail: ['shopping'],
  grocery: ['shopping'],
  groceries: ['shopping'],
  market: ['shopping'],
  supermarket: ['shopping'],
  clothing: ['shopping.fashion'],
  fashion: ['shopping.fashion'],
  electronics: ['shopping.electronics'],
  cosmetics: ['shopping.beauty_store'],
  // leisure
  leisure: ['leisure'],
  entertainment: ['leisure'],
  games: ['leisure.gaming'],
  gaming: ['leisure.gaming'],
  culture: ['leisure.culture'],
  cinema: ['leisure.culture'],
  museum: ['leisure.culture'],
  sport: ['leisure.sports'],
  sports: ['leisure.sports'],
  fitness: ['leisure.sports'],
  gym: ['leisure.sports'],
  boxing_club: ['leisure.sports'],
  wellness: ['leisure.wellness'],
  yoga_studio: ['leisure.wellness'],
  // beauty
  beauty: ['beauty'],
  salon: ['beauty'],
  brows_and_lashes: ['beauty'],
  hair: ['beauty.hair_salon'],
  hair_salon: ['beauty.hair_salon'],
  barbershop: ['beauty.barbershop'],
  barber: ['beauty.barbershop'],
  classic_barber: ['beauty.barbershop'],
  beard_and_shave: ['beauty.barbershop'],
  kids_cuts: ['beauty.barbershop'],
  nails: ['beauty.nail_salon'],
  nail_salon: ['beauty.nail_salon'],
  massage: ['beauty.massage'],
  spa: ['beauty.massage'],
  // housing
  housing: ['housing'],
  accommodation: ['housing'],
  apartments: ['housing'],
  hotel: ['housing.hotels'],
  hotels: ['housing.hotels'],
  hostel: ['housing.hotels'],
  dormitory: ['housing.student_house'],
  private_dormitory: ['housing.student_house'],
  student_house: ['housing.student_house'],
  real_estate: ['housing.long_term_rentals'],
  real_estate_agency: ['housing.long_term_rentals'],
  rentals: ['housing.long_term_rentals'],
};

/** `Specialty coffee`, `halal-food`, `Bakery café` → `specialty_coffee`, `halal_food`, `bakery_cafe`. */
export function norm(word: string | null | undefined): string {
  return (word ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_');
}

const HALAL_IN_NAME = /\bhalal\b/i;

/** The list a venue that has not picked one is filed under. */
export function legacyTags(venue: { category?: string | null; subcategory?: string | null; name?: string | null }): string[] {
  /* A row already in the tree files itself: its subcategory, or the bare
     category when it has none. */
  const word = (venue.category ?? '').trim().toLowerCase();
  if (CATEGORY_KEYS.includes(word)) return [subUnder(word, venue.subcategory) ?? word];
  const keys = new Set<string>();
  for (const word of [venue.category, venue.subcategory]) {
    for (const key of LEGACY[norm(word)] ?? []) keys.add(key);
  }
  if (venue.name && HALAL_IN_NAME.test(venue.name)) keys.add('halal');
  /* `housing` + `hotels` is just `housing.hotels`: a subcategory already
     implies its category, so the bare one is dropped beside it. */
  for (const key of [...keys]) {
    if (!key.includes('.') && [...keys].some((other) => other.startsWith(`${key}.`))) keys.delete(key);
  }
  return ordered(keys);
}

/**
 * The keys a venue is filed under: its own list when it has saved one, the
 * legacy derivation otherwise. Every response that describes a venue to a
 * customer sends this as `categories`.
 */
export function tagsOf(venue: {
  tags?: string | null;
  category?: string | null;
  subcategory?: string | null;
  name?: string | null;
}): string[] {
  const own = parseStored(venue.tags);
  return own.length > 0 ? own : legacyTags(venue);
}

/**
 * Whether a venue filed under [tags] is under [key]: a category matches itself
 * and every one of its subcategories, a subcategory only itself.
 */
export function under(tags: readonly string[], key: string): boolean {
  return key.includes('.') ? tags.includes(key) : tags.some((tag) => tag === key || tag.startsWith(`${key}.`));
}
