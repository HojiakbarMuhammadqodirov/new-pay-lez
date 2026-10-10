import { drawPico, picoBlinkAt, type DrawPicoOptions, type PicoPose } from '../../pico';
import { THEMES } from '../../theme/context';
import { BOMB, COL, ROW, SIZE, canSwap, type Board, type Piece, type Step } from '../foodBoard';
import {
  after,
  clamp01,
  displayFont,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  hash01,
  lerp,
  roundedRect,
  withAlpha,
  type SceneHost,
} from '../sceneStage';
import { STALL, type StallPalette, type StallTheme } from './config';
import { fallOf } from './fall';
import { foodSprite, juiceOf } from './foods';

/**
 * Pico's market stall — the picture of a Food Cross round.
 *
 * A striped awning with string lights under it, a sky behind (rooftops and
 * trees, the sun by day and the moon and lit windows at dusk), posts with
 * pennants, crates of produce, and on the counter a wooden crate tray with a
 * gingham cloth: the board. The foods are `foods.ts`'s drawings. Pico stands on
 * the tray's rim and cheers the combos.
 *
 * **It decides nothing.** `FoodCross.tsx` keeps the board, the score and the
 * moves exactly as before; it tells this object "swap these two", "this swap
 * was not a move", "play this step", and awaits the promise each returns. Every
 * promise resolves on a timer, never on the painter, so a stage scrolled out of
 * view cannot stall a round. After each step the scene holds the step's own
 * board, and `sync` snaps to the game's board if the two ever differ.
 */

type Ctx = CanvasRenderingContext2D;

interface Item {
  id: number;
  t: number;
  s: number;
  /** Tween from (c0, r0) to (c1, r1), in cells, over [t0, t0 + dur]. */
  c0: number;
  r0: number;
  c1: number;
  r1: number;
  t0: number;
  dur: number;
  /** 'swap' eases both ways and lifts; 'fall' accelerates and squashes on landing. */
  how: 'swap' | 'fall';
  /** Lifted above its neighbour during a swap (the one the player moved). */
  lift: boolean;
  /** Popping out: the clear starts here. */
  clearAt: number;
  /** Growing in (the opening deal, a reshuffle). */
  growAt: number;
  /** Shrinking out (a reshuffle). */
  outAt: number;
  /** Became a special: a flash and a ring. */
  flashAt: number;
  /** A swap that was not a move: toward (bc, br) and back. */
  bounceAt: number;
  bc: number;
  br: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  colour: string;
  t0: number;
  life: number;
  /** 0 a droplet, 1 a twinkle, 2 confetti. */
  shape: 0 | 1 | 2;
  spin: number;
  gravity: number;
}

interface Beam {
  cell: number;
  kind: 'row' | 'col';
  t0: number;
}

interface Zap {
  from: number;
  to: number[];
  t0: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  t0: number;
  size: number;
}

interface Layout {
  w: number;
  h: number;
  bx: number;
  by: number;
  bs: number;
  frame: number;
  /** The cloth (the playing area) and one cell of it. */
  ix: number;
  iy: number;
  is: number;
  cell: number;
  food: number;
  awning: number;
  counterTop: number;
  pico: { x: number; feet: number; size: number };
  wide: boolean;
}

const TAU = Math.PI * 2;
const { motion: M, layout: L } = STALL;

let nextId = 1;

export class StallScene implements SceneHost {
  private readonly board: () => HTMLElement | null;
  private theme: StallTheme = 'dark';
  private reduced = false;
  private ratio = 1;
  private lay: Layout | null = null;
  private sky: HTMLCanvasElement | null = null;
  private set: HTMLCanvasElement | null = null;
  private top: HTMLCanvasElement | null = null;
  private sprites = new Map<string, HTMLCanvasElement>();
  private font = 'sans-serif';
  private readonly epoch = performance.now();

  /** Which item sits in each cell, as far as the rules are concerned. */
  private at: (Item | null)[] = new Array(SIZE * SIZE).fill(null);
  /** Items on their way out (cleared, or a reshuffled board). */
  private ghosts: Item[] = [];
  private drops: Drop[] = [];
  private beams: Beam[] = [];
  private zaps: Zap[] = [];
  private rings: { x: number; y: number; t0: number; big: boolean }[] = [];
  private floaters: Floater[] = [];
  private combo = { text: '', t0: -1e9 };
  private shake = { t0: -1e9, amp: 0 };
  private cheerUntil = -1e9;
  private hopAt = -1e9;
  private lean = { to: 0, at: -1e9 };
  private selected: number | null = null;
  private hovered: number | null = null;
  private lastInput = performance.now();
  private hint: [number, number] | null | undefined = undefined;
  private busy = false;
  private over = false;
  /** Clearing steps so far in this move — the second is a cascade. */
  private chain = 0;

  constructor(board: () => HTMLElement | null) {
    this.board = board;
    this.font = displayFont();
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.load(`600 24px ${this.font}`).catch(() => {});
    }
  }

  /* ── what the game tells it ─────────────────────────────────────────────── */

  setTheme(theme: StallTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.sky = this.set = this.top = null;
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    if (!busy) this.chain = 0;
  }

  /** The round is over: Pico celebrates the round he watched, and a perfect one gets confetti. */
  setOver(over: boolean, perfect: boolean): void {
    if (over && !this.over) {
      this.cheerUntil = Infinity;
      if (perfect && !this.reduced) this.confetti(performance.now());
    }
    this.over = over;
  }

  select(cell: number | null): void {
    this.selected = cell;
    this.touch();
  }

  hover(cell: number | null): void {
    this.hovered = cell;
  }

  /** Any input: the idle hint waits again. */
  touch(): void {
    this.lastInput = performance.now();
  }

  /** These foods, at rest. */
  snap(board: Board): void {
    this.at = board.map((piece, cell) => this.item(piece, cell));
    this.ghosts = [];
    this.hint = undefined;
  }

  /** The opening deal: the foods drop onto the cloth, a column after another. */
  intro(board: Board): void {
    this.snap(board);
    if (this.reduced) return;
    const now = performance.now();
    for (let cell = 0; cell < board.length; cell += 1) {
      const item = this.at[cell]!;
      const row = Math.floor(cell / SIZE);
      const col = cell % SIZE;
      item.r0 = row - SIZE - 1;
      item.t0 = now + 120 + col * 45 + (SIZE - 1 - row) * 18;
      item.dur = M.fallBase + M.fallPerCell * (SIZE + 1) * 0.6;
      item.how = 'fall';
    }
  }

  /** A swap that is a move: the two foods change places. Resolves when they have. */
  swap(a: number, b: number): Promise<void> {
    this.touch();
    this.hint = undefined;
    this.chain = 0;
    const A = this.at[a];
    const B = this.at[b];
    if (!A || !B) return Promise.resolve();
    const now = performance.now();
    this.tween(A, b, now, M.swap, 'swap', true);
    this.tween(B, a, now, M.swap, 'swap', false);
    this.at[a] = B;
    this.at[b] = A;
    this.lean = { to: 0.22, at: now };
    return after(this.reduced ? 0 : M.swap);
  }

  /** A swap that lined nothing up: both go a little way and come back. */
  refuse(a: number, b: number): void {
    this.touch();
    const A = this.at[a];
    const B = this.at[b];
    if (!A || !B || this.reduced) return;
    const now = performance.now();
    A.bounceAt = B.bounceAt = now;
    A.bc = b % SIZE;
    A.br = Math.floor(b / SIZE);
    B.bc = a % SIZE;
    B.br = Math.floor(a / SIZE);
    this.lean = { to: -0.12, at: now };
  }

  /**
   * The board as the game holds it, after a swap that did not reach the server:
   * if the screen is showing the swap, it is undone in sight; anything else snaps.
   */
  restore(board: Board, a: number, b: number): void {
    const shown = this.shown();
    if (same(shown[a], board[b]) && same(shown[b], board[a])) void this.swap(a, b);
    else this.snap(board);
  }

  /** The game's board after a move. Snaps if the picture somehow drifted from it. */
  sync(board: Board): void {
    const shown = this.shown();
    if (board.some((piece, i) => !same(piece, shown[i]))) this.snap(board);
    this.hint = undefined;
  }

  /**
   * One cascade step: what cleared pops (with juice, beams for striped foods,
   * lightning for a bomb), what survived falls, new food drops in from above.
   * Resolves when the board has settled.
   */
  step(step: Step): Promise<void> {
    const now = performance.now();
    if (step.cleared.length === 0) return this.reshuffle(step.board, now);

    const before = this.shown();
    const plan = fallOf(before, step);
    const lay = this.lay;
    this.chain += 1;

    if (this.reduced || !lay) {
      this.at = step.board.map((piece, cell) => this.item(piece, cell));
      this.ghosts = [];
      if (this.chain >= 2) this.cheer(now);
      return Promise.resolve();
    }

    /* ── the clear ── */
    const cleared = new Set(step.cleared);
    for (const cell of step.cleared) {
      const item = this.at[cell];
      if (!item) continue;
      item.clearAt = now;
      this.ghosts.push(item);
      this.splash(cell, item.t, now + M.clear * 0.35);
    }
    for (const fire of plan.fired) {
      if (fire.kind === 'bomb') {
        this.zaps.push({ from: fire.cell, to: step.cleared.filter((c) => c !== fire.cell), t0: now });
        this.rings.push({ ...this.centre(fire.cell), t0: now, big: true });
        this.shake = { t0: now, amp: Math.max(3, lay.cell * 0.12) };
        this.hopAt = now;
      } else {
        this.beams.push({ cell: fire.cell, kind: fire.kind, t0: now });
        this.shake = { t0: now, amp: Math.max(2, lay.cell * 0.06) };
        /* Twinkles left along the line as the beam crosses it. */
        const row = Math.floor(fire.cell / SIZE);
        const col = fire.cell % SIZE;
        for (let k = 0; k < SIZE; k += 1) {
          const cell = fire.kind === 'row' ? row * SIZE + k : k * SIZE + col;
          const { x, y } = this.centre(cell);
          const reach = Math.abs(fire.kind === 'row' ? k - col : k - row);
          this.drops.push({
            x,
            y,
            vx: (Math.random() - 0.5) * lay.cell,
            vy: -lay.cell * (1 + Math.random()),
            r: lay.cell * 0.12,
            colour: this.sparkle(),
            t0: now + reach * 22,
            life: 0.45,
            shape: 1,
            spin: 0,
            gravity: lay.cell * 4,
          });
        }
      }
    }
    /* "+45" over the middle of what went. */
    let sx = 0;
    let sy = 0;
    for (const cell of step.cleared) {
      const c = this.centre(cell);
      sx += c.x;
      sy += c.y;
    }
    const n = step.cleared.length;
    this.floaters.push({
      x: sx / n,
      y: sy / n,
      text: `+${step.score}`,
      t0: now + M.clear * 0.3,
      size: lay.cell * Math.min(0.75, 0.42 + n * 0.012),
    });
    if (this.chain >= 2 || plan.fired.length > 0 || plan.made.length > 0) this.cheer(now + M.clear * 0.5);
    if (this.chain >= 2) this.combo = { text: `×${this.chain}`, t0: now + M.clear * 0.4 };

    /* ── the fall ── */
    const fallAt = now + M.clear;
    const next: (Item | null)[] = new Array(SIZE * SIZE).fill(null);
    let longest = 0;
    for (let cell = 0; cell < SIZE * SIZE; cell += 1) {
      const landing = plan.landings[cell];
      const piece = step.board[cell];
      const row = Math.floor(cell / SIZE);
      const col = cell % SIZE;
      let item: Item;
      if (landing.was >= 0 && this.at[landing.was] && !cleared.has(landing.was)) {
        item = this.at[landing.was]!;
        if (item.t !== piece.t || item.s !== piece.s) {
          item.t = piece.t;
          item.s = piece.s;
          item.flashAt = fallAt - M.clear * 0.45;
          this.rings.push({ ...this.centre(landing.was), t0: item.flashAt, big: false });
        }
      } else {
        item = this.item(piece, cell);
      }
      const drop = row - landing.fromRow;
      if (drop > 0) {
        item.c0 = item.c1 = col;
        item.r0 = landing.fromRow;
        item.r1 = row;
        item.t0 = fallAt;
        item.dur = M.fallBase + M.fallPerCell * drop;
        item.how = 'fall';
        longest = Math.max(longest, item.dur);
      }
      next[cell] = item;
    }
    this.at = next;
    return after(M.clear + longest + M.land * 0.6);
  }

  /* ── the clock ──────────────────────────────────────────────────────────── */

  resize(width: number, height: number, ratio: number): void {
    this.ratio = ratio;
    const el = this.board();
    if (!el) return;
    const bs = el.offsetWidth;
    const bx = el.offsetLeft;
    const by = el.offsetTop;
    const frame = bs * L.frame;
    const is = bs - 2 * frame;
    const cell = is / SIZE;
    const size = Math.max(L.picoMin, Math.min(L.picoMax, bs * L.pico));
    this.lay = {
      w: width,
      h: height,
      bx,
      by,
      bs,
      frame,
      ix: bx + frame,
      iy: by + frame,
      is,
      cell,
      food: cell * L.food,
      awning: Math.max(30, Math.min(58, by * 0.42)),
      counterTop: by + bs - frame * 0.4,
      pico: { x: bx + size * 0.44, feet: by + frame * 0.5, size },
      wide: bx >= 120,
    };
    this.sky = this.set = this.top = null;
    this.sprites.clear();
  }

  paint(ctx: Ctx, now: number): void {
    const lay = this.lay;
    if (!lay || lay.bs <= 0) return;
    const p = STALL.palette[this.theme];
    const t = this.reduced ? 0 : (now - this.epoch) / 1000;

    if (!this.sky) this.sky = this.paintSky(lay, p);
    ctx.drawImage(this.sky, 0, 0, lay.w, lay.h);
    this.paintWeather(ctx, lay, p, t);
    if (!this.set) this.set = this.paintSet(lay, p);
    ctx.drawImage(this.set, 0, 0, lay.w, lay.h);

    /* The board shakes when a bomb or a striped food goes off. */
    const sh = clamp01((now - this.shake.t0) / 320);
    const amp = sh >= 1 ? 0 : this.shake.amp * (1 - sh);
    const ox = amp ? Math.sin(now * 0.09) * amp : 0;
    const oy = amp ? Math.cos(now * 0.11) * amp * 0.6 : 0;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    roundedRect(ctx, lay.ix, lay.iy, lay.is, lay.is, lay.cell * 0.18);
    ctx.clip();
    this.paintMarks(ctx, lay, now, t);
    this.paintItems(ctx, lay, p, now, t);
    this.paintBeams(ctx, lay, now);
    ctx.restore();

    if (!this.top) this.top = this.paintAwning(lay, p);
    ctx.drawImage(this.top, 0, 0, lay.w, lay.h);
    this.paintLights(ctx, lay, p, t);
    this.paintPico(ctx, lay, p, now, t);
    this.paintEffects(ctx, lay, p, now);
  }

  /* ── state helpers ─────────────────────────────────────────────────────── */

  private item(piece: Piece, cell: number): Item {
    const col = cell % SIZE;
    const row = Math.floor(cell / SIZE);
    return {
      id: nextId++,
      t: piece.t,
      s: piece.s,
      c0: col,
      r0: row,
      c1: col,
      r1: row,
      t0: 0,
      dur: 0,
      how: 'fall',
      lift: false,
      clearAt: -1,
      growAt: -1,
      outAt: -1,
      flashAt: -1,
      bounceAt: -1,
      bc: col,
      br: row,
    };
  }

  private tween(item: Item, to: number, now: number, dur: number, how: Item['how'], lift: boolean): void {
    const pos = this.posOf(item, now);
    item.c0 = pos.c;
    item.r0 = pos.r;
    item.c1 = to % SIZE;
    item.r1 = Math.floor(to / SIZE);
    item.t0 = now;
    item.dur = this.reduced ? 0 : dur;
    item.how = how;
    item.lift = lift;
  }

  private shown(): Board {
    return this.at.map((item) => (item ? { t: item.t, s: item.s } : { t: 0, s: 0 }));
  }

  private centre(cell: number): { x: number; y: number } {
    const lay = this.lay!;
    return {
      x: lay.ix + ((cell % SIZE) + 0.5) * lay.cell,
      y: lay.iy + (Math.floor(cell / SIZE) + 0.5) * lay.cell,
    };
  }

  /** Where an item is drawn now, in cells. */
  private posOf(item: Item, now: number): { c: number; r: number; k: number } {
    if (item.dur <= 0) return { c: item.c1, r: item.r1, k: 1 };
    const u = clamp01((now - item.t0) / item.dur);
    const k = item.how === 'swap' ? easeInOutCubic(u) : easeInCubic(u);
    return { c: lerp(item.c0, item.c1, k), r: lerp(item.r0, item.r1, k), k: u };
  }

  /** A twinkle's colour: white light at dusk, the accent on a noon cloth where white would vanish. */
  private sparkle(): string {
    return this.theme === 'dark' ? '#ffffff' : THEMES.light.primary;
  }

  private cheer(at: number): void {
    this.cheerUntil = Math.max(this.cheerUntil, at + M.cheer);
  }

  private reshuffle(board: Board, now: number): Promise<void> {
    if (this.reduced) {
      this.snap(board);
      return Promise.resolve();
    }
    for (const item of this.at) {
      if (!item) continue;
      item.outAt = now;
      this.ghosts.push(item);
    }
    this.at = board.map((piece, cell) => {
      const item = this.item(piece, cell);
      item.growAt = now + M.shuffleOut + ((cell % SIZE) + Math.floor(cell / SIZE)) * 16;
      return item;
    });
    return after(M.shuffleOut + M.shuffleIn + 14 * 16);
  }

  private splash(cell: number, kind: number, at: number): void {
    const lay = this.lay!;
    const { x, y } = this.centre(cell);
    const colour = juiceOf(kind);
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * TAU + Math.random() * 0.7;
      const speed = lay.cell * (2.2 + Math.random() * 2.4);
      const twinkle = k === 0 || k === 4;
      this.drops.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - lay.cell * 2.2,
        r: lay.cell * (twinkle ? 0.11 : 0.05 + Math.random() * 0.045),
        colour: twinkle ? this.sparkle() : colour,
        t0: at,
        life: 0.5 + Math.random() * 0.35,
        shape: twinkle ? 1 : 0,
        spin: 0,
        gravity: lay.cell * 22,
      });
    }
  }

  private confetti(at: number): void {
    const lay = this.lay;
    if (!lay) return;
    const p = STALL.palette[this.theme];
    for (let k = 0; k < 60; k += 1) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = lay.bs * (0.9 + Math.random() * 1.1);
      this.drops.push({
        x: lay.bx + lay.bs * (0.2 + Math.random() * 0.6),
        y: lay.iy + lay.is * 0.6,
        vx: Math.cos(a) * speed * 0.6,
        vy: Math.sin(a) * speed,
        r: lay.cell * (0.08 + Math.random() * 0.06),
        colour: p.confetti[k % p.confetti.length],
        t0: at + Math.random() * 200,
        life: 1.6 + Math.random() * 0.8,
        shape: 2,
        spin: (Math.random() - 0.5) * 14,
        gravity: lay.bs * 1.4,
      });
    }
  }

  /** The first move on the board, for the idle hint — the same rule the game checks a swap with. */
  private findHint(): [number, number] | null {
    const board = this.shown();
    for (let cell = 0; cell < SIZE * SIZE; cell += 1) {
      if (cell % SIZE < SIZE - 1 && canSwap(board, cell, cell + 1)) return [cell, cell + 1];
      if (cell < SIZE * (SIZE - 1) && canSwap(board, cell, cell + SIZE)) return [cell, cell + SIZE];
    }
    return null;
  }

  private sprite(kind: number, special: number): HTMLCanvasElement {
    const key = `${kind}|${special}`;
    const hit = this.sprites.get(key);
    if (hit) return hit;
    const el = foodSprite(kind, special, this.lay!.food, this.ratio);
    this.sprites.set(key, el);
    return el;
  }

  /* ── the sky and the set ────────────────────────────────────────────────── */

  private canvas(lay: Layout): { el: HTMLCanvasElement; ctx: Ctx } {
    const el = document.createElement('canvas');
    el.width = Math.max(1, Math.round(lay.w * this.ratio));
    el.height = Math.max(1, Math.round(lay.h * this.ratio));
    const ctx = el.getContext('2d')!;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    return { el, ctx };
  }

  private paintSky(lay: Layout, p: StallPalette): HTMLCanvasElement {
    const { el, ctx } = this.canvas(lay);
    const g = ctx.createLinearGradient(0, 0, 0, lay.counterTop);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(1, p.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, lay.w, lay.h);
    /* The sun or the moon, high on the side Pico is not on. */
    const ox = lay.wide ? lay.w - lay.bx * 0.45 : lay.bx + lay.bs * 0.78;
    const oy = lay.awning + Math.max(18, lay.by * 0.32);
    const or = Math.max(9, Math.min(26, lay.bs * 0.045));
    const halo = ctx.createRadialGradient(ox, oy, or * 0.5, ox, oy, or * 4.5);
    halo.addColorStop(0, withAlpha(p.orbGlow, this.theme === 'dark' ? 0.25 : 0.7));
    halo.addColorStop(1, withAlpha(p.orbGlow, 0));
    ctx.fillStyle = p.orb;
    ctx.beginPath();
    ctx.arc(ox, oy, or, 0, TAU);
    ctx.fill();
    if (this.theme === 'dark') {
      /* A crescent: the moon's dark side is painted with the sky itself (the
         same gradient), clipped to the disc, so no edge of it shows. */
      ctx.save();
      ctx.beginPath();
      ctx.arc(ox, oy, or + 0.5, 0, TAU);
      ctx.clip();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox + or * 0.5, oy - or * 0.3, or * 0.86, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    /* The glow last, over both halves, the way light from a bright disc lies over the dark of the sky. */
    ctx.fillStyle = halo;
    ctx.fillRect(ox - or * 5, oy - or * 5, or * 10, or * 10);
    return el;
  }

  /** Clouds drifting by day; stars twinkling at dusk. */
  private paintWeather(ctx: Ctx, lay: Layout, p: StallPalette, t: number): void {
    const band = lay.counterTop - lay.awning;
    if (this.theme === 'dark') {
      ctx.fillStyle = p.cloud;
      for (let k = 0; k < 26; k += 1) {
        const x = hash01(k * 5 + 1) * lay.w;
        const y = lay.awning + hash01(k * 5 + 2) * band * 0.55;
        const a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * (0.7 + hash01(k) * 1.4) + k));
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + hash01(k * 9) * 0.9, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = withAlpha(p.cloud, 0.9);
    for (let k = 0; k < 3; k += 1) {
      const span = lay.w + 160;
      const x = ((hash01(k * 3 + 7) * span + t * (6 + k * 3)) % span) - 80;
      const y = lay.awning + band * (0.12 + k * 0.1);
      const s = Math.max(14, lay.bs * (0.05 + hash01(k) * 0.03));
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.6, s * 0.55, 0, 0, TAU);
      ctx.ellipse(x - s * 0.6, y - s * 0.25, s * 0.7, s * 0.55, 0, 0, TAU);
      ctx.ellipse(x + s * 0.4, y - s * 0.45, s * 0.85, s * 0.7, 0, 0, TAU);
      ctx.fill();
    }
  }

  /** Everything that stands still between the sky and the awning. */
  private paintSet(lay: Layout, p: StallPalette): HTMLCanvasElement {
    const { el, ctx } = this.canvas(lay);
    const { w, h, bx, by, bs } = lay;
    const horizon = by + bs * 0.42;

    /* Rooftops, far: a row of gables, with lit windows at dusk. */
    ctx.fillStyle = p.far;
    ctx.beginPath();
    ctx.moveTo(0, h);
    let x = -10;
    let k = 0;
    while (x < w + 10) {
      const bw = Math.max(26, bs * (0.08 + hash01(k * 3) * 0.07));
      const bh = bs * (0.1 + hash01(k * 3 + 1) * 0.16);
      const top = horizon - bh;
      ctx.lineTo(x, top);
      if (hash01(k * 3 + 2) > 0.45) ctx.lineTo(x + bw / 2, top - bw * 0.35);
      ctx.lineTo(x + bw, top);
      x += bw;
      k += 1;
    }
    ctx.lineTo(w + 10, h);
    ctx.closePath();
    ctx.fill();
    if (this.theme === 'dark') {
      ctx.fillStyle = withAlpha(p.glow, 0.55);
      for (let j = 0; j < 40; j += 1) {
        if (hash01(j * 11) < 0.55) continue;
        const wx = hash01(j * 7 + 3) * w;
        const wy = horizon - bs * 0.02 - hash01(j * 13 + 1) * bs * 0.1;
        ctx.fillRect(Math.round(wx), Math.round(wy), 3, 4);
      }
    }

    /* Trees and hedges, nearer: soft bumps along the counter. */
    ctx.fillStyle = p.near;
    const ground = by + bs * 0.62;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, ground);
    for (let j = 0, xx = 0; xx < w + 40; j += 1) {
      const r = Math.max(18, bs * (0.06 + hash01(j * 5 + 4) * 0.05));
      ctx.arc(xx + r * 0.8, ground - r * 0.2, r, Math.PI, 0);
      xx += r * 1.5;
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    /* The stall's posts, with a pennant string between them, when there is room. */
    if (lay.wide) {
      const postW = Math.max(8, bs * 0.022);
      for (const px of [bx * 0.18, w - bx * 0.18]) {
        const g = ctx.createLinearGradient(px - postW / 2, 0, px + postW / 2, 0);
        g.addColorStop(0, p.woodLit);
        g.addColorStop(1, p.woodLow);
        ctx.fillStyle = g;
        ctx.fillRect(px - postW / 2, 0, postW, lay.counterTop);
      }
    }

    /* The counter the crate stands on: its top, then its front planks. */
    const ct = lay.counterTop;
    const top = ctx.createLinearGradient(0, ct, 0, ct + 10);
    top.addColorStop(0, p.woodLit);
    top.addColorStop(1, p.wood);
    ctx.fillStyle = top;
    ctx.fillRect(0, ct, w, 10);
    ctx.fillStyle = p.wood;
    ctx.fillRect(0, ct + 10, w, h - ct - 10);
    ctx.fillStyle = withAlpha(p.woodLow, 0.7);
    const plank = Math.max(14, bs * 0.045);
    for (let y = ct + 10 + plank; y < h; y += plank) ctx.fillRect(0, Math.round(y), w, 1.5);
    const lip = ctx.createLinearGradient(0, ct + 10, 0, ct + 20);
    lip.addColorStop(0, withAlpha(p.shadow, 0.3));
    lip.addColorStop(1, withAlpha(p.shadow, 0));
    ctx.fillStyle = lip;
    ctx.fillRect(0, ct + 10, w, 10);

    if (lay.wide) {
      this.paintCrate(ctx, lay, p, bx * 0.5, 0);
      this.paintCrate(ctx, lay, p, w - bx * 0.5, 5);
    }

    paintCrateOn(ctx, lay, p, this.theme === 'dark', SIZE);
    return el;
  }

  /** A crate of produce on the counter, beside the tray. */
  private paintCrate(ctx: Ctx, lay: Layout, p: StallPalette, cx: number, kind: number): void {
    const w = Math.min(lay.bx * 0.72, lay.bs * 0.3);
    const h = w * 0.5;
    const base = lay.counterTop + 3;
    const x = cx - w / 2;
    const y = base - h;
    /* The heap first, so the crate's front slats sit over it. */
    const s = w * 0.3;
    for (let k = 0; k < 7; k += 1) {
      const row = k < 4 ? 0 : 1;
      const col = row === 0 ? k : k - 4 + 0.5;
      const fx = x + w * 0.14 + col * (w * 0.24);
      const fy = y - row * s * 0.52 + s * 0.08;
      const sprite = foodSprite(kind, 0, s, this.ratio);
      ctx.drawImage(sprite, fx - s / 2, fy - s / 2, s, s);
    }
    ctx.fillStyle = withAlpha(p.shadow, 0.25);
    ctx.fillRect(x + 3, base - 2, w - 6, 4);
    for (let k = 0; k < 2; k += 1) {
      ctx.fillStyle = k ? p.wood : p.woodLit;
      ctx.beginPath();
      roundedRect(ctx, x, y + k * (h / 2) + 1, w, h / 2 - 2, 2);
      ctx.fill();
    }
    ctx.fillStyle = p.woodLow;
    ctx.fillRect(x, y, 4, h);
    ctx.fillRect(x + w - 4, y, 4, h);
  }

  /** The awning and its scalloped valance, across the top of the stage. */
  private paintAwning(lay: Layout, p: StallPalette): HTMLCanvasElement {
    const { el, ctx } = this.canvas(lay);
    const { w } = lay;
    const H = lay.awning;
    const roll = H * 0.22;
    const stripe = Math.max(20, Math.min(40, lay.bs * 0.075));
    const count = Math.ceil(w / stripe) + 1;
    const start = (w - count * stripe) / 2;
    /* Its shadow on whatever is behind. */
    ctx.fillStyle = withAlpha(p.shadow, 0.18);
    ctx.fillRect(0, H, w, stripe * 0.4);
    for (let k = 0; k < count; k += 1) {
      const x0 = start + k * stripe;
      const a = k % 2 === 0;
      const g = ctx.createLinearGradient(0, roll, 0, H);
      g.addColorStop(0, a ? p.stripeALow : p.stripeBLow);
      g.addColorStop(0.35, a ? p.stripeA : p.stripeB);
      g.addColorStop(1, a ? p.stripeA : p.stripeB);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0 + stripe, 0);
      ctx.lineTo(x0 + stripe, H);
      ctx.arc(x0 + stripe / 2, H, stripe / 2, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      /* The scallop's underside, a shade darker. */
      ctx.fillStyle = withAlpha(p.shadow, 0.14);
      ctx.beginPath();
      ctx.arc(x0 + stripe / 2, H, stripe / 2, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    /* The rolled top. */
    const rg = ctx.createLinearGradient(0, 0, 0, roll);
    rg.addColorStop(0, p.woodLit);
    rg.addColorStop(1, p.woodLow);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, roll);
    ctx.fillStyle = withAlpha('#ffffff', 0.25);
    ctx.fillRect(0, roll * 0.25, w, 1.5);
    return el;
  }

  /** String lights under the awning's edge. */
  private paintLights(ctx: Ctx, lay: Layout, p: StallPalette, t: number): void {
    const { w } = lay;
    const y0 = lay.awning + Math.max(10, lay.bs * 0.035);
    const sag = Math.max(8, Math.min(22, lay.by * 0.14));
    const yAt = (x: number) => y0 + sag * 4 * (x / w) * (1 - x / w);
    ctx.strokeStyle = p.wire;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      if (x === 0) ctx.moveTo(x, yAt(x));
      else ctx.lineTo(x, yAt(x));
    }
    ctx.stroke();
    const gap = Math.max(26, lay.bs * 0.07);
    const n = Math.floor(w / gap);
    const s0 = (w - (n - 1) * gap) / 2;
    const r = Math.max(3, lay.bs * 0.009);
    for (let k = 0; k < n; k += 1) {
      const x = s0 + k * gap;
      const y = yAt(x) + r * 1.6;
      const flick = 0.75 + 0.25 * Math.sin(t * (1.1 + hash01(k) * 1.7) + k * 2.3);
      if (p.glowAlpha > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
        g.addColorStop(0, withAlpha(p.glow, p.glowAlpha * flick));
        g.addColorStop(1, withAlpha(p.glow, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
        ctx.restore();
      }
      ctx.fillStyle = p.wire;
      ctx.fillRect(x - r * 0.45, y - r * 1.7, r * 0.9, r * 0.8);
      ctx.fillStyle = p.bulbs[k % p.bulbs.length];
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.85, r * 1.05, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = withAlpha('#ffffff', 0.7);
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.28, 0, TAU);
      ctx.fill();
    }
  }

  /* ── the board ──────────────────────────────────────────────────────────── */

  /** The selection, the hover and the hint, under the foods. */
  private paintMarks(ctx: Ctx, lay: Layout, now: number, t: number): void {
    const accent = THEMES[this.theme].primary;
    const mark = (cell: number, strength: number, wide: number) => {
      const c = cell % SIZE;
      const r = Math.floor(cell / SIZE);
      const inset = lay.cell * 0.06;
      ctx.strokeStyle = withAlpha(accent, strength);
      ctx.lineWidth = wide;
      ctx.beginPath();
      roundedRect(ctx, lay.ix + c * lay.cell + inset, lay.iy + r * lay.cell + inset, lay.cell - inset * 2, lay.cell - inset * 2, lay.cell * 0.22);
      ctx.stroke();
      ctx.fillStyle = withAlpha(accent, strength * 0.16);
      ctx.fill();
    };
    if (this.hovered !== null && this.hovered !== this.selected && !this.busy) mark(this.hovered, 0.45, 1.5);
    if (this.selected !== null) mark(this.selected, 0.75 + 0.25 * Math.sin(t * 6), Math.max(2, lay.cell * 0.07));

    if (this.busy || this.over || this.reduced) return;
    if (now - this.lastInput < M.hintAfter) return;
    if (this.hint === undefined) this.hint = this.findHint();
    if (!this.hint) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    for (const cell of this.hint) mark(cell, 0.25 + 0.35 * pulse, 1.5);
  }

  private paintItems(ctx: Ctx, lay: Layout, p: StallPalette, now: number, t: number): void {
    const hinting = !this.busy && !this.over && this.hint && now - this.lastInput >= M.hintAfter;
    const wiggle = hinting && !this.reduced ? Math.sin(t * 14) * Math.max(0, Math.sin(t * 2.4)) * 0.16 : 0;
    const items: Item[] = [];
    for (const item of this.at) if (item) items.push(item);
    /* Ghosts finish their exit, then go. */
    this.ghosts = this.ghosts.filter((g) =>
      g.clearAt >= 0 ? now - g.clearAt < M.clear : now - g.outAt < M.shuffleOut,
    );
    items.push(...this.ghosts);
    items.sort((a, b) => order(a, now) - order(b, now));

    const food = lay.food;
    for (const item of items) {
      const pos = this.posOf(item, now);
      let c = pos.c;
      let r = pos.r;
      let scale = 1;
      let squashX = 1;
      let squashY = 1;
      let spin = 0;
      let alpha = 1;
      let flash = 0;

      if (item.bounceAt >= 0) {
        const u = clamp01((now - item.bounceAt) / M.refuse);
        if (u < 1) {
          const k = Math.sin(u * Math.PI) * 0.38;
          c = lerp(c, item.bc, k);
          r = lerp(r, item.br, k);
          spin = Math.sin(u * Math.PI * 3) * 0.12 * (1 - u);
        } else item.bounceAt = -1;
      }
      if (item.how === 'swap' && pos.k < 1) {
        const lift = Math.sin(pos.k * Math.PI);
        scale *= item.lift ? 1 + lift * 0.16 : 1 - lift * 0.08;
      }
      if (item.how === 'fall' && item.dur > 0) {
        const since = now - (item.t0 + item.dur);
        if (since >= 0 && since < M.land) {
          const u = since / M.land;
          const k = Math.sin(u * Math.PI) * (1 - u) * 0.22;
          squashX = 1 + k;
          squashY = 1 - k;
        }
      }
      if (item.clearAt >= 0) {
        const u = clamp01((now - item.clearAt) / M.clear);
        scale *= u < 0.35 ? 1 + easeOutCubic(u / 0.35) * 0.22 : (1.22 * (1 - easeInCubic((u - 0.35) / 0.65)));
        flash = u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6;
        spin += u * 0.4;
      }
      if (item.outAt >= 0) {
        const u = clamp01((now - item.outAt) / M.shuffleOut);
        scale *= 1 - easeInCubic(u);
        spin += u * 1.6;
      }
      if (item.growAt >= 0) {
        const u = clamp01((now - item.growAt) / M.shuffleIn);
        if (now < item.growAt) continue;
        scale *= u >= 1 ? 1 : Math.max(0, easeOutBack(u));
      }
      if (item.flashAt >= 0) {
        const u = (now - item.flashAt) / 420;
        if (u >= 0 && u < 1) {
          scale *= 1 + Math.sin(u * Math.PI) * 0.18;
          flash = Math.max(flash, 1 - u);
        }
      }
      const isSel = this.selected !== null && this.at[this.selected] === item && !this.busy;
      if (isSel) {
        scale *= 1.08;
        r -= (0.5 + 0.5 * Math.sin(t * 6)) * 0.05;
      }
      if (hinting && this.hint && (this.at[this.hint[0]] === item || this.at[this.hint[1]] === item)) spin += wiggle;
      if (scale <= 0.02) continue;

      const x = lay.ix + (c + 0.5) * lay.cell;
      const y = lay.iy + (r + 0.5) * lay.cell;
      const special = item.s;

      /* Its shadow on the cloth: smaller and fainter while it is lifted or falling. */
      const airborne = item.how === 'fall' && pos.k < 1 && item.dur > 0;
      ctx.globalAlpha = alpha * (airborne ? 0.25 : 0.5) * Math.min(1, scale);
      ctx.fillStyle = withAlpha(p.shadow, this.theme === 'dark' ? 0.55 : 0.22);
      ctx.beginPath();
      ctx.ellipse(x, lay.iy + (Math.round(r) + 0.5) * lay.cell + food * 0.38, food * 0.34 * scale, food * 0.09 * scale, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = alpha;

      /* A special glows on the cloth, so it is found before it is read. */
      if (special !== 0 && item.clearAt < 0) {
        const accent = THEMES[this.theme].primary;
        const breathe = this.reduced ? 0.6 : 0.5 + 0.3 * Math.sin(t * 3 + item.id);
        const g = ctx.createRadialGradient(x, y, food * 0.2, x, y, food * 0.7);
        g.addColorStop(0, withAlpha(special === BOMB ? STALL.bomb.spark : accent, 0.45 * breathe));
        g.addColorStop(1, withAlpha(special === BOMB ? STALL.bomb.spark : accent, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, food * 0.7, 0, TAU);
        ctx.fill();
      }

      const sprite = this.sprite(item.t, special);
      ctx.save();
      ctx.translate(x, y + (squashY < 1 ? food * (1 - squashY) * 0.4 : 0));
      if (spin) ctx.rotate(spin);
      ctx.scale(scale * squashX, scale * squashY);
      ctx.drawImage(sprite, -food / 2, -food / 2, food, food);
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.55;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sprite, -food / 2, -food / 2, food, food);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      /* The bomb's fuse sparks; the striped foods carry arrows of their line. */
      if (special === BOMB && item.clearAt < 0 && scale > 0.5) this.spark(ctx, x, y, food * scale, t);
      if ((special === ROW || special === COL) && item.clearAt < 0 && scale > 0.5) this.arrows(ctx, x, y, food * scale, special, t);
    }
  }

  private spark(ctx: Ctx, x: number, y: number, s: number, t: number): void {
    const fx = x + s * 0.315;
    const fy = y - s * 0.415;
    const flick = this.reduced ? 1 : 0.7 + 0.3 * Math.sin(t * 23) * Math.sin(t * 7.1);
    ctx.fillStyle = withAlpha(STALL.bomb.sparkHot, 0.85);
    starAt(ctx, fx, fy, s * 0.13 * flick, s * 0.03);
    ctx.fillStyle = STALL.bomb.spark;
    starAt(ctx, fx, fy, s * 0.08 * flick, s * 0.02);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(fx, fy, s * 0.025, 0, TAU);
    ctx.fill();
  }

  /** Two small chevrons pointing along the line a striped food will clear. */
  private arrows(ctx: Ctx, x: number, y: number, s: number, special: number, t: number): void {
    const accent = THEMES[this.theme].primary;
    const out = s * (0.52 + (this.reduced ? 0 : 0.03 * Math.sin(t * 5)));
    const a = s * 0.09;
    ctx.fillStyle = accent;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      if (special === ROW) {
        const tip = x + dir * out;
        ctx.moveTo(tip, y);
        ctx.lineTo(tip - dir * a, y - a);
        ctx.lineTo(tip - dir * a, y + a);
      } else {
        const tip = y + dir * out;
        ctx.moveTo(x, tip);
        ctx.lineTo(x - a, tip - dir * a);
        ctx.lineTo(x + a, tip - dir * a);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private paintBeams(ctx: Ctx, lay: Layout, now: number): void {
    if (this.beams.length === 0 && this.zaps.length === 0) return;
    const accent = THEMES[this.theme].primary;
    /* Light at dusk is added; on a noon cloth white is invisible, so the beam is
       the accent laid over it instead. */
    const dusk = this.theme === 'dark';
    const core = dusk ? '#ffffff' : accent;
    this.beams = this.beams.filter((b) => now - b.t0 < M.beam);
    ctx.save();
    ctx.globalCompositeOperation = dusk ? 'lighter' : 'source-over';
    for (const beam of this.beams) {
      const u = (now - beam.t0) / M.beam;
      const { x, y } = this.centre(beam.cell);
      const reach = easeOutCubic(Math.min(1, u * 2.2)) * lay.is;
      const fade = u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5;
      const thick = lay.cell * (0.55 - u * 0.3);
      const g =
        beam.kind === 'row'
          ? ctx.createLinearGradient(0, y - thick, 0, y + thick)
          : ctx.createLinearGradient(x - thick, 0, x + thick, 0);
      g.addColorStop(0, withAlpha(accent, 0));
      g.addColorStop(0.3, withAlpha(accent, 0.45 * fade));
      g.addColorStop(0.5, withAlpha(core, 0.9 * fade));
      g.addColorStop(0.7, withAlpha(accent, 0.45 * fade));
      g.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = g;
      if (beam.kind === 'row') ctx.fillRect(Math.max(lay.ix, x - reach), y - thick, Math.min(lay.is, reach * 2), thick * 2);
      else ctx.fillRect(x - thick, Math.max(lay.iy, y - reach), thick * 2, Math.min(lay.is, reach * 2));
    }
    this.zaps = this.zaps.filter((z) => now - z.t0 < 420);
    for (const zap of this.zaps) {
      const u = (now - zap.t0) / 420;
      const from = this.centre(zap.from);
      ctx.strokeStyle = withAlpha(core, 0.9 * (1 - u));
      ctx.lineWidth = Math.max(1.5, lay.cell * 0.06) * (1 - u * 0.5);
      ctx.lineJoin = 'round';
      for (const cell of zap.to) {
        const to = this.centre(cell);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        const segs = 5;
        for (let k = 1; k < segs; k += 1) {
          const f = k / segs;
          const jit = (hash01(cell * 31 + k + Math.floor(now / 60)) - 0.5) * lay.cell * 0.5;
          ctx.lineTo(lerp(from.x, to.x, f) + jit, lerp(from.y, to.y, f) - jit);
        }
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ── Pico and the air ───────────────────────────────────────────────────── */

  private pico: DrawPicoOptions = { x: 0, y: 0, size: 0, anchor: 'box', pose: 'idle', blink: 0, facing: 1, tilt: 0, flap: 0 };

  private paintPico(ctx: Ctx, lay: Layout, p: StallPalette, now: number, t: number): void {
    const { size } = lay.pico;
    const hop = this.reduced ? 1 : clamp01((now - this.hopAt) / 520);
    const lift = hop < 1 ? Math.sin(hop * Math.PI) * size * 0.32 : 0;
    const cheering = now < this.cheerUntil;
    const bob = this.reduced ? 0 : ((1 - Math.cos((TAU * t) / 2)) / 2) * size * 0.012;
    ctx.fillStyle = withAlpha(p.shadow, 0.28 * (1 - lift / (size * 0.4)));
    ctx.beginPath();
    ctx.ellipse(lay.pico.x - size * 0.02, lay.pico.feet + 1, size * 0.2 * (1 - lift / size), size * 0.04, 0, 0, TAU);
    ctx.fill();
    const leanAge = (now - this.lean.at) / 1000;
    const leanK = leanAge < 0 ? 0 : leanAge < 0.12 ? leanAge / 0.12 : Math.exp(-(leanAge - 0.12) * 2.4);
    /* A refused swap: a little shake of the head, not a frown. */
    const shakeNo = this.lean.to < 0 && leanAge < 0.5 ? Math.sin(leanAge * 30) * 0.08 * (1 - leanAge / 0.5) : 0;
    const o = this.pico;
    o.size = size;
    o.x = lay.pico.x;
    o.y = lay.pico.feet - size * 0.36 - lift + bob;
    const pose: PicoPose = hop < 1 ? 'flap' : cheering ? 'happy' : 'idle';
    o.pose = pose;
    o.flap = ((now - this.hopAt) / 1000) * 6;
    o.blink = this.reduced ? 0 : picoBlinkAt(t);
    const base = 0.1;
    o.tilt = this.reduced ? base : base + (Math.max(0, this.lean.to) - base) * leanK * 0.8 + shakeNo;
    drawPico(ctx, o);

    /* The combo bubble beside his head. */
    const u = (now - this.combo.t0) / 1100;
    if (u >= 0 && u < 1 && !this.reduced) {
      const pop = u < 0.2 ? easeOutBack(u / 0.2) : u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
      const bx = o.x + size * 0.48;
      const by = o.y - size * 0.3;
      const fs = Math.max(13, size * 0.24);
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(pop, pop);
      ctx.font = `600 ${Math.round(fs)}px ${this.font}`;
      const tw = ctx.measureText(this.combo.text).width;
      const w = tw + fs * 0.9;
      const h = fs * 1.5;
      ctx.fillStyle = withAlpha(p.shadow, 0.2);
      ctx.beginPath();
      roundedRect(ctx, 1, -h / 2 + 2, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = p.bubble;
      ctx.beginPath();
      roundedRect(ctx, 0, -h / 2, w, h, h / 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(h * 0.2, h * 0.25);
      ctx.lineTo(-h * 0.25, h * 0.5);
      ctx.lineTo(h * 0.45, h * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.bubbleInk;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.combo.text, fs * 0.45, fs * 0.04);
      ctx.restore();
    }
  }

  private paintEffects(ctx: Ctx, lay: Layout, p: StallPalette, now: number): void {
    if (this.rings.length) {
      this.rings = this.rings.filter((ring) => now - ring.t0 < (ring.big ? 600 : 450));
      for (const ring of this.rings) {
        const life = ring.big ? 600 : 450;
        const u = (now - ring.t0) / life;
        if (u < 0) continue;
        const reach = (ring.big ? lay.cell * 3.2 : lay.cell * 0.9) * easeOutCubic(u);
        ctx.strokeStyle = withAlpha(ring.big ? STALL.bomb.spark : THEMES[this.theme].primary, (1 - u) * 0.9);
        ctx.lineWidth = Math.max(1.5, lay.cell * (ring.big ? 0.12 : 0.07)) * (1 - u);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, Math.max(1, reach), 0, TAU);
        ctx.stroke();
      }
    }
    if (this.drops.length) {
      this.drops = this.drops.filter((d) => (now - d.t0) / 1000 < d.life);
      for (const d of this.drops) {
        const s = (now - d.t0) / 1000;
        if (s < 0) continue;
        const u = s / d.life;
        const x = d.x + d.vx * s * (d.shape === 2 ? 1 - u * 0.4 : 1);
        const y = d.y + d.vy * s + 0.5 * d.gravity * s * s;
        ctx.globalAlpha = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
        ctx.fillStyle = d.colour;
        if (d.shape === 0) {
          ctx.beginPath();
          ctx.arc(x, y, d.r * (1 - u * 0.5), 0, TAU);
          ctx.fill();
        } else if (d.shape === 1) {
          starAt(ctx, x, y, d.r * (1 - u * 0.4), d.r * 0.22);
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(d.spin * s);
          ctx.scale(1, Math.cos(d.spin * s * 1.3));
          ctx.fillRect(-d.r, -d.r * 0.5, d.r * 2, d.r);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
    if (this.floaters.length) {
      this.floaters = this.floaters.filter((f) => now - f.t0 < M.floater);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const f of this.floaters) {
        const u = (now - f.t0) / M.floater;
        if (u < 0) continue;
        const pop = u < 0.15 ? easeOutBack(u / 0.15) : 1;
        const y = f.y - easeOutCubic(u) * lay.cell * 0.9;
        ctx.globalAlpha = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
        ctx.font = `600 ${Math.round(f.size * pop)}px ${this.font}`;
        ctx.lineWidth = Math.max(3, f.size * 0.24);
        ctx.strokeStyle = p.floaterEdge;
        ctx.strokeText(f.text, f.x, y);
        ctx.fillStyle = p.floater;
        ctx.fillText(f.text, f.x, y);
      }
      ctx.globalAlpha = 1;
    }
  }
}

/** The crate's geometry: its box, its rim, and the cloth inside it. */
export interface CrateGeometry {
  bx: number;
  by: number;
  bs: number;
  frame: number;
  ix: number;
  iy: number;
  is: number;
  cell: number;
}

/** The crate `bs` across at `(bx, by)`, with `n` cells a side on its cloth. */
export function crateGeometry(bx: number, by: number, bs: number, n: number = SIZE): CrateGeometry {
  const frame = bs * L.frame;
  const is = bs - 2 * frame;
  return { bx, by, bs, frame, ix: bx + frame, iy: by + frame, is, cell: is / n };
}

/**
 * The crate tray and its gingham — the scene caches it with the rest of the
 * set, and the hover miniature paints a 4×4 corner of it directly. `n` is the
 * cells a side.
 */
export function paintCrateOn(ctx: Ctx, lay: CrateGeometry, p: StallPalette, dark: boolean, n: number): void {
  const { bx, by, bs, ix, iy, is, cell } = lay;
  /* The crate tray: its shadow, its sides, its rim, and the cloth. */
  ctx.save();
  ctx.fillStyle = withAlpha(p.shadow, dark ? 0.5 : 0.25);
  ctx.filter = `blur(${Math.max(4, bs * 0.02)}px)`;
  ctx.beginPath();
  ctx.ellipse(bx + bs / 2, by + bs + 2, bs * 0.52, Math.max(5, bs * 0.025), 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  const R = bs * 0.035;
  const thick = Math.max(4, bs * 0.018);
  ctx.fillStyle = p.woodLow;
  ctx.beginPath();
  roundedRect(ctx, bx, by + thick, bs, bs, R);
  ctx.fill();
  const rim = ctx.createLinearGradient(0, by, 0, by + bs);
  rim.addColorStop(0, p.woodLit);
  rim.addColorStop(1, p.wood);
  ctx.fillStyle = rim;
  ctx.beginPath();
  roundedRect(ctx, bx, by, bs, bs, R);
  ctx.fill();
  /* Grain, and a nail in each corner and halfway along each side. */
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, bx, by, bs, bs, R);
  ctx.clip();
  ctx.strokeStyle = withAlpha(p.woodLow, 0.3);
  ctx.lineWidth = 1;
  for (let j = 0; j < 18; j += 1) {
    const yy = by + (j + 0.5) * (bs / 18);
    ctx.beginPath();
    ctx.moveTo(bx, yy);
    for (let xx = 0; xx <= bs; xx += bs / 10) ctx.lineTo(bx + xx, yy + Math.sin(j * 1.3 + xx * 0.05) * 1.2);
    ctx.stroke();
  }
  ctx.restore();
  const f = lay.frame;
  ctx.fillStyle = p.nail;
  for (const [nx, ny] of [
    [0.5, 0.5], [bs / f - 0.5, 0.5], [0.5, bs / f - 0.5], [bs / f - 0.5, bs / f - 0.5],
    [bs / f / 2, 0.5], [bs / f / 2, bs / f - 0.5], [0.5, bs / f / 2], [bs / f - 0.5, bs / f / 2],
  ]) {
    ctx.beginPath();
    ctx.arc(bx + nx * f, by + ny * f, Math.max(1.2, f * 0.13), 0, TAU);
    ctx.fill();
  }

  /* The gingham: a band of colour every other row and every other column,
     darker where two cross — which is what gingham is. */
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, ix, iy, is, is, cell * 0.18);
  ctx.clip();
  ctx.fillStyle = p.cloth;
  ctx.fillRect(ix, iy, is, is);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const band = (r % 2) + (c % 2);
      if (band === 0) continue;
      ctx.fillStyle = band === 2 ? p.clothCross : p.clothBand;
      ctx.fillRect(ix + c * cell, iy + r * cell, cell + 0.5, cell + 0.5);
    }
  }
  /* The weave, as fine diagonal threads. */
  ctx.strokeStyle = p.weave;
  ctx.lineWidth = 1;
  const step = Math.max(3, cell / 9);
  ctx.beginPath();
  for (let d = -is; d < is; d += step) {
    ctx.moveTo(ix + d, iy);
    ctx.lineTo(ix + d + is, iy + is);
  }
  ctx.stroke();
  /* The rim's shadow falling onto the cloth. */
  const fall = ctx.createLinearGradient(0, iy, 0, iy + cell * 0.5);
  fall.addColorStop(0, withAlpha(p.shadow, 0.3));
  fall.addColorStop(1, withAlpha(p.shadow, 0));
  ctx.fillStyle = fall;
  ctx.fillRect(ix, iy, is, cell * 0.5);
  ctx.restore();
}

/** Draw order: resting under moving, the swapped-in food on top, clears above all. */
function order(item: Item, now: number): number {
  if (item.clearAt >= 0) return 4;
  if (item.how === 'swap' && now < item.t0 + item.dur) return item.lift ? 3 : 2;
  if (item.bounceAt >= 0) return 2;
  return 1;
}

function same(a: Piece | undefined, b: Piece | undefined): boolean {
  return !!a && !!b && a.t === b.t && a.s === b.s;
}

function starAt(ctx: Ctx, x: number, y: number, r: number, waist: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + waist, y - waist, x + r, y);
  ctx.quadraticCurveTo(x + waist, y + waist, x, y + r);
  ctx.quadraticCurveTo(x - waist, y + waist, x - r, y);
  ctx.quadraticCurveTo(x - waist, y - waist, x, y - r);
  ctx.fill();
}
