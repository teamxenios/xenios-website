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

async function follow(status: "active" | "pending_activation" | "past_due" | "paused" | "closed") {
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
  it("sends active accounts to the canonical account home", async () => {
    await follow("active");
    expect(window.location.pathname).toBe("/research/account");
  });

  it("sends pending members to activation", async () => {
    await follow("pending_activation");
    expect(window.location.pathname).toBe("/research/activate");
  });

  // The legacy emailed link uses the SAME status classification as sign-in
  // and the member-area gate: past_due goes to the billing screen and
  // paused/closed to the inactive-membership screen, never to activation.
  it("sends past_due members to the billing screen", async () => {
    await follow("past_due");
    expect(window.location.pathname).toBe("/research/access-state");
    expect(new URLSearchParams(window.location.search).get("code")).toBe("billing_past_due");
  });

  it.each(["paused", "closed"] as const)("sends %s members to the inactive-membership screen", async (status) => {
    await follow(status);
    expect(window.location.pathname).toBe("/research/access-state");
    expect(new URLSearchParams(window.location.search).get("code")).toBe("membership_inactive");
  });
});
