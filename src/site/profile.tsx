import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from './icons';
import { byCountry, useCities, type City } from './api/profile';
import { useAuth } from './auth/context';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import {
  BIRTH_DATE_WRITES,
  HEADLINE_MAX,
  USERNAME_MAX,
  USERNAME_MIN,
  profileGaps,
  profilePercent,
} from './auth/users';

/**
 * `#/profile` — the seven things a person tells us about themselves.
 *
 * Photo, username, status line, city, email, phone, birthday. It is the same
 * set the server's `updateProfile` writes, and it has to be: this page is the
 * prototype's front end onto rules that already exist somewhere else, and a
 * form that accepted what the server refuses would be a form that works until
 * the day the two halves are wired together.
 *
 * Three of the seven have rules that are not "is it a string", and all three
 * are explained on the page rather than discovered by being refused:
 *
 * - **The username is unique.** Checked against the whole directory, and a
 *   clash comes back naming the field, the way a 409 does.
 * - **The city is chosen, not typed.** It comes from `GET /v1/cities` — the
 *   same closed set the write is validated against — and the country is *not a
 *   second question*: it is a fact about the city and arrives with it.
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
 */

/* ──────────────────────────────────────────────────────────────── photo ── */

/**
 * How big a stored avatar is, per side.
 *
 * 192 rather than the 44 the card draws it at, because the same data URL is the
 * only copy — a retina screen and a future larger card both read this one — and
 * 192² of JPEG is a few kilobytes either way. What it is *not* is the file the
 * picker handed over: a phone photo is three or four megabytes of base64, and
 * an origin has about five megabytes of `localStorage` for everything on this
 * site put together.
 */
const AVATAR_PX = 192;

/*
 * The three bounds the form's sentences quote, as strings.
 *
 * They are written once here rather than at each `fill()` because a rule stated
 * in a help line and refused by a validator has to quote the same number, and
 * `String(USERNAME_MIN)` typed four times is four places for that to drift.
 */
const MIN = String(USERNAME_MIN);
const MAX = String(USERNAME_MAX);
const CAP = String(HEADLINE_MAX);

/** The page's own slice of the dictionary, for the two helpers below it. */
type ProfileCopy = ReturnType<typeof useCopy>['profile'];

/**
 * A picked file as a small square data URL.
 *
 * Cover-cropped rather than squashed: a portrait photo scaled to a square makes
 * a face narrow, and every use of this is a disc. JPEG rather than PNG because
 * the input is a photograph, and `0.82` is where the artefacts stop being
 * visible at this size.
 *
 * Rejects by resolving to `null` rather than throwing — the only realistic
 * failure is a file that is not an image, and the honest response to that is to
 * leave the photo alone.
 */
async function toAvatar(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
    });
    image.src = url;
    if (!(await loaded)) return null;

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_PX,
      AVATAR_PX,
    );
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    /* Always, including on the failure paths above: an object URL is a live
       reference to the file and is not collected while it exists. */
    URL.revokeObjectURL(url);
  }
}

/* ─────────────────────────────────────────────────────────────── the kit ── */

/**
 * One row of the field kit — the same shape `businessSetup.tsx` uses, and for
 * the same reason it is a component there: a `<label>` wraps its one control
 * without needing an id at both ends, and `wraps={false}` renders a `<div>` for
 * the rows whose child is *itself* a label (the file picker) or is not a
 * control at all. Nesting `<label>` is invalid, and browsers agree on what it
 * costs: the outer one's implicit control resolves to the inner input.
 */
function Field({
  label,
  help,
  error,
  wraps = true,
  children,
}: {
  label: string;
  help?: ReactNode;
  error?: string;
  wraps?: boolean;
  children: ReactNode;
}) {
  const Row = wraps ? 'label' : 'div';
  return (
    <Row className="field">
      <span className="field-label">{label}</span>
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

/* ───────────────────────────────────────────────────────────────── page ── */

interface Draft {
  username: string;
  headline: string;
  city: string;
  countryCode: string;
  phone: string;
  birthDate: string;
  avatar: string;
}

export function ProfilePage() {
  const { account, saveProfile } = useAuth();
  const copy = useCopy().profile;
  const cities = useCities();
  const [draft, setDraft] = useState<Draft>(() => ({
    username: account?.profile.username ?? '',
    headline: account?.profile.headline ?? '',
    city: account?.profile.city ?? '',
    countryCode: account?.profile.countryCode ?? '',
    phone: account?.profile.phone ?? '',
    birthDate: account?.profile.birthDate ?? '',
    avatar: account?.profile.avatar ?? '',
  }));
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

  const grouped = useMemo(
    () => (cities.state.status === 'ready' ? byCountry(cities.state.data) : []),
    [cities.state],
  );

  if (!account) return null;
  const profile = account.profile;
  const gaps = profileGaps(profile, account.email);
  const percent = profilePercent(profile, account.email);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = saveProfile({
      username: draft.username,
      headline: draft.headline,
      phone: draft.phone,
      birthDate: draft.birthDate,
      avatar: draft.avatar,
      /* The pair or neither. A country is a fact about a city, so there is no
         shape here that can send one without the other — see `ProfilePatch`. */
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
    } else if (result.field === 'headline') {
      setError({ field: 'headline', message: fill(copy.headlineLong, { max: CAP }) });
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

                {/* `wraps={false}`: the child is a `<label>` of its own. */}
                <Field label={copy.photo} help={copy.photoHelp} wraps={false}>
                  <div className="prof-photo">
                    <span className="prof-avatar" aria-hidden>
                      {draft.avatar ? <img src={draft.avatar} alt="" /> : initialOf(account.name)}
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

                <Field
                  label={copy.headline}
                  help={fill(copy.headlineHelp, {
                    n: String(HEADLINE_MAX - draft.headline.length),
                  })}
                  error={error?.field === 'headline' ? error.message : undefined}
                >
                  <textarea
                    rows={2}
                    maxLength={HEADLINE_MAX}
                    placeholder={copy.headlinePlaceholder}
                    value={draft.headline}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, headline: event.target.value }));
                      clear();
                    }}
                  />
                </Field>
              </fieldset>

              <fieldset className="form-block" data-reveal>
                <legend>{copy.whereLegend}</legend>

                <div className="field-row">
                  <Field label={copy.city} help={cityHelp(copy, cities.state.status, draft.city)}>
                    {/*
                      A `<select>` and not a text field, and that is the rule
                      rather than a styling choice: the city leaderboard groups
                      on this string with a literal `=`, so free text does not
                      make a messy board, it makes *several* boards — one per
                      spelling, each with one player on it.
                    */}
                    <select
                      value={draft.city}
                      disabled={cities.state.status !== 'ready'}
                      onChange={(event) => {
                        const chosen = findCity(grouped, event.target.value);
                        setDraft((current) => ({
                          ...current,
                          city: chosen?.name ?? '',
                          countryCode: chosen?.country ?? '',
                        }));
                        clear();
                      }}
                    >
                      <option value="">{copy.cityChoose}</option>
                      {/*
                        The stored city, when the list has not arrived or no
                        longer contains it. Without this the control shows
                        "Choose your city" over an account that has one, which
                        reads as the value having been lost — and a save from
                        that state would send an empty city back.
                      */}
                      {draft.city && !findCity(grouped, draft.city) && (
                        <option value={draft.city}>{draft.city}</option>
                      )}
                      {grouped.map(([code, list]) => (
                        <optgroup key={code} label={countryName(copy, code)}>
                          {list.map((city) => (
                            <option key={city.name} value={city.name}>
                              {city.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>

                  {/*
                    A fact, not a field. The country follows from the city and
                    is never asked for separately — the server derives it in
                    `resolveCity` for exactly this reason — so showing it as an
                    input would be offering a control whose only honest
                    behaviour is to refuse every edit.
                  */}
                  <Field label={copy.country} wraps={false}>
                    <p className="prof-fact">
                      {draft.countryCode
                        ? countryName(copy, draft.countryCode)
                        : '—'}
                    </p>
                  </Field>
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
                  <span className="prof-avatar prof-avatar-lg" aria-hidden>
                    {profile.avatar ? (
                      <img src={profile.avatar} alt="" />
                    ) : (
                      initialOf(account.name)
                    )}
                  </span>
                  <div>
                    <b>{account.name}</b>
                    <span className="prof-handle">
                      {profile.username ? `@${profile.username}` : copy.cardNoName}
                    </span>
                  </div>
                </div>
                <p className="prof-card-line">{profile.headline || copy.cardNoLine}</p>
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

const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase() || '?';

const findCity = (grouped: Array<[string, City[]]>, name: string): City | undefined =>
  grouped.flatMap(([, list]) => list).find((city) => city.name === name);

/** The country a code names, or the code itself when the table has not got it. */
function countryName(copy: ProfileCopy, code: string): string {
  return copy.countries[code as keyof ProfileCopy['countries']] ?? code;
}

/** Which sentence sits under the city picker, given what the request is doing. */
function cityHelp(
  copy: ProfileCopy,
  status: 'loading' | 'ready' | 'error',
  chosen: string,
): string {
  if (status === 'loading') return copy.cityLoading;
  /* Not "no cities". A failed request is a state, not an empty list — the
     paragraph beside the field carries the whole explanation, and this line
     only has to stop claiming the picker works. */
  if (status === 'error') return chosen ? copy.cityKept : copy.cityDown;
  return copy.cityHelp;
}
