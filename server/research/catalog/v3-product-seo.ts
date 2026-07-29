import { v3PublicCatalogItems } from "./v3-catalog-search";

const SITE = "https://xeniostechnology.com";

export type V3ProductSeo = {
  slug: string;
  title: string;
  description: string;
  canonicalUrl: string;
  access: "member";
  indexable: false;
  robots: "noindex,nofollow";
};

export const v3ProductSeoRecords: readonly V3ProductSeo[] = Object.freeze(
  v3PublicCatalogItems.map((item) =>
    Object.freeze({
      slug: item.slug,
      title: `${item.displayName} Research Profile | Xenios`,
      description:
        `${item.displayName} is a supplier-independent Xenios Research profile. ` +
        "Review its classification and current readiness without unsupported product, price, inventory, or clinical claims.",
      canonicalUrl: `${SITE}${item.route}`,
      access: "member" as const,
      indexable: false as const,
      robots: "noindex,nofollow" as const,
    }),
  ),
);

export function getV3ProductSeo(slug: string): V3ProductSeo | null {
  const normalized = slug.trim().toLocaleLowerCase("en-US");
  return (
    v3ProductSeoRecords.find((record) => record.slug === normalized) ?? null
  );
}

export function v3ProductSitemapPaths(): string[] {
  return v3ProductSeoRecords
    .filter((record) => record.indexable)
    .map((record) => record.canonicalUrl.replace(SITE, ""));
}
