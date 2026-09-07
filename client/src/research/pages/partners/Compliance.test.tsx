// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import Compliance from "./Compliance";
import * as partner from "../../adapters/partner";
import { CONTENT_REVIEW_LABELS } from "../../partner-crm/compliance-review";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const entry = (patch: Record<string, unknown> = {}) => ({
  id: "content-a", title: "A-only content", submittedAt: "2026-09-07", status: "submitted", ...patch,
});
const response = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), {
  status, headers: { "content-type": type },
});
const loaded = (submissions: unknown = [entry()]) => response({ ok: true, submissions });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type RequestOptions = { method: string; headers: Record<string, string>; body?: string };
let root: Root;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
let read: Mock<(init: RequestOptions) => Promise<Response>>;
let write: Mock<(init: RequestOptions) => Promise<Response>>;
const snapshots: string[] = [];
function Snapshot() { useLayoutEffect(() => { snapshots.push(host.innerHTML); }); return null; }
const render = () => act(async () => root.render(<><Compliance /><Snapshot /></>));
const text = () => host.textContent ?? "";
const input = (id: string) => host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
const button = (label: string) => Array.from(host.querySelectorAll("button")).find((item) => item.textContent === label)!;
const refresh = () => act(async () => button("Refresh review history").click());
const submit = (times = 1) => act(async () => {
  const form = host.querySelector("form")!;
  for (let i = 0; i < times; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});
async function fill(values: Record<string, string | undefined> = {
  "pcp-title": " Synthetic draft ", "pcp-link": " https://draft.fixture.invalid/review?version=one ",
  "pcp-description": " Synthetic draft wording ",
}) {
  await act(async () => {
    for (const [id, value] of Object.entries(values)) {
      if (value === undefined) continue;
      const field = input(id);
      const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}
const noPrivateData = () => {
  expect(host.querySelector("form,table,input,textarea")).toBeNull();
  expect(text()).not.toContain("A-only content");
  expect(text()).not.toContain("No content review rows were returned");
  expect(text()).not.toContain("Recently");
  expect(text()).not.toContain("In review");
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false; snapshots.length = 0;
  read = vi.fn(() => Promise.resolve(loaded()));
  write = vi.fn(() => Promise.resolve(response({ ok: true, message: "SYNTHETIC-UPSTREAM" })));
  fetcher = vi.fn((path: string, init: RequestOptions) => {
    if (path === partner.PARTNER_API.compliance && init.method === "GET") return read(init);
    if (path === partner.PARTNER_API.complianceSubmissions && init.method === "POST") return write(init);
    throw new Error("Unexpected synthetic request");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("content review read boundary", () => {
  it("uses the existing exact bearer GET, preserves program rules, and adds no publishing authority", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(partner.PARTNER_API.compliance, {
      method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" },
    });
    expect(write).not.toHaveBeenCalled(); expect(text()).toContain("A-only content");
    expect(text()).toContain("Submitted (reported)"); expect(text()).toContain("Reported review status is not permission to publish or use content");
    expect(text()).toContain("No medical claims"); expect(text()).toContain("No income claims"); expect(text()).toContain("No downline recruitment");
    expect(text()).toContain("does not require a paid membership prerequisite");
    expect(text()).toContain("Do not present retired membership prices as current");
    expect(text()).toContain("Use materials from the approved library word for word");
    expect(text()).toContain("Disclose the rep relationship in every share");
    expect(text()).toContain("without outcome promises of any kind");
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.innerHTML).not.toContain("synthetic-partner-a");
    expect(host.querySelector('button[type="submit"]')?.textContent).toBe("Submit for review");
  });
  it.each(["signed-out", "checking"])("does not read or show a draft while %s", async (state) => {
    if (state === "signed-out") session.token = null; else session.checking = true;
    await render(); expect(fetcher).not.toHaveBeenCalled(); noPrivateData();
    if (state === "signed-out") expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it.each(Object.keys(CONTENT_REVIEW_LABELS))("renders %s only as reported, not current approval/version/expiry evidence", async (status) => {
    read.mockResolvedValueOnce(loaded([entry({ status })])); await render();
    expect(host.querySelector("tbody")?.textContent).toContain(`${CONTENT_REVIEW_LABELS[status as keyof typeof CONTENT_REVIEW_LABELS]} (reported)`);
    expect(host.querySelector(".ra-badge-success")).toBeNull();
    expect(text()).toContain("does not include current expiry, approved wording, or required disclosures");
  });
  it("keeps explicit null dates unknown and explicit empty history incomplete", async () => {
    read.mockResolvedValueOnce(loaded([entry({ submittedAt: null })])); await render();
    expect(text()).toContain("Date not reported"); expect(text()).not.toContain("Recently");
    read.mockResolvedValueOnce(loaded([])); await refresh();
    expect(text()).toContain("No content review rows were returned for this account");
    expect(text()).toContain("does not confirm complete history or approval to use content");
  });
  it.each([401, 403, 404, 501, 503, 500])("keeps HTTP %s away from history and intake", async (status) => {
    read.mockResolvedValueOnce(response({ message: "PRIVATE@fixture.invalid" }, status)); await render();
    noPrivateData(); expect(text()).not.toContain("PRIVATE"); expect(write).not.toHaveBeenCalled();
    expect(text()).not.toContain("carried over");
  });
  it("retains canonical partner denial without echoing arbitrary upstream text", async () => {
    read.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE@fixture.invalid" }, 403)); await render();
    expect(text()).toContain("Your partner account is not active"); expect(text()).toContain("Partner review access is separate from customer approval");
    noPrivateData(); expect(text()).not.toContain("PRIVATE");
  });
  it.each([
    {}, { ok: true }, { ok: true, submissions: null }, { ok: true, submissions: [entry(), entry()] },
    { ok: true, submissions: [entry({ id: "../other" })] }, { ok: true, submissions: [entry({ title: null })] },
    { ok: true, submissions: [entry({ submittedAt: undefined })] }, { ok: true, submissions: [entry({ submittedAt: "2026-02-30" })] },
    { ok: true, submissions: [entry({ status: undefined })] }, { ok: true, submissions: [entry({ status: "preapproved" })] },
    { ok: true, submissions: [entry({ ownerEmail: "PRIVATE@fixture.invalid" })] },
    { ok: true, submissions: [entry()], privateBody: "PRIVATE@fixture.invalid" },
  ])("rejects malformed or extra-data success before enabling intake: %j", async (body) => {
    read.mockResolvedValueOnce(response(body)); await render(); noPrivateData();
    expect(text()).toContain("could not be read safely"); expect(text()).not.toContain("PRIVATE");
  });
  it("never turns HTML fallback into history or a working submission form", async () => {
    read.mockResolvedValueOnce(response("PRIVATE-UPSTREAM", 200, "text/html")); await render(); noPrivateData();
    expect(text()).toContain("Content review history is unavailable right now"); expect(text()).not.toContain("PRIVATE");
  });
  it("contains a thrown loader without showing its content", async () => {
    vi.spyOn(partner, "getPartnerCompliance").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); noPrivateData(); expect(text()).not.toContain("PRIVATE"); await refresh(); expect(text()).toContain("A-only content");
  });
  it("treats a title as plain text, not a clickable draft or executable markup", async () => {
    read.mockResolvedValueOnce(loaded([entry({ title: '<img src=x onerror="synthetic()">' })])); await render();
    expect(text()).toContain('<img src=x onerror="synthetic()">'); expect(host.querySelector("tbody img,tbody a,tbody script")).toBeNull();
  });
});

describe("principal-bound content drafts and submission lifecycle", () => {
  it("sends only the exact existing trimmed JSON and bearer on explicit submit, never draft in URL/storage", async () => {
    const sessionWrite = vi.spyOn(Storage.prototype, "setItem");
    await render(); await fill(); expect(write).not.toHaveBeenCalled(); await submit();
    expect(write).toHaveBeenCalledExactlyOnceWith({
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-partner-a" },
      body: JSON.stringify({ title: "Synthetic draft", link: "https://draft.fixture.invalid/review?version=one", description: "Synthetic draft wording" }),
    });
    expect(fetcher.mock.calls.every(([path]) => path === partner.PARTNER_API.compliance || path === partner.PARTNER_API.complianceSubmissions)).toBe(true);
    expect(sessionWrite).not.toHaveBeenCalled(); expect(window.location.href).not.toContain("Synthetic");
    expect(Array.from(host.querySelectorAll("a")).some((a) => a.href.includes("draft.fixture.invalid"))).toBe(false);
  });
  it("sends a blank optional link as null", async () => {
    await render(); await fill({ "pcp-title": "Draft", "pcp-link": "  ", "pcp-description": "Description" }); await submit();
    expect(JSON.parse(write.mock.calls[0][0].body!)).toEqual({ title: "Draft", link: null, description: "Description" });
  });
  it.each([
    { "pcp-title": "", "pcp-description": "Description" }, { "pcp-title": "Draft", "pcp-description": " " },
    { "pcp-title": "x".repeat(201), "pcp-description": "Description" },
    { "pcp-title": "Draft", "pcp-description": "x".repeat(5001) },
    { "pcp-title": "Draft", "pcp-description": "Description", "pcp-link": "x".repeat(501) },
  ])("invalid required/bounded draft cannot POST: %j", async (values) => {
    await render(); await fill(values); await submit(); expect(write).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("synchronously latches duplicate submits and blocks refresh while a request is pending", async () => {
    await render(); await fill(); const pending = deferred<Response>(); write.mockReturnValueOnce(pending.promise); await submit(2);
    expect(write).toHaveBeenCalledTimes(1); expect(button("Refresh review history").disabled).toBe(true);
    expect(host.querySelector("fieldset")?.disabled).toBe(true); await refresh(); expect(read).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(response({}, 503))); await submit(2); expect(write).toHaveBeenCalledTimes(1);
  });
  it("revokes a retained form submit in the same event batch that starts history refresh", async () => {
    await render(); await fill(); const pending = deferred<Response>(); read.mockReturnValueOnce(pending.promise);
    await act(async () => { const form = host.querySelector("form")!; button("Refresh review history").click();
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(write).not.toHaveBeenCalled(); noPrivateData();
  });
  it("retains draft after an endpoint response, reloads only facts, and does not claim approval or emails", async () => {
    await render(); await fill(); await submit();
    expect(text()).toContain("Submission response received"); expect(text()).toContain("this page has no receipt ID");
    expect(text()).toContain("not content approval or confirmation of any email"); expect(text()).not.toContain("SYNTHETIC-UPSTREAM");
    expect(input("pcp-title").value).toContain("Synthetic draft"); expect(host.querySelector("tbody")?.textContent).not.toContain("Synthetic draft");
    expect(read).toHaveBeenCalledTimes(2); expect(host.querySelector("fieldset")?.disabled).toBe(true);
    await submit(); expect(write).toHaveBeenCalledTimes(1);
    await act(async () => button("Start another draft").click());
    expect(input("pcp-title").value).toBe(""); expect(input("pcp-link").value).toBe(""); expect(input("pcp-description").value).toBe("");
    expect(host.querySelector("fieldset")?.disabled).toBe(false); expect(text()).not.toContain("Submission response received");
  });
  it.each([401, 403, 404, 400, 500, 501, 503])("keeps HTTP %s result uncertain without blind resend or fake non-delivery", async (status) => {
    await render(); await fill(); write.mockResolvedValueOnce(response({ message: "PRIVATE-UPSTREAM" }, status)); await submit();
    expect(text()).toMatch(/cannot confirm whether|could not be confirmed/); expect(text()).toContain("Resubmission is blocked in this view");
    expect(text()).not.toMatch(/PRIVATE-UPSTREAM|nothing was submitted|follow up by email|carried over/);
    expect(input("pcp-description").value).toContain("Synthetic draft wording");
    expect(host.querySelector('a[href^="mailto:"]')?.getAttribute("href")).toBe("mailto:team@xeniostechnology.com?subject=Content%20review%20request");
    await submit(2); expect(write).toHaveBeenCalledTimes(1);
    await refresh(); expect(read).toHaveBeenCalledTimes(2); await submit(); expect(write).toHaveBeenCalledTimes(1);
    expect(button("Submit for review").disabled).toBe(true); expect(text()).toContain("not stored after leaving");
  });
  it("contains thrown submission errors, retains draft, and never auto-retries", async () => {
    await render(); await fill(); vi.spyOn(partner, "submitComplianceContent").mockRejectedValueOnce(new Error("PRIVATE-THROWN")); await submit();
    expect(text()).toContain("The submission could not be confirmed"); expect(text()).not.toContain("PRIVATE-THROWN");
    expect(input("pcp-title").value).toContain("Synthetic draft"); await submit(); expect(partner.submitComplianceContent).toHaveBeenCalledTimes(1);
  });
  it("does not treat a pending-tone machine denial as recorded content", async () => {
    await render(); await fill(); write.mockResolvedValueOnce(response({ ok: false, code: "capability_disabled", message: "PRIVATE-UPSTREAM" }, 403)); await submit();
    expect(text()).not.toContain("Submission response received"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
    expect(host.querySelector("tbody")?.textContent).not.toContain("Synthetic draft"); await submit(); expect(write).toHaveBeenCalledTimes(1);
  });
  it("A-to-B first commit drops history, all draft fields, and validation", async () => {
    await render(); await fill(); await fill({ "pcp-title": " " }); await submit();
    const b = deferred<Response>(); read.mockReturnValueOnce(b.promise); session.token = "synthetic-partner-b"; await render(); noPrivateData();
    expect(snapshots.at(-1)).not.toContain("A-only content"); expect(snapshots.at(-1)).not.toContain("Please add a title");
    await act(async () => b.resolve(loaded([entry({ title: "B-only content", id: "content-b" })])));
    expect(text()).toContain("B-only content"); expect(input("pcp-title").value).toBe(""); expect(input("pcp-link").value).toBe("");
    expect(input("pcp-description").value).toBe(""); expect(read.mock.calls.at(-1)?.[0].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });
  it.each(["accepted", "unavailable", "error"])("late A %s submission cannot alter B's draft or cause another read", async (kind) => {
    await render(); await fill(); const old = deferred<Response>(); write.mockReturnValueOnce(old.promise); await submit();
    session.token = "synthetic-partner-b"; read.mockResolvedValueOnce(loaded([entry({ title: "B-only content", id: "content-b" })])); await render();
    await fill({ "pcp-title": "B private draft" });
    await act(async () => { if (kind === "error") old.reject(new Error("PRIVATE-OLD")); else old.resolve(response({ ok: true, message: "PRIVATE-OLD" }, kind === "accepted" ? 200 : 503)); });
    expect(text()).toContain("B-only content"); expect(input("pcp-title").value).toBe("B private draft");
    expect(text()).not.toMatch(/PRIVATE-OLD|Submission response received|submission could not be confirmed|intake is unavailable/);
    expect(read).toHaveBeenCalledTimes(2); expect(write).toHaveBeenCalledTimes(1); expect(button("Submit for review").disabled).toBe(false);
  });
  it.each(["logout", "checking", "unmount", "A-null-A", "refreshed-token"])("pending result cannot restore private state after %s", async (transition) => {
    await render(); await fill(); const pending = deferred<Response>(); write.mockReturnValueOnce(pending.promise); await submit();
    if (transition === "unmount") await act(async () => root.render(null));
    else if (transition === "checking") { session.checking = true; await render(); }
    else if (transition === "refreshed-token") { session.token = "synthetic-partner-a-refreshed"; await render(); }
    else { session.token = null; await render(); if (transition === "A-null-A") { session.token = "synthetic-partner-a"; await render(); } }
    const reads = read.mock.calls.length; await act(async () => pending.resolve(response({ ok: true, message: "PRIVATE-OLD" })));
    expect(read).toHaveBeenCalledTimes(reads); expect(text()).not.toContain("Submission response received");
    expect(text()).not.toContain("PRIVATE-OLD");
    expect(Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")).every((field) => field.value === "")).toBe(true);
  });
  it("ignores late prior-principal history and older overlapping refresh denial", async () => {
    const old = deferred<Response>(); read.mockReturnValueOnce(old.promise); await render();
    session.token = "synthetic-partner-b"; read.mockResolvedValueOnce(loaded([entry({ title: "B-only content" })])); await render();
    await act(async () => old.resolve(loaded())); expect(text()).toContain("B-only content"); expect(text()).not.toContain("A-only content");
    const first = deferred<Response>(); const second = deferred<Response>(); read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await refresh(); await refresh(); await act(async () => second.resolve(loaded([entry({ title: "Newest content" })])));
    await act(async () => first.resolve(response({ ok: false, code: "partner_not_active" }, 403)));
    expect(text()).toContain("Newest content"); expect(text()).not.toContain("Your partner account is not active");
  });
  it("survives StrictMode replay without accepting superseded initial history or starting a write", async () => {
    const stale = deferred<Response>(); read.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(loaded([entry({ title: "Latest content" })]));
    await act(async () => root.render(<StrictMode><Compliance /></StrictMode>)); await act(async () => stale.resolve(loaded()));
    expect(text()).toContain("Latest content"); expect(text()).not.toContain("A-only content"); expect(write).not.toHaveBeenCalled();
  });
});
