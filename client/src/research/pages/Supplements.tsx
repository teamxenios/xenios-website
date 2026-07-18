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
        The supplement catalog is ready for the wholesale list Mitch is sourcing. Placeholder products are intentionally marked coming soon until the actual formula, facts panel, price, testing, and claims are approved.
      </NoticeBar>
      <section className="container-x section-y">
        <ProductGrid products={items} />
      </section>
    </>
  );
}
