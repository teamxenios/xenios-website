import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ACCESS_ROUTES } from "../lib/routes";
import { ResearchPendingPanel } from "../ui/kit";
import { ResearchPublicShell } from "../ui/shells";

export default function Apply() {
  return (
    <>
      <SeoHead
        title="Membership applications, xenios research"
        description="Membership applications are being prepared while the required application documents complete review."
        path={ACCESS_ROUTES.apply}
      />
      <ResearchPublicShell
        eyebrow="Membership application"
        title="Applications are being prepared."
        lead="We are completing the documents that must accompany every application before submissions open."
      >
        <ResearchPendingPanel
          kind="samuel_review_pending"
          title="Documentation pending"
          body="Membership Application Terms and the Privacy Policy are still under review. Applications will open only after the approved documents can be shown and recorded with each submission."
          testid="application-documentation-pending"
          action={
            <Link href={ACCESS_ROUTES.support} className="btn btn-secondary" data-testid="link-application-support">
              Contact support
            </Link>
          }
        />
        <section className="card mt-6" aria-labelledby="application-next-step">
          <p className="mono-label text-ink-mute">What happens next</p>
          <h2 id="application-next-step" className="body-m font-700 mt-2">
            Return when applications open
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            No application has been started or saved from this page. When the approved documents are available, this same
            route will present the complete application and its required acknowledgements.
          </p>
          <p className="body-s text-ink-mute mt-4 max-w-[56ch]">
            Do not email medical records or sensitive health information.
          </p>
          <nav
            aria-label="Application documentation"
            className="mt-5 flex flex-wrap"
            style={{ columnGap: 24, rowGap: 8 }}
          >
            <Link href={ACCESS_ROUTES.terms} className="body-s">
              Terms status
            </Link>
            <Link href={ACCESS_ROUTES.privacy} className="body-s">
              Privacy status
            </Link>
          </nav>
        </section>
      </ResearchPublicShell>
    </>
  );
}
