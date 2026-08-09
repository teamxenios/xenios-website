import {
  CATALOG_FORBIDDEN_PUBLIC_KEYS,
  type CatalogLiveCommerceState,
  type CatalogRoadmapStage,
  type EarlyAccessAddToCartAuthority,
} from "@shared/research/early-access-hardening";
import {
  PEPTIDE_ROADMAP_DISPLAY_STATUSES,
  type PeptideRoadmapCard,
  type PeptideRoadmapDisplayStatus,
} from "@shared/research/early-access-roadmap";
import type { EarlyAccessStorefrontUnit } from "../release/storefront-view";
import {
  PEPTIDE_ROADMAP_ROWS,
  type PeptideRoadmapSourceAvailability,
  type PeptideRoadmapSourceRow,
} from "./peptide-roadmap-data";

export type PeptideRoadmapThisWeekOverride = Readonly<{
  catalogId: string;
  stage: "this_week";
  availableOn: string;
  ownerActor: string;
  evidenceRef: string;
  version: number;
  recordedAt: string;
}>;

export type PeptideRoadmapMappingState = "exact" | "unmapped" | "ambiguous";

export type PeptideRoadmapMappingRow = Readonly<{
  catalogId: string;
  declaredLiveSku: string | null;
  state: PeptideRoadmapMappingState;
  productId: string | null;
  variantId: string | null;
}>;

export type PeptideRoadmapMappingReport = Readonly<{
  roadmapVariants: number;
  exact: number;
  unmapped: number;
  ambiguous: number;
  aminoPlanningVariants: number;
  aminoExact: number;
  rows: readonly PeptideRoadmapMappingRow[];
}>;

export type PeptideRoadmapProjection = Readonly<{
  evaluatedAt: string;
  cards: readonly PeptideRoadmapCard[];
  counts: Readonly<Record<PeptideRoadmapDisplayStatus, number>>;
  mapping: Readonly<{
    exact: number;
    unmapped: number;
    ambiguous: number;
  }>;
}>;

export class PeptideRoadmapOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeptideRoadmapOverrideError";
  }
}

type IndexedLiveUnit = Readonly<{
  state: PeptideRoadmapMappingState;
  unit: EarlyAccessStorefrontUnit | null;
}>;

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validIsoInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function validDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function mondayUtc(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return start - mondayOffset * 86_400_000;
}

export function validateThisWeekOverrides(input: {
  overrides?: readonly unknown[];
  rows?: readonly PeptideRoadmapSourceRow[];
  now?: Date;
}): ReadonlyMap<string, PeptideRoadmapThisWeekOverride> {
  const rows = input.rows ?? PEPTIDE_ROADMAP_ROWS;
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new PeptideRoadmapOverrideError("now must be a valid instant");
  }

  const known = new Set(rows.map((row) => row.catalogId));
  const accepted = new Map<string, PeptideRoadmapThisWeekOverride>();
  const today = now.toISOString().slice(0, 10);
  const weekStart = mondayUtc(now);
  const weekEnd = weekStart + 7 * 86_400_000;

  for (const candidate of input.overrides ?? []) {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new PeptideRoadmapOverrideError("this-week override must be an object");
    }
    const value = candidate as Record<string, unknown>;
    if (!nonBlank(value.catalogId) || !known.has(value.catalogId)) {
      throw new PeptideRoadmapOverrideError("this-week override names an unknown catalogId");
    }
    if (accepted.has(value.catalogId)) {
      throw new PeptideRoadmapOverrideError(`duplicate this-week override for ${value.catalogId}`);
    }
    if (value.stage !== "this_week") {
      throw new PeptideRoadmapOverrideError(`${value.catalogId} override stage must be this_week`);
    }
    if (!validDateOnly(value.availableOn)) {
      throw new PeptideRoadmapOverrideError(`${value.catalogId} requires an exact availableOn date`);
    }
    const availableAt = Date.parse(`${value.availableOn}T00:00:00.000Z`);
    if (value.availableOn <= today || availableAt < weekStart || availableAt >= weekEnd) {
      throw new PeptideRoadmapOverrideError(
        `${value.catalogId} availableOn must be a future date in the current UTC week`,
      );
    }
    if (!nonBlank(value.ownerActor)) {
      throw new PeptideRoadmapOverrideError(`${value.catalogId} requires ownerActor`);
    }
    if (!nonBlank(value.evidenceRef)) {
      throw new PeptideRoadmapOverrideError(`${value.catalogId} requires evidenceRef`);
    }
    if (!Number.isSafeInteger(value.version) || (value.version as number) <= 0) {
      throw new PeptideRoadmapOverrideError(`${value.catalogId} requires a positive version`);
    }
    if (!validIsoInstant(value.recordedAt)) {
      throw new PeptideRoadmapOverrideError(`${value.catalogId} requires an ISO UTC recordedAt`);
    }

    accepted.set(
      value.catalogId,
      Object.freeze({
        catalogId: value.catalogId,
        stage: "this_week",
        availableOn: value.availableOn,
        ownerActor: value.ownerActor.trim(),
        evidenceRef: value.evidenceRef.trim(),
        version: value.version as number,
        recordedAt: value.recordedAt,
      }),
    );
  }

  return accepted;
}

function indexLiveUnits(units: readonly EarlyAccessStorefrontUnit[]): ReadonlyMap<string, IndexedLiveUnit> {
  const grouped = new Map<string, EarlyAccessStorefrontUnit[]>();
  for (const unit of units) {
    const entries = grouped.get(unit.sku) ?? [];
    entries.push(unit);
    grouped.set(unit.sku, entries);
  }

  const indexed = new Map<string, IndexedLiveUnit>();
  for (const [sku, entries] of Array.from(grouped.entries())) {
    indexed.set(
      sku,
      entries.length === 1
        ? Object.freeze({ state: "exact", unit: entries[0] })
        : Object.freeze({ state: "ambiguous", unit: null }),
    );
  }
  return indexed;
}

function joinForRow(
  row: PeptideRoadmapSourceRow,
  live: ReadonlyMap<string, IndexedLiveUnit>,
): IndexedLiveUnit {
  if (row.liveSku === null) return Object.freeze({ state: "unmapped", unit: null });
  return live.get(row.liveSku) ?? Object.freeze({ state: "unmapped", unit: null });
}

function addAuthority(unit: EarlyAccessStorefrontUnit | null): EarlyAccessAddToCartAuthority | null {
  if (
    unit === null ||
    unit.purchasable !== true ||
    unit.state !== "purchasable" ||
    unit.availability !== "AVAILABLE" ||
    !nonBlank(unit.productId) ||
    !nonBlank(unit.variantId) ||
    !Number.isSafeInteger(unit.priceCents) ||
    (unit.priceCents as number) <= 0 ||
    unit.currency !== "USD"
  ) {
    return null;
  }
  return Object.freeze({
    productId: unit.productId,
    variantId: unit.variantId,
    unitPriceCents: unit.priceCents as number,
    currency: "USD",
  });
}

function liveCommerce(
  unit: EarlyAccessStorefrontUnit | null,
  authority: EarlyAccessAddToCartAuthority | null,
): CatalogLiveCommerceState {
  if (authority !== null) return "purchasable";
  if (unit === null) return "unavailable";
  if (unit.state === "request_access") return "request_access";
  if (unit.state === "held" || unit.availability === "TEMPORARILY_HELD") return "held";
  return "unavailable";
}

function sourceDisplayStatus(
  availability: PeptideRoadmapSourceAvailability,
): PeptideRoadmapDisplayStatus {
  switch (availability) {
    case "Approval required":
      return "approval_required";
    case "Request access":
    case "Research approval or request access":
      return "request_access";
    case "Planning / supplier quote needed":
      return "planned";
    case "Care only / Research unavailable":
      return "care_pathway_only";
    case "Research hold / Care evaluation required":
      return "temporarily_unavailable";
    case "Unavailable":
      return "unavailable";
  }
}

function displayStatus(input: {
  row: PeptideRoadmapSourceRow;
  unit: EarlyAccessStorefrontUnit | null;
  authority: EarlyAccessAddToCartAuthority | null;
  hasThisWeekOverride: boolean;
}): PeptideRoadmapDisplayStatus {
  if (input.authority !== null) return "available_now";
  if (
    input.unit !== null &&
    (input.unit.state === "held" || input.unit.availability === "TEMPORARILY_HELD")
  ) {
    return "temporarily_unavailable";
  }
  if (input.hasThisWeekOverride) return "available_this_week";
  return sourceDisplayStatus(input.row.sourceAvailability);
}

function roadmapStage(
  row: PeptideRoadmapSourceRow,
  hasThisWeekOverride: boolean,
): CatalogRoadmapStage {
  if (hasThisWeekOverride) return "this_week";
  return row.sourceAvailability === "Planning / supplier quote needed"
    ? "planned"
    : "coming_soon";
}

function priceDisplay(authority: EarlyAccessAddToCartAuthority | null): string | null {
  if (authority === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: authority.currency,
  }).format(authority.unitPriceCents / 100);
}

export function buildPeptideRoadmapMappingReport(input: {
  rows?: readonly PeptideRoadmapSourceRow[];
  liveUnits: readonly EarlyAccessStorefrontUnit[];
}): PeptideRoadmapMappingReport {
  const rows = input.rows ?? PEPTIDE_ROADMAP_ROWS;
  const live = indexLiveUnits(input.liveUnits);
  const reportRows = rows.map((row): PeptideRoadmapMappingRow => {
    const joined = joinForRow(row, live);
    return Object.freeze({
      catalogId: row.catalogId,
      declaredLiveSku: row.liveSku,
      state: joined.state,
      productId: joined.unit?.productId ?? null,
      variantId: joined.unit?.variantId ?? null,
    });
  });
  const aminoRows = rows.filter((row) => row.catalogId.startsWith("XAC-"));
  const aminoExact = reportRows.filter(
    (row) => row.catalogId.startsWith("XAC-") && row.state === "exact",
  ).length;
  return Object.freeze({
    roadmapVariants: rows.length,
    exact: reportRows.filter((row) => row.state === "exact").length,
    unmapped: reportRows.filter((row) => row.state === "unmapped").length,
    ambiguous: reportRows.filter((row) => row.state === "ambiguous").length,
    aminoPlanningVariants: aminoRows.filter((row) => row.sourceAvailability === "Planning / supplier quote needed").length,
    aminoExact,
    rows: Object.freeze(reportRows),
  });
}

export function buildPeptideRoadmapProjection(input: {
  rows?: readonly PeptideRoadmapSourceRow[];
  liveUnits: readonly EarlyAccessStorefrontUnit[];
  overrides?: readonly unknown[];
  now?: Date;
}): PeptideRoadmapProjection {
  const rows = input.rows ?? PEPTIDE_ROADMAP_ROWS;
  const now = input.now ?? new Date();
  const overrides = validateThisWeekOverrides({
    overrides: input.overrides,
    rows,
    now,
  });
  const live = indexLiveUnits(input.liveUnits);
  const cards = rows.map((row): PeptideRoadmapCard => {
    const joined = joinForRow(row, live);
    const unit = joined.unit;
    const authority = joined.state === "exact" ? addAuthority(unit) : null;
    const hasThisWeekOverride = overrides.has(row.catalogId);
    return Object.freeze({
      catalogId: row.catalogId,
      displayName: row.displayName,
      strength: row.strength,
      family: row.family,
      format: row.format,
      roadmapStage: roadmapStage(row, hasThisWeekOverride),
      liveCommerce: liveCommerce(unit, authority),
      displayStatus: displayStatus({ row, unit, authority, hasThisWeekOverride }),
      addToCart: authority,
      priceDisplay: priceDisplay(authority),
    });
  });
  const counts = Object.fromEntries(
    PEPTIDE_ROADMAP_DISPLAY_STATUSES.map((status) => [
      status,
      cards.filter((card) => card.displayStatus === status).length,
    ]),
  ) as Record<PeptideRoadmapDisplayStatus, number>;
  const report = buildPeptideRoadmapMappingReport({ rows, liveUnits: input.liveUnits });

  return Object.freeze({
    evaluatedAt: now.toISOString(),
    cards: Object.freeze(cards),
    counts: Object.freeze(counts),
    mapping: Object.freeze({
      exact: report.exact,
      unmapped: report.unmapped,
      ambiguous: report.ambiguous,
    }),
  });
}

export function publicRoadmapPayloadIsClean(value: unknown): boolean {
  const forbidden = new Set<string>(CATALOG_FORBIDDEN_PUBLIC_KEYS);
  const seen = new Set<unknown>();
  const walk = (node: unknown): boolean => {
    if (node === null || typeof node !== "object") return true;
    if (seen.has(node)) return true;
    seen.add(node);
    if (Array.isArray(node)) return node.every(walk);
    for (const key of Object.keys(node)) {
      if (forbidden.has(key)) return false;
      if (!walk((node as Record<string, unknown>)[key])) return false;
    }
    return true;
  };
  return walk(value);
}
