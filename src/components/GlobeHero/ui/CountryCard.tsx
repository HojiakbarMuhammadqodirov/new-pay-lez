import { memo, useEffect, useRef, useState } from 'react';
import { UI } from '../config';
import { flagEmoji } from '../geo/countryCodes';
import { useFocusedCountry, type FocusStore } from '../state/focusStore';
import type { FocusedCountry } from '../types';
import './CountryCard.css';

type CardState = 'enter' | 'active' | 'exit';
type Side = 'left' | 'right';

interface Card {
  key: string;
  country: FocusedCountry;
  side: Side;
  state: CardState;
}

interface CountryCardProps {
  store: FocusStore;
}

/**
 * The country reveal: flag above, country name beneath, popping in at the side
 * of the globe.
 *
 * Sides alternate at random per reveal, so a run of countries does not march
 * up one edge. Cards are kept in a short list rather than swapped in place so
 * an outgoing country can finish leaving while the next is already arriving —
 * with reveals landing a few hundred milliseconds apart, a hard cut would read
 * as a flicker.
 */
export const CountryCard = memo(function CountryCard({ store }: CountryCardProps) {
  const focused = useFocusedCountry(store);
  const [cards, setCards] = useState<Card[]>([]);
  const sequence = useRef(0);

  // Focus changed: retire everything on screen, then stage the newcomer.
  useEffect(() => {
    setCards((previous) => {
      const retired = previous.map((card) =>
        card.state === 'exit' ? card : { ...card, state: 'exit' as const },
      );
      if (!focused) return retired;

      sequence.current += 1;
      return [
        ...retired,
        {
          key: `${focused.id}:${sequence.current}`,
          country: focused,
          side: Math.random() < 0.5 ? 'left' : 'right',
          state: 'enter',
        },
      ];
    });
  }, [focused]);

  // Promote staged cards on the next frame so the browser sees a real
  // start -> end transition rather than a single committed style.
  useEffect(() => {
    if (!cards.some((card) => card.state === 'enter')) return;
    const frame = requestAnimationFrame(() => {
      setCards((previous) =>
        previous.map((card) =>
          card.state === 'enter' ? { ...card, state: 'active' } : card,
        ),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [cards]);

  // Unmount retired cards once their exit has played out.
  useEffect(() => {
    if (!cards.some((card) => card.state === 'exit')) return;
    const timer = window.setTimeout(() => {
      setCards((previous) => previous.filter((card) => card.state !== 'exit'));
    }, UI.transitionMs);
    return () => window.clearTimeout(timer);
  }, [cards]);

  return (
    <div className="gh-label" aria-live="polite" aria-atomic="true">
      {cards.map((card) => {
        const flag = flagEmoji(card.country.iso2);
        return (
          <div
            key={card.key}
            className="gh-card"
            data-state={card.state}
            data-side={card.side}
          >
            {flag && (
              <span className="gh-flag" data-render={UI.flagRendering} aria-hidden>
                {flag}
              </span>
            )}
            <span className="gh-name">{card.country.name}</span>
          </div>
        );
      })}
    </div>
  );
});
