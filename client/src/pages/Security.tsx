import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { SITE } from "@/lib/content";

const POSTURE = [
  { name: "Data handling", body: "Client context is treated as sensitive business and health-adjacent data. The record is designed to keep access scoped to the professional and approved team members." },
  { name: "AI access boundaries", body: "Xen can reference approved client context to prepare drafts. Athena is disclosed as AI and stays under the professional's boundaries." },
  { name: "Approval before delivery", body: "Version one keeps client-facing output behind professional review. The AI drafts. The coach decides." },
  { name: "Encryption", body: "TLS in transit and encryption at rest through infrastructure providers. Technical details are available during security review." },
  { name: "Access control", body: "Role-based access, scoped accounts, and audit-oriented workflows are part of the product posture." },
  { name: "Incident response", body: "Security issues should be sent directly to the team. We prioritize rapid review, containment, and clear communication." },
];

const DATA_FLOW = [
  "Client messages, check-ins, notes, and signals enter the workspace.",
  "The client record keeps context attached to the person and the professional relationship.",
  "Xen prepares drafts, summaries, or next actions from approved context.",
  "The professional reviews before anything client-facing is delivered.",
  "Actions, edits, and updates are retained as part of the operating record.",
];

const RIGHTS = ["Request access", "Request export", "Request deletion", "Ask how data is used", "Escalate a security concern"];

export default function Security() {
  return (
    <PageShell>
      <SeoHead
        title="Security, xenios"
        description="xenios treats client context and AI boundaries as product responsibilities, with scoped access, approval gates, and a security-first posture."
        path="/security"
      />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">SECURITY</p>
        <h1 className="display-xl text-balance max-w-[18ch]">Trust is a product requirement.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[62ch]">
          xenios is built for professionals who hold real client relationships. Security is not a badge on the footer. It is part of how data, AI access, and approval gates are designed.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <Link href="/contact" className="btn btn-primary">Talk to the Team</Link>
          <Link href="/privacy" className="btn btn-ghost">Read Privacy Approach</Link>
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">SECURITY POSTURE</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {POSTURE.map((p) => (
            <div key={p.name} className="rule-all p-6 rounded-[16px]" data-testid={`card-${p.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-3">{p.name}</h3>
              <p className="body-m text-ink-2">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20">
          <div>
            <p className="mono-cap text-ink-mute mb-6">DATA FLOW</p>
            <h2 className="display-m max-w-[18ch]">Plain-language architecture.</h2>
            <p className="mt-8 body-l text-ink-2 max-w-[58ch]">
              The goal is to make data movement understandable to a solo coach and substantive enough for a compliance reviewer.
            </p>
          </div>
          <div className="rule-all rounded-[18px] p-6 md:p-8 bg-paper">
            <div className="space-y-5">
              {DATA_FLOW.map((item, index) => (
                <div key={item} className="grid grid-cols-[34px_1fr] gap-3">
                  <span className="mono-cap text-pulse">0{index + 1}</span>
                  <p className="body-m text-ink-2">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-6">CLIENT DATA RIGHTS</p>
        <h2 className="display-m max-w-[20ch] mb-8">Requests should be simple and visible.</h2>
        <div className="flex flex-wrap gap-3">
          {RIGHTS.map((right) => <span key={right} className="chip text-ink-2">{right}</span>)}
        </div>
      </section>

      <section className="container-x py-16 rule-top">
        <p className="mono-cap text-ink-mute mb-4">RESPONSIBLE DISCLOSURE</p>
        <p className="body-l text-ink-2 max-w-[60ch]">
          Found something? Email security@xeniostechnology.com or {SITE.email} with the subject prefix [Security].
        </p>
      </section>
    </PageShell>
  );
}
