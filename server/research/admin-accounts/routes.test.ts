import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ADMIN_ACCOUNTS_PATH as path, type AdminAccount } from "../../../shared/research/admin-accounts";
import { registerAdminAccountsApi } from "./routes";
import type { AdminAccountDependencies } from "./service";
const actorId = "10000000-0000-4000-8000-000000000001", targetId = "10000000-0000-4000-8000-000000000002";
const account: AdminAccount = { userId: targetId, emailHint: "withheld", displayLabel: null, displayLabelSource: "user_supplied_not_authority",
  emailConfirmation: "pending", pendingEmailChange: false, lastSignInAt: null, providerBan: "not_reported" };
function fixture() {
  const deps = { available: () => true, verifyIdentity: vi.fn(async (token: string) => token === "bad" ? null : { id: actorId }), isRecovery: (token: string) => token === "recovery",
    admission: { admit: vi.fn<NonNullable<AdminAccountDependencies["admission"]>["admit"]>(async scope => ({ ...scope, purpose: "ordinary", isCurrent: () => true })), audit: vi.fn(async () => {}) },
    reader: { list: vi.fn<AdminAccountDependencies["reader"]["list"]>(async query => ({ ok: true, kind: "CANONICAL_AUTH_ACCOUNT_PAGE_V1", accounts: [account], ...query, nextPage: null, total: 1 })),
      detail: vi.fn<AdminAccountDependencies["reader"]["detail"]>(async () => account) },
  } satisfies AdminAccountDependencies;
  const app = express(); app.use(express.json()); registerAdminAccountsApi(app, deps); return { app, deps };
}
describe("literal GET-only canonical account HTTP boundary", () => {
  it("returns exact whitelisted data with private headers and no cookies", async () => {
    const f = fixture(), response = await request(f.app).get(path).set("Authorization", "Bearer ordinary");
    expect(response.status).toBe(200); expect(response.body.accounts).toEqual([account]);
    expect(response.headers["cache-control"]).toBe("private, no-store"); expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive"); expect(response.headers["set-cookie"]).toBeUndefined();
    expect((await request(f.app).get(path + "/" + targetId).set("Authorization", "Bearer ordinary")).body.account.userId).toBe(targetId);
  });
  it.each([null, "Bearer bad", "Bearer recovery", "ordinary", "Bearer a,b"])("refuses missing, invalid or wrong-purpose credentials %#", async auth => {
    const f = fixture(), probe = request(f.app).get(path).set("Cookie", "admin=true"); if (auth) probe.set("Authorization", auth);
    expect([401, 403]).toContain((await probe).status); expect(f.deps.reader.list).not.toHaveBeenCalled();
  });
  it("rejects unknown/repeated queries, malformed detail and actor/role body fields without provider reads", async () => {
    const f = fixture();
    for (const suffix of ["?page=1&page=2", "?perPage=51", "?actorId=" + actorId, "?role=admin", "/bad-id", "/" + targetId + "?scope=accountRead"]) {
      expect((await request(f.app).get(path + suffix).set("Authorization", "Bearer ordinary")).status).toBe(400);
    }
    expect((await request(f.app).get(path).set("Authorization", "Bearer ordinary").send({ actorId, role: "admin" })).status).toBe(400);
    expect(f.deps.reader.list).not.toHaveBeenCalled(); expect(f.deps.reader.detail).not.toHaveBeenCalled();
  });
  it("exposes no write operation, including HEAD's implicit GET fallback", async () => {
    const f = fixture();
    for (const method of ["post", "put", "patch", "delete", "head"] as const) {
      expect((await request(f.app)[method](path).set("Authorization", "Bearer ordinary")).status).toBe(405);
      expect((await request(f.app)[method](path + "/" + targetId).set("Authorization", "Bearer ordinary")).status).toBe(405);
    }
    expect(f.deps.verifyIdentity).not.toHaveBeenCalled(); expect(f.deps.reader.list).not.toHaveBeenCalled(); expect(f.deps.reader.detail).not.toHaveBeenCalled();
  });
  it("redacts failures and reveals a missing account only after specific authorized detail", async () => {
    const f = fixture(); f.deps.reader.list.mockRejectedValue(Error("secret token private@example.invalid"));
    const response = await request(f.app).get(path).set("Authorization", "Bearer ordinary");
    expect(response.status).toBe(503); expect(response.body).toEqual({ ok: false, code: "account_read_unavailable" });
    f.deps.reader.detail.mockResolvedValue(null);
    expect((await request(f.app).get(path + "/" + targetId).set("Authorization", "Bearer ordinary")).body).toEqual({ ok: false, code: "account_not_found" });
    f.deps.admission.admit.mockResolvedValue(null);
    expect((await request(f.app).get(path + "/" + targetId).set("Authorization", "Bearer ordinary")).status).toBe(403);
    expect(f.deps.reader.detail).toHaveBeenCalledTimes(1);
  });
});
