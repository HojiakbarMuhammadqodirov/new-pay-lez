/**
 * Business profile (v3 §3.11): the listing as customers see it, and the form
 * behind one Edit button.
 *
 * ── one listing, two doors ────────────────────────────────────────────────
 *
 * `#/business/setup` and this screen edit the same record through the same
 * behaviour: `useListingEditor` (`listingEditor.ts`) owns the draft, the two
 * refusals, the local-first save and the server write, and both forms are only
 * pictures of it. The setup page keeps its own markup and must not change; this
 * one is v3's look. The view's server read and the account fold are the same
 * calls `businessSetup.tsx`'s profile mode made, so what is drawn here is what
 * the server holds.
 *
 * ── what v3 draws that this screen does not ───────────────────────────────
 *
 * - **"Your branches"**, with a manager, opening hours and Pause / Remove per
 *   branch. None of those is a column or an endpoint: a venue has no manager
 *   field, no pause the owner may press, and the listing is the account's own
 *   record rather than one per branch.
 * - **The rating line** ("★ 4.8 · 312 reviews") in the phone preview, and the
 *   note about it. No endpoint returns a venue's rating, so a number there would
 *   be invented — and the setup form's preview printing one is that form's
 *   business, not a licence for this one.
 * - **Photos.** The listing carries one image (the logo); there is nowhere to
 *   put a shop-front photo.
 * - **Fixed opening hours.** v3 (and the setup form) print three lines nobody
 *   entered. Here the hours are the server's own rows when it has any, and the
 *   block is simply absent when it does not.
 *
 * ── review is a fact, not a promise ───────────────────────────────────────
 *
 * An edit is a `PATCH`, and `partners.updateVenue` never changes a venue's
 * status, so "submitted for review" is said only when it happened: a save that
 * created the venue (which sends it), or a save that left it a `draft`, after
 * which this screen asks for the review itself — the draft's own status note
 * promises that saving sends it. Anything else is "Profile saved."
 */
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import {
  businessFromSource,
  listingState,
  mailAddress,
  phoneAddress,
  readOwnListing,
  submitForReview,
  webAddress,
  wordsOf,
  type ListingSource,
  type ListingState,
} from './api/listing';
import { hasToken } from './api/client';
import { blankBusiness, profileCompleteness, type BusinessCategory, type BusinessCountry, type BusinessProfile } from './auth/business';
import { initial as initialOf, useAuth } from './auth/context';
import { isPicture } from './auth/picture';
import { BUSINESS_CATEGORIES, BUSINESS_COUNTRIES, SPOKEN_LANGUAGES } from './content';
import { DEMO_LISTING } from './dashboardDemo';
import { Button, Card, DxIcon, Eyebrow } from './dashboardKit';
import { useOverlay } from './dashboardKitHooks';
import { useDashboard } from './dashboardShell';
import { DEMO_ACCOUNT, DEMO_MODE } from './demoMode';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';
import { useListingEditor, without, type ListingFlash } from './listingEditor';
import './dashboard-profile.css';

/**
 * What the server says about the listing — the five states `businessSetup.tsx`
 * distinguishes, for the same reason: "nothing on the server" and "the server
 * did not answer" have opposite next steps.
 */
type Remote =
  | { status: 'local' }
  | { status: 'loading' }
  | { status: 'ready'; source: ListingSource }
  | { status: 'none' }
  | { status: 'error' };

/* ══════════════════════════════════════════════════════════════ the screen ══ */

/**
 * The listing, for the venue's owner.
 *
 * The listing writes onto the signed-in account's own record as well as to the
 * server, so a manager — whose account is not the venue's — is told whose
 * listing it is instead of being handed a form that would write somebody
 * else's business onto their own profile.
 */
export function Profile() {
  const copy = useCopy().dashboard.frame;
  const { role, venues, venueId } = useDashboard();
  if (role === 'manager') {
    const name = venues.find((venue) => venue.id === venueId)?.name ?? '';
    return (
      <Card>
        <p className="dx-fine">{fill(copy.ownerOnly, { venue: name })}</p>
      </Card>
    );
  }
  return <ListingScreen />;
}

function ListingScreen() {
  const copy = useCopy();
  const [language] = useLanguage();
  const { account, saveBusiness } = useAuth();
  const { toast } = useDashboard();

  /* The demonstration account has no venue anywhere, whatever token this
     browser happens to still hold for somebody else. */
  const isDemo = account?.id === DEMO_ACCOUNT.id;
  const asks = hasToken() && !isDemo;
  /* Under `?demo=1` the demo café's listing, folded the way a real read is —
     drawn, never written into the demo account. */
  const demoSource = !asks && DEMO_MODE && isDemo ? DEMO_LISTING : null;

  const [editing, setEditing] = useState(false);
  const [remote, setRemote] = useState<Remote>(() =>
    asks ? { status: 'loading' } : demoSource ? { status: 'ready', source: demoSource } : { status: 'local' },
  );
  const [review, setReview] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);

  /* Read at arrival through refs, so the read is not re-fired by the listing it
     writes back — that write changes `venueId` the first time. */
  const heldRef = useRef(account?.business ?? null);
  useEffect(() => {
    heldRef.current = account?.business ?? null;
  }, [account?.business]);

  /*
   * Ask the server on arrival, even though sign-in already did: an operator may
   * have approved the venue since the page loaded, and "waiting for review" on
   * a listing that is live is the one line here an owner acts on.
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

  const demoBusiness = demoSource ? businessFromSource(demoSource, language, null) : null;
  const listing = account?.business ?? demoBusiness ?? blankBusiness();

  const leave = () => {
    returning.current = true;
    setEditing(false);
  };

  /** What a save turned into, said once — in the strip, or in the review dialogue. */
  const saved = async (flash: ListingFlash, source: ListingSource | null, created: boolean) => {
    leave();
    if (flash === 'device') {
      toast(copy.listing.view.savedDevice);
      return;
    }
    if (source) setRemote({ status: 'ready', source });
    if (created) {
      setReview(true);
      toast(copy.dashboard.profile.submitted);
      return;
    }
    if (source && listingState(source) === 'draft') {
      /* A draft that a save does not send is a draft for ever — see the
         header. A refusal here is not the save failing, so it falls back to
         the plain sentence rather than to an error. */
      try {
        await submitForReview(source.id);
        const read = await readOwnListing(source.id);
        if (read.state === 'ready') setRemote({ status: 'ready', source: read.source });
        setReview(true);
        toast(copy.dashboard.profile.submitted);
        return;
      } catch {
        /* fall through */
      }
    }
    toast(copy.dashboard.profile.saved);
  };

  const state: ListingState | null = remote.status === 'ready' ? listingState(remote.source) : null;
  const previous = remote.status === 'ready' && !demoSource ? remote.source : null;
  const hours = remote.status === 'ready' ? (remote.source.hours ?? []) : [];

  return (
    <div className="dx-profile">
      {editing ? (
        <Editor
          previous={previous}
          initial={demoBusiness}
          hours={hours}
          onCancel={leave}
          onSaved={(flash, source, created) => void saved(flash, source, created)}
        />
      ) : (
        <>
          <View listing={listing} remote={remote} state={state} hours={hours} editButton={editButton} onEdit={() => setEditing(true)} />
          <Rail profile={listing} live={state === 'live'} />
        </>
      )}

      {review && <ReviewDialog onClose={() => setReview(false)} />}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════ shared pieces ══ */

/** The listing's category as words: the form's own label, or the server's word when it has none. */
function useKind(listing: BusinessProfile) {
  const copy = useCopy();
  const unmapped = listing.unmapped ?? {};
  const categoryIndex = BUSINESS_CATEGORIES.findIndex((entry) => entry.id === listing.category);
  const category =
    unmapped.category !== undefined ? wordsOf(unmapped.category) : (copy.listing.categories[categoryIndex] ?? '');
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
  return { category, subcategory, country };
}

/** The listing's mark: the logo when it is a picture this site may draw, its initial otherwise. */
function Mark({ listing }: { listing: BusinessProfile }) {
  return (
    <span className="dx-profile-mark" aria-hidden>
      {isPicture(listing.logo) ? <img src={listing.logo} alt="" /> : initialOf(listing)}
    </span>
  );
}

/**
 * The week as the server holds it, one row a day, in the reader's words for
 * the day. `weekday` 0 is Monday (`venue_hours`); 1 January 2024 was one.
 */
function Hours({ hours, framed }: { hours: NonNullable<ListingSource['hours']>; framed?: boolean }) {
  const copy = useCopy();
  const dayName = new Intl.DateTimeFormat(copy.code, { weekday: 'long' });
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const rows = [...hours].sort((a, b) => a.weekday - b.weekday);
  return (
    <ul className="dx-profile-hours" data-framed={framed ? 'true' : undefined}>
      {rows.map((row) => {
        const name = dayName.format(new Date(2024, 0, 1 + row.weekday));
        const open = !row.closed && row.opensMin !== null && row.closesMin !== null;
        return (
          <li key={row.weekday}>
            <span>{name.charAt(0).toUpperCase() + name.slice(1)}</span>
            <span>{open ? `${clock(row.opensMin as number)} – ${clock(row.closesMin as number)}` : copy.dashboard.profile.closed}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ═══════════════════════════════════════════════════════════════ the view ══ */

/** One fact row: a label and the value, a link when it is one, "Not added yet" when it is missing. */
function Fact({ label, value, href, external }: { label: string; value: string; href?: string | null; external?: boolean }) {
  const copy = useCopy().listing.view;
  const text = value.trim();
  return (
    <div className="dx-profile-row">
      <dt>{label}</dt>
      <dd>
        {!text ? (
          <span className="dx-profile-soft">{copy.notAdded}</span>
        ) : href ? (
          <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {text}
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
}

/** The status pill: v3's dot-and-label, with the five states the server can be in. */
function StatusPill({ state }: { state: ListingState }) {
  const copy = useCopy().listing.view;
  return (
    <span className="dx-profile-state" data-state={state}>
      <i aria-hidden />
      {copy.status[state]}
    </span>
  );
}

function View({
  listing,
  remote,
  state,
  hours,
  editButton,
  onEdit,
}: {
  listing: BusinessProfile;
  remote: Remote;
  state: ListingState | null;
  hours: NonNullable<ListingSource['hours']>;
  editButton: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
}) {
  const copy = useCopy();
  const view = copy.listing.view;
  const fields = copy.listing.fields;
  const mine = copy.dashboard.profile;
  const titleId = useId();
  const { category, subcategory, country } = useKind(listing);

  const reviewerNote = remote.status === 'ready' && state === 'rejected' ? remote.source.verification?.note : null;
  const statusLine =
    remote.status === 'loading'
      ? view.statusChecking
      : remote.status === 'error'
        ? view.statusUnknown
        : remote.status === 'ready' && state
          ? view.statusNote[state]
          : view.statusLocal;

  const maps = webAddress(listing.maps);

  return (
    <div className="dx-profile-main">
      <Card className="dx-profile-head" aria-label={listing.name || view.notAdded}>
        <div className="dx-profile-id">
          <Mark listing={listing} />
          <div>
            <h2 id={titleId}>{listing.name.trim() || <span className="dx-profile-soft">{view.notAdded}</span>}</h2>
            {category && <p>{[category, subcategory].filter(Boolean).join(' → ')}</p>}
            {state && <StatusPill state={state} />}
          </div>
          {/* The one control on this screen that changes the listing — the
              kit's primary press drawn by hand, because focus comes back here
              when the editor closes and the kit's Button takes no ref. */}
          <button ref={editButton} type="button" className="dx-btn" data-variant="primary" onClick={onEdit}>
            <DxIcon name="pencil" size={15} strokeWidth={2} />
            {view.edit}
          </button>
        </div>
        <p className="dx-profile-note">
          {statusLine}
          {/* The reviewer's own words, when there are any: they are the one
              thing that says what to change. */}
          {reviewerNote ? (
            <>
              {' '}
              <q>{reviewerNote}</q>
            </>
          ) : null}
        </p>
      </Card>

      <Card className="dx-profile-sect">
        <Eyebrow>{view.about}</Eyebrow>
        {listing.description.trim() ? (
          <p className="dx-profile-about">{listing.description.trim()}</p>
        ) : (
          <p className="dx-profile-about dx-profile-soft">{view.notAdded}</p>
        )}
        <dl className="dx-profile-rows" data-rule="top">
          <Fact label={fields.price} value={listing.price} />
          <div className="dx-profile-row">
            <dt>{fields.logo}</dt>
            <dd>{listing.logo ? mine.logoSet : <span className="dx-profile-soft">{mine.logoNone}</span>}</dd>
          </div>
        </dl>
      </Card>

      <Card className="dx-profile-sect">
        <Eyebrow>{view.where}</Eyebrow>
        <dl className="dx-profile-rows">
          <Fact label={fields.street} value={listing.street} />
          <Fact label={fields.city} value={listing.city} />
          <Fact label={fields.country} value={country} />
          {/* A maps value that is not an address is still a value the owner
              wrote, so it is shown as text rather than dropped. */}
          {!maps && <Fact label={fields.maps} value={listing.maps} />}
        </dl>
        {maps && (
          <a className="dx-btn dx-profile-maps" data-variant="secondary" href={maps} target="_blank" rel="noopener noreferrer">
            <DxIcon name="pin" size={15} strokeWidth={2} />
            {view.openMaps}
          </a>
        )}
      </Card>

      <Card className="dx-profile-sect">
        <Eyebrow>{view.reach}</Eyebrow>
        <dl className="dx-profile-rows">
          <Fact label={fields.phone} value={listing.phone} href={phoneAddress(listing.phone)} />
          <Fact label={fields.email} value={listing.email} href={mailAddress(listing.email)} />
          <Fact label={fields.website} value={listing.website} href={webAddress(listing.website)} external />
          <Fact label={fields.instagram} value={listing.instagram} href={webAddress(listing.instagram)} external />
          {/* The two store links only when there are any: they are optional and
              most venues have no app of their own. */}
          {listing.appStore.trim() && (
            <Fact label={fields.appStore} value={listing.appStore} href={webAddress(listing.appStore)} external />
          )}
          {listing.googlePlay.trim() && (
            <Fact label={fields.googlePlay} value={listing.googlePlay} href={webAddress(listing.googlePlay)} external />
          )}
        </dl>
      </Card>

      <Card className="dx-profile-sect">
        <Eyebrow>{copy.listing.sections.service}</Eyebrow>
        <span className="dx-profile-sublabel">{mine.langs}</span>
        {listing.spoken.length > 0 ? (
          <ul className="dx-profile-langs">
            {listing.spoken.map((code) => (
              <li key={code}>{copy.listing.spokenLanguages[SPOKEN_LANGUAGES.indexOf(code)]}</li>
            ))}
          </ul>
        ) : (
          <p className="dx-profile-soft">{view.notAdded}</p>
        )}
        {hours.length > 0 && (
          <>
            <span className="dx-profile-sublabel" data-gap="true">
              {fields.hours}
            </span>
            <Hours hours={hours} />
          </>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ the rail ══ */

/** "Ready to go live" and the phone, for a listing or for the draft being typed. */
function Rail({ profile, live }: { profile: BusinessProfile; live: boolean }) {
  const copy = useCopy();
  const labels = copy.listing.fields;
  const ready = profileCompleteness(profile);
  const preview = copy.listing.preview;
  const { subcategory, category } = useKind(profile);

  /* Field id → the label the form shows, so "still needed" and the form agree
     on what a thing is called. A field the map does not know is dropped
     rather than printed as its id. */
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
  const where = [profile.street, profile.city].filter((part) => part.trim()).join(', ');
  const kind = subcategory || category;
  const mark = isPicture(profile.logo) ? profile.logo : '';

  return (
    <aside className="dx-profile-rail">
      <Card className="dx-profile-ready">
        <div className="dx-profile-ready-head">
          <b>{copy.listing.ready.title}</b>
          <strong>{`${ready.percent}%`}</strong>
        </div>
        <span className="dx-profile-meter" aria-hidden>
          <i style={{ width: `${ready.percent}%` }} />
        </span>
        {ready.missing.length > 0 ? (
          <>
            <span className="dx-profile-still">{copy.listing.ready.stillNeeded}</span>
            <ul className="dx-profile-missing">
              {ready.missing
                .filter((field) => naming[field])
                .map((field) => (
                  <li key={field}>{naming[field]}</li>
                ))}
            </ul>
          </>
        ) : (
          <p className="dx-fine">{live ? copy.listing.ready.done : copy.listing.view.readyDone}</p>
        )}
      </Card>

      <Card className="dx-profile-app">
        <Eyebrow tone="faint">{preview.title}</Eyebrow>
        <div className="dx-profile-phone">
          <div>
            <div className="dx-profile-cover" data-has-logo={mark ? 'true' : undefined}>
              {mark ? <img src={mark} alt="" /> : preview.cover}
            </div>
            <div className="dx-profile-phone-body">
              <b>{profile.name.trim() || preview.name}</b>
              <span>
                {[kind, where || preview.address].filter(Boolean).join(' · ')}
              </span>
              {/* No rating: nothing returns one, so the line carries only what
                  the owner wrote. */}
              <em>{profile.price.trim() || preview.price}</em>
              <p>{profile.description.trim() || preview.description}</p>
              {profile.spoken.length > 0 && (
                <ul>
                  {profile.spoken.map((code) => (
                    <li key={code}>{copy.listing.spokenLanguages[SPOKEN_LANGUAGES.indexOf(code)]}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Card>
    </aside>
  );
}

/* ═════════════════════════════════════════════════════════════ the editor ══ */

/** One labelled row of v3's form: 12.5/700 label, a deep star, the control, a help line. */
function Row({
  label,
  required,
  help,
  error,
  wraps = true,
  children,
}: {
  label: string;
  required?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  /** `false` when the child is not one control — the logo picker, the chips. */
  wraps?: boolean;
  children: ReactNode;
}) {
  const Tag = wraps ? 'label' : 'div';
  return (
    <Tag className="dx-profile-field">
      <span className="dx-profile-label">
        {label}
        {/* Decorative: `required` on the control is what a screen reader says. */}
        {required && <i aria-hidden> *</i>}
      </span>
      {children}
      {error ? (
        <span className="dx-field-error" role="alert">
          {error}
        </span>
      ) : help ? (
        <span className="dx-profile-help">{help}</span>
      ) : null}
    </Tag>
  );
}

function Editor({
  previous,
  initial,
  hours,
  onCancel,
  onSaved,
}: {
  previous: ListingSource | null;
  initial: BusinessProfile | null;
  hours: NonNullable<ListingSource['hours']>;
  onCancel: () => void;
  onSaved: (flash: ListingFlash, source: ListingSource | null, created: boolean) => void;
}) {
  const copy = useCopy();
  const fields = copy.listing.fields;
  const mine = copy.dashboard.profile;
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
  } = useListingEditor({ mode: 'profile', previous, initial, onSaved });

  return (
    <>
      <Card className="dx-profile-edit">
        <form ref={formRef} onSubmit={(event) => void onSubmit(event)} noValidate>
          <div className="dx-profile-edit-head">
            <h2>{mine.editTitle}</h2>
            <button type="button" className="dx-profile-cancel" disabled={busy} onClick={onCancel}>
              {copy.listing.view.cancel}
            </button>
          </div>
          <p className="dx-profile-intro">{mine.editIntro}</p>

          {/* ── basic ── */}
          <fieldset>
            <legend>
              <Eyebrow tone="faint">{copy.listing.sections.basic}</Eyebrow>
            </legend>

            <Row label={fields.name} required>
              <input
                ref={nameRef}
                className="dx-input"
                type="text"
                required
                placeholder={fields.namePlaceholder}
                value={draft.name}
                onChange={text('name')}
              />
            </Row>

            <div className="dx-profile-pair">
              <Row label={fields.category} required>
                <select
                  className="dx-input"
                  /* The server's own word stays selected, as a disabled option,
                     until the owner picks from the list — see `unmapped`. */
                  value={unmapped.category !== undefined ? '' : draft.category}
                  onChange={(event) =>
                    /* The subcategory list is per category; an index carried
                       over would point at a different word. */
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
              </Row>

              <Row label={fields.subcategory}>
                <select
                  className="dx-input"
                  value={unmapped.category !== undefined || unmapped.subcategory !== undefined ? '' : draft.subcategory}
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
                  {unmapped.category === undefined &&
                    (copy.listing.subcategories[categoryIndex] ?? []).map((name, index) => (
                      <option key={name} value={index}>
                        {name}
                      </option>
                    ))}
                </select>
              </Row>
            </div>

            <Row label={fields.description} required help={fields.descriptionHelp}>
              <textarea
                className="dx-input"
                rows={4}
                required
                placeholder={fields.descriptionPlaceholder}
                value={draft.description}
                onChange={text('description')}
              />
            </Row>

            <div className="dx-profile-pair">
              <Row label={fields.price} required help={fields.priceHelp}>
                <input
                  className="dx-input"
                  type="text"
                  placeholder={fields.pricePlaceholder}
                  value={draft.price}
                  onChange={text('price')}
                />
              </Row>

              <Row label={fields.logo} required wraps={false}>
                {/* The whole dashed well is the file picker's label. */}
                <label className="dx-profile-logo">
                  <input type="file" accept="image/*" onChange={(event) => void pickLogo(event.target)} />
                  <span className="dx-profile-logo-chip" aria-hidden>
                    {isPicture(draft.logo) ? <img src={draft.logo} alt="" /> : <DxIcon name="card" size={14} strokeWidth={2} />}
                  </span>
                  <span>
                    <b>{draft.logo ? fields.logoReplace : fields.logoChoose}</b>
                    <em>{draft.logo && !isPicture(draft.logo) ? copy.listing.view.logoKept : fields.logoHelp}</em>
                  </span>
                </label>
                {/* Removing is only offered where a save can do it: the server
                    cannot clear the column, so a removed logo would come back. */}
                {!serverBacked && isPicture(draft.logo) && (
                  <button type="button" className="dx-profile-toggle" onClick={() => set('logo', '')}>
                    {fields.logoRemove}
                  </button>
                )}
              </Row>
            </div>
          </fieldset>

          {/* ── where ── */}
          <fieldset>
            <legend>
              <Eyebrow tone="faint">{copy.listing.sections.where}</Eyebrow>
            </legend>

            <div className="dx-profile-pair">
              <Row label={fields.country} required>
                <select
                  className="dx-input"
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
              </Row>

              <Row label={fields.city} required>
                <input
                  ref={cityRef}
                  className="dx-input"
                  type="text"
                  required
                  placeholder={fields.cityPlaceholder}
                  value={draft.city}
                  onChange={text('city')}
                />
              </Row>
            </div>

            <Row label={fields.street} required>
              <input
                className="dx-input"
                type="text"
                required
                placeholder={fields.streetPlaceholder}
                value={draft.street}
                onChange={text('street')}
              />
            </Row>

            <Row label={fields.maps} required help={fields.mapsHelp}>
              <input
                className="dx-input"
                type="url"
                placeholder="https://maps.google.com/..."
                value={draft.maps}
                onChange={text('maps')}
              />
            </Row>
          </fieldset>

          {/* ── reach ── */}
          <fieldset>
            <legend>
              <Eyebrow tone="faint">{copy.listing.sections.reach}</Eyebrow>
            </legend>

            <div className="dx-profile-pair">
              <Row label={fields.phone} required>
                <input
                  className="dx-input"
                  type="tel"
                  required
                  placeholder={fields.phonePlaceholder}
                  value={draft.phone}
                  onChange={text('phone')}
                />
              </Row>

              <Row label={fields.email} required error={emailBad ? fields.emailError : undefined}>
                <input
                  className="dx-input"
                  type="email"
                  required
                  placeholder={fields.emailPlaceholder}
                  value={draft.email}
                  onChange={text('email')}
                  aria-invalid={emailBad || undefined}
                />
              </Row>
            </div>

            <div className="dx-profile-pair">
              <Row label={fields.website}>
                <input
                  className="dx-input"
                  type="url"
                  placeholder="https://..."
                  value={draft.website}
                  onChange={text('website')}
                />
              </Row>

              <Row label={fields.instagram}>
                <input
                  className="dx-input"
                  type="url"
                  placeholder="https://instagram.com/..."
                  value={draft.instagram}
                  onChange={text('instagram')}
                />
              </Row>
            </div>

            {appLinks && (
              <div className="dx-profile-pair">
                <Row label={fields.appStore}>
                  <input
                    className="dx-input"
                    type="url"
                    placeholder="https://apps.apple.com/..."
                    value={draft.appStore}
                    onChange={text('appStore')}
                  />
                </Row>

                <Row label={fields.googlePlay}>
                  <input
                    className="dx-input"
                    type="url"
                    placeholder="https://play.google.com/..."
                    value={draft.googlePlay}
                    onChange={text('googlePlay')}
                  />
                </Row>
              </div>
            )}

            <button type="button" className="dx-profile-toggle" onClick={() => setAppLinks((on) => !on)}>
              {appLinks ? fields.appLinksHide : fields.appLinksShow}
            </button>
          </fieldset>

          {/* ── service ── */}
          <fieldset>
            <legend>
              <Eyebrow tone="faint">{copy.listing.sections.service}</Eyebrow>
            </legend>

            <Row label={fields.spoken} wraps={false}>
              <div className="dx-profile-chips">
                {SPOKEN_LANGUAGES.map((code, index) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={draft.spoken.includes(code)}
                    onClick={() => toggleSpoken(code)}
                  >
                    {copy.listing.spokenLanguages[index]}
                  </button>
                ))}
              </div>
            </Row>

            {/* Read-only, as v3 draws them, and only the server's own: no form
                here writes hours, and three fixed lines would be a week nobody
                entered. */}
            {hours.length > 0 && (
              <Row label={fields.hours} wraps={false}>
                <Hours hours={hours} framed />
              </Row>
            )}
          </fieldset>

          <div className="dx-profile-foot">
            {refusal && (
              <span className="dx-field-error" role="alert">
                {refusal}
              </span>
            )}
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              {copy.listing.view.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? copy.listing.view.saving : copy.listing.saveProfile}
            </Button>
          </div>
        </form>
      </Card>

      {/* The meter and the phone move with the draft, on every keystroke. */}
      <Rail profile={draft} live={false} />
    </>
  );
}

/* ═════════════════════════════════════════════════════ the review dialogue ══ */

/** v3 §5.6 — said only after a save that really sent the listing for review. */
function ReviewDialog({ onClose }: { onClose: () => void }) {
  const copy = useCopy().dashboard;
  const mine = copy.profile.review;
  const { overlayRoot } = useDashboard();
  const panel = useOverlay<HTMLDivElement>(onClose);
  const titleId = useId();

  const body = (
    <div className="dx-overlay" data-kind="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="dx-scrim" aria-label={copy.drawer.close} onClick={onClose} />
      <div className="dx-profile-review" ref={panel} tabIndex={-1}>
        <span className="dx-profile-review-ico" aria-hidden>
          <DxIcon name="shield" size={28} strokeWidth={2} />
        </span>
        <h2 id={titleId}>{mine.title}</h2>
        <p>{mine.body}</p>
        <div className="dx-profile-review-next">
          <b>
            <DxIcon name="info" size={15} strokeWidth={2} />
            {mine.nextTitle}
          </b>
          <ul>
            {mine.next.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <Button variant="primary" block onClick={onClose}>
          {mine.done}
        </Button>
      </div>
    </div>
  );
  return overlayRoot ? createPortal(body, overlayRoot) : body;
}
