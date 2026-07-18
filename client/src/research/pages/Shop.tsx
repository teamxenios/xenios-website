import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full port from xenios-research. Content lands in the
// same PR; this keeps the route live and the build green meanwhile.
export default function Shop() {
  return (
    <>
      <SeoHead title="Shop, xenios research" description="Every category in one place, with clear lanes and clear status." path="/research/shop" />
      <PageIntro eyebrow="The full catalog" title="Shop" lead="Every category in one place, with clear lanes and clear status." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
