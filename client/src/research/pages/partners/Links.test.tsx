// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_API, type RecommendationLink } from "@shared/research/referral-v1";
import { ACCOUNT_PORTAL_ROUTES, PARTNER_ROUTES } from "../../lib/routes";
import Links, { EXPORT_CHECKING, PRINT_CARD_READY } from "./Links";

const session = vi.hoisted(() => ({ token: "synthetic-member-one" as string | null, checking: false, recovery: "none", status: "authenticated" }));
vi.mock("../../core", () => ({ useResearch: () => ({ memberToken: session.token, memberChecking: session.checking, recovery: session.recovery, memberSessionStatus: session.status }) }));
const shell = vi.hoisted(() => ({ showNav: [] as unknown[] }));
vi.mock("../../ui/shells", () => ({ ResearchPartnerShell: ({ children, showNav }: { children: ReactNode; showNav?: boolean }) => { shell.showNav.push(showNav); return <div>{children}</div>; } }));
let host: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const link = (patch: Partial<RecommendationLink> = {}): RecommendationLink => ({
  id: "synthetic-link-one", url: `${location.origin}/r/r1_${"A".repeat(43)}`, destinationPath: "/health", state: "ready",
  createdAt: "2026-09-04T12:00:00Z", expiresAt: "2026-12-04T12:00:00Z", revokedAt: null, opens: 2, accountsLinked: 1, ...patch,
});
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const list = (rows: RecommendationLink[] = [link()], eligible = true) => response({ ok: true, eligible, links: rows });
const flush = () => act(async () => { await Promise.resolve(); });
const render = () => act(async () => { root.render(<Links />); });
const button = (label: string) => Array.from(host.querySelectorAll("button")).find(item => item.textContent === label)!;
const click = (label: string) => act(async () => { button(label).click(); });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-member-one";
  session.checking = false;
  session.recovery = "none"; session.status = "authenticated";
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-07T12:00:00Z"));
  fetcher = vi.fn().mockResolvedValue(list()); vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("00000000-0000-4000-8000-000000000001") });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("owned affiliate readable-code management", () => {
  const actor = "11111111-1111-4111-8111-111111111111";
  const sid = "22222222-2222-4222-8222-222222222222";
  const firstId = "33333333-3333-4333-8333-333333333333";
  const secondId = "44444444-4444-4444-8444-444444444444";
  const thirdId = "66666666-6666-4666-8666-666666666666";
  const jwt = (subject = actor, sessionId = sid, revision = 1) => `synthetic.${btoa(JSON.stringify({ sub: subject, session_id: sessionId, amr: [{ method: "password" }], iat: revision }))}.synthetic`;
  const owned = (id = firstId, patch: Partial<RecommendationLink> = {}) => link({ id, ...patch });
  const alias = (id = firstId, patch: Partial<RecommendationLink> = {}) => ({ code: "SAM-123", assignedAt: "2026-09-04T12:00:00Z", link: owned(id, patch) });
  const aliases = (rows = [alias()]) => response({ ok: true, aliases: rows });
  const csrf = () => response({ ok: true, csrfToken: "C".repeat(43) });
  const writes = () => fetcher.mock.calls.filter(([path, init]) => init.method === "POST" && path !== REFERRAL_API.bootstrap);
  const bootstrapCalls = () => fetcher.mock.calls.filter(([path]) => path === REFERRAL_API.bootstrap);
  const panel = () => host.querySelector('section[aria-labelledby="readable-codes-title"]')!;
  function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
  const change = (id: string, value: string) => act(async () => {
    const element = host.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
  const submit = () => act(async () => { panel().querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  const startAssignment = async () => { await click("Assign a referral code"); await change("readable-code-input", " sam-123 "); await change("readable-code-target", firstId); };
  const startMove = async () => { await click("Move SAM-123 to another link"); await change("readable-code-target", secondId); await change("readable-code-reason", " New destination "); };
  beforeEach(() => {
    session.token = jwt();
    fetcher.mockImplementation(async (path, init) => {
      if (path === REFERRAL_API.links) return list([owned(), owned(secondId, { destinationPath: "/care" }), owned(thirdId, { destinationPath: "/research" })]);
      if (path === REFERRAL_API.bootstrap) return csrf();
      if (path === REFERRAL_API.readableAliases && init.method === "GET") return aliases();
      return response({ ok: false }, 503);
    });
  });
  it("shows only the verified own list and truthful active/expiry labels, with no automatic mutation", async () => {
    await render(); await flush();
    expect(panel().textContent).toContain("SAM-123"); expect(panel().textContent).toContain("Active");
    expect(panel().textContent).toContain("Expires");
    expect(panel().querySelector<HTMLInputElement>("input[readonly]")?.value).toBe(`${location.origin}/r/SAM-123`);
    expect(writes()).toHaveLength(0); expect(bootstrapCalls()).toHaveLength(0);
    expect(panel().textContent).not.toMatch(/commission|patient|payment/);
  });
  it("copies only the canonical readable code, retains both URL actions and offers a selectable manual code", async () => {
    await render(); await flush();
    const clipboard = vi.mocked(navigator.clipboard.writeText);
    const control = button("Copy code"); control.focus();
    expect(control.style.minHeight).toBe("44px");
    expect(button("Copy code link")).toBeDefined(); expect(button("Share code link")).toBeDefined();
    await click("Copy code");
    expect(clipboard).toHaveBeenCalledExactlyOnceWith("SAM-123");
    expect(panel().textContent).toContain("Referral code copied. Paste it into the referral-code field.");
    expect(panel().textContent).not.toContain("Link copied.");
    expect(document.activeElement).toBe(control);
    const codeInput = panel().querySelector<HTMLInputElement>("#readable-code-value-SAM-123")!;
    expect(codeInput.readOnly).toBe(true); expect(codeInput.value).toBe("SAM-123");
    await act(async () => codeInput.focus());
    expect(codeInput.selectionStart).toBe(0); expect(codeInput.selectionEnd).toBe("SAM-123".length);
    await click("Copy code link");
    expect(clipboard).toHaveBeenLastCalledWith(`${location.origin}/r/SAM-123`);
    expect(writes()).toHaveLength(0); expect(bootstrapCalls()).toHaveLength(0);
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });
  it.each(["denied", "missing"] as const)("gives code-specific manual recovery when clipboard is %s", async failure => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: failure === "missing" ? undefined
      : { writeText: vi.fn().mockRejectedValue(new Error("synthetic denial")) } });
    await render(); await flush(); await click("Copy code");
    expect(panel().textContent).toContain("Copy is unavailable in this browser. Select the referral code below and copy it manually.");
    expect(panel().textContent).not.toContain("Referral code copied.");
    expect(panel().querySelector<HTMLInputElement>("#readable-code-value-SAM-123")?.value).toBe("SAM-123");
    expect(writes()).toHaveLength(0); expect(bootstrapCalls()).toHaveLength(0);
  });
  it("latches duplicate code-copy presses without losing keyboard focus", async () => {
    const held = deferred<void>(), writeText = vi.fn(() => held.promise);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await render(); await flush(); const control = button("Copy code"); control.focus();
    await act(async () => { control.click(); control.click(); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith("SAM-123");
    expect(control.disabled).toBe(false); expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(control);
    await act(async () => held.resolve()); await flush();
    expect(control.getAttribute("aria-disabled")).toBeNull();
    expect(panel().textContent).toContain("Referral code copied.");
    expect(writes()).toHaveLength(0);
  });
  it("invalidates the loaded alias immediately when refresh starts, before another click can copy it", async () => {
    await render(); await flush();
    const control = button("Copy code"), held = deferred<unknown>();
    fetcher.mockImplementationOnce(() => held.promise);
    await act(async () => { button("Refresh codes").click(); control.click(); });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    await act(async () => held.resolve(aliases())); await flush();
    expect(writes()).toHaveLength(0);
  });
  it("refuses copying when the ready alias expires after render but before the press", async () => {
    await render(); await flush();
    const control = button("Copy code"); control.focus();
    const callsBefore = fetcher.mock.calls.length;
    vi.mocked(Date.now).mockReturnValue(Date.parse(alias().link.expiresAt));
    await click("Copy code");
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(panel().textContent).not.toContain("Referral code copied.");
    expect(panel().textContent).toContain("This referral code has expired. Use Refresh codes to check the current list.");
    expect(panel().querySelector("li > p")?.textContent).toMatch(/^Expired/);
    expect(button("Copy code")).toBeUndefined(); expect(button("Copy code link")).toBeUndefined();
    expect(button("Share code link")).toBeUndefined();
    expect(button("Refresh codes").disabled).toBe(false);
    expect(document.activeElement).toBe(button("Refresh codes"));
    expect(fetcher.mock.calls).toHaveLength(callsBefore);
    expect(writes()).toHaveLength(0); expect(bootstrapCalls()).toHaveLength(0);
    // Refresh is the real existing read; it does not renew this still-expired link.
    await click("Refresh codes"); await flush();
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe(REFERRAL_API.readableAliases);
    expect(fetcher.mock.calls.at(-1)?.[1].method).toBe("GET");
    expect(panel().querySelector("li > p")?.textContent).toMatch(/^Expired/);
    expect(button("Copy code")).toBeUndefined();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0); expect(bootstrapCalls()).toHaveLength(0);
  });
  it("does not announce a pending clipboard result as usable after expiry", async () => {
    const held = deferred<void>(), writeText = vi.fn(() => held.promise);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await render(); await flush(); await click("Copy code");
    vi.mocked(Date.now).mockReturnValue(Date.parse(alias().link.expiresAt));
    await act(async () => held.resolve()); await flush();
    expect(writeText).toHaveBeenCalledExactlyOnceWith("SAM-123");
    expect(panel().textContent).not.toContain("Referral code copied.");
  });
  it.each(["refresh", "mutation", "checking", "logout", "account", "session", "refresh-token", "recovery", "verification-denial", "unmount"] as const)(
    "suppresses a pending copy result after %s without another clipboard write", async transition => {
      const held = deferred<void>(), writeText = vi.fn(() => held.promise);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
      await render(); await flush(); await click("Copy code");
      if (transition === "refresh") await click("Refresh codes");
      else if (transition === "mutation") {
        await startMove(); await submit(); await flush();
        expect(button("Copy code")).toBeUndefined(); expect(button("Retry same code change")).toBeDefined();
      } else if (transition === "unmount") { await act(async () => root.unmount()); root = createRoot(host); }
      else {
        if (transition === "checking") { session.checking = true; session.status = "checking"; }
        else if (transition === "logout") { session.token = null; session.status = "signed_out"; }
        else if (transition === "account") session.token = jwt("77777777-7777-4777-8777-777777777777");
        else if (transition === "session") session.token = jwt(actor, "88888888-8888-4888-8888-888888888888");
        else if (transition === "refresh-token") session.token = jwt(actor, sid, 2);
        else if (transition === "recovery") session.recovery = "pending";
        else session.status = "verification_failed";
        await render(); await flush();
      }
      await act(async () => held.resolve()); await flush();
      expect(writeText).toHaveBeenCalledExactlyOnceWith("SAM-123");
      expect(host.textContent).not.toContain("Referral code copied.");
      if (transition !== "mutation") expect(writes()).toHaveLength(0);
    });
  it.each(["sam-123", " SAM-123 ", "A".repeat(25), "bad/code", "javascript:alert(1)"])(
    "never copies a noncanonical or malformed server alias %s", async code => {
      fetcher.mockImplementation(async path => path === REFERRAL_API.links ? list([owned()])
        : response({ ok: true, aliases: [{ ...alias(), code }] }));
      await render(); await flush();
      expect(button("Copy code")).toBeUndefined();
      expect(panel().querySelector('[role="alert"]')).not.toBeNull();
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled(); expect(writes()).toHaveLength(0);
    });
  it.each(["revoked", "expired", "partner_inactive", "unavailable"] as const)("does not copy an alias whose link is %s", async state => {
    fetcher.mockImplementation(async path => path === REFERRAL_API.links ? list([owned()]) : aliases([alias(firstId, { state })]));
    await render(); await flush(); expect(button("Copy code")).toBeUndefined();
    expect(panel().textContent).toContain("not available to share");
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled(); expect(writes()).toHaveLength(0);
  });
  it.each(["checking", "signed-out", "recovery", "verification-denied", "ineligible"] as const)(
    "offers no code-copy capability for %s", async state => {
      if (state === "checking") session.checking = true;
      else if (state === "signed-out") { session.token = null; session.status = "signed_out"; }
      else if (state === "recovery") session.recovery = "pending";
      else if (state === "verification-denied") session.status = "verification_failed";
      else fetcher.mockResolvedValue(list([], false));
      await render(); await flush();
      expect(button("Copy code")).toBeUndefined();
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled(); expect(writes()).toHaveLength(0);
    });
  it("requires explicit confirmation, normalizes the code and bootstraps CSRF before assignment", async () => {
    let assigned = false;
    fetcher.mockImplementation(async (path, init) => {
      if (path === REFERRAL_API.links) return list([owned(), owned(secondId)]);
      if (path === REFERRAL_API.bootstrap) return csrf();
      if (path === REFERRAL_API.readableAliases && init.method === "GET") return aliases(assigned ? [alias()] : []);
      assigned = true; return response({ ok: true, alias: alias(), created: true });
    });
    await render(); await flush(); await startAssignment();
    expect(writes()).toHaveLength(0);
    await submit(); await flush();
    expect(writes()).toHaveLength(1); expect(bootstrapCalls()).toHaveLength(1);
    const [path, init] = writes()[0];
    expect(path).toBe(REFERRAL_API.readableAliases);
    expect(JSON.parse(init.body)).toEqual({ code: "SAM-123", linkId: firstId });
    expect(init.headers["X-Xenios-Referral-CSRF"]).toBe("C".repeat(43));
    expect(fetcher.mock.calls.filter(([path, init]) => path === REFERRAL_API.readableAliases && init.method === "GET")).toHaveLength(2);
    expect(panel().textContent).toContain("SAM-123");
  });
  it("sends an explicit CAS move with a trimmed reason, then displays fresh list state rather than its receipt", async () => {
    let moved = false;
    fetcher.mockImplementation(async (path, init) => {
      if (path === REFERRAL_API.links) return list([owned(), owned(secondId), owned(thirdId, { destinationPath: "/research" })]);
      if (path === REFERRAL_API.bootstrap) return csrf();
      if (path === REFERRAL_API.readableAliases) return aliases([alias(moved ? thirdId : firstId, moved ? { destinationPath: "/research" } : {})]);
      moved = true;
      return response({ ok: true, alias: alias(secondId, { destinationPath: "/care" }), previousLinkId: firstId, reassignedAt: "2026-09-07T12:00:00Z", replayed: true });
    });
    await render(); await flush(); await startMove(); await submit(); await flush();
    expect(writes()[0][0]).toBe(REFERRAL_API.reassignReadableAlias);
    expect(JSON.parse(writes()[0][1].body)).toEqual({ code: "SAM-123", expectedLinkId: firstId, linkId: secondId, reason: "New destination" });
    expect(panel().textContent).toContain("Research — nonclinical access and education");
    expect(panel().textContent).not.toContain("Destination: Care — explore");
  });
  it("says a taken code is unavailable and that a code follows its link", async () => {
    fetcher.mockImplementation(async (path, init) => {
      if (path === REFERRAL_API.links) return list([owned(), owned(secondId)]);
      if (path === REFERRAL_API.bootstrap) return csrf();
      if (path === REFERRAL_API.readableAliases && init.method === "GET") return aliases([]);
      return response({ ok: false, code: "idempotency_conflict" }, 409);
    });
    await render(); await flush();
    expect(panel().textContent).toContain("A code works only while its link is active.");
    await startAssignment(); await submit(); await flush();
    expect(writes()).toHaveLength(1);
    expect(panel().textContent).toContain("That code isn’t available, or the link changed.");
    expect(panel().textContent).not.toMatch(/commission|earning|discount|reward/i);
  });
  it("says why assignment is disabled when every active link already carries a code", async () => {
    fetcher.mockImplementation(async (path, init) => {
      if (path === REFERRAL_API.links) return list([owned()]);
      if (path === REFERRAL_API.readableAliases && init.method === "GET") return aliases();
      return response({ ok: false }, 503);
    });
    await render(); await flush();
    expect(button("Assign a referral code").disabled).toBe(true);
    expect(panel().textContent).toContain("Each active link can carry one code.");
  });
  it("focuses the opening field and returns focus on Cancel without any POST", async () => {
    await render(); await flush(); await click("Assign a referral code");
    expect(document.activeElement?.id).toBe("readable-code-input");
    await click("Cancel code change"); expect(document.activeElement).toBe(button("Assign a referral code"));
    await click("Move SAM-123 to another link"); expect(document.activeElement?.id).toBe("readable-code-target");
    await click("Cancel code change"); expect(document.activeElement).toBe(button("Move SAM-123 to another link"));
    expect(writes()).toHaveLength(0); expect(bootstrapCalls()).toHaveLength(0);
  });
  it("does not offer revoked, expired, foreign or already-code-bound links as new targets", async () => {
    fetcher.mockImplementation(async (path) => path === REFERRAL_API.links
      ? list([owned(), owned(secondId, { state: "revoked", revokedAt: "2026-09-06T00:00:00Z" }), owned(thirdId, { expiresAt: "2026-09-06T00:00:00Z" })]) : aliases());
    await render(); await flush();
    expect(button("Assign a referral code").disabled).toBe(true);
    expect(button("Move SAM-123 to another link").disabled).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it.each(["revoked", "expired", "partner_inactive", "unavailable"] as const)("keeps %s code state visible without a share action or renewal claim", async state => {
    fetcher.mockImplementation(async path => path === REFERRAL_API.links ? list([owned(), owned(secondId)]) : aliases([alias(firstId, { state })]));
    await render(); await flush();
    expect(panel().textContent).toContain("not available to share");
    expect(panel().querySelector("input[readonly]")).toBeNull();
    expect(button("Copy code link")).toBeUndefined();
    expect(writes()).toHaveLength(0);
  });
  it.each([401, 403, 503])("distinguishes list HTTP %s from a validated empty list", async status => {
    fetcher.mockImplementation(async path => path === REFERRAL_API.links ? list([owned()]) : response({ ok: false, message: "private provider diagnostic" }, status));
    await render(); await flush();
    expect(panel().querySelector('[role="alert"]')).not.toBeNull();
    expect(panel().textContent).not.toContain("no referral codes yet");
    expect(panel().textContent).not.toContain("private provider");
    expect(button("Assign a referral code")).toBeUndefined();
  });
  it("does not advertise an elapsed ready code as active or shareable", async () => {
    fetcher.mockImplementation(async path => path === REFERRAL_API.links ? list([owned(), owned(secondId)]) : aliases([alias(firstId, { expiresAt: "2026-09-06T00:00:00Z" })]));
    await render(); await flush(); expect(panel().textContent).toContain("Expired");
    expect(panel().textContent).not.toContain("Active · Assigned"); expect(button("Copy code link")).toBeUndefined();
  });
  it("uses validated empty separately from malformed or capability-unavailable responses", async () => {
    let malformed = true;
    fetcher.mockImplementation(async path => path === REFERRAL_API.links ? list([owned()]) : malformed ? response({ ok: true, aliases: [{ code: "BAD", customer: "private" }] }) : aliases([]));
    await render(); await flush(); expect(button("Assign a referral code")).toBeUndefined();
    expect(panel().textContent).not.toContain("no referral codes yet");
    malformed = false; await click("Refresh codes");
    expect(panel().textContent).toContain("no referral codes yet"); expect(button("Assign a referral code").disabled).toBe(false);
  });
  it("holds one immutable pending command, hides stale target state, and sends no duplicate click", async () => {
    const held = deferred<unknown>();
    fetcher.mockImplementation(async (path, init) => path === REFERRAL_API.links ? list([owned(), owned(secondId)])
      : path === REFERRAL_API.bootstrap ? csrf() : path === REFERRAL_API.readableAliases ? aliases() : held.promise);
    await render(); await flush(); await startMove(); await submit();
    expect(panel().textContent).toContain("Confirming your code change");
    expect(panel().querySelector("input[readonly]")).toBeNull(); expect(panel().querySelector("form")).toBeNull();
    expect(button("Refresh codes").disabled).toBe(true); expect(writes()).toHaveLength(1);
    held.resolve(response({ ok: false }, 503)); await flush();
    expect(button("Retry same code change")).toBeDefined(); expect(writes()).toHaveLength(1);
  });
  it("keeps the original operation through actual checking/null then same-session refresh and retries exact bytes/key", async () => {
    let attempts = 0;
    fetcher.mockImplementation(async (path, init) => {
      if (path === REFERRAL_API.links) return list([owned(), owned(secondId)]);
      if (path === REFERRAL_API.bootstrap) return csrf();
      if (path === REFERRAL_API.readableAliases) return aliases();
      if (++attempts === 1) throw new Error("lost reply");
      return response({ ok: true, alias: alias(secondId), previousLinkId: firstId, reassignedAt: "2026-09-07T12:00:00Z", replayed: true });
    });
    await render(); await flush(); await startMove(); await submit(); await flush();
    const original = writes()[0][1];
    session.token = null; session.checking = true; session.status = "checking"; await render();
    expect(host.textContent).not.toContain("Your referral codes"); expect(writes()).toHaveLength(1);
    session.token = jwt(actor, sid, 2); session.checking = false; session.status = "authenticated"; await render(); await flush();
    expect(panel().textContent).toContain("awaiting confirmation"); expect(panel().querySelector("input[readonly]")).toBeNull();
    await click("Retry same code change"); await flush();
    expect(writes()).toHaveLength(2); expect(writes()[1][1].body).toBe(original.body);
    expect(writes()[1][1].headers["Idempotency-Key"]).toBe(original.headers["Idempotency-Key"]);
    expect(writes()[1][1].headers.Authorization).toBe(`Bearer ${session.token}`);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1); expect(bootstrapCalls()).toHaveLength(2);
  });
  it("blocks a held bootstrap from dispatching on an old credential, retaining the same retry on the new verified frame", async () => {
    const held = deferred<unknown>(); let bootstrapCount = 0;
    fetcher.mockImplementation(async path => path === REFERRAL_API.links ? list([owned(), owned(secondId)])
      : path === REFERRAL_API.bootstrap ? ++bootstrapCount === 1 ? held.promise : csrf()
      : path === REFERRAL_API.readableAliases ? aliases() : response({ ok: false }, 503));
    await render(); await flush(); await startMove(); await submit();
    session.checking = true; session.status = "checking"; session.token = null; await render();
    held.resolve(csrf()); await flush(); expect(writes()).toHaveLength(0);
    session.checking = false; session.status = "authenticated"; session.token = jwt(actor, sid, 2); await render(); await flush();
    expect(button("Retry same code change")).toBeDefined(); await click("Retry same code change");
    expect(writes()).toHaveLength(1); expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it.each(["actor", "session", "signout", "recovery", "verification_denial"] as const)("retires the old uncertain operation on %s, without carrying it back", async changeKind => {
    fetcher.mockImplementation(async path => path === REFERRAL_API.links ? list([owned(), owned(secondId)])
      : path === REFERRAL_API.bootstrap ? csrf() : path === REFERRAL_API.readableAliases ? aliases() : response({ ok: false }, 503));
    await render(); await flush(); await startMove(); await submit(); await flush();
    expect(button("Retry same code change")).toBeDefined();
    if (changeKind === "actor") session.token = jwt("77777777-7777-4777-8777-777777777777");
    else if (changeKind === "session") session.token = jwt(actor, "88888888-8888-4888-8888-888888888888");
    else if (changeKind === "recovery") session.recovery = "pending";
    else { session.token = null; session.status = changeKind === "signout" ? "signed_out" : "verification_failed"; }
    await render(); await flush(); expect(button("Retry same code change")).toBeUndefined();
    session.token = jwt(); session.recovery = "none"; session.status = "authenticated"; await render(); await flush();
    expect(button("Retry same code change")).toBeUndefined(); expect(writes()).toHaveLength(1);
  });
  it("ignores a held old account list after a subject switch", async () => {
    const held = deferred<unknown>(); let reads = 0;
    fetcher.mockImplementation(async path => path === REFERRAL_API.links ? list([owned(), owned(secondId)]) : ++reads === 1 ? held.promise : aliases([]));
    await render(); await flush(); session.token = jwt("77777777-7777-4777-8777-777777777777"); await render(); await flush();
    held.resolve(aliases()); await flush();
    expect(panel().textContent).toContain("no referral codes yet"); expect(panel().textContent).not.toContain("SAM-123");
  });
});

describe("canonical recommendation QR and print exports", () => {
  let createUrl: ReturnType<typeof vi.fn>;
  let revokeUrl: ReturnType<typeof vi.fn>;
  let saved: string[];
  let printed: ReturnType<typeof vi.fn>;
  const allButton = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === label)!;
  const allClick = (label: string) => act(async () => allButton(label).click());
  const card = () => document.querySelector('[data-recommendation-print="true"]');
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(yes => { resolve = yes; });
    return { promise, resolve };
  }
  beforeEach(() => {
    saved = [];
    createUrl = vi.fn(() => "blob:synthetic-qr"); revokeUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeUrl });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download); });
    printed = vi.fn(); vi.stubGlobal("print", printed);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { queueMicrotask(() => callback(0)); return 1; });
  });

  it("requires explicit intent, rereads server eligibility, and downloads only a local SVG with no new tracking/mutation", async () => {
    await render();
    expect(createUrl).not.toHaveBeenCalled();
    await click("Download QR (SVG)");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([path, init]) => path === REFERRAL_API.links && init.method === "GET"
      && init.body === undefined && init.cache === "no-store" && init.headers.Authorization === "Bearer synthetic-member-one")).toBe(true);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(createUrl.mock.calls[0][0].type).toBe("image/svg+xml;charset=utf-8");
    expect(saved).toEqual(["xenios-recommendation-qr.svg"]);
    expect(revokeUrl).toHaveBeenCalledWith("blob:synthetic-qr");
    expect(host.textContent).toContain("browser controls whether the file was saved");
    expect(host.textContent).toContain("Include your partner relationship disclosure");
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it("keeps focus on a pressed export control, announces the recheck, and ignores a second press", async () => {
    let answer!: (value: unknown) => void;
    fetcher.mockResolvedValueOnce(list()).mockImplementationOnce(() => new Promise(resolve => { answer = resolve; })).mockResolvedValue(list());
    await render();
    for (const label of ["Download QR (SVG)", "Download QR (PNG)", "Preview print card"]) expect(button(label).getAttribute("aria-disabled")).toBeNull();
    const control = button("Download QR (SVG)");
    control.focus();
    // jsdom does not turn Enter into activation, so this presses the focused button the way Enter would.
    await act(async () => { control.click(); });
    const status = () => host.querySelector('article [role="status"]')?.textContent;
    expect(status()).toBe(EXPORT_CHECKING);
    for (const label of ["Download QR (SVG)", "Download QR (PNG)", "Preview print card"]) {
      expect(button(label).disabled).toBe(false);
      expect(button(label).getAttribute("aria-disabled")).toBe("true");
    }
    expect(document.activeElement).toBe(control);
    await act(async () => { control.click(); button("Download QR (PNG)").click(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => answer(list())); await flush();
    expect(control.isConnected).toBe(true);
    expect(document.activeElement).toBe(control);
    expect(control.getAttribute("aria-disabled")).toBeNull();
    expect(status()).not.toBe(EXPORT_CHECKING);
  });
  it("replaces the recheck line with the preview outcome, and clears it when the recheck refuses", async () => {
    await render(); await click("Preview print card");
    expect(card()).not.toBeNull();
    expect(host.querySelector('article [role="status"]')?.textContent).toBe(PRINT_CARD_READY);
    await act(async () => root.unmount()); root = createRoot(host);
    fetcher.mockResolvedValueOnce(list()).mockResolvedValueOnce(list([link({ state: "unavailable" })]));
    await render(); await click("Preview print card");
    expect(host.textContent).toContain("no longer available to export");
    expect(host.textContent).not.toContain(EXPORT_CHECKING);
  });
  it("drops the recheck line when closing the print card abandons a pending export", async () => {
    let answer!: (value: unknown) => void;
    await render(); await click("Preview print card");
    fetcher.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    await click("Download QR (SVG)");
    expect(host.textContent).toContain(EXPORT_CHECKING);
    await allClick("Close preview");
    expect(card()).toBeNull();
    expect(host.textContent).not.toContain(EXPORT_CHECKING);
    await act(async () => answer(list())); await flush();
    expect(saved).toEqual([]);
    expect(button("Download QR (SVG)").getAttribute("aria-disabled")).toBeNull();
  });
  it.each([
    { name: "a failed recheck", answer: () => response({ ok: false, code: "not_ready" }, 503) },
    { name: "an unreadable recheck", answer: () => response({ ok: true, eligible: "yes", links: [] }) },
    { name: "a newly revoked link", answer: () => list([link({ state: "revoked" })]) },
  ])("moves focus to Refresh links when $name removes the pressed export control", async ({ answer }) => {
    fetcher.mockResolvedValueOnce(list()).mockResolvedValueOnce(answer());
    await render();
    const control = button("Download QR (SVG)");
    control.focus();
    await act(async () => { control.click(); }); await flush();
    expect(control.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.id).toBe("recommendation-refresh-error");
    expect(saved).toEqual([]);
  });
  it("leaves focus on a refused export control that is still on the page", async () => {
    fetcher.mockResolvedValueOnce(list()).mockResolvedValueOnce(list([link({ url: `${location.origin}/r/r1_${"B".repeat(43)}` })]));
    await render();
    const control = button("Preview print card");
    control.focus();
    await act(async () => { control.click(); }); await flush();
    expect(host.textContent).toContain("no longer available to export");
    // The row keeps its id, so React keeps the same button: it stays, and so does focus.
    expect(control.isConnected).toBe(true);
    expect(document.activeElement).toBe(control);
  });
  it.each(["revoked", "expired", "partner_inactive", "unavailable"] as const)("refuses a newly server-reported %s link during export", async state => {
    fetcher.mockResolvedValueOnce(list()).mockResolvedValueOnce(list([link({ state })]));
    await render(); await click("Download QR (SVG)");
    expect(saved).toEqual([]); expect(card()).toBeNull();
    expect(host.textContent).toContain("no longer available to export");
    expect(button("Download QR (SVG)")).toBeUndefined();
  });

  it.each([false, true])("refuses partner eligibility false or changed canonical URL (changed URL: %s)", async changed => {
    fetcher.mockResolvedValueOnce(list()).mockResolvedValueOnce(changed
      ? list([link({ url: `${location.origin}/r/r1_${"B".repeat(43)}` })]) : list([link()], false));
    await render(); await click("Preview print card");
    expect(card()).toBeNull(); expect(createUrl).not.toHaveBeenCalled();
    expect(host.textContent).toContain("no longer available to export");
  });

  it("never exposes an export for unsafe, locally expired, or revoked ready-looking rows", async () => {
    fetcher.mockResolvedValue(list([
      link({ id: "old", expiresAt: "2026-01-01T00:00:00Z" }),
      link({ id: "revoked", revokedAt: "2026-09-07T00:00:00Z" }),
      link({ id: "unsafe", url: `${link().url}?` }),
    ]));
    await render();
    expect(button("Download QR (SVG)")).toBeUndefined();
    expect(button("Preview print card")).toBeUndefined();
    expect(host.querySelector("input[readonly]")).toBeNull();
  });

  it("a link expiring during the fresh read does not produce bytes", async () => {
    await render(); const pending = deferred<ReturnType<typeof list>>();
    fetcher.mockReturnValueOnce(pending.promise); await click("Download QR (SVG)");
    vi.mocked(Date.now).mockReturnValue(Date.parse(link().expiresAt));
    await act(async () => pending.resolve(list()));
    expect(saved).toEqual([]); expect(createUrl).not.toHaveBeenCalled();
  });

  it.each(["logout", "account-switch", "checking", "unmount", "A-B-A", "refresh-token"])("drops an in-flight export on %s", async transition => {
    await render(); const pending = deferred<ReturnType<typeof list>>();
    fetcher.mockReturnValueOnce(pending.promise); await click("Download QR (SVG)");
    if (transition === "unmount") { await act(async () => root.unmount()); root = createRoot(host); }
    else if (transition === "checking") { session.checking = true; await render(); }
    else if (transition === "logout") { session.token = null; await render(); }
    else {
      session.token = transition === "refresh-token" ? "synthetic-refreshed-one" : "synthetic-member-two";
      fetcher.mockResolvedValueOnce(list([], false)); await render();
      if (transition === "A-B-A") { session.token = "synthetic-member-one"; await render(); }
    }
    await act(async () => pending.resolve(list()));
    expect(createUrl).not.toHaveBeenCalled(); expect(saved).toEqual([]); expect(card()).toBeNull();
    expect(document.body.textContent).not.toContain("QR download requested");
    expect(fetcher.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it("a refresh cancels a pending export even if its old response arrives last", async () => {
    await render(); const pending = deferred<ReturnType<typeof list>>();
    fetcher.mockReturnValueOnce(pending.promise); await click("Download QR (SVG)");
    fetcher.mockResolvedValueOnce(list([], false)); await click("Refresh");
    await act(async () => pending.resolve(list()));
    expect(saved).toEqual([]); expect(host.textContent).toContain("Referral access is not active");
  });

  it("latches duplicate export requests before React rerenders", async () => {
    await render(); const pending = deferred<ReturnType<typeof list>>(); fetcher.mockReturnValueOnce(pending.promise);
    await act(async () => { button("Download QR (SVG)").click(); button("Download QR (SVG)").click(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(list())); expect(saved).toHaveLength(1);
  });

  it("opens a print-only card and rechecks before printing, without claiming a saved file", async () => {
    await render(); await click("Preview print card");
    expect(card()?.textContent).toContain(link().url);
    expect(card()?.textContent).toContain("partner may receive compensation");
    expect(printed).not.toHaveBeenCalled();
    await allClick("Print / Save as PDF");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(printed).toHaveBeenCalledTimes(1); expect(saved).toEqual([]);
    expect(document.body.textContent).not.toContain("PDF saved");
    session.token = null; await render();
    expect(card()).toBeNull(); expect(document.body.textContent).not.toContain(link().url);
  });

  it("closing preview before the pending recheck resolves prevents print", async () => {
    await render(); await click("Preview print card");
    const pending = deferred<ReturnType<typeof list>>(); fetcher.mockReturnValueOnce(pending.promise);
    await allClick("Print / Save as PDF"); await allClick("Close preview");
    await act(async () => pending.resolve(list()));
    expect(printed).not.toHaveBeenCalled(); expect(card()).toBeNull();
  });

  it("account switching after print verification but before the browser frame cannot print the old card", async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
    await render(); await click("Preview print card"); await allClick("Print / Save as PDF");
    expect(frame).toBeDefined();
    session.token = "synthetic-member-two"; fetcher.mockResolvedValueOnce(list([], false)); await render();
    await act(async () => frame!(0));
    expect(printed).not.toHaveBeenCalled(); expect(card()).toBeNull();
  });

  it.each(["unavailable", "malformed", "duplicate"])("failed export recheck remains fail-closed: %s", async reason => {
    await render();
    fetcher.mockResolvedValueOnce(reason === "unavailable" ? response({ ok: false, code: "capability_disabled", message: "PRIVATE-DETAIL" }, 503)
      : reason === "duplicate" ? list([link(), link()]) : response({ ok: true, eligible: true, links: null }));
    await click("Download QR (SVG)");
    expect(saved).toEqual([]); expect(card()).toBeNull(); expect(createUrl).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("PRIVATE-DETAIL");
  });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("partner recommendation links", () => {
  it("uses one canonical server read and exposes only safe aggregate links", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledWith(REFERRAL_API.links, expect.objectContaining({ method: "GET", cache: "no-store", credentials: "same-origin", headers: expect.objectContaining({ Authorization: "Bearer synthetic-member-one" }) }));
    expect(host.textContent).toContain("Recorded opens: 2");
    expect(host.textContent).toContain("Accounts linked: 1");
    expect(host.textContent).toContain("does not mean an order");
    expect(host.querySelector("input[readonly]")?.getAttribute("value")).toBe(link().url);
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const item of host.querySelectorAll("button, select, input")) expect((item as HTMLElement).style.minHeight).toBe("44px");
  });
  it("does not enroll an ineligible or signed-out person", async () => {
    fetcher.mockResolvedValue(list([], false)); await render();
    expect(host.textContent).toContain("Referral access is not active");
    expect(button("Create recommendation link")).toBeUndefined();
    expect(host.textContent).not.toContain("Apply to become");
    session.token = null; await render();
    expect(host.textContent).toContain("Sign in to manage your links");
    expect(host.querySelector('a[href^="/research/sign-in"]')?.getAttribute("href")).toBe("/research/sign-in?returnTo=%2Fresearch%2Fpartners%2Flinks");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("creates with a safe destination and reuses the idempotency key after uncertainty", async () => {
    fetcher.mockResolvedValueOnce(list([])).mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(response({ ok: true, link: link() })).mockResolvedValue(list());
    await render(); await click("Create recommendation link");
    expect(host.textContent).toContain("could not confirm the result");
    await click("Create recommendation link");
    const writes = fetcher.mock.calls.filter(([, options]) => options.method === "POST");
    expect(writes).toHaveLength(2);
    expect(writes[0][1].body).toBe(JSON.stringify({ destinationPath: "/health" }));
    expect(writes[0][1].headers["Idempotency-Key"]).toBe("00000000-0000-4000-8000-000000000001");
    expect(writes[1][1].headers["Idempotency-Key"]).toBe(writes[0][1].headers["Idempotency-Key"]);
    expect(host.textContent).toContain("ready to share");
  });
  it("requires revoke confirmation and retries the same revoke safely", async () => {
    const revoked = link({ state: "revoked", url: null, revokedAt: "2026-09-04T13:00:00Z" });
    fetcher.mockResolvedValueOnce(list()).mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(response({ ok: true, link: revoked })).mockResolvedValue(list([revoked]));
    await render(); await click("Revoke link");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Existing attribution is not removed");
    await click("Confirm revoke"); await click("Confirm revoke");
    const writes = fetcher.mock.calls.filter(([, options]) => options.method === "POST");
    expect(writes[0][0]).toBe(`${REFERRAL_API.links}/synthetic-link-one/revoke`);
    expect(writes[0][1].headers["Idempotency-Key"]).toBe(writes[1][1].headers["Idempotency-Key"]);
    expect(host.textContent).toContain("Previously recorded referrals are unchanged");
    expect(button("Copy link")).toBeUndefined();
  });
  it("does not falsely confirm a revoke that returned an active row", async () => {
    fetcher.mockResolvedValueOnce(list()).mockResolvedValueOnce(response({ ok: true, link: link() }));
    await render(); await click("Revoke link"); await click("Confirm revoke");
    expect(host.textContent).toContain("could not confirm the updated link");
    expect(host.textContent).not.toContain("Link revoked.");
  });
  it("hides inactive or unsafe share URLs and makes clipboard failure visible", async () => {
    fetcher.mockResolvedValue(list([link(), link({ id: "expired", state: "expired" }), link({ id: "unsafe", url: "https://outside.example.invalid/r/r1_" + "A".repeat(43) })]));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    await render();
    expect(host.querySelectorAll("input[readonly]")).toHaveLength(1);
    expect(host.textContent).not.toContain("outside.example.invalid");
    await click("Copy link"); expect(host.textContent).toContain("Copy is unavailable");
  });
  it("treats unavailable and malformed reads as unknown, not empty", async () => {
    fetcher.mockResolvedValueOnce(response({ ok: false, code: "not_ready", message: "private upstream details" }, 503));
    await render();
    expect(host.textContent).toContain("not available right now");
    expect(host.textContent).not.toContain("private upstream");
    expect(host.textContent).not.toContain("no recommendation links yet");
    fetcher.mockResolvedValue(response({ ok: true, eligible: true, links: [{ id: {} }] }));
    await click("Refresh links"); expect(host.textContent).toContain("could not be read safely");
  });
  // layout.tsx exempts exactly these partner pages from the legacy review gate; every other partner
  // page shows the review password. Account pages are member-guarded, and the inquiry page is public.
  const exempt = new Set<string>([PARTNER_ROUTES.dashboard, PARTNER_ROUTES.links, PARTNER_ROUTES.resources]);
  const reachable = (href: string) => {
    const path = href.split(/[?#]/)[0];
    return exempt.has(path) || path === PARTNER_ROUTES.home || path === "/research/sign-in"
      || (Object.values(ACCOUNT_PORTAL_ROUTES) as string[]).includes(path);
  };
  const hrefs = () => Array.from(host.querySelectorAll("a")).map(anchor => anchor.getAttribute("href") ?? "");
  const named = (label: string) => Array.from(host.querySelectorAll("a")).find(anchor => anchor.textContent === label)?.getAttribute("href");
  it("renders only links a partner can open, in every state, and no gated partner sub-navigation", async () => {
    const states: Array<() => void> = [
      () => fetcher.mockResolvedValue(list()),
      () => fetcher.mockResolvedValue(list([], false)),
      () => fetcher.mockResolvedValue(response({ ok: false, code: "not_ready" }, 503)),
      () => { session.token = null; },
      () => { session.token = "synthetic-member-one"; session.checking = true; },
    ];
    const gated = Object.values(PARTNER_ROUTES).filter(path => !exempt.has(path) && path !== PARTNER_ROUTES.home);
    for (const enter of states) {
      shell.showNav.length = 0;
      enter(); await render(); await flush();
      expect(shell.showNav.length).toBeGreaterThan(0);
      expect(shell.showNav.every(value => value === false)).toBe(true);
      expect(hrefs().length).toBeGreaterThan(0);
      for (const href of hrefs()) {
        expect(reachable(href), href).toBe(true);
        expect(gated.some(path => href.split(/[?#]/)[0] === path), href).toBe(false);
        if (href.split(/[?#]/)[0] === PARTNER_ROUTES.home) expect(href).toBe("/research/partners#partnership-inquiry");
      }
      for (const anchor of host.querySelectorAll("a")) expect((anchor as HTMLElement).style.minHeight).toBe("44px");
      await act(async () => root.unmount()); root = createRoot(host);
    }
  });
  it("names the partner tools and support on the links page", async () => {
    await render();
    const nav = host.querySelector('nav[aria-label="Partner tools"]')!;
    expect(Array.from(nav.querySelectorAll("a")).map(anchor => [anchor.textContent, anchor.getAttribute("href")])).toEqual([
      ["Partner dashboard", PARTNER_ROUTES.dashboard], ["Referral links", PARTNER_ROUTES.links], ["Partner resources", PARTNER_ROUTES.resources],
      ["My account", ACCOUNT_PORTAL_ROUTES.home], ["Account support", ACCOUNT_PORTAL_ROUTES.support],
    ]);
    const current = nav.querySelector<HTMLElement>('[aria-current="page"]')!;
    expect(current.textContent).toBe("Referral links");
    // Shown, not only announced: the current page differs visibly from its siblings.
    expect(current.style.fontWeight).toBe("700");
    expect(current.style.textDecoration).toBe("underline");
    expect(Array.from(nav.querySelectorAll<HTMLElement>("a:not([aria-current])")).every(anchor => anchor.style.fontWeight === "")).toBe(true);
    const rules = host.querySelector('section[aria-labelledby="recommendation-rules-title"]')!;
    expect(Array.from(rules.querySelectorAll("a")).map(anchor => anchor.getAttribute("href"))).toEqual([PARTNER_ROUTES.resources, ACCOUNT_PORTAL_ROUTES.support]);
    expect(host.textContent).not.toContain("Sharing rules");
  });
  it("gives an account without referral access a real next step and no application link", async () => {
    fetcher.mockResolvedValue(list([], false)); await render();
    expect(host.textContent).toContain("Referral access is not active");
    expect(named("Ask about partner access")).toBe("/research/partners#partnership-inquiry");
    expect(named("Account support")).toBe(ACCOUNT_PORTAL_ROUTES.support);
    expect(named("My account")).toBe(ACCOUNT_PORTAL_ROUTES.home);
    expect(hrefs()).not.toContain(PARTNER_ROUTES.apply);
    expect(hrefs().filter(href => href.split("#")[0] === PARTNER_ROUTES.home)).toEqual(["/research/partners#partnership-inquiry"]);
    expect(button("Create recommendation link")).toBeUndefined();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });
  function held() { let resolve!: (value: unknown) => void; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
  const posts = () => fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
  it("keeps focus on Create while it is pending, sends once, and returns focus to Create after the reload", async () => {
    const write = held();
    fetcher.mockImplementation(async (_path, init) => init?.method === "POST" ? write.promise : list());
    await render();
    const control = button("Create recommendation link");
    control.focus();
    await act(async () => { control.click(); });
    expect(control.textContent).toBe("Creating…");
    expect(control.disabled).toBe(false);
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(control);
    await act(async () => { control.click(); });
    expect(posts()).toHaveLength(1);
    await act(async () => write.resolve(response({ ok: true, link: link() }))); await flush();
    expect(host.textContent).toContain("ready to share");
    expect(document.activeElement?.id).toBe("recommendation-create");
    expect(posts()).toHaveLength(1);
  });
  it("keeps focus on Confirm revoke while it is pending, sends once, then moves focus to the links heading", async () => {
    const write = held();
    const revoked = link({ state: "revoked", url: null, revokedAt: "2026-09-04T13:00:00Z" });
    let rows = [link()];
    fetcher.mockImplementation(async (_path, init) => init?.method === "POST" ? write.promise : list(rows));
    await render(); await click("Revoke link");
    const control = button("Confirm revoke");
    control.focus();
    await act(async () => { control.click(); });
    expect(control.textContent).toBe("Revoking…");
    expect(control.disabled).toBe(false);
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(control);
    await act(async () => { control.click(); });
    expect(posts()).toHaveLength(1);
    rows = [revoked];
    await act(async () => write.resolve(response({ ok: true, link: revoked }))); await flush();
    expect(host.textContent).toContain("Previously recorded referrals are unchanged");
    expect(document.activeElement?.id).toBe("recommendation-links-title");
    expect(posts()).toHaveLength(1);
  });
  it("holds focus on the loading line during Refresh, then returns it to Refresh", async () => {
    const read = held();
    await render();
    fetcher.mockImplementationOnce(() => read.promise);
    const control = button("Refresh");
    control.focus();
    await act(async () => { control.click(); });
    expect(document.activeElement?.id).toBe("recommendation-links-loading");
    expect(document.activeElement?.getAttribute("role")).toBe("status");
    await act(async () => read.resolve(list())); await flush();
    expect(document.activeElement?.id).toBe("recommendation-refresh");
  });
  it("keeps focus on Copy link while the copy is pending and copies once", async () => {
    const copy = held();
    const writeText = vi.fn(() => copy.promise);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await render();
    const control = button("Copy link");
    control.focus();
    await act(async () => { control.click(); });
    expect(control.disabled).toBe(false);
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(button("Share").getAttribute("aria-disabled")).toBe("true");
    await act(async () => { control.click(); button("Share").click(); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(control);
    await act(async () => copy.resolve(undefined)); await flush();
    expect(control.getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(control);
    expect(host.querySelector('article [role="status"]')?.textContent).toBeTruthy();
  });
  it("ignores an old account response after a principal change", async () => {
    let finish!: (result: unknown) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(list([], false));
    await render(); session.token = "synthetic-member-two"; await render();
    expect(host.textContent).toContain("Referral access is not active");
    await act(async () => finish(list())); await flush();
    expect(host.textContent).not.toContain("Shareable link");
    expect(host.textContent).toContain("Referral access is not active");
  });
});
