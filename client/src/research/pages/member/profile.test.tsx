// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import Profile from "./Profile";

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

function context(): ResearchContextValue {
  return { gate: "open", member: { firstName: "Member", status: "active", applicationStatus: null }, memberToken: "raw-token", memberChecking: false, recovery: "none" } as ResearchContextValue;
}

async function renderWith(routes: Record<string, { status: number; body: unknown }>) {
  const calls: Array<{ url: string; auth?: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    const route = routes[url];
    if (!route) throw new Error(`unstubbed ${url}`);
    return new Response(JSON.stringify(route.body), { status: route.status, headers: { "Content-Type": "application/json" } });
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ResearchContext.Provider value={context()}><Profile /></ResearchContext.Provider>);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { view: host, calls };
}

describe("Profile", () => {
  it("loads ordinary and sensitive DTOs separately with exactly one bearer prefix", async () => {
    const { view, calls } = await renderWith({
      "/api/research/profile": { status: 200, body: { ok: true, profile: { memberId: "m1", sections: [{ key: "goals", schemaVersion: 1, data: { primary_goal: "Consistency" }, updatedAt: "2026-07-30T12:00:00.000Z" }], completeness: { completedSections: 2, totalSections: 17 } } } },
      "/api/research/profile/sensitive": { status: 200, body: { ok: true, sections: [{ key: "sleep", schemaVersion: 1, data: { quality: "Variable" }, updatedAt: "2026-07-30T12:00:00.000Z" }] } },
    });
    expect(view.textContent).toContain("Consistency");
    expect(view.textContent).toContain("Variable");
    expect(view.textContent).toContain("2 of 17 sections complete");
    expect(calls.map((call) => call.url)).toEqual(["/api/research/profile", "/api/research/profile/sensitive"]);
    expect(calls.every((call) => call.auth === "Bearer raw-token")).toBe(true);
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelectorAll("dl")).toHaveLength(2);
    expect(view.querySelectorAll("dt")).toHaveLength(2);
    expect(view.querySelectorAll("dd")).toHaveLength(2);
  });

  it("fails closed when sensitive content appears in the ordinary DTO", async () => {
    const { view } = await renderWith({
      "/api/research/profile": { status: 200, body: { ok: true, profile: { memberId: "m1", sections: [{ key: "sleep", schemaVersion: 1, data: { private_marker: "DO_NOT_RENDER" }, updatedAt: "2026-07-30T12:00:00.000Z" }], completeness: { completedSections: 1, totalSections: 17 } } } },
      "/api/research/profile/sensitive": { status: 200, body: { ok: true, sections: [] } },
    });
    expect(view.textContent).toContain("Something went wrong");
    expect(view.textContent).not.toContain("DO_NOT_RENDER");
  });

  it("rejects an unknown section key without rendering any hostile scalar value", async () => {
    const { view } = await renderWith({
      "/api/research/profile": { status: 200, body: { ok: true, profile: { memberId: "m1", sections: [{
        key: "unknown_hostile_section",
        schemaVersion: 1,
        data: {
          hostile_string: "HOSTILE_STRING",
          hostile_number: 987654,
          hostile_true: true,
          hostile_false: false,
        },
        updatedAt: "2026-07-30T12:00:00.000Z",
      }], completeness: { completedSections: 1, totalSections: 17 } } } },
      "/api/research/profile/sensitive": { status: 200, body: { ok: true, sections: [] } },
    });
    expect(view.textContent).toContain("Something went wrong");
    for (const marker of ["HOSTILE_STRING", "987654", "true", "false"]) {
      expect(view.textContent).not.toContain(marker);
    }
  });

  it("rejects arbitrary object data without rendering hostile nested values", async () => {
    const { view } = await renderWith({
      "/api/research/profile": { status: 200, body: { ok: true, profile: { memberId: "m1", sections: [{
        key: "goals",
        schemaVersion: 1,
        data: { hostile: { nested: "HOSTILE_NESTED_VALUE" } },
        updatedAt: "2026-07-30T12:00:00.000Z",
      }], completeness: { completedSections: 1, totalSections: 17 } } } },
      "/api/research/profile/sensitive": { status: 200, body: { ok: true, sections: [] } },
    });
    expect(view.textContent).toContain("Something went wrong");
    expect(view.textContent).not.toContain("HOSTILE_NESTED_VALUE");
  });

  it("clears previously rendered sensitive data as soon as retry begins", async () => {
    let round = 0;
    const never = new Promise<Response>(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (round > 0) return never;
      const body = url.endsWith("/sensitive")
        ? { ok: true, sections: [{ key: "sleep", schemaVersion: 1, data: { quality: "STALE_SENSITIVE_VALUE" }, updatedAt: "2026-07-30T12:00:00.000Z" }] }
        : { ok: true, profile: { memberId: "m1", sections: [], completeness: { completedSections: 1, totalSections: 17 } } };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<ResearchContext.Provider value={context()}><Profile /></ResearchContext.Provider>);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain("STALE_SENSITIVE_VALUE");

    round = 1;
    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Refresh profile",
    );
    expect(retry).toBeDefined();
    act(() => retry!.click());
    expect(host.textContent).not.toContain("STALE_SENSITIVE_VALUE");
  });
});
