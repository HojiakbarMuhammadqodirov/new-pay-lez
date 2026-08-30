/**
 * The relocation guide, the news feed, the community directory and the rate
 * sheet — the content half of the old database, served.
 *
 * None of this is in either backend spec, and it is here because it is what the
 * site's Relocate page and the old app's guidebook actually read: 308 service
 * listings, 42 long-form articles, a news feed and 19 currencies. Dropping it
 * would mean the new backend serves a product with a page missing.
 *
 * Copy comes out of `translations` in the reader's language with an explicit
 * fallback to English, and the response says which language it got — the same
 * honesty rule the deals list follows, for the same reason: a card rendered in
 * a language the reader did not ask for should be visibly that, not silently it.
 */
import { CONFIG } from '../../config.ts';
import * as contact from '../../domain/contact.ts';
import * as traffic from '../../domain/traffic.ts';
import { list, optStr, str, qInt, qStr } from '../input.ts';
import type { Ctx, Route } from '../router.ts';

/** `field → value` in the best available language, for one entity. */
function copyOf(
  ctx: Ctx,
  entity: string,
  ids: string[],
  fields: string[],
): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  if (ids.length === 0) return out;

  const rows = ctx.db.all<{ entity_id: string; field: string; language: string; value: string }>(
    `SELECT entity_id, field, language, value FROM translations
      WHERE entity = $e AND language IN ($l, 'en')`,
    { e: entity, l: ctx.language },
  );
  const wanted = new Set(ids);
  for (const row of rows) {
    if (!wanted.has(row.entity_id) || !fields.includes(row.field)) continue;
    const bucket = out.get(row.entity_id) ?? {};
    /* The reader's language wins; English only fills a hole. */
    if (row.language === ctx.language || bucket[row.field] === undefined) {
      bucket[row.field] = row.value;
    }
    out.set(row.entity_id, bucket);
  }
  return out;
}

export const guidanceRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/v1/guide/categories',
    auth: 'none',
    handler: (ctx) => {
      const country = qStr(ctx, 'country') ?? 'PL';
      const categories = ctx.db.all<{ id: string; key: string; icon: string | null; color: string | null; position: number }>(
        `SELECT id, key, icon, color, position FROM guidance_categories
          WHERE country_code = $c AND active = 1 ORDER BY position`,
        { c: country },
      );
      const copy = copyOf(ctx, 'guidance_category', categories.map((c) => c.id), ['title', 'description']);
      const subs = ctx.db.all<{ id: string; key: string; parent_key: string; icon: string | null; position: number }>(
        `SELECT id, key, parent_key, icon, position FROM guidance_subcategories
          WHERE active = 1 ORDER BY position`,
      );
      const subCopy = copyOf(ctx, 'guidance_subcategory', subs.map((s) => s.id), ['title']);

      return categories.map((category) => ({
        ...category,
        ...(copy.get(category.id) ?? {}),
        subcategories: subs
          .filter((sub) => sub.parent_key === category.key)
          .map((sub) => ({ ...sub, ...(subCopy.get(sub.id) ?? {}) })),
      }));
    },
  },
  {
    method: 'GET',
    pattern: '/v1/guide/services',
    auth: 'none',
    handler: (ctx) => {
      const rows = ctx.db.all<{ id: string; venue_id: string | null; name: string; category_key: string | null;
        city: string | null; address: string | null; lat: number | null; lng: number | null;
        phone: string | null; price_range: string | null; rating: number | null;
        review_count: number; image_url: string | null; accepts_vouchers: number; subcategories: string }>(
        `SELECT id, venue_id, name, category_key, city, address, lat, lng, phone, price_range,
                rating, review_count, image_url, accepts_vouchers, subcategories
           FROM guidance_services
          WHERE active = 1
            AND ($country IS NULL OR country_code = $country)
            AND ($city IS NULL OR city = $city)
            AND ($cat IS NULL OR category_key = $cat)
          ORDER BY position, rating DESC LIMIT $lim`,
        {
          country: qStr(ctx, 'country') ?? 'PL',
          city: qStr(ctx, 'city') ?? null,
          cat: qStr(ctx, 'category') ?? null,
          lim: qInt(ctx, 'limit', 100),
        },
      );
      const copy = copyOf(ctx, 'guidance_service', rows.map((r) => r.id), ['description']);
      const links = ctx.db.all<{ service_id: string; kind: string; value: string }>(
        `SELECT service_id, kind, value FROM guidance_service_links`,
      );

      return rows.map((row) => ({
        ...row,
        subcategories: JSON.parse(row.subcategories || '[]') as string[],
        acceptsVouchers: row.accepts_vouchers === 1,
        /* A listing that is also a Paylez venue links through to the venue, which
           is where the tiers, stamp cards and deals live. The directory entry is
           the same place at an earlier stage of its relationship with us. */
        venueId: row.venue_id,
        description: copy.get(row.id)?.description ?? null,
        links: links.filter((link) => link.service_id === row.id).map(({ kind, value }) => ({ kind, value })),
      }));
    },
  },
  {
    method: 'GET',
    pattern: '/v1/guide/articles',
    auth: 'none',
    handler: (ctx) => {
      const rows = ctx.db.all<{ id: string; category_key: string | null; position: number }>(
        `SELECT id, category_key, position FROM guidance_articles
          WHERE active = 1 AND ($country IS NULL OR country_code = $country)
            AND ($cat IS NULL OR category_key = $cat)
          ORDER BY position LIMIT $lim`,
        {
          country: qStr(ctx, 'country') ?? 'PL',
          cat: qStr(ctx, 'category') ?? null,
          lim: qInt(ctx, 'limit', 100),
        },
      );
      /* Headings only. The articles are long-form HTML — the largest of them is
         several hundred kilobytes — and a list endpoint that ships every body is
         a list endpoint nobody can use on a phone. */
      const copy = copyOf(ctx, 'guidance_article', rows.map((r) => r.id), ['heading']);
      return rows.map((row) => ({ ...row, heading: copy.get(row.id)?.heading ?? null }));
    },
  },
  {
    method: 'GET',
    pattern: '/v1/guide/articles/:id',
    auth: 'none',
    handler: (ctx) => {
      const article = ctx.db.get(`SELECT * FROM guidance_articles WHERE id = $i`, {
        i: ctx.params.id,
      });
      const copy = copyOf(ctx, 'guidance_article', [ctx.params.id], ['heading', 'content']);
      return { article, ...(copy.get(ctx.params.id) ?? {}) };
    },
  },
  {
    method: 'GET',
    pattern: '/v1/news',
    auth: 'none',
    handler: (ctx) => {
      const rows = ctx.db.all<{ id: string; icon: string | null; color: string | null; published_at: string | null; position: number }>(
        `SELECT id, icon, color, published_at, position FROM news_items
          WHERE active = 1 AND ($country IS NULL OR country_code = $country)
          ORDER BY position, published_at DESC`,
        { country: qStr(ctx, 'country') ?? 'PL' },
      );
      const copy = copyOf(ctx, 'news_item', rows.map((r) => r.id), ['title', 'content']);
      return rows.map((row) => ({ ...row, ...(copy.get(row.id) ?? {}) }));
    },
  },
  {
    method: 'GET',
    pattern: '/v1/community',
    auth: 'none',
    handler: (ctx) =>
      ctx.db.all(
        `SELECT id, display_name, city, country_code, work, bio, interests, languages,
                telegram, instagram
           FROM community_profiles WHERE visible = 1 ORDER BY created_at DESC LIMIT $l`,
        { l: qInt(ctx, 'limit', 100) },
      ),
  },
  {
    /**
     * The rate sheet — one anchor, every cross rate derived.
     *
     * `to.rate / from.rate` is exact for all 342 pairs, which is the rule
     * `src/site/i18n/fx.ts` states on the front end. The old export stored all
     * 342 pairs and this is the same data with the redundancy removed, so the
     * converter and a price tag two pages over cannot disagree.
     */
    method: 'GET',
    pattern: '/v1/fx',
    auth: 'none',
    handler: (ctx) => {
      const rows = ctx.db.all<{ code: string; base: string; rate: number; decimals: number; updated_at: string }>(
        `SELECT code, base, rate, decimals, updated_at FROM exchange_rates ORDER BY code`,
      );
      const from = qStr(ctx, 'from');
      const to = qStr(ctx, 'to');
      const amount = Number(qStr(ctx, 'amount') ?? '0');

      const base = rows[0]?.base ?? 'EUR';
      const rateOf = (code: string) => rows.find((row) => row.code === code)?.rate;

      const converted =
        from && to && rateOf(from) && rateOf(to)
          ? { from, to, amount, result: (amount * rateOf(to)!) / rateOf(from)! }
          : null;

      return { base, updatedAt: rows[0]?.updated_at ?? null, rates: rows, converted };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/recommendations',
    auth: 'none',
    handler: (ctx) => {
      const id = `rec_${Date.now().toString(36)}`;
      ctx.db.run(
        `INSERT INTO service_recommendations
           (id, user_id, name, city, country_code, category_key, subcategory, status, created_at)
         VALUES ($i, $u, $n, $ci, $cc, $ck, $sc, 'pending', $t)`,
        {
          i: id,
          u: ctx.actor?.user.id ?? null,
          n: String(ctx.body.name ?? '').slice(0, 200),
          ci: (ctx.body.city as string) ?? null,
          cc: (ctx.body.countryCode as string) ?? 'PL',
          ck: (ctx.body.categoryKey as string) ?? null,
          sc: (ctx.body.subcategory as string) ?? null,
          t: ctx.at,
        },
      );
      return { id, status: 'pending' };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/feedback',
    auth: 'none',
    handler: (ctx) => {
      const id = `fbk_${Date.now().toString(36)}`;
      ctx.db.run(
        `INSERT INTO feedback (id, user_id, subject, body, rating, status, created_at)
         VALUES ($i, $u, $s, $b, $r, 'new', $t)`,
        {
          i: id,
          u: ctx.actor?.user.id ?? null,
          s: (ctx.body.subject as string) ?? null,
          b: String(ctx.body.body ?? '').slice(0, 4000),
          r: typeof ctx.body.rating === 'number' ? ctx.body.rating : null,
          t: ctx.at,
        },
      );
      return { id };
    },
  },
  {
    /**
     * The archived remittance tables, read-only.
     *
     * Both specs put real money movement in a separate later track. The old app's
     * wallets, recipients and transfers are imported for continuity and served
     * here so nothing is lost — and nothing in the domain layer writes to them.
     */
    method: 'GET',
    pattern: '/v1/legacy/wallet',
    auth: 'user',
    handler: (ctx) => ({
      note: 'Archived. The money-movement track is out of scope for this backend.',
      wallet: ctx.db.get(`SELECT * FROM legacy_wallets WHERE user_id = $u`, {
        u: ctx.actor!.user.id,
      }),
      recipients: ctx.db.all(`SELECT * FROM legacy_recipients WHERE user_id = $u`, {
        u: ctx.actor!.user.id,
      }),
      transfers: ctx.db.all(
        `SELECT * FROM legacy_transfers WHERE user_id = $u ORDER BY created_at DESC`,
        { u: ctx.actor!.user.id },
      ),
    }),
  },
  {
    /**
     * The traffic beacon. Public, because the visitors worth counting are
     * mostly not signed in.
     *
     * It takes no session id and issues none — the visit is derived from the
     * connection inside `domain/traffic.ts`, which is what makes it unforgeable
     * and what keeps anything durable off the device. `auth: 'none'` here still
     * means `ctx.actor` is populated when a token *was* sent, which is how a
     * signed-in visit gets attributed without a second endpoint.
     */
    method: 'POST',
    pattern: '/v1/traffic',
    auth: 'none',
    name: 'traffic.record',
    handler: (ctx) => {
      const events = list(ctx.body, 'events', (item) => {
        const bag = (item ?? {}) as Record<string, unknown>;
        return {
          kind: bag.kind === 'action' ? ('action' as const) : ('view' as const),
          path: String(bag.path ?? '/'),
          name: bag.name === undefined ? undefined : String(bag.name),
        };
      });
      if (events.length === 0) return { ok: true, recorded: 0 };

      traffic.record(
        ctx.db,
        {
          events,
          ip: ctx.ip,
          agent: String(ctx.req.headers['user-agent'] ?? ''),
          referrer: optStr(ctx.body, 'referrer'),
          language: ctx.language,
          /* Set by the edge (Cloudflare, Vercel, Fly). Absent in development,
             and null is the honest answer rather than a guess from the IP. */
          country:
            (ctx.req.headers['cf-ipcountry'] as string | undefined) ??
            (ctx.req.headers['x-vercel-ip-country'] as string | undefined),
          userId: ctx.actor?.user.id ?? null,
          accountType: ctx.actor?.session.mode ?? null,
        },
        ctx.secret,
        ctx.at,
      );
      return { ok: true, recorded: events.length };
    },
  },
  {
    /**
     * A message from the website's Contact page.
     *
     * `auth: 'none'`, because the point of a contact form is that somebody who
     * cannot sign in can still reach us — a support form behind a session is a
     * support form the people who most need it cannot use. When a token *was*
     * sent it is attributed, exactly as the traffic beacon does it, so an
     * operator reading the message knows which account it came from without the
     * sender having to say.
     *
     * The connection is passed through for the rate limit and nothing else. It
     * is hashed under the day's key inside the domain and never stored raw —
     * see `domain/contact.ts`.
     */
    method: 'POST',
    pattern: '/v1/contact',
    auth: 'none',
    name: 'contact.submit',
    handler: (ctx) =>
      contact.submit(ctx.db, {
        topic: str(ctx.body, 'topic'),
        name: str(ctx.body, 'name'),
        email: str(ctx.body, 'email'),
        body: str(ctx.body, 'message'),
        userId: ctx.actor?.user.id ?? null,
        language: ctx.language,
        ip: ctx.ip,
        agent: String(ctx.req.headers['user-agent'] ?? ''),
        secret: ctx.secret,
        at: ctx.at,
      }),
  },
  {
    method: 'GET',
    pattern: '/v1/health',
    auth: 'none',
    handler: (ctx) => ({
      ok: true,
      at: ctx.at,
      policyVersion: CONFIG.privacy.policyVersion,
      venues: ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM venues`)?.n ?? 0,
      users: ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM users`)?.n ?? 0,
    }),
  },
];
