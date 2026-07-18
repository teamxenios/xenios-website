import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import SeoHead from "@/components/SeoHead";
import { NoticeBar, PageIntro } from "../components";

const STEPS = [
  {
    number: "01",
    title: "Choose a foundation",
    body: "Start with a human-led program or supplement routine that has independent value.",
  },
  {
    number: "02",
    title: "Explore research separately",
    body: "Research materials and Quantum use a separate access, cart, checkout, claims, and fulfillment path.",
  },
  {
    number: "03",
    title: "Keep support human",
    body: "Customer support can explain products and logistics. A human professional stays in front of coaching and programming.",
  },
];

export default function BuildASystem() {
  return (
    <>
      <SeoHead
        title="Build a system, xenios research"
        description="An experience layer that helps customers see the available categories while preserving separate carts and distinct purposes."
        path="/research/build-a-system"
      />
      <PageIntro
        eyebrow="Build a system"
        title="A broader offer without blurring the boundaries."
        lead="The system builder is an experience layer, not a mixed research bundle. It helps customers see the available categories while preserving separate carts and distinct purposes."
      />
      <NoticeBar>
        Systems combine consumer items only, programs and supplements. Research materials never join a system, and the research and consumer carts always check out separately.
      </NoticeBar>

      <section className="container-x section-y">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <div className="card" key={step.number} data-testid={`card-step-${step.number}`}>
              <p className="mono-cap text-pulse">{step.number}</p>
              <h2 className="h3 mt-5 mb-3">{step.title}</h2>
              <p className="body-s text-ink-2">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card flex flex-col gap-6" data-testid="card-lane-consumer">
            <div>
              <p className="mono-cap text-pulse mb-3">Consumer lane</p>
              <h2 className="display-s max-w-[16ch]">Programs and supplements</h2>
            </div>
            <div className="mt-auto">
              <p className="body-m text-ink-2 max-w-[46ch]">
                Build a practical routine with products and support that can stand on their own.
              </p>
              <Link href="/research/programs" className="btn btn-primary mt-6 inline-flex items-center gap-2">
                Explore programs <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="card bg-paper-2 flex flex-col gap-6" data-testid="card-lane-research">
            <div>
              <p className="mono-cap text-ink-mute mb-3">Research lane</p>
              <h2 className="display-s max-w-[16ch]">Peptides and Quantum</h2>
            </div>
            <div className="mt-auto">
              <p className="body-m text-ink-2 max-w-[46ch]">
                Explore specifications, evidence context, quality documentation, and access requirements.
              </p>
              <Link href="/research/peptides" className="btn btn-secondary mt-6 inline-flex items-center gap-2">
                Explore research <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
