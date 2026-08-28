/**
 * A demonstration venue set, for a deployment that has no other way to be
 * non-empty.
 *
 * **This exists because of one production fact.** `main.ts` imports the old
 * database when the venue table is empty, and the old database — `new-data/` —
 * is gitignored on purpose: it is the previous app's *live* data, full of real
 * names, addresses and transactions, and it must never reach a remote. So on the
 * VPS that directory does not exist, the import correctly reports "nothing
 * (new-data/ not found)", and the site comes up with `GET /v1/venues` returning
 * `[]` for ever. A catalogue with nothing in it is not a quiet launch, it is a
 * broken one: no listing, no deal, no funnel, and nothing for the reach
 * recorder, the venue page or the partner dashboard to be shown against.
 *
 * So these seven rows. Three things are true of them and all three are the
 * point:
 *
 * 1. **They are a demonstration, not customer data.** Every id is prefixed
 *    `*_demo_*` (`ven_demo_krk_cafe`, `del_demo_krk_cafe_15`, …), every venue
 *    name carries `(demo)`, every description says so in both languages it is
 *    written in, and `platform_config.demo_seed` records the moment they were
 *    written — which the admin console lists, so an operator can see them
 *    without reading this file. **Delete them the day the first real venue is
 *    onboarded**; `DELETE FROM venues WHERE id LIKE 'ven\_demo\_%' ESCAPE '\'`
 *    takes the deals, tiers, budgets, campaigns and hours with it.
 * 2. **Nobody owns them.** `owner_user_id` is NULL, which the schema allows and
 *    a public listing does not mind. The alternative is a seeded partner account
 *    with a password in the repository, and `provisionAdmin` states the rule
 *    that forbids it: a credential in a file is a back door into somebody's
 *    money, found by whoever reads the file next. A demo listing is worth having;
 *    a guessable way into the partner dashboard on production is not. The
 *    contact address is `demo@pay-lez.com` — a domain we control — and the phone
 *    is NULL, because there is no phone.
 * 3. **Nothing here is invented that would be a lie if believed.** No ratings,
 *    no review counts, no funnel events, no visits: a venue nobody has reviewed
 *    has no rating, and inventing one is inventing the exact number the
 *    dashboard argues from. The addresses are districts rather than street
 *    numbers for the same reason — a fabricated postal address is somebody's
 *    front door.
 *
 * Idempotent by construction, like the import: **every id is derived, and every
 * write is an upsert on it.** `ON CONFLICT (id) DO UPDATE` rather than
 * `INSERT OR REPLACE`, because REPLACE deletes the row before re-inserting it
 * and SQLite applies `ON DELETE CASCADE` while it does — which would take a
 * venue's deals, budget and tiers with it on every second run. It is only ever
 * called on an empty venue table, but "only called once" is not a property worth
 * relying on.
 */
import type { Db } from './db.ts';
import { CONFIG } from '../config.ts';
import { setConfig } from '../domain/settings.ts';
import { localMonth, now, plusDays, type Iso } from '../domain/time.ts';

/** What the boot log prints, in the shape the import's own summary prints in. */
export interface DemoSummary {
  venues: number;
  deals: number;
  campaigns: number;
  voucherTiers: number;
  budgets: number;
}

const TIMEZONE = 'Europe/Warsaw';
const CURRENCY = 'PLN';
/** Long enough that a demo deployment does not quietly empty itself in a week. */
const DEAL_WINDOW_DAYS = 90;
/** A domain we control. There is no inbox behind a demo venue and no phone. */
const CONTACT_EMAIL = 'demo@pay-lez.com';

interface DemoDeal {
  slug: string;
  discountText: string;
  title: string;
  titlePl: string;
  description: string;
  descriptionPl: string;
  /** English only, deliberately: a deal with a gap in it is the realistic case,
   *  and `deals.completeness` is what the dashboard shows the gap with. */
  terms: string;
}

interface DemoVenue {
  slug: string;
  name: string;
  /** One of `category_defaults` — the average check falls back through it. */
  category: string;
  city: string;
  /** District, not a street number. See the file header. */
  district: string;
  lat: number;
  lng: number;
  avgCheckMinor: number;
  pointsPerScan: number;
  budgetMinor: number;
  /** Minutes past venue-local midnight, and the weekdays it is shut (0 = Mon). */
  opens: number;
  closes: number;
  closedOn?: number[];
  campaign: { visits: number; label: string; labelPl: string; costMinor: number };
  description: string;
  descriptionPl: string;
  deals: DemoDeal[];
}

const h = (hour: number) => hour * 60;

/**
 * Seven venues, two cities, seven categories.
 *
 * Polish because that is the market the rest of the product is in — `#/business`
 * quotes Kraków and Warsaw sites to a reader in whatever currency their language
 * prices in, and a demo catalogue in another country would contradict the pitch
 * one page over. Seven categories rather than seven cafés because the category
 * is what `category_defaults`, the benchmark job and the console's comparison
 * all read; a single-category catalogue exercises none of them.
 */
const DEMO: DemoVenue[] = [
  {
    slug: 'krk_cafe',
    name: 'Kawiarnia Kazimierz (demo)',
    category: 'cafe',
    city: 'Krakow',
    district: 'Kazimierz',
    lat: 50.0498,
    lng: 19.9448,
    avgCheckMinor: 3200,
    pointsPerScan: 5,
    budgetMinor: 150_000,
    opens: h(7),
    closes: h(20),
    campaign: {
      visits: 8,
      label: 'A filter coffee on the house',
      labelPl: 'Kawa przelewowa na koszt lokalu',
      costMinor: 1200,
    },
    description:
      'A demonstration listing. There is no café at this address — the row exists so the venue page, the deal funnel and the partner dashboard have something to render before real partners are onboarded.',
    descriptionPl:
      'Wpis demonstracyjny. Pod tym adresem nie ma kawiarni — ten wpis istnieje po to, żeby strona lokalu, lejek ofert i panel partnera miały co pokazać, zanim pojawią się prawdziwi partnerzy.',
    deals: [
      {
        slug: 'fifteen',
        discountText: '-15%',
        title: 'Fifteen percent off the whole order',
        titlePl: 'Piętnaście procent na całe zamówienie',
        description:
          'Show the deal at the counter. It comes off the whole bill — coffee, cake and everything else on it.',
        descriptionPl:
          'Pokaż ofertę przy kasie. Zniżka obejmuje cały rachunek — kawę, ciasto i wszystko inne.',
        terms: 'One use per person per day. Not combined with another offer.',
      },
      {
        slug: 'set',
        discountText: 'Coffee and cake 25 zł',
        title: 'Coffee and cake for 25 zł',
        titlePl: 'Kawa i ciasto za 25 zł',
        description: 'Any filter coffee with any slice from the counter, at one price.',
        descriptionPl: 'Dowolna kawa przelewowa i dowolny kawałek ciasta w jednej cenie.',
        terms: 'Dine in only, and subject to what is on the counter that day.',
      },
    ],
  },
  {
    slug: 'krk_restaurant',
    name: 'Restauracja Podgórze (demo)',
    category: 'restaurant',
    city: 'Krakow',
    district: 'Podgórze',
    lat: 50.0455,
    lng: 19.9556,
    avgCheckMinor: 8500,
    pointsPerScan: 8,
    budgetMinor: 400_000,
    opens: h(12),
    closes: h(22),
    campaign: {
      visits: 6,
      label: 'A dessert on the house',
      labelPl: 'Deser na koszt lokalu',
      costMinor: 2200,
    },
    description:
      'A demonstration listing. There is no restaurant at this address; it is here so a venue with a budget, a stamp card and two live deals can be looked at end to end.',
    descriptionPl:
      'Wpis demonstracyjny. Pod tym adresem nie ma restauracji; wpis istnieje po to, żeby dało się obejrzeć lokal z budżetem, kartą pieczątek i dwiema aktywnymi ofertami.',
    deals: [
      {
        slug: 'lunch',
        discountText: '-20% on lunch',
        title: 'Twenty percent off the lunch menu',
        titlePl: 'Dwadzieścia procent na menu lunchowe',
        description: 'The whole lunch menu, for anybody who checks in with Paylez.',
        descriptionPl: 'Całe menu lunchowe dla każdego, kto zamelduje się przez Paylez.',
        terms: 'One use per person per visit.',
      },
      {
        slug: 'wine',
        discountText: 'Carafe of wine 1 zł',
        title: 'A carafe of house wine for 1 zł',
        titlePl: 'Karafka wina domowego za 1 zł',
        description: 'With any two main courses from the à la carte menu.',
        descriptionPl: 'Do dowolnych dwóch dań głównych z karty.',
        terms: 'Over-18s only. One carafe per table.',
      },
    ],
  },
  {
    slug: 'krk_bakery',
    name: 'Piekarnia Nowa Huta (demo)',
    category: 'bakery',
    city: 'Krakow',
    district: 'Nowa Huta',
    lat: 50.072,
    lng: 20.038,
    avgCheckMinor: 1800,
    pointsPerScan: 4,
    budgetMinor: 90_000,
    opens: h(6),
    closes: h(19),
    campaign: {
      visits: 10,
      label: 'A sourdough loaf',
      labelPl: 'Bochenek chleba na zakwasie',
      costMinor: 900,
    },
    description:
      'A demonstration listing. The smallest average check in the demo set, which is what makes it useful: it is the venue the per-claim and per-visit costs are hardest to round sensibly.',
    descriptionPl:
      'Wpis demonstracyjny. Najniższy średni rachunek w zestawie demonstracyjnym — i właśnie dlatego przydatny: to lokal, przy którym najtrudniej sensownie zaokrąglić koszt na zgłoszenie i na wizytę.',
    deals: [
      {
        slug: 'pastry',
        discountText: 'Second pastry 1 zł',
        title: 'A second pastry for 1 zł',
        titlePl: 'Druga drożdżówka za 1 zł',
        description: 'Buy one from the case, take a second for a złoty.',
        descriptionPl: 'Kup jedną z witryny, drugą weź za złotówkę.',
        terms: 'The cheaper of the two is the one charged at 1 zł.',
      },
      {
        slug: 'bread',
        discountText: '-30% on bread',
        title: 'Thirty percent off every loaf',
        titlePl: 'Trzydzieści procent na każdy bochenek',
        description: 'Every bread on the shelf, while it is on the shelf.',
        descriptionPl: 'Każdy chleb na półce, dopóki jest na półce.',
        terms: 'Bread only — pastries and sandwiches are not included.',
      },
    ],
  },
  {
    slug: 'krk_fitness',
    name: 'Klub Fitness Zabłocie (demo)',
    category: 'fitness',
    city: 'Krakow',
    district: 'Zabłocie',
    lat: 50.047,
    lng: 19.964,
    avgCheckMinor: 14_000,
    pointsPerScan: 10,
    budgetMinor: 300_000,
    opens: h(6),
    closes: h(23),
    campaign: {
      visits: 10,
      label: 'A guest pass for a friend',
      labelPl: 'Karnet gościnny dla znajomego',
      costMinor: 3500,
    },
    description:
      'A demonstration listing. A membership venue rather than a till venue, which is the case where "a visit" and "a purchase" are not the same event.',
    descriptionPl:
      'Wpis demonstracyjny. Lokal abonamentowy, a nie kasowy — czyli przypadek, w którym „wizyta” i „zakup” to nie to samo zdarzenie.',
    deals: [
      {
        slug: 'first',
        discountText: 'First month -25%',
        title: 'Twenty-five percent off the first month',
        titlePl: 'Dwadzieścia pięć procent na pierwszy miesiąc',
        description: 'On any membership, for anybody who has not trained here before.',
        descriptionPl: 'Na dowolny karnet, dla każdego, kto nie trenował tu wcześniej.',
        terms: 'New members only. One use per person.',
      },
      {
        slug: 'class',
        discountText: 'One class free',
        title: 'One class on the house',
        titlePl: 'Jedne zajęcia gratis',
        description: 'Any group class with a place left in it.',
        descriptionPl: 'Dowolne zajęcia grupowe, na których jest wolne miejsce.',
        terms: 'Booking required. Subject to availability.',
      },
    ],
  },
  {
    slug: 'waw_barber',
    name: 'Barber Wola (demo)',
    category: 'barbershop',
    city: 'Warsaw',
    district: 'Wola',
    lat: 52.232,
    lng: 20.97,
    avgCheckMinor: 6500,
    pointsPerScan: 8,
    budgetMinor: 180_000,
    opens: h(10),
    closes: h(20),
    closedOn: [6],
    campaign: {
      visits: 5,
      label: 'A beard trim',
      labelPl: 'Podcięcie brody',
      costMinor: 4000,
    },
    description:
      'A demonstration listing, and the first of the two Warsaw ones — the city filter on the catalogue has nothing to filter with a single-city demo set.',
    descriptionPl:
      'Wpis demonstracyjny i pierwszy z dwóch warszawskich — filtr miasta w katalogu nie ma czego filtrować, jeśli zestaw demonstracyjny obejmuje jedno miasto.',
    deals: [
      {
        slug: 'cut',
        discountText: '-20% on a cut',
        title: 'Twenty percent off a haircut',
        titlePl: 'Dwadzieścia procent na strzyżenie',
        description: 'Any cut on the price list, with any barber on the floor.',
        descriptionPl: 'Dowolne strzyżenie z cennika, u dowolnego barbera.',
        terms: 'Booking required. One use per person per visit.',
      },
      {
        slug: 'pair',
        discountText: 'Cut and beard 90 zł',
        title: 'Cut and beard for 90 zł',
        titlePl: 'Strzyżenie i broda za 90 zł',
        description: 'The two together, at one price rather than two.',
        descriptionPl: 'Oba zabiegi razem, w jednej cenie zamiast dwóch.',
        terms: 'Both in the same appointment.',
      },
    ],
  },
  {
    slug: 'waw_beauty',
    name: 'Studio Urody Mokotów (demo)',
    category: 'beauty',
    city: 'Warsaw',
    district: 'Mokotów',
    lat: 52.19,
    lng: 21.025,
    avgCheckMinor: 12_000,
    pointsPerScan: 10,
    budgetMinor: 250_000,
    opens: h(9),
    closes: h(20),
    closedOn: [6],
    campaign: {
      visits: 5,
      label: 'An express manicure',
      labelPl: 'Manicure ekspresowy',
      costMinor: 6000,
    },
    description:
      'A demonstration listing. A high average check against a modest budget, which is the pair of numbers the voucher ladder degrades on.',
    descriptionPl:
      'Wpis demonstracyjny. Wysoki średni rachunek przy skromnym budżecie — czyli para liczb, na której drabina voucherów zaczyna schodzić w dół.',
    deals: [
      {
        slug: 'first',
        discountText: 'First treatment -25%',
        title: 'Twenty-five percent off a first treatment',
        titlePl: 'Dwadzieścia pięć procent na pierwszy zabieg',
        description: 'Any single treatment from the price list.',
        descriptionPl: 'Dowolny pojedynczy zabieg z cennika.',
        terms: 'One use per person. Booking required.',
      },
      {
        slug: 'brows',
        discountText: 'Brows and lashes 120 zł',
        title: 'Brows and lashes for 120 zł',
        titlePl: 'Brwi i rzęsy za 120 zł',
        description: 'Shaping and tinting for both, in one appointment.',
        descriptionPl: 'Regulacja i koloryzacja obu, podczas jednej wizyty.',
        terms: 'Roughly an hour. Booking required.',
      },
    ],
  },
  {
    slug: 'waw_hotel',
    name: 'Hotel Praga Nord (demo)',
    category: 'hotels',
    city: 'Warsaw',
    district: 'Praga-Północ',
    lat: 52.256,
    lng: 21.033,
    avgCheckMinor: 32_000,
    pointsPerScan: 15,
    budgetMinor: 600_000,
    opens: 0,
    closes: 1440,
    campaign: {
      visits: 4,
      label: 'A late checkout',
      labelPl: 'Późne wymeldowanie',
      costMinor: 5000,
    },
    description:
      'A demonstration listing, and the only one open around the clock — which is what a venue with no closing time looks like to the quiet-hours rule and the heat map.',
    descriptionPl:
      'Wpis demonstracyjny i jedyny czynny całą dobę — czyli to, jak lokal bez godziny zamknięcia wygląda dla reguły ciszy nocnej i mapy godzin.',
    deals: [
      {
        slug: 'direct',
        discountText: '-15% booked direct',
        title: 'Fifteen percent off a direct booking',
        titlePl: 'Piętnaście procent przy rezerwacji bezpośredniej',
        description: 'Any room, any night still free, booked at the desk or by phone.',
        descriptionPl: 'Dowolny pokój, dowolna wolna noc, rezerwacja w recepcji lub telefonicznie.',
        terms: 'Not combined with an agency rate.',
      },
      {
        slug: 'breakfast',
        discountText: 'Breakfast included',
        title: 'Breakfast included with the room',
        titlePl: 'Śniadanie w cenie pokoju',
        description: 'For every guest on the booking, every morning of the stay.',
        descriptionPl: 'Dla każdego gościa z rezerwacji, każdego ranka pobytu.',
        terms: 'Served until 10:30.',
      },
    ],
  },
];

/**
 * Write the demo set. Safe to call twice; only ever called on an empty
 * catalogue.
 *
 * The whole thing is one transaction: a half-written venue — live, listed, and
 * with no deals or tiers behind it — is worse than no venue, because it is a
 * listing that renders and then has nothing on it.
 */
export function seedDemo(db: Db, at: Iso = now()): DemoSummary {
  const summary: DemoSummary = { venues: 0, deals: 0, campaigns: 0, voucherTiers: 0, budgets: 0 };
  const period = localMonth(at, TIMEZONE);
  const validTo = plusDays(at, DEAL_WINDOW_DAYS);

  db.tx(() => {
    for (const venue of DEMO) {
      const venueId = `ven_demo_${venue.slug}`;

      db.run(
        `INSERT INTO venues
           (id, owner_user_id, name, category, subcategory, city, country_code, address,
            lat, lng, timezone, currency, price_range, image_url, rating, review_count,
            phone, email, status, verified_at, amount_entry, min_spend_minor, max_amount_minor,
            avg_check_minor, avg_check_source, accepts_vouchers, points_per_scan,
            scan_cooldown_hours, loyalty_active, founding_partner, created_at, updated_at)
         VALUES ($i, NULL, $n, $ca, NULL, $ci, 'PL', $ad, $la, $ln, $tz, $cu, NULL, NULL,
                 NULL, 0, NULL, $em, 'live', $t, 'cashier', $ms, $mx, $avg, 'category', 1,
                 $pps, 24, 1, 0, $t, $t)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name, category = excluded.category, city = excluded.city,
           address = excluded.address, lat = excluded.lat, lng = excluded.lng,
           email = excluded.email, status = excluded.status, verified_at = excluded.verified_at,
           avg_check_minor = excluded.avg_check_minor, points_per_scan = excluded.points_per_scan,
           updated_at = excluded.updated_at`,
        {
          i: venueId,
          n: venue.name,
          ca: venue.category,
          ci: venue.city,
          ad: `${venue.district}, ${venue.city}`,
          la: venue.lat,
          ln: venue.lng,
          tz: TIMEZONE,
          cu: CURRENCY,
          em: CONTACT_EMAIL,
          ms: CONFIG.gate.minSpendMinor,
          mx: CONFIG.gate.maxAmountMinor,
          avg: venue.avgCheckMinor,
          pps: venue.pointsPerScan,
          t: at,
        },
      );
      summary.venues += 1;

      /* B1 says nothing publishes before verification, and these are published.
         The record is what says *how* they came to be verified, and the honest
         answer is that a seeding routine wrote them. */
      db.run(
        `INSERT INTO verification_records
           (id, venue_id, method, status, legal_name, note, submitted_at, reviewed_at)
         VALUES ($i, $v, 'manual', 'approved', NULL, $note, $t, $t)
         ON CONFLICT (id) DO UPDATE SET note = excluded.note, reviewed_at = excluded.reviewed_at`,
        {
          i: `ver_demo_${venue.slug}`,
          v: venueId,
          note: 'demonstration listing seeded by db/demo.ts — not a verified business',
          t: at,
        },
      );

      for (let weekday = 0; weekday < 7; weekday += 1) {
        const closed = venue.closedOn?.includes(weekday) ?? false;
        db.run(
          `INSERT INTO venue_hours (venue_id, weekday, opens_min, closes_min, closed)
           VALUES ($v, $d, $o, $c, $x)
           ON CONFLICT (venue_id, weekday) DO UPDATE SET
             opens_min = excluded.opens_min, closes_min = excluded.closes_min,
             closed = excluded.closed`,
          {
            v: venueId,
            d: weekday,
            o: closed ? null : venue.opens,
            c: closed ? null : venue.closes,
            x: closed,
          },
        );
      }

      putText(db, 'venue', venueId, 'description', 'en', venue.description, at);
      putText(db, 'venue', venueId, 'description', 'pl', venue.descriptionPl, at);

      /* The ladder every venue starts on (§4.1), from `CONFIG` rather than
         retyped here — a demo that disagrees with the default is a demo that
         teaches the wrong number. */
      for (const tier of CONFIG.vouchers.defaultTiers) {
        db.run(
          `INSERT INTO voucher_tiers
             (id, venue_id, discount_pct, points_cost, max_discount_minor, active, created_at, updated_at)
           VALUES ($i, $v, $p, $pts, $cap, 1, $t, $t)
           ON CONFLICT (id) DO UPDATE SET
             points_cost = excluded.points_cost,
             max_discount_minor = excluded.max_discount_minor,
             active = excluded.active, updated_at = excluded.updated_at`,
          {
            i: `vtr_demo_${venue.slug}_${tier.pct}`,
            v: venueId,
            p: tier.pct,
            pts: tier.points,
            cap: tier.maxDiscountMinor,
            t: at,
          },
        );
        summary.voucherTiers += 1;
      }

      /* A budget with no movements: spent 0, reserved 0, available = base. The
         three states exhaust the pool trivially, which is the state a venue that
         has not paid anything out is genuinely in. */
      db.run(
        `INSERT INTO budgets (id, venue_id, period, currency, total_minor, loyalty_bp, created_at, updated_at)
         VALUES ($i, $v, $p, $c, $tot, $bp, $t, $t)
         ON CONFLICT (id) DO UPDATE SET
           total_minor = excluded.total_minor, loyalty_bp = excluded.loyalty_bp,
           updated_at = excluded.updated_at`,
        {
          i: `bdg_demo_${venue.slug}_${period}`,
          v: venueId,
          p: period,
          c: CURRENCY,
          tot: venue.budgetMinor,
          bp: CONFIG.loyalty.defaultLoyaltyBp,
          t: at,
        },
      );
      summary.budgets += 1;

      /* §5.1: visits trigger, fixed reward, exact cost. Not a percentage — that
         is a voucher, and the two never blur. */
      const campaignId = `cmp_demo_${venue.slug}`;
      db.run(
        `INSERT INTO campaigns
           (id, venue_id, name, visits_required, reward_label, reward_cost_minor, priority,
            recurring, min_spend_minor, reward_valid_days, status, created_at, updated_at)
         VALUES ($i, $v, $n, $vr, $rl, $rc, 0, 1, NULL, $rd, 'active', $t, $t)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name, visits_required = excluded.visits_required,
           reward_label = excluded.reward_label, reward_cost_minor = excluded.reward_cost_minor,
           status = excluded.status, updated_at = excluded.updated_at`,
        {
          i: campaignId,
          v: venueId,
          n: venue.campaign.label,
          vr: venue.campaign.visits,
          rl: venue.campaign.label,
          rc: venue.campaign.costMinor,
          rd: CONFIG.loyalty.rewardValidityDays,
          t: at,
        },
      );
      putText(db, 'campaign', campaignId, 'reward_label', 'en', venue.campaign.label, at);
      putText(db, 'campaign', campaignId, 'reward_label', 'pl', venue.campaign.labelPl, at);
      summary.campaigns += 1;

      for (const deal of venue.deals) {
        const dealId = `del_demo_${venue.slug}_${deal.slug}`;
        /* No targeting at all — no weekdays, no window, no language, no
           audience. A demo deal that is only claimable on Tuesdays in Polish is
           a demo deal that is invisible six days a week, and the whole reason
           these rows exist is that the catalogue was empty. */
        db.run(
          `INSERT INTO hot_deals
             (id, venue_id, partner_name, city, country_code, category, subcategory,
              discount_text, promo_code, image_url, status, valid_from, valid_to,
              target_weekdays, target_from_min, target_to_min, target_languages, target_audience,
              cap_claims, cap_spend_minor, points_required, created_by,
              created_at, updated_at, published_at)
           VALUES ($i, $v, $pn, $ci, 'PL', $ca, NULL, $dt, NULL, NULL, 'live', $t, $vt,
                   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, $t, $t, $t)
           ON CONFLICT (id) DO UPDATE SET
             partner_name = excluded.partner_name, city = excluded.city,
             category = excluded.category, discount_text = excluded.discount_text,
             status = excluded.status, valid_from = excluded.valid_from,
             valid_to = excluded.valid_to, updated_at = excluded.updated_at,
             published_at = excluded.published_at`,
          {
            i: dealId,
            v: venueId,
            pn: venue.name,
            ci: venue.city,
            ca: venue.category,
            dt: deal.discountText,
            t: at,
            vt: validTo,
          },
        );
        putText(db, 'hot_deal', dealId, 'title', 'en', deal.title, at);
        putText(db, 'hot_deal', dealId, 'title', 'pl', deal.titlePl, at);
        putText(db, 'hot_deal', dealId, 'description', 'en', deal.description, at);
        putText(db, 'hot_deal', dealId, 'description', 'pl', deal.descriptionPl, at);
        putText(db, 'hot_deal', dealId, 'terms', 'en', deal.terms, at);
        summary.deals += 1;
      }
    }

    /* Visible in the console's own config table (`GET /v1/admin/config`), so an
       operator finds out these rows are a demonstration without reading this
       file — and knows when they arrived. */
    setConfig(db, 'demo_seed', at, at);
  });

  return summary;
}

/** The same upsert `db/import.ts` writes copy with, for the same reason. */
function putText(
  db: Db,
  entity: string,
  id: string,
  field: string,
  language: string,
  value: string,
  at: Iso,
): void {
  db.run(
    `INSERT INTO translations (entity, entity_id, field, language, value, updated_at)
     VALUES ($e, $i, $f, $l, $v, $t)
     ON CONFLICT (entity, entity_id, field, language)
     DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    { e: entity, i: id, f: field, l: language, v: value, t: at },
  );
}
