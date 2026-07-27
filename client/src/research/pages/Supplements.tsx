import SeoHead from "@/components/SeoHead";
import { byCategory, useResearch } from "../core";
import { NoticeBar, PageIntro, ProductGrid } from "../components";

export default function Supplements() {
  const { products } = useResearch();
  const items = byCategory(products, "supplements");

  return (
    <>
      <SeoHead
        title="Supplements, xenios research"
        description="Premium supplements selected around clear formulas, transparent sourcing, independent verification, and the practical reality of daily use."
        path="/research/supplements"
      />
      <PageIntro
        eyebrow="Daily foundations"
        title="What earns a place in your routine."
        lead="Premium supplements selected around clear formulas, transparent sourcing, independent verification, and the practical reality of daily use."
      />
      <NoticeBar>
        Candidate formulas remain marked Coming Soon until the exact formula,
        facts panel, format, flavor where applicable, price, testing, and
        customer-facing claims are verified and approved.
      </NoticeBar>
      <section className="container-x section-y">
        <ProductGrid products={items} />
      </section>
    </>
  );
}
