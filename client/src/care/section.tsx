import { useEffect, useState } from "react";
import type { CareCapabilityStatus } from "@shared/care/contracts";
import { CARE_EMERGENCY_BOUNDARY } from "@shared/care/communications";
import "./styles.css";

const preparation = [
  ["Eligibility", "Location, state coverage, identity, consent"],
  ["Appointments", "Provider-neutral scheduling and telehealth"],
  ["Clinical review", "Assigned-clinician review and follow-up"],
  ["Pharmacy", "Prescription-bound pharmacy coordination"],
  ["Instructions", "Current, patient-specific materials only"],
  ["Support", "Secure support and adverse-event routing"],
] as const;

const fallback: CareCapabilityStatus = {
  rail: "care",
  state: "disabled",
  enabled: false,
  publicMessage: "Care is being prepared.",
  checkedAt: "",
};

export default function CareSection() {
  const [status, setStatus] = useState<CareCapabilityStatus>(fallback);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/care/status", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.capability?.rail === "care") setStatus(body.capability);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <main className="care-shell">
      <header className="care-header">
        <a className="care-wordmark" href="/" aria-label="Xenios home">XENIOS</a>
        <span className="care-rail">Care foundation</span>
      </header>

      <section className="care-hero" aria-labelledby="care-title">
        <div>
          <p className="care-eyebrow">A separate clinical rail</p>
          <h1 id="care-title">Care is being prepared with the right boundaries in place.</h1>
          <p className="care-lede">
            Xenios Care is a future clinician-led experience. It is separate from Research,
            Diagnostics, and Lifestyle, and it will remain unavailable until coverage,
            credentials, clinical partners, pharmacy readiness, content, and quality review are complete.
          </p>
        </div>
        <aside className="care-status" aria-live="polite">
          <span className="care-status-dot" aria-hidden="true" />
          <div>
            <strong>{status.publicMessage}</strong>
            <span>Current state: {status.state.replaceAll("_", " ")}</span>
          </div>
        </aside>
      </section>

      <section className="care-boundary" aria-label="Clinical boundary">
        <span>Research does not unlock Care.</span>
        <span>No treatment, prescription, or medical advice is available here.</span>
        <span>Availability will depend on your physical location.</span>
      </section>

      <section className="care-grid" aria-labelledby="preparation-title">
        <div className="care-grid-heading">
          <p className="care-eyebrow">Foundation in progress</p>
          <h2 id="preparation-title">Designed to fail closed.</h2>
        </div>
        <div className="care-cards">
          {preparation.map(([title, detail], index) => (
            <article className="care-card" key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{detail}</p>
              <small>Not yet available</small>
            </article>
          ))}
        </div>
      </section>

      <section className="care-emergency" aria-labelledby="emergency-title">
        <p className="care-eyebrow">Emergency boundary</p>
        <h2 id="emergency-title">This site is not emergency care.</h2>
        <p>
          {CARE_EMERGENCY_BOUNDARY}
        </p>
      </section>
    </main>
  );
}
