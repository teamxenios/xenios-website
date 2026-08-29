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

  it("captures the actual public scheduler separately from private Care appointments", () => {
    expect(template.requiredSurfaces).toContain("tebra-scheduler");
    expect(template.requiredSurfaces).toContain("care-appointments");
    expect(route("/care/schedule")).toMatchObject({
      surface: "tebra-scheduler",
      state: "disabled",
      public: true,
    });
    expect(route("/care/appointments")).toMatchObject({
      surface: "care-appointments",
      state: "disabled",
      public: false,
    });
    expect(route("/care/appointments").expectedHttpFailures).toHaveLength(2);
    expect(route("/care/appointments").expectedHttpFailures.map((failure) => [failure.method, failure.path, failure.status, failure.count])).toEqual([
      ["GET", "/api/care/appointments", 503, 1],
      ["GET", "/api/care/appointments/admin/readiness", 503, 1],
    ]);
  });

  it("limits reviewed assertion notes to exact Hino target-finding fingerprints", () => {
    const withNotes = routes.routes.filter((candidate) => candidate.reviewedAssertionNotes);
    expect(withNotes.map((candidate) => candidate.path)).toEqual(["/hino"]);
    expect(route("/hino").externalMicrosite).toBe(true);
    const note = route("/hino").reviewedAssertionNotes[0];
    expect(note.id).toBe("TARGETS_44x44");
    expect(note.productionCommit).toBe("3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212");
    expect(note.allowedFindingFingerprints).toHaveLength(11);
    expect(note.allowedFindingFingerprints.every((fingerprint) => /^[a-f0-9]{64}$/u.test(fingerprint))).toBe(true);
    expect(note.candidateSource).toEqual({
      path: "client/public/hino",
      gitTree: "f952c7b7744533aae65bd0ac7ab31767cb352247",
    });
  });
});
