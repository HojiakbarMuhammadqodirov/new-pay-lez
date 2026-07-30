import { useSyncExternalStore } from 'react';
import type { FocusedCountry } from '../types';

/**
 * A one-value external store.
 *
 * The centred-country test runs inside the render loop; routing it through
 * React state would re-render the whole Canvas subtree several times a second.
 * Instead the 3D layer writes here and only the HTML overlay subscribes, so a
 * country change costs exactly one small DOM re-render and zero 3D work.
 */
export interface FocusStore {
  get(): FocusedCountry | null;
  set(next: FocusedCountry | null): void;
  subscribe(listener: () => void): () => void;
}

export function createFocusStore(): FocusStore {
  let value: FocusedCountry | null = null;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set(next) {
      if (next?.id === value?.id) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useFocusedCountry(store: FocusStore): FocusedCountry | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
