import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type { CarePrescription } from "@shared/care/prescriptions";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "auth_required" }
  | { kind: "ready"; prescriptions: CarePrescription[] }
  | { kind: "error" };

const statusCopy: Record<CarePrescription["status"], string> = {
  draft: "Clinician draft",
  signed: "Signed by your clinician",
  superseded: "Replaced by a newer prescription",
  cancelled: "Cancelled",
};

export default function CarePrescriptionsPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await careApiFetch("/api/care/prescriptions");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) return setState({ kind: "auth_required" });
      if (response.status === 503 && body?.code === "care_disabled") {
        return setState({ kind: "disabled" });
      }
      if (!response.ok || body?.ok !== true || !Array.isArray(body.prescriptions)) {
        throw new Error("care_prescriptions_unavailable");
      }
      setState({ kind: "ready", prescriptions: body.prescriptions });
    } catch {
      setState({ kind: "error" });
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <PageShell>
      <SeoHead
        title="Care prescriptions, xenios"
        description="Private prescription status in the separate Xenios Care pathway."
        path="/care/prescriptions"
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · PRESCRIPTIONS</p>
        <h1 className="display-m max-w-[18ch]">Your clinician remains the source of every prescription.</h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          This private area never invents medication details. Information appears
          only after an assigned human clinician signs a patient-specific record.
          This frontend is read-only and exposes no prescription action.
        </p>
        <section
          className="mt-10 max-w-[920px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-prescription-status"
          data-care-read-only="true"
        >
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="care-prescription-status" className="h2">
            {state.kind === "loading" && "Checking your private Care records…"}
            {state.kind === "disabled" && "Prescription services are not currently available."}
            {state.kind === "auth_required" && "Sign in is required."}
            {state.kind === "error" && "Prescription status is temporarily unavailable."}
            {state.kind === "ready" && state.prescriptions.length === 0 && "No prescription is recorded."}
            {state.kind === "ready" && state.prescriptions.length > 0 && "Your prescription history"}
          </h2>
          {state.kind === "loading" && (
            <div className="card mt-6"><p className="body-m text-ink-mute">No prescription or pharmacy action is enabled while this check is in progress.</p></div>
          )}
          {state.kind === "disabled" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">Care remains unavailable until verified clinical, pharmacy, privacy, instruction, support, and release requirements pass.</p>
              <Link href="/care" className="btn btn-secondary mt-6">View Care status</Link>
            </div>
          )}
          {state.kind === "auth_required" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">Prescription information is private and requires an authorized Care account.</p>
              <Link href="/research/sign-in" className="btn btn-primary mt-6">Sign in securely</Link>
            </div>
          )}
          {state.kind === "error" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">Nothing was changed. Confirm the status again before relying on this page.</p>
              <button type="button" className="btn btn-secondary mt-6" onClick={() => void load()}>Try again</button>
            </div>
          )}
          {state.kind === "ready" && state.prescriptions.length === 0 && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">No patient-specific prescription has been signed. Research membership and an appointment request do not imply treatment or prescribing.</p>
              <Link href="/care" className="btn btn-secondary mt-6">Review Care status</Link>
            </div>
          )}
          {state.kind === "ready" && state.prescriptions.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-4">
              {state.prescriptions.map((item) => (
                <article className="card" key={item.id}>
                  <p className="mono-label text-pulse">{statusCopy[item.status]}</p>
                  <h3 className="h3 mt-3">{item.formulation}</h3>
                  <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div><dt className="mono-label text-ink-mute">CONCENTRATION</dt><dd className="body-m mt-2">{item.concentration}</dd></div>
                    <div><dt className="mono-label text-ink-mute">ROUTE</dt><dd className="body-m mt-2">{item.route}</dd></div>
                    <div><dt className="mono-label text-ink-mute">QUANTITY</dt><dd className="body-m mt-2">{item.quantity}</dd></div>
                    <div><dt className="mono-label text-ink-mute">REFILLS</dt><dd className="body-m mt-2">{item.refills}</dd></div>
                  </dl>
                  <div className="rule-top mt-6 pt-6">
                    <p className="mono-label text-ink-mute">CLINICIAN DIRECTIONS</p>
                    <p className="body-m text-ink-2 mt-3 whitespace-pre-wrap">{item.directions}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
