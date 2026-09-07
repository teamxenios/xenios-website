// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import Campaigns from "./Campaigns";
import * as partner from "../../adapters/partner";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const entry = (patch: Record<string, unknown> = {}) => ({ id: "a-only-code", name: "a-only-code", window: "Link issued 2026-09-07", status: "link issued", ...patch });
const response = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), { status, headers: { "content-type": type } });
const loaded = (campaigns: unknown = [entry()]) => response({ ok: true, campaigns });
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
const render = () => act(async () => root.render(<><Campaigns /><Snapshot /></>));
const text = () => host.textContent ?? "";
const input = (id: string) => host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
const button = (label: string) => Array.from(host.querySelectorAll("button")).find((item) => item.textContent === label)!;
const refresh = () => act(async () => button("Refresh campaign codes").click());
const submit = (times = 1) => act(async () => {
  const form = host.querySelector("form")!;
  for (let i = 0; i < times; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});
async function fill(values: Record<string, string> = { "pc-name": " Synthetic campaign ", "pc-timeframe": " Next synthetic month ", "pc-description": " Synthetic channels and plan " }) {
  await act(async () => {
    for (const [id, value] of Object.entries(values)) {
      const field = input(id);
      const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}
const noPrivateData = () => {
  expect(host.querySelector("form,table,input,textarea")).toBeNull(); expect(text()).not.toContain("a-only-code");
  expect(text()).not.toContain("No campaign-code rows were returned"); expect(text()).not.toContain("To be scheduled"); expect(text()).not.toContain("In review");
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false; snapshots.length = 0;
  read = vi.fn(() => Promise.resolve(loaded()));
  write = vi.fn(() => Promise.resolve(response({ ok: false, code: "capability_disabled" }, 503)));
  fetcher = vi.fn((path: string, init: RequestOptions) => {
    if (path === partner.PARTNER_API.campaigns && init.method === "GET") return read(init);
    if (path === partner.PARTNER_API.campaignRequest && init.method === "POST") return write(init);
    throw new Error("Unexpected synthetic request");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("campaign-code records, not campaign workflow or attribution proof", () => {
  it("uses the exact existing bearer GET and does not start intake/tracking/approval on read", async () => {
    await render(); expect(fetcher).toHaveBeenCalledExactlyOnceWith(partner.PARTNER_API.campaigns, {
      method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" },
    });
    expect(write).not.toHaveBeenCalled(); expect(text()).toContain("a-only-code"); expect(text()).toContain("Link issued (reported)");
    expect(text()).toContain("not campaign registrations, approvals, or performance reports");
    expect(text()).toContain("does not establish current link eligibility, content approval, a campaign schedule, or successful attribution");
    expect(text()).toContain("current integration does not provide campaign request intake");
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector('a[href^="mailto:"]')?.getAttribute("href")).toBe("mailto:team@xeniostechnology.com?subject=Campaign%20request");
    expect(host.innerHTML).not.toContain("synthetic-partner-a");
  });
  it.each(["signed-out", "checking"])("does not mount a private read or draft while %s", async (state) => {
    if (state === "signed-out") session.token = null; else session.checking = true;
    await render(); expect(fetcher).not.toHaveBeenCalled(); noPrivateData();
    if (state === "signed-out") expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it.each(["link issued", "link revoked"])("keeps source %s distinct from availability and approval", async (status) => {
    read.mockResolvedValueOnce(loaded([entry({ status })])); await render();
    expect(text()).toContain(status === "link issued" ? "Link issued (reported)" : "Link revoked (reported)");
    expect(host.querySelector(".ra-badge-success")).toBeNull(); expect(text()).not.toContain("To be scheduled"); expect(text()).not.toContain("In review");
  });
  it("keeps null issue date unknown and exact empty records distinct from complete campaign history", async () => {
    read.mockResolvedValueOnce(loaded([entry({ window: null })])); await render(); expect(text()).toContain("Link issue date not reported");
    read.mockResolvedValueOnce(loaded([])); await refresh(); expect(text()).toContain("No campaign-code rows were returned for this account");
    expect(text()).toContain("does not confirm complete link history or the status of any campaign request");
  });
  it("preserves opaque codes as text, not URL targets or executable markup", async () => {
    const code = '<img src=x onerror="synthetic()">'; read.mockResolvedValueOnce(loaded([entry({ id: code, name: code })]));
    await render(); expect(text()).toContain(code); expect(host.querySelector("tbody img,tbody a,tbody script")).toBeNull();
  });
  it.each([401, 403, 404, 501, 503, 500])("keeps HTTP %s out of history and intake", async (status) => {
    read.mockResolvedValueOnce(response({ message: "PRIVATE-UPSTREAM" }, status)); await render(); noPrivateData();
    expect(text()).not.toContain("PRIVATE-UPSTREAM"); expect(write).not.toHaveBeenCalled();
  });
  it("preserves the server partner denial without a customer-access change", async () => {
    read.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE-UPSTREAM" }, 403)); await render();
    noPrivateData(); expect(text()).toContain("Your partner account is not active"); expect(text()).toContain("separate from customer approval"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
  it.each([
    {}, { ok: true }, { ok: true, campaigns: null }, { ok: true, campaigns: [entry(), entry()] },
    { ok: true, campaigns: [entry({ id: "different-code" })] }, { ok: true, campaigns: [entry({ name: null })] },
    { ok: true, campaigns: [entry({ window: undefined })] }, { ok: true, campaigns: [entry({ window: "To be scheduled" })] },
    { ok: true, campaigns: [entry({ window: "Link issued 2026-02-30" })] }, { ok: true, campaigns: [entry({ status: undefined })] },
    { ok: true, campaigns: [entry({ status: "approved" })] }, { ok: true, campaigns: [entry({ status: "active" })] },
    { ok: true, campaigns: [entry({ customerEmail: "PRIVATE@fixture.invalid" })] },
    { ok: true, campaigns: [entry()], conversions: 100 },
  ])("refuses malformed or promoted campaign facts before enabling intake: %j", async (body) => {
    read.mockResolvedValueOnce(response(body)); await render(); noPrivateData(); expect(text()).toContain("could not be read safely"); expect(text()).not.toContain("PRIVATE");
  });
  it("contains HTML fallback and thrown readers without private error echoes", async () => {
    read.mockResolvedValueOnce(response("PRIVATE-HTML", 200, "text/html")); await render(); noPrivateData(); expect(text()).not.toContain("PRIVATE");
    vi.spyOn(partner, "getPartnerCampaigns").mockRejectedValueOnce(new Error("PRIVATE-THROWN")); await refresh(); noPrivateData(); expect(text()).not.toContain("PRIVATE");
    await refresh(); expect(text()).toContain("a-only-code");
  });
});

describe("dark request route and isolated campaign drafts", () => {
  it("posts the unchanged body only on explicit submit and keeps current 503 truthful without storage or URL data", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem"); await render(); await fill(); expect(write).not.toHaveBeenCalled(); await submit();
    expect(write).toHaveBeenCalledExactlyOnceWith({ method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-partner-a" },
      body: JSON.stringify({ name: "Synthetic campaign", timeframe: "Next synthetic month", description: "Synthetic channels and plan" }),
    });
    expect(text()).toContain("Campaign request intake is unavailable"); expect(text()).toContain("cannot confirm a request was recorded");
    expect(text()).not.toMatch(/nothing was submitted|carried over|follow up by email/);
    expect(input("pc-name").value).toContain("Synthetic campaign"); expect(read).toHaveBeenCalledTimes(1);
    expect(storageWrite).not.toHaveBeenCalled(); expect(window.location.href).not.toContain("Synthetic");
    expect(Array.from(host.querySelectorAll("a")).every((a) => !a.href.includes("Synthetic"))).toBe(true);
  });
  it.each(["pc-name", "pc-timeframe", "pc-description"])("blank %s cannot POST", async (field) => {
    await render(); await fill(); await fill({ [field]: " " }); await submit();
    expect(write).not.toHaveBeenCalled(); expect(text()).toContain("Please fill in the campaign name, timeframe, and description");
  });
  it("synchronously latches duplicate submissions, freezes all fields, and blocks refresh while pending", async () => {
    await render(); await fill(); const pending = deferred<Response>(); write.mockReturnValueOnce(pending.promise); await submit(2);
    expect(write).toHaveBeenCalledTimes(1); expect(host.querySelector("fieldset")?.disabled).toBe(true);
    expect(input("pc-description").closest("fieldset")?.disabled).toBe(true); expect(button("Refresh campaign codes").disabled).toBe(true);
    await refresh(); expect(read).toHaveBeenCalledTimes(1); await act(async () => pending.resolve(response({}, 503))); await submit(); expect(write).toHaveBeenCalledTimes(1);
  });
  it("blocks a same-event retained form submit when history refresh starts", async () => {
    await render(); await fill(); const pending = deferred<Response>(); read.mockReturnValueOnce(pending.promise);
    await act(async () => { const form = host.querySelector("form")!; button("Refresh campaign codes").click(); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(write).not.toHaveBeenCalled(); noPrivateData();
  });
  it.each([401, 403, 404, 400, 500, 501, 503])("HTTP %s cannot silently clear or resubmit a draft", async (status) => {
    await render(); await fill(); write.mockResolvedValueOnce(response({ message: "PRIVATE-UPSTREAM" }, status)); await submit();
    expect(text()).toMatch(/cannot confirm a request|could not be confirmed/); expect(text()).toContain("Resubmission is blocked in this view");
    expect(text()).not.toMatch(/PRIVATE-UPSTREAM|nothing was submitted|carried over/); expect(input("pc-description").value).toContain("Synthetic channels");
    await submit(2); expect(write).toHaveBeenCalledTimes(1); await refresh(); await submit(); expect(write).toHaveBeenCalledTimes(1);
    expect(text()).toContain("not stored after leaving"); expect(button("Submit request").disabled).toBe(true);
  });
  it("contains a thrown request without resubmission or draft loss", async () => {
    await render(); await fill(); vi.spyOn(partner, "requestCampaign").mockRejectedValueOnce(new Error("PRIVATE-THROWN")); await submit();
    expect(text()).toContain("campaign request could not be confirmed"); expect(text()).not.toContain("PRIVATE-THROWN");
    expect(input("pc-name").value).toContain("Synthetic campaign"); await submit(); expect(partner.requestCampaign).toHaveBeenCalledTimes(1);
  });
  it("handles a synthetic success response without inventing a campaign, schedule, approval, attribution, or email", async () => {
    await render(); await fill(); write.mockResolvedValueOnce(response({ ok: true, message: "PRIVATE-UPSTREAM" })); await submit();
    expect(text()).toContain("Request response received"); expect(text()).toContain("endpoint returned success but no receipt ID");
    expect(text()).toContain("does not establish a registration, approval, schedule, attribution, or email delivery");
    expect(text()).not.toContain("PRIVATE-UPSTREAM"); expect(host.querySelector("tbody")?.textContent).not.toContain("Synthetic campaign");
    expect(input("pc-name").value).toContain("Synthetic campaign"); expect(read).toHaveBeenCalledTimes(2);
    await submit(); expect(write).toHaveBeenCalledTimes(1); await act(async () => button("Start another draft").click());
    expect(input("pc-name").value).toBe(""); expect(input("pc-timeframe").value).toBe(""); expect(input("pc-description").value).toBe("");
  });
  it("clears A's history, draft and validation in B's first commit", async () => {
    await render(); await fill(); await fill({ "pc-name": " " }); await submit(); const b = deferred<Response>(); read.mockReturnValueOnce(b.promise);
    session.token = "synthetic-partner-b"; await render(); noPrivateData(); expect(snapshots.at(-1)).not.toContain("a-only-code"); expect(snapshots.at(-1)).not.toContain("Please fill in");
    await act(async () => b.resolve(loaded([entry({ id: "b-only-code", name: "b-only-code" })])));
    expect(text()).toContain("b-only-code"); expect(Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")).every((field) => field.value === "")).toBe(true);
    expect(read.mock.calls.at(-1)?.[0].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });
  it.each(["accepted", "unavailable", "error"])("late A %s result cannot mutate B's draft or reload B", async (kind) => {
    await render(); await fill(); const old = deferred<Response>(); write.mockReturnValueOnce(old.promise); await submit();
    session.token = "synthetic-partner-b"; read.mockResolvedValueOnce(loaded([entry({ id: "b-only-code", name: "b-only-code" })])); await render(); await fill({ "pc-name": "B private draft" });
    await act(async () => { if (kind === "error") old.reject(new Error("PRIVATE-OLD")); else old.resolve(response({ ok: true, message: "PRIVATE-OLD" }, kind === "accepted" ? 200 : 503)); });
    expect(input("pc-name").value).toBe("B private draft"); expect(text()).toContain("b-only-code"); expect(read).toHaveBeenCalledTimes(2);
    expect(text()).not.toMatch(/PRIVATE-OLD|Request response received|request could not be confirmed|Campaign request intake is unavailable/); expect(button("Submit request").disabled).toBe(false);
  });
  it.each(["logout", "checking", "unmount", "A-null-A", "refreshed-token"])("pending request cannot revive state after %s", async (transition) => {
    await render(); await fill(); const pending = deferred<Response>(); write.mockReturnValueOnce(pending.promise); await submit();
    if (transition === "unmount") await act(async () => root.render(null));
    else if (transition === "checking") { session.checking = true; await render(); }
    else if (transition === "refreshed-token") { session.token = "synthetic-refreshed-a"; await render(); }
    else { session.token = null; await render(); if (transition === "A-null-A") { session.token = "synthetic-partner-a"; await render(); } }
    const reads = read.mock.calls.length; await act(async () => pending.resolve(response({ ok: true, message: "PRIVATE-OLD" })));
    expect(read).toHaveBeenCalledTimes(reads); expect(text()).not.toContain("Request response received"); expect(text()).not.toContain("PRIVATE-OLD");
    expect(Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")).every((field) => field.value === "")).toBe(true);
  });
  it("ignores A's late history and older overlapping refresh denials", async () => {
    const old = deferred<Response>(); read.mockReturnValueOnce(old.promise); await render(); session.token = "synthetic-partner-b";
    read.mockResolvedValueOnce(loaded([entry({ id: "b-only-code", name: "b-only-code" })])); await render(); await act(async () => old.resolve(loaded()));
    expect(text()).toContain("b-only-code"); expect(text()).not.toContain("a-only-code");
    const first = deferred<Response>(); const second = deferred<Response>(); read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); await refresh(); await refresh();
    await act(async () => second.resolve(loaded([entry({ id: "newest-code", name: "newest-code" })]))); await act(async () => first.resolve(response({ ok: false, code: "partner_not_active" }, 403)));
    expect(text()).toContain("newest-code"); expect(text()).not.toContain("Your partner account is not active");
  });
  it("survives StrictMode replay without using stale initial history or making a request mutation", async () => {
    const stale = deferred<Response>(); read.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(loaded([entry({ id: "latest-code", name: "latest-code" })]));
    await act(async () => root.render(<StrictMode><Campaigns /></StrictMode>)); await act(async () => stale.resolve(loaded()));
    expect(text()).toContain("latest-code"); expect(text()).not.toContain("a-only-code"); expect(write).not.toHaveBeenCalled();
  });
});
