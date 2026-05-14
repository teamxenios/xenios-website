import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES } from "@/lib/content";

const PARAGRAPHS = [
  "Coaches, trainers, and practitioners are the people doing the work upstream of disease. They build athletes. They recover bodies. They restore hormones. They steward longevity. They hold a relationship that the legacy healthcare system has never been able to hold.",
  "And the tools they were given? A coaching app stitched to a billing platform stitched to an EMR stitched to an inbox. A spreadsheet for what is actually happening with the client. A founder coaching forty people from a phone in a parking lot.",
  "We do not buy the future of health from a chatbot. We do not buy it from another portal. We do not buy it from a wellness app pretending to be infrastructure.",
  "We buy it from the practitioner who knows the client by name, the coach who shows up at the meet, the clinician who gets the lab back at midnight and replies before sunrise. The work is human. The infrastructure should be honest.",
  "xenios is the AI-adjunct operations system for that practitioner. The xenios agent runs the back office. The xenios client agent holds the in-between. The voice is theirs. The judgment is theirs. The autonomy dial is theirs.",
  "We are not building another wellness app. We are building infrastructure as serious as the work.",
];

const BELIEFS = [
  { num: "01", title: "The relationship is the unit.", body: "The visit, the session, and the message are moments inside it. The operating system holds the relationship, not the moment." },
  { num: "02", title: "Voice and judgment first.", body: "The agent loads the practitioner's voice corpus and decision rules. It acts in their style, or it does not act." },
  { num: "03", title: "AI is an adjunct, not a replacement.", body: "Three modes per workflow per client: SUGGEST, DRAFT, AUTO-APPROVE. The dial is the practitioner's, always." },
  { num: "04", title: "Outcomes are the receipt.", body: "Engagement screenshots are not outcomes. We build the layer that proves the work." },
  { num: "05", title: "Coordination, not capture.", body: "The practitioner owns the relationship. We build the rails for them to refer, collaborate, and grow without leaving." },
];

export default function Manifesto() {
  return (
    <PageShell>
      <SeoHead {...PAGES.manifesto} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">MANIFESTO</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>Infrastructure as serious as the work.</h1>
      </section>

      <section className="container-x py-16 rule-top">
        <div className="space-y-6 max-w-[64ch]">
          {PARAGRAPHS.map((p, i) => (
            <p key={i} className="body-l text-ink-2">{p}</p>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-10 max-w-[24ch]">Five beliefs.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {BELIEFS.map((b) => (
            <div key={b.num} className="rule-all p-6 rounded-[12px]">
              <p className="mono-cap text-pulse mb-2">{b.num}</p>
              <h3 className="h3 mb-2">{b.title}</h3>
              <p className="body-m text-ink-2">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">If this is the work you are doing, build with us.</h2>
          <Link href="/waitlist" className="btn btn-primary btn-on-dark">Join the waitlist</Link>
        </div>
      </section>
    </PageShell>
  );
}
