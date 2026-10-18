import fs from "node:fs/promises";
import path from "node:path";
import { findPeptideMediaPlanEntry } from "../server/research/peptide-image-factory/variant-media-plan";
import { renderPeptideReviewSvg } from "../server/research/peptide-image-factory/render-svg";

const root = process.cwd();
const reviewDir = path.join(root, "content/research-products/peptide-media/review");
const force = process.argv.includes("--force");

const outputs = [
  {
    sku: "R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL",
    template: "renew_360" as const,
    filename: "renew360-r360-thymosinalpha1-kpv-ll37-5mg-5mg-5mg-vial-v1.svg",
  },
  {
    sku: "R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL",
    template: "raw_peptides_internal" as const,
    filename: "rawpeptides-r360-thymosinalpha1-kpv-ll37-5mg-5mg-5mg-vial-v1.svg",
  },
  {
    sku: "R360-DIHEXA-10MGX60-CAP",
    template: "renew_360" as const,
    filename: "renew360-r360-dihexa-10mgx60-cap-v1.svg",
  },
];

await Promise.all([
  "neutral-vial-base.png",
  "neutral-capsule-bottle-base.png",
].map(async (filename) => {
  const source = path.join(root, "content/research-products/peptide-media/templates", filename);
  await fs.access(source);
}));
await fs.mkdir(reviewDir, { recursive: true });

for (const output of outputs) {
  const entry = findPeptideMediaPlanEntry(output.sku);
  if (!entry) throw new Error(`Missing exact peptide media plan entry: ${output.sku}`);
  const target = path.join(reviewDir, output.filename);
  if (!force) {
    try {
      await fs.access(target);
      throw new Error(`Refusing to overwrite review asset without --force: ${target}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await fs.writeFile(target, renderPeptideReviewSvg(entry, output.template), "utf8");
  process.stdout.write(`${path.relative(root, target)}\n`);
}
