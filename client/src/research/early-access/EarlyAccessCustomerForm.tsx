import { useId } from "react";
import type { FormEvent, ReactNode } from "react";

/** Early access ships inside the United States only, so country is fixed. */
export const EARLY_ACCESS_COUNTRY_CODE = "US";
export const EARLY_ACCESS_COUNTRY_LABEL = "United States";

export interface EarlyAccessCustomerValues {
  fullName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
}

export type EarlyAccessCustomerField = keyof EarlyAccessCustomerValues;

/** Server or caller supplied. This form never decides a field is wrong. */
export type EarlyAccessCustomerErrors = Partial<Record<EarlyAccessCustomerField, string>>;

export interface EarlyAccessCustomerFormProps {
  values: EarlyAccessCustomerValues;
  errors?: EarlyAccessCustomerErrors;
  onChange: (field: EarlyAccessCustomerField, value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  submitLabel?: string;
  testId?: string;
}

interface FieldSpec {
  field: EarlyAccessCustomerField;
  label: string;
  autoComplete: string;
  type: "text" | "email" | "tel";
  optional?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric";
}

const CONTACT_FIELDS: readonly FieldSpec[] = [
  { field: "fullName", label: "Full name", autoComplete: "name", type: "text" },
  { field: "email", label: "Email", autoComplete: "email", type: "email", inputMode: "email" },
  { field: "phone", label: "Phone", autoComplete: "tel", type: "tel", inputMode: "tel" },
];

const STREET_FIELDS: readonly FieldSpec[] = [
  { field: "line1", label: "Street address", autoComplete: "address-line1", type: "text" },
  {
    field: "line2",
    label: "Apartment, suite, unit",
    autoComplete: "address-line2",
    type: "text",
    optional: true,
  },
];

const LOCALITY_FIELDS: readonly FieldSpec[] = [
  { field: "city", label: "City", autoComplete: "address-level2", type: "text" },
  { field: "state", label: "State", autoComplete: "address-level1", type: "text" },
  { field: "postalCode", label: "ZIP", autoComplete: "postal-code", type: "text", inputMode: "numeric" },
];

function Field({
  id,
  label,
  optional = false,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mono-label text-ink-mute">
        {label}
        {optional ? " (optional)" : ""}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/**
 * Contact and shipping details for Private Early Access. Presentation only.
 *
 * Every value and every error arrives as a prop and every keystroke goes
 * straight back to the caller, so this form holds no state of its own. It does
 * not validate, normalize, look up an address, send anything, or navigate. The
 * one action it offers is handing control back through onSubmit.
 */
export function EarlyAccessCustomerForm({
  values,
  errors = {},
  onChange,
  onSubmit,
  busy = false,
  submitLabel = "Continue",
  testId = "early-access-customer-form",
}: EarlyAccessCustomerFormProps) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const countryId = `${baseId}-country`;
  const countryNoteId = `${baseId}-country-note`;

  function fieldId(field: EarlyAccessCustomerField): string {
    return `${baseId}-${field}`;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Never let the browser submit and navigate: the caller owns what happens.
    event.preventDefault();
    if (busy) return;
    onSubmit();
  }

  function renderField(spec: FieldSpec) {
    const id = fieldId(spec.field);
    const error = errors[spec.field];
    const hasError = typeof error === "string" && error.trim().length > 0;
    const errorId = `${id}-error`;
    return (
      <Field key={spec.field} id={id} label={spec.label} optional={spec.optional}>
        <input
          id={id}
          type={spec.type}
          className="input-field"
          autoComplete={spec.autoComplete}
          inputMode={spec.inputMode}
          value={values[spec.field]}
          disabled={busy}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={hasError ? errorId : undefined}
          onChange={(event) => onChange(spec.field, event.target.value)}
          data-testid={`${testId}-${spec.field}`}
        />
        {hasError && (
          <p
            id={errorId}
            role="alert"
            className="body-s mt-2"
            style={{ color: "var(--error)" }}
            data-testid={`${testId}-${spec.field}-error`}
          >
            {error}
          </p>
        )}
      </Field>
    );
  }

  return (
    <form
      aria-labelledby={headingId}
      className="card grid min-w-0 gap-6"
      onSubmit={handleSubmit}
      data-testid={testId}
    >
      <div className="min-w-0">
        <p className="mono-label text-ink-mute">Your details</p>
        <h2 id={headingId} className="body-l font-700 mt-2 text-balance">
          Where this should reach you
        </h2>
        <p className="body-s text-ink-2 mt-2 max-w-[62ch]">
          These details are used to reach you about early access and to ship it
          if you go ahead. Nothing is charged from this step.
        </p>
      </div>

      <div className="grid min-w-0 gap-3">{CONTACT_FIELDS.map(renderField)}</div>

      <div className="grid min-w-0 gap-3">
        {STREET_FIELDS.map(renderField)}
        <div
          className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr]"
          data-testid={`${testId}-locality`}
        >
          {LOCALITY_FIELDS.map(renderField)}
        </div>
        <Field id={countryId} label="Country">
          {/* Fixed, not chosen: shown as a real labeled field so the shipping
              scope is visible rather than assumed. */}
          <input
            id={countryId}
            type="text"
            className="input-field"
            autoComplete="country-name"
            value={EARLY_ACCESS_COUNTRY_LABEL}
            readOnly
            aria-describedby={countryNoteId}
            data-testid={`${testId}-country`}
          />
          <p id={countryNoteId} className="body-s text-ink-mute mt-2 max-w-[62ch]">
            Early access ships within the United States only for now.
          </p>
        </Field>
      </div>

      <div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy}
          data-testid={`${testId}-submit`}
        >
          {busy ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default EarlyAccessCustomerForm;
