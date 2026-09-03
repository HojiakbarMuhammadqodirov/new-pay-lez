/**
 * One write, and the three things a screen needs to know about it.
 *
 * Split from `adminControls.tsx` for the reason `theme/` and `dashboardShell.ts`
 * are split the same way: a module that exports both a hook and components
 * cannot be hot-reloaded, and the tooling says so. The rule in this repo is
 * context and hooks in a `.ts`, components in a `.tsx`.
 *
 * Deliberately not a `useApi` for writes. That hook is a *read*: it fires on
 * mount, keys on a path, and returns `loading | ready | error` because a read
 * has to distinguish "the server is not answering" from "the answer is none". A
 * write has none of those problems and one this does not: it happens because
 * somebody pressed something, it succeeds or it does not, and what follows is a
 * re-read rather than a state of its own. Modelling it as a request with a
 * lifecycle would put a second copy of the console's data in play, and the two
 * would disagree the first time a removal cascaded — which every removal here
 * does.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api/client';

/** What the strip is currently saying, if anything. */
export type Said = { tone: 'done' | 'failed'; message: string } | null;

export interface Write {
  /** The key of the action in flight, or `null`. */
  busy: string | null;
  said: Said;
  /**
   * Run one write.
   *
   * `work` resolves to the sentence to put in the strip when there is one to
   * say, and to anything at all when there is not — most callers hand over the
   * API function itself and let the row disappearing be the answer. Only a
   * `string` reaches the strip, which is what keeps `() => removeDeal(id)`
   * spellable without a wrapper that throws its result away.
   *
   * `after` is the re-read. Every caller passes one, because the server is the
   * record and this screen is a view of it.
   */
  run: (key: string, work: () => Promise<unknown>, after?: () => void) => void;
  dismiss: () => void;
}

export function useWrite(): Write {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Said>(null);

  /*
   * A write can outlive the row that started it — removing a venue unmounts the
   * card the button was on — so the resolution is dropped when this hook's owner
   * has gone. Nothing here is cancellable (the server has already acted by the
   * time the answer arrives), so the flag guards the `setState` rather than the
   * request: an aborted fetch would leave the console unsure whether the thing
   * it asked for happened, which is the one state a removal must not end in.
   *
   * **The effect sets it back to `true` on the way in, and that line is not
   * decoration.** React's StrictMode mounts, unmounts and mounts again in
   * development, so a ref initialised once at `useRef(true)` and only ever
   * cleared is `false` for the entire life of the component after that first
   * double-invoke — every write then ran, succeeded on the server, and left the
   * button saying "Working…" for ever. It cost one press on a suspend button to
   * find, and it would have done the same to any remount in production.
   */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback<Write['run']>((key, work, after) => {
    setBusy(key);
    setSaid(null);
    work().then(
      (note) => {
        if (!alive.current) return;
        setBusy(null);
        if (typeof note === 'string') setSaid({ tone: 'done', message: note });
        after?.();
      },
      (error: unknown) => {
        if (!alive.current) return;
        setBusy(null);
        setSaid({
          tone: 'failed',
          message: error instanceof ApiError ? error.message : String(error),
        });
      },
    );
  }, []);

  return { busy, said, run, dismiss: useCallback(() => setSaid(null), []) };
}
