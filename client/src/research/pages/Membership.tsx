import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full build from the membership spec. Content lands in
// the same PR; this keeps the route live and the build green meanwhile.
export default function Membership() {
  return (
    <>
      <SeoHead title="Access begins with context., xenios research" description="xenios research is designed for people who are ready to take a more complete view of their health, performance, recovery, environment, and daily life." path="/research/membership" />
      <PageIntro eyebrow="Private membership" title="Access begins with context." lead="xenios research is designed for people who are ready to take a more complete view of their health, performance, recovery, environment, and daily life." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
