export const BRAND = {
  publicName: "Xenios",
  legalName: "Xenios Technologies, Inc.",
  siteUrl: "https://xeniostechnology.com",
  supportEmail: "team@xeniostechnology.com",
  socialHandle: "@officialxenios",
  copyright: "© 2026 Xenios Technologies, Inc.",
} as const;

export function pageTitle(title: string): string {
  return title === BRAND.publicName ? title : `${title} | ${BRAND.publicName}`;
}
