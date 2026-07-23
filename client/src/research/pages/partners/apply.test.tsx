// @vitest-environment jsdom
// The partner application form against the LIVE endpoint
// (POST /api/research/partner/apply). Pins the wire shape: role, legalName,
// contactEmail (the server's PartnerApplyWireInput; this page applies as a
// Research Rep), with the audience/channel answers riding along for review
// context. Also pins the truthful unauthenticated state: the endpoint is
// member-scoped, so a signed-out submit says so and sends nothing.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import Apply from "./Apply";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function fixtureContext(memberToken: string | null): ResearchContextValue {
  return {
    gate: "open",
    member: memberToken ? { firstName: "Sam", status: "active", applicationStatus: null } : null,
    memberToken,
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

type RecordedCall = { url: string; method: string; body: string | undefined };

function stubFetch(status: number, body: unknown): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: String(url), method, body: typeof init?.body === "string" ? init.body : undefined });
      return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
      };
    }),
  );
  return calls;
}

async function renderApply(memberToken: string | null): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={fixtureContext(memberToken)}>
        <Apply />
      </ResearchContext.Provider>,
    );
  });
  await act(async () => {});
  return container!;
}

function setById(view: HTMLElement, id: string, value: string) {
  const el = view.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) throw new Error(`missing #${id}`);
  const proto =
    el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function fillAndSubmit(view: HTMLElement) {
  await act(async () => {
    setById(view, "pa-name", "Avery Quinn");
    setById(view, "pa-email", "avery@example.com");
    setById(view, "pa-audience", "Strength coaches, about 20k across platforms.");
  });
  // Select the first channel card (Instagram).
  await act(async () => {
    (view.querySelector('[data-testid="ra-select-card"]') as HTMLButtonElement).click();
  });
  await act(async () => {
    (Array.from(view.querySelectorAll("button")).find((b) => b.textContent?.includes("Submit application")) as HTMLButtonElement).click();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("partner Apply form", () => {
  it("posts the server's wire shape (role, legalName, contactEmail) to the live apply endpoint", async () => {
    const calls = stubFetch(200, { ok: true, partner: { partnerId: "prt_1" } });
    const view = await renderApply("member-jwt");

    await fillAndSubmit(view);

    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/research/partner/apply");
    expect(JSON.parse(post?.body ?? "{}")).toEqual({
      role: "research_rep",
      legalName: "Avery Quinn",
      contactEmail: "avery@example.com",
      audience: "Strength coaches, about 20k across platforms.",
      channels: ["instagram"],
    });
    expect(view.textContent).toContain("Application received.");
  });

  it("says a signed-in member account is required and sends nothing when signed out", async () => {
    const calls = stubFetch(200, { ok: true });
    const view = await renderApply(null);

    await fillAndSubmit(view);

    expect(calls).toHaveLength(0);
    expect(view.textContent).toContain("Applying requires a signed-in member account.");
  });

  it("renders the honest unavailable panel when the endpoint is not published (nothing was submitted)", async () => {
    stubFetch(404, {});
    const view = await renderApply("member-jwt");

    await fillAndSubmit(view);

    expect(view.textContent).toContain("This form is not live yet.");
    expect(view.textContent).toContain("nothing was submitted");
    expect(view.textContent).not.toContain("Application received.");
  });
});
