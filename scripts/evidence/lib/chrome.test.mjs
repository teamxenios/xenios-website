import { describe, expect, it } from "vitest";

import { waitForDevToolsPort } from "./chrome.mjs";

describe("Chromium DevToolsActivePort readiness", () => {
  it.each(["EBUSY", "EPERM"])("retries transient %s reads and accepts the completed port", async (code) => {
    let reads = 0;
    const port = await waitForDevToolsPort({
      child: { exitCode: null },
      portFile: "DevToolsActivePort",
      timeoutMs: 100,
      fileExists: () => true,
      readText: () => {
        reads += 1;
        if (reads === 1) throw Object.assign(new Error(code), { code });
        return "56468\n/devtools/browser/test\n";
      },
      now: () => 0,
      wait: async () => {},
    });

    expect(port).toBe(56468);
    expect(reads).toBe(2);
  });

  it("stops retrying at the existing bounded timeout", async () => {
    let elapsed = 0;
    let reads = 0;
    const waits = [];
    const port = await waitForDevToolsPort({
      child: { exitCode: null },
      portFile: "DevToolsActivePort",
      timeoutMs: 100,
      pollIntervalMs: 50,
      fileExists: () => true,
      readText: () => {
        reads += 1;
        throw Object.assign(new Error("busy"), { code: "EBUSY" });
      },
      now: () => elapsed,
      wait: async (ms) => {
        waits.push(ms);
        elapsed += ms;
      },
    });

    expect(port).toBeNull();
    expect(reads).toBe(2);
    expect(waits).toEqual([50, 50]);
    expect(elapsed).toBe(100);
  });

  it("fails closed immediately for non-retryable read errors", async () => {
    let waits = 0;
    const error = Object.assign(new Error("access denied"), { code: "EACCES" });

    await expect(waitForDevToolsPort({
      child: { exitCode: null },
      portFile: "DevToolsActivePort",
      timeoutMs: 100,
      fileExists: () => true,
      readText: () => {
        throw error;
      },
      now: () => 0,
      wait: async () => {
        waits += 1;
      },
    })).rejects.toBe(error);

    expect(waits).toBe(0);
  });
});
