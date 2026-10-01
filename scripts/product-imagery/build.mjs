import fs from "node:fs";
import path from "node:path";

import {
  BATCH0_ASSET_MANIFEST_PATH,
  BATCH0_PROVENANCE_PATH,
  COVERAGE_LEDGER_PATH,
  COVERAGE_SUMMARY_PATH,
  FALLBACK_ASSET_MANIFEST_PATH,
  IDENTITY_CROSSWALK_PATH,
  RENDERER_PACKET_PATH,
  RENDER_QUEUE_PATH,
  STATE_AUTHORITY_AUDIT_PATH,
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
write(RENDERER_PACKET_PATH, json(artifacts.rendererPacket));
write(BATCH0_PROVENANCE_PATH, json(artifacts.batch0Provenance));
write(STATE_AUTHORITY_AUDIT_PATH, json(artifacts.stateAuthorityAudit));
write(BATCH0_ASSET_MANIFEST_PATH, json(artifacts.batch0AssetManifest));
write(COVERAGE_SUMMARY_PATH, renderCoverageSummary(artifacts));

console.log(
  JSON.stringify(
    {
      ok: true,
      canonicalRows: artifacts.coverageLedger.invariants.canonicalRows,
      targetExposedRows: artifacts.stateAuthorityAudit.reviewedTarget.exposedRows,
      mountedRows: artifacts.stateAuthorityAudit.currentlyMounted.canonicalRows,
      quarantinedAssets: artifacts.assetManifest.assets.length,
      batch0Rendered: artifacts.batch0AssetManifest.counts.rendered,
      batch0Pending: artifacts.batch0AssetManifest.counts.pending,
      outputs: [
        FALLBACK_ASSET_MANIFEST_PATH,
        COVERAGE_LEDGER_PATH,
        IDENTITY_CROSSWALK_PATH,
        RENDER_QUEUE_PATH,
        RENDERER_PACKET_PATH,
        BATCH0_PROVENANCE_PATH,
        STATE_AUTHORITY_AUDIT_PATH,
        BATCH0_ASSET_MANIFEST_PATH,
        COVERAGE_SUMMARY_PATH,
      ],
    },
    null,
    2,
  ),
);
