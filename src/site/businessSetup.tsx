import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_COUNTRIES,
  BUSINESS_HOURS,
  SPOKEN_LANGUAGES,
} from './content';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import {
  blankBusiness,
  isEmail,
  profileCompleteness,
  type BusinessCategory,
  type BusinessCountry,
  type BusinessProfile,
  type SpokenLanguage,
} from './auth/business';
import { navigate } from './router';
import { LOGO_PX, toSquareDataUrl } from './imageFile';
import { hasToken } from './api/client';
import { becomePartner } from './api/consumer';
import { createVenue, myVenues, submitVerification, updateVenue } from './api/partner';

/**
 * Where a venue keeps its clock, per country the listing form offers.
 *
 * The **venue’s** zone, never the reader’s, and it is not decoration: the
 * server compares a deal’s window and a venue’s quiet hours against it, so a
 * Kraków café is shut at 23:00 Kraków time whoever is looking. It is the same
 * rule the wallet’s “Open now” pill follows one screen over.
 *
 * One zone per country, which is true for all six the form offers — none of
 * them spans two. A country that did would need the city to decide, and that
 * is the point at which this table stops being enough rather than a place to
 * guess.
 */
const VENUE_ZONES: Record<BusinessCountry, string> = {
  pl: 'Europe/Warsaw',
  ua: 'Europe/Kyiv',
  ge: 'Asia/Tbilisi',
  tr: 'Europe/Istanbul',
  uz: 'Asia/Tashkent',
  az: 'Asia/Baku',
};

/**
 * The business listing form, and the two things beside it that make filling one
 * in bearable: a meter saying how much is left, and the app card it becomes.
 *
 * Fields, labels and helper text are the partner prototype's
 * (`b2b/Paylez Partner Dashboard v2.dc.html`, the `profile` screen) rather than
 * invented here — that screen is the product, and the wording on it has already
 * been through the trouble of being plain.
 *
 * State is a local draft rather than a write-through to the session. The meter
 * and the preview have to move on every keystroke, and persisting each of those
 * would mean a `JSON.stringify` of the whole account per character typed. The
 * draft commits on submit.
 */

/* ────────────────────────────────────────────────────────────── controls ── */

/**
 * One row of the field kit.
 *
 * A `<label>` by default, which is what wraps a single control in its name
 * without needing an id on both ends. `wraps={false}` renders the same row as a
 * plain `<div>` for the cases where the children are *not* one control:
 *
 * - the logo row, whose child is itself a `<label className="file-pick">`.
 *   Nesting `<label>` is invalid HTML and the browsers agree on what it costs:
 *   the outer label's implicit control resolves to the file input, so the word
 *   "Logo" became a second trigger for the file picker and the input's
 *   accessible name was assembled out of both labels' text.
 * - the two rows that hold a group rather than a control — the spoken-language
 *   chips and the read-only hours — which had already been hand-written as
 *   `<div className="field">` further down for the same reason. This is that
 *   pattern, given a name, so the next one does not have to be hand-written a
 *   third time.
 */
function Field({
  label,
  required,
  help,
  error,
  wraps = true,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  wraps?: boolean;
  children: ReactNode;
}) {
  const Row = wraps ? 'label' : 'div';
  return (
    <Row className="field">
      <span className="field-label">
        {label}
        {/* The star is decorative — `required` on the control is what a screen
            reader announces, and reading "star" after every other label is
            noise. */}
        {required && (
          <i className="field-star" aria-hidden>
            ★
          </i>
        )}
      </span>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        help && <span className="field-help">{help}</span>
      )}
    </Row>
  );
}

/* ────────────────────────────────────────────────────────────────── rail ── */

function ReadyCard({ profile }: { profile: BusinessProfile }) {
  const copy = useCopy();
  const state = profileCompleteness(profile);
  const labels = copy.listing.fields;

  /* Field id → the label the form shows, so "still needed" and the form agree
     on what a thing is called. */
  const naming: Record<string, string> = {
    name: labels.name,
    description: labels.description,
    price: labels.price,
    logo: labels.logo,
    city: labels.city,
    street: labels.street,
    maps: labels.maps,
    phone: labels.phone,
    email: labels.email,
  };

  return (
    <div className="console ready-card" data-reveal>
      <span className="console-label">{copy.listing.ready.title}</span>
      <b className="ready-pct">
        {fill(copy.listing.ready.progress, { percent: String(state.percent) })}
      </b>
      <div className="ready-bar">
        <i style={{ width: `${state.percent}%` }} />
      </div>

      {state.missing.length > 0 ? (
        <>
          <span className="ready-still">{copy.listing.ready.stillNeeded}</span>
          <ul className="ready-list">
            {state.missing.map((field) => (
              <li key={field}>{naming[field]}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="ready-done">
          <Icon name="check" size={15} strokeWidth={3} />
          {copy.listing.ready.done}
        </p>
      )}
    </div>
  );
}

function AppPreview({ profile }: { profile: BusinessProfile }) {
  const copy = useCopy();
  const preview = copy.listing.preview;

  const categoryIndex = BUSINESS_CATEGORIES.findIndex((c) => c.id === profile.category);
  const sub = copy.listing.subcategories[categoryIndex]?.[profile.subcategory];
  const kind = sub ?? copy.listing.categories[categoryIndex];
  const where = [profile.street, profile.city].filter(Boolean).join(', ');

  return (
    <div className="console preview-phone" data-reveal>
      <span className="console-label">{preview.title}</span>

      <div className="phone" data-ink="on">
        {/* The mark, if there is one. The placeholder stays for the listing
            that has not chosen one yet — an empty band says less than a band
            that names what belongs in it. */}
        <div className="phone-cover" data-has-logo={profile.logo ? 'true' : undefined}>
          {profile.logo ? <img src={profile.logo} alt="" /> : preview.cover}
        </div>
        <div className="phone-body">
          <b>{profile.name || preview.name}</b>
          <span className="phone-kind">
            {kind}
            {where ? ` · ${where}` : ` · ${preview.address}`}
          </span>
          <span className="phone-meta">
            <i className="phone-star" aria-hidden>
              ★
            </i>
            4.8 <span className="phone-dim">{preview.reviews}</span>
            {' · '}
            {profile.price || preview.price}
          </span>
          <p>{profile.description || preview.description}</p>
          <div className="phone-langs">
            {profile.spoken.map((code) => (
              <span key={code}>
                {copy.listing.spokenLanguages[SPOKEN_LANGUAGES.indexOf(code)]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="phone-note">{preview.note}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── form ── */

export function BusinessForm({ mode }: { mode: 'setup' | 'profile' }) {
  const copy = useCopy();
  const { account, saveBusiness } = useAuth();
  const fields = copy.listing.fields;

  const [draft, setDraft] = useState<BusinessProfile>(
    () => account?.business ?? blankBusiness(),
  );
  const [appLinks, setAppLinks] = useState(
    () => Boolean(draft.appStore || draft.googlePlay),
  );
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const text =
    (key: keyof BusinessProfile) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, event.target.value as never);

  /**
   * The logo, as a picture rather than as a filename.
   *
   * It used to store `file.name`, on the argument that there was nowhere to
   * upload to and a base64 image in `localStorage` would eat the origin's
   * quota. The first half was true and the second was answered the wrong way:
   * the preview beside this form is the whole point of the form, and it showed
   * the words "Cover photo" no matter what anybody chose. A listing whose owner
   * cannot see their own mark on it is not a preview of anything.
   *
   * `LOGO_PX` is what makes the quota argument go away — 256² of JPEG is a few
   * kilobytes, which is the same trade the profile photo already makes.
   *
   * The input is cleared first so that choosing the *same* file again still
   * fires a change, which is what makes "pick, look, pick the same one after
   * cropping it" work.
   */
  const pickLogo = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const logo = await toSquareDataUrl(file, LOGO_PX);
    if (logo) set('logo', logo);
  };

  const categoryIndex = useMemo(
    () => BUSINESS_CATEGORIES.findIndex((c) => c.id === draft.category),
    [draft.category],
  );

  const emailBad = draft.email.trim().length > 0 && !isEmail(draft.email);
  const nameMissing = draft.name.trim().length === 0;

  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Move the reader to the thing that stopped them.
   *
   * `noValidate` is on the form — deliberately, so the browser's own bubbles do
   * not fight the field kit — but it only suppresses the *UI*. The constraint
   * API still works, so `:invalid` is a live answer to "which control is the
   * problem", and focusing it is the whole message: the label already carries
   * the star, and `.ready-card` beside the form is already listing what is
   * outstanding. That is why this needs no new dictionary copy.
   *
   * Restricted to real controls because `:invalid` matches `<fieldset>` too, and
   * every section of this form is one — an unrestricted `querySelector` returns
   * the first fieldset and focuses nothing.
   */
  const showFirstProblem = () => {
    const first = formRef.current?.querySelector<HTMLElement>(
      'input:invalid, select:invalid, textarea:invalid',
    );
    (first ?? formRef.current)?.scrollIntoView({ block: 'center' });
    first?.focus();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    /*
     * Two things are refused, and the line between them and the other seven
     * required fields is deliberate.
     *
     * `noValidate` makes every `required` and `type="email"` on this form
     * inert, and nothing replaced them — so Save on a completely blank form
     * wrote `business` from `null` to an empty object and, in setup, navigated
     * to the dashboard. That is not a cosmetic miss: `account.business === null`
     * is precisely how `resolveRoute` knows setup has not been done, so one
     * click on an untouched form turned a brand-new owner into a finished one
     * with an empty listing, permanently, with no way back to the form except
     * the profile screen.
     *
     * What is *not* refused is an incomplete listing, and that is the page's own
     * rule rather than an omission: `setupLede` says the starred fields are
     * needed "before it can go live", not before it can be saved, and
     * `.ready-card` is a progress bar — both are meaningless if a partial save
     * is impossible. `isBusinessReady` is what gates going live, and it already
     * does. So the bar here is the two things that make a submission *wrong*
     * rather than unfinished: a listing with no name is not a listing, and a
     * malformed address is a typo the owner wants to know about now rather than
     * when a customer cannot reach them.
     */
    if (nameMissing || emailBad) {
      setSaved(false);
      showFirstProblem();
      return;
    }

    /* Locally first and unconditionally: the listing is this owner's own record
       and must survive a server that is not answering. */
    saveBusiness(draft);
    setSaved(true);

    /*
     * **And then on the server, because a listing nobody else can see is not a
     * listing.**
     *
     * This is what the dashboard's every control was missing. A venue is what a
     * hot deal attaches to, what a voucher is spent at and what the analytics
     * are about; without a row in `venues` the drawer had nowhere to file
     * anything and said so. The form wrote to `localStorage` and stopped.
     *
     * Created once and patched thereafter — `myVenues()` decides which, rather
     * than a flag kept here, because the honest answer to "does this account
     * have a venue" is on the server and a local flag is a guess that goes
     * stale the first time somebody signs in on a second device.
     *
     * Failure is deliberately quiet on this path. The owner's listing is saved,
     * they are being moved to their dashboard, and a red line about an API they
     * have not heard of is not something they can act on. What they *will* see,
     * the moment it matters, is the drawer saying the deal could not be filed —
     * which is the screen where that sentence is worth reading.
     */
    void syncVenue(draft);

    /* Setup has somewhere to go; the profile screen is already where you want
       to be, so it just confirms. */
    if (mode === 'setup') navigate('dashboard');
  };

  /**
   * Mirror the listing into `venues` on the server.
   *
   * The mapping is a subset on purpose — see `VenueDraft` in `api/partner.ts`.
   * The timezone is the venue's, not the reader's, and it is what decides
   * whether a deal is inside its own hours: `Europe/Warsaw` for a Polish venue
   * and `Asia/Tashkent` for an Uzbek one, which is the whole of what this
   * product's two markets need today.
   */
  const syncVenue = async (listing: BusinessProfile) => {
    if (!hasToken()) return;
    try {
      /*
       * Claim the role first, every time.
       *
       * It is idempotent, and asking costs one request against a listing save
       * that is already several. What it buys is that this works whichever door
       * the owner came through: the sign-up form grants `partner_owner` from
       * its own flag, `setType` grants it when a Google visitor answers the
       * question — and if either was missed, or the account predates both, this
       * is the moment that cannot be skipped, because the very next call needs
       * the role. Relying on an earlier grant having happened is how an owner
       * ends up staring at a listing that saved locally and nowhere else.
       */
      await becomePartner();

      const mine = await myVenues();
      const body = {
        name: listing.name.trim(),
        category: listing.category,
        city: listing.city.trim(),
        countryCode: listing.country.toUpperCase(),
        address: listing.street.trim() || undefined,
        timezone: VENUE_ZONES[listing.country],
        phone: listing.phone.trim() || undefined,
        email: listing.email.trim() || undefined,
        priceRange: listing.price.trim() || undefined,
        /* The mark itself, not a note that one was chosen. Without this the
           logo an owner picked existed only in the browser they picked it in. */
        imageUrl: listing.logo || undefined,
      };
      if (mine[0]) {
        await updateVenue(mine[0].id, body);
        return;
      }

      const made = await createVenue(body);
      /*
       * A brand-new venue is unverified, and an unverified venue may hold
       * drafts but may not put an offer in front of customers. Submitting it
       * here is what puts it in the operator's queue — without this it was
       * created unverified and *stayed* unverified for ever, because nothing
       * else in the product ever queued one and the review screen had nothing
       * to review. An owner met a wall with no visible cause.
       *
       * Only on creation. Editing an address is not a reason to re-review a
       * venue somebody has already looked at.
       */
      await submitVerification(made.id);
    } catch {
      /* See the note at the call site: the listing is saved either way, and the
         screen that needs to talk about the server is the one that needs it. */
    }
  };

  const toggleSpoken = (code: SpokenLanguage) =>
    setDraft((current) => ({
      ...current,
      spoken: current.spoken.includes(code)
        ? current.spoken.filter((c) => c !== code)
        : [...current.spoken, code],
    }));

  return (
    <div className="business-grid">
      <form className="business-form" ref={formRef} onSubmit={onSubmit} noValidate>
        {/* ── basic ── */}
        <fieldset className="form-block" data-reveal>
          <legend>{copy.listing.sections.basic}</legend>

          <Field label={fields.name} required>
            <input
              type="text"
              required
              placeholder={fields.namePlaceholder}
              value={draft.name}
              onChange={text('name')}
            />
          </Field>

          <div className="field-row">
            <Field label={fields.category} required>
              <select
                value={draft.category}
                onChange={(event) =>
                  /* The subcategory list is per category, so an index carried
                     over from the previous one would point at a different
                     word — or at nothing. Reset it with the parent. */
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value as BusinessCategory,
                    subcategory: 0,
                  }))
                }
              >
                {BUSINESS_CATEGORIES.map((category, index) => (
                  <option key={category.id} value={category.id}>
                    {copy.listing.categories[index]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={fields.subcategory}>
              <select
                value={draft.subcategory}
                onChange={(event) => set('subcategory', Number(event.target.value))}
              >
                {/* `?? []`, because `findIndex` answers -1 for a stored
                    `category` this build no longer has — a renamed or dropped
                    id in a listing written by an earlier one. `AppPreview`
                    already guards the identical lookup with `?.`; this one
                    would have thrown on `undefined.map` and taken both the
                    setup page and the dashboard's profile screen with it. */}
                {(copy.listing.subcategories[categoryIndex] ?? []).map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={fields.description} required help={fields.descriptionHelp}>
            <textarea
              rows={4}
              required
              placeholder={fields.descriptionPlaceholder}
              value={draft.description}
              onChange={text('description')}
            />
          </Field>

          <div className="field-row">
            <Field label={fields.price} required help={fields.priceHelp}>
              <input
                type="text"
                placeholder={fields.pricePlaceholder}
                value={draft.price}
                onChange={text('price')}
              />
            </Field>

            {/* `wraps={false}`: the child is a `<label>` of its own, and one
                label may not contain another. */}
            <Field label={fields.logo} required help={fields.logoHelp} wraps={false}>
              <div className="logo-pick">
                {draft.logo && (
                  <span className="logo-chip" aria-hidden>
                    <img src={draft.logo} alt="" />
                  </span>
                )}
                <label className="file-pick">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void pickLogo(event.target)}
                  />
                  <Icon name="card" size={15} />
                  {/* The label says "choose" until there is one and "replace"
                      after, because the chip beside it is already the answer to
                      "did that work" and the button's job is the next move. */}
                  <span>{draft.logo ? fields.logoReplace : fields.logoChoose}</span>
                </label>
                {draft.logo && (
                  <button type="button" className="link-btn" onClick={() => set('logo', '')}>
                    {fields.logoRemove}
                  </button>
                )}
              </div>
            </Field>
          </div>
        </fieldset>

        {/* ── where ── */}
        <fieldset className="form-block" data-reveal>
          <legend>{copy.listing.sections.where}</legend>

          <div className="field-row">
            <Field label={fields.country} required>
              <select
                value={draft.country}
                onChange={(event) => set('country', event.target.value as BusinessCountry)}
              >
                {BUSINESS_COUNTRIES.map((code, index) => (
                  <option key={code} value={code}>
                    {copy.listing.countries[index]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={fields.city} required>
              <input
                type="text"
                required
                placeholder={fields.cityPlaceholder}
                value={draft.city}
                onChange={text('city')}
              />
            </Field>
          </div>

          <Field label={fields.street} required>
            <input
              type="text"
              required
              placeholder={fields.streetPlaceholder}
              value={draft.street}
              onChange={text('street')}
            />
          </Field>

          <Field label={fields.maps} required help={fields.mapsHelp}>
            <input
              type="url"
              placeholder="https://maps.google.com/..."
              value={draft.maps}
              onChange={text('maps')}
            />
          </Field>
        </fieldset>

        {/* ── reach ── */}
        <fieldset className="form-block" data-reveal>
          <legend>{copy.listing.sections.reach}</legend>

          <div className="field-row">
            <Field label={fields.phone} required>
              <input
                type="tel"
                required
                placeholder={fields.phonePlaceholder}
                value={draft.phone}
                onChange={text('phone')}
              />
            </Field>

            <Field
              label={fields.email}
              required
              error={emailBad ? fields.emailError : undefined}
            >
              <input
                type="email"
                required
                placeholder={fields.emailPlaceholder}
                value={draft.email}
                onChange={text('email')}
                aria-invalid={emailBad || undefined}
              />
            </Field>
          </div>

          <div className="field-row">
            <Field label={fields.website}>
              <input
                type="url"
                placeholder="https://..."
                value={draft.website}
                onChange={text('website')}
              />
            </Field>

            <Field label={fields.instagram}>
              <input
                type="url"
                placeholder="https://instagram.com/..."
                value={draft.instagram}
                onChange={text('instagram')}
              />
            </Field>
          </div>

          {appLinks && (
            <div className="field-row">
              <Field label={fields.appStore}>
                <input
                  type="url"
                  placeholder="https://apps.apple.com/..."
                  value={draft.appStore}
                  onChange={text('appStore')}
                />
              </Field>

              <Field label={fields.googlePlay}>
                <input
                  type="url"
                  placeholder="https://play.google.com/..."
                  value={draft.googlePlay}
                  onChange={text('googlePlay')}
                />
              </Field>
            </div>
          )}

          <button
            type="button"
            className="link-btn"
            onClick={() => setAppLinks((on) => !on)}
          >
            {appLinks ? fields.appLinksHide : fields.appLinksShow}
          </button>
        </fieldset>

        {/* ── service ── */}
        <fieldset className="form-block" data-reveal>
          <legend>{copy.listing.sections.service}</legend>

          {/* A group of chips, not one control, so the row is a `div` — see
              `Field`. It was written out by hand here before that existed. */}
          <Field label={fields.spoken} wraps={false}>
            <div className="chips">
              {SPOKEN_LANGUAGES.map((code, index) => (
                <button
                  key={code}
                  type="button"
                  className="chip"
                  aria-pressed={draft.spoken.includes(code)}
                  data-on={draft.spoken.includes(code) ? 'true' : undefined}
                  onClick={() => toggleSpoken(code)}
                >
                  {copy.listing.spokenLanguages[index]}
                </button>
              ))}
            </div>
          </Field>

          {/* A list, not a control, so this one is a `div` too. */}
          <Field label={fields.hours} wraps={false}>
            {/* Read-only, as in the prototype. An hours editor is split shifts
                and public holidays, and a bad one is worse than three lines. */}
            <ul className="hours">
              {BUSINESS_HOURS.map((span, index) => (
                <li key={span}>
                  <span>{copy.listing.hoursDays[index]}</span>
                  <b>{span}</b>
                </li>
              ))}
            </ul>
          </Field>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="btn btn-solid btn-lg">
            {mode === 'setup' ? copy.listing.save : copy.listing.saveProfile}
          </button>
          {saved && (
            <span className="form-saved" role="status">
              <Icon name="check" size={15} strokeWidth={3} />
              {copy.listing.saved}
            </span>
          )}
        </div>
      </form>

      <aside className="business-rail">
        <ReadyCard profile={draft} />
        <AppPreview profile={draft} />
      </aside>
    </div>
  );
}

/** The standalone route, for an owner who has just chosen their account type. */
export function BusinessSetupPage() {
  const copy = useCopy();

  return (
    <main>
      <section className="section business" id="business-top">
        <div className="wrap">
          <div className="section-head left" data-reveal>
            <span className="eyebrow">{copy.listing.setupEyebrow}</span>
            {/* `h1`, not `h2`. This is a route of its own and it was the only
                one on the site with no top-level heading — a document whose
                outline starts at level two, which is what a screen reader
                reads as "this page is a section of something else". The
                `.section-head` type comes from the class, so the level is free
                to be correct. */}
            <h1>{copy.listing.setupTitle}</h1>
            <p>{copy.listing.setupLede}</p>
          </div>
          <BusinessForm mode="setup" />
        </div>
      </section>
    </main>
  );
}
