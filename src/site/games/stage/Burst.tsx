import { memo, useLayoutEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from '../../../components/GlobeHero/hooks/useReducedMotion';
import { PICO_BRAND } from '../../pico';
import { useTheme } from '../../theme/context';
import { BURST, STAGE_PALETTE } from './config';
import { measureHost } from './paint';

/**
 * The celebration on the result card, fired once: confetti for a perfect round,
 * a puff of Pico's own feathers for a good one.
 *
 * Its own canvas and its own short `requestAnimationFrame` loop rather than the
 * set's: the set runs at half rate for ever, and a burst is two seconds at full
 * rate and then nothing — the loop stops and the canvas is cleared, so a card
 * left open costs nothing after the confetti has landed. Nothing in it touches
 * React state.
 *
 * Under `prefers-reduced-motion` it draws nothing at all. A celebration is the
 * definition of motion nobody asked for; Pico's pose and the gold rays behind
 * him still say "perfect" without it.
 *
 * Confetti takes the set's festive hues; feathers take Pico's, read from
 * `PICO_BRAND` rather than restated — they are the bird's, which is the one
 * place his palette may be spent outside his drawing.
 */
export const Burst = memo(function Burst({
  kind,
  root,
  host,
}: {
  kind: 'confetti' | 'puff';
  root: RefObject<HTMLElement | null>;
  host: RefObject<HTMLElement | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const { theme } = useTheme();

  useLayoutEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || reduced) return;

    const spec = BURST[kind];
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!(w > 0 && h > 0)) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(w * ratio);
    el.height = Math.round(h * ratio);

    const at = measureHost(root.current, host.current) ?? { x: w / 2, y: h * 0.3, size: 100 };
    const pal = STAGE_PALETTE[theme === 'light' ? 'ink' : 'glow'];
    const confetti = [...pal.hues, pal.warm, pal.accent];
    const plumage = [PICO_BRAND.body, PICO_BRAND.wing, PICO_BRAND.shade, PICO_BRAND.accent];

    interface Bit {
      x: number;
      y: number;
      vx: number;
      vy: number;
      spin: number;
      turn: number;
      size: number;
      colour: string;
      feather: boolean;
      sway: number;
    }
    const bits: Bit[] = [];
    const add = (feather: boolean, i: number) => {
      const spread = Math.PI * spec.spread;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const speed = feather ? 120 + Math.random() * 200 : 380 + Math.random() * 520;
      bits.push({
        x: at.x + (Math.random() - 0.5) * at.size * 0.4,
        y: at.y - at.size * (feather ? 0.05 : 0.15),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: Math.random() * Math.PI * 2,
        turn: (Math.random() - 0.5) * (feather ? 3 : 14),
        size: feather ? 9 + Math.random() * 6 : 5 + Math.random() * 5,
        colour: feather ? plumage[i % plumage.length] : confetti[i % confetti.length],
        feather,
        sway: Math.random() * Math.PI * 2,
      });
    };
    for (let i = 0; i < spec.count; i++) add(false, i);
    for (let i = 0; i < spec.feathers; i++) add(true, i);

    const born = performance.now();
    let last = born;
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const age = now - born;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (age >= spec.ms) return;
      const fade = Math.min(1, (spec.ms - age) / (spec.ms * 0.3));
      for (const b of bits) {
        if (b.feather) {
          /* Feathers float: heavy drag, light gravity, a side-to-side rock. */
          b.vx *= 1 - 2.4 * dt;
          b.vy = b.vy * (1 - 2.4 * dt) + spec.gravity * 0.35 * dt;
          b.x += (b.vx + Math.sin(age / 260 + b.sway) * 26) * dt;
        } else {
          b.vx *= 1 - 1.1 * dt;
          b.vy = b.vy * (1 - 1.1 * dt) + spec.gravity * dt;
          b.x += b.vx * dt;
        }
        b.y += b.vy * dt;
        b.spin += b.turn * dt;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.globalAlpha = fade;
        ctx.fillStyle = b.colour;
        if (b.feather) {
          ctx.rotate(Math.sin(age / 300 + b.sway) * 0.7 + b.spin * 0.2);
          ctx.beginPath();
          ctx.ellipse(0, 0, b.size * 0.32, b.size, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = fade * 0.45;
          ctx.fillStyle = PICO_BRAND.wingTip;
          ctx.fillRect(-0.6, -b.size * 0.9, 1.2, b.size * 1.8);
        } else {
          /* A flake turning over: its height follows the cosine of its spin. */
          ctx.rotate(b.spin);
          ctx.scale(1, Math.cos(b.spin * 1.7));
          ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
    };
  }, [kind, reduced, theme, root, host]);

  if (reduced) return null;
  return <canvas ref={canvas} className="stage-burst" aria-hidden />;
});
