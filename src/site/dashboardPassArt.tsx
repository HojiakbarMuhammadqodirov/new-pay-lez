/**
 * The pass's art header and its status pill — the two pieces the list card,
 * the detail hero and the drawer's preview all draw, so they are drawn once.
 *
 * The accent arrives from the server as a **key** (`teal`, `purple`…), never a
 * hex: the palette is the screen's to apply, and it applies it through the
 * `--dx-pass-*` tokens in `dashboard.css`, one per key and theme. `data-accent`
 * is the whole of the mapping, so an accent the stylesheet does not know falls
 * back to the default rule rather than to a colour typed here.
 */
import type { ReactNode } from 'react';

import type { PassAccent, PassStatus } from './api/passes';
import { useCopy } from './i18n/context';

/**
 * The state as the art header writes it. `soldOut` is a *flag* on a live pass,
 * not a status, so it is folded here — and only here — into the one word the
 * card shows.
 */
export function PassPill({ status, soldOut }: { status: PassStatus; soldOut: boolean }) {
  const copy = useCopy().dashboard.passes.status;
  const state = status === 'live' && soldOut ? 'soldOut' : status;
  return (
    <span className="dx-passes-pill" data-state={state}>
      {copy[state]}
    </span>
  );
}

export function PassArt({
  accent,
  kicker,
  badge,
  name,
  tagline,
  price,
  period,
  size = 'card',
}: {
  accent: PassAccent;
  kicker: ReactNode;
  badge: ReactNode;
  name: ReactNode;
  tagline: ReactNode;
  price: ReactNode;
  period: ReactNode;
  size?: 'card' | 'preview';
}) {
  return (
    <div className="dx-passes-art" data-accent={accent} data-size={size}>
      <div className="dx-passes-art-top">
        <span className="dx-passes-art-kicker">{kicker}</span>
        {badge}
      </div>
      <div>
        <div className="dx-passes-art-name">{name}</div>
        {tagline ? <div className="dx-passes-art-tag">{tagline}</div> : null}
      </div>
      <div className="dx-passes-art-price">
        <b>{price}</b>
        <span>{period}</span>
      </div>
    </div>
  );
}
