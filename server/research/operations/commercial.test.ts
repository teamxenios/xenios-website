import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "commercial.ts"), "utf8");

describe("commercial operations boundary", () => {
  it("keeps mutations behind reviewed commands", () => {
    expect(source).toContain('.rpc("research_operations_configure_professional"');
    expect(source).toContain('.rpc("research_operations_configure_lawrence"');
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
  });

  it("requires evidence before active professional state", () => {
    expect(source).toContain('input.state === "active"');
    expect(source).toContain("requires agreement evidence");
  });

  it("validates Lawrence rates without hardcoding final terms", () => {
    expect(source).toContain("tier.rateBasisPoints > 10_000");
    expect(source).not.toContain("mostfitbarber");
    expect(source).not.toMatch(/rateBasisPoints:\s*\d/);
  });

  it("reads only the single canonical non-superseded Lawrence version", () => {
    expect(source).toContain('.neq("state", "superseded")');
    expect(source).toContain(".maybeSingle()");
  });
});
