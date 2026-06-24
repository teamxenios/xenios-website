import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import Counter from "@/components/Counter";

const STACK_ITEMS = [
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

const MODULES = [
  { title: "One inbox", body: "Client messages, check-ins, reminders, and follow-ups land in one queue instead of five tabs." },
  { title: "One client record", body: "Goals, history, notes, programs, context, and progress stay attached to the person, not scattered across tools." },
  { title: "Xen drafts in your voice", body: "The professional-facing agent prepares the check-in, reply, or next action. You approve before it reaches the client." },
  { title: "The Studio", body: "The Client Attention Queue shows who needs you today, why they were flagged, and what action is ready for review." },
  { title: "Hercules", body: "The weekly check-in engine prepares client updates in your voice, grounded in each client's actual week." },
  { title: "Approval gate", body: "Nothing client-facing goes out unless the coach approves it. The AI drafts. The coach decides." },
];

const AUDIENCES = [
  "Personal trainers",
  "Strength coaches",
  "Health coaches",
  "Dietitians",
  "Longevity clinics",
  "Performance teams",
  "High-touch coaching businesses",
];

const TRUST = [
  { label: "Founder-market fit", body: "Built from the daily reality of coaching, performance work, and client-based health relationships." },
  { label: "Senior technical depth", body: "Engineering leadership with healthcare and payments infrastructure experience behind prior exits." },
  { label: "Medical judgment nearby", body: "Clinical leadership informs how xenios handles boundaries, sensitive context, and future care workflows." },
  { label: "Founding cohort motion", body: "The first version is being shaped with serious coaches before broad release." },
];

export default function Home() {
  return (
    <PageShell>
      <SeoHead
        title="xenios | The operating system for proactive health"
        description="The professional stays in front. Xen and Athena carry the work behind them."
        path="/"
      />

      <section className="container-x" style={{ paddingTop: "var(--space-hero-top)", paddingBottom: "var(--space-hero-bottom)" }}>
        <p className="mono-cap text-pulse mb-6">The AI drafts. The coach decides.</p>
        <h1 className="display-xl text-balance max-w-[15ch]" data-testid="text-headline">
          The AI workspace for serious coaches.
        </h1>
        <p className="mt-8 body-l text-ink-2 max-w-[62ch]">
          xenios gives health and performance professionals one place to manage client context, follow-up, check-ins, drafts, and the work that usually falls through the cracks.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <Link href="/waitlist" className="btn btn-primary" data-testid="button-hero-waitlist">Request Early Access</Link>
          <Link href="/how-it-works" className="btn btn-ghost" data-testid="button-hero-how-it-works">See How It Works</Link>
        </div>
        <div className="mt-8">
          <Counter variant="line" suffix="on the waitlist" />
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-6">THE PROBLEM</p>
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20 items-start">
          <div>
            <h2 className="display-m text-balance max-w-[16ch]">Coaching breaks when attention breaks.</h2>
            <p className="mt-8 body-l text-ink-2 max-w-[58ch]">
              Most coaches do not need another app. They need the scattered parts of the practice to become one calm command center.
            </p>
          </div>
          <div className="rule-all rounded-[18px] p-6 md:p-8 bg-paper">
            <p className="mono-cap text-ink-mute mb-5">What xenios replaces</p>
            <div className="flex flex-wrap gap-2">
              {STACK_ITEMS.map((item) => (
                <span key={item} className="chip text-ink-2">{item}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-6">THE WORKSPACE</p>
        <h2 className="display-m text-balance max-w-[18ch]">One inbox. One client record. One agent that drafts in your voice.</h2>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {["One inbox", "One client record", "One agent"].map((title, index) => (
            <div key={title} className="rule-all rounded-[16px] p-6 bg-paper" data-testid={`home-promise-${index}`}>
              <p className="mono-cap text-pulse mb-3">0{index + 1}</p>
              <h3 className="h3 mb-3">{title}</h3>
              <p className="body-m text-ink-2">
                {index === 0 && "All client attention in one place."}
                {index === 1 && "Every note, goal, and signal attached to the person."}
                {index === 2 && "Drafts prepared in your voice, waiting for approval."}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <p className="mono-cap text-ink-mute mb-6">CORE MODULES</p>
            <h2 className="display-m max-w-[18ch]">The operating pieces behind the relationship.</h2>
          </div>
          <Link href="/product" className="btn btn-secondary">View Product</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MODULES.map((module) => (
            <article key={module.title} className="rule-all rounded-[16px] p-6 bg-paper" data-testid={`home-module-${module.title.replace(/[^a-z]+/gi, "-").toLowerCase()}`}>
              <h3 className="h3 mb-3">{module.title}</h3>
              <p className="body-m text-ink-2">{module.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-6">WHO IT IS FOR</p>
        <h2 className="display-m text-balance max-w-[20ch]">Built for professionals who run real client relationships.</h2>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-4">
          {AUDIENCES.map((audience) => (
            <div key={audience} className="flex items-center gap-3 body-l text-ink-2">
              <span aria-hidden="true" className="bg-orange-fire shrink-0" style={{ width: 7, height: 7, borderRadius: 9999 }} />
              {audience}
            </div>
          ))}
        </div>
      </section>

      <section className="container-x section-y rule-top">
        <p className="mono-cap text-ink-mute mb-6">WHY TRUST IT</p>
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20">
          <div>
            <h2 className="display-m max-w-[18ch]">Human relationship first. Automation second.</h2>
            <p className="mt-8 body-l text-ink-2 max-w-[58ch]">
              xenios is designed around professional judgment. Athena is always disclosed as AI and always under the coach. Xen prepares work for review. The professional stays in front.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {TRUST.map((item) => (
              <div key={item.label} className="rule-all rounded-[14px] p-5">
                <p className="mono-cap text-pulse mb-3">{item.label}</p>
                <p className="body-m text-ink-2">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <p className="mono-cap text-paper/60 mb-5">EARLY ACCESS</p>
          <h2 className="display-m text-paper mb-6 max-w-[22ch]">Help shape the workspace before broad release.</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/waitlist" className="btn btn-primary btn-on-dark">Apply for Early Access</Link>
            <Link href="/how-it-works" className="btn btn-ghost-on-dark">See How It Works</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
