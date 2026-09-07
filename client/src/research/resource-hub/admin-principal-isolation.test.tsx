// @vitest-environment jsdom
//
// RH-B28-3 (and RH-B28-2 for admin previews): the Resource Hub admin body,
// its loaded library, forms, selections and outcome line belong to the
// current principal only. Every account change is asserted on the FIRST
// render after the change (synchronously, before any effect), and every
// delayed completion is asserted on its side effects.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceAdminDto, ResourceAdminListResponse, ResourceVersionAdminDto } from "@shared/research/resource-hub/contract";

const mocks = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn(), review: vi.fn(), download: vi.fn() }));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: vi.fn(async () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } })),
}));
vi.mock("../adapters/resourceHubAdmin", () => ({
  listResourceHubResources: mocks.list,
  uploadResourceHubVersion: mocks.upload,
  reviewResourceHubVersion: mocks.review,
  downloadResourceHubVersion: mocks.download,
  adminResourceVersionDownloadPath: (resourceId: string, versionId: string) => `/api/admin/research/resource-hub/resources/${resourceId}/versions/${versionId}/download`,
}));

import { ResourceHubAdminForPrincipal } from "../pages/adminx/ResourceHubAdmin";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const jwt = (sub: string, signature = "sig") => `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ sub }))}.${signature}`;
const ADMIN_A = jwt("admin-a", "a1");
const ADMIN_A_REFRESHED = jwt("admin-a", "a2");
const ADMIN_B = jwt("admin-b", "b1");
const RESOURCE_A_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_B_ID = "22222222-2222-4222-8222-222222222222";

function version(overrides: Partial<ResourceVersionAdminDto> = {}): ResourceVersionAdminDto {
  return {
    versionId: "v-published",
    versionNumber: 1,
    state: "published",
    usagePolicy: "private",
    audience: ["all_partners"],
    sizeBytes: 2048,
    sha256: "b".repeat(64),
    originalFilename: "guide.pdf",
    contentType: "application/pdf",
    validation: { ok: true, reasons: [] },
    uploadedAt: "2026-09-06T01:00:00.000Z",
    reviewedAt: "2026-09-06T02:00:00.000Z",
    publishedAt: "2026-09-06T03:00:00.000Z",
    withdrawnAt: null,
    supersedesVersionId: null,
    changeSummary: null,
    ...overrides,
  };
}
function resource(overrides: Partial<ResourceAdminDto> = {}): ResourceAdminDto {
  return {
    resourceId: RESOURCE_A_ID,
    title: "ACCOUNT-A-ONLY partner onboarding guide",
    purpose: "Account A's material; must never render for anyone else.",
    kind: "pdf",
    createdAt: "2026-09-06T00:30:00.000Z",
    currentPublishedVersionId: "v-published",
    versions: [version()],
    ...overrides,
  };
}
const libraryA = (): ResourceAdminListResponse => ({ ok: true, resources: [resource()] });
const libraryB = (): ResourceAdminListResponse => ({
  ok: true,
  resources: [resource({ resourceId: RESOURCE_B_ID, title: "ACCOUNT-B-ONLY affiliate brochure", purpose: "Account B's material.", versions: [version({ versionId: "v-b-published" })] })],
});

type Deferred<T = unknown> = { resolve: (value: T) => void; promise: Promise<T> };
function deferred<T = unknown>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { resolve, promise };
}

let host: HTMLDivElement;
let root: Root;
let createObjectURL: ReturnType<typeof vi.fn>;
let saved: string[];

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const byTestId = <T extends HTMLElement>(id: string) => host.querySelector<T>(`[data-testid="${id}"]`);
const text = () => host.textContent ?? "";
const click = (el: HTMLElement | null) => act(async () => { el?.click(); });
async function mount(token: string | null) {
  await act(async () => {
    root.render(token ? <ResourceHubAdminForPrincipal token={token} /> : null);
  });
}
function setValue(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!el) throw new Error("missing field");
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  return act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.list.mockReset();
  mocks.upload.mockReset();
  mocks.review.mockReset();
  mocks.download.mockReset();
  mocks.list.mockImplementation(async (token: string) => ({ kind: "ok", data: token === ADMIN_B ? libraryB() : libraryA() }));
  createObjectURL = vi.fn(() => "blob:synthetic");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
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
  vi.restoreAllMocks();
});

async function loadedAsA() {
  await mount(ADMIN_A);
  await flush();
  expect(text()).toContain("ACCOUNT-A-ONLY");
}

describe("RH-B28-3: the admin body belongs to the current principal", () => {
  it("A to B: the first render after the switch shows loading with none of A's metadata, then only B's", async () => {
    await loadedAsA();
    const bList = deferred<{ kind: "ok"; data: ResourceAdminListResponse }>();
    mocks.list.mockImplementation((token: string) => (token === ADMIN_B ? bList.promise : Promise.resolve({ kind: "ok", data: libraryA() })));
    // Synchronous assertion: no flush between the render and the check.
    await act(async () => {
      root.render(<ResourceHubAdminForPrincipal token={ADMIN_B} />);
    });
    expect(text()).not.toContain("ACCOUNT-A-ONLY");
    expect(text()).not.toContain("Account A's material");
    expect(byTestId("resource-hub-outcome")).toBeNull();
    bList.resolve({ kind: "ok", data: libraryB() });
    await flush();
    expect(text()).toContain("ACCOUNT-B-ONLY");
    expect(text()).not.toContain("ACCOUNT-A-ONLY");
  });

  it("A to signed out: nothing of A remains rendered", async () => {
    await loadedAsA();
    await mount(null);
    expect(text()).toBe("");
  });

  it("A to a denied B: B sees the denial and none of A's data", async () => {
    await loadedAsA();
    mocks.list.mockImplementation(async (token: string) => (token === ADMIN_B ? { kind: "forbidden", message: "Forbidden" } : { kind: "ok", data: libraryA() }));
    await act(async () => {
      root.render(<ResourceHubAdminForPrincipal token={ADMIN_B} />);
    });
    expect(text()).not.toContain("ACCOUNT-A-ONLY");
    await flush();
    expect(text()).not.toContain("ACCOUNT-A-ONLY");
    expect(text()).toMatch(/denied|Forbidden/u);
  });

  it("a stale list response for A arriving after B signed in cannot overwrite B's state", async () => {
    const aList = deferred<{ kind: "ok"; data: ResourceAdminListResponse }>();
    mocks.list.mockImplementation((token: string) => (token === ADMIN_A ? aList.promise : Promise.resolve({ kind: "ok", data: libraryB() })));
    await mount(ADMIN_A);
    await mount(ADMIN_B);
    await flush();
    expect(text()).toContain("ACCOUNT-B-ONLY");
    aList.resolve({ kind: "ok", data: libraryA() });
    await flush();
    expect(text()).toContain("ACCOUNT-B-ONLY");
    expect(text()).not.toContain("ACCOUNT-A-ONLY");
  });

  it("A's unsaved upload form and A's outcome line do not survive an account change", async () => {
    await loadedAsA();
    await setValue(host.querySelector("#resource-hub-title"), "ACCOUNT-A-DRAFT-TITLE");
    expect((host.querySelector("#resource-hub-title") as HTMLInputElement).value).toBe("ACCOUNT-A-DRAFT-TITLE");
    // Record an outcome as A.
    mocks.review.mockResolvedValue({ kind: "ok", data: { ok: true, resource: resource({ versions: [version({ state: "withdrawn", withdrawnAt: "2026-09-06T04:00:00.000Z" })] }) } });
    await click(byTestId("action-withdraw-v-published"));
    await setValue(host.querySelector<HTMLInputElement>("#reason-v-published"), "Superseded pricing.");
    await click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Confirm withdrawal") ?? null);
    await flush();
    expect(byTestId("resource-hub-outcome")?.textContent).toContain("Recorded.");
    await act(async () => {
      root.render(<ResourceHubAdminForPrincipal token={ADMIN_B} />);
    });
    expect(byTestId("resource-hub-outcome")).toBeNull();
    expect((host.querySelector("#resource-hub-title") as HTMLInputElement | null)?.value ?? "").toBe("");
    expect(text()).not.toContain("ACCOUNT-A-DRAFT-TITLE");
  });

  it("a same-account token refresh keeps the account's work and reloads with the new token", async () => {
    await loadedAsA();
    await setValue(host.querySelector("#resource-hub-title"), "keep-me");
    await click(byTestId("action-withdraw-v-published"));
    await setValue(host.querySelector<HTMLInputElement>("#reason-v-published"), "Keep this reason too.");
    const refreshed = deferred();
    mocks.list.mockReturnValueOnce(refreshed.promise);
    await act(async () => {
      root.render(<ResourceHubAdminForPrincipal token={ADMIN_A_REFRESHED} />);
    });
    expect((host.querySelector("#resource-hub-title") as HTMLInputElement).value).toBe("keep-me");
    expect((host.querySelector("#reason-v-published") as HTMLInputElement).value).toBe("Keep this reason too.");
    expect(mocks.list).toHaveBeenLastCalledWith(ADMIN_A_REFRESHED);
    expect(text()).toContain("ACCOUNT-A-ONLY");
    refreshed.resolve({ kind: "ok", data: libraryA() });
    await flush();
    expect((host.querySelector("#resource-hub-title") as HTMLInputElement).value).toBe("keep-me");
    expect((host.querySelector("#reason-v-published") as HTMLInputElement).value).toBe("Keep this reason too.");
  });

  it("overlapping list loads on the same account: the older completion cannot replace the newer", async () => {
    const first = deferred<{ kind: "ok"; data: ResourceAdminListResponse }>();
    const second = deferred<{ kind: "ok"; data: ResourceAdminListResponse }>();
    let calls = 0;
    mocks.list.mockImplementation(() => (++calls === 1 ? first.promise : second.promise));
    await mount(ADMIN_A);
    await mount(ADMIN_A_REFRESHED);
    second.resolve({ kind: "ok", data: libraryB() });
    await flush();
    expect(text()).toContain("ACCOUNT-B-ONLY");
    first.resolve({ kind: "ok", data: libraryA() });
    await flush();
    expect(text()).toContain("ACCOUNT-B-ONLY");
    expect(text()).not.toContain("ACCOUNT-A-ONLY");
  });
});

const failedLoads = [
  { kind: "forbidden", message: "Access removed." },
  { kind: "unauthorized" },
  { kind: "unavailable" },
  { kind: "denied", code: "resource_hub_unavailable", message: "Library access is closed." },
  { kind: "error", message: "The connection failed." },
] as const;

function expectLibraryHidden() {
  expect(text()).not.toContain("ACCOUNT-A-ONLY");
  expect(text()).not.toContain("Account A's material");
  expect(byTestId("resource-hub-upload")).toBeNull();
  expect(byTestId("preview-v-published")).toBeNull();
  expect(byTestId("action-withdraw-v-published")).toBeNull();
  expect(byTestId("resource-hub-outcome")).toBeNull();
}

async function recordWithdrawal() {
  mocks.review.mockResolvedValue({ kind: "ok", data: { ok: true, resource: resource({ versions: [version({ state: "withdrawn" })] }) } });
  await click(byTestId("action-withdraw-v-published"));
  await setValue(host.querySelector<HTMLInputElement>("#reason-v-published"), "Superseded pricing.");
  await click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Confirm withdrawal") ?? null);
  await flush();
}

describe("admin list authorization cannot be restored by a retry", () => {
  it.each(failedLoads)("ok -> $kind -> loading hides the old snapshot until a fresh ok", async (failure) => {
    await loadedAsA();
    await setValue(host.querySelector("#resource-hub-title"), "DISCARDED-DRAFT-TITLE");
    await click(byTestId("action-withdraw-v-published"));
    await setValue(host.querySelector<HTMLInputElement>("#reason-v-published"), "DISCARDED-REVIEW-REASON");
    mocks.list.mockResolvedValueOnce(failure);
    await mount(ADMIN_A_REFRESHED);
    await flush();
    expectLibraryHidden();

    const retry = deferred();
    mocks.list.mockReturnValueOnce(retry.promise);
    if (failure.kind === "error") {
      const retryButton = Array.from(host.querySelectorAll("button")).find((button) => /retry|try again/iu.test(button.textContent ?? ""));
      expect(retryButton).toBeDefined();
      await click(retryButton ?? null);
    } else {
      await mount(jwt("admin-a", "a3"));
    }
    expect(mocks.list).toHaveBeenCalledTimes(3);
    expectLibraryHidden();

    retry.resolve({ kind: "ok", data: { ok: true, resources: [resource({ title: "FRESH-A-AUTHORIZED resource" })] } });
    await flush();
    expect(text()).toContain("FRESH-A-AUTHORIZED resource");
    expect(text()).not.toContain("ACCOUNT-A-ONLY");
    expect((host.querySelector("#resource-hub-title") as HTMLInputElement).value).toBe("");
    expect(host.querySelector("#reason-v-published")).toBeNull();
    expect(byTestId("resource-hub-outcome")).toBeNull();
  });

  it.each(failedLoads)("a recorded action's outcome is cleared on $kind and stays cleared after recovery", async (failure) => {
    await loadedAsA();
    const refreshed = deferred();
    mocks.list.mockReturnValueOnce(refreshed.promise);
    await recordWithdrawal();
    expect(byTestId("resource-hub-outcome")?.textContent).toContain("ACCOUNT-A-ONLY");
    expect(text()).toContain("ACCOUNT-A-ONLY");

    refreshed.resolve(failure);
    await flush();
    expectLibraryHidden();
    const retry = deferred();
    mocks.list.mockReturnValueOnce(retry.promise);
    await mount(ADMIN_A_REFRESHED);
    expectLibraryHidden();
    retry.resolve({ kind: "ok", data: libraryA() });
    await flush();
    expect(text()).toContain("ACCOUNT-A-ONLY");
    expect(byTestId("resource-hub-outcome")).toBeNull();
  });

  it("a review completing after the list denies this same admin cannot restore its outcome", async () => {
    await loadedAsA();
    const review = deferred();
    mocks.review.mockReturnValueOnce(review.promise);
    await click(byTestId("action-withdraw-v-published"));
    await setValue(host.querySelector<HTMLInputElement>("#reason-v-published"), "Superseded pricing.");
    await click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Confirm withdrawal") ?? null);
    mocks.list.mockResolvedValueOnce({ kind: "forbidden", message: "Access removed." });
    await mount(ADMIN_A_REFRESHED);
    await flush();
    expectLibraryHidden();
    review.resolve({ kind: "ok", data: { ok: true, resource: resource({ versions: [version({ state: "withdrawn" })] }) } });
    await flush();
    expectLibraryHidden();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });
});

describe("RH-B28-2 (admin): previews and actions are bound to the admin who started them", () => {
  it("a delayed preview started by A does not save after B signs in, nor after sign-out, nor after unmount", async () => {
    for (const next of [ADMIN_B, null, "unmount"] as const) {
      const bytes = deferred();
      mocks.download.mockImplementation((_t: string, _r: string, _v: string, options?: { signal?: AbortSignal }) => {
        options?.signal?.addEventListener("abort", () => bytes.resolve({ kind: "error", message: "aborted" }));
        return bytes.promise;
      });
      await loadedAsA();
      await click(byTestId("preview-v-published"));
      expect(mocks.download).toHaveBeenCalledWith(ADMIN_A, RESOURCE_A_ID, "v-published", { signal: expect.any(AbortSignal) });
      if (next === "unmount") {
        await act(async () => root.unmount());
        root = createRoot(host);
      } else {
        await mount(next);
      }
      bytes.resolve({ kind: "ok", blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }), filename: "guide.pdf" });
      await flush();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(saved).toEqual([]);
      await act(async () => root.unmount());
      root = createRoot(host);
      mocks.download.mockReset();
    }
  });

  it("a delayed preview for the current admin still saves exactly once", async () => {
    const bytes = deferred();
    mocks.download.mockImplementation(() => bytes.promise);
    await loadedAsA();
    await click(byTestId("preview-v-published"));
    bytes.resolve({ kind: "ok", blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }), filename: "guide.pdf" });
    await flush();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["guide.pdf"]);
  });

  it("a stale review completion after an account switch writes no outcome for the new account", async () => {
    const answer = deferred();
    mocks.review.mockImplementation(() => answer.promise);
    await loadedAsA();
    await click(byTestId("action-withdraw-v-published"));
    await setValue(host.querySelector<HTMLInputElement>("#reason-v-published"), "Superseded pricing.");
    await click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Confirm withdrawal") ?? null);
    await mount(ADMIN_B);
    await flush();
    answer.resolve({ kind: "ok", data: { ok: true, resource: resource({ versions: [version({ state: "withdrawn" })] }) } });
    await flush();
    expect(byTestId("resource-hub-outcome")).toBeNull();
    expect(text()).toContain("ACCOUNT-B-ONLY");
    expect(text()).not.toContain("ACCOUNT-A-ONLY");
    // B's list was loaded once for B; A's stale success did not trigger a reload as B.
    expect(mocks.list.mock.calls.filter(([t]) => t === ADMIN_B)).toHaveLength(1);
  });
});
