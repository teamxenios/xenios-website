import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { PublicBoundaryNote } from "./PublicEditorialNav";

const ACCESS_OPTIONS = [
  {
    id: "member",
    eyebrow: "Individuals and professionals",
    title: "Research customer",
    body: "Review the Research-use boundary, apply or sign in, then use the member-safe experience for exact offering information, authorized requests, orders, documents, and support.",
    availability: "Application availability is shown on the application page.",
    primary: { label: "Review Research access", href: "/research/apply" },
    secondary: { label: "Member login", href: "/research/sign-in" },
  },
  {
    id: "organization",
    eyebrow: "Clinics, practices, gyms, marketplaces, and businesses",
    title: "Organization buyer",
    body: "Begin an organization or professional-buyer conversation for research context, documentation needs, volume requests, account review, and human follow-up.",
    availability: "Organization workspaces require review and may not yet be provisioned.",
    primary: { label: "Organization support", href: "/research/support" },
    secondary: { label: "How access works", href: "/research/how-it-works" },
  },
  {
    id: "partner",
    eyebrow: "Affiliates and referral partners",
    title: "Partner program",
    body: "Review relationship types, compliance boundaries, application and onboarding expectations, and the resources available only after approval.",
    availability: "No approval, commission, payout, or commercial term is implied publicly.",
    primary: { label: "Ask about partner access", href: "/research/support" },
    secondary: { label: "How access works", href: "/research/how-it-works" },
  },
  {
    id: "supplier",
    eyebrow: "Suppliers, labs, and fulfillment partners",
    title: "Supplier access",
    body: "Supplier, laboratory, and fulfillment relationships begin with human review. Any future workspace must remain limited to assigned work and the minimum required operational information.",
    availability: "No public supplier workspace is promised. Access requires a provisioned, authorized relationship.",
    primary: { label: "Ask about supplier access", href: "/research/support" },
    secondary: { label: "How access works", href: "/research/how-it-works" },
  },
  {
    id: "care",
    eyebrow: "Patients and authorized clinical teams",
    title: "Xenios Care",
    body: "A separate provider-governed pathway for eligibility, supported scheduling, independent review, and authorized clinical or pharmacy handoffs where configured and legally available.",
    availability: "Scheduling never guarantees treatment, a prescription, or fulfillment.",
    primary: { label: "Open Care", href: "/care" },
    secondary: { label: "Check eligibility", href: "/care/eligibility" },
  },
  {
    id: "private",
    eyebrow: "Open early-access entry",
    title: "Private Early Access",
    body: "Open the separate passwordless Early Access request and ordering experience. Any later action still depends on its own current authorization and evidence.",
    availability: "Entry does not prove approval, availability, payment, shipment, or a Care decision.",
    primary: { label: "Enter Private Early Access", href: "/research/early-access" },
    secondary: { label: "Get support", href: "/research/support" },
  },
] as const;

function Action({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  const className = `${primary ? "btn btn-primary" : "btn btn-secondary"} public-editorial-action`;
  return href.startsWith("mailto:") ? (
    <a className={className} href={href}>{label}</a>
  ) : (
    <Link className={className} href={href}>{label}</Link>
  );
}

export default function AccessHub() {
  return (
    <>
      <SeoHead
        title="Access Xenios Research"
        description="Choose the Xenios Research access path that matches your intended relationship or question."
        path="/research/access-hub"
      />
      <ResearchPublicShell
        eyebrow="Access Xenios Research"
        title="Choose the path that matches what you are here to do."
        lead="Research, Care, organizations, partners, suppliers, Early Access, and support use different authorities. Start here so one pathway never silently becomes another."
      >
        <section className="card bg-paper-2 mt-6" aria-labelledby="access-first-question">
          <p className="mono-label text-ink-mute">Start with one question</p>
          <h2 id="access-first-question" className="body-l font-700 mt-2">Is this nonclinical Research or provider-governed Care?</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
            Use Research for legitimate nonclinical research materials and their operational lifecycle. Use Care for scheduling,
            provider review, clinical records, prescribing, or pharmacy activity. If you are unsure, Support can route the question without making a clinical decision.
          </p>
        </section>

        <div className="grid gap-4 mt-6 public-editorial-grid">
          {ACCESS_OPTIONS.map((option) => (
            <article className="card" key={option.id}>
              <p className="mono-label text-ink-mute">{option.eyebrow}</p>
              <h2 className="body-l font-700 mt-2">{option.title}</h2>
              <p className="body-s text-ink-2 mt-3">{option.body}</p>
              <p className="body-s text-ink-mute mt-3">{option.availability}</p>
              <div className="mt-5 public-editorial-actions">
                <Action primary href={option.primary.href} label={option.primary.label} />
                <Action href={option.secondary.href} label={option.secondary.label} />
              </div>
            </article>
          ))}
        </div>

        <section className="card mt-6" aria-labelledby="one-account">
          <p className="mono-label text-ink-mute">Identity and privacy</p>
          <h2 id="one-account" className="body-l font-700 mt-2">Each workspace requires its own server authority.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[72ch]">
            The browser never chooses its own role. Any signed-in surface and data scope must come from the canonical
            server-side authority applicable to that workspace. Membership or access to one workspace does not imply
            organization, partner, supplier, provider, or administrative authority. An absent or unprovisioned authority must fail closed.
          </p>
        </section>

        <section className="card mt-6" aria-labelledby="after-access-choice">
          <p className="mono-label text-ink-mute">What happens next</p>
          <h2 id="after-access-choice" className="body-l font-700 mt-2">The selected page explains its own availability.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[72ch]">
            A configured experience offers its supported next action. A disabled, unprovisioned, documentation-pending, or externally blocked experience explains the missing input and provides a safe fallback instead of a fake success.
          </p>
        </section>

        <div className="mt-6">
          <PublicBoundaryNote />
        </div>
      </ResearchPublicShell>
    </>
  );
}
