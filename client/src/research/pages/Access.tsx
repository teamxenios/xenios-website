import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full port from xenios-research. Content lands in the
// same PR; this keeps the route live and the build green meanwhile.
export default function Access() {
  return (
    <>
      <SeoHead title="Professional access, xenios research" description="Professional and research account review for restricted materials." path="/research/access" />
      <PageIntro eyebrow="Access" title="Professional access" lead="Professional and research account review for restricted materials." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
