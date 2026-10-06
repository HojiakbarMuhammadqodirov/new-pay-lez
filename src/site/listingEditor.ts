import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';

import { BUSINESS_CATEGORIES } from './content';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import { blankBusiness, isEmail, type BusinessProfile, type SpokenLanguage } from './auth/business';
import { navigate } from './router';
import { LOGO_PX, toSquareDataUrl } from './imageFile';
import { hasToken } from './api/client';
import { businessFromSource, saveOwnListing, type ListingSource } from './api/listing';

/**
 * The listing form's behaviour, without its markup.
 *
 * Two forms draw the listing — `#/business/setup` (`businessSetup.tsx`, the
 * site's field kit) and the partner dashboard's Business profile
 * (`dashboardProfile.tsx`, v3's kit) — and they must not disagree about what a
 * listing *is*: which submissions are refused, what is saved locally first,
 * what is sent to the server and what is folded back. So the draft, the
 * validation and the write live here once, and each form is only a picture of
 * them. A second copy of `onSubmit` in the dashboard would have been the first
 * place the two drifted — the setup form's city rule, say, quietly missing from
 * the other door.
 *
 * Hooks and pure helpers only, so React fast refresh keeps working in both
 * component modules (`react(only-export-components)`).
 */

/** What a save ended as, for the screen that has to say so. */
export type ListingFlash = 'saved' | 'device';

type UnmappedKey = keyof NonNullable<BusinessProfile['unmapped']>;

/** The server's words for a field, forgotten once the owner has chosen from the list. */
export function without(
  unmapped: BusinessProfile['unmapped'],
  ...keys: UnmappedKey[]
): BusinessProfile['unmapped'] {
  if (!unmapped) return undefined;
  const next = { ...unmapped };
  for (const key of keys) delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function useListingEditor({
  mode,
  previous,
  initial = null,
  onSaved,
}: {
  mode: 'setup' | 'profile';
  /** The listing as last read from the server for this venue, or `null`. */
  previous: ListingSource | null;
  /**
   * What to start from when the account holds no listing of its own — the
   * dashboard's demo café under `?demo=1`. The setup form passes nothing, so it
   * starts blank exactly as it always has.
   */
  initial?: BusinessProfile | null;
  /**
   * The profile screen's way back. `created` is true when this save made the
   * venue (and so sent it for review) rather than editing one that existed.
   */
  onSaved?: (outcome: ListingFlash, source: ListingSource | null, created: boolean) => void;
}) {
  const copy = useCopy();
  const [language] = useLanguage();
  const { account, saveBusiness } = useAuth();

  const [draft, setDraft] = useState<BusinessProfile>(
    () => account?.business ?? initial ?? blankBusiness(),
  );
  const [appLinks, setAppLinks] = useState(
    () => Boolean(draft.appStore || draft.googlePlay),
  );
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const touched = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* Opened by Edit, the reader goes to the first field. Arriving on the setup
     route is a page load, and a page does not grab focus on arrival. */
  useEffect(() => {
    if (mode === 'profile') nameRef.current?.focus();
  }, [mode]);

  /*
   * Setup, when the listing turns out to exist.
   *
   * An owner can reach this route before the server's answer about their venue
   * has landed — a stored session refreshed on `#/business/setup`, a Google
   * account whose role was granted a moment ago. A draft nobody has touched is
   * replaced by the listing that arrives, so they see their venue rather than
   * a blank form they might save over it.
   */
  const held = account?.business ?? null;
  useEffect(() => {
    if (mode !== 'setup' || touched.current || !held) return;
    setDraft(held);
    setAppLinks(Boolean(held.appStore || held.googlePlay));
  }, [mode, held]);

  const serverBacked = hasToken();
  const unmapped = draft.unmapped ?? {};

  const change = (next: (current: BusinessProfile) => BusinessProfile) => {
    touched.current = true;
    setDraft(next);
    setRefusal(null);
  };

  const set = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) =>
    change((current) => ({ ...current, [key]: value }));

  const text =
    (key: keyof BusinessProfile) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, event.target.value as never);

  /**
   * The logo, as a picture rather than as a filename — `LOGO_PX` of JPEG is a
   * few kilobytes, which is what makes keeping it affordable. The input is
   * cleared first so choosing the *same* file again still fires a change.
   */
  const pickLogo = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const logo = await toSquareDataUrl(file, LOGO_PX);
    if (logo && alive.current) set('logo', logo);
  };

  const categoryIndex = useMemo(
    () => BUSINESS_CATEGORIES.findIndex((c) => c.id === draft.category),
    [draft.category],
  );

  const emailBad = draft.email.trim().length > 0 && !isEmail(draft.email);
  const nameMissing = draft.name.trim().length === 0;

  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Move the reader to the thing that stopped them. `noValidate` suppresses the
   * browser's bubbles but not the constraint API, so `:invalid` is still a live
   * answer to "which control is the problem" — restricted to real controls,
   * because `:invalid` matches `<fieldset>` too.
   */
  const showFirstProblem = () => {
    const first = formRef.current?.querySelector<HTMLElement>(
      'input:invalid, select:invalid, textarea:invalid',
    );
    (first ?? formRef.current)?.scrollIntoView({ block: 'center' });
    first?.focus();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    /*
     * Two things make a submission *wrong* rather than unfinished, and only
     * those are refused: a listing with no name is not a listing, and a
     * malformed address is a typo the owner wants to hear about now. An
     * incomplete listing saves — `setupLede` says the starred fields are needed
     * before it can go live, not before it can be saved.
     *
     * A third applies only where the save reaches the server: a venue with no
     * city is one the server will not create and a customer could not find.
     */
    if (nameMissing || emailBad) {
      showFirstProblem();
      return;
    }
    if (serverBacked && !draft.city.trim()) {
      cityRef.current?.scrollIntoView({ block: 'center' });
      cityRef.current?.focus();
      return;
    }

    /* Locally first and unconditionally: the listing is this owner's own record
       and must survive a server that is not answering. */
    touched.current = true;
    saveBusiness(draft);
    setBusy(true);
    setRefusal(null);

    const outcome = await saveOwnListing(draft, previous, language);
    if (!alive.current) return;
    setBusy(false);

    /* The server's own words, after a translated lead: the refusals worth
       showing name *which* gate closed, and a dictionary sentence general
       enough to cover them all would name none — the console's rule. */
    if (outcome.state === 'refused') {
      setRefusal(fill(copy.listing.view.refused, { why: outcome.error.message }));
      return;
    }

    const source =
      outcome.state === 'saved' && outcome.read.state === 'ready' ? outcome.read.source : null;
    /* What the server now holds, folded back in: its id, its canonical words,
       and the description filed under the language it was written in. */
    if (source) saveBusiness(businessFromSource(source, language, draft));

    /* Setup has somewhere to go, and goes there once the write has an answer;
       the profile screen returns to the listing it just saved. */
    if (mode === 'setup') {
      navigate('dashboard');
      return;
    }
    onSaved?.(
      outcome.state === 'saved' ? 'saved' : 'device',
      source,
      outcome.state === 'saved' && outcome.created,
    );
  };

  const toggleSpoken = (code: SpokenLanguage) =>
    change((current) => ({
      ...current,
      spoken: current.spoken.includes(code)
        ? current.spoken.filter((c) => c !== code)
        : [...current.spoken, code],
    }));

  return {
    draft,
    unmapped,
    categoryIndex,
    serverBacked,
    appLinks,
    setAppLinks,
    busy,
    refusal,
    emailBad,
    formRef,
    nameRef,
    cityRef,
    change,
    set,
    text,
    pickLogo,
    toggleSpoken,
    onSubmit,
  };
}
