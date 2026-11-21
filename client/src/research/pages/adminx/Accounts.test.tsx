// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAccount, AdminAccountPage } from "@shared/research/admin-accounts";
import type { AdminSessionBinding } from "./auth";
import Accounts, { AccountsBody, loadAccountDetail, loadAccountPage } from "./Accounts";
const read = vi.hoisted(() => ({ get: vi.fn(), current: true }));
vi.mock("../../lib/api", () => ({ apiGet: read.get }));
vi.mock("./AdminResearchHome", () => ({ AdminScreen: ({ children }: { children: (token: string, binding: AdminSessionBinding) => ReactNode }) =>
  children("ordinary", { generation: "test-session", isCurrent: () => read.current, sessionFence: () => read.current }) }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = (n = 1): AdminAccount => ({ userId: id(n), emailHint: "withheld", displayLabel: "User label", displayLabelSource: "user_supplied_not_authority",
  emailConfirmation: "pending", pendingEmailChange: false, lastSignInAt: null, providerBan: "not_reported" });
const page = (ordinal = 1): AdminAccountPage => ({ ok: true, kind: "CANONICAL_AUTH_ACCOUNT_PAGE_V1",
  accounts: Array.from({ length: ordinal === 1 ? 20 : 1 }, (_, n) => account((ordinal - 1) * 20 + n + 1)),
  page: ordinal, perPage: 20, nextPage: ordinal === 1 ? 2 : null, total: 21 });
let host: HTMLDivElement, root: Root, originalHead: string, originalTitle: string;
const binding: AdminSessionBinding = { generation: "fixture", isCurrent: () => read.current, sessionFence: () => read.current };
const render = () => act(async () => { root.render(<AccountsBody token="ordinary" binding={binding} />); });
async function click(label: string) {
  await act(async () => {
    const button = Array.from(host.querySelectorAll("button")).find(node => node.textContent === label || node.getAttribute("aria-label") === label);
    expect(button).toBeTruthy(); expect(button!.disabled).toBe(false); button!.click();
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); read.current = true;
  originalHead = document.head.innerHTML; originalTitle = document.title;
  read.get.mockReset().mockResolvedValue({ kind: "ok", data: page() });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.head.innerHTML = originalHead; document.title = originalTitle; vi.restoreAllMocks(); });
describe("actual read-only Accounts component and API validation", () => {
  it("uses AdminScreen's current binding and renders real server paging/detail without write controls", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const inherited = document.createElement("meta"); inherited.setAttribute("property", "og:title"); inherited.content = "Public page"; document.head.append(inherited);
    await act(async () => { root.render(<Accounts />); });
    expect(read.get).toHaveBeenCalledExactlyOnceWith("/api/admin/research/accounts?page=1&perPage=20", "ordinary");
    expect(host.querySelectorAll('ul[aria-label="Account page"] li')).toHaveLength(20);
    expect(host.textContent).toContain("do not grant authority");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,nofollow,noarchive");
    expect(document.head.querySelector('meta[property="og:title"]')).toBeNull(); expect(document.title).not.toContain(id(1));
    read.get.mockResolvedValueOnce({ kind: "ok", data: page(2) }); await click("Next page");
    expect(read.get).toHaveBeenLastCalledWith("/api/admin/research/accounts?page=2&perPage=20", "ordinary");
    read.get.mockResolvedValueOnce({ kind: "ok", data: { ok: true, kind: "CANONICAL_AUTH_ACCOUNT_DETAIL_V1", account: account(21) } });
    await click("View read-only detail for User label " + id(21));
    expect(read.get).toHaveBeenLastCalledWith("/api/admin/research/accounts/" + id(21), "ordinary", ["account_not_found"]);
    expect(host.textContent).toContain("Canonical account UUID"); expect(host.textContent).toContain("Withheld in this directory");
    expect(host.querySelectorAll("form,input,select")).toHaveLength(0); expect(host.textContent).not.toMatch(/create account|delete account|grant role/iu);
    expect(storage).not.toHaveBeenCalled();
  });
  it("shows honest loading then unavailable, denied and error states without invented empty results", async () => {
    let release!: (result: unknown) => void;
    read.get.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    await render(); expect(host.querySelector('[role="status"]')?.textContent).toContain("Loading");
    await act(async () => release({ kind: "unavailable" }));
    expect(host.textContent).toContain("does not mean that no accounts exist"); expect(host.textContent).not.toContain("No accounts were returned");
    read.get.mockResolvedValueOnce({ kind: "denied", code: "account_read_denied", message: "private@example.invalid secret" }); await click("Retry read");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Account-read permission is required."); expect(host.textContent).not.toContain("private@example");
    read.get.mockResolvedValueOnce({ kind: "error", message: "private provider token" }); await click("Retry read");
    expect(host.textContent).toContain("could not be verified"); expect(host.textContent).not.toContain("provider token");
  });
  it("does not read or expose old account data without a current admin-session binding", async () => {
    read.current = false; await render(); expect(read.get).not.toHaveBeenCalled(); expect(host.textContent).toContain("session has ended");
  });
  it("discards a late authorized response after revocation or component replacement", async () => {
    let release!: (result: unknown) => void;
    read.get.mockReturnValueOnce(new Promise(resolve => { release = resolve; })); await render();
    read.current = false; await act(async () => { root.render(<AccountsBody token="ordinary" binding={null} />); });
    await act(async () => release({ kind: "ok", data: page() }));
    expect(host.textContent).not.toContain(id(1)); expect(host.querySelectorAll("li")).toHaveLength(0); expect(host.textContent).toContain("session has ended");
  });
  it("never paints a previous binding's successful page on the new binding's first commit", async () => {
    const snapshots: string[] = [];
    function CommitObservation() { useLayoutEffect(() => { snapshots.push(host.textContent ?? ""); }); return null; }
    await act(async () => { root.render(<><AccountsBody token="ordinary" binding={binding} /><CommitObservation /></>); });
    expect(host.textContent).toContain(id(1)); snapshots.length = 0;
    read.get.mockReturnValue(new Promise(() => {}));
    const nextBinding = { ...binding, generation: "different-verified-session" };
    await act(async () => { root.render(<><AccountsBody token="different-bearer" binding={nextBinding} /><CommitObservation /></>); });
    expect(snapshots.length).toBeGreaterThan(0); expect(snapshots.every(text => !text.includes(id(1)))).toBe(true);
    expect(host.textContent).toContain("Loading canonical account information");
  });
  it("validates exact returned UUID/page and refuses unexpected metadata before display", async () => {
    read.get.mockResolvedValue({ kind: "ok", data: { ...page(), page: 2 } });
    expect((await loadAccountPage("ordinary", 1)).kind).toBe("error");
    read.get.mockResolvedValue({ kind: "ok", data: { ok: true, kind: "CANONICAL_AUTH_ACCOUNT_DETAIL_V1", account: account(2) } });
    expect((await loadAccountDetail("ordinary", id(1))).kind).toBe("error");
    read.get.mockResolvedValue({ kind: "ok", data: { ...page(), accounts: [{ ...account(), access_token: "private" }], total: 1, nextPage: null } });
    expect((await loadAccountPage("ordinary", 1)).kind).toBe("error");
    read.get.mockClear(); expect((await loadAccountDetail("ordinary", "bad-id")).kind).toBe("error");
    expect((await loadAccountPage("ordinary", 0)).kind).toBe("error"); expect((await loadAccountPage("", 1)).kind).toBe("unauthorized");
    expect(read.get).not.toHaveBeenCalled();
  });
  it("preserves only exact not-found codes and escapes untrusted display labels as text", async () => {
    read.get.mockResolvedValue({ kind: "denied", code: "account_not_found", message: "private error" });
    expect(await loadAccountDetail("ordinary", id(1))).toEqual({ kind: "denied", code: "account_not_found" });
    const data = page(); data.accounts[0] = { ...account(), displayLabel: '<img src=x onerror="bad()">' };
    read.get.mockResolvedValue({ kind: "ok", data }); await render();
    expect(host.textContent).toContain('<img src=x onerror="bad()">'); expect(host.querySelector("img")).toBeNull();
  });
});

// Keyboard focus, accessible names and plain-language values. Each control is
// replaced or disabled while its read runs; focus must come back only after the
// read finishes, and only for the binding that started it.
const pageOf = (ordinal: number, total: number): AdminAccountPage => {
  const count = Math.max(0, Math.min(20, total - (ordinal - 1) * 20));
  return { ok: true, kind: "CANONICAL_AUTH_ACCOUNT_PAGE_V1", accounts: Array.from({ length: count }, (_, n) => account((ordinal - 1) * 20 + n + 1)),
    page: ordinal, perPage: 20, nextPage: ordinal * 20 < total ? ordinal + 1 : null, total };
};
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
const findControl = (name: string) => {
  const found = Array.from(host.querySelectorAll("button")).find(node => node.textContent === name || node.getAttribute("aria-label") === name);
  expect(found, "Missing control: " + name).toBeTruthy(); return found!;
};
const heading = () => host.querySelector("h2")!;
/** The operator presses a focused control; the read it starts stays open. */
async function press(name: string) {
  const open = deferred(); read.get.mockReturnValueOnce(open.promise);
  const control = findControl(name); control.focus(); expect(document.activeElement).toBe(control);
  await act(async () => control.click());
  return { control, open };
}
/** jsdom ignores blur() on a disabled button; removing a focused stand-in is its real fixup to the document. */
function dropFocusToDocument() {
  const standIn = document.createElement("button"); standIn.type = "button"; document.body.append(standIn);
  standIn.focus(); expect(document.activeElement).toBe(standIn);
  standIn.remove(); expect(document.activeElement).toBe(document.body);
}
describe("keyboard focus and accessible names", () => {
  it("keeps the page controls mounted and disabled while a page loads, then returns focus to Next", async () => {
    read.get.mockResolvedValueOnce({ kind: "ok", data: pageOf(1, 41) }); await render();
    const { open } = await press("Next page");
    const nav = host.querySelector('nav[aria-label="Account pages"]');
    expect(nav).not.toBeNull(); expect(findControl("Previous page").disabled).toBe(true); expect(findControl("Next page").disabled).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Loading");
    dropFocusToDocument();
    await act(async () => { await Promise.resolve(); }); expect(document.activeElement).toBe(document.body);
    await act(async () => open.resolve({ kind: "ok", data: pageOf(2, 41) }));
    expect(host.querySelector('nav[aria-label="Account pages"]')).toBe(nav);
    expect(heading().textContent).toBe("Accounts, page 2"); expect(document.activeElement).toBe(findControl("Next page"));
  });
  it("moves focus to the other page control when the pressed one is disabled on the new page", async () => {
    await render();
    const forward = await press("Next page");
    expect(document.activeElement).toBe(forward.control); // jsdom leaves focus on the disabled control
    await act(async () => forward.open.resolve({ kind: "ok", data: page(2) }));
    expect(findControl("Next page").disabled).toBe(true); expect(document.activeElement).toBe(findControl("Previous page"));
    const back = await press("Previous page"); dropFocusToDocument();
    await act(async () => back.open.resolve({ kind: "ok", data: page() }));
    expect(findControl("Previous page").disabled).toBe(true); expect(document.activeElement).toBe(findControl("Next page"));
  });
  it("moves focus to the detail heading that names the account, and Back returns it to that row's control", async () => {
    await render();
    const name = "View read-only detail for User label " + id(3);
    const { open } = await press(name);
    expect(host.querySelector("ul")).toBeNull(); expect(document.activeElement).toBe(document.body);
    await act(async () => open.resolve({ kind: "ok", data: { ok: true, kind: "CANONICAL_AUTH_ACCOUNT_DETAIL_V1", account: account(3) } }));
    expect(heading().textContent).toBe("Account detail: User label"); expect(heading().tabIndex).toBe(-1);
    expect(document.activeElement).toBe(heading()); expect(host.textContent).toContain(id(3));
    const back = await press("Back to account page");
    expect(back.control.isConnected).toBe(false); expect(document.activeElement).toBe(document.body);
    await act(async () => back.open.resolve({ kind: "ok", data: page() }));
    expect(document.activeElement).toBe(findControl(name));
  });
  it("returns focus to Retry while the read still fails, and to the heading once it succeeds", async () => {
    read.get.mockResolvedValueOnce({ kind: "unavailable" }); await render();
    const first = await press("Retry read");
    await act(async () => first.open.resolve({ kind: "unavailable" }));
    expect(document.activeElement).toBe(findControl("Retry read"));
    const second = await press("Retry read");
    await act(async () => second.open.resolve({ kind: "ok", data: page() }));
    expect(host.textContent).not.toContain("Retry read"); expect(document.activeElement).toBe(heading());
    expect(heading().textContent).toBe("Accounts, page 1");
  });
  it("does not move focus on first load or away from where the operator moved it during a read", async () => {
    await render(); expect(document.activeElement).toBe(document.body);
    const elsewhere = document.createElement("button"); elsewhere.type = "button"; document.body.append(elsewhere);
    try {
      const { open } = await press("Next page"); elsewhere.focus();
      await act(async () => open.resolve({ kind: "ok", data: page(2) }));
      expect(heading().textContent).toBe("Accounts, page 2"); expect(document.activeElement).toBe(elsewhere);
    } finally { elsewhere.remove(); }
  });
  it("does not restore focus for a binding that ended while the read ran", async () => {
    await render();
    const { open } = await press("Next page"); dropFocusToDocument();
    read.current = false;
    await act(async () => open.resolve({ kind: "ok", data: page(2) }));
    await act(async () => { root.render(<AccountsBody token="ordinary" binding={binding} />); });
    expect(host.textContent).toContain("session has ended"); expect(host.querySelector("h2,nav,ul")).toBeNull();
    expect(document.activeElement).toBe(document.body); expect(host.textContent).not.toContain(id(21));
  });
  it("starts every row control's accessible name with its visible text and names the exact account", async () => {
    const data = page(); data.accounts[1] = { ...account(2), displayLabel: null };
    read.get.mockResolvedValueOnce({ kind: "ok", data }); await render();
    const controls = Array.from(host.querySelectorAll<HTMLButtonElement>('ul[aria-label="Account page"] button'));
    expect(controls).toHaveLength(20);
    controls.forEach((control, n) => {
      expect(control.textContent).toBe("View read-only detail");
      expect(control.getAttribute("aria-label")!.startsWith("View read-only detail")).toBe(true);
      expect(control.getAttribute("aria-label")!.endsWith(id(n + 1))).toBe(true);
    });
    expect(controls[1].getAttribute("aria-label")).toBe("View read-only detail for account " + id(2));
  });
  it("names the page one way and shows provider values and the sign-in time as plain text", async () => {
    await act(async () => { root.render(<Accounts />); });
    expect(document.title).toBe("All sign-in accounts | Xenios operations");
    expect(host.querySelector("section")?.getAttribute("aria-label")).toBe("All sign-in accounts");
    read.get.mockResolvedValueOnce({ kind: "ok", data: { ok: true, kind: "CANONICAL_AUTH_ACCOUNT_DETAIL_V1",
      account: { ...account(1), emailConfirmation: "no_email", providerBan: "active", lastSignInAt: "2026-11-21T10:05:00Z" } } });
    await click("View read-only detail for User label " + id(1));
    expect(host.textContent).toContain("No email address on this account"); expect(host.textContent).toContain("Ban in effect");
    expect(host.textContent).not.toMatch(/no_email|not_reported/u);
    const time = host.querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe("2026-11-21T10:05:00Z");
    expect(time?.textContent).toContain("2026"); expect(time?.textContent).toContain("UTC");
  });
});
