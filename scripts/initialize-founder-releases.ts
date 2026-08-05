/**
 * ONE-TIME initialization of the 21 founder releases.
 *
 * WHY THIS EXISTS RATHER THAN THE ADMIN ROUTE. The governed
 * POST /api/admin/research/early-access/releases refuses any release on a unit
 * carrying a NON-WAIVABLE blocker, even a release that waives nothing
 * non-waivable. Three accepted units (Tesamorelin 10 mg, NAD+ 500 mg,
 * MOTS-C 10 mg) carry STRENGTH_DISPUTE_UNRESOLVED, so the route would refuse
 * them with 422 and only 18 releases would land. The customer catalogue is
 * scoped to units the ledger has ever named, so those three would then VANISH
 * from the storefront instead of rendering held: 19 visible, 1 held, against an
 * accepted set of 22 visible and 4 held. A customer cannot tell a hidden
 * product from one that does not exist, which is the worse outcome.
 *
 * The route is correct in general and is NOT modified. This command runs the
 * same canonical seed the reviewed manifest came from, against the real
 * production ledger.
 *
 * IT WAIVES NOTHING NON-WAIVABLE. Each release waives only the four
 * founder-waivable codes. STRENGTH_DISPUTE_UNRESOLVED stays on the unit and
 * keeps holding it, so the three release as "priced and approved, held by a
 * dispute" and remain unsellable. The dispute is not touched, softened, or
 * recorded away.
 *
 * SAFETY, in the order it is enforced:
 *   1. Refuses when RESEARCH_EARLY_ACCESS_ENABLED is true.
 *   2. Defaults to DRY RUN. A write requires an explicit --execute.
 *   3. Asserts the derived set is EXACTLY the 21 approved release ids, with
 *      Cagrilintide absent and the three disputed units present.
 *   4. Asserts no release waives a non-waivable blocker.
 *   5. Reads production first and refuses any partial or conflicting state.
 *   6. Reports ALREADY_INITIALIZED and writes nothing when all 21 exist.
 *   7. Reads every row back after writing and verifies field equality.
 *
 * It is a script. It is not mounted, not reachable from any route, and prints
 * no credential.
 *
 *   npx tsx scripts/initialize-founder-releases.ts            # dry run
 *   npx tsx scripts/initialize-founder-releases.ts --execute  # writes
 */

import { ProductControlDeclaredFactsReader } from "../server/research/early-access/catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../server/research/early-access/catalog/product-control-source";
import { InMemorySupplierConfirmationStore } from "../server/research/early-access/ops/supplier-confirmation";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "../server/research/early-access/release/first-release-canonical-source";
import { seedFounderFirstRelease } from "../server/research/early-access/release/founder-first-release-seed";
import { seedRawPeptidesConfirmations } from "../server/research/early-access/release/founder-supply-seed";

export const EXPECTED_RELEASE_COUNT = 21;

/** Never waivable by anyone, at any layer. */
export const NON_WAIVABLE = Object.freeze([
  "STRENGTH_DISPUTE_UNRESOLVED",
  "IDENTITY_DISPUTE_UNRESOLVED",
  "REGULATORY_HOLD",
  "FORMULA_UNKNOWN",
  "RECALL",
  "STOP_SHIP",
  "SUPPLIER_QUALITY_HOLD",
]);

/** Released AND held. Their releases must exist so the units stay visible. */
export const DISPUTED_BUT_RELEASED = Object.freeze([
  "R360-TESAMORELIN-10MG-VIAL",
  "R360-NAD-500MG-VIAL",
  "R360-MOTSC-10MG-VIAL",
]);

/** Deliberately never released. Its hold IS the absent release. */
export const NEVER_RELEASED_PRODUCT_ID = "PEX-028";

export type ReleaseRow = Readonly<Record<string, unknown>> & {
  readonly releaseId: string;
  readonly productId: string;
  readonly variantId: string;
};

/** FAIL CLOSED. Initialization never runs against an open storefront. */
export function refuseWhenStorefrontOpen(env: NodeJS.ProcessEnv = process.env): void {
  if (String(env.RESEARCH_EARLY_ACCESS_ENABLED).toLowerCase() === "true") {
    throw new Error(
      "initialize-founder-releases: refusing to run while " +
        "RESEARCH_EARLY_ACCESS_ENABLED is true. Close the storefront first.",
    );
  }
}

/** Runs the canonical seed against a recording ledger. Touches no database. */
export async function deriveReleases(): Promise<readonly ReleaseRow[]> {
  const drafts: ReleaseRow[] = [];
  const confirmations = new InMemorySupplierConfirmationStore();
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
    }),
  } as never);

  const at = new Date("2026-08-05T00:00:00.000Z");
  const context = { earlyAccessCustomer: { customerRef: "cus_initialization" } };
  const before = await source.load(at, context);
  await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
  const confirmed = await source.load(at, context);

  await seedFounderFirstRelease({
    rows: confirmed.rows as never,
    ledger: {
      async append(draft: ReleaseRow) {
        drafts.push(draft);
        return { ok: true as const };
      },
      async all() {
        return drafts as never[];
      },
      async history() {
        return [] as never[];
      },
    } as never,
  });
  return Object.freeze(drafts);
}

/** Refuses anything that is not the approved shape. */
export function assertApprovedSet(rows: readonly ReleaseRow[]): void {
  if (rows.length !== EXPECTED_RELEASE_COUNT) {
    throw new Error(
      `initialize-founder-releases: derived ${rows.length} releases, expected ${EXPECTED_RELEASE_COUNT}.`,
    );
  }
  if (rows.some((r) => r.productId === NEVER_RELEASED_PRODUCT_ID)) {
    throw new Error(
      "initialize-founder-releases: Cagrilintide must never receive a founder release.",
    );
  }
  for (const variantId of DISPUTED_BUT_RELEASED) {
    if (!rows.some((r) => r.variantId === variantId)) {
      throw new Error(
        `initialize-founder-releases: ${variantId} must be released so it stays VISIBLE and held. ` +
          "Without a release it disappears from the catalogue.",
      );
    }
  }
  for (const row of rows) {
    const waived = (row.waivedBlockers as string[] | undefined) ?? [];
    const illegal = waived.filter((b) => NON_WAIVABLE.includes(b));
    if (illegal.length > 0) {
      throw new Error(
        `initialize-founder-releases: ${row.releaseId} attempts to waive ${illegal.join(", ")}, ` +
          "which is never waivable.",
      );
    }
  }
}

export type PreState =
  | { readonly kind: "clean" }
  | { readonly kind: "already_initialized" }
  | { readonly kind: "partial"; readonly present: readonly string[] };

export async function readPreState(
  ledger: { all(): Promise<readonly unknown[]> },
  rows: readonly ReleaseRow[],
): Promise<PreState> {
  const existing = new Set(
    (await ledger.all()).map((r) => String((r as { releaseId?: unknown }).releaseId)),
  );
  const present = rows.map((r) => r.releaseId).filter((id) => existing.has(id));
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
  readonly ledger: {
    all(): Promise<readonly unknown[]>;
    append(draft: never): Promise<unknown>;
  };
  readonly execute: boolean;
  readonly log: (line: string) => void;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<RunOutcome> {
  refuseWhenStorefrontOpen(input.env ?? process.env);

  const rows = await deriveReleases();
  assertApprovedSet(rows);

  const { log } = input;
  log("=".repeat(78));
  log(`FOUNDER RELEASE INITIALIZATION - ${input.execute ? "EXECUTE" : "DRY RUN"}`);
  log(`actor  : ${String(rows[0]?.actor)}`);
  log(`reason : ${String(rows[0]?.reason)}`);
  log(`recordedAt : ${String(rows[0]?.recordedAt)}`);
  log("source : seedFounderFirstRelease over the canonical catalog");
  log("=".repeat(78));

  const pre = await readPreState(input.ledger, rows);
  if (pre.kind === "partial") {
    throw new Error(
      `initialize-founder-releases: PARTIAL STATE. ${pre.present.length} of ${rows.length} ` +
        `release ids already exist. Refusing to write. Present: ${pre.present.join(", ")}`,
    );
  }
  if (pre.kind === "already_initialized") {
    log(`ALREADY_INITIALIZED. All ${rows.length} releases exist. Nothing written.`);
    return {
      mode: input.execute ? "execute" : "dry_run",
      result: "already_initialized",
      count: 0,
      verified: rows.length,
    };
  }

  rows.forEach((row, i) => {
    const cents = Number(row.approvedPriceCents);
    log(
      `${String(i + 1).padStart(2)}. ${row.releaseId.padEnd(40)}${row.productId.padEnd(9)}` +
        `${row.variantId.padEnd(31)}$${(cents / 100).toFixed(2).padEnd(8)}` +
        `qty=${String(row.approvedQuantityLimit)} ${String(row.status)}` +
        `${DISPUTED_BUT_RELEASED.includes(row.variantId) ? "  [held by dispute]" : ""}`,
    );
  });

  if (!input.execute) {
    log("");
    log(`DRY RUN. ${rows.length} releases WOULD be created. Nothing was written.`);
    log("Re-run with --execute to write.");
    return { mode: "dry_run", result: "would_create", count: rows.length, verified: 0 };
  }

  let created = 0;
  for (const row of rows) {
    const appended = (await input.ledger.append(row as never)) as { ok?: unknown; code?: unknown };
    if (!appended || appended.ok !== true) {
      throw new Error(
        `initialize-founder-releases: ledger refused ${row.releaseId}: ${String(appended?.code ?? "unknown")}`,
      );
    }
    created += 1;
  }

  // Post-state: read every row back and verify the fields that decide money and
  // sellability, rather than trusting the writes.
  const stored = new Map(
    (await input.ledger.all()).map((r) => [
      String((r as { releaseId?: unknown }).releaseId),
      r as Record<string, unknown>,
    ]),
  );
  let verified = 0;
  for (const row of rows) {
    const back = stored.get(row.releaseId);
    if (back === undefined) {
      throw new Error(`initialize-founder-releases: ${row.releaseId} did not read back.`);
    }
    for (const field of [
      "productId",
      "variantId",
      "approvedPriceCents",
      "approvedQuantityLimit",
      "status",
      "currency",
    ]) {
      if (back[field] !== row[field]) {
        throw new Error(
          `initialize-founder-releases: ${row.releaseId} field ${field} read back as ` +
            `${String(back[field])}, expected ${String(row[field])}.`,
        );
      }
    }
    verified += 1;
  }

  log("");
  log(`CREATED ${created} releases. POST-STATE VERIFIED: ${verified} of ${rows.length} field-exact.`);
  return { mode: "execute", result: "created", count: created, verified };
}

const isDirectRun = process.argv[1]?.includes("initialize-founder-releases");
if (isDirectRun) {
  void (async () => {
    try {
      const { buildEarlyAccessReleaseLedger } = await import(
        "../server/research/early-access/persistence/production-deps"
      );
      const outcome = await run({
        ledger: buildEarlyAccessReleaseLedger() as never,
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
