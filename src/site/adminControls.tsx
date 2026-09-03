/**
 * The console's controls — the small kit every write on `#/admin` is built from.
 *
 * ## Why a kit rather than three hand-rolled buttons
 *
 * Because the interesting part of a destructive control is not the press, it is
 * everything around it: what happens between the press and the answer, what the
 * screen says when the answer is no, and how hard it is to do by accident. Those
 * three are the same for a venue, an offer and a person, and written out three
 * times they would be the same three times only until somebody edited one.
 *
 * ## The rules it enforces
 *
 * - **A write in flight is a state.** `useWrite` holds the key of the action
 *   that is running, so the pressed button says so and cannot be pressed again.
 *   Nothing else on the screen is disabled: an operator reading a table while a
 *   deletion resolves is doing nothing wrong.
 * - **A failure is said out loud, in the server's own words.** `WriteStrip`
 *   prints the dictionary's lead and then the message the API sent, verbatim.
 *   That is deliberate and it is the one place on this site that renders raw
 *   server text: the refusals here are open-ended — an unverified venue, a plan
 *   with no room for another live deal, a confirmation typed wrong — and a
 *   dictionary sentence covering them all would have to be vague enough to be
 *   useless. A translated "something went wrong" is worse than an English
 *   sentence that says which gate closed.
 * - **Destroying something is behind a switch, and then behind a dialogue.**
 *   The reversible presses — pause, resume, suspend, restore, let back in — are
 *   on every row all the time, because they undo with a second press. Everything
 *   that *removes* is drawn only in edit mode (`EditToggle`) and then asks in a
 *   modal that names the thing (`ConfirmDialog`). That replaced a gradient of
 *   two presses for an offer and a typed-back name for a venue; the reasoning
 *   for the swap is at `ConfirmDialog`.
 * - **Nothing here carries `data-reveal`.** The reveal observer is rescanned by
 *   key when a tab changes; a panel that opens on a press arrives afterwards and
 *   would sit at `opacity: 0` for ever. The kit animates nothing for that
 *   reason, which is also the correct answer under `prefers-reduced-motion`. The
 *   one exception is the dialogue's own 140ms fade, which is its arrival rather
 *   than a reveal, and which `prefers-reduced-motion` turns off.
 *
 * Classes are `adm-` prefixed, and the sub-prefix is `adm-act-`, grepped and
 * free. `site.css` is one unscoped sheet — see the note in the root `CLAUDE.md`
 * about the three collisions that have already shipped bugs here.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Write } from './adminWrite';
import { Icon, type IconName } from './icons';
import { useCopy } from './i18n/context';
import { MIN_PASSWORD } from './auth/users';
import { fill } from './i18n/currency';

/**
 * What the last write did, or why it did not.
 *
 * One strip per screen rather than a message per row, because the row is
 * usually the thing that just went away: a deleted venue cannot tell you it was
 * deleted. It sits above the list it belongs to and is replaced by the next
 * action rather than stacking — an operator reading a queue of old receipts is
 * reading nothing.
 */
export function WriteStrip({ write }: { write: Write }) {
  const copy = useCopy().admin.manage;
  if (!write.said) return null;
  const { tone, message } = write.said;

  return (
    <div className="adm-act-strip" data-tone={tone} role="status">
      <Icon name={tone === 'done' ? 'check' : 'warn'} size={15} strokeWidth={2.2} />
      <p>
        {tone === 'done' ? (
          message
        ) : (
          <>
            {copy.failed}{' '}
            {/* The server's own sentence. See the note at the top of this file
                for why it is not translated: these refusals name which gate
                closed, and a dictionary line general enough to cover all of
                them would name none. */}
            <em>{message}</em>
          </>
        )}
      </p>
      <button type="button" className="link-btn" onClick={write.dismiss}>
        {copy.dismiss}
      </button>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════ the presses ══ */

/** How long an armed confirmation stays armed. Long enough to read the word
 *  that replaced the label, short enough that a button left armed on a screen
 *  somebody wandered away from is not still armed when they come back. */
const ARM_MS = 6000;

/**
 * A press, and for a destructive one a second press that means it.
 *
 * `confirm` is what the button says once armed; leaving it out makes this an
 * ordinary one-press button, which is what pause, resume, suspend and restore
 * are — all four undo with a second press, so a confirmation on them is a
 * dialogue about nothing.
 */
export function PressTwice({
  label,
  confirm,
  icon,
  solid,
  busy,
  onPress,
}: {
  label: string;
  confirm?: string;
  icon?: IconName;
  solid?: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const copy = useCopy().admin.manage;
  const [armed, setArmed] = useState(false);

  /* The disarm outlives the button: pressing once and switching tabs unmounts
     this while the timer is still pending. Held in a ref because nothing
     renders it, cleared on unmount and on the next press. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  if (confirm === undefined) {
    return (
      <button
        type="button"
        className={`btn ${solid ? 'btn-solid' : 'btn-ghost'} adm-act-btn`}
        disabled={busy}
        onClick={onPress}
      >
        {icon && <Icon name={icon} size={14} strokeWidth={2.2} />}
        {busy ? copy.working : label}
      </button>
    );
  }

  if (!armed) {
    return (
      <button
        type="button"
        className="btn btn-ghost adm-act-btn"
        disabled={busy}
        onClick={() => {
          setArmed(true);
          clear();
          timer.current = setTimeout(() => setArmed(false), ARM_MS);
        }}
      >
        {icon && <Icon name={icon} size={14} strokeWidth={2.2} />}
        {busy ? copy.working : label}
      </button>
    );
  }

  return (
    <span className="adm-act-armed">
      <button
        type="button"
        className="btn btn-solid adm-act-btn"
        disabled={busy}
        onClick={() => {
          clear();
          setArmed(false);
          onPress();
        }}
      >
        {busy ? copy.working : confirm}
      </button>
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          clear();
          setArmed(false);
        }}
      >
        {copy.cancel}
      </button>
    </span>
  );
}

/* ══════════════════════════════════════════════════════════ the panels ══ */

/**
 * The panel a row opens under itself. One at a time per screen, which is what
 * `open` / `setOpen` in the caller enforces: two half-typed deletions on one
 * screen is two chances to finish the wrong one.
 */
export function ActPanel({
  title,
  body,
  children,
  onClose,
}: {
  title: string;
  body: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const copy = useCopy().admin.manage;
  return (
    <div className="adm-act-panel">
      <div className="adm-act-panel-head">
        <b>{title}</b>
        <button type="button" className="link-btn" onClick={onClose}>
          {copy.cancel}
        </button>
      </div>
      <p>{body}</p>
      {children}
    </div>
  );
}

/*
 * `TypeToConfirm` used to sit here, and it is worth a line saying where it went.
 *
 * It was the last step of the two irreversible removals: an input that stayed
 * disabled until the venue's name or the account's address was typed back,
 * folded with the server's own `foldConfirm` so the two agreed about a trailing
 * space. `ConfirmDialog` replaced it — the reasoning is at that function, and
 * the short version is that a form somebody fills in twenty times an afternoon
 * is one they fill in without reading.
 *
 * `foldConfirm` is still exported from `api/admin.ts` and still used: the server
 * requires the name in the body, and the client sends it. What is gone is asking
 * a person to type it.
 */

/**
 * Set a password for somebody who cannot.
 *
 * The floor is the site's own `MIN_PASSWORD`, which is the same six the server
 * keeps in `CONFIG.auth.minPasswordLength` — the server is the authority and
 * refuses a short one whatever this says; the constant here is so the field can
 * say what it wants *before* the round trip rather than after it.
 *
 * It is a plain `type="password"` with no confirmation field. The operator is
 * typing something they are about to read out or paste into a reply, not
 * choosing a secret they have to remember, so a second box confirms a typo they
 * are looking at.
 */
export function SetPassword({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (password: string) => void;
}) {
  const copy = useCopy().admin.manage;
  const [value, setValue] = useState('');
  const ready = value.length >= MIN_PASSWORD;

  return (
    <form
      className="adm-act-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) onSubmit(value);
      }}
    >
      <label className="field">
        <span className="field-label">{copy.newPassword}</span>
        <input
          type="password"
          value={value}
          autoComplete="new-password"
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
        <span className="field-help">{fill(copy.passwordHelp, { n: String(MIN_PASSWORD) })}</span>
      </label>
      <button type="submit" className="btn btn-solid adm-act-btn" disabled={!ready || busy}>
        {busy ? copy.working : copy.setPassword}
      </button>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════ edit mode ══ */

/**
 * The toolbar switch that puts a pencil and a bin on every row.
 *
 * One control with two labels rather than a label beside a state, because what
 * a person needs to know is what pressing it will do — and off is the resting
 * state, so the console reads before it edits. It sits between the search field
 * and the tabs: search narrows what is listed, the tabs choose what kind of
 * thing is listed, and this decides whether the list can be changed. Three
 * different questions, in that order.
 */
export function EditToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const copy = useCopy().admin.manage;
  return (
    <button
      type="button"
      className={`btn ${on ? 'btn-solid' : 'btn-ghost'} adm-edit-toggle`}
      aria-pressed={on}
      onClick={onToggle}
    >
      <Icon name="pencil" size={15} strokeWidth={2.1} />
      {on ? copy.editOn : copy.edit}
    </button>
  );
}

/**
 * The pair edit mode puts on a row: correct it, or remove it.
 *
 * Icon-only, and labelled for a screen reader rather than in ink. Every row on
 * this console already carries a name, a sub-line and up to three worded
 * controls; two more words per row on a list of two hundred is a wall, and a
 * pencil and a bin are the two glyphs in this business nobody has to be taught.
 *
 * `onEdit` is optional. Not every row here has anything a person could honestly
 * correct — a gift card's face value is stock somebody has bought against — and
 * the partner dashboard's honesty rule applies to this console too: a control
 * with nothing behind it is not drawn, rather than drawn and refused.
 */
export function RowActions({
  editing,
  busy,
  onEdit,
  onDelete,
}: {
  /** Whether this row's own edit form is the one that is open. */
  editing?: boolean;
  busy?: boolean;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const copy = useCopy().admin.manage;
  return (
    <span className="adm-row-acts">
      {onEdit && (
        <button
          type="button"
          className="adm-ico-btn"
          data-on={editing ? 'true' : undefined}
          aria-label={copy.editRow}
          title={copy.editRow}
          disabled={busy}
          onClick={onEdit}
        >
          <Icon name="pencil" size={15} strokeWidth={2.1} />
        </button>
      )}
      <button
        type="button"
        className="adm-ico-btn"
        data-danger="true"
        aria-label={copy.deleteRow}
        title={copy.deleteRow}
        disabled={busy}
        onClick={onDelete}
      >
        <Icon name="trash" size={15} strokeWidth={2.1} />
      </button>
    </span>
  );
}

/**
 * "Are you sure?" — a real dialogue, over the page.
 *
 * It replaces a panel that opened *inside* the row and asked the operator to
 * type the venue's name back. Two things were wrong with that. A panel in a
 * list scrolls, so the question could be asked off-screen; and a typed
 * confirmation on a control somebody uses twenty times an afternoon is one they
 * learn to type without reading — a ceremony that buys nothing and spends the
 * attention the real warnings need. What a confirmation has to do is **name the
 * thing** and take a deliberate second press, and this does both in the middle
 * of the screen with the rest of it dimmed.
 *
 * The server still requires the name in the body — see `api/admin.ts`. That has
 * not become ceremony: it is the client proving it knows which row it is about
 * to destroy, which is the failure a mis-wired list produces.
 *
 * Three behaviours it has to have and a bare `<div>` does not:
 *
 * - **Escape closes it.** The one gesture everybody tries first.
 * - **Cancel takes focus**, so a keyboard press lands on the way out rather
 *   than on the deletion.
 * - **The backdrop closes it**, but only when the press *started* on the
 *   backdrop — a drag that begins inside the card and ends outside it is a text
 *   selection, and closing on that throws away the sentence being read.
 */
export function ConfirmDialog({
  title,
  body,
  action,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const copy = useCopy().admin.manage;
  const cancel = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Where the press started. See the note above: without it, selecting the
     venue's name in the sentence and releasing past the card's edge closes the
     dialogue. */
  const from = useRef<EventTarget | null>(null);

  return (
    <div
      className="adm-modal"
      onMouseDown={(event) => {
        from.current = event.target;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && from.current === event.currentTarget) onClose();
      }}
    >
      <div className="adm-modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="adm-modal-acts">
          <button type="button" className="link-btn" ref={cancel} onClick={onClose}>
            {copy.cancel}
          </button>
          <button
            type="button"
            className="btn btn-solid adm-act-btn"
            disabled={busy}
            onClick={onConfirm}
          >
            <Icon name="trash" size={14} strokeWidth={2.2} />
            {busy ? copy.working : action}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════ the edit form ══ */

/** One field of an edit form. `options` turns it into a `<select>`. */
export interface EditField {
  key: string;
  label: string;
  value: string;
  type?: 'text' | 'date' | 'textarea';
  options?: Array<{ value: string; label: string }>;
}

/**
 * The form a pencil opens, under the row it belongs to.
 *
 * Generic over a field list rather than written three times, because a venue, an
 * offer and a person differ only in *which* fields they have — the save, the
 * "nothing changed so send nothing" rule and the busy state are the same three
 * for all of them, and written out per screen they would be the same three only
 * until somebody edited one.
 *
 * **It sends only what changed.** Every PATCH behind it `COALESCE`s an absent
 * key, so an untouched field left out is a field the server does not write —
 * which is what stops two operators editing different halves of one row from
 * overwriting each other with stale values neither of them looked at.
 *
 * The controls are the `══ forms ══` kit's, like everything else on this site
 * that takes input. Nothing here styles its own.
 */
export function EditForm({
  fields,
  busy,
  onSave,
  onClose,
}: {
  fields: EditField[];
  busy: boolean;
  onSave: (patch: Record<string, string>) => void;
  onClose: () => void;
}) {
  const copy = useCopy().admin.manage;
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.value])),
  );

  const changed = fields.filter((field) => draft[field.key] !== field.value);

  return (
    <form
      className="adm-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || changed.length === 0) return;
        onSave(Object.fromEntries(changed.map((field) => [field.key, draft[field.key]])));
      }}
    >
      <div className="adm-edit-grid">
        {fields.map((field) => (
          <label
            className="field"
            key={field.key}
            data-wide={field.type === 'textarea' ? 'true' : undefined}
          >
            <span className="field-label">{field.label}</span>
            {field.options ? (
              <select
                value={draft[field.key]}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                rows={2}
                value={draft[field.key]}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
              />
            ) : (
              <input
                type={field.type === 'date' ? 'date' : 'text'}
                value={draft[field.key]}
                autoComplete="off"
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <div className="adm-edit-acts">
        <button type="button" className="link-btn" onClick={onClose}>
          {copy.cancel}
        </button>
        {/* Disabled until something is actually different: a save that writes
            nothing still fires a re-read of four lists and then tells the
            operator it worked, which is a confirmation of nothing. */}
        <button
          type="submit"
          className="btn btn-solid adm-act-btn"
          disabled={busy || changed.length === 0}
        >
          {busy ? copy.working : copy.save}
        </button>
      </div>
    </form>
  );
}
