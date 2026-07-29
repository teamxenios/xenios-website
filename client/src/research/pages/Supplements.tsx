import SeoHead from "@/components/SeoHead";
import { byCategory, useResearch } from "../core";
import { NoticeBar, PageIntro } from "../components";
import {
  V3SupplementCatalogExperience,
  type V3SupplementCatalogItem,
} from "../products-diagnostics/V3SupplementCatalogExperience";

export default function Supplements() {
  const { products } = useResearch();
  const items: V3SupplementCatalogItem[] = byCategory(
    products,
    "supplements",
  ).map((product) => ({
    id: `preview-${product.slug}`,
    slug: product.slug,
    displayName: product.name,
    summary:
      "A supplement category under review. Exact formula, documentation, price, and availability are not currently approved.",
    pricingState: "public_price_pending",
    approvedPrice: null,
    approvedVariantCount: 0,
    purchasingEnabled: false,
    documentationState: "pending",
    form: null,
    flavor: null,
  }));

  return (
    <>
      <SeoHead
        title="Supplements | Xenios Research"
        description="Supplement categories under review in the Xenios Research catalog."
        path="/research/supplements"
      />
      <PageIntro
        eyebrow="Xenios Research catalog"
        title="Supplement categories."
        lead="Explore truthful preview states while exact product, documentation, price, and availability records are reviewed."
      />
      <NoticeBar>
        Customer prices and purchase controls remain unavailable until an
        approved Product Control product, variant, and current price exist.
      </NoticeBar>
      <section className="container-x section-y">
        <V3SupplementCatalogExperience items={items} />
      </section>
    </>
  );
}
