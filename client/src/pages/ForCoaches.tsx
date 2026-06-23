import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";

const PAINS = [
  "Scattered client context",
  "Inconsistent follow-up",
  "Admin fatigue",
  "Missed check-ins",
  "Manual notes",
  "Fear of dropping client details",
];

const DAY = [
  { title: "Morning triage", body: "Open the Studio and see who needs attention before the day gets noisy." },
  { title: "Client check-ins", body: "Hercules prepares weekly check-ins in your voice, grounded in the client's actual week." },
  { title: "Program changes", body: "Adjust training, nutrition, or habit work from the same client record instead of another tab." },
  { title: "Follow-up drafting", body: "Xen drafts the response and shows the reason, source, and next action for review." },
  { title: "Evening review", body: "Approve what should go out, leave what needs judgment, and keep the relationship human." },
];

const USE_CASES = [
  { title: "Missed check-in", body: "The client does not respond. xenios flags it, drafts a calm follow-up, and keeps the context attached." },
  { title: "Stalled progress", body: "Weight, performance, or adherence stalls. Xen prepares a summary and a next-step draft for your review." },
  { title: "Client asks a question", body: "The question lands in the unified inbox with client context and a draft that follows your method." },
  { title: "Wearable signal changes", body: "Sleep, recovery, or adherence shifts. The record updates and the Studio shows whether action is needed." },
  { title: "Low adherence", body: "xenios surfaces the pattern before the relationship goes cold." },
  { title: "Program adjustment", body: "The program change, reason, and client message stay connected on one record." },
];

export default function ForCoaches() {
  return (
    <PageShell>
      <SeoHead
        title="For Coaches, xenios"
        description="xenios helps high-touch coaches manage more clients without losing the human relationship. The AI drafts, the coach decides."
        path="/for-coaches"
      />

      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">FOR COACHES</p>
        <h1 className="display-xl text-balance max-w-[16ch]">Scale the relationship, not the admin.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[62ch]">
          xenios is built for coaches managing 15 to 40 or more clients across texts, spreadsheets, programming tools, notes, and check-in forms. It keeps the relationship in front and the busywork behind you.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <Link href="/waitlist" className="btn btn-primary">Apply for Early Access</Link>
          <Link href="/how-it-works" className="btn btn-ghost">View How It Works</Link>
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-6">THE PAIN</p>
        <h2 className="display-m max-w-[22ch] mb-10">The quality ceiling usually shows up before the client count does.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PAINS.map((pain) => (
            <div key={pain} className="rule-all rounded-[14px] p-5 body-l text-ink-2">{pain}</div>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-6">A DAY IN THE LIFE</p>
        <div className="space-y-6">
          {DAY.map((item, index) => (
            <article key={item.title} className="grid grid-cols-1 md:grid-cols-[110px_1fr] gap-5 rule-all rounded-[16px] p-6 md:p-8">
              <p className="mono-cap text-pulse">0{index + 1}</p>
              <div>
                <h2 className="display-s mb-3">{item.title}</h2>
                <p className="body-l text-ink-2 max-w-[62ch]">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20 items-start">
          <div>
            <p className="mono-cap text-ink-mute mb-6">RELATIONSHIP PRESERVATION</p>
            <h2 className="display-m max-w-[18ch]">The coach stays in front.</h2>
            <p className="mt-8 body-l text-ink-2 max-w-[58ch]">
              xenios does not pretend to be the coach. Xen prepares drafts and summaries. Athena is always disclosed as AI. You set the boundary, review the work, and decide what reaches the client.
            </p>
          </div>
          <div className="rule-all rounded-[18px] p-6 md:p-8 bg-paper">
            <p className="quote-lead text-ink mb-6">The AI drafts. The coach decides.</p>
            <p className="body-l text-ink-2">
              That is the operating rule for every client-facing workflow in version one.
            </p>
          </div>
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-6">USE CASES</p>
        <h2 className="display-m max-w-[24ch] mb-10">Specific moments where attention usually breaks.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {USE_CASES.map((useCase) => (
            <article key={useCase.title} className="rule-all rounded-[16px] p-6">
              <h3 className="h3 mb-3">{useCase.title}</h3>
              <p className="body-m text-ink-2">{useCase.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-6">FOUNDING COACH SIGNALS</p>
        <h2 className="display-m max-w-[24ch] mb-8">What we are testing with the first coaches.</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            "Can a coach review a full roster faster without losing judgment?",
            "Can weekly check-ins sound like the actual coach, not generic AI?",
            "Can the Client Attention Queue prevent clients from slipping through the cracks?",
          ].map((item) => (
            <div key={item} className="rule-all rounded-[16px] p-6 body-l text-ink-2">{item}</div>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[24ch]">Join the founding coach cohort.</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark">Apply for Early Access</Link>
            <Link href="/careers/founding-coach-cohort" className="btn btn-ghost-on-dark">Founding Coach Cohort</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
