import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full port from xenios-research. Content lands in the
// same PR; this keeps the route live and the build green meanwhile.
export default function Programs() {
  return (
    <>
      <SeoHead title="Programs, xenios research" description="Training, nutrition, accountability, and education delivered as human-led programs with independent value." path="/research/programs" />
      <PageIntro eyebrow="Human-led support" title="Programs" lead="Training, nutrition, accountability, and education delivered as human-led programs with independent value." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
