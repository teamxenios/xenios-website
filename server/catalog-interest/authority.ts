import { z } from "zod";

export const REVIEWED_CATALOG_ORIGINS = Object.freeze([
  "https://xeniostechnology.com",
  "https://www.xeniostechnology.com",
] as const);

export type CatalogAuthorityState = "approved" | "manual_review";

export interface CatalogAuthority {
  revision: string;
  url: string;
  approvedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  reviewedOrigin: (typeof REVIEWED_CATALOG_ORIGINS)[number];
  state: CatalogAuthorityState;
}

export interface CatalogAuthorityEnvironment {
  CATALOG_AUTHORITY_REVISION?: string;
  CATALOG_AUTHORITY_URL?: string;
  CATALOG_AUTHORITY_APPROVED_AT?: string;
  CATALOG_AUTHORITY_EXPIRES_AT?: string;
  CATALOG_AUTHORITY_REVOKED_AT?: string;
}

const inputSchema = z.object({
  revision: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/u),
  url: z.string().url().max(2048),
  approvedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export function parseCatalogAuthority(
  value: unknown,
  now: Date = new Date(),
): CatalogAuthority | null {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) return null;

  let catalogUrl: URL;
  try {
    catalogUrl = new URL(parsed.data.url);
  } catch {
    return null;
  }
  if (
    catalogUrl.protocol !== "https:" ||
    catalogUrl.username ||
    catalogUrl.password ||
    catalogUrl.search ||
    catalogUrl.hash ||
    !REVIEWED_CATALOG_ORIGINS.includes(
      catalogUrl.origin as (typeof REVIEWED_CATALOG_ORIGINS)[number],
    )
  ) {
    return null;
  }

  const approvedAt = new Date(parsed.data.approvedAt);
  const expiresAt = new Date(parsed.data.expiresAt);
  const revokedAt = parsed.data.revokedAt ? new Date(parsed.data.revokedAt) : null;
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(approvedAt.getTime()) ||
    !Number.isFinite(expiresAt.getTime()) ||
    approvedAt.getTime() > now.getTime() ||
    expiresAt.getTime() <= approvedAt.getTime() ||
    (revokedAt && (
      !Number.isFinite(revokedAt.getTime()) ||
      revokedAt.getTime() < approvedAt.getTime()
    ))
  ) {
    return null;
  }

  return {
    revision: parsed.data.revision,
    url: catalogUrl.href,
    approvedAt: approvedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revokedAt: revokedAt?.toISOString() ?? null,
    reviewedOrigin: catalogUrl.origin as (typeof REVIEWED_CATALOG_ORIGINS)[number],
    state: expiresAt.getTime() <= now.getTime() || revokedAt !== null
      ? "manual_review"
      : "approved",
  };
}

export function catalogAuthorityFromEnvironment(
  env: CatalogAuthorityEnvironment = process.env,
  now: Date = new Date(),
): CatalogAuthority | null {
  return parseCatalogAuthority({
    revision: env.CATALOG_AUTHORITY_REVISION,
    url: env.CATALOG_AUTHORITY_URL,
    approvedAt: env.CATALOG_AUTHORITY_APPROVED_AT,
    expiresAt: env.CATALOG_AUTHORITY_EXPIRES_AT,
    ...(env.CATALOG_AUTHORITY_REVOKED_AT
      ? { revokedAt: env.CATALOG_AUTHORITY_REVOKED_AT }
      : {}),
  }, now);
}
