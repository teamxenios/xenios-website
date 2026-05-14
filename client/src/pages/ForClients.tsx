import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { PAGES, SURFACES } from "@/lib/content";

const PROMISES = [
  { name: "Pocket coach", body: "Knows your program, your data, your goals, and the way your coach actually talks to you." },
  { name: "Real answers", body: "Asks before it acts. Explains the why. Never invents a clinical opinion. Hands the hard stuff back to your coach, every time." },
  { name: "Accountability that fits", body: "Reminds without nagging. Adapts to the day you are having, not the day the program assumed." },
  { name: "Education on time", body: "The right lesson at the right moment. The kind your coach would have sent if they had the bandwidth." },
  { name: "One place", body: "Today's session, your messages, your reorder, your check-in, your data. Not seven apps." },
  { name: "Your privacy, defended", body: "Your coach owns the relationship. We do not sell your data. We do not train third-party models on it." },
];

export default function ForClients() {
  return (
    <PageShell>
      <SeoHead {...PAGES.forClients} />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">{SURFACES.client.eyebrow.toUpperCase()}</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }}>A pocket coach that knows you.</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">{SURFACES.client.body[0]}</p>
        <p className="mt-4 body-l text-ink-2 max-w-[60ch]">{SURFACES.client.body[1]}</p>
      </section>

      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-10 max-w-[26ch]">What the xenios client agent promises.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PROMISES.map((p) => (
            <div key={p.name} className="rule-all p-6 rounded-[12px]" data-testid={`card-promise-${p.name.replace(/\s+/g, "-").toLowerCase()}`}>
              <h3 className="h3 mb-2">{p.name}</h3>
              <p className="body-m text-ink-2">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-20 rule-top">
        <h2 className="display-m mb-6 max-w-[26ch]">It is not a chatbot. It is your coach's reach.</h2>
        <p className="body-l text-ink-2 max-w-[62ch]">
          Every word the xenios client agent says is built from the way your coach actually works. When something is outside scope, it stops talking and gets your coach. That is the rule, not the exception.
        </p>
      </section>

      <section className="bg-ink text-paper py-20">
        <div className="container-x">
          <h2 className="display-m text-paper mb-6 max-w-[26ch]">Ask your coach about xenios</h2>
          <Link href="/contact" className="btn btn-primary btn-on-dark">Talk to us</Link>
        </div>
      </section>
    </PageShell>
  );
}
