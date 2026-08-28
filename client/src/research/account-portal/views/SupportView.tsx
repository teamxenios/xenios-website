import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  CustomerAccountResult,
  SupportCaseCategory,
  SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";
import { SUPPORT_CASE_CATEGORIES } from "@shared/research/customer-account/contract";
import { ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { formatAccountDate, sentenceCase, statusTone } from "../format";
import type { SupportRequestInput, SupportRequestResult } from "../types";

type SupportFieldErrors = Readonly<{
  subject?: string;
  description?: string;
}>;

type SupportSubmissionOutcome = "idle" | "ok" | "denied" | "rate_limited" | "error";

function validateSupportRequest(subject: string, description: string): SupportFieldErrors {
  const errors: { subject?: string; description?: string } = {};
  const normalizedSubject = subject.trim();
  const normalizedDescription = description.trim();

  if (!normalizedSubject) errors.subject = "Enter a subject.";
  else if (normalizedSubject.length < 4) errors.subject = "Subject must be at least 4 characters.";
  else if (normalizedSubject.length > 120) errors.subject = "Subject must be 120 characters or fewer.";

  if (!normalizedDescription) errors.description = "Describe what you need help with.";
  else if (normalizedDescription.length < 10) errors.description = "Description must be at least 10 characters.";
  else if (normalizedDescription.length > 1200) errors.description = "Description must be 1,200 characters or fewer.";

  return errors;
}

export function AccountSupportView({
  cases,
  onSubmit,
}: {
  cases: readonly SupportCaseSummaryDto[];
  onSubmit: (input: SupportRequestInput) => Promise<CustomerAccountResult<SupportRequestResult>>;
}) {
  const [category, setCategory] = useState<SupportCaseCategory>("account");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SupportFieldErrors>({});
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [outcome, setOutcome] = useState<SupportSubmissionOutcome>("idle");
  const [createdCases, setCreatedCases] = useState<readonly SupportCaseSummaryDto[]>([]);
  const validationSummaryRef = useRef<HTMLDivElement>(null);
  const createdCaseIds = new Set(createdCases.map((item) => item.id));
  const visibleCases = [
    ...createdCases,
    ...cases.filter((item) => !createdCaseIds.has(item.id)),
  ];
  const visibleOpenCases = visibleCases.filter((item) => item.state !== "resolved");
  const hasFieldErrors = Boolean(fieldErrors.subject || fieldErrors.description);

  useEffect(() => {
    if (hasFieldErrors) validationSummaryRef.current?.focus();
  }, [hasFieldErrors, validationAttempt]);

  function updateSubject(value: string) {
    setSubject(value);
    setOutcome("idle");
    if (fieldErrors.subject) {
      const nextError = validateSupportRequest(value, description).subject;
      setFieldErrors((current) => {
        const next = { ...current };
        if (nextError) next.subject = nextError;
        else delete next.subject;
        return next;
      });
    }
  }

  function updateDescription(value: string) {
    setDescription(value);
    setOutcome("idle");
    if (fieldErrors.description) {
      const nextError = validateSupportRequest(subject, value).description;
      setFieldErrors((current) => {
        const next = { ...current };
        if (nextError) next.description = nextError;
        else delete next.description;
        return next;
      });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    const errors = validateSupportRequest(subject, description);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setValidationAttempt((current) => current + 1);
      setOutcome("idle");
      return;
    }

    setFieldErrors({});
    setBusy(true);
    setOutcome("idle");
    try {
      const result = await onSubmit({ category, subject: subject.trim(), description: description.trim() });
      if (result.kind === "ok") {
        setCreatedCases((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
        setSubject("");
        setDescription("");
        setOutcome("ok");
      } else if (result.kind === "denied") {
        setOutcome(result.reason === "rate_limited" ? "rate_limited" : "denied");
      } else {
        setOutcome("error");
      }
    } catch {
      setOutcome("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-grid account-grid-main">
      <section className="account-surface" aria-labelledby="support-request-heading">
        <p className="account-section-label">Account support</p>
        <h2 id="support-request-heading" className="account-section-title">Open a support request</h2>
        <p className="body-s text-ink-2 mt-3 max-w-[62ch]">Choose the operational area and describe the account question. Do not include diagnoses, dosing, or other unnecessary clinical detail.</p>
        <form className="support-request-form mt-6" onSubmit={submit} noValidate aria-busy={busy}>
          {hasFieldErrors ? (
            <div
              ref={validationSummaryRef}
              className="account-empty"
              aria-labelledby="support-validation-heading"
              tabIndex={-1}
            >
              <p id="support-validation-heading" className="body-s font-700">Please correct the highlighted fields.</p>
              <ul className="body-s mt-2">
                {fieldErrors.subject ? <li><a href="#support-subject">{fieldErrors.subject}</a></li> : null}
                {fieldErrors.description ? <li><a href="#support-description">{fieldErrors.description}</a></li> : null}
              </ul>
            </div>
          ) : null}
          <div>
            <label className="form-label" htmlFor="support-category">Category</label>
            <select
              id="support-category"
              className="input-field"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as SupportCaseCategory);
                setOutcome("idle");
              }}
            >
              {SUPPORT_CASE_CATEGORIES.map((item) => <option key={item} value={item}>{sentenceCase(item)}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="support-subject">Subject</label>
            <input
              id="support-subject"
              className="input-field"
              value={subject}
              maxLength={120}
              minLength={4}
              required
              aria-invalid={Boolean(fieldErrors.subject)}
              aria-describedby={fieldErrors.subject ? "support-subject-error" : undefined}
              onChange={(event) => updateSubject(event.target.value)}
            />
            {fieldErrors.subject ? <p id="support-subject-error" className="body-s mt-2">{fieldErrors.subject}</p> : null}
          </div>
          <div>
            <label className="form-label" htmlFor="support-description">What do you need help with?</label>
            <textarea
              id="support-description"
              className="input-field support-request-description"
              value={description}
              maxLength={1200}
              minLength={10}
              required
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? "support-description-error" : undefined}
              onChange={(event) => updateDescription(event.target.value)}
            />
            {fieldErrors.description ? <p id="support-description-error" className="body-s mt-2">{fieldErrors.description}</p> : null}
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Submitting request" : "Submit support request"}</button>
          <div className="body-s">
            {outcome === "ok" ? <p role="status">Your support request was recorded.</p> : null}
            {outcome === "rate_limited" ? <p role="alert">Too many support requests were submitted recently. Please wait before trying again. Your request was not recorded.</p> : null}
            {outcome === "denied" ? <p role="alert">This sign-in cannot open a support request. Your request was not recorded.</p> : null}
            {outcome === "error" ? <p role="alert">The request could not be recorded. Your account was not changed.</p> : null}
          </div>
        </form>
      </section>

      <aside className="account-grid">
        <ResearchSecureNotice>Support is for account, order, Care-operation, and pharmacy-operation questions. Urgent or emergency services are outside this account portal.</ResearchSecureNotice>
        <section className="account-surface" aria-labelledby="support-expectations-heading">
          <p className="account-section-label">Response expectations</p>
          <h2 id="support-expectations-heading" className="account-section-title">What happens next</h2>
          <p className="body-s text-ink-2 mt-3">Each case shows the response expectation recorded by the support service. No response time is invented by this page.</p>
        </section>
      </aside>

      <section className="account-surface" aria-labelledby="support-history-heading" style={{ gridColumn: "1 / -1" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="account-section-label">Support history</p><h2 id="support-history-heading" className="account-section-title">Your cases</h2></div>
          <ResearchStatusBadge label={visibleOpenCases.length ? `${visibleOpenCases.length} visible open` : "Status unavailable"} tone="neutral" />
        </div>
        {visibleCases.length ? (
          <div className="account-card-list mt-6">
            {visibleCases.map((item) => (
              <article className="account-list-card" key={item.id}>
                <div className="min-w-0">
                  <p className="mono-label text-ink-mute">{sentenceCase(item.category)} · Updated {formatAccountDate(item.lastUpdateAt, true)}</p>
                  <h3 className="body-m font-700 mt-2 break-words">{item.subject}</h3>
                  <p className="body-s text-ink-2 mt-2">{item.responseExpectation}</p>
                </div>
                <div className="account-list-card-actions"><ResearchStatusBadge label={sentenceCase(item.state)} tone={statusTone(item.state)} /></div>
              </article>
            ))}
          </div>
        ) : <div className="account-empty mt-6">No support cases are visible in this account view. Case-history completeness is not reported here.</div>}
      </section>
    </div>
  );
}
