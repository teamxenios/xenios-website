/**
 * Build the Kris Launch A member-safe artifact from the private intake.
 *
 * Deterministic: same intake in, byte-identical products out. Only the
 * generatedAt stamp differs between runs.
 *
 * The privacy scan here is deliberately VALUE level as well as key level. A key
 * scan proves no field is called "Selected Supplier"; it does not prove the
 * supplier's NAME is absent, and the master's regulatory-notes column shows
 * exactly how a name travels in prose. So every distinct supplier name and
 * every cost, margin and saving figure in the intake is searched for in the
 * finished artifact text.
 *
 * Usage:
 *   npx tsx scripts/research/build-kris-launch-a.ts \
 *     .local/research/kris-launch-a/private-intake.json [outputPath]
 */

import fs from "node:fs";
import path from "node:path";
import {
  normalizeKrisLaunchA,
  KRIS_PRIVATE_MASTER_COLUMNS,
  type RawKrisRow,
} from "../../server/research/kris-launch-a/normalize.ts";
import {
  KRIS_CHANNEL_LABELS,
  KRIS_FAMILY_LABELS,
} from "../../shared/research/kris-launch-a/contract.ts";
import { loadKrisDataset } from "../../server/research/kris-launch-a/dataset-reader.ts";
import { reconcileKrisArtifacts } from "../../server/research/kris-launch-a/reconcile.ts";

const DEFAULT_OUTPUT = path.join(
  "server",
  "research",
  "kris-launch-a",
  "data",
  "kris-launch-a-catalog.generated.json",
);

const PROFILE = "KRIS_VOLUME_PARTNER";

function fail(message: string): never {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
}

const intakePath = process.argv[2];
if (!intakePath) fail("usage: build-kris-launch-a.ts <private-intake.json> [output]");
const outputPath = process.argv[3] ?? DEFAULT_OUTPUT;

const intake = JSON.parse(fs.readFileSync(intakePath, "utf8")) as {
  sources: {
    masterCatalog: { filename: string; sha256: string };
    krisPricing: { filename: string; sha256: string };
  };
  masterRows: RawKrisRow[];
  krisRows: RawKrisRow[];
};

const normalized = normalizeKrisLaunchA(intake.masterRows, intake.krisRows);

const blocking = normalized.issues.filter(
  (issue) =>
    issue.code === "unknown_family" ||
    issue.code === "unknown_channel" ||
    issue.code === "duplicate_join_key" ||
    issue.code === "unparsable_price" ||
    issue.code === "zero_price",
);
if (blocking.length > 0) {
  fail(
    `refusing to build: ${blocking.length} blocking issue(s); first: ${blocking[0].message}`,
  );
}

const priced = normalized.items.filter((item) => item.priceAmountCents !== null);
const pending = normalized.items.filter((item) => item.priceAmountCents === null);

// Explicit picks. No spread of a normalized item, so the artifact cannot gain a
// field by someone adding one upstream.
const products = normalized.items.map((item) => ({
  id: item.id,
  slug: item.slug,
  displayName: item.displayName,
  specification: item.specification,
  family: item.family,
  familyLabel: KRIS_FAMILY_LABELS[item.family],
  channel: item.channel,
  channelLabel: KRIS_CHANNEL_LABELS[item.channel],
  format: item.format,
  packBasis: item.packBasis,
  moq: item.moq,
  dosageForm: item.dosageForm,
  suppliedNote: item.suppliedNote,
}));

const overlay: Record<string, unknown> = {};
for (const item of normalized.items) {
  overlay[item.id] =
    item.priceAmountCents === null
      ? { state: "pending" }
      : {
          state: "priced",
          amountCents: item.priceAmountCents,
          currency: item.priceCurrency,
          display: item.priceDisplay,
          basis: item.packBasis,
        };
}

const artifact = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  // Filename and digest only. The intake's source block also carries the full
  // column list of each workbook, and copying it wholesale put every private
  // column name into the artifact. The scan below caught it on the first run,
  // which is the entire reason the scan exists.
  sources: {
    masterCatalog: {
      filename: intake.sources.masterCatalog.filename,
      sha256: intake.sources.masterCatalog.sha256,
    },
    krisPricing: {
      filename: intake.sources.krisPricing.filename,
      sha256: intake.sources.krisPricing.sha256,
    },
  },
  counts: {
    items: products.length,
    priced: priced.length,
    pricePending: pending.length,
  },
  invariants: {
    containsSupplierIdentity: false,
    containsBuyCost: false,
    containsMargin: false,
    containsSavings: false,
    containsInternalSourcingNotes: false,
    containsSuggestedSellPrice: false,
    itemCanBecomePurchasable: false,
  },
  priceProfiles: [PROFILE],
  products,
  priceOverlays: { [PROFILE]: overlay },
};

// ---------------------------------------------------------------------------
// Privacy scan
// ---------------------------------------------------------------------------
const serialized = JSON.stringify(artifact);
const leaks: string[] = [];

for (const column of KRIS_PRIVATE_MASTER_COLUMNS) {
  if (serialized.includes(JSON.stringify(column))) {
    leaks.push(`private column name present: ${column}`);
  }
}

function distinct(rows: readonly RawKrisRow[], column: string): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = typeof row[column] === "string" ? row[column].trim() : "";
    if (value.length >= 3) values.add(value);
  }
  return Array.from(values);
}

const supplierNames = [
  ...distinct(intake.masterRows, "Selected Supplier"),
  ...distinct(intake.masterRows, "Alternative Supplier"),
];
for (const name of supplierNames) {
  if (serialized.toLowerCase().includes(name.toLowerCase())) {
    leaks.push(`supplier name present in output: ${name}`);
  }
}

// Money that must never travel.
//
// A naive substring scan of the whole artifact is worse than useless here: the
// buy cost "0.75" is a substring of the perfectly legitimate Kris price
// "$10.75", and the first run produced 77 such false alarms. Two precise checks
// replace it.
//
// One, structural: the only price field this build emits comes from the Kris
// workbook's own column, and the master's money columns are never read. That is
// a property of normalize.ts, asserted by test rather than by scanning text.
//
// Two, textual: private amounts are searched for as WHOLE TOKENS in the free
// text a member actually reads, where a cost figure has no business appearing.
// The price fields are excluded from this surface because they are supposed to
// contain prices.
// WHICH member text can even carry a master leak.
//
// Every member-facing field except one is copied from the KRIS workbook, which
// is authored member-facing content by definition. Scanning it against the
// master's money columns produces confident nonsense: Kris's own pack basis
// says "$4,200.00 total for 20 units", and the master happens to quote $4,200.00
// for that product, so the scan reported the buyer's own price sheet as a leak
// of the cost sheet.
//
// `dosageForm` is the only member field sourced from the master, so it is the
// only place a master value could arrive unnoticed. Supplier names and internal
// prose are still checked against the WHOLE artifact below, because those must
// never appear anywhere no matter which sheet they came from.
const masterSourcedMemberText = products
  .map((product) => product.dosageForm ?? "")
  .join(" | ")
  .replace(/(\d),(?=\d{3})/g, "$1");

const moneyColumns = [
  "Buy Cost / Unit",
  "Original Quote",
  "Suggested Sell Price",
  "Gross Profit / Unit",
  "Gross Margin %",
  "Alternative Cost / Unit",
  "Savings vs Alternative",
];
for (const column of moneyColumns) {
  for (const value of distinct(intake.masterRows, column)) {
    const amount = value.replace(/[$,\s]/g, "");
    if (!/^\d+(\.\d+)?%?$/.test(amount) || amount.length < 4) continue;
    // A dose is not a price. Every match this scan produced on the real
    // workbooks was a strength inside a specification: a buy cost of 0.75
    // against "ESTRADIOL 0.75MG CAPSULE", 11.2 against "(11.2mg vial)", 13.5
    // against "13.5MCG". Doses and dollar amounts share the numeral space, so
    // a bare numeric match proves nothing.
    //
    // The number is therefore only a finding when it is NOT immediately
    // followed by a unit of measure. A real leak, a cost written into prose the
    // way the master's regulatory column wrote a supplier name into prose,
    // still trips it.
    const escaped = amount.split(".").join("\\.");
    const token = new RegExp(
      "(^|[^0-9.])" + escaped + "\\s*(?!mg|mcg|ug|g\\b|ml|l\\b|iu|kg|mm|cm|%)([^0-9.]|$)",
      "i",
    );
    if (token.test(masterSourcedMemberText)) {
      leaks.push(`private amount from ${column} present in master-sourced member text: ${value}`);
    }
  }
}

// The emitted prices must be the Kris ones. Proven by set comparison rather
// than by trusting the code path: every emitted amount has to appear in the
// Kris price column, and none may be absent from it.
const krisAmounts = new Set(
  intake.krisRows
    .map((row) => (typeof row["Kris Volume Price"] === "string" ? row["Kris Volume Price"].trim() : ""))
    .filter((value) => value !== "")
    .map((value) => Math.round(Number(value.replace(/[$,\s]/g, "")) * 100)),
);
for (const entry of Object.values(overlay)) {
  const priceEntry = entry as { state: string; amountCents?: number };
  if (priceEntry.state !== "priced") continue;
  if (!krisAmounts.has(priceEntry.amountCents as number)) {
    leaks.push(`emitted amount ${priceEntry.amountCents} is not a Kris workbook price`);
  }
}

for (const column of ["Selection Rationale", "Supplier Notes", "Source File", "Source Location", "Quality / Regulatory Notes"]) {
  for (const value of distinct(intake.masterRows, column)) {
    if (value.length >= 24 && serialized.includes(value.slice(0, 24))) {
      leaks.push(`internal text from ${column} present in output`);
      break;
    }
  }
}

if (leaks.length > 0) {
  fail(`privacy scan failed with ${leaks.length} finding(s): ${leaks.slice(0, 5).join(" | ")}`);
}

// Reconcile against the artifact being replaced, BEFORE it is overwritten.
// Loading both sides through the reader also subjects the freshly built
// artifact to the reader's full refusal surface, on top of the scans above.
// A row becoming purchasable is the one change a rebuild must never carry
// silently: it stops the build unless the operator states the approval as a
// flag, which makes the approval an auditable part of the command itself.
const resolvedOutput = path.resolve(outputPath);
let reconciliation: Record<string, unknown> | null = null;
if (fs.existsSync(resolvedOutput)) {
  const previous = loadKrisDataset(JSON.parse(fs.readFileSync(resolvedOutput, "utf8")));
  const successor = loadKrisDataset(artifact);
  const report = reconcileKrisArtifacts(previous, successor);
  reconciliation = {
    identical: report.identical,
    added: report.added,
    retired: report.retired,
    changedCount: report.changed.length,
    priceMovementCount: report.priceMovements.length,
    modeTransitions: report.modeTransitions.map(
      (transition) => `${transition.id}: ${transition.from} -> ${transition.to}`,
    ),
    purchaseOpeningIds: report.purchaseOpeningIds,
  };
  if (!report.opensNoPurchasePath && !process.argv.includes("--allow-purchase-opening")) {
    fail(
      `refusing to build: ${report.purchaseOpeningIds.length} row(s) would become purchasable ` +
        `(${report.purchaseOpeningIds.join(", ")}). Review the change as what it is and re-run ` +
        `with --allow-purchase-opening only after explicit approval.`,
    );
  }
}

fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, JSON.stringify(artifact, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify({
    ok: true,
    items: artifact.counts.items,
    priced: artifact.counts.priced,
    pricePending: artifact.counts.pricePending,
    masterSha256: intake.sources.masterCatalog.sha256,
    krisSha256: intake.sources.krisPricing.sha256,
    privacyLeaks: 0,
    supplierNamesChecked: supplierNames.length,
    nonBlockingIssues: normalized.issues.length,
    reconciliation,
    output: resolvedOutput,
  }),
);
