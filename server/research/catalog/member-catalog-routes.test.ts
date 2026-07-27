import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { MemberCatalog } from "@shared/research/member-catalog";
import type { MemberRow } from "../member-auth";
import { registerResearchApi } from "../index";
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

function expectPrivateHeaders(
  headers: Record<string, string | string[] | undefined>,
): void {
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers.pragma).toBe("no-cache");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
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
      expectPrivateHeaders(response.headers);
    }
  });

  it("is not shadowed by the earlier shared-password gateway in production order", async () => {
    const previous = {
      password: process.env.RESEARCH_ACCESS_PASSWORD,
      secret: process.env.RESEARCH_SESSION_SECRET,
      public: process.env.RESEARCH_PUBLIC,
    };
    process.env.RESEARCH_ACCESS_PASSWORD = "review-password";
    process.env.RESEARCH_SESSION_SECRET = "review-secret";
    delete process.env.RESEARCH_PUBLIC;
    try {
      const app = express();
      registerResearchApi(app);
      registerMemberCatalogApi(
        app,
        { list: vi.fn(), detail: vi.fn() } as unknown as MemberCatalogService,
        (_req, res) => {
          res.status(401).json({ ok: false, code: "sign_in_required" });
        },
      );
      for (const method of ["get", "head"] as const) {
        for (const path of [
          "/api/research/member/products",
          "/api/research/member/products/example",
        ]) {
          const response = await request(app)[method](path);
          expect(response.status, `${method.toUpperCase()} ${path}`).toBe(401);
          expect(response.body, `${method.toUpperCase()} ${path}`).toMatchObject(
            method === "get"
              ? { ok: false, code: "sign_in_required" }
              : {},
          );
          expectPrivateHeaders(response.headers);
        }
      }
    } finally {
      if (previous.password === undefined) {
        delete process.env.RESEARCH_ACCESS_PASSWORD;
      } else {
        process.env.RESEARCH_ACCESS_PASSWORD = previous.password;
      }
      if (previous.secret === undefined) {
        delete process.env.RESEARCH_SESSION_SECRET;
      } else {
        process.env.RESEARCH_SESSION_SECRET = previous.secret;
      }
      if (previous.public === undefined) {
        delete process.env.RESEARCH_PUBLIC;
      } else {
        process.env.RESEARCH_PUBLIC = previous.public;
      }
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
