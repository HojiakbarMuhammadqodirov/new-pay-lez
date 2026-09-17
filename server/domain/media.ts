/**
 * Logos and photographs — fetched once, here, and served from our own origin.
 *
 * ## The bug this file is the fix for
 *
 * "Service logos do not display." They did not, and the reason was a rule
 * working correctly two layers away: the front end makes **no third-party
 * runtime requests** (root `CLAUDE.md`), and every venue and guidance-service
 * image the Base44 import brought over is an `https://base44.app/…` address. So
 * `auth/picture.ts` refused to draw them, `guidance_services.image_url` was
 * deliberately kept off the API's own interface, and every card in the product
 * rendered the name's initial.
 *
 * That rule is about the **browser**, and it is worth keeping: an `<img>`
 * pointed at somebody else's CDN tells that CDN who is reading the page, and
 * breaks the day the CDN does. This server has no such rule — it already calls
 * Stripe and Anthropic — so the image is fetched *here*, once, kept, and served
 * back from `/v1/media/:entity/:id`. The browser makes a first-party request and
 * the rule holds.
 *
 * ## What is normalised, and what honestly is not
 *
 * Three things, and they are the three that can be without an image library in
 * a codebase whose dependency budget is one package:
 *
 * - **The media type** is one of `ALLOWED` and is refused otherwise. `svg+xml`
 *   is refused on purpose: an SVG served from our own origin is a script
 *   execution vector, which is a different kind of thing from a picture.
 * - **The size** is capped in bytes and refused rather than truncated. Two
 *   caps, and the second one matters: `content-length` is checked *before* the
 *   body is read, because a host that advertises 40 kB and sends 400 MB is the
 *   whole reason a cap exists.
 * - **The storage** is one shape for every logo in the product — base64 in one
 *   column, the type in the next — so "a consistent format in the database" is
 *   true of the store even though the pixels are whatever the source sent.
 *
 * **Re-encoding, cropping and resizing are not done.** They would need an image
 * library. The *presentation* convention — square, cropped, one size — is CSS
 * (`object-fit: cover` on a fixed box), which is where it is visible and where
 * it belongs.
 *
 * ## Fetched lazily, and a failure is a fact
 *
 * There is no batch job. The first request for an asset fetches it; every later
 * one reads the row. A failure is **recorded** with its reason and not retried
 * on the next request, which is the difference between one broken source URL
 * and a page that opens an outbound connection per card per visitor. `refresh`
 * is how an operator asks again.
 *
 * The client always has a fallback — the initial on the accent — so a refusal
 * here is a card that looks exactly as it did before this file existed, which
 * is the correct failure mode and the reason none of this needs to be reliable.
 */
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import { DomainError } from './errors.ts';
import { now, type Iso } from './time.ts';

/**
 * What a stored image may be.
 *
 * Raster only, and deliberately short. Every entry is a format every browser
 * this product targets decodes, and nothing here can execute: `image/svg+xml`
 * is a document with a script element available to it, and serving one from our
 * own origin hands an attacker our cookies. A logo is not worth that.
 */
export const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** Which kinds of row may own an asset, and where its source URL lives. */
const SOURCES: Record<string, { table: string; column: string }> = {
  /* The guidance directory — the "service logos" of the report. */
  service: { table: 'guidance_services', column: 'image_url' },
  /* A venue's own logo, which the owner's form writes as a `data:` URL and the
     import brought over as an address. */
  venue: { table: 'venues', column: 'logo' },
};

export const isEntity = (value: string): boolean => value in SOURCES;

export interface Asset {
  mime: string;
  /** The decoded bytes, ready to write to a response. */
  body: Buffer;
}

interface Row {
  source_url: string;
  mime: string | null;
  bytes: string | null;
  status: string;
  detail: string | null;
}

/**
 * The source URL a row carries, or null.
 *
 * A `data:` URL is **not** a source: the browser can already draw one and the
 * server has nothing to add by re-serving it. The listing form writes those, so
 * this is the common case and skipping it is what keeps an owner's own upload
 * out of this table entirely.
 */
async function sourceOf(db: Db, entity: string, id: string): Promise<string | null> {
  const source = SOURCES[entity];
  if (!source) return null;
  const row = await db.get<{ value: string | null }>(
    `SELECT ${source.column} AS value FROM ${source.table} WHERE id = $i`,
    { i: id },
  );
  const value = (row?.value ?? '').trim();
  if (!value || value.startsWith('data:')) return null;
  /* Only `http(s)`. A `file:` or a bare path would make this an arbitrary-read
     primitive against the box the server runs on, which is the one way an
     image proxy becomes a serious hole rather than a broken picture. */
  if (!/^https?:\/\//i.test(value)) return null;
  return value;
}

/**
 * Fetch and store one asset.
 *
 * Returns the row's outcome rather than throwing on a bad source: a source that
 * refuses is a *fact about that row*, and the caller's job is to serve a 404 and
 * let the client draw its initial.
 */
async function ingest(db: Db, entity: string, id: string, url: string, at: Iso): Promise<Row> {
  const write = async (
    status: 'ok' | 'refused' | 'failed',
    detail: string | null,
    mime: string | null,
    bytes: string | null,
  ): Promise<Row> => {
    await db.run(
      `INSERT INTO media_assets (id, entity, entity_id, source_url, mime, bytes, size_bytes, status, detail, fetched_at)
       VALUES ($i, $e, $x, $u, $m, $b, $s, $st, $d, $t)
         ON CONFLICT (entity, entity_id) DO UPDATE SET
           source_url = excluded.source_url,
           mime = excluded.mime,
           bytes = excluded.bytes,
           size_bytes = excluded.size_bytes,
           status = excluded.status,
           detail = excluded.detail,
           fetched_at = excluded.fetched_at`,
      {
        i: `med_${entity}_${id}`,
        e: entity,
        x: id,
        u: url,
        m: mime,
        b: bytes,
        s: bytes ? Buffer.byteLength(bytes, 'base64') : 0,
        st: status,
        d: detail,
        t: at,
      },
    );
    return { source_url: url, mime, bytes, status, detail };
  };

  let response: Response;
  try {
    /* A timeout, because a hung fetch holds a request on this server and the
       thing at the other end is somebody else's host. `redirect: 'follow'` is
       the default and is wanted — a CDN URL is usually one hop from the real
       object — and the scheme check in `sourceOf` is re-applied to whatever we
       ended up at, because a redirect to `file:` is the same hole. */
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(CONFIG.media.timeoutMs),
    });
  } catch (error) {
    return await write('failed', (error as Error).message.slice(0, 200), null, null);
  }

  if (!response.ok) return await write('failed', `http ${response.status}`, null, null);
  if (!/^https?:$/i.test(new URL(response.url).protocol)) {
    return await write('refused', 'redirected off http', null, null);
  }

  const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!(ALLOWED as readonly string[]).includes(mime)) {
    return await write('refused', `type ${mime || 'unknown'}`, null, null);
  }

  /* Checked before the body is read. A host advertising 40 kB and sending
     400 MB is the reason the cap exists at all, so the advertised figure is
     only the cheap half of it — the real one is the length after reading. */
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > CONFIG.media.maxBytes) {
    return await write('refused', `declared ${declared} bytes`, null, null);
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    return await write('failed', (error as Error).message.slice(0, 200), null, null);
  }
  if (buffer.byteLength === 0) return await write('failed', 'empty body', null, null);
  if (buffer.byteLength > CONFIG.media.maxBytes) {
    return await write('refused', `${buffer.byteLength} bytes`, null, null);
  }

  return await write('ok', null, mime, buffer.toString('base64'));
}

/**
 * The asset for a row, fetching it the first time.
 *
 * Throws `not_found` for everything the client should treat identically — no
 * source, a refusal, a dead host — because the client's answer to all of them
 * is the same: draw the initial. Distinguishing them in a status code would
 * invite a client to handle them differently, and there is nothing different to
 * do.
 */
export async function assetFor(db: Db, entity: string, id: string, at: Iso = now()): Promise<Asset> {
  if (!SOURCES[entity]) throw new DomainError('not_found', 'no such media kind');

  let row = await db.get<Row>(
    `SELECT source_url, mime, bytes, status, detail FROM media_assets
      WHERE entity = $e AND entity_id = $x`,
    { e: entity, x: id },
  );

  /* Re-fetch when the row it describes now points somewhere else — an owner
     replacing a logo must not go on being served the old one — and when there
     is no row yet. A *failure* is not re-fetched: that is the difference between
     one broken source and an outbound connection per card per visitor. */
  const url = await sourceOf(db, entity, id);
  if (!url) throw new DomainError('not_found', 'nothing to serve');
  if (!row || row.source_url !== url) row = await ingest(db, entity, id, url, at);

  if (row.status !== 'ok' || !row.bytes || !row.mime) {
    throw new DomainError('not_found', 'nothing to serve');
  }
  return { mime: row.mime, body: Buffer.from(row.bytes, 'base64') };
}

/**
 * Ask again for one asset, whatever it said last time.
 *
 * The operator's escape hatch from the no-retry rule above: a host that was
 * down when a card was first opened stays recorded as `failed` until somebody
 * says otherwise, and "somebody says otherwise" is a person pressing a button
 * rather than every page view.
 */
export async function refresh(db: Db, entity: string, id: string, at: Iso = now()): Promise<string> {
  const url = await sourceOf(db, entity, id);
  if (!url) {
    await db.run(`DELETE FROM media_assets WHERE entity = $e AND entity_id = $x`, {
      e: entity,
      x: id,
    });
    return 'none';
  }
  return (await ingest(db, entity, id, url, at)).status;
}

/**
 * Drop the assets of a row that is being deleted.
 *
 * `media_assets` is keyed by `(entity, entity_id)` with no foreign key — that is
 * what lets one table serve venues and services — so no cascade reaches it,
 * exactly as `translations` has to be swept by hand for the same reason. Called
 * from the delete paths in `routes/admin.ts`.
 */
export async function forget(db: Db, entity: string, id: string): Promise<void> {
  await db.run(`DELETE FROM media_assets WHERE entity = $e AND entity_id = $x`, {
    e: entity,
    x: id,
  });
}

/**
 * The path a client should use for a row's logo, or null.
 *
 * **The server never hands a browser a third-party URL**, and this is the
 * function that makes that true rather than hoped: a response carries a path on
 * our own origin or it carries nothing. A `data:` URL is passed through
 * untouched, because the browser can already draw one and proxying it would be
 * a round trip to re-serve bytes the response already contains.
 */
export function logoPath(entity: string, id: string, stored: string | null | undefined): string | null {
  const value = (stored ?? '').trim();
  if (!value) return null;
  if (value.startsWith('data:')) return value;
  if (!/^https?:\/\//i.test(value)) return null;
  return `/v1/media/${entity}/${encodeURIComponent(id)}`;
}
