# 2048 and Food Cross — the engine contract

**Who this is for:** anyone implementing either game on a client — first of all
the Flutter app — so that the board the player sees is, move for move, the board
the server replays. The server is the authority (points rulebook §9.3, "game
results are validated server-side"): it replays the move list you send from the
seed it gave you and computes the result itself. **A score you compute is for
drawing only; the server never reads it.** If your board and the server's
disagree, the server's is the round.

Normative sources, in order: this document, then `server/domain/engines/*.ts`
(`prng.ts`, `game2048.ts`, `foodcross.ts`), which are one implementation of it.
Every test vector at the bottom was produced by running that implementation
(`node server/domain/engines/vectors.ts`), and `npm run verify:api` replays every
one of them against it on every run, so this file cannot drift from the server
without a failing check. **A port is correct when it reproduces every vector
exactly** — board, score, draw count and the refusals.

Rulebook references: §3 energy, §4.1 the formula, §5.7 2048, §5.8 Food Cross,
§9.1 weekly cap, §9.3 server authority.

---

## 1. The wire

Both games use the ordinary session protocol (`/v1/games/...`, `auth: user`).
Game types: **`game_2048`** and **`food_cross`** (Dart:
`GameType.game2048('game_2048')`, `GameType.foodCross('food_cross')`).

### 1.1 Start — `POST /v1/games/sessions` `{ "gameType": "game_2048" }`

Response (`Round`), with `content` carrying the seed and **every rule parameter**.
Read them from `content`; do not hard-code them — they are server config
(rulebook §11) and a round is always replayed with the values it was started
with.

```json
{
  "sessionId": "gms_…",
  "gameType": "game_2048",
  "content": {
    "seed": 2581720956,
    "size": 4, "fourOneIn": 10, "startTiles": 2, "maxMoves": 20000,
    "performanceByTile": [{"tile":64,"performance":20},{"tile":128,"performance":35},
                          {"tile":256,"performance":50},{"tile":512,"performance":65},
                          {"tile":1024,"performance":85},{"tile":2048,"performance":100}],
    "minSecondsPerMove": 0.1
  },
  "energyLeft": 3, "paid": true, "unpaidReason": null
}
```

```json
{
  "sessionId": "gms_…",
  "gameType": "food_cross",
  "content": {
    "seed": 1955961175,
    "rows": 7, "cols": 7, "kinds": 6, "moves": 20, "target": 2000,
    "tilePoints": 10, "runMultiplier": [1, 3, 5], "cascadeCap": 5,
    "minSecondsPerMove": 0.5
  },
  "energyLeft": 3, "paid": true, "unpaidReason": null
}
```

`seed` is an unsigned 32-bit integer (0 … 4 294 967 295). It fits a Dart `int`
exactly; parse it as an integer, never through a double.

**Energy is charged here, at the start** (rulebook §3). `energyLeft` is the tank
*after* this round's unit — what is left to start the next round with. With an
empty tank the start is refused with `409 no_energy` (detail `nextAt`, `max`),
unless the body has `"practice": true`, which opens an unpaid round
(`paid: false`, `energyLeft: 0`).

### 1.2 Finish — `POST /v1/games/sessions/:id/finish`

```json
{ "report": { "moves": "LLURD" } }                       // game_2048
{ "report": { "moves": [[4,4,1],[5,2,1],[1,5,0]] } }     // food_cross
```

- **2048 `moves`**: a string of the letters `U`, `D`, `L`, `R`, one per swipe, in
  the order played. (An array of the same one-letter strings is also accepted.)
- **Food Cross `moves`**: an array of `[row, col, dir]` triples, one per swap, in
  order. `row`/`col` are the 0-based cell (row 0 is the **top**, col 0 the
  **left**); `dir` is `0` for "swap with the cell to the **right**"
  (`col + 1`) and `1` for "swap with the cell **below**" (`row + 1`). Every
  adjacent swap has exactly one encoding: a swipe of cell (3,5) *leftwards* is
  sent as `[3,4,0]`; a swipe *upwards* from (3,5) is `[2,5,1]`.
- Send **only moves that did something**: a 2048 swipe that changed the board, a
  Food Cross swap that matched. A swipe into a wall, or a swap your board snapped
  back, is not a move — do not record it.
- An empty list is legal: the round finishes on the opening board.
- Nothing else in `report` is read.

The response is the ordinary `Finish` body (points, `performance`, the §4.1
itemisation, `energyLeft`, `balance`, …) plus two fields that matter here:

- **`replay`**: `{ "moves": 38, "score": 412, "highestTile": 64 }` — the
  server's own replay result. `score` is the *game's* score (not points);
  `highestTile` is `null` for Food Cross. `null` on every other game type.
- **`capped`**: points the §9.1 weekly game cap trimmed off this round (0 almost
  always). `score + capped` is what the formula priced.

`performance` (0–100) is computed from the replay:

- 2048: the largest `performanceByTile` band whose `tile` the round's highest
  tile reached; **0 below 64**. (A finished round still pays the formula's floor
  of 2 base points.)
- Food Cross: `min(100, floor(score × 100 / target))` — integer division.

`won` is `performance == 100` for 2048 and `score >= target` for Food Cross.

**Refusals** — all `400 bad_request`, and the round stays **active**, so a client
can fix its list and finish again:

| `detail.reason` | meaning | `detail` also has |
|---|---|---|
| `bad_move` | a move that is not well-formed: an unknown letter, not a `[r,c,d]` triple of integers, a cell or neighbour off the board, `dir` not 0/1 — or the move list itself is not a string/array (`move: -1`) | `move` (0-based index) |
| `no_change` | a 2048 swipe that does not change the board (including any swipe after the board is over) | `move` |
| `no_match` | a Food Cross swap that makes no run of 3 | `move` |
| `too_many_moves` | more than `maxMoves` (2048) or `moves` (Food Cross) | `move: -1` |
| `too_fast` | the round was open for less than `moves × minSecondsPerMove` seconds (server clocks, `/start` → `/finish`) — rulebook §9.3's minimum round duration | `minSeconds`, `elapsed` |

A `bad_move`/`no_change`/`no_match` from a round your client played honestly
means **your engine disagrees with this document**. The `move` index is the
first move the server could not follow; the `trace` arrays in the vectors below
are there to find the first move at which a port diverges.

### 1.3 Abandon — `POST /v1/games/sessions/:id/abandon`

Energy was spent at the start, so leaving a round costs it — except that **a
round abandoned within `5` seconds of its start is refunded, once per day** (the
accidental tap, rulebook §3 / §9.2). Send this when the player leaves a round
without finishing. Response:

```json
{ "sessionId": "gms_…", "refunded": true, "energy": { "energy": 4, "max": 4, "nextAt": null } }
```

Idempotent (a repeat reports the first answer). `409 invalid_state` on a finished
round. Starting another round also closes any round still open, applying the
same refund rule at that instant — so an app that never calls this still gets
the refund when the player taps one game and immediately another.

---

## 2. The PRNG — mulberry32

Every random decision in both games comes from **one** mulberry32 stream seeded
with `content.seed`, consumed in the exact order this document gives. There is no
other source of randomness: no `Random()`, no shuffles, no time.

The state is an unsigned 32-bit integer. All arithmetic is modulo 2³².

```ts
// TypeScript — server/domain/engines/prng.ts
state = seed >>> 0;
function nextU32(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}
function pick(n: number): number {          // an integer 0 .. n-1
  return Math.floor((nextU32() * n) / 4294967296);
}
```

A Dart port that keeps every intermediate value in `0 .. 2³²-1` (so `>>` behaves
as the unsigned `>>>`):

```dart
const int _m32 = 0xFFFFFFFF;

/// 32-bit multiply, low 32 bits — the same as JavaScript's Math.imul, unsigned.
int _imul(int a, int b) {
  final aHi = (a >> 16) & 0xFFFF, aLo = a & 0xFFFF;
  final bHi = (b >> 16) & 0xFFFF, bLo = b & 0xFFFF;
  return (aLo * bLo + (((aHi * bLo + aLo * bHi) & 0xFFFF) << 16)) & _m32;
}

class Mulberry32 {
  Mulberry32(int seed) : _state = seed & _m32;
  int _state;
  int draws = 0;

  int nextU32() {
    draws++;
    _state = (_state + 0x6D2B79F5) & _m32;
    var t = _state;
    t = _imul(t ^ (t >> 15), t | 1);
    t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & _m32)) & _m32;
    return (t ^ (t >> 14)) & _m32;
  }

  /// An integer in 0 .. n-1: floor(u × n / 2^32). u × n < 2^52, exact in a Dart int.
  int pick(int n) => (nextU32() * n) >> 32;
}
```

`pick(n)` is **the only way the games consume the stream**, and every `pick`
takes exactly one 32-bit draw. `draws` in the vectors counts those draws, so a
port that draws one too many or too few is caught even when the board happens
to agree.

The `prng` vectors give, per seed, the first five `nextU32()` outputs and then
five `pick(n)` results that continue the same stream.

---

## 3. 2048

### 3.1 The board

`size × size` cells (4 × 4), stored **row-major**: index `i = row × size + col`,
index 0 top-left, index 3 top-right, index 4 the first cell of the second row.
A cell holds `0` (empty) or a tile's face value (2, 4, 8, …).

### 3.2 Spawning a tile — two draws, position then value

1. List the empty cells in **ascending index order**. If there are none, draw
   nothing and stop.
2. `cell = empty[pick(empty.length)]`.
3. `value = pick(fourOneIn) == 0 ? 4 : 2` (with `fourOneIn = 10`: one in ten is a 4).

### 3.3 The opening board

Start from an all-empty board and spawn `startTiles` (2) tiles, one after the
other (4 draws).

### 3.4 A swipe

A swipe acts on `size` independent **lines**. Each line is a list of cell
indices ordered **from the wall the tiles move towards**:

| swipe | lines | order within each line |
|---|---|---|
| `L` | each row | left → right (col 0, 1, 2, 3) |
| `R` | each row | right → left (col 3, 2, 1, 0) |
| `U` | each column | top → bottom (row 0, 1, 2, 3) |
| `D` | each column | bottom → top (row 3, 2, 1, 0) |

For each line:

1. `tiles` = the non-zero values of the line, in line order.
2. Walk `tiles` from the start: if the current tile equals the **next** one, emit
   one tile of **double** the value, add that doubled value to the round's
   `score`, and skip past both; otherwise emit the tile unchanged and step one.
3. Write the emitted tiles back into the line from its first cell, and fill the
   rest of the line with 0.

So in line order `2 2 2 2 → 4 4 _ _` (+8), `2 2 2 _ → 4 2 _ _` (+4),
`4 4 8 _ → 8 8 _ _` (+8; a merged tile never merges again in the same swipe),
`2 _ 2 4 → 4 4 _ _` (+4).

The swipe **changed** the board if any cell's value differs from before.

### 3.5 A move, and the round

For each swipe in `moves`, in order:

1. Apply the swipe (§3.4).
2. If it did **not** change the board → the replay is refused, `no_change` at
   this index.
3. Otherwise spawn one tile (§3.2).

The board is **over** when it has no empty cell and no two orthogonally adjacent
equal tiles; any swipe then is a `no_change`, so there is no separate end rule.
There is no move limit other than `maxMoves` (a bound on the server's work, far
above any real game): the round lasts until the board is over **or the player
finishes** — the client may finish at any time.

`highestTile` is the largest value on the final board. `score` is the sum from
§3.4 step 2. Performance is §1.2's table on `highestTile`.

---

## 4. Food Cross

### 4.1 The board

`rows × cols` (7 × 7) cells, **row-major** (`i = row × cols + col`), row 0 at the
**top**. A cell holds a food kind `0 .. kinds-1` (6 kinds). During resolution a
cell may be temporarily empty (`-1`); a board at rest is always full.

### 4.2 Runs

A **run** is a maximal straight horizontal or vertical line of 3 or more cells of
the same kind. Find them like this (the order only matters for describing the
sum; the result is a sum):

- **Horizontal runs first**: for each row from the top, scan left → right,
  grouping consecutive equal cells; every group of length ≥ 3 is a run.
- **Then vertical runs**: for each column from the left, scan top → bottom the
  same way.

Runs are maximal (`AAAA` is one run of 4, never two of 3). A cell can be in one
horizontal and one vertical run at once (an L, T or + shape) — **both runs
count** for points, and the cell is cleared once. Empty cells never form a run.

A run of length `L` is worth
`tilePoints × L × runMultiplier[min(L − 3, runMultiplier.length − 1)]` —
with the defaults, 3 → 30, 4 → 120, 5 → 250, 6 → 300, 7 → 350 (a whole row or column, the longest a 7 × 7 board holds).

### 4.3 Filling a playable board — the opening board and a reshuffle

1. For each cell in **row-major order** (row 0 left → right, then row 1, …):
   draw `v = pick(kinds)`; **while** (`col ≥ 2` and the two cells to the left are
   both `v`) **or** (`row ≥ 2` and the two cells above are both `v`), draw again.
   Store `v`. (Only cells already written in *this* fill are looked at.)
2. If the finished board has **no legal swap** (§4.4), do step 1 again for the
   whole board, continuing the same stream, until it has one.

The opening board is this fill applied to an empty board.

### 4.4 Legal swaps

A swap exchanges two orthogonally adjacent cells. It is **legal** if, after the
exchange, the board has at least one run (§4.2). Exchanging two equal kinds
changes nothing and is never legal. "The board has a legal swap" means: for
every cell in row-major order, try the swap with its right neighbour then with
the cell below (where they exist); any legal one answers yes.

### 4.5 A move

For each `[row, col, dir]` in `moves`, in order:

1. Validate it (§1.2) — otherwise `bad_move`.
2. Exchange the two cells. If the board has no run → the replay is refused,
   `no_match` at this index. (A real board would snap the tiles back; the client
   must not record such a swap.)
3. **Resolve** (§4.6) and add its points to `score`.
4. If the resting board has **no legal swap**, **reshuffle**: refill the entire
   board by §4.3 (both steps), continuing the stream. The old tiles are
   discarded — this is a fresh fill, not a permutation.

At most `moves` (20) swaps; the round ends after the 20th or whenever the player
finishes. There is no bonus for unused moves.

### 4.6 Resolving — clear, gravity, refill, repeat

Repeat, with a step counter `k` starting at 1:

1. Find every run (§4.2). If there are none, stop.
2. `stepPoints` = the sum of the points of **every** run found (§4.2);
   `score += stepPoints × min(k, cascadeCap)`. So the swap's own matches are ×1,
   the first cascade ×2, the next ×3, … capped at ×5.
3. Clear (set to `-1`) every cell that is in any run.
4. **Gravity**: in each column independently, the remaining tiles fall straight
   down, keeping their top-to-bottom order; the empty cells end up at the top of
   the column.
5. **Refill**: for each column **left → right**, and within it each empty cell
   **top → bottom** (row 0 first), draw `pick(kinds)` and place it. There is **no**
   redraw here — a refill may form runs, and that is what a cascade is.
6. `k += 1` and go back to 1.

---

## 5. What the points are

The game's own score only decides `performance` (0–100). Points then follow the
rulebook's master formula exactly like every other game — `base = max(2,
round(performance/100 × 18))`, × 1.5 on the day's featured game (once a day),
× decay by round of the day (1, .65, .45, .3, .2, .12), × plan multiplier, +
perfect-round 10 (decayed with the round since 2026-10-08) / first-play 25 / personal-best 8 — all computed by the server
and itemised on the `Finish` body. Personal best compares **performance**, per
game type. The featured rotation (§4.4) cycles the rulebook's eight games — Guess
Flag, Brain Games, Country Quiz, Word Builder, Memory Match, Bird's Flight, 2048,
Food Cross — one a day; `featuredGame` on `GET /v1/games/state` names today's.
Points from games are capped per week (§9.1: Free 200 / Pro 280 / Premium 450 since the 2026-10-08 rebalance,
Monday–Sunday UTC); a trim shows up as `capped`.

---

## 6. Test vectors

Generated by `node server/domain/engines/vectors.ts` with the default parameters
of §1.1 (`size 4, fourOneIn 10, startTiles 2`; `rows 7, cols 7, kinds 6, moves 20,
target 2000, tilePoints 10, runMultiplier [1,3,5], cascadeCap 5`). Boards are
row-major arrays. For each vector a port must reproduce, from `seed` and
`moves`:

- 2048: `start` (the opening board), `board`, `score`, `highestTile`, `over`,
  `performance`, and `draws` (total `pick` calls, opening included); `trace`,
  where present, is the running `score` after each swipe.
- Food Cross: `start`, `board`, `score`, `reshuffles` (fills beyond the first,
  opening included), `bestCascade` (the largest `k` reached by any one swap),
  `performance`, `draws`, and `trace` (running `score` after each swap).
- Rejects: replaying `moves` from `seed` must refuse with `reason` at index
  `move`.

The move lists were chosen by throwaway strategies (random, "corner", greedy)
from a separate stream; how they were chosen is not part of the contract.

<!-- vectors:prng -->
```json
[
  {"seed":0,"u32":[1144304738,1416247,958946056,627933444,2007157716],"picks":[{"n":2,"value":1},{"n":6,"value":3},{"n":10,"value":6},{"n":16,"value":7},{"n":64,"value":37}]},
  {"seed":1,"u32":[2693262067,11749833,2265367787,4213581821,4159151403],"picks":[{"n":2,"value":0},{"n":6,"value":3},{"n":10,"value":7},{"n":16,"value":6},{"n":64,"value":63}]},
  {"seed":42,"u32":[2581720956,1925393290,3661312704,2876485805,750819978],"picks":[{"n":2,"value":1},{"n":6,"value":1},{"n":10,"value":6},{"n":16,"value":13},{"n":64,"value":30}]},
  {"seed":2026,"u32":[1955961175,1324980858,2839649622,2656330836,654038057],"picks":[{"n":2,"value":0},{"n":6,"value":4},{"n":10,"value":8},{"n":16,"value":4},{"n":64,"value":2}]},
  {"seed":3735928559,"u32":[4043151706,1147597007,3315858022,1538288752,2042435954],"picks":[{"n":2,"value":1},{"n":6,"value":0},{"n":10,"value":3},{"n":16,"value":1},{"n":64,"value":15}]},
  {"seed":4294967295,"u32":[3850105811,813802916,3073704848,4054706436,3630262831],"picks":[{"n":2,"value":1},{"n":6,"value":4},{"n":10,"value":4},{"n":16,"value":2},{"n":64,"value":63}]}
]
```

<!-- vectors:game2048 -->
```json
[
  {"name":"opening board only","seed":1,"moves":"","start":[0,0,0,0,0,0,0,2,0,0,4,0,0,0,0,0],"board":[0,0,0,0,0,0,0,2,0,0,4,0,0,0,0,0],"score":0,"highestTile":4,"over":false,"performance":0,"draws":4},
  {"name":"three swipes","seed":42,"moves":"UDR","start":[0,0,0,0,0,0,0,0,0,2,0,0,0,2,0,0],"board":[0,0,0,2,0,0,0,0,0,0,0,0,2,0,4,2],"score":4,"highestTile":4,"over":false,"performance":0,"draws":10,"trace":[4,4,4]},
  {"name":"twenty random swipes","seed":2026,"moves":"LLLDRLULLDDUDLLUDDLL","start":[0,0,0,0,0,0,0,2,0,0,2,0,0,0,0,0],"board":[0,0,0,0,0,0,2,0,4,2,0,0,32,8,2,0],"score":136,"highestTile":32,"over":false,"performance":0,"draws":44,"trace":[0,0,4,8,16,16,20,20,20,32,60,60,64,72,88,92,92,96,136,136]},
  {"name":"a hundred random swipes","seed":3735928559,"moves":"DDUDUUUDLRLRDULDLLULDLDULDUDUUDRDLUDURULUUDUUDRUURUDDRRLUDURUUULRLDLLRLLRRDRLDULUDLDUDRURRDRRUDULUDU","start":[0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,2],"board":[4,2,16,2,8,128,32,8,4,8,0,2,2,2,0,0],"score":972,"highestTile":128,"over":false,"performance":35,"draws":204,"trace":[4,4,4,4,8,8,8,8,24,36,36,36,40,52,68,72,72,72,84,88,108,148,156,156,156,160,160,160,160,164,168,192,196,204,208,208,208,212,212,212,216,224,224,224,228,236,260,264,264,308,392,392,392,400,404,404,432,444,452,468,504,504,508,512,520,520,524,528,528,528,536,540,540,544,548,548,548,564,564,580,604,604,620,656,656,656,660,680,744,744,920,924,932,956,960,960,964,972,972,972]},
  {"name":"corner strategy to the end","seed":7,"moves":"DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDLDLDDDDDDDDDDDDDDLDDDDLDDDLDDDDDRDDDLLDDLLRDDDDDDDDDDDDLDDLDRDDDDDDLDDDDDLRDDDDLDDLDDLDDDDDLDDDLDDLRDDDDDLLLDDDLLDRDDLDDLDLDDLDDLLDRDDDDDDDDLDLDDDDDLDLDDDDDDDDDDLLDDRDDDLRLDDDDDDDLLL","start":[4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],"board":[2,8,4,2,32,16,8,4,4,32,2,8,256,64,4,32],"score":2524,"highestTile":256,"over":true,"performance":50,"draws":436},
  {"name":"greedy to the end (reaches 512)","seed":3,"moves":"DRDDDRDDRRDRLDRRDRLRDDDRRDRDDLDDDDLLDLDDDLDLRLDDDLDLLLDLLDDRDRDLRLDLDRDLDLRDLDLLRDLDLDLDDDDLDDDLLRDLDLRDDDLDLDDDLLLDLLDDLDDLLDLDDLLDDLDDLLDLDLDDLDLDDLLLRDDDDLLDLRDLDDLRDDLDDLDRLDDRDDLLRDLLDLDLLLLLLLDDLLLLDDLDRDLLDRDDDDDLDDDLDLRLDDLDLDRDLDLLLDLDDDLLDLLDLDDDDLLLDLDLDRDLDLDLDLRLDRDLLLLLRDLLDDDLDLDLDLLDLLDLDRLLDLRDLLDRDLDDDLDDDDLDLLDLDLLDLLLDLLDDRLDLLDLDDLLDRDRDLLLDLLLDLLLLDRLDDLRDLRLDLRDLLLLLLRD","start":[0,0,0,0,0,0,4,0,0,0,0,4,0,0,0,0],"board":[4,2,4,2,64,32,8,4,8,64,16,8,512,8,128,16],"score":5632,"highestTile":512,"over":true,"performance":65,"draws":794},
  {"name":"greedy to the end (reaches 1024)","seed":114,"moves":"DRDDRDDDDDRRRDDRDLRDRDDDRDDRDDDLDRDDRDRDRDDDRDDDDRRDDDDDDLDRDRDDDLRDLDRDDRDRRDRDDRRDDRRLDRLDLDLDRDDLDDDDDRDDDLDDDLDDDLLLLLDDLDDLDLDLDLRDLDDLDLDDDDDDDDRDDLLDDDDDLLDDDDLLDDDDLDLLDRRDLDDLLDLLDRDLDDLLLDLLLLDLLRLDLDLDLDLRDLDDLLDLDLDLDDDLDDDRDLDLDLLDDRDLDDLDRDRDLDDDLLLDLLDDDDLLDDLRDDDDDLDDDDLDLLLDLDLLLLLDLDDDDDDDDLRDDDDLDDLDLLDDLLLDRDDLDRDRDLLLDLDDLDDRDLLLLLRLDRDDDLDLLLLLDDLLLLRLLLDLLDLRDDDLDDDLDDDLDDLDLLDLLLDLRDDDLDLLLDLLDLLLDDDLDDLLLDLRDDLDDLDDLLDLDLLDLLLDRDDDRDLDLDLRLDDDLLLLLRDLDDLDLDLRDLLDLDRRDDDRRRDLLLDDLDDLDLDDDDDLRLDLLLDLDLDDLLRDLDLL","start":[0,0,0,0,0,0,0,2,0,0,0,0,2,0,0,0],"board":[2,8,4,2,4,16,8,4,64,2,16,8,2,16,1024,32],"score":9612,"highestTile":1024,"over":true,"performance":85,"draws":1084},
  {"name":"corner strategy, 300 swipes","seed":4294967295,"moves":"DLLDLDDDDDRDDDDDDLDLDDDDLDDLDLLDDDDDLDLLDDDDDLDDLLDDLDDDDLDDDRDDLDDDDLDDLRDDDDLDLLDDDLDLDDDLDDDLDDLDLLDDLDDDDDDDDLDDDLDDDDDDLDDDDDDDDDDDLDDDDRDDDLDDDDDLDDLDDDDLDDLDRDDDDLDDLRDDLDLDDLDDLRDDDLDDDLLLDLLDRDLDLDLDDLDDDDLDDDDLDDLRDDLDLDDDLDDLDLLLL","start":[0,0,0,0,0,0,0,0,0,0,2,0,0,0,2,0],"board":[2,8,4,2,4,16,8,4,64,32,16,8,256,64,32,16],"score":2792,"highestTile":256,"over":true,"performance":50,"draws":486},
  {"name":"random to the end","seed":99,"moves":"LURUURDLDLRUUDDLDLRLDLLDUURDDLLUURURDURUDLURURRDUURDLUDRLRURRDULUDRLLRRLDULLLURULUDDLULRURRDRUDLDULRDLLDURLRDLLDRDDDUDLLURDUURDLUDRRDRLLUR","start":[0,0,0,0,2,0,0,0,0,2,0,0,0,0,0,0],"board":[2,8,128,2,8,16,8,32,4,2,64,16,2,16,4,2],"score":1348,"highestTile":128,"over":true,"performance":35,"draws":280}
]
```

<!-- vectors:foodCross -->
```json
[
  {"name":"opening board only","seed":1,"moves":[],"start":[3,0,3,5,5,1,3,4,2,5,2,2,0,2,1,0,2,0,2,4,1,1,0,2,3,4,1,1,3,3,4,1,4,2,4,5,1,4,0,1,2,1,0,4,3,0,1,0,3],"board":[3,0,3,5,5,1,3,4,2,5,2,2,0,2,1,0,2,0,2,4,1,1,0,2,3,4,1,1,3,3,4,1,4,2,4,5,1,4,0,1,2,1,0,4,3,0,1,0,3],"score":0,"reshuffles":0,"bestCascade":0,"performance":0,"draws":49,"trace":[]},
  {"name":"one swap","seed":42,"moves":[[4,1,0]],"start":[3,2,5,4,1,3,1,3,5,2,1,5,4,1,1,3,4,3,0,2,5,0,3,0,1,0,1,4,3,0,1,5,2,4,1,2,0,0,3,3,1,3,1,1,4,5,3,1,1],"board":[3,4,4,5,1,3,1,3,2,1,4,5,4,1,1,5,0,1,0,2,5,0,3,5,1,0,1,4,3,1,2,5,2,4,1,2,0,4,3,3,1,3,1,1,4,5,3,1,1],"score":90,"reshuffles":0,"bestCascade":2,"performance":4,"draws":55,"trace":[90]},
  {"name":"five random swaps","seed":2026,"moves":[[3,3,1],[4,6,1],[0,5,1],[4,2,0],[0,5,0]],"start":[2,1,3,3,0,1,4,4,1,0,0,3,2,0,1,2,5,3,0,1,1,4,5,5,4,1,1,2,1,3,1,5,0,0,2,4,4,2,5,4,3,0,5,1,5,4,1,2,1],"board":[2,5,0,3,1,5,2,4,1,4,5,5,0,5,1,1,3,2,2,1,0,4,2,5,5,4,2,1,1,3,4,3,0,1,2,4,4,2,5,4,3,2,5,1,5,4,1,2,1],"score":330,"reshuffles":0,"bestCascade":2,"performance":16,"draws":76,"trace":[150,180,270,300,330]},
  {"name":"twenty random swaps","seed":3735928559,"moves":[[1,3,0],[5,4,0],[0,5,1],[4,2,1],[4,1,1],[5,0,1],[1,1,1],[5,2,1],[0,6,1],[3,4,1],[4,1,0],[3,5,0],[0,5,1],[6,3,0],[3,1,0],[5,2,1],[3,4,1],[2,0,0],[3,4,0],[5,3,0]],"start":[5,1,4,2,2,5,0,1,0,1,4,2,4,3,4,5,5,2,1,4,0,3,5,3,4,2,0,0,2,2,5,3,0,3,4,1,3,2,1,3,0,2,5,3,1,0,0,5,1],"board":[0,0,2,4,1,2,4,4,4,3,1,3,1,5,2,3,2,1,5,2,3,5,0,1,0,3,1,0,1,2,4,5,5,0,0,4,4,2,2,1,4,2,1,5,5,4,5,5,1],"score":1470,"reshuffles":0,"bestCascade":3,"performance":73,"draws":133,"trace":[90,120,150,180,300,330,360,390,420,450,480,540,570,600,780,900,1350,1380,1440,1470]},
  {"name":"twenty greedy swaps","seed":7,"moves":[[5,3,1],[2,1,1],[5,4,1],[6,3,0],[5,4,1],[4,2,1],[4,2,1],[3,5,1],[5,4,0],[2,1,1],[3,0,1],[5,2,0],[3,0,1],[4,0,0],[3,1,0],[2,1,1],[4,0,0],[4,3,1],[5,4,1],[5,3,1]],"start":[0,0,5,4,3,2,2,1,3,4,1,0,4,3,1,2,1,3,1,5,1,5,1,0,0,1,3,4,0,5,3,3,4,5,3,5,4,0,1,2,2,0,0,4,2,2,5,4,4],"board":[5,4,5,2,1,0,0,0,3,2,1,1,2,0,4,2,1,3,2,3,2,0,0,3,1,4,3,3,0,5,4,5,1,5,1,5,2,2,4,1,2,4,1,4,2,5,2,2,0],"score":1740,"reshuffles":0,"bestCascade":3,"performance":87,"draws":138,"trace":[30,150,180,540,630,780,810,840,870,900,930,960,990,1110,1440,1620,1650,1680,1710,1740]},
  {"name":"twenty greedy swaps","seed":123456789,"moves":[[5,2,1],[2,3,0],[6,2,0],[5,0,0],[5,1,0],[5,3,1],[1,5,1],[5,3,1],[3,4,0],[4,0,1],[5,0,0],[2,0,0],[4,5,1],[5,3,1],[5,2,1],[5,4,1],[0,4,1],[3,2,0],[3,2,1],[3,2,1]],"start":[1,5,4,1,1,4,4,1,0,0,2,2,3,1,2,4,3,2,4,5,0,2,4,2,4,1,3,5,1,5,2,1,1,0,1,0,1,4,5,2,2,1,1,3,2,0,4,4,5],"board":[0,0,3,1,2,5,4,1,0,1,5,5,4,0,3,4,2,1,3,5,4,3,1,3,1,4,0,1,5,3,5,2,2,1,2,4,4,1,3,3,5,2,0,3,2,5,4,0,5],"score":3390,"reshuffles":0,"bestCascade":5,"performance":100,"draws":193,"trace":[150,270,450,540,720,750,870,1620,1740,1830,2100,2250,2340,2430,3150,3180,3300,3330,3360,3390]},
  {"name":"twenty greedy swaps","seed":4294967295,"moves":[[2,2,1],[2,4,1],[3,5,1],[4,4,1],[5,3,0],[3,5,1],[5,4,0],[5,5,0],[3,4,1],[4,2,0],[3,1,1],[3,4,1],[3,2,1],[4,2,1],[1,0,0],[4,0,0],[2,3,1],[2,6,1],[1,2,1],[4,3,1]],"start":[5,1,4,5,5,3,4,2,0,5,5,1,2,4,2,4,5,0,0,2,5,5,4,0,0,3,1,1,0,2,1,3,2,1,2,3,3,0,1,5,4,0,1,1,4,3,4,0,5],"board":[3,4,2,0,5,4,2,2,0,4,5,5,3,3,3,5,3,5,0,4,0,1,1,5,0,3,4,1,2,5,3,5,3,0,0,2,4,0,1,4,1,4,1,1,4,0,4,3,4],"score":1740,"reshuffles":0,"bestCascade":3,"performance":87,"draws":149,"trace":[90,120,210,240,270,720,750,870,900,930,960,1110,1140,1230,1350,1470,1560,1680,1710,1740]},
  {"name":"twenty random swaps","seed":99,"moves":[[1,4,1],[2,1,0],[1,4,0],[2,1,1],[2,3,1],[4,4,0],[4,3,0],[1,6,1],[2,2,0],[3,4,0],[1,3,1],[1,2,1],[3,4,0],[1,4,1],[1,3,1],[5,4,0],[1,2,0],[2,2,1],[4,0,0],[3,2,0]],"start":[1,4,3,4,0,4,0,0,2,4,2,0,2,4,1,1,2,4,2,1,3,4,2,4,5,3,1,5,1,2,4,2,1,4,2,5,1,2,3,4,4,1,3,4,2,0,0,3,5],"board":[5,3,1,4,2,2,0,5,4,5,5,3,1,5,3,1,5,3,3,4,0,0,4,0,2,5,0,5,0,4,4,5,1,5,2,5,3,5,3,4,4,1,3,4,3,0,0,3,5],"score":1350,"reshuffles":0,"bestCascade":2,"performance":67,"draws":138,"trace":[30,150,180,300,330,420,510,540,570,600,660,690,720,870,900,930,960,1230,1320,1350]},
  {"name":"twenty random swaps, one reshuffle on the way","seed":4,"moves":[[5,4,1],[2,2,1],[2,3,0],[0,0,0],[1,3,1],[2,6,1],[0,4,1],[1,3,1],[3,2,0],[3,3,1],[3,3,1],[1,4,1],[3,4,0],[5,3,1],[2,2,1],[3,2,1],[0,3,0],[4,1,0],[4,1,1],[5,1,1]],"start":[5,1,1,0,1,3,0,5,3,4,4,2,4,5,3,4,2,2,4,5,5,2,2,4,1,4,3,2,2,0,2,3,0,4,2,1,3,0,3,1,3,0,5,5,2,1,3,2,0],"board":[3,2,4,3,2,3,2,5,0,0,5,2,0,4,4,0,0,4,4,5,4,4,4,2,1,0,5,5,0,1,2,3,1,3,0,3,2,3,2,0,4,0,4,2,4,2,4,2,1],"score":1140,"reshuffles":1,"bestCascade":2,"performance":57,"draws":183,"trace":[30,180,210,240,270,300,330,360,540,720,780,870,900,930,960,990,1020,1050,1110,1140]}
]
```

<!-- vectors:rejects -->
```json
[
  {"game":"game_2048","seed":5,"moves":"R","reason":"no_change","move":0},
  {"game":"game_2048","seed":42,"moves":"UDRX","reason":"bad_move","move":3},
  {"game":"food_cross","seed":42,"moves":[[0,0,0]],"reason":"no_match","move":0},
  {"game":"food_cross","seed":2026,"moves":[[3,3,1],[4,6,1],[0,5,1],[4,2,0],[0,5,0],[7,7,0]],"reason":"bad_move","move":5},
  {"game":"food_cross","seed":2026,"moves":[[0,0,2]],"reason":"bad_move","move":0},
  {"game":"game_2048","seed":7,"moves":"DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDLDLDDDDDDDDDDDDDDLDDDDLDDDLDDDDDRDDDLLDDLLRDDDDDDDDDDDDLDDLDRDDDDDDLDDDDDLRDDDDLDDLDDLDDDDDLDDDLDDLRDDDDDLLLDDDLLDRDDLDDLDLDDLDDLLDRDDDDDDDDLDLDDDDDLDLDDDDDDDDDDLLDDRDDDLRLDDDDDDDLLLL","reason":"no_change","move":216}
]
```

