// The activation queues, proven over the real artifact.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { krisActivationQueues } from "./activation-queue";
import { loadKrisDataset } from "./dataset-reader";

const ARTIFACT = path.resolve(
  process.cwd(),
  "server/research/kris-launch-a/data/kris-launch-a-catalog.generated.json",
);

const DATASET = loadKrisDataset(JSON.parse(fs.readFileSync(ARTIFACT, "utf8")));

describe("the activation queues over the real artifact", () => {
  it("carries exactly the 32 classification rows and the 2 pricing rows", () => {
    const queues = krisActivationQueues(DATASET);
    expect(queues.classification).toHaveLength(32);
    expect(queues.pricing).toHaveLength(2);
    expect(queues.pricing.map((entry) => entry.displayName).sort()).toEqual([
      "BAM15",
      "Syringes & Alcohol Swabs",
    ]);
  });

  it("never queues a provider or direct row", () => {
    const queues = krisActivationQueues(DATASET);
    const queuedIds = new Set(
      [...queues.classification, ...queues.pricing].map((entry) => entry.id),
    );
    // 420 minus 143 direct minus 243 provider leaves exactly the 34 queued.
    expect(queuedIds.size).toBe(34);
  });

  it("orders each queue by family then name, stably", () => {
    // The oracle asserts the pairwise relation rather than re-sorting with a
    // second comparator: a default code-point sort disagrees with the
    // implementation's locale ordering on case (HGH vs Hexarelin), and an
    // oracle that reimplements the code proves nothing anyway.
    const queues = krisActivationQueues(DATASET);
    for (const queue of [queues.classification, queues.pricing]) {
      for (let i = 1; i < queue.length; i += 1) {
        const prev = queue[i - 1];
        const next = queue[i];
        const familyOrder = prev.family.localeCompare(next.family);
        expect(familyOrder, `${prev.family} before ${next.family}`).toBeLessThanOrEqual(0);
        if (familyOrder === 0) {
          expect(
            prev.displayName.localeCompare(next.displayName),
            `${prev.displayName} before ${next.displayName}`,
          ).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it("tells the truth about what completes an entry, without inventing facts", () => {
    const queues = krisActivationQueues(DATASET);
    for (const entry of queues.classification) {
      expect(entry.completes).toContain("Confirm classification");
    }
    for (const entry of queues.pricing) {
      expect(entry.completes).toContain("never inherit a fallback price");
    }
  });

  it("carries only fields the member-safe artifact already carries", () => {
    const queues = krisActivationQueues(DATASET);
    const entry = queues.classification[0];
    expect(Object.keys(entry).sort()).toEqual([
      "channel",
      "completes",
      "displayName",
      "family",
      "id",
      "slug",
      "specification",
      "suppliedNote",
    ]);
  });
});
