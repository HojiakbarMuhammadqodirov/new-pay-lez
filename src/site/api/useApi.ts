/**
 * `useApi` — one request, three states, and no invented numbers.
 *
 * Deliberately small. There is no cache, no revalidation and no dependency on a
 * data library, because the only caller is the operator's console: a handful of
 * reads, refreshed when somebody presses refresh. Anything more would be a
 * runtime dependency for a screen three people see.
 *
 * The state is a discriminated union rather than `{ data, error, loading }` with
 * all three optional, because the console has to render a *different panel* for
 * "not connected" than for "connected, and the answer is zero" — and a shape
 * that lets both be true at once is how those two get confused.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError, call } from './client';

export type ApiState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: ApiError };

export interface ApiResult<T> {
  state: ApiState<T>;
  reload: () => void;
}

export function useApi<T>(path: string | null, deps: readonly unknown[] = []): ApiResult<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) return;
    /* Aborted on unmount and on every re-run, so a slow first request cannot
       land after a fast second one and show the older answer. */
    const controller = new AbortController();
    setState({ status: 'loading' });

    call<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          error:
            error instanceof ApiError ? error : new ApiError(0, 'unknown', String(error)),
        });
      });

    return () => controller.abort();
    /* `path` and the caller's own deps. Spreading is what lets a caller key a
       request on a date range without this hook knowing what one is. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return { state, reload };
}
