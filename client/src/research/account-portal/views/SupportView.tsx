import { useState, type FormEvent } from "react";
import type {
  CustomerAccountResult,
  SupportCaseCategory,
  SupportCaseSummaryDto,
} from "@shared/research/customer-account/contract";
import { SUPPORT_CASE_CATEGORIES } from "@shared/research/customer-account/contract";
import { ResearchSecureNotice, ResearchStatusBadge } from "../../ui/kit";
import { formatAccountDate, sentenceCase, statusTone } from "../format";
import type { SupportRequestInput, SupportRequestResult } from "../types";

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
  const [outcome, setOutcome] = useState<"idle" | "ok" | "denied" | "error">("idle");
  const [createdCases, setCreatedCases] = useState<readonly SupportCaseSummaryDto[]>([]);
  const visibleCases = [...createdCases, ...cases];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setOutcome("idle");
    const result = await onSubmit({ category, subject: subject.trim(), description: description.trim() });
    if (result.kind === "ok") {
      setCreatedCases((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      setSubject("");
      setDescription("");
      setOutcome("ok");
    } else if (result.kind === "denied") setOutcome("denied");
    else setOutcome("error");
    setBusy(false);
  }

  return (
    <div className="account-grid account-grid-main">
      <section className="account-surface" aria-labelledby="support-request-heading">
        <p className="account-section-label">Account support</p>
        <h2 id="support-request-heading" className="account-section-title">Open a support request</h2>
        <p className="body-s text-ink-2 mt-3 max-w-[62ch]">Choose the operational area and describe the account question. Do not include diagnoses, dosing, or other unnecessary clinical detail.</p>
        <form className="support-request-form mt-6" onSubmit={submit}>
          <div>
            <label className="form-label" htmlFor="support-category">Category</label>
            <select id="support-category" className="input-field" value={category} onChange={(event) => setCategory(event.target.value as SupportCaseCategory)}>
              {SUPPORT_CASE_CATEGORIES.map((item) => <option key={item} value={item}>{sentenceCase(item)}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="support-subject">Subject</label>
            <input id="support-subject" className="input-field" value={subject} maxLength={120} minLength={4} required onChange={(event) => setSubject(event.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="support-description">What do you need help with?</label>
            <textarea id="support-description" className="input-field support-request-description" value={description} maxLength={1200} minLength={10} required onChange={(event) => setDescription(event.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Submitting request" : "Submit support request"}</button>
          <div className="body-s" aria-live="polite">
            {outcome === "ok" ? <p>Your support request was recorded.</p> : null}
            {outcome === "denied" ? <p role="alert">This sign-in cannot open a support request.</p> : null}
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
          <ResearchStatusBadge label={`${visibleCases.filter((item) => item.state !== "resolved").length} open`} tone="neutral" />
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
        ) : <div className="account-empty mt-6">No support cases are attached to this account.</div>}
      </section>
    </div>
  );
}
