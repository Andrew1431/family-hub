import type { ComponentProps, ReactNode } from "react";

/**
 * Form primitives for settings panes. Every module's settings are built from
 * these, so the whole hub's forms share one voice: a small-caps label above
 * the control, quiet inset fields, and one Cancel/Save row at the bottom.
 */

/** Shared inset-field skin (daisyUI sizes still apply: input-sm etc.). */
const FIELD_SKIN = "border-base-content/10 bg-base-content/5";

/** A labelled control: small-caps label above whatever it wraps. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="panel-label">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ className, ...rest }: ComponentProps<"input">) {
  return <input className={`input input-sm ${FIELD_SKIN} ${className ?? ""}`} {...rest} />;
}

export function TextArea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={`textarea textarea-sm ${FIELD_SKIN} ${className ?? ""}`} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={`select select-sm ${FIELD_SKIN} ${className ?? ""}`} {...rest}>
      {children}
    </select>
  );
}

/** A toggle with a name and an optional explanation, laid out as one tap row. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block font-sans text-sm font-medium text-base-content">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-base-content/55">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="toggle toggle-primary mt-0.5 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** Joined button group for a small closed choice (12/24-hour, °C/°F, …). */
export function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="join">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          className={`btn btn-sm join-item ${o.value === value ? "btn-primary" : "btn-ghost"}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The action row that ends every settings pane. `onSave` omitted → a single
 * Close button. `start` renders left-aligned (e.g. a Delete button).
 */
export function FormFooter({
  onCancel,
  onSave,
  saving = false,
  saveLabel = "Save",
  cancelLabel,
  disabled,
  start,
  bordered = false,
}: {
  onCancel: () => void;
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  /** Disable Save independently of `saving` (e.g. invalid form). */
  disabled?: boolean;
  start?: ReactNode;
  /** Add a top hairline when the pane above doesn't end in one. */
  bordered?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 pt-2 ${bordered ? "border-t border-base-content/10 pt-3" : ""}`}
    >
      {start}
      <div className="ml-auto flex gap-2">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          {cancelLabel ?? (onSave ? "Cancel" : "Close")}
        </button>
        {onSave && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onSave}
            disabled={saving || disabled}
          >
            {saving ? "Saving…" : saveLabel}
          </button>
        )}
      </div>
    </div>
  );
}
