---
paths:
  - "src/site/wallet.tsx"
  - "src/site/vouchers.tsx"
  - "src/site/venueSheet.tsx"
---

# The wallet

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

**Everything on the wallet page is the server's.** It was not: the board was
nine hot deals in `content.ts`, the catalogue eight gift cards in the same file,
and the three holdings were arrays inside a `localStorage` record — claiming a
deal minted a code in this browser, buying a voucher subtracted from a number in
this browser, and "Add a visit" stamped a card nobody had visited. It is four
calls now, and every row is real: `GET /v1/deals` (the board), `GET /v1/wallet`
(the holdings), `GET /v1/gift-cards` (the shelf) and `POST /v1/gift-cards`, the
one press that moves value.

**The wallet holds three things, and they are three because their rules
differ.** A *discount voucher* is points already spent at one venue — a code and
a percentage, honoured at that venue's till. A *gift card* is stock: a fixed face
value at a named brand, bought with points off the shelf. A *stamp card* counts
**visits to one venue**, and a visit is not a point — it cannot be spent anywhere
else, and a full card **rolls over into the next one** rather than overflowing,
which is what `cycles` counts. Collapsing any two of them loses the rule that
tells them apart, and each of those rules is one a player would otherwise learn
by being wrong at a counter.

**A venue opens, and it is the one place a player can *act* on one.**
`venueSheet.tsx` is `GET /v1/venues/:id` behind the wallet's cards. The wallet
knew a venue only as a name: a deal said who was offering it, a stamp card said
where the visits counted, and a voucher said nothing at all — the row is a
`venue_id` and a code. None of them answered the question somebody standing
outside a café actually has, which is *what do my points get me here*. The sheet
answers it, and two of its rules are the ones to keep:

- **Every block is conditional on its own field**, the same rule the Relocate
  card states — a heading over an em dash promises something the row does not
  hold.
- **Consent is the player's, on the sheet.** Deciding whether a venue may know
  who you are belongs next to the thing it is about, not in a settings page two
  routes away. It is the other press on the sheet besides buying a voucher off
  the ladder, and it is why this is a sheet rather than a card that expands.

It portals itself out of the wallet's tree, so read the note in `wallet.tsx`
before moving it.

**The claim button is a disclosure, not a claim, and that is the load-bearing
change.** `POST /v1/deals/:id/events` accepts `impression` and `open` and nothing
else: a **claim is written by the gate**, from a confirmed scan at the venue,
deliberately — a claim a phone could mint is worth nothing to the venue paying
for it and is a figure the partner dashboard could not argue from. So there is
nothing for a claim button to post. Pressing it opens the offer's **terms**
(which the server sends with every deal and nothing was showing) and says where
the claim actually happens — at the counter, on the venue's scan — and posts
`open`, a real funnel step. Deleting the button instead was the other honest
option and it takes the card's only affordance with it; a board of offers where
nothing is pressable reads as broken rather than as read-only.

The claim *animation* went with the claim. A ring, a sheen and a code landing
where the button was were celebrating an event that no longer happens — as did
`CLAIM_HOLD_MS`, `openDeals`, `DEAL_CATEGORIES` and the "Open now" pill computed
on the venue's own clock. **Do not reintroduce any of them without an endpoint
underneath**; that is the same honesty rule the partner dashboard states.

**An empty catalogue is a state, and a dead server is a different one.** After
the purge there are genuinely no deals and no gift cards until a business signs
up, is verified and publishes, so "nothing here yet" is the *ordinary* reading
and says so in its own words, while "we could not ask" says that instead. That is
what `useApi`'s `loading | ready | error` union is for, and it is the rule the
console states at length one file over.

The card carries no photograph, because nothing in `src/` ships an image asset
and a CDN placeholder would be the third-party runtime request the whole front
end is built to avoid. `WAL_TEXTURES` cycles a pattern per band instead — see
the `[data-texture]` rule above — and a brand's mark is its initial on the
accent.

