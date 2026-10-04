/**
 * `npm run logos:link` — point the directory's services at their logo files on
 * this server's disk.
 *
 * Run on the box the files are on, after they have been copied into
 * `<PAYLEZ_MEDIA_DIR>/service/` named `<service id>.webp` (which is what
 * `npm run logos:export` writes). It sets each matching service's `image_url`
 * to `media:service/<file>`; `GET /v1/media/service/:id` then serves the file.
 *
 *   npm run logos:link -- --dry-run      what it would do, writing nothing
 *   npm run logos:link -- --yes          do it (production needs --yes)
 *
 * Opens the database exactly as the server does (`PAYLEZ_PG_URL`, else
 * `PAYLEZ_DB`) through the demo scripts' helpers, so it cannot write somewhere
 * the server is not reading.
 */
import { CONFIG } from './config.ts';
import { linkServiceFiles } from './domain/media.ts';
import { confirmTarget, describeTarget, flag, openTarget, Refusal } from './demo/shared.ts';

async function main(): Promise<void> {
  const dryRun = flag('dry-run');
  const target = describeTarget();
  console.log(`logos:link: files in ${CONFIG.media.dir}/service`);
  if (!dryRun) confirmTarget(target, 'logos:link');
  else console.log(`logos:link: database ${target.label} (dry run — nothing is written)`);
  const db = await openTarget(target);
  try {
    const result = await linkServiceFiles(db, { dryRun });
    console.log(`${dryRun ? 'would link' : 'linked'}: ${result.linked.length}`);
    console.log(`already linked: ${result.unchanged}`);
    if (result.unknown.length) console.log(`no service with that id (skipped): ${result.unknown.join(', ')}`);
    if (result.unreadable.length) console.log(`not a picture, or too large (skipped): ${result.unreadable.join(', ')}`);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Refusal ? `logos:link: ${error.message}` : error);
  process.exit(1);
});
