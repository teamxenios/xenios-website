import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupplementMediaRecord } from "../server/media/official-sources/contracts";
import { writeJsonAtomic } from "../server/media/providers/local-artifact-store";
import { buildProductControlLinkRequests } from "../server/media/review/reconcile";

function requiredOption(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (!value) throw new Error(`${name} is required`);
  return path.resolve(value);
}

const manifestPath = requiredOption("--manifest");
const outputPath = requiredOption("--out");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  media: SupplementMediaRecord[];
};
const requests = buildProductControlLinkRequests(manifest.media);
await writeJsonAtomic(outputPath, {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  requests,
});
console.log(JSON.stringify({ outputPath, linkRequests: requests.length }, null, 2));
