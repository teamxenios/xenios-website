// @vitest-environment jsdom
//
// RH-B28-2: a private partner download that completes after its session has
// changed must not save anything. Every case below uses a controlled delayed
// response and asserts the save side effects directly (object URL creation,
// anchor click), never only a loading flag.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESOURCE_USAGE_POLICY_LABELS, type ResourceCardDto, type ResourceLibraryResponse } from "@shared/research/resource-hub/contract";

const session = vi.hoisted(() => ({ token: "member-a-token" as string | null }));
const mocks = vi.hoisted(() => ({ library: vi.fn() }));

vi.mock("../core", () => ({ useResearch: () => ({ memberToken: session.token }) }));
vi.mock("../adapters/partner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../adapters/partner")>()),
  getPartnerResources: mocks.library,
}));

import Resources from "../pages/partners/Resources";

const RESOURCE_ID = "5f1c2f3a-0000-4000-8000-000000000001";
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const jwt = (sub: string, signature = "sig") => `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ sub }))}.${signature}`;

function card(overrides: Partial<ResourceCardDto> = {}): ResourceCardDto {
  return {
    resourceId: RESOURCE_ID,
    versionId: "6a1c2f3a-0000-4000-8000-000000000002",
    title: "Affiliate introduction one-pager",
    purpose: "Send this to someone considering becoming an affiliate.",
    kind: "pdf",
    versionNumber: 2,
    usagePolicy: "external_share",
    usageLabel: RESOURCE_USAGE_POLICY_LABELS.external_share,
    audience: ["all_partners"],
    publishedAt: "2026-09-05T10:00:00.000Z",
    reviewedAt: "2026-09-04T10:00:00.000Z",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    actions: { read: true, download: true, share: false },
    downloadPath: `/api/research/partner/resources/${RESOURCE_ID}/download`,
    ...overrides,
  };
}
const library = (): ResourceLibraryResponse => ({ ok: true, resources: [card()], asOf: "2026-09-06T00:00:00.000Z" });

type Deferred = { resolve: (value: unknown) => void; reject: (error: unknown) => void; promise: Promise<unknown>; signal?: AbortSignal };
function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject, promise };
}

function pdfResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(status === 200 ? { "content-type": "application/pdf", "content-disposition": 'attachment; filename="intro-v2.pdf"' } : { "content-type": "application/json" }),
    blob: async () => new Blob(["%PDF-1.4 synthetic"], { type: "application/pdf" }),
    json: async () => ({ ok: false, code: "forbidden" }),
  };
}

let host: HTMLDivElement;
let root: Root;
let pending: Deferred[];
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let saved: string[];

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const render = () => act(async () => { root.render(<Resources />); });
const downloadButton = () => host.querySelector<HTMLButtonElement>(`[data-testid="download-${RESOURCE_ID}"]`);
const click = (el: HTMLElement | null) => act(async () => { el?.click(); });
const alerts = () => Array.from(host.querySelectorAll('[role="alert"]')).map((el) => el.textContent ?? "");

async function switchSession(token: string | null) {
  session.token = token;
  await render();
  await flush();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  session.token = "member-a-token";
  pending = [];
  mocks.library.mockReset();
  mocks.library.mockResolvedValue({ kind: "ok", data: library() });
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      const d = deferred();
      d.signal = init?.signal;
      pending.push(d);
      // A real fetch rejects when its signal aborts; mirror that.
      init?.signal?.addEventListener("abort", () => d.reject(new DOMException("aborted", "AbortError")));
      return d.promise;
    }),
  );
  createObjectURL = vi.fn(() => "blob:synthetic");
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  saved = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.getAttribute("download") ?? "");
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function startDownload() {
  await render();
  await flush();
  expect(downloadButton()).not.toBeNull();
  await click(downloadButton());
  expect(pending).toHaveLength(1);
  expect(pending[0]!.signal).toBeInstanceOf(AbortSignal);
  return pending[0]!;
}

function expectNothingSaved() {
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(saved).toEqual([]);
}

describe("RH-B28-2: partner download bound to the session that started it", () => {
  it("A signs out before the bytes arrive: the request is aborted and nothing is saved", async () => {
    const request = await startDownload();
    await switchSession(null);
    expect(request.signal?.aborted).toBe(true);
    // Even if bytes still arrived, they would be discarded.
    request.resolve(pdfResponse());
    await flush();
    expectNothingSaved();
    expect(alerts()).toEqual([]);
  });

  it("A is replaced by B before the bytes arrive: aborted, nothing saved, no stale message in B's view", async () => {
    const request = await startDownload();
    await switchSession("member-b-token");
    expect(request.signal?.aborted).toBe(true);
    request.resolve(pdfResponse());
    await flush();
    expectNothingSaved();
    expect(alerts()).toEqual([]);
    // B's own library was loaded with B's token.
    expect(mocks.library).toHaveBeenLastCalledWith("member-b-token");
  });

  it("the card unmounts before completion: nothing is saved and no state is written", async () => {
    const request = await startDownload();
    await act(async () => root.unmount());
    root = createRoot(host);
    expect(request.signal?.aborted).toBe(true);
    request.resolve(pdfResponse());
    await flush();
    expectNothingSaved();
  });

  it("an older download finishing after a newer one on the same card is discarded; the newer one saves once", async () => {
    await render();
    await flush();
    // Two clicks in one batch: both handlers start before React re-renders
    // the working (disabled) state, which is exactly the double-click race.
    await act(async () => {
      downloadButton()!.click();
      downloadButton()!.click();
    });
    expect(pending).toHaveLength(2);
    expect(pending[0]!.signal?.aborted).toBe(false);
    pending[1]!.resolve(pdfResponse());
    await flush();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    pending[0]!.resolve(pdfResponse());
    await flush();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["intro-v2.pdf"]);
  });

  it("a stale failure after an account switch shows no error to the new account", async () => {
    const request = await startDownload();
    await switchSession("member-b-token");
    request.resolve(pdfResponse(403));
    await flush();
    expect(alerts()).toEqual([]);
    expectNothingSaved();
  });

  it("a legitimate current-account completion still saves exactly once and revokes its URL", async () => {
    const request = await startDownload();
    request.resolve(pdfResponse());
    await flush();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["intro-v2.pdf"]);
    // The object URL is revoked shortly after the save starts (real timer).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:synthetic");
  });

  it("a same-account token refresh mid-download still saves for that account", async () => {
    session.token = jwt("member-a", "before-refresh");
    const request = await startDownload();
    await switchSession(jwt("member-a", "after-refresh"));
    expect(request.signal?.aborted).toBe(false);
    request.resolve(pdfResponse());
    await flush();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["intro-v2.pdf"]);
  });

  it("a current-account failure is still reported honestly", async () => {
    const request = await startDownload();
    request.resolve(pdfResponse(403));
    await flush();
    expect(alerts().join(" ")).toContain("not available to your account");
    expectNothingSaved();
  });
});
