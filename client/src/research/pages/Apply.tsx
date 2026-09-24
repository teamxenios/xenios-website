import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { ACCESS_ROUTES } from "../lib/routes";

const NEXT_ACTIONS = [
  { title: "Sign in", body: "Use an existing Xenios Research account.", href: "/research/sign-in", testid: "link-application-signin" },
  { title: "Order for Research", body: "Choose the currently supported Research ordering path.", href: "/research/order", testid: "link-application-order" },
  { title: "Start Care", body: "Send non-clinical routing details for human follow-up.", href: "/care/schedule", testid: "link-application-care" },
  { title: "Business or organization", body: "Start a reviewed organization or professional-buyer inquiry.", href: "/research/organizations", testid: "link-application-organization" },
  { title: "Partner program", body: "Review partner paths and their separate application requirements.", href: "/research/partners", testid: "link-application-partners" },
  { title: "Support", body: "Ask a person about the right supported next step.", href: "/research/support", testid: "link-application-support" },
] as const;

// Applications stay deliberately read-only until the exact Terms and Privacy
// documents are approved and the server can bind an acceptance to those
// immutable versions. This is a complete public state, not a client-side
// feature flag: there is no form, agreement control, submission handler, or
// application-write request in this component.

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
        title="Formal membership applications are not open yet."
        lead="The required Membership Application Terms and Privacy Policy are still under review. No application can be started or submitted here, but you can use the supported paths below now."
      >
        <section className="card" aria-labelledby="application-next-actions" data-testid="application-closed-state">
          <p className="mono-label text-ink-mute">Available now</p>
          <h2 id="application-next-actions" className="body-l font-700 mt-2">Choose the real next action you need.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
            If you want Research products now, start with Order for Research. Existing customers can sign in. Care,
            organization, partner, and support requests each keep their own review and authority.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            {NEXT_ACTIONS.map((action) => (
              <Link key={action.href} href={action.href} className="card block hover:border-[color:var(--ink)] transition-colors" data-testid={action.testid}>
                <span className="body-m font-700">{action.title}</span>
                <span className="body-s text-ink-2 block mt-2">{action.body}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="card mt-6" aria-labelledby="application-next-step">
          <p className="mono-label text-ink-mute">What happens next</p>
          <h2 id="application-next-step" className="body-m font-700 mt-2">
            No application has been started
          </h2>
          <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
            This page does not submit, save, or imply a membership application. When the approved documents are
            available, this route can present the complete application and its required acknowledgements.
          </p>
          <p className="body-s text-ink-mute mt-4 max-w-[56ch]">
            Do not email medical records or sensitive health information.
          </p>
          <nav
            aria-label="Application documentation"
            className="mt-5 flex flex-wrap"
            style={{ columnGap: 24, rowGap: 8 }}
          >
            <Link href={ACCESS_ROUTES.terms} className="body-s ra-documentation-link">
              Terms status
            </Link>
            <Link href={ACCESS_ROUTES.privacy} className="body-s ra-documentation-link">
              Privacy status
            </Link>
          </nav>
        </section>
      </ResearchPublicShell>
    </>
  );
}
