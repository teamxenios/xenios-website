import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";

const ACCESS_OPTIONS = [
  {
    id: "member",
    eyebrow: "Individuals and professionals",
    title: "Membership",
    body: "Apply for access, sign in to an approved membership, browse the member-safe catalog, submit requests, and review orders.",
    primary: { label: "Apply for membership", href: "/research/apply" },
    secondary: { label: "Account login", href: "/research/account/sign-in" },
  },
  {
    id: "organization",
    eyebrow: "Clinics, practices, gyms, marketplaces, and businesses",
    title: "Organization buyer",
    body: "Use one verified Xenios account to enter authorized organizations, manage business profiles, users, orders, invoices, and prior order history.",
    primary: { label: "Organization login", href: "/research/account/sign-in" },
    secondary: { label: "Contact business support", href: "mailto:research@xeniostechnology.com?subject=Xenios%20organization%20access" },
  },
  {
    id: "partner",
    eyebrow: "Affiliates and referral partners",
    title: "Partner program",
    body: "Review the compliance-first program, apply, complete onboarding and training, then manage approved links, attribution, commissions, statements, and payouts.",
    primary: { label: "Explore partner access", href: "/research/partners" },
    secondary: { label: "Partner application", href: "/research/partners/apply" },
  },
  {
    id: "supplier",
    eyebrow: "Suppliers, labs, and fulfillment partners",
    title: "Supplier access",
    body: "Invitation-only access for assigned fulfillment work, lot and COA evidence, shipment updates, tracking, delays, exceptions, and recalls.",
    primary: { label: "Supplier access", href: "/research/supplier-access" },
    secondary: { label: "Supplier support", href: "mailto:research@xeniostechnology.com?subject=Xenios%20supplier%20access" },
  },
  {
    id: "care",
    eyebrow: "Patients and authorized clinical teams",
    title: "Xenios Care",
    body: "A separate provider-governed pathway for eligibility, intake, appointments, prescriptions, and pharmacy coordination where legally available.",
    primary: { label: "Open Care", href: "/care" },
    secondary: { label: "Check eligibility", href: "/care/eligibility" },
  },
  {
    id: "private",
    eyebrow: "Invited early-access users",
    title: "Private Early Access",
    body: "Use the private invitation and ordering experience already provided to you by Xenios.",
    primary: { label: "Enter Private Early Access", href: "/research/early-access" },
    secondary: { label: "Get support", href: "/research/support" },
  },
] as const;

function Action({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  const className = primary ? "btn btn-primary" : "btn btn-secondary";
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
        description="Choose the Xenios Research access path that matches your approved role."
        path="/research/access-hub"
      />
      <ResearchPublicShell
        eyebrow="Access Xenios Research"
        title="One platform. The right workspace for every approved role."
        lead="Use one verified identity. Xenios resolves the memberships, organizations, partner relationships, supplier assignments, Care permissions, and administrative roles that are actually attached to your account."
      >
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {ACCESS_OPTIONS.map((option) => (
            <article className="card" key={option.id}>
              <p className="mono-label text-ink-mute">{option.eyebrow}</p>
              <h2 className="body-l font-700 mt-2">{option.title}</h2>
              <p className="body-s text-ink-2 mt-3">{option.body}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Action primary href={option.primary.href} label={option.primary.label} />
                <Action href={option.secondary.href} label={option.secondary.label} />
              </div>
            </article>
          ))}
        </div>

        <section className="card mt-6" aria-labelledby="one-account">
          <p className="mono-label text-ink-mute">Identity and privacy</p>
          <h2 id="one-account" className="body-l font-700 mt-2">One verified account, server-authorized workspaces.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[72ch]">
            The browser never chooses its own role. A signed-in person sees only the portals and data scopes resolved by Xenios from canonical server-side memberships, organization roles, partner status, supplier assignments, provider credentials, and admin authority.
          </p>
        </section>
      </ResearchPublicShell>
    </>
  );
}
