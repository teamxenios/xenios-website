import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Placeholder pending the full port from xenios-research. Content lands in the
// same PR; this keeps the route live and the build green meanwhile.
export default function Wholesale() {
  return (
    <>
      <SeoHead title="Wholesale, xenios research" description="Wholesale and partner pathways for qualified organizations." path="/research/wholesale" />
      <PageIntro eyebrow="Partners" title="Wholesale" lead="Wholesale and partner pathways for qualified organizations." />
      <section className="container-x pb-20">
        <p className="body-m text-ink-mute">This page is being prepared.</p>
      </section>
    </>
  );
}
