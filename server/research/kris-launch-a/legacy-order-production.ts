/**
 * The production Buy Now handoff: the ONE place a Kris row acquires an exact
 * Product Control selection, resolved from the same sources the legacy order
 * door itself consults.
 *
 * WHY THIS FILE EXISTS
 *
 * `projectKrisItem` renders Buy Now only when a `KrisLegacyOrderResolver`
 * returns an exact, current Product Control selection, and the composition
 * root injected none, so every direct_eligible row failed closed to Pending
 * Activation. This module is the missing resolver. It never invents identity:
 * the association between a Kris artifact row (`kli_*`) and a canonical
 * Product Control unit (productId + variantId) is EXPLICIT REVIEWED DATA
 * (`data/kris-legacy-bindings.json`, or the `XENIOS_KRIS_LEGACY_BINDINGS`
 * environment value set alongside the launch configuration), and every
 * economic fact on the selection is read live from the door's own read models:
 *
 *   - the Early Access catalog projection, loaded under the SAME customer
 *     audience the order door will project for this member, so the two can
 *     never disagree about what this customer may see;
 *   - the founder release ledger through `decideEarlyAccessRelease`, the only
 *     thing that may price an Early Access unit at all.
 *
 * FAIL-CLOSED EVERYWHERE. No bindings, an unparseable environment value, a
 * member with no Early Access customer, an unbound row, an ambiguous row, a
 * held unit, or any price/currency disagreement each yield "no Buy Now",
 * never a guess. The order door then revalidates everything again at
 * placement, so this resolver can only ever offer what the door would accept.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "@shared/research/early-access-quantity";
import type { KrisLegacyOrderSelection } from "@shared/research/kris-launch-a/contract";
import { decideEarlyAccessRelease, type EarlyAccessRelease } from "../early-access/release/founder-release";
import type { EarlyAccessCatalogRow } from "../early-access/catalog/early-access-catalog";
import { isSafeIdentifier } from "../early-access/commerce/input-guards";
import {
  resolveBuyerSheet,
  type BuyerScopedPricing,
} from "../early-access/commerce/buyer-scoped-pricing";
import type { KrisLegacyOrderResolver } from "./projection";
import type { KrisCatalogViewer } from "./routes";

/** One reviewed association. Identity only; never a price, never a quantity. */
export interface KrisLegacyBindingRecord {
  readonly krisId: string;
  readonly productId: string;
  readonly variantId: string;
}

const KRIS_ID = /^kli_[a-z0-9]{8,40}$/;

export class KrisLegacyBindingError extends Error {}

function parseBindingList(value: unknown, source: string): readonly KrisLegacyBindingRecord[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && Array.isArray((value as { bindings?: unknown }).bindings)
      ? ((value as { bindings: unknown[] }).bindings)
      : null;
  if (list === null) {
    throw new KrisLegacyBindingError(`${source}: bindings must be an array or {bindings: []}`);
  }
  const seenKris = new Set<string>();
  const seenUnit = new Set<string>();
  const out: KrisLegacyBindingRecord[] = [];
  for (const entry of list) {
    const record = entry as Partial<KrisLegacyBindingRecord> | null;
    const krisId = record?.krisId;
    const productId = record?.productId;
    const variantId = record?.variantId;
    if (
      typeof krisId !== "string" ||
      !KRIS_ID.test(krisId) ||
      !isSafeIdentifier(productId) ||
      !isSafeIdentifier(variantId)
    ) {
      throw new KrisLegacyBindingError(`${source}: malformed binding record`);
    }
    const unit = `${productId}::${variantId}`;
    // One Kris row is one unit and one unit is one Kris row. A duplicate on
    // either side is a review failure, not something to resolve silently.
    if (seenKris.has(krisId) || seenUnit.has(unit)) {
      throw new KrisLegacyBindingError(`${source}: duplicate binding for ${krisId} or ${unit}`);
    }
    seenKris.add(krisId);
    seenUnit.add(unit);
    out.push(Object.freeze({ krisId, productId, variantId }));
  }
  return Object.freeze(out);
}

export const KRIS_LEGACY_BINDINGS_ENV = "XENIOS_KRIS_LEGACY_BINDINGS";

/**
 * The committed bindings, repo relative and resolved exactly the way
 * dataset-location.ts resolves the catalog artifact: from the working
 * directory with a bounded parent walk, because the server bundles to a single
 * dist/index.cjs and __dirname stops meaning this directory after bundling.
 */
export const KRIS_LEGACY_BINDINGS_COMMITTED_PATH = path.posix.join(
  "server",
  "research",
  "kris-launch-a",
  "data",
  "kris-legacy-bindings.json",
);

const MAX_PARENT_WALK = 3;

function committedBindingsFile(cwd: string): string | null {
  let directory = cwd;
  for (let step = 0; step <= MAX_PARENT_WALK; step += 1) {
    const candidate = path.resolve(directory, KRIS_LEGACY_BINDINGS_COMMITTED_PATH);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

/**
 * Load the reviewed bindings. The environment value, when present and valid,
 * REPLACES the committed file (it is the post-freeze channel for founder-
 * approved additions). A malformed environment value is logged and ignored so
 * a typo can narrow the offer back to the committed set but can never take
 * the catalog down or offer anything unreviewed; the launch smoke asserts the
 * expected Buy Now rows, so a swallowed value cannot pass unnoticed.
 */
export function loadKrisLegacyBindings(
  env: NodeJS.ProcessEnv = process.env,
  options: { readonly committedPath?: string; readonly warn?: (message: string) => void } = {},
): readonly KrisLegacyBindingRecord[] {
  const warn = options.warn ?? ((message) => console.warn(`[kris-legacy-bindings] ${message}`));
  const raw = env[KRIS_LEGACY_BINDINGS_ENV];
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      return parseBindingList(JSON.parse(raw), KRIS_LEGACY_BINDINGS_ENV);
    } catch (error) {
      warn(
        `${KRIS_LEGACY_BINDINGS_ENV} is set but unusable (${error instanceof Error ? error.message : "unparseable"}); falling back to the committed bindings`,
      );
    }
  }
  const filePath = options.committedPath ?? committedBindingsFile(process.cwd());
  if (filePath === null) {
    warn("committed bindings file not found; Buy Now stays closed");
    return Object.freeze([]);
  }
  try {
    return parseBindingList(
      JSON.parse(readFileSync(filePath, "utf8")),
      KRIS_LEGACY_BINDINGS_COMMITTED_PATH,
    );
  } catch (error) {
    if (error instanceof KrisLegacyBindingError) throw error;
    warn(`committed bindings unreadable (${error instanceof Error ? error.message : "unknown"}); Buy Now stays closed`);
    return Object.freeze([]);
  }
}

/** The door's catalog, structurally. The real source satisfies this exactly. */
export interface KrisDoorCatalogSource {
  load(
    now: Date,
    context?: { readonly earlyAccessCustomer?: { readonly customerRef: string } | null },
  ): Promise<{ readonly rows: readonly EarlyAccessCatalogRow[] }>;
}

export interface KrisDoorReleaseLedger {
  all(): Promise<readonly EarlyAccessRelease[]>;
}

export interface KrisMemberCustomerDirectory {
  customerRefsFor(memberId: string): Promise<readonly string[]>;
}

export interface KrisLegacyOrderResolutionDeps {
  readonly catalog: KrisDoorCatalogSource;
  readonly releases: KrisDoorReleaseLedger;
  readonly customers: KrisMemberCustomerDirectory;
  readonly bindings: readonly KrisLegacyBindingRecord[];
  /**
   * The SAME buyer-scoped pricing seam the order door consults. When present
   * and the viewer's customer resolves an entitled sheet, the offered price
   * is the buyer's authorized amount rather than the ledger amount, so the
   * shelf and the door cannot disagree. Absent or failing, the ledger price
   * is offered, and `safeLegacyOrder` closes Buy Now on any mismatch with
   * the rendered partner price exactly as before.
   */
  readonly buyerScopedPrices?: BuyerScopedPricing;
  readonly now?: () => number;
}

/**
 * Build the per-request resolver for one entitled viewer, or undefined when
 * nothing may be offered. The build reads the door's sources ONCE, so every
 * row in one response is priced against one consistent instant, and the
 * returned resolver is synchronous exactly as the projection requires.
 */
export async function buildKrisLegacyOrderResolver(
  deps: KrisLegacyOrderResolutionDeps,
  viewer: Pick<KrisCatalogViewer, "memberId">,
): Promise<KrisLegacyOrderResolver | undefined> {
  if (deps.bindings.length === 0) return undefined;

  // The member's Early Access customer, through the same M62 binding order
  // recovery uses. No customer means the order door could not serve this
  // member either, so nothing is offered. Multiple refs project identically
  // for audience purposes; the first in the directory's stable order is used.
  if (viewer.memberId === null || viewer.memberId === "") return undefined;
  let refs: readonly string[];
  try {
    refs = await deps.customers.customerRefsFor(viewer.memberId);
  } catch {
    return undefined;
  }
  const customerRef = refs.length > 0 ? refs[0] : undefined;
  if (customerRef === undefined) return undefined;

  const nowMs = (deps.now ?? Date.now)();
  const at = new Date(nowMs);

  // The buyer-scoped sheet for THIS customer, from the same seam the order
  // door consults. null (absent, unentitled, or failed) keeps every offer at
  // the ledger price, which safeLegacyOrder then compares against the
  // rendered partner price exactly as before this seam existed.
  const buyerSheet = await resolveBuyerSheet(deps.buyerScopedPrices, customerRef, nowMs);
  let rows: readonly EarlyAccessCatalogRow[];
  let releases: readonly EarlyAccessRelease[];
  try {
    const [projection, ledger] = await Promise.all([
      deps.catalog.load(at, { earlyAccessCustomer: { customerRef } }),
      deps.releases.all(),
    ]);
    rows = projection.rows;
    releases = ledger;
  } catch {
    // A failed read is "we do not know", and what we do not know we do not
    // sell. The catalog itself still renders; only Buy Now stays closed.
    return undefined;
  }

  const rowByUnit = new Map<string, EarlyAccessCatalogRow | "ambiguous">();
  for (const row of rows) {
    const key = `${row.productId}::${row.variantId}`;
    rowByUnit.set(key, rowByUnit.has(key) ? "ambiguous" : row);
  }

  const evaluatedAt = at.toISOString();
  const selectionByKrisId = new Map<string, KrisLegacyOrderSelection>();
  for (const binding of deps.bindings) {
    const row = rowByUnit.get(`${binding.productId}::${binding.variantId}`);
    if (row === undefined || row === "ambiguous") continue;
    const decision = decideEarlyAccessRelease({ row, releases, now: nowMs });
    if (!decision.released) continue;
    const ceilings = [
      decision.approvedQuantityLimit,
      row.quantityLimit ?? Number.MAX_SAFE_INTEGER,
      EARLY_ACCESS_MAX_QUANTITY,
    ].filter((value): value is number => Number.isSafeInteger(value) && value >= EARLY_ACCESS_MIN_QUANTITY);
    if (ceilings.length === 0) continue;
    const quantityLimit = Math.min(...ceilings);
    const scoped =
      buyerSheet === null ? null : buyerSheet.priceFor(binding.productId, binding.variantId);
    selectionByKrisId.set(
      binding.krisId,
      Object.freeze({
        productId: binding.productId,
        variantId: binding.variantId,
        unitPriceCents: scoped?.amountCents ?? decision.priceCents,
        currency: scoped?.currency ?? decision.currency,
        quantityLimit,
        evaluatedAt,
      }),
    );
  }
  if (selectionByKrisId.size === 0) return undefined;

  // Synchronous, per the projection's contract. The projection's own
  // safeLegacyOrder still refuses any selection whose price or currency
  // disagrees with the Kris price it is rendering beside.
  return (product) => selectionByKrisId.get(product.id) ?? null;
}
