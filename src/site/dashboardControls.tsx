/**
 * Controls shared by the dashboard's screens and its create drawer.
 *
 * Split out rather than exported from `dashboardDrawer.tsx` because the drawer
 * is not the owner of these — the vouchers screen types into the same well the
 * drawer does, and a screen importing a control *from the drawer* reads as a
 * dependency that is not there.
 */

import { useState } from 'react';

/**
 * A number well with its unit welded to the right of the digits.
 *
 * It types in text and reports numbers, and the two are not the same thing: the
 * field held `Number(event.target.value)` once, and `Number('')` is 0, so
 * backspacing over the last digit of a budget snapped the well to zero and the
 * voucher pool under it to "budget exhausted" — mid-word, before the owner had
 * finished replacing the figure. A field you cannot clear is a field you cannot
 * retype.
 *
 * So the keystrokes live here as a draft string and only a value that parses is
 * handed up. While the draft stands the parent's number is the *last* thing the
 * owner typed rather than the empty box on screen, which is the honest reading:
 * nothing has been asked for yet. Blur drops the draft, and the well falls back
 * to whatever the parent made of it — rounding included, which is why the draft
 * has to survive the keystrokes in the first place.
 */
export function NumberWell({
  value,
  onChange,
  unit,
  label,
  wide,
  step,
  min,
}: {
  value: number;
  onChange: (next: number) => void;
  unit: string;
  label: string;
  wide?: boolean;
  step?: number;
  min?: number;
}) {
  /* `null` is "not being typed into" — not `''`, which is a real draft and the
     whole state this exists to hold. */
  const [draft, setDraft] = useState<string | null>(null);

  return (
    /* A `<label>` around the whole well, not just the digits: the unit and the
       empty space after the number have to put the caret in the field too. The
       Relocate converter shipped the other version and only its digits were
       tappable (root `CLAUDE.md`). */
    <label className="pd-well" data-wide={wide ? 'true' : undefined}>
      <input
        type="number"
        value={draft ?? (Number.isFinite(value) ? String(value) : '')}
        aria-label={label}
        step={step}
        min={min}
        onChange={(event) => {
          const typed = event.target.value;
          setDraft(typed);
          /* An empty box, a lone minus sign and a trailing decimal point are all
             halfway to a number rather than a number, and `Number` turns two of
             the three into 0 without saying so. They stay on screen and go no
             further. */
          const next = Number(typed);
          if (typed.trim() !== '' && Number.isFinite(next)) onChange(next);
        }}
        onBlur={() => setDraft(null)}
      />
      <span>{unit}</span>
    </label>
  );
}
