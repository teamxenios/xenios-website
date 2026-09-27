import { useCallback, useId, useState } from "react";
import { Link } from "wouter";
import Turnstile from "@/components/Turnstile";
import {
  InquirySubmissionError,
  submitInquiry,
  type InquiryInterest,
  type InquiryReceipt,
  type InquiryRequest,
  type InquiryType,
} from "./inquiry-api";

type FormKind = "practice" | "partner_interest" | "strategic" | "supplier" | "career_interest";

const CONFIG: Record<FormKind, {
  title: string;
  submit: string;
  interest: InquiryInterest;
  organization: boolean;
  organizationKind: boolean;
  role: boolean;
  region: boolean;
  practiceInterest: boolean;
  documentation: boolean;
}> = {
  practice: { title: "Tell us about your practice", submit: "Submit Inquiry", interest: "not_sure", organization: true, organizationKind: true, role: true, region: true, practiceInterest: true, documentation: false },
  partner_interest: { title: "Tell us about your interest", submit: "Submit Inquiry", interest: "partner_program", organization: false, organizationKind: false, role: false, region: false, practiceInterest: false, documentation: false },
  strategic: { title: "Tell us about the partnership", submit: "Submit Inquiry", interest: "strategic_partnership", organization: true, organizationKind: false, role: false, region: false, practiceInterest: false, documentation: false },
  supplier: { title: "Tell us about your organization", submit: "Submit Inquiry", interest: "supplier_relationship", organization: true, organizationKind: true, role: false, region: true, practiceInterest: false, documentation: true },
  career_interest: { title: "Tell us how you'd like to help build Xenios", submit: "Apply", interest: "general_interest", organization: false, organizationKind: false, role: false, region: false, practiceInterest: false, documentation: false },
};

function required(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export default function InquiryForm({ kind, heading }: { kind: FormKind; heading?: string }) {
  const config = CONFIG[kind];
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<InquiryReceipt | null>(null);
  const [error, setError] = useState<{ message: string; kind: "rejected" | "uncertain" } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState("");
  const onTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const payload: InquiryRequest = {
      inquiryType: kind as InquiryType,
      fullName: required(form.get("fullName")),
      email: required(form.get("email")).toLowerCase(),
      phone: required(form.get("phone")) || undefined,
      organizationName: config.organization ? required(form.get("organizationName")) : undefined,
      organizationKind: config.organizationKind ? required(form.get("organizationKind")) : undefined,
      role: config.role ? required(form.get("role")) : undefined,
      region: config.region ? required(form.get("region")) : undefined,
      interest: config.practiceInterest
        ? required(form.get("interest")) as InquiryInterest
        : config.interest,
      documentationAvailable: config.documentation ? form.get("documentationAvailable") === "yes" : undefined,
      message: required(form.get("message")),
      organizationWebsite: config.organization ? required(form.get("organizationWebsite")) || undefined : undefined,
      website: required(form.get("website")),
      turnstileToken: turnstileToken || undefined,
    };
    try {
      setReceipt(await submitInquiry(payload));
    } catch (submissionError) {
      if (submissionError instanceof InquirySubmissionError) {
        setError({ message: submissionError.message, kind: submissionError.kind });
        setFieldErrors(submissionError.fieldErrors);
      } else {
        setError({ message: "We're not sure this went through. Please don't resend yet. Contact Support with the time you submitted.", kind: "uncertain" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <div className="clarity-confirmation" role="status" data-testid={`inquiry-success-${kind}`}>
        <p className="mono-cap text-pulse">RECEIVED</p>
        <h3 className="display-s mt-3">{kind === "career_interest" ? "Your application was received." : "Your inquiry was received."}</h3>
        <p className="body-l text-ink-2 mt-4">Reference: <strong className="text-ink">{receipt.reference}</strong></p>
        <p className="body-m text-ink-2 mt-4">
          {kind === "supplier"
            ? "This is an inquiry — it doesn't create supplier access."
            : kind === "career_interest"
              ? "We'll email you if we'd like to talk."
              : "This is an inquiry — it doesn't create an account or approve anything."}
        </p>
        {kind !== "career_interest" && <p className="body-m text-ink-2 mt-2">Someone from our team will contact you at the email you provided. We don't promise a response time.</p>}
        <p className="body-s text-ink-mute mt-3">
          {receipt.confirmationDelivery === "queued"
            ? "A confirmation email is queued. Keep this reference for your records."
            : "We couldn't queue a confirmation email. Keep this reference for your records."}
        </p>
        <Link href="/support" className="clarity-text-link mt-5 inline-flex min-h-[44px] items-center">Contact Support</Link>
      </div>
    );
  }

  return (
    <form className="clarity-form" onSubmit={onSubmit} noValidate data-testid={`inquiry-form-${kind}`} aria-labelledby={`${formId}-heading`}>
      <h3 className="display-s" id={`${formId}-heading`}>{heading || config.title}</h3>
      <p className="body-m text-ink-2 mt-3">Please don't include patient, health, payment, credential or password information.</p>
      {error && (
        <div role="alert" className={`clarity-form-alert ${error.kind === "uncertain" ? "is-uncertain" : ""}`}>
          <strong>{error.kind === "uncertain" ? "Receipt not confirmed." : "We couldn't send this."}</strong>{" "}
          {error.kind === "rejected" ? "Nothing was saved. " : ""}{error.message}{" "}
          <Link href="/support" className="clarity-text-link">Contact Support</Link>
        </div>
      )}
      {Object.keys(fieldErrors).length > 0 && (
        <div role="alert" className="clarity-form-alert"><strong>Please check the highlighted fields.</strong></div>
      )}
      <div className="clarity-form-grid">
        <Field formId={formId} label="Name" name="fullName" autoComplete="name" error={fieldErrors.fullName} required />
        <Field formId={formId} label="Email" name="email" type="email" autoComplete="email" error={fieldErrors.email} required />
        <Field formId={formId} label="Phone (optional)" name="phone" type="tel" autoComplete="tel" error={fieldErrors.phone} />
        {config.organization && <Field formId={formId} label={kind === "practice" ? "Practice name" : "Organization name"} name="organizationName" autoComplete="organization" error={fieldErrors.organizationName} required />}
        {config.organizationKind && (
          <label className="clarity-field">
            <span>{kind === "practice" ? "Practice type" : "Organization type"}</span>
            <select id={`${formId}-organizationKind`} name="organizationKind" required aria-invalid={Boolean(fieldErrors.organizationKind)} aria-describedby={fieldErrors.organizationKind ? `${formId}-organizationKind-error` : undefined}>
              <option value="">Choose one</option>
              {kind === "practice" ? (
                <><option>Clinic or provider</option><option>Coach or trainer</option><option>Gym or med spa</option><option>Behavioral-health practice</option><option>Retreat or wellness team</option><option>Other</option></>
              ) : (
                <><option>Pharmacy</option><option>Laboratory</option><option>Manufacturer</option><option>Distributor</option><option>Diagnostic provider</option><option>Fulfilment company</option><option>Other</option></>
              )}
            </select>
            {fieldErrors.organizationKind && <small id={`${formId}-organizationKind-error`}>{fieldErrors.organizationKind}</small>}
          </label>
        )}
        {config.role && <Field formId={formId} label="Your role" name="role" autoComplete="organization-title" error={fieldErrors.role} required />}
        {config.region && <Field formId={formId} label="State or region" name="region" autoComplete="address-level1" error={fieldErrors.region} required />}
        {config.organization && <Field formId={formId} label="Organization website (optional)" name="organizationWebsite" type="url" autoComplete="url" error={fieldErrors.organizationWebsite} />}
      </div>
      {config.practiceInterest && (
        <label className="clarity-field mt-5">
          <span>How would you like to work with us?</span>
          <select id={`${formId}-interest`} name="interest" required defaultValue="" aria-invalid={Boolean(fieldErrors.interest)} aria-describedby={fieldErrors.interest ? `${formId}-interest-error` : undefined}>
            <option value="">Choose one</option>
            <option value="refer_clients">Refer clients</option>
            <option value="care_for_clients">Care for clients</option>
            <option value="in_clinic_inventory">In-clinic inventory (under review)</option>
            <option value="not_sure">Not sure</option>
          </select>
          {fieldErrors.interest && <small id={`${formId}-interest-error`}>{fieldErrors.interest}</small>}
        </label>
      )}
      {config.documentation && (
        <fieldset className="clarity-field mt-5">
          <legend>Is documentation available for review?</legend>
          <div className="clarity-choice-row"><label><input type="radio" name="documentationAvailable" value="yes" required aria-describedby={fieldErrors.documentationAvailable ? `${formId}-documentationAvailable-error` : undefined} /> Yes</label><label><input type="radio" name="documentationAvailable" value="no" required aria-describedby={fieldErrors.documentationAvailable ? `${formId}-documentationAvailable-error` : undefined} /> No</label></div>
          {fieldErrors.documentationAvailable && <small id={`${formId}-documentationAvailable-error`}>{fieldErrors.documentationAvailable}</small>}
        </fieldset>
      )}
      <label className="clarity-field mt-5">
        <span>{kind === "career_interest" ? "How would you like to help?" : "Message"}</span>
        <textarea id={`${formId}-message`} name="message" rows={6} required minLength={10} maxLength={2000} aria-invalid={Boolean(fieldErrors.message)} aria-describedby={fieldErrors.message ? `${formId}-message-error` : undefined} />
        {fieldErrors.message && <small id={`${formId}-message-error`}>{fieldErrors.message}</small>}
      </label>
      <div className="clarity-honeypot" aria-hidden="true">
        <label>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="mt-5"><Turnstile onToken={onTurnstileToken} /></div>
      <button type="submit" className="btn btn-primary mt-6" disabled={submitting}>
        {submitting ? "Sending…" : config.submit}
      </button>
    </form>
  );
}

function Field({ formId, label, name, error, required: isRequired = false, ...inputProps }: {
  formId: string;
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  const inputId = `${formId}-${name}`;
  const errorId = `${inputId}-error`;
  return (
    <label className="clarity-field">
      <span>{label}</span>
      <input id={inputId} name={name} required={isRequired} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...inputProps} />
      {error && <small id={errorId}>{error}</small>}
    </label>
  );
}
