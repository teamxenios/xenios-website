// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import TopRibbon from "./TopRibbon";

vi.mock("@/hooks/use-waitlist-count", () => ({
  useWaitlistCount: () => 556,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;

afterEach(() => {
  host?.remove();
  host = null;
});

async function renderAt(path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const location = memoryLocation({ path, static: true });
  await act(async () => {
    root.render(
      <Router hook={location.hook}>
        <TopRibbon />
      </Router>,
    );
  });
  return { host, unmount: () => act(() => root.unmount()) };
}

describe("TopRibbon route boundary", () => {
  it.each(["/care", "/care/schedule", "/care/eligibility"])(
    "does not imply professional-cohort availability on %s",
    async (path) => {
      const view = await renderAt(path);
      expect(view.host.querySelector('[data-testid="ribbon-top"]')).toBeNull();
      view.unmount();
    },
  );

  it.each(["/", "/careers"])("keeps the professional-workspace ribbon on %s", async (path) => {
    const view = await renderAt(path);
    expect(view.host.querySelector('[data-testid="ribbon-top"]')).not.toBeNull();
    view.unmount();
  });
});
