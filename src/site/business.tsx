import {
  useMemo,
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

function Field({
  label,
  required,
  help,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
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
    </label>
  );
}

/* ────────────────────────────────────────────────────────────────── rail ── */

function ReadyCard({ profile }: { profile: BusinessProfile }) {
  const copy = useCopy();
  const state = profileCompleteness(profile);
  const labels = copy.business.fields;

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
      <span className="console-label">{copy.business.ready.title}</span>
      <b className="ready-pct">
        {fill(copy.business.ready.progress, { percent: String(state.percent) })}
      </b>
      <div className="ready-bar">
        <i style={{ width: `${state.percent}%` }} />
      </div>

      {state.missing.length > 0 ? (
        <>
          <span className="ready-still">{copy.business.ready.stillNeeded}</span>
          <ul className="ready-list">
            {state.missing.map((field) => (
              <li key={field}>{naming[field]}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="ready-done">
          <Icon name="check" size={15} strokeWidth={3} />
          {copy.business.ready.done}
        </p>
      )}
    </div>
  );
}

function AppPreview({ profile }: { profile: BusinessProfile }) {
  const copy = useCopy();
  const preview = copy.business.preview;

  const categoryIndex = BUSINESS_CATEGORIES.findIndex((c) => c.id === profile.category);
  const sub = copy.business.subcategories[categoryIndex]?.[profile.subcategory];
  const kind = sub ?? copy.business.categories[categoryIndex];
  const where = [profile.street, profile.city].filter(Boolean).join(', ');

  return (
    <div className="console preview-phone" data-reveal>
      <span className="console-label">{preview.title}</span>

      <div className="phone">
        <div className="phone-cover">{preview.cover}</div>
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
                {copy.business.spokenLanguages[SPOKEN_LANGUAGES.indexOf(code)]}
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
  const fields = copy.business.fields;

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

  const categoryIndex = useMemo(
    () => BUSINESS_CATEGORIES.findIndex((c) => c.id === draft.category),
    [draft.category],
  );

  const emailBad = draft.email.trim().length > 0 && !isEmail(draft.email);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    saveBusiness(draft);
    setSaved(true);
    /* Setup has somewhere to go; the profile screen is already where you want
       to be, so it just confirms. */
    if (mode === 'setup') navigate('dashboard');
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
      <form className="business-form" onSubmit={onSubmit} noValidate>
        {/* ── basic ── */}
        <fieldset className="form-block" data-reveal>
          <legend>{copy.business.sections.basic}</legend>

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
                    {copy.business.categories[index]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={fields.subcategory}>
              <select
                value={draft.subcategory}
                onChange={(event) => set('subcategory', Number(event.target.value))}
              >
                {copy.business.subcategories[categoryIndex].map((name, index) => (
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

            <Field label={fields.logo} required help={fields.logoHelp}>
              {/*
                The filename, not the file. There is nowhere to upload to — this
                build has no server — and stashing a data URL in the session
                would put a base64 image into localStorage, which has about 5 MB
                for the whole origin. The name is enough to know one was chosen.
              */}
              <label className="file-pick">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => set('logo', event.target.files?.[0]?.name ?? '')}
                />
                <Icon name="card" size={15} />
                <span>{draft.logo || fields.logoChoose}</span>
              </label>
            </Field>
          </div>
        </fieldset>

        {/* ── where ── */}
        <fieldset className="form-block" data-reveal>
          <legend>{copy.business.sections.where}</legend>

          <div className="field-row">
            <Field label={fields.country} required>
              <select
                value={draft.country}
                onChange={(event) => set('country', event.target.value as BusinessCountry)}
              >
                {BUSINESS_COUNTRIES.map((code, index) => (
                  <option key={code} value={code}>
                    {copy.business.countries[index]}
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
          <legend>{copy.business.sections.reach}</legend>

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
          <legend>{copy.business.sections.service}</legend>

          <div className="field">
            <span className="field-label">{fields.spoken}</span>
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
                  {copy.business.spokenLanguages[index]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">{fields.hours}</span>
            {/* Read-only, as in the prototype. An hours editor is split shifts
                and public holidays, and a bad one is worse than three lines. */}
            <ul className="hours">
              {BUSINESS_HOURS.map((span, index) => (
                <li key={span}>
                  <span>{copy.business.hoursDays[index]}</span>
                  <b>{span}</b>
                </li>
              ))}
            </ul>
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="btn btn-solid btn-lg">
            {mode === 'setup' ? copy.business.save : copy.business.saveProfile}
          </button>
          {saved && (
            <span className="form-saved" role="status">
              <Icon name="check" size={15} strokeWidth={3} />
              {copy.business.saved}
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
            <span className="eyebrow">{copy.business.setupEyebrow}</span>
            <h2>{copy.business.setupTitle}</h2>
            <p>{copy.business.setupLede}</p>
          </div>
          <BusinessForm mode="setup" />
        </div>
      </section>
    </main>
  );
}
