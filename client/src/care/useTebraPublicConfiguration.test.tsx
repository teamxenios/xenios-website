// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TebraPublicConfiguration } from "@shared/care/tebra-experience";
import { useTebraPublicConfiguration } from "./useTebraPublicConfiguration";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function configuration(url: string): TebraPublicConfiguration {
  return {
    schemaVersion: 1,
    authority: "tebra",
    careAvailable: true,
    scheduling: {
      status: "ready",
      mode: "direct_link",
      url,
      telehealthEnabled: false,
      requestSemantics: "appointment_request_pending_confirmation",
    },
    portal: { status: "unconfigured" },
  };
}

function Probe() {
  const { state, retry } = useTebraPublicConfiguration();
  return (
    <button type="button" onClick={retry}>
      {state.kind === "ready" ? state.configuration.scheduling.url : state.kind}
    </button>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tebra public configuration loading", () => {
  it("aborts and ignores a stale response when a retry starts", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => configuration("https://scheduler.example.test/new"),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<Probe />));

    const firstSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    await act(async () => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(firstSignal.aborted).toBe(true);
    expect(container.textContent).toContain("https://scheduler.example.test/new");

    await act(async () => {
      resolveFirst?.({
        ok: true,
        json: async () => configuration("https://scheduler.example.test/stale"),
      } as Response);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("https://scheduler.example.test/new");
    expect(container.textContent).not.toContain("stale");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/care/tebra/configuration",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );

    await act(async () => root.unmount());
    container.remove();
  });
});
