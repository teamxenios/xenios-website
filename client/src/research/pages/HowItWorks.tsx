import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import { PublicBoundaryNote } from "./PublicEditorialNav";

const journey = [
  {
    title: "Choose Care or Research",
    body: "Use Care for personal health. Use Research for legitimate nonclinical work.",
  },
  {
    title: "Create or verify your account",
    body: "Care confirms identity and current location. Research verifies its own membership, agreements, and access requirements.",
  },
  {
    title: "Complete the required information",
    body: "Care collects the health history needed for clinical review. Research presents exact product identity, documentation, and Research-use requirements.",
  },
  {
    title: "Receive the appropriate review",
    body: "A U.S.-licensed clinician reviews Care. Research actions are governed by Product Control, documentation, availability, and account authority.",
  },
  {
    title: "Continue only when authorized",
    body: "A clinician may prescribe when clinically appropriate. A pharmacy may fulfill when serviceable. A Research request or order proceeds only when its own gates pass.",
  },
  {
    title: "Follow status and support",
    body: "Use the appropriate account, provider, pharmacy, Research, and support sources for updates, documents, tracking, follow-up, and exceptions.",
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
    title: "Xenios Care",
    body: "Create an account, complete your health intake, and continue to independent clinical review. No questionnaire, product interest, or payment guarantees a prescription.",
    href: "/care",
    label: "Begin clinical intake",
  },
  {
    title: "Xenios Research",
    body: "Review exact products, variants, evidence, documentation, and Research-only access without turning a Research listing into personal medical guidance.",
    href: "/research/access-hub",
    label: "Explore Research",
  },
  {
    title: "Organizations and partners",
    body: "Organizations, affiliates, suppliers, and strategic partners begin with context, eligibility, compliance, and human review.",
    href: "/research/support",
    label: "Ask about partnership access",
  },
] as const;

export default function HowItWorks() {
  return (
    <>
      <SeoHead
        title="How Xenios Care + Research works"
        description="See the separate journeys for provider-guided Care and legitimate nonclinical Research access, from account and intake to review, fulfillment, documentation, and support."
        path="/research/how-it-works"
      />
      <ResearchPublicShell
        eyebrow="How Xenios works"
        title="Two pathways. Clear authority at every step."
        lead="Care and Research may share account, status, and support infrastructure, but they do not share clinical authority, product-use claims, prescribing, or fulfillment rules."
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
          <h2 id="pathway-choices" className="display-s mt-2">One platform, separate authorities.</h2>
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
          <h2 id="how-next" className="body-l font-700 mt-2">Choose Care or Research.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
            Begin with the pathway that matches your need. Each source remains responsible for its own decisions and status.
          </p>
          <div className="mt-5 public-editorial-actions">
            <Link href="/care" className="btn btn-primary public-editorial-action">Begin clinical intake</Link>
            <Link href="/research/access-hub" className="btn btn-secondary public-editorial-action">Explore Research</Link>
          </div>
        </section>
      </ResearchPublicShell>
    </>
  );
}
