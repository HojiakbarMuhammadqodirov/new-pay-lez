/**
 * Self-hosts the Twemoji country-flag font.
 *
 * Chromium on Windows ships no glyphs for regional-indicator pairs, so 🇺🇸
 * renders as the letters "US". `country-flag-emoji-polyfill` bundles a subset
 * font that fixes this; we copy it into `public/` rather than loading it from a
 * CDN so the hero has zero third-party runtime requests.
 *
 * Run automatically by `npm run dev` and `npm run build`.
 */
import { copyFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  [
    'node_modules/country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2',
    'public/fonts/TwemojiCountryFlags.woff2',
  ],
  ['node_modules/country-flag-emoji-polyfill/LICENSE.md', 'public/fonts/LICENSE.md'],
];

for (const [from, to] of SOURCES) {
  const src = resolve(root, from);
  const dest = resolve(root, to);
  try {
    await access(src);
  } catch {
    console.warn(`[flag-font] missing ${from} — skipping`);
    continue;
  }
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`[flag-font] ${to}`);
}
