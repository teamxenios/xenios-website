// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Organizations from "./Organizations";
import { PARTNER_API } from "../../adapters/partner";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));

const organization = (name = "A-only organization", id = "org-a") => ({ id, name, role: "Owner", status: "active" });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const loaded = (organizations: unknown = [organization()]) => response({ ok: true, organizations });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let root: Root;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
const render = () => act(async () => root.render(<Organizations />));
const text = () => host.textContent ?? "";
const requests = (method: string) => fetcher.mock.calls.filter(([, init]) => init.method === method);
const input = (id: string) => host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!;
async function fill(values: Record<string, string> = {
  "pog-name": " Synthetic Organization ", "pog-contact": " Synthetic Contact ",
  "pog-email": " customer@fixture.invalid ", "pog-website": " https://fixture.invalid ",
  "pog-description": " Synthetic description ",
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
const submit = (times = 1) => act(async () => {
  const form = host.querySelector("form")!;
  for (let i = 0; i < times; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false;
  fetcher = vi.fn(async (path, init) => {
    if (path === PARTNER_API.organizations && init.method === "GET") return loaded();
    if (path === PARTNER_API.organizationRequest && init.method === "POST") return response({ ok: false, code: "capability_disabled" }, 503);
    throw new Error("Unexpected synthetic request");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("account-bound organization relationship and request journey", () => {
  it("uses only the existing bearer GET and distinguishes reported active records from authority", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(PARTNER_API.organizations, {
      method: "GET", credentials: "same-origin", cache: "no-store",
      headers: { Authorization: "Bearer synthetic-partner-a" },
    });
    expect(text()).toContain("A-only organization");
    expect(text()).toContain("Owner"); expect(text()).toContain("Active record");
    expect(text()).toContain("referral eligibility, and payment authority remain separate decisions");
    expect(host.querySelector(".ra-badge-neutral")?.textContent).toBe("Active record");
    expect(host.querySelector(".ra-badge-success")).toBeNull();
    expect(host.innerHTML).not.toContain("synthetic-partner-a");
    expect(requests("POST")).toHaveLength(0);
  });

  it.each([null, "synthetic-checking"])("makes no private read or request for an unready session: %s", async (token) => {
    session.token = token; session.checking = token !== null;
    await render();
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.querySelector("form,table,input")).toBeNull();
    expect(text()).toContain(token ? "Checking your account" : "Sign in to view organizations");
  });

  it.each([401, 403, 404, 500, 501, 503])("HTTP %s never becomes an empty relationship list or enabled intake", async (status) => {
    fetcher.mockResolvedValueOnce(response({ message: "PRIVATE-UPSTREAM-DETAIL" }, status));
    await render();
    expect(host.querySelector("form,table,input")).toBeNull();
    expect(text()).not.toContain("PRIVATE-UPSTREAM-DETAIL");
    expect(text()).not.toContain("No organization rows");
    expect(text()).not.toContain("platform launches");
    expect(requests("POST")).toHaveLength(0);
  });

  it("retains the canonical partner denial without showing raw upstream details", async () => {
    fetcher.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE-UPSTREAM-DETAIL" }, 403));
    await render();
    expect(text()).toContain("Your partner account is not active");
    expect(text()).not.toContain("PRIVATE-UPSTREAM-DETAIL");
    expect(host.querySelector("form,table")).toBeNull();
  });

  it.each([
    { ok: true }, { ok: true, organizations: null },
    { ok: true, organizations: [organization(), organization()] },
    { ok: true, organizations: [{ ...organization(), id: "../other-account" }] },
    { ok: true, organizations: [{ ...organization(), name: { private: true } }] },
    { ok: true, organizations: [{ ...organization(), role: ["Owner"] }] },
    { ok: true, organizations: [{ ...organization(), status: true }] },
  ])("rejects an unreadable envelope before rendering rows or intake: %j", async (body) => {
    fetcher.mockResolvedValueOnce(response(body));
    await render();
    expect(text()).toContain("could not be read safely");
    expect(host.querySelector("form,table")).toBeNull();
    expect(text()).not.toContain("A-only organization");
  });

  it("does not turn an empty result into a complete history or missing role/status into grants", async () => {
    fetcher.mockResolvedValueOnce(loaded([])); await render();
    expect(text()).toContain("Completeness of organization history is not reported here");
    session.token = "synthetic-partner-b";
    fetcher.mockResolvedValueOnce(loaded([{ id: "org-b", name: "B-only organization" }])); await render();
    expect(text()).toContain("Role not reported"); expect(text()).toContain("Status not reported");
    expect(text()).not.toContain("In review");
  });

  it("keeps unknown server role and status strings out of presentation", async () => {
    fetcher.mockResolvedValueOnce(loaded([{ ...organization(), role: "PRIVATE-ROLE", status: "PRIVATE-STATUS" }]));
    await render();
    expect(text()).not.toContain("PRIVATE-");
    expect(text()).toContain("Role not reported"); expect(text()).toContain("Status not reported");
  });

  it("only explicit submission sends the exact existing JSON body and bearer; 503 preserves entries without asserting delivery", async () => {
    await render(); await fill();
    expect(requests("POST")).toHaveLength(0);
    await submit();
    expect(requests("POST")).toEqual([[PARTNER_API.organizationRequest, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-partner-a" },
      body: JSON.stringify({ organization: "Synthetic Organization", website: "https://fixture.invalid",
        contactName: "Synthetic Contact", contactEmail: "customer@fixture.invalid", description: "Synthetic description" }),
    }]]);
    expect(text()).toContain("Organization request intake is unavailable");
    expect(text()).toContain("cannot confirm a request was recorded or an account was created");
    expect(text()).not.toContain("nothing was submitted");
    expect(input("pog-name").value).toContain("Synthetic Organization");
    const mail = host.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    expect(mail?.getAttribute("href")).toBe("mailto:team@xeniostechnology.com?subject=Organization%20partner%20request");
    expect(requests("GET")).toHaveLength(1);
  });

  it("invalid required values never issue a POST", async () => {
    await render(); await submit();
    expect(text()).toContain("Please fill in the organization name");
    expect(requests("POST")).toHaveLength(0);
  });

  it("a same-render duplicate submit is synchronously latched", async () => {
    await render(); await fill();
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise);
    await submit(2);
    expect(requests("POST")).toHaveLength(1);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await act(async () => pending.resolve(response({}, 503)));
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  it("A to B immediately drops A rows, all five draft fields, and validation before B finishes loading", async () => {
    await render(); await fill();
    const b = deferred<Response>(); fetcher.mockReturnValueOnce(b.promise);
    session.token = "synthetic-partner-b"; await render();
    expect(text()).not.toContain("A-only organization");
    expect(host.querySelector("form,input")).toBeNull();
    await act(async () => b.resolve(loaded([organization("B-only organization", "org-b")])));
    expect(text()).toContain("B-only organization");
    expect(Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")).every((field) => field.value === "")).toBe(true);
    expect(requests("GET")[1][1].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });

  it.each(["accepted", "unavailable", "failed"])("late A %s submission cannot publish into B, clear B's draft, or reload B", async (result) => {
    await render(); await fill();
    const a = deferred<Response>(); fetcher.mockReturnValueOnce(a.promise); await submit();
    session.token = "synthetic-partner-b";
    fetcher.mockResolvedValueOnce(loaded([organization("B-only organization", "org-b")])); await render();
    await fill({ "pog-name": "B private draft" });
    await act(async () => {
      if (result === "failed") a.reject(new Error("PRIVATE-OLD-FAILURE"));
      else a.resolve(response({ ok: true, message: "PRIVATE-OLD-RESULT" }, result === "accepted" ? 200 : 503));
    });
    expect(input("pog-name").value).toBe("B private draft");
    expect(text()).toContain("B-only organization");
    expect(text()).not.toMatch(/PRIVATE-|Request response received|could not be confirmed|intake is unavailable/);
    expect(requests("GET")).toHaveLength(2); expect(requests("POST")).toHaveLength(1);
  });

  it.each(["sign-out", "checking", "unmount", "A-B-A", "refresh"])("a pending request cannot restore old state after %s", async (transition) => {
    await render(); await fill();
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await submit();
    if (transition === "unmount") { await act(async () => root.unmount()); root = createRoot(host); }
    else if (transition === "checking") { session.checking = true; await render(); }
    else if (transition === "sign-out") { session.token = null; await render(); }
    else {
      session.token = transition === "refresh" ? "synthetic-refreshed-a" : "synthetic-partner-b"; await render();
      if (transition === "A-B-A") { session.token = "synthetic-partner-a"; await render(); }
    }
    const before = requests("GET").length;
    await act(async () => pending.resolve(response({ ok: true, message: "PRIVATE-OLD-RESULT" })));
    expect(text()).not.toContain("Request response received");
    expect(text()).not.toContain("PRIVATE-OLD-RESULT");
    expect(requests("GET")).toHaveLength(before); expect(requests("POST")).toHaveLength(1);
    expect(Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")).every((field) => field.value === "")).toBe(true);
  });

  it("a failed transport is uncertain, preserves input, and never displays the raw error or automatically retries", async () => {
    await render(); await fill();
    fetcher.mockRejectedValueOnce(new Error("PRIVATE-NETWORK-FAILURE")); await submit();
    expect(text()).toContain("The request could not be confirmed. Your entries are kept");
    expect(text()).not.toMatch(/PRIVATE-|nothing was submitted|team will follow up/);
    expect(input("pog-email").value.trim()).toBe("customer@fixture.invalid");
    expect(requests("POST")).toHaveLength(1); expect(requests("GET")).toHaveLength(1);
  });

  it("a synthetic accepted response reloads server facts without optimistic organization creation or promised communication", async () => {
    await render(); await fill();
    fetcher.mockResolvedValueOnce(response({ ok: true, message: "PRIVATE-SERVER-DETAIL" })); await submit();
    expect(text()).toContain("Request response received");
    expect(text()).toContain("roles, and permissions have not been changed by this page");
    expect(text()).not.toMatch(/PRIVATE-|team will follow up/);
    expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(input("pog-name").value).toBe("");
    expect(requests("GET")).toHaveLength(2); expect(requests("POST")).toHaveLength(1);
  });
});
