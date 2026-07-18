import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full port from xenios-research. Content lands in the
// same PR; this keeps the route live and the build green meanwhile.
export default function Quantum() {
  return (
    <>
      <SeoHead title="Quantum, xenios research" description="Quantum as a standalone research product and as a separate component of the broader xenios ecosystem." path="/research/quantum" />
      <PageIntro eyebrow="The foundational platform" title="Quantum" lead="Quantum as a standalone research product and as a separate component of the broader xenios ecosystem." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
