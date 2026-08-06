/**
 * ONE-TIME initialization of the catalog supplier confirmations.
 *
 * WHY THIS EXISTS. The 22 catalog-level supplier confirmations have no governed
 * HTTP route. Every mounted supplier route is order-level (notification,
 * packing, tracking, shipped); none writes
 * `research_early_access_supplier_confirmations`. Without those rows no unit
 * reaches AVAILABLE, so the storefront cannot open at 18 purchasable.
 *
 * WHAT IT IS. The smallest possible command that runs the EXISTING canonical
 * seed against the EXISTING production persistence implementation. It derives
 * nothing of its own: the rows come from `seedRawPeptidesConfirmations` over
 * the canonical catalog, which is the same code path the reviewed dry-run
 * manifest was produced from.
 *
 * SAFETY, in the order it is enforced:
 *   1. Refuses when RESEARCH_EARLY_ACCESS_ENABLED is true. Initialization
 *      happens behind a closed storefront or not at all.
 *   2. Defaults to DRY RUN. A write requires an explicit --execute.
 *   3. Asserts the derived set is EXACTLY the 22 approved identities.
 *   4. Reads production first and refuses on any partial or conflicting state.
 *   5. Reports ALREADY_INITIALIZED and writes nothing when all 22 exist.
 *   6. Writes only supplier confirmations. It cannot create a customer, order,
 *      invoice, settlement, payment, receipt, supplier order or shipment, and
 *      it holds no reference to a price, a strength dispute or a release.
 *
 * It is a script. It is not mounted, not reachable from any route, and prints
 * no credential. Run it server-side where production credentials are already
 * mounted.
 *
 *   npx tsx scripts/initialize-supplier-confirmations.ts            # dry run
 *   npx tsx scripts/initialize-supplier-confirmations.ts --execute  # writes
 */

import { InMemorySupplierConfirmationStore } from "../server/research/early-access/ops/supplier-confirmation";
import { ProductControlDeclaredFactsReader } from "../server/research/early-access/catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../server/research/early-access/catalog/product-control-source";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "../server/research/early-access/release/first-release-canonical-source";
import { seedRawPeptidesConfirmations } from "../server/research/early-access/release/founder-supply-seed";

export const EXPECTED_CONFIRMATION_COUNT = 22;

/** The approved identities, from the reviewed dry-run manifest. */
export const APPROVED_CONFIRMATION_IDS: readonly string[] = Object.freeze([
  "supconf-rawpeptides-r360-aod9604-5mg-vial",
  "supconf-rawpeptides-r360-bpc157-5mg-vial",
  "supconf-rawpeptides-r360-bpc157-10mg-vial",
  "supconf-rawpeptides-r360-cagrilintide-10mg-vial",
  "supconf-rawpeptides-r360-dsip-10mg-vial",
  "supconf-rawpeptides-r360-ghkcu-50mg-vial",
  "supconf-rawpeptides-r360-ghkcu-100mg-vial",
  "supconf-rawpeptides-r360-hexarelin-10mg-vial",
  "supconf-rawpeptides-r360-ipamorelin-10mg-vial",
  "supconf-rawpeptides-r360-kisspeptin10-10mg-vial",
  "supconf-rawpeptides-r360-kpv-10mg-vial",
  "supconf-rawpeptides-r360-glutathione-500mg-vial",
  "supconf-rawpeptides-r360-motsc-10mg-vial",
  "supconf-rawpeptides-r360-nad-500mg-vial",
  "supconf-rawpeptides-r360-nad-1000mg-vial",
  "supconf-rawpeptides-r360-oxytocin-5mg-vial",
  "supconf-rawpeptides-r360-pt141-10mg-vial",
  "supconf-rawpeptides-r360-selank-10mg-vial",
  "supconf-rawpeptides-r360-semax-10mg-vial",
  "supconf-rawpeptides-r360-sermorelin-5mg-vial",
  "supconf-rawpeptides-r360-tesamorelin-10mg-vial",
  "supconf-rawpeptides-r360-thymosinalpha1-10mg-vial",
]);

export type ConfirmationRow = Readonly<Record<string, unknown>> & {
  readonly confirmationId: string;
  readonly variantId: string;
};

/** FAIL CLOSED. Initialization never runs against an open storefront. */
export function refuseWhenStorefrontOpen(env: NodeJS.ProcessEnv = process.env): void {
  if (String(env.RESEARCH_EARLY_ACCESS_ENABLED).toLowerCase() === "true") {
    throw new Error(
      "initialize-supplier-confirmations: refusing to run while " +
        "RESEARCH_EARLY_ACCESS_ENABLED is true. Close the storefront first.",
    );
  }
}

/**
 * Derives the rows from the canonical seed. No database is touched here, so the
 * same function produces the dry-run manifest and the rows that get written.
 */
export async function deriveConfirmations(): Promise<readonly ConfirmationRow[]> {
  const recorded: ConfirmationRow[] = [];
  const store = new InMemorySupplierConfirmationStore();
  const capturing = new Proxy(store, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (prop === "insert") recorded.push(args[0] as ConfirmationRow);
        return (value as (...a: unknown[]) => unknown).apply(obj, args);
      };
    },
  });

  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: capturing,
    }),
  } as never);

  const rows = await source.load(new Date("2026-08-05T00:00:00.000Z"), {
    earlyAccessCustomer: { customerRef: "cus_initialization", boundBy: "verified_link" },
  });
  await seedRawPeptidesConfirmations({ rows: rows.rows as never, store: capturing });
  return Object.freeze(recorded);
}

/** Refuses unless the derived set is exactly the approved 22. */
export function assertApprovedSet(rows: readonly ConfirmationRow[]): void {
  if (rows.length !== EXPECTED_CONFIRMATION_COUNT) {
    throw new Error(
      `initialize-supplier-confirmations: derived ${rows.length} rows, expected ${EXPECTED_CONFIRMATION_COUNT}.`,
    );
  }
  const derived = [...rows.map((r) => r.confirmationId)].sort();
  const approved = [...APPROVED_CONFIRMATION_IDS].sort();
  const mismatch = derived.filter((id, i) => id !== approved[i]);
  if (mismatch.length > 0) {
    throw new Error(
      `initialize-supplier-confirmations: derived identities do not match the approved set. ` +
        `First mismatch: ${mismatch[0]}`,
    );
  }
}

export type PreState =
  | { readonly kind: "clean" }
  | { readonly kind: "already_initialized" }
  | { readonly kind: "partial"; readonly present: readonly string[] };

/** Reads production and classifies it. A partial state is never written over. */
export async function readPreState(
  store: { byId(id: string): Promise<unknown> },
  rows: readonly ConfirmationRow[],
): Promise<PreState> {
  const present: string[] = [];
  for (const row of rows) {
    if ((await store.byId(row.confirmationId)) !== null) present.push(row.confirmationId);
  }
  if (present.length === 0) return { kind: "clean" };
  if (present.length === rows.length) return { kind: "already_initialized" };
  return { kind: "partial", present: Object.freeze(present) };
}

export type RunOutcome = Readonly<{
  mode: "dry_run" | "execute";
  result: "would_create" | "created" | "already_initialized";
  count: number;
  verified: number;
}>;

export async function run(input: {
  readonly store: { byId(id: string): Promise<unknown>; insert(row: never): Promise<boolean> };
  readonly execute: boolean;
  readonly log: (line: string) => void;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<RunOutcome> {
  refuseWhenStorefrontOpen(input.env ?? process.env);

  const rows = await deriveConfirmations();
  assertApprovedSet(rows);

  const { log } = input;
  log("=".repeat(78));
  log(`SUPPLIER CONFIRMATION INITIALIZATION - ${input.execute ? "EXECUTE" : "DRY RUN"}`);
  log("actor  : Samuel Boadu (founder)");
  log("reason : Early Access first-release supply commitment, Raw Peptides");
  log("source : seedRawPeptidesConfirmations over the canonical catalog");
  log("=".repeat(78));

  const pre = await readPreState(input.store, rows);
  if (pre.kind === "partial") {
    throw new Error(
      `initialize-supplier-confirmations: PARTIAL STATE. ${pre.present.length} of ${rows.length} ` +
        `identities already exist. Refusing to write. Present: ${pre.present.join(", ")}`,
    );
  }
  if (pre.kind === "already_initialized") {
    log(`ALREADY_INITIALIZED. All ${rows.length} confirmations exist. Nothing written.`);
    return { mode: input.execute ? "execute" : "dry_run", result: "already_initialized", count: 0, verified: rows.length };
  }

  rows.forEach((row, i) => {
    log(
      `${String(i + 1).padStart(2)}. ${row.confirmationId.padEnd(48)} ${String(row.variantId)}`,
    );
  });

  if (!input.execute) {
    log("");
    log(`DRY RUN. ${rows.length} rows WOULD be created. Nothing was written.`);
    log("Re-run with --execute to write.");
    return { mode: "dry_run", result: "would_create", count: rows.length, verified: 0 };
  }

  let created = 0;
  for (const row of rows) {
    if (await input.store.insert(row as never)) created += 1;
  }

  // Post-state, read back from the store rather than assumed from the writes.
  const after = await readPreState(input.store, rows);
  const verified = after.kind === "already_initialized" ? rows.length : -1;
  if (verified !== rows.length) {
    throw new Error(
      "initialize-supplier-confirmations: post-state verification FAILED. " +
        "Not all confirmations read back. Investigate before retrying.",
    );
  }

  log("");
  log(`CREATED ${created} rows. POST-STATE VERIFIED: ${verified} of ${rows.length} read back.`);
  return { mode: "execute", result: "created", count: created, verified };
}

const isDirectRun = process.argv[1]?.includes("initialize-supplier-confirmations");
if (isDirectRun) {
  void (async () => {
    try {
      const { buildEarlyAccessSupplierConfirmationStore } = await import(
        "../server/research/early-access/persistence/production-deps"
      );
      const outcome = await run({
        store: buildEarlyAccessSupplierConfirmationStore() as never,
        execute: process.argv.includes("--execute"),
        // eslint-disable-next-line no-console
        log: (line) => console.log(line),
      });
      // eslint-disable-next-line no-console
      console.log(`\nOUTCOME: ${JSON.stringify(outcome)}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`\nREFUSED: ${(error as Error).message}`);
      process.exit(1);
    }
  })();
}
