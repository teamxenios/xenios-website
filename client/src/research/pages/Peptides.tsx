import SeoHead from "@/components/SeoHead";
import { byCategory, useResearch } from "../core";
import { NoticeBar, PageIntro, ProductGrid } from "../components";

export default function Peptides() {
  const { products } = useResearch();
  const items = byCategory(products, "peptides");

  return (
    <>
      <SeoHead title="Research peptides, xenios research" description="Research materials presented with exact specifications, batch documentation, evidence context, and account-based access." path="/research/peptides" />
      <PageIntro
        eyebrow="Research materials"
        title="Peptides, presented with the distinctions that matter."
        lead="Each profile separates the exact material from related approved drugs, compounding review, early evidence, preclinical research, and unresolved questions."
      />
      <NoticeBar>
        Not for human or veterinary use. No dosing, injection, reconstitution, cycling, stacking, treatment, or personal-use guidance is provided.
      </NoticeBar>
      <section className="container-x section-y">
        <ProductGrid products={items} />
      </section>
    </>
  );
}
