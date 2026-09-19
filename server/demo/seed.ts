/**
 * `npm run demo:seed` — one invented café in Kraków, its owner, and twenty-five
 * customers with two months of history, written through the real domain
 * functions so every screen the dashboard and the wallet draw has something
 * true-to-the-rules to draw.
 *
 * **This is not a seed in the sense `CLAUDE.md` forbids, and the difference is
 * the whole design.** Nothing here runs at boot, nothing is written unless a
 * person types the command, and `npm run demo:purge` removes every row that
 * belongs to these accounts and this venue. The café is named as a demo, every
 * address is on the reserved `.test` domain, and the links point nowhere real.
 *
 * Three rules shape the file:
 *
 * - **Value moves only through the domain.** Points, stamps, rewards, vouchers,
 *   pool movements and funnel counters are written by `gate.confirm`,
 *   `vouchers.issue`, `deals.track` and friends, never by hand, so
 *   `ledger.reconcile` and the three-state pool identity hold — and are asserted
 *   at the end rather than assumed.
 * - **Time is backdated, and processed in order.** Every call is given an `at`,
 *   and a single queue replays them oldest first, because the rules read
 *   history: the 24-hour scan cooldown, the average check, a budget month
 *   inheriting the last one, the push frequency cap.
 * - **Chance is seeded.** The same run twice describes the same café. Ids and
 *   the password stay random.
 *
 * Where no domain function exists, the gap is filled in the narrowest way that
 * keeps the invariants, and each one says so at the point of use: a venue's
 * spoken languages and description (no writer yet), the verification decision
 * when no admin account exists, and finishing the one deal push that has
 * already "gone out" (nothing in the server sends a scheduled push).
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import * as accounts from '../domain/accounts.ts';
import * as audit from '../domain/audit.ts';
import * as budget from '../domain/budget.ts';
import * as campaigns from '../domain/campaigns.ts';
import * as consent from '../domain/consent.ts';
import * as deals from '../domain/deals.ts';
import * as entitlements from '../domain/entitlements.ts';
import * as gate from '../domain/gate.ts';
import * as ledger from '../domain/ledger.ts';
import * as notifications from '../domain/notifications.ts';
import * as partners from '../domain/partners.ts';
import * as social from '../domain/social.ts';
import * as vouchers from '../domain/vouchers.ts';
import { DomainError } from '../domain/errors.ts';
import { seedPlatform } from '../domain/settings.ts';
import { local, type Iso } from '../domain/time.ts';
import { getVenue, refreshAverageCheck, trackListing } from '../domain/venues.ts';
import { purgeDemo } from './purge.ts';
import {
  DEMO_DOMAIN,
  Refusal,
  confirmTarget,
  describeTarget,
  findDemo,
  flag,
  openTarget,
  option,
  prng,
  shiftDay,
  zoned,
} from './shared.ts';

/* ════════════════════════════════════════════════════════════ the plan ══ */

/** Fixed, so two runs replay the same two months. Any number would do. */
const SEED = 20_260_911;
const TZ = 'Europe/Warsaw';
/** Day offsets from today, venue-local. Setup happens before the first visit. */
const SETUP_DAY = -72;
/**
 * Seventy days of visits rather than sixty, for one status: a customer is
 * `lapsed` after sixty idle days (`CONFIG.deals.lapsedDays`), which a sixty-day
 * history cannot contain. Two customers visit only in the first week.
 */
const FIRST_VISIT_DAY = -70;

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const VENUE = {
  name: 'Demo Café Kraków',
  category: 'cafe',
  subcategory: 'coffee',
  city: 'Krakow',
  countryCode: 'PL',
  /* "Przykładowa" is "Example": a street name that announces itself. */
  address: 'ul. Przykładowa 1, 31-001 Kraków',
  lat: 50.0605,
  lng: 19.9402,
  timezone: TZ,
  currency: 'PLN',
  priceRange: '12-45 PLN',
  phone: '+48 000 000 100',
  email: `cafe@${DEMO_DOMAIN}`,
} as const;

/*
 * Links that open nothing belonging to anybody. `.test` is reserved and never
 * resolves, and the map link is a coordinate search rather than a place, so a
 * tester pressing either lands nowhere a real business lives.
 */
const LINKS = [
  { kind: 'website', value: `https://cafe.${DEMO_DOMAIN}` },
  { kind: 'instagram', value: `https://instagram.${DEMO_DOMAIN}/demo-cafe-krakow` },
  { kind: 'google_maps', value: `https://www.google.com/maps/search/?api=1&query=${VENUE.lat},${VENUE.lng}` },
];

/** 0 = Monday. Minutes past local midnight. */
const HOURS = [
  ...[0, 1, 2, 3, 4].map((weekday) => ({ weekday, opensMin: 450, closesMin: 1140 })),
  { weekday: 5, opensMin: 540, closesMin: 1200 },
  { weekday: 6, opensMin: 600, closesMin: 1020 },
];

const SPOKEN = ['pl', 'en', 'uk', 'ru'];

const DESCRIPTION: Record<string, string> = {
  en: 'A small neighbourhood café near the Old Town, invented for testing Paylez: speciality coffee, breakfast until noon and cakes baked on site. Everything about this venue is demonstration data.',
  pl: 'Mała osiedlowa kawiarnia niedaleko Starego Miasta, wymyślona do testowania Paylez: kawa speciality, śniadania do południa i ciasta pieczone na miejscu. Wszystkie dane tego lokalu są demonstracyjne.',
  uk: 'Невелика кав’ярня біля Старого міста, створена для тестування Paylez: спешелті-кава, сніданки до полудня й випічка власного виробництва. Усі дані цього закладу демонстраційні.',
  ru: 'Небольшое кафе рядом со Старым городом, придуманное для тестирования Paylez: спешелти-кофе, завтраки до полудня и выпечка собственного производства. Все данные этого заведения демонстрационные.',
  uz: 'Eski shahar yaqinidagi kichik qahvaxona, Paylez’ni sinab ko‘rish uchun o‘ylab topilgan: maxsus qahva, tushgacha nonushta va joyida pishirilgan shirinliklar. Ushbu joy haqidagi barcha ma’lumotlar namunaviy.',
};

/**
 * A budget per month, in grosze, 70% loyalty. Sized so the loyalty bar is
 * visibly used and never empty: a reward the pool cannot fund still stamps the
 * card but earns nothing, which is a real state and a confusing first screen.
 */
const BUDGETS = [90_000, 100_000, 110_000, 120_000];
const LOYALTY_BP = 7000;

interface CampaignPlan {
  key: 'coffee' | 'pastry' | 'lunch';
  name: string;
  visitsRequired: number;
  rewardLabel: string;
  rewardCostMinor: number;
  priority: number;
  minSpendMinor?: number;
  rewardValidDays: number;
  pauseDay?: number;
}

const CAMPAIGNS: CampaignPlan[] = [
  { key: 'coffee', name: 'Coffee card', visitsRequired: 5, rewardLabel: 'Free coffee of your choice', rewardCostMinor: 900, priority: 10, rewardValidDays: 30 },
  /* Fourteen days, so some pastries are never collected and expire inside the
     history — the "expired" count on the campaigns screen needs one. */
  { key: 'pastry', name: 'Pastry card', visitsRequired: 4, rewardLabel: 'Free pastry', rewardCostMinor: 700, priority: 5, minSpendMinor: 2500, rewardValidDays: 14 },
  { key: 'lunch', name: 'Lunch club', visitsRequired: 6, rewardLabel: 'Free lunch set', rewardCostMinor: 1800, priority: 1, minSpendMinor: 3500, rewardValidDays: 45, pauseDay: -24 },
];

type DealCopy = Record<string, { title: string; description: string; terms?: string }>;

interface DealPlan {
  key: string;
  /** `percent` when the badge carries a `%`, which is how the insights tell them apart. */
  kind: 'percent' | 'item';
  badge: string;
  /** Published on this day at `fromMinutes`; null leaves it a draft. */
  publishDay: number | null;
  createDay: number;
  fromMinutes: number;
  untilDay: number;
  pauseDay?: number;
  /** Its window closes inside the history, so it ends `expired`. */
  expires?: boolean;
  capClaims?: number;
  copy: DealCopy;
}

const DEALS: DealPlan[] = [
  {
    key: 'lemonade', kind: 'percent', badge: '25% OFF', createDay: -68, publishDay: -68, fromMinutes: 540, untilDay: -20, expires: true,
    copy: {
      en: { title: 'Summer lemonade: 25% off', description: 'Homemade lemonade with mint, for as long as summer lasts.', terms: 'While the summer menu lasts.' },
      pl: { title: 'Letnia lemoniada: 25% taniej', description: 'Domowa lemoniada z miętą, dopóki trwa lato.', terms: 'Do końca menu letniego.' },
      uk: { title: 'Літній лимонад: знижка 25%', description: 'Домашній лимонад з м’ятою, поки триває літо.' },
      ru: { title: 'Летний лимонад: скидка 25%', description: 'Домашний лимонад с мятой, пока длится лето.' },
      uz: { title: 'Yozgi limonad: 25% chegirma', description: 'Yalpizli uy limonadi — yoz davom etguncha.' },
    },
  },
  {
    key: 'drinks', kind: 'percent', badge: '20% OFF', createDay: -60, publishDay: -60, fromMinutes: 540, untilDay: 20,
    copy: {
      en: { title: '20% off all hot drinks', description: 'Coffee, tea and hot chocolate, every day. Show the offer at the counter before you pay.', terms: 'One drink per visit. Not combinable with other offers.' },
      pl: { title: '20% zniżki na wszystkie gorące napoje', description: 'Kawa, herbata i gorąca czekolada, codziennie. Pokaż ofertę przy kasie przed zapłatą.', terms: 'Jeden napój na wizytę. Nie łączy się z innymi ofertami.' },
      uk: { title: 'Знижка 20% на всі гарячі напої', description: 'Кава, чай і гарячий шоколад щодня. Покажіть пропозицію на касі перед оплатою.' },
      ru: { title: 'Скидка 20% на все горячие напитки', description: 'Кофе, чай и горячий шоколад каждый день. Покажите предложение на кассе перед оплатой.' },
      uz: { title: 'Barcha issiq ichimliklarga 20% chegirma', description: 'Qahva, choy va issiq shokolad — har kuni. To‘lashdan oldin taklifni kassada ko‘rsating.' },
    },
  },
  {
    key: 'cookie', kind: 'item', badge: 'FREE COOKIE', createDay: -55, publishDay: -55, fromMinutes: 540, untilDay: 25, capClaims: 200,
    copy: {
      en: { title: 'A free cookie with any coffee', description: 'Oat, chocolate or ginger — freshly baked every morning.', terms: 'One cookie per coffee, while stocks last.' },
      pl: { title: 'Ciastko gratis do każdej kawy', description: 'Owsiane, czekoladowe albo imbirowe — pieczone każdego ranka.', terms: 'Jedno ciastko do jednej kawy, do wyczerpania zapasów.' },
      uk: { title: 'Печиво в подарунок до будь-якої кави', description: 'Вівсяне, шоколадне чи імбирне — свіже щоранку.' },
      ru: { title: 'Печенье в подарок к любому кофе', description: 'Овсяное, шоколадное или имбирное — свежая выпечка каждое утро.' },
      uz: { title: 'Har qanday qahvaga pechenye sovg‘a', description: 'Suli, shokoladli yoki zanjabilli — har tong yangi pishiriladi.' },
    },
  },
  {
    key: 'breakfast', kind: 'percent', badge: '15% OFF', createDay: -45, publishDay: -45, fromMinutes: 540, untilDay: 30,
    copy: {
      en: { title: '15% off breakfast sets', description: 'Scrambled eggs, granola or a croissant set — with coffee included.', terms: 'One set per person per visit.' },
      pl: { title: '15% zniżki na zestawy śniadaniowe', description: 'Jajecznica, granola albo zestaw z croissantem — z kawą w cenie.', terms: 'Jeden zestaw na osobę podczas wizyty.' },
      uk: { title: 'Знижка 15% на сніданкові сети', description: 'Яєчня, гранола або сет із круасаном — кава входить у вартість.' },
      ru: { title: 'Скидка 15% на завтраки', description: 'Яичница, гранола или сет с круассаном — кофе уже включён.' },
      uz: { title: 'Nonushta to‘plamlariga 15% chegirma', description: 'Quymoq, granola yoki kruassanli to‘plam — qahva narxga kiritilgan.' },
    },
  },
  {
    key: 'cakes', kind: 'percent', badge: '10% OFF', createDay: -40, publishDay: -40, fromMinutes: 540, untilDay: 20, pauseDay: -12,
    copy: {
      en: { title: '10% off cakes to take away', description: 'Whole cakes and slices, boxed to take home.', terms: 'Take-away orders only.' },
      pl: { title: '10% zniżki na ciasta na wynos', description: 'Całe ciasta i kawałki, zapakowane do domu.', terms: 'Tylko zamówienia na wynos.' },
      uk: { title: 'Знижка 10% на торти з собою', description: 'Цілі торти й шматочки, запаковані додому.' },
      ru: { title: 'Скидка 10% на торты с собой', description: 'Целые торты и кусочки, упакованные домой.' },
      uz: { title: 'Olib ketiladigan tortlarga 10% chegirma', description: 'Butun tortlar va bo‘laklar, uyga qadoqlab beriladi.' },
    },
  },
  {
    /* Published only after the lemonade's window closes: the Growth plan allows
       five live deals, and this would have been the sixth. */
    key: 'cappuccino', kind: 'item', badge: '2 FOR 1', createDay: -18, publishDay: -18, fromMinutes: 540, untilDay: 40,
    copy: {
      en: { title: 'Second cappuccino free', description: 'Bring a friend: buy one cappuccino and the second is on us.', terms: 'Both drinks in the same order.' },
      pl: { title: 'Drugie cappuccino gratis', description: 'Przyjdź ze znajomym: kup jedno cappuccino, drugie stawiamy my.', terms: 'Oba napoje w jednym zamówieniu.' },
      uk: { title: 'Друге капучино безкоштовно', description: 'Приходьте з другом: купіть одне капучино, друге — від нас.' },
      ru: { title: 'Второй капучино бесплатно', description: 'Приходите с другом: купите один капучино, второй за наш счёт.' },
      uz: { title: 'Ikkinchi kapuchino bepul', description: 'Do‘stingiz bilan keling: bitta kapuchino oling, ikkinchisi bizdan.' },
    },
  },
  {
    /* A draft, and deliberately only half-translated: the deals table shows
       translation completeness, and a draft is where a gap belongs. */
    key: 'student', kind: 'item', badge: 'FREE SHOT', createDay: -3, publishDay: null, fromMinutes: 1040, untilDay: 60,
    copy: {
      en: { title: 'Student Tuesday: a free extra espresso shot', description: 'Show a student card on Tuesdays and we add a shot to any coffee.' },
      pl: { title: 'Studencki wtorek: dodatkowe espresso gratis', description: 'Pokaż legitymację we wtorek, a dodamy shot espresso do każdej kawy.' },
    },
  },
];

/* ─────────────────────────────────────────────────────────────── the cast ── */

type Habit = 'daily' | 'regular' | 'weekly' | 'lunch' | 'occasional' | 'new' | 'lapsed' | 'at_risk';
type Slot = 'morning' | 'lunch' | 'afternoon' | 'mixed';

interface HabitPlan {
  /** First visit falls in this range of day offsets, inclusive. */
  first: [number, number];
  /** And the last possible visit in this one. */
  last: [number, number];
  perWeek: number;
  slot: Slot;
  /** Bill range in grosze. */
  bill: [number, number];
  maxVisits?: number;
}

/*
 * Calibrated against `profiles.deriveStatus`, which is relative: "high value"
 * is twice the venue's average spend, so the heavy regulars only earn the word
 * if the occasional, new and lapsed customers pull the average down — which is
 * also what a real café's book looks like. `at_risk` is a high spender who
 * stopped more than thirty days ago; `lapsed` is anybody idle for sixty.
 */
const HABITS: Record<Habit, HabitPlan> = {
  daily: { first: [-68, -58], last: [0, 0], perWeek: 3.8, slot: 'morning', bill: [1500, 3400] },
  regular: { first: [-62, -46], last: [0, 0], perWeek: 2.3, slot: 'mixed', bill: [1600, 4200] },
  weekly: { first: [-58, -36], last: [-1, 0], perWeek: 1.2, slot: 'afternoon', bill: [1800, 4600] },
  lunch: { first: [-55, -30], last: [0, 0], perWeek: 1.8, slot: 'lunch', bill: [3200, 6800] },
  occasional: { first: [-66, -24], last: [-3, 0], perWeek: 0.55, slot: 'mixed', bill: [1500, 3800] },
  new: { first: [-9, -2], last: [0, 0], perWeek: 0, slot: 'mixed', bill: [1800, 3600], maxVisits: 1 },
  lapsed: { first: [-70, -69], last: [-62, -62], perWeek: 2.5, slot: 'afternoon', bill: [1600, 3000], maxVisits: 2 },
  at_risk: { first: [-70, -66], last: [-40, -35], perWeek: 4.2, slot: 'lunch', bill: [3800, 7400] },
};

type AccountRole = 'owner' | 'player' | 'background player';

interface Persona {
  role: Exclude<AccountRole, 'owner'>;
  name: string;
  /** The part before `@demo.paylez.test`. */
  mailbox: string;
  username: string;
  language: 'pl' | 'uk' | 'ru' | 'uz' | 'en';
  occupation: accounts.Occupation;
  birthDate: string;
  shares: boolean;
  /** Holds a push token, which is what `canPush` and "notifiable" count. */
  push: boolean;
  optIn: boolean;
  habit: Habit;
}

const P = (
  role: Persona['role'], name: string, mailbox: string, username: string, language: Persona['language'],
  occupation: accounts.Occupation, birthDate: string, shares: boolean, push: boolean, optIn: boolean, habit: Habit,
): Persona => ({ role, name, mailbox, username, language, occupation, birthDate, shares, push, optIn, habit });

/*
 * Invented people with ordinary names from the three markets the product is
 * written for. Twelve of the twenty-five share their profile with the café, so
 * the customers table has rows in every status; the other thirteen are counted
 * in every aggregate and absent from that table, which is the rule it enforces.
 */
const CAST: Persona[] = [
  P('player', 'Zofia Wiśniewska', 'zofia.wisniewska', 'zofia_wisniewska', 'pl', 'student', '2003-04-17', true, true, true, 'daily'),
  P('player', 'Oksana Melnyk', 'oksana.melnyk', 'oksana_melnyk', 'uk', 'worker', '1994-09-02', true, true, true, 'lunch'),
  P('player', 'Jasur Tursunov', 'jasur.tursunov', 'jasur_tursunov', 'uz', 'freelancer', '1998-01-23', true, false, true, 'regular'),
  P('player', 'Michał Kowalczyk', 'michal.kowalczyk', 'michal_kowalczyk', 'pl', 'business', '1989-11-30', false, true, true, 'weekly'),
  P('player', 'Dilnoza Karimova', 'dilnoza.karimova', 'dilnoza_karimova', 'ru', 'student', '2001-06-08', false, true, true, 'regular'),
  P('background player', 'Piotr Nowak', 'piotr.nowak', 'piotr_nowak', 'pl', 'worker', '1987-03-14', true, true, true, 'daily'),
  P('background player', 'Anna Kamińska', 'anna.kaminska', 'ania_kaminska', 'pl', 'worker', '1992-12-01', false, true, false, 'daily'),
  P('background player', 'Katarzyna Wójcik', 'katarzyna.wojcik', 'kasia_wojcik', 'pl', 'freelancer', '1996-05-21', true, true, true, 'weekly'),
  P('background player', 'Tomasz Mazur', 'tomasz.mazur', 'tomek_mazur', 'pl', 'business', '1984-08-09', true, false, false, 'lunch'),
  P('background player', 'Magdalena Krawczyk', 'magdalena.krawczyk', 'magda_krawczyk', 'pl', 'other', '1979-02-27', false, true, false, 'occasional'),
  P('background player', 'Jakub Dąbrowski', 'jakub.dabrowski', 'kuba_dabrowski', 'pl', 'student', '2004-10-11', true, true, true, 'new'),
  P('background player', 'Aleksandra Pawlak', 'aleksandra.pawlak', 'ola_pawlak', 'pl', 'worker', '1991-07-19', true, false, false, 'lapsed'),
  P('background player', 'Andrii Moroz', 'andrii.moroz', 'andrii_moroz', 'uk', 'worker', '1990-04-05', false, true, true, 'weekly'),
  P('background player', 'Iryna Kovalenko', 'iryna.kovalenko', 'iryna_kovalenko', 'uk', 'business', '1986-01-16', true, true, false, 'at_risk'),
  P('background player', 'Dmytro Boyko', 'dmytro.boyko', 'dmytro_boyko', 'uk', 'student', '2002-03-29', false, false, true, 'occasional'),
  P('background player', 'Olena Tkachenko', 'olena.tkachenko', 'olena_tkachenko', 'uk', 'freelancer', '1995-11-07', true, true, true, 'daily'),
  P('background player', 'Yuliia Kravets', 'yuliia.kravets', 'yuliia_kravets', 'uk', 'worker', '1999-08-25', false, true, false, 'new'),
  P('background player', 'Bohdan Hrytsenko', 'bohdan.hrytsenko', 'bohdan_hrytsenko', 'uk', 'other', '1982-06-12', false, false, false, 'lapsed'),
  P('background player', 'Sardor Rakhimov', 'sardor.rakhimov', 'sardor_rakhimov', 'uz', 'worker', '1993-02-03', true, true, true, 'weekly'),
  P('background player', 'Madina Yusupova', 'madina.yusupova', 'madina_yusupova', 'uz', 'student', '2000-09-14', false, true, true, 'occasional'),
  P('background player', 'Bekzod Aliyev', 'bekzod.aliyev', 'bekzod_aliyev', 'uz', 'business', '1985-12-22', false, true, false, 'at_risk'),
  P('background player', 'Nigora Saidova', 'nigora.saidova', 'nigora_saidova', 'ru', 'worker', '1997-05-30', false, true, true, 'lunch'),
  P('background player', 'Timur Nazarov', 'timur.nazarov', 'timur_nazarov', 'ru', 'freelancer', '1994-10-18', false, false, false, 'new'),
  P('background player', 'Kamila Ergasheva', 'kamila.ergasheva', 'kamila_ergasheva', 'uz', 'student', '2003-01-09', true, true, true, 'occasional'),
  P('background player', 'Ewa Lis', 'ewa.lis', 'ewa_lis', 'en', 'other', '1988-07-04', false, true, false, 'regular'),
];

const OWNER = { name: 'Marta Zielińska', mailbox: 'owner', language: 'pl' } as const;

/* ═══════════════════════════════════════════════════════════ the engine ══ */

interface Customer extends Persona {
  index: number;
  email: string;
  signupAt: number;
  userId: string | null;
  consented: boolean;
  /** Opened the push, and may bring the offer to the counter within a week. */
  nudge: { dealId: string; until: number } | null;
}

interface Job {
  at: number;
  seq: number;
  run: () => Promise<void>;
}

/**
 * A time-ordered queue, so a job may schedule a follow-up (a voucher bought
 * after a scan, a push opened after it lands) and still be replayed in order.
 * Ties break on insertion, which is what keeps two runs identical.
 */
function createQueue() {
  const heap: Job[] = [];
  let seq = 0;
  const before = (a: Job, b: Job) => a.at < b.at || (a.at === b.at && a.seq < b.seq);
  return {
    get size() {
      return heap.length;
    },
    peek: (): Job | undefined => heap[0],
    push(at: number, run: () => Promise<void>): void {
      heap.push({ at, seq: seq++, run });
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (!before(heap[i], heap[parent])) break;
        [heap[i], heap[parent]] = [heap[parent], heap[i]];
        i = parent;
      }
    },
    pop(): Job | undefined {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0 && last) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && before(heap[l], heap[m])) m = l;
          if (r < heap.length && before(heap[r], heap[m])) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]];
          i = m;
        }
      }
      return top;
    },
  };
}
type Queue = ReturnType<typeof createQueue>;

const STAT_KEYS = [
  'scans', 'visits', 'underMinimum', 'claims', 'rewardsEarned', 'rewardsRedeemed', 'rewardsExpired',
  'vouchersIssued', 'vouchersRedeemed', 'vouchersExpired', 'listingImpressions', 'listingClicks',
  'dealImpressions', 'dealOpens', 'pushTargeted', 'pushDelivered',
] as const;
type Stats = Record<(typeof STAT_KEYS)[number], number>;

interface State {
  db: Db;
  rng: () => number;
  /** The instant the run started. Nothing is written after it except the one future push. */
  now: number;
  /** Today, on the café's clock. Every offset is counted from it. */
  today: string;
  password: string;
  secret: string;
  ownerId: string;
  venueId: string;
  reviewedBy: 'an admin account' | 'the script';
  dealIds: Map<string, string>;
  campaignIds: Map<string, string>;
  pushId: string | null;
  pushSentAt: number | null;
  customers: Customer[];
  queue: Queue;
  stats: Stats;
  notes: string[];
}

const iso = (ms: number): Iso => new Date(ms).toISOString();
const dayAt = (s: State, offset: number, minutes: number, seconds = 0): number =>
  Date.parse(zoned(shiftDay(s.today, offset), minutes, TZ, seconds));
const weekdayOf = (s: State, offset: number): number => local(iso(dayAt(s, offset, 720)), TZ).weekday;
const between = (s: State, min: number, max: number): number => min + (max - min) * s.rng();
/** Inclusive at both ends. */
const whole = (s: State, min: number, max: number): number => Math.floor(between(s, min, max + 1));
const choose = <T>(s: State, items: readonly T[]): T => items[Math.floor(s.rng() * items.length)];
const bill = (minor: number): number => Math.round(minor / 50) * 50;

/** Opening hours for a weekday — `HOURS` is listed Monday first. */
const hoursOn = (weekday: number) => HOURS[weekday];

function slotMinutes(s: State, slot: Slot, weekday: number): number {
  const chosen = slot === 'mixed' ? choose(s, ['morning', 'lunch', 'afternoon'] as const) : slot;
  const hours = hoursOn(weekday);
  const windows: Record<Exclude<Slot, 'mixed'>, [number, number]> = {
    morning: weekday < 5 ? [455, 630] : [hours.opensMin + 5, 700],
    lunch: [720, 870],
    afternoon: [870, 1170],
  };
  let [from, to] = windows[chosen];
  from = Math.max(from, hours.opensMin + 5);
  to = Math.min(to, hours.closesMin - 15);
  if (to <= from) [from, to] = [hours.opensMin + 5, hours.closesMin - 15];
  return whole(s, from, to);
}

/** Lunch trade is a weekday trade; everyone else comes a little less at weekends. */
const dayFactor = (habit: Habit, weekday: number): number =>
  habit === 'lunch' || habit === 'at_risk'
    ? weekday < 5 ? 1.25 : weekday === 5 ? 0.55 : 0.3
    : weekday < 5 ? 1.08 : weekday === 5 ? 0.9 : 0.62;

/**
 * One customer's visits, planned before anything is written.
 *
 * At most one scan a day, and consecutive scans are kept a day and ten minutes
 * apart when the day allows it: the venue's `scan_cooldown_hours` is 24, so a
 * scan at 09:00 the morning after an 18:00 visit is a real scan that does not
 * count. A few of those are kept on purpose — the till log's "not counted" rows
 * are a state the dashboard has to draw — and so are a few bills under the
 * 15 zł minimum.
 */
function planVisits(s: State, c: Customer): Array<{ at: number; billMinor: number }> {
  const habit = HABITS[c.habit];
  const first = whole(s, habit.first[0], habit.first[1]);
  const last = whole(s, habit.last[0], habit.last[1]);
  c.signupAt = dayAt(s, first - whole(s, 1, 12), whole(s, 1080, 1320), whole(s, 0, 59));

  const out: Array<{ at: number; billMinor: number }> = [];
  let previous: number | null = null;
  for (let day = first; day <= last; day += 1) {
    if (habit.maxVisits !== undefined && out.length >= habit.maxVisits) break;
    const weekday = weekdayOf(s, day);
    const roll = s.rng();
    if (day !== first && roll >= (habit.perWeek / 7) * dayFactor(c.habit, weekday)) continue;

    let at = dayAt(s, day, slotMinutes(s, habit.slot, weekday), whole(s, 0, 59));
    const under = s.rng() < 0.04;
    const billMinor = under ? bill(between(s, 800, 1400)) : bill(between(s, habit.bill[0], habit.bill[1]));
    const keepAnyway = s.rng() < 0.15;
    const shift = whole(s, 10, 60) * MINUTE_MS;

    let counts = true;
    if (previous !== null && at - previous < DAY_MS + 10 * MINUTE_MS) {
      const later = previous + DAY_MS + shift;
      if (later <= dayAt(s, day, hoursOn(weekday).closesMin - 15)) at = later;
      else if (keepAnyway) counts = false;
      else continue;
    }
    out.push({ at, billMinor });
    if (counts && billMinor >= CONFIG.gate.minSpendMinor) previous = at;
  }
  return out;
}

/** A handle nobody holds. The cast's are ordinary names, so a real player may already have one. */
async function freeUsername(db: Db, wanted: string): Promise<string> {
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? wanted : `${wanted.slice(0, 16)}_${n}`;
    if (!(await db.get(`SELECT 1 FROM users WHERE username_norm = $u`, { u: candidate }))) return candidate;
  }
  throw new Error(`no free username near ${wanted}`);
}

/**
 * `+48 000 000 1NN`. Polish numbers never have a zero after the country code, so
 * these pass the profile's shape check and cannot ring anybody.
 */
const phoneFor = (index: number): string => `+48 000 000 1${String(index + 1).padStart(2, '0')}`;

const dealPlan = (key: string): DealPlan => DEALS.find((plan) => plan.key === key)!;

function liveWindow(s: State, plan: DealPlan): { from: number; to: number } | null {
  if (plan.publishDay === null) return null;
  const from = dayAt(s, plan.publishDay, plan.fromMinutes);
  let to = dayAt(s, plan.untilDay, 1260);
  if (plan.pauseDay !== undefined) to = Math.min(to, dayAt(s, plan.pauseDay, 660));
  return { from, to };
}

function viewerAt(s: State, at: number): Customer | null {
  if (s.rng() < 0.45) return null;
  const signedUp = s.customers.filter((c) => c.signupAt < at);
  return signedUp.length > 0 ? choose(s, signedUp) : null;
}

/* ─────────────────────────────────────────────────────────────── the jobs ── */

async function setup(s: State, t0: number): Promise<void> {
  const owner = await accounts.signUp(s.db, {
    email: `${OWNER.mailbox}@${DEMO_DOMAIN}`,
    password: s.password,
    name: OWNER.name,
    language: OWNER.language,
    city: 'Krakow',
    partner: true,
    at: iso(t0),
    /* The demo's own accounts agree, like any other sign-up: `signUp` refuses
       without it, and a seed that bypassed the guard would be the one place in
       the product where a consent row is written for nobody. */
    acceptTerms: true,
  });
  s.ownerId = owner.id;

  const venue = await partners.createVenue(s.db, {
    ownerId: owner.id,
    draft: { ...VENUE },
    at: iso(t0 + 15 * MINUTE_MS),
  });
  s.venueId = venue.id;
  await partners.setLinks(s.db, venue.id, LINKS, iso(t0 + 25 * MINUTE_MS));
  await partners.setHours(s.db, venue.id, HOURS);

  /* No domain function writes a venue's spoken languages or its description
     yet — the listing endpoint that reads both is being added — so they go in
     with the same two statements that endpoint's writer will need. */
  for (const language of SPOKEN) {
    await s.db.run(
      `INSERT INTO venue_languages (venue_id, language) VALUES ($v, $l) ON CONFLICT (venue_id, language) DO NOTHING`,
      { v: venue.id, l: language },
    );
  }
  for (const [language, value] of Object.entries(DESCRIPTION)) {
    await s.db.run(
      `INSERT INTO translations (entity, entity_id, field, language, value, ai_generated, updated_at)
       VALUES ('venue', $v, 'description', $l, $t, 0, $at)
         ON CONFLICT (entity, entity_id, field, language)
         DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      { v: venue.id, l: language, t: value, at: iso(t0 + 30 * MINUTE_MS) },
    );
  }

  const verificationId = await partners.submitVerification(s.db, {
    venueId: venue.id,
    method: 'business_details',
    legalName: `${VENUE.name} (demonstration data)`,
    at: iso(t0 + 45 * MINUTE_MS),
  });
  const note = 'Approved by npm run demo:seed — demonstration data, not a real business.';
  const decidedAt = iso(t0 + 6 * 60 * MINUTE_MS);
  const admin = await s.db.get<{ id: string }>(
    `SELECT u.id FROM user_roles r JOIN users u ON u.id = r.user_id
      WHERE r.role = 'admin' AND u.status = 'active' AND u.deleted_at IS NULL
      ORDER BY r.granted_at LIMIT 1`,
  );
  if (admin) {
    await partners.decideVerification(s.db, { verificationId, approve: true, reviewerId: admin.id, note, at: decidedAt });
    s.reviewedBy = 'an admin account';
  } else {
    /* Only an admin may decide a verification, and a database with no admin
       account has nobody to name as the reviewer — `reviewed_by` is a foreign
       key. So the decision is written the way `decideVerification` writes it,
       with the reviewer left empty and the audit entry saying who acted. */
    await s.db.run(
      `UPDATE verification_records SET status = 'approved', reviewed_at = $t, note = $n WHERE id = $i`,
      { t: decidedAt, n: note, i: verificationId },
    );
    await s.db.run(`UPDATE venues SET status = 'live', verified_at = $t, updated_at = $t WHERE id = $v`, {
      t: decidedAt,
      v: venue.id,
    });
    await audit.record(s.db, {
      actorId: null,
      actorRole: 'system',
      action: 'venue.verify',
      entity: 'venue',
      entityId: venue.id,
      venueId: venue.id,
      after: { note },
      at: decidedAt,
    });
    s.reviewedBy = 'the script';
  }

  /* Growth is the tier with every paid panel on it — identified profiles, deep
     analytics, the export, the assistant, four pushes. `manual` is the source
     that bills nobody, and twelve months keeps the renewal sweep away from it
     for as long as anyone is likely to be testing. */
  const subscription = await entitlements.startSubscription(s.db, {
    subject: { venueId: venue.id },
    planCode: 'growth',
    source: 'manual',
    externalRef: 'demo-seed',
    months: 12,
    at: iso(t0 + 390 * MINUTE_MS),
  });
  await audit.record(s.db, {
    actorId: admin?.id ?? null,
    actorRole: admin ? 'admin' : 'system',
    action: 'subscription.start',
    entity: 'subscription',
    entityId: subscription.id,
    venueId: venue.id,
    after: { plan: 'growth', source: 'manual', note: 'demo:seed' },
    at: iso(t0 + 390 * MINUTE_MS),
  });

  await partners.setBudget(s.db, {
    venueId: venue.id,
    actorId: owner.id,
    totalMinor: BUDGETS[0],
    loyaltyBp: LOYALTY_BP,
    at: iso(t0 + 420 * MINUTE_MS),
  });

  for (const [index, plan] of CAMPAIGNS.entries()) {
    const campaign = await partners.createCampaign(s.db, {
      venueId: venue.id,
      actorId: owner.id,
      name: plan.name,
      visitsRequired: plan.visitsRequired,
      rewardLabel: plan.rewardLabel,
      rewardCostMinor: plan.rewardCostMinor,
      priority: plan.priority,
      recurring: true,
      minSpendMinor: plan.minSpendMinor,
      rewardValidDays: plan.rewardValidDays,
      at: iso(t0 + (430 + index * 5) * MINUTE_MS),
    });
    s.campaignIds.set(plan.key, campaign.id);
  }
}

async function signup(s: State, c: Customer): Promise<void> {
  const user = await accounts.signUp(s.db, {
    email: c.email,
    password: s.password,
    name: c.name,
    language: c.language,
    city: 'Krakow',
    at: iso(c.signupAt),
    /* The demo's own accounts agree, like any other sign-up: `signUp` refuses
       without it, and a seed that bypassed the guard would be the one place in
       the product where a consent row is written for nobody. */
    acceptTerms: true,
  });
  c.userId = user.id;
  await accounts.completeOnboarding(s.db, user.id, iso(c.signupAt + 4 * MINUTE_MS));
  c.username = await freeUsername(s.db, c.username);
  /* Six of the seven profile answers. The photo is left for whoever signs in:
     adding one completes the profile, and that pays the fifty-point bonus in
     front of them, which is worth being able to test. */
  await accounts.updateProfile(
    s.db,
    user.id,
    { username: c.username, city: 'Krakow', occupation: c.occupation, phone: phoneFor(c.index), birthDate: c.birthDate },
    iso(c.signupAt + 9 * MINUTE_MS),
  );
  if (c.optIn) await social.setLeaderboardOptIn(s.db, user.id, true);
  if (c.push) {
    /* The row `POST /v1/push-tokens` writes, on the `.test` domain's terms: a
       token no provider issued. It is what makes this account notifiable, and
       the local push adapter is the only thing that will ever read it. */
    await s.db.run(
      `INSERT INTO push_tokens (id, user_id, platform, token, created_at) VALUES ($i, $u, 'web', $t, $at)`,
      { i: `ptk_${user.id}_${c.signupAt}`, u: user.id, t: `demo-web-push-${user.id}`, at: iso(c.signupAt + 12 * MINUTE_MS) },
    );
  }
}

async function visit(s: State, c: Customer, at: number, billMinor: number): Promise<void> {
  if (!c.userId) throw new Error(`${c.email} visits before signing up`);
  const userId = c.userId;

  const rollReward = s.rng();
  const rollVoucher = s.rng();
  const rollDeal = s.rng();

  let intent: gate.Intent = 'earn';
  let intentRef: string | undefined;
  let dealId: string | undefined;

  const soon = iso(at + 10 * MINUTE_MS);
  const reward = (await campaigns.availableRewards(s.db, userId, s.venueId)).find((row) => row.expires_at > soon);
  const voucher = await s.db.get<{ id: string }>(
    `SELECT id FROM issued_vouchers
      WHERE user_id = $u AND venue_id = $v AND status = 'active' AND expires_at > $soon AND issued_at < $t
      ORDER BY expires_at LIMIT 1`,
    { u: userId, v: s.venueId, soon, t: iso(at) },
  );

  if (reward && rollReward < 0.62) {
    intent = 'reward_redeem';
    intentRef = reward.id;
  } else if (voucher && rollVoucher < 0.58) {
    intent = 'voucher_redeem';
    intentRef = voucher.id;
  } else {
    const nudged = c.nudge && c.nudge.until > at ? c.nudge : null;
    if (nudged && rollDeal < 0.7) {
      /* They opened the push already, so the claim has its open to stand on. */
      dealId = nudged.dealId;
      c.nudge = null;
    } else if (rollDeal < 0.24) {
      /* Item offers are brought to the counter more often than percentages —
         the finding the insights panel exists to surface. */
      const live = DEALS.filter((plan) => {
        const window = liveWindow(s, plan);
        return window !== null && window.from <= at && at < window.to;
      });
      const weights = live.map((plan) => (plan.kind === 'item' ? 1.7 : 1));
      let roll = s.rng() * weights.reduce((sum, w) => sum + w, 0);
      const plan = live.find((_, i) => (roll -= weights[i]) < 0);
      if (plan) {
        dealId = s.dealIds.get(plan.key)!;
        const source = choose(s, ['home_widget', 'list'] as const);
        await deals.track(s.db, { dealId, userId, kind: 'impression', source, at: iso(at - whole(s, 35, 80) * MINUTE_MS) });
        await deals.track(s.db, { dealId, userId, kind: 'open', source, at: iso(at - whole(s, 12, 30) * MINUTE_MS) });
        s.stats.dealImpressions += 1;
        s.stats.dealOpens += 1;
      }
    }
  }

  /* The four steps of §3, exactly as the till and the phone take them: the
     screen shows a code, the phone scans it, the cashier types the bill, the
     cashier confirms. */
  const qr = await gate.mintQr(s.db, s.venueId, s.secret, iso(at - 25_000));
  const txn = await gate.openTransaction(
    s.db,
    { kind: 'qr', token: qr.token, secret: s.secret },
    { userId, intent, intentRef, dealId, at: iso(at) },
  );
  await gate.submitAmount(s.db, { transactionId: txn.id, amountMinor: billMinor, actorId: s.ownerId, at: iso(at + 30_000) });
  const receipt = await gate.confirm(s.db, { transactionId: txn.id, cashierId: s.ownerId, at: iso(at + 65_000) });
  /* The route writes this beside the confirm, so the audit screen has it too. */
  await audit.record(s.db, {
    actorId: s.ownerId,
    actorRole: 'partner_owner',
    action: 'gate.confirm',
    entity: 'transaction',
    entityId: receipt.transaction.id,
    venueId: s.venueId,
    after: { amountMinor: billMinor, points: receipt.pointsGranted, discountMinor: receipt.discountMinor },
    at: iso(at + 65_000),
  });

  s.stats.scans += 1;
  if (receipt.visitCounted) s.stats.visits += 1;
  if (billMinor < CONFIG.gate.minSpendMinor) s.stats.underMinimum += 1;
  if (dealId && receipt.visitCounted) s.stats.claims += 1;
  if (receipt.reward) s.stats.rewardsEarned += 1;
  if (intent === 'reward_redeem') s.stats.rewardsRedeemed += 1;
  if (intent === 'voucher_redeem') s.stats.vouchersRedeemed += 1;

  if (c.shares && !c.consented) {
    await consent.grantSharing(s.db, { userId, venueId: s.venueId, at: iso(at + 3 * MINUTE_MS) });
    c.consented = true;
  }
  if (intent === 'earn' && receipt.visitCounted) {
    s.queue.push(at + whole(s, 3, 11) * MINUTE_MS, () => buyVoucher(s, c));
  }
}

async function buyVoucher(s: State, c: Customer): Promise<void> {
  const roll = s.rng();
  const tierRoll = s.rng();
  const userId = c.userId!;
  const held = await s.db.get(
    `SELECT 1 FROM issued_vouchers WHERE user_id = $u AND venue_id = $v AND status = 'active'`,
    { u: userId, v: s.venueId },
  );
  if (held || roll >= (c.role === 'player' ? 0.3 : 0.35)) return;

  const balance = await ledger.balance(s.db, userId);
  const tiers = await vouchers.tiersFor(s.db, s.venueId);
  const tier =
    balance >= 800 && tierRoll < 0.3
      ? tiers.find((t) => t.discount_pct === 15)
      : balance >= 500 && tierRoll < 0.6
        ? tiers.find((t) => t.discount_pct === 10)
        : tiers.find((t) => t.discount_pct === 5);
  /* A login player keeps a few hundred points in hand, so whoever signs in as
     one can buy a voucher on the spot. */
  if (!tier || balance - tier.points_cost < (c.role === 'player' ? 250 : 0)) return;

  try {
    await vouchers.issue(s.db, { userId, venueId: s.venueId, tierId: tier.id, at: iso(clock) });
    s.stats.vouchersIssued += 1;
  } catch (error) {
    if (error instanceof DomainError && (error.code === 'budget_exhausted' || error.code === 'insufficient_points')) return;
    throw error;
  }
}

/**
 * The instant of the job being replayed, for the one follow-up that does not
 * carry its own: a voucher is bought at the moment its job was queued for, not
 * at the moment the scan that prompted it happened.
 */
let clock = 0;

/**
 * Who every demo offer is addressed to: people with a history at the demo café.
 *
 * Deal targeting is judged against the viewer's relation to *this* venue
 * (`deals.segmentsFor`), and nobody but the demo customers has one. That keeps
 * the offers off signed-in real players' boards while the café is live, and it
 * bounds the push dispatcher, whose audience is everybody in the deal's city
 * the targeting admits — so the push scheduled three days ahead reaches demo
 * accounts and nobody else. The gate does not read targeting, so the history
 * below is written the same either way. `lapsed` is in the list so the two
 * customers last seen in the first week are not the ones left out.
 */
const DEMO_AUDIENCE: deals.Segment[] = ['returning', 'lapsed'];

async function createDeal(s: State, plan: DealPlan, at: number): Promise<void> {
  const window = liveWindow(s, plan);
  /* The draft opens next Tuesday, which is what its title promises. */
  let tuesday = 1;
  while (weekdayOf(s, tuesday) !== 1) tuesday += 1;
  const deal = await partners.createDeal(s.db, {
    actorId: s.ownerId,
    draft: {
      venueId: s.venueId,
      discountText: plan.badge,
      validFrom: iso(window?.from ?? dayAt(s, tuesday, 480)),
      validTo: iso(dayAt(s, plan.untilDay, 1260)),
      capClaims: plan.capClaims,
      targetAudience: DEMO_AUDIENCE,
      copy: plan.copy,
    },
    at: iso(at),
  });
  s.dealIds.set(plan.key, deal.id);
}

async function publishDeal(s: State, plan: DealPlan, at: number): Promise<void> {
  await partners.publishDeal(s.db, { dealId: s.dealIds.get(plan.key)!, actorId: s.ownerId, at: iso(at) });
}

async function pauseDeal(s: State, plan: DealPlan, at: number): Promise<void> {
  const dealId = s.dealIds.get(plan.key)!;
  await deals.setStatus(s.db, dealId, 'paused', iso(at));
  await audit.record(s.db, {
    actorId: s.ownerId,
    action: 'deal.paused',
    entity: 'hot_deal',
    entityId: dealId,
    venueId: s.venueId,
    at: iso(at),
  });
}

/**
 * The lifecycle job's work, for this one deal. `deals.runLifecycle` itself is
 * global: replayed at an instant in the past it would also expire every other
 * venue's deal whose window had closed by then, and the database this was
 * written against has ten of those waiting for their job to run.
 */
async function expireDeal(s: State, plan: DealPlan, at: number): Promise<void> {
  await deals.setStatus(s.db, s.dealIds.get(plan.key)!, 'expired', iso(at));
}

async function pauseCampaign(s: State, plan: CampaignPlan, at: number): Promise<void> {
  const id = s.campaignIds.get(plan.key)!;
  await campaigns.setStatus(s.db, id, 'paused', iso(at));
  await audit.record(s.db, {
    actorId: s.ownerId,
    action: 'campaign.paused',
    entity: 'campaign',
    entityId: id,
    venueId: s.venueId,
    at: iso(at),
  });
}

async function setMonthBudget(s: State, totalMinor: number, at: number): Promise<void> {
  await partners.setBudget(s.db, { venueId: s.venueId, actorId: s.ownerId, totalMinor, loyaltyBp: LOYALTY_BP, at: iso(at) });
}

async function listingEvent(s: State, viewer: Customer | null, at: number, source: string, click: boolean): Promise<void> {
  const base = { venueId: s.venueId, userId: viewer?.userId ?? null, source, city: VENUE.city, language: viewer?.language };
  await trackListing(s.db, { ...base, kind: 'impression', at: iso(at) });
  s.stats.listingImpressions += 1;
  if (click) {
    await trackListing(s.db, { ...base, kind: 'click', at: iso(at + 40_000) });
    s.stats.listingClicks += 1;
  }
}

async function dealEvent(s: State, plan: DealPlan, viewer: Customer | null, at: number, source: string, open: boolean): Promise<void> {
  const base = { dealId: s.dealIds.get(plan.key)!, userId: viewer?.userId ?? null, source };
  await deals.track(s.db, { ...base, kind: 'impression', at: iso(at) });
  s.stats.dealImpressions += 1;
  if (open) {
    await deals.track(s.db, { ...base, kind: 'open', at: iso(at + 50_000) });
    s.stats.dealOpens += 1;
  }
}

/**
 * The hourly job's expiry of vouchers and rewards, replayed each night.
 *
 * The domain functions are global, like the lifecycle job: they expire whatever
 * is due anywhere. So they are called only when nothing outside the demo venue
 * is due at that instant — which on a database whose server is running is
 * always, because the real job got there first. Otherwise the same two
 * statements run for the demo venue alone.
 */
async function expireDue(s: State, at: number): Promise<void> {
  const t = iso(at);
  const dueElsewhere = async (table: 'issued_vouchers' | 'earned_rewards', status: string) =>
    Number(
      (await s.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE status = $st AND expires_at <= $t AND venue_id <> $v`,
        { st: status, t, v: s.venueId },
      ))?.n ?? 0,
    );

  if ((await dueElsewhere('issued_vouchers', 'active')) === 0) {
    s.stats.vouchersExpired += (await vouchers.expireVouchers(s.db, t)).expired;
  } else {
    const due = await s.db.all<vouchers.IssuedVoucher>(
      `SELECT * FROM issued_vouchers WHERE status = 'active' AND expires_at <= $t AND venue_id = $v`,
      { t, v: s.venueId },
    );
    for (const voucher of due) {
      if (voucher.budget_id) {
        await budget.release(s.db, voucher.budget_id, 'voucher', voucher.reserved_minor, { kind: 'issued_voucher', ref: voucher.id }, t);
      }
      await s.db.run(`UPDATE issued_vouchers SET status = 'expired' WHERE id = $i`, { i: voucher.id });
      s.stats.vouchersExpired += 1;
    }
  }

  if ((await dueElsewhere('earned_rewards', 'available')) === 0) {
    s.stats.rewardsExpired += (await campaigns.expireRewards(s.db, t)).expired;
  } else {
    const due = await s.db.all<campaigns.EarnedReward>(
      `SELECT * FROM earned_rewards WHERE status = 'available' AND expires_at <= $t AND venue_id = $v`,
      { t, v: s.venueId },
    );
    for (const reward of due) {
      if (reward.budget_id) {
        await budget.release(s.db, reward.budget_id, 'loyalty', reward.reserved_minor, { kind: 'earned_reward', ref: reward.id }, t);
      }
      await s.db.run(`UPDATE earned_rewards SET status = 'expired' WHERE id = $i`, { i: reward.id });
      s.stats.rewardsExpired += 1;
    }
  }
}

/** The daily job's average-check refresh and its notice to the owner, for this venue. */
async function refreshCheck(s: State, at: number): Promise<void> {
  const result = await refreshAverageCheck(s.db, await getVenue(s.db, s.venueId), iso(at));
  if (!result.flipped) return;
  await notifications.notify(s.db, {
    userId: s.ownerId,
    mode: 'partner',
    kind: 'average_check_source',
    title: 'Your average check is now your own',
    body: 'Enough confirmed transactions have landed to compute it from your tills rather than the category default.',
    sourceKind: 'venue',
    sourceRef: s.venueId,
    venueId: s.venueId,
    at: iso(at),
  });
}

const pushQuota = async (s: State): Promise<number> =>
  entitlements.entNumber(await entitlements.entitlementsFor(s.db, { venueId: s.venueId }), 'push_quota', 2);

async function schedulePastPush(s: State, at: number, sendAt: number): Promise<void> {
  const scheduled = await deals.schedulePush(s.db, {
    dealId: s.dealIds.get('cookie')!,
    scheduledAt: iso(sendAt),
    quota: await pushQuota(s),
    at: iso(at),
  });
  s.pushId = scheduled.id;
}

/**
 * The push that has already gone out, delivered the way the platform decides
 * delivery: one `notifications.notify` per recipient, so the frequency cap, the
 * quiet hours and the missing-permission rule all apply exactly as they would.
 * The audience is the demo customers and nobody else, listed here rather than
 * asked of `deals.audienceFor`, whose answer is everybody in the city the deal's
 * targeting admits.
 */
async function sendPush(s: State, at: number): Promise<void> {
  const plan = dealPlan('cookie');
  const window = liveWindow(s, plan);
  if (!s.pushId || !window || at < window.from || at >= window.to) {
    s.notes.push('the past push was not sent: its deal was not live at the send time');
    return;
  }
  const dealId = s.dealIds.get(plan.key)!;
  let targeted = 0;
  let reachable = 0;
  const delivered: string[] = [];
  for (const c of s.customers) {
    if (!c.userId || c.signupAt >= at) continue;
    const copy = await deals.copyFor(s.db, dealId, c.language);
    if (!copy) continue;
    targeted += 1;
    const result = await notifications.notify(s.db, {
      userId: c.userId,
      kind: 'deal_push',
      title: copy.title,
      body: copy.description,
      language: copy.language,
      actionUrl: '#/vouchers',
      sourceKind: 'hot_deal',
      sourceRef: dealId,
      pushId: s.pushId,
      push: true,
      venueId: s.venueId,
      at: iso(at),
    });
    /* Reachable is what the platform's own rules let through; a missing
       permission is the customer's setting, not a cap, so it still counts. */
    if (result.delivery !== 'suppressed' || result.reason === 'no_permission') reachable += 1;
    if (result.delivery === 'queued') {
      delivered.push(result.id);
      if (s.rng() < 0.4) {
        const openAt = at + whole(s, 2, 95) * MINUTE_MS;
        s.queue.push(openAt, () => openPush(s, c, dealId, openAt));
      }
    }
  }
  /* What the local push adapter does to a queued notification. */
  await notifications.markSent(s.db, delivered);
  /*
   * WORKAROUND, for a push that went out in the past. When this was written
   * nothing in `server/` moved a scheduled push to `sent` or wrote `targeted`,
   * `reachable` or `delivered`; `deals.sendDuePushes` was being added beside
   * this script. It is not called here even so, because it is global: replayed
   * at `at`, it would also process every other venue's pushes due by then.
   * These are the three figures the notify loop above produced, written onto
   * the row that loop was for — and a push already `sent` is one the
   * dispatcher leaves alone.
   */
  await s.db.run(
    `UPDATE deal_pushes SET status = 'sent', sent_at = $t, targeted = $n, reachable = $r, delivered = $d WHERE id = $p`,
    { t: iso(at), n: targeted, r: reachable, d: delivered.length, p: s.pushId },
  );
  s.pushSentAt = at;
  s.stats.pushTargeted = targeted;
  s.stats.pushDelivered = delivered.length;
}

async function openPush(s: State, c: Customer, dealId: string, at: number): Promise<void> {
  /* Through `deals.track` with the push id, which is what moves
     `deal_pushes.opened` — the one push figure the server does maintain. */
  await deals.track(s.db, { dealId, userId: c.userId!, kind: 'open', source: 'push', pushId: s.pushId!, at: iso(at) });
  s.stats.dealOpens += 1;
  c.nudge = { dealId, until: at + 7 * DAY_MS };
}

/* ═══════════════════════════════════════════════════════════ the replay ══ */

/** Every job, planned up front, so the chance draws happen in one fixed order. */
function plan(s: State): void {
  const q = s.queue;
  const setupAt = dayAt(s, SETUP_DAY, 550);
  q.push(setupAt, () => setup(s, setupAt));

  /* Customers first: the funnels below need to know who has an account by when. */
  for (const c of s.customers) {
    const visits = planVisits(s, c);
    q.push(c.signupAt, () => signup(s, c));
    for (const v of visits) q.push(v.at, () => visit(s, c, v.at, v.billMinor));
  }

  let month = 1;
  for (let day = SETUP_DAY + 1; day <= 0; day += 1) {
    if (!shiftDay(s.today, day).endsWith('-01')) continue;
    const total = BUDGETS[Math.min(month, BUDGETS.length - 1)];
    month += 1;
    const at = dayAt(s, day, 10);
    q.push(at, () => setMonthBudget(s, total, at));
  }

  for (const campaign of CAMPAIGNS) {
    if (campaign.pauseDay === undefined) continue;
    const at = dayAt(s, campaign.pauseDay, 1125);
    q.push(at, () => pauseCampaign(s, campaign, at));
  }

  for (const deal of DEALS) {
    const window = liveWindow(s, deal);
    const createAt = (window?.from ?? dayAt(s, deal.createDay, deal.fromMinutes)) - 25 * MINUTE_MS;
    q.push(createAt, () => createDeal(s, deal, createAt));
    if (!window || deal.publishDay === null) continue;
    q.push(window.from, () => publishDeal(s, deal, window.from));
    if (deal.pauseDay !== undefined) q.push(window.to, () => pauseDeal(s, deal, window.to));
    if (deal.expires) q.push(window.to, () => expireDeal(s, deal, window.to));

    /* Percentages are shown more and brought to the counter less; free items
       the other way round. */
    for (let day = deal.publishDay; day <= Math.min(0, deal.untilDay); day += 1) {
      const n = Math.floor((deal.kind === 'item' ? 4.5 : 6) * (0.6 + 0.8 * s.rng()));
      for (let i = 0; i < n; i += 1) {
        const at = dayAt(s, day, whole(s, 420, 1350), whole(s, 0, 59));
        const viewer = viewerAt(s, at);
        const source = choose(s, ['home_widget', 'home_widget', 'list', 'list', 'assistant'] as const);
        const open = s.rng() < (deal.kind === 'item' ? 0.1 : 0.07);
        if (at <= window.from || at >= window.to) continue;
        q.push(at, () => dealEvent(s, deal, viewer, at, source, open));
      }
    }
  }

  for (let day = SETUP_DAY + 1; day <= 0; day += 1) {
    const n = whole(s, 6, 12);
    for (let i = 0; i < n; i += 1) {
      const at = dayAt(s, day, whole(s, 420, 1350), whole(s, 0, 59));
      const viewer = viewerAt(s, at);
      const source = choose(s, ['list', 'list', 'search', 'map', 'guidebook', 'wallet'] as const);
      const click = s.rng() < 0.12;
      q.push(at, () => listingEvent(s, viewer, at, source, click));
    }
    const sweep = dayAt(s, day, 220);
    q.push(sweep, () => expireDue(s, sweep));
    const check = dayAt(s, day, 245);
    q.push(check, () => refreshCheck(s, check));
  }

  /* Sent inside the current month where the month allows it, so the push
     quota's funnel for "this period" has something in it. */
  const dayOfMonth = Number(s.today.slice(8, 10));
  let sendDay = -Math.min(6, Math.max(0, dayOfMonth - 1));
  if (dayAt(s, sendDay, 690) >= s.now - 180 * MINUTE_MS) sendDay = -6;
  const sendAt = dayAt(s, sendDay, 690);
  const scheduleAt = dayAt(s, sendDay - 2, 610);
  q.push(scheduleAt, () => schedulePastPush(s, scheduleAt, sendAt));
  q.push(sendAt, () => sendPush(s, sendAt));
}

/**
 * Oldest first, one database transaction per café day.
 *
 * Per day rather than one for the whole run, because on SQLite a transaction
 * holds the write lock and a live server's writes would queue behind two months
 * of history; per job rather than per day would make Postgres check a
 * connection out thousands of times.
 */
async function replay(s: State): Promise<void> {
  let days = 0;
  while (s.queue.size > 0) {
    const day = local(iso(s.queue.peek()!.at), TZ).day;
    await s.db.tx(async () => {
      for (let job = s.queue.peek(); job && local(iso(job.at), TZ).day === day; job = s.queue.peek()) {
        s.queue.pop();
        /* The plan runs to the end of today; the part of it after this moment
           has not happened yet, so it is not written. */
        if (job.at >= s.now - 5 * MINUTE_MS) continue;
        clock = job.at;
        await job.run();
      }
    });
    days += 1;
    if (days % 10 === 0) {
      console.log(`  ${day}: ${s.stats.scans} scans, ${s.stats.visits} counted visits, ${s.stats.claims} claims`);
    }
  }
}

async function finish(s: State): Promise<void> {
  await s.db.tx(async () => {
    /* The push still waiting: three days out at noon, inside quiet hours. */
    try {
      await deals.schedulePush(s.db, {
        dealId: s.dealIds.get('drinks')!,
        scheduledAt: iso(dayAt(s, 3, 720)),
        quota: await pushQuota(s),
        at: iso(s.now - 90_000),
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      s.notes.push(`the upcoming push was not scheduled: ${error.message}`);
    }

    /* `came_in`, with the definition the reminders use: a recipient with a
       counted visit here in the seven days after it was sent. Written after
       the history, because those visits are in it. */
    if (s.pushId && s.pushSentAt !== null) {
      await s.db.run(
        `UPDATE deal_pushes SET came_in = (
           SELECT COUNT(DISTINCT n.user_id) FROM notifications n
            WHERE n.push_id = $p AND n.delivery = 'sent'
              AND EXISTS (SELECT 1 FROM venue_visits v
                           WHERE v.user_id = n.user_id AND v.venue_id = $v
                             AND v.created_at > $from AND v.created_at <= $until))
          WHERE id = $p`,
        { p: s.pushId, v: s.venueId, from: iso(s.pushSentAt), until: iso(s.pushSentAt + 7 * DAY_MS) },
      );
    }

    /* Reward notices queued in the past were delivered in the past. Left
       queued, they would all be pushed to these accounts the next time the
       adapter drains. */
    const queued = await s.db.all<{ id: string }>(
      `SELECT n.id FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE n.delivery = 'queued' AND LOWER(u.email_norm) LIKE $d`,
      { d: `%@${DEMO_DOMAIN}` },
    );
    await notifications.markSent(s.db, queued.map((row) => row.id));
  });
}

/**
 * The two rules the whole backend rests on, checked rather than assumed.
 *
 * The pool identity is true by construction of `budget.viewOf`, so the check
 * that has teeth is the one beside it: what a pool says it holds in reserve
 * equals what customers are actually holding against that budget, and what it
 * says it spent equals what was actually redeemed. A reserve that outlives its
 * voucher is how a pool looks exhausted while nothing was discounted.
 */
async function checkInvariants(s: State): Promise<void> {
  const problems: string[] = [];
  const total = async (sql: string, params: Record<string, string>) =>
    Number((await s.db.get<{ n: number | null }>(sql, params))?.n ?? 0);

  for (const id of [s.ownerId, ...s.customers.map((c) => c.userId!)]) {
    const drift = await ledger.reconcile(s.db, id);
    if (drift !== 0) problems.push(`points cache for ${id} was ${drift} away from the ledger`);
    const balance = await ledger.balance(s.db, id);
    const lots = await total(`SELECT SUM(amount - consumed) AS n FROM points_lots WHERE user_id = $u AND expired = 0`, { u: id });
    if (lots !== balance) problems.push(`${id}: open FIFO lots hold ${lots} points but the balance is ${balance}`);
  }

  const budgets = await s.db.all<{ id: string; period: string; total_minor: number }>(
    `SELECT id, period, total_minor FROM budgets WHERE venue_id = $v ORDER BY period`,
    { v: s.venueId },
  );
  for (const row of budgets) {
    const view = await budget.viewById(s.db, row.id);
    for (const pool of [view.loyalty, view.voucher]) {
      if (pool.base - pool.spent - pool.reserved !== pool.available) {
        problems.push(`${row.period} ${pool.allocation}: base − spent − reserved ≠ available`);
      }
      if (pool.spent < 0 || pool.reserved < 0) problems.push(`${row.period} ${pool.allocation}: a negative state`);
    }
    if (view.total !== Number(row.total_minor)) problems.push(`${row.period}: the pools do not add up to the budget`);
    const b = { b: row.id };
    const held = {
      voucher: await total(`SELECT SUM(reserved_minor) AS n FROM issued_vouchers WHERE budget_id = $b AND status = 'active'`, b),
      loyalty: await total(`SELECT SUM(reserved_minor) AS n FROM earned_rewards WHERE budget_id = $b AND status = 'available'`, b),
    };
    const spent = {
      voucher: await total(`SELECT SUM(spent_minor) AS n FROM issued_vouchers WHERE budget_id = $b AND status = 'redeemed'`, b),
      loyalty: await total(`SELECT SUM(cost_minor) AS n FROM earned_rewards WHERE budget_id = $b AND status = 'redeemed'`, b),
    };
    for (const allocation of ['voucher', 'loyalty'] as const) {
      const pool = view[allocation];
      if (pool.reserved !== held[allocation]) {
        problems.push(`${row.period} ${allocation}: ${pool.reserved} reserved, but customers hold ${held[allocation]}`);
      }
      if (pool.spent !== spent[allocation]) {
        problems.push(`${row.period} ${allocation}: ${pool.spent} spent, but ${spent[allocation]} was redeemed`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Refusal(['the invariants do not hold after seeding:', ...problems.map((p) => `  - ${p}`)].join('\n'));
  }
  s.notes.push(
    `invariants hold: the ledger reconciles for all ${s.customers.length + 1} accounts, and all ${budgets.length} budgets' pools match what is held and redeemed`,
  );
}

/* ═══════════════════════════════════════════════════════════ the output ══ */

interface AccountRow {
  role: AccountRole;
  email: string;
  name: string;
  username: string;
  shares: string;
  points: number;
}

async function render(s: State, target: string): Promise<string> {
  const rows: AccountRow[] = [
    {
      role: 'owner',
      email: `${OWNER.mailbox}@${DEMO_DOMAIN}`,
      name: OWNER.name,
      username: '—',
      shares: '—',
      points: await ledger.balance(s.db, s.ownerId),
    },
  ];
  for (const c of s.customers) {
    rows.push({
      role: c.role,
      email: c.email,
      name: c.name,
      username: `@${c.username}`,
      shares: c.consented ? 'yes' : 'no',
      points: await ledger.balance(s.db, c.userId!),
    });
  }

  const columns: Array<[string, (row: AccountRow) => string]> = [
    ['role', (row) => row.role],
    ['email', (row) => row.email],
    ['name', (row) => row.name],
    ['username', (row) => row.username],
    ['shares with venue', (row) => row.shares],
    ['points', (row) => String(row.points)],
  ];
  const widths = columns.map(([title, cell]) => Math.max(title.length, ...rows.map((row) => cell(row).length)));
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd();

  const st = s.stats;
  const reminderDay = shiftDay(s.today, 3);
  return [
    `Paylez demo data, seeded ${iso(s.now)} into ${target}`,
    '',
    `Venue     ${VENUE.name} (${s.venueId}) — live, verified by ${s.reviewedBy}, Growth plan (manual, 12 months)`,
    `Owner     ${OWNER.mailbox}@${DEMO_DOMAIN} signs in to the partner dashboard`,
    `Password  ${s.password}`,
    '          One password for all 26 accounts below. Nobody else has it; keep this file private.',
    '',
    line(columns.map(([title]) => title)),
    line(widths.map((w) => '-'.repeat(w))),
    ...rows.map((row) => line(columns.map(([, cell]) => cell(row)))),
    '',
    `History   ${-FIRST_VISIT_DAY} days: ${st.scans} scans (${st.visits} counted as visits, ${st.underMinimum} under the 15 zł minimum), ${st.claims} deal claims`,
    `          ${st.rewardsEarned} rewards earned (${st.rewardsRedeemed} redeemed, ${st.rewardsExpired} expired), ${st.vouchersIssued} vouchers bought (${st.vouchersRedeemed} redeemed, ${st.vouchersExpired} expired)`,
    `          listing: ${st.listingImpressions} impressions, ${st.listingClicks} clicks; deals: ${st.dealImpressions} impressions, ${st.dealOpens} opens`,
    `          one push sent to ${st.pushTargeted} customers (${st.pushDelivered} delivered), one scheduled for ${reminderDay} 12:00`,
    ...s.notes.map((note) => `Note      ${note}`),
    '',
    'Remove all of it:  npm run demo:purge   (add --yes on Postgres or with NODE_ENV=production)',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const target = describeTarget();
  confirmTarget(target, 'demo:seed');
  const out = resolve(option('out') ?? fileURLToPath(new URL('../data/demo-accounts.local.txt', import.meta.url)));
  const db = await openTarget(target);
  let writing = false;
  try {
    /* The plans and category defaults, exactly as `boot()` writes them on
       every start. The Growth subscription below needs the plan row. */
    await seedPlatform(db);

    const existing = await findDemo(db);
    if (existing.users.length > 0 || existing.venues.length > 0) {
      if (!flag('reset')) {
        throw new Refusal(
          `demo data is already in this database (${existing.users.length} account(s), ${existing.venues.length} venue(s)). ` +
            'Run npm run demo:purge first, or pass --reset to purge it and seed again.',
        );
      }
      const report = await purgeDemo(db, target.engine, (message) => console.log(`purge: ${message}`));
      console.log(`purge: removed ${Object.values(report.removed).reduce((sum, n) => sum + n, 0)} rows`);
      for (const warning of report.warnings) console.log(`purge note: ${warning}`);
    }

    const now = Date.now();
    const s: State = {
      db,
      rng: prng(SEED),
      now,
      today: local(iso(now), TZ).day,
      password: randomBytes(12).toString('base64url'),
      secret: CONFIG.server.secret,
      ownerId: '',
      venueId: '',
      reviewedBy: 'the script',
      dealIds: new Map(),
      campaignIds: new Map(),
      pushId: null,
      pushSentAt: null,
      customers: CAST.map((persona, index) => ({
        ...persona,
        index,
        email: `${persona.mailbox}@${DEMO_DOMAIN}`,
        signupAt: 0,
        userId: null,
        consented: false,
        nudge: null,
      })),
      queue: createQueue(),
      stats: Object.fromEntries(STAT_KEYS.map((key) => [key, 0])) as Stats,
      notes: [],
    };

    plan(s);
    writing = true;
    console.log(`demo:seed: replaying ${s.queue.size} planned events, ${shiftDay(s.today, SETUP_DAY)} to ${s.today} (${TZ})`);
    await replay(s);
    await finish(s);
    await checkInvariants(s);

    const text = await render(s, target.label);
    console.log(`\n${text}`);
    try {
      mkdirSync(dirname(out), { recursive: true });
      /* Owner-readable only: it holds a password that opens twenty-six accounts. */
      writeFileSync(out, text, { mode: 0o600 });
      console.log(`written to ${out}`);
    } catch (error) {
      console.warn(`could not write ${out} (${(error as Error).message}); the table above is the only copy`);
    }
  } catch (error) {
    if (writing) console.error('demo:seed stopped part-way. Run npm run demo:purge to remove what it wrote.');
    throw error;
  } finally {
    await db.close();
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof Refusal) {
    console.error(`demo:seed: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
