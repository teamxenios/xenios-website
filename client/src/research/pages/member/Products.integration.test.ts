// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import Products from "./Products";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function context(memberToken: string | null): ResearchContextValue {
  return {
    gate: "open",
    member: memberToken
      ? { firstName: "Sam", status: "active", applicationStatus: null }
      : null,
    memberToken,
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  } as Response;
}

describe("Website 3 member catalog integration", () => {
  it("uses the accepted Product Control projection instead of combining legacy catalog authorities", () => {
    const source = readFileSync(
      resolve("client/src/research/pages/member/Products.tsx"),
      "utf8",
    );
    expect(source).toContain("getMemberCatalog");
    expect(source).toContain("adaptMemberCatalog");
    expect(source).toContain("MemberCatalogExperience");
    expect(source).not.toContain("listProducts");
    expect(source).not.toContain("getProductPlatform");
    expect(source).not.toContain("toProductCards");
  });

  it("ignores a stale signed-out response after the member token changes", async () => {
    let finishSignedOut!: (value: Response) => void;
    const signedOut = new Promise<Response>((resolve) => {
      finishSignedOut = resolve;
    });
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => signedOut)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          catalog: {
            audience: "member",
            currency: "USD",
            evaluatedAt: "2026-07-27T12:00:00.000Z",
            items: [],
            categories: [],
            lanes: [],
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        React.createElement(
          ResearchContext.Provider,
          { value: context(null) },
          React.createElement(Products),
        ),
      );
    });
    await act(async () => {
      root!.render(
        React.createElement(
          ResearchContext.Provider,
          { value: context("member-jwt") },
          React.createElement(Products),
        ),
      );
    });
    await act(async () => {});
    expect(container.textContent).toContain("No products are published yet.");

    await act(async () => {
      finishSignedOut(
        jsonResponse(401, { ok: false, code: "sign_in_required" }),
      );
    });
    expect(container.textContent).toContain("No products are published yet.");
    expect(container.textContent).not.toContain("Your session has ended.");
  });
});
