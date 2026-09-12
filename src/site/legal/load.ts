/**
 * Fetching one language's legal text, once.
 *
 * Each language is its own chunk, so a reader downloads the two documents in
 * the one language they are reading and nothing else. The promise is cached
 * per language because `use()` needs the *same* promise on every render — a
 * fresh `import()` per render would suspend forever — and it is stamped with
 * React's `status`/`value` fields when it settles, so a render after it has
 * arrived reads the text synchronously instead of suspending for a microtask.
 */
import type { LanguageCode } from '../i18n/context';
import type { LegalText } from './parts';

type Tracked = Promise<LegalText> & { status?: 'fulfilled'; value?: LegalText };

/**
 * Exported so `verify` can walk the real table rather than a second copy of it.
 * A language added here is a language that check covers, which is the point —
 * the alternative is a list in the test that agrees with this one until the day
 * it does not.
 */
export const LOADERS: Record<LanguageCode, () => Promise<{ default: LegalText }>> = {
  en: () => import('./en'),
  pl: () => import('./pl'),
  uz: () => import('./uz'),
  ru: () => import('./ru'),
  uk: () => import('./uk'),
};

const pending = new Map<LanguageCode, Tracked>();

export function legalText(language: LanguageCode): Promise<LegalText> {
  const cached = pending.get(language);
  if (cached) return cached;

  const next: Tracked = LOADERS[language]().then((module) => module.default);
  next.then(
    (value) => {
      next.status = 'fulfilled';
      next.value = value;
    },
    /* A failed fetch — offline, or a chunk a deploy has since replaced — is not
       cached, so the next render asks again instead of rethrowing a stale
       failure for the rest of the tab's life. The rejection itself still
       reaches `use()` and the error boundary. */
    () => pending.delete(language),
  );
  pending.set(language, next);
  return next;
}
