/*
 * TEMPORARY review harness for the new cold-open — **not part of the site**.
 *
 * Vite serves `/intro-preview.html` in dev only; nothing in `src/site/` imports
 * this, and `vite build` has one entry (`index.html`), so it cannot reach a
 * bundle. Delete this file, `src/dev/` and `intro-preview.html` once the intro
 * is signed off either way.
 *
 *   /intro-preview.html              the sequence on its own, on a loop
 *   /intro-preview.html?tone=ink     …on the light theme's ground
 *   /intro-preview.html?strip=1      …captured as a filmstrip of stills
 *
 * The loop is the point: the real screen is `oncePerSession`, so a reload will
 * not replay it, and a sequence you can only watch once is a sequence you
 * cannot judge.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SquawkIntro } from '../components/SquawkIntro';
import { SQUAWK } from '../components/SquawkIntro/config';

const params = new URLSearchParams(location.search);
const tone = params.get('tone') === 'ink' ? 'ink' : 'glow';
const primary = tone === 'ink' ? '#089b99' : '#58e9d4';
const background = tone === 'ink' ? '#f7f9f9' : '#0d0d0e';
const onPrimary = tone === 'ink' ? '#04201f' : '#05201c';

document.body.style.background = background;

function Loop() {
  const [run, setRun] = useState(0);
  useEffect(() => {
    /* A beat of the bare ground between runs, so the end and the next start do
       not read as one continuous thing. */
    const id = window.setTimeout(() => setRun((n) => n + 1), SQUAWK.duration + 700);
    return () => window.clearTimeout(id);
  }, [run]);
  return (
    <SquawkIntro
      key={run}
      primaryColor={primary}
      backgroundColor={background}
      onPrimaryColor={onPrimary}
      tone={tone}
      skippable={false}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Loop />
  </StrictMode>,
);

/* ── the filmstrip ────────────────────────────────────────────────────────── */

if (params.has('strip')) {
  const shots: { t: number; url: string }[] = [];
  const every = Number(params.get('every') ?? 145);
  const until = Number(params.get('until') ?? 3000);
  /* Sample the whole run, keep only the window asked for — the sequence's own
     clock starts later than this harness's, so an interesting moment is not
     where its timestamp says it is. */
  const from = Number(params.get('from') ?? 0);
  let started = -1;

  const crop = document.createElement('canvas');
  crop.width = Math.min(560, window.innerWidth);
  crop.height = 300;
  const cctx = crop.getContext('2d')!;

  const render = () => {
    document.body.innerHTML = '';
    document.body.style.background = background;
    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${
      params.get('cols') ?? 5
    },1fr);gap:4px;padding:6px;font:600 13px system-ui;color:${primary}`;
    for (const s of shots) {
      const cell = document.createElement('div');
      cell.style.cssText = 'position:relative;border:1px solid rgba(128,128,128,.35)';
      const img = document.createElement('img');
      img.src = s.url;
      img.style.cssText = 'display:block;width:100%';
      const tag = document.createElement('span');
      tag.textContent = `${s.t}ms`;
      tag.style.cssText = 'position:absolute;left:4px;top:2px;text-shadow:0 0 4px #000';
      cell.append(img, tag);
      grid.append(cell);
    }
    document.body.append(grid);
  };

  const tick = () => {
    try {
      const canvas = document.querySelector<HTMLCanvasElement>('.sq-canvas');
      if (started < 0) {
        if (!canvas) return;
        started = performance.now();
      }
      const t = performance.now() - started;
      if (canvas) {
        const dpr = canvas.width / window.innerWidth;
        const sx = (window.innerWidth / 2 - crop.width / 2) * dpr;
        const sy = (window.innerHeight * 0.46 - 150) * dpr;
        cctx.fillStyle = background;
        cctx.fillRect(0, 0, crop.width, crop.height);
        cctx.drawImage(canvas, sx, sy, crop.width * dpr, 300 * dpr, 0, 0, crop.width, 300);
        if (t >= from) shots.push({ t: Math.round(t), url: crop.toDataURL('image/png') });
      }
      /* Checked whether or not the canvas is still there: the overlay unmounts
         at the end of the sequence, and an end condition sitting behind the
         capture never runs. */
      if (t >= until) {
        window.clearInterval(timer);
        render();
      }
    } catch (err) {
      window.clearInterval(timer);
      console.error('TICKFAIL', err);
    }
  };

  const timer = window.setInterval(tick, every);
}
