import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type {
  AssessmentAnswer,
  AssessmentDefinition,
  AssessmentQuestion,
  AssessmentResponseState,
  AssessmentStatusSummary,
} from "@shared/research/member-platform";
import { useResearch } from "../../core";
import { failureText } from "../../lib/denials";
import { MEMBER_ROUTES } from "../../lib/routes";
import {
  acceptResearchAgreement,
  getAssessmentMode,
  getResearchAgreements,
  saveAssessment,
  submitAssessment,
  type AgreementView,
} from "../../adapters/member";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchSelectCard,
  ResearchStatusBadge,
  useDebounced,
} from "../../ui/kit";

type AnswerValue = string | number | string[] | null;
type Answers = Record<string, AnswerValue>;
type Mode = "initial" | "monthly_check_in";

type AssessmentEnvelope = {
  ok: true;
  definition: AssessmentDefinition;
  response: AssessmentResponseState;
  status: AssessmentStatusSummary;
  consent: { key: "XR-MEM-012"; accepted: boolean };
};

type LoadState =
  | { phase: "loading" }
  | { phase: "ok"; data: AssessmentEnvelope }
  | { phase: "unauthorized" }
  | { phase: "unavailable" }
  | { phase: "error"; message: string };

const CONSENT_KEY = "XR-MEM-012";

function answerMap(items: AssessmentAnswer[]): Answers {
  return Object.fromEntries(items.map((answer) => [answer.questionId, answer.value]));
}

function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Number.isFinite(value);
}

function isVisible(question: AssessmentQuestion, answers: Answers): boolean {
  if (!question.showWhen?.length) return true;
  return question.showWhen.every((condition) => {
    const raw = answers[condition.questionId];
    if (raw === null || raw === undefined) return false;
    const selected = Array.isArray(raw) ? raw : [String(raw)];
    return selected.some((value) => condition.equals.includes(value));
  });
}

function pruneHiddenAnswers(definition: AssessmentDefinition, source: Answers): Answers {
  const next = { ...source };
  let changed = true;
  while (changed) {
    changed = false;
    for (const question of definition.sections.flatMap((section) => section.questions)) {
      if (!isVisible(question, next) && Object.prototype.hasOwnProperty.call(next, question.id)) {
        delete next[question.id];
        changed = true;
      }
    }
  }
  return next;
}

export function payloadWithRemovedAnswerTombstones(
  snapshotAnswers: Answers,
  previousSnapshot: string,
): AssessmentAnswer[] {
  let previous: Answers = {};
  try {
    previous = JSON.parse(previousSnapshot) as Answers;
  } catch {
    previous = {};
  }
  const payload = Object.entries(snapshotAnswers).map(([questionId, value]) => ({
    questionId,
    value,
  }));
  for (const questionId of Object.keys(previous)) {
    if (!Object.prototype.hasOwnProperty.call(snapshotAnswers, questionId)) {
      payload.push({ questionId, value: null });
    }
  }
  return payload;
}

function routeState(state: LoadState): "loading" | "ok" | "error" | "unavailable" | "unauthorized" {
  return state.phase;
}

function questionInput(
  question: AssessmentQuestion,
  value: AnswerValue | undefined,
  setValue: (value: AnswerValue) => void,
) {
  if (question.kind === "single_choice") {
    return (
      <fieldset>
        <legend className="body-m font-700 mb-3">
          {question.prompt}
          {question.required && <span aria-label="required"> *</span>}
        </legend>
        {question.helpText && <p className="body-s text-ink-2 mb-3">{question.helpText}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {(question.options ?? []).map((option) => (
            <ResearchSelectCard
              key={option.value}
              selected={value === option.value}
              onSelect={() => setValue(option.value)}
              label={option.label}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.kind === "multi_choice") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset>
        <legend className="body-m font-700 mb-3">
          {question.prompt}
          {question.required && <span aria-label="required"> *</span>}
        </legend>
        {question.helpText && <p className="body-s text-ink-2 mb-3">{question.helpText}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {(question.options ?? []).map((option) => (
            <ResearchSelectCard
              key={option.value}
              selected={selected.includes(option.value)}
              onSelect={() =>
                setValue(
                  selected.includes(option.value)
                    ? selected.filter((entry) => entry !== option.value)
                    : [...selected, option.value],
                )
              }
              label={option.label}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.kind === "scale") {
    const numeric = typeof value === "number" ? value : question.min ?? 0;
    return (
      <div>
        <input
          id={`question-${question.id}`}
          type="range"
          min={question.min ?? 0}
          max={question.max ?? 10}
          value={numeric}
          onChange={(event) => setValue(Number(event.currentTarget.value))}
          className="w-full"
          aria-valuetext={`${numeric} out of ${question.max ?? 10}`}
        />
        <p className="body-s text-ink-2 mt-2" aria-live="polite">
          {typeof value === "number"
            ? <>Selected: <strong>{numeric}</strong> / {question.max ?? 10}</>
            : "Not answered yet"}
        </p>
      </div>
    );
  }

  if (question.kind === "number") {
    return (
      <div className="flex items-center gap-3">
        <input
          id={`question-${question.id}`}
          type="number"
          min={question.min}
          max={question.max}
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            setValue(event.currentTarget.value === "" ? null : Number(event.currentTarget.value))
          }
          className="input-field"
          style={{ maxWidth: 180 }}
        />
        {question.unit && <span className="body-s text-ink-2">{question.unit}</span>}
      </div>
    );
  }

  const maxLength = question.kind === "short_text" ? 500 : 4000;
  return (
    <textarea
      id={`question-${question.id}`}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => setValue(event.currentTarget.value)}
      placeholder={question.placeholder}
      maxLength={maxLength}
      rows={question.kind === "short_text" ? 3 : 5}
      className="input-field w-full"
    />
  );
}

function ConsentGate({
  agreement,
  busy,
  error,
  agreementLoad,
  onAccept,
  onRetry,
}: {
  agreement: AgreementView | null;
  busy: boolean;
  error: string | null;
  agreementLoad: "idle" | "loading" | "ok" | "error";
  onAccept: () => void;
  onRetry: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <section className="card" aria-labelledby="assessment-consent-title">
      <p className="mono-cap text-pulse">Separate consent</p>
      <h2 id="assessment-consent-title" className="body-l font-700 mt-2">
        Sensitive health data consent
      </h2>
      <p className="body-m text-ink-2 mt-3 max-w-[62ch]">
        {agreement?.content}
      </p>
      {agreement?.status === "published" && agreement.content && (
        <label className="flex gap-3 mt-5 items-start">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.currentTarget.checked)}
            style={{ marginTop: 4 }}
          />
          <span className="body-s">
            I consent to this collection and understand that the plan remains subject to human review.
          </span>
        </label>
      )}
      {error && <p role="alert" className="body-s mt-3" style={{ color: "var(--ra-danger)" }}>{error}</p>}
      {agreement?.status === "published" && agreement.content && (
        <button
          type="button"
          className="btn btn-primary mt-5"
          onClick={onAccept}
          disabled={!checked || busy}
        >
          {busy ? "Recording consent..." : "Accept and begin"}
        </button>
      )}
      {agreementLoad === "loading" && (
        <p role="status" className="body-s text-ink-mute mt-3">Loading the consent document...</p>
      )}
      {agreementLoad === "error" && (
        <div className="mt-3">
          <p role="alert" className="body-s text-ink-mute">
            The consent document could not be loaded. Nothing has been saved.
          </p>
          <button type="button" className="btn btn-secondary mt-3" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {agreementLoad !== "loading" && agreementLoad !== "error" &&
        (!agreement || agreement.status !== "published" || !agreement.content) && (
        <p className="body-s text-ink-mute mt-3">
          The approved consent document is not available yet. Nothing has been saved.
        </p>
      )}
    </section>
  );
}

export default function Assessment() {
  const { memberToken } = useResearch();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const requestedMode: Mode = new URLSearchParams(search).get("mode") === "checkin"
    ? "monthly_check_in"
    : "initial";

  const [load, setLoad] = useState<LoadState>({ phase: "loading" });
  const [answers, setAnswers] = useState<Answers>({});
  const [, setRevision] = useState(0);
  const [step, setStep] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [agreement, setAgreement] = useState<AgreementView | null>(null);
  const [agreementLoad, setAgreementLoad] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const savingRef = useRef(false);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const lastServerSnapshotRef = useRef("");
  const revisionRef = useRef(0);
  const answersRef = useRef<Answers>({});
  const hydratedRef = useRef(false);
  const sectionHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const loadAgreement = useCallback(async () => {
    setAgreementLoad("loading");
    const agreements = await getResearchAgreements(memberToken);
    if (agreements.kind === "ok") {
      setAgreement(agreements.data.agreements.find((item) => item.key === CONSENT_KEY) ?? null);
      setAgreementLoad("ok");
      return;
    }
    setAgreement(null);
    setAgreementLoad("error");
  }, [memberToken]);

  const loadAssessment = useCallback(async () => {
    setLoad({ phase: "loading" });
    setStep(0);
    hydratedRef.current = false;
    const result = await getAssessmentMode<AssessmentEnvelope>(requestedMode, memberToken);
    if (result.kind === "unauthorized") return setLoad({ phase: "unauthorized" });
    if (result.kind === "unavailable") return setLoad({ phase: "unavailable" });
    if (result.kind !== "ok") {
      return setLoad({ phase: "error", message: failureText(result, "The assessment could not be loaded.") });
    }
    const serverAnswers = answerMap(result.data.response.answers);
    setAnswers(serverAnswers);
    answersRef.current = serverAnswers;
    setRevision(result.data.response.revision);
    revisionRef.current = result.data.response.revision;
    setSavedAt(result.data.response.lastSavedAt);
    setSaveConflict(false);
    lastServerSnapshotRef.current = JSON.stringify(serverAnswers);
    setLoad({ phase: "ok", data: result.data });

    if (!result.data.consent.accepted) {
      await loadAgreement();
    }
    hydratedRef.current = true;
  }, [loadAgreement, memberToken, requestedMode]);

  useEffect(() => {
    void loadAssessment();
  }, [loadAssessment]);

  const data = load.phase === "ok" ? load.data : null;
  const definition = data?.definition ?? null;
  const response = data?.response ?? null;
  const debouncedAnswers = useDebounced(answers, 800);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const persistAnswers = useCallback((snapshotAnswers: Answers): Promise<boolean> => {
    const job = saveQueueRef.current.then(async () => {
      if (!definition || !response || !data?.consent.accepted || response.status === "submitted") return false;
      const snapshot = JSON.stringify(snapshotAnswers);
      if (snapshot === lastServerSnapshotRef.current) return true;
      savingRef.current = true;
      setSaveMessage("Saving...");
      const payload = payloadWithRemovedAnswerTombstones(
        snapshotAnswers,
        lastServerSnapshotRef.current,
      );
      const result = await saveAssessment(
        {
          definitionId: definition.definitionId,
          definitionVersion: definition.version,
          mode: definition.mode,
          expectedCycleKey: response.cycleKey,
          expectedRevision: revisionRef.current,
          answers: payload,
          clientSavedAt: new Date().toISOString(),
        },
        memberToken,
      );
      savingRef.current = false;
      if (result.kind === "ok") {
        lastServerSnapshotRef.current = snapshot;
        revisionRef.current = result.data.revision;
        setRevision(result.data.revision);
        setSavedAt(result.data.lastSavedAt);
        setSaveMessage("Saved");
        setSaveConflict(false);
        return true;
      }
      const conflict = result.kind === "denied" && result.code === "state_conflict";
      setSaveConflict(conflict);
      setSaveMessage(
        conflict
          ? "This assessment changed in another tab or device. Your answers remain on this page until you choose what to do."
          : failureText(result, "Your answers remain on this page, but the server save needs attention."),
      );
      return false;
    });
    saveQueueRef.current = job.catch(() => false);
    return job;
  }, [data?.consent.accepted, definition, memberToken, response]);

  useEffect(() => {
    if (!hydratedRef.current || !definition || !response) return;
    if (!data?.consent.accepted || response.status === "submitted" || saveConflict) return;
    const snapshot = JSON.stringify(debouncedAnswers);
    if (snapshot === lastServerSnapshotRef.current) return;
    void persistAnswers(debouncedAnswers);
  }, [data?.consent.accepted, debouncedAnswers, definition, persistAnswers, response, saveConflict]);

  const visibleBySection = useMemo(
    () => definition?.sections.map((section) => ({
      ...section,
      questions: section.questions.filter((question) => isVisible(question, answers)),
    })) ?? [],
    [answers, definition],
  );
  const reviewIndex = visibleBySection.length;
  const onReview = step >= reviewIndex;
  const currentSection = onReview ? null : visibleBySection[step];

  useEffect(() => {
    if (load.phase === "ok" && data?.consent.accepted && response?.status !== "submitted") {
      sectionHeadingRef.current?.focus();
    }
  }, [data?.consent.accepted, load.phase, response?.status, step]);

  const missingRequired = useMemo(
    () => visibleBySection
      .flatMap((section) => section.questions)
      .filter((question) => question.required && !isAnswered(answers[question.id])),
    [answers, visibleBySection],
  );

  const acceptConsent = async () => {
    if (!agreement) return;
    setConsentBusy(true);
    setConsentError(null);
    const result = await acceptResearchAgreement(
      CONSENT_KEY,
      agreement.version,
      agreement.contentHash,
      memberToken,
    );
    setConsentBusy(false);
    if (result.kind !== "ok") {
      setConsentError(failureText(result, "Consent could not be recorded. Please try again."));
      return;
    }
    await loadAssessment();
  };

  const changeMode = (mode: Mode) => {
    setLocation(
      mode === "monthly_check_in" ? `${MEMBER_ROUTES.assessment}?mode=checkin` : MEMBER_ROUTES.assessment,
    );
  };

  const submit = async () => {
    if (!definition || !response) return;
    if (missingRequired.length > 0) {
      setSubmitMessage("Please complete the required questions before submitting.");
      return;
    }
    setSubmitBusy(true);
    setSubmitMessage(null);
    const saved = await persistAnswers(answersRef.current);
    if (!saved) {
      setSubmitBusy(false);
      setSubmitMessage("Save the current answers before submitting. Your answers remain on this page.");
      return;
    }
    const result = await submitAssessment(
      {
        definitionId: definition.definitionId,
        definitionVersion: definition.version,
        mode: definition.mode,
        expectedCycleKey: response.cycleKey,
        expectedRevision: revisionRef.current,
        confirmReviewed: true,
      },
      memberToken,
    );
    setSubmitBusy(false);
    if (result.kind !== "ok") {
      setSubmitMessage(failureText(result, "The assessment could not be submitted."));
      return;
    }
    await loadAssessment();
  };

  const progress = reviewIndex === 0 ? 0 : Math.round((Math.min(step, reviewIndex) / reviewIndex) * 100);
  const title = requestedMode === "monthly_check_in" ? "Monthly check-in" : "Your starting assessment";
  const lead = requestedMode === "monthly_check_in"
    ? "A two-to-three minute pulse for the human reviewing your plan."
    : "A focused six-section intake that saves across devices and stays private until an authorized human reviews it.";

  return (
    <ResearchMemberShell
      eyebrow="Your plan"
      title={title}
      lead={lead}
      actions={(
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Assessment type">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => changeMode("initial")}
            aria-pressed={requestedMode === "initial"}
          >
            Starting assessment
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => changeMode("monthly_check_in")}
            aria-pressed={requestedMode === "monthly_check_in"}
          >
            Monthly check-in
          </button>
        </div>
      )}
    >
      <ResearchRouteBoundary
        state={routeState(load)}
        errorMessage={load.phase === "error" ? load.message : undefined}
        onRetry={() => void loadAssessment()}
        unavailableTitle="Assessment is temporarily unavailable."
        unavailableBody="The assessment is pending final privacy and consent approval. No answers were collected. Research support can answer questions in the meantime."
      >
        {data && !data.consent.accepted ? (
          <ConsentGate
            agreement={agreement}
            busy={consentBusy}
            error={consentError}
            agreementLoad={agreementLoad}
            onAccept={() => void acceptConsent()}
            onRetry={() => void loadAgreement()}
          />
        ) : data && response?.status === "submitted" ? (
          <section className="card" role="status">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="mono-cap text-pulse">Submitted</p>
                <h2 className="body-l font-700 mt-2">
                  {requestedMode === "monthly_check_in"
                    ? "This month’s check-in is complete."
                    : "Your assessment is with the review team."}
                </h2>
              </div>
              <ResearchStatusBadge label="Locked" tone="success" />
            </div>
            <p className="body-m text-ink-2 mt-3 max-w-[60ch]">
              Submitted answers cannot be edited. A human reviews the resulting plan brief before anything
              becomes visible in your plan.
            </p>
          </section>
        ) : data && definition && response ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <div className="card mb-5" aria-label="Assessment progress">
                <div className="flex items-center justify-between gap-3">
                  <p className="body-s font-700">{onReview ? "Review and submit" : currentSection?.title}</p>
                  <p className="body-s text-ink-mute">{progress}%</p>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  className="mt-3"
                  style={{ height: 8, borderRadius: 999, background: "var(--ra-border)", overflow: "hidden" }}
                >
                  <div style={{ height: "100%", width: `${progress}%`, background: "var(--ra-selected)" }} />
                </div>
                <p className="body-s text-ink-mute mt-3">
                  {saveMessage ?? (savedAt ? `Last saved ${new Date(savedAt).toLocaleTimeString()}` : "Saved securely as you go")}
                </p>
                {saveConflict && (
                  <button
                    type="button"
                    className="btn btn-secondary mt-3"
                    onClick={() => void loadAssessment()}
                  >
                    Load the server version
                  </button>
                )}
              </div>

              {!onReview && currentSection ? (
                <section className="card" aria-labelledby={`section-${currentSection.id}`}>
                  <p className="mono-cap text-pulse">
                    Section {step + 1} of {reviewIndex}
                  </p>
                  <h2
                    id={`section-${currentSection.id}`}
                    className="body-l font-700 mt-2"
                    ref={sectionHeadingRef}
                    tabIndex={-1}
                  >
                    {currentSection.title}
                  </h2>
                  {currentSection.description && (
                    <p className="body-m text-ink-2 mt-2">{currentSection.description}</p>
                  )}
                  {currentSection.sensitive && (
                    <div className="mt-4">
                      <ResearchSecureNotice>
                        Private assessment context. It is excluded from email, analytics, and URLs.
                      </ResearchSecureNotice>
                    </div>
                  )}
                  <div className="grid gap-8 mt-7">
                    {currentSection.questions.map((question) => (
                      <div key={question.id}>
                        {question.kind !== "single_choice" && question.kind !== "multi_choice" && (
                          <>
                            <label htmlFor={`question-${question.id}`} className="body-m font-700 block mb-3">
                              {question.prompt}
                              {question.required && <span aria-label="required"> *</span>}
                            </label>
                            {question.helpText && <p className="body-s text-ink-2 mb-3">{question.helpText}</p>}
                          </>
                        )}
                        {questionInput(question, answers[question.id], (value) => {
                          setAnswers((current) =>
                            pruneHiddenAnswers(definition, { ...current, [question.id]: value }),
                          );
                          setSubmitMessage(null);
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="card" aria-labelledby="assessment-review">
                  <p className="mono-cap text-pulse">Final check</p>
                  <h2
                    id="assessment-review"
                    className="body-l font-700 mt-2"
                    ref={sectionHeadingRef}
                    tabIndex={-1}
                  >
                    Review before submitting
                  </h2>
                  <p className="body-m text-ink-2 mt-3 max-w-[62ch]">
                    Submission locks this response. A private plan brief is prepared from structured signals,
                    then an authorized human decides what is published.
                  </p>
                  {missingRequired.length > 0 ? (
                    <div role="alert" className="mt-5">
                      <p className="body-m font-700">{missingRequired.length} required answer{missingRequired.length === 1 ? "" : "s"} left.</p>
                      <p className="body-s text-ink-2 mt-1">Return to the marked sections before submitting.</p>
                    </div>
                  ) : (
                    <ResearchSecureNotice>
                      Ready to submit. Your raw answers remain private and the draft is never auto-published.
                    </ResearchSecureNotice>
                  )}
                  {submitMessage && <p role="alert" className="body-s mt-4" style={{ color: "var(--ra-danger)" }}>{submitMessage}</p>}
                  <button
                    type="button"
                    className="btn btn-primary mt-6"
                    disabled={submitBusy || missingRequired.length > 0 || saveMessage === "Saving..."}
                    onClick={() => void submit()}
                  >
                    {submitBusy ? "Submitting..." : requestedMode === "monthly_check_in" ? "Submit check-in" : "Submit assessment"}
                  </button>
                </section>
              )}

              <div className="flex items-center justify-between gap-3 mt-5">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={step === 0}
                  onClick={() => setStep((current) => Math.max(0, current - 1))}
                >
                  Back
                </button>
                {!onReview && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setStep((current) => Math.min(reviewIndex, current + 1))}
                  >
                    {step + 1 === reviewIndex ? "Review answers" : "Continue"}
                  </button>
                )}
              </div>
            </div>

            <aside className="card self-start" aria-label="Assessment sections">
              <p className="mono-cap text-ink-mute">Sections</p>
              <ol className="mt-4 grid gap-3">
                {visibleBySection.map((section, index) => {
                  const incomplete = section.questions.some(
                    (question) => question.required && !isAnswered(answers[question.id]),
                  );
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        className="w-full text-left body-s"
                        onClick={() => setStep(index)}
                        aria-current={step === index ? "step" : undefined}
                      >
                        <span className="font-700">{index + 1}. {section.title}</span>
                        <span className="block text-ink-mute mt-1">{incomplete ? "Needs answers" : "Complete"}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>
          </div>
        ) : null}
      </ResearchRouteBoundary>
    </ResearchMemberShell>
  );
}
