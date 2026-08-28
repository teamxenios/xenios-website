import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { PublicBoundaryNote } from "./PublicEditorialNav";

const journey = [
  {
    title: "Choose a pathway",
    body: "Start with Research, private Early Access, Care, an organization, a partner relationship, supplier access, or support. Do not force a clinical need through a Research workflow.",
  },
  {
    title: "Verify access",
    body: "Sign in or follow the applicable review process. Membership, organization roles, partner status, supplier assignments, and administrative authority are resolved by the server.",
  },
  {
    title: "Review exact facts",
    body: "Confirm exact product and variant identity, format, documentation status, access state, and any current action before submitting a request.",
  },
  {
    title: "Request through the authorized path",
    body: "A live action, assisted request, availability inquiry, provider handoff, documentation-pending state, hold, or unavailable state each behaves differently.",
  },
  {
    title: "Complete required review",
    body: "Provide only the contact, shipping, and acknowledgments required by the selected workflow. A submitted request is not called an order or a successful payment unless durable evidence supports it.",
  },
  {
    title: "Follow source-aware status",
    body: "Account views are designed to separate requests, orders, payment, refunds, fulfillment, tracking, Care availability, documents, and support. A missing source must remain unknown or unavailable.",
  },
] as const;

const qualityFlow = [
  "Receive and inspect",
  "Capture exact SKU and lot",
  "Quarantine pending review",
  "Review applicable documents",
  "Record testing where applicable",
  "Release, hold, or mark unavailable",
  "Pick, pack, ship, and track only from durable evidence",
] as const;

const pathwayCards = [
  {
    title: "Research customer",
    body: "Review the Research-use boundary, authenticate where required, inspect the exact offering, and use the action currently authorized.",
    href: "/research/access-hub",
    label: "Review Research access",
  },
  {
    title: "Provider-governed Care",
    body: "Use the Care experience for scheduling and provider review. Scheduling does not guarantee treatment, a prescription, or pharmacy fulfillment.",
    href: "/care",
    label: "Understand Care",
  },
  {
    title: "Organization or partner",
    body: "Begin with context, eligibility, and human review. A relationship inquiry does not automatically create an account or commercial approval.",
    href: "/research/support",
    label: "Ask about partner access",
  },
] as const;

export default function HowItWorks() {
  return (
    <>
      <SeoHead
        title="How Xenios Research works"
        description="Understand the Xenios Research journey from access selection and exact product review to truthful request, order, document, and support status."
        path="/research/how-it-works"
      />
      <ResearchPublicShell
        eyebrow="How it works"
        title="From first question to a defensible next action."
        lead="Every step is designed to preserve the difference between interest, access, a request, an order, payment, fulfillment, Care, and completion."
      >
        <ol className="grid gap-4 mt-8" aria-label="Xenios Research journey">
          {journey.map((step, index) => (
            <li className="card" key={step.title}>
              <p className="mono-label text-ink-mute">Step {String(index + 1).padStart(2, "0")}</p>
              <h2 className="body-l font-700 mt-2">{step.title}</h2>
              <p className="body-s text-ink-2 mt-3 max-w-[68ch]">{step.body}</p>
            </li>
          ))}
        </ol>

        <section className="mt-10" aria-labelledby="pathway-choices">
          <p className="mono-label text-ink-mute">Common pathways</p>
          <h2 id="pathway-choices" className="display-s mt-2">The same platform, different authorities.</h2>
          <div className="grid gap-4 mt-6 public-editorial-grid">
            {pathwayCards.map((pathway) => (
              <article className="card flex flex-col" key={pathway.title}>
                <h3 className="body-l font-700">{pathway.title}</h3>
                <p className="body-s text-ink-2 mt-3">{pathway.body}</p>
                <div className="mt-5" style={{ marginTop: "auto", paddingTop: 20 }}>
                  <Link href={pathway.href} className="btn btn-secondary public-editorial-action">{pathway.label}</Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="card bg-paper-2 mt-10" aria-labelledby="quality-flow">
          <p className="mono-label text-ink-mute">Quality checkpoint model</p>
          <h2 id="quality-flow" className="body-l font-700 mt-2">A checkpoint is not a claim.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
            This intended checkpoint sequence makes status easier to evaluate. It does not imply that every offering has completed every checkpoint or received every kind of test.
          </p>
          <ol className="mt-5 grid gap-2">
            {qualityFlow.map((step, index) => (
              <li className="flex gap-3 items-start" key={step}>
                <span className="mono-label text-ink-mute" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="body-s text-ink-2">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-10">
          <PublicBoundaryNote />
        </div>

        <section className="card mt-10" aria-labelledby="how-next">
          <p className="mono-label text-ink-mute">Ready to continue</p>
          <h2 id="how-next" className="body-l font-700 mt-2">Begin at the Access Hub.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
            The hub explains who each route is for, what is available now, and what happens after you continue.
          </p>
          <div className="mt-5 public-editorial-actions">
            <Link href="/research/access-hub" className="btn btn-primary public-editorial-action">Choose an access path</Link>
            <Link href="/research/faq" className="btn btn-secondary public-editorial-action">Read the FAQ</Link>
          </div>
        </section>
      </ResearchPublicShell>
    </>
  );
}
