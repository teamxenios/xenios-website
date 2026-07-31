// @vitest-environment jsdom

// App.tsx routes /care and /care/* to the Care section, so the section itself
// decides whether a request is for the public pending page or the admin
// console. This checks that split end to end, including that the public page
// is untouched by the addition.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { careApiFetch } from "../api";
import CareSection from "../section";

vi.mock("../api", () => ({ careApiFetch: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.mocked(careApiFetch);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: false, code: "care_disabled", message: "Care is being prepared." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }),
  );
  // The public Care page uses global fetch, not careApiFetch.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          capability: {
            rail: "care",
            state: "disabled",
            enabled: false,
            publicMessage: "Care is being prepared.",
            checkedAt: "2026-07-31T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderSection(path: string) {
  // Prime the code-split admin chunk so the Suspense boundary resolves inside
  // the act() flushes below rather than after the assertions.
  await import("./router");
  await act(async () => {
    root.render(
      <Router hook={() => [path, () => undefined]} ssrPath={path}>
        <CareSection />
      </Router>,
    );
  });
  // Two flushes: the lazy chunk, then the effects inside it.
  for (let index = 0; index < 3; index += 1) {
    await act(async () => {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
    });
  }
  return container;
}

describe("Care section routing", () => {
  it("keeps /care on the public pending page", async () => {
    const element = await renderSection("/care");
    expect(element.textContent).toContain(
      "Care is being prepared with the right boundaries in place.",
    );
    expect(element.textContent).not.toContain("CARE · ADMIN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["/care/admin", "/care/admin/patients", "/care/admin/flags"])(
    "routes %s to the admin console behind the guard",
    async (path) => {
      const element = await renderSection(path);
      expect(element.textContent).toContain("CARE · ADMIN");
      expect(element.textContent).not.toContain(
        "Care is being prepared with the right boundaries in place.",
      );
      // Care is off in this fixture, so the guard shows the closed state and
      // no admin content renders.
      expect(
        element.querySelector('[data-care-admin-authorization="care_disabled"]'),
      ).not.toBeNull();
      expect(element.querySelector("[data-care-admin-state]")).toBeNull();
    },
  );

  it("leaves the public Care shell's leased assertions intact", () => {
    const source = readFileSync(resolve(__dirname, "../section.tsx"), "utf8");
    expect(source.match(/<button\b/g)).toHaveLength(1);
    expect(source).not.toMatch(/<(form|input|textarea|select)\b/i);
    expect(source).toContain("Care is being prepared");
    expect(source).toContain("This site is not emergency care.");
  });
});
