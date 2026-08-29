import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { main, scanDirectory } from "./pii-scan.mjs";

const created = [];

afterEach(() => {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("evidence PII envelope privacy", () => {
  it("never serializes the operator's absolute output directory", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "xenios-evidence-privacy-"));
    created.push(outDir);
    writeFileSync(join(outDir, "capture.text.txt"), "clean synthetic evidence", "utf8");
    await main(["--out-dir", outDir, "--sha", "a".repeat(40), "--fail-on-findings"]);
    const raw = readFileSync(join(outDir, "pii-scan.json"), "utf8");
    const document = JSON.parse(raw);
    expect(document.evidenceRoot).toBe(".");
    expect(document).not.toHaveProperty("outDir");
    expect(raw).not.toContain(outDir);
    expect(raw).not.toMatch(/[A-Za-z]:[\\/]/u);
    expect(raw).not.toMatch(/\\\\[^\\]+\\/u);
  });

  it("marks unknown artifact extensions incomplete instead of silently CLEAN", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "xenios-evidence-unknown-"));
    created.push(outDir);
    writeFileSync(join(outDir, "opaque.bin"), "private.person@example.test", "utf8");

    const document = await main(["--out-dir", outDir, "--sha", "b".repeat(40)]);
    expect(document.summary).toMatchObject({ result: "INCOMPLETE", total: 0 });
    expect(document.scanCoverage).toMatchObject({
      result: "INCOMPLETE",
      totalFiles: 1,
      classifiedFiles: 0,
      unscannableFiles: 1,
    });
    expect(document.unscannableArtifacts).toEqual([
      { path: "opaque.bin", reason: "unsupported artifact extension: .bin" },
    ]);
  });

  it("exits nonzero for incomplete coverage in the mandatory release mode", () => {
    const outDir = mkdtempSync(join(tmpdir(), "xenios-evidence-incomplete-cli-"));
    created.push(outDir);
    writeFileSync(join(outDir, "opaque.bin"), "opaque", "utf8");

    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("./pii-scan.mjs", import.meta.url)),
      "--out-dir",
      outDir,
      "--sha",
      "c".repeat(40),
      "--fail-on-findings",
    ], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("pii-scan: INCOMPLETE");
    expect(JSON.parse(readFileSync(join(outDir, "pii-scan.json"), "utf8")))
      .toMatchObject({ summary: { result: "INCOMPLETE" } });
  });

  it("rejects textual payloads disguised as PNG screenshots", () => {
    const outDir = mkdtempSync(join(tmpdir(), "xenios-evidence-fake-png-"));
    created.push(outDir);
    writeFileSync(join(outDir, "capture.png"), "private.person@example.test", "utf8");

    const scan = scanDirectory(outDir);
    expect(scan.screenshots).toEqual([]);
    expect(scan.unscannableArtifacts).toEqual([
      { path: "capture.png", reason: "PNG is too short" },
    ]);
  });

  it("does not scan malformed or NUL-delimited text as if it were UTF-8 evidence", () => {
    const outDir = mkdtempSync(join(tmpdir(), "xenios-evidence-invalid-text-"));
    created.push(outDir);
    writeFileSync(join(outDir, "utf16.txt"), Buffer.from("private.person@example.test", "utf16le"));

    const scan = scanDirectory(outDir);
    expect(scan.textArtifacts).toEqual([]);
    expect(scan.textFiles).toBe(0);
    expect(scan.unscannableArtifacts).toEqual([
      { path: "utf16.txt", reason: "text artifact contains NUL bytes" },
    ]);
  });

  it("accepts a strict PNG for manual review but rejects free-form PNG metadata", () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const iendOffset = png.length - 12;
    const payload = Buffer.from("Comment\0private.person@example.test", "utf8");
    const textChunk = Buffer.alloc(12 + payload.length);
    textChunk.writeUInt32BE(payload.length, 0);
    textChunk.write("tEXt", 4, "ascii");
    payload.copy(textChunk, 8);
    const withTextMetadata = Buffer.concat([
      png.subarray(0, iendOffset),
      textChunk,
      png.subarray(iendOffset),
    ]);

    const outDir = mkdtempSync(join(tmpdir(), "xenios-evidence-png-policy-"));
    created.push(outDir);
    writeFileSync(join(outDir, "safe.png"), png);
    writeFileSync(join(outDir, "metadata.png"), withTextMetadata);

    const scan = scanDirectory(outDir);
    expect(scan.screenshots).toEqual(["safe.png"]);
    expect(scan.unscannableArtifacts).toEqual([
      { path: "metadata.png", reason: "PNG contains disallowed chunk: tEXt" },
    ]);
  });
});
