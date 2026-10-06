---
paths:
  - "src/site/i18n/**"
  - "src/site/legal/**"
  - "src/site/legal.tsx"
  - "scripts/*legal*"
---

# Legal texts, currency and exchange rates

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

**The two legal documents are translated, the English still binds, and each
language is its own chunk.** `legal.tsx` is the shell; the text is
`legal/<code>.tsx`, one module per language, built from the shared `Meta`,
`Notice`, `Section` and `Table` in `legal/parts.tsx` and fetched by
`legal/load.ts` for the language being read. Four rules travel with it:

- **`en.tsx` is authoritative.** Edit a clause there and the other four are stale
  until they are edited too. `copy.legal.english` says so on the page, in the
  reader's own language — and English's own copy of that key says the opposite
  thing, because telling somebody reading the English that the English prevails
  is nonsense.
- **The section ids are never translated.** They are the anchors `ANCHOR_ROUTES`
  files under `privacy` / `terms`, and an id that misses that table resolves to
  `landing` — dropping a reader onto marketing copy from the middle of a clause.
  They are also what keeps a reader's place when they switch language mid-document.
- **The head is outside the `Suspense` boundary and the text is inside it.** The
  title, the version and the prevailing-language line are dictionary copy and
  need no fetch, so a cold load of `#/privacy` shows *which document you are on*
  while the chunk arrives instead of a blank page. `setLanguage` is a transition
  for the same reason: switching language holds the document rather than blanking
  it.
- **`npm run verify` checks the five agree.** `LegalText` catches a missing
  *field* and says nothing about the ids inside the two arrays, which is exactly
  where a typo would be invisible — in one language, to anybody who does not read
  it. The check walks `LANGUAGE_ORDER` and the real `LOADERS` table rather than a
  list of its own.

**The currency is its own setting, the language supplies its default, and every
amount is written in euros.** The language used to *be* the currency —
`CURRENCIES[language]`, so English priced the site in pounds and Polish in
złoty — and they were never the same question: a Russian speaker in Kraków is
paid in złoty and an English speaker may be in Tashkent, so a visitor who wanted
prices in their own money had to read the site in a language they may not speak.
There are two menus in the header now (`LanguageMenu` and `CurrencyMenu`, one
`useMenu` between them) and two `localStorage` keys, `paylez-language` and
`paylez-currency`. `CURRENCY_FOR_LANGUAGE` is still the **default**, because the
language is the one thing a visitor tells us before they tell us anything else
and a first visit should not have to choose twice; once the currency has been
chosen it stops following. Amounts live as euros in `content.ts` (and in the
euro figures behind the dictionaries) and are converted on the way out by
`useMoney` / `useMoneyParts`; a currency symbol typed into a component or a
dictionary is the bug this arrangement exists to prevent.

**The switcher offers seven, and two of them are nobody's default.** `EUR` and
`USD` sit after the five a language picks, in that order, because a currency no
language selects is exactly the one somebody has to reach for by hand: a reader
in Tashkent quoted in soum may still think in dollars, and the euro is the unit
every amount in this repository is written in, so choosing it converts nothing at
all. Both were already in `fx.ts` with a rate and a symbol and already have names
in all five dictionaries — `relocate.rates.names` is keyed by `FxCode` and covers
the whole nineteen — so an eighth is a row in `CURRENCIES`, a code in
`CURRENCY_ORDER` and a `step`, and nothing else.

**And separating them broke a rule that had been true by accident, in five
places.** `fx.ts` has always said digit grouping belongs to the *reader* and the
symbol to the money — and while `CURRENCIES` was keyed by language, a currency's
own `group` simply *was* the reader's separator. It is not any more, so the rule
needs a table of its own: **`GROUP_FOR_LANGUAGE`, read through
`useGroupSeparator()`, and nothing may group by `currency.group` again.** Every
site that did was a screen writing two number formats on one row — a Polish
reader who chose pounds got counts separated with commas beside prices separated
with a narrow no-break space. `useNum`, `useVenueMoney`, the Business page's
tile row and the console's five figure sites were all fixed together, and
`npm run verify` now reads those files' source and bans the token, because the
mistake is a `.group` off the wrong object rather than a wrong answer from a
pure function. A **hard-coded** separator is the other half of it: the console
wrote `data-group=" "` for everybody, a plain space where English wants a comma,
and a plain one lets a number break across two lines between its own digits. Copy
that quotes a figure carries a `{amount}` hole and is finished with `fill()` —
not two half-sentences, because the words either side of a price do not sit in
the same order in every language. Prices snap to a step the currency actually
uses and estimates snap to two significant figures, both in `currency.ts`: a
price tag reading £126.65 is an exchange rate, and nobody chose it.

There is a fourth rounding mode for the case that rule destroys. `unit` keeps
the currency's own minor units (`decimals`, read from `fx.ts` like the rate) and
is for a per-something cost: a cost per claim, per visit or per new customer is
a pound or two at most, and `exact` rounds all three of them to "£1" — which is
what the partner dashboard's "where your money works" panel showed before it
existed, three different figures written identically. It is 0 decimals where the
currency has no minor unit, so a soum never grows a fractional part.

**Every rate in the building comes from `i18n/fx.ts`.** That is the nineteen
currencies the Relocate converter offers, each as units per one euro, from the
rate sheet handed over for it — and the five in `currency.ts` read their `rate`
from it rather than carrying their own. One anchor, so a cross rate is
`to.rate / from.rate` and is exact for all 342 pairs; one table, so the
converter and the price tag two pages over cannot quote different pounds. Two
things live *outside* it on purpose: digit grouping, which belongs to the
reader's language and not to the currency being written (`CURRENCIES[language].group`),
and the currency *names*, which are dictionary copy keyed by ISO code — indexed
with `FxCode`, so a currency added to the table without all five names is a
build error.

