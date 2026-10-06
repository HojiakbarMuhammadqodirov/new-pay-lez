---
paths:
  - "src/site/auth/**"
  - "src/site/router.ts"
  - "src/site/Site.tsx"
  - "src/site/head.ts"
  - "src/site/signin.tsx"
  - "src/site/onboarding.tsx"
  - "src/site/profile.tsx"
  - "src/site/subscribe.tsx"
  - "src/site/ErrorBoundary.tsx"
  - "src/site/Header.tsx"
  - "src/site/api/client.ts"
  - "src/site/api/consumer.ts"
  - "src/main.tsx"
  - "scripts/*sitemap*"
  - "index.html"
---

# Sign-in, the session mirror, routing and the head

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

**The React site talks to it now, and `localStorage` is a mirror rather than a
directory.** Signing in, signing up and the Google exchange all go through
`api/consumer.ts`; `adoptSession` in `auth/AuthProvider.tsx` writes the row back
under **the server's own id**, never a locally minted one, which is what makes
the local store a copy of one directory rather than a second directory to
reconcile. The credential is the server's — a mirrored row carries
`password: 'server:<uuid>'`, a value nothing compares against, precisely so the
account cannot be entered from the password form by leaving the field blank.
Two things follow and both are load-bearing:

- **An operator is an operator because the server says so.** `admin` is not a
  `ChoosableType`, so the sign-up form cannot offer it; it arrives on `roles` in
  the session, which is `user_roles` on the server and nothing this browser can
  write. That is why the console no longer has a sign-in panel of its own — see
  the note under `#/admin` below.
- **The mirror runs both ways now, and it did not.** What stood here was "what
  the server does not model is still local" — the account type and the listing
  carried over from an existing local row and left blank when there was none, on
  the argument that somebody signing in on a new device is known to the server
  and unknown to that browser, "which is the true state". It was not the true
  state, it was a mirror with one direction: the server knew the account type,
  the listing, the seven profile answers and whether onboarding was done, and
  none of it was asked for. So an owner was asked "individual or business?" a
  second time and dropped on the setup form, a returning player was walked
  through the welcome round again, and the profile page was blank while the
  server held every answer on it. `auth/mirror.ts` folds those answers into the
  row; `AuthProvider` does the asking and calls it to decide what each one means
  for the account it already has. **Everything in that file is pure**, so
  `npm run verify` owns the rules rather than a browser does.
- **A picture the server holds is not always a picture this site may draw.**
  Every image the site makes itself is a `data:` URL, but the Base44 import
  brought venue logos over as `https://base44.app/…` addresses, and an `<img>`
  pointed at one is the third-party runtime request this whole front end is built
  to avoid. `auth/picture.ts` is the one-line judgement, and the handling is the
  part worth keeping: such a value is **kept and not drawn** — it still counts as
  answered, because the server says the listing has a logo and a readiness meter
  calling it missing would be calling the server wrong, and it still round-trips
  untouched, because a write only ever sends a picture that file approves. The
  disc shows the initial in its place.

Nothing here is authentication *by itself* — a password typed into the sign-up
form is still written to `localStorage` in plain text on the way past, and
`auth/users.ts` says so at the top. What has changed is that the server is now
the thing being asked.

**Who is signed in decides what exists, and the rule is one pure function.**
`resolveRoute(route, account)` in `router.ts` is the whole access policy: an
individual has no Business, Analytics, dashboard or setup; an owner with no listing
goes to setup; an admin's console *replaces* both partner routes and sign-in;
an account that has not answered the individual-or-business question is held at
sign-in. **Analytics is not a public page** — a signed-out visitor asking for it
goes to `landing`, not to `signin`, because the screen is a month of somebody's
takings and signing in does not get a *player* there either: it is not locked, it
is not theirs.

Two routes are easy to miss because nothing in the marketing nav links to them.
**`#/profile`** (`profile.tsx`) is the seven things a person tells us about
themselves — photo, username, status, city, email, phone, birthday — and it is
the same set the server's `updateProfile` writes, deliberately, because a form
that accepted what the server refuses works until the day the two halves are
wired together. It is the one private route an operator keeps: the console
replaces the partner screens because an admin has no venue, and it does not
replace their own name and city. **`#/welcome`** (`onboarding.tsx`) is the third
frame — language, an offer, five rounds of flags, the payoff — and `resolveRoute`
holds a new player *there from every route*, which is why it has no header: a nav
above a gate is a bar whose every link bounces straight back. Its questions come
through `games/bag.ts` out of the real 196-row flag bank, so they are translated
and they are five the player will not be asked again; the welcome gift is paid
for **finishing it**, not for opening an account.

**The first hundred points are two halves and the screen says so.** The gift is
`CONFIG.points.onboarding` (50) for turning up, and the round is
`welcomeRoundPerCorrect` (10) × five — so five right is 100, none right is 50,
and both numbers can be named because they are separate. Ten rather than the
quiz's one, and paid with **no sweep or speed bonus**, because this is the round
the welcome screen offered fifty points for and a total the offer did not name is
a total that contradicts it. The rate is not a rate a client can ask for:
`finishSession` decides it from the server's own secret **and** from this being
the player's first finished round.

Three things about that screen are load-bearing and easy to undo. The questions
are drawn from a **vetted easy set** (`WELCOME_FLAGS` on the server,
`EASY_FLAGS` on the client) rather than from the whole bank — the first thing a
new account is asked should not be a flag nobody knows, and the codes are
case-folded on the way in because the bank stores them lower-case and an
un-folded set matched **0 of 196**. **Skip opens the next question**, it does not
end the round: a player who cannot place one flag has four more chances at ten
points each, and skipping simply earns nothing. And an anonymous visitor who
asks for `#/welcome` goes to `landing`, not to `signin` — there is nothing to
sign into yet, and a gate that bounces a stranger to a password form is a gate
with the wrong door on it.

**The profile pays for being finished, and the meter moves while you type.**
`CONFIG.points.profileComplete` (50) lands once, and the front end draws the
prize *above* the form (`.prof-prize`) rather than as a line under it, because a
reward nobody notices changes nobody's behaviour. The meter is derived from the
**draft** — what is in the fields right now — so it rises as they are filled and
falls when one is cleared; a meter computed from the saved record is a meter that
only moves after the thing it is measuring has already happened. Completion
arrives as a notification pinned to the top of the screen (`.prof-won`), not as a
row that scrolls past. Note the three states the code has to distinguish, which
is why completeness is judged on the draft and payment is not: complete-and-paid,
complete-and-not-yet-paid (the moment between the save and the commit), and
incomplete-but-paid — a profile can be emptied after the fifty is banked, and the
fifty is not clawed back.

**An email is folded before it is compared, and both doors fold it the same
way.** `normalizeEmail` in `signin.tsx` is module-scope precisely so sign-up can
reach it: it used to live inside the sign-in form and sign-up had grown its own
copy that stripped zero-width characters and nothing else. Paste an address
carrying a stray tab or DEL — mobile autofill and a copy out of a spreadsheet
both do it — and sign-up stored one string while sign-in looked up another, so
the account existed and could not be signed into. Three passes in order: NFKC,
then the C0 range and DEL, then the zero-width joiners and the BOM. The control
range needs an `eslint-disable-next-line no-control-regex`; the rule is right in
general and wrong here, because a pasted address is exactly where a stray
control character comes from. Write the class with `\u` escapes rather than the
literal bytes — a real NUL in the source makes git call the file **binary**, and
every diff and blame of this screen comes back as `Bin 13614 -> 14880 bytes`
instead of a hunk.

**And `taken` counts on the offline path.** Sign-up defers "is this address
registered" to the server, which is right while there *is* a server; on the
`status === 0` fallback there is not, and the local directory stops being the
weaker answer — it is the only evidence there is. Without the check, signing up
with an address this browser already knew minted a *second* row: the ids carry a
timestamp so they never collide, and `findUser` then answers with whichever it
reaches first, which is a sign-in that lands on an account at random.

**And the account-type question has a way out of it.** `ChooseType` is the one
auth screen `resolveRoute` holds a session on from every route, so until it had
a Cancel there was no answer to "I do not want to decide this now" but closing
the tab. It signs out and asks for the landing page, which is safe *because* of
the `onboarding` rule above and the `analytics` one before it: a signed-out
account resolves `landing` to `landing`, so the guard agrees with the button
rather than replacing the hash over the top of it.

`Site` resolves the route *during render*, so a page this account may
not see never mounts for a frame, and corrects the address bar in an effect
afterwards.

Three things follow from that, and all three are easy to undo by accident:

- **Never call `navigate` from a handler that also changes the session.** The
  hash is set synchronously and React re-renders before `hashchange` fires, so
  the guard runs once against the *new* account and the *old* route and
  redirects over the top of you. Derive the destination in `resolveRoute`
  instead — that is why choosing an account type on the sign-in form does not
  navigate at all.
- **Every resolution must be a fixed point.** `resolveRoute(resolveRoute(r), a)`
  has to equal `resolveRoute(r, a)` or the correcting effect navigates in a
  loop and the tab hangs. `npm run verify` walks the whole account × route
  matrix checking exactly this; it has already caught one.
- **`account.business === null` means "has not been through setup".** Do not
  seed a blank listing when the account type is chosen, or a brand-new owner
  looks finished and lands on the dashboard.

**Every route has two forms: a hash to link with and a path to be at.**
`PATHS` is the link form and nothing about it changed — every `<a href="#/x">`
on the site still sets a hash. `URL_PATHS` is the address form, and it exists
because a hash is invisible to a search engine: Google strips everything from
`#` onwards before it fetches anything, so the fifteen routes were one indexable
page and a sitemap of `#/…` URLs would have been fifteen entries for the
homepage. `readRoute` reads a path on the way in, `normalizeAddress` writes one
into the bar on the way out, and nginx's SPA fallback — already there so a
refresh worked — answers them with no server change.

Six things about it are load-bearing, and four were bugs first:

- **Precedence is hash, then anchor, then path**, and each step is a fix for the
  one below it. A route hash wins **outright, unrecognised ones included**,
  because `ErrorBoundary`'s way out of a crashed screen is a literal
  `href="#/"` and falling through to the path would answer `dashboard` on the
  dashboard — the one button off a broken page pointing at the broken page. A
  section anchor comes next, because `ANCHOR_ROUTES` is how `#learn-games`
  followed from the landing page reaches L-Earn, and reading the path first
  answers `landing` for it and breaks every cross-page section link on the site.
- **`normalizeAddress` must strip exactly what `readRoute` claims.** It removes
  anything shaped like a route hash and keeps a section anchor, which is a place
  on the page and belongs in a URL somebody copies. Stripping only the *listed*
  hashes left `#/` in the bar as `/#/` — the right page under what looks like a
  typo.
- **`#top` is a route, not an anchor.** It is `PATHS.landing`, so it is in
  `ROUTE_HASHES`; without that entry "Home" pressed from L-Earn leaves
  `/l-earn#top` and the path goes on answering `learn`.
- **`useRoute` listens for `popstate` as well as `hashchange`.** Two normalised
  entries differ in their *path*, so traversing between them never touches the
  fragment and `hashchange` never fires — Back and Forward changed the URL and
  not the page. `ErrorBoundary` needs the same pair for the same reason.
- **`search` survives normalisation.** `?demo=1` is read on every render of the
  dashboard, and dropping it turns the flag off one navigation after it was set.
- **One cosmetic cost, taken knowingly.** Pressing the nav link for the page you
  are already on now pushes an entry that is immediately replaced with the path
  it already had, so one press of Back appears to do nothing. Undoing it means
  every `<a>` setting a path and cancelling its own default, which is the
  history router `router.ts` still declines.

**The head is per route, and the copy is in the dictionaries.** `head.ts` sets
the title, description, canonical, robots and Open Graph tags from `copy.seo`,
and `<html lang>` from the dictionary's own `code`. Four rules travel with it:

- **A title is a whole sentence, never a page name plus a suffix.** The brand
  does not sit on the same side of the words in every language, which is the
  same reason `fill()` exists rather than two half-strings.
- **`index.html` carries a static default set and `head.ts` overwrites it.** Not
  a duplicate: Google renders JavaScript and sees the route's tags, while every
  unfurler — Slack, Facebook, X — reads the HTML as served and runs nothing, so
  without the static pair a link to any page pastes as a bare URL. Keep the two
  in sync the way the pre-paint theme script is kept in sync with
  `ThemeProvider`.
- **The private routes are `noindex` and are *not* disallowed in `robots.txt`.**
  A crawler forbidden to fetch a page never reads the `noindex` on it, so the
  URL stays listable and the one instruction that would remove it is the one the
  block prevented it from seeing. `robots.txt` would also be publishing the
  console's address in a file written for everybody.
- **No `hreflang`.** It needs one URL per language and there is one URL per
  *page*, with the language chosen in the header and remembered per browser. The
  fix is a language segment in the path, not a tag pointing all five at the same
  address.

`SITE_ORIGIN` is `https://www.pay-lez.com`, and which host that is was a
finding rather than a preference: the apex still resolves to the retired Base44
deployment and answers **402**, and `new.pay-lez.com` serves the identical build
from the same nginx root. Two hosts with one site on them is duplicate content,
and the canonical tag is what says which to keep.

**A section anchor carries its own page.** A hash that does not start with `#/`
used to mean "the landing page", full stop — so *every in-page link on every
other page* went Home. "Open the dashboard" on Analytics pointed at
`#analytics-reports`, missed the route table, and dropped the visitor on the
marketing front page; the same was true of `#business-cta`, `#learn-games`,
`#vouchers-catalogue` and `#relocate-guide`. `ANCHOR_ROUTES` in `router.ts` maps
each page's section prefix to its route, and the landing page keeps the
unprefixed ones. **A new page must prefix its section ids with its own name and
add the prefix to that table**, or its own links will leave it; `npm run verify`
checks the table against `PATHS` and walks the known anchors.

And a matching rule for the labels: **a button goes where its words say.**
"Open the dashboard" opens `#/dashboard` (which resolves to sign-in for a
visitor, correctly); "Play & Earn" goes to L-Earn; "Talk to us" goes to Contact.
Several of these pointed at a section on the page they were already on, which is
what a page does when nobody has anywhere to send you yet.

The landing hero's **"How it works"** is the version of that which survived
longest, because it *did* scroll somewhere: `#guide`, the city carousel. A
visitor asking how the product works was dropped on a list of shop categories.
It goes to `#features` — "How paylez works / Play a little. Earn a lot." —
which is the section that answers the question. `#guide` keeps its other job as
the globe's scroll anchor in `Site.tsx`; the two are different things that
happen to share a name.

**Two storage keys, and they are different things.** `paylez-session` is who is
signed in *on this device*; `paylez-users` (`auth/directory.ts`) is every
account this browser has seen. The session is a pointer into that directory,
which is what makes the rest work: every change an account makes to itself is
written back to its row (`commit` in `AuthProvider`), so signing out and back in
restores a venue's listing. A stored session whose id is no longer in the
directory is dropped rather than honoured — that is what a session pointing at a
deleted account *is*. Both follow the `theme/` split (context in one file,
provider in another) and the same lazy-initialiser, wrapped-storage construction.

**The directory is a cache of the server's answer, not the record.** It stopped
being the record when auth moved to the API — see the section above — and the
practical consequence is which of the two you reach for: *who exists* is a
question for the server (`GET /v1/admin/users`, which the console's People tab
reads), and this store answers only *what this browser knows about them*. The
API token is a **third** key, `paylez-api-token` (`api/client.ts`) — a pointer
rather than a credential store, dropped the moment the server says it is no
longer valid. There is a **fourth**, `savedPairs.ts`: the currency pairs a reader
has pinned on Relocate, deliberately not on the server, because there is no
endpoint for it, the guide is readable with no account at all — which is that
page's whole pitch — and "the rates I check" is a per-device convenience rather
than a record. It exists because the card was already claiming it: the chips were
labelled "Saved pairs" and nothing was saved, which is the honesty rule the
partner dashboard states, failing quietly on a marketing page. Every read is
wrapped in `try`, because storage throws in a private window with cookies blocked
and a console that cannot open is worse than one that cannot remember. And a
**fifth**, `paylez-referral` (`auth/referral.ts`): the invite code from a
`/sign-in?ref=` link, kept for 30 days so it survives the visitor wandering off
before signing up, read into the sign-up form's code field, and dropped the
moment an account exists. `main.tsx` captures it before the first render and
takes `ref` out of the address bar, so a copied URL does not forward somebody
else's invite.

**A referral pays on the invited friend's first *counted* visit, and not at the
inviter's own till.** `gate.completeReferral` sits behind `visitCounted` like the
stamp and the deal claim, skips a bond whose inviter owns the venue or is the
cashier (the owner-farm), skips a suspended or deleted inviter, and *claims* the
bond with a guarded UPDATE before paying, so two simultaneous scans cannot both
pay. Codes are `PY` + four digits, and `social.codeFor` widens to six and then
eight digits as the space fills, so sign-up never runs out; digits because
somebody reads them aloud across a table. Sign-up never refuses a bad code — the web form checks it first with
`GET /v1/referrals/codes/:code` (a 404 is "no such code") — and an operator voids one with
`POST /v1/admin/referrals/:id/reject`, which reverses what it paid.

**The plan and its entitlements are session state, not a per-screen fetch.**
`AuthValue` carries `plan` and `entitlements`, filled by one `GET /v1/me` when
the session changes — the header pill, the profile card and the Play screen's
gauge all read the same answer, where three `useApi('/v1/me')` calls would be
three requests to one question. Both are **`null` while unknown**, and that is
load-bearing rather than lazy: signed out, still loading and *the server did not
answer* are all "do not draw a badge". Falling back to the free plan would label
a paying customer as free every time a request failed, which is the one error
here worth avoiding.

**`SubscribeButton` has three faces, and which one it wears is what the site can
honestly do next** (`subscribe.tsx`). Signed out it is a link to sign-in, because
checkout needs an account to attach a subscription to. On the plan somebody
already pays for it is a *word*, not a control. Otherwise it is a real press. It
writes nothing on the way out — the badge changes on the next load, after the
webhook, because a badge that flipped before the payment cleared would be a lie
for everybody who abandoned the page. **It is not on screen today**: its only
caller is the `Subscription` section in `sections.tsx`, which nothing renders,
because plans are granted from the console rather than sold (see `server.md`).

**Sign-up asks which kind of account it is; sign-in does not.** The question is
answered *before* the account exists, so nothing new is ever created in the
undecided state. `ChooseType` on the sign-in route still exists for the sessions
that predate that — `resolveRoute` sends `type === null` back there from every
route — and deleting it would sign those visitors out of a tab they never asked
to be signed out of.

- **A render error used to be a black page, and now it is a panel.** A
  `TypeError` thrown during render unmounts React's *entire* tree, leaving the
  document body — which on this site is `--bg`. That is exactly what one missing
  field on one response did to `#/dashboard`: no header, no message, nothing to
  press. `ErrorBoundary` wraps the three providers in `Site.tsx` (outermost, so
  it catches them too), prints the error text verbatim and offers a reload and a
  way home, and clears itself on `hashchange` so navigating away recovers without
  a reload. It is **not translated** on purpose — `LanguageProvider` is inside
  it, and a boundary that reaches for `useCopy()` to describe a broken render can
  throw while reporting a throw. Fixing the field is still the fix; this is what
  makes the next one legible instead of invisible.

