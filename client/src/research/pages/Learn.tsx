import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full port from xenios-research. Content lands in the
// same PR; this keeps the route live and the build green meanwhile.
export default function Learn() {
  return (
    <>
      <SeoHead title="Learn, xenios research" description="Evidence-first education that separates what is known, what is early, and what is unresolved." path="/research/learn" />
      <PageIntro eyebrow="Education" title="Learn" lead="Evidence-first education that separates what is known, what is early, and what is unresolved." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
