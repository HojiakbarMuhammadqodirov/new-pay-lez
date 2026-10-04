/**
 * `npm run logos:export` — the directory's existing logos, as 256×256 WebP files.
 *
 * Reads every service from the API (`/v1/guide/services`), fetches each one's
 * logo **from the API itself** (`/v1/media/service/:id` — the same bytes the
 * site shows, whether the column held a Base44 address or an inline picture),
 * and converts it with ffmpeg into the one format the directory now stores:
 *
 *   - square, 256×256, the picture fitted inside and centred on transparency
 *     (nothing is cropped off a logo);
 *   - WebP, at the highest quality that still comes in at or under 60 kB.
 *
 * Writes `<out>/service/<service id>.webp` and `<out>/manifest.json`. Nothing is
 * uploaded and nothing is written to a database — copying the folder to the
 * server and running `npm run logos:link` there are the next two steps (see
 * DEPLOY.md). It makes no new logos: a service with no logo is listed in the
 * manifest as `none` and keeps its letter.
 *
 *   npm run logos:export -- --api https://api.pay-lez.com --out logos-out
 *
 * Needs `ffmpeg` on the PATH (it is not a dependency of this repo: the
 * conversion runs once, on a workstation, never on the server).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const option = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};

const API = option('api', 'https://api.pay-lez.com').replace(/\/$/, '');
const OUT = resolve(option('out', 'logos-out'));
const COUNTRIES = option('countries', 'PL,UZ').split(',');
const SIZE = 256;
const MAX_BYTES = 60 * 1024;
const QUALITIES = [85, 75, 65, 55, 45, 35];

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('logos:export needs ffmpeg on the PATH.');
  process.exit(1);
}

mkdirSync(join(OUT, 'service'), { recursive: true });
const work = join(tmpdir(), `paylez-logos-${process.pid}`);
mkdirSync(work, { recursive: true });

/* Fit inside the square without cropping, centre it on transparency. */
const filter =
  `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,format=rgba,` +
  `pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`;

const manifest = [];
let done = 0;
for (const country of COUNTRIES) {
  const response = await fetch(`${API}/v1/guide/services?country=${encodeURIComponent(country)}&limit=500`);
  if (!response.ok) {
    console.error(`could not list ${country}: HTTP ${response.status}`);
    continue;
  }
  for (const service of await response.json()) {
    const entry = { id: service.id, name: service.name, country, status: 'none', bytes: 0, quality: null };
    manifest.push(entry);
    if (!service.logo) continue;
    const source = service.logo.startsWith('data:') ? null : `${API}${service.logo}`;
    let body;
    try {
      if (source) {
        const image = await fetch(source, { signal: AbortSignal.timeout(15_000) });
        if (!image.ok) {
          entry.status = `source HTTP ${image.status}`;
          continue;
        }
        body = Buffer.from(await image.arrayBuffer());
      } else {
        body = Buffer.from(service.logo.slice(service.logo.indexOf(',') + 1), 'base64');
      }
    } catch (error) {
      entry.status = `source ${error.message}`;
      continue;
    }
    const input = join(work, `${service.id}.src`);
    writeFileSync(input, body);
    const output = join(OUT, 'service', `${service.id}.webp`);
    let written = false;
    for (const quality of QUALITIES) {
      try {
        execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', input, '-vf', filter, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(quality), output], { stdio: 'pipe' });
      } catch (error) {
        entry.status = `ffmpeg: ${String(error.stderr ?? error.message).trim().split('\n').pop()}`;
        break;
      }
      const size = readFileSync(output).byteLength;
      if (size <= MAX_BYTES) {
        Object.assign(entry, { status: 'ok', bytes: size, quality });
        written = true;
        break;
      }
    }
    if (!written && entry.status === 'none') entry.status = 'over 60 kB at every quality';
    if (!written) rmSync(output, { force: true });
    else done += 1;
  }
}

rmSync(work, { recursive: true, force: true });
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
const failed = manifest.filter((entry) => entry.status !== 'ok' && entry.status !== 'none');
console.log(`logos:export: ${done} written to ${join(OUT, 'service')}`);
console.log(`no logo (keeps its letter): ${manifest.filter((entry) => entry.status === 'none').length}`);
if (failed.length) {
  console.log(`could not convert ${failed.length}:`);
  for (const entry of failed) console.log(`  ${entry.id}  ${entry.name}  — ${entry.status}`);
}
