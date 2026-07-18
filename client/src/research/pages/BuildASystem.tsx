import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full port from xenios-research. Content lands in the
// same PR; this keeps the route live and the build green meanwhile.
export default function BuildASystem() {
  return (
    <>
      <SeoHead title="Build a system, xenios research" description="Combine programs, supplements, and education into one practical weekly system." path="/research/build-a-system" />
      <PageIntro eyebrow="Guided selection" title="Build a system" lead="Combine programs, supplements, and education into one practical weekly system." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
