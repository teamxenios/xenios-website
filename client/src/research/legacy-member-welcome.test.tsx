// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ResearchContext, type ResearchContextValue } from "./core";
import { LegacyMemberWelcome } from "./section";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;

afterEach(() => {
  host?.remove();
  host = null;
});

async function follow(status: "active" | "pending_activation") {
  window.history.replaceState({}, "", "/research/member/welcome");
  host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const value = {
    member: { firstName: "Member", status, applicationStatus: "approved" },
    memberChecking: false,
  } as ResearchContextValue;
  await act(async () => {
    root.render(
      <ResearchContext.Provider value={value}>
        <LegacyMemberWelcome />
      </ResearchContext.Provider>,
    );
    await Promise.resolve();
  });
  await act(async () => root.unmount());
}

describe("legacy member welcome routing", () => {
  it("sends active members to the member home", async () => {
    await follow("active");
    expect(window.location.pathname).toBe("/research/member");
  });

  it("sends pending members to activation", async () => {
    await follow("pending_activation");
    expect(window.location.pathname).toBe("/research/activate");
  });
});
