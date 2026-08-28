import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { PublicBoundaryNote } from "./PublicEditorialNav";

const operatingPrinciples = [
  {
    title: "One exact identity",
    body: "A product and its exact variant, strength, format, lot, and documents stay distinct. Similar language never authorizes a guessed match.",
  },
  {
    title: "One honest status",
    body: "Available, request-only, held, documentation-pending, provider-required, unavailable, and unknown each produce a different next action.",
  },
  {
    title: "One accountable handoff",
    body: "Requests, orders, payment, fulfillment, support, and Care remain connected without pretending that one stage proves another.",
  },
] as const;

const platformLayers = [
  ["Discover", "Understand the offering, the evidence boundary, and the available access paths."],
  ["Review", "Evaluate exact identity, status, documentation, and the action currently authorized."],
  ["Operate", "Give customers and operators source-aware order, fulfillment, document, and support information."],
  ["Return", "Make account access, repeat requests, support, and partner attribution coherent over time."],
] as const;

export default function AboutResearch() {
  return (
    <>
      <SeoHead
        title="About Xenios Research"
        description="Learn why Xenios Research combines clear product identity, documentation context, truthful access states, and human operations."
        path="/research/about"
      />
      <ResearchPublicShell
        eyebrow="About Xenios Research"
        title="A more accountable way to navigate research access."
        lead="Xenios Research is the product-access and operating layer of the broader Xenios platform. It is designed to help legitimate customers understand what exists, what is known, what remains unavailable, and what they can truthfully do next."
      >
        <section className="mt-8" aria-labelledby="about-purpose">
          <p className="mono-label text-ink-mute">Why it exists</p>
          <h2 id="about-purpose" className="display-s mt-2">Clarity across the full relationship.</h2>
          <div className="grid gap-4 mt-6 public-editorial-grid">
            {platformLayers.map(([title, body]) => (
              <article className="card" key={title}>
                <h3 className="body-l font-700">{title}</h3>
                <p className="body-s text-ink-2 mt-3">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="about-principles">
          <p className="mono-label text-ink-mute">Operating principles</p>
          <h2 id="about-principles" className="display-s mt-2">Trust is built in the details.</h2>
          <div className="grid gap-4 mt-6">
            {operatingPrinciples.map((principle, index) => (
              <article className="card" key={principle.title}>
                <p className="mono-label text-ink-mute">0{index + 1}</p>
                <h3 className="body-l font-700 mt-2">{principle.title}</h3>
                <p className="body-s text-ink-2 mt-3 max-w-[68ch]">{principle.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card mt-10" aria-labelledby="about-stage">
          <p className="mono-label text-ink-mute">Current stage</p>
          <h2 id="about-stage" className="body-l font-700 mt-2">Evolving from founder-run operations toward a broader platform.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[68ch]">
            Xenios is moving from founder-run Early Access operations toward a larger platform. Which workflows are
            available depends on current configuration and durable authority; others may require human review or remain
            disabled until documentation, credentials, legal approval, or external configuration is complete. The
            experience should make those distinctions visible instead of hiding them.
          </p>
        </section>

        <div className="mt-10">
          <PublicBoundaryNote />
        </div>

        <section className="card mt-10" aria-labelledby="about-next">
          <p className="mono-label text-ink-mute">Your next step</p>
          <h2 id="about-next" className="body-l font-700 mt-2">Choose the relationship that fits.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
            Individual Research access, private Early Access, Care, organizations, affiliates, suppliers, and support each begin differently.
          </p>
          <div className="mt-5 public-editorial-actions">
            <Link href="/research/access-hub" className="btn btn-primary public-editorial-action">Open the Access Hub</Link>
            <Link href="/research/how-it-works" className="btn btn-secondary public-editorial-action">See how it works</Link>
          </div>
        </section>
      </ResearchPublicShell>
    </>
  );
}
