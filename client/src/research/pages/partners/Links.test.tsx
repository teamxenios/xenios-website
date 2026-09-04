// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_API, type RecommendationLink } from "@shared/research/referral-v1";
import Links from "./Links";

const session = vi.hoisted(() => ({ token: "synthetic-member-one" as string | null }));
vi.mock("../../core", () => ({ useResearch: () => ({ memberToken: session.token }) }));
vi.mock("../../ui/shells", () => ({ ResearchPartnerShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
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
  fetcher = vi.fn().mockResolvedValue(list()); vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("00000000-0000-4000-8000-000000000001") });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
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
