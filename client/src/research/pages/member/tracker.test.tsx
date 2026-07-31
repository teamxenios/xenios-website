// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { getTrackerProgress, recordTrackerObservation } = vi.hoisted(() => ({
  getTrackerProgress: vi.fn(),
  recordTrackerObservation: vi.fn(),
}));

vi.mock("../../core", () => ({
  useResearch: () => ({ memberToken: "raw-member-token" }),
}));
vi.mock("../../adapters/tracker", () => ({
  getTrackerProgress,
  recordTrackerObservation,
}));
vi.mock("../../ui/shells", () => ({
  ResearchMemberShell: ({ title, lead, children }: any) => (
    <main>
      <h1>{title}</h1>
      <p>{lead}</p>
      {children}
    </main>
  ),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import Tracker from "./Tracker";

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  getTrackerProgress.mockReset();
  recordTrackerObservation.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Tracker member page", () => {
  it("renders the server-authoritative locked state without a write form", async () => {
    getTrackerProgress.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        progress: { unlocked: false, windowDays: 30, metrics: [] },
      },
    });

    await act(async () => {
      root.render(<Tracker />);
    });
    await flush();

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.textContent).toContain(
      "The tracker opens after your assessment is submitted.",
    );
    expect(container.querySelector('form[aria-label="Add tracker observation"]')).toBeNull();
    expect(getTrackerProgress).toHaveBeenCalledWith(30, "raw-member-token");
  });

  it("renders exact server metrics and plain-language summaries without fixture data", async () => {
    getTrackerProgress.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        progress: {
          unlocked: true,
          windowDays: 30,
          metrics: [
            {
              metricKey: "sleep_and_recovery",
              textSummary: "Sleep and recovery: one entry in the last 30 days.",
              observations: [
                {
                  observationId: "observation-1",
                  metricKey: "sleep_and_recovery",
                  source: "manual",
                  recordedAt: "2026-07-30T15:00:00.000Z",
                  timezone: "America/Chicago",
                  unit: "hours",
                  originalValue: 7.5,
                  normalizedValue: 7.5,
                  confidence: "high",
                  notes: "Rested",
                  planId: null,
                  createdAt: "2026-07-30T15:00:00.000Z",
                },
              ],
            },
          ],
        },
      },
    });

    await act(async () => {
      root.render(<Tracker />);
    });
    await flush();

    expect(container.textContent).toContain(
      "Sleep and recovery: one entry in the last 30 days.",
    );
    expect(container.textContent).toContain("7.5 hours");
    expect(container.textContent).toContain("Rested");
    expect(container.textContent).not.toContain("Development preview data");
    expect(container.textContent).not.toMatch(/overall health score\s*[:=]\s*\d/i);
    expect(container.querySelector('form[aria-label="Add tracker observation"]')).toBeTruthy();
  });

  it("shows a truthful unavailable state and creates no local draft", async () => {
    getTrackerProgress.mockResolvedValue({ kind: "unavailable" });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await act(async () => {
      root.render(<Tracker />);
    });
    await flush();

    expect(container.textContent).toContain(
      "The tracker is temporarily unavailable.",
    );
    expect(setItem).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Export");
    expect(container.textContent).not.toContain("Request deletion");
    setItem.mockRestore();
  });

  it("submits the shared observation shape and refreshes the canonical read", async () => {
    getTrackerProgress.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        progress: { unlocked: true, windowDays: 30, metrics: [] },
      },
    });
    recordTrackerObservation.mockResolvedValue({
      kind: "ok",
      data: { ok: true, observation: { observationId: "observation-2" } },
    });

    await act(async () => {
      root.render(<Tracker />);
    });
    await flush();

    const input = container.querySelector("#tracker-value") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "7.5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = container.querySelector(
      'form[aria-label="Add tracker observation"]',
    ) as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flush();

    expect(recordTrackerObservation).toHaveBeenCalledTimes(1);
    expect(recordTrackerObservation.mock.calls[0]?.[0]).toMatchObject({
      metricKey: "sleep_and_recovery",
      value: 7.5,
    });
    expect(recordTrackerObservation.mock.calls[0]?.[1]).toBe(
      "raw-member-token",
    );
    expect(container.textContent).toContain(
      "Entry saved to your private tracker.",
    );
    expect(getTrackerProgress).toHaveBeenCalledTimes(2);
  });
});
