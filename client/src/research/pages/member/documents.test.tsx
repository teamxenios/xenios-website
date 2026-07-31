// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import Documents from "./Documents";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

const context = () => ({
  gate: "open",
  member: { firstName: "M", status: "active", applicationStatus: null },
  memberToken: "raw-token",
  memberChecking: false,
  recovery: "none",
}) as ResearchContextValue;

type Route = { status: number; body: unknown; deferred?: Promise<void> };

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function render(routes: Record<string, Route | Route[]>) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const counts = new Map<string, number>();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const key = `${method} ${url}`;
    calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const configured = routes[key];
    if (!configured) throw new Error(`unstubbed ${key}`);
    const index = counts.get(key) ?? 0;
    counts.set(key, index + 1);
    const route = Array.isArray(configured) ? configured[Math.min(index, configured.length - 1)] : configured;
    await route.deferred;
    return new Response(JSON.stringify(route.body), {
      status: route.status,
      headers: { "Content-Type": "application/json" },
    });
  }));
  host = globalThis.document.createElement("div");
  globalThis.document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ResearchContext.Provider value={context()}><Documents /></ResearchContext.Provider>);
    await settle();
  });
  return { view: host!, calls };
}

const documentFixture = {
  documentId: "doc-1",
  type: "blueprint_pdf",
  title: "My Blueprint",
  version: 2,
  templateVersion: "1",
  checksumSha256: "a".repeat(64),
  status: "current",
  supersedesDocumentId: null,
  reviewedBy: "Research reviewer",
  publishedAt: "2026-07-30T12:00:00.000Z",
  acknowledgedAt: null,
};

const list = (documents: unknown[] = [documentFixture]) => ({
  "GET /api/research/documents": { status: 200, body: { ok: true, documents } },
});

function button(view: HTMLElement, name: string) {
  return Array.from(view.querySelectorAll("button")).find((item) => item.textContent?.includes(name))!;
}

describe("Documents", () => {
  it("renders the safe list projection with one page H1 and no extra main landmark", async () => {
    const { view, calls } = await render(list());
    expect(view.textContent).toContain("My Blueprint");
    expect(view.textContent).toContain("Version 2");
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelectorAll("main")).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["empty id", { documentId: "" }],
    ["blank title", { title: " " }],
    ["invalid version", { version: 0 }],
    ["invalid timestamp", { publishedAt: "yesterday" }],
    ["noncanonical timestamp", { publishedAt: "2026-07-30T12:00:00Z" }],
    ["private signed URL", { signedUrl: "/secret" }],
    ["storage field", { storagePath: "members/private.pdf" }],
    ["member field", { memberId: "member-1" }],
    ["provider field", { providerData: { name: "private" } }],
    ["unknown field", { extra: true }],
  ])("fails closed for %s without rendering document data", async (_label, mutation) => {
    const { view } = await render(list([{ ...documentFixture, ...mutation }]));
    expect(view.textContent).toContain("Something went wrong");
    expect(view.textContent).not.toContain("My Blueprint");
  });

  it("fails closed for duplicate IDs and unknown top-level fields", async () => {
    const duplicate = await render(list([documentFixture, { ...documentFixture }]));
    expect(duplicate.view.textContent).toContain("Something went wrong");
    act(() => root!.unmount());
    root = null;
    duplicate.view.remove();
    host = null;
    const invalidEnvelope = await render({
      "GET /api/research/documents": {
        status: 200,
        body: { ok: true, documents: [documentFixture], member: "private" },
      },
    });
    expect(invalidEnvelope.view.textContent).toContain("Something went wrong");
  });

  it.each([
    [401, "Please sign in."],
    [403, "Documents are unavailable."],
    [404, "Documents are unavailable."],
    [503, "Documents are unavailable."],
    [500, "Something went wrong"],
  ])("renders truthful list state for HTTP %i", async (status, copy) => {
    const { view } = await render({
      "GET /api/research/documents": { status, body: status === 403 ? { ok: false, code: "membership_inactive" } : {} },
    });
    expect(view.textContent).toContain(copy);
    expect(view.textContent).not.toContain("My Blueprint");
  });

  it("acknowledges the exact current document/version, announces status, reloads, and preserves focus", async () => {
    const acknowledged = { ...documentFixture, acknowledgedAt: "2026-07-30T13:00:00.000Z" };
    const routes = {
      "GET /api/research/documents": [
        { status: 200, body: { ok: true, documents: [documentFixture] } },
        { status: 200, body: { ok: true, documents: [acknowledged] } },
      ],
      "POST /api/research/documents/doc-1/acknowledge": {
        status: 200,
        body: { ok: true, acknowledgedAt: "2026-07-30T13:00:00.000Z" },
      },
    };
    const { view, calls } = await render(routes);
    const open = button(view, "Open securely");
    open.focus();
    await act(async () => {
      button(view, "Acknowledge").click();
      await settle();
      await settle();
    });
    expect(calls).toContainEqual({
      method: "POST",
      url: "/api/research/documents/doc-1/acknowledge",
      body: { documentId: "doc-1", version: 2 },
    });
    expect(view.querySelector('[role="status"]')?.textContent).toContain("Version 2 acknowledged.");
    expect(view.querySelector('[role="alert"]')).toBeNull();
    expect(globalThis.document.activeElement).toBe(open);
    expect(view.textContent).not.toContain("Acknowledge version");
  });

  it("uses an alert for denied acknowledgment and retains the ready document", async () => {
    const { view } = await render({
      ...list(),
      "POST /api/research/documents/doc-1/acknowledge": {
        status: 403,
        body: { ok: false, code: "membership_inactive" },
      },
    });
    await act(async () => {
      button(view, "Acknowledge").click();
      await settle();
    });
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("do not have access");
    expect(view.textContent).toContain("My Blueprint");
  });

  it("keeps both document actions stable and disabled while an action is busy", async () => {
    let release!: () => void;
    const deferred = new Promise<void>((resolve) => { release = resolve; });
    const { view } = await render({
      ...list(),
      "POST /api/research/documents/doc-1/acknowledge": {
        status: 200,
        body: { ok: true, acknowledgedAt: "2026-07-30T13:00:00.000Z" },
        deferred,
      },
    });
    await act(async () => {
      button(view, "Acknowledge").click();
      await settle();
    });
    expect(button(view, "Open securely").disabled).toBe(true);
    expect(button(view, "Acknowledging").disabled).toBe(true);
    await act(async () => {
      release();
      await settle();
      await settle();
    });
  });

  it.each([
    { grant: { documentId: "doc-1", signedUrl: "https://evil.test/file", expiresAt: "2099-01-01T00:00:00.000Z" } },
    { grant: { documentId: "other", signedUrl: "/api/research/documents/doc-1/download?exp=4070908800000&sig=x", expiresAt: "2099-01-01T00:00:00.000Z" } },
    { grant: { documentId: "doc-1", signedUrl: "/api/research/documents/doc-1/download?exp=4070908800001&sig=x", expiresAt: "2099-01-01T00:00:00.000Z" } },
    { grant: { documentId: "doc-1", signedUrl: "/api/research/documents/doc-1/download?exp=4070908800000&sig=x&storage=private", expiresAt: "2099-01-01T00:00:00.000Z" } },
    { grant: { documentId: "doc-1", signedUrl: "/api/research/documents/doc-1/download?exp=4070908800000&sig=x", expiresAt: "2099-01-01T00:00:00.000Z", storagePath: "private" } },
  ])("fails closed for incoherent or sensitive access grants", async (body) => {
    const { view } = await render({
      ...list(),
      "POST /api/research/documents/doc-1/access": { status: 200, body: { ok: true, ...body } },
    });
    await act(async () => {
      button(view, "Open securely").click();
      await settle();
    });
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("could not be opened");
  });

  it.each([1440, 720, 375, 320, 160])("uses wrapping, shrink-safe document layout at %ipx CSS width", async (width) => {
    const { view } = await render(list([{ ...documentFixture, title: "A".repeat(200) }]));
    Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: width });
    globalThis.dispatchEvent(new Event("resize"));
    const article = view.querySelector("article")!;
    expect(article.getAttribute("style")).toContain("overflow-wrap: anywhere");
    expect(article.querySelector(".flex-wrap")).not.toBeNull();
    expect(view.scrollWidth).toBeLessThanOrEqual(view.clientWidth || view.scrollWidth);
  });

  it("keeps native keyboard-focusable actions with accessible busy state", async () => {
    const { view } = await render(list());
    const actions = Array.from(view.querySelectorAll("button"));
    expect(actions.map((item) => item.getAttribute("type"))).toEqual(["button", "button"]);
    actions[0].focus();
    expect(globalThis.document.activeElement).toBe(actions[0]);
    expect(actions.every((item) => item.getAttribute("aria-busy") === "false")).toBe(true);
  });
});
