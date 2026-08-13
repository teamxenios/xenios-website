// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const setExperience = vi.hoisted(() => vi.fn());
vi.mock("../../adapters/authenticatedLanding", () => ({
  setAuthenticatedExperience: setExperience,
}));

import { AdminMemberExperienceSwitch } from "./AdminMemberExperienceSwitch";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe("administrator member-experience switch", () => {
  it("navigates only after the server verifies the persisted preference", async () => {
    setExperience.mockResolvedValue({
      kind: "ok",
      data: {
        destination: "/research/member",
        selectedExperience: "member",
      },
    });
    window.history.replaceState(null, "", "/admin");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<AdminMemberExperienceSwitch token="admin-token" />);
    });
    const button = container.querySelector("button")!;
    expect(button.getAttribute("style")).toContain("min-height: 44px");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(setExperience).toHaveBeenCalledWith("admin-token", "member");
    expect(window.location.pathname).toBe("/research/member");
  });

  it("does not navigate when the server denies member experience", async () => {
    setExperience.mockResolvedValue({
      kind: "denied",
      code: "experience_unavailable",
    });
    window.history.replaceState(null, "", "/admin");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<AdminMemberExperienceSwitch token="admin-token" />);
    });
    await act(async () => {
      container!.querySelector("button")!.click();
      await Promise.resolve();
    });

    expect(window.location.pathname).toBe("/admin");
    expect(container.textContent).toContain(
      "No Research membership is connected",
    );
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });
});
