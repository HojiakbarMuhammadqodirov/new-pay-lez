/**
 * The partner dashboard's component kit — v3's recurring recipes, once.
 *
 * Every screen of the redesign is built out of these, and the reason they are
 * components rather than a page of class names is that each one carries a rule
 * that is easy to get wrong at a call site: a `Pill` takes a *state* and picks
 * its own colour pair; a `Progress` takes money and makes the three-state bar
 * (spent · set aside · free) that cannot be drawn summing to more than the
 * pool; a `Drawer` and a `Modal` portal into the frame's overlay root so they
 * keep the `.pd-app` tokens and escape any transformed ancestor; a `Toggle` is a
 * real checkbox. Styling is `dashboard.css`, `dx-*` classes, tokens only.
 *
 * **Components only**, for React fast refresh — the hooks and pure helpers
 * they use are in `dashboardKitHooks.ts`, the icon paths in `dashboardIcons.ts`.
 *
 * The toast is not here as a thing a screen renders: it lives on the frame, and
 * a screen raises it with `useDashboard().toast(text)`. `Toast` below is the
 * component the frame draws.
 */
import { useEffect, useId } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

import { DX_ICONS, type DxIconName } from './dashboardIcons';
import { share, sparkPaths, useOverlay } from './dashboardKitHooks';
import { useDashboard } from './dashboardShell';
import { useCopy } from './i18n/context';

/* ─────────────────────────────────────────────────────────────── icon ── */

/** v3's `ic()`: 24×24, stroke only, round, 1.8 wide, `currentColor`. */
export function DxIcon({
  name,
  size = 17,
  strokeWidth = 1.8,
  className,
}: {
  name: DxIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: '0 0 auto' }}
      aria-hidden
    >
      {DX_ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────── page structure ── */

/**
 * A screen's head: the 26/800 title, the 14px sentence under it, and the
 * screen's own buttons on the right. Screens whose `head` is `'own'` in
 * `DASH_SCREENS` render this themselves; `'frame'` screens get one from the
 * frame.
 */
export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="dx-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="dx-head-acts">{actions}</div> : null}
    </div>
  );
}

/**
 * A card. `tone="ink"` is v3's dark slab (the heroes, the previews, the
 * summaries) — ink on paper, the glass card on black, where it is already dark.
 * `pad="none"` is for a card whose child is a table running edge to edge.
 */
export function Card({
  tone = 'light',
  pad = 'md',
  as: Tag = 'section',
  className,
  children,
  ...rest
}: {
  tone?: 'light' | 'ink';
  pad?: 'md' | 'sm' | 'none';
  as?: 'section' | 'div' | 'article';
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <Tag
      className={className ? `dx-card ${className}` : 'dx-card'}
      data-tone={tone === 'ink' ? 'ink' : undefined}
      data-pad={pad === 'md' ? undefined : pad}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** A card's own title row: an `h2`, an optional sentence, and whatever sits right. */
export function CardHead({
  title,
  sub,
  aside,
}: {
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="dx-card-head">
      <div>
        <h2>{title}</h2>
        {sub ? <p className="dx-card-sub">{sub}</p> : null}
      </div>
      {aside}
    </div>
  );
}

/**
 * The 11px uppercase kicker. `deep` on a light card, `mint` on an ink one,
 * `faint` for a drawer's section label. Write the copy in sentence case — the
 * transform capitalises it, so translators never have to.
 */
export function Eyebrow({
  tone = 'deep',
  children,
}: {
  tone?: 'deep' | 'mint' | 'faint';
  children: ReactNode;
}) {
  return (
    <span className="dx-eyebrow" data-tone={tone === 'deep' ? undefined : tone}>
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────── figures ── */

/**
 * One figure: label, value, an optional change against the previous period,
 * a note, and a sparkline. `value` is a node so a caller can pass `Figure`
 * (which draws the em dash for a withheld metric) rather than a number it
 * invented; the same goes for `delta` — leave it out when nobody measured it,
 * never pass 0.
 */
export function Metric({
  label,
  value,
  delta,
  note,
  spark,
  sparkTone = 'deep',
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: { text: string; dir: 'up' | 'down' };
  note?: ReactNode;
  spark?: readonly number[];
  sparkTone?: 'deep' | 'ink';
}) {
  return (
    <Card className="dx-metric" pad="none">
      <div>
        <div className="dx-metric-label">{label}</div>
        <div className="dx-metric-value">{value}</div>
        <div className="dx-metric-foot">
          {delta && (
            <span className="dx-delta" data-dir={delta.dir}>
              {delta.dir === 'up' ? '↑' : '↓'} {delta.text}
            </span>
          )}
          {note}
        </div>
      </div>
      {spark && <Sparkline points={spark} tone={sparkTone} />}
    </Card>
  );
}

/** v3's 76×30 trend line with the area under it at 10%. */
export function Sparkline({
  points,
  tone = 'deep',
  width = 76,
  height = 30,
  strokeWidth = 1.6,
}: {
  points: readonly number[];
  tone?: 'deep' | 'ink';
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  const paths = sparkPaths(points, width, height);
  if (!paths) return null;
  return (
    <svg
      className="dx-spark"
      data-tone={tone === 'ink' ? 'ink' : undefined}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <path d={paths.area} fill="currentColor" opacity={0.1} />
      <path
        d={paths.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type PillTone =
  | 'live'
  | 'active'
  | 'scheduled'
  | 'paused'
  | 'invited'
  | 'warn'
  | 'stopped'
  | 'down'
  | 'ended'
  | 'draft'
  | 'neutral'
  | 'purple'
  | 'ink'
  | 'mint';

/**
 * A status pill. Pass the state, not a colour: the pair (text on tint) is the
 * pill's business. `ended`, `draft` and `neutral` are the same quiet grey —
 * three names because a call site reads better saying which it means.
 *
 * Every coloured pill must also *say* its state in words; the hue is the
 * second channel, never the only one.
 */
export function Pill({
  tone = 'neutral',
  size = 'md',
  children,
}: {
  tone?: PillTone;
  size?: 'md' | 'sm';
  children: ReactNode;
}) {
  return (
    <span className="dx-pill" data-tone={tone} data-size={size === 'sm' ? 'sm' : undefined}>
      {children}
    </span>
  );
}

/* ───────────────────────────────────────────────────────────── controls ── */

type ButtonVariant = 'primary' | 'secondary' | 'small' | 'danger' | 'mint';

/**
 * v3's buttons. `primary` is the press (ink with mint on paper, mint with ink
 * on black); `secondary` the white bordered one; `small` the 9px-radius row
 * action (Edit, Pause); `danger` the confirm button of a destructive dialogue;
 * `mint` the in-card press on an ink slab. `icon` leads at 15px.
 */
export function Button({
  variant = 'secondary',
  icon,
  block,
  children,
  type = 'button',
  ...rest
}: {
  variant?: ButtonVariant;
  icon?: DxIconName;
  block?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className="dx-btn"
      data-variant={variant}
      data-block={block ? 'true' : undefined}
      {...rest}
    >
      {icon && <DxIcon name={icon} size={15} strokeWidth={variant === 'primary' ? 2 : 1.8} />}
      {children}
    </button>
  );
}

/**
 * A segmented control — one of N. Buttons with `aria-pressed`, inside a group
 * with a label, rather than radios: it is a filter or a mode, and a pressed
 * button is how this site writes both.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="dx-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** An on/off switch: a real checkbox under v3's 46×26 track. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="dx-toggle">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="dx-toggle-track" aria-hidden />
      <span>{label}</span>
    </label>
  );
}

/**
 * The three-state bar of a pool: **spent**, **set aside** (the hatch), and the
 * free remainder (the track). Pass money in one unit; the widths are shares of
 * `total`, clamped, and `aside` is drawn only in what `spent` left — so the bar
 * can never show more committed than the pool holds, which is the arithmetic
 * rule the dashboard states for every pool.
 *
 * `tone` overrides the spent fill: `amber` for a pool nearly gone (v3 turns the
 * bar amber past 85%), `down` for one that stopped. `auto` does the 85% rule.
 */
export function Progress({
  spent,
  aside = 0,
  total,
  tone = 'auto',
  height = 6,
  track = 'line',
  label,
}: {
  spent: number;
  aside?: number;
  total: number;
  tone?: 'auto' | 'fill' | 'amber' | 'down';
  height?: number;
  track?: 'line' | 'soft';
  label?: string;
}) {
  const used = share(spent, total);
  const held = Math.min(share(aside, total), 1 - used);
  const resolved = tone === 'auto' ? (used + held > 0.85 ? 'amber' : 'fill') : tone;
  return (
    <div
      className="dx-progress"
      data-tone={resolved === 'fill' ? undefined : resolved}
      data-track={track === 'soft' ? 'soft' : undefined}
      style={{ ['--dx-progress-h' as string]: `${height}px` }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i data-part="spent" style={{ width: `${(used * 100).toFixed(1)}%` }} />
      {held > 0 && <i data-part="aside" style={{ width: `${(held * 100).toFixed(1)}%` }} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── fields ── */

/**
 * A labelled field. The `<label>` wraps the control, so the whole block is the
 * target — the rule `site.css`'s field kit states for every form. The shared
 * `.field` kit is not restyled: this is the dashboard's own, scoped to `dx-`.
 */
export function Field({
  label,
  help,
  error,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="dx-field">
      <span className="dx-field-label">{label}</span>
      {children}
      {error ? <span className="dx-field-error">{error}</span> : help ? <span className="dx-field-help">{help}</span> : null}
    </label>
  );
}

export function Input({ invalid, ...rest }: { invalid?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return <input className="dx-input" aria-invalid={invalid || undefined} {...rest} />;
}

export function Textarea({ invalid, ...rest }: { invalid?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="dx-input" aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="dx-input" {...rest}>
      {children}
    </select>
  );
}

/**
 * v3's "unit field": a number and its unit in one bordered well. Money typed
 * here is in the **reader's** currency (the dashboard rule for inputs); convert
 * at the point a request needs venue minor units.
 */
export function UnitField({
  unit,
  invalid,
  ...rest
}: { unit: ReactNode; invalid?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="dx-input dx-unit" aria-invalid={invalid || undefined}>
      <input type="number" inputMode="decimal" {...rest} />
      <span>{unit}</span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────── tables ── */

/**
 * A table in v3's dress: header on bone, hairline rows, a hover. `minWidth` is
 * where it starts scrolling sideways instead of crushing its columns — v3's own
 * numbers are 700 to 1120px depending on the table.
 */
export function Table({
  minWidth,
  label,
  children,
}: {
  minWidth?: number;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="dx-table-wrap">
      <table className="dx-table" style={minWidth ? { minWidth } : undefined} aria-label={label}>
        {children}
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── empty state ── */

/**
 * The panel a screen shows when there is genuinely nothing yet — which, after
 * the purge, is the ordinary first state of every screen. It says what would
 * fill it and offers the one press that would start; leave `action` out when
 * the next step is not a press (a QR code on a counter is not a button).
 */
export function EmptyState({
  icon = 'deals',
  title,
  body,
  suggestion,
  action,
}: {
  icon?: DxIconName;
  title: ReactNode;
  body: ReactNode;
  suggestion?: { kicker: ReactNode; title: ReactNode; note?: ReactNode };
  action?: { label: ReactNode; onClick: () => void };
}) {
  return (
    <Card className="dx-empty">
      <div className="dx-empty-ico">
        <DxIcon name={icon} size={20} />
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      {suggestion && (
        <div className="dx-empty-suggest">
          <Eyebrow tone="faint">{suggestion.kicker}</Eyebrow>
          <b>{suggestion.title}</b>
          {suggestion.note && <span>{suggestion.note}</span>}
        </div>
      )}
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Card>
  );
}

/**
 * A screen the redesign has not reached yet. It says so, in the reader's
 * language, rather than drawing a layout with nothing true in it. Replace the
 * registry entry with the real screen; do not leave this behind a real one.
 */
export function SoonPanel({ icon }: { icon: DxIconName }) {
  const soon = useCopy().dashboard.frame.soon;
  return (
    <Card className="dx-empty">
      <div className="dx-empty-ico">
        <DxIcon name={icon} size={20} />
      </div>
      <Eyebrow>{soon.kicker}</Eyebrow>
      <h2 style={{ marginTop: 8 }}>{soon.title}</h2>
      <p>{soon.body}</p>
    </Card>
  );
}

/** v3's callout box — neutral bone, a mint suggestion, an amber warning, a red stop. */
export function Callout({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'mint' | 'amber' | 'down';
  children: ReactNode;
}) {
  return (
    <div className="dx-callout" data-tone={tone === 'neutral' ? undefined : tone}>
      {children}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── overlays ── */

/** Mount into the frame's overlay root — see `overlayRoot` on the shell. */
function InFrame({ children }: { children: ReactNode }) {
  const { overlayRoot } = useDashboard();
  return overlayRoot ? createPortal(children, overlayRoot) : <>{children}</>;
}

/**
 * The slide-over from the right (v3 §5.1): kicker, title, sentence, a close,
 * a scrolling body, and a footer. `invalid` is the footer's validation strip —
 * pass the sentence when the primary button is disabled for a reason, so the
 * reason is on screen rather than in the owner's head.
 *
 * Wrap the body's sections in `<div className="dx-sections">` for v3's 26px
 * rhythm with a hairline between.
 */
export function Drawer({
  kicker,
  title,
  sub,
  onClose,
  footer,
  invalid,
  children,
}: {
  kicker?: ReactNode;
  title: string;
  sub?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  invalid?: ReactNode;
  children: ReactNode;
}) {
  const copy = useCopy().dashboard.drawer;
  const panel = useOverlay<HTMLElement>(onClose);

  return (
    <InFrame>
      <div className="dx-overlay" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="dx-scrim" aria-label={copy.close} onClick={onClose} />
        <section className="dx-drawer" ref={panel} tabIndex={-1}>
          <header className="dx-drawer-head">
            <div>
              {kicker && <Eyebrow>{kicker}</Eyebrow>}
              <h2>{title}</h2>
              {sub && <p>{sub}</p>}
            </div>
            <CloseButton onClose={onClose} />
          </header>
          <div className="dx-drawer-body">{children}</div>
          {(footer || invalid) && (
            <footer className="dx-drawer-foot">
              {invalid && <p className="dx-invalid">{invalid}</p>}
              {footer && <div className="dx-drawer-acts">{footer}</div>}
            </footer>
          )}
        </section>
      </div>
    </InFrame>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const copy = useCopy().dashboard.drawer;
  return (
    <button
      type="button"
      className="dx-icon-btn"
      data-size="sm"
      aria-label={copy.close}
      title={copy.close}
      onClick={onClose}
    >
      <DxIcon name="close" size={15} strokeWidth={2} />
    </button>
  );
}

/**
 * A centred modal (v3's plan modal is 920px, the review 460px). The body
 * scrolls inside a 90vh ceiling, so a long one never pushes its own close off
 * the screen.
 */
export function Modal({
  kicker,
  title,
  lede,
  width = 920,
  onClose,
  children,
}: {
  kicker?: ReactNode;
  title: string;
  lede?: ReactNode;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const copy = useCopy().dashboard.drawer;
  const panel = useOverlay<HTMLDivElement>(onClose);

  return (
    <InFrame>
      <div className="dx-overlay" data-kind="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="dx-scrim" aria-label={copy.close} onClick={onClose} />
        <div
          className="dx-modal"
          ref={panel}
          tabIndex={-1}
          style={{ ['--dx-modal-w' as string]: `${width}px` }}
        >
          <header className="dx-modal-head">
            <div>
              {kicker && <Eyebrow>{kicker}</Eyebrow>}
              <h2>{title}</h2>
              {lede && <p>{lede}</p>}
            </div>
            <CloseButton onClose={onClose} />
          </header>
          <div className="dx-modal-body">{children}</div>
        </div>
      </div>
    </InFrame>
  );
}

/**
 * The question before something that cannot be undone. It **names the thing**
 * in `title` ("Remove Andrii?") and asks in words; the colour (`danger` red,
 * `regen` amber) is the second channel. One deliberate press — no typing the
 * name back, which an owner doing this twenty times stops reading.
 */
export function ConfirmDialog({
  tone = 'danger',
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  tone?: 'danger' | 'regen';
  title: string;
  body: ReactNode;
  confirmLabel: ReactNode;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = useCopy().dashboard.drawer;
  const panel = useOverlay<HTMLDivElement>(onCancel);
  const titleId = useId();

  return (
    <InFrame>
      <div className="dx-overlay" data-kind="modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="dx-scrim" aria-label={copy.cancel} onClick={onCancel} />
        <div className="dx-confirm" data-tone={tone} ref={panel} tabIndex={-1}>
          <div className="dx-confirm-ico">
            <DxIcon name="warn" size={22} />
          </div>
          <h3 id={titleId}>{title}</h3>
          <p>{body}</p>
          <div className="dx-confirm-acts">
            <Button variant="secondary" onClick={onCancel}>
              {copy.cancel}
            </Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </InFrame>
  );
}

/** How long the strip stays — v3's 3.2 s, reset by each new message. */
const TOAST_MS = 3200;

/**
 * The confirmation strip, drawn by the frame. Screens call
 * `useDashboard().toast(text)`; each new message restarts the clock. An
 * `<output>`, so it is announced politely: it confirms a press the reader made.
 */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  return (
    <output className="dx-toast">
      <i aria-hidden>
        <DxIcon name="check" size={12} strokeWidth={3} />
      </i>
      {message}
    </output>
  );
}
