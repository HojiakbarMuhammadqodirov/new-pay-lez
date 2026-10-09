# Paylez NFC tags

A Paylez tag is a sticker at a venue's counter. A customer holds their phone to
it, and the app opens the same amount gate a scanned QR opens (§3): PENDING →
amount → the cashier confirms → points. The tap is only the *trigger*; it
grants nothing by itself, and every economy rule after it is the gate's.

## 1. What a tag is, and what to buy

**NXP NTAG 424 DNA** (not NTAG 213/215/216). It is the only common tag that
writes a fresh, signed URL on every tap ("SUN" / Secure Dynamic Messaging), which
is what makes a photographed or copied URL useless: its counter has already
been seen.

- Buy NTAG 424 DNA stickers or coins (on-metal versions for metal counters).
  Ask the vendor whether they can personalise with your keys and the URL
  template below; most NFC shops (e.g. Identiv, Smartrac/Avery Dennison, ZipNFC,
  NFC.Today) offer SUN encoding as a service. Otherwise personalise them
  yourself with **NXP TagXplorer** (desktop + USB reader such as an ACR1252U)
  or **NXP TagWriter** (Android).
- Cheap NTAG 213 stickers are only good for **one-shot test tags** (§4).

## 2. The tag format

The NDEF file holds one URI record, with the SDM mirrors switched on:

```
https://www.pay-lez.com/t?picc_data=<32 hex>&cmac=<16 hex>
```

| what | value |
|---|---|
| PICC data (`picc_data`) | AES-128-CBC (zero IV) of `C7 ‖ UID(7) ‖ counter(3, LSB first) ‖ padding`, under the **SDM meta read key = the master key** (`PAYLEZ_NFC_KEY`). UID mirror on, read-counter mirror on. |
| MAC (`cmac`) | AN12196 SDM MAC: session key `CMAC(K_file, 3CC3 0001 0080 ‖ UID ‖ counter)`, MAC over the empty input (MAC input offset = MAC offset), truncated to the odd bytes. |
| SDM file read key (`K_file`) | **per tag**: `CMAC(master, 01 ‖ UID)` — one tag pulled apart on a bench exposes nothing but itself. |
| Offsets (for the template above) | PICC data at **35**, MAC input and MAC at **73**. |

`server/crypto/nfc.ts` is the implementation and the only place to change if a
vendor personalises differently (`deriveKey` is alone for that reason). The
tag never stores a venue id: the server resolves UID → venue in
`tag_registry`, so a tag is reassigned or revoked without touching it.

## 3. Provisioning a tag, step by step

1. **Master key, once.** `openssl rand -hex 16` → `PAYLEZ_NFC_KEY` on the
   server (and in the password manager; losing it means re-personalising every
   tag). Never put it in the app or on the website.
2. **Per tag:** read its UID (TagInfo / TagXplorer), then
   `node scripts/nfc-test-tag.ts --key <master> --uid <UID>` prints the URL
   template, both keys and the offsets. Personalise the tag with them, then
   change its factory app master key (key 0) and keep that offline.
3. **Register and assign** (admin session):
   - `POST /v1/admin/tags {"uids": ["04…"], "batch": "2026-10 run"}`
   - `POST /v1/admin/tags/04…/assign {"venueId": "ven_…", "label": "Counter"}`
4. Tap it with the app. The first tap may present counter 0; that is accepted
   once (`last_tap_at IS NULL`).
5. Lost or stolen: `POST /v1/admin/tags/04…/revoke`. Instant.

## 4. A test tag without NTAG 424 hardware

```
node scripts/nfc-test-tag.ts --key <PAYLEZ_NFC_KEY> --uid 04A1B2C3D4E5F6 --counter 1
```

Write the printed URL to any NDEF sticker with an app such as NFC Tools,
register and assign the UID as above. The first tap opens a gate; every later
tap is (correctly) refused as a replay. Mint `--counter 2`, `3`, … to rewrite it.

## 5. API

| route | who | what |
|---|---|---|
| `POST /v1/gate/tap {picc, cmac, intent?, intentRef?, dealId?, clientTs?}` | signed-in user | Verifies the MAC, the registry and the counter, opens a PENDING transaction (`trigger_type: 'nfc'`, `trigger_ref: 'nfc:<UID>'`). Idempotent with `Idempotency-Key`. |
| `GET /v1/gate/tags/resolve?picc_data=&cmac=` | public, 120/h per connection | For the website's `/t` page: `{venueId, venueName, label}` after checking the MAC. **Does not burn the counter.** |
| `GET /v1/venues/:id/nfc-tags` | owner, manager | The venue's tags: `uid, status, label, assigned_at, last_tap_at`. |
| `POST /v1/admin/tags`, `…/:uid/assign`, `…/:uid/revoke`, `GET /v1/admin/tags` | admin | Import, assign (now with `label`), revoke, list. |

Refusals of `/tap`:

| code | status | when |
|---|---|---|
| `invalid_trigger` | 422 | malformed, forged MAC, wrong key, unassigned or revoked tag; also "NFC is not configured" when `PAYLEZ_NFC_KEY` is unset |
| `not_found` | 404 | a genuine MAC from a UID that is not in the registry |
| `replay_detected` | 422 | counter ≤ the last accepted one (a fraud case `replay` is filed) |
| `rate_limited` | 429 | more than `NFC_TAPS_PER_TAG_PER_DAY` (6) taps of one tag by one account in a rolling day, or `NFC_TAPS_PER_HOUR` (20) taps per account per hour |
| `conflict` | 409 | a gate is already open at that venue; the app resumes it |

Checks run in this order, so a refused tap never burns the counter: MAC →
registry → per-tag ceiling → counter (`UPDATE … WHERE last_counter < $c`, a
conditional write, race-safe). The visit itself — one counted visit per venue
per cooldown, minimum spend, points — is decided at confirm, exactly as for a QR.

## 6. Schema

`tag_registry` gained `label TEXT` and `last_tap_at TEXT`, in `schema.sql`,
`schema.pg.sql`, and as boot-time `addColumn`s in `db/db.ts` and `db/pg.ts`.

## 7. The app

`lib/utils/nfc_tags.dart` (strict URL parser, `TagLinks`, `NfcReader`),
`android/…/NfcChannel.kt` (reader mode while the Scan tab is open),
`AppDelegate.swift` (`NFCNDEFReaderSession`, per press). A tag tapped while the
app is closed or on another screen opens it through the manifest's
`NDEF_DISCOVERED` filter for `https://www.pay-lez.com/t` (no App Links file
needed). iOS needs the "NFC Tag Reading" capability on the App ID; its
background tag reading opens the URL in Safari until Associated Domains exist.

**Website (not built):** `https://www.pay-lez.com/t` needs a page — today the
site has no `/t` route at all. It should call
`/v1/gate/tags/resolve`, name the venue, and offer "Open in the app"
(`paylez://app/t?picc_data=…&cmac=…`, which the app accepts) and the store
links. It must not post `/tap` itself.

Tests: `node server/verify-nfc.ts` (29 checks); the crypto vectors are in
`verify.ts`'s `crypto()`.
