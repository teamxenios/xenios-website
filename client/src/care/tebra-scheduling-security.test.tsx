// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TebraSchedulingExperience from "./TebraSchedulingExperience";
import type { TebraConfigurationLoadState } from "./useTebraPublicConfiguration";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const SCHEDULING_URL = "https://scheduler.example.test/practice/request";
const POPUP_SCRIPT_URL = "https://widgets.example.test/tebra/widget.js";
const source = readFileSync(
  resolve(__dirname, "./TebraSchedulingExperience.tsx"),
  "utf8",
);

function readyState(
  scheduling: Record<string, unknown> = {},
): TebraConfigurationLoadState {
  return {
    kind: "ready",
    configuration: {
      schemaVersion: 1,
      authority: "tebra",
      careAvailable: true,
      scheduling: {
        status: "ready",
        mode: "direct_link",
        url: SCHEDULING_URL,
        telehealthEnabled: false,
        requestSemantics: "appointment_request_pending_confirmation",
        ...scheduling,
      },
      portal: { status: "unconfigured" },
    },
  } as unknown as TebraConfigurationLoadState;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document
    .querySelectorAll("script[data-tebra-widget-source]")
    .forEach((script) => script.remove());
  vi.useRealTimers();
});

async function renderState(
  state: TebraConfigurationLoadState,
  onRetry = vi.fn(),
) {
  await act(async () => {
    root.render(
      <TebraSchedulingExperience state={state} onRetry={onRetry} />,
    );
  });
  return onRetry;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function expectSafeExternalLink(link: HTMLAnchorElement | null, href: string) {
  expect(link).not.toBeNull();
  expect(link?.getAttribute("href")).toBe(href);
  expect(link?.getAttribute("target")).toBe("_blank");
  expect(link?.getAttribute("rel")?.split(/\s+/).sort()).toEqual([
    "noopener",
    "noreferrer",
  ]);
  expect(link?.getAttribute("referrerpolicy")).toBe("no-referrer");
}

describe("Tebra scheduling fail-closed states", () => {
  it("does not expose a handoff while configuration is loading", async () => {
    await renderState({ kind: "loading" });

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).toContain(
      "will not expose a Tebra handoff until the check finishes",
    );
    expect(container.querySelector("a, iframe, script")).toBeNull();
  });

  it("keeps scheduling unavailable and offers an explicit retry after a load error", async () => {
    const retry = await renderState({ kind: "error" });

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain(
      "Scheduling remains unavailable. No appointment request has been made.",
    );
    expect(container.querySelector("a, iframe, script")).toBeNull();

    const button = container.querySelector("button");
    expect(button?.textContent).toContain("Try again");
    await click(button as HTMLButtonElement);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it.each([
    "disabled",
    "care_unavailable",
    "configuration_invalid",
    "unconfigured",
  ])("does not trust dormant URLs when status is %s", async (status) => {
    await renderState(readyState({ status }));

    expect(container.querySelector("a, iframe, script")).toBeNull();
    expect(container.querySelector("[data-tebra-scheduling-status]")?.getAttribute(
      "data-tebra-scheduling-status",
    )).toBe(status);
    expect(container.textContent).toContain(
      "No appointment has been requested or confirmed.",
    );
  });
});

describe("Tebra direct-link and iframe security", () => {
  it("uses a referrer-safe external link without executable or embedded content", async () => {
    await renderState(readyState());

    expectSafeExternalLink(
      container.querySelector(`a[href="${SCHEDULING_URL}"]`),
      SCHEDULING_URL,
    );
    expect(container.querySelector("iframe, script, button")).toBeNull();
    expect(container.querySelector('[data-tebra-scheduling-mode="direct_link"]')).not.toBeNull();
  });

  it("uses constrained iframe attributes and keeps the direct fallback visible immediately", async () => {
    await renderState(readyState({ mode: "iframe" }));

    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(SCHEDULING_URL);
    expect(frame?.getAttribute("title")).toBe("Tebra appointment-request form");
    expect(frame?.getAttribute("loading")).toBe("lazy");
    expect(frame?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame?.getAttribute("sandbox")?.split(/\s+/).sort()).toEqual([
      "allow-forms",
      "allow-popups",
      "allow-same-origin",
      "allow-scripts",
    ]);
    expect(frame?.getAttribute("sandbox")).not.toMatch(
      /allow-(?:downloads|modals|top-navigation)/,
    );
    expect(frame?.getAttribute("allow")).toBe(
      "camera 'none'; microphone 'none'; geolocation 'none'",
    );
    expect(container.textContent).toContain(
      "The direct link below is available now.",
    );
    expectSafeExternalLink(
      container.querySelector(`a[href="${SCHEDULING_URL}"]`),
      SCHEDULING_URL,
    );
  });

  it("degrades a slow iframe to the visible direct fallback without inferring failure or success", async () => {
    vi.useFakeTimers();
    await renderState(readyState({ mode: "iframe" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(container.textContent).toContain(
      "The embedded scheduler is taking longer than expected",
    );
    expectSafeExternalLink(
      container.querySelector(`a[href="${SCHEDULING_URL}"]`),
      SCHEDULING_URL,
    );
    expect(container.querySelector("[data-tebra-booking-state]")).toBeNull();
  });

  it("treats iframe load and unsolicited messages as display events, never booking success", async () => {
    await renderState(readyState({ mode: "iframe" }));
    const frame = container.querySelector("iframe") as HTMLIFrameElement;

    await act(async () => {
      frame.dispatchEvent(new Event("load"));
    });
    expect(container.textContent).toContain(
      "The Tebra frame loaded. This does not mean an appointment request was submitted or confirmed.",
    );
    const textAfterLoad = container.textContent;

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://attacker.example.test",
          data: { event: "appointment_booked", patient: "sensitive" },
        }),
      );
    });
    expect(container.textContent).toBe(textAfterLoad);
    expect(container.querySelector("[data-tebra-booking-state]")).toBeNull();
    expect(source).not.toMatch(/addEventListener\s*\(\s*["']message["']/);
    expect(source).not.toMatch(/\.postMessage\s*\(/);
  });
});

describe("Tebra popup widget security", () => {
  function popupState() {
    return readyState({
      mode: "popup_widget",
      popupScriptUrl: POPUP_SCRIPT_URL,
    });
  }

  it("loads the reviewed script only after a user gesture and preserves the direct fallback", async () => {
    await renderState(popupState());

    expect(document.querySelector(`script[src="${POPUP_SCRIPT_URL}"]`)).toBeNull();
    expectSafeExternalLink(
      container.querySelector(`a[href="${SCHEDULING_URL}"]`),
      SCHEDULING_URL,
    );

    const loadButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Load Tebra scheduling"),
    );
    await click(loadButton as HTMLButtonElement);

    const script = document.querySelector(
      `script[data-tebra-widget-source="${POPUP_SCRIPT_URL}"]`,
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script?.getAttribute("src")).toBe(POPUP_SCRIPT_URL);
    expect(script?.async).toBe(true);
    expect(script?.referrerPolicy).toBe("no-referrer");
    expect(script?.dataset.tebraWidgetState).toBe("loading");
    expect(container.textContent).toContain("Loading the Tebra widget");
    expectSafeExternalLink(
      container.querySelector(`a[href="${SCHEDULING_URL}"]`),
      SCHEDULING_URL,
    );
  });

  it("deduplicates an already-loaded reviewed script", async () => {
    const existing = document.createElement("script");
    existing.src = POPUP_SCRIPT_URL;
    existing.dataset.tebraWidgetSource = POPUP_SCRIPT_URL;
    existing.dataset.tebraWidgetState = "loaded";
    document.head.append(existing);

    await renderState(popupState());
    const loadButton = container.querySelector("button") as HTMLButtonElement;
    await click(loadButton);

    expect(
      document.querySelectorAll(
        `script[data-tebra-widget-source="${POPUP_SCRIPT_URL}"]`,
      ),
    ).toHaveLength(1);
    expect(container.textContent).toContain("widget code loaded");
    expect(container.textContent).toContain("does not confirm an appointment");
  });

  it("removes a failed script and leaves a safe direct-link recovery path", async () => {
    await renderState(popupState());
    await click(container.querySelector("button") as HTMLButtonElement);
    const script = document.querySelector(
      `script[data-tebra-widget-source="${POPUP_SCRIPT_URL}"]`,
    ) as HTMLScriptElement;

    await act(async () => {
      script.dispatchEvent(new Event("error"));
    });

    expect(
      document.querySelector(`script[data-tebra-widget-source="${POPUP_SCRIPT_URL}"]`),
    ).toBeNull();
    expect(container.textContent).toContain(
      "The widget could not be loaded. Use the direct Tebra link below.",
    );
    expectSafeExternalLink(
      container.querySelector(`a[href="${SCHEDULING_URL}"]`),
      SCHEDULING_URL,
    );
  });

  it("times out an owned script, detaches late callbacks, and keeps the direct fallback", async () => {
    vi.useFakeTimers();
    await renderState(popupState());
    await click(container.querySelector("button") as HTMLButtonElement);
    const script = document.querySelector(
      `script[data-tebra-widget-source="${POPUP_SCRIPT_URL}"]`,
    ) as HTMLScriptElement;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(script.isConnected).toBe(false);
    expect(script.onload).toBeNull();
    expect(script.onerror).toBeNull();
    expect(container.textContent).toContain("widget could not be loaded");
    script.dispatchEvent(new Event("load"));
    expect(container.textContent).toContain("widget could not be loaded");
    expectSafeExternalLink(
      container.querySelector(`a[href="${SCHEDULING_URL}"]`),
      SCHEDULING_URL,
    );
  });

  it("times out and detaches listeners from an existing loading script", async () => {
    vi.useFakeTimers();
    const existing = document.createElement("script");
    existing.src = POPUP_SCRIPT_URL;
    existing.dataset.tebraWidgetSource = POPUP_SCRIPT_URL;
    existing.dataset.tebraWidgetState = "loading";
    document.head.append(existing);

    await renderState(popupState());
    await click(container.querySelector("button") as HTMLButtonElement);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(container.textContent).toContain("widget could not be loaded");
    existing.dispatchEvent(new Event("load"));
    expect(container.textContent).toContain("widget could not be loaded");
    expect(document.querySelectorAll(`script[src="${POPUP_SCRIPT_URL}"]`)).toHaveLength(1);
  });

  it("removes an owned script and nulls its handlers on unmount", async () => {
    const secondaryContainer = document.createElement("div");
    document.body.append(secondaryContainer);
    const secondaryRoot = createRoot(secondaryContainer);
    await act(async () => {
      secondaryRoot.render(
        <TebraSchedulingExperience state={popupState()} onRetry={() => undefined} />,
      );
    });
    await act(async () => {
      secondaryContainer.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const script = secondaryContainer.querySelector("script") as HTMLScriptElement;

    await act(async () => secondaryRoot.unmount());

    expect(script.isConnected).toBe(false);
    expect(script.onload).toBeNull();
    expect(script.onerror).toBeNull();
    secondaryContainer.remove();
  });

  it("never evaluates or injects the copied widget snippet as raw HTML", () => {
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\.innerHTML\s*=/);
    expect(source).not.toMatch(/window\.open\s*\(/);
  });
});
