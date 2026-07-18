import SeoHead from "@/components/SeoHead";
import { byCategory, useResearch } from "../core";
import { NoticeBar, PageIntro, ProductGrid } from "../components";

export default function Programs() {
  const { products } = useResearch();
  const items = byCategory(products, "programs");

  return (
    <>
      <SeoHead
        title="Programs, xenios research"
        description="Training, nutrition, education, and accountability delivered as human-led, non-clinical programs with independent value, separate from research products."
        path="/research/programs"
      />
      <PageIntro
        eyebrow="Human-led programming"
        title="Products matter. Structure changes what people do."
        lead="Training, nutrition, education, and accountability programs give the xenios platform a relationship beyond a transaction."
      />
      <NoticeBar>
        Programs have independent value and remain separate from research products. They are human-led and non-clinical, and they do not contain research materials or medical care.
      </NoticeBar>
      <section className="container-x section-y">
        <ProductGrid products={items} />
      </section>
    </>
  );
}
