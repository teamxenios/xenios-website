// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Training from "./Training";
import * as partner from "../../adapters/partner";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const entry = (patch: Record<string, unknown> = {}) => ({
  id: "synthetic-module-a", title: "A-only module title", summary: "A-only module summary",
  required: true, completed: true, completedAt: "2026-09-07", ...patch,
});
const body = (patch: Record<string, unknown> = {}) => ({ ok: true, modules: [entry()], certified: true, ...patch });
const response = (value: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(value), { status, headers: { "content-type": type } });
const loaded = (patch: Record<string, unknown> = {}) => response(body(patch));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let root: Root;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
const snapshots: string[] = [];
function Snapshot() { useLayoutEffect(() => { snapshots.push(host.innerHTML); }); return null; }
const render = () => act(async () => root.render(<><Training /><Snapshot /></>));
const text = () => (host.textContent ?? "").replace(/\s+/g, " ");
const refresh = () => act(async () => {
  Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Refresh training records")!.click();
});
const noPrivateData = () => {
  expect(host.querySelector('[aria-label="Reported certification marker"],[aria-label="Reported module records"]')).toBeNull();
  expect(text()).not.toMatch(/A-only|Reported completion date:|Completion recorded \(reported\)|Certification recorded \(reported\)/);
  expect(text()).not.toContain("No module records were returned");
  expect(text()).not.toContain("No certification recorded in this response");
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false; snapshots.length = 0;
  fetcher = vi.fn((path: string, init: RequestInit) => {
    if (path !== partner.PARTNER_API.training || init.method !== "GET") throw new Error("Unexpected synthetic request");
    return Promise.resolve(loaded());
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("training source facts without completion, certification, or access mutations", () => {
  it("uses only the exact existing bearer GET with no private markup identifiers, storage or input", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem"); await render();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(partner.PARTNER_API.training, {
      method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" },
    });
    expect(text()).toContain("A-only module title"); expect(text()).toContain("A-only module summary");
    expect(text()).toContain("Reported completion date: 2026-09-07"); expect(text()).toContain("Required by the reported module list");
    expect(host.innerHTML).not.toContain("synthetic-module-a"); expect(host.innerHTML).not.toContain("synthetic-partner-a");
    expect(storageWrite).not.toHaveBeenCalled(); expect(host.querySelector("form,input,textarea,select")).toBeNull();
    expect(Array.from(host.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["Refresh training records"]);
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector('nav[aria-label="Training help"] a[href="/research/partners/support"]')).not.toBeNull();
    expect(window.location.href).not.toMatch(/synthetic-|A-only/);
  });
  it("preserves all curriculum policy text and no-paid-membership customer guidance", async () => {
    await render(); const curriculum = host.querySelector('section[aria-labelledby="pt-curriculum"]')!.textContent;
    for (const value of [
      "The program, honestly", "What Xenios Research is, how customer access works without a paid membership prerequisite, and what a partner's role is and is not.",
      "Compliance rules", "The three hard lines: no medical claims, no income claims, no recruitment. Plus disclosure requirements on every share.",
      "Approved content", "How the approved library works, what may be edited, and how to submit your own content for review before use.",
      "Certification check", "A short check on the rules above. Completion is reviewed with the other current requirements before certification and activation.",
    ]) expect(curriculum).toContain(value);
    expect(text()).toContain("Required modules are reviewed with identity, tax, payout, and agreement evidence before certification");
    expect(text()).not.toMatch(/\$50|membership costs|unlock the certification check/);
  });
  it.each(["signed-out", "checking"])("shows the public curriculum but makes no private request while %s", async (state) => {
    if (state === "signed-out") session.token = null; else session.checking = true;
    await render(); expect(fetcher).not.toHaveBeenCalled(); noPrivateData(); expect(text()).toContain("What the curriculum covers");
    if (state === "signed-out") expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it.each([true, false])("keeps the stored certification flag %s separate from completion and current access", async (certified) => {
    fetcher.mockResolvedValueOnce(loaded({ certified, modules: [entry({ completed: !certified, completedAt: certified ? null : "2026-09-07" })] }));
    await render();
    expect(text()).toContain(certified ? "Certification recorded (reported)" : "No certification recorded in this response");
    expect(text()).toContain(certified ? "Completion not recorded in this response" : "Completion recorded (reported)");
    expect(text()).toContain("only whether a stored certification marker exists");
    expect(text()).toContain("does not supply its date, expiry, or requirements version");
    expect(text()).toContain("Module completion does not itself establish certification");
    expect(text()).toContain("do not establish current certification validity, partner activation, sharing permission, product eligibility, or payout readiness");
    expect(text()).not.toContain("The team has recorded certification for the current requirements");
    expect(host.querySelector(".ra-badge-success")).toBeNull();
  });
  it.each([true, false])("keeps a missing completion date unknown when completed=%s", async (completed) => {
    fetcher.mockResolvedValueOnce(loaded({ modules: [entry({ completed, completedAt: null })] })); await render();
    expect(text()).toContain("Completion date not reported");
    expect(text()).toContain(completed ? "Completion recorded (reported)" : "Completion not recorded in this response");
    expect(text()).not.toContain("Not started"); expect(text()).not.toContain("Reported completion date:");
  });
  it.each([true, false])("accepts an explicit empty source list without erasing its certification marker %s or inventing unpublished modules", async (certified) => {
    fetcher.mockResolvedValueOnce(loaded({ modules: [], certified })); await render();
    expect(text()).toContain("No module records were returned");
    expect(text()).toContain("does not confirm that no modules are published, that you have not started, or that your training history is complete");
    expect(text()).toContain(certified ? "Certification recorded (reported)" : "No certification recorded in this response");
    expect(text()).not.toContain("No modules published yet");
  });
  it("renders source labels as text and does not infer authority or navigation from a module key", async () => {
    fetcher.mockResolvedValueOnce(loaded({ modules: [entry({ id: "activation", title: '<img src=x onerror="synthetic()">', summary: "https://module.fixture.invalid/" })] }));
    await render(); expect(text()).toContain('<img src=x onerror="synthetic()">');
    const modules = host.querySelector('[aria-label="Reported module records"]')!;
    expect(modules.querySelector("img,a,script,button")).toBeNull();
  });
  it.each([401, 403, 404, 501, 503, 500])("does not convert HTTP %s into module or certification evidence", async (status) => {
    fetcher.mockResolvedValueOnce(response({ message: "PRIVATE-UPSTREAM" }, status)); await render(); noPrivateData();
    expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
  it("preserves canonical partner denial without changing customer access", async () => {
    fetcher.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE-UPSTREAM" }, 403)); await render(); noPrivateData();
    expect(text()).toContain("Your partner account is not active"); expect(text()).toContain("Partner reporting access is separate from customer approval");
    expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
  it.each([
    {}, { ok: true }, body({ certified: undefined }), body({ certified: null }), body({ certified: "false" }), body({ certified: 1 }),
    body({ modules: undefined }), body({ modules: null }), body({ modules: [entry(), entry()] }),
    body({ modules: [entry({ id: "../private" })] }), body({ modules: [entry({ title: null })] }), body({ modules: [entry({ summary: undefined })] }),
    body({ modules: [entry({ required: undefined })] }), body({ modules: [entry({ required: false })] }), body({ modules: [entry({ required: "true" })] }),
    body({ modules: [entry({ completed: undefined })] }), body({ modules: [entry({ completed: "false" })] }), body({ modules: [entry({ completed: 1 })] }),
    body({ modules: [entry({ completedAt: undefined })] }), body({ modules: [entry({ completedAt: "2026-02-30" })] }),
    body({ modules: [entry({ completed: false, completedAt: "2026-09-07" })] }), body({ modules: [entry({ partnerId: "PRIVATE-ID" })] }),
    body({ certifiedAt: "2026-09-07" }), body({ canShare: true }), body({ email: "PRIVATE@fixture.invalid" }),
  ])("fails closed for missing, malformed, coercible, or extra source data: %j", async (value) => {
    fetcher.mockResolvedValueOnce(response(value)); await render(); noPrivateData();
    expect(text()).toContain("Training records could not be read safely"); expect(text()).not.toContain("PRIVATE");
  });
  it("contains HTML fallback and does not expose its content", async () => {
    fetcher.mockResolvedValueOnce(response("PRIVATE-HTML", 200, "text/html")); await render(); noPrivateData();
    expect(text()).toContain("Training reporting is unavailable right now"); expect(text()).not.toContain("PRIVATE");
  });
  it("contains a thrown reader and permits only a read retry", async () => {
    vi.spyOn(partner, "getPartnerTraining").mockRejectedValueOnce(new Error("PRIVATE-THROWN")); await render(); noPrivateData();
    expect(text()).not.toContain("PRIVATE"); await refresh(); expect(text()).toContain("A-only module title");
    expect(fetcher.mock.calls.every(([path, init]) => path === partner.PARTNER_API.training && init.method === "GET" && init.body === undefined)).toBe(true);
  });
});

describe("training-report principal and generation isolation", () => {
  it("removes A's completion and certification in B's first commit before B loads", async () => {
    await render(); const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise);
    const start = snapshots.length; session.token = "synthetic-partner-b"; await render(); noPrivateData();
    expect(snapshots.slice(start).every((snapshot) => !snapshot.includes("A-only") && !snapshot.includes("Certification recorded (reported)"))).toBe(true);
    await act(async () => pending.resolve(loaded({ certified: false, modules: [entry({ id: "b", title: "B-only module", summary: "B-only summary", completed: false, completedAt: null })] })));
    expect(text()).toContain("B-only module"); expect(text()).not.toContain("A-only"); expect(text()).toContain("No certification recorded in this response");
    expect(fetcher.mock.calls.at(-1)?.[1].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });
  it.each(["success", "denial", "malformed"])("ignores A's late %s after B loads", async (kind) => {
    const old = deferred<Response>(); fetcher.mockReturnValueOnce(old.promise).mockResolvedValueOnce(loaded({ certified: false, modules: [entry({ title: "B-only module", summary: "B-only summary" })] }));
    await render(); session.token = "synthetic-partner-b"; await render();
    await act(async () => old.resolve(kind === "success" ? loaded() : kind === "denial" ? response({ ok: false, code: "partner_not_active" }, 403) : response(body({ certified: "true" }))));
    expect(text()).toContain("B-only module"); expect(text()).not.toContain("A-only");
    expect(text()).not.toContain("Your partner account is not active"); expect(text()).not.toContain("could not be read safely");
  });
  it("clears logout data and ignores a late read without further requests", async () => {
    await render(); const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await refresh();
    session.token = null; await render(); noPrivateData(); const requests = fetcher.mock.calls.length;
    await act(async () => pending.resolve(loaded())); noPrivateData(); expect(fetcher).toHaveBeenCalledTimes(requests);
    expect(text()).toContain("Sign in to view reported training records");
  });
  it("does not resurrect an old A response after A-null-A", async () => {
    const old = deferred<Response>(); fetcher.mockReturnValueOnce(old.promise); await render(); session.token = null; await render();
    session.token = "synthetic-partner-a"; fetcher.mockResolvedValueOnce(loaded({ modules: [entry({ title: "New login module", summary: "New login summary" })] })); await render();
    await act(async () => old.resolve(loaded())); expect(text()).toContain("New login module"); expect(text()).not.toContain("A-only");
  });
  it.each(["checking", "token-refresh"])("drops private data immediately on %s and waits for a new read", async (transition) => {
    await render(); const pending = deferred<Response>();
    if (transition === "checking") { session.checking = true; await render(); noPrivateData(); expect(fetcher).toHaveBeenCalledTimes(1); session.checking = false; }
    session.token = "synthetic-partner-a-refreshed"; fetcher.mockReturnValueOnce(pending.promise); await render(); noPrivateData();
    await act(async () => pending.resolve(loaded({ certified: false, modules: [] })));
    expect(text()).toContain("No certification recorded in this response"); expect(text()).not.toContain("A-only");
  });
  it("keeps the latest overlapping read over an old certification success", async () => {
    await render(); const first = deferred<Response>(); const second = deferred<Response>();
    fetcher.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); await refresh(); await refresh(); noPrivateData();
    await act(async () => second.resolve(response({ ok: false, code: "partner_not_active" }, 403)));
    await act(async () => first.resolve(loaded())); noPrivateData(); expect(text()).toContain("Your partner account is not active");
  });
  it("keeps the latest read over an old denial", async () => {
    await render(); const first = deferred<Response>(); const second = deferred<Response>();
    fetcher.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); await refresh(); await refresh();
    await act(async () => second.resolve(loaded({ certified: false, modules: [] })));
    await act(async () => first.resolve(response({ ok: false, code: "partner_not_active" }, 403)));
    expect(text()).toContain("No certification recorded in this response"); expect(text()).not.toContain("Your partner account is not active");
  });
  it("does not restore old data while retrying an unavailable report", async () => {
    await render(); fetcher.mockResolvedValueOnce(response({}, 503)); await refresh(); noPrivateData();
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await refresh(); noPrivateData();
  });
  it("ignores an unmounted result and remains a GET-only report", async () => {
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await render();
    await act(async () => root.render(null)); await act(async () => pending.resolve(loaded())); expect(host.innerHTML).toBe("");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("survives StrictMode replay without reviving a stale certificate marker", async () => {
    const stale = deferred<Response>(); fetcher.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(loaded({ certified: false, modules: [] }));
    await act(async () => root.render(<StrictMode><Training /></StrictMode>)); await act(async () => stale.resolve(loaded()));
    expect(text()).toContain("No certification recorded in this response"); expect(text()).not.toContain("A-only");
    expect(fetcher.mock.calls.every(([path, init]) => path === partner.PARTNER_API.training && init.method === "GET" && init.body === undefined)).toBe(true);
  });
});
