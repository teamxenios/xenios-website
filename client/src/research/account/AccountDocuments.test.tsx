// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentSummaryDto } from "@shared/research/customer-account/contract";

const session = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("../core", () => ({ useResearch: () => ({ memberToken: session.token }) }));
vi.mock("../account-portal/AccountPortalShell", () => ({
  AccountPortalShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import AccountDocuments from "./AccountDocuments";
import { useDocumentDownload } from "../account-portal/useDocumentDownload";
import type { AccountDocumentDownloadResult } from "../account-portal/api";

// Roles are acceptance-persona labels only, never client-side grants. Each
// fixture server response belongs to the exact bearer supplied to that read.
const personas = ["customer-a", "partner-a", "partner-b", "organization-a"] as const;
const tokenOf = (persona: string) => `synthetic-${persona}`;
const documentOf = (persona: string): DocumentSummaryDto => ({
  id: `document-${persona}`, kind: "receipt", title: `${persona} private receipt`,
  issuedAt: "2026-09-07T00:00:00.000Z",
  downloadPath: `/api/research/customer-account/documents/document-${persona}`,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type Pending = ReturnType<typeof deferred<Response>> & { path: string; init: RequestInit };
let root: Root;
let host: HTMLDivElement;
let pending: Pending[];
let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let saved: string[];
let beginDownload: ((path: string) => Promise<AccountDocumentDownloadResult>) | null;

function HookProbe({ token }: { token: string | null }) {
  beginDownload = useDocumentDownload(token);
  return null;
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const pdf = () => new Response("%PDF-1.4 synthetic account receipt", { headers: { "content-type": "application/pdf" } });
const button = () => host.querySelector<HTMLButtonElement>("button");
async function render(persona: string | null) {
  session.token = persona ? tokenOf(persona) : null;
  await act(async () => root.render(<AccountDocuments />));
  await flush();
}
async function start(persona: string) {
  await render(persona);
  expect(host.textContent).toContain(documentOf(persona).title);
  await act(async () => button()!.click());
  return pending[pending.length - 1]!;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  session.token = null;
  pending = [];
  saved = [];
  beginDownload = null;
  createObjectURL = vi.fn(() => "blob:synthetic-account-document");
  revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.href);
  });
  fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input);
    if (path === "/api/research/customer-account/documents") {
      const bearer = new Headers(init.headers).get("Authorization");
      const persona = personas.find((value) => bearer === `Bearer ${tokenOf(value)}`);
      return Promise.resolve(new Response(JSON.stringify(persona
        ? { kind: "ok", data: [documentOf(persona)] }
        : { kind: "denied", reason: "account_access_denied" }), {
        status: persona ? 200 : 403, headers: { "content-type": "application/json" },
      }));
    }
    if (!path.startsWith("/api/research/customer-account/documents/")) throw new Error("Unexpected fixture request");
    const request = { ...deferred<Response>(), path, init };
    // Deliberately ignore abort: the completion guard must work even when
    // transport cancellation loses the race with an already-resolved reply.
    pending.push(request);
    return request.promise;
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("universal account document journey", () => {
  it.each(personas)("%s receives only its fixture-authorized document using the normal bearer read", async (persona) => {
    const request = await start(persona);
    expect(request.path).toBe(documentOf(persona).downloadPath);
    expect(request.init).toMatchObject({ cache: "no-store", credentials: "same-origin", redirect: "error" });
    expect(new Headers(request.init.headers).get("Authorization")).toBe(`Bearer ${tokenOf(persona)}`);
    expect(request.init.method ?? "GET").toBe("GET");
    expect(request.init.body).toBeUndefined();
    await act(async () => request.resolve(pdf()));
    await flush();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["blob:synthetic-account-document"]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-account-document");
    expect(host.textContent).toContain("Download requested");
    expect(host.textContent).not.toMatch(/partner workspace|commission|membership records/i);
    expect(host.innerHTML).not.toContain(tokenOf(persona));
  });

  it.each(personas)("%s sign-out aborts and discards a late successful file", async (persona) => {
    const request = await start(persona);
    await render(null);
    expect(request.init.signal?.aborted).toBe(true);
    await act(async () => request.resolve(pdf()));
    await flush();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    expect(host.textContent).not.toContain(documentOf(persona).title);
    expect(host.textContent).toContain("Account access is required");
    expect(host.textContent).not.toContain("Download requested");
  });

  it.each([
    ["customer-a", "partner-a"], ["partner-a", "partner-b"],
    ["partner-b", "organization-a"], ["organization-a", "customer-a"],
  ])("%s to %s shows only the new account and discards old bytes", async (from, to) => {
    const request = await start(from);
    await render(to);
    expect(request.init.signal?.aborted).toBe(true);
    expect(host.textContent).toContain(documentOf(to).title);
    expect(host.textContent).not.toContain(documentOf(from).title);
    await act(async () => request.resolve(pdf()));
    await flush();
    expect(saved).toEqual([]);
    expect(host.textContent).not.toContain("Download requested");
  });

  it("unmount discards a completed body even when headers arrived before cancellation", async () => {
    const request = await start("customer-a");
    const body = deferred<Blob>();
    await act(async () => request.resolve({ status: 200, ok: true, blob: () => body.promise } as Response));
    await act(async () => root.unmount());
    root = createRoot(host);
    expect(request.init.signal?.aborted).toBe(true);
    await act(async () => body.resolve(new Blob(["synthetic-private-file"])));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("a stale failure does not show an error for the next account", async () => {
    const request = await start("partner-a");
    await render("partner-b");
    await act(async () => request.reject(new Error("synthetic connection failure")));
    await flush();
    expect(host.textContent).toContain(documentOf("partner-b").title);
    expect(host.textContent).not.toMatch(/could not be opened|Download requested/);
    expect(saved).toEqual([]);
  });

  it("signed out makes no document requests", async () => {
    await render(null);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(button()).toBeNull();
  });
});

describe("document operation lifecycle", () => {
  const path = documentOf("customer-a").downloadPath!;
  const renderHook = (token: string | null) => act(async () => root.render(<HookProbe token={token} />));

  it("refresh cancels the old bearer rather than inferring the refreshed token's authority", async () => {
    await renderHook("synthetic-before-refresh");
    const result = beginDownload!(path);
    await renderHook("synthetic-after-refresh");
    pending[0]!.resolve(pdf());
    await expect(result).resolves.toBe("cancelled");
    expect(saved).toEqual([]);
  });

  it("an old callback cannot issue a request after a token change or unmount", async () => {
    await renderHook("synthetic-a");
    const old = beginDownload!;
    await renderHook("synthetic-b");
    await expect(old(path)).resolves.toBe("cancelled");
    const latest = beginDownload!;
    await act(async () => root.unmount());
    root = createRoot(host);
    await expect(latest(path)).resolves.toBe("cancelled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only the newest attempt for one path saves, without cancelling a different document", async () => {
    await renderHook("synthetic-a");
    const old = beginDownload!(path);
    const other = beginDownload!(documentOf("partner-a").downloadPath!);
    const latest = beginDownload!(path);
    expect(pending[0]!.init.signal?.aborted).toBe(true);
    expect(pending[1]!.init.signal?.aborted).toBe(false);
    pending[2]!.resolve(pdf());
    await expect(latest).resolves.toBe("ok");
    pending[0]!.resolve(pdf());
    await expect(old).resolves.toBe("cancelled");
    pending[1]!.resolve(pdf());
    await expect(other).resolves.toBe("ok");
    expect(saved).toHaveLength(2);
  });

  it("does not resurrect A's request during A to B to A", async () => {
    await renderHook("synthetic-a");
    const result = beginDownload!(path);
    await renderHook("synthetic-b");
    await renderHook("synthetic-a");
    pending[0]!.resolve(pdf());
    await expect(result).resolves.toBe("cancelled");
    expect(saved).toEqual([]);
  });
});
