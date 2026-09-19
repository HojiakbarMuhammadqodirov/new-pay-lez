import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as KeyboardEventOf,
  type ReactNode,
  type RefObject,
} from 'react';
import { Icon } from './icons';
import {
  lookupCity,
  matchCities,
  stopSharing,
  useCities,
  useConsents,
  type City,
  type CityList,
  type SharingGrant,
} from './api/profile';
import { hasToken } from './api/client';
import { useAuth, type ProfileResult, type UserProfile } from './auth/context';
import { AVATAR_PX, toSquareDataUrl } from './imageFile';
import { Face } from './auth/Avatar';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';
import { ENERGY_REGEN_MINUTES, MAX_ENERGY, energyOf, type PlayerState } from './auth/player';
import { isPicture } from './auth/picture';
import { setLeaderboardOptIn, setVenueSharingDefault } from './api/consumer';
import {
  BIRTH_DATE_WRITES,
  OCCUPATIONS,
  USERNAME_MAX,
  USERNAME_MIN,
  isOccupation,
  PROFILE_BONUS,
  type ProfileField,
  profileGaps,
  profilePercent,
  type Occupation,
} from './auth/users';

/**
 * `#/profile` — the seven things a person tells us about themselves, **shown
 * first and edited second**.
 *
 * Photo, username, status, city, email, phone, birthday. It is the same set the
 * server's `updateProfile` writes, and the server is now where it is kept: a
 * save is `PATCH /v1/me`, the page draws what the server answered, and a venue
 * this person pays at sees the same name and photo they see here.
 *
 * ── a page, not a form ───────────────────────────────────────────────────
 *
 * It opened as a form, which is the wrong first answer to "what does my account
 * look like": seven wells with a caret in the first one reads as a task, and
 * the part somebody actually opened the page to check — what other people see —
 * sat in a card in the margin. So it opens on the record: a card with the face,
 * the name, the handle and the plan; the answers as rows, with "Not added yet"
 * rather than blank space where one is missing; the meter; and which venues
 * can see who this is. **One** control changes any of it — Edit — and it turns
 * the page into the form, with Save and Cancel, and back.
 *
 * Three of the seven have rules that are not "is it a string", and all three
 * are explained on the form rather than discovered by being refused:
 *
 * - **The username is unique.** The server's table decides, and a clash comes
 *   back naming the field.
 * - **The city is suggested, not dictated.** `GET /v1/cities` feeds a combobox,
 *   because a leaderboard groups on this string with a literal `=`. An unknown
 *   city is accepted **with its country's two-letter code beside it** — the
 *   rule `PATCH /v1/me` enforces — and the one state the form refuses to submit
 *   is a city nobody can place.
 * - **The birthday may be set and then corrected once.** The count is shown
 *   before it is spent, and when it runs out the field becomes the date and a
 *   sentence, because a control that cannot work is worse than no control.
 *
 * And the thing the page says out loud: **nothing here is verified.** No code is
 * sent to the number and no link is clicked in the address.
 *
 * ── what replaced the line about you ─────────────────────────────────────
 *
 * There was a 140-character free line here. `occupation` — one of five values,
 * labelled **Status** — is in its place, because nothing could *read* a line: a
 * venue choosing who to send an offer to can act on "students, on a Tuesday",
 * and it cannot act on a sentence about filter coffee.
 */

/*
 * The two bounds the form's sentences quote, as strings — written once so a
 * rule stated in a help line and refused by a validator quote the same number.
 */
const MIN = String(USERNAME_MIN);
const MAX = String(USERNAME_MAX);

/** The page's own slice of the dictionary, for the helpers below it. */
type ProfileCopy = ReturnType<typeof useCopy>['profile'];

/* ──────────────────────────────────────────────────────────────── photo ── */

/** A picked file as a small square data URL. The work is in `imageFile.ts`. */
const toAvatar = (file: File): Promise<string | null> => toSquareDataUrl(file, AVATAR_PX);

/* ─────────────────────────────────────────────────────────────── the kit ── */

/**
 * One row of the field kit — the same shape `businessSetup.tsx` uses. A
 * `<label>` wraps its one control without needing an id at both ends, and
 * `wraps={false}` renders a `<div>` for the rows whose child is *itself* a label
 * (the file picker), is a button, or is not a control at all. Nesting `<label>`
 * is invalid, and browsers agree on what it costs: the outer one's implicit
 * control resolves to the inner input.
 */
function Field({
  label,
  labelId,
  field,
  help,
  error,
  wraps = true,
  children,
}: {
  label: string;
  /**
   * The id to put on the caption, for a `wraps={false}` row whose child *is* a
   * control — the status button and the city combobox point at it with
   * `aria-labelledby`, or they announce as "Student, collapsed" with no word
   * saying what Student is an answer to.
   */
  labelId?: string;
  /** Which answer this row is, so the meter and a refusal can jump to it. */
  field?: ProfileField | 'country';
  help?: ReactNode;
  error?: string;
  wraps?: boolean;
  children: ReactNode;
}) {
  const Row = wraps ? 'label' : 'div';
  return (
    <Row className="field" data-field={field}>
      <span className="field-label" id={labelId}>
        {label}
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

/* ─────────────────────────────────────────────────────── the menu, twice ── */

/**
 * Close on an outside press, and on Escape. `restore` is what the header's
 * version calls the same argument: closing unmounts whatever holds focus, so
 * Escape puts focus back, and an outside press does not, because there the
 * visitor has just aimed at some other control.
 */
function useDismiss(
  open: boolean,
  close: (restore: boolean) => void,
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return ref;
}

/**
 * Status — the five-value menu.
 *
 * The header's language picker with a different trigger: `.lang-menu` owning
 * `role="option"` children directly. The trigger looks like the field kit's
 * `<select>` well because it stands in a row with real fields — `.prof-select`
 * is that well on a button, and `site.css` says why it could not simply be a
 * `<select>`. The options are real buttons and therefore focusable, which is
 * right for a menu: the reader tabs into it, and Escape hands focus back.
 */
function StatusMenu({
  copy,
  labelId,
  value,
  onPick,
}: {
  copy: ProfileCopy;
  labelId: string;
  value: Occupation | '';
  onPick: (next: Occupation) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selfId = useId();

  const close = useCallback((restore: boolean) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }, []);
  const ref = useDismiss(open, close);

  return (
    <div className="prof-menu-host" ref={ref}>
      <button
        ref={trigger}
        id={selfId}
        type="button"
        className="prof-select"
        data-empty={value ? undefined : 'true'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        /* The caption, then the button's own text: "Status, Student". An
           `aria-label` would have *replaced* the value with the caption. */
        aria-labelledby={`${labelId} ${selfId}`}
        onClick={() => setOpen((was) => !was)}
      >
        {value ? copy.occupations[value] : copy.statusChoose}
        <Icon name="chevron" size={13} strokeWidth={2.2} className="lang-caret" />
      </button>

      {open && (
        <div
          className="lang-menu prof-menu"
          id={listId}
          role="listbox"
          aria-label={copy.statusMenu}
        >
          {OCCUPATIONS.map((code) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={code === value}
              className="lang-option"
              data-on={code === value ? 'true' : undefined}
              onClick={() => {
                onPick(code);
                close(true);
              }}
            >
              {copy.occupations[code]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** What the city field hands back: a known city, or the way out of the list. */
type CityPick = { kind: 'city'; city: City } | { kind: 'other' };

/**
 * City — the same menu, driven by an `<input>` instead of a button.
 *
 * A real combobox, because the thing being chosen from is 114 entries long and
 * the only way to get to Zielona Gora in one gesture is to type "zie". The
 * options are **not focusable** — focus has to stay in the input while the
 * reader types — so the list is walked with `aria-activedescendant`:
 *
 *   ↓ / ↑    open the list, then walk it, wrapping at both ends.
 *   Enter    take the pointed-at row; `preventDefault` so a submit does not
 *            fire on the same keystroke that chose a city.
 *   Escape   close and keep what was typed. Handled by `useDismiss`.
 *   Tab      **not touched.** A menu that swallows Tab is a trap.
 */
function CityCombo({
  copy,
  labelId,
  list,
  value,
  onType,
  onPick,
  invalid,
}: {
  copy: ProfileCopy;
  labelId: string;
  /** `null` while the request is in flight or has failed. */
  list: CityList | null;
  value: string;
  onType: (next: string) => void;
  onPick: (pick: CityPick) => void;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const rowId = useId();

  const close = useCallback((restore: boolean) => {
    setOpen(false);
    if (restore) input.current?.focus();
  }, []);
  const ref = useDismiss(open, close);

  /* Suggestions, plus the way out — always offered, because "Berlin" is a city
     in a country the list lacks only if somebody says so. */
  const rows: CityPick[] = useMemo(() => {
    const cities = list ? matchCities(list, value) : [];
    return [...cities.map((city): CityPick => ({ kind: 'city', city })), { kind: 'other' }];
  }, [list, value]);

  /* Typing moves the cursor back to the top: the row that was pointed at
     belonged to the previous query. */
  const show = (next: boolean) => {
    setOpen(next);
    if (next) setAt(0);
  };

  const take = (index: number) => {
    const row = rows[index];
    if (!row) return;
    onPick(row);
    close(true);
  };

  const onKeyDown = (event: KeyboardEventOf<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        show(true);
        if (event.key === 'ArrowUp') setAt(rows.length - 1);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setAt((now) => (now + step + rows.length) % rows.length);
      return;
    }
    if (event.key === 'Enter' && open) {
      /* Only when the list is open. A closed combobox is a text field, and
         Enter in a text field submits the form. */
      event.preventDefault();
      take(at);
    }
  };

  return (
    <div className="prof-menu-host" ref={ref}>
      <input
        ref={input}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder={copy.cityPlaceholder}
        value={value}
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${rowId}-${at}` : undefined}
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => {
          onType(event.target.value);
          show(true);
        }}
        onFocus={() => show(true)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <div
          className="lang-menu prof-menu"
          id={listId}
          role="listbox"
          aria-label={copy.cityMenu}
        >
          {rows.map((row, index) => (
            <div
              key={row.kind === 'city' ? row.city.name : 'other'}
              id={`${rowId}-${index}`}
              role="option"
              aria-selected={index === at}
              className={
                row.kind === 'other' ? 'lang-option prof-opt-other' : 'lang-option'
              }
              data-active={index === at ? 'true' : undefined}
              data-on={
                row.kind === 'city' && row.city.name === value ? 'true' : undefined
              }
              /* Keeps focus in the input so the menu survives long enough for
                 the click above it to land. */
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => take(index)}
              onMouseEnter={() => setAt(index)}
            >
              {row.kind === 'other' ? (
                <>
                  <Icon name="plus" size={14} strokeWidth={2.4} />
                  {copy.cityOther}
                </>
              ) : (
                <>
                  {row.city.name}
                  <span className="lang-code prof-opt-place">
                    {row.city.country}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── page ── */

/** Where the last save put the answers — the one thing the view has to say. */
type Flash = 'server' | 'device';

export function ProfilePage() {
  const { account } = useAuth();
  const copy = useCopy().profile;
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  /* The celebration. Opened by the save that finishes the profile and closed by
     the reader — never re-opened, because the stamp is set from then on. */
  const [won, setWon] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);

  /*
   * Focus follows the mode, both ways. The editor puts it in the first field
   * when it opens; leaving the editor unmounts whatever held it, which would
   * drop it on `<body>` and restart the next Tab at the top of the document —
   * so it goes back to the button that opened the editor, which is also the
   * button a second edit starts from.
   */
  useEffect(() => {
    if (editing || !returning.current) return;
    returning.current = false;
    editButton.current?.focus();
  }, [editing]);

  if (!account) return null;

  const leave = (next: Flash | null) => {
    returning.current = true;
    setFlash(next);
    setEditing(false);
  };

  return (
    <main>
      <section className="section prof" id="profile-top">
        <div className="wrap">
          <div className="section-head left" data-reveal>
            <span className="eyebrow">{copy.eyebrow}</span>
            {/* `h1`, not `h2`: this is a route of its own. */}
            <h1>{copy.title}</h1>
            <p>{copy.lede}</p>
          </div>

          {/* A live region that is always there, so the confirmation is
              announced: a region mounted together with its text is one many
              screen readers never read. Empty collapses it. */}
          <p className="prof-flash" data-tone={flash ?? undefined} role="status">
            {flash === 'server' ? (
              <>
                <Icon name="check" size={15} strokeWidth={3} />
                <span>{copy.savedServer}</span>
              </>
            ) : flash === 'device' ? (
              <>
                <Icon name="warn" size={15} />
                <span>{copy.savedDevice}</span>
              </>
            ) : null}
          </p>

          {editing ? (
            <ProfileEditor
              onCancel={() => leave(null)}
              onSaved={(result) => {
                if (result.completed) setWon(true);
                leave(result.where);
              }}
            />
          ) : (
            <ProfileView
              editButton={editButton}
              onEdit={() => {
                setFlash(null);
                setWon(false);
                setEditing(true);
              }}
            />
          )}

          {/*
            The board's opt-out, under both halves of the page rather than
            inside the form — see `BoardVisibility` for why a visibility switch
            applies on the flip rather than on a Save.
          */}
          <BoardVisibility />
          <VenueSharing />

          {/*
            The moment it lands, over the page rather than in a rail: on a phone
            the rail is below the form, and the one moment worth noticing would
            happen off-screen. Dismissed by the reader, never by a timer, and
            `role="status"` because it is good news beside the thing that caused
            it, not an error interrupting a task.
          */}
          {won && (
            <div className="console prof-won" role="status">
              <span className="prof-won-mark" aria-hidden>
                <Icon name="trophy" size={22} strokeWidth={2.2} />
              </span>
              <b>{copy.wonTitle}</b>
              <p>{fill(copy.wonBody, { points: String(PROFILE_BONUS) })}</p>
              <button type="button" className="btn btn-solid" onClick={() => setWon(false)}>
                {copy.wonClose}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

/* ──────────────────────────────────────────────────── on the board ── */

/**
 * "Show me on the weekly board" — the opt-out.
 *
 * ## Why it is here and why it is not in the form
 *
 * The board's opt-in is **on by default** now, and the server is where that is
 * decided (the column's own default, plus a one-off migration for the rows that
 * predate it). A default nobody can turn off is not a default, it is a rule —
 * and the phone and the API have always had this switch while this client did
 * not, so turning the default on without adding it here would have been a
 * privacy change dressed as a product one.
 *
 * It is **not** part of the profile form, and that is an interaction decision:
 * a visibility switch applies when you flip it. "Hide me" followed by a Save
 * button is a switch that has not done anything yet, which is the worst state
 * for the one control on this page that is about other people seeing you.
 *
 * ## The three states it has to draw
 *
 * `leaderboardOptIn` is `null` until `GET /v1/me` answers, and a switch drawn
 * *off* in the meantime is a switch that lies about somebody — so it is
 * disabled and unknown rather than guessed. That is the same rule `plan` states
 * for the header badge: falling back to a default would label somebody wrongly
 * every time a request was slow.
 *
 * A failure puts it back. The switch shows the server's answer and nothing
 * else, so a flip that did not land has to be visibly undone rather than left
 * looking applied — which is the whole reason this reads `leaderboardOptIn`
 * from the session after the call instead of holding its own copy.
 */
function BoardVisibility() {
  const copy = useCopy().profile.board;
  const { leaderboardOptIn, refreshAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const known = leaderboardOptIn !== null;

  return (
    <div className="prof-switch-row" data-reveal>
      <div>
        <b>{copy.title}</b>
        <span className="field-help">{copy.help}</span>
        {failed && (
          <span className="field-error" role="alert">
            {copy.failed}
          </span>
        )}
      </div>
      <label className="prof-switch">
        <input
          type="checkbox"
          checked={leaderboardOptIn === true}
          disabled={busy || !known}
          onChange={(event) => {
            const next = event.target.checked;
            setBusy(true);
            setFailed(false);
            setLeaderboardOptIn(next)
              /* The session is re-read rather than patched locally: one source
                 of truth, so the board's own screen and this switch cannot
                 disagree about what the server was told. */
              .then(() => refreshAccount())
              .catch(() => setFailed(true))
              .finally(() => setBusy(false));
          }}
        />
        <i aria-hidden />
        <span className="visually-hidden">{copy.title}</span>
      </label>
    </div>
  );
}

/**
 * "Share my profile with the venues I visit" — §1.4's standing answer.
 *
 * ## What it does and, more importantly, what it is not
 *
 * §1.4's consent is **per venue**: one row per (person, venue), and every
 * identified-customer query on the server joins against it in SQL. That gate is
 * unchanged, and this switch does not bypass it.
 *
 * What it decides is *when a grant is written*. It used to require the player
 * to find a switch on a venue's own sheet and press it, so a venue's customer
 * list was empty of everybody who had never gone looking — the dashboard read
 * "nobody comes here twice" when it meant "nobody pressed a button". On, a
 * grant is written when a visit is **confirmed at the till**; off, none is.
 *
 * ## Switching it off does not withdraw anything
 *
 * And the help line says so, because it is the one thing about this control
 * that is not obvious and the one thing somebody could get wrong in the
 * direction that matters. The grants that stand are about venues somebody has
 * actually been to; declining future ones is a different decision from
 * withdrawing the ones they made. Each of those comes off on that venue's own
 * sheet, where it is next to the thing it is about.
 */
function VenueSharing() {
  const copy = useCopy().profile.sharing;
  const { venueSharingDefault, refreshAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const known = venueSharingDefault !== null;

  return (
    <div className="prof-switch-row" data-reveal>
      <div>
        <b>{copy.title}</b>
        <span className="field-help">{copy.help}</span>
        {failed && (
          <span className="field-error" role="alert">
            {copy.failed}
          </span>
        )}
      </div>
      <label className="prof-switch">
        <input
          type="checkbox"
          checked={venueSharingDefault === true}
          disabled={busy || !known}
          onChange={(event) => {
            const next = event.target.checked;
            setBusy(true);
            setFailed(false);
            setVenueSharingDefault(next)
              .then(() => refreshAccount())
              .catch(() => setFailed(true))
              .finally(() => setBusy(false));
          }}
        />
        <i aria-hidden />
        <span className="visually-hidden">{copy.title}</span>
      </label>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── view mode ── */

/**
 * The record, as it stands.
 *
 * Everything here is the *saved* profile — the view answers "what do other
 * people see", and nobody sees a draft. A missing answer is a soft "Not added
 * yet" rather than an empty cell, because a blank beside "Phone" reads as a
 * rendering fault and a sentence reads as a fact.
 */
function ProfileView({
  editButton,
  onEdit,
}: {
  editButton: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
}) {
  const { account, plan, memberSince } = useAuth();
  const copy = useCopy().profile;
  const [language] = useLanguage();
  const nameId = useId();
  const aboutId = useId();

  if (!account) return null;
  const profile = account.profile;
  const gaps = profileGaps(profile, account.email);
  const percent = profilePercent(profile, account.email);
  /* The stamp, not the gaps: the bonus is paid once and the seven stay
     editable, so a profile can be complete-and-paid or incomplete-but-paid. */
  const paid = account.profileCompletedAt !== null;
  const role = isOccupation(profile.occupation) ? profile.occupation : null;

  const rows: Array<{ key: string; label: string; value: string }> = [
    { key: 'status', label: copy.status, value: role ? copy.occupations[role] : '' },
    {
      key: 'city',
      label: copy.city,
      value: profile.city
        ? [profile.city, profile.countryCode && countryName(copy, profile.countryCode)]
            .filter(Boolean)
            .join(', ')
        : '',
    },
    { key: 'email', label: copy.email, value: account.email },
    { key: 'phone', label: copy.phone, value: profile.phone },
    {
      key: 'birthday',
      label: copy.birthday,
      value: profile.birthDate ? formatDay(language, profile.birthDate) : '',
    },
  ];

  return (
    <div className="prof-view">
      <section className="console prof-id" aria-labelledby={nameId}>
        <span className="prof-avatar prof-avatar-xl" aria-hidden>
          <Face name={account.name} photo={profile.avatar} />
        </span>

        <div className="prof-id-text">
          <h2 className="prof-id-name" id={nameId}>
            {account.name}
          </h2>
          <p className="prof-id-handle">
            {profile.username ? (
              `@${profile.username}`
            ) : (
              <span className="prof-soft">{copy.cardNoName}</span>
            )}
            {/* The same chip as the header pill — this is the page somebody
                opens to find out about their own account. Absent while the
                plan is unknown, never a guessed "Free". */}
            {plan && <em className="plan-tag">{plan.name}</em>}
          </p>
          {memberSince && (
            <p className="prof-id-since">
              {fill(copy.memberSince, { date: formatMonth(language, memberSince) })}
            </p>
          )}
        </div>

        {/* The one control on this page that changes the profile. */}
        <button ref={editButton} type="button" className="btn btn-solid prof-edit" onClick={onEdit}>
          <Icon name="pencil" size={15} strokeWidth={2} />
          {copy.edit}
        </button>

        {account.player && <PlayerStrip player={account.player} />}
      </section>

      <div className="prof-view-grid">
        <section className="console prof-panel" aria-labelledby={aboutId}>
          <h2 className="prof-panel-title" id={aboutId}>
            {copy.aboutTitle}
          </h2>
          <dl className="prof-rows">
            {rows.map((row) => (
              <div className="prof-row" key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value || <span className="prof-soft">{copy.notAdded}</span>}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/*
          The meter, and the prize still leads it: a reward nobody notices
          changes nobody's behaviour. What is missing is listed as words here
          rather than as buttons — there is no field on this screen to jump to,
          and a chip that looks pressable and is not is the picture-of-a-control
          mistake. Edit is where they are.
        */}
        <aside className="console prof-meter" data-paid={paid ? 'true' : undefined}>
          <span className="console-label">{copy.meterTitle}</span>
          <div className="prof-prize">
            <span className="prof-prize-mark" aria-hidden>
              <Icon name={paid ? 'check' : 'gift'} size={20} strokeWidth={2.4} />
            </span>
            <div>
              <b className="prof-prize-pts">+{PROFILE_BONUS}</b>
              <span className="prof-prize-say">
                {fill(paid ? copy.meterRewardPaid : copy.meterReward, {
                  points: String(PROFILE_BONUS),
                })}
              </span>
            </div>
          </div>
          <b className="prof-pct">{fill(copy.meterProgress, { pct: String(percent) })}</b>
          <div className="prof-bar">
            <i style={{ width: `${percent}%` }} />
          </div>
          {gaps.length > 0 ? (
            <p className="prof-gaps">
              {fill(copy.gapsView, {
                fields: gaps.map((field) => copy.fieldNames[field]).join(', '),
              })}
            </p>
          ) : (
            <p className="prof-done">
              <Icon name="check" size={15} strokeWidth={3} />
              {copy.meterDone}
            </p>
          )}
        </aside>
      </div>

      {/* Only where there is a server to ask. An account this browser opened
          offline has no consents anywhere, and a panel whose every request
          fails would be a panel with nothing honest behind it. */}
      {hasToken() && <SharingPanel />}
    </div>
  );
}

/**
 * Points, streak and energy — for a player, and read off the mirror the
 * server's own answers keep.
 *
 * The figures are `GET /v1/games/state`'s and the ledger's, folded into the
 * account when it signed in and after every round. While a server-backed
 * account has not heard from the server this session, they are an em dash:
 * a mirror on a device that has never been told is a row of zeros, and a zero
 * nobody measured is the one figure this site does not print.
 */
function PlayerStrip({ player }: { player: PlayerState }) {
  const { plan, entitlements } = useAuth();
  const copy = useCopy().profile;
  const [language] = useLanguage();
  const told = !hasToken() || plan !== null;

  const limits = {
    max: Number(entitlements?.daily_energy) || MAX_ENERGY,
    regenMinutes: Number(entitlements?.energy_regen_minutes) || ENERGY_REGEN_MINUTES,
  };
  const tank = energyOf(player, new Date(), limits);
  const number = new Intl.NumberFormat(language);

  const stats = [
    { key: 'points', label: copy.stripPoints, value: number.format(player.points) },
    { key: 'streak', label: copy.stripStreak, value: number.format(player.streak) },
    {
      key: 'energy',
      label: copy.stripEnergy,
      value: fill(copy.stripEnergyValue, { n: String(tank.count), max: String(limits.max) }),
    },
  ];

  return (
    <dl className="prof-strip">
      {stats.map((stat) => (
        <div className="prof-stat" key={stat.key}>
          <dt>{stat.label}</dt>
          <dd>{told ? stat.value : '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Which venues can see who this person is, and a way to stop each one.
 *
 * `data_sharing_consents` is the switch every identified-customer figure on a
 * partner's dashboard passes through — the name and the photo in a venue's
 * customer list and till log exist only while a row here does. It is the one
 * part of the player↔venue relationship a player controls, so it lives on the
 * page about them, and stopping one takes effect on the server at once.
 *
 * Stopping asks once, in words naming the venue, because it is not undone from
 * this screen: sharing is granted at the venue, not here.
 */
function SharingPanel() {
  const copy = useCopy().profile;
  const [language] = useLanguage();
  const consents = useConsents();
  const titleId = useId();
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /* Hidden locally rather than re-fetched: a reload flips the whole list back
     to "checking…" for a row the server has already confirmed gone. */
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<{ tone: 'done' | 'failed'; text: string } | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const restoreTo = useRef<string | null>(null);

  /* A removed row takes its buttons with it, so focus goes to the sentence
     that says what happened rather than to `<body>`. */
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  /* "Keep sharing" unmounts itself, so focus goes back to the row's own
     "Stop sharing", which is where the reader was. */
  useEffect(() => {
    const id = restoreTo.current;
    if (asking !== null || id === null) return;
    restoreTo.current = null;
    document.querySelector<HTMLButtonElement>(`[data-stop="${CSS.escape(id)}"]`)?.focus();
  }, [asking]);

  const stop = async (grant: SharingGrant) => {
    setBusy(grant.venue_id);
    try {
      await stopSharing(grant.venue_id);
      setRemoved((was) => new Set(was).add(grant.venue_id));
      setNotice({ tone: 'done', text: fill(copy.sharingStopped, { venue: grant.name }) });
    } catch {
      setNotice({ tone: 'failed', text: copy.sharingFailed });
    } finally {
      setBusy(null);
      setAsking(null);
    }
  };

  const state = consents.state;
  const grants =
    state.status === 'ready'
      ? state.data.dataSharing.filter((grant) => !removed.has(grant.venue_id))
      : [];

  return (
    <section className="console prof-share" aria-labelledby={titleId}>
      <h2 className="prof-panel-title" id={titleId}>
        {copy.sharingTitle}
      </h2>
      <p className="prof-share-lede">{copy.sharingLede}</p>

      <p
        className="prof-share-notice"
        data-tone={notice?.tone}
        role="status"
        tabIndex={-1}
        ref={noticeRef}
      >
        {notice?.text}
      </p>

      {/* Three states and a fourth, and a failed request is not the empty
          list: "we could not ask" and "you share with nobody" are different
          answers to a privacy question. */}
      {state.status === 'loading' ? (
        <p className="prof-share-empty">{copy.sharingLoading}</p>
      ) : state.status === 'error' ? (
        <p className="prof-note">
          <Icon name="warn" size={15} />
          <span>
            {copy.sharingOffline}{' '}
            <button type="button" className="link-btn" onClick={consents.reload}>
              {copy.sharingRetry}
            </button>
          </span>
        </p>
      ) : grants.length === 0 ? (
        <p className="prof-share-empty">{copy.sharingNone}</p>
      ) : (
        <ul className="prof-share-list">
          {grants.map((grant) => (
            <li className="prof-share-row" key={grant.venue_id}>
              <div className="prof-share-who">
                <b>{grant.name}</b>
                <span>
                  {fill(copy.sharingSince, {
                    date: formatDay(language, grant.granted_at.slice(0, 10)),
                  })}
                </span>
              </div>
              {asking === grant.venue_id ? (
                <div
                  className="prof-share-ask"
                  role="group"
                  aria-label={fill(copy.sharingAsk, { venue: grant.name })}
                >
                  <span>{fill(copy.sharingAsk, { venue: grant.name })}</span>
                  <div className="prof-share-acts">
                    <button
                      type="button"
                      className="btn btn-solid"
                      autoFocus
                      disabled={busy === grant.venue_id}
                      onClick={() => void stop(grant)}
                    >
                      {copy.sharingYes}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy === grant.venue_id}
                      onClick={() => {
                        restoreTo.current = grant.venue_id;
                        setAsking(null);
                      }}
                    >
                      {copy.sharingKeep}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  data-stop={grant.venue_id}
                  onClick={() => {
                    setNotice(null);
                    setAsking(grant.venue_id);
                  }}
                >
                  {copy.sharingStop}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── edit mode ── */

interface Draft {
  username: string;
  occupation: Occupation | '';
  city: string;
  countryCode: string;
  /**
   * Whether the reader has said their city is not on the list.
   *
   * Not derivable from the other two. "City typed, country blank" is *also*
   * what a half-finished search looks like, and the difference between the two
   * is the whole point of the explicit choice.
   */
  otherPlace: boolean;
  phone: string;
  birthDate: string;
  avatar: string;
}

const draftFrom = (stored: UserProfile | undefined): Draft => ({
  username: stored?.username ?? '',
  /* Guarded: a row written by an older build carries the free `headline` and no
     `occupation`, and an unrecognised value has no label to draw. */
  occupation: isOccupation(stored?.occupation ?? '') ? (stored?.occupation ?? '') : '',
  city: stored?.city ?? '',
  countryCode: stored?.countryCode ?? '',
  /* A stored place is assumed to be off the list until the list arrives and
     says otherwise — showing a stored country as a *fact* the page cannot yet
     derive is the one thing this pair of fields must never do. */
  otherPlace: Boolean(stored?.city) && Boolean(stored?.countryCode),
  phone: stored?.phone ?? '',
  birthDate: stored?.birthDate ?? '',
  avatar: stored?.avatar ?? '',
});

/**
 * The form, opened by Edit.
 *
 * The draft is built from the saved profile when the editor opens and thrown
 * away when it closes, which is all Cancel has to do. It commits on Save, and
 * Save is a request: the button says so while it is out, and the page only
 * returns to the record once the server has answered — so the record it
 * returns to is the one the server holds.
 */
function ProfileEditor({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: (result: Extract<ProfileResult, { ok: true }>) => void;
}) {
  const { account, saveProfile } = useAuth();
  const copy = useCopy().profile;
  const [language] = useLanguage();
  const cities = useCities();
  const statusLabelId = useId();
  const cityLabelId = useId();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(account?.profile));
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  /* The picker's `<input type="file">` is uncontrolled, so choosing the same
     file twice fires no second `change`; cleared after every read. */
  const fileRef = useRef<HTMLInputElement>(null);

  /* Whether this editor is still mounted — a decode or a save that was in
     flight when the reader pressed Cancel has nowhere to report to. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* Edit puts the reader in the first field, which is the one somebody who
     pressed Edit is most often there to change. */
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const list = cities.state.status === 'ready' ? cities.state.data : null;

  /*
   * When the list lands, a stored city that turns out to *be* on it stops being
   * an "other". Only ever one way: a city the list knows is never an other, and
   * one it does not know is never anything else.
   */
  useEffect(() => {
    if (!list) return;
    setDraft((current) => {
      if (!current.city) return current;
      const known = lookupCity(list, current.city);
      if (!known) return current;
      if (!current.otherPlace && current.countryCode === known.country) return current;
      return { ...current, city: known.name, countryCode: known.country, otherPlace: false };
    });
  }, [list]);

  if (!account) return null;
  const profile = account.profile;
  /* Whether a save reaches the server. `PATCH /v1/me` cannot clear a column,
     so the photo's Remove is only offered where removing is something the
     save can actually do. */
  const serverBacked = hasToken();

  /*
   * The meter reads the **draft**, so it moves as the form is filled — and
   * falls when a field is cleared, because the form is what will be saved.
   */
  const draftProfile: UserProfile = {
    ...profile,
    username: draft.username,
    occupation: draft.occupation,
    phone: draft.phone,
    birthDate: draft.birthDate,
    avatar: draft.avatar,
    city: draft.city,
    countryCode: draft.countryCode,
  };
  const gaps = profileGaps(draftProfile, account.email);
  const percent = profilePercent(draftProfile, account.email);
  const paidBonus = account.profileCompletedAt !== null;

  const clear = () => setError(null);

  /**
   * Take the reader to a field. Scroll first, then focus: focusing alone jumps
   * the page with no sense of travel, and on a phone the rail is *below* the
   * form. `data-field` is put on each row by `Field`, so the names cannot drift.
   */
  const goToField = (field: string) => {
    const row = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (!row) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    const control = row.querySelector<HTMLElement>('input, select, textarea, button');
    /* After the scroll, not during: focusing mid-scroll cancels it in Safari. */
    window.setTimeout(() => control?.focus({ preventScroll: true }), reduced ? 0 : 320);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    /*
     * The one rule this page enforces on its own, because it is a rule about a
     * *pair* and the patch cannot carry half of one: a city with neither a
     * suggestion behind it nor a country beside it is a place nobody can find.
     */
    if (draft.city && !draft.countryCode) {
      const field = draft.otherPlace ? 'country' : 'city';
      setError({ field, message: draft.otherPlace ? copy.countryNeeded : copy.cityNeeded });
      goToField(field);
      return;
    }

    setBusy(true);
    const result = await saveProfile({
      username: draft.username,
      occupation: draft.occupation,
      phone: draft.phone,
      birthDate: draft.birthDate,
      avatar: draft.avatar,
      /* The pair or neither — see `ProfilePatch`. */
      place: draft.city ? { city: draft.city, countryCode: draft.countryCode } : undefined,
    });
    if (!alive.current) return;
    setBusy(false);

    if (result.ok) {
      onSaved(result);
      return;
    }
    const refusal = refusalMessage(copy, result);
    setError(refusal);
    if (refusal.field !== 'form') goToField(refusal.field);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const avatar = await toAvatar(file);
    if (!avatar || !alive.current) return;
    setDraft((current) => ({ ...current, avatar }));
    clear();
  };

  /*
   * Typing in the city field. The country follows the *text*: writing over
   * "Krakow" drops `PL` on the same keystroke, and an exact match re-derives it
   * — so typing a full city name works exactly like picking one.
   */
  const typeCity = (text: string) => {
    const known = list ? lookupCity(list, text) : undefined;
    setDraft((current) => ({
      ...current,
      city: text,
      countryCode: known ? known.country : current.otherPlace ? current.countryCode : '',
      otherPlace: known ? false : current.otherPlace,
    }));
    clear();
  };

  const pickCity = (pick: CityPick) => {
    setDraft((current) =>
      pick.kind === 'city'
        ? {
            ...current,
            city: pick.city.name,
            countryCode: pick.city.country,
            otherPlace: false,
          }
        : /* "Not on the list" keeps what was typed and opens the country
             field — a statement about the list, not an erasure of the answer. */
          { ...current, otherPlace: true, countryCode: '' },
    );
    clear();
  };

  /*
   * The birthday's two states, and the reason this is a branch rather than a
   * `disabled` attribute: a greyed-out date input still *looks* like the answer
   * to "can I change this?" being maybe.
   */
  const writesLeft = profile.birthDateChangesLeft;
  const birthdayHelp =
    writesLeft >= BIRTH_DATE_WRITES
      ? copy.birthdayUnset
      : writesLeft > 0
        ? copy.birthdayOneLeft
        : copy.birthdaySpent;

  return (
    <div className="prof-grid">
      <form className="prof-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <fieldset className="form-block">
          <legend>{copy.whoLegend}</legend>

          {/* The face and the name on a leaderboard row, side by side, because
              they are one answer rather than two. */}
          <div className="prof-identity">
            {/* `wraps={false}`: the child is a `<label>` of its own. */}
            <Field label={copy.photo} help={copy.photoHelp} wraps={false} field="avatar">
              <div className="prof-photo">
                <span className="prof-avatar prof-avatar-lg" aria-hidden>
                  <Face name={account.name} photo={draft.avatar} />
                </span>
                <label className="file-pick">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => void pickPhoto(event.target.files?.[0])}
                  />
                  <Icon name="people" size={15} />
                  <span>{copy.photoChoose}</span>
                </label>
                {!serverBacked && isPicture(draft.avatar) && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setDraft((current) => ({ ...current, avatar: '' }));
                      clear();
                    }}
                  >
                    {copy.photoRemove}
                  </button>
                )}
              </div>
            </Field>

            <Field
              label={copy.username}
              field="username"
              help={fill(copy.usernameHelp, { min: MIN, max: MAX })}
              error={error?.field === 'username' ? error.message : undefined}
            >
              <input
                ref={usernameRef}
                type="text"
                autoComplete="username"
                inputMode="text"
                spellCheck={false}
                maxLength={USERNAME_MAX}
                placeholder={copy.usernamePlaceholder}
                value={draft.username}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, username: event.target.value }));
                  clear();
                }}
                aria-invalid={error?.field === 'username' ? true : undefined}
              />
            </Field>
          </div>

          {/* Status and birthday, on one line: both are single facts about a
              person rather than places to write in. */}
          <div className="field-row">
            {/* `wraps={false}`: the control is a button, and a `<label>` round
                one activates it on every click of its caption. */}
            <Field
              label={copy.status}
              field="occupation"
              labelId={statusLabelId}
              help={copy.statusHelp}
              wraps={false}
            >
              <StatusMenu
                copy={copy}
                labelId={statusLabelId}
                value={draft.occupation}
                onPick={(next) => {
                  setDraft((current) => ({ ...current, occupation: next }));
                  clear();
                }}
              />
            </Field>

            {writesLeft > 0 ? (
              <Field
                label={copy.birthday}
                field="birthDate"
                help={birthdayHelp}
                error={error?.field === 'birthDate' ? error.message : undefined}
              >
                <input
                  type="date"
                  autoComplete="bday"
                  value={draft.birthDate}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, birthDate: event.target.value }));
                    clear();
                  }}
                  aria-invalid={error?.field === 'birthDate' ? true : undefined}
                />
              </Field>
            ) : (
              <Field label={copy.birthday} help={birthdayHelp} wraps={false} field="birthDate">
                <p className="prof-fact">
                  {profile.birthDate ? formatDay(language, profile.birthDate) : '—'}
                </p>
              </Field>
            )}
          </div>
        </fieldset>

        <fieldset className="form-block">
          <legend>{copy.whereLegend}</legend>

          <div className="field-row">
            {/* `wraps={false}`: the combobox owns its own wrapper. */}
            <Field
              label={copy.city}
              field="city"
              labelId={cityLabelId}
              help={cityHelp(copy, cities.state.status, list, draft)}
              error={error?.field === 'city' ? error.message : undefined}
              wraps={false}
            >
              <CityCombo
                copy={copy}
                labelId={cityLabelId}
                list={list}
                value={draft.city}
                onType={typeCity}
                onPick={pickCity}
                invalid={error?.field === 'city'}
              />
            </Field>

            {/* A fact, or a field, and never both: the country follows from a
                city we know, and is a question only about one we do not. */}
            {draft.otherPlace ? (
              <Field
                label={copy.country}
                field="country"
                help={list ? copy.countryHelp : copy.countryUnchecked}
                error={error?.field === 'country' ? error.message : undefined}
              >
                <input
                  type="text"
                  autoComplete="country"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={2}
                  placeholder={copy.countryPlaceholder}
                  value={draft.countryCode}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      countryCode: normaliseCountry(event.target.value),
                    }));
                    clear();
                  }}
                  aria-invalid={error?.field === 'country' ? true : undefined}
                />
              </Field>
            ) : (
              <Field label={copy.country} wraps={false}>
                <p className="prof-fact">
                  {draft.countryCode ? countryName(copy, draft.countryCode) : '—'}
                </p>
              </Field>
            )}
          </div>

          {cities.state.status === 'error' && (
            <p className="prof-note" role="status">
              <Icon name="warn" size={15} />
              <span>
                {copy.cityOffline}{' '}
                <button type="button" className="link-btn" onClick={cities.reload}>
                  {copy.cityRetry}
                </button>
              </span>
            </p>
          )}

          <Field
            label={copy.phone}
            field="phone"
            help={copy.phoneHelp}
            error={error?.field === 'phone' ? error.message : undefined}
          >
            <input
              type="tel"
              autoComplete="tel"
              placeholder={copy.phonePlaceholder}
              value={draft.phone}
              onChange={(event) => {
                setDraft((current) => ({ ...current, phone: event.target.value }));
                clear();
              }}
              aria-invalid={error?.field === 'phone' ? true : undefined}
            />
          </Field>

          {/* The address is not on this form: it is the credential, not a
              detail, and the sentence under it says so. */}
          <Field label={copy.email} help={copy.emailHelp} wraps={false}>
            <p className="prof-fact">{account.email}</p>
          </Field>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="btn btn-solid btn-lg" disabled={busy}>
            {busy ? copy.saving : copy.save}
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={onCancel}>
            {copy.cancel}
          </button>
          {error?.field === 'form' && (
            <span className="field-error" role="alert">
              {error.message}
            </span>
          )}
        </div>
      </form>

      <aside className="prof-rail">
        <div className="console prof-meter" data-paid={paidBonus ? 'true' : undefined}>
          <span className="console-label">{copy.meterTitle}</span>

          <div className="prof-prize">
            <span className="prof-prize-mark" aria-hidden>
              <Icon name={paidBonus ? 'check' : 'gift'} size={20} strokeWidth={2.4} />
            </span>
            <div>
              <b className="prof-prize-pts">+{PROFILE_BONUS}</b>
              <span className="prof-prize-say">
                {fill(paidBonus ? copy.meterRewardPaid : copy.meterReward, {
                  points: String(PROFILE_BONUS),
                })}
              </span>
            </div>
          </div>

          <b className="prof-pct">{fill(copy.meterProgress, { pct: String(percent) })}</b>
          <div className="prof-bar">
            <i style={{ width: `${percent}%` }} />
          </div>
          {gaps.length > 0 ? (
            <>
              <span className="prof-still">{copy.meterStill}</span>
              {/* Buttons, not list items: each takes the reader straight to the
                  field and focuses it, so the card is a route through the work
                  rather than a report on it. */}
              <ul className="prof-list">
                {gaps.map((field) => (
                  <li key={field}>
                    <button type="button" onClick={() => goToField(field)}>
                      {copy.fieldNames[field]}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="prof-done">
              <Icon name="check" size={15} strokeWidth={3} />
              {copy.meterDone}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── helpers ── */

/**
 * A refusal, as a sentence under the field it is about — or under the buttons,
 * for the two refusals about the save as a whole.
 */
function refusalMessage(
  copy: ProfileCopy,
  result: Extract<ProfileResult, { ok: false }>,
): { field: string; message: string } {
  switch (result.field) {
    case 'username':
      return {
        field: 'username',
        message: fill(copy.usernameErrors[result.error], { min: MIN, max: MAX }),
      };
    case 'phone':
      return { field: 'phone', message: copy.phoneShape };
    case 'birthDate':
      return {
        field: 'birthDate',
        message:
          result.error === 'spent' ? copy.birthdayNoWrites : copy.birthdayErrors[result.error],
      };
    case 'city':
      return { field: 'city', message: copy.cityShape };
    case 'country':
      return {
        field: 'country',
        message: result.error === 'needed' ? copy.countryNeeded : copy.countryShape,
      };
    default:
      return {
        field: 'form',
        message: result.error === 'session' ? copy.sessionExpired : copy.saveFailed,
      };
  }
}

/**
 * The country a code names, or the code itself when the dictionary has no name
 * for it — a country typed by hand is a country, and the only way to render it
 * as a name would be shipping a two-hundred-row table.
 */
function countryName(copy: ProfileCopy, code: string): string {
  return copy.countries[code as keyof ProfileCopy['countries']] ?? code;
}

/** A hand-written country, as the two-letter code the server takes. */
function normaliseCountry(value: string): string {
  return value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

/**
 * A `YYYY-MM-DD` day in the reader's language — "14 March 1998" — read in UTC so
 * the day printed is the day stored, whatever timezone the laptop is in.
 */
function formatDay(language: string, day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** An instant as a month and a year — "March 2026". */
function formatMonth(language: string, instant: string): string {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return instant.slice(0, 7);
  return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(at);
}

/** Which sentence sits under the city field, given what the request is doing. */
function cityHelp(
  copy: ProfileCopy,
  status: 'loading' | 'ready' | 'error',
  list: CityList | null,
  draft: Draft,
): string {
  if (status === 'loading') return copy.cityLoading;
  /* Not "no cities". A failed request is a state, not an empty list. */
  if (status === 'error' || !list) return copy.cityDown;
  if (draft.otherPlace) return copy.cityOtherHelp;
  /* Typed something the list has never heard of. Said *here*, under the field,
     rather than as an error on submit — the way out is one row down in a menu
     that is already open. */
  if (draft.city && !lookupCity(list, draft.city)) return copy.cityNoMatch;
  return fill(copy.cityHelp, { n: String(list.cities.length) });
}
