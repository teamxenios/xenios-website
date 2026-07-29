import type { V3PreviewProfile } from "./v3-preview-catalog";
import { v3PreviewProfiles } from "./v3-preview-catalog";

export type V3ProductSeoRecord = {
  slug: string;
  title: string;
  description: string;
  canonicalPath: string;
  robots: "noindex,nofollow";
  sitemapEligible: false;
  memberOnly: true;
};

export function buildV3ProductSeoRecord(
  profile: V3PreviewProfile,
): V3ProductSeoRecord {
  return {
    slug: profile.slug,
    title: `${profile.displayName} | Xenios Research`,
    description: profile.summary,
    canonicalPath: `/research/member/products/${profile.slug}`,
    robots: "noindex,nofollow",
    sitemapEligible: false,
    memberOnly: true,
  };
}

export function buildV3ProductSeoRecords(
  profiles: readonly V3PreviewProfile[] = v3PreviewProfiles,
): readonly V3ProductSeoRecord[] {
  return profiles.map(buildV3ProductSeoRecord);
}

export function v3ProductSitemapPaths(
  records: readonly V3ProductSeoRecord[] = buildV3ProductSeoRecords(),
): readonly string[] {
  return records
    .filter((record) => record.sitemapEligible && !record.memberOnly)
    .map((record) => record.canonicalPath);
}
