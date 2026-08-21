"use client";

import type { ReactNode } from "react";
import { Check } from "@/components/calendair/icons";

/**
 * The controls onboarding is assembled from.
 *
 * Deliberately not a form library and deliberately not generic inputs: every one
 * of these is the same warm ivory, navy and gold as the rest of the product, and
 * each one states what it is for. A concierge asking a question looks nothing like
 * a settings page, so none of these look like one.
 */

export function StepHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: ReactNode;
}) {
  return (
    <div className="es-wiz__heading">
      <span className="ca-eyebrow">{eyebrow}</span>
      <h1 className="ca-display es-wiz__title">{title}</h1>
      {body && <p className="es-wiz__body">{body}</p>}
    </div>
  );
}

/** A single large choice: an icon, a name, a reason, and an optional caveat. */
export function OptionCard({
  selected,
  onSelect,
  icon,
  title,
  detail,
  note,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: string;
  detail?: string;
  note?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`es-wiz__option${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      disabled={disabled}
    >
      {icon && <span className="es-wiz__option-icon">{icon}</span>}
      <span className="es-wiz__option-copy">
        <span className="es-wiz__option-title">{title}</span>
        {detail && <span className="es-wiz__option-detail">{detail}</span>}
        {note && <span className="es-wiz__option-note">{note}</span>}
      </span>
      <span className="es-wiz__tick" aria-hidden>
        {selected && <Check size={15} />}
      </span>
    </button>
  );
}

/** One of the taste cards. The label is the point; the hint earns the choice. */
export function TasteCard({
  label,
  hint,
  selected,
  onToggle,
  disabled,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`es-wiz__taste${selected ? " is-selected" : ""}`}
      onClick={onToggle}
      aria-pressed={selected}
      disabled={disabled && !selected}
    >
      <span className="es-wiz__taste-label">{label}</span>
      <span className="es-wiz__taste-hint">{hint}</span>
      <span className="es-wiz__taste-tick" aria-hidden>
        {selected && <Check size={13} />}
      </span>
    </button>
  );
}

/**
 * A number the traveller nudges rather than types.
 *
 * Typing a budget invites a typo that becomes a hard constraint, so the value is
 * bounded by the control itself and the bounds are visible.
 */
export function NumberStepper({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="es-wiz__field">
      <div className="es-wiz__field-head">
        <span className="es-wiz__field-label">{label}</span>
        {hint && <span className="es-wiz__field-hint">{hint}</span>}
      </div>
      <div className="es-wiz__stepper">
        <button
          type="button"
          className="es-wiz__stepbtn"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className="es-wiz__stepvalue ca-num">{format(value)}</span>
        <button
          type="button"
          className="es-wiz__stepbtn"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="es-wiz__switchrow"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="es-wiz__option-copy">
        <span className="es-wiz__field-label">{label}</span>
        {hint && <span className="es-wiz__field-hint">{hint}</span>}
      </span>
      <span className={`es-wiz__switch${checked ? " is-on" : ""}`} aria-hidden>
        <span className="es-wiz__switch-knob" />
      </span>
    </button>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength = 40,
  inputMode,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  inputMode?: "text" | "search";
}) {
  return (
    <label className="es-wiz__field">
      <div className="es-wiz__field-head">
        <span className="es-wiz__field-label">{label}</span>
        {hint && <span className="es-wiz__field-hint">{hint}</span>}
      </div>
      <input
        className="es-wiz__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete="off"
      />
    </label>
  );
}

/** A compact segmented control, for a choice with two or three short answers. */
export function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="es-wiz__field">
      <div className="es-wiz__field-head">
        <span className="es-wiz__field-label">{label}</span>
        {hint && <span className="es-wiz__field-hint">{hint}</span>}
      </div>
      <div className="es-wiz__segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`es-wiz__segment${o.value === value ? " is-selected" : ""}`}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The chips a dream list is built from: removable, and never silently reordered. */
export function ChipRow({
  values,
  onRemove,
}: {
  values: string[];
  onRemove: (value: string) => void;
}) {
  if (values.length === 0) return null;
  return (
    <div className="es-wiz__chips">
      {values.map((v, i) => (
        <button
          key={v}
          type="button"
          className="es-wiz__chip is-chosen"
          onClick={() => onRemove(v)}
          aria-label={`Remove ${v}`}
        >
          <span className="es-wiz__chip-rank">{i + 1}</span>
          {v}
          <span className="es-wiz__chip-x" aria-hidden>
            ×
          </span>
        </button>
      ))}
    </div>
  );
}

export function SuggestionRow({
  values,
  onAdd,
  disabled,
}: {
  values: string[];
  onAdd: (value: string) => void;
  disabled?: boolean;
}) {
  if (values.length === 0) return null;
  return (
    <div className="es-wiz__chips">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className="es-wiz__chip"
          onClick={() => onAdd(v)}
          disabled={disabled}
        >
          + {v}
        </button>
      ))}
    </div>
  );
}

/** A quiet statement of what the product will not do. Used on every privacy claim. */
export function Assurance({ children }: { children: ReactNode }) {
  return <p className="es-wiz__assurance">{children}</p>;
}
