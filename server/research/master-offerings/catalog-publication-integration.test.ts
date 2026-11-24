import { readFileSync } from "node:fs";
import { loadMasterOfferingDataset } from "./dataset-reader";
import { loadBindingIndex } from "./production-bindings";
import { registerReviewedProductDataset } from "./reviewed-content";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { createRequestIntentRouter } from "../assisted-order/request-intent/express";
import { RequestIntentService, type RequestIntentDependencies } from "../assisted-order/request-intent/service";
import { once } from "node:events";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import express from "express";
import { expect, it, vi } from "vitest";
import { mountProductControlPublication } from "../products-diagnostics/catalog-publication-integration";

it("mounts the selected public asset and protected editor on the same Product Control service", async () => {
  const selected = { offeringId: "mo_ab", offeringVariantId: "mov_ab",
    productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", variantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
  const revision = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const asset = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const rpc = vi.fn(async () => ({ data: { generation: 1, revision: null }, error: null }));
  const app = express();
  const catalog = mountProductControlPublication(app, { selected,
    db: { rpc } as unknown as SupabaseClient, mediaBucket: "private-media",
    requireAdmin: (_req, res) => res.status(403).end(),
    assertBinding: async () => true, isEligible: async () => true,
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    const image = origin + "/api/research/catalog-media/" + revision + "/" + asset;
    const forbidden = await fetch(origin + "/api/admin/research/products/" + selected.productId +
      "/variants/" + selected.variantId + "/catalog-publication/publish", { method: "POST" });
    expect(forbidden.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect((await fetch(image, { method: "PUT" })).status).toBe(405);
    expect(rpc).not.toHaveBeenCalled();
    for (const method of ["GET", "HEAD"]) {
      const result = await fetch(image, { method, headers: { "If-None-Match": "*" } });
      expect(result.status).toBe(404);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      expect(await result.text()).toBe("");
    }
    expect(await catalog.readPublishedRevision(catalog.selected)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenLastCalledWith("research_catalog_publication_current", { p_identity: selected });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

it("serves a current revision by its catalog href and withholds the bytes when the head is withdrawn during download", async () => {
  const raw = readFileSync(new URL("./data/member-safe-master-offerings.generated.json", import.meta.url), "utf8");
  const dataset = loadMasterOfferingDataset(JSON.parse(raw));
  registerReviewedProductDataset(raw, dataset.products);
  const offering = dataset.products.find(row => row.id === "mo_b126ee9235f0a810dc95")!;
  const variant = offering.variants[0];
  const binding = loadBindingIndex({ env: {}, cwd: process.cwd() }).index.get(offering.id + "|" + variant.id)!;
  const selected = { offeringId: offering.id, offeringVariantId: variant.id, productId: binding.productId, variantId: binding.variantId };
  const mediaId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const revisionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const key = selected.productId + "/" + mediaId + "/sample.png";
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kvx8AAAAASUVORK5CYII=", "base64");
  const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
  const snapshot = { identity: selected, productVersion: 1, variantVersion: 1,
    content: { summary: "Pilot sample", overview: "Sample overview" }, sourceSha256: "1".repeat(64), contentSha256: "2".repeat(64),
    media: { id: mediaId, version: 1, altText: "Sample", contentType: "image/png", sizeBytes: bytes.length, storageIdentitySha256: digest(key) } };
  const evidence = { identity: selected, sourceSha256: snapshot.sourceSha256, contentSha256: snapshot.contentSha256,
    mediaId, mediaVersion: 1, contentApprovalSha256: "3".repeat(64), rightsApprovalSha256: "4".repeat(64),
    mediaSha256: digest(bytes), usage: "public_catalog_display" as const, state: "approved" as const, expiresAt: null,
    width: 1, height: 1, representation: "catalog_reference" as const, packagingDesign: false };
  const revision = { id: revisionId, identity: selected, snapshot, evidence };
  let current = true, withdrawDuringDownload = false;
  const row = { id: mediaId, product_id: selected.productId, state: "approved", version: 1,
    storage_key: key, content_type: "image/png", size_bytes: bytes.length, approved_by: "test-editor",
    approved_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" };
  const table = {
    select() { return this; }, eq() { return this; }, abortSignal() { return this; },
    async maybeSingle() { return { data: row, error: null }; },
  };
  const bucket = {
    async info() { return { data: { size: bytes.length, contentType: "image/png" }, error: null }; },
    download() {
      return { async asStream() {
        if (withdrawDuringDownload) current = false;
        return { data: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }), error: null };
      } };
    },
  };
  const app = express();
  const catalog = mountProductControlPublication(app, { selected, mediaBucket: "private-media",
    db: { rpc: async (name: string) => {
      if (name === "research_catalog_publication_current") return { data: { generation: current ? 1 : 2, revision: current ? revision : null }, error: null };
      if (name === "research_catalog_approval_for_source") return { data: evidence, error: null };
      throw new Error("Unexpected RPC " + name);
    },
      from: () => table, storage: { from: () => bucket, getBucket: async () => ({ data: { id: "private-media", public: false }, error: null }) } } as unknown as SupabaseClient,
    requireAdmin: (_req, res) => res.status(403).end(), assertBinding: async () => true, isEligible: async () => true,
  });
  const listings = createRequestIntentCatalog({
    serviceFor: () => ({ select: async () => ({ offerings: [offering], prices: new Map(), page: { page: 1, pageSize: 24, total: 1 } }) }),
    bindingFor: id => id === variant.id ? binding : null, offeringVariantFor: () => variant.id,
    catalogVersion: "publication-integration", publication: catalog,
  });
  let standing = false;
  const service = new RequestIntentService({
    catalog: listings, standing: { accepted: async () => standing },
    hasher: { stableHash: () => "0".repeat(64) },
  } as RequestIntentDependencies);
  const pass: express.RequestHandler = (_request, _response, next) => next();
  const root = "/api/research/early-access/request-intents";
  app.use(root, createRequestIntentRouter({
    service, enabled: () => true, staffReadEnabled: () => false,
    resolveCustomer: async () => ({ actorType: "member", authUserId: "fixture-auth", memberId: "fixture-member",
      earlyAccessCustomerRef: null, earlyAccessSessionHash: null, normalizedEmail: null, capabilities: new Set(["assisted_orders:submit"]) }),
    readRateLimit: pass, writeRateLimit: pass, mutationGuard: pass,
    care: {} as Parameters<typeof createRequestIntentRouter>[0]["care"],
    staffReader: {} as Parameters<typeof createRequestIntentRouter>[0]["staffReader"],
  }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    const listUrl = origin + root + "/catalog";
    expect((await fetch(listUrl)).status).toBe(403);
    standing = true;
    const readItem = async () => {
      const response = await fetch(listUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const page = await response.json();
      expect(page.total).toBe(1);
      return page.items[0];
    };
    current = false;
    const baseline = await readItem();
    current = true;
    const active = await readItem();
    expect(active).toEqual({ ...baseline, reviewedContent: active.reviewedContent, reviewedMedia: active.reviewedMedia });
    expect(active.reviewedContent.summary).toBe("Pilot sample");
    expect(active.reviewedMedia.primary.href).toBe(`/api/research/catalog-media/${revisionId}/${mediaId}`);
    const url = origin + active.reviewedMedia.primary.href;
    const visible = await fetch(url);
    expect(visible.status).toBe(200);
    expect(visible.headers.get("Cache-Control")).toBe("no-store");
    expect(Buffer.from(await visible.arrayBuffer())).toEqual(bytes);
    withdrawDuringDownload = true;
    const withdrawn = await fetch(url);
    expect(withdrawn.status).toBe(404);
    expect(await withdrawn.text()).toBe("");
    const fallback = await readItem();
    expect(fallback).toEqual(baseline);
    expect(fallback.productId).toBe(active.productId);
    expect(fallback.variantId).toBe(active.variantId);
    expect(fallback.reviewedContent.summary).toBeTruthy();
    expect(fallback.reviewedContent.summary).not.toBe(active.reviewedContent.summary);
    expect(fallback.reviewedMedia.primary.href).not.toBe(active.reviewedMedia.primary.href);
    expect((await fetch(url)).status).toBe(404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

it("reads a protected selected head during a hold and refuses approval without a current owner grant", async () => {
  const selected = { offeringId: "mo_ab", offeringVariantId: "mov_ab",
    productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", variantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
  const head = { identity: selected, generation: 3, currentRevisionId: null, revisions: [], operations: [], historyTruncated: false };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    expect(args.p_actor).toBe("fixture-staff");
    if (name === "research_catalog_publication_admin_state") return { data: head, error: null };
    if (name === "research_catalog_approval_state") return { data: {
      identity: selected, approvalVersion: 0, ownerCapability: null, approvals: [], historyTruncated: false,
    }, error: null };
    if (name === "research_catalog_approval_replay") return { data: null, error: null };
    throw new Error("Unexpected RPC " + name);
  });
  const app = express();
  app.use(express.json());
  mountProductControlPublication(app, {
    selected, db: { rpc } as unknown as SupabaseClient, mediaBucket: "private-media",
    requireAdmin: (req, res, next) => {
      if (req.get("X-Fixture-Session") !== "fixture-staff") return res.sendStatus(403);
      Object.assign(req, { adminEmail: "fixture-staff" });
      next();
    },
    assertBinding: async () => false, isEligible: async () => false,
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port
      + "/api/admin/research/products/" + selected.productId + "/variants/" + selected.variantId + "/catalog-publication";
    expect((await fetch(base)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    const headers = { "X-Fixture-Session": "fixture-staff" };
    const response = await fetch(base, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual(head);
    const ownerStatus = await fetch(base + "/approval", { headers });
    expect(ownerStatus.status).toBe(200);
    expect(await ownerStatus.json()).toEqual({ identity: selected, approvalVersion: 0, ownerAuthorized: false,
      approvals: [], historyTruncated: false });
    const beforeRefusals = rpc.mock.calls.length;
    for (const path of ["?actor=somebody", "/approval?owner=true"]) {
      expect((await fetch(base + path, { headers })).status).toBe(400);
    }
    expect(rpc.mock.calls).toHaveLength(beforeRefusals);
    const denied = await fetch(base + "/approval/cccccccc-cccc-4ccc-8ccc-cccccccccccc/revoke", {
      method: "POST", headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": "fixture-owner-denial-001" },
      body: JSON.stringify({ expectedApprovalVersion: 0, reason: "controlled fixture" }),
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: "publication_approval_owner_required", operationConfirmed: false });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["research_catalog_publication_admin_state", "research_catalog_approval_state", "research_catalog_approval_replay", "research_catalog_approval_state"]);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
