---
paths:
  - "src/site/relocate.tsx"
  - "src/site/api/guide.ts"
  - "src/site/savedPairs.ts"
  - "server/domain/media.ts"
---

# Relocate and the guide directory

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

**The last seed directory was Relocate's, and it is gone too.**
`RELOCATE_PROVIDERS` in `content.ts` was twenty-four invented businesses on a
page that promises somebody three weeks into a new country somewhere to actually
go, and two of the names were real businesses that had never heard of us. The
section reads `GET /v1/guide/categories` and `GET /v1/guide/services` now
(`api/guide.ts`, split from `api/consumer.ts` because both are `auth: 'none'` and
mixing them with calls that need a session hides which is which). What is *not*
in the new cards is as much of the point: the seed rows carried a `languages`
field — "somebody here speaks Ukrainian", the single most useful thing on the
card — and `guidance_services` has no such column, so the card no longer claims
it. Inventing the one attribute the real data lacks is how the directory got
fictional in the first place.

**A logo is a path on the API, and a path is joined to the API's address.**
`media.logoPath` turns whatever a logo column holds — a file on this server's
disk (`media:service/<id>.webp`, the one format the directory stores now:
256×256 WebP, ≤ 60 kB), an inline `data:` picture, or a Base44 address — into
`/v1/media/<entity>/<id>?v=<hash>`. Two bugs hid every logo and both are rules
now: the site must load it through `mediaUrl()` (`api/client.ts`), because a
bare path resolves against `www`, where nginx answers `index.html`; and the
server reads an image's type **from its bytes** (`media.sniff`), because Base44
labels every file `application/octet-stream`. `npm run logos:export` and
`npm run logos:link` move the existing logos onto the disk (DEPLOY.md).

**And a listing is a card that opens, because the row always held more than the
list drew.** An expanded subject was a `<ul>` of `<li>`s showing a name, an
address and a blurb — which was exactly what `GuideService` in `api/guide.ts`
declared a row to have. `guidance_services` has carried the rating, the review
count, the price band, the subcategories and the voucher flag the whole time,
and the route has been selecting them the whole time; **a missing field on an
interface is invisible in a way a missing column is not.** The rows are
`.gs-card` buttons now — the whole card is the target, the Play grid's rule —
and one opens `.gs-panel` with everything the row carries.

Four rules travel with it:

- **Every block in the panel is conditional on its own field.** No description,
  no About; no `price_range`, no Pricing; nothing to reach the place by, no
  Contact. A heading over an em dash promises something the row does not hold,
  which is the failure this directory has already had once.
- **`price_range` is the one figure on the site that does not go through
  `useMoney`.** It is what a Kraków restaurant charges, in złoty, for everybody
  who walks in — the reader's currency is the rule for *our* prices, and
  converting a venue's own band would quote somebody a price they cannot pay.
- **There is no photograph.** `image_url` is an external URL and nothing in
  `src/` makes a third-party runtime request, so the card draws the name's
  initial on the accent, exactly as the wallet's brands do. The column stays off
  the interface for that reason rather than being fetched and hidden.
- **No Translate control**, which the design asked for: `copyOf` in
  `routes/guidance.ts` already returns this copy in the reader's language with
  English filling any hole, so the button would either do nothing or claim a
  second translation nothing performs. A control with nothing honest behind it
  is not drawn.

`email` joined the services select at the same time — the column was always
there and nothing read it, so a listing with an address and no phone could not
be reached at all. Additive, so no client breaks; `npm run openapi` was rerun.
The panel is **modal**, unlike the assistant dock, and for the opposite reason:
the dock is consulted *while* reading, and this is the page's own row opened.

