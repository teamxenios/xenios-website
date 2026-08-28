// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TebraPortalHandoff from "./TebraPortalHandoff";
import type { TebraConfigurationLoadState } from "./useTebraPublicConfiguration";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const PORTAL_URL = "https://portal.kareo.com/app/login";
const source = readFileSync(resolve(__dirname, "./TebraPortalHandoff.tsx"), "utf8");

function portalState(
  portal: Record<string, unknown>,
): TebraConfigurationLoadState {
  return {
    kind: "ready",
    configuration: {
      schemaVersion: 1,
      authority: "tebra",
      careAvailable: true,
      scheduling: {
        status: "disabled",
        mode: "disabled",
        telehealthEnabled: false,
        requestSemantics: "appointment_request_pending_confirmation",
      },
      portal: {
        status: "ready",
        url: PORTAL_URL,
        ...portal,
      },
    },
  } as unknown as TebraConfigurationLoadState;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState({}, "", "/");
});

async function renderState(
  state: TebraConfigurationLoadState,
  onRetry = vi.fn(),
) {
  await act(async () => {
    root.render(<TebraPortalHandoff state={state} onRetry={onRetry} />);
  });
  return onRetry;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Tebra portal fail-closed behavior", () => {
  it("does not expose a portal destination while configuration is loading", async () => {
    await renderState({ kind: "loading" });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector("a, iframe, script")).toBeNull();
    expect(container.textContent).toContain("Verifying the official Tebra portal link");
  });

  it("does not create a session and offers retry after a configuration error", async () => {
    const retry = await renderState({ kind: "error" });

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector("a, iframe, script")).toBeNull();
    expect(container.textContent).toContain(
      "No account or portal session has been created here.",
    );

    await click(container.querySelector("button") as HTMLButtonElement);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it.each([
    "care_unavailable",
    "configuration_invalid",
    "unconfigured",
  ])("ignores a dormant URL when portal status is %s", async (status) => {
    await renderState(portalState({ status }));

    expect(container.querySelector("a, iframe, script")).toBeNull();
    expect(container.querySelector("[data-tebra-portal-status]")?.getAttribute(
      "data-tebra-portal-status",
    )).toBe(status);
    expect(container.textContent).toContain(
      "Xenios does not create a Tebra portal account",
    );
  });
});

describe("Tebra portal external handoff security", () => {
  it("uses one exact, referrer-safe external link and never embeds the portal", async () => {
    await renderState(portalState({}));

    const handoff = container.querySelector(
      '[data-tebra-portal-handoff="external-only"]',
    );
    const link = handoff?.querySelector("a") as HTMLAnchorElement | null;
    expect(link?.getAttribute("href")).toBe(PORTAL_URL);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")?.split(/\s+/).sort()).toEqual([
      "noopener",
      "noreferrer",
    ]);
    expect(link?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelector("iframe, script, form")).toBeNull();
  });

  it("does not append page state or imply account, invitation, SSO, or payment availability", async () => {
    window.history.replaceState(
      {},
      "",
      "/care/portal?patient=synthetic-private#opaque-token",
    );
    await renderState(portalState({}));

    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(PORTAL_URL);
    expect(link.getAttribute("href")).not.toMatch(/[?#]/);

    const text = container.textContent ?? "";
    expect(text).toContain("does not create an account");
    expect(text).toContain("or confirm that portal access is active");
    expect(text).toContain("any enabled payments stay in Tebra");
    expect(text).not.toMatch(/single sign-on (?:is|has been) enabled/i);
    expect(text).not.toMatch(/payments? (?:are|is) enabled/i);
  });

  it("has no client path that opens or injects an unreviewed portal surface", () => {
    expect(source).not.toContain("<iframe");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toMatch(/window\.open\s*\(/);
    expect(source).not.toMatch(/addEventListener\s*\(\s*["']message["']/);
  });
});
