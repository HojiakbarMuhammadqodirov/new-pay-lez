import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_COUNTRIES,
  BUSINESS_HOURS,
  SPOKEN_LANGUAGES,
} from './content';
import { Icon } from './icons';
import { EmailCodeStep, useEmailCodeGate } from './EmailCodeStep';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';
import { initial, useAuth } from './auth/context';
import {
  blankBusiness,
  profileCompleteness,
  type BusinessCategory,
  type BusinessCountry,
  type BusinessProfile,
} from './auth/business';
import { isPicture } from './auth/picture';
import { hasToken } from './api/client';
import {
  businessFromSource,
  listingState,
  mailAddress,
  phoneAddress,
  readOwnListing,
  webAddress,
  wordsOf,
  type ListingSource,
  type ListingState,
} from './api/listing';
import { DEMO_ACCOUNT } from './demoMode';
import { useListingEditor, without, type ListingFlash } from './listingEditor';
import { AppCategoryPicker } from './AppCategories';

/**
 * The business listing — the form an owner fills in once, and the record they
 * come back to.
 *
 * Two screens render this file and they want different first things:
 *
 * - **`#/business/setup`** (`mode="setup"`) is somebody describing a venue for
 *   the first time. The form is the page, Save creates the venue on the server
 *   and sends it for review, and the owner goes on to their dashboard.
 * - **The dashboard's Profile screen** (`mode="profile"`) is somebody checking
 *   what customers see. It opens on the listing as it stands — the mark, the
 *   name, whether it is live, the description, where it is and how to reach it —
 *   with **one** Edit button that turns the screen into the same form, with Save
 *   and Cancel. `dashboard.tsx` keeps rendering `<BusinessForm mode="profile" />`
 *   and never has to know there are two modes.
 *
 * Fields, labels and helper text are the partner prototype's
 * (`b2b/Paylez Partner Dashboard v2.dc.html`, the `profile` screen) rather than
 * invented here — that screen is the product, and its wording has already been
 * through the trouble of being plain.
 *
 * The form's behaviour — the draft, the refusals, the save — is
 * `useListingEditor` in `listingEditor.ts`, which the partner dashboard's
 * Business profile (`dashboardProfile.tsx`) draws in v3's look; only the markup
 * here is this route's. The dashboard no longer renders `mode="profile"`, which
 * stays for any caller that still wants the old view.
 *
 * The form's state is a local draft rather than a write-through to the session.
 * The meter and the preview move on every keystroke, and persisting each of
 * those would be a `JSON.stringify` of the whole account per character typed.
 * The draft commits on submit: to this browser first, and then to the server.
 */

/* ────────────────────────────────────────────────────────────── controls ── */

/**
 * One row of the field kit.
 *
 * A `<label>` by default, which is what wraps a single control in its name
 * without needing an id on both ends. `wraps={false}` renders the same row as a
 * plain `<div>` for the cases where the children are *not* one control — the
 * logo row, whose child is itself a `<label className="file-pick">` (nesting
 * `<label>` makes the outer caption a second trigger for the file picker), and
 * the two rows that hold a group rather than a control.
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

/**
 * How much of the listing is done.
 *
 * `live` decides the finished sentence. "Your listing is live in the app" was
 * said the moment the last star was filled, which is true of a venue an
 * operator has approved and untrue of every venue still waiting to be looked
 * at — including every new one, since a new venue goes straight to review.
 */
function ReadyCard({ profile, live }: { profile: BusinessProfile; live: boolean }) {
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
          {live ? copy.listing.ready.done : copy.listing.view.readyDone}
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
  /* Only a mark this site made is drawn — see `auth/picture.ts`. */
  const mark = isPicture(profile.logo) ? profile.logo : '';

  return (
    <div className="console preview-phone" data-reveal>
      <span className="console-label">{preview.title}</span>

      <div className="phone" data-ink="on">
        {/* The mark, if there is one. The placeholder stays for the listing
            that has not chosen one yet — an empty band says less than a band
            that names what belongs in it. */}
        <div className="phone-cover" data-has-logo={mark ? 'true' : undefined}>
          {mark ? <img src={mark} alt="" /> : preview.cover}
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

/* ──────────────────────────────────────────────────────────────── entry ── */

export function BusinessForm({ mode }: { mode: 'setup' | 'profile' }) {
  return mode === 'setup' ? <ListingEditor mode="setup" previous={null} /> : <ListingProfile />;
}

/* ──────────────────────────────────────────────────────── profile screen ── */

/**
 * What the server says about the listing, as the view needs it.
 *
 * Five states, because they say five different things to an owner: there is no
 * server session on this device (`local`); we are asking (`loading`); the
 * server holds this listing (`ready`); the server holds no venue for this
 * account yet (`none`); or we could not ask (`error`). The last must not read
 * as the fourth — "nothing on the server" and "the server did not answer" have
 * opposite next steps.
 */
type Remote =
  | { status: 'local' }
  | { status: 'loading' }
  | { status: 'ready'; source: ListingSource }
  | { status: 'none' }
  | { status: 'error' };

type Flash = ListingFlash;

function ListingProfile() {
  const copy = useCopy();
  const [language] = useLanguage();
  const { account, saveBusiness } = useAuth();
  /* The demonstration account has no venue anywhere, whatever token this
     browser happens to still hold for somebody else. */
  const asks = hasToken() && account?.id !== DEMO_ACCOUNT.id;
  const [editing, setEditing] = useState(false);
  const [remote, setRemote] = useState<Remote>(() =>
    asks ? { status: 'loading' } : { status: 'local' },
  );
  const [flash, setFlash] = useState<Flash | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);

  /* Read at arrival through refs, so the read is not re-fired by the listing it
     writes back — that write changes `venueId` the first time, and an effect
     keyed on it would ask twice. */
  const heldRef = useRef(account?.business ?? null);
  useEffect(() => {
    heldRef.current = account?.business ?? null;
  }, [account?.business]);

  /*
   * Ask the server on arrival, even though sign-in already did.
   *
   * The status is the reason: an operator may have approved the venue since the
   * page loaded, and "waiting for review" on a listing that is live is the one
   * line on this screen an owner acts on. The answer is folded into the
   * account as well, so the listing drawn is the one the server holds.
   */
  useEffect(() => {
    if (!asks) return;
    let live = true;
    void readOwnListing(heldRef.current?.venueId).then((read) => {
      if (!live) return;
      if (read.state === 'ready') {
        setRemote({ status: 'ready', source: read.source });
        saveBusiness(businessFromSource(read.source, language, heldRef.current));
      } else {
        setRemote({ status: read.state === 'none' ? 'none' : 'error' });
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Leaving the editor unmounts whatever held focus; it goes back to Edit. */
  useEffect(() => {
    if (editing || !returning.current) return;
    returning.current = false;
    editButton.current?.focus();
  }, [editing]);

  const leave = (next: Flash | null) => {
    returning.current = true;
    setFlash(next);
    setEditing(false);
  };

  return (
    <div className="lst">
      {/* Always mounted, so the confirmation is announced — see `profile.tsx`. */}
      <p className="lst-flash" data-tone={flash ?? undefined} role="status">
        {flash === 'saved' ? (
          <>
            <Icon name="check" size={15} strokeWidth={3} />
            <span>{copy.listing.view.saved}</span>
          </>
        ) : flash === 'device' ? (
          <>
            <Icon name="warn" size={15} />
            <span>{copy.listing.view.savedDevice}</span>
          </>
        ) : null}
      </p>

      {editing ? (
        <ListingEditor
          mode="profile"
          previous={remote.status === 'ready' ? remote.source : null}
          onCancel={() => leave(null)}
          onSaved={(outcome, source) => {
            if (source) setRemote({ status: 'ready', source });
            leave(outcome);
          }}
        />
      ) : (
        <ListingView
          business={account?.business ?? null}
          remote={remote}
          editButton={editButton}
          onEdit={() => {
            setFlash(null);
            setEditing(true);
          }}
        />
      )}
    </div>
  );
}

/** One row of a fact list, with a soft "Not added yet" where the fact is missing. */
function Fact({
  label,
  value,
  href,
  external,
}: {
  label: string;
  value: string;
  href?: string | null;
  external?: boolean;
}) {
  const copy = useCopy().listing.view;
  const text = value.trim();
  return (
    <div className="lst-row">
      <dt>{label}</dt>
      <dd>
        {!text ? (
          <span className="lst-soft">{copy.notAdded}</span>
        ) : href ? (
          <a
            className="lst-link"
            href={href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {text}
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
}

/**
 * The listing, read-only.
 *
 * Drawn from the account's copy of the listing — which sign-in and the read
 * above keep equal to the server's — with the status from the server alone,
 * because "live" is not something this browser can know on its own.
 *
 * Words the server holds that the form has no list entry for (an imported
 * `places / halal_food`) are printed as the server's words, not as whichever of
 * the form's seven categories happens to be first; see `api/listing.ts`.
 */
function ListingView({
  business,
  remote,
  editButton,
  onEdit,
}: {
  business: BusinessProfile | null;
  remote: Remote;
  editButton: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
}) {
  const copy = useCopy();
  const view = copy.listing.view;
  const fields = copy.listing.fields;
  const titleId = useId();
  const aboutId = useId();
  const whereId = useId();
  const reachId = useId();
  const spokenId = useId();

  const listing = business ?? blankBusiness();
  const unmapped = listing.unmapped ?? {};
  const categoryIndex = BUSINESS_CATEGORIES.findIndex((entry) => entry.id === listing.category);
  const category =
    unmapped.category !== undefined
      ? wordsOf(unmapped.category)
      : (copy.listing.categories[categoryIndex] ?? '');
  const subcategory =
    unmapped.category !== undefined || unmapped.subcategory !== undefined
      ? unmapped.subcategory
        ? wordsOf(unmapped.subcategory)
        : ''
      : (copy.listing.subcategories[categoryIndex]?.[listing.subcategory] ?? '');
  const country =
    unmapped.country !== undefined
      ? unmapped.country
      : (copy.listing.countries[BUSINESS_COUNTRIES.indexOf(listing.country)] ?? '');

  const state: ListingState | null =
    remote.status === 'ready' ? listingState(remote.source) : null;
  const reviewerNote =
    remote.status === 'ready' && state === 'rejected' ? remote.source.verification?.note : null;

  const statusLine =
    remote.status === 'loading'
      ? view.statusChecking
      : remote.status === 'error'
        ? view.statusUnknown
        : remote.status === 'ready' && state
          ? view.statusNote[state]
          : view.statusLocal;

  const maps = webAddress(listing.maps);
  const kind = [category, subcategory, listing.price.trim()].filter(Boolean).join(' · ');

  return (
    <>
      <section className="console lst-head" aria-labelledby={titleId}>
        <span className="lst-logo" aria-hidden>
          {isPicture(listing.logo) ? <img src={listing.logo} alt="" /> : initial(listing)}
        </span>

        <div className="lst-title">
          <h2 className="lst-name" id={titleId}>
            {listing.name.trim() || <span className="lst-soft">{view.notAdded}</span>}
          </h2>
          {kind && <p className="lst-kind">{kind}</p>}
          {state && (
            <span className="lst-state" data-state={state}>
              {view.status[state]}
            </span>
          )}
        </div>

        {/* The one control on this screen that changes the listing. */}
        <button ref={editButton} type="button" className="btn btn-solid lst-edit" onClick={onEdit}>
          <Icon name="pencil" size={15} strokeWidth={2} />
          {view.edit}
        </button>

        <p className="lst-note">
          {statusLine}
          {/* The reviewer's own words, when there are any: they are the one
              thing that says what to change, and a translation of them does not
              exist. */}
          {reviewerNote ? (
            <>
              {' '}
              <q>{reviewerNote}</q>
            </>
          ) : null}
        </p>
      </section>

      <div className="lst-grid">
        <div className="lst-main">
          <section className="console lst-card" aria-labelledby={aboutId}>
            <h3 className="lst-card-title" id={aboutId}>
              {view.about}
            </h3>
            {listing.description.trim() ? (
              <p className="lst-about">{listing.description.trim()}</p>
            ) : (
              <p className="lst-soft">{view.notAdded}</p>
            )}
          </section>

          <section className="console lst-card" aria-labelledby={whereId}>
            <h3 className="lst-card-title" id={whereId}>
              {view.where}
            </h3>
            <dl className="lst-rows">
              <Fact label={fields.street} value={listing.street} />
              <Fact label={fields.city} value={listing.city} />
              <Fact label={fields.country} value={country} />
              {/* A maps value that is not an address is still a value the
                  owner wrote, so it is shown as text rather than dropped. */}
              {!maps && <Fact label={fields.maps} value={listing.maps} />}
            </dl>
            {maps && (
              <a className="btn btn-ghost lst-maps" href={maps} target="_blank" rel="noopener noreferrer">
                <Icon name="map" size={15} />
                {view.openMaps}
              </a>
            )}
          </section>

          <section className="console lst-card" aria-labelledby={reachId}>
            <h3 className="lst-card-title" id={reachId}>
              {view.reach}
            </h3>
            <dl className="lst-rows">
              <Fact label={fields.phone} value={listing.phone} href={phoneAddress(listing.phone)} />
              <Fact label={fields.email} value={listing.email} href={mailAddress(listing.email)} />
              <Fact
                label={fields.website}
                value={listing.website}
                href={webAddress(listing.website)}
                external
              />
              <Fact
                label={fields.instagram}
                value={listing.instagram}
                href={webAddress(listing.instagram)}
                external
              />
              <Fact
                label={fields.appStore}
                value={listing.appStore}
                href={webAddress(listing.appStore)}
                external
              />
              <Fact
                label={fields.googlePlay}
                value={listing.googlePlay}
                href={webAddress(listing.googlePlay)}
                external
              />
            </dl>
          </section>

          <section className="console lst-card" aria-labelledby={spokenId}>
            <h3 className="lst-card-title" id={spokenId}>
              {fields.spoken}
            </h3>
            {listing.spoken.length > 0 ? (
              <ul className="lst-langs">
                {listing.spoken.map((code) => (
                  <li key={code} className="chip">
                    {copy.listing.spokenLanguages[SPOKEN_LANGUAGES.indexOf(code)]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lst-soft">{view.notAdded}</p>
            )}
          </section>
        </div>

        <aside className="lst-rail">
          <ReadyCard profile={listing} live={state === 'live'} />
        </aside>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────── form ── */

function ListingEditor({
  mode,
  previous,
  onCancel,
  onSaved,
}: {
  mode: 'setup' | 'profile';
  /** The listing as last read from the server for this venue, or `null`. */
  previous: ListingSource | null;
  onCancel?: () => void;
  onSaved?: (outcome: Flash, source: ListingSource | null) => void;
}) {
  const copy = useCopy();
  const fields = copy.listing.fields;
  const {
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
  } = useListingEditor({ mode, previous, onSaved });

  return (
    <div className="business-grid">
      <form
        className="business-form"
        ref={formRef}
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        {/* ── basic ── */}
        <fieldset className="form-block" data-reveal>
          <legend>{copy.listing.sections.basic}</legend>

          <Field label={fields.name} required>
            <input
              ref={nameRef}
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
                /* The server's own word stays selected, as a disabled option,
                   until the owner picks from the list — see `unmapped`. */
                value={unmapped.category !== undefined ? '' : draft.category}
                onChange={(event) =>
                  /* The subcategory list is per category, so an index carried
                     over from the previous one would point at a different
                     word — or at nothing. Reset it with the parent. */
                  change((current) => ({
                    ...current,
                    category: event.target.value as BusinessCategory,
                    subcategory: 0,
                    unmapped: without(current.unmapped, 'category', 'subcategory'),
                  }))
                }
              >
                {unmapped.category !== undefined && (
                  <option value="" disabled>
                    {wordsOf(unmapped.category)}
                  </option>
                )}
                {BUSINESS_CATEGORIES.map((category, index) => (
                  <option key={category.id} value={category.id}>
                    {copy.listing.categories[index]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={fields.subcategory}>
              <select
                value={
                  unmapped.category !== undefined || unmapped.subcategory !== undefined
                    ? ''
                    : draft.subcategory
                }
                /* A subcategory of a category the form cannot show is not a
                   choice anybody can make yet. */
                disabled={unmapped.category !== undefined}
                onChange={(event) =>
                  change((current) => ({
                    ...current,
                    subcategory: Number(event.target.value),
                    unmapped: without(current.unmapped, 'subcategory'),
                  }))
                }
              >
                {(unmapped.category !== undefined || unmapped.subcategory !== undefined) && (
                  <option value="" disabled>
                    {unmapped.subcategory ? wordsOf(unmapped.subcategory) : '—'}
                  </option>
                )}
                {/* `?? []`, because `findIndex` answers -1 for a stored
                    `category` this build no longer has. */}
                {unmapped.category === undefined &&
                  (copy.listing.subcategories[categoryIndex] ?? []).map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>

          {/* The app's Deals filter (`GET /v1/categories`). A group of chips,
              not one control, so the row is a `div`. */}
          <Field label={fields.appCategories} help={fields.appCategoriesHelp} wraps={false}>
            <AppCategoryPicker
              value={draft.tags ?? []}
              wholeLabel={fields.appCategoriesWhole}
              onChange={(tags) => change((current) => ({ ...current, tags }))}
            />
          </Field>

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

            {/* `wraps={false}`: the child is a `<label>` of its own. */}
            <Field
              label={fields.logo}
              required
              help={draft.logo && !isPicture(draft.logo) ? copy.listing.view.logoKept : fields.logoHelp}
              wraps={false}
            >
              <div className="logo-pick">
                {isPicture(draft.logo) && (
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
                  {/* "Choose" until there is one and "replace" after — the chip
                      beside it already answers "did that work". */}
                  <span>{draft.logo ? fields.logoReplace : fields.logoChoose}</span>
                </label>
                {/* Removing is only offered where a save can do it: the server
                    cannot clear a column, so a removed logo would be back on
                    the next read. */}
                {!serverBacked && isPicture(draft.logo) && (
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
                value={unmapped.country !== undefined ? '' : draft.country}
                onChange={(event) =>
                  change((current) => ({
                    ...current,
                    country: event.target.value as BusinessCountry,
                    unmapped: without(current.unmapped, 'country'),
                  }))
                }
              >
                {unmapped.country !== undefined && (
                  <option value="" disabled>
                    {unmapped.country}
                  </option>
                )}
                {BUSINESS_COUNTRIES.map((code, index) => (
                  <option key={code} value={code}>
                    {copy.listing.countries[index]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={fields.city} required>
              <input
                ref={cityRef}
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

          {/* A group of chips, not one control, so the row is a `div`. */}
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
          <button type="submit" className="btn btn-solid btn-lg" disabled={busy}>
            {busy
              ? copy.listing.view.saving
              : mode === 'setup'
                ? copy.listing.save
                : copy.listing.saveProfile}
          </button>
          {mode === 'profile' && onCancel && (
            <button type="button" className="btn btn-ghost btn-lg" disabled={busy} onClick={onCancel}>
              {copy.listing.view.cancel}
            </button>
          )}
          {refusal && (
            <span className="field-error" role="alert">
              {refusal}
            </span>
          )}
        </div>
      </form>

      <aside className="business-rail">
        <ReadyCard profile={draft} live={false} />
        <AppPreview profile={draft} />
      </aside>
    </div>
  );
}

/** The standalone route, for an owner who has just chosen their account type. */
export function BusinessSetupPage() {
  const copy = useCopy();
  /* An owner's first screen after sign-up, so the email code is asked for here
     the way the welcome flow asks a player — same step, same rule. */
  const [gate, openGate] = useEmailCodeGate();

  if (gate !== 'open') {
    return (
      <main>
        <section className="section auth" id="business-top">
          <div className="wrap auth-wrap">
            {gate === 'code' && (
              <div className="auth-card">
                <EmailCodeStep onDone={openGate} />
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="section business" id="business-top">
        <div className="wrap">
          <div className="section-head left" data-reveal>
            <span className="eyebrow">{copy.listing.setupEyebrow}</span>
            {/* `h1`, not `h2`. This is a route of its own, and a document whose
                outline starts at level two reads as a section of something
                else. The `.section-head` type comes from the class. */}
            <h1>{copy.listing.setupTitle}</h1>
            <p>{copy.listing.setupLede}</p>
          </div>
          <BusinessForm mode="setup" />
        </div>
      </section>
    </main>
  );
}
