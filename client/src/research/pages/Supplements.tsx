import SeoHead from "@/components/SeoHead";
import { byCategory, useResearch } from "../core";
import { NoticeBar, PageIntro } from "../components";
import { V3SupplementCatalogExperience } from "../products-diagnostics/V3SupplementCatalogExperience";

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
        Supplement profiles remain coming soon until their exact formula,
        customer price, documentation, availability, and release approval are
        verified.
      </NoticeBar>
      <V3SupplementCatalogExperience
        items={items.map((item) => ({
          slug: item.slug,
          displayName: item.name,
        }))}
      />
    </>
  );
}
