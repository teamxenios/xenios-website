import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, SURFACES } from "@/lib/content";

const WORKFLOWS = [
  { name: "Programming", body: "Build and version programs in your voice. Branch per client. Adapt to the wearable signal that came in this morning." },
  { name: "Inbox", body: "Unified across SMS, in-app, and email. The agent triages, drafts, and flags clinical or out-of-scope items for you." },
  { name: "Check-ins", body: "Daily, weekly, or on a cadence you define. The agent runs them, you read the summary, the client gets the response in your voice." },
  { name: "Billing", body: "Subscriptions, packages, one-offs, gift cards, affiliate splits, supplement and equipment storefront. Native, not bolted on." },
  { name: "Outcomes", body: "Adherence, progress, retention, and what is actually moving for each client. Reports you would actually send to a referring physician." },
  { name: "Network", body: "Refer between coaches, trainers, and practitioners. Bring your roster. Grow without leaving the operating system." },
];

export default function ForCoaches() {
  return (
    <PageShell>
      <SeoHead {...PAGES.forCoaches} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">{SURFACES.coach.eyebrow.toUpperCase()}</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }}>The operator you needed.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          {SURFACES.coach.body[0]}
        </p>
        <p className="mt-4 body-l text-ink-2 max-w-[60ch]">
          {SURFACES.coach.body[1]}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/waitlist" className="btn btn-primary">Join the waitlist</Link>
          <Link href="/how-it-works" className="btn btn-ghost">How it works</Link>
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-10 max-w-[26ch]">The work the xenios agent does for you.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {WORKFLOWS.map((w) => (
            <div key={w.name} className="rule-all p-6 rounded-[12px]" data-testid={`card-workflow-${w.name.toLowerCase()}`}>
              <h3 className="h3 mb-2">{w.name}</h3>
              <p className="body-m text-ink-2">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-6 max-w-[26ch]">Your voice. Measured.</h2>
        <p className="body-l text-ink-2 max-w-[62ch] mb-4">
          The xenios agent learns how you write, how you teach, and how you set boundaries. Voice fidelity is measured per coach, per client, per workflow.
        </p>
        <p className="body-l text-ink-2 max-w-[62ch]">
          You always see the draft first. You always set the autonomy. The agent never speaks for you outside the rails you set.
        </p>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[24ch]">Run the practice. Not the back office.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark">Join the waitlist</Link>
        </div>
      </section>
    </PageShell>
  );
}
