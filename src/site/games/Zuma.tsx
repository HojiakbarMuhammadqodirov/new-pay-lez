import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { useTheme } from '../theme/context';
import {
  ZUMA_CHAIN,
  ZUMA_COLORS,
  ZUMA_ROUND_SECONDS,
  ZUMA_STEP,
  arcadeMilestones,
  arcadePoints,
  localRng,
  zumaChain,
  zumaShots,
} from './arcade';
import { EndVeil, PerfectBar, ReadyVeil, RoundClock } from './hud';
import { PicumaScene, type PicumaView } from './picuma/scene';

/**
 * Zuma — called **Picuma** on screen, the app's name for it — a chain of balls
 * rolls along a winding track towards a hole; Pico shoots a ball into it, and
 * three or more of one kind touching are gone. When a gap closes and the two
 * sides match, they go too. The round ends when the chain is cleared or its
 * front reaches the hole, and it is scored on the share of the chain cleared.
 * The id stays `zuma` everywhere a machine reads it (the server's game type,
 * `GAMES`, the economics row); only the name a player reads changed.
 *
 * ## What the server can and cannot know
 *
 * With a `session` the chain and the shooter's balls are the server's
 * (`content.chain`, `content.shots`). Whether a shot met the chain where the
 * screen says is a fact about the screen, so the report is the number of
 * **chain** balls cleared — shot balls never count — held by the server to what
 * the chain holds and what the round's duration allows. Without one both come
 * from `localRng`.
 *
 * ## Four kinds, told apart by their marks
 *
 * A kind is a **mark** cut into the ball — a dot, a ring, a bar, a cross — and
 * the mark is what tells kinds apart. The balls are drawn as four polished
 * temple stones (jade, gold, coral, deep teal — the app's four), so the stone
 * is a second cue, never the only one; `picuma/config.ts` says how the marks
 * stay first.
 *
 * ## The picture is `picuma/scene.ts`
 *
 * Everything drawn — the temple courtyard, the causeway, the idol, Pico on his
 * branch with the next shot in his beak, the bursts — is the scene's. It reads
 * the refs below and never writes them; the rules tell it two things as they
 * happen (`popRun`, `joined`) so a pop bursts where the orbs were and the
 * chain slides where the rules made it jump.
 *
 * ## The round ends: the chain cleared, the hole, or the clock
 *
 * The first two are the game's, and the hole is the one a round normally meets
 * (~73 s for a chain left alone). They are not enough on their own: clearing
 * the front of the chain pulls it back from the hole, and nothing stopped a
 * player doing that for as long as they liked — an autopilot that played for it
 * kept one chain alive for six and a half minutes. `ZUMA_ROUND_SECONDS` of play
 * is the backstop, counted down in the header like every arcade clock.
 *
 * ## Per frame, nothing goes through React
 *
 * The chain, the shot in flight and the track live in refs and move in fixed
 * `ZUMA_STEP`s (the app's 1/60 s), so a shot cannot step past a ball on a slow
 * frame and the chain rolls the same distance at any frame rate; React hears
 * about the count when it moves and the clock when its second changes.
 */

const END_MS = 900;
const ASPECT = 4 / 3;
/** A ball's diameter, in field widths. */
const D = 0.06;
/** How fast the chain rolls on, and how fast it rolls in at the start. */
const CRAWL = 0.03;
const ENTRY = 0.5;
const ENTRY_UNTIL = 1.1;
const SHOT_SPEED = 1.7;
const SHOOTER = { x: 0.5, y: ASPECT - 0.1 };

interface Ball {
  kind: number;
  /** A chain ball (counts) or a shot that joined it (does not). */
  chain: boolean;
}

/** The track: three runs across the field joined by half-turns, ending in the hole. */
function track(): { pts: Array<[number, number]>; at: number[] } {
  const pts: Array<[number, number]> = [];
  const rows = [0.16, 0.42, 0.68];
  const left = 0.1;
  const right = 0.9;
  const turn = (rows[1] - rows[0]) / 2;
  for (let r = 0; r < rows.length; r += 1) {
    const forward = r % 2 === 0;
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      pts.push([forward ? left + (right - left) * t : right - (right - left) * t, rows[r]]);
    }
    if (r < rows.length - 1) {
      const cx = forward ? right : left;
      const cy = rows[r] + turn;
      for (let i = 1; i < 16; i += 1) {
        const a = -Math.PI / 2 + (Math.PI * i) / 16;
        pts.push([cx + (forward ? 1 : -1) * Math.cos(a) * turn, cy + Math.sin(a) * turn]);
      }
    }
  }
  const at = [0];
  for (let i = 1; i < pts.length; i += 1) {
    at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { pts, at };
}

export function Zuma({
  session,
  serverRound,
  onDone,
  onQuit,
}: {
  session?: string;
  serverRound?: { chain: number[]; shots: number[] };
  /** Points (local reckoning), fifths of a perfect round, a perfect round, chain balls cleared, the report. */
  onDone: (points: number, correct: number, won: boolean, cleared: number, report: Record<string, unknown>) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const remote = Boolean(session && serverRound?.chain?.length);
  const path = useMemo(track, []);
  const length = path.at[path.at.length - 1];

  const shots = useRef<number[]>(remote ? serverRound!.shots : zumaShots(localRng));
  const chain = useRef<Ball[]>((remote ? serverRound!.chain : zumaChain(localRng)).map((kind) => ({ kind, chain: true })));
  /** Where the front ball is along the track. Balls behind sit `D` apart. */
  const head = useRef(0);
  const shotIndex = useRef(0);
  const loaded = useRef<[number, number]>([shots.current[0] ?? 0, shots.current[1] ?? 0]);
  const flying = useRef<{ x: number; y: number; vx: number; vy: number; kind: number } | null>(null);
  const aimAt = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.4 });
  const clearedRef = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  /* The picture. Built once; it reads the refs above and writes none of them. */
  const scene = useRef<PicumaScene | null>(null);
  if (!scene.current) scene.current = new PicumaScene({ track: path, ball: D, shooter: SHOOTER, aspect: ASPECT });
  const view = useRef<PicumaView>({ chain: [], head: 0, shot: null, loaded: loaded.current, aim: aimAt.current, phase: 'ready', end: null });

  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [cleared, setCleared] = useState(0);
  const [next, setNext] = useState<[number, number]>(loaded.current);
  const [secondsLeft, setSecondsLeft] = useState(ZUMA_ROUND_SECONDS);
  const [end, setEnd] = useState<'cleared' | 'hole' | 'time'>('hole');
  /* Fixed steps played: the round's clock is `steps × ZUMA_STEP`. */
  const steps = useRef(0);
  const finished = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  /* The phase and the ending as the picture should show them, without making
     `paint` change identity (the loop's effect depends on it). */
  const shown = useRef({ phase, end });
  shown.current = { phase, end };

  /** A point `s` along the track, or null before its start. */
  const pointAt = useCallback(
    (s: number): [number, number] | null => {
      if (s < 0) return null;
      if (s >= length) return path.pts[path.pts.length - 1];
      let i = 1;
      while (path.at[i] < s) i += 1;
      const t = (s - path.at[i - 1]) / (path.at[i] - path.at[i - 1]);
      const a = path.pts[i - 1];
      const b = path.pts[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    },
    [length, path],
  );

  /** One frame of the picture, from the refs as they stand. */
  const paint = useCallback(() => {
    const element = canvas.current;
    const picture = scene.current;
    if (!element || !picture) return;
    const v = view.current;
    v.chain = chain.current;
    v.head = head.current;
    v.shot = flying.current;
    v.loaded = loaded.current;
    v.aim = aimAt.current;
    v.phase = shown.current.phase;
    v.end = shown.current.phase === 'over' ? shown.current.end : null;
    picture.paint(element, v, performance.now());
  }, []);

  /* The theme, motion preference and the words the picture draws. */
  useEffect(() => {
    const picture = scene.current;
    if (!picture) return;
    picture.setTheme(theme);
    picture.setReduced(reduced);
    const face = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
    picture.setText(face, copy.zuma.combo);
    paint();
  }, [theme, reduced, copy.zuma.combo, paint]);

  /* Outside a round the courtyard still lives — torches, fireflies, Pico
     blinking, the last bursts settling — on a loop of its own that moves
     nothing the rules own. The round's loop below paints while playing. Under
     reduced motion there is nothing to animate, so it paints once. */
  useEffect(() => {
    if (phase === 'playing') return;
    if (reduced) {
      paint();
      return;
    }
    let frame = 0;
    const loop = () => {
      paint();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, reduced, paint]);

  /** Pop a run of three or more around `index`, then keep closing gaps that match. */
  const settle = useCallback((index: number) => {
    let at = index;
    for (;;) {
      const list = chain.current;
      if (at < 0 || at >= list.length) return;
      const kind = list[at].kind;
      let a = at;
      let b = at;
      while (a > 0 && list[a - 1].kind === kind) a -= 1;
      while (b < list.length - 1 && list[b + 1].kind === kind) b += 1;
      if (b - a + 1 < 3) return;
      const gone = list.slice(a, b + 1).filter((ball) => ball.chain).length;
      /* The picture bursts them where they are drawn; it changes nothing here. */
      scene.current?.popRun(list, a, b, head.current, gone);
      chain.current = [...list.slice(0, a), ...list.slice(b + 1)];
      /* The front of the chain stays put; a run removed at the front pulls it back. */
      if (a === 0) head.current -= (b + 1) * D;
      clearedRef.current += gone;
      setCleared(clearedRef.current);
      /* The gap closes: the ball now at `a` meets the one before it. */
      at = a > 0 ? a - 1 : -1;
      if (at >= 0 && at + 1 < chain.current.length && chain.current[at + 1].kind !== chain.current[at].kind) return;
    }
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    let shown = -1;
    const lastStep = Math.round(ZUMA_ROUND_SECONDS / ZUMA_STEP);

    /* One fixed step: the chain rolls, the shot flies, and a shot that meets
       the chain joins it. */
    const step = (dt: number) => {
      steps.current += 1;
      head.current += (head.current < ENTRY_UNTIL ? ENTRY : CRAWL) * dt;

      const shot = flying.current;
      if (shot) {
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        let hit = -1;
        let nearest = Infinity;
        chain.current.forEach((_, i) => {
          const at = pointAt(head.current - i * D);
          if (!at) return;
          const gap = Math.hypot(at[0] - shot.x, at[1] - shot.y);
          if (gap < D && gap < nearest) {
            nearest = gap;
            hit = i;
          }
        });
        if (hit >= 0) {
          /* In front of the ball it hit, or behind it — whichever side of it the
             shot is on along the track. */
          const ahead = pointAt(head.current - (hit - 0.5) * D);
          const behind = pointAt(head.current - (hit + 0.5) * D);
          const toAhead = ahead ? Math.hypot(ahead[0] - shot.x, ahead[1] - shot.y) : Infinity;
          const toBehind = behind ? Math.hypot(behind[0] - shot.x, behind[1] - shot.y) : Infinity;
          const index = toAhead < toBehind ? hit : hit + 1;
          chain.current = [...chain.current.slice(0, index), { kind: shot.kind, chain: false }, ...chain.current.slice(index)];
          if (index === 0) head.current += D;
          /* The picture slides the shot into its slot; it changes nothing here. */
          scene.current?.joined(chain.current, index, shot.x, shot.y);
          flying.current = null;
          settle(index);
        } else if (shot.x < -0.1 || shot.x > 1.1 || shot.y < -0.1 || shot.y > ASPECT + 0.1) {
          flying.current = null;
        }
      }
    };

    const loop = (now: number) => {
      /* A long frame is not integrated in one go — a tab back from the
         background resumes where it was rather than rolling the chain home. */
      carry += Math.min(0.04, Math.max(0, (now - last) / 1000));
      last = now;
      let ended: 'cleared' | 'hole' | 'time' | null = null;
      while (carry >= ZUMA_STEP && !ended) {
        carry -= ZUMA_STEP;
        step(ZUMA_STEP);
        if (clearedRef.current >= ZUMA_CHAIN || chain.current.length === 0) ended = 'cleared';
        else if (head.current >= length) ended = 'hole';
        else if (steps.current >= lastStep) ended = 'time';
      }
      const remaining = Math.max(0, Math.ceil(ZUMA_ROUND_SECONDS - steps.current * ZUMA_STEP));
      if (remaining !== shown) {
        shown = remaining;
        setSecondsLeft(remaining);
      }

      paint();
      if (ended) {
        flying.current = null;
        setEnd(ended);
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paint, pointAt, settle, length]);

  useEffect(() => {
    if (phase !== 'over' || finished.current) return;
    const timer = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      const n = Math.min(ZUMA_CHAIN, clearedRef.current);
      const performance = Math.round((n / ZUMA_CHAIN) * 100);
      done.current(arcadePoints(performance), arcadeMilestones(performance), n >= ZUMA_CHAIN, n, { cleared: n });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const field = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: ((event.clientY - box.top) / box.height) * ASPECT };
  };

  const shoot = (to: { x: number; y: number }) => {
    if (phase !== 'playing' || flying.current) return;
    const dx = to.x - SHOOTER.x;
    const dy = to.y - SHOOTER.y;
    const span = Math.hypot(dx, dy) || 1;
    flying.current = { x: SHOOTER.x, y: SHOOTER.y, vx: (dx / span) * SHOT_SPEED, vy: (dy / span) * SHOT_SPEED, kind: loaded.current[0] };
    shotIndex.current += 1;
    loaded.current = [loaded.current[1], shots.current[(shotIndex.current + 1) % shots.current.length] ?? 0];
    setNext(loaded.current);
  };

  const swap = () => {
    if (phase !== 'playing') return;
    loaded.current = [loaded.current[1], loaded.current[0]];
    setNext(loaded.current);
    paint();
  };

  return (
    <div className="round ar-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.zuma.cleared, { n: String(cleared), total: String(ZUMA_CHAIN) })}</span>
        <RoundClock left={secondsLeft} />
      </div>
      <PerfectBar performance={(cleared / ZUMA_CHAIN) * 100} label={copy.perfectProgress} />

      <div className="ar-field ar-tall">
        <canvas
          ref={canvas}
          className="ar-canvas"
          role="img"
          aria-label={copy.zuma.fieldLabel}
          onPointerMove={(event) => {
            aimAt.current = field(event);
            if (phase !== 'playing') paint();
          }}
          onPointerUp={(event) => {
            aimAt.current = field(event);
            shoot(aimAt.current);
          }}
        />
        {phase === 'ready' && <ReadyVeil intro={copy.zuma.intro} start={copy.zuma.start} onStart={() => setPhase('playing')} />}
        {phase === 'over' && (
          <EndVeil
            title={end === 'cleared' ? copy.zuma.won : end === 'time' ? copy.roundTime : copy.zuma.over}
            detail={fill(copy.zuma.cleared, { n: String(cleared), total: String(ZUMA_CHAIN) })}
            pose={end === 'cleared' ? 'happy' : end === 'hole' ? 'sad' : cleared * 2 >= ZUMA_CHAIN ? 'happy' : 'idle'}
          />
        )}
      </div>

      <div className="ar-acts">
        {/* The ball in hand and the next one, swappable — the one decision the
            original gives a player besides where to aim. The kind is named for
            a screen reader, since the mark that tells them apart is drawn. */}
        <button type="button" className="btn btn-ghost" onClick={swap} disabled={phase !== 'playing'}>
          {fill(copy.zuma.swap, { now: copy.zuma.kinds[next[0] % ZUMA_COLORS], next: copy.zuma.kinds[next[1] % ZUMA_COLORS] })}
        </button>
        {/* Off once the round is over: it is being banked (see Snake). */}
        <button type="button" className="link-btn round-quit" onClick={onQuit} disabled={phase === 'over'}>
          {copy.quit}
        </button>
      </div>
    </div>
  );
}
