import { afterEach, describe, expect, it } from "vitest";
import { RESOURCE_HUB_BUCKET, RESOURCE_HUB_ENABLED_ENV, resetPreviewResourceHub, resolveResourceHubService, resourceHubEnabled } from "./production";

const PDF = Buffer.from("%PDF-1.4\n%%EOF\n", "latin1");
const UPLOAD = {
  title: "Partner introduction one-pager",
  purpose: "A one-page introduction a partner may hand to a prospective member.",
  usagePolicy: "external_share" as const,
  audience: ["all_partners" as const],
  originalFilename: "intro.pdf",
  idempotencyKey: "upload-key-0001",
};
const FILE = { bytes: new Uint8Array(PDF), contentType: "application/pdf" };
const REP = { memberId: "m", role: "research_rep" as const, state: "active" as const };

afterEach(() => resetPreviewResourceHub());

describe("the production composition is dark until explicitly enabled", () => {
  it("is off by default and only on for the exact string true", () => {
    expect(resourceHubEnabled({})).toBe(false);
    expect(resourceHubEnabled({ [RESOURCE_HUB_ENABLED_ENV]: "1" })).toBe(false);
    expect(resourceHubEnabled({ [RESOURCE_HUB_ENABLED_ENV]: "TRUE" })).toBe(false);
    expect(resourceHubEnabled({ [RESOURCE_HUB_ENABLED_ENV]: "true" })).toBe(true);
    expect(RESOURCE_HUB_BUCKET).toBe("research-resource-library");
  });

  it("in production with the flag unset: empty library, no delivery, uploads refused as unavailable", async () => {
    const service = resolveResourceHubService({ NODE_ENV: "production" });
    expect(await service.libraryFor(REP)).toEqual([]);
    expect(await service.listAdmin()).toEqual([]);
    expect(await service.deliverToPartner(REP, "any")).toEqual({ ok: false, code: "not_found" });
    expect(await service.createVersion("admin@xenios.test", UPLOAD, FILE)).toMatchObject({ ok: false, code: "resource_hub_unavailable" });
    expect(await service.adminBytes("r", "v")).toEqual({ ok: false, code: "not_found" });
  });

  it("in production with the flag on but no Supabase configuration: still dark", async () => {
    const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const service = resolveResourceHubService({ NODE_ENV: "production", [RESOURCE_HUB_ENABLED_ENV]: "true" });
      expect(await service.createVersion("admin@xenios.test", UPLOAD, FILE)).toMatchObject({ ok: false, code: "resource_hub_unavailable" });
      expect(await service.libraryFor(REP)).toEqual([]);
    } finally {
      if (saved.url !== undefined) process.env.SUPABASE_URL = saved.url;
      if (saved.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
    }
  });

  it("outside production: one shared in-memory composition that a preview can exercise end to end", async () => {
    const a = resolveResourceHubService({ NODE_ENV: "development" });
    const b = resolveResourceHubService({ NODE_ENV: "development" });
    expect(a).toBe(b);
    const created = await a.createVersion("admin@xenios.test", UPLOAD, FILE);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await b.listAdmin()).map((r) => r.resourceId)).toEqual([created.resource.resourceId]);
    resetPreviewResourceHub();
    expect(await resolveResourceHubService({ NODE_ENV: "development" }).listAdmin()).toEqual([]);
  });
});
