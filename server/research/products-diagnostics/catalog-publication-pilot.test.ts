import express from "express";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBindingIndex, MASTER_OFFERING_COMMITTED_BINDINGS_PATH } from "../master-offerings/production-bindings";
import { createMasterOfferingCatalogReaderFromEnv } from "../master-offerings/dataset-reader";
import { isPublishableSupplement } from "../master-offerings/catalog-publication-eligibility";
import { normalizeHeldSpecification } from "../../../shared/research/master-offerings/formulation-hold";
import { mountConfiguredCatalogPublication } from "./catalog-publication-pilot";

const selected = {
  offeringId: "mo_b126ee9235f0a810dc95", offeringVariantId: "mov_9813dabbc127f6b382fb",
  productId: "ac558e51-c071-4faa-b6bf-8ad393f9e530", variantId: "4366f43e-aacc-4957-bfe3-6f789d9e621d",
};
const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function setup(env: NodeJS.ProcessEnv, dbAvailable = true) {
  const rpc = vi.fn(async () => ({ data: { generation: 0, revision: null }, error: null }));
  const getDatabase = vi.fn(() => dbAvailable ? { rpc } as unknown as SupabaseClient : null);
  const reportUnavailable = vi.fn();
  const pilot = mountConfiguredCatalogPublication(express(), {
    env, getDatabase, mediaBucket: "fixture-private", reportUnavailable,
    requireAdmin: (_req, res) => res.status(403).end(),
  });
  return { pilot, rpc, getDatabase, reportUnavailable };
}

it("leaves all pilot routes disabled when no identity is selected", () => {
  const f = setup({});
  expect(f.pilot).toBeUndefined();
  expect(f.getDatabase).not.toHaveBeenCalled();
  expect(f.reportUnavailable).not.toHaveBeenCalled();
});
it.each(["undefined", "null", "{}", JSON.stringify({ ...selected, actor: "operator" }),
  JSON.stringify({ ...selected, variantId: selected.offeringVariantId })])("refuses a malformed server selection", raw => {
  const f = setup({ XENIOS_CATALOG_PUBLICATION_PILOT: raw });
  expect(f.pilot).toBeUndefined();
  expect(f.getDatabase).not.toHaveBeenCalled();
  expect(f.reportUnavailable).toHaveBeenCalledOnce();
});
it("requires an available Product Control database before mounting", () => {
  const f = setup({ XENIOS_CATALOG_PUBLICATION_PILOT: JSON.stringify(selected) }, false);
  expect(f.pilot).toBeUndefined();
  expect(f.reportUnavailable).toHaveBeenCalledOnce();
});
it("checks the actual reviewed supplement and revalidates its exact binding on each read", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "publication-bindings-")); folders.push(folder);
  const bindingFile = path.join(folder, "bindings.json");
  writeFileSync(bindingFile, readFileSync(MASTER_OFFERING_COMMITTED_BINDINGS_PATH));
  const f = setup({ XENIOS_CATALOG_PUBLICATION_PILOT: JSON.stringify(selected), XENIOS_MASTER_OFFERING_BINDINGS: bindingFile });
  expect(f.pilot?.selected).toEqual(selected);
  expect(await f.pilot!.readPublishedRevision(selected)).toBeNull();
  expect(f.rpc).toHaveBeenCalledWith("research_catalog_publication_current", { p_identity: selected });
  f.rpc.mockClear();
  writeFileSync(bindingFile, JSON.stringify({ schemaVersion: 1, boundCount: 0, bindings: [] }));
  expect(await f.pilot!.readPublishedRevision(selected)).toBeNull();
  expect(f.rpc).not.toHaveBeenCalled();
});
it("rejects an unreviewed dataset even when its IDs and content parse identically", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "publication-dataset-")); folders.push(folder);
  const dataset = path.join(folder, "alternate.json");
  writeFileSync(dataset, readFileSync("server/research/master-offerings/data/member-safe-master-offerings.generated.json", "utf8") + "\n");
  const f = setup({ XENIOS_CATALOG_PUBLICATION_PILOT: JSON.stringify(selected), XENIOS_MASTER_OFFERINGS_DATASET: dataset });
  expect(await f.pilot!.readPublishedRevision(selected)).toBeNull();
  expect(f.rpc).not.toHaveBeenCalled();
});
it("withholds a reviewed supplement when its exact specification carries a hold", () => {
  const catalog = createMasterOfferingCatalogReaderFromEnv({})!.readCatalog();
  const offering = catalog.find(o => o.id === selected.offeringId)!;
  const variant = offering.variants.find(v => v.id === selected.offeringVariantId)!;
  expect(isPublishableSupplement(offering, variant)).toBe(true);
  expect(isPublishableSupplement(offering, variant, new Set([normalizeHeldSpecification(variant.label)]))).toBe(false);
});
it.each(["research_peptides_materials", "clinical_formulations_503a"])("refuses the mapped %s family at the server", async family => {
  const { index } = loadBindingIndex({env: {}});
  const catalog = createMasterOfferingCatalogReaderFromEnv({})!.readCatalog();
  const offering = catalog.find(o => o.family === family && o.variants.some(v => index.has(o.id + "|" + v.id)))!;
  const variant = offering.variants.find(v => index.has(offering.id + "|" + v.id))!;
  const subject = { ...index.get(offering.id + "|" + variant.id)!, offeringId: offering.id };
  const f = setup({ XENIOS_CATALOG_PUBLICATION_PILOT: JSON.stringify(subject) });
  expect(f.pilot!.selected).toEqual(subject);
  expect(await f.pilot!.readPublishedRevision(subject)).toBeNull();
  expect(f.rpc).not.toHaveBeenCalled();
});
