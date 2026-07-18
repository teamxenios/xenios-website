import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full build from the membership spec. Content lands in
// the same PR; this keeps the route live and the build green meanwhile.
export default function Framework() {
  return (
    <>
      <SeoHead title="The whole-life framework, xenios research" description="Movement, nutrition, sleep, emotional wellbeing, connection, environment, work, resources, and learning, understood as one system." path="/research/framework" />
      <PageIntro eyebrow="How xenios thinks" title="The whole-life framework" lead="Movement, nutrition, sleep, emotional wellbeing, connection, environment, work, resources, and learning, understood as one system." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
