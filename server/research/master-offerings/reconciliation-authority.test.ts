import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parsePinnedReconciliationAuthority,
  PINNED_RECONCILIATION_FILE,
  readPinnedReconciliationAuthority,
} from "./reconciliation-authority";

const recordPath = path.resolve("config", "research", PINNED_RECONCILIATION_FILE);
const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the pinned reconciliation authority", () => {
  it("uses normalized LF UTF-8 content SHA256, not checkout line endings or JSON reserialization", () => {
    const lf = readFileSync(recordPath, "utf8").replace(/\r\n/g, "\n");
    const authority = parsePinnedReconciliationAuthority(lf);
    expect(parsePinnedReconciliationAuthority(lf.replace(/\n/g, "\r\n")).sha256).toBe(authority.sha256);
    expect(parsePinnedReconciliationAuthority(lf + "\n").sha256).not.toBe(authority.sha256);
    expect(parsePinnedReconciliationAuthority(JSON.stringify(JSON.parse(lf))).sha256).not.toBe(authority.sha256);
    expect(authority.reconciliation.sourceWorkbook.sha256).toBe(
      "6478ad0d3f710b75c6bf0c5f5e56ff1189ab2a2a4439cab23c2a28498134ea6f",
    );
  });

  it("does not let a later filename silently change policy", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "xenios-hl11-authority-"));
    scratch.push(dir);
    const config = path.join(dir, "config", "research");
    mkdirSync(config, { recursive: true });
    const text = readFileSync(recordPath, "utf8");
    writeFileSync(path.join(config, PINNED_RECONCILIATION_FILE), text);
    const newer = JSON.parse(text);
    newer.commerceHolds = [];
    writeFileSync(path.join(config, "master-catalog-reconciliation-29991231.json"), JSON.stringify(newer));
    expect(readPinnedReconciliationAuthority(dir).sha256).toBe(parsePinnedReconciliationAuthority(text).sha256);
    expect(readPinnedReconciliationAuthority(dir).reconciliation.commerceHolds).toHaveLength(1);
  });

  it("resolves the exact pinned record within three parents, but never walks farther", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "xenios-hl11-parents-"));
    scratch.push(dir);
    const config = path.join(dir, "config", "research");
    mkdirSync(config, { recursive: true });
    writeFileSync(path.join(config, PINNED_RECONCILIATION_FILE), readFileSync(recordPath, "utf8"));
    const nested = path.join(dir, "one", "two", "three");
    mkdirSync(nested, { recursive: true });
    expect(readPinnedReconciliationAuthority(nested).sha256).toBe(readPinnedReconciliationAuthority(dir).sha256);
    const tooDeep = path.join(nested, "four");
    mkdirSync(tooDeep);
    expect(() => readPinnedReconciliationAuthority(tooDeep)).toThrow();
  });

  it("does not fall through a malformed nearer record to a valid parent", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "xenios-hl11-invalid-nearer-"));
    scratch.push(dir);
    const config = path.join(dir, "config", "research");
    mkdirSync(config, { recursive: true });
    writeFileSync(path.join(config, PINNED_RECONCILIATION_FILE), readFileSync(recordPath, "utf8"));
    const nested = path.join(dir, "nested");
    const nearer = path.join(nested, "config", "research");
    mkdirSync(nearer, { recursive: true });
    writeFileSync(path.join(nearer, PINNED_RECONCILIATION_FILE), "{ invalid");
    expect(() => readPinnedReconciliationAuthority(nested)).toThrow();
  });

  it("fails closed without the exact pinned record even if a newer record exists", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "xenios-hl11-missing-"));
    scratch.push(dir);
    const config = path.join(dir, "config", "research");
    mkdirSync(config, { recursive: true });
    writeFileSync(path.join(config, "master-catalog-reconciliation-29991231.json"), readFileSync(recordPath, "utf8"));
    expect(() => readPinnedReconciliationAuthority(dir)).toThrow();
  });

  it("refuses unknown source editions and holds without an exact identity join", () => {
    const original = readFileSync(recordPath, "utf8");
    for (const mutate of [
      (value: any) => { value.sourceWorkbook.sha256 = "0".repeat(64); },
      (value: any) => { delete value.commerceHolds[0].catalogIdentity; },
      (value: any) => { value.commerceHolds[0].catalogIdentity.offeringVariantId = "GRP-0422"; },
      (value: any) => { value.commerceHolds.push(value.commerceHolds[0]); },
    ]) {
      const value = JSON.parse(original);
      mutate(value);
      expect(() => parsePinnedReconciliationAuthority(JSON.stringify(value))).toThrow();
    }
  });
});
