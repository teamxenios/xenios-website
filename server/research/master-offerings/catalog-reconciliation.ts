/**
 * Apply the REVIEWED canonical reconciliation to raw workbook rows.
 *
 * THE DISTINCTION THIS EXISTS TO ENFORCE. A workbook row and a customer
 * product are not the same thing, and treating them as the same is what
 * produced two Hexarelin 5 mg rows at two different prices:
 *
 *   SOURCE ROWS        what the workbook lists       426  (141 peptides)
 *   CANONICAL VARIANTS what a customer can buy       424  (139 peptides)
 *
 * The workbook stays whole. Every row survives export exactly as written,
 * including the superseded ones, because it is the evidence. What this module
 * does is answer the separate question — which canonical products do those
 * rows add up to — from a reviewed artifact rather than from conditionals
 * scattered through the build or, worse, the storefront.
 *
 * WHY NOT JUST EDIT THE WORKBOOK. Two reasons. Deleting the superseded rows
 * would destroy the provenance that explains why a canonical product looks the
 * way it does. And for the CJC-1295 + Ipamorelin hold, editing the workbook's
 * channel to Classification Pending would assert something false: that row's
 * CLASSIFICATION is not in doubt, its FORMULATION is. Falsifying a source to
 * obtain a behaviour loses that distinction and silently reverses on the next
 * re-export.
 *
 * FAIL LOUD, NOT QUIET. Every decision names the exact source rows it
 * consumes. A merge whose rows are absent, a hold on a row that does not
 * exist, or an accounting that no longer matches the reviewed expectation all
 * REFUSE the build. A reconciliation that silently no-ops is worse than none,
 * because the numbers keep being quoted after they stop being true.
 */

export interface ReconciliationMerge {
  readonly id: string;
  readonly keeps: string;
  readonly supersedes: readonly string[];
  readonly canonical: Readonly<{
    product: string;
    specification: string;
    family: string;
    channel: string;
    retailPriceCents: number;
  }>;
}

export interface ReconciliationHold {
  readonly id: string;
  readonly sourceRow: string;
  readonly product: string;
  readonly specification: string;
  readonly retailPriceCents: number;
}

export interface CatalogReconciliation {
  readonly schemaVersion: number;
  readonly decidedOn: string;
  readonly sourceWorkbook: Readonly<{ sha256: string; sourceRows: number }>;
  readonly merges: readonly ReconciliationMerge[];
  readonly commerceHolds: readonly ReconciliationHold[];
  readonly expected: Readonly<Record<string, number>>;
}

export class CatalogReconciliationError extends Error {}

/** The workbook's own row identifier. */
const GROUP_ID_COLUMN = "Group ID";

function groupIdOf(row: Record<string, unknown>): string {
  const value = row[GROUP_ID_COLUMN];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The set of source rows a canonical variant was built from. Kept beside the
 * result rather than folded into it, so provenance never has to be inferred
 * back out of a merged row.
 */
export interface ReconciliationProvenance {
  /** canonical Group ID -> every source Group ID that produced it. */
  readonly sourceRowsByCanonical: ReadonlyMap<string, readonly string[]>;
  /** Group IDs held back from direct purchase, by founder decision. */
  readonly commerceHeldRows: ReadonlySet<string>;
  readonly sourceRowCount: number;
  readonly canonicalRowCount: number;
}

export interface ReconciledCatalog<TRow> {
  readonly rows: readonly TRow[];
  readonly provenance: ReconciliationProvenance;
}

/**
 * Drop superseded rows and record what each canonical row was built from.
 *
 * Deliberately does NOT rewrite the surviving row's values. The reviewed
 * artifact records what the canonical answer should be so a human can read it,
 * but the row that survives is the workbook's own RUO row, unedited — so the
 * generated catalog still says exactly what the workbook says, and the only
 * thing reconciliation changes is which rows are present.
 */
export function applyCatalogReconciliation<
  TRow extends Record<string, unknown>,
>(
  rows: readonly TRow[],
  reconciliation: CatalogReconciliation,
): ReconciledCatalog<TRow> {
  const byGroupId = new Map<string, TRow>();
  for (const row of rows) {
    const id = groupIdOf(row);
    if (id) byGroupId.set(id, row);
  }

  const superseded = new Set<string>();
  const sourceRowsByCanonical = new Map<string, readonly string[]>();

  for (const merge of reconciliation.merges) {
    if (!byGroupId.has(merge.keeps)) {
      throw new CatalogReconciliationError(
        `merge "${merge.id}" keeps ${merge.keeps}, which is not in the workbook. ` +
          `Reconciliation must never silently no-op: re-review the merge against the current source.`,
      );
    }
    for (const gone of merge.supersedes) {
      if (!byGroupId.has(gone)) {
        throw new CatalogReconciliationError(
          `merge "${merge.id}" supersedes ${gone}, which is not in the workbook. ` +
            `Either the row was already removed upstream or the merge is stale; both need a human.`,
        );
      }
      if (gone === merge.keeps) {
        throw new CatalogReconciliationError(
          `merge "${merge.id}" supersedes the row it keeps (${gone}).`,
        );
      }
      superseded.add(gone);
    }
    sourceRowsByCanonical.set(merge.keeps, [merge.keeps, ...merge.supersedes]);
  }

  const commerceHeldRows = new Set<string>();
  for (const hold of reconciliation.commerceHolds) {
    if (!byGroupId.has(hold.sourceRow)) {
      throw new CatalogReconciliationError(
        `commerce hold "${hold.id}" names ${hold.sourceRow}, which is not in the workbook. ` +
          `A hold that matches nothing would let a held product go on sale silently.`,
      );
    }
    if (superseded.has(hold.sourceRow)) {
      throw new CatalogReconciliationError(
        `commerce hold "${hold.id}" names ${hold.sourceRow}, which a merge already superseded.`,
      );
    }
    commerceHeldRows.add(hold.sourceRow);
  }

  const kept = rows.filter((row) => !superseded.has(groupIdOf(row)));

  return {
    rows: kept,
    provenance: {
      sourceRowsByCanonical,
      commerceHeldRows,
      sourceRowCount: rows.length,
      canonicalRowCount: kept.length,
    },
  };
}

/**
 * Refuse the build when the reviewed accounting no longer describes reality.
 *
 * The numbers in the artifact are the ones quoted to the founder and written
 * into release packets. If the catalog moves under them, that has to be a
 * loud failure at build time rather than a quiet drift discovered later from a
 * customer screenshot.
 */
export function assertReconciledAccounting(
  reconciliation: CatalogReconciliation,
  actual: Readonly<Record<string, number>>,
): void {
  const mismatches: string[] = [];
  for (const [key, expected] of Object.entries(reconciliation.expected)) {
    if (key.startsWith("$")) continue;
    const got = actual[key];
    if (got === undefined) continue;
    if (got !== expected) mismatches.push(`${key}: expected ${expected}, got ${got}`);
  }
  if (mismatches.length > 0) {
    throw new CatalogReconciliationError(
      `the reviewed catalog accounting no longer matches the source:\n  ` +
        mismatches.join("\n  ") +
        `\nRe-review config/research/master-catalog-reconciliation-*.json before shipping these numbers.`,
    );
  }
}
