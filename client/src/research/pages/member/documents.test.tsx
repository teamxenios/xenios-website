// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import Documents from "./Documents";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = null; host = null; vi.unstubAllGlobals(); });
const context = () => ({ gate: "open", member: { firstName: "M", status: "active", applicationStatus: null }, memberToken: "raw-token", memberChecking: false, recovery: "none" }) as ResearchContextValue;

async function render(routes: Record<string, { status: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const route = routes[`${init?.method ?? "GET"} ${url}`];
    if (!route) throw new Error(`unstubbed ${init?.method ?? "GET"} ${url}`);
    return new Response(JSON.stringify(route.body), { status: route.status, headers: { "Content-Type": "application/json" } });
  }));
  host = globalThis.document.createElement("div"); globalThis.document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<ResearchContext.Provider value={context()}><Documents /></ResearchContext.Provider>); await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { view: host!, calls };
}

const documentFixture = {
  documentId: "doc-1", type: "blueprint_pdf", title: "My Blueprint", version: 2, templateVersion: "1",
  checksumSha256: "a".repeat(64), status: "current", supersedesDocumentId: null, reviewedBy: "Reviewer",
  publishedAt: "2026-07-30T12:00:00.000Z", acknowledgedAt: null,
};

describe("Documents", () => {
  it("renders exact list fields without treating the list as a download grant", async () => {
    const { view, calls } = await render({ "GET /api/research/documents": { status: 200, body: { ok: true, documents: [documentFixture] } } });
    expect(view.textContent).toContain("My Blueprint");
    expect(view.textContent).toContain("Version 2");
    expect(calls).toHaveLength(1);
  });

  it("acknowledges the exact current document and version", async () => {
    const routes = {
      "GET /api/research/documents": { status: 200, body: { ok: true, documents: [documentFixture] } },
      "POST /api/research/documents/doc-1/acknowledge": { status: 200, body: { ok: true, acknowledgedAt: "2026-07-30T13:00:00.000Z" } },
    };
    const { view, calls } = await render(routes);
    const button = Array.from(view.querySelectorAll("button")).find((item) => item.textContent?.includes("Acknowledge"));
    await act(async () => { button!.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(calls.some((call) => call.method === "POST"
      && call.url === "/api/research/documents/doc-1/acknowledge"
      && JSON.stringify(call.body) === JSON.stringify({ documentId: "doc-1", version: 2 }))).toBe(true);
  });

  it("fails closed for legacy list DTOs carrying a signed URL", async () => {
    const { view } = await render({ "GET /api/research/documents": { status: 200, body: { ok: true, documents: [{ id: "legacy", title: "LEAK", signedUrl: "/public/file" }] } } });
    expect(view.textContent).toContain("Something went wrong");
    expect(view.textContent).not.toContain("LEAK");
  });
});
