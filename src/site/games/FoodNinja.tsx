import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { useTheme } from '../theme/context';
import { ninjaMilestones, ninjaPoints, NINJA_PERFECT, NINJA_PER_FOOD } from '../auth/player';
import { EndVeil, PerfectBar, ReadyVeil } from './hud';
import { sendMove } from '../api/consumer';
import { DURATION_MS, MAX_PER_SWIPE, RADIUS, localRng, positionAt, schedule, type Flyer } from './ninjaField';
import { NinjaScene, type NinjaView } from './ninja/scene';

/**
 * Food Ninja — called **Pico Ninja** on screen, the app's name for it: foods
 * are thrown up from the bottom of the field; swipe through them to slice them.
 * Sixty seconds, no bombs, and the waves grow and quicken as the round goes on.
 * Scored per food (see `ninjaField.ts` and the rulebook map in
 * `server/config.ts`). The id stays `ninja`, and the server's game type
 * `food_ninja`; only the name a player reads changed.
 *
 * **No bombs here, on purpose.** The app deals a few bombs of its own that stun
 * the blade; the server's round has none, and a bomb is a rule, not a picture.
 * Adding them would change what a round can score, so the web round stays the
 * server's round exactly.
 *
 * ## The server's round, drawn here
 *
 * With a `session` the schedule — every food, when it is thrown, from where and
 * how high — is the server's (`content.flyers`); this screen only moves the foods
 * along it. When the player presses Start, a `start` event stamps the server's
 * clock, and every stroke of the blade that cuts something sends the ids it cut
 * as a `slice` event **at once**. The server credits each one only while that
 * food is really in the air by its own clock, once, and never more than a
 * swipe can cut; the finish is scored on what it credited. The count on screen
 * is this screen's own, for immediate feedback — the result card names the
 * server's.
 *
 * At once, and not when the finger lifts, which is how it was: a cut is only
 * credited inside its food's flight plus 1.5 s, so a swipe held for a few
 * seconds — one long drag across several waves — reported its first foods after
 * their window had shut, and the server rightly refused them. The count on
 * screen and the count on the result card then disagreed for an honest player,
 * and a drag still held when the clock ran out never reported at all.
 *
 * Without one the screen throws its own round with `localRng`: the demo
 * accounts and a dead backend, paid into the local mirror and not ranked.
 *
 * ## Per frame, nothing goes through React
 *
 * The root `CLAUDE.md`'s load-bearing rule. The foods, the blade and the halves
 * of a sliced food live in refs and are drawn in one `requestAnimationFrame`
 * loop; React state changes only when the count or the whole second on the clock
 * does.
 *
 * ## The picture is `ninja/scene.ts`
 *
 * The night market, Pico in his headband, the foods drawn in his flat style
 * and cut in two, the juice, the blade — all of it is the scene's, painted
 * from the refs below and writing none of them. It notices a cut by finding a
 * new entry in `halves`, which the cut already pushed; nothing in the cut, the
 * schedule or the reporting knows the scene exists.
 */

/**
 * How long a cut stays in `halves`. The scene finds new cuts there and draws
 * the halves itself, for as long as it likes; this only keeps the list short.
 */
const HALVES_MS = 600;
/** How long a point of the blade trail lasts. */
const TRAIL_MS = 140;
/** A beat after the clock runs out before the result card. */
const END_MS = 900;

interface Slice {
  flyer: Flyer;
  at: number;
  x: number;
  y: number;
}

/** Whether the segment p→q passes within `r` of the point c. All in pixels. */
function crosses(px: number, py: number, qx: number, qy: number, cx: number, cy: number, r: number): boolean {
  const dx = qx - px;
  const dy = qy - py;
  const length = dx * dx + dy * dy;
  const k = length === 0 ? 0 : Math.max(0, Math.min(1, ((cx - px) * dx + (cy - py) * dy) / length));
  const ex = px + k * dx - cx;
  const ey = py + k * dy - cy;
  return ex * ex + ey * ey <= r * r;
}

export function FoodNinja({
  session,
  serverRound,
  onDone,
  onQuit,
}: {
  /** The server round in flight. Absent for a round this file throws itself. */
  session?: string;
  /** What `/v1/games/sessions` threw. Arrives with `session`. */
  serverRound?: { flyers: Flyer[]; durationMs?: number };
  /** Points (local reckoning), fifths of a perfect round, a perfect round, foods sliced. */
  onDone: (points: number, correct: number, won: boolean, sliced: number) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const remote = session && Array.isArray(serverRound?.flyers) ? session : null;
  const duration = (remote && serverRound?.durationMs) || DURATION_MS;

  const flyers = useRef<Flyer[]>(remote ? serverRound!.flyers : schedule(localRng));
  const [phase, setPhase] = useState<'ready' | 'starting' | 'playing' | 'over'>('ready');
  const [count, setCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(duration / 1000));
  const [failed, setFailed] = useState(false);

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const startedAt = useRef(0);
  const sliced = useRef(new Set<number>());
  const halves = useRef<Slice[]>([]);
  const trail = useRef<Array<{ x: number; y: number; at: number }>>([]);
  const seq = useRef(0);
  const confirmed = useRef(0);
  const inFlight = useRef<Promise<unknown>[]>([]);
  const finished = useRef(false);
  /* The picture: built once, reading the refs above and writing none of them. */
  const scene = useRef<NinjaScene | null>(null);
  if (!scene.current) scene.current = new NinjaScene();
  const view = useRef<NinjaView>({
    flyers: flyers.current,
    sliced: sliced.current,
    cuts: halves.current,
    trail: trail.current,
    trailMs: TRAIL_MS,
    ms: -1,
    phase: 'ready',
  });
  /* The round's clock as last drawn, so the end veil's field holds still. */
  const lastMs = useRef(-1);
  const shownPhase = useRef(phase);
  shownPhase.current = phase;
  /* A fresh `onDone` arrives with every parent render; the banking timer must
     not be re-armed by each one. */
  const done = useRef(onDone);
  done.current = onDone;

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* Send what one stroke of the blade cut. More than the server believes a
     swipe can cut is sent as consecutive events — rare, and every id is still
     checked against the schedule. */
  const report = useCallback(
    (ids: number[]) => {
      if (!remote || ids.length === 0) return;
      for (let i = 0; i < ids.length; i += MAX_PER_SWIPE) {
        const chunk = ids.slice(i, i + MAX_PER_SWIPE);
        const request = sendMove(remote, seq.current++, { ids: chunk }, 'slice')
          .then((reply) => {
            const view = reply.ninja as { sliced?: number } | undefined;
            if (typeof view?.sliced === 'number') confirmed.current = Math.max(confirmed.current, view.sliced);
          })
          .catch(() => {
            if (alive.current) setFailed(true);
          });
        inFlight.current.push(request);
      }
    },
    [remote],
  );

  const begin = useCallback(() => {
    if (phase !== 'ready') return;
    setFailed(false);
    const go = () => {
      if (!alive.current) return;
      startedAt.current = performance.now();
      setPhase('playing');
    };
    if (!remote) {
      go();
      return;
    }
    /* The server's clock starts with this event; the screen's starts when the
       reply lands, so a slow request makes the server's window early rather
       than late — the direction its slack covers. */
    setPhase('starting');
    sendMove(remote, seq.current++, {}, 'start')
      .then(go)
      .catch(() => {
        if (!alive.current) return;
        setFailed(true);
        setPhase('ready');
      });
  }, [phase, remote]);

  /** One frame of the picture, from the refs as they stand, at the round's `ms`. */
  const paint = useCallback((ms: number, now: number) => {
    const element = canvas.current;
    const picture = scene.current;
    if (!element || !picture) return;
    const v = view.current;
    v.flyers = flyers.current;
    v.sliced = sliced.current;
    v.cuts = halves.current;
    v.trail = trail.current;
    v.ms = ms;
    v.phase = shownPhase.current;
    picture.paint(element, v, now);
  }, []);

  /* The theme, motion preference and the words the picture draws. */
  useEffect(() => {
    const picture = scene.current;
    if (!picture) return;
    picture.setTheme(theme);
    picture.setReduced(reduced);
    const face = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
    picture.setText(face, copy.ninja.combo);
    paint(lastMs.current, performance.now());
  }, [theme, reduced, copy.ninja.combo, paint]);

  /* Outside a round the market still lives — lanterns swinging, embers or
     petals, Pico blinking, the last halves falling away — on a loop of its own
     that touches nothing the round owns. Under reduced motion, once. */
  useEffect(() => {
    if (phase === 'playing') return;
    if (reduced) {
      paint(lastMs.current, performance.now());
      return;
    }
    let frame = 0;
    const loop = () => {
      paint(lastMs.current, performance.now());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, reduced, paint]);

  /* The loop: move, draw, and end the round on the clock. */
  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let shownSecond = -1;
    const draw = () => {
      const element = canvas.current;
      if (!element) return;
      const context = element.getContext('2d');
      if (!context) return;

      const now = performance.now();
      const ms = now - startedAt.current;
      const left = Math.max(0, Math.ceil((duration - ms) / 1000));
      if (left !== shownSecond) {
        shownSecond = left;
        setSecondsLeft(left);
      }

      /* The rules' two lists, pruned as they always were — the trail's age is
         what ends a stroke, so this filter is part of the cut, not the art. */
      halves.current = halves.current.filter((half) => now - half.at < HALVES_MS);
      trail.current = trail.current.filter((point) => now - point.at < TRAIL_MS);

      lastMs.current = ms;
      paint(ms, now);

      if (ms >= duration) {
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [phase, duration, paint]);

  /* Over: wait for any slice still on its way, then bank. */
  useEffect(() => {
    if (phase !== 'over' || finished.current) return;
    const local = sliced.current.size;
    const timer = window.setTimeout(() => {
      void Promise.allSettled(inFlight.current).then(() => {
        if (finished.current || !alive.current) return;
        finished.current = true;
        const shown = remote ? confirmed.current : local;
        done.current(ninjaPoints(local), ninjaMilestones(local), local >= NINJA_PERFECT, shown);
      });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase, remote]);

  /* The swipe: every pointer move is a segment of the blade, tested against
     every food in the air at this instant. */
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const cut = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'playing') return;
    const { x, y } = point(event);
    const now = performance.now();
    const last = trail.current[trail.current.length - 1];
    trail.current.push({ x, y, at: now });
    if (!last) return;
    const width = event.currentTarget.clientWidth;
    const height = event.currentTarget.clientHeight;
    const ms = now - startedAt.current;
    const radius = RADIUS * width;
    const cutNow: number[] = [];
    for (const flyer of flyers.current) {
      if (sliced.current.has(flyer.id)) continue;
      const at = positionAt(flyer, ms);
      if (!at) continue;
      const cx = at.x * width;
      const cy = height - at.y * height;
      if (!crosses(last.x, last.y, x, y, cx, cy, radius)) continue;
      sliced.current.add(flyer.id);
      halves.current.push({ flyer, at: now, x: cx, y: cy });
      cutNow.push(flyer.id);
    }
    if (cutNow.length > 0) {
      setCount(sliced.current.size);
      /* Sent now, while the food is still inside its window on the server's
         clock — see the header. */
      report(cutNow);
    }
  };

  const release = () => {
    trail.current = [];
  };

  return (
    <div className="round nj-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.ninja.sliced, { n: `${count} / ${NINJA_PERFECT}` })}</span>
        <span className="round-clock" role="timer">
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </span>
      </div>
      <PerfectBar performance={count * NINJA_PER_FOOD} label={copy.perfectProgress} />

      <div className="nj-field">
        <canvas
          ref={canvas}
          className="nj-canvas"
          aria-label={copy.ninja.fieldLabel}
          onPointerDown={(event) => {
            if (phase !== 'playing') return;
            event.currentTarget.setPointerCapture(event.pointerId);
            trail.current = [{ ...point(event), at: performance.now() }];
          }}
          onPointerMove={(event) => {
            if (event.buttons === 0 && event.pointerType === 'mouse') return;
            cut(event);
          }}
          onPointerUp={release}
          onPointerCancel={release}
        />
        {/* While the start event is on its way the press says so; `begin`
            ignores a second press, so it cannot start the round twice. */}
        {(phase === 'ready' || phase === 'starting') && (
          <ReadyVeil intro={copy.ninja.intro} start={phase === 'starting' ? copy.loading : copy.ninja.start} onStart={begin} />
        )}
        {phase === 'over' && (
          <EndVeil
            title={copy.ninja.over}
            detail={fill(copy.ninja.sliced, { n: `${count} / ${NINJA_PERFECT}` })}
            pose={count * 2 >= NINJA_PERFECT ? 'happy' : 'idle'}
          />
        )}
      </div>

      {failed && <p className="field-error" role="alert">{copy.ninja.failed}</p>}

      {/* Off once the round is over: it is being banked (see Snake). */}
      <button type="button" className="link-btn round-quit" onClick={onQuit} disabled={phase === 'over'}>
        {copy.quit}
      </button>
    </div>
  );
}
