import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  buildPartnershipInquirySummary,
  PARTNERSHIP_CONTACT_MAILTO,
  PARTNERSHIP_INQUIRY_LIMITS,
  PARTNERSHIP_PATHWAY_OPTIONS,
  type PartnershipInquiryDraft,
  type PartnershipPathwayId,
} from "./pathways";

type CopyState = "idle" | "copied" | "manual";
type ValidatedField = Exclude<keyof PartnershipInquiryDraft, "pathway">;

interface ValidationIssue {
  field: ValidatedField;
  message: string;
}

const FIELD_CONTROL_IDS: Record<ValidatedField, string> = {
  name: "b2b-name",
  businessEmail: "b2b-email",
  organization: "b2b-organization",
  role: "b2b-role",
  website: "b2b-website",
  region: "b2b-region",
  context: "b2b-context",
};

function blankDraft(initialPathway: PartnershipPathwayId): PartnershipInquiryDraft {
  return {
    pathway: initialPathway,
    name: "",
    businessEmail: "",
    organization: "",
    role: "",
    website: "",
    region: "",
    context: "",
  };
}

function isBusinessEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isHttpWebsite(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function FieldError({ field, message }: { field: ValidatedField; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${FIELD_CONTROL_IDS[field]}-error`} className="xr-b2b-field-error body-s">
      {message}
    </p>
  );
}

export default function PartnershipInquiryForm({
  initialPathway = "strategic_partner",
  heading = "Prepare a partnership inquiry",
}: {
  initialPathway?: PartnershipPathwayId;
  heading?: string;
}) {
  const [draft, setDraft] = useState<PartnershipInquiryDraft>(() => blankDraft(initialPathway));
  const [validation, setValidation] = useState<ValidationIssue[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const errorRef = useRef<HTMLDivElement>(null);
  const summary = useMemo(() => buildPartnershipInquirySummary(draft), [draft]);

  function update<K extends keyof PartnershipInquiryDraft>(key: K, value: PartnershipInquiryDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidation((current) => current.filter((issue) => issue.field !== key));
    setPrepared(false);
    setCopyState("idle");
  }

  function issueFor(field: ValidatedField): string | undefined {
    return validation.find((issue) => issue.field === field)?.message;
  }

  function describedBy(field: ValidatedField, baseId?: string): string | undefined {
    return [baseId, issueFor(field) ? `${FIELD_CONTROL_IDS[field]}-error` : undefined].filter(Boolean).join(" ") || undefined;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextValidation: ValidationIssue[] = [];
    if (!draft.name.trim()) nextValidation.push({ field: "name", message: "Add your name." });
    else if (draft.name.length > PARTNERSHIP_INQUIRY_LIMITS.name)
      nextValidation.push({
        field: "name",
        message: `Keep your name to ${PARTNERSHIP_INQUIRY_LIMITS.name} characters or fewer.`,
      });
    if (!isBusinessEmail(draft.businessEmail))
      nextValidation.push({ field: "businessEmail", message: "Add a valid business email." });
    else if (draft.businessEmail.length > PARTNERSHIP_INQUIRY_LIMITS.businessEmail)
      nextValidation.push({
        field: "businessEmail",
        message: `Keep the business email to ${PARTNERSHIP_INQUIRY_LIMITS.businessEmail} characters or fewer.`,
      });
    if (!draft.organization.trim()) nextValidation.push({ field: "organization", message: "Add your organization." });
    else if (draft.organization.length > PARTNERSHIP_INQUIRY_LIMITS.organization)
      nextValidation.push({
        field: "organization",
        message: `Keep the organization to ${PARTNERSHIP_INQUIRY_LIMITS.organization} characters or fewer.`,
      });
    if (!draft.role.trim()) nextValidation.push({ field: "role", message: "Add your role." });
    else if (draft.role.length > PARTNERSHIP_INQUIRY_LIMITS.role)
      nextValidation.push({
        field: "role",
        message: `Keep the role to ${PARTNERSHIP_INQUIRY_LIMITS.role} characters or fewer.`,
      });
    if (!isHttpWebsite(draft.website))
      nextValidation.push({
        field: "website",
        message: "Use a public website beginning with http:// or https:// and without embedded credentials.",
      });
    else if (draft.website.length > PARTNERSHIP_INQUIRY_LIMITS.website)
      nextValidation.push({
        field: "website",
        message: `Keep the website to ${PARTNERSHIP_INQUIRY_LIMITS.website} characters or fewer.`,
      });
    if (!draft.region.trim())
      nextValidation.push({ field: "region", message: "Add the principal region or jurisdiction." });
    else if (draft.region.length > PARTNERSHIP_INQUIRY_LIMITS.region)
      nextValidation.push({
        field: "region",
        message: `Keep the region to ${PARTNERSHIP_INQUIRY_LIMITS.region} characters or fewer.`,
      });
    if (draft.context.trim().length < 40)
      nextValidation.push({ field: "context", message: "Describe the business context in at least 40 characters." });
    else if (draft.context.length > PARTNERSHIP_INQUIRY_LIMITS.context)
      nextValidation.push({
        field: "context",
        message: `Keep the business context to ${PARTNERSHIP_INQUIRY_LIMITS.context} characters or fewer.`,
      });

    setValidation(nextValidation);
    if (nextValidation.length > 0) {
      setPrepared(false);
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }

    setPrepared(true);
    setCopyState("idle");
  }

  async function copySummary() {
    try {
      if (!navigator.clipboard?.writeText) {
        setCopyState("manual");
        return;
      }
      await navigator.clipboard.writeText(summary);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  return (
    <section className="xr-b2b-inquiry" aria-labelledby="xr-b2b-inquiry-title">
      <div className="xr-b2b-inquiry-intro">
        <p className="mono-cap text-pulse">Human review</p>
        <h2 id="xr-b2b-inquiry-title" className="display-s mt-3">
          {heading}
        </h2>
        <p className="body-m text-ink-2 mt-4 max-w-[64ch]">
          This form prepares a summary on your device. It does not transmit, save, approve, price, or activate anything.
          You choose whether to copy the summary and open your email application.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="xr-b2b-form mt-8">
        {validation.length > 0 && (
          <div ref={errorRef} className="xr-b2b-form-errors" role="alert" tabIndex={-1}>
            <p className="body-m font-700">Check the request details.</p>
            <ul className="body-s text-ink-2 mt-2">
              {validation.map((issue) => (
                <li key={issue.field}>
                  <a href={`#${FIELD_CONTROL_IDS[issue.field]}`}>{issue.message}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="xr-b2b-form-grid">
          <div className="xr-b2b-field xr-b2b-field-wide">
            <label htmlFor="b2b-pathway" className="form-label">
              Relationship type
            </label>
            <select
              id="b2b-pathway"
              className="input-field"
              value={draft.pathway}
              onChange={(event) => update("pathway", event.target.value as PartnershipPathwayId)}
            >
              {PARTNERSHIP_PATHWAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="xr-b2b-field">
            <label htmlFor="b2b-name" className="form-label">
              Your name
            </label>
            <input
              id="b2b-name"
              className="input-field"
              autoComplete="name"
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              maxLength={PARTNERSHIP_INQUIRY_LIMITS.name}
              aria-invalid={Boolean(issueFor("name")) || undefined}
              aria-describedby={describedBy("name")}
              required
            />
            <FieldError field="name" message={issueFor("name")} />
          </div>

          <div className="xr-b2b-field">
            <label htmlFor="b2b-email" className="form-label">
              Business email
            </label>
            <input
              id="b2b-email"
              className="input-field"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft.businessEmail}
              onChange={(event) => update("businessEmail", event.target.value)}
              maxLength={PARTNERSHIP_INQUIRY_LIMITS.businessEmail}
              aria-invalid={Boolean(issueFor("businessEmail")) || undefined}
              aria-describedby={describedBy("businessEmail")}
              required
            />
            <FieldError field="businessEmail" message={issueFor("businessEmail")} />
          </div>

          <div className="xr-b2b-field">
            <label htmlFor="b2b-organization" className="form-label">
              Organization
            </label>
            <input
              id="b2b-organization"
              className="input-field"
              autoComplete="organization"
              value={draft.organization}
              onChange={(event) => update("organization", event.target.value)}
              maxLength={PARTNERSHIP_INQUIRY_LIMITS.organization}
              aria-invalid={Boolean(issueFor("organization")) || undefined}
              aria-describedby={describedBy("organization")}
              required
            />
            <FieldError field="organization" message={issueFor("organization")} />
          </div>

          <div className="xr-b2b-field">
            <label htmlFor="b2b-role" className="form-label">
              Your role
            </label>
            <input
              id="b2b-role"
              className="input-field"
              autoComplete="organization-title"
              value={draft.role}
              onChange={(event) => update("role", event.target.value)}
              maxLength={PARTNERSHIP_INQUIRY_LIMITS.role}
              aria-invalid={Boolean(issueFor("role")) || undefined}
              aria-describedby={describedBy("role")}
              required
            />
            <FieldError field="role" message={issueFor("role")} />
          </div>

          <div className="xr-b2b-field">
            <label htmlFor="b2b-website" className="form-label">
              Website <span className="text-ink-mute">(optional)</span>
            </label>
            <p id="b2b-website-help" className="body-s text-ink-mute mb-2">
              Use a public page. Query and fragment values are omitted from the prepared summary.
            </p>
            <input
              id="b2b-website"
              className="input-field"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={draft.website}
              onChange={(event) => update("website", event.target.value)}
              maxLength={PARTNERSHIP_INQUIRY_LIMITS.website}
              aria-invalid={Boolean(issueFor("website")) || undefined}
              aria-describedby={describedBy("website", "b2b-website-help")}
              placeholder="https://"
            />
            <FieldError field="website" message={issueFor("website")} />
          </div>

          <div className="xr-b2b-field">
            <label htmlFor="b2b-region" className="form-label">
              Principal region or jurisdiction
            </label>
            <input
              id="b2b-region"
              className="input-field"
              autoComplete="address-level1"
              value={draft.region}
              onChange={(event) => update("region", event.target.value)}
              maxLength={PARTNERSHIP_INQUIRY_LIMITS.region}
              aria-invalid={Boolean(issueFor("region")) || undefined}
              aria-describedby={describedBy("region")}
              required
            />
            <FieldError field="region" message={issueFor("region")} />
          </div>

          <div className="xr-b2b-field xr-b2b-field-wide">
            <label htmlFor="b2b-context" className="form-label">
              Business context
            </label>
            <p id="b2b-context-help" className="body-s text-ink-mute mb-2">
              Describe the intended relationship, audience or use, approximate volume, documentation needs, and desired
              next step. Do not include patient information, health details, payment data, or secrets.
            </p>
            <textarea
              id="b2b-context"
              className="input-field"
              rows={6}
              aria-invalid={Boolean(issueFor("context")) || undefined}
              aria-describedby={describedBy("context", "b2b-context-help")}
              value={draft.context}
              onChange={(event) => update("context", event.target.value)}
              maxLength={PARTNERSHIP_INQUIRY_LIMITS.context}
              required
            />
            <FieldError field="context" message={issueFor("context")} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <button type="submit" className="btn btn-primary">
            Prepare request summary
          </button>
          <p className="body-s text-ink-mute max-w-[52ch]">
            Preparing a summary is not an application submission and creates no account, quote, product access, or approval.
          </p>
        </div>
      </form>

      {prepared && (
        <div className="xr-b2b-prepared mt-8" role="status" aria-live="polite">
          <p className="mono-cap text-pulse">Prepared locally</p>
          <h3 className="body-l font-700 mt-2">Your draft is ready. Xenios has not received it.</h3>
          <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
            Review the summary, copy it, and send it from your own email account if you want the team to review the inquiry.
            The email link contains only a generic subject; your contact details are not placed in the URL.
          </p>
          <label htmlFor="b2b-summary" className="form-label mt-5">
            Request summary
          </label>
          <textarea id="b2b-summary" className="input-field xr-b2b-summary" value={summary} readOnly rows={13} />
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <button type="button" className="btn btn-secondary" onClick={() => void copySummary()}>
              {copyState === "copied" ? "Copied" : "Copy summary"}
            </button>
            <a className="btn btn-primary" href={PARTNERSHIP_CONTACT_MAILTO}>
              Open email
            </a>
            {copyState === "manual" && (
              <p className="body-s text-ink-2" role="alert">
                Automatic copy is unavailable. Select and copy the summary above.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
