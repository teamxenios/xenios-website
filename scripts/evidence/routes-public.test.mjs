import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const routes = JSON.parse(
  readFileSync(path.join(HERE, "routes.public.json"), "utf8"),
);
const template = JSON.parse(
  readFileSync(path.join(HERE, "evidence-manifest.template.json"), "utf8"),
);

function route(pathname) {
  return routes.routes.find((candidate) => candidate.path === pathname);
}

describe("public evidence topology", () => {
  it("assigns the warm-silver reconciliation to /research, never the global root", () => {
    expect(route("/research")?.surface).toBe(
      "warm-silver-homepage-reconciliation",
    );
    expect(route("/")?.surface).toBe("global-marketing-root");
    expect(
      routes.routes
        .filter((candidate) =>
          candidate.surface === "warm-silver-homepage-reconciliation")
        .map((candidate) => candidate.path),
    ).toEqual(["/research"]);
  });

  it("requires independent evidence for the reconciled Research and global roots", () => {
    expect(template.requiredSurfaces).toContain(
      "warm-silver-homepage-reconciliation",
    );
    expect(template.requiredSurfaces).toContain("global-marketing-root");
  });
});
