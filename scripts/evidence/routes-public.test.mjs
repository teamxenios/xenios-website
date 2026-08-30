import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseArgs as parseCaptureArgs } from "./capture-browser-matrix.mjs";
import {
  RAW_HTTP_CAREER_DETAILS,
  RAW_HTTP_GLOBAL_PUBLIC_PATHS,
  RAW_HTTP_ICP_PATHS,
  RAW_HTTP_PUBLIC_POLICY_PATHS,
  rawHttpDocumentMetadataForPath,
} from "../../server/research/seo/raw-http-document-policy.ts";
import {
  PUBLIC_RESEARCH_EXACT_PATHS,
} from "../../client/src/research/seo/route-policy.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const routes = JSON.parse(
  readFileSync(path.join(HERE, "routes.public.json"), "utf8"),
);
const template = JSON.parse(
  readFileSync(path.join(HERE, "evidence-manifest.template.json"), "utf8"),
);
const sitemapXml = readFileSync(
  path.join(HERE, "../../client/public/sitemap.xml"),
  "utf8",
);
const sitemapPaths = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/gu)]
  .map((match) => {
    const url = new URL(match[1]);
    expect(url.origin).toBe("https://xeniostechnology.com");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    return url.pathname;
  });

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
    expect(template.requiredSurfaces).toContain("global-marketing-public-pages");
  });

  it("covers every tracked sitemap and raw-policy public document identity", () => {
    expect(new Set(sitemapPaths).size).toBe(sitemapPaths.length);

    const sitemapPolicyPaths = [
      ...RAW_HTTP_GLOBAL_PUBLIC_PATHS,
      ...RAW_HTTP_ICP_PATHS,
      ...RAW_HTTP_CAREER_DETAILS.map((detail) => detail.path),
    ];
    expect([...new Set(sitemapPolicyPaths)].sort()).toEqual([...sitemapPaths].sort());

    const allRawPublicPaths = new Set([
      ...sitemapPolicyPaths,
      ...PUBLIC_RESEARCH_EXACT_PATHS,
      ...RAW_HTTP_PUBLIC_POLICY_PATHS,
    ]);
    expect(
      [...allRawPublicPaths].filter((pathname) => !route(pathname)).sort(),
    ).toEqual([]);

    for (const pathname of sitemapPaths) {
      expect(route(pathname), pathname).toMatchObject({
        surface: pathname === "/"
          ? "global-marketing-root"
          : "global-marketing-public-pages",
        state: "default",
        public: true,
        indexable: true,
      });
    }
    expect(
      routes.routes
        .filter((candidate) => candidate.indexable === true)
        .map((candidate) => candidate.path)
        .sort(),
    ).toEqual([...sitemapPaths].sort());
    expect(route("/research/supplier-access")).toMatchObject({
      surface: "partners",
      state: "default",
      public: true,
      indexable: false,
      semanticContract: {
        requiredSelectors: ["#supplier-types-heading"],
        requiredText: ["Operational access begins after evidence, not interest."],
      },
    });
  });

  it("binds every raw-public title and description to the exact browser contract", () => {
    const rawPublicPaths = new Set([
      ...sitemapPaths,
      ...PUBLIC_RESEARCH_EXACT_PATHS,
      ...RAW_HTTP_PUBLIC_POLICY_PATHS,
    ]);
    expect(rawPublicPaths.size).toBe(74);
    for (const pathname of rawPublicPaths) {
      const contract = route(pathname)?.metadataContract;
      expect(contract, pathname).toEqual(rawHttpDocumentMetadataForPath(pathname));
      expect(Object.keys(contract ?? {}).sort(), pathname).toEqual([
        "description",
        "title",
      ]);
      expect(contract?.title.trim().length, pathname).toBeGreaterThan(0);
      expect(contract?.description.trim().length, pathname).toBeGreaterThan(0);
    }
  });

  it("pins exact structured-data scope for every sitemap document", () => {
    const jobPostingPaths = new Set([
      "/careers",
      "/careers/founding-designer",
      "/careers/founding-senior-ai-software-engineer",
    ]);
    for (const pathname of sitemapPaths) {
      const expected = pathname === "/"
        ? ["Organization", "WebSite"]
        : jobPostingPaths.has(pathname)
          ? ["JobPosting"]
          : [];
      expect(route(pathname)?.structuredDataTypes, pathname).toEqual(expected);
    }
  });

  it("gives every browser route a unique artifact surface label", () => {
    const labels = routes.routes.map((candidate) => {
      const surfaceLabel = candidate.label
        ? `${candidate.surface}-${candidate.label}`
        : candidate.surface;
      return `${surfaceLabel}-${candidate.state}`;
    });
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("cannot weaken the all-route browser matrix below eight widths and required variants", () => {
    const requiredWidths = [1440, 1024, 768, 430, 390, 375, 360, 320];
    expect(routes.widthsCssPx).toEqual(requiredWidths);
    expect(template.browserMatrix.requiredWidthsCssPx).toEqual(requiredWidths);
    expect(template.browserMatrix.requiresTwoHundredPercentZoomEquivalent).toBe(true);
    expect(routes.zoomEquivalents).toEqual([{
      label: "200pct",
      widthCssPx: 720,
      deviceScaleFactor: 2,
      zoomPercent: 200,
      method: "1440 px screen at 200% browser zoom == 720 CSS px viewport at deviceScaleFactor 2 (WCAG 1.4.10 reflow equivalent)",
    }]);
    expect(parseCaptureArgs([])).toMatchObject({
      focusWalk: true,
      mediaVariants: true,
      zoom: true,
      widths: null,
      only: null,
    });
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
    expect(route("/research/early-access").expectedHttpFailures.map(
      (failure) => [failure.method, failure.path, failure.status, failure.count],
    )).toEqual([
      ["GET", "/api/research/early-access/cart/capability", 404, 1],
      ["GET", "/api/research/early-access/agreements", 500, 1],
      ["GET", "/api/research/early-access/catalog", 503, 1],
      ["GET", "/api/research/early-access/assisted-orders/catalog?page=1&pageSize=24", 403, 1],
    ]);
  });

  it("covers every required route surface and browser-required state", () => {
    const surfaces = new Set(routes.routes.map((candidate) => candidate.surface));
    const states = new Set(routes.routes.map((candidate) => candidate.state));
    expect(template.requiredSurfaces.filter((surface) => !surfaces.has(surface))).toEqual([]);
    expect(template.requiredStates.filter((state) => !states.has(state))).toEqual([]);
    expect(new Set(routes.routes.map((candidate) => candidate.path)).size).toBe(routes.routes.length);
  });

  it("requires a blocking semantic identity contract for every browser route", () => {
    expect(routes.routes.length).toBeGreaterThan(0);
    for (const candidate of routes.routes) {
      expect(candidate.semanticContract, candidate.path).toBeTruthy();
      expect(
        (candidate.semanticContract.requiredSelectors?.length ?? 0) +
          (candidate.semanticContract.requiredText?.length ?? 0),
        candidate.path,
      ).toBeGreaterThan(0);
    }
    expect(route("/research/early-access/order-request/confirmation/XRR-20000101-0000000000")?.semanticContract).toMatchObject({
      requiredSelectors: ['[data-testid="order-confirmation-unavailable"]'],
      forbiddenText: ["Request received", "Status: submitted"],
    });
  });

  it("pins the metadata-restoration navigation to distinct public and sign-in identities", () => {
    expect(routes.metadataRestoration).toEqual([{
      public: "/research/about",
      private: "/research/account",
      backTo: "/research/about",
      privateExpectedPath: "/research/sign-in",
      privateExpectedReturnTo: "/research/account",
      publicRequiredSelectors: ["#about-purpose"],
      publicRequiredText: ["A more accountable way to navigate research access."],
      privateRequiredSelectors: ['[data-testid="form-member-signin"]'],
      privateRequiredText: ["Sign in."],
    }]);
  });

  it("labels denied content routes as boundary-only and requires separate representative evidence", () => {
    expect(route("/research/member/catalog")).toMatchObject({
      surface: "catalog",
      state: "unauthorized",
      coverageScope: "boundary-only",
    });
    expect(route("/research/member/products/XR-EVIDENCE-PLACEHOLDER")).toMatchObject({
      surface: "product-detail",
      state: "unauthorized",
      coverageScope: "boundary-only",
    });
    for (const surface of ["catalog", "product-detail", "account-overview", "orders", "membership"]) {
      expect(template.requiredRepresentativeSurfaces).toContain(surface);
    }
    expect(route("/research/sign-in")?.surface).toBe("member-auth");
    for (const pathname of [
      "/research/account/profile",
      "/research/account/security",
      "/research/account/interests",
    ]) {
      expect(route(pathname)).toMatchObject({
        surface: "account-settings",
        state: "unauthorized",
        coverageScope: "boundary-only",
      });
    }
  });

  it("requires exact rich/empty/order/status journeys at desktop and mobile", () => {
    expect(template.requiredRepresentativeJourneys).toEqual([
      { surface: "catalog", state: "default", widthsCssPx: [1440, 390] },
      { surface: "product-detail", state: "default", widthsCssPx: [1440, 390] },
      { surface: "account-overview", state: "rich", widthsCssPx: [1440, 390] },
      { surface: "orders", state: "rich", widthsCssPx: [1440, 390] },
      { surface: "orders", state: "empty", widthsCssPx: [1440, 390] },
      { surface: "membership", state: "rich", widthsCssPx: [1440, 390] },
      { surface: "order-flow", state: "review", widthsCssPx: [1440, 390] },
      { surface: "order-flow", state: "confirmation", widthsCssPx: [1440, 390] },
      { surface: "order-status", state: "neutral-error", widthsCssPx: [1440, 390] },
      { surface: "order-status", state: "server-verified", widthsCssPx: [1440, 390] },
    ]);
  });

  it("captures the empty wizard and the unverifiable confirmation fallback without calling either success", () => {
    expect(route("/research/early-access/order-request")).toMatchObject({
      surface: "order-flow",
      state: "empty",
    });
    expect(route("/research/early-access/order-request/confirmation/XRR-20000101-0000000000")).toMatchObject({
      surface: "order-flow",
      state: "unavailable",
      fixture: "no-stored-receipt",
    });
    expect(route("/research/early-access/order-request/XRR-20000101-0000000000")).toMatchObject({
      surface: "order-status",
      state: "neutral-error",
      fixture: "valid-shaped-forged-reference-without-status-token",
    });
  });

  it("keeps loading and unmounted claims test-backed instead of inventing browser screenshots", () => {
    expect(template.testBackedStates.map((entry) => entry.state)).toEqual(["loading", "unmounted"]);
    expect(template.testBackedStates.every((entry) =>
      entry.evidenceRefs.length > 0 && entry.claimScope.includes("not counted as a browser screenshot"),
    )).toBe(true);
  });

  it("limits reviewed assertion notes to exact Hino target-finding fingerprints", () => {
    expect(
      routes.routes
        .filter((candidate) => candidate.externalMicrosite === true)
        .map((candidate) => candidate.path),
    ).toEqual(["/hino"]);
    const withNotes = routes.routes.filter((candidate) => candidate.reviewedAssertionNotes);
    expect(withNotes.map((candidate) => candidate.path)).toEqual(["/hino"]);
    expect(route("/hino")).toMatchObject({
      externalMicrosite: true,
      expectedBrowserPath: "/hino/",
      semanticContract: {
        requiredSelectors: [".home-hero h1"],
        requiredText: ["Built in the ring.", "Proven in the room."],
      },
    });
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
