import { describe, expect, it } from "vitest";
import { parseCatalogAuthority, REVIEWED_CATALOG_ORIGINS } from "./authority";

const now = new Date("2026-10-22T18:00:00.000Z");

function validAuthority(overrides: Record<string, unknown> = {}) {
  return {
    revision: "catalog-2026-10-22",
    url: "https://xeniostechnology.com/catalog/xenios-health.pdf",
    approvedAt: "2026-10-20T00:00:00.000Z",
    expiresAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("catalog authority", () => {
  it("accepts only the reviewed HTTPS origins and snapshots every authority field", () => {
    const result = parseCatalogAuthority(validAuthority(), now);
    expect(result).toEqual({
      revision: "catalog-2026-10-22",
      url: "https://xeniostechnology.com/catalog/xenios-health.pdf",
      approvedAt: "2026-10-20T00:00:00.000Z",
      expiresAt: "2026-11-20T00:00:00.000Z",
      revokedAt: null,
      reviewedOrigin: "https://xeniostechnology.com",
      state: "approved",
    });
    expect(REVIEWED_CATALOG_ORIGINS).toEqual([
      "https://xeniostechnology.com",
      "https://www.xeniostechnology.com",
    ]);
  });

  it.each([
    "http://xeniostechnology.com/catalog.pdf",
    "https://files.example.com/catalog.pdf",
    "https://xeniostechnology.com/catalog.pdf?token=secret",
    "https://user:secret@xeniostechnology.com/catalog.pdf",
  ])("fails closed for an unreviewed or token-bearing URL: %s", (url) => {
    expect(parseCatalogAuthority(validAuthority({ url }), now)).toBeNull();
  });

  it("routes expired and revoked snapshots to manual review", () => {
    expect(parseCatalogAuthority(validAuthority({
      expiresAt: "2026-10-22T17:59:59.000Z",
    }), now)?.state).toBe("manual_review");
    expect(parseCatalogAuthority(validAuthority({
      revokedAt: "2026-10-21T00:00:00.000Z",
    }), now)?.state).toBe("manual_review");
  });

  it("rejects missing, future-approved, or internally inconsistent authority", () => {
    expect(parseCatalogAuthority({}, now)).toBeNull();
    expect(parseCatalogAuthority(validAuthority({
      approvedAt: "2026-10-23T00:00:00.000Z",
    }), now)).toBeNull();
    expect(parseCatalogAuthority(validAuthority({
      expiresAt: "2026-10-19T00:00:00.000Z",
    }), now)).toBeNull();
  });
});
