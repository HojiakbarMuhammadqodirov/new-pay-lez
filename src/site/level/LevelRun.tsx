import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { roundRect } from '../flight/parrot';
import type { GlobeTone } from '../theme/context';
import { LEVEL, type LevelPalette, type Move } from './config';
import { COLS, JUMP, RUN } from './sprite';

/**
 * The signed-in Play screen's backdrop: a side-scrolling platformer running
 * itself, forever.
 *
 * A runner crosses the level, jumps into a row of bricks and shatters them,
 * knocks a mushroom out of a lucky box and grows, clears two pits, hops a
 * floating platform, breaks another row now that he is big, and leaves down a
 * pipe on the right. Then it starts over. That is the page's own argument in
 * the one grammar nobody has to be taught: play, get bigger, cash out.
 *
 * Canvas 2D, one context, nothing per-frame through React state — the same
 * construction as `NetworkWeb`, `ArcadeTrail` and `StubDrift`. Three things
 * about *this* one are worth knowing before editing it:
 *
 * - **The run is scripted, not simulated.** `LEVEL.moves` is a gapless list of
 *   parabolas and straight lines, and the runner's height is a lookup into it
 *   (`baseAt`). There is no gravity, no collision and no failure state, which
 *   is the point: a simulated runner on a backdrop is a runner who eventually
 *   falls in a pit at 3am and lies there until someone reloads the page. Every
 *   jump clears every pit because the jump *is* the level.
 * - **Everything is a function of `u`**, how far the runner has travelled in
 *   tiles. The camera, the mushroom, the growth and the run cycle all read it,
 *   so nothing can drift out of step with anything else, and the whole state of
 *   the level at any moment is one number plus which blocks are broken.
 * - **The level is drawn three times**, at `u - length`, `u` and `u + length`,
 *   culled per feature. That is what makes the wrap seamless: the start of the
 *   next lap is already on screen while the end of this one is leaving.
 */

interface Debris {
  /** Tiles, level space. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left. */
  life: number;
  spin: number;
  angle: number;
  color: string;
}

/** `#rgb` / `#rrggbb` to the `r,g,b` triplet canvas colour strings want. */
function toRgb(hex: string): string {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const value = Number.parseInt(full, 16);
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

/* ── which frame he is on ─────────────────────────────────────────────────
 *
 * Both of these are pure lookups into the script, deliberately: the level is
 * scripted rather than simulated (see the header), and a gait that integrated
 * its own phase would be a second clock to drift out of step with `u`.
 */

/**
 * The beats have to sum to the frame count or `stride` stops meaning frames per
 * tile and the whole cadence moves — silently, since the run would still loop.
 * Checked once at load, the same bargain `assertFrames` makes in `sprite.ts`.
 */
function assertBeats() {
  const total = LEVEL.runner.beats.reduce((sum, beat) => sum + beat, 0);
  if (LEVEL.runner.beats.length !== RUN.length || Math.abs(total - RUN.length) > 1e-6) {
    throw new Error(
      `level: ${LEVEL.runner.beats.length} beats summing to ${total}, want ${RUN.length} summing to ${RUN.length}`,
    );
  }
}
assertBeats();

/**
 * The run pose at a point in the level.
 *
 * `u * stride` is the cycle position in frame-widths; walking the beat table
 * rather than flooring it is what lets stance last longer than flight. The
 * total is unchanged, so the *stride* still covers exactly the ground it did —
 * only its internal division moved, which is the whole point: a gait is uneven
 * and a metronome is not.
 */
const runFrame = (at: number) => {
  let cycle = (at * LEVEL.runner.stride) % RUN.length;
  if (cycle < 0) cycle += RUN.length;
  for (let i = 0; i < RUN.length; i += 1) {
    cycle -= LEVEL.runner.beats[i];
    if (cycle < 0) return RUN[i];
  }
  return RUN[RUN.length - 1];
};

/**
 * The airborne pose, chosen by how fast the arc is climbing rather than by how
 * far through it he is.
 *
 * `baseAt`'s height is `line + 4·p·t·(1−t)`, so this is its derivative: the
 * linear term plus `4p(1 − 2t)`. Velocity and not `t`, because the moves are not
 * all symmetric — the hop *onto* the platform lands three tiles higher than it
 * leaves, and reading `t` would have him falling through the second half of a
 * jump that is still going up. Off velocity, that move rises and then holds the
 * apex to the end, which is what it looks like.
 *
 * The middle band is wide on purpose. The apex pose is the one every block is
 * struck from, and `LEGS_AIRBORNE` is drawn symmetric precisely because it is
 * the airborne frame on screen longest.
 */
const jumpFrame = (move: Move, t: number) => {
  const arc = 4 * (move.peak ?? 0);
  const climb = (move.toBase ?? move.base) - move.base + arc * (1 - 2 * t);
  if (climb > arc * 0.45) return JUMP.rise;
  if (climb < -arc * 0.45) return JUMP.fall;
  return JUMP.apex;
};

interface LevelRunProps {
  primaryColor: string;
  /** `'ink'` on a light page: see the `tone` and `palette` blocks in `config.ts`. */
  tone: GlobeTone;
  className?: string;
}

export const LevelRun = memo(function LevelRun({
  primaryColor,
  tone,
  className,
}: LevelRunProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  const skin = useRef({ rgb: toRgb(primaryColor), tone });
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    const ctx = host.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    /** Tile size, CSS px. */
    let T = 24;
    /** Ground line, CSS px from the top. */
    let groundPx = 0;

    /** How far the runner has come, in tiles. The level's only clock. */
    let u = 0;
    /** Which blocks have been struck this lap. */
    const broken = LEVEL.blocks.map(() => false);
    /** Where the mushroom came from, and when — null until the box is opened. */
    let shroom: { at: number; x: number; y: number } | null = null;
    /** Where the mushroom was caught, in tiles. Null until it is. */
    let grownAt: number | null = null;
    let debris: Debris[] = [];

    const between = (min: number, max: number) => min + Math.random() * (max - min);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      host.width = Math.round(width * dpr);
      host.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      T = Math.max(LEVEL.tile.min, Math.min(LEVEL.tile.max, height * LEVEL.tile.of));
      groundPx = height * LEVEL.groundY;
    };

    /* ── the script ─────────────────────────────────────────────────────── */

    /** The move covering a point in the level. */
    const moveAt = (x: number) => {
      for (const move of LEVEL.moves) {
        if (x >= move.from && x < move.to) return move;
      }
      return LEVEL.moves[LEVEL.moves.length - 1];
    };

    /** The runner's height at a point in the level, tiles above the ground. */
    const baseAt = (x: number) => {
      const move = moveAt(x);
      const t = (x - move.from) / (move.to - move.from);
      const line = move.base + ((move.toBase ?? move.base) - move.base) * t;
      /* 4·p·t·(1−t) is the unit parabola scaled to peak at t = 0.5 — which is
         also where the block is, by construction. */
      return line + 4 * (move.peak ?? 0) * t * (1 - t);
    };

    /** Everything that happens once per lap, undone. */
    const rewind = () => {
      broken.fill(false);
      shroom = null;
      grownAt = null;
      debris = [];
    };

    /** Throws a handful of shards off a block that has just been hit. */
    const shatter = (x: number, y: number, color: string) => {
      for (let i = 0; i < LEVEL.debris.count; i += 1) {
        const angle = between(-Math.PI * 0.85, -Math.PI * 0.15);
        const speed = between(LEVEL.debris.speed * 0.55, LEVEL.debris.speed);
        debris.push({
          x: x + 0.5,
          y: y + 0.5,
          vx: Math.cos(angle) * speed,
          vy: -Math.sin(angle) * speed,
          life: between(LEVEL.debris.life * 0.6, LEVEL.debris.life),
          spin: between(-9, 9),
          angle: 0,
          color,
        });
      }
    };

    const step = (dt: number) => {
      const was = u;
      u += LEVEL.speed * dt;
      if (u >= LEVEL.length) {
        u -= LEVEL.length;
        rewind();
      }

      /*
       * Blocks are struck at the apex of the jump that reaches them, and the
       * test is "did `u` cross the apex this frame" rather than a collision
       * check. Skipped on the frame the level wrapped: `was` is then on the
       * previous lap and every apex would read as crossed at once.
       */
      if (u >= was) {
        const palette = LEVEL.palette[skin.current.tone];
        for (const move of LEVEL.moves) {
          if (move.peak === undefined) continue;
          const apex = (move.from + move.to) / 2;
          if (apex <= was || apex > u) continue;

          LEVEL.blocks.forEach((block, i) => {
            if (broken[i]) return;
            if (Math.abs(block.x + 0.5 - apex) > LEVEL.strikeRadius) return;
            broken[i] = true;
            if (block.kind === 'lucky') {
              shroom = { at: u, x: block.x, y: block.y };
              /* A lucky box keeps its shape and goes dull; only bricks break,
                 which is what makes the two read as different objects. */
            } else {
              shatter(block.x, block.y, palette.brick);
            }
          });
        }
      }

      /*
       * The mushroom is caught when the runner reaches it — a comparison in
       * tile space rather than a hit test, since both are positions on the same
       * line.
       *
       * `d >= dash` is load-bearing and not a tidiness guard. The box is struck
       * at the apex of the jump, which is *over* it, so for the first tile the
       * runner is already past where the mushroom emerged and the naive test
       * fires on the frame it appears — power-up collected, nothing seen. Only
       * once it has finished outrunning him and stopped is there anything to
       * catch up to.
       */
      if (shroom && grownAt === null) {
        const d = u - shroom.at;
        if (d >= LEVEL.mushroom.dash && u >= shroom.x + LEVEL.mushroom.reach) {
          grownAt = u;
        }
      }

      for (const shard of debris) {
        shard.x += shard.vx * dt;
        shard.y += shard.vy * dt;
        shard.vy -= LEVEL.debris.gravity * dt;
        shard.angle += shard.spin * dt;
        shard.life -= dt;
      }
      debris = debris.filter((shard) => shard.life > 0);
    };

    /* ── drawing ────────────────────────────────────────────────────────── */

    /*
     * Each sprite frame, stamped once into an offscreen canvas one *device
     * pixel per cell*, then blitted scaled with smoothing off.
     *
     * Not an optimisation — a correctness fix. Painting the cells straight onto
     * the page canvas means painting ~90 translucent rects at `globalAlpha`, and
     * they have to overlap slightly or fractional cell sizes leave hairline gaps
     * between them. Overlapping translucent fills double-blend, so the sprite
     * came out with a bright grid drawn over it: every seam brighter than the
     * body it was seaming. Stamping at alpha 1 and blitting once puts the
     * transparency on the *whole figure* instead of on each of its pixels.
     *
     * Keyed by frame identity, and dropped wholesale when the theme flips,
     * since the tone is what decides the three shades.
     */
    const stamps = new Map<string[], HTMLCanvasElement>();
    let stampedTone: GlobeTone | null = null;

    const stampFor = (frame: string[], palette: LevelPalette, tone: GlobeTone) => {
      if (stampedTone !== tone) {
        stamps.clear();
        stampedTone = tone;
      }
      const cached = stamps.get(frame);
      if (cached) return cached;

      const off = document.createElement('canvas');
      off.width = COLS;
      off.height = frame.length;
      const octx = off.getContext('2d');
      if (!octx) return null;

      const wear: Record<string, string> = {
        o: palette.runner.helmet,
        '+': palette.runner.face,
        '#': palette.runner.shirt,
        '-': palette.runner.legs,
      };

      for (let row = 0; row < frame.length; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const paint = wear[frame[row][col]];
          if (!paint) continue; // '.', which is nothing
          octx.fillStyle = paint;
          octx.fillRect(col, row, 1, 1);
        }
      }

      stamps.set(frame, off);
      return off;
    };

    /** Left edge of the view, in tiles. */
    const camera = () => u - (width * LEVEL.lead) / T;

    /** Tile x to screen x, for a given lap offset. */
    const sx = (x: number, lap: number) => (x + lap * LEVEL.length - camera()) * T;
    /** Tiles above the ground to screen y. */
    const sy = (y: number) => groundPx - y * T;

    /** The three laps a feature may need drawing on. */
    const LAPS = [-1, 0, 1];

    const onScreen = (left: number, w: number) => left + w > -T && left < width + T;

    const drawGround = (alpha: number, rgb: string) => {
      for (const lap of LAPS) {
        for (const [from, to] of LEVEL.ground) {
          const left = sx(from, lap);
          const w = (to - from) * T;
          if (!onScreen(left, w)) continue;

          ctx.globalAlpha = alpha * 0.55;
          ctx.fillStyle = `rgb(${rgb})`;
          ctx.fillRect(left, groundPx, w, height - groundPx);

          // The lit cap: what turns a block of colour into a surface.
          ctx.globalAlpha = alpha * 1.6;
          ctx.fillRect(left, groundPx - 2, w, 3);
        }
      }
    };

    const drawPlatform = (alpha: number, color: string) => {
      const { from, to, y } = LEVEL.platform;
      for (const lap of LAPS) {
        const left = sx(from, lap);
        const w = (to - from) * T;
        if (!onScreen(left, w)) continue;

        ctx.globalAlpha = alpha * 0.28;
        ctx.fillStyle = color;
        ctx.fillRect(left, sy(y), w, T * 0.55);
        ctx.globalAlpha = alpha;
        ctx.fillRect(left, sy(y), w, 3);
      }
    };

    const drawPipes = (alpha: number, color: string) => {
      const { w, h } = LEVEL.pipes;
      for (const lap of LAPS) {
        for (const x of LEVEL.pipes.at) {
          const left = sx(x, lap);
          const px = w * T;
          if (!onScreen(left, px)) continue;

          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;

          /* The barrel runs from under the lip *to the ground line* — a height
             computed rather than assumed, because `h * T` from the lip
             overshoots by the lip's own depth and hangs through the floor. */
          const lipDepth = T * 0.6;
          const barrelTop = sy(h) + lipDepth;
          const barrelH = groundPx - barrelTop;

          ctx.globalAlpha = alpha * 0.22;
          ctx.fillRect(left + px * 0.12, barrelTop, px * 0.76, barrelH);
          ctx.globalAlpha = alpha;
          ctx.strokeRect(left + px * 0.12, barrelTop, px * 0.76, barrelH);

          // The lip, wider than the barrel — it is the whole silhouette.
          ctx.globalAlpha = alpha * 0.3;
          roundRect(ctx, left, sy(h), px, lipDepth, 4);
          ctx.fill();
          ctx.globalAlpha = alpha;
          ctx.stroke();
        }
      }
    };

    const drawBlocks = (alpha: number, palette: LevelPalette) => {
      for (const lap of LAPS) {
        LEVEL.blocks.forEach((block, i) => {
          const left = sx(block.x, lap);
          if (!onScreen(left, T)) return;

          const hit = broken[i];
          // A broken brick is gone; a spent lucky box stays and goes dull.
          if (hit && block.kind === 'brick') return;

          const color = block.kind === 'lucky' ? (hit ? palette.spent : palette.lucky) : palette.brick;
          const top = sy(block.y + 1);
          const size = T * 0.94;

          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = 2;

          ctx.globalAlpha = alpha * (hit ? 0.12 : 0.24);
          roundRect(ctx, left, top, size, size, 3);
          ctx.fill();
          ctx.globalAlpha = alpha * (hit ? 0.5 : 1);
          ctx.stroke();

          if (block.kind === 'brick') {
            // Courses, so a brick is a brick and not a square.
            ctx.globalAlpha = alpha * 0.5;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(left, top + size / 2);
            ctx.lineTo(left + size, top + size / 2);
            ctx.moveTo(left + size / 2, top);
            ctx.lineTo(left + size / 2, top + size / 2);
            ctx.moveTo(left + size * 0.25, top + size / 2);
            ctx.lineTo(left + size * 0.25, top + size);
            ctx.moveTo(left + size * 0.75, top + size / 2);
            ctx.lineTo(left + size * 0.75, top + size);
            ctx.stroke();
          } else if (!hit) {
            ctx.globalAlpha = alpha;
            ctx.font = `700 ${Math.round(size * 0.66)}px Poppins, ui-sans-serif, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', left + size / 2, top + size * 0.54);
          }
        });
      }
    };

    const drawMushroom = (alpha: number, color: string) => {
      if (!shroom || grownAt !== null) return;
      const d = u - shroom.at;
      const { rise, fall, reach, dash } = LEVEL.mushroom;

      const x = shroom.x + reach * Math.min(1, d / dash);
      let y: number;
      if (d < rise) {
        // Growing out of the top of the box.
        y = shroom.y + (d / rise);
      } else if (d < fall) {
        // Walking off it and dropping — squared, so it reads as falling.
        const t = (d - rise) / (fall - rise);
        y = (shroom.y + 1) * (1 - t * t);
      } else {
        y = 0;
      }

      for (const lap of LAPS) {
        const left = sx(x, lap);
        if (!onScreen(left, T)) continue;

        const cx = left + T * 0.5;
        const base = sy(y);
        // A full tile across, like a block: it has to be an object in the level
        // rather than a speck at the runner's feet.
        const r = T * 0.5;

        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        // Stem, then a domed cap: the smallest shape that is unmistakably this.
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillRect(cx - r * 0.4, base - r * 0.62, r * 0.8, r * 0.62);
        ctx.globalAlpha = alpha;
        ctx.strokeRect(cx - r * 0.4, base - r * 0.62, r * 0.8, r * 0.62);

        ctx.globalAlpha = alpha * 0.34;
        ctx.beginPath();
        ctx.arc(cx, base - r * 0.62, r, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.stroke();
      }
    };

    /**
     * The runner, as a pixel sprite — see `sprite.ts` for the frames and for
     * why he is one rather than a stroked figure.
     *
     * Drawn from the feet up, so growing changes exactly one number and never
     * lifts him off the floor. The cell size falls out of the frame's row count
     * rather than being chosen, which is what keeps the small and big sprites
     * the same *build* at two heights instead of two differently-proportioned
     * characters.
     */
    const drawRunner = (alpha: number, palette: LevelPalette) => {
      const move = moveAt(u);
      const airborne = move.peak !== undefined;
      const y = baseAt(u);

      // Down the pipe: the run script takes him below the floor and the ground
      // line is where he stops being visible.
      const h =
        (grownAt === null
          ? LEVEL.runner.small
          : LEVEL.runner.small +
            (LEVEL.runner.big - LEVEL.runner.small) *
              Math.min(1, (u - grownAt) / LEVEL.runner.grow)) * T;

      /*
       * What he can sink into.
       *
       * Normally the floor, so nothing is ever drawn below the ground line.
       * Over the pipe it is the pipe's *mouth*, which is what makes going down
       * it read as going down it: the script takes his baseline below the mouth
       * and the clip eats him from the feet up. The overlap test is against his
       * level position rather than his screen position because his screen
       * position never changes — he is always at `lead`, and it is the pipe
       * that arrives.
       */
      const overPipe = LEVEL.pipes.at.some(
        (x) => u >= x - 0.5 && u <= x + LEVEL.pipes.w,
      );
      const floor = overPipe ? sy(LEVEL.pipes.h) : groundPx;

      const feet = sy(y);
      if (feet - h > floor) return; // fully swallowed

      /* Which pose. The run cycle is keyed to *distance*, so the stride is tied
         to the ground speed rather than ticking on a clock of its own — the
         thing that makes a sprite look like it is skating if you get it wrong.
         The jump is keyed to the arc it is on for the same reason. One set of
         art at both sizes: the mushroom scales him, see `sprite.ts`. */
      const frame = airborne
        ? jumpFrame(move, (u - move.from) / (move.to - move.from))
        : runFrame(u);

      const stamp = stampFor(frame, palette, skin.current.tone);
      if (!stamp) return;

      const px = h / frame.length;
      const left = width * LEVEL.lead + T * 0.5 - (COLS * px) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, floor);
      ctx.clip();

      ctx.globalAlpha = alpha;
      // Nearest-neighbour, or the whole point of drawing pixels is lost to a blur.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(stamp, left, feet - h, COLS * px, h);
      ctx.imageSmoothingEnabled = true;

      ctx.restore();
    };

    const drawDebris = (alpha: number) => {
      for (const shard of debris) {
        for (const lap of LAPS) {
          const left = sx(shard.x, lap);
          if (!onScreen(left, T)) continue;
          const size = T * 0.2;
          ctx.save();
          ctx.translate(left, sy(shard.y));
          ctx.rotate(shard.angle);
          ctx.globalAlpha = alpha * Math.min(1, shard.life / LEVEL.debris.life);
          ctx.fillStyle = shard.color;
          ctx.fillRect(-size / 2, -size / 2, size, size);
          ctx.restore();
        }
      }
    };

    /** Clouds and hills, at a fraction of the camera's speed. */
    const drawSky = (alpha: number, rgb: string) => {
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.globalAlpha = alpha;

      for (const lap of LAPS) {
        for (const hill of LEVEL.hills) {
          const left =
            (hill.x + lap * LEVEL.length - camera() * LEVEL.parallax.hill) * T;
          const r = hill.r * T;
          if (!onScreen(left - r, r * 2)) continue;
          ctx.beginPath();
          ctx.arc(left, groundPx, r, Math.PI, 0);
          ctx.fill();
        }

        for (const cloud of LEVEL.clouds) {
          const left =
            (cloud.x + lap * LEVEL.length - camera() * LEVEL.parallax.cloud) * T;
          const r = cloud.r * T;
          if (!onScreen(left - r * 2, r * 4)) continue;
          const top = sy(cloud.y);
          // Three overlapping discs: the cheapest shape that reads as a cloud.
          ctx.beginPath();
          ctx.arc(left - r * 0.8, top, r * 0.7, 0, Math.PI * 2);
          ctx.arc(left, top - r * 0.25, r, 0, Math.PI * 2);
          ctx.arc(left + r * 0.9, top, r * 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const draw = () => {
      const alphas = LEVEL.tone[skin.current.tone];
      const palette = LEVEL.palette[skin.current.tone];
      const rgb = skin.current.rgb;

      ctx.clearRect(0, 0, width, height);
      /* `source-over` in both tones, unlike the other backdrops: this one draws
         five hues that overlap, and `lighter` turns every overlap white. */
      ctx.globalCompositeOperation = 'source-over';

      drawSky(alphas.sky, rgb);
      drawGround(alphas.terrain, rgb);
      drawPlatform(alphas.item, palette.pipe);
      drawPipes(alphas.item, palette.pipe);
      drawBlocks(alphas.item, palette);
      drawMushroom(alphas.item, palette.shroom);
      drawDebris(alphas.item);
      drawRunner(alphas.runner, palette);

      ctx.globalAlpha = 1;
    };

    /* ── loop ───────────────────────────────────────────────────────────── */

    repaint.current = draw;

    resize();

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) repaint.current?.();
    });
    observer.observe(host);

    /*
     * Reduced motion: one still frame, parked where the level says the most
     * about itself — mid-jump into the lucky box, mushroom not yet out. There
     * is no slower version of a platformer, so the honest answer is a
     * screenshot of one.
     */
    if (reduced) {
      u = 20.5;
      draw();
      return () => {
        observer.disconnect();
        repaint.current = null;
      };
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      step(dt);
      draw();

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      repaint.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    skin.current = { rgb: toRgb(primaryColor), tone };
    repaint.current?.();
  }, [primaryColor, tone]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
});
