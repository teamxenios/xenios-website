import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";
import "./public-editorial.css";

const POLICY_ENTRIES = [
  {
    title: "Research Use Policy",
    href: "/research/policies/research-use",
    status: "Served Research-use document",
    body: "The served Research-use boundaries, prohibited uses, review expectations, and permitted support topics.",
  },
  {
    title: "Privacy Policy",
    href: "/research/privacy",
    status: "Operational draft",
    body: "The current source explicitly identifies this language as pending alignment with actual vendors and data flows.",
  },
  {
    title: "Terms of Service",
    href: "/research/terms",
    status: "Operational draft",
    body: "The current source explicitly identifies this language as pending qualified review or approval.",
  },
  {
    title: "Shipping Policy",
    href: "/research/policies/shipping",
    status: "Publication status unconfirmed",
    body: "Readable for review, but the source does not provide authoritative approval metadata and includes starter operating assumptions.",
  },
  {
    title: "Returns and Replacements",
    href: "/research/policies/returns",
    status: "Publication status unconfirmed",
    body: "Readable for review, but the source does not provide authoritative approval metadata. This index does not present it as final.",
  },
] as const;

export default function PoliciesIndex() {
  return (
    <>
      <SeoHead
        title="Research policies | Xenios Research"
        description="Find the public Xenios Research-use, privacy, terms, shipping, and returns documents with their current publication status shown plainly."
        path="/research/policies"
      />
      <ResearchPublicShell
        eyebrow="Policies and documentation"
        title="Read the document—and its status."
        lead="A document can be visible without being approved for acceptance or final reliance. This index preserves that distinction instead of treating publication as authority."
      >
        <section className="grid gap-4 mt-8" aria-label="Research policy documents">
          {POLICY_ENTRIES.map((entry) => (
            <article className="card" key={entry.href}>
              <p className="mono-label text-ink-mute">{entry.status}</p>
              <h2 className="body-l font-700 mt-2">{entry.title}</h2>
              <p className="body-s text-ink-2 mt-3 max-w-[68ch]">{entry.body}</p>
              <div className="mt-5 public-editorial-actions">
                <Link href={entry.href} className="btn btn-secondary public-editorial-action">
                  Read {entry.title}
                </Link>
              </div>
            </article>
          ))}
        </section>

        <aside className="card bg-paper-2 mt-8" aria-labelledby="policy-help">
          <h2 id="policy-help" className="body-l font-700">Need a document for review?</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[64ch]">
            Research Support can help locate the current public source. Support cannot declare draft or
            status-unconfirmed language approved, and this page does not collect acceptance.
          </p>
          <div className="mt-5 public-editorial-actions">
            <Link href="/research/contact" className="btn btn-primary public-editorial-action">Contact Research</Link>
          </div>
        </aside>
      </ResearchPublicShell>
    </>
  );
}
