import { v3PreviewProducts } from "./v3-preview-catalog";

export type V3ProductSeo = {
  slug: string;
  route: string;
  title: string;
  description: string;
  canonicalPath: string;
  access: "member";
  indexable: false;
  robots: "noindex,nofollow";
};

const seoBySlug = new Map<string, V3ProductSeo>(
  v3PreviewProducts.map((profile) => {
    const canonicalPath = `/research/member/products/${profile.slug}`;
    return [
      profile.slug,
      {
        slug: profile.slug,
        route: canonicalPath,
        title: `${profile.displayName} | Xenios Research`,
        description:
          "Member-only Research catalog information. Pricing, variants, documentation, and availability remain pending until approved server records exist.",
        canonicalPath,
        access: "member",
        indexable: false,
        robots: "noindex,nofollow",
      },
    ];
  }),
);

export const v3ProductSeoRecords: readonly V3ProductSeo[] = [
  ...Array.from(seoBySlug.values()),
];

export function getV3ProductSeo(slug: string): V3ProductSeo | null {
  return seoBySlug.get(slug.trim().toLocaleLowerCase("en-US")) ?? null;
}

/**
 * Member-only records never enter the public sitemap. Website 2 may publish a
 * route only after a separate public-route acceptance and release.
 */
export const v3ProductSitemapPaths: readonly string[] =
  v3ProductSeoRecords
    .filter((record) => record.indexable)
    .map((record) => record.canonicalPath);
