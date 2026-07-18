import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full port from xenios-research. Content lands in the
// same PR; this keeps the route live and the build green meanwhile.
export default function Supplements() {
  return (
    <>
      <SeoHead title="Supplements, xenios research" description="Premium nutrition products selected for ingredient quality, transparent sourcing, and practical routines." path="/research/supplements" />
      <PageIntro eyebrow="Daily foundations" title="Supplements" lead="Premium nutrition products selected for ingredient quality, transparent sourcing, and practical routines." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
