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
 *
 * ## Three kinds of stored value, one kind of answer
 *
 * A row's image column holds one of three things, and the browser is handed the
 * same thing for all of them — a path under `/v1/media`, carrying `?v=` a hash
 * of the stored value, so a replaced logo is a new URL and the week-long
 * `immutable` cache can never serve the old one:
 *
 * - **`media:<dir>/<file>`** — a file on this server's own disk, under
 *   `CONFIG.media.dir` (the VPS: `/var/lib/paylez/media`). The format every
 *   service logo is moved to: 256×256 WebP, at most 60 kB
 *   (`scripts/logos-export.mjs`, then `npm run logos:link` on the box).
 * - **`data:`** — a picture inline in the column, as the listing form writes
 *   one. Decoded and served like any other; it used to be passed through to the
 *   browser inside the JSON, which put 1.6 MB of base64 in the directory's
 *   list response, twice per logo.
 * - **`http(s)://`** — somebody else's address (the Base44 import), fetched once
 *   and kept in `media_assets`.
 *
 * ## Why the type is read from the bytes
 *
 * Base44 serves its files as `application/octet-stream`, and a type check that
 * believed the header refused every one of them — 38 of the directory's logos,
 * reported as missing while the files were sitting there. The header is now a
 * hint: when it does not name an allowed type, the first bytes decide
 * (`sniff`). SVG still never passes — it has no magic number here to match.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
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

/**
 * The image type a file's first bytes say it is, or null.
 *
 * The four `ALLOWED` formats, by their magic numbers. Nothing else is
 * recognised, so a file whose header lies and whose bytes are an SVG, an HTML
 * page or anything else is still refused.
 */
export function sniff(bytes: Buffer): (typeof ALLOWED)[number] | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/**
 * A `media:` value's file, or null when it is not one this server will open.
 *
 * One directory level and a plain file name, nothing else: a `..`, a slash too
 * many or an absolute path would turn a logo column into a way of reading the
 * box's disk, which is the hole `sourceOf` already closes for `file:` URLs.
 * The resolved path must still sit inside the media directory.
 */
export function mediaFile(stored: string): string | null {
  const match = /^media:([a-z]+)\/([A-Za-z0-9_-]+\.(?:webp|png|jpe?g|gif))$/.exec(stored.trim());
  if (!match) return null;
  const root = resolve(CONFIG.media.dir);
  const path = resolve(join(root, match[1], match[2]));
  const inside = relative(root, path);
  return inside && !inside.startsWith('..') && !isAbsolute(inside) ? path : null;
}

/** A `data:` value's bytes and type, or null when it is not a picture we serve. */
function decodeData(stored: string): Asset | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(stored.trim());
  if (!match || !match[2]) return null;
  const body = Buffer.from(match[3], 'base64');
  const mime = sniff(body);
  if (!mime || body.byteLength === 0 || body.byteLength > CONFIG.media.maxBytes) return null;
  return { mime, body };
}

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
/** What the row's image column holds, trimmed, or '' for nothing. */
async function storedOf(db: Db, entity: string, id: string): Promise<string> {
  const source = SOURCES[entity];
  if (!source) return '';
  const row = await db.get<{ value: string | null }>(
    `SELECT ${source.column} AS value FROM ${source.table} WHERE id = $i`,
    { i: id },
  );
  return (row?.value ?? '').trim();
}

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

  const declaredType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();

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

  /* The bytes decide, the header only breaks a tie — see "Why the type is read
     from the bytes" above. A file that is not one of the four is refused
     whatever it was labelled. */
  const mime = sniff(buffer);
  if (!mime) return await write('refused', `type ${declaredType || 'unknown'}`, null, null);

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

  /* A file on our own disk, or a picture inline in the column: no fetch and no
     cache row — the bytes are already here. */
  const stored = await storedOf(db, entity, id);
  if (stored.startsWith('media:')) {
    const path = mediaFile(stored);
    if (!path) throw new DomainError('not_found', 'nothing to serve');
    let body: Buffer;
    try {
      body = await readFile(path);
    } catch {
      throw new DomainError('not_found', 'nothing to serve');
    }
    const mime = sniff(body);
    if (!mime) throw new DomainError('not_found', 'nothing to serve');
    return { mime, body };
  }
  if (stored.startsWith('data:')) {
    const asset = decodeData(stored);
    if (!asset) throw new DomainError('not_found', 'nothing to serve');
    return asset;
  }

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
 * our own origin or it carries nothing. It is a **path** — relative to the API,
 * not to the page — so a client joins it to its API base; the site's
 * `mediaUrl` does, and resolving it against the site's own origin is exactly
 * the bug that drew every card's initial (nginx answers an unknown path on
 * `www` with `index.html`).
 *
 * `?v=` is a short hash of the stored value. The response is cached
 * `immutable` for a week, so the URL has to change when the logo does.
 */
export function logoPath(entity: string, id: string, stored: string | null | undefined): string | null {
  const value = (stored ?? '').trim();
  if (!value) return null;
  const servable =
    /^https?:\/\//i.test(value) || (value.startsWith('data:') && decodeData(value) !== null) || mediaFile(value) !== null;
  if (!servable) return null;
  const version = createHash('sha1').update(value).digest('hex').slice(0, 10);
  return `/v1/media/${entity}/${encodeURIComponent(id)}?v=${version}`;
}

/**
 * Point every service whose logo file is on disk at that file.
 *
 * The second half of moving the directory's logos onto this server: the files
 * arrive in `<CONFIG.media.dir>/service/` named `<service id>.webp` (what
 * `scripts/logos-export.mjs` writes), and this sets each matching row's
 * `image_url` to `media:service/<file>`. A file named for no service is
 * reported, not guessed at; a row already pointing at its file is left alone, so
 * running it twice changes nothing. `dryRun` reports without writing.
 */
export async function linkServiceFiles(
  db: Db,
  options: { dryRun?: boolean } = {},
): Promise<{ linked: string[]; unchanged: number; unknown: string[]; unreadable: string[] }> {
  const dir = join(resolve(CONFIG.media.dir), 'service');
  let files: string[];
  try {
    files = (await readdir(dir)).filter((name) => /^[A-Za-z0-9_-]+\.(?:webp|png|jpe?g|gif)$/.test(name)).sort();
  } catch {
    return { linked: [], unchanged: 0, unknown: [], unreadable: [] };
  }
  const linked: string[] = [];
  const unknown: string[] = [];
  const unreadable: string[] = [];
  let unchanged = 0;
  for (const name of files) {
    const id = name.replace(/\.[a-z]+$/, '');
    const row = await db.get<{ image_url: string | null }>(`SELECT image_url FROM guidance_services WHERE id = $i`, { i: id });
    if (!row) {
      unknown.push(name);
      continue;
    }
    /* A file that is not one of the four formats would be a 404 the moment it
       was linked, so it is refused here, where somebody is watching. */
    const body = await readFile(join(dir, name)).catch(() => null);
    if (!body || !sniff(body) || body.byteLength > CONFIG.media.maxBytes) {
      unreadable.push(name);
      continue;
    }
    const value = `media:service/${name}`;
    if (row.image_url === value) {
      unchanged += 1;
      continue;
    }
    if (!options.dryRun) {
      await db.run(`UPDATE guidance_services SET image_url = $v WHERE id = $i`, { v: value, i: id });
      await forget(db, 'service', id);
    }
    linked.push(id);
  }
  return { linked, unchanged, unknown, unreadable };
}
