import fs from "node:fs";
import path from "node:path";

import {
  COVERAGE_LEDGER_PATH,
  COVERAGE_SUMMARY_PATH,
  FALLBACK_ASSET_MANIFEST_PATH,
  IDENTITY_CROSSWALK_PATH,
  RENDER_QUEUE_PATH,
} from "./config.mjs";
import {
  buildArtifacts,
  renderCoverageSummary,
  REPO_ROOT,
} from "./lib.mjs";

function write(relativePath, content) {
  const target = path.join(REPO_ROOT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const artifacts = buildArtifacts();
write(FALLBACK_ASSET_MANIFEST_PATH, json(artifacts.assetManifest));
write(COVERAGE_LEDGER_PATH, json(artifacts.coverageLedger));
write(IDENTITY_CROSSWALK_PATH, json(artifacts.identityCrosswalk));
write(RENDER_QUEUE_PATH, json(artifacts.renderQueue));
write(COVERAGE_SUMMARY_PATH, renderCoverageSummary(artifacts));

console.log(
  JSON.stringify(
    {
      ok: true,
      canonicalRows: artifacts.coverageLedger.invariants.canonicalRows,
      exposedRows: artifacts.coverageLedger.invariants.exposedRows,
      fallbackAssets: artifacts.assetManifest.assets.length,
      exactRenderQueue: artifacts.renderQueue.counts.exactVariantQueue,
      outputs: [
        FALLBACK_ASSET_MANIFEST_PATH,
        COVERAGE_LEDGER_PATH,
        IDENTITY_CROSSWALK_PATH,
        RENDER_QUEUE_PATH,
        COVERAGE_SUMMARY_PATH,
      ],
    },
    null,
    2,
  ),
);
