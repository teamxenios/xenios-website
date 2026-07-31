import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type { CareCapabilityStatus } from "@shared/care/contracts";
import CareClinicianReviewQueuePage, {
  CARE_CLINICIAN_REVIEW_PATH,
} from "./CareClinicianReviewQueuePage";

const preparation = [
  ["Eligibility", "Location, state coverage, identity, consent"],
  ["Appointments", "Provider-neutral scheduling and telehealth"],
  ["Clinical review", "Assigned-clinician review and follow-up"],
  ["Pharmacy", "Prescription-bound pharmacy coordination"],
  ["Instructions", "Current, patient-specific materials only"],
  ["Support", "Secure support and adverse-event routing"],
] as const;

type StatusLoadState =
  | { kind: "loading" }
  | { kind: "ready"; status: CareCapabilityStatus }
  | { kind: "error" };

/**
 * The broad Care route resolves here. Care-owned sub-surfaces are selected
 * inside the Care module, so a new Care screen never needs a change to the
 * protected application router. Anything unrecognized falls through to the
 * pending shell below, which is the fail-closed default.
 */
export default function CareSection() {
  const [location] = useLocation();
  if (location === CARE_CLINICIAN_REVIEW_PATH) {
    return <CareClinicianReviewQueuePage />;
  }
  return <CarePendingShell />;
}

function CarePendingShell() {
  const [loadState, setLoadState] = useState<StatusLoadState>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ kind: "loading" });
    fetch("/api/care/status", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("care_status_unavailable");
        return response.json();
      })
      .then((body) => {
        if (body?.capability?.rail !== "care") {
          throw new Error("care_status_invalid");
        }
        setLoadState({ kind: "ready", status: body.capability });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState({ kind: "error" });
      });
    return () => controller.abort();
  }, [loadAttempt]);

  return (
    <PageShell>
      <SeoHead
        title="Care, xenios"
        description="Xenios Care is a future clinician-led experience that remains unavailable while its clinical and operational foundations are prepared."
        path="/care"
      />

      <section className="container-x pt-24 md:pt-36 pb-16" aria-labelledby="care-title">
        <p className="mono-cap text-pulse mb-6">CARE · PENDING</p>
        <h1 id="care-title" className="display-m text-balance max-w-[18ch]">
          Care is being prepared with the right boundaries in place.
        </h1>
        <p className="mt-8 body-l text-ink-2 max-w-[64ch]">
            Xenios Care is a future clinician-led experience. It is separate from Research,
            Diagnostics, and Lifestyle, and it will remain unavailable until coverage,
            credentials, clinical partners, pharmacy readiness, content, and quality review are complete.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <Link href="/contact" className="btn btn-primary">Ask about Care</Link>
          <Link href="/privacy" className="btn btn-ghost">Read our privacy approach</Link>
        </div>
      </section>

      <section className="container-x pb-16" aria-label="Current Care status">
        <aside
          className="card max-w-[720px]"
          style={{ borderLeftColor: "var(--pulse)", borderLeftWidth: 3 }}
          aria-live="polite"
          aria-busy={loadState.kind === "loading"}
        >
          <div className="flex items-start gap-3">
            <span className="counter-dot mt-2 flex-none" aria-hidden="true" />
            {loadState.kind === "loading" && (
              <div>
                <p className="mono-label text-pulse mb-2">CHECKING STATUS</p>
                <strong className="body-l">Checking Care status…</strong>
                <p className="body-s text-ink-mute mt-2">
                  Care remains unavailable while status is confirmed.
                </p>
              </div>
            )}
            {loadState.kind === "error" && (
              <div>
                <p className="mono-label text-pulse mb-2">STATUS UNAVAILABLE</p>
                <strong className="body-l">Care status is temporarily unavailable.</strong>
                <p className="body-s text-ink-mute mt-2">
                  Care remains unavailable. No clinical service has been enabled.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary mt-5"
                  onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                >
                  Try again
                </button>
              </div>
            )}
            {loadState.kind === "ready" && (
              <div>
                <p className="mono-label text-pulse mb-2">CURRENT STATUS</p>
                <strong className="body-l">{loadState.status.publicMessage}</strong>
                <p className="mono-label text-ink-mute mt-3">
                  {loadState.status.state.replaceAll("_", " ")}
                </p>
              </div>
            )}
          </div>
        </aside>
      </section>

      <section className="container-x py-10 rule-y" aria-label="Clinical boundary">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
          <p className="body-m text-ink-2">Research does not unlock Care.</p>
          <p className="body-m text-ink-2">
            No treatment, prescription, or medical advice is available here.
          </p>
          <p className="body-m text-ink-2">
            Availability will depend on your physical location.
          </p>
        </div>
      </section>

      <section className="container-x py-16 md:py-20" aria-labelledby="preparation-title">
        <p className="mono-cap text-ink-mute mb-6">FOUNDATION IN PROGRESS</p>
        <h2 id="preparation-title" className="display-s max-w-[18ch]">
          Designed to fail closed.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
          {preparation.map(([title, detail], index) => (
            <article className="card flex flex-col" key={title}>
              <span className="tile-num text-pulse" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="h3 mt-8 mb-3">{title}</h3>
              <p className="body-m text-ink-2">{detail}</p>
              <p className="mono-label text-ink-mute mt-8">NOT YET AVAILABLE</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-16 rule-top" aria-labelledby="emergency-title">
        <p className="mono-cap text-pulse mb-6">EMERGENCY BOUNDARY</p>
        <h2 id="emergency-title" className="display-s max-w-[18ch]">
          This site is not emergency care.
        </h2>
        <p className="mt-6 body-l text-ink-2 max-w-[60ch]">
          If you may be experiencing a medical emergency, contact local emergency services now.
          Do not wait for a message or response from Xenios.
        </p>
      </section>
    </PageShell>
  );
}
