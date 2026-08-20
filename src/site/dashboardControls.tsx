/**
 * Controls shared by the dashboard's screens and its create drawer.
 *
 * Split out rather than exported from `dashboardDrawer.tsx` because the drawer
 * is not the owner of these — the vouchers screen types into the same well the
 * drawer does, and a screen importing a control *from the drawer* reads as a
 * dependency that is not there.
 */

/** A number well with its unit welded to the right of the digits. */
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
  return (
    /* A `<label>` around the whole well, not just the digits: the unit and the
       empty space after the number have to put the caret in the field too. The
       Relocate converter shipped the other version and only its digits were
       tappable (root `CLAUDE.md`). */
    <label className="pd-well" data-wide={wide ? 'true' : undefined}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        aria-label={label}
        step={step}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span>{unit}</span>
    </label>
  );
}
