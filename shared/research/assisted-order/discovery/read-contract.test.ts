import { describe, expect, it } from "vitest";
import type { DiscoveryCatalogFact } from "./contract";
import { evaluateDiscovery } from "./evaluate";
import {
  DISCOVERY_READ_MAX_FACTS, DISCOVERY_READ_UNAVAILABLE_REASONS, discoveryManifestRefusal, discoveryReadUnavailable,
  parseDiscoveryPathways, parseDiscoveryReadFact, parseDiscoveryReadResponse,
} from "./read-contract";
import { FIXTURE_DATASET, answered, liveSliceManifest, syntheticBinding } from "./__fixtures__/slice-manifest";

// Every manifest and binding here is the SYNTHETIC test fixture. None is a reviewed record.
const fact = (offeringId: string, variantId: string, extra: Partial<DiscoveryCatalogFact> = {}): DiscoveryCatalogFact => ({
  offeringId, variantId, visible: true, held: false, pathways: ["personal_wellness"], ...extra,
});
const available = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1, state: "available",
  manifest: liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a")] }),
  catalogDatasetSha256: FIXTURE_DATASET,
  facts: [fact("mo_a", "mov_a"), fact("mo_b", "mov_b", { held: true, pathways: [] })],
  fullCatalogAvailable: true,
  ...extra,
});
const wire = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
const INVALID = { schemaVersion: 1, state: "unavailable", reason: "response_invalid", fullCatalogAvailable: true };

describe("discovery read contract: accepted responses", () => {
  it("accepts an exact available response from the wire and evaluates it in the browser", () => {
    const parsed = parseDiscoveryReadResponse(wire(available()));
    expect(parsed.state).toBe("available");
    if (parsed.state !== "available") return;
    expect(parsed.facts).toEqual([fact("mo_a", "mov_a"), fact("mo_b", "mov_b", { held: true, pathways: [] })]);
    // Answers live only in this test's memory; they are never part of the read.
    const result = evaluateDiscovery(parsed.manifest, { pathway: answered("personal_wellness"), goals: answered("sleep") },
      parsed.facts, { catalogDatasetSha256: parsed.catalogDatasetSha256 });
    expect(result.state).toBe("matches");
    expect(result.matches.map((match) => match.offeringId)).toEqual(["mo_a"]);
    expect(result.fullCatalogAvailable).toBe(true);
  });

  it.each(DISCOVERY_READ_UNAVAILABLE_REASONS)("keeps the server's known unavailable reason %s", (reason) => {
    expect(parseDiscoveryReadResponse(wire(discoveryReadUnavailable(reason))))
      .toEqual({ schemaVersion: 1, state: "unavailable", reason, fullCatalogAvailable: true });
  });

  it("accepts an empty pathway list as an explicit none, and nothing else", () => {
    expect(parseDiscoveryPathways([])).toEqual([]);
    expect(parseDiscoveryPathways(["laboratory_research", "personal_wellness"])).toEqual(["laboratory_research", "personal_wellness"]);
    for (const bad of [null, undefined, "personal_wellness", ["unsure"], ["personal_wellness", "personal_wellness"], [1], {}]) {
      expect(parseDiscoveryPathways(bad)).toBeNull();
    }
  });

  it("shares the server's manifest checks", () => {
    expect(discoveryManifestRefusal(liveSliceManifest(), FIXTURE_DATASET)).toBeNull();
    expect(discoveryManifestRefusal(liveSliceManifest({ status: "draft" }), FIXTURE_DATASET)).toBe("manifest_not_published");
    expect(discoveryManifestRefusal(liveSliceManifest({ schemaVersion: 2 as never }), FIXTURE_DATASET)).toBe("manifest_invalid");
    expect(discoveryManifestRefusal(liveSliceManifest(), "1".repeat(64))).toBe("dataset_mismatch");
    expect(discoveryManifestRefusal(null as never, FIXTURE_DATASET)).toBe("manifest_invalid");
  });
});

describe("discovery read contract: refused responses", () => {
  // Price, copy, quantity, contact and answer fields are not facts. Any of them refuses the read.
  it.each(["unitPriceCents", "priceVersion", "productName", "specification", "family", "quantity", "format",
    "productType", "normalizedEmail", "answers", "goals", "sourceRefusal"])("refuses a fact that carries %s", (key) => {
    const response = available({ facts: [{ ...fact("mo_a", "mov_a"), [key]: "x" }] });
    expect(parseDiscoveryReadResponse(wire(response))).toEqual(INVALID);
    expect(parseDiscoveryReadFact({ ...fact("mo_a", "mov_a"), [key]: "x" })).toBeNull();
  });

  it.each<{ label: string; extra: Record<string, unknown> }>([
    { label: "a hidden fact", extra: { visible: false } },
    { label: "a missing hold", extra: { held: undefined } },
    { label: "a string hold", extra: { held: "false" } },
    { label: "an unknown pathway", extra: { pathways: ["unsure"] } },
    { label: "a repeated pathway", extra: { pathways: ["personal_wellness", "personal_wellness"] } },
    { label: "a missing pathway list", extra: { pathways: undefined } },
    { label: "an empty offering id", extra: { offeringId: "" } },
  ])("refuses $label", ({ extra }) => {
    const raw = { ...fact("mo_a", "mov_a"), ...extra };
    expect(parseDiscoveryReadFact(wire(raw))).toBeNull();
    expect(parseDiscoveryReadResponse(wire(available({ facts: [raw] })))).toEqual(INVALID);
  });

  it("refuses a response-level answer, goal or extra field", () => {
    for (const key of ["answers", "goals", "query", "selection", "debug"]) {
      expect(parseDiscoveryReadResponse(wire(available({ [key]: {} })))).toEqual(INVALID);
    }
    expect(parseDiscoveryReadResponse(wire({ ...discoveryReadUnavailable("manifest_unavailable"), answers: {} }))).toEqual(INVALID);
  });

  it("refuses an unknown unavailable reason, version or a missing full-catalog promise", () => {
    expect(parseDiscoveryReadResponse({ ...discoveryReadUnavailable("manifest_unavailable"), reason: "not_eligible" })).toEqual(INVALID);
    expect(parseDiscoveryReadResponse(wire(available({ schemaVersion: 2 })))).toEqual(INVALID);
    expect(parseDiscoveryReadResponse(wire(available({ fullCatalogAvailable: false })))).toEqual(INVALID);
    expect(parseDiscoveryReadResponse(wire(available({ state: "matches" })))).toEqual(INVALID);
  });

  it("refuses a duplicate fact identity", () => {
    expect(parseDiscoveryReadResponse(wire(available({ facts: [fact("mo_a", "mov_a"), fact("mo_a", "mov_a", { held: true })] }))))
      .toEqual(INVALID);
  });

  it("refuses a malformed dataset identity or one that differs from the manifest's", () => {
    expect(parseDiscoveryReadResponse(wire(available({ catalogDatasetSha256: "0".repeat(63) })))).toEqual(INVALID);
    expect(parseDiscoveryReadResponse(wire(available({ catalogDatasetSha256: "A".repeat(64) })))).toEqual(INVALID);
    expect(parseDiscoveryReadResponse(wire(available({ catalogDatasetSha256: "1".repeat(64) })))).toEqual(INVALID);
  });

  it("refuses an unpublished or invalid manifest", () => {
    expect(parseDiscoveryReadResponse(wire(available({ manifest: liveSliceManifest({ status: "draft" }) })))).toEqual(INVALID);
    expect(parseDiscoveryReadResponse(wire(available({ manifest: liveSliceManifest({ schemaVersion: 2 as never }) })))).toEqual(INVALID);
    expect(parseDiscoveryReadResponse(wire(available({ manifest: "published" })))).toEqual(INVALID);
  });

  it("refuses a binding that names a variant the response does not serve", () => {
    const manifest = liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_a", "mov_a"), syntheticBinding("sleep", "mo_hidden", "mov_hidden")] });
    expect(parseDiscoveryReadResponse(wire(available({ manifest })))).toEqual(INVALID);
  });

  it("refuses a snapshot above the fact limit", () => {
    const facts = Array.from({ length: DISCOVERY_READ_MAX_FACTS + 1 }, (_, index) => fact("mo_" + index, "mov_" + index));
    expect(parseDiscoveryReadResponse(available({ facts }))).toEqual(INVALID);
  });

  it("never throws, whatever arrives", () => {
    for (const raw of [undefined, null, 0, "available", [], {}, { schemaVersion: 1 }, { schemaVersion: 1, state: "available", fullCatalogAvailable: true },
      available({ facts: null }), available({ facts: [null] }), available({ manifest: { bindings: "x" } })]) {
      expect(() => parseDiscoveryReadResponse(raw)).not.toThrow();
      expect(parseDiscoveryReadResponse(raw)).toEqual(INVALID);
    }
  });
});
