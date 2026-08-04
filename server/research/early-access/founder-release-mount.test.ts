import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import {
  EARLY_ACCESS_RELEASES_PATH,
  EARLY_ACCESS_RELEASE_HISTORY_PATH,
  registerPrivateEarlyAccessApi,
} from "./register";
import { EmptyEarlyAccessCatalogSource } from "./release/release-routes";

// The founder release surface is the ONE place a named human overrides Product
// Control. These pin the two things that make that safe: it is not reachable at
// all without an admin guard, and the actor is whatever that guard authenticated
// rather than anything the caller sent.

vi.mock("../../supabase", () => ({
  supabaseConfigured: () => false,
  getSupabaseAdmin: () => {
    throw new Error("Supabase admin not configured");
  },
  getSupabaseAnon: () => ({}),
}));

function app(options: Parameters<typeof registerPrivateEarlyAccessApi>[1] = {}) {
  const server = express();
  server.use(express.json());
  registerPrivateEarlyAccessApi(server, options);
  return server;
}

/** An admin guard that authenticates one named human, like requireSupabaseAdmin. */
function guardFor(email: string | null) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (email === null) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    (req as unknown as { adminEmail: string }).adminEmail = email;
    next();
  };
}

describe("the founder release surface always mounts behind THE admin guard", () => {
  // This surface used to be left UNMOUNTED when no guard was injected, which
  // answered 404. Consolidating onto one `requireAdmin` option, defaulted to
  // requireSupabaseAdmin, means it now always mounts and the default guard
  // does the refusing: 503 "Admin access not configured" when ADMIN_EMAIL is
  // unset, as it is here.
  //
  // 503 is the better answer for the same reason the catalog default is a
  // refusal rather than an empty list: a misconfigured deployment should say
  // what is wrong, not look like a feature that was never built. Nothing is
  // authorized either way, so this narrows nothing.
  it("refuses every founder path with a truthful 503 when no guard is configured", async () => {
    const server = app({ catalog: new EmptyEarlyAccessCatalogSource() });
    await request(server).get(EARLY_ACCESS_RELEASES_PATH).expect(503);
    await request(server).post(EARLY_ACCESS_RELEASES_PATH).send({}).expect(503);
    await request(server).get(EARLY_ACCESS_RELEASE_HISTORY_PATH).expect(503);
  });

  it("never reaches a handler without a guard decision", async () => {
    // The point of the change is that the surface is guarded, not absent. An
    // unconfigured default must still refuse before any handler runs.
    const server = app({ catalog: new EmptyEarlyAccessCatalogSource() });
    const response = await request(server).post(EARLY_ACCESS_RELEASES_PATH).send({
      productId: "p", variantId: "v", productVersion: "x", actor: "attacker@example.com",
    });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("attacker@example.com");
  });
});

describe("the founder release surface behind a guard", () => {
  it("lets the guard refuse before the handler is reached", async () => {
    const server = app({
      catalog: new EmptyEarlyAccessCatalogSource(),
      requireAdmin: guardFor(null),
    });
    await request(server).get(EARLY_ACCESS_RELEASES_PATH).expect(401);
    await request(server).post(EARLY_ACCESS_RELEASES_PATH).send({}).expect(401);
  });

  it("reviews the catalog for the human the guard authenticated", async () => {
    const server = app({
      catalog: new EmptyEarlyAccessCatalogSource(),
      requireAdmin: guardFor("founder@example.com"),
    });
    const response = await request(server).get(EARLY_ACCESS_RELEASES_PATH).expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.candidates).toEqual([]);
  });

  it("refuses when the guard authenticated nobody it can name", async () => {
    const server = app({
      catalog: new EmptyEarlyAccessCatalogSource(),
      // A guard that lets the request through without recording who it was.
      requireAdmin: (_req, _res, next) => next(),
    });
    const response = await request(server).get(EARLY_ACCESS_RELEASES_PATH).expect(403);
    expect(response.body.code).toBe("actor_unknown");
  });

  it("never reads the actor from the body", async () => {
    const server = app({
      catalog: new EmptyEarlyAccessCatalogSource(),
      requireAdmin: guardFor("founder@example.com"),
      adminActor: (req) =>
        (req as unknown as { adminEmail?: string }).adminEmail ?? null,
    });
    const response = await request(server)
      .post(EARLY_ACCESS_RELEASES_PATH)
      .send({
        productId: "prod-a",
        variantId: "var-1",
        releaseId: "rel-1",
        productVersion: "0".repeat(64),
        reason: "Founder release for the private early access pilot.",
        actor: "somebody-else@example.com",
      })
      .expect(404);
    // The unit is not in the empty catalog, which is a 404 rather than a 201:
    // the body's actor never got as far as being considered.
    expect(response.body.code).toBe("unit_not_found");
  });
});

describe("an unconfigured deployment", () => {
  it("refuses the catalog rather than answering with an empty one", async () => {
    // No catalog is supplied and Supabase is not configured, so registration
    // hands out the refusing source. The route turns that into a 503, which a
    // surface can tell apart from a 200 with no units in it.
    const server = app({ requireAdmin: guardFor("founder@example.com") });
    const response = await request(server).get(EARLY_ACCESS_RELEASES_PATH).expect(503);
    expect(response.body).toEqual({ ok: false, code: "unavailable" });
  });
});
