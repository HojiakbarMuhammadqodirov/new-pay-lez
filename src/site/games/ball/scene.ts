import { drawPico, picoBlinkAt, picoSizeForBodyRadius, type DrawPicoOptions, type PicoPose } from '../../pico';
import type { ThemeName } from '../../theme/context';
import { clamp, glowSheet, lerp, rgba, seeded, sheet, sparklePath, starPath, type Sheet } from '../sceneKit';
import { BALL_PALETTE, BALL_SCENE, type BallPalette } from './config';

/**
 * Pico's Ball's painter: the round, drawn. It reads the game and never writes
 * it.
 *
 * `Breakout.tsx` owns the round exactly as before — its sub-stepped loop moves
 * the ball and the paddle and spends the wall, and calls `paint()` once a frame.
 * This file looks at what it is handed and notices what changed since the
 * last frame: a brick whose count fell (cracked, or broken), the ball turned
 * back up off the board, the round's end. It answers with pictures — sand
 * bursting, a shell tumbling out, the board flexing under the hit, Pico
 * cheering a run or drooping as the ball drops past him into the sea. Nothing
 * it computes flows back; every rectangle it draws in is the game's own
 * (`BallGeometry`, handed in by the component that owns the constants).
 *
 * Per frame it allocates nothing in its loops: the backdrop, every block in
 * each of its states, the board and the ball's gloss are pre-rendered sheets;
 * particles, the trail and per-brick flashes live in typed arrays.
 */

/** The game's own geometry, in field widths, from `Breakout.tsx`. */
export interface BallGeometry {
  aspect: number;
  paddleW: number;
  paddleH: number;
  paddleY: number;
  ballR: number;
  /** Where the sea meets the sky, in field widths from the top. */
  horizon: number;
  /** Brick `i`'s rectangle. Called once per brick at construction. */
  brick: (i: number) => { x: number; y: number; w: number; h: number };
}

export type BallEnd = 'lost' | 'cleared' | 'time';

export interface BallView {
  phase: 'ready' | 'playing' | 'over';
  end: BallEnd | null;
  reduced: boolean;
}

/** What the loop has this frame: the wall, the paddle's centre and the ball. */
export interface BallFrame {
  wall: readonly number[];
  paddle: number;
  ball: { x: number; y: number; vx: number; vy: number };
}

/* Particle kinds. */
const GRAIN = 0;
const DUST = 1;
const FIND = 2;
const SPARK = 3;
const DROP = 4;
const CONFETTI = 5;

/** What a dry block has pressed into it, by `deco(i)`. */
const SHELL = 0;
const STARFISH = 1;
const PEBBLE = 2;
const GLASS = 3;

const deco = (i: number): number => ((i * 7 + 3) % 11) % 6;

interface Built {
  key: string;
  w: number;
  h: number;
  p: BallPalette;
  accent: string;
  night: boolean;
  backdrop: Sheet;
  fronds: Sheet;
  clouds: Sheet[];
  /** Per brick: its look while whole, and (two-hit blocks) once cracked. */
  whole: Sheet[];
  cracked: (Sheet | null)[];
  board: Sheet;
  gloss: Sheet;
  glow: Sheet;
  lamp: Sheet;
  /** The orb's reflection column on the sea: its centre x and width. */
  pathX: number;
  pathW: number;
}

export class BallScene {
  private built: Built | null = null;
  private readonly geo: BallGeometry;
  private readonly count: number;
  private readonly bx: Float32Array;
  private readonly by: Float32Array;
  private readonly bw: Float32Array;
  private readonly bh: Float32Array;
  /** What each brick started at (two-hit blocks are wet sand) and what we last saw. */
  private readonly start: Int8Array;
  private readonly seen: Int8Array;
  private readonly flash: Float32Array;

  /* ── clocks ── */
  private last = -1;
  private t = 0;
  private ft = 0;

  /* ── what the painter has seen ── */
  private prevVy = 0;
  private run = 0;
  private cheer = 0;
  private squash = 0;
  private shake = 0;
  private picoX = 0.5;
  private facing: 1 | -1 = 1;
  private wing = 0;
  private sink = 0;
  private endSeen: BallEnd | null = null;
  private endAt = 0;
  /* The ball after it is lost: a picture of it dropping into the sea. */
  private fallX = 0;
  private fallY = 0;
  private fallVy = 0;
  private splashed = false;
  private spin = 0;
  private lastBallX = 0.5;
  private lastBallY = 0;

  /* ── the ball's trail ── */
  private readonly tx = new Float32Array(BALL_SCENE.trail);
  private readonly ty = new Float32Array(BALL_SCENE.trail);
  private trailHead = 0;
  private trailCount = 0;

  /* ── particles ── */
  private readonly n = BALL_SCENE.particles;
  private readonly px = new Float32Array(this.n);
  private readonly py = new Float32Array(this.n);
  private readonly pvx = new Float32Array(this.n);
  private readonly pvy = new Float32Array(this.n);
  private readonly pr = new Float32Array(this.n);
  private readonly pvr = new Float32Array(this.n);
  private readonly pl = new Float32Array(this.n);
  private readonly pm = new Float32Array(this.n).fill(1);
  private readonly ps = new Float32Array(this.n);
  private readonly pk = new Uint8Array(this.n);
  private readonly pc = new Uint8Array(this.n);
  private next = 0;
  private readonly rand = seeded(2024);

  private readonly pico: DrawPicoOptions = { x: 0, y: 0, size: 0, anchor: 'body', pose: 'flap' };

  constructor(geo: BallGeometry, wall: readonly number[]) {
    this.geo = geo;
    this.count = wall.length;
    this.bx = new Float32Array(this.count);
    this.by = new Float32Array(this.count);
    this.bw = new Float32Array(this.count);
    this.bh = new Float32Array(this.count);
    this.start = new Int8Array(this.count);
    this.seen = new Int8Array(this.count);
    this.flash = new Float32Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      const r = geo.brick(i);
      this.bx[i] = r.x;
      this.by[i] = r.y;
      this.bw[i] = r.w;
      this.bh[i] = r.h;
      this.start[i] = wall[i];
      this.seen[i] = wall[i];
    }
  }

  /**
   * Take `wall` as already seen, without the hits it implies — for a still
   * that starts mid-round (the hover miniature), where a crack must not flash.
   */
  settle(wall: readonly number[]): void {
    for (let i = 0; i < this.count; i += 1) this.seen[i] = wall[i];
  }

  /** (Re)build the sheets for a `w × h` canvas at `ratio` in `theme`, if any changed. */
  configure(w: number, h: number, ratio: number, theme: ThemeName, accent: string): void {
    const key = `${w}x${h}@${ratio}:${theme}:${accent}`;
    if (this.built?.key === key || w < 2 || h < 2) return;
    this.built = this.build(key, w, h, Math.min(ratio, BALL_SCENE.maxRatio), BALL_PALETTE[theme], accent, theme === 'dark');
  }

  /** One frame. `ctx` is already scaled to CSS pixels. */
  paint(ctx: CanvasRenderingContext2D, f: BallFrame, view: BallView, now: number): void {
    const b = this.built;
    if (!b) return;
    const dt = this.last < 0 ? 0 : clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    if (!view.reduced) this.t += dt;
    this.ft += dt;
    this.observe(f, view, dt);

    const k = b.w;
    ctx.save();
    if (this.shake > 0 && !view.reduced) {
      const a = (this.shake / BALL_SCENE.shake.seconds) * BALL_SCENE.shake.px * (k / 360);
      ctx.translate(Math.sin(this.ft * 83) * a, Math.cos(this.ft * 61) * a * 0.6);
    }
    ctx.drawImage(b.backdrop.c, 0, 0, b.w, b.h);
    this.ambient(ctx, b);
    this.drawWall(ctx, b, f);
    this.drawParticles(ctx, b, false);
    this.drawBall(ctx, b, f, view);
    this.surf(ctx, b);
    this.drawPico(ctx, b, f, view);
    this.drawParticles(ctx, b, true);
    ctx.restore();
  }

  /* ═══════════════════════════════════════════════════════════ events ══ */

  private observe(f: BallFrame, view: BallView, dt: number): void {
    const geo = this.geo;
    const ball = f.ball;
    /* The wall: a count that fell is a hit — to zero, a break. */
    for (let i = 0; i < this.count; i += 1) {
      const hp = f.wall[i];
      if (hp >= this.seen[i]) continue;
      this.seen[i] = hp;
      this.flash[i] = BALL_SCENE.flash;
      if (view.reduced) continue;
      const cx = this.bx[i] + this.bw[i] / 2;
      const cy = this.by[i] + this.bh[i] / 2;
      if (hp <= 0) {
        this.run += 1;
        this.shake = BALL_SCENE.shake.seconds;
        this.burst(GRAIN, cx, cy, 20, 0.5, ball.vx * 0.25, ball.vy * 0.15, this.bw[i]);
        this.burst(DUST, cx, cy, 4, 0.12, 0, 0, this.bw[i] * 0.6);
        if (this.start[i] < 2 && deco(i) <= GLASS) this.burst(FIND, cx, cy, 1, 0.25, ball.vx * 0.2, -0.3, 0);
        if (this.run >= BALL_SCENE.cheerRun) this.cheer = BALL_SCENE.cheer;
      } else {
        this.burst(GRAIN, cx, cy, 7, 0.25, 0, 0, this.bw[i] * 0.8);
      }
    }
    /* The board: the ball turned back up near it. */
    if (this.prevVy > 0 && ball.vy < 0 && ball.y > geo.paddleY - 0.12) {
      this.squash = 1;
      this.run = 0;
    }
    this.prevVy = ball.vy;

    if (view.end && !this.endSeen) {
      this.endSeen = view.end;
      this.endAt = this.ft;
      if (view.end === 'lost') {
        this.fallX = ball.x;
        this.fallY = ball.y;
        this.fallVy = Math.max(0.5, ball.vy);
      } else if (view.end === 'cleared') {
        this.cheer = 99;
        if (!view.reduced) {
          for (let i = 0; i < 6; i += 1) this.burst(CONFETTI, 0.1 + i * 0.16, -0.02, 10, 0.25, 0, 0.2, 0.1);
          this.burst(SPARK, this.picoX, geo.paddleY, 14, 0.5, 0, -0.4, 0.2);
        }
      }
    }

    /* Pico keeps up with the board a beat behind and faces where he is going. */
    const before = this.picoX;
    this.picoX += (f.paddle - this.picoX) * Math.min(1, dt * BALL_SCENE.follow);
    const moved = this.picoX - before;
    if (moved > 0.0006) this.facing = 1;
    else if (moved < -0.0006) this.facing = -1;
    if (!view.reduced) {
      const { normal, cheer, sad } = BALL_SCENE.beats;
      this.wing += dt * (this.endSeen === 'lost' ? sad : this.cheer > 0 ? cheer : normal);
    }
    this.cheer = Math.max(0, this.cheer - dt);
    this.squash = Math.max(0, this.squash - dt * 5);
    this.shake = Math.max(0, this.shake - dt);
    if (this.endSeen === 'lost') this.sink = Math.min(1, this.sink + dt * 2.2);
    for (let i = 0; i < this.count; i += 1) if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - dt);

    /* The ball's spin and trail. */
    const dx = ball.x - this.lastBallX;
    const dy = ball.y - this.lastBallY;
    if (view.phase === 'playing' || (view.phase === 'over' && this.endSeen !== 'lost')) {
      this.spin += (Math.hypot(dx, dy) / (geo.ballR * BALL_SCENE.ballDraw)) * (dx >= 0 ? 1 : -1);
    }
    this.lastBallX = ball.x;
    this.lastBallY = ball.y;
    if (view.phase === 'playing') {
      this.tx[this.trailHead] = ball.x;
      this.ty[this.trailHead] = ball.y;
      this.trailHead = (this.trailHead + 1) % BALL_SCENE.trail;
      this.trailCount = Math.min(BALL_SCENE.trail, this.trailCount + 1);
    } else if (this.trailCount > 0) {
      this.trailCount -= 1;
    }

    /* The lost ball drops on into the sea and splashes. */
    if (this.endSeen === 'lost') {
      this.fallVy += 2.4 * dt;
      this.fallY += this.fallVy * dt;
      this.spin += dt * 9;
      const sea = geo.aspect + BALL_SCENE.strip * 0.72;
      if (!this.splashed && this.fallY > sea) {
        this.splashed = true;
        if (!view.reduced) this.burst(DROP, this.fallX, sea, 16, 0.35, 0, -0.55, 0.02);
      }
    }
    this.stepParticles(dt);
  }

  /* ═══════════════════════════════════════════════════════ particles ══ */

  private burst(kind: number, x: number, y: number, count: number, speed: number, ax: number, ay: number, spread: number): void {
    const r = this.rand;
    for (let i = 0; i < count; i += 1) {
      const k = this.next;
      this.next = (this.next + 1) % this.n;
      const a = r() * Math.PI * 2;
      const s = speed * (0.3 + r() * 0.7);
      this.px[k] = x + (r() - 0.5) * spread;
      this.py[k] = y + (r() - 0.5) * spread * 0.3;
      this.pvx[k] = Math.cos(a) * s + ax;
      this.pvy[k] = Math.sin(a) * s + ay - (kind === DROP ? r() * 0.4 : 0);
      this.pr[k] = r() * Math.PI * 2;
      this.pvr[k] = (r() - 0.5) * (kind === FIND ? 8 : 14);
      const life =
        kind === CONFETTI ? 1.6 + r() * 1.2 : kind === FIND ? 1.4 : kind === DUST ? 0.45 + r() * 0.2 : 0.5 + r() * 0.45;
      this.pl[k] = life;
      this.pm[k] = life;
      this.ps[k] = 0.6 + r() * 0.7;
      this.pk[k] = kind;
      this.pc[k] = Math.floor(r() * 6);
    }
  }

  private stepParticles(dt: number): void {
    for (let i = 0; i < this.n; i += 1) {
      if (this.pl[i] <= 0) continue;
      this.pl[i] -= dt;
      const kind = this.pk[i];
      const g = kind === DUST || kind === SPARK ? 0 : kind === CONFETTI ? 0.45 : kind === FIND ? 1.6 : 2.2;
      this.pvy[i] += g * dt;
      if (kind === CONFETTI) {
        this.pvx[i] += Math.sin(this.ft * 4 + i) * 0.3 * dt;
        this.pvy[i] = Math.min(this.pvy[i], 0.28);
      } else if (kind === DUST) {
        this.pvx[i] *= 1 - dt * 4;
        this.pvy[i] *= 1 - dt * 4;
      }
      this.px[i] += this.pvx[i] * dt;
      this.py[i] += this.pvy[i] * dt;
      this.pr[i] += this.pvr[i] * dt;
    }
  }

  /** `front`: confetti and drops go over Pico; sand and finds go behind him. */
  private drawParticles(ctx: CanvasRenderingContext2D, b: Built, front: boolean): void {
    const { p } = b;
    const k = b.w;
    const unit = k / 360;
    for (let i = 0; i < this.n; i += 1) {
      const life = this.pl[i];
      if (life <= 0) continue;
      const kind = this.pk[i];
      const isFront = kind === CONFETTI || kind === DROP || kind === SPARK;
      if (isFront !== front) continue;
      const age = 1 - life / this.pm[i];
      const x = this.px[i] * k;
      const y = this.py[i] * k;
      const s = this.ps[i] * unit;
      if (kind === GRAIN) {
        ctx.globalAlpha = clamp(life * 2.5, 0, 1);
        ctx.fillStyle = this.pc[i] % 3 === 0 ? p.sandLo : this.pc[i] % 3 === 1 ? p.sand[2] : p.sandHi;
        ctx.fillRect(x - 1.3 * s, y - 1.3 * s, 2.6 * s, 2.6 * s);
        continue;
      }
      if (kind === DUST) {
        /* A puff of sand: small and quick, so it reads as dust, not smoke. */
        ctx.globalAlpha = (1 - age) * (1 - age) * 0.32;
        ctx.fillStyle = p.sand[2];
        ctx.beginPath();
        ctx.arc(x, y, (3 + age * 6) * s, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (kind === DROP) {
        ctx.globalAlpha = clamp(life * 2, 0, 1);
        ctx.fillStyle = p.foam;
        ctx.beginPath();
        ctx.arc(x, y, 1.8 * s, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.pr[i]);
      if (kind === FIND) {
        ctx.globalAlpha = clamp(life * 2, 0, 1);
        drawFind(ctx, deco(this.pc[i] % 4), 6 * unit, p);
      } else if (kind === SPARK) {
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = this.pc[i] % 2 ? b.accent : p.confetti[0];
        sparklePath(ctx, (4 + (1 - age) * 3) * s);
        ctx.fill();
      } else {
        ctx.globalAlpha = clamp(life * 1.2, 0, 1);
        ctx.fillStyle = p.confetti[this.pc[i] % p.confetti.length];
        const flip = Math.abs(Math.cos(this.pr[i] * 1.7));
        ctx.fillRect(-3.5 * s, -2 * s * flip - 0.4, 7 * s, 4 * s * flip + 0.8);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ═══════════════════════════════════════════════════════════ scene ══ */

  private ambient(ctx: CanvasRenderingContext2D, b: Built): void {
    const { p } = b;
    const k = b.w;
    const unit = k / 360;
    const horizon = this.geo.horizon * k;

    /* Clouds drifting across the open sky under the wall. */
    for (let i = 0; i < b.clouds.length; i += 1) {
      const c = b.clouds[i];
      const span = k + c.w;
      const x = ((((i * 0.37 + 0.1) * span + this.t * k * (0.006 + i * 0.003)) % span) + span) % span - c.w;
      const y = horizon - k * (0.48 - i * 0.12);
      ctx.globalAlpha = p.cloud.alpha;
      ctx.drawImage(c.c, x, y, c.w, c.h);
    }
    ctx.globalAlpha = 1;

    /* The orb's path on the water, glittering. */
    ctx.fillStyle = p.sea.glint;
    for (let i = 0; i < 26; i += 1) {
      const u = (i * 0.618) % 1;
      const y = horizon + 3 * unit + Math.pow(u, 1.4) * (b.h - horizon - 6 * unit);
      const spread = b.pathW * (0.35 + u * 0.9);
      const x = b.pathX + Math.sin(i * 12.9898) * spread;
      const tw = Math.max(0, Math.sin(this.t * (1.3 + (i % 5) * 0.4) + i * 2.1));
      if (tw < 0.05) continue;
      ctx.globalAlpha = tw * 0.85;
      const len = (3 + u * 9) * unit;
      ctx.fillRect(x - len / 2, y, len, Math.max(1, (0.8 + u) * unit));
    }
    ctx.globalAlpha = 1;

    /* The lighthouse lamp on the far island, turning by night. */
    if (b.night) {
      const lx = k * 0.27;
      const ly = horizon - k * 0.084;
      ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(this.t * 1.7));
      ctx.drawImage(b.lamp.c, lx - b.lamp.w / 2, ly - b.lamp.h / 2, b.lamp.w, b.lamp.h);
      ctx.globalAlpha = 1;
    }

    /* Gulls by day, wheeling slowly. */
    if (!b.night) {
      ctx.strokeStyle = p.gull;
      ctx.lineWidth = Math.max(1, 1.4 * unit);
      for (let g = 0; g < 2; g += 1) {
        const gx = k * (0.55 + 0.3 * Math.sin(this.t * 0.11 + g * 2.4));
        const gy = horizon - k * (0.36 - g * 0.1 - 0.02 * Math.sin(this.t * 0.3 + g));
        const beat = Math.sin(this.t * 5 + g * 1.7) * 3 * unit;
        const span = 6 * unit;
        ctx.beginPath();
        ctx.moveTo(gx - span, gy - beat);
        ctx.quadraticCurveTo(gx - span * 0.4, gy - beat * 0.2 - 1.5 * unit, gx, gy);
        ctx.quadraticCurveTo(gx + span * 0.4, gy - beat * 0.2 - 1.5 * unit, gx + span, gy - beat);
        ctx.stroke();
      }
    }

    /* Palm fronds over the two top corners, stirring. */
    const sway = Math.sin(this.t * 0.9) * 0.025;
    ctx.save();
    ctx.translate(0, 0);
    ctx.rotate(sway);
    ctx.drawImage(b.fronds.c, -b.fronds.w * 0.12, -b.fronds.h * 0.18, b.fronds.w, b.fronds.h);
    ctx.restore();
    ctx.save();
    ctx.translate(k, 0);
    ctx.scale(-1, 1);
    ctx.rotate(-sway * 0.8);
    ctx.drawImage(b.fronds.c, -b.fronds.w * 0.16, -b.fronds.h * 0.24, b.fronds.w * 0.9, b.fronds.h * 0.9);
    ctx.restore();
  }

  /** The near surf along the foot of the field: two rolling bands, the crest lit. */
  private surf(ctx: CanvasRenderingContext2D, b: Built): void {
    const { p } = b;
    const k = b.w;
    const unit = k / 360;
    const base = (this.geo.aspect + BALL_SCENE.strip * 0.62) * k;
    for (let layer = 0; layer < 2; layer += 1) {
      const y0 = base + layer * 9 * unit;
      const amp = (2.2 + layer * 1.4) * unit;
      const freq = (layer ? 0.045 : 0.06) / unit;
      const ph = this.t * (layer ? 1.1 : 0.8) + layer * 1.7;
      ctx.beginPath();
      ctx.moveTo(0, b.h);
      for (let x = 0; x <= k + 6; x += 6 * unit) ctx.lineTo(x, y0 + Math.sin(x * freq + ph) * amp);
      ctx.lineTo(k, b.h);
      ctx.closePath();
      ctx.fillStyle = layer ? p.sea.deep : rgba(p.sea.deep, 0.75);
      ctx.fill();
      /* The crest: foam by day; by night the surf glows the page's mint. */
      ctx.beginPath();
      for (let x = 0; x <= k + 6; x += 6 * unit) {
        const y = y0 + Math.sin(x * freq + ph) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (p.surfGlow > 0) {
        ctx.strokeStyle = rgba(b.accent, p.surfGlow * 0.35);
        ctx.lineWidth = 5 * unit;
        ctx.stroke();
        ctx.strokeStyle = rgba(b.accent, p.surfGlow + 0.2 * Math.sin(this.t * 1.3 + layer));
        ctx.lineWidth = 1.6 * unit;
        ctx.stroke();
      } else {
        ctx.strokeStyle = rgba(p.foam, layer ? 0.9 : 0.7);
        ctx.lineWidth = (1.6 + layer) * unit;
        ctx.stroke();
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════ wall ══ */

  private drawWall(ctx: CanvasRenderingContext2D, b: Built, f: BallFrame): void {
    const k = b.w;
    for (let i = 0; i < this.count; i += 1) {
      const hp = f.wall[i];
      if (hp <= 0) continue;
      const fl = this.flash[i] / BALL_SCENE.flash;
      const s = hp < this.start[i] ? b.cracked[i] ?? b.whole[i] : b.whole[i];
      const jiggle = fl > 0 ? Math.sin(this.ft * 90) * fl * 1.4 * (k / 360) : 0;
      const x = this.bx[i] * k + jiggle;
      const y = this.by[i] * k;
      /* The sheet carries a pixel of contact shadow under the block. */
      ctx.drawImage(s.c, x - 1, y - 1, s.w, s.h);
      if (fl > 0) {
        ctx.globalAlpha = fl * 0.6;
        ctx.fillStyle = b.p.sandHi;
        ctx.beginPath();
        ctx.roundRect(x, y, this.bw[i] * k, this.bh[i] * k, this.bh[i] * k * 0.2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════ ball ══ */

  private drawBall(ctx: CanvasRenderingContext2D, b: Built, f: BallFrame, view: BallView): void {
    const { p } = b;
    const k = b.w;
    const rb = this.geo.ballR * BALL_SCENE.ballDraw * k;
    const lost = this.endSeen === 'lost';
    const x = (lost ? this.fallX : f.ball.x) * k;
    const y = (lost ? this.fallY : f.ball.y) * k;
    if (lost && this.splashed) return;

    /* The trail, oldest faintest — added as light by night, so it glows
       rather than browning the dark sky. */
    if (b.night) ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < this.trailCount; j += 1) {
      const idx = (this.trailHead - this.trailCount + j + BALL_SCENE.trail * 2) % BALL_SCENE.trail;
      const u = (j + 1) / (this.trailCount + 1);
      ctx.globalAlpha = u * 0.3;
      ctx.fillStyle = p.ball[1];
      ctx.beginPath();
      ctx.arc(this.tx[idx] * k, this.ty[idx] * k, rb * (0.35 + 0.55 * u), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (p.ballGlow > 0) {
      ctx.globalAlpha = p.ballGlow;
      ctx.drawImage(b.glow.c, x - b.glow.w / 2, y - b.glow.h / 2, b.glow.w, b.glow.h);
      ctx.globalAlpha = 1;
    }
    /* The panels, turning with the roll; then the fixed gloss and shade over them. */
    const a0 = view.reduced ? 0.4 : this.spin;
    for (let i = 0; i < 6; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? p.ball[i / 2] : p.ballWhite;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, rb, a0 + (i * Math.PI) / 3, a0 + ((i + 1) * Math.PI) / 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.drawImage(b.gloss.c, x - b.gloss.w / 2, y - b.gloss.h / 2, b.gloss.w, b.gloss.h);
  }

  /* ═════════════════════════════════════════════════════ Pico + board ══ */

  private drawPico(ctx: CanvasRenderingContext2D, b: Built, f: BallFrame, view: BallView): void {
    const geo = this.geo;
    const k = b.w;
    const r = BALL_SCENE.picoR * k;
    const since = this.ft - this.endAt;
    const won = this.endSeen === 'cleared';
    const hop = won && !view.reduced ? Math.abs(Math.sin(since * 8)) * 0.018 * k : 0;
    const boardY = (geo.paddleY + this.sink * 0.012) * k + this.squash * 0.005 * k - hop;
    const boardBottom = boardY + geo.paddleH * k;
    /* Crest under the board: the crest reaches 2.35 radii above the body. */
    const bodyY = boardBottom + (2.35 - BALL_SCENE.tuck) * r + this.sink * 0.035 * k;

    let pose: PicoPose = 'flap';
    if (this.endSeen === 'lost') pose = 'sad';
    else if (this.cheer > 0) pose = 'happy';
    const o = this.pico;
    o.size = picoSizeForBodyRadius(r);
    o.x = this.picoX * k;
    o.y = bodyY + (pose === 'flap' && !view.reduced ? Math.sin(this.wing * Math.PI * 2) * 0.12 * r : 0);
    o.pose = pose;
    o.flap = view.reduced ? 0.5 : this.wing;
    o.blink = picoBlinkAt(this.t + 0.7);
    o.facing = this.facing;
    o.tilt = clamp((f.paddle - this.picoX) * 4, -0.25, 0.25) * this.facing + (pose === 'sad' ? 0.12 : 0);

    /* His shadow on the water below. */
    ctx.fillStyle = b.p.shadow;
    ctx.beginPath();
    ctx.ellipse(o.x, (geo.aspect + BALL_SCENE.strip * 0.66) * k, r * 1.2, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    drawPico(ctx, o);

    /* The board on top of him, flexing under a hit. */
    const pw = geo.paddleW * k;
    const s = this.squash;
    ctx.save();
    ctx.translate(f.paddle * k, boardBottom);
    if (this.endSeen === 'lost') ctx.rotate(this.sink * 0.05 * -this.facing);
    ctx.scale(1 + s * 0.05, 1 - s * 0.28);
    ctx.drawImage(b.board.c, -pw / 2 - b.board.w * 0.04, -b.board.h * 0.42, b.board.w, b.board.h);
    ctx.restore();
  }

  /* ═══════════════════════════════════════════════════════════ build ══ */

  private build(key: string, w: number, h: number, ratio: number, p: BallPalette, accent: string, night: boolean): Built {
    const k = w;
    const unit = k / 360;
    const whole: Sheet[] = [];
    const cracked: (Sheet | null)[] = [];
    for (let i = 0; i < this.count; i += 1) {
      const row = Math.floor(this.by[i] / Math.max(1e-6, this.bh[i] + 0.008));
      const tough = this.start[i] >= 2;
      whole.push(blockSheet(i, this.bw[i] * k, this.bh[i] * k, unit, p, ratio, tough, false, row));
      cracked.push(tough ? blockSheet(i, this.bw[i] * k, this.bh[i] * k, unit, p, ratio, true, true, row) : null);
    }
    const rb = this.geo.ballR * BALL_SCENE.ballDraw * k;
    const orb = { x: 0.71 * k, y: (this.geo.horizon - 0.18) * k, r: (night ? 0.065 : 0.08) * k };
    return {
      key,
      w,
      h,
      p,
      accent,
      night,
      backdrop: backdropSheet(w, h, p, ratio, night, orb, this.geo.aspect, this.geo.horizon),
      fronds: frondSheet(unit, p, ratio),
      clouds: [0, 1, 2].map((v) => cloudSheet(unit, p, ratio, v)),
      whole,
      cracked,
      board: boardSheet(this.geo.paddleW * k, this.geo.paddleH * k, unit, p, ratio),
      gloss: glossSheet(rb, p, ratio),
      glow: glowSheet(rb * 3.2, p.ball[1], 0.5, ratio),
      lamp: glowSheet(14 * unit, p.lighthouse.lamp, 0.85, ratio),
      pathX: orb.x,
      pathW: orb.r * 0.9,
    };
  }
}

/* ═════════════════════════════════════════════════════════════ sheets ══ */

function backdropSheet(
  w: number,
  h: number,
  p: BallPalette,
  ratio: number,
  night: boolean,
  orb: { x: number; y: number; r: number },
  aspect: number,
  horizonAt: number,
): Sheet {
  const s = sheet(w, h, ratio);
  const g = s.g;
  const k = w;
  const unit = k / 360;
  const horizon = horizonAt * k;
  const r = seeded(77);

  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, p.sky[0]);
  sky.addColorStop(0.55, p.sky[1]);
  sky.addColorStop(1, p.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, horizon + 1);

  for (let i = 0; i < p.stars; i += 1) {
    const sx = r() * w;
    const sy = Math.pow(r(), 1.6) * horizon * 0.85;
    g.fillStyle = rgba(p.star, 0.3 + r() * 0.6);
    g.beginPath();
    g.arc(sx, sy, (0.4 + r() * r() * 1.3) * unit, 0, Math.PI * 2);
    g.fill();
  }

  /* The orb and its halo; the sun sits low and warm, the moon higher and cold. */
  const halo = g.createRadialGradient(orb.x, orb.y, orb.r * 0.6, orb.x, orb.y, orb.r * 4);
  halo.addColorStop(0, rgba(p.halo, p.haloAlpha));
  halo.addColorStop(1, rgba(p.halo, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, w, horizon);
  const disc = g.createRadialGradient(orb.x - orb.r * 0.25, orb.y - orb.r * 0.25, orb.r * 0.1, orb.x, orb.y, orb.r);
  disc.addColorStop(0, p.orb);
  disc.addColorStop(1, night ? p.orb : p.orbShade);
  g.fillStyle = disc;
  g.beginPath();
  g.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
  g.fill();
  if (night) {
    g.fillStyle = p.orbShade;
    for (const [mx, my, mr] of [
      [-0.3, -0.2, 0.26],
      [0.25, 0.15, 0.2],
      [-0.05, 0.4, 0.14],
    ] as const) {
      g.beginPath();
      g.arc(orb.x + mx * orb.r, orb.y + my * orb.r, mr * orb.r, 0, Math.PI * 2);
      g.fill();
    }
  }

  /* The sea, horizon to foot. */
  const sea = g.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, p.sea.horizon);
  sea.addColorStop(1, p.sea.deep);
  g.fillStyle = sea;
  g.fillRect(0, horizon, w, h - horizon);
  /* The orb's path laid on the water, softly. */
  const path = g.createLinearGradient(orb.x - orb.r * 1.6, 0, orb.x + orb.r * 1.6, 0);
  path.addColorStop(0, rgba(p.sea.glint, 0));
  path.addColorStop(0.5, rgba(p.sea.glint, night ? 0.14 : 0.22));
  path.addColorStop(1, rgba(p.sea.glint, 0));
  g.fillStyle = path;
  g.fillRect(orb.x - orb.r * 1.6, horizon, orb.r * 3.2, h - horizon);
  /* Swell: short lines, longer and further apart toward the viewer. */
  g.strokeStyle = rgba(p.sea.line, 0.55);
  for (let i = 0; i < 70; i += 1) {
    const u = r();
    const y = horizon + 4 * unit + Math.pow(u, 1.7) * (h - horizon - 8 * unit);
    const len = (4 + u * 26) * unit * (0.6 + r() * 0.6);
    const x = r() * w;
    g.lineWidth = Math.max(0.8, (0.6 + u * 1.4) * unit);
    g.beginPath();
    g.moveTo(x - len / 2, y);
    g.quadraticCurveTo(x, y - 1.5 * unit * u, x + len / 2, y);
    g.stroke();
  }

  /* The far islands on the horizon: the left with palms and a lighthouse. */
  const island = (x0: number, x1: number, top: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(x0, horizon + 1);
    g.bezierCurveTo(x0 + (x1 - x0) * 0.2, horizon - top, x0 + (x1 - x0) * 0.7, horizon - top * 1.1, x1, horizon + 1);
    g.closePath();
    g.fill();
  };
  island(-k * 0.05, k * 0.44, k * 0.05, p.island.far);
  island(k * 0.1, k * 0.36, k * 0.032, p.island.near);
  island(k * 0.84, k * 1.05, k * 0.03, p.island.far);
  const palm = (x: number, base: number, tall: number, lean: number) => {
    g.strokeStyle = p.island.palm;
    g.lineWidth = 1.6 * unit;
    g.beginPath();
    g.moveTo(x, base);
    g.quadraticCurveTo(x + lean * 0.3, base - tall * 0.6, x + lean, base - tall);
    g.stroke();
    g.fillStyle = p.island.palm;
    for (let i = 0; i < 6; i += 1) {
      const a = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9 + (i % 2) * 0.15;
      g.save();
      g.translate(x + lean, base - tall);
      g.rotate(a + 0.4);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(tall * 0.22, -tall * 0.12, tall * 0.42, tall * 0.08);
      g.quadraticCurveTo(tall * 0.2, -tall * 0.02, 0, 0);
      g.fill();
      g.restore();
    }
  };
  palm(k * 0.13, horizon - k * 0.022, k * 0.07, k * 0.012);
  palm(k * 0.17, horizon - k * 0.026, k * 0.055, -k * 0.01);
  palm(k * 0.93, horizon - k * 0.02, k * 0.05, -k * 0.01);
  /* The lighthouse: a striped tower, its lamp lit by the ambient pass. */
  const lx = k * 0.27;
  const lb = horizon - k * 0.03;
  const lh = k * 0.06;
  g.fillStyle = p.lighthouse.body;
  g.beginPath();
  g.moveTo(lx - 3.2 * unit, lb);
  g.lineTo(lx - 2.2 * unit, lb - lh);
  g.lineTo(lx + 2.2 * unit, lb - lh);
  g.lineTo(lx + 3.2 * unit, lb);
  g.closePath();
  g.fill();
  g.fillStyle = p.lighthouse.band;
  for (let i = 0; i < 2; i += 1) g.fillRect(lx - 3 * unit, lb - lh * (0.3 + i * 0.35), 6 * unit, lh * 0.12);
  g.fillRect(lx - 3 * unit, lb - lh - 4 * unit, 6 * unit, 1.2 * unit);
  g.fillStyle = p.lighthouse.lamp;
  g.fillRect(lx - 1.6 * unit, lb - lh - 3 * unit, 3.2 * unit, 3 * unit);

  /* The shallows under Pico: the sea lightens toward its bed in the strip. */
  const shoal = g.createLinearGradient(0, aspect * k, 0, h);
  shoal.addColorStop(0, rgba(p.sea.line, 0));
  shoal.addColorStop(1, rgba(p.sea.line, 0.18));
  g.fillStyle = shoal;
  g.fillRect(0, aspect * k, w, h - aspect * k);
  return s;
}

/** A sand block: dry (with a beach find) or wet and packed (two hits), cracked or whole. */
function blockSheet(
  i: number,
  bw: number,
  bh: number,
  unit: number,
  p: BallPalette,
  ratio: number,
  wet: boolean,
  cracked: boolean,
  row: number,
): Sheet {
  /* A pixel of margin all round for the contact shadow. */
  const s = sheet(bw + 2, bh + 3, Math.max(ratio, 2));
  const g = s.g;
  const r = seeded(1000 + i * 31 + (cracked ? 7 : 0));
  g.translate(1, 1);
  const rad = bh * 0.22;
  const top = wet ? p.wetHi : p.sandHi;
  const mid = wet ? p.wet : p.sand[clamp(row, 0, 4)];
  const low = wet ? p.wetLo : p.sandLo;

  /* Contact shadow, then the block. */
  g.fillStyle = rgba(low, 0.55);
  g.beginPath();
  g.roundRect(0, 1.2, bw, bh, rad);
  g.fill();
  const body = g.createLinearGradient(0, 0, 0, bh);
  body.addColorStop(0, top);
  body.addColorStop(0.28, mid);
  body.addColorStop(1, lerpHex(mid, low, 0.55));
  g.fillStyle = body;
  g.beginPath();
  g.roundRect(0, 0, bw, bh, rad);
  g.fill();
  g.save();
  g.beginPath();
  g.roundRect(0, 0, bw, bh, rad);
  g.clip();
  /* The lit top lip and the shaded foot. */
  g.fillStyle = rgba(top, 0.9);
  g.fillRect(rad * 0.6, 0.6, bw - rad * 1.2, Math.max(1, bh * 0.1));
  g.fillStyle = rgba(low, 0.7);
  g.fillRect(0, bh - Math.max(1, bh * 0.1), bw, Math.max(1, bh * 0.1));

  if (wet) {
    /* Wet, packed castle wall: darker and glistening, with an arched window
       poked through it and a finger-hole either side — a sandcastle's block,
       and plainly the heavier one. */
    g.fillStyle = rgba(p.wetHi, 0.45);
    g.fillRect(rad, bh * 0.12, bw - rad * 2, Math.max(1, bh * 0.08));
    for (let k = 0; k < 10; k += 1) {
      g.fillStyle = r() < 0.55 ? rgba(p.wetLo, 0.6) : rgba(p.grainLight, 0.35);
      g.fillRect(r() * bw, bh * 0.2 + r() * bh * 0.7, Math.max(0.7, 0.8 * unit), Math.max(0.7, 0.8 * unit));
    }
    const ww = Math.max(4 * unit, bw * 0.16);
    const wh = bh * 0.52;
    const wx = bw * 0.5 - ww / 2;
    const wy = bh * 0.3;
    g.fillStyle = rgba(p.wetHi, 0.7);
    g.beginPath();
    g.roundRect(wx - 0.8, wy + 0.8, ww + 1.6, wh, [ww / 2, ww / 2, 1, 1]);
    g.fill();
    g.fillStyle = p.castleDark;
    g.beginPath();
    g.roundRect(wx, wy, ww, wh, [ww / 2, ww / 2, 1, 1]);
    g.fill();
    for (const hx of [0.2, 0.8]) {
      g.fillStyle = p.castleDark;
      g.beginPath();
      g.arc(bw * hx, bh * 0.52, Math.max(1, bh * 0.09), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rgba(p.wetHi, 0.6);
      g.beginPath();
      g.arc(bw * hx, bh * 0.52 + Math.max(0.8, bh * 0.07), Math.max(0.6, bh * 0.05), 0, Math.PI);
      g.fill();
    }
    /* Glints of water. */
    for (let k = 0; k < 4; k += 1) {
      g.fillStyle = rgba(p.ballWhite, 0.75);
      g.beginPath();
      g.arc(bw * (0.08 + r() * 0.84), bh * (0.2 + r() * 0.6), Math.max(0.5, 0.55 * unit), 0, Math.PI * 2);
      g.fill();
    }
  } else {
    /* Grains, a stratum, and now and then a find pressed into the face. */
    for (let k = 0; k < 18; k += 1) {
      g.fillStyle = r() < 0.5 ? rgba(p.grain, 0.55) : rgba(p.grainLight, 0.7);
      g.fillRect(r() * bw, bh * 0.15 + r() * bh * 0.8, Math.max(0.7, 0.8 * unit), Math.max(0.7, 0.8 * unit));
    }
    g.strokeStyle = rgba(p.sandLo, 0.35);
    g.lineWidth = Math.max(0.7, 0.7 * unit);
    g.beginPath();
    g.moveTo(0, bh * 0.6);
    g.quadraticCurveTo(bw * 0.5, bh * (0.52 + r() * 0.12), bw, bh * 0.62);
    g.stroke();
    const d = deco(i);
    if (d <= GLASS) {
      g.save();
      g.translate(bw * (0.3 + r() * 0.4), bh * 0.55);
      g.rotate((r() - 0.5) * 0.8);
      drawFind(g, d, bh * 0.32, p);
      g.restore();
    }
  }

  if (cracked) {
    /* The first hit: a crack across the face and a corner knocked off. */
    g.strokeStyle = p.crack;
    g.lineWidth = Math.max(1, 1.1 * unit);
    const x0 = bw * (0.25 + r() * 0.2);
    g.beginPath();
    g.moveTo(x0, 0);
    g.lineTo(x0 + bw * 0.08, bh * 0.4);
    g.lineTo(x0 + bw * 0.02, bh * 0.62);
    g.lineTo(x0 + bw * 0.12, bh);
    g.moveTo(x0 + bw * 0.08, bh * 0.4);
    g.lineTo(x0 + bw * 0.3, bh * 0.32);
    g.lineTo(x0 + bw * 0.44, bh * 0.58);
    g.stroke();
    g.strokeStyle = rgba(p.wetHi, 0.6);
    g.lineWidth = Math.max(0.6, 0.6 * unit);
    g.beginPath();
    g.moveTo(x0 + 1, 0);
    g.lineTo(x0 + bw * 0.08 + 1, bh * 0.4);
    g.stroke();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    const right = r() < 0.5;
    const cx = right ? bw : 0;
    g.moveTo(cx, -1);
    g.lineTo(cx + (right ? -bw * 0.16 : bw * 0.16), -1);
    g.lineTo(cx + (right ? -bw * 0.07 : bw * 0.07), bh * 0.42);
    g.lineTo(cx, bh * 0.5);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
  return s;
}

function lerpHex(a: string, b: string, t: number): string {
  const ca = parseInt(a.slice(1, 7), 16);
  const cb = parseInt(b.slice(1, 7), 16);
  const ch = (shift: number) => Math.round(lerp((ca >> shift) & 255, (cb >> shift) & 255, t));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** A scallop shell centred on the origin, `size` tall: fan, ribs, hinge. */
function scallop(g: CanvasRenderingContext2D, size: number, fill: string, line: string, unit: number): void {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(0, size * 0.55);
  g.arc(0, size * 0.05, size * 0.62, Math.PI * 1.08, Math.PI * 1.92);
  g.closePath();
  g.fill();
  g.fillRect(-size * 0.22, size * 0.45, size * 0.44, size * 0.2);
  g.strokeStyle = line;
  g.lineWidth = Math.max(0.6, 0.6 * unit);
  for (let k = -2; k <= 2; k += 1) {
    g.beginPath();
    g.moveTo(0, size * 0.5);
    g.lineTo(Math.sin(k * 0.38) * size * 0.55, size * 0.05 - Math.cos(k * 0.38) * size * 0.5);
    g.stroke();
  }
}

/** A beach find, centred on the origin, `size` across. */
function drawFind(g: CanvasRenderingContext2D, kind: number, size: number, p: BallPalette): void {
  const unit = size / 6;
  if (kind === SHELL) {
    scallop(g, size, p.shell, p.shellLine, unit * 0.6);
  } else if (kind === STARFISH) {
    g.fillStyle = p.starfish;
    starPath(g, size * 0.6, 0.45);
    g.fill();
    g.fillStyle = rgba(p.sandHi, 0.7);
    g.beginPath();
    g.arc(0, 0, size * 0.1, 0, Math.PI * 2);
    g.fill();
  } else if (kind === PEBBLE) {
    g.fillStyle = p.pebble;
    g.beginPath();
    g.ellipse(0, 0, size * 0.42, size * 0.3, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rgba(p.sandHi, 0.5);
    g.beginPath();
    g.ellipse(-size * 0.12, -size * 0.1, size * 0.14, size * 0.08, 0.3, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = p.glass;
    g.beginPath();
    g.moveTo(-size * 0.35, -size * 0.1);
    g.lineTo(-size * 0.05, -size * 0.32);
    g.lineTo(size * 0.38, -size * 0.05);
    g.lineTo(size * 0.12, size * 0.3);
    g.lineTo(-size * 0.28, size * 0.22);
    g.closePath();
    g.fill();
    g.fillStyle = rgba(p.ballWhite, 0.6);
    g.fillRect(-size * 0.12, -size * 0.18, size * 0.2, size * 0.07);
  }
}

/** The surfboard, from the side: a white deck, Pico's teal stripe, an amber pinline, the fin. */
function boardSheet(pw: number, ph: number, unit: number, p: BallPalette, ratio: number): Sheet {
  const pad = pw * 0.04;
  const W = pw + pad * 2;
  const H = ph * 2.4;
  const s = sheet(W, H, Math.max(ratio, 2));
  const g = s.g;
  /* The deck's top sits at 0.42 of the sheet — where the component puts the bar's top. */
  g.translate(pad, H * 0.42 - ph);
  const outline = (dy: number) => {
    g.beginPath();
    g.moveTo(ph * 0.4, dy + ph * 0.1);
    g.quadraticCurveTo(pw * 0.5, dy - ph * 0.05, pw * 0.86, dy + ph * 0.02);
    /* The nose, rockered up. */
    g.quadraticCurveTo(pw * 0.99, dy - ph * 0.18, pw, dy + ph * 0.18);
    g.quadraticCurveTo(pw * 0.96, dy + ph * 0.92, pw * 0.8, dy + ph);
    g.quadraticCurveTo(pw * 0.45, dy + ph * 1.08, ph * 0.5, dy + ph * 0.95);
    g.quadraticCurveTo(-ph * 0.05, dy + ph * 0.6, ph * 0.4, dy + ph * 0.1);
    g.closePath();
  };
  /* The fin under the tail. */
  g.fillStyle = p.board.fin;
  g.beginPath();
  g.moveTo(pw * 0.12, ph * 0.95);
  g.quadraticCurveTo(pw * 0.14, ph * 1.9, pw * 0.08, ph * 2.05);
  g.quadraticCurveTo(pw * 0.17, ph * 1.6, pw * 0.22, ph);
  g.closePath();
  g.fill();
  g.fillStyle = p.board.rail;
  outline(ph * 0.22);
  g.fill();
  g.fillStyle = p.board.deck;
  outline(0);
  g.fill();
  /* A hairline of the rail round the deck: a white board on a bright sea still has an edge. */
  g.strokeStyle = rgba(p.board.rail, 0.8);
  g.lineWidth = Math.max(0.7, 0.7 * unit);
  g.stroke();
  g.save();
  outline(0);
  g.clip();
  g.fillStyle = p.board.stripe;
  g.fillRect(0, ph * 0.42, pw, ph * 0.3);
  g.fillStyle = p.board.stripe2;
  g.fillRect(0, ph * 0.76, pw, Math.max(1, ph * 0.1));
  g.fillStyle = rgba(p.board.gloss, 0.85);
  g.beginPath();
  g.roundRect(pw * 0.18, ph * 0.08, pw * 0.5, Math.max(1, ph * 0.14), ph * 0.07);
  g.fill();
  g.restore();
  return s;
}

/** The ball's fixed light: a gloss top-left, a shade crescent bottom-right, a rim. */
function glossSheet(rb: number, p: BallPalette, ratio: number): Sheet {
  const S = rb * 2 + 2;
  const s = sheet(S, S, Math.max(ratio, 2));
  const g = s.g;
  const c = S / 2;
  const shade = g.createRadialGradient(c - rb * 0.35, c - rb * 0.35, rb * 0.2, c, c, rb);
  shade.addColorStop(0, rgba(p.ballShade, 0));
  shade.addColorStop(0.7, rgba(p.ballShade, 0.08));
  shade.addColorStop(1, rgba(p.ballShade, 0.42));
  g.fillStyle = shade;
  g.beginPath();
  g.arc(c, c, rb, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = rgba(p.ballWhite, 0.95);
  g.beginPath();
  g.arc(c, c, rb * 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = rgba('#ffffff', 0.75);
  g.beginPath();
  g.ellipse(c - rb * 0.38, c - rb * 0.42, rb * 0.28, rb * 0.17, -0.7, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = rgba(p.ballRim, 0.45);
  g.lineWidth = Math.max(0.8, rb * 0.12);
  g.beginPath();
  g.arc(c, c, rb - g.lineWidth / 2, 0, Math.PI * 2);
  g.stroke();
  return s;
}

/** A spray of palm fronds for a top corner. */
function frondSheet(unit: number, p: BallPalette, ratio: number): Sheet {
  const W = 120 * unit;
  const s = sheet(W, W, ratio);
  const g = s.g;
  const r = seeded(55);
  const ox = W * 0.18;
  const oy = W * 0.2;
  for (let i = 0; i < 6; i += 1) {
    const a = -0.2 + i * 0.36 + (r() - 0.5) * 0.15;
    const len = W * (0.55 + r() * 0.3);
    g.save();
    g.translate(ox, oy);
    g.rotate(a);
    /* A frond: a curved rib with leaflets down both sides. */
    g.strokeStyle = p.palmFrond.dark;
    g.lineWidth = 2 * unit;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.5, -len * 0.08, len, len * 0.12);
    g.stroke();
    for (let t = 0.12; t < 0.98; t += 0.07) {
      const x = len * t;
      const y = -len * 0.08 * 4 * t * (1 - t) + len * 0.12 * t * t;
      const leaf = len * 0.22 * (1 - t * 0.6);
      for (const side of [-1, 1]) {
        g.fillStyle = side < 0 ? p.palmFrond.light : p.palmFrond.dark;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + leaf * 0.4, y + side * leaf * 0.3, x + leaf * 0.55, y + side * leaf);
        g.quadraticCurveTo(x + leaf * 0.1, y + side * leaf * 0.5, x, y);
        g.fill();
      }
    }
    g.restore();
  }
  return s;
}

function cloudSheet(unit: number, p: BallPalette, ratio: number, v: number): Sheet {
  const W = (90 + v * 24) * unit;
  const H = W * 0.36;
  const s = sheet(W, H, Math.min(ratio, 1.5));
  const g = s.g;
  const r = seeded(600 + v);
  const lobes: [number, number, number][] = [];
  const n = 4 + v;
  for (let i = 0; i < n; i += 1) {
    const u = (i + 0.5) / n;
    const rad = H * (0.24 + Math.sin(u * Math.PI) * 0.22 + r() * 0.05);
    lobes.push([W * (0.1 + u * 0.8), H * 0.66 - rad * 0.45, rad]);
  }
  const shape = (dy: number) => {
    g.beginPath();
    for (const [x, y, rad] of lobes) {
      g.moveTo(x + rad, y + dy);
      g.arc(x, y + dy, rad, 0, Math.PI * 2);
    }
    g.roundRect(W * 0.08, H * 0.55 + dy, W * 0.84, H * 0.3, H * 0.15);
  };
  g.fillStyle = p.cloud.shade;
  shape(H * 0.06);
  g.fill();
  g.fillStyle = p.cloud.body;
  shape(0);
  g.fill();
  return s;
}
