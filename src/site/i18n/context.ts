/**
 * Language context, the dictionaries, and the hooks that read them.
 *
 * Split from the provider component so the module exports no components — a
 * file mixing the two breaks React fast refresh.
 */
import { createContext, useContext } from 'react';
import { en, type Dictionary } from './en';
import { ru } from './ru';
import { uz } from './uz';

export type LanguageCode = 'en' | 'ru' | 'uz';

/** Ordered as the brief asks: English first, then Russian, then Uzbek. */
export const LANGUAGES: Record<LanguageCode, Dictionary> = { en, ru, uz };
export const LANGUAGE_ORDER: LanguageCode[] = ['en', 'ru', 'uz'];

export interface LanguageValue {
  language: LanguageCode;
  setLanguage: (next: LanguageCode) => void;
  copy: Dictionary;
}

export const LanguageContext = createContext<LanguageValue | null>(null);

function useLanguageContext(): LanguageValue {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }
  return value;
}

/** The active dictionary. */
export function useCopy(): Dictionary {
  return useLanguageContext().copy;
}

/** The active code plus the setter, for the switcher itself. */
export function useLanguage(): [LanguageCode, (next: LanguageCode) => void] {
  const { language, setLanguage } = useLanguageContext();
  return [language, setLanguage];
}

export type { Dictionary };
