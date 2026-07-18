import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full build from the membership spec. Content lands in
// the same PR; this keeps the route live and the build green meanwhile.
export default function Faq() {
  return (
    <>
      <SeoHead title="Frequently asked questions, xenios research" description="Clear answers about membership, the application, the fee, the Blueprint, and how xenios evaluates evidence." path="/research/faq" />
      <PageIntro eyebrow="FAQ" title="Frequently asked questions" lead="Clear answers about membership, the application, the fee, the Blueprint, and how xenios evaluates evidence." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
