// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import Events from "./Events";
import * as partner from "../../adapters/partner";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const entry = (patch: Record<string, unknown> = {}) => ({ id: "event-a", name: "A-only event", date: "2026-09-07", location: null, status: "scheduled", ...patch });
const response = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), { status, headers: { "content-type": type } });
const loaded = (events: unknown = [entry()]) => response({ ok: true, events });
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
const render = () => act(async () => root.render(<><Events /><Snapshot /></>));
const text = () => host.textContent ?? "";
const input = (id: string) => host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
const button = (label: string) => Array.from(host.querySelectorAll("button")).find((item) => item.textContent === label)!;
const refresh = () => act(async () => button("Refresh event records").click());
const submit = (times = 1) => act(async () => {
  const form = host.querySelector("form")!;
  for (let i = 0; i < times; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});
async function fill(values: Record<string, string> = {
  "pe-name": " Synthetic event ", "pe-date": "2026-10-09", "pe-location": " Synthetic proposed venue ", "pe-description": " Synthetic presentation proposal ",
}) {
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
  expect(host.querySelector("form,table,input,textarea")).toBeNull(); expect(text()).not.toContain("A-only event");
  expect(text()).not.toContain("No event rows were returned"); expect(text()).not.toContain("To be scheduled");
  expect(text()).not.toContain("To be confirmed"); expect(text()).not.toContain("In review");
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false; snapshots.length = 0;
  read = vi.fn(() => Promise.resolve(loaded()));
  write = vi.fn(() => Promise.resolve(response({ ok: false, code: "capability_disabled" }, 503)));
  fetcher = vi.fn((path: string, init: RequestOptions) => {
    if (path === partner.PARTNER_API.events && init.method === "GET") return read(init);
    if (path === partner.PARTNER_API.eventRequest && init.method === "POST") return write(init);
    throw new Error("Unexpected synthetic request");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("reported organization events without local grants or invented venue/approval facts", () => {
  it("uses the exact existing bearer GET and never selects organizations or starts intake/tracking on read", async () => {
    await render(); expect(fetcher).toHaveBeenCalledExactlyOnceWith(partner.PARTNER_API.events, {
      method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" },
    });
    expect(write).not.toHaveBeenCalled(); expect(host.querySelector("select")).toBeNull();
    expect(text()).toContain("A-only event"); expect(text()).toContain("Scheduled (reported)");
    expect(text()).toContain("Location not provided by this source"); expect(text()).toContain("not event approval, registration, or attendance evidence");
    expect(text()).toContain("No medical claims, no income claims, no recruitment");
    expect(text()).toContain("does not establish content clearance, a confirmed venue, event occurrence, attendance attribution, or organization permissions");
    expect(text()).toContain("current integration does not provide event request intake");
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector('a[href^="mailto:"]')?.getAttribute("href")).toBe("mailto:team@xeniostechnology.com?subject=Event%20request");
    expect(host.innerHTML).not.toContain("synthetic-partner-a");
  });
  it.each(["signed-out", "checking"])("does not read or reveal a draft while %s", async (state) => {
    if (state === "signed-out") session.token = null; else session.checking = true;
    await render(); expect(fetcher).not.toHaveBeenCalled(); noPrivateData();
    if (state === "signed-out") expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it.each(["scheduled", "not scheduled"])("shows %s only as a reported schedule marker with unknown date/venue", async (status) => {
    read.mockResolvedValueOnce(loaded([entry({ status, date: null })])); await render();
    expect(text()).toContain(status === "scheduled" ? "Scheduled (reported)" : "Not scheduled (reported)");
    expect(text()).toContain("Date not reported"); expect(text()).toContain("Location not provided by this source");
    expect(host.querySelector(".ra-badge-success")).toBeNull(); expect(text()).not.toMatch(/To be scheduled|To be confirmed|In review/);
  });
  it("does not turn a past recorded date into completed attendance or a future one into confirmation", async () => {
    read.mockResolvedValueOnce(loaded([entry({ id: "past", date: "2000-01-01" }), entry({ id: "future", date: "2099-01-01" })])); await render();
    expect(text()).toContain("2000-01-01"); expect(text()).toContain("2099-01-01");
    expect(host.querySelector("tbody")?.textContent).not.toMatch(/Completed|Confirmed|Attended/);
  });
  it("keeps exact empty rows distinct from complete history and absence of organization relationships", async () => {
    read.mockResolvedValueOnce(loaded([])); await render(); expect(text()).toContain("No event rows were returned for this account");
    expect(text()).toContain("does not confirm complete event history, absence of organization relationships, or request status");
    expect(text()).not.toContain("No events registered yet");
  });
  it("renders source names as text rather than markup or navigation", async () => {
    read.mockResolvedValueOnce(loaded([entry({ name: '<img src=x onerror="synthetic()">' })])); await render();
    expect(text()).toContain('<img src=x onerror="synthetic()">'); expect(host.querySelector("tbody img,tbody a,tbody script")).toBeNull();
  });
  it.each([401, 403, 404, 501, 503, 500])("keeps HTTP %s out of event records and intake", async (status) => {
    read.mockResolvedValueOnce(response({ message: "PRIVATE-UPSTREAM" }, status)); await render(); noPrivateData();
    expect(text()).not.toContain("PRIVATE-UPSTREAM"); expect(write).not.toHaveBeenCalled();
  });
  it("preserves canonical server denial without guessing organization or customer permissions", async () => {
    read.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE-UPSTREAM" }, 403)); await render();
    noPrivateData(); expect(text()).toContain("Your partner account is not active"); expect(text()).toContain("reporting access is separate from customer approval"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
  it.each([
    {}, { ok: true }, { ok: true, events: null }, { ok: true, events: [entry(), entry()] },
    { ok: true, events: [entry({ id: "../other-organization" })] }, { ok: true, events: [entry({ name: null })] },
    { ok: true, events: [entry({ date: undefined })] }, { ok: true, events: [entry({ date: "2026-02-30" })] },
    { ok: true, events: [entry({ status: "not scheduled", date: "2026-09-07" })] },
    { ok: true, events: [entry({ location: undefined })] }, { ok: true, events: [entry({ location: "UNVERIFIED-VENUE" })] },
    { ok: true, events: [entry({ status: undefined })] }, { ok: true, events: [entry({ status: "approved" })] },
    { ok: true, events: [entry({ status: "confirmed" })] }, { ok: true, events: [entry({ organizationId: "PRIVATE-ORG" })] },
    { ok: true, events: [entry()], attendance: [{ email: "PRIVATE@fixture.invalid" }] },
  ])("refuses malformed, private, or promoted event facts: %j", async (body) => {
    read.mockResolvedValueOnce(response(body)); await render(); noPrivateData(); expect(text()).toContain("could not be read safely"); expect(text()).not.toMatch(/PRIVATE|UNVERIFIED-VENUE/);
  });
  it("contains HTML fallback and thrown reader content", async () => {
    read.mockResolvedValueOnce(response("PRIVATE-HTML", 200, "text/html")); await render(); noPrivateData(); expect(text()).not.toContain("PRIVATE");
    vi.spyOn(partner, "getPartnerEvents").mockRejectedValueOnce(new Error("PRIVATE-THROWN")); await refresh(); noPrivateData(); expect(text()).not.toContain("PRIVATE");
    await refresh(); expect(text()).toContain("A-only event");
  });
});

describe("server-disabled event intake and isolated request drafts", () => {
  it("sends only the exact existing body on explicit submit, preserving 503 and keeping drafts out of URLs/storage", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem"); await render(); await fill(); expect(write).not.toHaveBeenCalled(); await submit();
    expect(write).toHaveBeenCalledExactlyOnceWith({ method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-partner-a" },
      body: JSON.stringify({ name: "Synthetic event", date: "2026-10-09", location: "Synthetic proposed venue", description: "Synthetic presentation proposal" }),
    });
    expect(text()).toContain("Event request intake is unavailable"); expect(text()).toContain("cannot confirm a request was recorded");
    expect(text()).not.toMatch(/nothing was submitted|carried over|follow up by email/); expect(read).toHaveBeenCalledTimes(1);
    expect(input("pe-location").value).toContain("Synthetic proposed venue"); expect(storageWrite).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain("Synthetic"); expect(Array.from(host.querySelectorAll("a")).every((a) => !a.href.includes("Synthetic"))).toBe(true);
    expect(JSON.parse(write.mock.calls[0][0].body!)).not.toHaveProperty("organizationId");
  });
  it.each(["pe-name", "pe-date", "pe-location", "pe-description"])("blank %s cannot POST", async (field) => {
    await render(); await fill(); await fill({ [field]: "" }); await submit();
    expect(write).not.toHaveBeenCalled(); expect(text()).toContain("Please fill in the event name, date, location, and description");
  });
  it("synchronously latches duplicate submissions, freezes every field, and blocks pending refresh", async () => {
    await render(); await fill(); const pending = deferred<Response>(); write.mockReturnValueOnce(pending.promise); await submit(2);
    expect(write).toHaveBeenCalledTimes(1);
    for (const field of ["pe-name", "pe-date", "pe-location", "pe-description"]) expect(input(field).closest("fieldset")?.disabled).toBe(true);
    expect(button("Refresh event records").disabled).toBe(true); await refresh(); expect(read).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(response({}, 503))); await submit(); expect(write).toHaveBeenCalledTimes(1);
  });
  it("revokes a retained same-event form callback when history refresh starts", async () => {
    await render(); await fill(); const pending = deferred<Response>(); read.mockReturnValueOnce(pending.promise);
    await act(async () => { const form = host.querySelector("form")!; button("Refresh event records").click(); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(write).not.toHaveBeenCalled(); noPrivateData();
  });
  it.each([401, 403, 404, 400, 500, 501, 503])("HTTP %s never silently clears or resubmits an uncertain request", async (status) => {
    await render(); await fill(); write.mockResolvedValueOnce(response({ message: "PRIVATE-UPSTREAM" }, status)); await submit();
    expect(text()).toMatch(/cannot confirm a request|could not be confirmed/); expect(text()).toContain("Resubmission is blocked in this view");
    expect(text()).not.toMatch(/PRIVATE-UPSTREAM|nothing was submitted|carried over/); expect(input("pe-description").value).toContain("Synthetic presentation");
    await submit(2); expect(write).toHaveBeenCalledTimes(1); await refresh(); await submit(); expect(write).toHaveBeenCalledTimes(1);
    expect(button("Submit request").disabled).toBe(true); expect(text()).toContain("not stored after leaving");
  });
  it("contains a thrown request, retains all fields and never retries it automatically", async () => {
    await render(); await fill(); vi.spyOn(partner, "requestEvent").mockRejectedValueOnce(new Error("PRIVATE-THROWN")); await submit();
    expect(text()).toContain("event request could not be confirmed"); expect(text()).not.toContain("PRIVATE-THROWN"); expect(input("pe-name").value).toContain("Synthetic event");
    expect(input("pe-date").value).toBe("2026-10-09"); await submit(); expect(partner.requestEvent).toHaveBeenCalledTimes(1);
  });
  it("handles synthetic endpoint success without inventing registration, venue, attendance, approval or delivery", async () => {
    await render(); await fill(); write.mockResolvedValueOnce(response({ ok: true, message: "PRIVATE-UPSTREAM" })); await submit();
    expect(text()).toContain("Request response received"); expect(text()).toContain("endpoint returned success but no receipt ID");
    expect(text()).toContain("does not establish registration, approval, venue confirmation, a schedule, attendance, attribution, or email delivery");
    expect(text()).not.toContain("PRIVATE-UPSTREAM"); expect(host.querySelector("tbody")?.textContent).not.toContain("Synthetic event");
    expect(input("pe-location").value).toContain("Synthetic proposed venue"); expect(read).toHaveBeenCalledTimes(2);
    await submit(); expect(write).toHaveBeenCalledTimes(1); await act(async () => button("Start another draft").click());
    expect(Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")).every((field) => field.value === "")).toBe(true);
  });
  it("removes A's history, all four draft fields and validation in B's first commit", async () => {
    await render(); await fill(); await fill({ "pe-name": " " }); await submit(); const b = deferred<Response>(); read.mockReturnValueOnce(b.promise);
    session.token = "synthetic-partner-b"; await render(); noPrivateData(); expect(snapshots.at(-1)).not.toContain("A-only event"); expect(snapshots.at(-1)).not.toContain("Please fill in");
    await act(async () => b.resolve(loaded([entry({ id: "event-b", name: "B-only event" })]))); expect(text()).toContain("B-only event");
    expect(Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")).every((field) => field.value === "")).toBe(true);
    expect(read.mock.calls.at(-1)?.[0].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });
  it.each(["accepted", "unavailable", "error"])("late A %s request cannot alter B's draft or reload B", async (kind) => {
    await render(); await fill(); const old = deferred<Response>(); write.mockReturnValueOnce(old.promise); await submit();
    session.token = "synthetic-partner-b"; read.mockResolvedValueOnce(loaded([entry({ id: "event-b", name: "B-only event" })])); await render(); await fill({ "pe-name": "B private draft" });
    await act(async () => { if (kind === "error") old.reject(new Error("PRIVATE-OLD")); else old.resolve(response({ ok: true, message: "PRIVATE-OLD" }, kind === "accepted" ? 200 : 503)); });
    expect(input("pe-name").value).toBe("B private draft"); expect(text()).toContain("B-only event"); expect(read).toHaveBeenCalledTimes(2);
    expect(text()).not.toMatch(/PRIVATE-OLD|Request response received|event request could not be confirmed|Event request intake is unavailable/); expect(button("Submit request").disabled).toBe(false);
  });
  it.each(["logout", "checking", "unmount", "A-null-A", "refreshed-token"])("pending result cannot revive old state after %s", async (transition) => {
    await render(); await fill(); const pending = deferred<Response>(); write.mockReturnValueOnce(pending.promise); await submit();
    if (transition === "unmount") await act(async () => root.render(null));
    else if (transition === "checking") { session.checking = true; await render(); }
    else if (transition === "refreshed-token") { session.token = "synthetic-refreshed-a"; await render(); }
    else { session.token = null; await render(); if (transition === "A-null-A") { session.token = "synthetic-partner-a"; await render(); } }
    const reads = read.mock.calls.length; await act(async () => pending.resolve(response({ ok: true, message: "PRIVATE-OLD" })));
    expect(read).toHaveBeenCalledTimes(reads); expect(text()).not.toContain("Request response received"); expect(text()).not.toContain("PRIVATE-OLD");
    expect(Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")).every((field) => field.value === "")).toBe(true);
  });
  it("ignores A's late history and old overlapping refresh denial", async () => {
    const old = deferred<Response>(); read.mockReturnValueOnce(old.promise); await render(); session.token = "synthetic-partner-b";
    read.mockResolvedValueOnce(loaded([entry({ id: "event-b", name: "B-only event" })])); await render(); await act(async () => old.resolve(loaded()));
    expect(text()).toContain("B-only event"); expect(text()).not.toContain("A-only event");
    const first = deferred<Response>(); const second = deferred<Response>(); read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); await refresh(); await refresh();
    await act(async () => second.resolve(loaded([entry({ name: "Latest event" })]))); await act(async () => first.resolve(response({ ok: false, code: "partner_not_active" }, 403)));
    expect(text()).toContain("Latest event"); expect(text()).not.toContain("Your partner account is not active");
  });
  it("survives StrictMode replay without stale records or read-triggered mutation", async () => {
    const stale = deferred<Response>(); read.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(loaded([entry({ name: "Latest event" })]));
    await act(async () => root.render(<StrictMode><Events /></StrictMode>)); await act(async () => stale.resolve(loaded()));
    expect(text()).toContain("Latest event"); expect(text()).not.toContain("A-only event"); expect(write).not.toHaveBeenCalled();
  });
});
