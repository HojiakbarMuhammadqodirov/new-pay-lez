# Paylez Games — Data, Logic & Scoring Spec

Covers **Word Builder** (Polish + English) and **Memory Match**. Hand this to a developer alongside the three data files:

- `words_pl.json` — 111 Polish words
- `words_en.json` — 110 English words
- `memory_decks.json` — 50 pairs across 5 themed decks

---

## 1. The universal rules (apply to every Paylez game)

These already govern your existing games; the two new ones must follow them so the whole set feels consistent.

### Lives / attempts
- A user has a **daily lives pool** shared across all games (your current design shows 3 hearts).
- Starting a game costs nothing; **a life is spent only when a game is lost** (or per your existing rule — keep it consistent with the flag/quiz games).
- When lives hit zero: *"Out of lives — come back tomorrow."* Lives reset at local midnight.
- **Rationale:** this is what makes points scarce. If a user could play infinitely, points would inflate and vouchers would cost you real money for no engagement value. Lives cap daily earning.

### Points are provisional until claimed
- Points earned in a game are added to the balance immediately, but they are **loyalty points** — spendable only on discount vouchers and gift cards, never withdrawable as cash. (This is the same rule that keeps the whole rewards system outside e-money regulation.)

### Every game ends with the reward connection
- Never show a bare score. Always: **"+40 points · you're 60 from 10% off at Café Bratysławska."**
- This is the single most important pattern. A score is a dead end; a step toward a real discount is why someone plays again tomorrow.

### Anti-farming
- Server is the authority on points, never the client. The client reports *what happened*; the server recomputes the score from its own copy of the answer and awards points. A modified client cannot mint points.
- Rate-limit: the lives system already caps this, but also cap total daily game points server-side (e.g. 150/day) as a backstop.

---

## 2. Word Builder

### Data
Two files, identical structure. Each word:
```json
{ "word": "KAWA", "hint": "You order this in a café", "tier": 1, "category": "food_drink" }
```
- **tier**: 1 = easy (3–4 letters), 2 = medium (5–6), 3 = hard (7+). Used for difficulty ramp and scoring.
- **category**: enables themed rounds ("food & drink day") and keeps a round coherent.
- **Polish preserves diacritics** (Ł, Ą, Ę, Ó, Ż, Ź, Ś, Ć, Ń). The letter tray must render them, and matching is exact including diacritics.

### Round structure
- A round = **5 words**.
- **Difficulty ramp within a round:** word 1–2 from tier 1, word 3–4 from tier 2, word 5 from tier 3. This makes early words feel achievable and the last one a satisfying challenge.
- **No repeats:** track recently served words per user (last ~40) and don't repeat until the pool cycles. With 110+ words per language, a user won't see repeats for many sessions.

### Game logic (per word)
1. Show the hint. Show the answer's letters **scrambled** in a tray, plus empty answer slots (one per letter).
2. User taps tray letters in order; each fills the next slot and is removed from the tray.
3. **Undo** returns the last letter; **Clear** returns all.
4. When all slots are full, **auto-check**:
   - **Correct** → lock green, award points, advance.
   - **Wrong** → shake, keep the letters placed, let the user Undo and retry. Wrong attempts don't end the word — they cost time and the speed bonus (below).

### Scoring — Word Builder

Base + difficulty + speed + accuracy, all computed **server-side**.

| Component | Value | Notes |
|---|---|---|
| **Base per word** | 5 points | For solving it at all |
| **Tier bonus** | +0 / +2 / +4 | tier 1 / 2 / 3 — harder words pay more |
| **First-try bonus** | +3 | Solved with no wrong attempt and no hint |
| **Speed bonus** | +0 to +3 | Solved under 15s: +3; 15–30s: +1; over 30s: +0 |
| **Hint penalty** | letter reveals cap points | Using "Hint" (auto-fill a letter) removes the first-try and speed bonuses for that word |

**Worked examples:**
- Easy word, first try, fast: 5 + 0 + 3 + 3 = **11 points**
- Hard word, first try, fast: 5 + 4 + 3 + 3 = **15 points**
- Medium word, one wrong attempt, slow, no hint: 5 + 2 + 0 + 0 = **7 points**
- Any word solved only with hints: 5 + tier bonus only (**5–9 points**)

**Perfect-round bonus:** all 5 words solved first-try → **+10 points**. This rewards mastery and gives a target to chase.

**Typical round yield:** roughly **40–70 points** for a good round, **25–40** for an average one. Tune the café voucher thresholds (250 pts for 5% etc.) against this — at ~50/round, a 5% voucher is ~5 rounds of play, which feels earnable but not trivial.

### When the user does NOT earn
- Abandons mid-word (leaves the screen): no points for the unsolved word, keeps points already banked in the round.
- Solves only via hints: base + tier bonus only, no speed/first-try bonuses.
- There is **no penalty balance** — a user can't go negative. Worst case is a low-value round.

---

## 3. Memory Match

### Data
`memory_decks.json` — 5 themed decks, 10 pairs each. A round uses a subset.
```json
{ "id": "wawel", "icon": "🏰", "asset": "wawel.svg", "label": "Wawel", "label_en": "Wawel Castle" }
```
- **icon** = emoji placeholder. **Replace with `asset` (custom SVG illustrations)** for production — emoji render inconsistently across devices and won't match the brand.
- **label / label_en** = the L-Earn payload. Revealed on match, so players absorb Kraków landmarks, Polish food names, transport vocabulary.

### Deck selection
- Decks: `krakow_landmarks`, `polish_food`, `getting_around`, `everyday_essentials`, `flags_neighbours`.
- A round picks **one deck**, then **6 pairs** from its 10 → **12 cards in a 4×3 grid**.
- Rotate the deck daily or let the user pick a theme. Rotating themes is the L-Earn engine — a week covers landmarks, food, transport, essentials.
- **Flags deck is deliberately politically neutral** (Poland, Japan, Brazil, Italy, Canada, Sweden, Spain, Portugal, Australia, Mexico). Never introduce regionally contested pairings — your audience includes nationalities where that would be a real problem.

### Game logic
1. 12 cards face-down. User flips two at a time.
2. **Match** (same pair id) → cards lock, glow briefly, reveal the label. Award points.
3. **No match** → both flip back after ~850ms.
4. Round ends when all 6 pairs are found.

### Scoring — Memory Match

The skill here is **efficiency** (fewer moves = better memory), so scoring rewards that.

| Component | Value | Notes |
|---|---|---|
| **Base per pair** | 6 points | For each pair found |
| **Efficiency bonus** | +0 to +12 | Based on total moves vs. the minimum possible (6) |
| **Flawless bonus** | +10 | Solved in exactly 6 moves (every flip a match — rare, memorable) |

**Efficiency bonus formula:**
```
minMoves = 6 (pairs)
maxReasonable = 16
efficiency = clamp((maxReasonable - moves) / (maxReasonable - minMoves), 0, 1)
bonus = round(efficiency * 12)
```
- Solved in 6 moves → efficiency 1.0 → +12, **plus** the +10 flawless → strong reward.
- Solved in 11 moves → efficiency 0.5 → +6.
- Solved in 16+ moves → efficiency 0 → +0 (base points only).

**Worked examples:**
- 6 pairs, flawless (6 moves): 36 + 12 + 10 = **58 points**
- 6 pairs, 10 moves: 36 + 7 + 0 = **43 points**
- 6 pairs, 18 moves (lots of misses): 36 + 0 + 0 = **36 points**

**Typical round yield:** **36–58 points**, similar band to Word Builder so the games feel balanced against each other.

### When the user does NOT earn
- **Base points are guaranteed** — every pair found earns its 6 points regardless of moves. Memory Match has no "fail" state; a slow player still earns, just less.
- Abandoning mid-round: keeps points for pairs already matched, forfeits the rest and the bonuses.
- **No time limit** by default (accessibility — non-native readers, older users). If you later add an optional timed mode, make it a separate high-score variant, not the default.

---

## 4. Balancing the two games against each other

Both yield **~35–70 points per round**, deliberately. This matters:
- If one game paid far more, users would grind only that one and ignore the rest.
- Equal yield means users pick the game they *enjoy*, not the one that pays — which is better for retention and for the L-Earn spread across topics.

**Set voucher thresholds against this band.** At ~50 points/round and 250 points for a 5% voucher, that's ~5 rounds — a few days of casual play. That ratio is the real lever on your voucher costs: raise thresholds to slow earning, lower them to accelerate it. Watch the points-issued-to-points-redeemed ratio and tune.

---

## 5. What to commission / build next

1. **Custom illustrations** for the Memory Match decks (the `asset` filenames) — the single biggest visual upgrade; emoji are placeholders only.
2. **Expand the word pool** toward ~200 per language over time; the structure supports it with no code change.
3. **Daily Word** variant — one shared word per day for everyone (Wordle-style), which adds a social/shareable hook and is your strongest differentiator. The data already supports it; it needs a "word of the day" selector keyed to the date.
4. **Server-side scoring endpoints** for both games, since points must never be client-authoritative.
