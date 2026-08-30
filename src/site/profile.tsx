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
  useCities,
  type City,
  type CityList,
} from './api/profile';
import { useAuth } from './auth/context';
import { AVATAR_PX, toSquareDataUrl } from './imageFile';
import { Face } from './auth/Avatar';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import {
  BIRTH_DATE_WRITES,
  OCCUPATIONS,
  USERNAME_MAX,
  USERNAME_MIN,
  isOccupation,
  profileGaps,
  profilePercent,
  type Occupation,
} from './auth/users';

/**
 * `#/profile` — the seven things a person tells us about themselves.
 *
 * Photo, username, status, city, email, phone, birthday. It is the same set the
 * server's `updateProfile` writes, and it has to be: this page is the
 * prototype's front end onto rules that already exist somewhere else, and a
 * form that accepted what the server refuses would be a form that works until
 * the day the two halves are wired together.
 *
 * Three of the seven have rules that are not "is it a string", and all three
 * are explained on the page rather than discovered by being refused:
 *
 * - **The username is unique.** Checked against the whole directory, and a
 *   clash comes back naming the field, the way a 409 does.
 * - **The city is suggested, not dictated.** `GET /v1/cities` feeds a combobox
 *   that offers matches as you type, because a leaderboard groups on this
 *   string with a literal `=`. But 114 names is a list somebody is not on, so
 *   an unknown city is accepted **with a country beside it** — which is the
 *   rule `PATCH /v1/me` enforces, and the one state this form refuses to submit
 *   is the third one: a city nobody can place.
 * - **The birthday may be set and then corrected once.** The count is shown
 *   before it is spent, and when it runs out the field is replaced by the date
 *   and a sentence, because a control that cannot work is worse than no
 *   control.
 *
 * And the thing the page says out loud: **nothing here is verified.** No code
 * is sent to the number, no link is clicked in the address. The address is what
 * signs the account in, which is authentication and a different question — and
 * a form that implies a confirmation exists is a form that has promised
 * something nobody built.
 *
 * The draft is local state and commits on submit, the way the listing form's
 * does: the card in the rail moves on every keystroke, and persisting that
 * would be a `JSON.stringify` of the whole account per character typed.
 *
 * ── what replaced the line about you ──────────────────────────────────────
 *
 * There was a 140-character free line here. It is gone, and `occupation` — one
 * of five values, labelled **Status** — is in its place. The argument is not
 * that nobody wrote one; it is that nothing could *read* one. A venue choosing
 * who to send an offer to can act on "students, on a Tuesday"; it cannot act on
 * a sentence about filter coffee, and neither can the city leaderboard, the
 * cohort floor or any other number on this platform. Five values can be
 * counted. Prose is decoration that costs a column.
 */

/*
 * The two bounds the form's sentences quote, as strings.
 *
 * Written once here rather than at each `fill()` because a rule stated in a
 * help line and refused by a validator has to quote the same number, and
 * `String(USERNAME_MIN)` typed four times is four places for that to drift.
 */
const MIN = String(USERNAME_MIN);
const MAX = String(USERNAME_MAX);

/** The page's own slice of the dictionary, for the helpers below it. */
type ProfileCopy = ReturnType<typeof useCopy>['profile'];

/* ──────────────────────────────────────────────────────────────── photo ── */

/**
 * A picked file as a small square data URL.
 *
 * The work is in `imageFile.ts`, because the venue logo needs exactly the same
 * thing and a second copy of a canvas crop is a second place for the quality
 * and the size to drift apart.
 */
const toAvatar = (file: File): Promise<string | null> => toSquareDataUrl(file, AVATAR_PX);

/* ─────────────────────────────────────────────────────────────── the kit ── */

/**
 * One row of the field kit — the same shape `businessSetup.tsx` uses, and for
 * the same reason it is a component there: a `<label>` wraps its one control
 * without needing an id at both ends, and `wraps={false}` renders a `<div>` for
 * the rows whose child is *itself* a label (the file picker), is a button, or
 * is not a control at all. Nesting `<label>` is invalid, and browsers agree on
 * what it costs: the outer one's implicit control resolves to the inner input.
 */
function Field({
  label,
  labelId,
  help,
  error,
  wraps = true,
  children,
}: {
  label: string;
  /**
   * The id to put on the caption, for a `wraps={false}` row whose child *is* a
   * control.
   *
   * A wrapping `<label>` names its control implicitly and needs none of this.
   * A `<div>` names nothing — so the two rows here that hold a control the
   * label cannot wrap (the status button, the city combobox) point at this id
   * with `aria-labelledby`, or they announce as "Student, collapsed" with no
   * word saying what Student is an answer to.
   */
  labelId?: string;
  help?: ReactNode;
  error?: string;
  wraps?: boolean;
  children: ReactNode;
}) {
  const Row = wraps ? 'label' : 'div';
  return (
    <Row className="field">
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
 * Close on an outside press, and on Escape.
 *
 * Lifted out because both menus below need exactly this and `LanguageMenu` in
 * `Header.tsx` already writes it a third time. `restore` is what the header's
 * version calls the same argument: closing unmounts whatever holds focus, which
 * drops it on `<body>` and restarts the next Tab at the top of the document —
 * so Escape puts focus back, and an outside press does not, because there the
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
 * `role="option"` children directly, no `<li>` in between (see the note on
 * `LanguageMenu`). What is not the header's is the trigger, which has to look
 * like the field kit's `<select>` well because it stands in a row with two real
 * fields — `.prof-select` is that well on a button, and `site.css` says why it
 * could not simply be a `<select>`.
 *
 * The options are real buttons and therefore focusable, which is the header's
 * pattern and is right for a menu: the reader tabs into it, and Escape hands
 * focus back to the trigger. The city field below is the *other* pattern for
 * the opposite reason — see there.
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
           `aria-label` would have *replaced* the value with the caption, which
           is the one thing a reader of this control needs to hear — so the
           button names itself second, which is what the pattern is for. */
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
 * A real combobox and not a button that opens a list, because the thing being
 * chosen from is 114 entries long: the only way to get to Zielona Gora in a
 * menu is to scroll past sixty cities, and the only way to get there in one
 * gesture is to type "zie". So the trigger is the text field itself, which is
 * also what makes the field honest when the backend is down — there is nothing
 * to disable, and the reader can still write where they live.
 *
 * ── the keyboard, which is the whole of why this is not four lines ────────
 *
 * The options here are **not focusable**, which is the opposite of the status
 * menu above and is forced: focus has to stay in the input, because the reader
 * is still typing. So the list is navigated with `aria-activedescendant` — a
 * *virtual* cursor that names the current row without moving the real one —
 * and every key is handled here:
 *
 *   ↓ / ↑    open the list, then walk it, wrapping at both ends.
 *   Enter    take the pointed-at row; `preventDefault` so a submit does not
 *            fire on the same keystroke that chose a city.
 *   Escape   close and keep what was typed. Handled by `useDismiss`.
 *   Tab      **not touched.** A menu that swallows Tab is a trap, and this one
 *            has no reason to: the typed text is already the answer, so leaving
 *            commits nothing the reader has not seen.
 *
 * `role="option"` on a `<div>` rather than a `<button>` for the same reason:
 * a button in the tab order would put eight stops between this field and the
 * next one. They are still pressable — a pointer down on one picks it, and
 * `onMouseDown`'s `preventDefault` is what stops the input losing focus (and
 * the menu unmounting) before the click lands.
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
  /* Where the virtual cursor is. The suggestions come first and the "not on the
     list" row is the last index, which is what `rows` below encodes so the two
     cannot get out of step. */
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const rowId = useId();

  const close = useCallback((restore: boolean) => {
    setOpen(false);
    if (restore) input.current?.focus();
  }, []);
  const ref = useDismiss(open, close);

  /* Suggestions, plus the way out. `other` is always offered — including when
     the query matches perfectly, because "Berlin" is a real city in a country
     the list does not have Berlin in only if somebody says so. */
  const rows: CityPick[] = useMemo(() => {
    const cities = list ? matchCities(list, value) : [];
    return [...cities.map((city): CityPick => ({ kind: 'city', city })), { kind: 'other' }];
  }, [list, value]);

  /* Typing moves the cursor back to the top: the row that was pointed at
     belonged to the previous query, and leaving it where it was is how a
     combobox picks the wrong city on Enter. */
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
      /* Only when the list is open *and* pointing somewhere. A closed combobox
         is a text field, and Enter in a text field submits the form. */
      event.preventDefault();
      take(at);
    }
    /* Tab deliberately falls through. See the block comment. */
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
        /* The row is a `<div>`, so nothing names this input implicitly — see
           the note on `Field`'s `labelId`. */
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

interface Draft {
  username: string;
  occupation: Occupation | '';
  city: string;
  countryCode: string;
  /**
   * Whether the reader has said their city is not on the list.
   *
   * Not derivable from the other two, which is why it is stored. "City typed,
   * country blank" is *also* what a half-finished search looks like, and the
   * difference between the two is the whole point of the explicit choice: one
   * is somebody who has not finished picking, the other is somebody who has
   * finished and is telling us the list is short.
   */
  otherPlace: boolean;
  phone: string;
  birthDate: string;
  avatar: string;
}

export function ProfilePage() {
  const { account, saveProfile } = useAuth();
  const copy = useCopy().profile;
  const cities = useCities();
  /* The two captions that have to be referenced rather than wrapped. See the
     note on `Field`'s `labelId`. */
  const statusLabelId = useId();
  const cityLabelId = useId();
  const [draft, setDraft] = useState<Draft>(() => {
    const stored = account?.profile;
    return {
      username: stored?.username ?? '',
      /* Guarded rather than read straight through: a row written by the build
         before this one carries the free `headline` and no `occupation` at all,
         and an unrecognised value has no label to draw. */
      occupation: isOccupation(stored?.occupation ?? '') ? (stored?.occupation ?? '') : '',
      city: stored?.city ?? '',
      countryCode: stored?.countryCode ?? '',
      /* A stored place is assumed to be off the list until the list arrives and
         says otherwise — see the effect below. Assuming the opposite would show
         a stored country as a *fact* it cannot derive, which is the one thing
         this pair of fields must never do. */
      otherPlace: Boolean(stored?.city) && Boolean(stored?.countryCode),
      phone: stored?.phone ?? '',
      birthDate: stored?.birthDate ?? '',
      avatar: stored?.avatar ?? '',
    };
  });
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  /* The confirmation is a fact about the last save, so it has to stop being
     true the moment the form stops matching what was saved. A timer would say
     "Saved" over a field the reader is in the middle of changing. */
  const clear = () => {
    setSaved(false);
    setError(null);
  };

  /*
   * The picker's `<input type="file">` is uncontrolled, so choosing the same
   * file twice fires no second `change`. Cleared after every read, which is
   * what makes "remove, then pick the same photo again" work.
   */
  const fileRef = useRef<HTMLInputElement>(null);

  /* Not `useState`, because it must not survive this component: the flag says
     "a photo is being decoded right now", and a decode that was in flight when
     the page unmounted has no answer to give. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const list = cities.state.status === 'ready' ? cities.state.data : null;

  /*
   * When the list lands, a stored city that turns out to *be* on it stops being
   * an "other".
   *
   * The draft is built before the request answers, so it has to guess — and it
   * guesses "other", because that is the reading that shows the country as a
   * field the reader can correct rather than as a derived fact the page cannot
   * actually derive yet. This is the correction, and it only ever runs one way:
   * a city the list knows is never an other, and one it does not know is never
   * anything else.
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
  const gaps = profileGaps(profile, account.email);
  const percent = profilePercent(profile, account.email);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    /*
     * The one rule this page enforces on its own, because it is a rule about a
     * *pair* and the patch cannot carry half of one.
     *
     * A city off the served list arrives with its country and needs nothing. A
     * city the reader wrote is accepted by `PATCH /v1/me` provided a country
     * comes with it. What is left over is a city with neither — somebody who
     * typed three letters and tabbed away — and sending that would be sending a
     * place nobody can find. Refused here, naming the field that fixes it.
     */
    if (draft.city && !draft.countryCode) {
      setSaved(false);
      setError({
        field: draft.otherPlace ? 'country' : 'city',
        message: draft.otherPlace ? copy.countryNeeded : copy.cityNeeded,
      });
      return;
    }

    const result = saveProfile({
      username: draft.username,
      occupation: draft.occupation,
      phone: draft.phone,
      birthDate: draft.birthDate,
      avatar: draft.avatar,
      /* The pair or neither — see `ProfilePatch`. */
      place: draft.city ? { city: draft.city, countryCode: draft.countryCode } : undefined,
    });

    if (result.ok) {
      setError(null);
      setSaved(true);
      return;
    }

    setSaved(false);
    if (result.field === 'username') {
      setError({
        field: 'username',
        message: fill(copy.usernameErrors[result.error], { min: MIN, max: MAX }),
      });
    } else if (result.field === 'phone') {
      setError({ field: 'phone', message: copy.phoneShape });
    } else {
      setError({
        field: 'birthDate',
        message:
          result.error === 'spent'
            ? copy.birthdayNoWrites
            : copy.birthdayErrors[result.error],
      });
    }
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
   * Typing in the city field.
   *
   * The country follows the *text*, not the last thing chosen: writing over
   * "Krakow" has to drop `PL` on the same keystroke, or the form quietly holds
   * a country that belongs to a city no longer in the box. An exact match
   * re-derives it — which is what makes typing a full city name and never
   * opening the menu work exactly like picking one.
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
        : /* "Not on the list" keeps whatever was typed and opens the country
             field — it is a statement about the list, not an erasure of the
             answer somebody has already half-written. */
          { ...current, otherPlace: true, countryCode: '' },
    );
    clear();
  };

  /*
   * The birthday's two states, and the reason this is a branch rather than a
   * `disabled` attribute: a greyed-out date input still *looks* like the answer
   * to "can I change this?" being maybe. When both writes are spent the control
   * is gone and the date is a fact, with the sentence that says why.
   */
  const writesLeft = profile.birthDateChangesLeft;
  const birthdayHelp =
    writesLeft >= BIRTH_DATE_WRITES
      ? copy.birthdayUnset
      : writesLeft > 0
        ? copy.birthdayOneLeft
        : copy.birthdaySpent;

  const savedRole = isOccupation(profile.occupation) ? profile.occupation : null;

  return (
    <main>
      <section className="section prof" id="profile-top">
        <div className="wrap">
          <div className="section-head left" data-reveal>
            <span className="eyebrow">{copy.eyebrow}</span>
            {/* `h1`, not `h2`: this is a route of its own, and a document whose
                outline starts at level two reads as a section of something
                else. The type comes from `.section-head`, so the level is free
                to be correct. */}
            <h1>{copy.title}</h1>
            <p>{copy.lede}</p>
          </div>

          <div className="prof-grid">
            <form className="prof-form" onSubmit={onSubmit} noValidate>
              <fieldset className="form-block" data-reveal>
                <legend>{copy.whoLegend}</legend>

                {/* The face and the name on a leaderboard row, side by side,
                    because they are one answer rather than two. */}
                <div className="prof-identity">
                  {/* `wraps={false}`: the child is a `<label>` of its own. */}
                  <Field label={copy.photo} help={copy.photoHelp} wraps={false}>
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
                      {draft.avatar && (
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
                    help={fill(copy.usernameHelp, { min: MIN, max: MAX })}
                    error={error?.field === 'username' ? error.message : undefined}
                  >
                    <input
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

                {/*
                  Status and birthday, on one line.
                  Both are single facts about a person rather than places to
                  write in, and the birthday came up here from "where we can
                  find you" — a date of birth is not a way to reach somebody,
                  and it was in that block only because the block had room.
                */}
                <div className="field-row">
                  {/* `wraps={false}`: the control is a button, and a `<label>`
                      wrapped round one activates it on every click of the
                      label — which is a menu that opens when its own caption
                      is read. */}
                  <Field
                    label={copy.status}
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
                    <Field label={copy.birthday} help={birthdayHelp} wraps={false}>
                      <p className="prof-fact">{profile.birthDate || '—'}</p>
                    </Field>
                  )}
                </div>
              </fieldset>

              <fieldset className="form-block" data-reveal>
                <legend>{copy.whereLegend}</legend>

                <div className="field-row">
                  {/* `wraps={false}`: the combobox owns its own wrapper, and a
                      `<label>` round the pair would put the caret in the input
                      on a click meant for an option. */}
                  <Field
                    label={copy.city}
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

                  {/*
                    A fact, or a field, and never both.
                    The country follows from a city we know and is not asked
                    for — the server derives it in `resolveCity` for exactly
                    this reason. It becomes a question only when the city is one
                    we do not have, because then there is nothing to derive it
                    from and the write needs it.
                  */}
                  {draft.otherPlace ? (
                    <Field
                      label={copy.country}
                      /* Two reasons this field is here, and they are not the
                         same claim: the city is not on the list, or there is no
                         list to look it up in. Saying the first while the panel
                         underneath says the second is the page contradicting
                         itself in two paragraphs. */
                      help={list ? copy.countryHelp : copy.countryUnchecked}
                      error={error?.field === 'country' ? error.message : undefined}
                    >
                      <input
                        type="text"
                        autoComplete="country-name"
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

                {/* The address is not on this form, and the sentence under it
                    says which of the two reasons that is: it is the credential,
                    not a detail. */}
                <Field label={copy.email} help={copy.emailHelp} wraps={false}>
                  <p className="prof-fact">{account.email}</p>
                </Field>
              </fieldset>

              <div className="form-actions">
                <button type="submit" className="btn btn-solid btn-lg">
                  {copy.save}
                </button>
                {saved && (
                  <span className="form-saved" role="status">
                    <Icon name="check" size={15} strokeWidth={3} />
                    {copy.saved}
                  </span>
                )}
              </div>
            </form>

            <aside className="prof-rail">
              {/* The card is the *saved* profile, not the draft: it answers
                  "what do other people see", and a draft nobody has saved is
                  not seen by anybody. */}
              <div className="console prof-card" data-reveal>
                <span className="console-label">{copy.cardTitle}</span>
                <div className="prof-card-who">
                  <span className="prof-avatar" aria-hidden>
                    <Face name={account.name} photo={profile.avatar} />
                  </span>
                  <div>
                    <b>{account.name}</b>
                    <span className="prof-handle">
                      {profile.username ? `@${profile.username}` : copy.cardNoName}
                    </span>
                  </div>
                </div>
                <p className="prof-card-role">
                  <Icon name="briefcase" size={14} />
                  {savedRole ? copy.occupations[savedRole] : copy.cardNoRole}
                </p>
                <p className="prof-card-where">
                  <Icon name="pin" size={14} />
                  {profile.city
                    ? `${profile.city}, ${countryName(copy, profile.countryCode)}`
                    : copy.cardNowhere}
                </p>
              </div>

              <div className="console prof-meter" data-reveal>
                <span className="console-label">{copy.meterTitle}</span>
                <b className="prof-pct">{fill(copy.meterProgress, { pct: String(percent) })}</b>
                <div className="prof-bar">
                  <i style={{ width: `${percent}%` }} />
                </div>
                {gaps.length > 0 ? (
                  <>
                    <span className="prof-still">{copy.meterStill}</span>
                    <ul className="prof-list">
                      {gaps.map((field) => (
                        <li key={field}>{copy.fieldNames[field]}</li>
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
        </div>
      </section>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────── helpers ── */

/**
 * The country a code names, or whatever was written when it is not a code.
 *
 * The fallback is not a gap. A country typed by hand is a country, and the only
 * way to render it as a *name* would be to ship a two-hundred-row table beside
 * the city list this field exists because somebody was missing from.
 */
function countryName(copy: ProfileCopy, code: string): string {
  return copy.countries[code as keyof ProfileCopy['countries']] ?? code;
}

/**
 * A hand-written country, tidied just enough to match the served ones.
 *
 * Exactly two letters is an ISO code and is upper-cased, so somebody who writes
 * "pl" ends up with the same `PL` a suggestion would have stored — and the card
 * in the rail prints "Poland" for both. Anything longer is a name and is left
 * as it was written; guessing at capitalisation across five languages is how
 * "côte d'ivoire" becomes something nobody typed.
 */
function normaliseCountry(value: string): string {
  const text = value.trimStart();
  return /^[A-Za-z]{2}$/.test(text.trim()) ? text.trim().toUpperCase() : text;
}

/** Which sentence sits under the city field, given what the request is doing. */
function cityHelp(
  copy: ProfileCopy,
  status: 'loading' | 'ready' | 'error',
  list: CityList | null,
  draft: Draft,
): string {
  if (status === 'loading') return copy.cityLoading;
  /* Not "no cities". A failed request is a state, not an empty list — the
     paragraph beside the field carries the whole explanation, and this line
     only has to stop claiming the suggestions work. */
  if (status === 'error' || !list) return copy.cityDown;
  /* Already off the list, and told us so: the sentence about picking from a
     list is no longer the instruction. */
  if (draft.otherPlace) return copy.cityOtherHelp;
  /* Typed something the list has never heard of. Said *here*, under the field,
     rather than as an error on submit — the way out is one row down in a menu
     that is already open, and a form that waits until Save to mention it makes
     somebody type the name twice. */
  if (draft.city && !lookupCity(list, draft.city)) return copy.cityNoMatch;
  return fill(copy.cityHelp, { n: String(list.cities.length) });
}
