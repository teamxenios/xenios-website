import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupplementMediaRecord } from "../server/media/official-sources/contracts";
import { generateSupplementDerivatives } from "../server/media/transform/derivatives";
import { writeJsonAtomic } from "../server/media/providers/local-artifact-store";

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredOption(name: string): string {
  const value = option(name);
  if (!value) throw new Error(`${name} is required`);
  return path.resolve(value);
}

const manifestPath = requiredOption("--manifest");
const originalsPath = requiredOption("--originals");
const outputDirectory = requiredOption("--out-dir");
const reportPath = requiredOption("--report");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  media: SupplementMediaRecord[];
};
const originals = JSON.parse(await readFile(originalsPath, "utf8")) as Record<string, string>;
const report: Array<{
  assetId: string;
  status: "CREATED" | "HELD" | "FAILED";
  outputs: string[];
  reason: string | null;
}> = [];

for (const record of manifest.media) {
  const originalPath = originals[record.assetId];
  if (!originalPath) {
    report.push({ assetId: record.assetId, status: "HELD", outputs: [], reason: "No approved local original" });
    continue;
  }
  try {
    const outputs = await generateSupplementDerivatives({
      record,
      originalPath: path.resolve(originalPath),
      outputDirectory,
    });
    report.push({ assetId: record.assetId, status: "CREATED", outputs: outputs.map((item) => item.path), reason: null });
  } catch (error) {
    report.push({
      assetId: record.assetId,
      status: "HELD",
      outputs: [],
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
await writeJsonAtomic(reportPath, report);
console.log(JSON.stringify({
  reportPath,
  created: report.filter((item) => item.status === "CREATED").length,
  held: report.filter((item) => item.status === "HELD").length,
  failed: report.filter((item) => item.status === "FAILED").length,
}, null, 2));
