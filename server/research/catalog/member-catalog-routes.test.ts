import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { MemberCatalog } from "@shared/research/member-catalog";
import type { MemberRow } from "../member-auth";
import { registerMemberCatalogApi } from "./member-catalog-routes";
import type { MemberCatalogService } from "./member-catalog-service";

const MEMBER: MemberRow = {
  id: "member-1",
  application_id: "application-1",
  auth_user_id: "auth-1",
  email: "member@example.invalid",
  first_name: "Member",
  status: "active",
  created_at: "2026-07-27T12:00:00.000Z",
};

const EMPTY: MemberCatalog = {
  audience: "member",
  currency: "USD",
  evaluatedAt: "2026-07-27T12:00:00.000Z",
  items: [],
  categories: [],
  lanes: [],
};

function appWith(
  service: Pick<MemberCatalogService, "list" | "detail">,
  allowed = true,
) {
  const app = express();
  registerMemberCatalogApi(
    app,
    service as MemberCatalogService,
    (req, res, next) => {
      if (!allowed) {
        res.status(401).json({ ok: false, code: "sign_in_required" });
        return;
      }
      (req as typeof req & { researchMember: MemberRow }).researchMember =
        MEMBER;
      next();
    },
  );
  return app;
}

describe("member catalog routes", () => {
  it("sets private headers before the member guard and registers list/detail paths", async () => {
    const app = appWith(
      {
        list: vi.fn(),
        detail: vi.fn(),
      },
      false,
    );
    for (const path of [
      "/api/research/member/products",
      "/api/research/member/products/example",
    ]) {
      const response = await request(app).get(path);
      expect(response.status, path).toBe(401);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers.pragma).toBe("no-cache");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    }
  });

  it("uses only the guard-attached member and returns the safe projection envelope", async () => {
    const list = vi.fn(async () => EMPTY);
    const app = appWith({ list, detail: vi.fn() });
    const response = await request(app)
      .get("/api/research/member/products?sort=name_descending")
      .set("x-member-id", "attacker-controlled");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, catalog: EMPTY });
    expect(list).toHaveBeenCalledWith({
      member: MEMBER,
      query: { sort: "name_descending" },
    });
  });

  it("returns a generic unavailable response on repository failure and a bounded not-found response", async () => {
    const unavailable = appWith({
      list: vi.fn(async () => {
        throw new Error("private database detail");
      }),
      detail: vi.fn(),
    });
    const failed = await request(unavailable).get(
      "/api/research/member/products",
    );
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({
      ok: false,
      code: "member_catalog_unavailable",
    });
    expect(JSON.stringify(failed.body)).not.toContain("database");

    const missing = appWith({
      list: vi.fn(),
      detail: vi.fn(async () => null),
    });
    const absent = await request(missing).get(
      "/api/research/member/products/missing",
    );
    expect(absent.status).toBe(404);
    expect(absent.body).toEqual({ ok: false, code: "product_not_found" });
  });
});
