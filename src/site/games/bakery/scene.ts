import { drawPico, picoBlinkAt, type DrawPicoOptions } from '../../pico';
import { SIZE, type Board, type Direction } from '../board2048';
import {
  clamp01,
  displayFont,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  hash01,
  lerp,
  roundedRect,
  withAlpha,
  type SceneHost,
} from '../sceneStage';
import { BAKERY, type BakeryPalette, type BakeryTheme, type TileGlaze } from './config';
import { tracksFor } from './tracks';

/**
 * Pico's bakery — the picture of a 2048 round.
 *
 * A counter after hours (or first thing in the morning, in the light theme): a
 * wall of subway tiles, a garland, lamps on long cords, shelves of sweet jars
 * and a plant, a cup still steaming, and on the counter a wooden tray with an
 * enamel bed and sixteen sockets. The tiles are glazed pieces sitting in those
 * sockets. Pico stands on the tray's rim and watches.
 *
 * **It decides nothing.** `Merge2048.tsx` keeps the board, the score and the
 * moves in React state exactly as before and tells this object what happened —
 * `slide`, `spawn`, `settle`, `snap`, `refuse` — and this turns each of those
 * into motion against the clock. If the picture and the board ever disagree,
 * the board wins: `settle` snaps to the server's board whenever it is not the
 * one on screen plus one new tile.
 *
 * Painting is split by how often things change:
 *
 * - **the room** (wall, shelves, counter) is drawn once per size and theme into
 *   an offscreen canvas;
 * - **the tray** likewise, separately, so a refused swipe can nudge it;
 * - **each tile value** is one cached sprite at the current cell size, because
 *   a glazed tile is a dozen fills and a gradient and there can be sixteen;
 * - and **per frame** only what moves: tiles in flight, lamps, garland, steam,
 *   motes, crumbs, confetti and Pico.
 */

type Ctx = CanvasRenderingContext2D;

interface Piece {
  value: number;
  from: number;
  to: number;
  /** When it left `from`. */
  start: number;
  /** Shown from… */
  born: number;
  /** …until (the two halves of a merge vanish as they meet). */
  dies: number;
  /** A merge's swell starts here; -1 for none. */
  pop: number;
  /** A spawn grows in from here; -1 for none. */
  grow: number;
}

interface Crumb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  colour: string;
  t0: number;
  life: number;
  spin: number;
  /** 0 a crumb, 1 a twinkle, 2 a strip of confetti. */
  shape: 0 | 1 | 2;
  gravity: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  t0: number;
  size: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  t0: number;
}

interface Layout {
  w: number;
  h: number;
  /** The tray (the DOM board's box), in stage pixels. */
  bx: number;
  by: number;
  bs: number;
  frame: number;
  gap: number;
  cell: number;
  /** The tray's thickness, showing under its frame. */
  thick: number;
  /** Top-left of each socket. */
  cells: { x: number; y: number }[];
  /** The counter: back edge, front edge, and the front panel below. */
  counterBack: number;
  counterFront: number;
  pico: { x: number; feet: number; size: number };
  /** Whether the sides have room for shelves and props. */
  wide: boolean;
}

const TAU = Math.PI * 2;
const { motion: M, layout: L } = BAKERY;

export class BakeryScene implements SceneHost {
  /** The DOM board, whose box is the tray — read on resize, never per frame. */
  private readonly board: () => HTMLElement | null;
  private theme: BakeryTheme = 'dark';
  private reduced = false;
  private ratio = 1;
  private lay: Layout | null = null;
  private room: HTMLCanvasElement | null = null;
  private tray: HTMLCanvasElement | null = null;
  private sprites = new Map<number, HTMLCanvasElement>();
  private font = 'sans-serif';

  private pieces: Piece[] = [];
  private crumbs: Crumb[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private slideEnd = 0;
  private best = 0;
  private over = false;
  private cheerUntil = 0;
  private hopAt = -1e9;
  private lean = { to: 0, at: -1e9 };
  private nudge = { dx: 0, dy: 0, at: -1e9 };
  /** The clock Pico's blink and the ambient sway run on, from construction. */
  private readonly epoch = performance.now();

  constructor(board: () => HTMLElement | null) {
    this.board = board;
    this.font = displayFont();
    /* Canvas text does not wait for a web font: ask for the face, and redraw the
       tile sprites once it is in (the first frames use the fallback). */
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.load(`600 32px ${this.font}`).then(() => this.sprites.clear(), () => {});
    }
  }

  /* ── what the game tells it ─────────────────────────────────────────────── */

  setTheme(theme: BakeryTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.room = null;
    this.tray = null;
    this.sprites.clear();
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  setOver(over: boolean): void {
    this.over = over;
  }

  /** These tiles, at rest, with no motion. */
  snap(board: Board): void {
    this.pieces = board.flatMap((value, cell) => (value > 0 ? [this.still(value, cell)] : []));
    this.best = Math.max(0, ...board);
    this.slideEnd = 0;
  }

  /** The opening board: tiles grow into their sockets one after another. */
  intro(board: Board): void {
    this.snap(board);
    if (this.reduced) return;
    const now = performance.now();
    let k = 0;
    for (const piece of this.pieces) {
      piece.grow = now + 160 + k * 90;
      piece.born = piece.grow;
      k += 1;
    }
  }

  /**
   * A swipe that moved: every tile travels to where `slide` put it, the halves
   * of each merge vanish as they meet, and the merged tile swells in their
   * place. `board` is the board **before** the swipe.
   */
  slide(board: Board, direction: Direction): void {
    const now = performance.now();
    this.retire(now);
    const { tracks, merges } = tracksFor(board, direction);
    const end = this.reduced ? now : now + M.slide;
    const next: Piece[] = [];
    for (const track of tracks) {
      next.push({
        value: track.value,
        from: track.from,
        to: track.to,
        start: now,
        born: -Infinity,
        dies: track.merged ? end : Infinity,
        pop: -1,
        grow: -1,
      });
    }
    let top = 0;
    for (const merge of merges) {
      next.push({ ...this.still(merge.value, merge.at), born: end, pop: this.reduced ? -1 : end });
      top = Math.max(top, merge.value);
      if (!this.reduced) this.burst(merge.at, merge.value, end);
    }
    this.pieces = next;
    this.slideEnd = end;

    /* Pico leans toward the side the tiles went: forward when they leave him,
       back when they come at him. */
    this.lean = {
      to: direction === 'left' ? 0.2 : direction === 'right' ? -0.08 : direction === 'down' ? 0.16 : 0.04,
      at: now,
    };
    if (top >= BAKERY.hopFrom) this.hopAt = end;
    if (top > this.best && top >= BAKERY.cheerFrom) this.cheer(merges.find((m) => m.value === top)!.at, end);
    this.best = Math.max(this.best, top);
  }

  /** A new tile, growing in once the slide has finished. */
  spawn(cell: number, value: number): void {
    if (cell < 0 || !(value > 0)) return;
    const at = Math.max(performance.now(), this.slideEnd);
    this.pieces = this.pieces.filter((p) => !(p.to === cell && p.dies === Infinity));
    this.pieces.push({ ...this.still(value, cell), born: at, grow: this.reduced ? -1 : at });
    this.best = Math.max(this.best, value);
  }

  /**
   * The server's board. The usual answer is the board on screen plus the tile
   * it placed, which `spawn` grows in; anything else (a resync after a lost
   * reply) is snapped to, because the server's board is the truth.
   */
  settle(board: Board, spawned: { index: number; value: number } | null): void {
    const shown = this.shown();
    const differ: number[] = [];
    for (let i = 0; i < board.length; i += 1) if (shown[i] !== board[i]) differ.push(i);
    if (differ.length === 0) return;
    if (differ.length === 1 && shown[differ[0]] === 0 && (!spawned || spawned.index === differ[0])) {
      this.spawn(differ[0], board[differ[0]]);
      return;
    }
    this.snap(board);
  }

  /** A swipe that moved nothing: the tray bumps that way and springs back. */
  refuse(direction: Direction): void {
    if (this.reduced) return;
    const d = 1;
    this.nudge = {
      dx: direction === 'left' ? -d : direction === 'right' ? d : 0,
      dy: direction === 'up' ? -d : direction === 'down' ? d : 0,
      at: performance.now(),
    };
  }

  /* ── the clock ──────────────────────────────────────────────────────────── */

  resize(width: number, height: number, ratio: number): void {
    this.ratio = ratio;
    const el = this.board();
    if (!el) return;
    const bs = el.offsetWidth;
    const bx = el.offsetLeft;
    const by = el.offsetTop;
    const { frame, cell, cells, thick } = trayGeometry(bx, by, bs);
    const gap = bs * L.gap;
    const size = Math.max(L.picoMin, Math.min(L.picoMax, bs * L.pico));
    const side = bx;
    this.lay = {
      w: width,
      h: height,
      bx,
      by,
      bs,
      frame,
      gap,
      cell,
      thick,
      cells,
      counterBack: by + bs - Math.max(10, bs * 0.05),
      counterFront: by + bs + thick + Math.max(6, bs * 0.03),
      /* Far enough in from the corner that his tail (he faces left, so it
         points right) stays over the tray rather than off the stage. */
      pico: { x: bx + bs - size * 0.46, feet: by + frame * 0.55, size },
      wide: side >= 120,
    };
    this.room = null;
    this.tray = null;
    this.sprites.clear();
  }

  paint(ctx: Ctx, now: number): void {
    const lay = this.lay;
    if (!lay || lay.bs <= 0) return;
    const p = this.palette();
    /* Ambient time stands still under reduced motion: the room is a still. */
    const t = this.reduced ? 0 : (now - this.epoch) / 1000;

    if (!this.room) this.room = this.paintRoom(lay, p);
    ctx.drawImage(this.room, 0, 0, lay.w, lay.h);

    this.paintLampLight(ctx, lay, p, t);

    /* The tray, nudged by a refused swipe: out fast, back on a damped spring. */
    const n = clamp01((now - this.nudge.at) / M.nudge);
    const push = n >= 1 ? 0 : Math.sin(n * Math.PI) * (1 - n) * Math.max(3, lay.bs * 0.012);
    const ox = this.nudge.dx * push;
    const oy = this.nudge.dy * push;

    if (!this.tray) this.tray = this.paintTray(lay, p);
    ctx.drawImage(this.tray, ox, oy, lay.w, lay.h);

    ctx.save();
    ctx.translate(ox, oy);
    this.paintTiles(ctx, lay, now, t);
    if (this.over) {
      /* A board with no move left goes quiet under Pico's sigh: the tiles sink
         toward the enamel — darker on paper too, where a pale wash read as
         a board lighting up rather than going out. */
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = p.bedLow;
      ctx.beginPath();
      roundedRect(ctx, lay.bx + lay.frame, lay.by + lay.frame, lay.bs - 2 * lay.frame, lay.bs - 2 * lay.frame, lay.bs * 0.03);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (lay.wide) this.paintClockHands(ctx, lay, p);
    this.paintGarland(ctx, lay, p, t);
    this.paintLamps(ctx, lay, p, t);
    if (lay.wide) this.paintSteam(ctx, lay, p, t);
    if (this.theme === 'dark') this.paintMotes(ctx, lay, p, t);
    this.paintPico(ctx, lay, p, now, t);
    this.paintEffects(ctx, lay, p, now);
  }

  /* ── state helpers ─────────────────────────────────────────────────────── */

  private palette(): BakeryPalette {
    return BAKERY.palette[this.theme];
  }

  private glaze(value: number): TileGlaze {
    const p = this.palette();
    return p.tiles[value] ?? p.tileBeyond;
  }

  private still(value: number, cell: number): Piece {
    return { value, from: cell, to: cell, start: 0, born: -Infinity, dies: Infinity, pop: -1, grow: -1 };
  }

  /** The board as the screen will show it once everything in flight lands. */
  private shown(): Board {
    const board = new Array<number>(SIZE * SIZE).fill(0);
    for (const piece of this.pieces) if (piece.dies === Infinity) board[piece.to] = piece.value;
    return board;
  }

  private centre(cell: number): { x: number; y: number } {
    const lay = this.lay!;
    const c = lay.cells[cell];
    return { x: c.x + lay.cell / 2, y: c.y + lay.cell / 2 };
  }

  /**
   * A new swipe hurries the last one's leftovers off: its "+N" skip to their
   * fade and the oldest crumbs go. A fast player swipes four times a second,
   * and every merge's number left to live out its full rise stacks a column of
   * "+4"s over the very tiles they are about.
   */
  private retire(now: number): void {
    const fadeFrom = M.floater * 0.62;
    for (const f of this.floaters) if (now - f.t0 < fadeFrom) f.t0 = now - fadeFrom;
    if (this.crumbs.length > BAKERY.crumbs.cap) this.crumbs.splice(0, this.crumbs.length - BAKERY.crumbs.cap);
  }

  /** Crumbs and "+N" off a merge, landing as the halves meet. */
  private burst(cell: number, value: number, at: number): void {
    if (!this.lay) return;
    const { x, y } = this.centre(cell);
    const g = this.glaze(value);
    const cellPx = this.lay.cell;
    const count = BAKERY.crumbs.base + Math.round(Math.log2(value));
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * TAU + Math.random() * 0.6;
      const speed = cellPx * (1.4 + Math.random() * 1.8);
      const twinkle = value >= 128 && i % 3 === 0;
      this.crumbs.push({
        x: x + Math.cos(a) * cellPx * 0.3,
        y: y + Math.sin(a) * cellPx * 0.3,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - cellPx * 1.6,
        r: cellPx * (twinkle ? 0.07 : 0.035 + Math.random() * 0.03),
        colour: twinkle ? '#ffffff' : i % 2 ? g.face : g.lip,
        t0: at,
        life: BAKERY.crumbs.life * (0.7 + Math.random() * 0.5),
        spin: (Math.random() - 0.5) * 8,
        shape: twinkle ? 1 : 0,
        gravity: BAKERY.crumbs.gravity * (cellPx / 80),
      });
    }
    this.floaters.push({ x, y: y - cellPx * 0.1, text: `+${value}`, t0: at, size: cellPx * 0.3 });
  }

  /** A new best tile: Pico cheers, confetti off his perch, a ring on the tile. */
  private cheer(cell: number, at: number): void {
    const lay = this.lay;
    if (!lay) return;
    this.cheerUntil = at + M.cheer;
    if (this.reduced) return;
    const { x, y } = this.centre(cell);
    this.rings.push({ x, y, r: lay.cell * 0.9, t0: at });
    const p = this.palette();
    const px = lay.pico.x;
    const py = lay.pico.feet - lay.pico.size * 0.5;
    for (let i = 0; i < 34; i += 1) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const speed = lay.pico.size * (2.4 + Math.random() * 2.6);
      this.crumbs.push({
        x: px,
        y: py,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: lay.pico.size * (0.03 + Math.random() * 0.025),
        colour: p.confetti[i % p.confetti.length],
        t0: at + Math.random() * 120,
        life: 1.3 + Math.random() * 0.6,
        spin: (Math.random() - 0.5) * 14,
        shape: 2,
        gravity: BAKERY.crumbs.gravity * 0.55 * (lay.pico.size / 90),
      });
    }
  }

  /* ── the room ───────────────────────────────────────────────────────────── */

  private canvas(lay: Layout): { el: HTMLCanvasElement; ctx: Ctx } {
    const el = document.createElement('canvas');
    el.width = Math.max(1, Math.round(lay.w * this.ratio));
    el.height = Math.max(1, Math.round(lay.h * this.ratio));
    const ctx = el.getContext('2d')!;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    return { el, ctx };
  }

  private paintRoom(lay: Layout, p: BakeryPalette): HTMLCanvasElement {
    const { el, ctx } = this.canvas(lay);
    const { w, h, bx, by, bs } = lay;

    /* The wall. */
    const wall = ctx.createLinearGradient(0, 0, 0, lay.counterBack);
    wall.addColorStop(0, p.wallTop);
    wall.addColorStop(1, p.wallLow);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);

    /* Subway tiles, brick-bonded, fading out toward the ceiling. */
    const th = Math.max(9, Math.min(15, bs * 0.034));
    const tw = th * 2.3;
    ctx.strokeStyle = p.tileLine;
    ctx.lineWidth = 1;
    for (let row = 0, y = lay.counterBack - th; y > -th; row += 1, y -= th) {
      const fade = clamp01((y - by * 0.2) / (bs * 0.55));
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;
      const shift = row % 2 ? tw / 2 : 0;
      for (let x = -shift; x < w; x += tw) {
        ctx.beginPath();
        roundedRect(ctx, x + 0.5, y + 0.5, tw - 1, th - 1, 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    /* A chair rail where the tiles stop. */
    const rail = by + bs * 0.05;
    ctx.fillStyle = p.woodLow;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, rail, w, 2);
    ctx.globalAlpha = 1;

    if (lay.wide) {
      this.paintShelf(ctx, lay, p, 14, bx - 18, true);
      this.paintShelf(ctx, lay, p, bx + bs + 18, w - 14, false);
      this.paintChalkboard(ctx, lay, p);
      this.paintClockFace(ctx, lay, p);
      this.paintPortrait(ctx, lay, p);
    } else {
      this.paintLedge(ctx, lay, p);
    }

    /* The counter: its top seen a little from above, then its front. */
    const back = lay.counterBack;
    const front = lay.counterFront;
    const top = ctx.createLinearGradient(0, back, 0, front);
    top.addColorStop(0, p.woodLow);
    top.addColorStop(0.25, p.wood);
    top.addColorStop(1, p.woodLit);
    ctx.fillStyle = top;
    ctx.fillRect(0, back, w, front - back);
    ctx.fillStyle = p.woodLit;
    ctx.fillRect(0, front - 2, w, 2);
    const panel = ctx.createLinearGradient(0, front, 0, h);
    panel.addColorStop(0, p.counterFront);
    panel.addColorStop(1, p.counterFrontLow);
    ctx.fillStyle = panel;
    ctx.fillRect(0, front, w, h - front);
    /* The overhang's shadow on the front, and the planks below it. */
    const lip = ctx.createLinearGradient(0, front, 0, front + 12);
    lip.addColorStop(0, this.alpha(p.shadow, 0.35));
    lip.addColorStop(1, this.alpha(p.shadow, 0));
    ctx.fillStyle = lip;
    ctx.fillRect(0, front, w, 12);
    ctx.fillStyle = this.alpha(p.shadow, 0.18);
    const plank = Math.max(38, bs * 0.16);
    for (let x = (w % plank) / 2; x < w; x += plank) ctx.fillRect(Math.round(x), front + 4, 1.5, h - front - 4);

    /* The tray's shadow on the counter. */
    ctx.save();
    ctx.fillStyle = this.alpha(p.shadow, this.theme === 'dark' ? 0.55 : 0.28);
    ctx.filter = `blur(${Math.max(4, bs * 0.02)}px)`;
    ctx.beginPath();
    ctx.ellipse(bx + bs / 2, by + bs + lay.thick * 0.6, bs * 0.53, Math.max(5, bs * 0.03), 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (lay.wide) {
      this.paintCup(ctx, lay, p);
      this.paintCake(ctx, lay, p);
    }

    /* The vignette keeps the eye on the tray. */
    const v = ctx.createRadialGradient(w / 2, by + bs * 0.45, bs * 0.45, w / 2, by + bs * 0.45, Math.max(w, h) * 0.85);
    v.addColorStop(0, this.alpha(p.vignette, 0));
    v.addColorStop(1, this.alpha(p.vignette, this.theme === 'dark' ? 0.5 : 0.08));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    return el;
  }

  /** A shelf on one side of the tray, and what stands on it. */
  private paintShelf(ctx: Ctx, lay: Layout, p: BakeryPalette, x0: number, x1: number, left: boolean): void {
    const y = lay.by + lay.bs * 0.2;
    const thick = Math.max(7, lay.bs * 0.022);
    const span = x1 - x0;
    /* Its shadow on the wall, then brackets, then the plank. */
    ctx.fillStyle = this.alpha(p.shadow, 0.16);
    ctx.fillRect(x0 + 4, y + thick, span - 8, thick * 1.2);
    ctx.fillStyle = p.woodLow;
    for (const bxk of [x0 + span * 0.2, x1 - span * 0.2]) {
      ctx.beginPath();
      ctx.moveTo(bxk - 3, y + thick);
      ctx.lineTo(bxk + 3, y + thick);
      ctx.lineTo(bxk + 3, y + thick + 16);
      ctx.quadraticCurveTo(bxk - 3, y + thick + 14, bxk - 3, y + thick);
      ctx.fill();
    }
    ctx.fillStyle = p.wood;
    ctx.beginPath();
    roundedRect(ctx, x0, y, span, thick, 2);
    ctx.fill();
    ctx.fillStyle = p.woodLit;
    ctx.fillRect(x0 + 1, y, span - 2, 1.5);

    const unit = Math.min(span / 3.4, lay.bs * 0.13);
    if (left) {
      this.paintJar(ctx, p, x0 + span * 0.24, y, unit * 1.05, 0);
      this.paintJar(ctx, p, x0 + span * 0.55, y, unit * 0.82, 1);
      this.paintCups(ctx, p, x0 + span * 0.83, y, unit * 0.55);
    } else {
      this.paintPlant(ctx, p, x0 + span * 0.25, y, unit);
      this.paintJar(ctx, p, x0 + span * 0.62, y, unit * 0.95, 2);
      this.paintJar(ctx, p, x0 + span * 0.86, y, unit * 0.62, 3);
    }
  }

  /**
   * The menu: a slate in a wooden frame, "2048" across the top in chalk, and
   * three lines of the day's bakes drawn rather than written — a cup, a
   * croissant, a heart — so it reads in every language the page does.
   */
  private paintChalkboard(ctx: Ctx, lay: Layout, p: BakeryPalette): void {
    const side = lay.bx;
    const w = Math.min(side - 44, lay.bs * 0.36);
    const h = w * 0.86;
    const x = (side - w) / 2;
    const y = lay.by + lay.bs * 0.34;
    const f = Math.max(5, w * 0.06);
    ctx.fillStyle = this.alpha(p.shadow, 0.22);
    ctx.beginPath();
    roundedRect(ctx, x + 3, y + 5, w, h, 5);
    ctx.fill();
    ctx.fillStyle = p.wood;
    ctx.beginPath();
    roundedRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.fillStyle = p.woodLit;
    ctx.fillRect(x + 3, y + 1, w - 6, 1.5);
    ctx.fillStyle = p.slate;
    ctx.beginPath();
    roundedRect(ctx, x + f, y + f, w - 2 * f, h - 2 * f, 3);
    ctx.fill();
    /* A smear of old chalk, never quite wiped. */
    ctx.fillStyle = this.alpha(p.chalk, 0.05);
    ctx.beginPath();
    ctx.ellipse(x + w * 0.6, y + h * 0.62, w * 0.3, h * 0.16, -0.2, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(x + w / 2, y + f + h * 0.16);
    ctx.rotate(-0.035);
    ctx.font = `600 ${Math.round(h * 0.17)}px ${this.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.alpha(p.chalk, 0.92);
    ctx.fillText('2048', 0, 0);
    ctx.restore();
    ctx.strokeStyle = this.alpha(p.chalk, 0.7);
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + f + h * 0.27);
    ctx.quadraticCurveTo(x + w * 0.5, y + f + h * 0.25, x + w * 0.7, y + f + h * 0.28);
    ctx.stroke();

    const icon = h * 0.1;
    for (let k = 0; k < 3; k += 1) {
      const ly = y + f + h * (0.42 + k * 0.15);
      const ix = x + f + w * 0.12;
      ctx.strokeStyle = this.alpha(p.chalk, 0.8);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      if (k === 0) {
        /* A cup. */
        ctx.moveTo(ix - icon * 0.5, ly - icon * 0.35);
        ctx.lineTo(ix - icon * 0.38, ly + icon * 0.35);
        ctx.lineTo(ix + icon * 0.38, ly + icon * 0.35);
        ctx.lineTo(ix + icon * 0.5, ly - icon * 0.35);
        ctx.moveTo(ix + icon * 0.48, ly - icon * 0.15);
        ctx.arc(ix + icon * 0.62, ly, icon * 0.16, -Math.PI / 2, Math.PI / 2);
      } else if (k === 1) {
        /* A croissant. */
        ctx.arc(ix, ly + icon * 0.4, icon * 0.6, Math.PI * 1.1, Math.PI * 1.9);
        ctx.moveTo(ix - icon * 0.15, ly - icon * 0.18);
        ctx.lineTo(ix - icon * 0.05, ly + icon * 0.12);
        ctx.moveTo(ix + icon * 0.2, ly - icon * 0.16);
        ctx.lineTo(ix + icon * 0.1, ly + icon * 0.12);
      } else {
        /* A heart. */
        ctx.moveTo(ix, ly + icon * 0.4);
        ctx.bezierCurveTo(ix - icon * 0.8, ly - icon * 0.1, ix - icon * 0.3, ly - icon * 0.6, ix, ly - icon * 0.2);
        ctx.bezierCurveTo(ix + icon * 0.3, ly - icon * 0.6, ix + icon * 0.8, ly - icon * 0.1, ix, ly + icon * 0.4);
      }
      ctx.stroke();
      /* The item's line and its price's dots. */
      ctx.strokeStyle = this.alpha(p.chalk, 0.5);
      ctx.beginPath();
      const lx = ix + icon * 1.1;
      const lw = w * (0.38 - k * 0.06);
      ctx.moveTo(lx, ly);
      for (let s = 0; s <= 6; s += 1) ctx.lineTo(lx + (s / 6) * lw, ly + Math.sin(s * 2.1 + k) * 1.2);
      ctx.stroke();
      ctx.fillStyle = this.alpha(p.chalk, 0.75);
      for (let d = 0; d < 2; d += 1) {
        ctx.beginPath();
        ctx.arc(x + w - f - w * (0.08 + d * 0.07), ly, 1.4, 0, TAU);
        ctx.fill();
      }
    }
  }

  /** Where the clock hangs: right of the tray, at shelf-and-a-half height. */
  private clockAt(lay: Layout): { x: number; y: number; r: number } {
    const side = lay.w - lay.bx - lay.bs;
    return { x: lay.bx + lay.bs + side * 0.34, y: lay.by + lay.bs * 0.47, r: Math.min(side * 0.2, lay.bs * 0.075) };
  }

  private paintClockFace(ctx: Ctx, lay: Layout, p: BakeryPalette): void {
    const { x, y, r } = this.clockAt(lay);
    ctx.fillStyle = this.alpha(p.shadow, 0.22);
    ctx.beginPath();
    ctx.arc(x + 2, y + 4, r + 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.shade;
    ctx.beginPath();
    ctx.arc(x, y, r + Math.max(3, r * 0.14), 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.cup;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.hand;
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * TAU;
      const len = k % 3 === 0 ? r * 0.2 : r * 0.1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillRect(-0.8, -r * 0.88, 1.6, len);
      ctx.restore();
    }
    ctx.fillStyle = this.alpha('#ffffff', 0.35);
    ctx.beginPath();
    ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.22, r * 0.1, -0.7, 0, TAU);
    ctx.fill();
  }

  /** The hands, at the reader's own time — painted per frame, cheaply. */
  private paintClockHands(ctx: Ctx, lay: Layout, p: BakeryPalette): void {
    const { x, y, r } = this.clockAt(lay);
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;
    const hand = (turn: number, len: number, width: number, colour: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(turn * TAU);
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, len * 0.18);
      ctx.lineTo(0, -len);
      ctx.stroke();
      ctx.restore();
    };
    hand(hr / 12, r * 0.5, Math.max(2, r * 0.09), p.hand);
    hand(min / 60, r * 0.74, Math.max(1.5, r * 0.06), p.hand);
    if (!this.reduced) hand(sec / 60, r * 0.8, 1, p.pot);
    ctx.fillStyle = p.brass;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, r * 0.08), 0, TAU);
    ctx.fill();
  }

  /** Pico's portrait, in a brass frame — the house's mascot, on the house's wall. */
  private paintPortrait(ctx: Ctx, lay: Layout, p: BakeryPalette): void {
    const side = lay.w - lay.bx - lay.bs;
    const w = Math.min(side * 0.3, lay.bs * 0.13);
    const h = w * 1.25;
    const cx = lay.bx + lay.bs + side * 0.74;
    const cy = lay.by + lay.bs * 0.47;
    const x = cx - w / 2;
    const y = cy - h / 2;
    ctx.fillStyle = this.alpha(p.shadow, 0.22);
    ctx.beginPath();
    roundedRect(ctx, x + 2, y + 4, w, h, w * 0.5);
    ctx.fill();
    ctx.fillStyle = p.brass;
    ctx.beginPath();
    roundedRect(ctx, x, y, w, h, w * 0.5);
    ctx.fill();
    ctx.fillStyle = p.brassLow;
    ctx.beginPath();
    roundedRect(ctx, x + 3, y + 3, w - 6, h - 6, w * 0.45);
    ctx.fill();
    ctx.fillStyle = p.portrait;
    ctx.beginPath();
    roundedRect(ctx, x + 4.5, y + 4.5, w - 9, h - 9, w * 0.42);
    ctx.fill();
    drawPico(ctx, { x: cx, y: cy + h * 0.06, size: w * 0.95, pose: 'badge' });
    /* A nail and its string. */
    ctx.strokeStyle = p.cord;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + 2);
    ctx.lineTo(cx, y - h * 0.18);
    ctx.lineTo(x + w * 0.8, y + 2);
    ctx.stroke();
    ctx.fillStyle = p.brassLow;
    ctx.beginPath();
    ctx.arc(cx, y - h * 0.18, 2, 0, TAU);
    ctx.fill();
  }

  /**
   * On a phone there are no side walls to furnish, so a short shelf stands on
   * the wall above the tray, left of Pico, under the garland.
   */
  private paintLedge(ctx: Ctx, lay: Layout, p: BakeryPalette): void {
    const y = lay.by - Math.max(10, lay.bs * 0.05);
    const x0 = lay.bx + lay.bs * 0.32;
    const x1 = lay.bx + lay.bs * 0.62;
    const thick = 5;
    ctx.fillStyle = this.alpha(p.shadow, 0.16);
    ctx.fillRect(x0 + 3, y + thick, x1 - x0 - 6, 5);
    ctx.fillStyle = p.wood;
    ctx.beginPath();
    roundedRect(ctx, x0, y, x1 - x0, thick, 2);
    ctx.fill();
    ctx.fillStyle = p.woodLit;
    ctx.fillRect(x0 + 1, y, x1 - x0 - 2, 1.2);
    const unit = Math.min(lay.by * 0.3, 26);
    const span = x1 - x0;
    this.paintJar(ctx, p, x0 + span * 0.2, y, unit, 0);
    this.paintPlant(ctx, p, x0 + span * 0.52, y, unit * 0.95);
    this.paintJar(ctx, p, x0 + span * 0.82, y, unit * 0.78, 1);
  }

  /** A sweet jar standing on `base`, `size` tall. */
  private paintJar(ctx: Ctx, p: BakeryPalette, cx: number, base: number, size: number, seed: number): void {
    const w = size * 0.78;
    const h = size;
    const x = cx - w / 2;
    const y = base - h;
    /* What is in it: a heap of sweets, the far ones darker. */
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, x + 2, y + h * 0.18, w - 4, h * 0.82 - 1, w * 0.22);
    ctx.clip();
    const r = w * 0.13;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const k = row * 5 + col + seed * 31;
        const sx = x + 3 + (col + (row % 2) * 0.5) * (w - 6) * 0.23;
        const sy = base - 2 - r - row * r * 1.55;
        if (sy < y + h * (0.28 + 0.1 * (seed % 2))) continue;
        ctx.fillStyle = p.sweets[Math.floor(hash01(k) * p.sweets.length)];
        ctx.beginPath();
        ctx.arc(sx + r, sy, r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    /* The glass over them. */
    ctx.fillStyle = this.alpha(p.glass, 0.18);
    ctx.strokeStyle = this.alpha(p.glassEdge, 0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    roundedRect(ctx, x, y + h * 0.14, w, h * 0.86, w * 0.24);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.alpha(p.glassEdge, 0.45);
    ctx.beginPath();
    roundedRect(ctx, x + w * 0.14, y + h * 0.26, w * 0.09, h * 0.5, w * 0.05);
    ctx.fill();
    /* The lid. */
    ctx.fillStyle = seed % 2 ? p.shade : p.wood;
    ctx.beginPath();
    roundedRect(ctx, x + w * 0.08, y, w * 0.84, h * 0.16, 3);
    ctx.fill();
    ctx.fillStyle = this.alpha('#ffffff', 0.25);
    ctx.fillRect(x + w * 0.12, y + 1, w * 0.76, 1.5);
  }

  private paintCups(ctx: Ctx, p: BakeryPalette, cx: number, base: number, size: number): void {
    for (let k = 0; k < 3; k += 1) {
      const y = base - (k + 1) * size * 0.62;
      const w = size * (1.15 - k * 0.04);
      ctx.fillStyle = k % 2 ? p.cupLow : p.cup;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, y);
      ctx.lineTo(cx + w / 2, y);
      ctx.lineTo(cx + w * 0.38, y + size * 0.62);
      ctx.lineTo(cx - w * 0.38, y + size * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.shade;
      ctx.fillRect(cx - w * 0.44, y + size * 0.18, w * 0.88, size * 0.1);
    }
  }

  private paintPlant(ctx: Ctx, p: BakeryPalette, cx: number, base: number, size: number): void {
    const pw = size * 0.62;
    const ph = size * 0.5;
    /* Leaves first, so the pot sits in front of their stems. */
    const leaves = 7;
    for (let k = 0; k < leaves; k += 1) {
      const a = -Math.PI / 2 + (k / (leaves - 1) - 0.5) * 2.3;
      const len = size * (0.62 + 0.3 * hash01(k + 7));
      ctx.save();
      ctx.translate(cx, base - ph * 0.9);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = k % 2 ? p.leafLow : p.leaf;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.32, -len * 0.5, 0, -len);
      ctx.quadraticCurveTo(-len * 0.32, -len * 0.5, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = p.pot;
    ctx.beginPath();
    ctx.moveTo(cx - pw / 2, base - ph);
    ctx.lineTo(cx + pw / 2, base - ph);
    ctx.lineTo(cx + pw * 0.38, base);
    ctx.lineTo(cx - pw * 0.38, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.potLow;
    ctx.fillRect(cx - pw * 0.54, base - ph, pw * 1.08, ph * 0.22);
  }

  /** A cup of coffee on its saucer, on the counter left of the tray. */
  private paintCup(ctx: Ctx, lay: Layout, p: BakeryPalette): void {
    const s = Math.min(lay.bx * 0.42, lay.bs * 0.15);
    const cx = lay.bx * 0.5;
    const base = (lay.counterBack + lay.counterFront) / 2 + 2;
    /* Saucer. */
    ctx.fillStyle = p.cupLow;
    ctx.beginPath();
    ctx.ellipse(cx, base, s * 0.78, s * 0.14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.cup;
    ctx.beginPath();
    ctx.ellipse(cx, base - 2, s * 0.74, s * 0.12, 0, 0, TAU);
    ctx.fill();
    /* Handle. */
    ctx.strokeStyle = p.cup;
    ctx.lineWidth = s * 0.09;
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.44, base - s * 0.42, s * 0.16, s * 0.18, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    /* Cup. */
    const g = ctx.createLinearGradient(cx - s / 2, 0, cx + s / 2, 0);
    g.addColorStop(0, p.cup);
    g.addColorStop(1, p.cupLow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.48, base - s * 0.72);
    ctx.lineTo(cx + s * 0.48, base - s * 0.72);
    ctx.quadraticCurveTo(cx + s * 0.44, base - s * 0.04, cx, base - s * 0.04);
    ctx.quadraticCurveTo(cx - s * 0.44, base - s * 0.04, cx - s * 0.48, base - s * 0.72);
    ctx.fill();
    /* A teal band — the house cup. */
    ctx.fillStyle = p.shade;
    ctx.fillRect(cx - s * 0.46, base - s * 0.56, s * 0.92, s * 0.1);
    /* Coffee. */
    ctx.fillStyle = p.coffee;
    ctx.beginPath();
    ctx.ellipse(cx, base - s * 0.72, s * 0.46, s * 0.09, 0, 0, TAU);
    ctx.fill();
  }

  /** A cake under a glass dome, on a stand, right of the tray. */
  private paintCake(ctx: Ctx, lay: Layout, p: BakeryPalette): void {
    const right = lay.bx + lay.bs;
    const room = lay.w - right;
    const s = Math.min(room * 0.5, lay.bs * 0.2);
    const cx = right + room * 0.5;
    const base = (lay.counterBack + lay.counterFront) / 2 + 2;
    /* Stand. */
    ctx.fillStyle = p.cupLow;
    ctx.fillRect(cx - s * 0.07, base - s * 0.22, s * 0.14, s * 0.22);
    ctx.beginPath();
    ctx.ellipse(cx, base, s * 0.3, s * 0.06, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.cup;
    ctx.beginPath();
    ctx.ellipse(cx, base - s * 0.22, s * 0.6, s * 0.08, 0, 0, TAU);
    ctx.fill();
    /* The cake: sponge, cream, teal icing, a cherry. */
    const ct = base - s * 0.26;
    const cw = s * 0.82;
    const ch = s * 0.42;
    ctx.fillStyle = p.wood;
    ctx.beginPath();
    roundedRect(ctx, cx - cw / 2, ct - ch, cw, ch, s * 0.06);
    ctx.fill();
    ctx.fillStyle = p.cup;
    ctx.fillRect(cx - cw / 2, ct - ch * 0.55, cw, ch * 0.14);
    ctx.fillStyle = p.shadeLit;
    ctx.beginPath();
    ctx.moveTo(cx - cw / 2, ct - ch + s * 0.06);
    ctx.quadraticCurveTo(cx - cw / 2, ct - ch, cx - cw / 2 + s * 0.06, ct - ch);
    ctx.lineTo(cx + cw / 2 - s * 0.06, ct - ch);
    ctx.quadraticCurveTo(cx + cw / 2, ct - ch, cx + cw / 2, ct - ch + s * 0.06);
    for (let k = 5; k >= 0; k -= 1) {
      const x = cx - cw / 2 + (k / 5) * cw;
      ctx.lineTo(x, ct - ch + s * (k % 2 ? 0.16 : 0.1));
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.sweets[0];
    ctx.beginPath();
    ctx.arc(cx, ct - ch - s * 0.06, s * 0.07, 0, TAU);
    ctx.fill();
    /* The dome. */
    ctx.fillStyle = this.alpha(p.glass, 0.12);
    ctx.strokeStyle = this.alpha(p.glassEdge, 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.56, base - s * 0.24);
    ctx.bezierCurveTo(cx - s * 0.56, base - s * 1.28, cx + s * 0.56, base - s * 1.28, cx + s * 0.56, base - s * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.alpha(p.glassEdge, 0.4);
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.32, base - s * 0.72, s * 0.05, s * 0.2, -0.35, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.cupLow;
    ctx.beginPath();
    ctx.arc(cx, base - s * 1.02, s * 0.06, 0, TAU);
    ctx.fill();
  }

  /* ── the tray ───────────────────────────────────────────────────────────── */

  private paintTray(lay: Layout, p: BakeryPalette): HTMLCanvasElement {
    const { el, ctx } = this.canvas(lay);
    paintTrayOn(ctx, lay, p, this.theme === 'dark');
    return el;
  }

  /* ── tiles ──────────────────────────────────────────────────────────────── */

  /** Padding round a sprite for its shadow. */
  private pad(lay: Layout): number {
    return Math.ceil(lay.cell * 0.14);
  }

  private sprite(lay: Layout, value: number): HTMLCanvasElement {
    const hit = this.sprites.get(value);
    if (hit) return hit;
    const pad = this.pad(lay);
    const side = lay.cell + pad * 2;
    const el = document.createElement('canvas');
    el.width = el.height = Math.max(1, Math.round(side * this.ratio));
    const ctx = el.getContext('2d')!;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    paintTile(ctx, pad, pad, lay.cell, value, this.glaze(value), this.palette(), this.font);
    this.sprites.set(value, el);
    return el;
  }

  private paintTiles(ctx: Ctx, lay: Layout, now: number, t: number): void {
    const pad = this.pad(lay);
    const side = lay.cell + pad * 2;
    /* Travelling and vanishing tiles under the ones at rest; swelling ones on top. */
    const order = this.pieces
      .filter((piece) => now >= piece.born && now < piece.dies)
      .sort((a, b) => rank(a, now) - rank(b, now));
    for (const piece of order) {
      const a = lay.cells[piece.from];
      const b = lay.cells[piece.to];
      const k = piece.from === piece.to || this.reduced ? 1 : easeInOutCubic(clamp01((now - piece.start) / M.slide));
      const x = lerp(a.x, b.x, k);
      const y = lerp(a.y, b.y, k);
      let scale = 1;
      if (piece.pop >= 0) {
        const u = clamp01((now - piece.pop) / M.merge);
        scale = 1 + 0.2 * Math.sin(u * Math.PI) * (1 - u * 0.3);
      }
      if (piece.grow >= 0) {
        const u = clamp01((now - piece.grow) / M.spawn);
        scale *= u >= 1 ? 1 : Math.max(0, easeOutBack(u));
      }
      if (scale <= 0.01) continue;
      const sprite = this.sprite(lay, piece.value);
      if (scale === 1) {
        ctx.drawImage(sprite, x - pad, y - pad, side, side);
      } else {
        const cx = x + lay.cell / 2;
        const cy = y + lay.cell / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.drawImage(sprite, -lay.cell / 2 - pad, -lay.cell / 2 - pad, side, side);
        ctx.restore();
      }
      const glaze = this.glaze(piece.value);
      if (glaze.sparkle && !this.reduced && piece.dies === Infinity) {
        this.paintTwinkles(ctx, x, y, lay.cell, piece.to, t);
      }
    }
  }

  private paintTwinkles(ctx: Ctx, x: number, y: number, s: number, seed: number, t: number): void {
    const spots: [number, number, number][] = [
      [0.84, 0.2, 0],
      [0.18, 0.8, 1.9],
      [0.74, 0.76, 3.7],
    ];
    ctx.fillStyle = '#ffffff';
    for (const [fx, fy, ph] of spots) {
      const wave = Math.sin(t * 2.6 + ph + seed * 0.9);
      if (wave <= 0.15) continue;
      ctx.globalAlpha = (wave - 0.15) / 0.85;
      star(ctx, x + fx * s, y + fy * s, s * 0.085 * wave, s * 0.02);
    }
    ctx.globalAlpha = 1;
  }

  /* ── the air ────────────────────────────────────────────────────────────── */

  /** Where the lamps hang, by stage width. */
  private lamps(lay: Layout): { x: number; len: number; size: number; phase: number }[] {
    const size = Math.max(26, Math.min(48, lay.bs * 0.11));
    if (lay.wide) {
      return [
        { x: lay.bx * 0.52, len: lay.by * 0.62, size, phase: 0 },
        { x: lay.w - (lay.w - lay.bx - lay.bs) * 0.48, len: lay.by * 0.46, size: size * 0.9, phase: 2.1 },
      ];
    }
    return [{ x: lay.bx + lay.bs * 0.2, len: Math.max(18, lay.by * 0.32), size: size * 0.85, phase: 0.7 }];
  }

  private sway(t: number, phase: number): number {
    return 0.045 * Math.sin(t * 0.8 + phase) + 0.012 * Math.sin(t * 2.3 + phase * 1.7);
  }

  private paintLampLight(ctx: Ctx, lay: Layout, p: BakeryPalette, t: number): void {
    ctx.save();
    if (this.theme === 'dark') ctx.globalCompositeOperation = 'lighter';
    for (const lamp of this.lamps(lay)) {
      const a = this.sway(t, lamp.phase);
      const x = lamp.x + Math.sin(a) * lamp.len;
      const y = Math.cos(a) * lamp.len + lamp.size * 0.5;
      const reach = lamp.size * (lay.wide ? 6.5 : 4.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y + reach * 0.3, reach);
      g.addColorStop(0, this.alpha(p.lampPool, p.lampPoolAlpha * 1.6));
      g.addColorStop(0.35, this.alpha(p.lampPool, p.lampPoolAlpha * 0.6));
      g.addColorStop(1, this.alpha(p.lampPool, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - reach, y - reach * 0.5, reach * 2, reach * 1.9);
    }
    ctx.restore();
  }

  private paintLamps(ctx: Ctx, lay: Layout, p: BakeryPalette, t: number): void {
    for (const lamp of this.lamps(lay)) {
      const a = this.sway(t, lamp.phase);
      const s = lamp.size;
      ctx.save();
      ctx.translate(lamp.x, -2);
      ctx.rotate(-a);
      ctx.strokeStyle = p.cord;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, lamp.len - s * 0.32);
      ctx.stroke();
      ctx.translate(0, lamp.len);
      /* The cap, the dome, its rim and the bulb under it. */
      ctx.fillStyle = p.shadeLow;
      ctx.beginPath();
      roundedRect(ctx, -s * 0.09, -s * 0.36, s * 0.18, s * 0.14, 2);
      ctx.fill();
      const dome = ctx.createLinearGradient(-s / 2, 0, s / 2, 0);
      dome.addColorStop(0, p.shadeLit);
      dome.addColorStop(0.45, p.shade);
      dome.addColorStop(1, p.shadeLow);
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.22);
      ctx.bezierCurveTo(-s * 0.5, -s * 0.1, -s * 0.24, -s * 0.26, 0, -s * 0.26);
      ctx.bezierCurveTo(s * 0.24, -s * 0.26, s * 0.5, -s * 0.1, s * 0.5, s * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.bulb;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.24, s * 0.2, s * 0.11, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = p.shadeLow;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.22, s * 0.5, s * 0.06, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.alpha('#ffffff', 0.35);
      ctx.beginPath();
      ctx.ellipse(-s * 0.26, -s * 0.02, s * 0.05, s * 0.12, 0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  private paintGarland(ctx: Ctx, lay: Layout, p: BakeryPalette, t: number): void {
    const { w } = lay;
    const top = Math.max(3, lay.by * 0.05);
    const sag = Math.max(12, Math.min(26, lay.by * 0.24));
    const flag = Math.max(12, Math.min(22, lay.bs * 0.05));
    const yAt = (x: number) => top + sag * 4 * (x / w) * (1 - x / w) + Math.sin(t * 0.9) * 1.2 * Math.sin((x / w) * Math.PI);
    ctx.strokeStyle = p.string;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = -4; x <= w + 4; x += 8) {
      if (x === -4) ctx.moveTo(x, yAt(x));
      else ctx.lineTo(x, yAt(x));
    }
    ctx.stroke();
    const step = flag * 1.75;
    const count = Math.floor(w / step);
    const start = (w - (count - 1) * step) / 2;
    for (let k = 0; k < count; k += 1) {
      const x = start + k * step;
      const y = yAt(x);
      const slope = Math.atan2(yAt(x + 4) - yAt(x - 4), 8);
      const swing = Math.sin(t * 1.4 + k * 0.8) * 0.07;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(slope + swing);
      ctx.fillStyle = p.pennants[k % p.pennants.length];
      ctx.beginPath();
      ctx.moveTo(-flag * 0.5, 0);
      ctx.lineTo(flag * 0.5, 0);
      ctx.lineTo(0, flag * 1.15);
      ctx.closePath();
      ctx.fill();
      /* The fold: the right half a shade darker. */
      ctx.fillStyle = this.alpha(p.shadow, 0.16);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(flag * 0.5, 0);
      ctx.lineTo(0, flag * 1.15);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private paintSteam(ctx: Ctx, lay: Layout, p: BakeryPalette, t: number): void {
    const s = Math.min(lay.bx * 0.42, lay.bs * 0.15);
    const cx = lay.bx * 0.5;
    const base = (lay.counterBack + lay.counterFront) / 2 + 2 - s * 0.8;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, s * 0.07);
    for (let k = 0; k < 3; k += 1) {
      const x0 = cx + (k - 1) * s * 0.22;
      const rise = s * 1.3;
      for (let seg = 0; seg < 10; seg += 1) {
        const u0 = seg / 10;
        const u1 = (seg + 1) / 10;
        const alpha = 0.32 * Math.sin(u0 * Math.PI) * (this.theme === 'dark' ? 0.7 : 1);
        ctx.strokeStyle = this.alpha(p.steam, alpha);
        ctx.beginPath();
        const wob = (u: number) => Math.sin(u * 7 - t * 2.2 + k * 2) * s * 0.07 * (0.4 + u);
        ctx.moveTo(x0 + wob(u0), base - u0 * rise);
        ctx.lineTo(x0 + wob(u1), base - u1 * rise);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private paintMotes(ctx: Ctx, lay: Layout, p: BakeryPalette, t: number): void {
    ctx.fillStyle = p.mote;
    for (let k = 0; k < 18; k += 1) {
      const x = hash01(k * 3 + 1) * lay.w + Math.sin(t * 0.3 + k) * 8;
      const y = lay.h - ((hash01(k * 3 + 2) * lay.h + t * (6 + hash01(k) * 8)) % lay.h);
      const a = 0.25 + 0.35 * Math.sin(t * 1.3 + k * 2.1);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + hash01(k * 7) * 1.1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ── Pico ───────────────────────────────────────────────────────────────── */

  /** One options object, reused every frame — `drawPico` allocates nothing and neither should its caller. */
  private pico: DrawPicoOptions = { x: 0, y: 0, size: 0, anchor: 'box', pose: 'idle', blink: 0, facing: -1, tilt: 0, flap: 0 };

  private paintPico(ctx: Ctx, lay: Layout, p: BakeryPalette, now: number, t: number): void {
    const { size } = lay.pico;
    const cheering = now < this.cheerUntil;
    const hop = this.reduced ? 1 : clamp01((now - this.hopAt) / M.hop);
    const lift = hop < 1 ? Math.sin(hop * Math.PI) * size * 0.2 : 0;
    const bob = this.reduced ? 0 : ((1 - Math.cos((TAU * t) / 2)) / 2) * size * 0.012;

    /* Shadow on the rim, shrinking as he leaves it. */
    ctx.fillStyle = this.alpha(p.shadow, 0.3 * (1 - lift / (size * 0.3)));
    ctx.beginPath();
    ctx.ellipse(lay.pico.x + size * 0.02, lay.pico.feet + 1, size * 0.2 * (1 - lift / size), size * 0.04, 0, 0, TAU);
    ctx.fill();

    const leanAge = (now - this.lean.at) / 1000;
    const leanK = leanAge < 0 ? 0 : leanAge < 0.12 ? leanAge / 0.12 : Math.exp(-(leanAge - 0.12) * 2.6);
    const base = this.over ? 0.05 : 0.1;
    const o = this.pico;
    o.size = size;
    o.x = lay.pico.x;
    /* Feet stand on the rim: in the 100-unit box the toes are at y ≈ 86. */
    o.y = lay.pico.feet - size * 0.36 - lift + bob;
    o.pose = this.over ? 'sad' : cheering ? 'happy' : hop < 1 ? 'flap' : 'idle';
    o.flap = (now - this.hopAt) / 1000 * 6;
    o.blink = this.reduced ? 0 : picoBlinkAt(t);
    o.tilt = this.reduced ? base : base + (this.lean.to - base) * leanK * 0.9;
    drawPico(ctx, o);
  }

  /* ── crumbs, confetti, "+N" ─────────────────────────────────────────────── */

  private paintEffects(ctx: Ctx, lay: Layout, p: BakeryPalette, now: number): void {
    if (this.rings.length) {
      this.rings = this.rings.filter((ring) => now - ring.t0 < 650);
      for (const ring of this.rings) {
        const u = (now - ring.t0) / 650;
        if (u < 0) continue;
        ctx.strokeStyle = this.alpha(p.brass, (1 - u) * 0.9);
        ctx.lineWidth = Math.max(2, lay.cell * 0.06) * (1 - u);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r * (0.6 + easeOutCubic(u) * 0.9), 0, TAU);
        ctx.stroke();
      }
    }

    if (this.crumbs.length) {
      this.crumbs = this.crumbs.filter((c) => (now - c.t0) / 1000 < c.life);
      for (const c of this.crumbs) {
        const s = (now - c.t0) / 1000;
        if (s < 0) continue;
        const u = s / c.life;
        const x = c.x + c.vx * s * (c.shape === 2 ? 1 - u * 0.4 : 1);
        const y = c.y + c.vy * s + 0.5 * c.gravity * s * s;
        ctx.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        ctx.fillStyle = c.colour;
        if (c.shape === 0) {
          ctx.beginPath();
          ctx.arc(x, y, c.r * (1 - u * 0.4), 0, TAU);
          ctx.fill();
        } else if (c.shape === 1) {
          star(ctx, x, y, c.r * 1.6 * (1 - u * 0.5), c.r * 0.35);
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(c.spin * s);
          ctx.scale(1, Math.cos(c.spin * s * 1.3));
          ctx.fillRect(-c.r, -c.r * 0.5, c.r * 2, c.r);
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
        const y = f.y - easeOutCubic(u) * lay.cell * 0.55;
        ctx.globalAlpha = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
        ctx.font = `600 ${Math.round(f.size)}px ${this.font}`;
        ctx.lineWidth = Math.max(3, f.size * 0.22);
        ctx.strokeStyle = p.floaterEdge;
        ctx.strokeText(f.text, f.x, y);
        ctx.fillStyle = p.floater;
        ctx.fillText(f.text, f.x, y);
      }
      ctx.globalAlpha = 1;
    }
  }

  private alpha(hex: string, a: number): string {
    return withAlpha(hex, a);
  }
}

/** Sort key: what draws under what. */
function rank(piece: Piece, now: number): number {
  if (piece.dies !== Infinity) return 0;
  if (piece.pop >= 0 && now < piece.pop + M.merge) return 3;
  if (piece.grow >= 0 && now < piece.grow + M.spawn) return 2;
  return 1;
}

/** The tray's geometry: its box, its frame and thickness, and its sixteen sockets. */
export interface TrayGeometry {
  bx: number;
  by: number;
  bs: number;
  frame: number;
  thick: number;
  cell: number;
  cells: { x: number; y: number }[];
}

/** Where the frame, the sockets and the tiles go for a tray `bs` across at `(bx, by)`. */
export function trayGeometry(bx: number, by: number, bs: number): TrayGeometry {
  const frame = Math.round(bs * L.frame);
  const gap = bs * L.gap;
  const cell = (bs - 2 * frame - 5 * gap) / SIZE;
  return {
    bx,
    by,
    bs,
    frame,
    thick: Math.max(4, bs * 0.026),
    cell,
    cells: Array.from({ length: SIZE * SIZE }, (_, i) => ({
      x: bx + frame + gap + (i % SIZE) * (cell + gap),
      y: by + frame + gap + Math.floor(i / SIZE) * (cell + gap),
    })),
  };
}

/**
 * The wooden tray with its enamel bed and sixteen empty sockets — the scene
 * caches this once per size, and the hover miniature paints it directly.
 */
export function paintTrayOn(ctx: Ctx, lay: TrayGeometry, p: BakeryPalette, dark: boolean): void {
  const { bx, by, bs, frame, thick } = lay;
  const R = bs * 0.055;

  /* Its thickness, then the frame's face over it. */
  ctx.fillStyle = p.woodLow;
  ctx.beginPath();
  roundedRect(ctx, bx, by + thick, bs, bs, R);
  ctx.fill();
  const face = ctx.createLinearGradient(0, by, 0, by + bs);
  face.addColorStop(0, p.woodLit);
  face.addColorStop(0.5, p.wood);
  face.addColorStop(1, p.wood);
  ctx.fillStyle = face;
  ctx.beginPath();
  roundedRect(ctx, bx, by, bs, bs, R);
  ctx.fill();

  /* Grain: long soft strokes along the frame. */
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, bx, by, bs, bs, R);
  ctx.clip();
  ctx.strokeStyle = withAlpha(p.woodLow, 0.28);
  ctx.lineWidth = 1;
  for (let k = 0; k < 14; k += 1) {
    const yy = by + (k + 0.5) * (bs / 14);
    ctx.beginPath();
    ctx.moveTo(bx, yy);
    for (let x = 0; x <= bs; x += bs / 8) {
      ctx.lineTo(bx + x, yy + Math.sin(k * 1.7 + x * 0.045) * 1.6);
    }
    ctx.stroke();
  }
  ctx.restore();
  /* A highlight along the top edge. */
  ctx.strokeStyle = withAlpha('#ffffff', dark ? 0.12 : 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  roundedRect(ctx, bx + 1, by + 1, bs - 2, bs - 2, R);
  ctx.stroke();

  /* Brass rivets in the corners. */
  const rv = Math.max(2, frame * 0.2);
  for (const [cx, cy] of [
    [bx + frame * 0.5, by + frame * 0.5],
    [bx + bs - frame * 0.5, by + frame * 0.5],
    [bx + frame * 0.5, by + bs - frame * 0.5],
    [bx + bs - frame * 0.5, by + bs - frame * 0.5],
  ]) {
    ctx.fillStyle = p.brassLow;
    ctx.beginPath();
    ctx.arc(cx, cy + 0.6, rv, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.brass;
    ctx.beginPath();
    ctx.arc(cx, cy, rv, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha('#ffffff', 0.6);
    ctx.beginPath();
    ctx.arc(cx - rv * 0.3, cy - rv * 0.3, rv * 0.35, 0, TAU);
    ctx.fill();
  }

  /* The enamel bed, with the frame's shadow falling into it from the top. */
  const ix = bx + frame;
  const iy = by + frame;
  const is = bs - 2 * frame;
  const bedR = bs * 0.035;
  const bed = ctx.createLinearGradient(0, iy, 0, iy + is);
  bed.addColorStop(0, p.bedLow);
  bed.addColorStop(0.12, p.bed);
  bed.addColorStop(1, p.bedLow);
  ctx.fillStyle = bed;
  ctx.beginPath();
  roundedRect(ctx, ix, iy, is, is, bedR);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, ix, iy, is, is, bedR);
  ctx.clip();
  const fall = ctx.createLinearGradient(0, iy, 0, iy + frame * 0.9);
  fall.addColorStop(0, withAlpha(p.shadow, 0.45));
  fall.addColorStop(1, withAlpha(p.shadow, 0));
  ctx.fillStyle = fall;
  ctx.fillRect(ix, iy, is, frame * 0.9);
  ctx.restore();

  /* Sixteen sockets, each with its top lip in shadow. */
  const r = lay.cell * L.tileRadius;
  const drop = Math.max(1.5, lay.cell * 0.035);
  for (const c of lay.cells) {
    ctx.fillStyle = p.socketShade;
    ctx.beginPath();
    roundedRect(ctx, c.x, c.y, lay.cell, lay.cell, r);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, c.x, c.y, lay.cell, lay.cell, r);
    ctx.clip();
    ctx.fillStyle = p.socket;
    ctx.beginPath();
    roundedRect(ctx, c.x, c.y + drop, lay.cell, lay.cell, r);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = withAlpha('#ffffff', 0.05);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x + r, c.y + lay.cell - 0.5);
    ctx.lineTo(c.x + lay.cell - r, c.y + lay.cell - 0.5);
    ctx.stroke();
  }
}

/* ── drawing helpers ─────────────────────────────────────────────────────── */

/** A four-point twinkle. */
function star(ctx: Ctx, x: number, y: number, r: number, waist: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + waist, y - waist, x + r, y);
  ctx.quadraticCurveTo(x + waist, y + waist, x, y + r);
  ctx.quadraticCurveTo(x - waist, y + waist, x - r, y);
  ctx.quadraticCurveTo(x - waist, y - waist, x, y - r);
  ctx.fill();
}

/**
 * One glazed tile at `(x, y)`, `s` across, onto any 2D context — the scene's
 * sprite cache and the hover preview both draw through this, so the miniature
 * on a card is the same tile as the one in the round.
 */
export function paintTile(
  ctx: Ctx,
  x: number,
  y: number,
  s: number,
  value: number,
  g: TileGlaze,
  p: BakeryPalette,
  font: string,
): void {
  const r = s * L.tileRadius;
  const lip = Math.max(2, s * L.lip);
  const faceH = s - lip;

  /* A soft contact shadow in the socket. */
  ctx.save();
  ctx.shadowColor = withAlpha(p.shadow, 0.45);
  ctx.shadowBlur = s * 0.08;
  ctx.shadowOffsetY = s * 0.03;
  ctx.fillStyle = g.lip;
  ctx.beginPath();
  roundedRect(ctx, x, y + lip, s, faceH, r);
  ctx.fill();
  ctx.restore();

  /* The face, pooled darker toward the bottom. */
  const face = ctx.createLinearGradient(0, y, 0, y + faceH);
  face.addColorStop(0, g.face);
  face.addColorStop(1, g.faceLow);
  ctx.fillStyle = face;
  ctx.beginPath();
  roundedRect(ctx, x, y, s, faceH, r);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, x, y, s, faceH, r);
  ctx.clip();
  /* The glaze's sheen across the top… */
  const dark = value >= 128 && value < 512;
  const sheen = ctx.createLinearGradient(0, y, 0, y + faceH * 0.55);
  sheen.addColorStop(0, withAlpha('#ffffff', dark ? 0.22 : 0.5));
  sheen.addColorStop(1, withAlpha('#ffffff', 0));
  ctx.fillStyle = sheen;
  ctx.beginPath();
  roundedRect(ctx, x + s * 0.05, y + s * 0.04, s * 0.9, faceH * 0.5, r * 0.8);
  ctx.fill();
  /* …and a rim of light along its lower edge, where the glaze is thick. */
  ctx.strokeStyle = withAlpha(g.lip, 0.55);
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  roundedRect(ctx, x + 0.5, y + 0.5, s - 1, faceH - 1, r);
  ctx.stroke();
  ctx.restore();

  /* The rim inlay, from 8 up — gilt on the grand ones. */
  if (value >= 8) {
    const inset = s * 0.075;
    ctx.strokeStyle = g.gilt ? p.brass : withAlpha('#ffffff', dark ? 0.22 : 0.42);
    ctx.lineWidth = Math.max(1, s * (g.gilt ? 0.028 : 0.018));
    ctx.beginPath();
    roundedRect(ctx, x + inset, y + inset, s - inset * 2, faceH - inset * 2, r * 0.7);
    ctx.stroke();
  }

  /* A glint. */
  ctx.fillStyle = withAlpha('#ffffff', 0.85);
  ctx.beginPath();
  ctx.ellipse(x + s * 0.21, y + s * 0.17, s * 0.06, s * 0.035, -0.6, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + s * 0.32, y + s * 0.14, s * 0.017, 0, TAU);
  ctx.fill();

  /* The number — always the loudest thing on the tile. */
  const digits = String(value).length;
  const size = s * (digits <= 2 ? 0.44 : digits === 3 ? 0.36 : digits === 4 ? 0.28 : 0.23);
  const cy = y + faceH * 0.5 + (g.crown ? s * 0.07 : 0);
  ctx.font = `600 ${Math.round(size)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(String(value));
  const asc = m.actualBoundingBoxAscent || size * 0.72;
  const desc = m.actualBoundingBoxDescent || 0;
  const baseY = cy + (asc - desc) / 2;
  /* Pressed into the glaze: a lip-coloured shadow a hair below. */
  ctx.fillStyle = withAlpha(g.lip, 0.75);
  ctx.fillText(String(value), x + s / 2, baseY + Math.max(1, s * 0.018));
  ctx.fillStyle = g.ink;
  ctx.fillText(String(value), x + s / 2, baseY);

  if (g.crown) {
    const cw = s * 0.3;
    const ch = s * 0.13;
    const cx = x + s / 2;
    const top = cy - asc / 2 - ch - s * 0.05;
    ctx.fillStyle = g.crownInInk ? g.ink : p.brassLow;
    ctx.beginPath();
    ctx.moveTo(cx - cw / 2, top + ch);
    ctx.lineTo(cx - cw / 2, top + ch * 0.25);
    ctx.lineTo(cx - cw / 4, top + ch * 0.6);
    ctx.lineTo(cx, top);
    ctx.lineTo(cx + cw / 4, top + ch * 0.6);
    ctx.lineTo(cx + cw / 2, top + ch * 0.25);
    ctx.lineTo(cx + cw / 2, top + ch);
    ctx.closePath();
    ctx.fill();
  }
}
