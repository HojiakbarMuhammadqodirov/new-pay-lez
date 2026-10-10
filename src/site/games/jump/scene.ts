import { DOODLE, DOODLE_JUMP_SPEED, type DoodleEnd, type DoodleState } from '../arcade';
import { PICO_BRAND, drawPico, picoBlinkAt, picoSizeForBodyRadius, type DrawPicoOptions, type PicoPose } from '../../pico';
import type { ThemeName } from '../../theme/context';
import {
  clamp,
  glowSheet,
  leafPath,
  lerp,
  mix,
  rgba,
  seeded,
  sheet,
  smoothstep,
  sparklePath,
  stamp,
  starPath,
  type Sheet,
} from '../sceneKit';
import { JUMP_PALETTE, JUMP_SCENE, JUMP_ZONES, type JumpPalette } from './config';

/**
 * Pico Jump's painter: the climb, drawn.  It reads the game and never writes
 * it.
 *
 * `DoodleJump.tsx` owns the round exactly as before — `doodleAdvance` steps the
 * jumper in its fixed 1/120 s steps and the component calls `paint()` once a
 * frame. Everything this file does happens inside that paint: it looks at the
 * `DoodleState` it is handed, notices what changed since the last frame (a
 * bounce shows as `vy` jumping back up to take-off speed, a new platform as
 * `reached` rising) and answers with pictures — a squash, a dip in the branch,
 * leaves shaken loose, a cheer at every tenth platform, confetti at the top.
 * Nothing it computes flows back: the hit geometry is `DOODLE`'s, drawn.
 *
 * Per frame it allocates nothing in its loops. Everything that does not move
 * against itself — the sky ribbon, the stars, ridges, canopy, trunks, the
 * ground, every platform skin, the milestone signs — is a pre-rendered sheet
 * built once per size, density and theme, and stamped. Particles live in
 * typed arrays; Pico's draw options are one reused object.
 */

export type JumpPhase = 'ready' | 'playing' | 'over';

/** What the component tells the painter each frame besides the jumper. */
export interface JumpView {
  phase: JumpPhase;
  end: DoodleEnd | null;
  /** −1…1, the steer the loop is applying — Pico leans into it. */
  steer: number;
  reduced: boolean;
}

interface Skin {
  s: Sheet;
  /** Where the platform's top-left corner sits inside the sheet, in CSS px. */
  ox: number;
  oy: number;
}

interface Built {
  key: string;
  w: number;
  h: number;
  p: JumpPalette;
  accent: string;
  night: boolean;
  sky: Sheet;
  haze: Sheet;
  stars: Sheet;
  twinkle: Sheet;
  aurora: Sheet | null;
  orb: Sheet;
  mountains: Sheet;
  canopy: Sheet;
  trunkL: Sheet;
  trunkR: Sheet;
  ground: Sheet;
  /** Where the floor line sits inside the ground sheet. */
  groundTop: number;
  clouds: Sheet[];
  bank: Sheet;
  beams: Sheet;
  cirrus: Sheet | null;
  rays: Sheet;
  drifter: Sheet;
  branch: Skin[];
  cloud: Skin[];
  rock: Skin[];
  summit: Skin;
  signs: Sheet[];
  mote: Sheet;
  beacon: Sheet;
  crystalGlow: Sheet;
}

/* Particle kinds. */
const LEAF = 0;
const PUFF = 1;
const SPARK = 2;
const CONFETTI = 3;
const FEATHER = 4;
const PEBBLE = 5;

/**
 * The summit's pole, as a share of the platform from its left end: out at
 * the edge, so Pico — who lands wherever he lands — stands beside the flag
 * rather than in front of it, and the pennant flies out over the drop.
 */
const SUMMIT_POLE = 0.86;

/** Background clouds and motes are fixed at construction, so they are a place. */
const CLOUD_SEED = 41;
const MOTE_SEED = 77;

export class JumpScene {
  private built: Built | null = null;
  private centres: readonly number[] = [];
  private heights: readonly number[] = [];

  /* ── clocks ── */
  private last = -1;
  /** Ambient time: frozen under reduced motion. */
  private t = 0;
  /** Effects time: always runs, so a cheer still ends. */
  private ft = 0;

  /* ── what the painter has seen of the round ── */
  private prevVy = DOODLE_JUMP_SPEED;
  private prevX = 0.5;
  private vx = 0;
  private reachedSeen = 0;
  private sinceLanding = 9;
  private landedOn = -2;
  private cheer = 0;
  private wing = 0;
  private facing: 1 | -1 = 1;
  private ring = 0;
  private ringX = 0;
  private ringY = 0;
  /** The ready view sits lower so Pico stands above the veil; it eases away at Start. */
  private drop: number = JUMP_SCENE.readyDrop;
  private endSeen: DoodleEnd | null = null;
  private endAt = 0;
  private endY = 0;

  /* ── particles ── */
  private readonly n = JUMP_SCENE.particles;
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
  private readonly rand = seeded(1234);

  /* ── scenery positions, fixed ── */
  private readonly cloudX: Float32Array;
  private readonly cloudA: Float32Array;
  private readonly cloudS: Float32Array;
  private readonly cloudV: Float32Array;
  private readonly cloudK: Uint8Array;
  private readonly moteX: Float32Array;
  private readonly moteY: Float32Array;
  private readonly moteP: Float32Array;
  private readonly driftA = new Float32Array(JUMP_SCENE.drifters.count);
  private readonly driftX = new Float32Array(JUMP_SCENE.drifters.count);
  private readonly driftS = new Float32Array(JUMP_SCENE.drifters.count);
  private readonly driftP = new Float32Array(JUMP_SCENE.drifters.count);

  private readonly pico: DrawPicoOptions = { x: 0, y: 0, size: 0, anchor: 'body', pose: 'idle' };

  /** Altitude (field heights) to canvas y for the frame being painted. One function for the scene's life. */
  private viewH = 1;
  private viewCam = 0;
  private readonly toY = (alt: number): number => this.viewH * (1 - JUMP_SCENE.lift) - (alt - this.viewCam) * this.viewH;

  constructor() {
    const { far, near, from, to } = JUMP_SCENE.clouds;
    const total = far + near;
    this.cloudX = new Float32Array(total);
    this.cloudA = new Float32Array(total);
    this.cloudS = new Float32Array(total);
    this.cloudV = new Float32Array(total);
    this.cloudK = new Uint8Array(total);
    const r = seeded(CLOUD_SEED);
    for (let i = 0; i < total; i += 1) {
      const isFar = i < far;
      const f = isFar ? JUMP_SCENE.parallax.farClouds : JUMP_SCENE.parallax.nearClouds;
      const share = isFar ? i / far : (i - far) / near;
      /* Spread up the band evenly, jittered, so the sky never has a hole. */
      const height = from + (to - from) * (share + (r() - 0.5) / (isFar ? far : near));
      this.cloudA[i] = height * f;
      this.cloudX[i] = r() * 1.3 - 0.15;
      this.cloudS[i] = isFar ? 0.55 + r() * 0.35 : 0.8 + r() * 0.45;
      this.cloudV[i] = (r() < 0.5 ? -1 : 1) * (0.004 + r() * 0.008) * (isFar ? 0.6 : 1);
      this.cloudK[i] = Math.floor(r() * 3);
    }
    const d = JUMP_SCENE.drifters;
    for (let i = 0; i < d.count; i += 1) {
      this.driftA[i] = (d.from + ((i + 0.5) / d.count) * (d.to - d.from)) * d.parallax;
      this.driftX[i] = 0.12 + r() * 0.76;
      this.driftS[i] = 0.7 + r() * 0.5;
      this.driftP[i] = r() * Math.PI * 2;
    }
    const m = JUMP_SCENE.motes.count;
    this.moteX = new Float32Array(m);
    this.moteY = new Float32Array(m);
    this.moteP = new Float32Array(m);
    const q = seeded(MOTE_SEED);
    for (let i = 0; i < m; i += 1) {
      this.moteX[i] = 0.04 + q() * 0.92;
      this.moteY[i] = 0.08 + q() * JUMP_SCENE.motes.top;
      this.moteP[i] = q() * Math.PI * 2;
    }
  }

  /** The level — the same arrays the loop steps against. */
  setLevel(centres: readonly number[], heights: readonly number[]): void {
    this.centres = centres;
    this.heights = heights;
  }

  /**
   * (Re)build every sheet for a `w × h` field at `ratio` in `theme`, if any of
   * those changed. `accent` is `THEMES[theme].primary`: the crystals and the
   * summit's pennant are the page's own accent.
   */
  configure(w: number, h: number, ratio: number, theme: ThemeName, accent: string): void {
    const key = `${w}x${h}@${ratio}:${theme}:${accent}`;
    if (this.built?.key === key || w < 2 || h < 2) return;
    this.built = build(key, w, h, ratio, JUMP_PALETTE[theme], accent, theme === 'dark');
  }

  /** One frame. `ctx` is already scaled to CSS pixels. */
  paint(ctx: CanvasRenderingContext2D, j: DoodleState, view: JumpView, now: number): void {
    const b = this.built;
    if (!b) return;
    const dt = this.last < 0 ? 0 : clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    if (!view.reduced) this.t += dt;
    this.ft += dt;
    this.observe(j, view, dt);

    /* The view's floor in field heights: the camera, minus the ready drop. */
    const cam = j.camera - this.drop;
    this.viewH = b.h;
    this.viewCam = cam;
    const toY = this.toY;

    this.backdrop(ctx, b, cam, toY);
    this.platforms(ctx, b, j, toY);
    this.shadow(ctx, b, j, view, toY);
    this.drawRing(ctx, b, toY);
    this.drawPico(ctx, b, j, view, toY);
    this.drawParticles(ctx, b, toY);
  }

  /* ═══════════════════════════════════════════════════════════ events ══ */

  private observe(j: DoodleState, view: JumpView, dt: number): void {
    const playing = view.phase !== 'ready';
    /* A bounce: `vy` only ever falls under gravity, except when a landing
       resets it to take-off speed. */
    if (playing && j.vy > this.prevVy + 0.4) this.land(j, view);
    this.prevVy = j.vy;

    if (j.reached > this.reachedSeen) {
      const fresh = j.reached;
      this.reachedSeen = fresh;
      if (fresh % 10 === 0 && fresh < this.heights.length) {
        this.cheer = JUMP_SCENE.cheer;
        if (!view.reduced) {
          this.ring = 0.7;
          this.ringX = j.x;
          this.ringY = j.y;
          this.burst(FEATHER, j.x, j.y + 0.04, 6, 0.35, 0.5);
        }
      }
    }

    if (view.end && !this.endSeen) {
      this.endSeen = view.end;
      this.endAt = this.ft;
      this.endY = j.y;
      if (view.end === 'summit') {
        this.cheer = 99;
        if (!view.reduced) {
          this.burst(CONFETTI, j.x, j.y + 0.08, 56, 0.9, 1.6);
          this.burst(SPARK, j.x, j.y + 0.05, 14, 0.5, 0.9);
        }
      }
    }

    /* Ease the ready drop away once the round starts. */
    if (playing) this.drop = view.reduced ? 0 : Math.max(0, this.drop - dt * JUMP_SCENE.readyDrop * 2.6);

    /* Sideways speed, for the lean — unwrapped across the seam. */
    let dx = j.x - this.prevX;
    if (dx > 0.5) dx -= 1;
    if (dx < -0.5) dx += 1;
    this.prevX = j.x;
    if (dt > 0) this.vx = lerp(this.vx, dx / dt, Math.min(1, dt * 14));
    if (view.steer > 0.05 || this.vx > 0.15) this.facing = 1;
    else if (view.steer < -0.05 || this.vx < -0.15) this.facing = -1;

    this.sinceLanding += dt;
    this.cheer = Math.max(0, this.cheer - dt);
    this.ring = Math.max(0, this.ring - dt);
    if (!view.reduced) {
      const rising = j.vy > 0;
      const { rising: up, gliding } = JUMP_SCENE.beats;
      this.wing += dt * (rising ? gliding + (up - gliding) * clamp(j.vy / DOODLE_JUMP_SPEED, 0, 1) : gliding);
    }
    this.stepParticles(dt);
  }

  private land(j: DoodleState, view: JumpView): void {
    this.sinceLanding = 0;
    const n = this.platformUnder(j);
    this.landedOn = n;
    if (view.reduced) return;
    const y = n >= 0 ? this.heights[n] : 0;
    if (n < 0) this.burst(PEBBLE, j.x, y, 5, 0.18, 0.4);
    else if (n === this.heights.length - 1) this.burst(SPARK, j.x, y, 8, 0.3, 0.6);
    else if (n < JUMP_ZONES.cloud) this.burst(LEAF, this.centres[n], y - 0.02, 4, 0.12, 0.25);
    else if (n < JUMP_ZONES.rock) this.burst(PUFF, j.x, y, 7, 0.22, 0.12);
    else this.burst(SPARK, j.x, y, 5, 0.22, 0.35);
  }

  /** The platform a bounce just happened on (−1: the floor), by the physics' own reach rule. */
  private platformUnder(j: DoodleState): number {
    const reach = (DOODLE.platformW + DOODLE.jumperW) / 2;
    for (let n = 0; n < this.heights.length; n += 1) {
      const top = this.heights[n];
      if (top > j.y + 1e-6) break;
      if (j.y - top < 0.08 && Math.abs(j.x - this.centres[n]) <= reach + 0.005) return n;
    }
    return -1;
  }

  /* ═══════════════════════════════════════════════════════ particles ══ */

  /** `count` particles of `kind` from `(x, y)` (field width, altitude), flung `speed`, lifting `up`. */
  private burst(kind: number, x: number, y: number, count: number, speed: number, up: number): void {
    const r = this.rand;
    for (let i = 0; i < count; i += 1) {
      const k = this.next;
      this.next = (this.next + 1) % this.n;
      const a = r() * Math.PI * 2;
      const s = speed * (0.35 + r() * 0.65);
      this.px[k] = x + (r() - 0.5) * 0.06;
      this.py[k] = y;
      this.pvx[k] = Math.cos(a) * s;
      this.pvy[k] = Math.abs(Math.sin(a)) * s * 0.6 + up * (0.4 + r() * 0.6);
      this.pr[k] = r() * Math.PI * 2;
      this.pvr[k] = (r() - 0.5) * 9;
      const life = kind === CONFETTI ? 1.6 + r() * 1.2 : kind === LEAF || kind === FEATHER ? 1.1 + r() * 0.7 : 0.45 + r() * 0.35;
      this.pl[k] = life;
      this.pm[k] = life;
      this.ps[k] = 0.6 + r() * 0.6;
      this.pk[k] = kind;
      this.pc[k] = Math.floor(r() * 6);
    }
  }

  private stepParticles(dt: number): void {
    for (let i = 0; i < this.n; i += 1) {
      if (this.pl[i] <= 0) continue;
      this.pl[i] -= dt;
      const kind = this.pk[i];
      /* Leaves, feathers and confetti flutter: little gravity, a sway, drag. */
      const flutter = kind === LEAF || kind === FEATHER || kind === CONFETTI;
      const g = kind === PUFF || kind === SPARK ? 0 : flutter ? 0.55 : 1.6;
      this.pvy[i] -= g * dt;
      if (flutter) {
        this.pvx[i] += Math.sin(this.ft * 5 + i) * 0.25 * dt;
        this.pvx[i] *= 1 - dt * 1.4;
        this.pvy[i] = Math.max(this.pvy[i], -0.22);
      } else if (kind === PUFF) {
        this.pvx[i] *= 1 - dt * 3.2;
        this.pvy[i] *= 1 - dt * 3.2;
      }
      this.px[i] += this.pvx[i] * dt * 0.75;
      this.py[i] += this.pvy[i] * dt;
      this.pr[i] += this.pvr[i] * dt;
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, b: Built, toY: (alt: number) => number): void {
    const { w, p } = b;
    const unit = w / 360;
    for (let i = 0; i < this.n; i += 1) {
      const life = this.pl[i];
      if (life <= 0) continue;
      const age = 1 - life / this.pm[i];
      const kind = this.pk[i];
      const x = this.px[i] * w;
      const y = toY(this.py[i]);
      const s = this.ps[i] * unit;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.pr[i]);
      if (kind === LEAF) {
        ctx.globalAlpha = clamp(life * 1.6, 0, 1);
        ctx.fillStyle = this.pc[i] % 2 ? p.leaf.mid : p.leaf.light;
        leafPath(ctx, 9 * s, 3.2 * s);
        ctx.fill();
      } else if (kind === FEATHER) {
        ctx.globalAlpha = clamp(life * 1.4, 0, 1);
        ctx.fillStyle = this.pc[i] % 3 === 0 ? PICO_BRAND.wing : this.pc[i] % 3 === 1 ? PICO_BRAND.body : PICO_BRAND.light;
        leafPath(ctx, 11 * s, 3 * s);
        ctx.fill();
      } else if (kind === PUFF) {
        ctx.globalAlpha = (1 - age) * 0.8;
        ctx.fillStyle = p.cloud.rim;
        ctx.beginPath();
        ctx.arc(0, 0, (3 + age * 7) * s, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === SPARK) {
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = this.pc[i] % 2 ? b.accent : p.confetti[0];
        sparklePath(ctx, (4 + (1 - age) * 3) * s);
        ctx.fill();
      } else if (kind === CONFETTI) {
        ctx.globalAlpha = clamp(life * 1.2, 0, 1);
        ctx.fillStyle = p.confetti[this.pc[i] % p.confetti.length];
        /* A spinning strip reads as paper: its width breathes with the spin. */
        ctx.fillRect(-3.5 * s, -2 * s * Math.abs(Math.cos(this.pr[i] * 1.7)) - 0.4, 7 * s, 4 * s * Math.abs(Math.cos(this.pr[i] * 1.7)) + 0.8);
      } else {
        ctx.globalAlpha = 1 - age;
        ctx.fillStyle = this.pc[i] % 2 ? p.ground.rock : p.ground.grassLight;
        ctx.beginPath();
        ctx.arc(0, 0, 1.8 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* ═════════════════════════════════════════════════════════ backdrop ══ */

  private backdrop(ctx: CanvasRenderingContext2D, b: Built, cam: number, toY: (alt: number) => number): void {
    const { w, h, p } = b;
    const P = JUMP_SCENE.parallax;
    const lift = JUMP_SCENE.lift * h;
    const floor = h - lift;
    const { from, to } = JUMP_SCENE.sky;

    /* The sky: a slice of the ribbon, one field height of altitude tall. */
    const rib = b.sky.c.height;
    const perAlt = rib / (to - from);
    const top = cam + 1 - JUMP_SCENE.lift;
    ctx.drawImage(b.sky.c, 0, (to - top) * perAlt, 1, perAlt, 0, 0, w, h);

    /* Stars come out once the canopy is below (by night) or near the top (by
       day); the aurora only in the high sky. */
    const night = smoothstep(p.starsIn[0], p.starsIn[1], cam) * p.starMax;
    if (night > 0.01) {
      const off = (((cam * h * P.stars) % h) + h) % h;
      ctx.globalAlpha = night;
      ctx.drawImage(b.stars.c, 0, off - h, w, h);
      ctx.drawImage(b.stars.c, 0, off, w, h);
      if (p.twinkleMax > 0) {
        ctx.globalAlpha = night * p.twinkleMax * (0.55 + 0.45 * Math.sin(this.t * 1.9));
        ctx.drawImage(b.twinkle.c, 0, off - h, w, h);
        ctx.drawImage(b.twinkle.c, 0, off, w, h);
      }
      ctx.globalAlpha = 1;
    }
    const high = smoothstep(4.8, 7.4, cam);
    if (b.aurora && high > 0.01) {
      const sway = Math.sin(this.t * 0.35) * w * 0.03;
      ctx.globalAlpha = high * (0.75 + 0.25 * Math.sin(this.t * 0.8));
      ctx.drawImage(b.aurora.c, sway - w * 0.05, h * 0.02 + (cam - JUMP_SCENE.orbAt) * h * P.orb, b.aurora.w, b.aurora.h);
      ctx.globalAlpha = 1;
    }
    if (b.cirrus && high > 0.01) {
      ctx.globalAlpha = high * p.cirrus;
      const cy = h * 0.05 + (cam - JUMP_SCENE.orbAt) * h * P.orb * 2;
      ctx.drawImage(b.cirrus.c, Math.sin(this.t * 0.05) * w * 0.05 - w * 0.05, cy, b.cirrus.w, b.cirrus.h);
      ctx.globalAlpha = 1;
    }

    /* The moon (or the sun) rises into the upper sky near the summit. */
    const orbY = h * 0.26 - (JUMP_SCENE.orbAt - cam) * P.orb * h * 3;
    if (orbY > -b.orb.h) stamp(ctx, b.orb, w * 0.27 - b.orb.w / 2, orbY - b.orb.h / 2);

    /* Far ridges, sinking away below as the climb gets going. */
    const mTop = floor + h * 0.06 + cam * h * P.mountains - b.mountains.h;
    if (mTop < h) stamp(ctx, b.mountains, 0, mTop);

    /* Background clouds, drifting — none under the canopy, where the sky is
       leaves. */
    const span = w * 1.6;
    const cloudsIn = smoothstep(1.7, 2.7, cam);
    for (let i = 0; cloudsIn > 0.01 && i < this.cloudA.length; i += 1) {
      const isFar = i < JUMP_SCENE.clouds.far;
      const f = isFar ? P.farClouds : P.nearClouds;
      const s = b.clouds[this.cloudK[i]];
      const scale = this.cloudS[i];
      const cy = floor - (this.cloudA[i] - cam * f) * h;
      const ch = s.h * scale;
      if (cy - ch > h || cy + ch < 0) continue;
      const raw = this.cloudX[i] * w + this.t * this.cloudV[i] * w * 6;
      const cx = ((((raw + w * 0.3) % span) + span) % span) - w * 0.3;
      ctx.globalAlpha = (isFar ? p.cloudAlphaFar : p.cloudAlphaNear) * cloudsIn;
      ctx.drawImage(s.c, cx - (s.w * scale) / 2, cy - ch / 2, s.w * scale, ch);
    }
    ctx.globalAlpha = 1;

    /* Lanterns rising by night; balloons and a flock by day. */
    this.drifters(ctx, b, cam, floor);

    /* The jungle: canopy far back, trunks at the sides, the ground. */
    const cTop = floor + h * 0.05 + cam * h * P.canopy - b.canopy.h;
    if (cTop < h) stamp(ctx, b.canopy, 0, cTop);
    const tTop = floor + h * 0.04 + cam * h * P.trunks - b.trunkL.h;
    if (tTop < h && tTop + b.trunkL.h > 0) {
      stamp(ctx, b.trunkL, 0, tTop);
      stamp(ctx, b.trunkR, w - b.trunkR.w, tTop);
    }
    const haze = clamp(1 - cam / 2.6, 0, 1);
    if (haze > 0) {
      ctx.globalAlpha = haze;
      ctx.drawImage(b.haze.c, 0, 0, w, h);
      ctx.globalAlpha = haze * (0.75 + 0.25 * Math.sin(this.t * 0.6));
      ctx.drawImage(b.beams.c, Math.sin(this.t * 0.2) * w * 0.02, 0, w, h);
      ctx.globalAlpha = 1;
    }
    /* The cloud sea, between the jungle and the sky. */
    const bankY = floor - (JUMP_SCENE.bank.at - cam * JUMP_SCENE.bank.parallax) * h - b.bank.h * 0.16;
    if (bankY < h && bankY + b.bank.h > 0) {
      ctx.globalAlpha = p.bank.alpha;
      ctx.drawImage(b.bank.c, Math.sin(this.t * 0.15) * w * 0.03 - w * 0.03, bankY, w * 1.06, b.bank.h);
      ctx.globalAlpha = 1;
    }
    const gTop = toY(0) - b.groundTop;
    if (gTop < h) stamp(ctx, b.ground, 0, gTop);

    /* Fireflies by night, pollen by day — the air of the jungle band. */
    if (cam < JUMP_SCENE.motes.top + 0.3) {
      for (let i = 0; i < this.moteX.length; i += 1) {
        const ph = this.moteP[i];
        const mx = (this.moteX[i] + Math.sin(this.t * 0.5 + ph) * 0.035) * w;
        const my = toY(this.moteY[i] + Math.sin(this.t * 0.7 + ph * 1.3) * 0.025);
        if (my < -10 || my > h + 10) continue;
        const flicker = b.night ? 0.35 + 0.65 * Math.max(0, Math.sin(this.t * 1.6 + ph * 3)) : 0.7;
        ctx.globalAlpha = flicker;
        ctx.drawImage(b.mote.c, mx - b.mote.w / 2, my - b.mote.h / 2, b.mote.w, b.mote.h);
        ctx.fillStyle = p.mote;
        ctx.beginPath();
        ctx.arc(mx, my, (w / 360) * (b.night ? 1.4 : 1.1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Sky lanterns (night) or balloons and a flock (day), far behind the platforms. */
  private drifters(ctx: CanvasRenderingContext2D, b: Built, cam: number, floor: number): void {
    const { w, h } = b;
    const d = JUMP_SCENE.drifters;
    const unit = w / 360;
    for (let i = 0; i < d.count; i += 1) {
      const ph = this.driftP[i];
      /* Lanterns climb slowly as they drift; balloons only drift. */
      const rise = b.night ? (this.t * 0.012 + ph * 0.05) % 0.6 : 0;
      const y = floor - (this.driftA[i] + rise - cam * d.parallax) * h;
      const scale = this.driftS[i] * (b.night ? 1 : 0.7);
      const sh = b.drifter.h * scale;
      if (y < -sh || y > h + sh) continue;
      const x = (this.driftX[i] + Math.sin(this.t * 0.25 + ph) * 0.04) * w;
      ctx.globalAlpha = b.night ? 0.75 + 0.25 * Math.sin(this.t * 2.3 + ph * 4) : 0.85;
      ctx.drawImage(b.drifter.c, x - (b.drifter.w * scale) / 2, y - sh / 2, b.drifter.w * scale, sh);
    }
    ctx.globalAlpha = 1;
    if (b.night) return;
    /* Two small flocks, wings beating, crossing the sky. */
    ctx.strokeStyle = b.p.bird;
    ctx.lineWidth = Math.max(1, 1.3 * unit);
    for (let f = 0; f < 2; f += 1) {
      const alt = (d.from + 0.9 + f * 1.9) * d.parallax;
      const fy = floor - (alt - cam * d.parallax) * h;
      if (fy < -20 || fy > h + 20) continue;
      const span = w * 1.5;
      const fx = ((((this.t * (0.018 + f * 0.006) * w + f * w * 0.7) % span) + span) % span) - w * 0.25;
      for (let k = 0; k < 4; k += 1) {
        const bx = fx - k * 11 * unit;
        const by = fy + (k % 2) * 6 * unit + k * 2 * unit;
        const beat = Math.sin(this.t * 7 + k * 1.3 + f) * 2.6 * unit;
        const span2 = 4.5 * unit;
        ctx.beginPath();
        ctx.moveTo(bx - span2, by - beat);
        ctx.quadraticCurveTo(bx - span2 * 0.4, by - beat * 0.2 - 1, bx, by);
        ctx.quadraticCurveTo(bx + span2 * 0.4, by - beat * 0.2 - 1, bx + span2, by - beat);
        ctx.stroke();
      }
    }
  }

  /* ════════════════════════════════════════════════════════ platforms ══ */

  private platforms(ctx: CanvasRenderingContext2D, b: Built, j: DoodleState, toY: (alt: number) => number): void {
    const { w, h } = b;
    const heights = this.heights;
    const centres = this.centres;
    const last = heights.length - 1;
    const pw = DOODLE.platformW * w;
    const unit = w / 360;
    const camBottom = j.camera - this.drop - JUMP_SCENE.lift - 0.2;
    const camTop = j.camera - this.drop + 1.1;

    for (let n = 0; n <= last; n += 1) {
      const alt = heights[n];
      if (alt < camBottom) continue;
      if (alt > camTop + (n === last ? 0.3 : 0)) break;
      const left = (centres[n] - DOODLE.platformW / 2) * w;
      let y = toY(alt);
      /* The one just landed on gives under the weight, then springs back. */
      if (n === this.landedOn && this.sinceLanding < JUMP_SCENE.dip.seconds) {
        const k = this.sinceLanding / JUMP_SCENE.dip.seconds;
        y += Math.sin(k * Math.PI) * JUMP_SCENE.dip.depth * unit * (1 - k * 0.4);
      }
      const climbed = n < j.reached && n !== last;
      ctx.globalAlpha = climbed ? JUMP_SCENE.climbedAlpha : 1;

      if (n === last) {
        this.summit(ctx, b, left, y, pw, h);
      } else {
        const skin =
          n < JUMP_ZONES.cloud
            ? b.branch[n % b.branch.length]
            : n < JUMP_ZONES.rock
              ? b.cloud[n % b.cloud.length]
              : b.rock[n % b.rock.length];
        if (n >= JUMP_ZONES.rock && b.night) {
          ctx.globalAlpha *= 0.55 + 0.25 * Math.sin(this.t * 1.3 + n);
          ctx.drawImage(b.crystalGlow.c, left + pw / 2 - b.crystalGlow.w / 2, y + h * 0.02, b.crystalGlow.w, b.crystalGlow.h);
          ctx.globalAlpha = climbed ? JUMP_SCENE.climbedAlpha : 1;
        }
        ctx.drawImage(skin.s.c, left - skin.ox, y - skin.oy, skin.s.w, skin.s.h);
        /* Every tenth platform carries its number on a little hanging sign. */
        const count = n + 1;
        if (count % 10 === 0) {
          const sign = b.signs[count / 10 - 1];
          if (sign) {
            const sx = left + pw * 0.5 - sign.w / 2;
            const sy = y + h * JUMP_SCENE.slab * 1.5 + (n < JUMP_ZONES.cloud ? 0 : h * 0.012);
            ctx.strokeStyle = b.p.signInk;
            ctx.globalAlpha *= 0.7;
            ctx.lineWidth = Math.max(1, unit);
            ctx.beginPath();
            ctx.moveTo(sx + sign.w * 0.25, y + h * JUMP_SCENE.slab * 0.8);
            ctx.lineTo(sx + sign.w * 0.25, sy + 2);
            ctx.moveTo(sx + sign.w * 0.75, y + h * JUMP_SCENE.slab * 0.8);
            ctx.lineTo(sx + sign.w * 0.75, sy + 2);
            ctx.stroke();
            ctx.globalAlpha = climbed ? JUMP_SCENE.climbedAlpha : 1;
            const swing = Math.sin(this.t * 1.4 + n) * 0.05;
            ctx.save();
            ctx.translate(sx + sign.w / 2, sy);
            ctx.rotate(swing);
            ctx.drawImage(sign.c, -sign.w / 2, 0, sign.w, sign.h);
            ctx.restore();
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The summit: a snow-capped crag, a beacon behind it, the pennant flying. */
  private summit(ctx: CanvasRenderingContext2D, b: Built, left: number, y: number, pw: number, h: number): void {
    const won = this.endSeen === 'summit';
    const pulse = 0.65 + 0.35 * Math.sin(this.t * 2.2);
    /* A slow sunburst behind the flag: the landmark, readable from below. */
    const rays = b.rays;
    ctx.save();
    ctx.translate(left + pw * SUMMIT_POLE, y - h * 0.11);
    ctx.rotate(this.t * 0.12 + (won ? this.ft * 0.6 : 0));
    ctx.globalAlpha = (won ? 1 : 0.6) * b.p.rays;
    const rs = won ? 1.15 + 0.08 * Math.sin(this.ft * 5) : 1;
    ctx.drawImage(rays.c, (-rays.w / 2) * rs, (-rays.h / 2) * rs, rays.w * rs, rays.h * rs);
    ctx.restore();
    ctx.globalAlpha = (won ? 1 : 0.7) * pulse;
    const bw = b.beacon.w * (won ? 1.25 + 0.1 * Math.sin(this.ft * 6) : 1);
    ctx.drawImage(b.beacon.c, left + pw * SUMMIT_POLE - bw / 2, y - h * 0.1 - bw / 2, bw, bw);
    ctx.globalAlpha = 1;
    const skin = b.summit;
    ctx.drawImage(skin.s.c, left - skin.ox, y - skin.oy, skin.s.w, skin.s.h);

    /* The pole and the pennant, waving. */
    const unit = b.w / 360;
    const poleX = left + pw * SUMMIT_POLE;
    const poleH = h * 0.15;
    const topY = y - poleH;
    ctx.fillStyle = b.p.pole;
    ctx.fillRect(poleX - 1.2 * unit, topY, 2.4 * unit, poleH + 1);
    ctx.fillStyle = b.p.confetti[0];
    ctx.beginPath();
    ctx.arc(poleX, topY, 2.6 * unit, 0, Math.PI * 2);
    ctx.fill();

    const fw = pw * 0.56;
    const fh = h * 0.05;
    const amp = fh * (won ? 0.22 : 0.12);
    const speed = won ? 9 : 4;
    const steps = 10;
    ctx.fillStyle = b.accent;
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const wy = Math.sin(this.t * speed - u * 4.2) * amp * u;
      const x = poleX + u * fw;
      if (i === 0) ctx.moveTo(x, topY + 2 * unit + wy);
      else ctx.lineTo(x, topY + 2 * unit + wy + u * fh * 0.12);
    }
    /* The swallowtail notch. */
    const tipWave = Math.sin(this.t * speed - 4.2) * amp;
    ctx.lineTo(poleX + fw * 0.82, topY + 2 * unit + fh * 0.5 + tipWave);
    for (let i = steps; i >= 0; i -= 1) {
      const u = i / steps;
      const wy = Math.sin(this.t * speed - u * 4.2) * amp * u;
      ctx.lineTo(poleX + u * fw, topY + 2 * unit + fh - u * fh * 0.12 + wy);
    }
    ctx.closePath();
    ctx.fill();
    /* A fold of shade along the wave, and the crest's star on the cloth. */
    ctx.fillStyle = b.p.fold;
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const wy = Math.sin(this.t * speed - u * 4.2) * amp * u;
      const yy = topY + 2 * unit + fh * 0.62 + wy;
      if (i === 0) ctx.moveTo(poleX, yy);
      else ctx.lineTo(poleX + u * fw * 0.85, yy - u * fh * 0.05);
    }
    ctx.lineTo(poleX + fw * 0.85, topY + 2 * unit + fh * 0.9 + tipWave);
    ctx.lineTo(poleX, topY + 2 * unit + fh);
    ctx.closePath();
    ctx.fill();
    const sx = poleX + fw * 0.34;
    const sy = topY + 2 * unit + fh * 0.5 + Math.sin(this.t * speed - 0.34 * 4.2) * amp * 0.34;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = b.p.confetti[0];
    starPath(ctx, fh * 0.3);
    ctx.fill();
    ctx.restore();
  }

  /** Pico's shadow on the platform he will land on — where he is over one. */
  private shadow(ctx: CanvasRenderingContext2D, b: Built, j: DoodleState, view: JumpView, toY: (alt: number) => number): void {
    if (view.phase !== 'playing' || j.end) return;
    const reach = (DOODLE.platformW + DOODLE.jumperW) / 2;
    let best = -1;
    for (let n = 0; n < this.heights.length; n += 1) {
      const top = this.heights[n];
      if (top > j.y) break;
      if (Math.abs(j.x - this.centres[n]) <= reach && j.y - top < 0.45) best = n;
    }
    if (best < 0) return;
    const gap = j.y - this.heights[best];
    const k = 1 - gap / 0.45;
    const r = DOODLE.jumperW * b.w * 0.5 * (0.6 + 0.4 * k);
    const left = (this.centres[best] - DOODLE.platformW / 2) * b.w;
    const x = clamp(j.x * b.w, left + r * 0.6, left + DOODLE.platformW * b.w - r * 0.6);
    /* Two ellipses, a wide faint one and a tight one: a soft edge without a blur. */
    const y = toY(this.heights[best]) + 1.5;
    ctx.fillStyle = b.p.shadow;
    ctx.globalAlpha = 0.25 + 0.35 * k;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.15, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25 + 0.45 * k;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.75, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawRing(ctx: CanvasRenderingContext2D, b: Built, toY: (alt: number) => number): void {
    if (this.ring <= 0) return;
    const k = 1 - this.ring / 0.7;
    const r = DOODLE.jumperW * b.w * (0.8 + k * 1.6);
    ctx.strokeStyle = b.accent;
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.lineWidth = (b.w / 360) * 3 * (1 - k) + 0.6;
    ctx.beginPath();
    ctx.arc(this.ringX * b.w, toY(this.ringY) - DOODLE.jumperW * b.w * 0.6, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ═════════════════════════════════════════════════════════════ Pico ══ */

  private drawPico(ctx: CanvasRenderingContext2D, b: Built, j: DoodleState, view: JumpView, toY: (alt: number) => number): void {
    const { w, h } = b;
    const r = (DOODLE.jumperW * w) / 2;
    const size = picoSizeForBodyRadius(r);
    let y = j.y;
    const x = j.x;
    let pose: PicoPose;
    let tilt = 0;
    let sx = 1;
    let sy = 1;
    const since = this.ft - this.endAt;

    if (view.phase === 'ready') {
      pose = 'idle';
    } else if (this.endSeen === 'fell') {
      /* Knocked out, tumbling on down past the edge — a picture only: the
         round ended on the frame the fall did. */
      pose = 'hit';
      if (!view.reduced) {
        /* A knocked-out hop back up into view, then down and away. */
        const { gravity, spin, hop } = JUMP_SCENE.tumble;
        y = this.endY + hop * since - 0.5 * gravity * since * since;
        tilt = since * spin * Math.PI * 2 * this.facing;
      } else {
        y = this.endY;
        tilt = 0.4;
      }
    } else if (this.endSeen === 'summit') {
      pose = 'happy';
      if (!view.reduced) y = this.endY + Math.abs(Math.sin(since * 7)) * 0.03 * Math.max(0, 1 - since * 0.6);
      else y = this.endY;
    } else if (this.sinceLanding < JUMP_SCENE.squash.seconds && view.phase === 'playing') {
      /* Touching down: feet out for the frames of the squash. */
      pose = 'idle';
    } else if (this.cheer > 0) {
      pose = 'happy';
    } else if (j.vy < -DOODLE_JUMP_SPEED * 1.05) {
      /* Falling faster than any bounce lands: he has missed, and knows it. */
      pose = 'sad';
    } else {
      pose = 'flap';
    }

    if (!view.reduced && view.phase === 'playing' && !j.end) {
      const lean = clamp(Math.abs(this.vx) * 0.16, 0, 0.22);
      const pitch = clamp(-j.vy / DOODLE_JUMP_SPEED, -1, 1) * 0.14;
      tilt = lean + pitch;
      if (this.sinceLanding < JUMP_SCENE.squash.seconds) {
        const k = 1 - this.sinceLanding / JUMP_SCENE.squash.seconds;
        sx = 1 + JUMP_SCENE.squash.amount * 0.75 * k;
        sy = 1 - JUMP_SCENE.squash.amount * k;
      } else if (j.vy > 0) {
        const s = JUMP_SCENE.stretch * clamp(j.vy / DOODLE_JUMP_SPEED, 0, 1);
        sy = 1 + s;
        sx = 1 - s * 0.6;
      }
    }

    const feetY = toY(y);
    const feetX = x * w;
    if (feetY - size > h + 4) return;
    const o = this.pico;
    o.size = size;
    o.pose = pose;
    o.flap = this.wing;
    o.blink = view.phase === 'ready' || pose === 'idle' ? picoBlinkAt(this.t + 1.3) : 0;
    o.facing = this.facing;
    o.tilt = tilt;
    o.y = feetY - r * JUMP_SCENE.feet;

    const draw = (at: number) => {
      o.x = at;
      if (sx !== 1 || sy !== 1) {
        ctx.save();
        ctx.translate(at, feetY);
        ctx.scale(sx, sy);
        ctx.translate(-at, -feetY);
        drawPico(ctx, o);
        ctx.restore();
      } else {
        drawPico(ctx, o);
      }
    };
    draw(feetX);
    /* Off one edge is on at the other: the part past the seam shows there. */
    if (feetX < size * 0.6) draw(feetX + w);
    if (feetX > w - size * 0.6) draw(feetX - w);
  }
}

/* ═══════════════════════════════════════════════════════════════ build ══ */

function build(key: string, w: number, h: number, ratioIn: number, p: JumpPalette, accent: string, night: boolean): Built {
  const ratio = Math.min(ratioIn, JUMP_SCENE.maxRatio);
  const unit = w / 360;
  const pw = DOODLE.platformW * w;
  const slab = JUMP_SCENE.slab * h;
  const groundTop = h * 0.2;
  return {
    key,
    w,
    h,
    p,
    accent,
    night,
    sky: skyRibbon(p),
    haze: hazeSheet(w, h, p, ratio),
    stars: starSheet(w, h, p, ratio, 90, false),
    twinkle: starSheet(w, h, p, ratio, 9, true),
    aurora: p.aurora > 0 ? auroraSheet(w, h, accent, p, ratio) : null,
    orb: orbSheet(unit, p, night, ratio),
    mountains: mountainSheet(w, h, p, ratio),
    canopy: canopySheet(w, h, p, ratio),
    trunkL: trunkSheet(w, h, p, ratio, 5, false),
    trunkR: trunkSheet(w, h, p, ratio, 9, true),
    ground: groundSheet(w, h, groundTop, p, ratio),
    groundTop,
    clouds: [0, 1, 2].map((v) => backCloud(w, p, ratio, v)),
    bank: bankSheet(w, h, p, ratio),
    beams: beamSheet(w, h, p, ratio),
    cirrus: p.cirrus > 0 ? cirrusSheet(w, h, p, ratio) : null,
    rays: raySheet(unit, accent, ratio),
    drifter: night ? lanternSheet(unit, p, ratio) : balloonSheet(unit, p, ratio),
    branch: [0, 1, 2, 3].map((v) => branchSkin(pw, slab, unit, p, ratio, v)),
    cloud: [0, 1, 2].map((v) => cloudSkin(pw, slab, p, ratio, v)),
    rock: [0, 1, 2].map((v) => rockSkin(pw, slab, unit, p, accent, ratio, v, false)),
    summit: rockSkin(pw, slab, unit, p, accent, ratio, 7, true),
    signs: [10, 20, 30, 40].map((n) => signSheet(n, unit, p, ratio)),
    mote: glowSheet(9 * unit, p.moteGlow, p.moteGlowAlpha, ratio),
    beacon: glowSheet(70 * unit, accent, night ? 0.5 : 0.35, ratio),
    crystalGlow: glowSheet(26 * unit, accent, 0.4, ratio),
  };
}

/** The sky by altitude, one pixel wide: sampled a field height at a time. */
function skyRibbon(p: JumpPalette): Sheet {
  /* Tall enough that one field height of it is a few hundred rows: stretched
     any thinner, the eight-bit steps between rows show as bands. */
  const { from, to } = JUMP_SCENE.sky;
  const rows = 4096;
  const s = sheet(1, rows, 1);
  const grad = s.g.createLinearGradient(0, rows, 0, 0);
  for (const [alt, colour] of p.sky) grad.addColorStop(clamp((alt - from) / (to - from), 0, 1), colour);
  s.g.fillStyle = grad;
  s.g.fillRect(0, 0, 1, rows);
  return s;
}

/**
 * The cloud sea: a dense bank with a heaped, moonlit (or sunlit) top and a body
 * that thins out downward, so from the jungle it hangs overhead as a ceiling
 * and from above it is the floor of the sky Pico has climbed out of.
 */
function bankSheet(w: number, h: number, p: JumpPalette, ratio: number): Sheet {
  const bh = h * 0.7;
  const s = sheet(w, bh, Math.min(ratio, 1.5));
  const g = s.g;
  const r = seeded(808);
  const top = bh * 0.16;
  const lobes: [number, number, number][] = [];
  for (let x = -w * 0.05; x < w * 1.08; x += w * (0.07 + r() * 0.06)) {
    lobes.push([x, top + r() * bh * 0.07, w * (0.06 + r() * 0.07)]);
  }
  const shape = (dy: number) => {
    g.beginPath();
    for (const [x, y, rad] of lobes) {
      g.moveTo(x + rad, y + dy);
      g.arc(x, y + dy, rad, 0, Math.PI * 2);
    }
    g.rect(0, top + dy, w, bh - top);
  };
  /* The rim: the silhouette in light, the body laid over it a little lower,
     so only the tops of the heaps catch it. */
  const rim = g.createLinearGradient(0, top - bh * 0.15, 0, top + bh * 0.2);
  rim.addColorStop(0, rgba(p.bank.rim, 0.85));
  rim.addColorStop(1, rgba(p.bank.rim, 0));
  g.fillStyle = rim;
  shape(0);
  g.fill();
  const body = g.createLinearGradient(0, top - bh * 0.1, 0, bh);
  body.addColorStop(0, p.bank.top);
  body.addColorStop(0.35, p.bank.body);
  body.addColorStop(1, rgba(p.bank.body, 0));
  g.fillStyle = body;
  shape(Math.max(1.5, w / 200));
  g.fill();
  /* A second, lower row of heaps, a step darker: depth inside the bank. */
  g.fillStyle = rgba(p.bank.body, 0.5);
  for (let x = 0; x < w; x += w * 0.11) {
    g.beginPath();
    g.arc(x + r() * w * 0.04, top + bh * (0.17 + r() * 0.05), w * (0.05 + r() * 0.04), Math.PI, 0);
    g.fill();
  }
  return s;
}

/** Slanting shafts of light through the canopy, screen-sized. */
function beamSheet(w: number, h: number, p: JumpPalette, ratio: number): Sheet {
  const s = sheet(w, h, Math.min(ratio, 1));
  const g = s.g;
  const shafts: [number, number][] = [
    [0.18, 0.1],
    [0.42, 0.16],
    [0.62, 0.07],
    [0.86, 0.12],
  ];
  for (const [x, wide] of shafts) {
    const x0 = x * w;
    const span = wide * w;
    const grad = g.createLinearGradient(x0 - span, 0, x0 + span, 0);
    grad.addColorStop(0, rgba(p.beam, 0));
    grad.addColorStop(0.5, rgba(p.beam, p.beamAlpha));
    grad.addColorStop(1, rgba(p.beam, 0));
    g.save();
    g.translate(x0, 0);
    g.transform(1, 0, -0.32, 1, 0, 0);
    g.translate(-x0, 0);
    g.fillStyle = grad;
    g.fillRect(x0 - span, 0, span * 2, h * 0.9);
    g.restore();
  }
  /* Fade the shafts out toward the floor. */
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  return s;
}

/** Mist over the foot of the view while the jungle is in it. */
function hazeSheet(w: number, h: number, p: JumpPalette, ratio: number): Sheet {
  const s = sheet(w, h, Math.min(ratio, 1));
  const grad = s.g.createLinearGradient(0, h, 0, h * 0.35);
  grad.addColorStop(0, rgba(p.haze, p.hazeAlpha));
  grad.addColorStop(1, rgba(p.haze, 0));
  s.g.fillStyle = grad;
  s.g.fillRect(0, 0, w, h);
  return s;
}

function starSheet(w: number, h: number, p: JumpPalette, ratio: number, count: number, bright: boolean): Sheet {
  const s = sheet(w, h, ratio);
  const g = s.g;
  const r = seeded(bright ? 303 : 101);
  const unit = w / 360;
  for (let i = 0; i < count; i += 1) {
    const x = r() * w;
    const y = r() * h;
    const warm = r() < 0.25;
    if (bright) {
      const size = (1.3 + r() * 1.5) * unit;
      g.fillStyle = rgba(warm ? p.starWarm : p.star, 0.18);
      g.beginPath();
      g.arc(x, y, size * 1.8, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(x, y);
      g.fillStyle = warm ? p.starWarm : p.star;
      sparklePath(g, size * 1.6);
      g.fill();
      g.restore();
    } else {
      const size = (0.4 + r() * r() * 1.4) * unit;
      g.fillStyle = rgba(warm ? p.starWarm : p.star, 0.45 + r() * 0.55);
      g.beginPath();
      g.arc(x, y, size, 0, Math.PI * 2);
      g.fill();
    }
  }
  return s;
}

/** The aurora: curtains of the page's own accent, hung across the top of the night. */
function auroraSheet(w: number, h: number, accent: string, p: JumpPalette, ratio: number): Sheet {
  const aw = w * 1.1;
  const ah = h * 0.42;
  const s = sheet(aw, ah, Math.min(ratio, 1));
  const g = s.g;
  const step = Math.max(1, w / 320);
  const r = seeded(4242);
  /* Two curtains, one behind the other. Each is a run of thin vertical rays
     whose brightness wanders ray to ray — the folds — over a hem that
     snakes across the sky and is brightest at its lower edge, as the real
     thing is. */
  const curtain = (phase: number, lift: number, strength: number) => {
    let ray = 0.6;
    for (let x = 0; x < aw; x += step) {
      const u = x / aw;
      ray = clamp(ray + (r() - 0.5) * 0.35, 0.15, 1);
      const base = ah * (lift + 0.14 * Math.sin(u * 5.3 + phase) + 0.06 * Math.sin(u * 13.1 + phase * 2));
      const tall = ah * (0.22 + 0.22 * Math.abs(Math.sin(u * 3.1 + phase)));
      const fold = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(u * 9.7 + phase * 3)), 0.6);
      const bright = p.aurora * strength * ray * fold * (0.4 + 0.6 * Math.abs(Math.sin(u * 2.4 + phase)));
      const grad = g.createLinearGradient(0, base - tall, 0, base + ah * 0.03);
      grad.addColorStop(0, rgba(accent, 0));
      grad.addColorStop(0.62, rgba(accent, bright * 0.45));
      grad.addColorStop(0.94, rgba(mix(accent, '#ffffff', 0.45), bright));
      grad.addColorStop(1, rgba(accent, 0));
      g.fillStyle = grad;
      g.fillRect(x, base - tall, step + 0.4, tall + ah * 0.03);
    }
  };
  curtain(2.1, 0.42, 0.55);
  curtain(0.3, 0.62, 1);
  return s;
}

function orbSheet(unit: number, p: JumpPalette, night: boolean, ratio: number): Sheet {
  const R = 30 * unit;
  const size = R * 5;
  const s = sheet(size, size, ratio);
  const g = s.g;
  const c = size / 2;
  const halo = g.createRadialGradient(c, c, R * 0.8, c, c, c);
  halo.addColorStop(0, rgba(p.halo, p.haloAlpha));
  halo.addColorStop(1, rgba(p.halo, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);
  g.fillStyle = p.orb;
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.fill();
  if (night) {
    /* Maria and a few craters: the moon, not a lamp. */
    g.fillStyle = p.orbShade;
    const marks: [number, number, number][] = [
      [-0.3, -0.25, 0.28],
      [0.25, 0.1, 0.2],
      [-0.1, 0.35, 0.16],
      [0.38, -0.32, 0.1],
    ];
    for (const [mx, my, mr] of marks) {
      g.beginPath();
      g.arc(c + mx * R, c + my * R, mr * R, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    const inner = g.createRadialGradient(c - R * 0.2, c - R * 0.2, R * 0.1, c, c, R);
    inner.addColorStop(0, p.orb);
    inner.addColorStop(1, p.orbShade);
    g.fillStyle = inner;
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.fill();
  }
  return s;
}

/** Two ridges of mountains with snow on the tall ones, mist at their feet. */
function mountainSheet(w: number, h: number, p: JumpPalette, ratio: number): Sheet {
  const mh = h * 0.5;
  const s = sheet(w, mh, ratio);
  const g = s.g;
  const ridge = (seed: number, baseY: number, peak: number, fill: string, snow: boolean) => {
    const r = seeded(seed);
    const pts: [number, number][] = [];
    let x = -w * 0.1;
    while (x < w * 1.1) {
      const hgt = peak * (0.45 + r() * 0.55);
      pts.push([x, baseY - hgt]);
      x += w * (0.12 + r() * 0.14);
      pts.push([x, baseY - hgt * (0.35 + r() * 0.25)]);
      x += w * (0.06 + r() * 0.08);
    }
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(-w * 0.1, mh);
    for (const [px, py] of pts) g.lineTo(px, py);
    g.lineTo(w * 1.1, mh);
    g.closePath();
    g.fill();
    if (!snow) return;
    g.fillStyle = p.mountains.snow;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const [px, py] = pts[i];
      if (baseY - py < peak * 0.72) continue;
      const cap = (baseY - py) * 0.2;
      const [lx, ly] = i > 0 ? pts[i - 1] : [px - w * 0.1, py + cap * 2];
      const [rx, ry] = pts[i + 1];
      const tl = cap / Math.max(1, ly - py);
      const tr = cap / Math.max(1, ry - py);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + (rx - px) * tr, py + cap);
      g.lineTo(px + (rx - px) * tr * 0.45, py + cap * 0.7);
      g.lineTo(px, py + cap * 1.05);
      g.lineTo(px + (lx - px) * tl * 0.5, py + cap * 0.75);
      g.lineTo(px + (lx - px) * tl, py + cap);
      g.closePath();
      g.fill();
    }
  };
  ridge(17, mh * 0.92, mh * 0.85, p.mountains.far, true);
  ridge(29, mh, mh * 0.55, p.mountains.near, false);
  const mist = g.createLinearGradient(0, mh, 0, mh * 0.45);
  mist.addColorStop(0, rgba(p.mountains.mist, p.mountains.mistAlpha));
  mist.addColorStop(1, rgba(p.mountains.mist, 0));
  g.fillStyle = mist;
  g.fillRect(0, 0, w, mh);
  return s;
}

/** The jungle beyond: three depths of rounded crowns, the nearest lit on top. */
function canopySheet(w: number, h: number, p: JumpPalette, ratio: number): Sheet {
  const ch = h * 0.62;
  const s = sheet(w, ch, ratio);
  const g = s.g;
  const layer = (seed: number, top: number, fill: string, lit: string | null, size: number) => {
    const r = seeded(seed);
    let x = -size;
    while (x < w + size) {
      const rad = size * (0.6 + r() * 0.6);
      const cy = top + r() * size * 0.8;
      /* A trunk under each crown, then the crown as a cluster of lobes. */
      g.fillStyle = fill;
      g.fillRect(x - rad * 0.08, cy, rad * 0.16, ch - cy);
      for (let k = 0; k < 4; k += 1) {
        g.beginPath();
        g.arc(x + (k - 1.5) * rad * 0.45, cy + Math.sin(k * 2.1) * rad * 0.2, rad * (0.55 + 0.15 * (k % 2)), 0, Math.PI * 2);
        g.fill();
      }
      if (lit) {
        g.fillStyle = lit;
        g.globalAlpha = 0.35;
        g.beginPath();
        g.arc(x - rad * 0.25, cy - rad * 0.3, rad * 0.35, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      g.fillStyle = fill;
      g.fillRect(x - rad, cy + rad * 0.35, rad * 2, ch);
      x += rad * (1.1 + r() * 0.5);
    }
  };
  layer(3, ch * 0.18, p.canopy.back, null, w * 0.11);
  layer(13, ch * 0.42, p.canopy.mid, p.canopy.light, w * 0.09);
  layer(23, ch * 0.68, p.canopy.front, p.canopy.light, w * 0.075);
  return s;
}

/** A jungle tree at one edge of the field: trunk, a few boughs, vines, leaves. */
function trunkSheet(w: number, h: number, p: JumpPalette, ratio: number, seed: number, mirror: boolean): Sheet {
  /* The sheet is wider than the tree reaches, so no spray of leaves is cut
     off at its edge. */
  const tw = w * 0.34;
  const span = w * 0.2;
  const th = h * 2.3;
  const s = sheet(tw, th, ratio);
  const g = s.g;
  const r = seeded(seed);
  const unit = w / 360;
  if (mirror) {
    g.translate(tw, 0);
    g.scale(-1, 1);
  }
  const trunkW = w * 0.075;
  const crown = th * 0.06;
  /* The trunk, wavering a little, wider at the root. */
  g.fillStyle = p.trunk.bark;
  g.beginPath();
  g.moveTo(-trunkW * 0.3, th);
  for (let y = th; y >= crown; y -= th / 24) {
    const k = y / th;
    g.lineTo(trunkW * (0.75 + 0.55 * k * k) + Math.sin(y * 0.02) * 3 * unit, y);
  }
  g.lineTo(-trunkW * 0.3, crown);
  g.closePath();
  g.fill();
  /* Bark: long shaded grooves and a lit edge. */
  g.strokeStyle = p.trunk.shade;
  g.lineWidth = 2 * unit;
  for (let i = 0; i < 6; i += 1) {
    const x0 = trunkW * (0.1 + r() * 0.6);
    g.beginPath();
    g.moveTo(x0, th);
    for (let y = th; y > crown; y -= 30 * unit) g.lineTo(x0 + Math.sin(y * 0.013 + i) * 3 * unit, y);
    g.stroke();
  }
  g.strokeStyle = p.trunk.light;
  g.globalAlpha = 0.5;
  g.lineWidth = 1.5 * unit;
  g.beginPath();
  for (let y = th; y > crown; y -= th / 24) {
    const k = y / th;
    g.lineTo(trunkW * (0.75 + 0.55 * k * k) + Math.sin(y * 0.02) * 3 * unit - 2 * unit, y);
  }
  g.stroke();
  g.globalAlpha = 1;
  /* Knots and moss on the bark. */
  for (let i = 0; i < 7; i += 1) {
    const ky = crown + r() * (th - crown);
    const kx = trunkW * (0.2 + r() * 0.5);
    g.fillStyle = p.trunk.shade;
    g.beginPath();
    g.ellipse(kx, ky, 3.2 * unit, 5 * unit, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.trunk.light;
    g.globalAlpha = 0.4;
    g.beginPath();
    g.ellipse(kx - 0.8 * unit, ky - 1 * unit, 1.4 * unit, 2.4 * unit, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  g.fillStyle = p.leaf.dark;
  for (let i = 0; i < 5; i += 1) {
    const my = crown + r() * (th - crown);
    for (let k = 0; k < 4; k += 1) {
      g.beginPath();
      g.arc(trunkW * (0.65 + r() * 0.3), my + k * 4 * unit, (2.2 + r() * 2) * unit, 0, Math.PI * 2);
      g.fill();
    }
  }

  /* Boughs reaching in, each ending in a spray of leaves; vines hang off them. */
  const boughs = 5;
  for (let i = 0; i < boughs; i += 1) {
    const by = crown + th * (0.08 + (i / boughs) * 0.78 + r() * 0.05);
    const reach = span * (0.6 + r() * 0.35);
    g.strokeStyle = p.trunk.bark;
    g.lineWidth = (5 + r() * 3) * unit;
    g.beginPath();
    g.moveTo(trunkW * 0.5, by + 10 * unit);
    g.quadraticCurveTo(reach * 0.6, by - 6 * unit, reach, by - 12 * unit);
    g.stroke();
    leafSpray(g, reach, by - 12 * unit, 7, 20 * unit, p, r);
    if (r() < 0.75) {
      const vx = reach * (0.45 + r() * 0.4);
      const len = h * (0.18 + r() * 0.3);
      vine(g, vx, by - 2 * unit, len, unit, p, r);
    }
  }
  /* The crown on top. */
  for (let k = 0; k < 9; k += 1) {
    leafSpray(g, trunkW * 0.5 + (r() - 0.3) * span * 0.9, crown + r() * th * 0.04, 6, 24 * unit, p, r);
  }
  return s;
}

function leafSpray(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  len: number,
  p: JumpPalette,
  r: () => number,
): void {
  for (let i = 0; i < count; i += 1) {
    const a = -Math.PI * 0.95 + (i / (count - 1)) * Math.PI * 1.15 + (r() - 0.5) * 0.3;
    const l = len * (0.7 + r() * 0.5);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = i % 3 === 0 ? p.leaf.dark : i % 3 === 1 ? p.leaf.mid : p.leaf.light;
    leafPath(g, l, l * 0.32);
    g.fill();
    g.strokeStyle = p.leaf.vein;
    g.globalAlpha = 0.5;
    g.lineWidth = Math.max(0.6, l * 0.04);
    g.beginPath();
    g.moveTo(l * 0.1, 0);
    g.lineTo(l * 0.85, 0);
    g.stroke();
    g.globalAlpha = 1;
    g.restore();
  }
}

function vine(g: CanvasRenderingContext2D, x: number, y: number, len: number, unit: number, p: JumpPalette, r: () => number): void {
  g.strokeStyle = p.leaf.dark;
  g.lineWidth = 1.6 * unit;
  g.beginPath();
  g.moveTo(x, y);
  const sway = (r() - 0.5) * 16 * unit;
  g.bezierCurveTo(x + sway, y + len * 0.3, x - sway, y + len * 0.7, x + sway * 0.5, y + len);
  g.stroke();
  for (let k = 0.15; k < 1; k += 0.14) {
    const t = k;
    const vx = x + sway * (3 * t * (1 - t) * (1 - t) - 3 * t * t * (1 - t) + 0.5 * t * t * t);
    const vy = y + len * t;
    g.save();
    g.translate(vx, vy);
    g.rotate((k * 10) % 2 > 1 ? 0.5 : Math.PI - 0.5);
    g.fillStyle = (k * 10) % 2 > 1 ? p.leaf.mid : p.leaf.light;
    leafPath(g, 8 * unit, 3 * unit);
    g.fill();
    g.restore();
  }
}

/** The floor: grass with a lit edge, ferns and flowers at the sides, soil below. */
function groundSheet(w: number, h: number, top: number, p: JumpPalette, ratio: number): Sheet {
  /* Deep enough to fill the view under the floor while the ready view is lowered. */
  const gh = top + h * (JUMP_SCENE.lift + JUMP_SCENE.readyDrop + 0.02);
  const s = sheet(w, gh, ratio);
  const g = s.g;
  const r = seeded(61);
  const unit = w / 360;

  /* Bushes and ferns behind, at the two sides — the middle stays clear for Pico. */
  for (const side of [0, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const bx = side === 0 ? w * (0.02 + i * 0.07) : w * (0.98 - i * 0.07);
      leafSpray(g, bx, top + 4 * unit, 7, (34 - i * 5) * unit, p, r);
    }
  }
  /* Soil, darkening with depth, roots reaching down through it, then the turf. */
  const soil = g.createLinearGradient(0, top, 0, gh);
  soil.addColorStop(0, p.ground.soil);
  soil.addColorStop(1, p.ground.deep);
  g.fillStyle = soil;
  g.fillRect(0, top + 6 * unit, w, gh);
  g.strokeStyle = p.ground.root;
  for (let i = 0; i < 7; i += 1) {
    let x = w * (0.06 + r() * 0.88);
    let y = top + 8 * unit;
    g.lineWidth = (2.5 + r() * 2) * unit;
    g.beginPath();
    g.moveTo(x, y);
    const len = (gh - top) * (0.35 + r() * 0.45);
    while (y < top + len) {
      const nx = x + (r() - 0.5) * 22 * unit;
      const ny = y + (14 + r() * 16) * unit;
      g.quadraticCurveTo(x + (r() - 0.5) * 10 * unit, (y + ny) / 2, nx, ny);
      x = nx;
      y = ny;
      g.lineWidth *= 0.85;
    }
    g.stroke();
  }
  /* Stones with a lit top. */
  for (let i = 0; i < 9; i += 1) {
    const sx = r() * w;
    const sy = top + (gh - top) * (0.25 + r() * 0.7);
    const sr = (4 + r() * 6) * unit;
    g.fillStyle = mix(p.ground.rock, p.ground.deep, 0.35);
    g.beginPath();
    g.ellipse(sx, sy, sr * 1.3, sr, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.ground.rock;
    g.beginPath();
    g.ellipse(sx - sr * 0.15, sy - sr * 0.25, sr * 0.95, sr * 0.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = p.ground.grass;
  g.beginPath();
  g.moveTo(0, top + 14 * unit);
  for (let x = 0; x <= w; x += w / 18) g.lineTo(x, top + (10 + Math.sin(x * 0.09) * 3) * unit);
  g.lineTo(w, top);
  g.lineTo(0, top);
  g.closePath();
  g.fill();
  g.fillRect(0, top - 1, w, 4 * unit);
  g.fillStyle = p.ground.grassLight;
  g.fillRect(0, top - 1, w, 1.6 * unit);
  /* Pebbles and roots in the soil. */
  for (let i = 0; i < 26; i += 1) {
    g.fillStyle = rgba(p.ground.rock, 0.5 + r() * 0.4);
    g.beginPath();
    g.ellipse(r() * w, top + (20 + r() * (gh - top - 26)) * 1, (2 + r() * 4) * unit, (1.5 + r() * 2.5) * unit, 0, 0, Math.PI * 2);
    g.fill();
  }
  /* Blades along the edge. */
  for (let i = 0; i < 90; i += 1) {
    const x = r() * w;
    const hgt = (4 + r() * 8) * unit;
    g.fillStyle = r() < 0.5 ? p.ground.grass : p.ground.grassLight;
    g.beginPath();
    g.moveTo(x - 1.6 * unit, top + 1);
    g.quadraticCurveTo(x + (r() - 0.5) * 3 * unit, top - hgt * 0.6, x + (r() - 0.5) * 5 * unit, top - hgt);
    g.lineTo(x + 1.6 * unit, top + 1);
    g.closePath();
    g.fill();
  }
  /* Flowers: Pico's warm notes, on stems, away from the middle. */
  for (let i = 0; i < 9; i += 1) {
    const u = r();
    const x = (u < 0.5 ? u * 0.7 : 0.3 + u * 0.7) * w;
    if (Math.abs(x - w / 2) < w * 0.12) continue;
    const stem = (8 + r() * 10) * unit;
    g.strokeStyle = p.ground.grass;
    g.lineWidth = 1.2 * unit;
    g.beginPath();
    g.moveTo(x, top + 2);
    g.lineTo(x + (r() - 0.5) * 4 * unit, top - stem);
    g.stroke();
    const fx = x;
    const fy = top - stem;
    g.fillStyle = p.bloom[i % 3];
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      g.beginPath();
      g.arc(fx + Math.cos(a) * 2.4 * unit, fy + Math.sin(a) * 2.4 * unit, 2 * unit, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = p.bloom[(i + 2) % 3];
    g.beginPath();
    g.arc(fx, fy, 1.4 * unit, 0, Math.PI * 2);
    g.fill();
  }
  /* Two mushrooms by the left bush, a mossy stone on the right. */
  for (const [mx, ms] of [
    [0.24, 1],
    [0.28, 0.7],
  ] as const) {
    const x = w * mx;
    const sz = 7 * unit * ms;
    g.fillStyle = p.stalk;
    g.fillRect(x - sz * 0.25, top - sz * 1.1, sz * 0.5, sz * 1.1 + 2);
    g.fillStyle = p.bloom[1];
    g.beginPath();
    g.ellipse(x, top - sz * 1.1, sz, sz * 0.62, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = p.spot;
    g.beginPath();
    g.arc(x - sz * 0.35, top - sz * 1.35, sz * 0.15, 0, Math.PI * 2);
    g.arc(x + sz * 0.3, top - sz * 1.45, sz * 0.12, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = p.ground.rock;
  g.beginPath();
  g.ellipse(w * 0.8, top + 1, 16 * unit, 9 * unit, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = p.leaf.mid;
  g.beginPath();
  g.ellipse(w * 0.8 - 2 * unit, top - 6 * unit, 11 * unit, 4 * unit, -0.1, Math.PI, 0);
  g.fill();
  return s;
}

/** A background cloud: a soft heap of lobes, lit from above. */
function backCloud(w: number, p: JumpPalette, ratio: number, v: number): Sheet {
  const cw = w * 0.5;
  const ch = w * 0.2;
  const s = sheet(cw, ch, Math.min(ratio, 1.5));
  const g = s.g;
  const r = seeded(500 + v * 7);
  const lobes: [number, number, number][] = [];
  const n = 5 + v;
  for (let i = 0; i < n; i += 1) {
    const u = (i + 0.5) / n;
    const rad = ch * (0.22 + Math.sin(u * Math.PI) * 0.2 + r() * 0.06);
    lobes.push([cw * (0.1 + u * 0.8), ch * 0.72 - rad * 0.5, rad]);
  }
  /* One silhouette (lobes and a soft base), filled top-lit to sky-dark, then
     a rim of light round the upper lobes. No hard underside: that is what a
     platform cloud has, and these must never be mistaken for one. */
  const shape = (dy: number) => {
    g.beginPath();
    for (const [x, y, rad] of lobes) {
      g.moveTo(x + rad, y + dy);
      g.arc(x, y + dy, rad, 0, Math.PI * 2);
    }
    g.roundRect(cw * 0.08, ch * 0.55 + dy, cw * 0.84, ch * 0.3, ch * 0.15);
  };
  /* The silhouette in the rim colour, then the body over it a hair lower:
     what is left showing is light along the top edge only. */
  g.fillStyle = rgba(p.backCloud.rim, 0.7);
  shape(0);
  g.fill();
  const body = g.createLinearGradient(0, ch * 0.1, 0, ch * 0.9);
  body.addColorStop(0, p.backCloud.top);
  body.addColorStop(1, p.backCloud.bottom);
  g.fillStyle = body;
  shape(Math.max(1.5, w / 150));
  g.fill();
  return s;
}

/* ── the platform skins ──────────────────────────────────────────────── */

/** A branch to stand on: bark with a lit top, a knot, leaves at its ends. */
function branchSkin(pw: number, slab: number, unit: number, p: JumpPalette, ratio: number, v: number): Skin {
  const ox = pw * 0.2;
  const oy = slab * 0.5;
  const s = sheet(pw + ox * 2, slab * 3.6, ratio);
  const g = s.g;
  const r = seeded(70 + v * 13);
  g.translate(ox, oy);

  /* Leaves hanging under first, so the bark sits over their stems. */
  for (let i = 0; i < 4; i += 1) {
    g.save();
    g.translate(pw * (0.12 + r() * 0.76), slab * 0.7);
    g.rotate(Math.PI / 2 + (r() - 0.5) * 1.1);
    g.fillStyle = i % 2 ? p.leaf.dark : p.leaf.mid;
    leafPath(g, slab * (1.4 + r() * 0.8), slab * 0.45);
    g.fill();
    g.restore();
  }
  /* The bough: a shade under it, the bark, then the moonlit/sunlit top edge. */
  const body = (dy: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(slab * 0.25, dy + slab * 0.08);
    g.quadraticCurveTo(pw * 0.5, dy - slab * 0.06, pw - slab * 0.2, dy);
    g.quadraticCurveTo(pw + slab * 0.15, dy + slab * 0.5, pw - slab * 0.25, dy + slab);
    g.quadraticCurveTo(pw * 0.5, dy + slab * 1.15, slab * 0.35, dy + slab * 0.95);
    g.quadraticCurveTo(-slab * 0.1, dy + slab * 0.5, slab * 0.25, dy + slab * 0.08);
    g.closePath();
    g.fill();
  };
  body(slab * 0.22, p.branch.shade);
  body(0, p.branch.bark);
  g.fillStyle = p.branch.rim;
  g.beginPath();
  g.moveTo(slab * 0.4, slab * 0.12);
  g.quadraticCurveTo(pw * 0.5, -slab * 0.02, pw - slab * 0.35, slab * 0.06);
  g.lineTo(pw - slab * 0.35, slab * 0.3);
  g.quadraticCurveTo(pw * 0.5, slab * 0.22, slab * 0.4, slab * 0.34);
  g.closePath();
  g.fill();
  /* Grain and a knot. */
  g.strokeStyle = p.branch.shade;
  g.lineWidth = Math.max(0.8, unit);
  g.globalAlpha = 0.7;
  for (let i = 0; i < 2; i += 1) {
    const y = slab * (0.5 + i * 0.22);
    const x0 = pw * (0.1 + r() * 0.2);
    g.beginPath();
    g.moveTo(x0, y);
    g.quadraticCurveTo(pw * 0.5, y + (r() - 0.5) * slab * 0.2, pw * (0.7 + r() * 0.2), y);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = p.branch.knot;
  g.beginPath();
  g.ellipse(pw * (0.25 + r() * 0.5), slab * 0.6, slab * 0.22, slab * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  /* A sawn end on one variant: the rings show. */
  if (v === 1) {
    g.fillStyle = p.branch.rim;
    g.beginPath();
    g.ellipse(pw - slab * 0.2, slab * 0.5, slab * 0.22, slab * 0.48, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = p.branch.knot;
    g.lineWidth = Math.max(0.6, unit * 0.8);
    g.beginPath();
    g.ellipse(pw - slab * 0.2, slab * 0.5, slab * 0.1, slab * 0.24, 0, 0, Math.PI * 2);
    g.stroke();
  }
  /* Leaves at the ends, fanning out and down. */
  const ends = v === 1 ? [0] : [0, 1];
  for (const end of ends) {
    const ex = end === 0 ? slab * 0.3 : pw - slab * 0.3;
    const dir = end === 0 ? -1 : 1;
    for (let i = 0; i < 4; i += 1) {
      g.save();
      g.translate(ex, slab * 0.45);
      g.rotate((dir < 0 ? Math.PI : 0) + dir * (0.15 + i * 0.32));
      g.fillStyle = i % 3 === 0 ? p.leaf.dark : i % 3 === 1 ? p.leaf.mid : p.leaf.light;
      leafPath(g, slab * (1.5 + r() * 0.5), slab * 0.5);
      g.fill();
      g.restore();
    }
  }
  /* Moss along the top on one variant, a flower on another. */
  if (v === 2 || v === 3) {
    g.fillStyle = p.leaf.mid;
    for (let x = pw * 0.15; x < pw * 0.55; x += slab * 0.35) {
      g.beginPath();
      g.arc(x, slab * 0.12, slab * 0.2, Math.PI, 0);
      g.fill();
    }
    g.fillStyle = p.leaf.light;
    g.fillRect(pw * 0.15, slab * 0.02, pw * 0.4, slab * 0.08);
  }
  if (v === 0 || v === 3) {
    const fx = v === 0 ? pw - slab * 0.1 : slab * 0.2;
    const fy = slab * 0.2;
    g.fillStyle = p.bloom[v === 0 ? 1 : 0];
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      g.beginPath();
      g.arc(fx + Math.cos(a) * slab * 0.22, fy + Math.sin(a) * slab * 0.22, slab * 0.18, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = p.bloom[2];
    g.beginPath();
    g.arc(fx, fy, slab * 0.12, 0, Math.PI * 2);
    g.fill();
  }
  return { s, ox, oy };
}

/** A cloud to stand on: a flat-ish top, round lobes underneath, a lit rim. */
function cloudSkin(pw: number, slab: number, p: JumpPalette, ratio: number, v: number): Skin {
  const ox = pw * 0.1;
  const oy = slab * 0.6;
  const s = sheet(pw + ox * 2, slab * 3.4, ratio);
  const g = s.g;
  const r = seeded(200 + v * 11);
  g.translate(ox, oy);
  const lobes: [number, number, number][] = [];
  const under = 4 + v;
  for (let i = 0; i < under; i += 1) {
    const u = (i + 0.5) / under;
    lobes.push([pw * (0.06 + u * 0.88), slab * (1.05 + r() * 0.25), slab * (0.55 + Math.sin(u * Math.PI) * 0.35 + r() * 0.1)]);
  }
  /* Two low bumps on top — a cloud, but still plainly a floor. */
  lobes.push([pw * (0.3 + r() * 0.1), slab * 0.32, slab * 0.42]);
  lobes.push([pw * (0.62 + r() * 0.1), slab * 0.3, slab * 0.38]);
  const pass = (fill: string, dy: number) => {
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(0, dy, pw, slab * 1.2, slab * 0.6);
    g.fill();
    for (const [x, y, rad] of lobes) {
      g.beginPath();
      g.arc(x, y + dy, rad, 0, Math.PI * 2);
      g.fill();
    }
  };
  pass(p.cloud.shade, slab * 0.35);
  pass(p.cloud.body, 0);
  /* The rim: light along the top. */
  g.fillStyle = p.cloud.rim;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.roundRect(slab * 0.3, 0, pw - slab * 0.6, slab * 0.22, slab * 0.11);
  g.fill();
  g.globalAlpha = 1;
  /* A soft inner shade under the middle, so the lobes read as volume. */
  g.fillStyle = p.cloud.shade;
  g.globalAlpha = 0.35;
  g.beginPath();
  g.ellipse(pw * 0.5, slab * 1.35, pw * 0.32, slab * 0.32, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  return { s, ox, oy };
}

/** A floating rock: moss on top, faceted stone tapering under it, the accent's crystals. */
function rockSkin(
  pw: number,
  slab: number,
  unit: number,
  p: JumpPalette,
  accent: string,
  ratio: number,
  v: number,
  summit: boolean,
): Skin {
  const ox = pw * 0.08;
  const oy = slab * 0.5;
  const deep = slab * (summit ? 6.5 : 3.8);
  const s = sheet(pw + ox * 2, oy + deep + slab, ratio);
  const g = s.g;
  const r = seeded(300 + v * 17);
  g.translate(ox, oy);

  /* The stone: a lit left face and a shaded right one meeting at a keel. */
  const keelX = pw * (0.42 + r() * 0.14);
  const left: [number, number][] = [
    [0, slab * 0.3],
    [pw * 0.05, slab * 1.1],
    [pw * 0.16, slab * 1.9],
    [keelX - pw * 0.12, deep * 0.78],
    [keelX, deep],
  ];
  const right: [number, number][] = [
    [keelX, deep],
    [keelX + pw * 0.1, deep * 0.72],
    [pw * 0.84, slab * 1.8],
    [pw * 0.96, slab * 1.0],
    [pw, slab * 0.3],
  ];
  g.fillStyle = p.rock.face;
  g.beginPath();
  g.moveTo(0, slab * 0.3);
  for (const [x, y] of left) g.lineTo(x, y);
  for (const [x, y] of right) g.lineTo(x, y);
  g.closePath();
  g.fill();
  g.fillStyle = p.rock.shade;
  g.beginPath();
  g.moveTo(pw * 0.55, slab * 0.3);
  g.lineTo(pw * 0.62, slab * 1.4);
  g.lineTo(keelX + pw * 0.04, deep * 0.6);
  for (const [x, y] of right) g.lineTo(x, y);
  g.closePath();
  g.fill();
  g.strokeStyle = p.rock.rim;
  g.globalAlpha = 0.45;
  g.lineWidth = Math.max(0.8, unit);
  g.beginPath();
  g.moveTo(pw * 0.06, slab * 1.1);
  g.lineTo(pw * 0.2, slab * 1.6);
  g.lineTo(pw * 0.3, slab * 1.5);
  g.moveTo(pw * 0.62, slab * 1.4);
  g.lineTo(pw * 0.7, slab * 2.1);
  g.stroke();
  g.globalAlpha = 1;

  /* Crystals in the page's accent, poking out of the underside. */
  const crystals = summit ? 4 : 2 + (v % 2);
  for (let i = 0; i < crystals; i += 1) {
    const cx = pw * (0.18 + (i / Math.max(1, crystals - 1)) * 0.6) + (r() - 0.5) * pw * 0.06;
    const cy = slab * (1.4 + r() * 0.9) + (summit ? slab * 1.2 : 0);
    const len = slab * (1.1 + r() * 0.9);
    const wid = slab * (0.32 + r() * 0.14);
    const a = Math.PI / 2 + (cx - pw / 2) / pw * 1.3 + (r() - 0.5) * 0.4;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    g.fillStyle = accent;
    g.beginPath();
    g.moveTo(0, -wid);
    g.lineTo(len * 0.75, -wid);
    g.lineTo(len, 0);
    g.lineTo(len * 0.75, wid);
    g.lineTo(0, wid);
    g.closePath();
    g.fill();
    g.fillStyle = p.glint;
    g.beginPath();
    g.moveTo(0, -wid);
    g.lineTo(len * 0.75, -wid);
    g.lineTo(len, 0);
    g.lineTo(0, -wid * 0.1);
    g.closePath();
    g.fill();
    g.fillStyle = p.fold;
    g.beginPath();
    g.moveTo(0, wid * 0.35);
    g.lineTo(len * 0.75, wid * 0.35);
    g.lineTo(len * 0.75, wid);
    g.lineTo(0, wid);
    g.closePath();
    g.fill();
    g.restore();
  }

  /* The top: moss with blades, or the summit's snow with drips over the edge. */
  if (summit) {
    g.fillStyle = p.snowShade;
    g.beginPath();
    g.roundRect(-slab * 0.1, slab * 0.15, pw + slab * 0.2, slab * 0.85, slab * 0.42);
    g.fill();
    g.fillStyle = p.snow;
    g.beginPath();
    g.roundRect(-slab * 0.1, 0, pw + slab * 0.2, slab * 0.75, slab * 0.38);
    g.fill();
    for (let i = 0; i < 6; i += 1) {
      const dx = pw * (0.08 + i * 0.16 + (r() - 0.5) * 0.05);
      g.beginPath();
      g.ellipse(dx, slab * 0.75, slab * 0.16, slab * (0.25 + r() * 0.3), 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = p.glint;
    g.fillRect(slab * 0.3, slab * 0.08, pw - slab * 0.6, slab * 0.14);
  } else {
    g.fillStyle = p.rock.moss;
    g.beginPath();
    g.roundRect(0, 0, pw, slab * 0.7, slab * 0.34);
    g.fill();
    for (let i = 0; i < 5; i += 1) {
      g.beginPath();
      g.ellipse(pw * (0.1 + i * 0.2), slab * 0.7, slab * 0.22, slab * 0.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = p.rock.mossLight;
    g.beginPath();
    g.roundRect(slab * 0.2, 0, pw - slab * 0.4, slab * 0.2, slab * 0.1);
    g.fill();
    for (let i = 0; i < 14; i += 1) {
      const bx = pw * (0.04 + r() * 0.92);
      const bh = slab * (0.2 + r() * 0.3);
      g.fillRect(bx, -bh + slab * 0.05, Math.max(0.8, unit), bh);
    }
  }
  return { s, ox, oy };
}

/** High wisps of cloud for the top of a day climb. */
function cirrusSheet(w: number, h: number, p: JumpPalette, ratio: number): Sheet {
  const cw = w * 1.1;
  const chh = h * 0.45;
  const s = sheet(cw, chh, Math.min(ratio, 1));
  const g = s.g;
  const r = seeded(919);
  for (let i = 0; i < 9; i += 1) {
    const x = r() * cw;
    const y = r() * chh;
    const len = w * (0.25 + r() * 0.35);
    g.save();
    g.translate(x, y);
    g.rotate(-0.08 + r() * 0.16);
    g.scale(1, 0.09 + r() * 0.06);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, len / 2);
    grad.addColorStop(0, rgba(p.cloud.rim, 0.9));
    grad.addColorStop(1, rgba(p.cloud.rim, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, len / 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  return s;
}

/** The summit's sunburst: soft wedges of the accent, rotated slowly behind the flag. */
function raySheet(unit: number, accent: string, ratio: number): Sheet {
  const R = 120 * unit;
  const s = sheet(R * 2, R * 2, Math.min(ratio, 1));
  const g = s.g;
  g.translate(R, R);
  const rays = 10;
  for (let i = 0; i < rays; i += 1) {
    const a = (i / rays) * Math.PI * 2;
    const grad = g.createRadialGradient(0, 0, R * 0.08, 0, 0, R);
    grad.addColorStop(0, rgba(accent, 0.32));
    grad.addColorStop(1, rgba(accent, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, R, a - 0.11, a + 0.11);
    g.closePath();
    g.fill();
  }
  return s;
}

/** A sky lantern: warm paper lit from inside, in a glow of its own. */
function lanternSheet(unit: number, p: JumpPalette, ratio: number): Sheet {
  const W = 46 * unit;
  const s = sheet(W, W, ratio);
  const g = s.g;
  const c = W / 2;
  const halo = g.createRadialGradient(c, c, 0, c, c, c);
  halo.addColorStop(0, rgba(p.lantern.glow, 0.42));
  halo.addColorStop(1, rgba(p.lantern.glow, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, W, W);
  const lw = 9 * unit;
  const lh = 12 * unit;
  g.fillStyle = p.lantern.paper;
  g.beginPath();
  g.moveTo(c - lw * 0.5, c - lh * 0.5);
  g.lineTo(c + lw * 0.5, c - lh * 0.5);
  g.lineTo(c + lw * 0.36, c + lh * 0.5);
  g.lineTo(c - lw * 0.36, c + lh * 0.5);
  g.closePath();
  g.fill();
  const core = g.createRadialGradient(c, c + lh * 0.2, 0, c, c + lh * 0.2, lh * 0.6);
  core.addColorStop(0, p.lantern.light);
  core.addColorStop(1, rgba(p.lantern.light, 0));
  g.fillStyle = core;
  g.fillRect(c - lw * 0.5, c - lh * 0.5, lw, lh);
  return s;
}

/** A hot-air balloon, far off: striped envelope, a little basket. */
function balloonSheet(unit: number, p: JumpPalette, ratio: number): Sheet {
  const W = 30 * unit;
  const H = 40 * unit;
  const s = sheet(W, H, ratio);
  const g = s.g;
  const cx = W / 2;
  const R = 12 * unit;
  const cy = R + 2 * unit;
  const envelope = () => {
    g.beginPath();
    g.arc(cx, cy, R, Math.PI * 0.8, Math.PI * 0.2);
    g.quadraticCurveTo(cx + R * 0.5, cy + R * 1.25, cx + R * 0.22, cy + R * 1.45);
    g.lineTo(cx - R * 0.22, cy + R * 1.45);
    g.quadraticCurveTo(cx - R * 0.5, cy + R * 1.25, cx + Math.cos(Math.PI * 0.8) * R, cy + Math.sin(Math.PI * 0.8) * R);
    g.closePath();
  };
  envelope();
  g.save();
  g.clip();
  const stripes = 5;
  for (let i = 0; i < stripes; i += 1) {
    g.fillStyle = p.balloon[i % 3];
    g.fillRect(cx - R + (i * 2 * R) / stripes, 0, (2 * R) / stripes + 0.5, H);
  }
  g.fillStyle = p.fold;
  g.fillRect(cx + R * 0.25, 0, R, H);
  g.restore();
  g.strokeStyle = p.basket;
  g.lineWidth = Math.max(0.8, 0.8 * unit);
  g.beginPath();
  g.moveTo(cx - R * 0.2, cy + R * 1.45);
  g.lineTo(cx - R * 0.18, cy + R * 1.85);
  g.moveTo(cx + R * 0.2, cy + R * 1.45);
  g.lineTo(cx + R * 0.18, cy + R * 1.85);
  g.stroke();
  g.fillStyle = p.basket;
  g.fillRect(cx - R * 0.22, cy + R * 1.85, R * 0.44, R * 0.32);
  return s;
}

/** A milestone's hanging sign, its number burned in. */
function signSheet(n: number, unit: number, p: JumpPalette, ratio: number): Sheet {
  const sw = 26 * unit;
  const sh = 15 * unit;
  const s = sheet(sw, sh + 2 * unit, ratio);
  const g = s.g;
  g.fillStyle = mix(p.sign, '#000000', 0.3);
  g.beginPath();
  g.roundRect(0, 1.5 * unit, sw, sh, 3 * unit);
  g.fill();
  g.fillStyle = p.sign;
  g.beginPath();
  g.roundRect(0, 0, sw, sh, 3 * unit);
  g.fill();
  g.fillStyle = p.signInk;
  g.font = `800 ${9.5 * unit}px Poppins, ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), sw / 2, sh / 2 + 0.5 * unit);
  return s;
}
