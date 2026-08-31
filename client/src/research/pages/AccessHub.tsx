import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { PublicBoundaryNote } from "./PublicEditorialNav";

const ACCESS_OPTIONS = [
  {
    id: "care",
    eyebrow: "Individuals seeking personal care",
    title: "Xenios Care",
    body: "Create or access your secure account, confirm your current location, complete the health questionnaire, and continue to independent review by a U.S.-licensed clinician. When treatment is clinically appropriate and serviceable, a prescription may be fulfilled through a U.S.-based, state-licensed compounding pharmacy.",
    availability: "Xenios Care is available nationwide. Exact services and formulations depend on location, clinician authority, clinical eligibility, pharmacy serviceability, and current availability. No prescription is guaranteed.",
    primary: { label: "Begin clinical intake", href: "/care" },
    secondary: { label: "How Care works", href: "/care/how-it-works" },
  },
  {
    id: "member",
    eyebrow: "Researchers, qualified customers, and professionals",
    title: "Xenios Research",
    body: "Explore legitimate nonclinical Research access with exact product and variant identity, plain-language evidence, current status, documentation, authorized requests, orders, and support.",
    availability: "Research access never includes personal-use guidance, prescribing, dosing, reconstitution, injection, or treatment recommendations.",
    primary: { label: "Explore Research access", href: "/research/apply" },
    secondary: { label: "Research member sign in", href: "/research/sign-in" },
  },
  {
    id: "organization",
    eyebrow: "Clinics, practices, gyms, marketplaces, and businesses",
    title: "Organization buyer",
    body: "Begin an organization or professional-buyer conversation for Care or Research context, documentation needs, account review, and human follow-up.",
    availability: "Organization workspaces require review and may not yet be provisioned.",
    primary: { label: "Explore organization access", href: "/research/organizations" },
    secondary: { label: "Compare partnership paths", href: "/research/partners" },
  },
  {
    id: "partner",
    eyebrow: "Affiliates and referral partners",
    title: "Partner program",
    body: "Review Care + Research relationship types, compliance boundaries, application and onboarding expectations, and the resources available only after approval.",
    availability: "No approval, commission, payout, or commercial term is implied publicly.",
    primary: { label: "Compare partnership paths", href: "/research/partners" },
    secondary: { label: "Review affiliate access", href: "/research/affiliates" },
  },
  {
    id: "supplier",
    eyebrow: "Suppliers, labs, and fulfillment partners",
    title: "Supplier access",
    body: "Supplier, laboratory, and fulfillment relationships begin with human review. Any future workspace must remain limited to assigned work and the minimum required operational information.",
    availability: "No public supplier workspace is promised. Access requires a provisioned, authorized relationship.",
    primary: { label: "Review supplier access", href: "/research/supplier-access" },
    secondary: { label: "How access works", href: "/research/how-it-works" },
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
        title="Xenios Care + Research access"
        description="Choose provider-guided Care for personal health or the separate Xenios Research pathway for legitimate nonclinical access, documentation, organizations, partners, and support."
        path="/research/access-hub"
      />
      <ResearchPublicShell
        eyebrow="Care + Research access"
        title="Choose the path that matches what you need."
        lead="Personal health starts with Xenios Care. Legitimate nonclinical work starts with Xenios Research. Organizations, partners, suppliers, Early Access, and support retain their own authorities and next steps."
      >
        <section className="card bg-paper-2 mt-6" aria-labelledby="access-first-question">
          <p className="mono-label text-ink-mute">Start with one question</p>
          <h2 id="access-first-question" className="body-l font-700 mt-2">Are you looking for care for yourself or nonclinical Research access?</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
            Use Care to create or access a secure account, complete a health intake, receive licensed clinical review,
            and continue to pharmacy fulfillment when prescribed. Use Research to review exact products, evidence,
            documentation, and Research-only access. Support can route an operational question without making a clinical decision.
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
