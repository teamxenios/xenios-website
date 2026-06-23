import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";

const MODULES = [
  { title: "Unified inbox", body: "SMS, email, in-app messages, check-ins, and reminders collapse into one client attention queue." },
  { title: "Client record", body: "Every goal, note, program, message, and signal attaches to the person so context does not reset every week." },
  { title: "Xen drafting", body: "Xen prepares the reply, check-in, or next action in your voice. You approve before it reaches the client." },
  { title: "Hercules", body: "The weekly check-in engine prepares client updates with source context, progress, blockers, and next steps." },
  { title: "The Studio", body: "The Client Attention Queue shows who needs attention today, why, what supports it, and what action is ready." },
  { title: "Follow-up automation", body: "Scheduled and adaptive follow-ups stay visible, reviewable, and attached to each client record." },
];

const DAY_FLOW = [
  { time: "Morning", title: "Triage the roster", body: "Open the Studio and see who needs attention, why they were flagged, and what is already prepared." },
  { time: "Midday", title: "Review check-ins", body: "Hercules summarizes each weekly check-in and drafts the response in your voice." },
  { time: "Afternoon", title: "Adjust the work", body: "Programs, follow-ups, and client notes update on the record instead of living in another spreadsheet." },
  { time: "Evening", title: "Approve what ships", body: "You edit, approve, or reject. The AI drafts. The coach decides." },
];

const TIMELINE = [
  "Client sends an update or misses a check-in.",
  "A check-in, note, or wearable signal reaches the client record.",
  "Xen flags the client inside the Studio with the source and reason.",
  "A draft reply or next action is prepared in the coach's voice.",
  "The coach reviews, edits, approves, or rejects.",
  "The approved message is sent and the client record is updated.",
];

const REPLACEMENTS = [
  "Gmail",
  "SMS",
  "Spreadsheets",
  "Notion",
  "Trainerize",
  "TrueCoach",
  "Calendly",
  "Stripe",
  "Manual notes",
  "CRM",
  "Habit tracker",
  "Check-in forms",
  "Community tools",
];

export default function Product() {
  return (
    <PageShell>
      <SeoHead
        title="Product, xenios"
        description="See how xenios works across one inbox, one client record, AI drafting, weekly check-ins, and the Client Attention Queue."
        path="/product"
      />

      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">PRODUCT</p>
        <h1 className="display-xl text-balance max-w-[16ch]">One operating system for the coach's day.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[62ch]">
          xenios turns the scattered coaching stack into one workspace: inbox, client record, AI drafts, weekly check-ins, and a queue that tells you who needs your attention.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <Link href="/book" className="btn btn-primary">Book a Product Walkthrough</Link>
          <Link href="/waitlist" className="btn btn-ghost">Join the Founding Cohort</Link>
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-6">A DAY INSIDE XENIOS</p>
        <div className="space-y-6">
          {DAY_FLOW.map((step, index) => (
            <article key={step.title} className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-5 rule-all rounded-[16px] p-6 md:p-8 bg-paper">
              <div>
                <p className="mono-cap text-pulse">0{index + 1}</p>
                <p className="mono-cap text-ink-mute mt-2">{step.time}</p>
              </div>
              <div>
                <h2 className="display-s mb-3">{step.title}</h2>
                <p className="body-l text-ink-2 max-w-[62ch]">{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-6">MODULES</p>
        <h2 className="display-m mb-10 max-w-[20ch]">The product surfaces that make the workflow real.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MODULES.map((module) => (
            <article key={module.title} className="rule-all p-6 md:p-8 rounded-[16px] bg-paper" data-testid={`card-product-${module.title.replace(/[^a-z]+/gi, "-").toLowerCase()}`}>
              <h3 className="h3 mb-3">{module.title}</h3>
              <p className="body-m text-ink-2">{module.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20 items-start">
          <div>
            <p className="mono-cap text-ink-mute mb-6">CLIENT TIMELINE</p>
            <h2 className="display-m max-w-[18ch]">From signal to approved action.</h2>
            <p className="mt-8 body-l text-ink-2 max-w-[56ch]">
              xenios does not hide the process. It shows why a client was flagged, what source supports it, and what draft needs your judgment.
            </p>
          </div>
          <div className="rule-all rounded-[18px] p-6 md:p-8 bg-paper">
            <div className="space-y-5">
              {TIMELINE.map((item, index) => (
                <div key={item} className="grid grid-cols-[38px_1fr] gap-4">
                  <span className="mono-cap text-pulse">0{index + 1}</span>
                  <p className="body-m text-ink-2">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-6">VOICE PRESERVATION</p>
        <h2 className="display-m mb-8 max-w-[20ch]">Drafts that stay under your control.</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: "Your method", body: "Xen learns from your prior messages, programs, content, and edits so the draft follows your way of coaching." },
            { title: "Your approval", body: "Drafts are reviewed before delivery. You can approve, edit, or reject without losing the context." },
            { title: "Your boundaries", body: "The agent does not diagnose, prescribe, or step outside the rails you set." },
          ].map((item) => (
            <article key={item.title} className="rule-all rounded-[16px] p-6">
              <h3 className="h3 mb-3">{item.title}</h3>
              <p className="body-m text-ink-2">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <p className="mono-cap text-ink-mute mb-6">REPLACEMENT MAP</p>
        <h2 className="display-m mb-8 max-w-[24ch]">The stack you retire when the workspace holds the relationship.</h2>
        <div className="flex flex-wrap gap-2">
          {REPLACEMENTS.map((item) => (
            <span key={item} className="chip text-ink-2 line-through opacity-75">{item}</span>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[24ch]">Walk through it with your own practice in mind.</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/book" className="btn btn-primary btn-on-dark">Book a Product Walkthrough</Link>
            <Link href="/waitlist" className="btn btn-ghost-on-dark">Join the Founding Cohort</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
