/**
 * The V3 import dry-run report. Server only, pure.
 *
 * It counts an import result and renders it as Markdown. It reports whatever
 * the numbers are: a small activatable set, or none at all, is a truthful and
 * useful answer, and this file must never be edited to make a total look
 * better. Every figure below is derived from the import, never hand written.
 *
 * The report is admin-facing, and it still carries no wholesale amount, no
 * margin, and no supplier name. It reports how many rows have a known cost, not
 * what any cost is, so the artifact can be pasted into a ticket without
 * becoming a cost disclosure.
 */

import {
  V3_BLOCKING_REASONS,
  V3_READINESS_STATES,
  isPurchasableReadinessState,
  type V3BlockingReason,
  type V3Category,
  type V3ReadinessState,
} from "@shared/research/v3-import";
import {
  V3_REJECTION_REASONS,
  type V3ImportResult,
  type V3RejectionReason,
} from "./import";

export interface V3DryRunReport {
  readonly sourceRowCount: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly rejectionsByReason: ReadonlyArray<{
    readonly reason: V3RejectionReason;
    readonly count: number;
  }>;
  readonly byCategory: ReadonlyArray<{
    readonly category: V3Category;
    readonly count: number;
  }>;
  readonly byReadiness: ReadonlyArray<{
    readonly state: V3ReadinessState;
    readonly count: number;
  }>;
  readonly byBlockingReason: ReadonlyArray<{
    readonly reason: V3BlockingReason;
    readonly count: number;
  }>;
  /** Rows in a state where an approved price may be displayed. */
  readonly purchasable: number;
  /** Rows carrying an approved customer price. Import alone can never raise this. */
  readonly withApprovedPrice: number;
  readonly wholesaleKnown: number;
  readonly wholesalePending: number;
  readonly blockedOnDisputedStrength: number;
  readonly withExactVariant: number;
  readonly withExactVariantSku: number;
  readonly withApprovedImage: number;
  readonly withCoaAttached: number;
  readonly priceBookRowsWithoutOffer: number;
  readonly unrecognizedAccessValues: readonly string[];
}

function tally<T>(values: readonly T[], order: readonly T[]): Array<{ key: T; count: number }> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const seen = new Set(order);
  const rows = order.map((key) => ({ key, count: counts.get(key) ?? 0 }));
  // Array.from rather than iterating the Map directly: this repository's
  // tsconfig sets no target, so for-of over a Map fails the typecheck.
  for (const [key, count] of Array.from(counts.entries())) {
    if (!seen.has(key)) rows.push({ key, count });
  }
  return rows;
}

export function buildV3DryRunReport(result: V3ImportResult): V3DryRunReport {
  const offers = result.offers;
  const categories = Array.from(
    new Set(offers.map((offer) => offer.record.category)),
  ).sort() as V3Category[];

  return Object.freeze({
    sourceRowCount: result.sourceRowCount,
    accepted: offers.length,
    rejected: result.rejections.length,
    rejectionsByReason: tally(
      result.rejections.map((rejection) => rejection.reason),
      V3_REJECTION_REASONS,
    ).map(({ key, count }) => ({ reason: key, count })),
    byCategory: tally(
      offers.map((offer) => offer.record.category),
      categories,
    ).map(({ key, count }) => ({ category: key, count })),
    byReadiness: tally(
      offers.map((offer) => offer.readiness.state),
      V3_READINESS_STATES,
    ).map(({ key, count }) => ({ state: key, count })),
    byBlockingReason: tally(
      offers.flatMap((offer) => Array.from(offer.readiness.blockingReasons)),
      V3_BLOCKING_REASONS,
    ).map(({ key, count }) => ({ reason: key, count })),
    purchasable: offers.filter((offer) =>
      isPurchasableReadinessState(offer.readiness.state),
    ).length,
    withApprovedPrice: offers.filter(
      (offer) =>
        !offer.readiness.blockingReasons.includes("customer_price_not_approved"),
    ).length,
    wholesaleKnown: offers.filter((offer) => offer.record.cost.state === "known")
      .length,
    wholesalePending: offers.filter(
      (offer) => offer.record.cost.state === "pending",
    ).length,
    blockedOnDisputedStrength: offers.filter(
      (offer) => offer.record.strengthDisputed,
    ).length,
    withExactVariant: offers.filter(
      (offer) => offer.record.variantIdentity === "exact",
    ).length,
    withExactVariantSku: offers.filter(
      (offer) => offer.record.variantSku !== null,
    ).length,
    withApprovedImage: offers.filter(
      (offer) => offer.record.imageState === "approved",
    ).length,
    withCoaAttached: offers.filter(
      (offer) => offer.record.documentation.coaState === "attached",
    ).length,
    priceBookRowsWithoutOffer: result.priceBookRowsWithoutOffer,
    unrecognizedAccessValues: result.unrecognizedAccessValues,
  });
}

function table(
  headings: readonly [string, string],
  rows: ReadonlyArray<readonly [string, number]>,
): string {
  const lines = [
    `| ${headings[0]} | ${headings[1]} |`,
    "| --- | ---: |",
    ...rows.map(([label, count]) => `| ${label} | ${count} |`),
  ];
  return lines.join("\n");
}

/**
 * Render the report. The caller supplies the source description (file name and
 * hash) so the artifact says exactly which file produced these numbers.
 */
export function renderV3DryRunMarkdown(
  report: V3DryRunReport,
  source: { readonly fileName: string; readonly sha256: string; readonly generatedAt: string },
): string {
  const sections: string[] = [];

  sections.push(
    [
      "# V3 master import, dry run",
      "",
      "This is a dry run. Nothing in this report was written to any production",
      "table, no price in it is approved, and no offer in it is published. It is",
      "the output of `importV3Master` over the source workbook, rendered by",
      "`buildV3DryRunReport`, so every number below is derived and none is typed",
      "by hand.",
      "",
      `- Source file: \`${source.fileName}\``,
      `- Source sha256: \`${source.sha256}\``,
      `- Generated: ${source.generatedAt}`,
      "- Importer: `server/research/v3-import/import.ts`",
      "- Contract: `shared/research/v3-import.ts`",
      "- Regenerate: `npx tsx scripts/v3-import-dry-run.mts <workbook.json>`",
    ].join("\n"),
  );

  sections.push(
    [
      "## Row counts",
      "",
      table(
        ["Measure", "Rows"],
        [
          ["Source rows read (sheet 21 Full Offer Index, below the header)", report.sourceRowCount],
          ["Accepted as source records", report.accepted],
          ["Rejected", report.rejected],
          ["Price book rows with no offer index row", report.priceBookRowsWithoutOffer],
        ],
      ),
    ].join("\n"),
  );

  sections.push(
    [
      "## Rejections by reason",
      "",
      table(
        ["Reason", "Rows"],
        report.rejectionsByReason.map(({ reason, count }) => [reason, count] as const),
      ),
    ].join("\n"),
  );

  sections.push(
    [
      "## Accepted rows by category",
      "",
      table(
        ["Category", "Rows"],
        report.byCategory.map(({ category, count }) => [category, count] as const),
      ),
    ].join("\n"),
  );

  sections.push(
    [
      "## Readiness state distribution",
      "",
      "The resolved state is the most blocking condition. Every state in the",
      "vocabulary is listed, including the ones no row reaches today.",
      "",
      table(
        ["Readiness state", "Rows"],
        report.byReadiness.map(({ state, count }) => [state, count] as const),
      ),
    ].join("\n"),
  );

  sections.push(
    [
      "## Blocking conditions",
      "",
      "A row can carry several of these at once. This counts every unmet",
      "condition, not only the one that decided the state, so a gap further down",
      "the chain is visible before the gap above it clears.",
      "",
      table(
        ["Blocking condition", "Rows"],
        report.byBlockingReason.map(({ reason, count }) => [reason, count] as const),
      ),
    ].join("\n"),
  );

  sections.push(
    [
      "## Price and evidence readiness",
      "",
      table(
        ["Measure", "Rows"],
        [
          ["In a state where an approved price may be displayed", report.purchasable],
          ["Carrying an approved customer price", report.withApprovedPrice],
          ["Wholesale cost sourced", report.wholesaleKnown],
          ["Wholesale cost pending", report.wholesalePending],
          ["Blocked on a disputed variant strength", report.blockedOnDisputedStrength],
          ["Naming one exact variant", report.withExactVariant],
          ["Resolved to an exact variant SKU", report.withExactVariantSku],
          ["Carrying an approved product image", report.withApprovedImage],
          ["Carrying an attached COA", report.withCoaAttached],
        ],
      ),
    ].join("\n"),
  );

  const unrecognized =
    report.unrecognizedAccessValues.length === 0
      ? "None. Every access value in the workbook is in the classification table."
      : report.unrecognizedAccessValues.map((value) => `- \`${value}\``).join("\n");
  sections.push(["## Unrecognized access values", "", unrecognized].join("\n"));

  // Derived from the counts above, sentence by sentence. Nothing is claimed
  // here that the tables do not already say.
  sections.push(
    [
      "## What this run says",
      "",
      `- ${report.accepted} of ${report.sourceRowCount} source rows imported as source records. ${report.rejected} were refused.`,
      `- ${report.purchasable} rows are in a state where a customer price may be displayed, and ${report.withApprovedPrice} carry an approved customer price. An import cannot raise either number, because approval is a separate and explicit act.`,
      `- ${report.wholesaleKnown} rows have a sourced wholesale cost and ${report.wholesalePending} do not. Unknown wholesale remains pending, and no cost is estimated or back-solved from a sell price.`,
      `- ${report.blockedOnDisputedStrength} rows are blocked because the repository already records a contested variant strength for that exact unit. None of them can reach an active state.`,
      `- ${report.withExactVariant} rows name one exact variant, and ${report.withExactVariantSku} resolve to an exact variant SKU.`,
      `- ${report.withCoaAttached} rows carry an attached COA and ${report.withApprovedImage} carry an approved product image. Missing evidence stays missing.`,
      "",
      "The import contract is complete and the offers remain held. That is the",
      "intended result. The release authority can run this again the moment",
      "Product Control has evidence to attach, and nothing activates until it",
      "does.",
    ].join("\n"),
  );

  return `${sections.join("\n\n")}\n`;
}
