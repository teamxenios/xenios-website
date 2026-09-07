// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Leads from "./Leads";
import { PARTNER_API } from "../../adapters/partner";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const row = (period = "2026-09", leads = 7) => ({ period, channel: "signed_link", leads });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const loaded = (rows: unknown = [row()]) => response({ ok: true, rows });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let root: Root;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
const render = () => act(async () => root.render(<Leads />));
const text = () => host.textContent ?? "";
const refresh = () => act(async () => {
  const button = Array.from(host.querySelectorAll("button")).find((item) => /refresh|try again/i.test(item.textContent ?? ""));
  expect(button).toBeDefined();
  button!.click();
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a";
  session.checking = false;
  fetcher = vi.fn().mockImplementation(async () => loaded());
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("owned aggregate-only partner CRM Leads journey", () => {
  it("uses the existing exact bearer GET and shows counts only as recorded attribution events", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(PARTNER_API.leads, {
      method: "GET", credentials: "same-origin", cache: "no-store",
      headers: { Authorization: "Bearer synthetic-partner-a" },
    });
    expect(text()).toContain("2026-09");
    expect(text()).toContain("Signed link");
    expect(text()).toContain("Recorded events");
    expect(text()).toContain("not unique people, approved applications, purchases, recruits, or earned commissions");
    expect(text()).not.toContain("applications started from your link");
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector("form,input,textarea")).toBeNull();
    expect(host.innerHTML).not.toContain("synthetic-partner-a");
  });

  it.each([null, "synthetic-checking"])("does not load private data without verified readiness: %s", async (token) => {
    session.token = token; session.checking = token !== null;
    await render();
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.querySelector("table")).toBeNull();
    expect(text()).toContain(token ? "Checking your account" : "Sign in to view partner lead reporting");
  });

  it.each([401, 403, 404, 501, 503, 500])("never converts HTTP %s into zero or empty activity", async (status) => {
    fetcher.mockResolvedValue(response({ message: "PRIVATE-UPSTREAM-PERSON" }, status));
    await render();
    expect(host.querySelector("table")).toBeNull();
    expect(text()).not.toContain("No aggregate rows were returned");
    expect(text()).not.toContain("PRIVATE-UPSTREAM-PERSON");
    expect(text()).not.toContain("platform launches");
  });

  it("preserves a canonical partner denial without inferring customer approval or displaying the server message", async () => {
    fetcher.mockResolvedValue(response({ ok: false, code: "partner_not_active", message: "PRIVATE-UPSTREAM-PERSON" }, 403));
    await render();
    expect(text()).toContain("Your partner account is not active");
    expect(text()).toContain("Partner reporting access is separate from customer account access");
    expect(text()).not.toContain("PRIVATE-UPSTREAM-PERSON");
    expect(host.querySelector("table")).toBeNull();
  });

  it("distinguishes a successful empty read from complete history and from a genuine zero bucket", async () => {
    fetcher.mockResolvedValueOnce(loaded([]));
    await render();
    expect(text()).toContain("No aggregate rows were returned for this account");
    expect(text()).toContain("does not establish a complete history or zero unique leads");
    session.token = "synthetic-partner-b";
    fetcher.mockResolvedValueOnce(loaded([row("2026-08", 0)]));
    await render();
    expect(text()).toContain("2026-08");
    expect(host.querySelector("td .tabular")?.textContent).toBe("0");
    expect(text()).not.toContain("No aggregate rows were returned");
  });

  it.each([
    { ok: true }, { ok: true, rows: [row(), { ...row("2026-08"), leads: -1 }] },
    { ok: true, rows: [{ ...row(), email: "PRIVATE@fixture.invalid" }] },
    { ok: true, rows: [{ ...row(), channel: "PRIVATE@fixture.invalid" }] },
    { ok: true, rows: [row(), row()] },
  ])("rejects the whole malformed/identity-bearing response: %j", async (body) => {
    fetcher.mockResolvedValue(response(body));
    await render();
    expect(host.querySelector("table")).toBeNull();
    expect(text()).toContain("could not be read safely");
    expect(text()).not.toContain("PRIVATE");
    expect(text()).not.toContain("No aggregate rows were returned");
  });

  it("an unavailable read can retry without mutations or changing accounts", async () => {
    fetcher.mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(loaded());
    await render();
    expect(text()).toContain("Partner lead reporting is unavailable right now");
    await refresh();
    expect(text()).toContain("2026-09");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([path, init]) => path === PARTNER_API.leads && init.method === "GET"
      && init.body === undefined && init.headers.Authorization === "Bearer synthetic-partner-a")).toBe(true);
  });

  it("A to B drops A's ready rows before B's pending read completes", async () => {
    fetcher.mockResolvedValueOnce(loaded([row("2026-01", 13)]));
    await render();
    expect(text()).toContain("2026-01");
    const b = deferred<Response>();
    fetcher.mockReturnValueOnce(b.promise);
    session.token = "synthetic-partner-b";
    await render();
    expect(text()).not.toContain("2026-01");
    await act(async () => b.resolve(loaded([row("2026-02", 23)])));
    expect(text()).toContain("2026-02");
    expect(text()).not.toContain("2026-01");
  });

  it("late A success cannot overwrite B or restore data after sign-out", async () => {
    const a = deferred<Response>();
    fetcher.mockReturnValueOnce(a.promise).mockResolvedValueOnce(loaded([row("2026-02")]));
    await render();
    session.token = "synthetic-partner-b"; await render();
    await act(async () => a.resolve(loaded([row("2026-01")])));
    expect(text()).toContain("2026-02"); expect(text()).not.toContain("2026-01");
    session.token = null; await render();
    expect(host.querySelector("table")).toBeNull();
    expect(text()).toContain("Sign in to view partner lead reporting");
  });
});
