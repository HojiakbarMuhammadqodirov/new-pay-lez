# Claude Code prompt — build the Paylez Partner Dashboard "Overview" page

Copy everything below the line into Claude Code.

---

Build the **Overview** page for the Paylez Partner Dashboard — the web app venue owners (cafés, salons, shops in Poland) use to see what the Paylez loyalty platform did for them. This is the default landing screen after sign-in. Build it as a real, responsive page against our existing stack; if a design system / component library is already in the repo, use it — do not invent new tokens.

## What this page is for
One honest answer to "was Paylez worth it?" The tone is plain and matter-of-fact — no hype, no invented precision. We clearly separate **what we counted** (hard facts: QR scans, redemptions) from **what we estimate** (labelled ESTIMATE) from **what we can fairly claim** (conservative attribution). Never dress an estimate up as a fact.

## Brand & style
- Font: **Plus Jakarta Sans** (400/500/600/700/800), system-ui fallback.
- Page background `#F6F8F7`. Body ink `#0B1512`.
- Palette: ink `#0B1512`, ink-2 `#16302A`, deep green `#0B7F63`, mint `#5FE9C4`, muted text `#6B7772`, faint `#9AA5A0`, hairline `#E6E9E8`, soft line `#EEF1F0`, down/negative `#B4553F`, warn `#8A6D2F`, amber `#D6A05A`.
- Cards: white, `1px solid #E6E9E8`, radius 16px, generous padding (~24px).
- One dark hero card uses ink background `#0B1512` with mint accents.
- Primary buttons: ink `#0B1512` bg, mint `#5FE9C4` text, radius ~11px, hover `#16302A`. Secondary: white bg, hairline border, muted text, hover border+text deep green.
- Numbers use `font-variant-numeric: tabular-nums`. Tight heading tracking (~-0.03em). Sentence case everywhere; copy must stay short and translation-safe (app ships in ~6 languages).

## Page layout (single column, max content width ~1040px, gap ~16–18px between sections)
Render sections top-to-bottom in this order:

1. **Low-budget banner (conditional)** — amber-accented row, only when loyalty budget is running low. Warning icon + one line of copy + a "Open loyalty budget" button (routes to the Campaigns/budget page).

2. **Hero: "What Paylez did for you · {range label}"** (dark ink card, two columns that wrap):
   - Left column — a "COUNTED" eyebrow, then the big number: **visits through Paylez** (~52px, white) with a sub-line "N of them were customers new to your venue" (N in mint).
   - Then an **ESTIMATE** block (dashed border): "about {money} in sales" + a one-line caveat explaining it's derived from average spend, not measured.
   - Then a **"WHAT WE CAN FAIRLY CLAIM"** block (mint-tinted): conservative attributed visits + money + a one-line note on the attribution method.
   - Right column — a stacked list of 3 support rows (label / value / small note), e.g. redemptions, repeat visits, etc.

3. **"What Paylez cost you · {month}"** (white card, two columns):
   - Left: itemized cost rows (platform fee, campaign spend, voucher spend, deal cost…) with a bordered **Total** at the bottom.
   - Right: "Sales we can tie back to Paylez" big money figure, plus a one-line ROI verdict.

4. **Metric grid** — responsive `auto-fit, minmax(232px, 1fr)` cards: Visits, Deals claimed, Vouchers used, Rewards used. Each shows label, big value, a delta pill (green up / red down) with "vs previous period", and a small inline sparkline.

5. **"The one thing we can prove"** (white card) — headline stat: customers in loyalty campaigns visit **N times a month, up from M** before joining, with a tiny two-bar before/after visual (before = grey bar, now = mint→green gradient taller bar).

6. **"Visits and voucher redemptions"** (white card) — a line/area chart over the selected range with a two-item legend (Visits = deep green, Vouchers redeemed = ink). Use whatever chart lib the repo already uses; otherwise a lightweight inline SVG chart is fine.

7. **"Money you are holding"** (white card, row) — outstanding voucher liability sentence + explanatory note + a "Remind them" button (bell icon).

8. **"What we noticed" (conditional)** — insights list; each item has a colored left rail, a bold observation line + detail, and two buttons: a primary action and "Ask the assistant". Only render when there are insights.

9. **"Running right now"** (white card) — header with a voucher-quota indicator, then a list of active items. Each row: a kind chip (HOT DEAL / CAMPAIGN / VOUCHERS), name, rule text + optional "Notification sent/scheduled" tag, a right-aligned stat + label, and Edit / Pause buttons.

## Header (page chrome, if not already provided by the shell)
Title **"Partner analytics"**; subtitle = `{venue name} · {address, city} · {range label}`. A date-range selector drives everything: 7 / 14 / 30 days / quarter → labels "last 7 days", "last 14 days", "last 30 days", "last quarter". A currency toggle (default PLN) formats all money.

## Data model — drive the whole page from one state object; do not hardcode figures inline
Support these **overview states** (a single prop/enum), because the page must be honest in every situation:
- `normal` — established venue, healthy numbers (newRatio ≈ 0.23, claimRatio ≈ 0.46).
- `lowBudget` — same numbers but shows the low-budget banner (state 1).
- `negative` — results are poor (newRatio ≈ 0.03, claimRatio ≈ 0.08); ROI verdict must say so plainly, no spin.
- `thin` — too little data yet (~12 days live): **hide the estimate/attribution money claims**, show a plain "we need more time before we can claim credit" note instead, and soften the cost→return comparison.
- `idle` — nothing is running: replace the entire dashboard with a single empty-state card ("Nothing is running in your venue yet" + explanation + "Create your first hot deal" button). No fabricated metrics.

Also expose a `showInsight` boolean (toggles section 8). All visits/redemption series, cost rows, active items, and support rows should compute from the state object so the numbers stay internally consistent (e.g. per-deal claim rows must sum to the "Deals claimed" metric for the chosen range).

## Behavior / acceptance
- Fully responsive: two-column sections collapse to one column on narrow widths; metric grid reflows; nothing overflows.
- Buttons route to the right screens (loyalty budget, campaigns, vouchers, assistant) or open the relevant drawer — wire to the app's existing router/actions.
- Money and big counts use tabular figures; respect the currency toggle.
- Every estimate is visibly labelled; `thin` and `negative` states must never overstate results.
- Match the existing code conventions in the repo (framework, state, styling approach). Ask me before adding any new dependency.

Start by showing me the section order and the state-object shape you'll use, then build.
