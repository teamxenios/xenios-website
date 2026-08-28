import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("admin research home responsive grid", () => {
  it("never imposes a 300px track on a narrower content area", () => {
    const source = readFileSync(join(HERE, "AdminResearchHome.tsx"), "utf8");
    expect(source).toContain("minmax(min(300px, 100%), 1fr)");
    expect(source).not.toContain("minmax(300px, 1fr)");
  });
});
