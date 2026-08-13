/**
 * The human-readable half of the change report.
 *
 * The JSON is the machine-readable record; this is what an operator actually
 * reads before deciding whether a catalog swap ships. It leads with the things
 * that need a person, because a report that buries them under counts is a
 * report that gets skimmed.
 *
 * Pure string building. No filesystem, no network, no mutation.
 */

import type {
  CatalogRevisionDiff,
  ReviewItem,
} from "./catalog-revision-diff";
import { counted, RETIRED_AND_BOUND_CONSEQUENCE } from "./catalog-revision-diff";
import type { PinResult, RetainResult } from "./catalog-revision-artifact";

export interface ReportContext {
  commandLine: string;
  mode: "dry run" | "apply";
  outputDirectory: string;
  pin?: PinResult | null;
  retain?: RetainResult | null;
  /** Result lines from the focused catalog tests, when they were run. */
  checks?: readonly { name: string; passed: boolean; detail: string }[];
}

function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string[] {
  if (rows.length === 0) return ["_None._", ""];
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
    "",
  ];
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function evidenceText(item: {
  evidence: readonly { kind: string; detail: string; score?: number }[];
}): string {
  return item.evidence
    .map((entry) =>
      entry.score === undefined
        ? `${entry.kind}: ${entry.detail}`
        : `${entry.kind} (${entry.score}): ${entry.detail}`,
    )
    .join("; ");
}

function capped<T>(values: readonly T[], limit: number): readonly T[] {
  return values.slice(0, limit);
}

function overflowNote(count: number, limit: number, what: string): string[] {
  if (count <= limit) return [];
  return [`_${count - limit} further ${what} are in the JSON report._`, ""];
}

const ROW_LIMIT = 60;

function reviewRows(items: readonly ReviewItem[]): readonly (readonly string[])[] {
  return capped(items, ROW_LIMIT).map((item) => [
    item.confidence,
    item.kind,
    item.previousName,
    item.nextName,
    item.previousId,
    item.nextId,
    item.reason,
    evidenceText(item),
  ]);
}

export function renderCatalogRevisionMarkdown(
  diff: CatalogRevisionDiff,
  context: ReportContext,
): string {
  const lines: string[] = [];
  const summary = diff.summary;

  lines.push("# Master catalog reconciliation report", "");
  lines.push(`- Generated: ${diff.generatedAt}`);
  lines.push(`- Mode: **${context.mode}**`);
  lines.push(`- Command: \`${context.commandLine}\``);
  lines.push(`- Output directory: \`${context.outputDirectory}\``);
  lines.push(
    `- Highest confidence this evidence supports: **${diff.confidenceCeiling}**`,
  );
  lines.push(
    "- Production, database, Product Control bindings: untouched. This command reads, compares, and writes files under its own output directory only.",
    "",
  );

  lines.push("## Needs a human", "");
  if (diff.humanAttention.length === 0) {
    lines.push("Nothing. Every change in this swap resolved with certainty.", "");
  } else {
    for (const note of diff.humanAttention) lines.push(`- ${note}`);
    lines.push("");
  }

  lines.push("## Revisions compared", "");
  lines.push(
    ...table(
      [
        "",
        "Label",
        "Fidelity",
        "Workbook sha256",
        "Source rows",
        "Offerings",
        "Variants",
        "Holds",
        "Duplicate row groups",
      ],
      [
        [
          "current",
          diff.current.label,
          diff.current.fidelity,
          diff.current.sourceWorkbookSha256 || "(absent)",
          String(diff.current.sourceRowCount),
          String(diff.current.offerings),
          String(diff.current.variants),
          String(diff.current.holds),
          String(diff.current.duplicateSourceRowGroups),
        ],
        [
          "candidate",
          diff.candidate.label,
          diff.candidate.fidelity,
          diff.candidate.sourceWorkbookSha256 || "(absent)",
          String(diff.candidate.sourceRowCount),
          String(diff.candidate.offerings),
          String(diff.candidate.variants),
          String(diff.candidate.holds),
          String(diff.candidate.duplicateSourceRowGroups),
        ],
      ],
    ),
  );

  lines.push("## Summary", "");
  lines.push(
    ...table(
      ["Change", "Count"],
      [
        ["Offerings with an unchanged id", String(summary.offeringsUnchanged)],
        ["Offerings added", String(summary.offeringsAdded)],
        ["Offerings retired", String(summary.offeringsRetired)],
        [
          "Offerings renamed with the id preserved",
          String(summary.offeringIdsPreserved),
        ],
        ["Variants with an unchanged id", String(summary.variantsUnchanged)],
        [
          "Variants whose id moved and was preserved",
          String(summary.variantIdsPreserved),
        ],
        ["Variants gained on surviving offerings", String(summary.variantsGained)],
        ["Variants lost on surviving offerings", String(summary.variantsLost)],
        ["Display state transitions", String(summary.displayStateTransitions)],
        ["Admin-only holds added", String(summary.holdsAdded)],
        ["Admin-only holds removed", String(summary.holdsRemoved)],
        ["Identity proposals needing review", String(summary.reviewItems)],
        ["Bindings that would not resolve cleanly", String(summary.bindingsAtRisk)],
        [
          "Canonical keys reassigned to different source rows",
          String(summary.canonicalKeyReassignments),
        ],
      ],
    ),
  );

  lines.push("## Renamed, id preserved", "");
  lines.push(
    "An offering id is the sha256 of its canonical key, so a rename issues a new id and orphans anything bound to the old one. These are the renames the evidence resolved with certainty, and the previous id is carried in the continuity map.",
    "",
  );
  lines.push(
    ...table(
      ["Previous name", "New name", "Previous id", "New id", "Evidence"],
      capped(diff.renamed, ROW_LIMIT).map((rename) => [
        rename.previousName,
        rename.nextName,
        rename.previousId,
        rename.nextId,
        evidenceText(rename),
      ]),
    ),
  );
  lines.push(...overflowNote(diff.renamed.length, ROW_LIMIT, "renames"));

  lines.push("## Review list, nothing here was merged", "");
  lines.push(
    "Every row below is a proposal. None of it was applied, and none of it appears in the applied continuity map.",
    "",
  );
  lines.push(
    ...table(
      [
        "Confidence",
        "Kind",
        "Previous",
        "Candidate",
        "Previous id",
        "Candidate id",
        "Why it is not certain",
        "Evidence",
      ],
      reviewRows(diff.review),
    ),
  );
  lines.push(...overflowNote(diff.review.length, ROW_LIMIT, "proposals"));

  lines.push("## Added", "");
  lines.push(
    ...table(
      ["Name", "Family", "State", "Id", "Variants", "Source IDs"],
      capped(diff.added, ROW_LIMIT).map((offering) => [
        offering.displayName,
        offering.family,
        offering.displayState,
        offering.id,
        String(offering.variantIds.length),
        offering.sourceSkus.join(", "),
      ]),
    ),
  );
  lines.push(...overflowNote(diff.added.length, ROW_LIMIT, "additions"));

  lines.push("## Retired", "");
  lines.push(`> ${RETIRED_AND_BOUND_CONSEQUENCE}`, "");
  lines.push(
    ...table(
      ["Name", "Family", "Last state", "Id", "Variant ids", "Source IDs"],
      capped(diff.retired, ROW_LIMIT).map((offering) => [
        offering.displayName,
        offering.family,
        offering.displayState,
        offering.id,
        offering.variantIds.join(", "),
        offering.sourceSkus.join(", "),
      ]),
    ),
  );
  lines.push(...overflowNote(diff.retired.length, ROW_LIMIT, "retirements"));

  lines.push("## Variants gained and lost on surviving offerings", "");
  lines.push(
    ...table(
      ["Offering", "Offering id", "Gained", "Lost"],
      capped(diff.variantChanges, ROW_LIMIT).map((change) => [
        change.offeringName,
        change.offeringId,
        change.gained.map((variant) => variant.label).join(", ") || "-",
        change.lost.map((variant) => variant.label).join(", ") || "-",
      ]),
    ),
  );
  lines.push(
    ...overflowNote(diff.variantChanges.length, ROW_LIMIT, "offerings"),
  );

  lines.push("## Display state transitions", "");
  lines.push(
    ...table(
      ["Kind", "Name", "From", "To"],
      capped(diff.displayStateTransitions, ROW_LIMIT).map((transition) => [
        transition.kind,
        transition.name,
        transition.previous,
        transition.next,
      ]),
    ),
  );
  lines.push(
    ...overflowNote(diff.displayStateTransitions.length, ROW_LIMIT, "transitions"),
  );

  lines.push("## Admin-only hold changes", "");
  lines.push("Newly held:", "");
  lines.push(
    ...table(
      ["Name", "Family", "Reason"],
      capped(diff.holdsAdded, ROW_LIMIT).map((hold) => [
        hold.displayName ?? "(confidential)",
        hold.family,
        hold.reason,
      ]),
    ),
  );
  lines.push("No longer held:", "");
  lines.push(
    ...table(
      ["Name", "Family", "Reason"],
      capped(diff.holdsRemoved, ROW_LIMIT).map((hold) => [
        hold.displayName ?? "(confidential)",
        hold.family,
        hold.reason,
      ]),
    ),
  );

  lines.push("## Canonical keys reassigned", "");
  lines.push(
    "The id survived because the canonical key hashed the same, while every workbook source ID underneath it changed. The id may now point at a different product.",
    "",
  );
  lines.push(
    ...table(
      ["Id", "Name", "Previous source IDs", "New source IDs"],
      capped(diff.canonicalKeyReassignments, ROW_LIMIT).map((entry) => [
        entry.id,
        entry.displayName,
        entry.previousSourceSkus.join(", "),
        entry.nextSourceSkus.join(", "),
      ]),
    ),
  );

  lines.push("## Duplicate source rows", "");
  lines.push(
    "Reported by the normalizer, per run. Provenance is preserved; the duplication should be reconciled at the workbook.",
    "",
  );
  lines.push(
    ...table(
      ["Revision", "Sheet rows"],
      capped(diff.duplicates, ROW_LIMIT).map((duplicate) => [
        duplicate.revision,
        duplicate.sheetRows.join(", "),
      ]),
    ),
  );
  lines.push(...overflowNote(diff.duplicates.length, ROW_LIMIT, "groups"));

  lines.push("## Product Control bindings", "");
  if (diff.bindingRisk.length === 0) {
    lines.push(
      "No binding inventory was supplied, so no binding was checked. There is no production binding store in this tree, only the read-only interfaces in product-control-adapter.ts and price-authority.ts. Pass `--bindings <file.json>` with an array of `{ offeringVariantId, productId, variantId }` once a store exists; the report below is already shaped for it.",
      "",
    );
  } else {
    lines.push(
      ...table(
        [
          "Offering variant id",
          "Product",
          "Variant",
          "Outcome",
          "Repoint at",
          "Note",
        ],
        capped(diff.bindingRisk, ROW_LIMIT).map((item) => [
          item.offeringVariantId,
          item.productId,
          item.variantId,
          item.outcome,
          item.replacementOfferingVariantId ?? "-",
          item.note,
        ]),
      ),
    );
    lines.push(...overflowNote(diff.bindingRisk.length, ROW_LIMIT, "bindings"));
  }

  if (context.pin) {
    lines.push("## Id pinning", "");
    lines.push(
      `Pinned ${counted(context.pin.pinned.length, "id")} back onto the regenerated artifact. Refused ${context.pin.conflicts.length}.`,
      "",
    );
    lines.push(
      ...table(
        ["Kind", "Name", "Pinned id", "Replaced content-hash id"],
        capped(context.pin.pinned, ROW_LIMIT).map((entry) => [
          entry.kind,
          entry.name,
          entry.previousId,
          entry.replacedId,
        ]),
      ),
    );
    if (context.pin.conflicts.length > 0) {
      lines.push("Refused pins:", "");
      lines.push(
        ...table(
          ["Previous id", "New id", "Reason"],
          context.pin.conflicts.map((conflict) => [
            conflict.previousId,
            conflict.nextId,
            conflict.reason,
          ]),
        ),
      );
    }
  }

  if (context.retain) {
    lines.push("## Retired offerings retained as unavailable", "");
    lines.push(
      `Carried ${counted(context.retain.retained.length, "retired offering")} into the new artifact with every state set to unavailable, so ${context.retain.retained.length === 1 ? "its id and slug keep" : "their ids and slugs keep"} resolving. Skipped ${context.retain.skipped.length}.`,
      "",
    );
    lines.push(
      ...table(
        ["Name", "Id", "Slug", "Variants"],
        capped(context.retain.retained, ROW_LIMIT).map((entry) => [
          entry.displayName,
          entry.id,
          entry.slug,
          String(entry.variants),
        ]),
      ),
    );
  }

  if (context.checks && context.checks.length > 0) {
    lines.push("## Checks", "");
    lines.push(
      ...table(
        ["Check", "Result", "Detail"],
        context.checks.map((check) => [
          check.name,
          check.passed ? "pass" : "FAIL",
          check.detail,
        ]),
      ),
    );
  }

  lines.push("## What this command did not do", "");
  lines.push(
    "- It did not write to any database.",
    "- It did not create, update, or delete a Product Control binding, product, price, or inventory record.",
    "- It did not mount a route or change a feature flag.",
    "- It did not compute identity from a deployed dataset. The canonical key is on the reader's banned-key list and the reader hardcodes it to the empty string, so identity work runs offline against normalize.ts output only.",
    "",
  );

  return `${lines.join("\n")}\n`;
}
