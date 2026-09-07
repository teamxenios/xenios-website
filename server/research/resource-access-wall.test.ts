import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerResearchApi } from "./index";
import { requireMember } from "./member-auth";
import { affiliatePortalEnabled } from "./affiliates/v2/feature-flags";
import { registerPartnerPortalApi } from "./partners/portal-routes";
import { createInMemoryPartnerPortalPort, type PortalPartnerIdentity } from "./partners/portal";
import { createResourceHubService } from "./resource-hub/service";
import { createInMemoryResourceHubStore } from "./resource-hub/store";
import { createMemoryResourceBytesStore } from "./resource-hub/bytes-store";

// Substitute only the external Auth/database transport. The actual wall,
// requireMember, partner resolver, resource service and registrars all run.
const transport = vi.hoisted(() => ({ verify: vi.fn(), lookup: vi.fn() }));
vi.mock("../supabase", () => ({
  supabaseConfigured: () => true,
  getSupabaseAnon: () => ({ auth: { getUser: transport.verify } }),
  getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: (_key: string, id: string) => ({
    maybeSingle: () => transport.lookup(id),
  }) }) }) }),
}));

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const LIBRARY = "/api/research/partner/resources";
const identity = (memberId: string, role: PortalPartnerIdentity["role"], state: PortalPartnerIdentity["state"] = "active"): PortalPartnerIdentity => ({
  memberId, partnerId: `partner-${memberId}`, role, state, identityVerified: true,
  taxStatus: "verified", payoutStatus: "verified", certifiedAt: null, activatedAt: "2026-09-01T00:00:00Z",
});

async function composed(system = "true", portal = "true") {
  const hub = createResourceHubService({ store: createInMemoryResourceHubStore(), bytes: createMemoryResourceBytesStore(), now: () => new Date(), newId: randomUUID });
  const created = await hub.createVersion("operator@example.test", {
    title: "Synthetic affiliate guide", purpose: "Local route qualification only.",
    usagePolicy: "private", audience: ["affiliate"], originalFilename: "synthetic.pdf", idempotencyKey: randomUUID(),
  }, { bytes: new Uint8Array(PDF), contentType: "application/pdf" });
  if (!created.ok) throw Error("Local resource fixture refused");
  const resourceId = created.resource.resourceId, versionId = created.resource.versions[0].versionId;
  expect(await hub.review("operator@example.test", resourceId, versionId, { action: "approve_content", reason: "Local test", idempotencyKey: randomUUID() })).toMatchObject({ ok: true });
  expect(await hub.review("operator@example.test", resourceId, versionId, { action: "publish", idempotencyKey: randomUUID() })).toMatchObject({ ok: true });
  const port = createInMemoryPartnerPortalPort({ partners: [identity("a", "affiliate"), identity("b", "research_rep"), identity("s", "affiliate", "suspended")] });
  const lookup = vi.spyOn(port, "findPartnerForMember");
  const app = express(); app.use(express.json());
  registerResearchApi(app);
  // Same mount predicate and guard as server/index.ts, after the real wall.
  if (affiliatePortalEnabled({ AFFILIATE_SYSTEM_ENABLED: system, AFFILIATE_PORTAL_ENABLED: portal })) {
    registerPartnerPortalApi(app, { port, resourceHub: hub, submissionsEnabled: false }, {
      requireMember: async (req, res, next) => { await requireMember(req, res, next); },
    });
  }
  return { app, hub, lookup, resourceId, versionId, download: `${LIBRARY}/${resourceId}/download` };
}

beforeEach(() => {
  vi.stubEnv("RESEARCH_PUBLIC", "false");
  vi.stubEnv("RESEARCH_ACCESS_PASSWORD", "synthetic-review-password");
  vi.stubEnv("RESEARCH_SESSION_SECRET", "synthetic-review-secret-with-sufficient-length");
  vi.stubEnv("RESEARCH_RESOURCE_HUB_ENABLED", "false");
  transport.verify.mockReset().mockImplementation(async (token: string) => token === "invalid"
    ? { data: { user: null }, error: { message: "rejected" } }
    : { data: { user: { id: token, email: "synthetic@example.test" } }, error: null });
  transport.lookup.mockReset().mockImplementation(async (id: string) => ({ data: { id, auth_user_id: id, status: id === "closed" ? "closed" : "active" }, error: null }));
});
afterEach(() => vi.unstubAllEnvs());

describe("Resources through the actual locked wall, member verifier and partner registrar", () => {
  it("admits authenticated GET/HEAD only and returns actual authorized PDF bytes", async () => {
    const { app, download, resourceId } = await composed();
    const list = await request(app).get(LIBRARY).set("Authorization", "Bearer a");
    expect(list.status).toBe(200);
    expect(list.body.resources.map((x: { resourceId: string }) => x.resourceId)).toEqual([resourceId]);
    const bytes = await request(app).get(download).set("Authorization", "Bearer a");
    expect(bytes.status).toBe(200); expect(bytes.body).toEqual(PDF);
    expect(bytes.headers["cache-control"]).toBe("no-store");
    for (const path of [LIBRARY, download]) {
      const head = await request(app).head(path).set("Authorization", "Bearer a");
      expect(head.status).toBe(200); expect(head.text ?? "").toBe("");
    }
  });

  it("keeps anonymous, invalid, closed and recovery-purpose sessions out", async () => {
    const { app, download, lookup } = await composed();
    for (const path of [LIBRARY, download]) {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).set("Authorization", "Bearer invalid")).status).toBe(401);
      expect((await request(app).get(path).set("Authorization", "Bearer closed")).status).toBe(403);
      const recovery = `local.${Buffer.from(JSON.stringify({ amr: [{ method: "otp" }] })).toString("base64url")}.local`;
      const response = await request(app).get(path).set("Authorization", `Bearer ${recovery}`);
      expect(response.status).toBe(403); expect(response.body.code).toBe("recovery_session");
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("ignores forged ownership and withholds role-ineligible, suspended and withdrawn bytes", async () => {
    const { app, hub, resourceId, versionId, download, lookup } = await composed();
    for (const principal of ["b", "s", "customer"]) {
      const denied = await request(app).get(`${download}?memberId=a&partnerId=partner-a&role=affiliate`).set("Authorization", `Bearer ${principal}`).send({ memberId: "a" });
      expect(denied.status).toBe(404);
      expect(lookup).toHaveBeenLastCalledWith(principal);
      expect(denied.headers["content-type"]).not.toContain("application/pdf");
    }
    await hub.review("operator@example.test", resourceId, versionId, { action: "withdraw", reason: "Local withdrawal", idempotencyKey: randomUUID() });
    expect((await request(app).get(download).set("Authorization", "Bearer a")).status).toBe(404);
  });

  it("keeps malformed UUIDs, siblings, encoded paths and every write behind the wall", async () => {
    const { app, lookup, resourceId, download } = await composed();
    const paths = [`${LIBRARY}/`, `${LIBRARY}/extra`, `${download}/`, `${download}/extra`,
      `${LIBRARY}/not-a-uuid/download`, `${LIBRARY}/${resourceId.toUpperCase()}/download`,
      `${LIBRARY}/%61${resourceId.slice(1)}/download`, `${LIBRARY}/${resourceId}/%64ownload`,
      "/api/research/partner/resources-other", "/api/research/partner/commissions"];
    for (const path of paths) expect((await request(app).get(path).set("Authorization", "Bearer a")).status, path).toBe(401);
    for (const path of [LIBRARY, download]) for (const method of ["post", "put", "patch", "delete"] as const) {
      expect((await request(app)[method](path).set("Authorization", "Bearer a")).status).toBe(401);
    }
    expect(transport.verify).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
  });

  it.each([["false", "true"], ["true", "false"]])("does not mount the portal when flags are %s/%s", async (system, portal) => {
    const { app, download } = await composed(system, portal);
    expect((await request(app).get(download).set("Authorization", "Bearer a")).status).toBe(404);
    expect(transport.verify).not.toHaveBeenCalled();
  });
});
