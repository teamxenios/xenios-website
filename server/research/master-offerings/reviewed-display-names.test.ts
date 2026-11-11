import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { readReviewedDisplayNames } from "./reviewed-display-names";
import { MasterOfferingCatalogService } from "./service";

const DATASET = "server/research/master-offerings/data/member-safe-master-offerings.generated.json";
// One real listing whose generated name is cut off at an open bracket.
const CUT_OFF_NAME = "Trimix (Papaverine";
const REVIEWED_NAME = "Trimix";

type DatasetRow = { id: string; slug: string; displayName: string; canonicalName?: string; variants: { id: string; label: string }[] };
function datasetRows(): DatasetRow[] {
  const parsed = JSON.parse(readFileSync(resolve(DATASET), "utf8")) as unknown;
  const rows = Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown>).find(Array.isArray);
  return rows as DatasetRow[];
}

// For this file only, the reviewed file holds one heading, for that listing. The real file is read
// separately below. The wiring is tested with a record that exists whatever the real file holds.
vi.mock("./data/reviewed-display-names.json", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const parsed = JSON.parse(fs.readFileSync(path.resolve(
    "server/research/master-offerings/data/member-safe-master-offerings.generated.json"), "utf8")) as unknown;
  const rows = (Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown>).find(Array.isArray)) as
    { id: string; displayName: string }[];
  const cut = rows.find((row) => row.displayName === "Trimix (Papaverine");
  if (!cut) throw new Error("The cut-off fixture listing is no longer in the dataset");
  return { default: { schemaVersion: 1, records: [{ offeringId: cut.id, displayName: "Trimix" }] } };
});

const viewer: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, normalizedEmail: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session",
  capabilities: new Set(["assisted_orders:submit"]),
};

describe("a reviewed heading in place of a generated display name", () => {
  const source = datasetRows().find((row) => row.displayName === CUT_OFF_NAME)!;
  const reader = new GeneratedMasterOfferingCatalogReader(resolve(DATASET));
  const offering = reader.readCatalog().find((entry) => entry.id === source.id)!;

  it("shows the reviewed heading", () => {
    expect(offering.displayName).toBe(REVIEWED_NAME);
  });

  it("keeps the old name searchable because the dataset lists every listing's own name as an alias", () => {
    // The reader adds no alias. If the dataset ever stops listing a display name among its own
    // aliases, a replaced heading would stop being searchable by its old words, and this fails.
    for (const row of datasetRows()) {
      expect((row as unknown as { aliases?: string[] }).aliases ?? [], row.id).toContain(row.displayName);
    }
    expect(offering.aliases).toContain(CUT_OFF_NAME);
  });

  it("changes nothing else about the listing: its address, canonical name and variant label are the dataset's", () => {
    expect(offering.slug).toBe(source.slug);
    expect(offering.canonicalName).toBe(source.canonicalName ?? source.displayName);
    expect(offering.variants.map((variant) => [variant.id, variant.label])).toEqual(
      source.variants.map((variant) => [variant.id, variant.label]));
    expect(reader.readBySlug(source.slug)?.id).toBe(source.id);
  });

  it("leaves every other listing's name as the dataset gives it", () => {
    const byId = new Map(datasetRows().map((row) => [row.id, row.displayName]));
    const changed = reader.readCatalog().filter((entry) => entry.displayName !== byId.get(entry.id));
    // The reviewed heading, and the held listing, whose record the hold itself rewrites elsewhere.
    expect(changed.map((entry) => entry.id)).toEqual([source.id]);
  });

  it("carries the reviewed heading into the request catalog, and a search for the old name still finds the row", async () => {
    const service = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
    const catalog = createRequestIntentCatalog({
      serviceFor: () => service, bindingFor: () => null, offeringVariantFor: () => null, catalogVersion: "synthetic",
    });
    const row = (await catalog.list(viewer, { search: REVIEWED_NAME, pageSize: 100 })).items
      .find((item) => item.sourceSelection?.variantId === source.variants[0].id);
    expect(row?.productName).toBe(REVIEWED_NAME);
    const found = await service.select({ q: CUT_OFF_NAME, page: 1, pageSize: 100 });
    expect(found.offerings.map((entry) => entry.id)).toContain(source.id);
  });
});

describe("the reviewed display-name file", () => {
  const good = { offeringId: "mo_0a", displayName: "A reviewed heading (with a note)" };

  it("accepts a well-formed record", () => {
    expect(readReviewedDisplayNames({ schemaVersion: 1, records: [good] }).get("mo_0a")).toBe(good.displayName);
  });
  it("refuses any other field, a blank or padded heading, an unbalanced bracket and an unknown id shape", () => {
    for (const bad of [
      { ...good, staffNote: "not in this file" },
      { ...good, displayName: "" },
      { ...good, displayName: " Padded" },
      { ...good, displayName: "Cut off (again" },
      { ...good, displayName: "Closed) before (open" },
      { ...good, offeringId: "GEN-GRP-0001" },
    ]) {
      expect(() => readReviewedDisplayNames({ schemaVersion: 1, records: [bad] })).toThrow("reviewed_display_name_invalid");
    }
  });
  it("refuses a repeated listing and an unknown schema version", () => {
    expect(() => readReviewedDisplayNames({ schemaVersion: 1, records: [good, good] })).toThrow("reviewed_display_name_duplicate");
    expect(() => readReviewedDisplayNames({ schemaVersion: 2, records: [good] })).toThrow("reviewed_display_names_invalid");
  });

  it("binds every real record to a listing whose name it actually changes", async () => {
    const real = (await vi.importActual<{ default: { schemaVersion: number; records: { offeringId: string; displayName: string }[] } }>(
      "./data/reviewed-display-names.json")).default;
    const names = readReviewedDisplayNames(real);
    const byId = new Map(datasetRows().map((row) => [row.id, row.displayName]));
    for (const [offeringId, displayName] of names) {
      expect(byId.has(offeringId), offeringId).toBe(true);
      expect(displayName, offeringId).not.toBe(byId.get(offeringId));
    }
    // The count is whatever the reviewed file holds; it is not pinned here.
    expect(names.size).toBe(real.records.length);
  });
});
