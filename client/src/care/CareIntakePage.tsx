import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type {
  CareClinicalIntake,
  CareIntakeDefinition,
  CareIntakeFieldDefinition,
  CareIntakeResponseValue,
  CareIntakeRevision,
} from "@shared/care/intake";
import { careApiFetch } from "./api";
import {
  CARE_INTAKE_FIELD_ERROR_MESSAGES,
  CARE_INTAKE_REVIEW_STEP_ID,
  CARE_INTAKE_SECTIONS,
  autosavePayload,
  buildIntakeSections,
  displayAnswer,
  fieldLabel,
  isAnswered,
  resumeStepId,
  sectionIdForFieldKey,
  sectionProgress,
  stableResponseKey,
  stepOrder,
  submitBlockers,
  validateField,
  type CareIntakeFieldError,
  type CareIntakeSection,
} from "./intake-sections";

const INTAKE_PATH = "/api/care/intake";
const AUTOSAVE_DELAY_MS = 1_200;

const SAVE_FAILED_MESSAGE =
  "Your latest answers were not saved. Nothing was submitted. Try saving again.";
// Only used where the server answered before it could have written anything, so
// the claim that nothing reached a clinician is something the page actually knows.
const SUBMIT_REFUSED_MESSAGE =
  "Your intake was not submitted. Nothing was sent to a clinician. Confirm your answers and try again.";
// Used where the request left the browser and no answer came back to say what
// happened to it. Stating that nothing reached a clinician here would be a guess
// presented as a fact, so the copy says only what is known and offers the check.
const SUBMIT_UNCONFIRMED_MESSAGE =
  "We could not confirm whether your intake was submitted, so we cannot tell you either way. It may already be with a clinician. Check your current status before submitting again.";

type LoadState =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "auth_required" }
  | { kind: "not_permitted" }
  | { kind: "error" }
  | {
      kind: "ready";
      definition: CareIntakeDefinition | null;
      intake: CareClinicalIntake | null;
    };

type SaveState =
  | { kind: "idle" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error" };

// A refusal is something the page can prove: either it never sent the request,
// or the server declined before it wrote. Anything else is unconfirmed, and the
// two are never allowed to share wording.
type SubmitNotice =
  | { kind: "refused"; message: string }
  | { kind: "unconfirmed"; message: string };

type StartBlock =
  | "eligibility_not_ready"
  | "definition_unavailable"
  | "telehealth_consent_mismatch"
  | "privacy_consent_mismatch"
  | "unknown";

const START_BLOCK_COPY: Readonly<
  Record<
    StartBlock,
    { title: string; detail: string; href: string; action: string }
  >
> = {
  eligibility_not_ready: {
    title: "Intake is not open for your location yet.",
    detail:
      "Care checks your current state, coverage, and identity before intake opens. Nothing you enter would be stored while that is outstanding.",
    href: "/care/eligibility",
    action: "Review Care eligibility",
  },
  definition_unavailable: {
    title: "No approved intake questionnaire is published yet.",
    detail:
      "Intake questions are authored and approved by the clinical team before they are shown. No placeholder question is presented as approved.",
    href: "/care",
    action: "View Care status",
  },
  telehealth_consent_mismatch: {
    title: "Your telehealth consent is not current.",
    detail:
      "Intake is bound to the exact consent version you granted. A current version must be reviewed before intake can start.",
    href: "/care/consent",
    action: "Review Care notices",
  },
  privacy_consent_mismatch: {
    title: "Your privacy notice acknowledgement is not current.",
    detail:
      "Intake is bound to the exact privacy-notice version you acknowledged. A current version must be reviewed before intake can start.",
    href: "/care/consent",
    action: "Review Care notices",
  },
  unknown: {
    title: "Intake could not be started.",
    detail:
      "Nothing was created or stored. Confirm your Care status before trying again.",
    href: "/care",
    action: "View Care status",
  },
};

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}) as Record<string, unknown>);
}

function fieldDomId(key: string) {
  return `care-intake-field-${key}`;
}

function startBlockFromCode(code: unknown): StartBlock {
  const suffix = String(code ?? "").replace(/^care_intake_/, "");
  return suffix in START_BLOCK_COPY ? (suffix as StartBlock) : "unknown";
}

export default function CareIntakePage() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [responses, setResponses] = useState<
    Record<string, CareIntakeResponseValue>
  >({});
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, CareIntakeFieldError>
  >({});
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [stepId, setStepId] = useState<string>("");
  const [startBlock, setStartBlock] = useState<StartBlock | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<SubmitNotice | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const versionRef = useRef(0);
  const savedPayloadRef = useRef("");
  // Whether the server holds a revision for these answers. A no-op save has to
  // restore the state that was already true, not invent one.
  const savedRevisionRef = useRef(false);
  const pendingSaveRef = useRef<{ key: string; payload: string } | null>(null);
  // One idempotency key per submit intent, so a retry after a lost response is a
  // replay the server recognizes rather than a second attempt it refuses.
  const pendingSubmitRef = useRef<{ key: string; intent: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Writes are serialized. Returning an in-flight promise would report the
  // newest answers as saved when that request never carried them.
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  // The debounced save fires after the render that changed an answer, so it
  // reads the latest answers rather than the ones captured when scheduled.
  const responsesRef = useRef(responses);
  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);

  const definition = loadState.kind === "ready" ? loadState.definition : null;
  const intake = loadState.kind === "ready" ? loadState.intake : null;
  const sections = useMemo(() => buildIntakeSections(definition), [definition]);
  const editable = intake?.status === "draft";
  const blockers = useMemo(
    () => submitBlockers(sections, responses),
    [sections, responses],
  );

  const clearTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  // An unconfirmed submission is only settled by a real answer about this
  // intake. A later refusal the page decided on its own does not disprove it,
  // so it must never overwrite it.
  const noteRefusal = useCallback((message: string) => {
    setSubmitNotice((current) =>
      current?.kind === "unconfirmed" ? current : { kind: "refused", message },
    );
  }, []);

  const load = useCallback(async () => {
    clearTimer();
    pendingSaveRef.current = null;
    pendingSubmitRef.current = null;
    setLoadState({ kind: "loading" });
    setSubmitNotice(null);
    setStartBlock(null);
    setJustSubmitted(false);
    try {
      const response = await careApiFetch(INTAKE_PATH);
      const body = await readJson(response);
      if (response.status === 401) {
        setLoadState({ kind: "auth_required" });
        return;
      }
      if (response.status === 403) {
        setLoadState({ kind: "not_permitted" });
        return;
      }
      if (response.status === 503 && body?.code === "care_disabled") {
        setLoadState({ kind: "disabled" });
        return;
      }
      if (!response.ok || body?.ok !== true) {
        throw new Error("care_intake_unavailable");
      }
      const loadedDefinition = (body.definition ??
        null) as CareIntakeDefinition | null;
      const loadedIntake = (body.intake ?? null) as CareClinicalIntake | null;
      const revision = (body.revision ?? null) as CareIntakeRevision | null;
      const loaded = { ...(revision?.responses ?? {}) };
      versionRef.current = loadedIntake?.version ?? 0;
      // Compare against the same normalized shape a save would send, so a
      // resumed intake does not immediately rewrite an identical revision.
      savedPayloadRef.current = stableResponseKey(
        autosavePayload(buildIntakeSections(loadedDefinition), loaded),
      );
      savedRevisionRef.current = revision !== null;
      responsesRef.current = loaded;
      setResponses(loaded);
      setFieldErrors({});
      setSaveState(revision ? { kind: "saved" } : { kind: "idle" });
      setStepId("");
      setLoadState({
        kind: "ready",
        definition: loadedDefinition,
        intake: loadedIntake,
      });
    } catch {
      setLoadState({ kind: "error" });
    }
  }, [clearTimer]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  // A resumed intake lands on the first step that still needs an answer.
  useEffect(() => {
    if (!editable || sections.length === 0 || stepId) return;
    setStepId(resumeStepId(sections, responses));
  }, [editable, sections, responses, stepId]);

  const saveOnce = useCallback(async (): Promise<boolean> => {
    if (!intake || intake.status !== "draft") return true;
    const payload = autosavePayload(sections, responsesRef.current);
    const serialized = stableResponseKey(payload);
    if (serialized === savedPayloadRef.current) {
      pendingSaveRef.current = null;
      // The server already holds exactly these answers, so there is nothing to
      // write. Restoring the state matters: scheduleSave has already shown
      // "unsaved changes", and returning without correcting it would leave that
      // showing forever on a draft that is in fact saved.
      setSaveState(
        savedRevisionRef.current ? { kind: "saved" } : { kind: "idle" },
      );
      return true;
    }
    // One idempotency key per distinct payload, so a retry of the same draft
    // is a replay rather than a second revision.
    if (pendingSaveRef.current?.payload !== serialized) {
      pendingSaveRef.current = {
        key: newIdempotencyKey("care-intake-autosave"),
        payload: serialized,
      };
    }
    const attempt = pendingSaveRef.current;
    setSaveState({ kind: "saving" });
    try {
      const response = await careApiFetch(
        `${INTAKE_PATH}/${encodeURIComponent(intake.id)}/autosave`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: versionRef.current,
            responses: payload,
            idempotencyKey: attempt.key,
          }),
        },
      );
      const body = await readJson(response);
      if (response.status === 401) {
        setLoadState({ kind: "auth_required" });
        return false;
      }
      if (response.status === 403) {
        setLoadState({ kind: "not_permitted" });
        return false;
      }
      if (response.status === 503 && body?.code === "care_disabled") {
        setLoadState({ kind: "disabled" });
        return false;
      }
      if (!response.ok || body?.ok !== true || !body.revision) {
        setSaveState({ kind: "error" });
        return false;
      }
      const revision = body.revision as CareIntakeRevision;
      versionRef.current = revision.version;
      savedPayloadRef.current = serialized;
      savedRevisionRef.current = true;
      pendingSaveRef.current = null;
      setSaveState({ kind: "saved" });
      return true;
    } catch {
      setSaveState({ kind: "error" });
      return false;
    }
  }, [intake, sections]);

  const performSave = useCallback((): Promise<boolean> => {
    const run = saveChainRef.current.then(() => saveOnce());
    saveChainRef.current = run.then(
      () => true,
      () => true,
    );
    return run;
  }, [saveOnce]);

  const scheduleSave = useCallback(() => {
    clearTimer();
    setSaveState({ kind: "unsaved" });
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void performSave();
    }, AUTOSAVE_DELAY_MS);
  }, [clearTimer, performSave]);

  const updateField = useCallback(
    (field: CareIntakeFieldDefinition, value: CareIntakeResponseValue) => {
      // A stale "not submitted" reason stops being true the moment the answer
      // it named changes. An unconfirmed submission is not resolved by editing,
      // so it stays until the status is actually re-checked.
      setSubmitNotice((current) =>
        current?.kind === "unconfirmed" ? current : null,
      );
      setResponses((current) => ({ ...current, [field.key]: value }));
      setFieldErrors((current) => {
        const error = validateField(field, value, false);
        if (!error && !(field.key in current)) return current;
        const next = { ...current };
        if (error) next[field.key] = error;
        else delete next[field.key];
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  async function startIntake() {
    if (starting) return;
    setStarting(true);
    setStartBlock(null);
    try {
      const response = await careApiFetch(INTAKE_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: newIdempotencyKey("care-intake-start"),
        }),
      });
      const body = await readJson(response);
      if (response.status === 401) {
        setLoadState({ kind: "auth_required" });
        return;
      }
      if (response.status === 403) {
        setLoadState({ kind: "not_permitted" });
        return;
      }
      if (response.status === 503 && body?.code === "care_disabled") {
        setLoadState({ kind: "disabled" });
        return;
      }
      if (response.status === 409) {
        setStartBlock(startBlockFromCode(body?.code));
        return;
      }
      if (!response.ok || body?.ok !== true || !body.intake) {
        setStartBlock("unknown");
        return;
      }
      const started = body.intake as CareClinicalIntake;
      versionRef.current = started.version;
      savedPayloadRef.current = stableResponseKey({});
      savedRevisionRef.current = false;
      pendingSubmitRef.current = null;
      responsesRef.current = {};
      setResponses({});
      setFieldErrors({});
      setSaveState({ kind: "idle" });
      setStepId("");
      setLoadState((current) =>
        current.kind === "ready" ? { ...current, intake: started } : current,
      );
    } catch {
      setStartBlock("unknown");
    } finally {
      setStarting(false);
    }
  }

  async function submitIntake() {
    if (submitting) return;
    if (!intake || intake.status !== "draft") return;
    setSubmitNotice((current) =>
      current?.kind === "unconfirmed" ? current : null,
    );
    if (blockers.blockingFieldKeys.length > 0) {
      const nextErrors: Record<string, CareIntakeFieldError> = {};
      for (const section of sections) {
        for (const field of section.fields) {
          const error = validateField(field, responses[field.key], true);
          if (error) nextErrors[field.key] = error;
        }
      }
      setFieldErrors(nextErrors);
      const firstKey = blockers.blockingFieldKeys[0];
      const owner = sectionIdForFieldKey(sections, firstKey);
      if (owner) setStepId(owner);
      noteRefusal(
        "Some required questions still need an answer. Nothing was submitted.",
      );
      globalThis.setTimeout(() => {
        document.getElementById(fieldDomId(firstKey))?.focus();
      }, 0);
      return;
    }
    setSubmitting(true);
    try {
      clearTimer();
      const saved = await performSave();
      if (!saved) {
        noteRefusal(
          "Your latest answers were not saved, so this submit was not sent. Try saving again first.",
        );
        return;
      }
      // One key per submit intent, matching how autosave keys a distinct
      // payload. Reusing it means a retry after a lost response is a replay the
      // server returns the submitted intake for, instead of a second attempt it
      // refuses. A new intent (a new version, from an edit the server accepted)
      // is a genuinely different submit and earns a fresh key.
      const intent = `${intake.id}:${versionRef.current}`;
      if (pendingSubmitRef.current?.intent !== intent) {
        pendingSubmitRef.current = {
          key: newIdempotencyKey("care-intake-submit"),
          intent,
        };
      }
      const attempt = pendingSubmitRef.current;
      const response = await careApiFetch(
        `${INTAKE_PATH}/${encodeURIComponent(intake.id)}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: versionRef.current,
            idempotencyKey: attempt.key,
          }),
        },
      );
      const body = await readJson(response);
      if (response.status === 401) {
        setLoadState({ kind: "auth_required" });
        return;
      }
      if (response.status === 403) {
        setLoadState({ kind: "not_permitted" });
        return;
      }
      if (response.status === 503 && body?.code === "care_disabled") {
        setLoadState({ kind: "disabled" });
        return;
      }
      if (response.ok && body?.ok === true && body.intake) {
        pendingSubmitRef.current = null;
        setSubmitNotice(null);
        setJustSubmitted(true);
        setLoadState((current) =>
          current.kind === "ready"
            ? { ...current, intake: body.intake as CareClinicalIntake }
            : current,
        );
        return;
      }
      // 400 is a rejected request and 409 is a stated precondition failure.
      // Both are decided before the submit is attempted, so both prove that
      // nothing reached a clinician and the definitive wording is earned.
      if (response.status === 400 || response.status === 409) {
        setSubmitNotice({ kind: "refused", message: SUBMIT_REFUSED_MESSAGE });
        return;
      }
      // Anything else leaves the outcome genuinely unknown. A 503 is what this
      // route returns when the submit itself threw, which includes the case
      // where the record is already submitted, so the page must not claim that
      // nothing was sent. The key is kept so the next attempt replays.
      setSubmitNotice({
        kind: "unconfirmed",
        message: SUBMIT_UNCONFIRMED_MESSAGE,
      });
    } catch {
      // The request left the browser and no answer came back. It may have been
      // committed before the connection failed.
      setSubmitNotice({
        kind: "unconfirmed",
        message: SUBMIT_UNCONFIRMED_MESSAGE,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const activeSection = sections.find((section) => section.id === stepId);
  const onReview = stepId === CARE_INTAKE_REVIEW_STEP_ID;
  const steps = stepOrder(sections);
  const stepIndex = steps.indexOf(stepId);

  return (
    <PageShell>
      <SeoHead
        title="Care intake, xenios"
        description="The private Care intake questionnaire for the separate Xenios Care pathway."
        path="/care/intake"
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · INTAKE</p>
        <h1 className="display-m max-w-[19ch]">
          Intake is written for a clinician to read, not for a system to decide.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          Your answers are saved as a private draft while you work, and they are
          only sent for clinical review when you submit them. Submitting is not
          treatment approval, a prescription, or a promise of availability.
        </p>

        <section
          className="mt-10 max-w-[920px]"
          aria-live="polite"
          aria-busy={loadState.kind === "loading"}
          aria-labelledby="care-intake-status-title"
        >
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="care-intake-status-title" className="h2">
            {loadState.kind === "loading" && "Checking intake status…"}
            {loadState.kind === "disabled" &&
              "Care intake is not enabled and cannot accept an answer."}
            {loadState.kind === "auth_required" && "Sign in is required."}
            {loadState.kind === "not_permitted" &&
              "This account is not authorized for patient intake."}
            {loadState.kind === "error" &&
              "Intake status is temporarily unavailable."}
            {loadState.kind === "ready" &&
              !definition &&
              "No approved intake questionnaire is published yet."}
            {loadState.kind === "ready" &&
              definition &&
              !intake &&
              "Your intake has not been started."}
            {loadState.kind === "ready" &&
              intake?.status === "draft" &&
              "Your intake is in progress and saved as a draft."}
            {loadState.kind === "ready" &&
              intake?.status === "submitted" &&
              (justSubmitted
                ? "Your intake has been submitted."
                : "Your intake is waiting for clinician review.")}
          </h2>

          {loadState.kind === "loading" && (
            <div className="card mt-6">
              <p className="body-m text-ink-mute">
                No intake answer is accepted while this check is in progress.
              </p>
            </div>
          )}

          {loadState.kind === "auth_required" && (
            <div className="card mt-6">
              <p className="mono-label text-pulse mb-3">
                AUTHORIZATION REQUIRED
              </p>
              <p className="body-m text-ink-2">
                Intake answers are private and require an authorized Care
                account. Research access does not grant Care authorization.
              </p>
              <Link href="/research/sign-in" className="btn btn-primary mt-6">
                Sign in securely
              </Link>
            </div>
          )}

          {loadState.kind === "not_permitted" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Patient intake is limited to the patient it belongs to. No
                intake content is shown here and no answer can be entered.
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}

          {loadState.kind === "error" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Nothing was changed or submitted. Confirm the status again
                before entering any answer.
              </p>
              <button
                type="button"
                className="btn btn-secondary mt-6"
                onClick={() => void load()}
              >
                Try again
              </button>
            </div>
          )}

          {loadState.kind === "disabled" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Real patient data is not enabled in this environment. Intake
                questions must be approved by the clinical team and patient
                records must be turned on before this form can accept or store
                an answer. Nothing typed here would be saved, so no question is
                shown as if it were live.
              </p>
              <button
                type="button"
                className="btn btn-primary mt-6"
                disabled
                aria-describedby="care-intake-disabled-help"
              >
                Start my intake
              </button>
              <p
                id="care-intake-disabled-help"
                className="body-s text-ink-mute mt-4 max-w-[60ch]"
              >
                This control stays turned off until Care is enabled for real
                patient records. It is shown so the full flow is visible, not
                because it is available.
              </p>
              <p className="mono-label text-ink-mute mt-6">
                DRAFT SAVING · NOT AVAILABLE
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}

          {loadState.kind === "ready" && !definition && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Intake questions are authored, versioned, and approved by the
                clinical team before they appear. No placeholder question is
                presented as approved.
              </p>
              <Link href="/care/eligibility" className="btn btn-secondary mt-6">
                Review Care eligibility
              </Link>
            </div>
          )}

          {loadState.kind === "ready" && definition && !intake && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Starting intake creates a private draft bound to the consent
                versions you already granted. You can leave and return, and your
                saved answers will still be here.
              </p>
              <p className="mono-label text-ink-mute mt-5">
                APPROVED QUESTIONNAIRE VERSION {definition.version}
              </p>
              <button
                type="button"
                className="btn btn-primary mt-6"
                onClick={() => void startIntake()}
                disabled={starting}
              >
                {starting ? "Starting…" : "Start my intake"}
              </button>
            </div>
          )}

          {loadState.kind === "ready" &&
            intake?.status === "draft" &&
            sections.length === 0 && (
              <div className="card mt-6">
                <p className="body-m text-ink-2">
                  Your draft exists, but the approved questionnaire has no
                  questions to show right now. Nothing is missing from your
                  record and nothing was lost.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary mt-6"
                  onClick={() => void load()}
                >
                  Try again
                </button>
              </div>
            )}

          {loadState.kind === "ready" && intake?.status === "submitted" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                {justSubmitted
                  ? "Your answers were recorded and are queued for a clinician to read. No clinical decision has been made and no treatment has been approved."
                  : "A clinician must read your intake before anything else in Care can happen. There is no automated clinical decision, and no review time is promised here."}
              </p>
              <p className="mono-label text-ink-mute mt-5">
                SUBMITTED · AWAITING CLINICIAN REVIEW
              </p>
              <Link href="/care/appointments" className="btn btn-secondary mt-6">
                View Care appointments
              </Link>
            </div>
          )}
        </section>

        {startBlock && (
          <div className="card mt-6 max-w-[920px]" role="alert" tabIndex={-1}>
            <p className="mono-label text-pulse mb-2">INTAKE NOT STARTED</p>
            <p className="body-l">{START_BLOCK_COPY[startBlock].title}</p>
            <p className="body-m text-ink-2 mt-4">
              {START_BLOCK_COPY[startBlock].detail}
            </p>
            <Link
              href={START_BLOCK_COPY[startBlock].href}
              className="btn btn-secondary mt-6"
            >
              {START_BLOCK_COPY[startBlock].action}
            </Link>
          </div>
        )}

        {loadState.kind === "disabled" && (
          <section
            className="mt-12 max-w-[920px]"
            aria-labelledby="care-intake-outline-title"
          >
            <p className="mono-cap text-ink-mute mb-5">THE STEPS INTAKE USES</p>
            <h2 id="care-intake-outline-title" className="display-s max-w-[20ch]">
              The whole flow, none of it live.
            </h2>
            <p className="body-m text-ink-2 mt-6 max-w-[60ch]">
              These are the steps the form moves through. The questions inside
              them come from the approved questionnaire and are not shown until
              Care is enabled.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
              {CARE_INTAKE_SECTIONS.map((section, index) => (
                <article className="card flex flex-col" key={section.id}>
                  <span className="tile-num text-pulse" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="h3 mt-8 mb-3">{section.title}</h3>
                  <p className="body-m text-ink-2">{section.summary}</p>
                  <p className="mono-label text-ink-mute mt-8">
                    NOT YET AVAILABLE
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {editable && sections.length > 0 && (
          <div className="mt-12 max-w-[920px]">
            <nav aria-label="Intake steps" className="pt-10 rule-top">
              <p className="mono-label text-ink-mute mb-4">
                STEP {Math.max(stepIndex, 0) + 1} OF {steps.length} ·{" "}
                {blockers.answered} OF {blockers.total} QUESTIONS ANSWERED
              </p>
              <ul className="flex flex-wrap gap-3 list-none p-0 m-0">
                {sections.map((section) => {
                  const progress = sectionProgress(section, responses);
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        className={
                          section.id === stepId
                            ? "btn btn-secondary"
                            : "btn btn-ghost"
                        }
                        aria-current={section.id === stepId ? "step" : undefined}
                        onClick={() => setStepId(section.id)}
                      >
                        {section.title}
                        <span className="mono-label text-ink-mute ml-3">
                          {progress.answered}/{progress.total}
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    className={onReview ? "btn btn-secondary" : "btn btn-ghost"}
                    aria-current={onReview ? "step" : undefined}
                    onClick={() => setStepId(CARE_INTAKE_REVIEW_STEP_ID)}
                  >
                    Review and submit
                  </button>
                </li>
              </ul>
            </nav>

            {/* Kept outside the review step: a blocked submit moves the patient
                to the offending question, and the reason it was not submitted
                has to travel with them. */}
            {submitNotice && (
              <div className="card mt-8" role="alert" tabIndex={-1}>
                <p className="mono-label text-pulse mb-2">
                  {submitNotice.kind === "refused"
                    ? "NOT SUBMITTED"
                    : "SUBMISSION NOT CONFIRMED"}
                </p>
                <p className="body-m text-ink-2">{submitNotice.message}</p>
                {submitNotice.kind === "unconfirmed" && (
                  <div className="flex flex-wrap gap-4 mt-6">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void load()}
                    >
                      Check my intake status
                    </button>
                    <Link href="/contact" className="btn btn-ghost">
                      Ask about Care
                    </Link>
                  </div>
                )}
              </div>
            )}

            <p className="mono-label mt-8" role="status">
              {saveState.kind === "idle" && "DRAFT · NOTHING ENTERED YET"}
              {saveState.kind === "unsaved" && "UNSAVED CHANGES"}
              {saveState.kind === "saving" && "SAVING…"}
              {saveState.kind === "saved" && "ALL CHANGES SAVED AS A DRAFT"}
              {saveState.kind === "error" && "NOT SAVED"}
            </p>
            {saveState.kind === "error" && (
              <div className="card mt-4" role="alert">
                <p className="body-m text-ink-2">{SAVE_FAILED_MESSAGE}</p>
                <button
                  type="button"
                  className="btn btn-secondary mt-6"
                  onClick={() => void performSave()}
                >
                  Try saving again
                </button>
              </div>
            )}

            {activeSection && (
              <IntakeSectionForm
                section={activeSection}
                responses={responses}
                fieldErrors={fieldErrors}
                onChange={updateField}
              />
            )}

            {onReview && (
              <section
                className="mt-10"
                aria-labelledby="care-intake-review-title"
              >
                <h2 id="care-intake-review-title" className="h2">
                  Review your answers
                </h2>
                <p className="body-m text-ink-2 mt-4 max-w-[60ch]">
                  Nothing on this page has been sent for clinical review yet.
                  Check every answer, then submit.
                </p>
                {sections.map((section) => (
                  <div className="card mt-6" key={section.id}>
                    <p className="mono-label text-pulse mb-4">
                      {section.title.toUpperCase()}
                    </p>
                    <dl className="m-0">
                      {section.fields.map((field) => (
                        <div className="pt-4 first:pt-0" key={field.key}>
                          <dt className="body-s text-ink-mute">
                            {fieldLabel(field)}
                            {field.required && !isAnswered(responses[field.key])
                              ? " · required"
                              : ""}
                          </dt>
                          <dd className="body-m m-0 break-words">
                            {displayAnswer(field, responses[field.key])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <button
                      type="button"
                      className="btn btn-ghost mt-6"
                      onClick={() => setStepId(section.id)}
                    >
                      Edit {section.title.toLowerCase()}
                    </button>
                  </div>
                ))}

                {blockers.blockingFieldKeys.length > 0 && (
                  <p className="body-m text-ink-2 mt-8 max-w-[60ch]">
                    {blockers.blockingFieldKeys.length} required question
                    {blockers.blockingFieldKeys.length === 1 ? "" : "s"} still
                    {blockers.blockingFieldKeys.length === 1
                      ? " needs"
                      : " need"}{" "}
                    an answer. Submit stays closed until they are complete.
                  </p>
                )}

                <button
                  type="button"
                  className="btn btn-primary mt-8"
                  aria-disabled={
                    submitting || blockers.blockingFieldKeys.length > 0
                  }
                  aria-describedby="care-intake-submit-help"
                  onClick={() => void submitIntake()}
                >
                  {submitting ? "Submitting…" : "Submit my intake"}
                </button>
                <p
                  id="care-intake-submit-help"
                  className="body-s text-ink-mute mt-4 max-w-[60ch]"
                >
                  Submitting sends your answers to a clinician to read. It does
                  not approve treatment, create a prescription, or schedule
                  anything.
                </p>
              </section>
            )}

            <div className="flex flex-wrap gap-4 mt-10 pt-8 rule-top">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={stepIndex <= 0}
                onClick={() => setStepId(steps[Math.max(stepIndex - 1, 0)])}
              >
                Previous step
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={stepIndex < 0 || stepIndex >= steps.length - 1}
                onClick={() =>
                  setStepId(steps[Math.min(stepIndex + 1, steps.length - 1)])
                }
              >
                Next step
              </button>
            </div>
          </div>
        )}

        <aside className="mt-12 max-w-[760px] pt-10 rule-top">
          <p className="body-m text-ink-2">
            Care intake does not reuse Research assessment responses, and no
            automated system makes a clinical decision from these answers. If
            you may be experiencing a medical emergency, contact local emergency
            services now.
          </p>
          <Link href="/care" className="btn btn-ghost mt-8">
            Return to Care
          </Link>
        </aside>
      </div>
    </PageShell>
  );
}

function IntakeSectionForm({
  section,
  responses,
  fieldErrors,
  onChange,
}: {
  section: CareIntakeSection;
  responses: Readonly<Record<string, CareIntakeResponseValue>>;
  fieldErrors: Readonly<Record<string, CareIntakeFieldError>>;
  onChange: (
    field: CareIntakeFieldDefinition,
    value: CareIntakeResponseValue,
  ) => void;
}) {
  return (
    <section
      className="mt-10"
      aria-labelledby={`care-intake-section-${section.id}`}
    >
      <h2 id={`care-intake-section-${section.id}`} className="h2">
        {section.title}
      </h2>
      <p className="body-m text-ink-2 mt-4 max-w-[60ch]">{section.summary}</p>
      <div className="card mt-6">
        {section.fields.map((field) => (
          <IntakeField
            key={field.key}
            field={field}
            value={responses[field.key]}
            error={fieldErrors[field.key]}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  );
}

function IntakeField({
  field,
  value,
  error,
  onChange,
}: {
  field: CareIntakeFieldDefinition;
  value: CareIntakeResponseValue | undefined;
  error: CareIntakeFieldError | undefined;
  onChange: (
    field: CareIntakeFieldDefinition,
    value: CareIntakeResponseValue,
  ) => void;
}) {
  const id = fieldDomId(field.key);
  const errorId = `${id}-error`;
  const label = fieldLabel(field);
  const describedBy = error ? errorId : undefined;
  const requiredMark = (
    <span className="mono-label text-ink-mute ml-2">
      {field.required ? "REQUIRED" : "OPTIONAL"}
    </span>
  );

  const message = error ? (
    <p id={errorId} className="body-s text-pulse mt-2" role="alert">
      {CARE_INTAKE_FIELD_ERROR_MESSAGES[error]}
    </p>
  ) : null;

  if (field.kind === "boolean" || field.kind === "multi_select") {
    const selected = Array.isArray(value) ? value : [];
    const options: ReadonlyArray<readonly [string, string | boolean]> =
      field.kind === "boolean"
        ? [
            ["Yes", true],
            ["No", false],
          ]
        : field.options.map((option) => [option, option] as const);
    return (
      <fieldset
        className="pt-8 first:pt-0 border-0 p-0 m-0"
        aria-describedby={describedBy}
      >
        <legend className="body-m">
          {label}
          {requiredMark}
        </legend>
        <div className="flex flex-wrap gap-x-8 gap-y-3 mt-3">
          {options.map(([optionLabel, optionValue], index) => (
            <label
              className="body-m flex items-center gap-3"
              key={String(optionValue)}
            >
              <input
                id={index === 0 ? id : `${id}-${index}`}
                type={field.kind === "boolean" ? "radio" : "checkbox"}
                name={id}
                checked={
                  field.kind === "boolean"
                    ? value === optionValue
                    : selected.includes(String(optionValue))
                }
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  if (field.kind === "boolean") {
                    onChange(field, optionValue as boolean);
                    return;
                  }
                  const option = String(optionValue);
                  const next = event.target.checked
                    ? [...selected, option]
                    : selected.filter((entry) => entry !== option);
                  onChange(field, next);
                }}
              />
              {optionLabel}
            </label>
          ))}
        </div>
        {message}
      </fieldset>
    );
  }

  if (field.kind === "single_select") {
    return (
      <div className="pt-8 first:pt-0">
        <label htmlFor={id} className="body-m block mb-3">
          {label}
          {requiredMark}
        </label>
        <select
          id={id}
          name={id}
          className="input-field"
          value={typeof value === "string" ? value : ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(field, event.target.value)}
        >
          <option value="">Select an answer</option>
          {field.options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
        {message}
      </div>
    );
  }

  return (
    <div className="pt-8 first:pt-0">
      <label htmlFor={id} className="body-m block mb-3">
        {label}
        {requiredMark}
      </label>
      {field.kind === "text" ? (
        <textarea
          id={id}
          name={id}
          className="input-field textarea-field"
          value={typeof value === "string" ? value : ""}
          maxLength={4_000}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(field, event.target.value)}
        />
      ) : (
        <input
          id={id}
          name={id}
          type="date"
          className="input-field"
          value={typeof value === "string" ? value : ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(field, event.target.value)}
        />
      )}
      {message}
    </div>
  );
}
