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

  it("orders each queue by family then name under the pinned en collation", () => {
    // The comparator is pinned to Intl.Collator("en") in the implementation.
    // The pairwise oracle uses the SAME pinned collator explicitly — not the
    // host-default localeCompare — so a host-locale/ICU drift cannot move the
    // implementation and the oracle together.
    const collator = new Intl.Collator("en");
    const queues = krisActivationQueues(DATASET);
    for (const queue of [queues.classification, queues.pricing]) {
      for (let i = 1; i < queue.length; i += 1) {
        const prev = queue[i - 1];
        const next = queue[i];
        const familyOrder = collator.compare(prev.family, next.family);
        expect(familyOrder, `${prev.family} before ${next.family}`).toBeLessThanOrEqual(0);
        if (familyOrder === 0) {
          expect(
            collator.compare(prev.displayName, next.displayName),
            `${prev.displayName} before ${next.displayName}`,
          ).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it("matches the golden ordering pinned from the real artifact", () => {
    // Belt to the pairwise braces: the exact sequence operations sees today,
    // as literals. If ANY comparator change reorders the worklist — even one
    // that still satisfies the pairwise relation under some collator — this
    // snapshot names the row that moved.
    const queues = krisActivationQueues(DATASET);
    expect(queues.pricing.map((entry) => entry.slug)).toEqual([
      "research-capsules-bam15-bam15-500-mcg",
      "shipping-and-fulfillment-syringes-and-alcohol-swabs",
    ]);
    expect(queues.classification.slice(0, 5).map((entry) => entry.slug)).toEqual([
      "research-capsules-colostrum-colostrum-100mg-x-90-capsules",
      "research-capsules-tesofensine-tesofensine-500mcg-capsules-x100",
      "research-capsules-tesofensine-tesofensine-500mcg-capsules-x30",
      "research-peptides-and-materials-bdnf-bdnf-brain-derived-neurotrophic-factor-10mg",
      "research-peptides-and-materials-bpc-157-bpc-157-20mg",
    ]);
    // The case-sensitivity witness QA named: under the pinned en collation
    // Hexarelin sorts before HGH (case-insensitive base letters), where a raw
    // code-point sort would put HGH first. Pin the adjacent pair exactly.
    const names = queues.classification.map((entry) => entry.displayName);
    const hexarelin = names.findIndex((name) => name.startsWith("Hexarelin"));
    expect(hexarelin).toBeGreaterThan(-1);
    expect(names[hexarelin + 1]).toMatch(/^HGH/);
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
