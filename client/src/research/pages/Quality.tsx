import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full port from xenios-research. Content lands in the
// same PR; this keeps the route live and the build green meanwhile.
export default function Quality() {
  return (
    <>
      <SeoHead title="Quality, xenios research" description="Sourcing, testing, documentation, and the review every product must pass." path="/research/quality" />
      <PageIntro eyebrow="The xenios standard" title="Quality" lead="Sourcing, testing, documentation, and the review every product must pass." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
