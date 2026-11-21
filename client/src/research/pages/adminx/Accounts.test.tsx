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
    await click("View account " + id(21));
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
