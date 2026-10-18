import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  OfficialSourceAdapter,
  RightsEvidence,
  SupplementManifestRow,
} from "../server/media/official-sources/contracts";
import { OfficialPageAdapter } from "../server/media/official-sources/official-page";
import {
  CompositeOfficialSourceAdapter,
  ShopifyOfficialProductAdapter,
} from "../server/media/official-sources/shopify";
import {
  runSupplementIngestionBatch,
  type SupplementIngestionRun,
} from "../server/media/queue/supplement-ingestion";
import {
  readJsonIfPresent,
  writeJsonAtomic,
} from "../server/media/providers/local-artifact-store";

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredOption(name: string): string {
  const value = option(name);
  if (!value) throw new Error(`${name} is required`);
  return path.resolve(value);
}

function positiveInteger(name: string, fallback: number): number {
  const value = option(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

class PacedAdapter implements OfficialSourceAdapter {
  readonly id: string;
  private lastRequestAt = 0;

  constructor(
    private readonly inner: OfficialSourceAdapter,
    private readonly intervalMs: number,
  ) {
    this.id = `${inner.id}-paced-${intervalMs}ms`;
  }

  supports(row: SupplementManifestRow): boolean {
    return this.inner.supports(row);
  }

  async lookup(row: SupplementManifestRow) {
    const waitMs = Math.max(0, this.lastRequestAt + this.intervalMs - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.lastRequestAt = Date.now();
    return this.inner.lookup(row);
  }
}

const inputPath = requiredOption("--input");
const outputPath = requiredOption("--out");
const start = positiveInteger("--start", 0);
const limit = positiveInteger("--limit", 50);
const rateLimitMs = positiveInteger("--rate-limit-ms", 750);
const rightsPath = option("--rights-file");
const inputDocument = JSON.parse(await readFile(inputPath, "utf8")) as
  | SupplementManifestRow[]
  | { rows: SupplementManifestRow[] };
const allRows = Array.isArray(inputDocument) ? inputDocument : inputDocument.rows;
const rows = allRows.slice(start, start + limit);
if (rows.length === 0) throw new Error("Selected batch contains no rows");

const rightsByVariant = rightsPath
  ? (JSON.parse(await readFile(path.resolve(rightsPath), "utf8")) as Record<string, RightsEvidence>)
  : {};
const previous = await readJsonIfPresent<SupplementIngestionRun>(outputPath);
const composite = new CompositeOfficialSourceAdapter([
  new ShopifyOfficialProductAdapter(),
  new OfficialPageAdapter(),
]);
const adapter = new PacedAdapter(composite, rateLimitMs);
const run = await runSupplementIngestionBatch({
  batchId: option("--batch-id") ?? `supplement-${start + 1}-${start + rows.length}`,
  rows,
  adapter,
  previous,
  rightsResolver: (row) => rightsByVariant[row.canonicalVariantId] ?? {
    status: "OFFICIAL_SOURCE_RIGHTS_PENDING",
    evidenceReference: null,
    grantedBy: null,
    permissionDate: null,
    expiresAt: null,
    limitations: "Official source discovered; republication permission not yet confirmed.",
  },
});
await writeJsonAtomic(outputPath, run);
console.log(JSON.stringify({ outputPath, batchId: run.batchId, ...run.summary }, null, 2));
