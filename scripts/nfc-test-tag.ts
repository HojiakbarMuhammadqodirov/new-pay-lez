/**
 * Paylez NFC tags: mint a tap URL, and print what a tag needs to be personalised.
 *
 *   node scripts/nfc-test-tag.ts --key <32 hex> --uid <14 hex> [--counter N] [--base URL]
 *
 * `--key` is `PAYLEZ_NFC_KEY` (the master key). `--uid` is a 7-byte tag UID —
 * a real tag's (NXP TagInfo shows it) or any made-up one for a test. Prints:
 *
 *   1. the URL a genuine NTAG 424 DNA with that UID would produce at that
 *      counter. Write it to any NDEF sticker (NTAG213 is fine) with an app such
 *      as NFC Tools, and that sticker is a **one-shot** test tag: the first tap
 *      opens a gate, every later tap is a replay, exactly as a copied URL is;
 *   2. the two keys and the SDM offsets a real NTAG 424 DNA must be given so
 *      that it produces URLs like that by itself on every tap (`NFC.md` §2);
 *   3. the admin calls that import and assign the tag.
 *
 * The cryptography is the server's own (`server/crypto/nfc.ts`), imported
 * rather than copied, so this cannot drift from what `/v1/gate/tap` verifies.
 */
import { deriveKey, mintTap, verifyTap } from '../server/crypto/nfc.ts';

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

const keyHex = arg('key') ?? process.env.PAYLEZ_NFC_KEY ?? '';
const uid = (arg('uid') ?? '').toUpperCase();
const counter = Number(arg('counter') ?? '1');
const base = arg('base') ?? 'https://www.pay-lez.com/t';

if (!/^[0-9a-fA-F]{32}$/.test(keyHex) || !/^[0-9A-F]{14}$/.test(uid) || !Number.isInteger(counter) || counter < 0 || counter > 0xffffff) {
  console.error('usage: node scripts/nfc-test-tag.ts --key <32 hex chars> --uid <14 hex chars> [--counter 0..16777215] [--base URL]');
  console.error('       (--key may come from PAYLEZ_NFC_KEY instead)');
  process.exit(2);
}

const master = Buffer.from(keyHex, 'hex');
const { piccHex, cmacHex } = mintTap(master, uid, counter);
const url = `${base}?picc_data=${piccHex}&cmac=${cmacHex}`;
const check = verifyTap(master, piccHex, cmacHex);
if (!check.ok) throw new Error(`self-check failed: ${check.reason}`);

/* SDM offsets are counted from the start of the NDEF file: NLEN (2 bytes),
   then a short URI record — header D1, type length 01, payload length, type
   'U', and the URI identifier code (04 = "https://") — so the text after
   "https://" starts at byte 7. */
const template = `${base}?picc_data=${'0'.repeat(32)}&cmac=${'0'.repeat(16)}`;
const body = template.replace(/^https:\/\//, '');
const piccOffset = 7 + body.indexOf('picc_data=') + 'picc_data='.length;
const macOffset = 7 + body.indexOf('cmac=') + 'cmac='.length;
const hex3 = (n: number) => n.toString(16).toUpperCase().padStart(6, '0');

console.log(`
Tap URL (UID ${uid}, counter ${counter}) — write this to a test sticker:

  ${url}

To personalise a real NTAG 424 DNA with this UID (NFC.md §2):

  URL template (NDEF file 02)  ${template}
  SDM meta read key (PICC)     ${keyHex.toUpperCase()}   ← the master key, the same on every tag
  SDM file read key (MAC)      ${deriveKey(master, Buffer.from(uid, 'hex')).toString('hex').toUpperCase()}   ← this tag only
  PICC data offset             ${piccOffset} (0x${hex3(piccOffset)})   UID mirror on, counter mirror on, encrypted
  SDM MAC input offset         ${macOffset} (0x${hex3(macOffset)})   = MAC offset, so the MAC covers no file data
  SDM MAC offset               ${macOffset} (0x${hex3(macOffset)})
  Change the factory key 0 (app master key) afterwards and keep it offline.

Register it (an admin session; the server needs the same PAYLEZ_NFC_KEY):

  POST /v1/admin/tags              {"uids": ["${uid}"], "batch": "test"}
  POST /v1/admin/tags/${uid}/assign  {"venueId": "<ven_…>", "label": "Counter"}
`);
