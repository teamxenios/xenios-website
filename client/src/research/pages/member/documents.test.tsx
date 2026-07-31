// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import Documents from "./Documents";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "raw-token";
const publishedAt = "2026-07-30T12:00:00.000Z";
const documentFixture = { documentId: ID, type: "blueprint_pdf", title: "My Blueprint", version: 2,
  templateVersion: "blueprint-v2", checksumSha256: "a".repeat(64), status: "current",
  supersedesDocumentId: null, reviewedBy: "Reviewer", publishedAt, acknowledgedAt: null };
let root: Root | null = null; let host: HTMLDivElement | null = null;

afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = null; host = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const context = (token: string | null = TOKEN) => ({ gate: "open", member: { firstName: "M", status: "active", applicationStatus: null }, memberToken: token, memberChecking: false, recovery: "none" }) as ResearchContextValue;

async function mount(fetcher: (...args: any[]) => Promise<any>, token: string | null = TOKEN) {
  vi.stubGlobal("fetch", vi.fn(fetcher));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<ResearchContext.Provider value={context(token)}><Documents /></ResearchContext.Provider>); await new Promise((resolve) => setTimeout(resolve, 0)); });
  return host;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("Documents", () => {
  it("renders ready, empty, unavailable, unauthorized, and malformed states truthfully", async () => {
    let view = await mount(async () => json({ ok: true, documents: [documentFixture] }));
    expect(view.textContent).toContain("My Blueprint"); expect(view.querySelectorAll("h1")).toHaveLength(1);
    act(() => root!.unmount()); root = null; view.remove(); host = null;
    view = await mount(async () => json({ ok: true, documents: [] })); expect(view.textContent).toContain("No documents yet.");
    act(() => root!.unmount()); root = null; view.remove(); host = null;
    view = await mount(async () => json({}, 503)); expect(view.textContent).toContain("Documents are unavailable.");
    act(() => root!.unmount()); root = null; view.remove(); host = null;
    view = await mount(async () => json({}, 401)); expect(view.textContent?.toLowerCase()).toContain("sign");
    act(() => root!.unmount()); root = null; view.remove(); host = null;
    view = await mount(async () => json({ ok: true, documents: [{ ...documentFixture, storagePath: "HOSTILE_PRIVATE_MARKER" }] }));
    expect(view.textContent).toContain("response was incomplete"); expect(view.textContent).not.toContain("HOSTILE_PRIVATE_MARKER");
  });

  it("uses a Blob URL anchor, removes/revokes it, retains focus, and never navigates or leaks the grant", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const signedUrl = `/api/research/documents/${ID}/download?exp=${Date.parse(expiresAt)}&sig=${"a".repeat(43)}`;
    const calls: Array<[unknown, RequestInit | undefined]> = [];
    const OriginalURL = URL;
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:private-document");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const blobSpy = vi.fn(async () => new Blob(["PRIVATE_BYTES"]));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const view = await mount(async (url, init) => {
      calls.push([url, init]);
      if (url === "/api/research/documents") return json({ ok: true, documents: [documentFixture] });
      if (String(url).endsWith("/access")) return json({ ok: true, grant: { documentId: ID, signedUrl, expiresAt } });
      return { ok: true, headers: new Headers({ "Cache-Control": "no-store" }), blob: blobSpy };
    });
    const button = Array.from(view.querySelectorAll("button")).find((item) => item.textContent === "Open securely")! as HTMLButtonElement;
    button.focus();
    await act(async () => {
      button.click();
      await vi.waitFor(() => expect(create).toHaveBeenCalledOnce(), { timeout: 5_000, interval: 10 });
    });
    expect(calls[1][0]).toBe(`/api/research/documents/${ID}/access`); expect(JSON.parse(calls[1][1]!.body as string)).toEqual({});
    expect(calls[2][0]).toBe(signedUrl); expect((calls[2][1]!.headers as any).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(blobSpy).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledOnce(); expect(click).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith("blob:private-document");
    expect(document.querySelector('a[href="blob:private-document"]')).toBeNull(); expect(document.activeElement).toBe(button);
    expect(open).not.toHaveBeenCalled(); expect(view.innerHTML).not.toContain(signedUrl); expect(view.textContent).not.toContain("PRIVATE_BYTES");
    expect(view.querySelector('[role="status"]')?.textContent).toContain("download has started");
    create.mockRestore(); revoke.mockRestore(); expect(URL).toBe(OriginalURL);
  });

  it("reports access failure as an alert without exposing hostile server text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined); const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined); const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = await mount(async (url) => url === "/api/research/documents" ? json({ ok: true, documents: [documentFixture] }) : json({ message: "HOSTILE_PRIVATE_MARKER" }, 500));
    const button = Array.from(view.querySelectorAll("button")).find((item) => item.textContent === "Open securely")! as HTMLButtonElement;
    await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("could not be opened"); expect(view.textContent).not.toContain("HOSTILE_PRIVATE_MARKER");
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls])).not.toContain("HOSTILE_PRIVATE_MARKER");
  });

  it("acknowledges with exact path/body, keeps pending action distinct, and confirms only after refresh", async () => {
    let resolveAck!: (value: Response) => void; let listCount = 0; const calls: any[] = [];
    const view = await mount(async (url, init) => {
      calls.push([url, init]);
      if (url === "/api/research/documents") { listCount++; return json({ ok: true, documents: [{ ...documentFixture, acknowledgedAt: listCount > 1 ? publishedAt : null }] }); }
      return new Promise<Response>((resolve) => { resolveAck = resolve; });
    });
    const ack = Array.from(view.querySelectorAll("button")).find((item) => item.textContent?.includes("Acknowledge"))! as HTMLButtonElement;
    await act(async () => { ack.click(); await Promise.resolve(); });
    expect(ack.disabled).toBe(true); expect(view.textContent).toContain("Acknowledging…");
    await act(async () => { resolveAck(json({ ok: true, acknowledgedAt: publishedAt })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(calls[1][0]).toBe(`/api/research/documents/${ID}/acknowledge`); expect(JSON.parse(calls[1][1].body)).toEqual({ documentId: ID, version: 2 });
    expect(view.querySelector('[role="status"]')?.textContent).toContain("Document acknowledged.");
    expect(document.activeElement?.id).toBe("documents-feedback");
  });

  it("invalidates old-token and overlapping work before download or stale UI update", async () => {
    let resolveAccess!: (value: Response) => void; let resolveAck!: (value: Response) => void; const calls: string[] = [];
    const view = await mount(async (url) => {
      calls.push(String(url));
      if (url === "/api/research/documents") return json({ ok: true, documents: [documentFixture] });
      if (String(url).endsWith("/access")) return new Promise<Response>((resolve) => { resolveAccess = resolve; });
      if (String(url).endsWith("/acknowledge")) return new Promise<Response>((resolve) => { resolveAck = resolve; });
      throw new Error("download must not run");
    });
    const open = Array.from(view.querySelectorAll("button")).find((item) => item.textContent === "Open securely")! as HTMLButtonElement;
    const ack = Array.from(view.querySelectorAll("button")).find((item) => item.textContent?.includes("Acknowledge"))! as HTMLButtonElement;
    await act(async () => { open.click(); await Promise.resolve(); ack.click(); await Promise.resolve(); });
    expect(open.disabled).toBe(false); expect(ack.disabled).toBe(true);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const signedUrl = `/api/research/documents/${ID}/download?exp=${Date.parse(expiresAt)}&sig=${"a".repeat(43)}`;
    await act(async () => { resolveAccess(json({ ok: true, grant: { documentId: ID, signedUrl, expiresAt } })); await Promise.resolve(); });
    expect(calls).not.toContain(signedUrl);
    await act(async () => { root!.render(<ResearchContext.Provider value={context(null)}><Documents /></ResearchContext.Provider>); resolveAck(json({ ok: true, acknowledgedAt: publishedAt })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(calls).not.toContain(signedUrl); expect(view.textContent).not.toContain("Document acknowledged.");
  });

  it("has labeled wrapping controls with no fixed viewport width at narrow/zoom-equivalent layouts", async () => {
    const view = await mount(async () => json({ ok: true, documents: [documentFixture] }));
    for (const width of [1440, 720, 375, 320, 160]) { Object.defineProperty(window, "innerWidth", { configurable: true, value: width }); window.dispatchEvent(new Event("resize")); expect(view.querySelector(".flex-wrap")).not.toBeNull(); }
    Array.from(view.querySelectorAll("button")).forEach((button) => expect(button.getAttribute("aria-describedby")).toBe("documents-feedback"));
    expect(view.querySelector("article")?.getAttribute("style")).toBeNull();
  });
});
