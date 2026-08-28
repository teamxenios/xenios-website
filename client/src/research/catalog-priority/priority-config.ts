import type { ProductActivationStatus } from "@shared/research/product-activation/contract";

export const CATALOG_PRIORITY_LANES = [
  "Research",
  "Provider / Care",
  "Blends",
  "Capsules / Oral / Nasal / Topical",
  "Diagnostics / Services",
  "Request-only / Pending activation",
] as const;

export type CatalogPriorityLane = (typeof CATALOG_PRIORITY_LANES)[number];

export type PriorityCatalogDefinition = Readonly<{
  key: string;
  title: string;
  formulation: string | null;
  lanes: readonly CatalogPriorityLane[];
}>;

export type PriorityCatalogItem = PriorityCatalogDefinition & Readonly<{
  activationStatus: ProductActivationStatus;
  detailsPath: string | null;
  actionPath: string | null;
}>;

/**
 * Demand-priority definitions only. Availability is intentionally absent:
 * the activation overlay must supply it, and a missing status fails closed.
 * No counts or source-person identifiers belong in this browser artifact.
 */
export const CURRENT_CLIENT_DEMAND_DEFINITIONS: readonly PriorityCatalogDefinition[] = [
  { key: "bpc157-tb500-15-15", title: "BPC-157 + TB-500", formulation: "15mg / 15mg total strength", lanes: ["Research", "Blends"] },
  { key: "aod-motsc-tesa-ipa", title: "AOD-9604 + MOTS-C + Tesamorelin + Ipamorelin", formulation: null, lanes: ["Provider / Care", "Blends"] },
  { key: "melanotan-2", title: "Melanotan-2", formulation: null, lanes: ["Research", "Provider / Care"] },
  { key: "retatrutide", title: "Retatrutide", formulation: "Exact strength shown only when catalog-authorized", lanes: ["Research", "Provider / Care"] },
  { key: "ta1-kpv-ll37", title: "Thymosin Alpha-1 + KPV + LL-37", formulation: null, lanes: ["Research", "Blends"] },
  { key: "cjc1295-ipamorelin", title: "CJC-1295 + Ipamorelin", formulation: null, lanes: ["Research", "Provider / Care", "Blends"] },
  { key: "igf1-lr3", title: "IGF-1 LR3", formulation: null, lanes: ["Research", "Provider / Care"] },
  { key: "dsip", title: "DSIP", formulation: null, lanes: ["Research", "Provider / Care"] },
  { key: "nad-plus", title: "NAD+", formulation: "Formats remain distinct", lanes: ["Research", "Provider / Care", "Capsules / Oral / Nasal / Topical"] },
] as const;

/**
 * Exact-variant placeholders requested for verification. They cannot be live
 * by construction; an integrator replaces these projections only after the
 * authoritative activation overlay provides documented status.
 */
export const PENDING_VARIANT_PLACEHOLDERS: readonly PriorityCatalogItem[] = [
  ["retatrutide-48mg", "Retatrutide 48mg", ["Research"]],
  ["provider-retatrutide", "Provider / Care Retatrutide variants", ["Provider / Care"]],
  ["tesa-ipa-motsc", "Tesamorelin + Ipamorelin + MOTS-C", ["Provider / Care", "Blends"]],
  ["bpc-tb-mgf", "BPC-157 + TB-500 + MGF", ["Blends"]],
  ["igf-motsc", "IGF-1 LR3 + MOTS-C", ["Blends"]],
  ["ghk-epithalon-motsc", "GHK-Cu + Epithalon + MOTS-C", ["Blends"]],
  ["cjc-ipa-igf", "CJC-1295 + Ipamorelin + IGF-1 LR3", ["Blends"]],
  ["cjc-ipa-aod", "CJC-1295 + Ipamorelin + AOD-9604", ["Blends"]],
  ["semax-selank-5-5", "Semax + Selank 5mg / 5mg", ["Blends", "Capsules / Oral / Nasal / Topical"]],
  ["bpc-capsules", "BPC-157 500mcg capsules, 100 count", ["Capsules / Oral / Nasal / Topical"]],
  ["hormone-evaluation-labs", "Initial hormone evaluation labs", ["Diagnostics / Services"]],
  ["exosomes-1oz", "Exosomes 1oz exact item", ["Capsules / Oral / Nasal / Topical"]],
  ["revive-glutathione-10ml", "Revive Glutathione 10mL exact mapping", ["Research"]],
].map(([key, title, lanes]) => ({
  key: key as string,
  title: title as string,
  formulation: "Exact documentation required",
  lanes: [...(lanes as readonly CatalogPriorityLane[]), "Request-only / Pending activation"],
  activationStatus: "pending_pharmacy_activation" as const,
  detailsPath: null,
  actionPath: "/research/account/support",
}));

export function projectDemandDefinitions(
  statuses: Readonly<Record<string, ProductActivationStatus | undefined>>,
): readonly PriorityCatalogItem[] {
  return CURRENT_CLIENT_DEMAND_DEFINITIONS.map((definition) => ({
    ...definition,
    activationStatus: statuses[definition.key] ?? "unavailable",
    detailsPath: null,
    actionPath: null,
  }));
}

/**
 * The audited activation queue, served by the customer-account API with
 * statuses only. Each item carries the overlay's own resolved status verbatim
 * — never loosened here — so a verbal confirmation renders as documentation
 * pending and a basis-less item renders unavailable. Nothing in this
 * projection is orderable; the only action is the availability list.
 */
export function projectActivationQueue(
  queue: readonly Readonly<{ key: string; title: string; status: ProductActivationStatus }>[],
): readonly PriorityCatalogItem[] {
  return queue.map((item) => ({
    key: item.key,
    title: item.title,
    formulation: "Exact documentation required",
    lanes: ["Request-only / Pending activation"],
    activationStatus: item.status,
    detailsPath: null,
    actionPath: "/research/account/support",
  }));
}
