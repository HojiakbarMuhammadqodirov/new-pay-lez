import { Icon } from './icons';
import { useCopy } from './i18n/context';

/**
 * The AI assistant, as a floating action button.
 *
 * It was a nav item, but it is a tool rather than a destination — nothing on
 * the page to scroll to — so it belongs pinned in the corner where it is
 * reachable from anywhere on the page instead of only from the top.
 *
 * Icon only: the accessible name carries the label, so it stays a circle at
 * every language without the copy changing its width.
 */
export function AssistantButton() {
  const copy = useCopy();

  return (
    <button type="button" className="assistant-fab" aria-label={copy.assistant}>
      <Icon name="bot" size={24} strokeWidth={1.9} />
    </button>
  );
}
