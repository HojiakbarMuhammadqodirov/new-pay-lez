import { memo, useMemo, useRef, type RefObject } from 'react';
import { useTheme } from '../../theme/context';
import { Diorama } from '../diorama';
import { STAGE_PALETTE, type StageMotif } from './config';
import { measureHost, stagePainter, type StageCue, type StageLook, type StageMood } from './paint';

/**
 * The set behind a round — a quiz's world, or the result card's podium.
 *
 * A `Diorama` (the board games' room canvas, so every game screen is painted
 * by one construction) filling its `root` from edge to edge, under the round's
 * markup. Mount it as the **first child** of a `.round` that carries
 * `data-stage` — the class that turns the glass card into a framed set
 * (`══ the round stage ══` in `site.css`).
 *
 * `host` is the element Pico stands in. The set measures it when it repaints
 * its still, so the spotlight, the podium and the sparks of a right answer sit
 * on the bird wherever the layout put him. `cue` and `mood` are refs, read by
 * the painter as it paints: a verdict reaches the canvas without a render.
 */
export const StageScene = memo(function StageScene({
  motif,
  root,
  host,
  cue,
  mood,
  country,
}: {
  motif: StageMotif;
  root: RefObject<HTMLElement | null>;
  host: RefObject<HTMLElement | null>;
  cue?: { current: StageCue };
  mood?: { current: StageMood };
  country?: string;
}) {
  const { theme } = useTheme();
  const look = useMemo<StageLook>(() => {
    const tone = theme === 'light' ? 'ink' : 'glow';
    return { pal: STAGE_PALETTE[tone], tone };
  }, [theme]);

  /* The last measurement, so the live layer can ask without forcing a layout. */
  const last = useRef<ReturnType<typeof measureHost>>(null);
  const painter = useMemo(
    () =>
      stagePainter(motif, {
        anchor: (fresh) => {
          if (fresh || !last.current) last.current = measureHost(root.current, host.current);
          return last.current;
        },
        cue,
        mood,
        country,
      }),
    [motif, root, host, cue, mood, country],
  );

  return <Diorama painter={painter} palette={look} className="stage-set" />;
});
