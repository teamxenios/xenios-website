/**
 * Fixtures for the Launch A server tests.
 *
 * Small and explicit. The real committed artifact is exercised directly in
 * real-catalog.test.ts, because a fixture can only prove the code does what the
 * code says, never that the catalog is the catalog.
 */

import type {
  KrisChannel,
  KrisFamily,
  KrisPriceView,
} from "@shared/research/kris-launch-a/contract";
import type { KrisProductRecord } from "./dataset-reader";

let counter = 0;

export function krisProduct(
  overrides: Partial<KrisProductRecord> = {},
): KrisProductRecord {
  counter += 1;
  const id = overrides.id ?? `kli_fixture${String(counter).padStart(14, "0")}`;
  return {
    id,
    slug: overrides.slug ?? `research-peptides-and-materials-fixture-${counter}`,
    displayName: overrides.displayName ?? `Fixture Product ${counter}`,
    specification: overrides.specification ?? `FIXTURE ${counter} 5MG`,
    family: (overrides.family ?? "research_peptides_and_materials") as KrisFamily,
    channel: (overrides.channel ?? "ruo_research") as KrisChannel,
    format: overrides.format ?? "Vial / Lyophilized",
    packBasis: overrides.packBasis ?? "Per listed unit",
    moq: overrides.moq === undefined ? 1 : overrides.moq,
    dosageForm: overrides.dosageForm === undefined ? "Vial" : overrides.dosageForm,
    suppliedNote:
      overrides.suppliedNote ??
      "Research use only; subject to availability and documentation.",
  };
}

export function pricedAt(amountCents: number, basis = "Per listed unit"): KrisPriceView {
  return {
    state: "priced",
    amountCents,
    currency: "USD",
    display: `$${(amountCents / 100).toFixed(2)}`,
    basis,
  };
}

/** A minimal well-formed raw artifact, for the reader's refusal tests. */
export function rawArtifact(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-13T21:47:34.813Z",
    sources: {
      masterCatalog: { filename: "master.xlsx", sha256: "a".repeat(64) },
      krisPricing: { filename: "kris.xlsx", sha256: "b".repeat(64) },
    },
    counts: { items: 2, priced: 1, pricePending: 1 },
    invariants: {
      containsSupplierIdentity: false,
      containsBuyCost: false,
      containsMargin: false,
      containsSavings: false,
      containsInternalSourcingNotes: false,
      containsSuggestedSellPrice: false,
      itemCanBecomePurchasable: false,
    },
    priceProfiles: ["KRIS_VOLUME_PARTNER"],
    products: [
      {
        id: "kli_one",
        slug: "research-capsules-alpha",
        displayName: "Alpha",
        specification: "ALPHA 5MG",
        family: "research_capsules",
        familyLabel: "Research Capsules",
        channel: "ruo_research",
        channelLabel: "RUO Research",
        format: "Capsule",
        packBasis: "Per listed unit",
        moq: 1,
        dosageForm: "Capsule",
        suppliedNote: "Research use only; subject to availability and documentation.",
      },
      {
        id: "kli_two",
        slug: "shipping-and-fulfillment-beta",
        displayName: "Beta",
        specification: "BETA",
        family: "shipping_and_fulfillment",
        familyLabel: "Shipping & Fulfillment",
        channel: "clinical_provider_only",
        channelLabel: "Clinical / Provider Only",
        format: "Supply",
        packBasis: "Per listed unit",
        moq: 1,
        dosageForm: null,
        suppliedNote: "Price pending.",
      },
    ],
    priceOverlays: {
      KRIS_VOLUME_PARTNER: {
        kli_one: {
          state: "priced",
          amountCents: 8800,
          currency: "USD",
          display: "$88.00",
          basis: "Per listed unit",
        },
        kli_two: { state: "pending" },
      },
    },
    ...overrides,
  };
}
