/**
 * The read the browser makes before it evaluates the adaptive discovery guide (KAN-60, S1).
 *
 * D0 decision A (KAN-225/14538): the server returns one read-only, viewer-scoped
 * snapshot, made of the published manifest, the exact catalog dataset identity and
 * the canonical facts for every variant this viewer can see. The browser runs
 * `evaluateDiscovery` itself. Answers never travel: this read has no request body or
 * query, and its response carries no answer field.
 *
 * Every fact is closed and minimal: identity, visibility, hold and reviewed pathways.
 * The response carries no price, quantity, copy, contact, account or other private
 * field. Anything the parser does not recognise turns the whole response into an
 * honest "unavailable", never into a guess, and the ordinary full catalog stays available.
 */
import {
  BINDING_PATHWAYS, type BindingPathway, type DiscoveryBinding, type DiscoveryCatalogFact, type DiscoveryManifest,
} from "./contract";
import { validateManifest } from "./validate-manifest";

export const DISCOVERY_READ_SCHEMA_VERSION = 1 as const;

/** The most facts one read may carry. Far above the real catalog; a larger snapshot refuses. */
export const DISCOVERY_READ_MAX_FACTS = 5_000;

/**
 * Why a read is unavailable. None of them is a statement about the visitor or a product.
 * - `manifest_unavailable`: no published manifest is configured. This is the production default.
 * - `manifest_invalid`: the configured manifest fails validation.
 * - `manifest_not_published`: the configured manifest's status is not "published".
 * - `dataset_unresolved`: a visible variant's exact dataset identity is unknown, or variants disagree on it.
 * - `dataset_mismatch`: the manifest is bound to a different dataset.
 * - `facts_unresolved`: a visible variant has no reviewed pathway classification. A pathway is never inferred.
 * - `facts_limit`: the snapshot would exceed DISCOVERY_READ_MAX_FACTS.
 * - `catalog_unavailable`: the viewer has no catalog, or the canonical catalog read failed.
 * - `response_invalid`: the browser received a response it could not parse strictly.
 */
export const DISCOVERY_READ_UNAVAILABLE_REASONS = [
  "manifest_unavailable", "manifest_invalid", "manifest_not_published", "dataset_unresolved",
  "dataset_mismatch", "facts_unresolved", "facts_limit", "catalog_unavailable", "response_invalid",
] as const;
export type DiscoveryReadUnavailableReason = typeof DISCOVERY_READ_UNAVAILABLE_REASONS[number];

export type DiscoveryReadUnavailable = Readonly<{
  schemaVersion: typeof DISCOVERY_READ_SCHEMA_VERSION;
  state: "unavailable";
  reason: DiscoveryReadUnavailableReason;
  fullCatalogAvailable: true;
}>;

export type DiscoveryReadAvailable = Readonly<{
  schemaVersion: typeof DISCOVERY_READ_SCHEMA_VERSION;
  state: "available";
  /** The published manifest, with its bindings narrowed to the variants in `facts`. */
  manifest: DiscoveryManifest;
  /** The exact dataset identity every fact came from. It equals manifest.catalogDatasetSha256. */
  catalogDatasetSha256: string;
  /** One fact per visible variant. Hidden variants are absent, never listed with visible=false. */
  facts: readonly DiscoveryCatalogFact[];
  fullCatalogAvailable: true;
}>;

export type DiscoveryReadResponse = DiscoveryReadUnavailable | DiscoveryReadAvailable;

/** The only keys a fact on this read may carry. `format` and `productType` are not served until a reviewed source exists. */
export const DISCOVERY_READ_FACT_KEYS = ["offeringId", "variantId", "visible", "held", "pathways"] as const;

export function discoveryReadUnavailable(reason: DiscoveryReadUnavailableReason): DiscoveryReadUnavailable {
  const response: DiscoveryReadUnavailable = { schemaVersion: DISCOVERY_READ_SCHEMA_VERSION, state: "unavailable", reason, fullCatalogAvailable: true };
  return Object.freeze(response);
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
};
const nonEmptyId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200;

/** A strict pathway list: known values only, no repeats. An empty list is an explicit "none". */
export function parseDiscoveryPathways(raw: unknown): readonly BindingPathway[] | null {
  if (!Array.isArray(raw) || raw.length > BINDING_PATHWAYS.length) return null;
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || !(BINDING_PATHWAYS as readonly string[]).includes(value) || seen.has(value)) return null;
    seen.add(value);
  }
  return Object.freeze([...raw]) as readonly BindingPathway[];
}

/** One served fact, exactly. A served fact is always visible. */
export function parseDiscoveryReadFact(raw: unknown): DiscoveryCatalogFact | null {
  if (!isRecord(raw) || !exactKeys(raw, DISCOVERY_READ_FACT_KEYS)) return null;
  if (!nonEmptyId(raw.offeringId) || !nonEmptyId(raw.variantId) || raw.visible !== true || typeof raw.held !== "boolean") return null;
  const pathways = parseDiscoveryPathways(raw.pathways);
  if (!pathways) return null;
  return Object.freeze({ offeringId: raw.offeringId, variantId: raw.variantId, visible: true, held: raw.held, pathways });
}

/**
 * The checks a server applies before serving a manifest, shared so the browser
 * re-applies exactly the same ones. Null means the manifest may be served against this dataset.
 */
export function discoveryManifestRefusal(manifest: DiscoveryManifest, catalogDatasetSha256: string):
  Extract<DiscoveryReadUnavailableReason, "manifest_invalid" | "manifest_not_published" | "dataset_mismatch"> | null {
  let valid = false;
  try { valid = validateManifest(manifest).ok; } catch { valid = false; }
  if (!valid) return "manifest_invalid";
  if (manifest.status !== "published") return "manifest_not_published";
  if (manifest.catalogDatasetSha256 !== catalogDatasetSha256) return "dataset_mismatch";
  return null;
}

/**
 * Parses a read response strictly. It never throws. Anything unexpected becomes
 * `response_invalid`, and a server-sent unavailable keeps its own known reason.
 */
export function parseDiscoveryReadResponse(raw: unknown): DiscoveryReadResponse {
  const invalid = discoveryReadUnavailable("response_invalid");
  if (!isRecord(raw) || raw.schemaVersion !== DISCOVERY_READ_SCHEMA_VERSION || raw.fullCatalogAvailable !== true) return invalid;
  if (raw.state === "unavailable") {
    if (!exactKeys(raw, ["schemaVersion", "state", "reason", "fullCatalogAvailable"])) return invalid;
    return typeof raw.reason === "string" && (DISCOVERY_READ_UNAVAILABLE_REASONS as readonly string[]).includes(raw.reason)
      ? discoveryReadUnavailable(raw.reason as DiscoveryReadUnavailableReason) : invalid;
  }
  if (raw.state !== "available" || !exactKeys(raw, ["schemaVersion", "state", "manifest", "catalogDatasetSha256", "facts", "fullCatalogAvailable"])) {
    return invalid;
  }
  if (typeof raw.catalogDatasetSha256 !== "string" || !SHA256_HEX.test(raw.catalogDatasetSha256)) return invalid;
  if (!Array.isArray(raw.facts) || raw.facts.length > DISCOVERY_READ_MAX_FACTS || !isRecord(raw.manifest)) return invalid;
  const facts: DiscoveryCatalogFact[] = [];
  const keys = new Set<string>();
  for (const entry of raw.facts) {
    const fact = parseDiscoveryReadFact(entry);
    if (!fact) return invalid;
    const key = `${fact.offeringId}\u0000${fact.variantId}`;
    if (keys.has(key)) return invalid;
    keys.add(key);
    facts.push(fact);
  }
  const manifest = raw.manifest as unknown as DiscoveryManifest;
  if (discoveryManifestRefusal(manifest, raw.catalogDatasetSha256) !== null) return invalid;
  // A served binding names only a served variant, so the browser never learns a hidden identity.
  // validateManifest passed above, so `bindings` is an array of checked records.
  if (manifest.bindings.some((binding: DiscoveryBinding) => !keys.has(`${binding.offeringId}\u0000${binding.variantId}`))) return invalid;
  const response: DiscoveryReadAvailable = {
    schemaVersion: DISCOVERY_READ_SCHEMA_VERSION, state: "available", manifest,
    catalogDatasetSha256: raw.catalogDatasetSha256, facts: Object.freeze(facts), fullCatalogAvailable: true,
  };
  return Object.freeze(response);
}
