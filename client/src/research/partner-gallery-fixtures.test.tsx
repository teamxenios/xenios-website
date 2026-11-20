// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://127.0.0.1:4173/research/__gallery/partner-links?case=ready"}
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type Product } from "./core";
import { clearResearchCartStorage, purgeLegacyResearchCartStorage } from "./cart-session";
import { readableAliasSession } from "./recommendation/api";
import Links from "./pages/partners/Links";
import Dashboard from "./pages/partners/Dashboard";
import { installPartnerDisplay, partnerDisplayContext, partnerDisplaySelection, PartnerGalleryFixture,
  type PartnerGalleryPage, type PartnerDisplaySelection } from "./partner-gallery-fixtures";

const guard = vi.hoisted(() => ({ allowed: true }));
vi.mock("./lib/fixtures", () => ({ fixturesAllowed: () => guard.allowed,
  assertFixturesAllowed: () => { if (!guard.allowed) throw new Error("disabled"); } }));

let host: HTMLDivElement;
let root: Root;
let runtime: ReturnType<typeof installPartnerDisplay> | undefined;
let transport: ReturnType<typeof vi.fn>;
const href = (page: PartnerGalleryPage, selected: string) => `http://127.0.0.1:4173/research/__gallery/${page}?case=${selected}`;
const select = (page: PartnerGalleryPage = "partner-links", selected = "ready"): PartnerDisplaySelection => {
  window.history.replaceState(null, "", href(page, selected));
  const selection = partnerDisplaySelection(window.location.href);
  expect(selection).not.toBeNull();
  return selection!;
};
const install = (page: PartnerGalleryPage = "partner-links", selected = "ready") => {
  runtime = installPartnerDisplay(select(page, selected));
  return runtime;
};
const get = (path = "/api/research/partner/links", signal?: AbortSignal) => window.fetch(path, { method: "GET", signal,
  credentials: "same-origin", cache: "no-store", headers: { Authorization: `Bearer ${runtime!.context.memberToken}`, Accept: "application/json" } });
const settle = async () => {
  for (let attempt = 0; attempt < 200; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    const current = window.__xeniosPartnerComponentDisplayV1?.snapshot();
    if (!current || current.pending === current.held) return;
  }
  throw new Error("Display reads did not settle within the test bound");
};
const render = async (page: PartnerGalleryPage = "partner-links", selected = "ready") => {
  select(page, selected);
  await act(async () => root.render(<PartnerGalleryFixture page={page}>{page === "partner-links" ? <Links /> : <Dashboard />}</PartnerGalleryFixture>));
  await settle();
};
const button = (text: string) => [...host.querySelectorAll("button")].find(item => item.textContent === text)!;

beforeEach(() => {
  guard.allowed = true;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.sessionStorage.clear(); window.localStorage.clear();
  window.history.replaceState(null, "", href("partner-links", "ready"));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  transport = vi.fn().mockRejectedValue(new Error("No display request may reach the transport"));
  vi.stubGlobal("fetch", transport); vi.stubGlobal("crypto", webcrypto);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-20T00:00:00.000Z"));
});
afterEach(async () => {
  await act(async () => root.unmount()); runtime?.dispose(); runtime = undefined; host.remove();
  expect(window.__xeniosPartnerComponentDisplayV1).toBeUndefined();
  expect(transport).not.toHaveBeenCalled();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("closed partner display boundary", () => {
  it.each([
    "https://xeniostechnology.com/research/__gallery/partner-links?case=ready",
    "http://localhost:4173/research/__gallery/partner-links?case=ready",
    "http://127.0.0.1:4173/research/partners/links?case=ready",
    `${href("partner-links", "ready")}&case=empty`, `${href("partner-links", "ready")}#token`,
    href("partner-links", "connected"), href("partner-links", "%72eady"),
    "http://127.0.0.1:4173/research/__gallery/partner-links?actor=staff",
  ])("rejects unapproved route or input %s", value => { expect(partnerDisplaySelection(value)).toBeNull(); });

  it("does not install a hook or read on a production-disabled fixture guard", async () => {
    const selected = select(); const original = window.fetch;
    guard.allowed = false;
    expect(partnerDisplaySelection(window.location.href)).toBeNull();
    expect(() => installPartnerDisplay(selected)).toThrow("disabled");
    await act(async () => root.render(<PartnerGalleryFixture page="partner-links"><Links /></PartnerGalleryFixture>));
    expect(host.textContent).toContain("Not available.");
    expect(window.fetch).toBe(original); expect(window.__xeniosPartnerComponentDisplayV1).toBeUndefined();
  });

  it("requires the actual closed gallery route and empty stores before installing", () => {
    const selected = select();
    window.history.replaceState(null, "", "/research/partners/links");
    expect(() => installPartnerDisplay(selected)).toThrow("isolated loopback");
    select(); window.sessionStorage.setItem("unrelated-test-record", "do-not-import");
    expect(() => installPartnerDisplay(selected)).toThrow("empty stores");
    window.sessionStorage.clear();
  });

  it("provides the full ordinary context and refuses every consequential callback", async () => {
    const context = partnerDisplayContext(select());
    expect(context).toMatchObject({ gate: "open", memberChecking: false, memberSessionStatus: "authenticated", recovery: "none",
      commerce: { research: false, consumer: false }, products: [], items: [], email: "", count: 0 });
    expect(readableAliasSession(context.memberToken)).toBe("f0000000-0000-4000-8000-000000000001:f0000000-0000-4000-8000-000000000002");
    expect(context.memberToken?.split(".")[0]).toBe("DISPLAY-NOT-A-CREDENTIAL");
    expect(context.memberToken?.split(".")[2]).toBe("NO-SIGNATURE");
    for (const callback of [() => context.clearRecovery(), () => context.addItem({} as Product), () => context.removeItem("fixture"),
      () => context.setQuantity("fixture", 2), () => context.clearLane("research")]) expect(callback).toThrow("refuses mutations");
    for (const callback of [() => context.establishMemberSession("unused"), () => context.refreshMember(), () => context.signOutMember(),
      () => context.signOutRecoverySession(), () => context.submitPassword("unused"), () => context.logout()])
      await expect(callback()).rejects.toThrow("refuses mutations");
    expect(context.laneItems("research")).toEqual([]); expect(context.bySlug.size).toBe(0);
  });

  it("serves real no-store JSON and hashes precisely the returned bytes without leaking the marker", async () => {
    const installed = install(); const response = await get(); const bytes = await response.text();
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json");
    const snapshot = installed.hook.snapshot();
    expect(snapshot.reads).toEqual([{ method: "GET", path: "/api/research/partner/links", ordinal: 1,
      status: 200, responseSha256: createHash("sha256").update(bytes).digest("hex"), terminal: "response" }]);
    expect(snapshot.pending).toBe(0); expect(snapshot.violations).toEqual([]);
    expect(snapshot.clock.observedEpochMs).toBe(snapshot.clock.expectedEpochMs);
    expect(JSON.stringify(snapshot)).not.toContain(installed.context.memberToken);
    expect(JSON.stringify(snapshot)).not.toContain("Authorization");
  });

  it.each([
    { path: "/api/research/partner/links", options: { method: "POST", body: "{}" }, violation: "write" },
    { path: "/api/research/partner/readable-codes/assign", options: {}, violation: "route" },
    { path: "/api/research/partner/links?arbitrary=1", options: {}, violation: "route" },
    { path: "https://example.invalid/api/research/partner/links", options: {}, violation: "route" },
    { path: "/api/research/partner/links", options: { headers: { Authorization: "Bearer unrelated" } }, violation: "credential" },
    { path: "/api/research/partner/links", options: { headers: { Cookie: "unused" } }, violation: "credential" },
    { path: "/api/research/partner/links", options: { credentials: "include" as const }, violation: "credential" },
  ])("refuses $violation without a fallback", async ({ path, options, violation }) => {
    const installed = install();
    await expect(window.fetch(path, { headers: { Authorization: `Bearer ${installed.context.memberToken}` }, ...(options as RequestInit) })).rejects.toThrow("refused");
    expect(installed.hook.snapshot().reads).toEqual([]);
    expect(installed.hook.snapshot().violations).toContain(violation);
  });

  it("passes canonical cart removals through and records attempts without importing values", () => {
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const original = window.fetch; const installed = install();
    clearResearchCartStorage(window.sessionStorage, window.localStorage);
    purgeLegacyResearchCartStorage(window.sessionStorage, window.localStorage);
    expect(remove).toHaveBeenCalledTimes(5);
    expect(installed.hook.snapshot().storage).toEqual({ coverage: "gallery-only", before: { session: 0, local: 0 }, after: { session: 0, local: 0 },
      cleanup: [{ area: "session", key: "current-cart", hadValue: false, completed: true },
        { area: "session", key: "legacy-cart", hadValue: false, completed: true }, { area: "local", key: "legacy-cart", hadValue: false, completed: true },
        { area: "session", key: "legacy-cart", hadValue: false, completed: true }, { area: "local", key: "legacy-cart", hadValue: false, completed: true }], setItemAttempts: 0 });
    expect(() => window.sessionStorage.setItem("not-retained", "not-retained")).toThrow("refused");
    expect(installed.hook.snapshot().storage.setItemAttempts).toBe(1); expect(window.sessionStorage.length).toBe(0);
    installed.dispose(); expect(window.fetch).toBe(original); expect(Storage.prototype.removeItem).toBe(remove);
    expect(installed.hook.snapshot().restore).toEqual({ fetch: true, storage: true, hook: true });
  });

  it("retires held reads on abort and teardown and rejects release misuse", async () => {
    const installed = install("partner-links", "loading"); const signal = new AbortController();
    const aborted = get(undefined, signal.signal); const abortResult = expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    signal.abort(); await abortResult;
    expect(installed.hook.snapshot()).toMatchObject({ pending: 0, held: 0 });
    const pending = get(); // Only the first read is deliberately held.
    await pending;
    expect(() => installed.hook.releasePending()).toThrow("No held");
    installed.dispose();
    runtime = installPartnerDisplay(select("partner-links", "loading"));
    const late = get(); const lateResult = expect(late).rejects.toMatchObject({ name: "AbortError" });
    const retainedFetcher = window.fetch;
    expect(runtime.hook.snapshot().generation).toBeGreaterThan(installed.hook.snapshot().generation);
    runtime.dispose(); await lateResult;
    expect(runtime.hook.snapshot()).toMatchObject({ active: false, pending: 0, reads: [{ terminal: "aborted" }] });
    expect(() => runtime!.hook.releasePending()).toThrow("No held");
    await expect(retainedFetcher("/api/research/partner/links")).rejects.toThrow("refused");
  });

  it("exposes only its finite fixture disposal and never claims a provider unmount", async () => {
    const installed = install("partner-links", "loading");
    const pending = get(); const result = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(() => Reflect.apply(installed.hook.dispose, undefined, ["unapproved"])).toThrow("No active");
    expect(installed.hook.snapshot().active).toBe(true);
    expect(installed.hook.dispose()).toEqual({ generation: installed.hook.snapshot().generation, active: false,
      restore: { fetch: true, storage: true, hook: true }, provider: "NOT_OBSERVED" });
    await result;
    expect(() => installed.hook.dispose()).toThrow("No active");
    expect(window.__xeniosPartnerComponentDisplayV1).toBeUndefined();
  });
});

describe("accepted components on display fixtures", () => {
  it.each(["ready", "empty"])("automatically mounts the alias inventory for eligible %s", async selected => {
    await render("partner-links", selected);
    const snapshot = window.__xeniosPartnerComponentDisplayV1!.snapshot();
    expect(snapshot.reads.map(item => item.path)).toEqual(["/api/research/partner/links", "/api/research/partner/readable-codes"]);
    expect(snapshot.reads.every(item => item.status === 200 && item.terminal === "response")).toBe(true);
    expect(host.querySelector("#readable-codes-title")).not.toBeNull();
    expect(host.textContent).not.toContain("Sign in to manage your links");
    if (selected === "ready") {
      expect(host.textContent).toContain("DISPLAY-CODE");
      expect(host.querySelectorAll('section[aria-labelledby="recommendation-links-title"] article.card')).toHaveLength(6);
    } else expect(host.textContent).toContain("You have no recommendation links yet");
  });

  it("distinguishes API401 in an ordinary session from a signed-out context", async () => {
    await render("partner-links", "api401");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Your session has ended. Sign in again to continue.");
    expect(host.querySelector("#recommendation-refresh-error")).not.toBeNull();
    expect(host.textContent).not.toContain("Sign in to manage your links");
    expect(window.__xeniosPartnerComponentDisplayV1!.snapshot().reads).toHaveLength(1);
    await act(async () => root.render(null));
    await render("partner-links", "signed-out");
    expect(host.textContent).toContain("Sign in to manage your links");
    expect(host.querySelector('a[href^="/research/sign-in"]')?.getAttribute("href"))
      .toBe("/research/sign-in?returnTo=%2Fresearch%2Fpartners%2Flinks");
    expect(window.__xeniosPartnerComponentDisplayV1!.snapshot().reads).toEqual([]);
  });

  it.each(["signed-out", "checking"])("does not read the dashboard for %s context", async selected => {
    await render("partner-dashboard", selected);
    expect(window.__xeniosPartnerComponentDisplayV1!.snapshot().reads).toEqual([]);
    expect(host.textContent).toContain(selected === "checking" ? "Checking" : "Sign in to view your partner dashboard");
  });

  it.each([
    ["ineligible", "Referral access is not active"],
    ["unavailable", "The recommendation service is not available right now."],
    ["malformed", "Your links could not be read safely."],
  ])("renders the accepted Links %s boundary without alias reads", async (selected, message) => {
    await render("partner-links", selected);
    expect(host.textContent).toContain(message);
    const snapshot = window.__xeniosPartnerComponentDisplayV1!.snapshot();
    expect(snapshot.reads.map(item => item.path)).toEqual(["/api/research/partner/links"]);
    expect(snapshot.pending).toBe(0); expect(snapshot.violations).toEqual([]);
    expect(host.querySelector("#readable-codes-title")).toBeNull();
  });

  it.each(["disconnected", "unconfirmed", "confirmed-zero"])("uses the dashboard's actual %s reporting semantics", async selected => {
    await render("partner-dashboard", selected);
    const metrics = host.querySelector('[data-testid="pd-metrics"]')!;
    const values = [...metrics.querySelectorAll('[data-testid="ra-metric"]')].map(item => item.querySelectorAll("p")[1]?.textContent);
    expect(values[0]).toBe("Not reported");
    if (selected === "confirmed-zero") expect(values.slice(1)).toEqual(["0", "$0.00", "$0.00"]);
    else {
      expect(values.slice(1)).toEqual(["Unavailable", "Unavailable", "Unavailable"]);
      expect(host.textContent).toContain(selected === "disconnected" ? "Commission reporting is not connected yet." : "Commission reporting status could not be confirmed.");
      expect(host.querySelector("table")).toBeNull();
    }
  });

  it.each(["unavailable", "generic-forbidden", "partner-missing", "api401", "malformed", "error"])(
    "keeps dashboard %s responses distinct from real confirmed figures", async selected => {
      await render("partner-dashboard", selected);
      const snapshot = window.__xeniosPartnerComponentDisplayV1!.snapshot();
      expect(snapshot.reads).toHaveLength(1); expect(snapshot.violations).toEqual([]);
      expect(snapshot.pending).toBe(0);
      if (selected === "api401") expect(host.textContent).toContain("Sign in to view your partner dashboard");
      else if (["unavailable", "generic-forbidden"].includes(selected)) {
        expect(host.textContent).toContain("Partner activity is unavailable right now.");
        expect(host.textContent).not.toContain("$0.00");
      } else expect(host.querySelector(selected === "partner-missing" ? '[data-testid="ra-denial"]' : '[data-testid="ra-error"]')).not.toBeNull();
      expect(host.querySelector("table")).toBeNull();
    });

  it("opens the accepted dashboard share card using its native button and only a Links GET", async () => {
    await render("partner-dashboard", "connected");
    expect(host.querySelector('svg[aria-label="Your referral QR code"]')).toBeNull();
    await act(async () => button("Open referral tools").click()); await settle();
    expect(host.querySelector('svg[aria-label="Your referral QR code"]')).not.toBeNull();
    expect(window.__xeniosPartnerComponentDisplayV1!.snapshot().reads.map(item => item.path))
      .toEqual(["/api/research/partner/dashboard", "/api/research/partner/links"]);
  });

  it("keeps loading held until the zero-argument release and then renders the accepted component", async () => {
    await render("partner-links", "loading");
    expect(host.querySelector("#recommendation-links-loading")).not.toBeNull();
    const hook = window.__xeniosPartnerComponentDisplayV1!;
    expect(hook.snapshot()).toMatchObject({ pending: 1, held: 1 });
    expect(() => Reflect.apply(hook.releasePending, undefined, [{ body: "unapproved" }])).toThrow("No held");
    expect(hook.snapshot().held).toBe(1);
    expect(hook.releasePending()).toMatchObject({ released: 1, status: "released" });
    await settle();
    expect(host.querySelector("#recommendation-links-title")).not.toBeNull();
    expect(hook.snapshot()).toMatchObject({ pending: 0, held: 0, violations: [] });
  });

  it("uses native Refresh and native Assign/Cancel without issuing any mutation", async () => {
    await render("partner-links", "refresh-failure");
    const refresh = host.querySelector<HTMLButtonElement>("#recommendation-refresh")!;
    await act(async () => { refresh.focus(); refresh.click(); });
    expect(host.querySelector("#recommendation-links-loading")).not.toBeNull();
    const hook = window.__xeniosPartnerComponentDisplayV1!; hook.releasePending(); await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("The recommendation service is not available right now.");
    expect(document.activeElement?.id).toBe("recommendation-refresh-error");
    await act(async () => host.querySelector<HTMLButtonElement>("#recommendation-refresh-error")!.click()); await settle();
    expect(host.querySelector("#readable-codes-title")).not.toBeNull();
    await act(async () => button("Assign a referral code").click());
    expect(host.querySelector("#readable-code-input")).not.toBeNull();
    await act(async () => button("Cancel code change").click());
    expect(host.querySelector("#readable-code-input")).toBeNull();
    expect(hook.snapshot().reads.every(item => item.method === "GET")).toBe(true);
    expect(hook.snapshot().violations).toEqual([]);
  });

  it("does not inherit the outer provider's account or mutation callbacks", async () => {
    const outside = partnerDisplayContext(select()); const callback = vi.fn();
    await act(async () => root.render(<ResearchContext.Provider value={{ ...outside, memberToken: "unrelated-outer-token", logout: callback }}>
      <PartnerGalleryFixture page="partner-links"><Links /></PartnerGalleryFixture>
    </ResearchContext.Provider>));
    await settle();
    expect(host.textContent).toContain("DISPLAY-CODE"); expect(callback).not.toHaveBeenCalled();
    expect(window.__xeniosPartnerComponentDisplayV1!.snapshot().violations).toEqual([]);
  });
});
