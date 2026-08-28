import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { PublicBoundaryNote } from "./PublicEditorialNav";
import { RESEARCH_SUPPORT_EMAIL } from "./Support";

const CONTACT_PATHS = [
  {
    title: "Research operations",
    body: "Account access, applications, Research requests, orders, documents, organization context, or another operational question.",
    href: `mailto:${RESEARCH_SUPPORT_EMAIL}`,
    label: `Email ${RESEARCH_SUPPORT_EMAIL}`,
  },
  {
    title: "Account help",
    body: "Application status, approved-account claim, password recovery, and secure support guidance.",
    href: "/research/support",
    label: "Open Research Support",
  },
  {
    title: "Choosing a pathway",
    body: "Compare Research, Care, organization, partner, supplier, and private Early Access entry points before continuing.",
    href: "/research/access-hub",
    label: "Open the Access Hub",
  },
] as const;

export default function ResearchContact() {
  return (
    <>
      <SeoHead
        title="Contact Xenios Research"
        description="Contact Xenios Research for operational support, account help, documents, organization context, or help choosing the correct Research or Care pathway."
        path="/research/contact"
      />
      <ResearchPublicShell
        eyebrow="Contact Xenios Research"
        title="Start with the team and pathway that can actually help."
        lead="Use the options below for operational Research questions. No response-time promise, clinical decision, product approval, or account approval is created by contacting us."
      >
        <section className="grid gap-4 mt-8" aria-label="Research contact options">
          {CONTACT_PATHS.map((path) => (
            <article className="card" key={path.title}>
              <h2 className="body-l font-700">{path.title}</h2>
              <p className="body-s text-ink-2 mt-3 max-w-[64ch]">{path.body}</p>
              <div className="mt-5 public-editorial-actions">
                {path.href.startsWith("mailto:") ? (
                  <a href={path.href} className="btn btn-primary public-editorial-action">{path.label}</a>
                ) : (
                  <Link href={path.href} className="btn btn-secondary public-editorial-action">{path.label}</Link>
                )}
              </div>
            </article>
          ))}
        </section>

        <div className="mt-8">
          <PublicBoundaryNote />
        </div>

        <p className="body-s text-ink-mute mt-6 max-w-[68ch]">
          Do not email passwords, access tokens, payment credentials, or unnecessary medical information.
          Protected clinical messages and records belong in the authorized provider or patient-portal workflow.
        </p>
      </ResearchPublicShell>
    </>
  );
}
