import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import {
  CARE_PATIENT_RECORD_PATH,
  type CarePatientSurface,
} from "@shared/care/patient-surfaces";

/**
 * One patient Care surface that is not backed by a server contract.
 *
 * Before this screen existed, every unrecognized Care path fell through to the
 * generic Care shell, which told a patient that Care was being prepared but not
 * which part, or why. That is a dead end. This page names the surface, names
 * the exact contract that does not exist, and offers only routes that work.
 *
 * It reads nothing and writes nothing. There is no fetch on this page, because
 * there is no endpoint to call, and inventing one would be the failure this
 * screen exists to prevent.
 */
export default function CarePatientSurfacePendingPage({
  surface,
}: {
  surface: CarePatientSurface;
}) {
  return (
    <PageShell>
      <SeoHead
        title={`${surface.title}, Care, xenios`}
        description={`${surface.title} is not available in Xenios Care. No clinical service has been enabled.`}
        path={surface.path}
        robots="noindex, nofollow"
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">
          CARE · {surface.title.toUpperCase()}
        </p>
        <h1 className="display-m text-balance max-w-[20ch]">
          {surface.title} is not available.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">{surface.summary}</p>

        <section
          className="mt-10 max-w-[920px]"
          aria-labelledby="care-surface-state"
          data-care-read-only="true"
          data-care-surface={surface.key}
        >
          <p className="mono-label text-pulse mb-3">CURRENT STATE</p>
          <h2 id="care-surface-state" className="h2">
            Nothing is recorded here, because nothing records it.
          </h2>
          <div className="card mt-6">
            <p className="body-m text-ink-2">{surface.reason}</p>
            <p className="mono-label text-ink-mute mt-6">MISSING CONTRACT</p>
            <p className="body-s text-ink-2 mt-2 break-words">
              <code>{surface.missingContract ?? surface.contract}</code>
            </p>
            <p className="body-s text-ink-mute mt-4">
              This page shows no record, no history, and no status, because no
              server route serves one. It does not mean your record is empty. It
              means this part of Care has not been built.
            </p>
          </div>
        </section>

        <section className="mt-12 max-w-[920px]" aria-label="Where to go next">
          <p className="mono-label text-ink-mute mb-4">WHAT WORKS TODAY</p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4">
            <Link href={CARE_PATIENT_RECORD_PATH} className="btn btn-primary">
              See what Care can show you
            </Link>
            <Link href="/care" className="btn btn-secondary">
              View Care status
            </Link>
            <Link href="/contact" className="btn btn-ghost">
              Ask a person about Care
            </Link>
          </div>
        </section>

        <aside className="mt-12 max-w-[760px] pt-10 rule-top">
          <p className="mono-cap text-pulse mb-4">EMERGENCY BOUNDARY</p>
          <p className="body-m text-ink-2">
            This site is not emergency care. If you may be experiencing a medical
            emergency, contact local emergency services now. Do not wait for a
            message or response from Xenios.
          </p>
        </aside>
      </div>
    </PageShell>
  );
}
