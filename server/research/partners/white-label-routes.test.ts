import { describe, expect, it, vi } from "vitest";
import type { Express, Request, Response } from "express";
import type { WhiteLabelPartnerService } from "./white-label";
import { registerWhiteLabelPartnerRoutes } from "./white-label-routes";

type Handler = (req: Request, res: Response, next: () => void) => unknown;
type Registered = { method: string; path: string; handlers: Handler[] };

function appFixture() {
  const routes: Registered[] = [];
  const app = {
    get: (path: string, ...handlers: Handler[]) => routes.push({ method: "get", path, handlers }),
    post: (path: string, ...handlers: Handler[]) => routes.push({ method: "post", path, handlers }),
    patch: (path: string, ...handlers: Handler[]) => routes.push({ method: "patch", path, handlers }),
  } as unknown as Express;
  return { app, routes };
}

function serviceFixture(): WhiteLabelPartnerService {
  const unavailable = async () => ({ ok: false as const, code: "white_label_unavailable" as const, message: "Unavailable." });
  return {
    get: vi.fn(unavailable),
    apply: vi.fn(unavailable),
    updateBrand: vi.fn(unavailable),
    selectVariant: vi.fn(unavailable),
    requestQuote: vi.fn(unavailable),
    submitPackaging: vi.fn(unavailable),
    setFulfillment: vi.fn(unavailable),
    openSupport: vi.fn(unavailable),
  };
}

function responseFixture() {
  const headers = new Map<string, string>();
  const response = {
    statusCode: 200,
    payload: undefined as unknown,
    set(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    status(value: number) {
      this.statusCode = value;
      return this;
    },
    json(value: unknown) {
      this.payload = value;
      return this;
    },
  } as unknown as Response & { statusCode: number; payload: unknown };
  return { response, headers };
}

async function invoke(route: Registered, req: Request, res: Response): Promise<void> {
  let index = 0;
  const next = async (): Promise<void> => {
    const handler = route.handlers[index++];
    if (!handler) return;
    await handler(req, res, () => void next());
  };
  await next();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function find(routes: Registered[], method: string, path: string): Registered {
  const route = routes.find((candidate) => candidate.method === method && candidate.path === path);
  if (!route) throw new Error(`missing ${method.toUpperCase()} ${path}`);
  return route;
}

describe("white-label partner routes", () => {
  it("registers the bounded workspace surface without payment, payout, label purchase, or fulfillment execution", () => {
    const { app, routes } = appFixture();
    registerWhiteLabelPartnerRoutes(app, serviceFixture(), (_req, _res, next) => next());
    const paths = routes.map((route) => `${route.method.toUpperCase()} ${route.path}`);
    expect(paths).toEqual([
      "GET /api/research/partner/organizations/white-label",
      "GET /api/research/partner/organizations/white-label/variants",
      "POST /api/research/partner/organizations/white-label/application",
      "PATCH /api/research/partner/organizations/white-label/brand",
      "POST /api/research/partner/organizations/white-label/selections",
      "POST /api/research/partner/organizations/white-label/quotes",
      "POST /api/research/partner/organizations/white-label/packaging-review",
      "PATCH /api/research/partner/organizations/white-label/fulfillment",
      "POST /api/research/partner/organizations/white-label/support",
    ]);
    expect(paths.join(" ")).not.toMatch(/payment|payout|purchase|execute|message/);
  });

  it("derives the member from the authenticated request and ignores forged body identity", async () => {
    const { app, routes } = appFixture();
    const service = serviceFixture();
    registerWhiteLabelPartnerRoutes(app, service, (_req, _res, next) => next());
    const route = find(routes, "post", "/api/research/partner/organizations/white-label/application");
    const req = {
      body: { memberId: "forged-member", organizationName: "North", idempotencyKey: "application-command-1" },
      researchMember: { id: "verified-member" },
    } as unknown as Request;
    const { response } = responseFixture();
    await invoke(route, req, response);
    expect(service.apply).toHaveBeenCalledWith("verified-member", req.body);
    expect(service.apply).not.toHaveBeenCalledWith("forged-member", expect.anything());
  });

  it("fails closed without a guard-attached member and applies private response headers", async () => {
    const { app, routes } = appFixture();
    const service = serviceFixture();
    registerWhiteLabelPartnerRoutes(app, service, (_req, _res, next) => next());
    const route = find(routes, "get", "/api/research/partner/organizations/white-label");
    const { response, headers } = responseFixture();
    await invoke(route, { body: {}, query: {}, params: {} } as Request, response);
    expect(response.statusCode).toBe(403);
    expect(response.payload).toEqual({ ok: false, code: "white_label_forbidden" });
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(service.get).not.toHaveBeenCalled();
  });

  it("returns an unavailable machine code without leaking thrown details", async () => {
    const { app, routes } = appFixture();
    const service = serviceFixture();
    vi.mocked(service.get).mockRejectedValue(new Error("SUPPLIER_COST=secret"));
    registerWhiteLabelPartnerRoutes(app, service, (_req, _res, next) => next());
    const route = find(routes, "get", "/api/research/partner/organizations/white-label");
    const { response } = responseFixture();
    await invoke(route, { researchMember: { id: "verified-member" } } as unknown as Request, response);
    expect(response.statusCode).toBe(503);
    expect(response.payload).toEqual({ ok: false, code: "white_label_unavailable" });
    expect(JSON.stringify(response.payload)).not.toContain("SUPPLIER_COST");
  });
});
