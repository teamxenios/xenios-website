import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedMasterOffering } from "../../master-offerings/model";
import type { AssistedOrderMasterCatalogInput } from "../production-catalog";
import type { AssistedOrderViewer } from "../ports";
import type { DiscoveryManifest } from "../../../../shared/research/assisted-order/discovery/contract";
import { parseDiscoveryReadResponse } from "../../../../shared/research/assisted-order/discovery/read-contract";
import { normalizeHeldSpecification } from "../../../../shared/research/master-offerings/formulation-hold";
import {
  FIXTURE_DATASET, liveSliceManifest, syntheticBinding,
} from "../../../../shared/research/assisted-order/discovery/__fixtures__/slice-manifest";
import {
  REVIEWED_DISCOVERY_DATASET, UNAVAILABLE_DISCOVERY_MANIFEST, UNRESOLVED_DISCOVERY_PATHWAYS, createDiscoveryRead,
  type DiscoveryReadDependencies,
} from "./discovery-read";

// The real projection, except for Product Control variant ids a test names. authorityFor always
// marks a row visible, so a projection refusal can only be exercised by stubbing the policy.
const projection = vi.hoisted(() => ({ refuse: new Set<string>() }));
vi.mock("../../../../shared/research/assisted-order/action-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../shared/research/assisted-order/action-policy")>();
  return {
    ...actual,
    projectAssistedOrderCatalogItem: (authority: Parameters<typeof actual.projectAssistedOrderCatalogItem>[0]) =>
      projection.refuse.has(authority.variantId) ? null : actual.projectAssistedOrderCatalogItem(authority),
  };
});

// Every manifest, binding, pathway and dataset port here is SYNTHETIC. None is a reviewed record.
const viewer = { actorType: "member", memberId: "synthetic", normalizedEmail: null,
  earlyAccessSessionHash: null, capabilities: new Set(["assisted_orders:submit"]) } as AssistedOrderViewer;
const otherViewer = { ...viewer, memberId: "synthetic-other" } as AssistedOrderViewer;

type State = NormalizedMasterOffering["displayState"];
function offering(id: string, state: State = "request_access", extra: Partial<NormalizedMasterOffering> = {}): NormalizedMasterOffering {
  return {
    id: "mo_" + id, slug: "synthetic-" + id, canonicalKey: "synthetic-" + id,
    displayName: "Synthetic " + id, canonicalName: "Synthetic " + id, family: "research_peptides_materials",
    category: "Synthetic", subcategory: null, brand: null, aliases: [],
    displayState: state, stateExplanation: "", copyState: "approved", visibility: "member",
    variants: [{ id: "mov_" + id, label: "Synthetic exact variant " + id, displayState: state, visibility: "member", sourceReferences: [] }],
    sourceReferences: [],
    ...extra,
  };
}
function catalog(rows: NormalizedMasterOffering[] | ((viewer: AssistedOrderViewer) => NormalizedMasterOffering[] | null),
  extra: Partial<AssistedOrderMasterCatalogInput> = {}) {
  const select = vi.fn();
  const input: AssistedOrderMasterCatalogInput = {
    serviceFor: (who) => {
      const visible = typeof rows === "function" ? rows(who) : rows;
      if (!visible) return null;
      return {
        select: select.mockImplementation(async (query: { page?: number; pageSize?: number }) => {
          const page = query.page ?? 1, pageSize = Math.min(query.pageSize ?? 24, 100);
          return { offerings: visible.slice((page - 1) * pageSize, page * pageSize),
            // A real price exists for every row. It must never reach the read.
            prices: new Map(visible.flatMap((row) => row.variants.map((variant) =>
              [variant.id, { state: "priced", amountCents: 4200, priceId: "price-secret-" + row.id } as never] as const))),
            page: { page, pageSize, total: visible.length } };
        }),
      };
    },
    bindingFor: (variantId) => ({ productId: "product-" + variantId, variantId: "pc-" + variantId }),
    offeringVariantFor: () => null, catalogVersion: "synthetic-v1",
    ...extra,
  };
  return { input, select };
}
const synthetic = (input: AssistedOrderMasterCatalogInput, extra: Partial<DiscoveryReadDependencies> = {}): DiscoveryReadDependencies => ({
  catalog: input,
  manifest: () => liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_1", "mov_1")] }),
  pathways: () => ["personal_wellness"],
  dataset: () => FIXTURE_DATASET,
  ...extra,
});
const unavailable = (reason: string) => ({ schemaVersion: 1, state: "unavailable", reason, fullCatalogAvailable: true });

describe("discovery read: production defaults", () => {
  it("answers manifest_unavailable without reading the catalog", async () => {
    const { input, select } = catalog([offering("1")]);
    const serviceFor = vi.spyOn(input, "serviceFor");
    const read = createDiscoveryRead({ catalog: input });
    expect(await read(viewer)).toEqual(unavailable("manifest_unavailable"));
    expect(serviceFor).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(UNAVAILABLE_DISCOVERY_MANIFEST()).toBeNull();
  });

  it("never infers a pathway or a dataset identity by default", async () => {
    const { input } = catalog([offering("1")]);
    expect(UNRESOLVED_DISCOVERY_PATHWAYS("mo_1", "mov_1")).toBeNull();
    expect(await createDiscoveryRead(synthetic(input, { pathways: undefined }))(viewer)).toEqual(unavailable("facts_unresolved"));
    // Synthetic rows are not the registered reviewed dataset, so the default port knows no identity.
    expect(REVIEWED_DISCOVERY_DATASET(offering("1"), offering("1").variants[0])).toBeNull();
    expect(await createDiscoveryRead(synthetic(input, { dataset: undefined }))(viewer)).toEqual(unavailable("dataset_unresolved"));
  });

  it("takes the viewer and nothing else, and its source reads no request, storage, network or log", () => {
    const { input } = catalog([offering("1")]);
    expect(createDiscoveryRead(synthetic(input)).length).toBe(1);
    const code = readFileSync(new URL("./discovery-read.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of [/console\./, /\.body\b/, /\.query\b/, /\bheaders\b/, /\bfetch\(/, /Storage\b/, /\blog(ger)?\b/, /\banswers?\b/]) {
      expect(code).not.toMatch(forbidden);
    }
  });
});

describe("discovery read: an available snapshot", () => {
  it("serves one minimal fact per visible variant across every page, and the browser parser accepts it unchanged", async () => {
    const rows = Array.from({ length: 105 }, (_, index) => offering(String(index + 1)));
    const { input } = catalog(rows);
    const response = await createDiscoveryRead(synthetic(input))(viewer);
    expect(response.state).toBe("available");
    if (response.state !== "available") return;
    expect(response.facts).toHaveLength(105);
    expect(response.facts[104]).toEqual({ offeringId: "mo_105", variantId: "mov_105", visible: true, held: false, pathways: ["personal_wellness"] });
    expect(response.catalogDatasetSha256).toBe(FIXTURE_DATASET);
    const wire = JSON.parse(JSON.stringify(response)) as unknown;
    expect(parseDiscoveryReadResponse(wire)).toEqual(response);
  });

  it("carries no price, name, label, product identity or contact field", async () => {
    const { input } = catalog([offering("1"), offering("2")]);
    const text = JSON.stringify(await createDiscoveryRead(synthetic(input))(viewer));
    for (const leaked of ["4200", "price-secret", "amountCents", "unitPriceCents", "priceVersion", "Synthetic 1",
      "Synthetic exact variant", "product-mov_1", "pc-mov_1", "synthetic-1", "normalizedEmail", "memberId"]) {
      expect(text).not.toContain(leaked);
    }
  });

  it("marks every current restriction as held, and leaves an ordinary or provider row unheld", async () => {
    const hold = offering("hold");
    const rows = [
      offering("ordinary"),
      offering("soon", "coming_soon"),
      offering("pending", "approval_required"),
      offering("away", "temporarily_unavailable"),
      offering("care", "care_pathway", { family: "clinical_formulations_503a" }),
      hold,
    ];
    // The reconciliation record stores held specifications normalized, exactly as the composition root does.
    const { input } = catalog(rows, { reviewedFormulationHolds: new Set([normalizeHeldSpecification(hold.variants[0].label)]) });
    const response = await createDiscoveryRead(synthetic(input, {
      // Keep this synthetic care fixture in the clinical-information pathway.
      pathways: (offeringId) => offeringId === "mo_care" ? ["clinical_information"] as const : ["personal_wellness"] as const,
    }))(viewer);
    if (response.state !== "available") throw new Error("expected available, got " + response.reason);
    const held = Object.fromEntries(response.facts.map((fact) => [fact.offeringId, fact.held]));
    expect(held).toEqual({ mo_ordinary: false, mo_soon: true, mo_pending: true, mo_away: true, mo_care: false, mo_hold: true });
  });

  it("serves the reviewed pathways exactly, including an explicit empty list", async () => {
    const { input } = catalog([offering("1"), offering("2")]);
    const pathways = (offeringId: string) => offeringId === "mo_1" ? ["laboratory_research", "personal_wellness"] as const : [] as const;
    const response = await createDiscoveryRead(synthetic(input, { pathways }))(viewer);
    if (response.state !== "available") throw new Error("expected available");
    expect(response.facts.map((fact) => fact.pathways)).toEqual([["laboratory_research", "personal_wellness"], []]);
  });

  it("is scoped to the viewer: another viewer's rows and their bindings are never served", async () => {
    const { input } = catalog((who) => who.memberId === "synthetic" ? [offering("1")] : [offering("1"), offering("hidden")]);
    const manifest = () => liveSliceManifest({ bindings: [syntheticBinding("sleep", "mo_1", "mov_1"), syntheticBinding("sleep", "mo_hidden", "mov_hidden")] });
    const read = createDiscoveryRead(synthetic(input, { manifest }));
    const mine = await read(viewer);
    if (mine.state !== "available") throw new Error("expected available");
    expect(mine.facts.map((fact) => fact.offeringId)).toEqual(["mo_1"]);
    expect(mine.manifest.bindings.map((binding) => binding.offeringId)).toEqual(["mo_1"]);
    expect(JSON.stringify(mine)).not.toContain("hidden");
    const theirs = await read(otherViewer);
    if (theirs.state !== "available") throw new Error("expected available");
    expect(theirs.facts.map((fact) => fact.offeringId)).toEqual(["mo_1", "mo_hidden"]);
  });
});

describe("discovery read: refusals", () => {
  it("refuses when the viewer has no catalog", async () => {
    const { input } = catalog(() => null);
    expect(await createDiscoveryRead(synthetic(input))(viewer)).toEqual(unavailable("catalog_unavailable"));
  });

  it.each<{ label: string; value: unknown }>([
    { label: "a missing classification", value: null },
    { label: "an unknown pathway", value: ["unsure"] },
    { label: "a repeated pathway", value: ["personal_wellness", "personal_wellness"] },
    { label: "a non-list", value: "personal_wellness" },
  ])("refuses the whole snapshot on $label for any one variant", async ({ value }) => {
    const { input } = catalog([offering("1"), offering("2")]);
    const pathways = (offeringId: string) => offeringId === "mo_2" ? value as never : ["personal_wellness"] as const;
    expect(await createDiscoveryRead(synthetic(input, { pathways }))(viewer)).toEqual(unavailable("facts_unresolved"));
  });

  it("refuses an unknown or disagreeing dataset identity", async () => {
    const { input } = catalog([offering("1"), offering("2")]);
    expect(await createDiscoveryRead(synthetic(input, { dataset: (row) => row.id === "mo_2" ? null : FIXTURE_DATASET }))(viewer))
      .toEqual(unavailable("dataset_unresolved"));
    expect(await createDiscoveryRead(synthetic(input, { dataset: (row) => row.id === "mo_2" ? "1".repeat(64) : FIXTURE_DATASET }))(viewer))
      .toEqual(unavailable("dataset_unresolved"));
  });

  it("refuses a manifest bound to another dataset, an unpublished or invalid one, and a failing port", async () => {
    const { input } = catalog([offering("1")]);
    const withManifest = (manifest: () => DiscoveryManifest | null) => createDiscoveryRead(synthetic(input, { manifest }))(viewer);
    expect(await withManifest(() => liveSliceManifest({ catalogDatasetSha256: "1".repeat(64) }))).toEqual(unavailable("dataset_mismatch"));
    expect(await withManifest(() => liveSliceManifest({ status: "draft" }))).toEqual(unavailable("manifest_not_published"));
    expect(await withManifest(() => liveSliceManifest({ schemaVersion: 2 as never }))).toEqual(unavailable("manifest_invalid"));
    expect(await withManifest(() => { throw new Error("synthetic manifest store failure"); })).toEqual(unavailable("manifest_invalid"));
  });

  it("refuses a catalog that changes, repeats or fails mid-read, without echoing the failure", async () => {
    const rows = Array.from({ length: 150 }, (_, index) => offering(String(index + 1)));
    let calls = 0;
    const changing: AssistedOrderMasterCatalogInput = {
      ...catalog(rows).input,
      serviceFor: () => ({
        async select(query) {
          calls += 1;
          const page = query.page ?? 1;
          return { offerings: rows.slice((page - 1) * 100, page * 100), prices: new Map(),
            page: { page, pageSize: 100, total: calls === 1 ? 150 : 151 } };
        },
      }),
    };
    expect(await createDiscoveryRead(synthetic(changing))(viewer)).toEqual(unavailable("catalog_unavailable"));

    const repeated = catalog([offering("1"), offering("1")]);
    expect(await createDiscoveryRead(synthetic(repeated.input))(viewer)).toEqual(unavailable("catalog_unavailable"));

    const failing: AssistedOrderMasterCatalogInput = {
      ...catalog([offering("1")]).input,
      serviceFor: () => ({ async select() { throw new Error("synthetic secret detail"); } }),
    };
    const response = await createDiscoveryRead(synthetic(failing))(viewer);
    expect(response).toEqual(unavailable("catalog_unavailable"));
    expect(JSON.stringify(response)).not.toContain("secret");
  });

  it("refuses an offering with other than exactly one variant, as the request-intent catalog does", async () => {
    const two = offering("two");
    const none = offering("none", "request_access", { variants: [] });
    const withTwo = { ...two, variants: [two.variants[0], { ...two.variants[0], id: "mov_two_b" }] };
    for (const rows of [[offering("1"), withTwo], [offering("1"), none]]) {
      const { input } = catalog(rows);
      expect(await createDiscoveryRead(synthetic(input))(viewer)).toEqual(unavailable("catalog_unavailable"));
    }
  });

  it("refuses a row the service returned but the action policy will not project, instead of skipping it", async () => {
    const { input } = catalog([offering("1"), offering("2")]);
    projection.refuse.add("pc-mov_2");
    try {
      expect(await createDiscoveryRead(synthetic(input))(viewer)).toEqual(unavailable("catalog_unavailable"));
    } finally {
      projection.refuse.clear();
    }
    // The same rows project again once the stub is cleared.
    expect((await createDiscoveryRead(synthetic(input))(viewer)).state).toBe("available");
  });

  it("refuses a provider-workflow row classified for personal wellness or laboratory research", async () => {
    const care = offering("care", "care_pathway", { family: "clinical_formulations_503a" });
    const { input } = catalog([offering("1"), care]);
    for (const listed of [["personal_wellness"], ["laboratory_research"], ["clinical_information", "personal_wellness"]] as const) {
      const pathways = (offeringId: string) => offeringId === "mo_care" ? listed : ["personal_wellness"] as const;
      expect(await createDiscoveryRead(synthetic(input, { pathways }))(viewer)).toEqual(unavailable("facts_unresolved"));
    }
    // Clinical information, or an explicit none, is a consistent classification for it.
    for (const listed of [["clinical_information"], []] as const) {
      const pathways = (offeringId: string) => offeringId === "mo_care" ? listed : ["personal_wellness"] as const;
      const response = await createDiscoveryRead(synthetic(input, { pathways }))(viewer);
      if (response.state !== "available") throw new Error("expected available, got " + response.reason);
      expect(response.facts.find((fact) => fact.offeringId === "mo_care")?.pathways).toEqual(listed);
    }
  });

  it("refuses a snapshot above the fact limit", async () => {
    const rows = Array.from({ length: 5_001 }, (_, index) => offering(String(index + 1)));
    const { input } = catalog(rows);
    expect(await createDiscoveryRead(synthetic(input))(viewer)).toEqual(unavailable("facts_limit"));
  });
});
