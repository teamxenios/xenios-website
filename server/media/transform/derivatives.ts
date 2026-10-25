import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { SupplementMediaRecord } from "../official-sources/contracts";
import { rightsAllowIngestion } from "../rights/policy";

export const SUPPLEMENT_DERIVATIVE_SPECS = [
  { view: "catalog", width: 1600, height: 1600, format: "webp" },
  { view: "detail", width: 1600, height: 2000, format: "webp" },
  { view: "clean-packshot", width: 1600, height: 1600, format: "png" },
  { view: "cart", width: 512, height: 512, format: "webp" },
  { view: "social", width: 1080, height: 1350, format: "webp" },
  { view: "open-graph", width: 1200, height: 630, format: "webp" },
] as const;

export type SupplementDerivativeSpec = (typeof SUPPLEMENT_DERIVATIVE_SPECS)[number];

export function mediaSlug(value: string | null): string {
  return (value ?? "unknown")
    .normalize("NFKD")
    .replace(/[™®©]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "unknown";
}

export function derivativeFilename(
  record: Pick<SupplementMediaRecord, "brand" | "sku" | "variant" | "packageCount">,
  spec: SupplementDerivativeSpec,
): string {
  return [
    mediaSlug(record.brand),
    mediaSlug(record.sku),
    mediaSlug(record.variant ?? record.packageCount),
    spec.view,
    "v1",
  ].join("__") + `.${spec.format}`;
}

export function ffmpegDerivativeArgs(
  inputPath: string,
  outputPath: string,
  spec: SupplementDerivativeSpec,
): string[] {
  const background = spec.format === "png" ? "white@1.0" : "white";
  const filter = [
    `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${spec.width}:${spec.height}:(ow-iw)/2:(oh-ih)/2:${background}`,
    "setsar=1",
  ].join(",");
  return ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vf", filter, "-frames:v", "1", outputPath];
}

export type CommandRunner = (command: string, args: readonly string[]) => Promise<void>;

export const spawnCommand: CommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: "pipe", windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 1000)}`));
    });
  });

export async function generateSupplementDerivatives(input: {
  record: SupplementMediaRecord;
  originalPath: string;
  outputDirectory: string;
  ffmpegCommand?: string;
  runner?: CommandRunner;
}): Promise<Array<{ spec: SupplementDerivativeSpec; path: string }>> {
  if (!rightsAllowIngestion(input.record.rights.status)) {
    throw new Error("Derivatives are forbidden until media-use rights are approved");
  }
  if (!["EXACT_MATCH", "HIGH_CONFIDENCE_MATCH"].includes(input.record.matchState)) {
    throw new Error("Derivatives require an exact or high-confidence source match");
  }
  await mkdir(input.outputDirectory, { recursive: true });
  const runner = input.runner ?? spawnCommand;
  const outputs: Array<{ spec: SupplementDerivativeSpec; path: string }> = [];
  for (const spec of SUPPLEMENT_DERIVATIVE_SPECS) {
    const outputPath = path.join(input.outputDirectory, derivativeFilename(input.record, spec));
    await runner(input.ffmpegCommand ?? process.env.XENIOS_FFMPEG_PATH ?? "ffmpeg", ffmpegDerivativeArgs(input.originalPath, outputPath, spec));
    outputs.push({ spec, path: outputPath });
  }
  return outputs;
}
