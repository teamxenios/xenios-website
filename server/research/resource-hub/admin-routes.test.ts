import { describe, expect, it, vi } from "vitest";
import type { Request, RequestHandler, Response } from "express";
import {
  RESOURCE_HUB_ADMIN_ITEM_PATH,
  RESOURCE_HUB_ADMIN_LIST_PATH,
  RESOURCE_HUB_ADMIN_UPLOAD_PATH,
  RESOURCE_HUB_ADMIN_VERSION_DOWNLOAD_PATH,
  RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH,
  RESOURCE_UPLOAD_METADATA_HEADER,
  encodeResourceUploadMetadata,
  type ResourceUploadInput,
} from "@shared/research/resource-hub/contract";
import { RESOURCE_HUB_ADMIN_PATHS, registerResourceHubAdminApi } from "./admin-routes";
import { createMemoryResourceBytesStore } from "./bytes-store";
import { createResourceHubService, type ResourceHubService } from "./service";
import { createInMemoryResourceHubStore } from "./store";

// ---------------------------------------------------------------------------
// Minimal Express double: records registrations (guard first, handler last,
// any middleware between) and invokes one handler with a shaped request.
// ---------------------------------------------------------------------------

type Handler = (req: Request, res: Response, next: () => void) => unknown;
interface Registered {
  method: string;
  path: string;
  guard: Handler;
  middlewares: Handler[];
  handler: Handler;
}

function fakeApp() {
  const routes: Registered[] = [];
  const add = (method: string) => (path: string, ...handlers: Handler[]) => {
    routes.push({ method, path, guard: handlers[0]!, middlewares: handlers.slice(1, -1), handler: handlers[handlers.length - 1]! });
  };
  return { app: { get: add("get"), post: add("post"), patch: add("patch"), delete: add("delete"), put: add("put") } as never, routes };
}

function fakeRes() {
  const captured = { status: 200, body: undefined as unknown, headers: {} as Record<string, string>, sent: null as Buffer | null };
  const res = {
    headersSent: false,
    set(key: string, value: string) {
      captured.headers[key] = value;
      return res;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      res.headersSent = true;
      return res;
    },
    send(payload: Buffer) {
      captured.sent = payload;
      res.headersSent = true;
      return res;
    },
  };
  return { res: res as unknown as Response, captured };
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n", "latin1");
const ADMIN = "founder@xenios.test";

function req(input: {
  adminEmail?: string;
  params?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}): Request {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = v;
  return {
    adminEmail: input.adminEmail,
    params: input.params ?? {},
    body: input.body ?? {},
    query: {},
    headers,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

/** An upload request as the client adapter sends it: raw PDF body plus the metadata header. */
function uploadReq(metadata: unknown, body: unknown = PDF, contentType = "application/pdf", adminEmail: string | undefined = ADMIN): Request {
  const headers: Record<string, string> = { "content-type": contentType };
  if (metadata !== undefined) headers[RESOURCE_UPLOAD_METADATA_HEADER] = encodeResourceUploadMetadata(metadata as ResourceUploadInput);
  return req({ adminEmail, body, headers });
}

function service(): ResourceHubService {
  let n = 0;
  return createResourceHubService({
    store: createInMemoryResourceHubStore(),
    bytes: createMemoryResourceBytesStore(),
    now: () => new Date(Date.UTC(2026, 8, 6, 12, 0, n)),
    newId: () => `id-${++n}`,
  });
}

const guard: RequestHandler = (_req, _res, next) => next();
const passThroughParser: RequestHandler = (_req, _res, next) => next();

function register(svc: ResourceHubService = service()) {
  const { app, routes } = fakeApp();
  registerResourceHubAdminApi(app, guard, { service: svc, uploadBodyParser: passThroughParser });
  return { routes, svc };
}

async function call(routes: Registered[], method: string, path: string, request: Request) {
  const found = routes.find((r) => r.method === method && r.path === path);
  if (!found) throw new Error(`no ${method} ${path}`);
  const { res, captured } = fakeRes();
  await found.handler(request, res, () => undefined);
  // Handlers resolve asynchronously; give the guarded promise a turn to settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return captured;
}

const VALID_METADATA: ResourceUploadInput = {
  title: "Partner introduction one-pager",
  purpose: "A one-page introduction a partner may hand to a prospective member.",
  usagePolicy: "external_share",
  audience: ["all_partners"],
  originalFilename: "intro.pdf",
  idempotencyKey: "upload-key-0001",
};

describe("registration", () => {
  it("publishes exactly the five literal admin doors from the shared contract, behind the injected guard", () => {
    const { routes } = register();
    expect(routes.map((r) => `${r.method.toUpperCase()} ${r.path}`)).toEqual([
      `GET ${RESOURCE_HUB_ADMIN_LIST_PATH}`,
      `POST ${RESOURCE_HUB_ADMIN_UPLOAD_PATH}`,
      `GET ${RESOURCE_HUB_ADMIN_ITEM_PATH}`,
      `POST ${RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH}`,
      `GET ${RESOURCE_HUB_ADMIN_VERSION_DOWNLOAD_PATH}`,
    ]);
    routes.forEach((r) => expect(r.guard).toBe(guard));
    expect(Object.values(RESOURCE_HUB_ADMIN_PATHS).every((p) => p.startsWith("/api/admin/research/resource-hub/"))).toBe(true);
  });

  it("puts the admin guard BEFORE the upload body parser, so nobody unauthenticated can make the server buffer a file", () => {
    const { routes } = register();
    const upload = routes.find((r) => r.method === "post" && r.path === RESOURCE_HUB_ADMIN_UPLOAD_PATH)!;
    expect(upload.guard).toBe(guard);
    expect(upload.middlewares[0]).toBe(passThroughParser);
  });
});

describe("authorization", () => {
  it("answers 401 when the canonical guard did not stamp an admin actor", async () => {
    const { routes } = register();
    const out = await call(routes, "get", RESOURCE_HUB_ADMIN_LIST_PATH, req({}));
    expect(out.status).toBe(401);
    expect(out.body).toMatchObject({ ok: false, code: "unauthorized" });
    expect(out.headers["Cache-Control"]).toBe("no-store");
  });

  it("takes the actor from the guard, never from the metadata", async () => {
    const { routes, svc } = register();
    const out = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq({ ...VALID_METADATA, actor: "attacker@example.com" }));
    // strict schema: the extra field is a validation error, so nothing is stored.
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ ok: false, code: "invalid_resource_metadata" });
    expect(await svc.listAdmin()).toEqual([]);
  });
});

describe("upload transport", () => {
  it("rejects a missing or malformed metadata header without reading the file", async () => {
    const { routes, svc } = register();
    const missing = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq(undefined));
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ ok: false, code: "invalid_resource_metadata", fieldErrors: { body: ["metadata header missing or malformed"] } });
    const garbage = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, req({ adminEmail: ADMIN, body: PDF, headers: { "content-type": "application/pdf", [RESOURCE_UPLOAD_METADATA_HEADER]: "%%%not-base64url%%%" } }));
    expect(garbage.status).toBe(400);
    expect(await svc.listAdmin()).toEqual([]);
  });

  it("rejects malformed metadata with field errors and writes nothing", async () => {
    const { routes, svc } = register();
    const out = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq({ ...VALID_METADATA, title: "x", audience: [] }));
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ ok: false, code: "invalid_resource_metadata" });
    expect(Object.keys((out.body as { fieldErrors: Record<string, string[]> }).fieldErrors).sort()).toEqual(["audience", "title"]);
    expect(await svc.listAdmin()).toEqual([]);
  });

  it("rejects a body that is not a raw PDF: wrong content type, empty body, or non-PDF bytes", async () => {
    const { routes, svc } = register();
    const json = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq(VALID_METADATA, { some: "json" }, "application/json"));
    expect(json.status).toBe(400);
    expect(json.body).toMatchObject({ ok: false, code: "invalid_resource_upload", fieldErrors: { file: ["content type must be application/pdf"] } });
    const empty = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq(VALID_METADATA, Buffer.alloc(0)));
    expect(empty.status).toBe(400);
    expect(empty.body).toMatchObject({ ok: false, code: "invalid_resource_upload", fieldErrors: { file: ["file is empty"] } });
    const notPdf = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq(VALID_METADATA, Buffer.from("MZ not a pdf")));
    expect(notPdf.status).toBe(400);
    expect(notPdf.body).toMatchObject({ ok: false, code: "invalid_resource_upload" });
    expect((notPdf.body as { fieldErrors: { file: string[] } }).fieldErrors.file).toContain("file does not start with a PDF signature");
    expect(await svc.listAdmin()).toEqual([]);
  });

  it("ignores content-type parameters when judging the declared type", async () => {
    const { routes } = register();
    const out = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq(VALID_METADATA, PDF, "application/pdf; charset=binary"));
    expect(out.status).toBe(200);
  });
});

describe("upload and review", () => {
  it("creates a draft, then walks it through review to publication with conflicts as 409", async () => {
    const { routes } = register();
    const created = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq(VALID_METADATA));
    expect(created.status).toBe(200);
    const resource = (created.body as { resource: { resourceId: string; versions: Array<{ versionId: string; state: string }> } }).resource;
    expect(resource.versions[0]!.state).toBe("draft");
    const params = { resourceId: resource.resourceId, versionId: resource.versions[0]!.versionId };

    const early = await call(routes, "post", RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH, req({ adminEmail: ADMIN, params, body: { action: "publish", idempotencyKey: "review-k1" } }));
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ ok: false, code: "resource_state_conflict" });

    const noReason = await call(routes, "post", RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH, req({ adminEmail: ADMIN, params, body: { action: "approve_content", idempotencyKey: "review-k1b" } }));
    expect(noReason.status).toBe(400);
    expect(noReason.body).toMatchObject({ ok: false, code: "invalid_resource_metadata", fieldErrors: { reason: [expect.stringContaining("required")] } });

    const approved = await call(routes, "post", RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH, req({ adminEmail: ADMIN, params, body: { action: "approve_content", reason: "Matches the brief.", idempotencyKey: "review-k2" } }));
    expect(approved.status).toBe(200);
    const published = await call(routes, "post", RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH, req({ adminEmail: ADMIN, params, body: { action: "publish", idempotencyKey: "review-k3" } }));
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ ok: true, resource: { currentPublishedVersionId: params.versionId } });

    const item = await call(routes, "get", RESOURCE_HUB_ADMIN_ITEM_PATH, req({ adminEmail: ADMIN, params }));
    expect(item.status).toBe(200);
    expect(JSON.stringify(item.body)).not.toContain("storageKey");

    const download = await call(routes, "get", RESOURCE_HUB_ADMIN_VERSION_DOWNLOAD_PATH, req({ adminEmail: ADMIN, params }));
    expect(download.status).toBe(200);
    expect(download.headers["Content-Type"]).toBe("application/pdf");
    expect(download.headers["Content-Disposition"]).toBe(`attachment; filename="${params.resourceId}-v1.pdf"`);
    expect(download.sent?.equals(PDF)).toBe(true);
  });

  it("is idempotent per upload key at the HTTP seam", async () => {
    const { routes, svc } = register();
    const first = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq(VALID_METADATA));
    const second = await call(routes, "post", RESOURCE_HUB_ADMIN_UPLOAD_PATH, uploadReq(VALID_METADATA));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await svc.listAdmin()).toHaveLength(1);
    expect((await svc.listAdmin())[0]!.versions).toHaveLength(1);
  });

  it("answers 404 for an unknown resource on item, review, and download", async () => {
    const { routes } = register();
    const params = { resourceId: "id-none", versionId: "id-none" };
    expect((await call(routes, "get", RESOURCE_HUB_ADMIN_ITEM_PATH, req({ adminEmail: ADMIN, params }))).status).toBe(404);
    expect((await call(routes, "post", RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH, req({ adminEmail: ADMIN, params, body: { action: "request_review", idempotencyKey: "review-k0" } }))).status).toBe(404);
    expect((await call(routes, "get", RESOURCE_HUB_ADMIN_VERSION_DOWNLOAD_PATH, req({ adminEmail: ADMIN, params }))).status).toBe(404);
  });

  it("turns an unexpected service failure into 503, never a stack trace", async () => {
    const broken = { ...service(), listAdmin: vi.fn(async () => { throw new Error("database offline"); }) } as unknown as ResourceHubService;
    const { routes } = register(broken);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = await call(routes, "get", RESOURCE_HUB_ADMIN_LIST_PATH, req({ adminEmail: ADMIN }));
    spy.mockRestore();
    expect(out.status).toBe(503);
    expect(out.body).toMatchObject({ ok: false, code: "resource_hub_unavailable" });
    expect(JSON.stringify(out.body)).not.toContain("database offline");
  });
});
