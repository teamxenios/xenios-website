import { normalizePublicLotCode } from "@shared/research/quality/public-lot";
import { normalizeResearchPath } from "@shared/research/paths";

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

export function isPublicLotRoutePath(pathname: string): boolean {
  const normalized = normalizeResearchPath(pathname);
  const prefix = "/research/lots/";
  if (!normalized.startsWith(prefix)) return false;
  const lotCode = normalized.slice(prefix.length);
  // Route membership and lot-code validity are separate. Wouter registers one
  // exact segment; the page then renders its explicit invalid-request state for
  // a malformed segment. Extra/double-slash descendants must stay outside.
  return lotCode.length > 0 && !lotCode.includes("/");
}
