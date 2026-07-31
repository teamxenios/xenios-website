import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type {
  CareEligibilityDecision,
  CareWaitlistEvent,
} from "@shared/care/eligibility";
import { careApiFetch } from "./api";

type EligibilityResponse = {
  ok: true;
  decision: CareEligibilityDecision;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "auth_required" }
  | { kind: "ready"; decision: CareEligibilityDecision }
  | { kind: "error" };

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function EligibilityPendingPage() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [location, setLocation] = useState("");
  const [actionError, setActionError] = useState("");
  // Validation of the state field is kept separate from request failures so the
  // message can sit next to the input it is about, and so the input itself can
  // be marked invalid. A request failure is about the whole action, not the
  // field, and keeps its own announcement below.
  const [fieldError, setFieldError] = useState("");
  const [waitlist, setWaitlist] = useState<CareWaitlistEvent | null>(null);
  const [saving, setSaving] = useState(false);

  const loadEligibility = useCallback(async () => {
    setLoadState({ kind: "loading" });
    setActionError("");
    setFieldError("");
    try {
      const response = await careApiFetch("/api/care/eligibility", {
        cache: "no-store",
      });
      const body = await readJson(response);
      if (response.status === 401) {
        setLoadState({ kind: "auth_required" });
        return;
      }
      if (response.status === 503 && body?.code === "care_disabled") {
        setLoadState({ kind: "disabled" });
        return;
      }
      if (!response.ok || body?.ok !== true || !body.decision) {
        throw new Error("care_eligibility_unavailable");
      }
      setLoadState({
        kind: "ready",
        decision: (body as EligibilityResponse).decision,
      });
    } catch {
      setLoadState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void loadEligibility();
  }, [loadEligibility]);

  async function saveLocation(event: FormEvent) {
    event.preventDefault();
    const stateCode = location.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(stateCode)) {
      setFieldError("Enter the two-letter code for your current state.");
      return;
    }
    setSaving(true);
    setActionError("");
    setFieldError("");
    try {
      const response = await careApiFetch("/api/care/eligibility/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateCode,
          source: "patient_attestation",
          idempotencyKey: newIdempotencyKey("care-location"),
        }),
      });
      const body = await readJson(response);
      if (!response.ok || body?.ok !== true || !body.decision) {
        throw new Error("care_location_unavailable");
      }
      setLoadState({ kind: "ready", decision: body.decision });
    } catch {
      setActionError(
        "We could not save your location. Nothing was submitted. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function joinWaitlist(decision: CareEligibilityDecision) {
    if (!decision.stateCode) return;
    setSaving(true);
    setActionError("");
    try {
      const response = await careApiFetch("/api/care/eligibility/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "joined",
          stateCode: decision.stateCode,
          idempotencyKey: newIdempotencyKey("care-waitlist"),
        }),
      });
      const body = await readJson(response);
      if (!response.ok || body?.ok !== true || !body.waitlist) {
        throw new Error("care_waitlist_unavailable");
      }
      setWaitlist(body.waitlist);
    } catch {
      setActionError(
        "We could not update the waitlist. Nothing was promised or reserved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <SeoHead
        title="Care eligibility, xenios"
        description="A truthful, location-aware Pending experience for the separate Xenios Care pathway."
        path="/care/eligibility"
      />

      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · ELIGIBILITY</p>
        <h1 className="display-m max-w-[18ch]">Care availability begins with your current location.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[64ch]">
          Care remains separate from Research. A location check does not approve
          treatment, create a prescription, or promise clinician availability.
        </p>

        <section
          className="card mt-10 max-w-[760px]"
          aria-live="polite"
          aria-busy={loadState.kind === "loading"}
          aria-labelledby="eligibility-status-title"
        >
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="eligibility-status-title" className="h2">
            {loadState.kind === "loading" && "Checking the Care foundation…"}
            {loadState.kind === "disabled" && "Care is not yet available."}
            {loadState.kind === "auth_required" && "Sign in is required."}
            {loadState.kind === "error" && "Care status is temporarily unavailable."}
            {loadState.kind === "ready" &&
              loadState.decision.outcome === "waitlist_available" &&
              "Care is not currently available in this state."}
            {loadState.kind === "ready" &&
              loadState.decision.outcome === "consent_required" &&
              "Required notices are not complete."}
            {loadState.kind === "ready" &&
              loadState.decision.outcome === "intake_available" &&
              "The intake foundation is ready for an approved definition."}
            {loadState.kind === "ready" &&
              loadState.decision.outcome === "unavailable" &&
              "Care remains unavailable."}
          </h2>

          {loadState.kind === "loading" && (
            <p className="body-m text-ink-mute mt-4">
              No Care action is enabled while this check is in progress.
            </p>
          )}
          {loadState.kind === "disabled" && (
            <p className="body-m text-ink-2 mt-4">
              Clinical partners, state coverage, consent content, and quality
              review are still being prepared.
            </p>
          )}
          {loadState.kind === "auth_required" && (
            <div className="mt-6">
              <Link href="/research/sign-in" className="btn btn-primary">
                Sign in securely
              </Link>
            </div>
          )}
          {loadState.kind === "error" && (
            <button
              type="button"
              className="btn btn-secondary mt-6"
              onClick={() => void loadEligibility()}
            >
              Try again
            </button>
          )}

          {loadState.kind === "ready" &&
            loadState.decision.reason === "location_required" && (
              <form className="mt-8 max-w-[420px]" onSubmit={saveLocation}>
                <label htmlFor="care-state-code" className="mono-label block mb-3">
                  CURRENT PHYSICAL STATE
                </label>
                <input
                  id="care-state-code"
                  name="stateCode"
                  className="input-field"
                  value={location}
                  onChange={(event) => {
                    setLocation(event.target.value);
                    if (fieldError) setFieldError("");
                  }}
                  inputMode="text"
                  autoComplete="address-level1"
                  maxLength={2}
                  required
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={
                    fieldError ? "care-state-error care-state-help" : "care-state-help"
                  }
                />
                {fieldError && (
                  <p
                    id="care-state-error"
                    role="alert"
                    className="body-s text-pulse mt-2"
                  >
                    {fieldError}
                  </p>
                )}
                <p id="care-state-help" className="body-s text-ink-mute mt-2">
                  Enter the two-letter code for where you are physically located
                  now. This does not establish clinical eligibility.
                </p>
                <button
                  type="submit"
                  className="btn btn-primary mt-6"
                  disabled={saving}
                >
                  {saving ? "Checking…" : "Check current state"}
                </button>
              </form>
            )}

          {loadState.kind === "ready" &&
            loadState.decision.outcome === "waitlist_available" && (
              <div className="mt-6">
                <p className="body-m text-ink-2 max-w-[58ch]">
                  You may record interest for this state. Joining does not
                  reserve care, establish a launch date, or guarantee service.
                </p>
                {waitlist ? (
                  <p className="mono-label text-pulse mt-5" role="status">
                    INTEREST RECORDED · NO AVAILABILITY PROMISE
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary mt-6"
                    onClick={() => void joinWaitlist(loadState.decision)}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Record my interest"}
                  </button>
                )}
              </div>
            )}
        </section>

        {actionError && (
          <div
            className="card mt-6 max-w-[760px]"
            role="alert"
            tabIndex={-1}
          >
            <p className="mono-label text-pulse mb-2">ACTION NOT SAVED</p>
            <p className="body-m text-ink-2">{actionError}</p>
          </div>
        )}

        <section className="mt-16 pt-12 rule-top max-w-[760px]" aria-labelledby="care-boundary-title">
          <p className="mono-cap text-ink-mute mb-5">CLINICAL BOUNDARY</p>
          <h2 id="care-boundary-title" className="display-s">
            No automated clinical clearance.
          </h2>
          <p className="body-m text-ink-2 mt-5">
            Location, identity, and consent are prerequisite checks only. An
            authorized clinician must make every clinical decision later in
            the Care process.
          </p>
          <Link href="/care" className="btn btn-ghost mt-8">
            Return to Care
          </Link>
        </section>
      </div>
    </PageShell>
  );
}
