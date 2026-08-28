import { normalizePublicLotCode } from "@shared/research/quality/public-lot";

export const PUBLIC_QUALITY_ROUTES = Object.freeze({
  quality: "/research/quality",
  testing: "/research/testing",
  lot: "/research/lots/:lotCode",
  documents: "/research/documents",
} as const);

export function publicLotRoute(rawLotCode: string): string | null {
  const lotCode = normalizePublicLotCode(rawLotCode);
  return lotCode === null
    ? null
    : `/research/lots/${encodeURIComponent(lotCode)}`;
}

