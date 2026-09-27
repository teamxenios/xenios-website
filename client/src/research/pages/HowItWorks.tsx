import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { ResearchPublicShell } from "../ui/shells";

const researchSteps = [
  ["Request an order", "Choose the exact product and size, then send an order request."],
  ["We confirm availability", "We review the request and email your quote and payment details."],
  ["We verify payment", "We confirm your payment by hand before we release your order."],
  ["We send tracking", "We email your tracking when your order ships."],
] as const;

export default function HowItWorks() {
  return (
    <>
      <SeoHead
        title="How research orders work | Xenios"
        description="Four clear steps from a research order request to tracking."
        path="/research/how-it-works"
      />
      <ResearchPublicShell
        eyebrow="Research orders"
        title="How research orders work"
        lead="Research products are sold for research use only. There's no clinical review, and nothing here is medical advice."
      >
        <ol className="grid gap-4 mt-8" aria-label="Research order steps">
          {researchSteps.map(([title, body], index) => (
            <li className="card" key={title}>
              <p className="mono-label text-ink-mute">Step {String(index + 1).padStart(2, "0")}</p>
              <h2 className="body-l font-700 mt-2">{title}</h2>
              <p className="body-s text-ink-2 mt-3 max-w-[68ch]">{body}</p>
            </li>
          ))}
        </ol>

        <section className="grid gap-4 mt-10 md:grid-cols-2" aria-label="Payment and tracking">
          <article className="card">
            <p className="mono-label text-ink-mute">Payment</p>
            <h2 className="body-l font-700 mt-2">We send payment details after confirmation.</h2>
            <p className="body-s text-ink-2 mt-3">After we confirm your order, we email payment details. We verify every payment by hand before we release your order.</p>
          </article>
          <article className="card">
            <p className="mono-label text-ink-mute">Tracking</p>
            <h2 className="body-l font-700 mt-2">Tracking arrives when the order ships.</h2>
            <p className="body-s text-ink-2 mt-3">We email your tracking when your order ships.</p>
          </article>
        </section>

        <section className="card bg-paper-2 mt-10" aria-labelledby="research-care-separation">
          <p className="mono-label text-ink-mute">Separate pathways</p>
          <h2 id="research-care-separation" className="body-l font-700 mt-2">A research order never unlocks Care.</h2>
          <p className="body-s text-ink-2 mt-3 max-w-[68ch]">Ordering research products doesn't give you access to Care. Care starts with its own request.</p>
        </section>

        <section className="card mt-10" aria-labelledby="research-next-step">
          <p className="mono-label text-ink-mute">Next step</p>
          <h2 id="research-next-step" className="body-l font-700 mt-2">Explore products or check an existing request.</h2>
          <div className="mt-5 public-editorial-actions">
            <Link href="/products" className="btn btn-primary public-editorial-action">Explore Products</Link>
            <Link href="/status" className="btn btn-secondary public-editorial-action">Check Status</Link>
            <Link href="/research/support" className="btn btn-ghost public-editorial-action">Contact Support</Link>
          </div>
        </section>
      </ResearchPublicShell>
    </>
  );
}
