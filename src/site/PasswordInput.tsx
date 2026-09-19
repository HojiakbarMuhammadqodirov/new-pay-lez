/**
 * A password field you can look at.
 *
 * ## Why it is one component and not four `useState`s
 *
 * There are four password inputs in this site — sign-in, sign-up, the
 * operator's password reset, and the console's sign-in panel — and the toggle
 * is the same four lines in each. The repo's own rule is that there is **one
 * field kit**: anything that takes input reuses `.field`, `.field-label`,
 * `.field-error` rather than styling its own controls. A show/hide button is
 * part of that kit, so it is one component, and the reason that matters is not
 * tidiness — it is that a toggle written four times is a toggle that is
 * accessible in three places.
 *
 * ## The input only, not the label
 *
 * Deliberately. The two kit shapes wrap a password differently — sign-in puts
 * the input inside `<label className="field">`, the console puts
 * `className="field"` on the input inside a `.field-row` — and a component that
 * owned the label would have to take a `variant` prop to render both. So this
 * owns the input and the button and nothing else, and each call site keeps the
 * shape it already had.
 *
 * ## What makes it accessible rather than merely clickable
 *
 * - **A real `<button type="button">`.** Keyboard-reachable because it is a
 *   button, not because of a `tabIndex`; and `type="button"` because the
 *   default inside a form is `submit`, so without it looking at your password
 *   submits the form.
 * - **`aria-pressed`**, which is what a toggle is. A screen reader then says
 *   "show password, pressed" rather than leaving the reader to infer the state
 *   from a label that changed under them.
 * - **The label changes with the state** as well, because `aria-pressed` is not
 *   announced by every combination of reader and browser, and the two together
 *   are unambiguous under all of them.
 * - **`aria-controls`** pointing at the input, so the relationship is stated
 *   rather than implied by proximity.
 * - It is **out of the tab order after the input**, which is where a hand
 *   expects it: `useId` rather than an index, so two password fields on one
 *   page (sign-up has one, and a future confirm field would be the second)
 *   cannot share an id.
 *
 * ## Revealing is per field and never remembered
 *
 * `useState`, not a stored preference. A browser that reopened every password
 * field revealed because somebody once pressed the eye is a browser that shows
 * somebody's password to the person behind them on a train. The state also
 * resets when the component unmounts, which is what switching between the
 * sign-in and sign-up forms does.
 */
import { useId, useState, type ChangeEvent } from 'react';
import { Icon } from './icons';
import { useCopy } from './i18n/context';

export interface PasswordInputProps {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /**
   * `current-password` where an existing one is being typed, `new-password`
   * where one is being chosen. Required rather than defaulted: a sign-up form
   * that autofills the saved password is the bug this attribute exists to stop,
   * and a default would pick one of the two silently.
   */
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  /** Passed through to `aria-invalid`. `undefined` rather than `false`, which
   *  is what the rest of the kit does — see the fields in `signin.tsx`. */
  invalid?: true | undefined;
  required?: boolean;
  /** For the console's shape, where the class sits on the input itself. */
  className?: string;
  minLength?: number;
  /**
   * Passed through for the operator's reset form, which opens in a panel and
   * has one field in it.
   *
   * `autoFocus` is the one prop here that is a judgement rather than plumbing,
   * and it is right in that one place only: the panel is opened by a deliberate
   * press on one row, so the field is what the operator came for. On a page
   * that merely *contains* a password field it would steal the caret from
   * whatever somebody was reading.
   */
  autoFocus?: boolean;
}

export function PasswordInput({
  value,
  onChange,
  autoComplete,
  placeholder,
  invalid,
  required,
  className,
  minLength,
  autoFocus,
}: PasswordInputProps) {
  const copy = useCopy().auth;
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <span className="pw-field">
      <input
        id={id}
        className={className}
        /* The whole feature, in one attribute. */
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={invalid}
        required={required}
        minLength={minLength}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
      />
      <button
        /* Not `submit`, which is the default inside a form: without this,
           looking at your password signs you in. */
        type="button"
        className="pw-eye"
        aria-pressed={shown}
        aria-controls={id}
        aria-label={shown ? copy.hidePassword : copy.showPassword}
        title={shown ? copy.hidePassword : copy.showPassword}
        onClick={() => setShown((on) => !on)}
      >
        <Icon name={shown ? 'eyeOff' : 'eye'} size={17} strokeWidth={1.9} />
      </button>
    </span>
  );
}
