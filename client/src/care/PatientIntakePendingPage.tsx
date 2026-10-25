import PageShell from "@/components/PageShell";

export default function PatientIntakePendingPage() {
  return (
    <PageShell>
      <div className="container-x pt-24 md:pt-36 pb-20 min-w-0" id="main-content" tabIndex={-1} data-care-pending-shell="intake">
        <p className="mono-cap text-pulse mb-6 break-words">CARE · INTAKE DOCUMENTATION</p>
        <h1 className="display-m text-balance max-w-[20ch] break-words">Patient intake documentation is pending.</h1>
        <section className="card mt-10 max-w-[720px] min-w-0 break-words" aria-labelledby="intake-pending-title" role="status" aria-live="polite">
          <p className="mono-label text-pulse mb-3">DOCUMENTATION PENDING</p>
          <h2 id="intake-pending-title" className="h2">Readiness remains unavailable.</h2>
          <p className="body-m text-ink-2 mt-4">Intake readiness has not been confirmed. This feature is unavailable.</p>
          <p className="body-s text-ink-mute mt-4">No information or action is available in this pending shell.</p>
        </section>
      </div>
    </PageShell>
  );
}
