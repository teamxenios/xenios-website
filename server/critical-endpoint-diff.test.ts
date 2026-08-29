import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_ENDPOINTS,
  captureEndpoint,
  classify,
  shapeFingerprint,
} from "../scripts/release/critical-endpoint-diff.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(
  REPO_ROOT,
  "scripts",
  "release",
  "critical-endpoint-diff.mjs",
);
const CAPTURED_AT = "2026-08-29T12:00:00.000Z";

type Shape = {
  kind: string;
  fingerprint: string;
  state?: string[];
  markers?: {
    root: boolean;
    metaRobots: string | null;
    canonical: string | null;
    ogUrl: string | null;
    jsonLd: number;
    jsonLdTypes: string[];
    title: string | null;
  };
};

type EndpointRecord = {
  method: string;
  path: string;
  routeClass: string;
  status: number;
  contentType: string;
  headers: Record<string, string>;
  shape: Shape;
  ms: number;
};

const DEFAULT_MARKERS = Object.freeze({
  root: true,
  metaRobots: "noindex,nofollow,noarchive",
  canonical: "https://xeniostechnology.com/research",
  ogUrl: "https://xeniostechnology.com/research",
  jsonLd: 0,
  jsonLdTypes: [],
  title: "Xenios Research",
});

function endpointRecord(
  overrides: Partial<Omit<EndpointRecord, "shape">> & { shape?: Partial<Shape> } = {},
): EndpointRecord {
  const base: EndpointRecord = {
    method: "GET",
    path: "/research",
    routeClass: "research-document",
    status: 200,
    contentType: "text/html",
    headers: {},
    shape: {
      kind: "html",
      fingerprint: "0123456789abcdef",
      state: [],
      markers: { ...DEFAULT_MARKERS },
    },
    ms: 1,
  };

  return {
    ...base,
    ...overrides,
    headers: overrides.headers ?? base.headers,
    shape: { ...base.shape, ...overrides.shape },
  };
}

function captureDocument(records: EndpointRecord[], baseUrl = "https://baseline.invalid") {
  return {
    schemaVersion: 1,
    kind: "critical-endpoint-capture",
    baseUrl,
    capturedAt: CAPTURED_AT,
    records,
  };
}

function classifyPair(
  before: EndpointRecord,
  after: EndpointRecord,
  expectations: Record<string, unknown> = { intentionalChanges: [] },
) {
  return classify(
    captureDocument([before]),
    captureDocument([after], "http://candidate.invalid"),
    expectations,
  );
}

function onlyResult(result: ReturnType<typeof classify>) {
  expect(result.results).toHaveLength(1);
  return result.results[0];
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("critical endpoint inventory", () => {
  it("contains exactly 27 unique method/path endpoints", () => {
    expect(DEFAULT_ENDPOINTS).toHaveLength(27);

    const keys = DEFAULT_ENDPOINTS.map(([method, route]) => `${method} ${route}`);
    expect(new Set(keys).size).toBe(27);
    expect(DEFAULT_ENDPOINTS.every(([, route, routeClass]) => route.startsWith("/") && routeClass.length > 0)).toBe(true);

    expect(keys.filter((key) => key.includes("/assisted-orders"))).toEqual([
      "GET /api/research/early-access/assisted-orders/config",
      "GET /api/research/early-access/assisted-orders/catalog",
      "GET /api/research/early-access/assisted-orders/XRR-20260829-A1B2C3D4E5",
      "GET /api/admin/research/assisted-orders",
      "GET /api/admin/research/assisted-orders/11111111-1111-4111-8111-111111111111",
    ]);
    expect(keys.filter((key) => key.startsWith("GET /hino"))).toEqual([
      "GET /hino",
      "GET /hino/",
      "GET /hino/story/",
    ]);
  });
});

describe("checked-in intentional-change expectations", () => {
  it("keeps every allow regex fully anchored and free of unescaped alternation", () => {
    const expectations = JSON.parse(
      readFileSync(
        path.join(
          REPO_ROOT,
          "scripts",
          "release",
          "critical-endpoint-expectations.json",
        ),
        "utf8",
      ),
    ) as {
      intentionalChanges?: Array<{ allow?: string[] }>;
    };

    const patterns = (expectations.intentionalChanges ?? []).flatMap(
      (rule) => rule.allow ?? [],
    );
    expect(patterns.length).toBeGreaterThan(0);

    for (const pattern of patterns) {
      expect(pattern.startsWith("^")).toBe(true);
      expect(pattern.endsWith("$")).toBe(true);
      expect(pattern).not.toMatch(/(^|[^\\])\|/u);
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });

  it("rejects unrelated title mutations from every title allowance", () => {
    const expectations = JSON.parse(
      readFileSync(
        path.join(
          REPO_ROOT,
          "scripts",
          "release",
          "critical-endpoint-expectations.json",
        ),
        "utf8",
      ),
    ) as {
      intentionalChanges?: Array<{ allow?: string[] }>;
    };

    const titlePatterns = (expectations.intentionalChanges ?? [])
      .flatMap((rule) => rule.allow ?? [])
      .filter((pattern) => pattern.startsWith("^html-marker title:"));
    expect(titlePatterns).toHaveLength(9);

    for (const pattern of titlePatterns) {
      expect(
        new RegExp(pattern).test(
          'html-marker title: "xenios TOTALLY UNRELATED CHANGE',
        ),
      ).toBe(false);
    }
  });
});

describe("classify", () => {
  it("classifies an identical capture as SAME with a PASS verdict", () => {
    const record = endpointRecord();
    const result = classifyPair(record, structuredClone(record));

    expect(onlyResult(result)).toMatchObject({
      key: "GET /research",
      classification: "SAME",
      diffs: [],
    });
    expect(result.counts).toEqual({
      SAME: 1,
      INTENTIONAL_CHANGE: 0,
      REGRESSION: 0,
      HUMAN_REVIEW_REQUIRED: 0,
    });
    expect(result.verdict).toBe("PASS");
  });

  it("treats a missing candidate record as a regression", () => {
    const result = classify(
      captureDocument([endpointRecord()]),
      captureDocument([], "http://candidate.invalid"),
      { intentionalChanges: [] },
    );

    expect(onlyResult(result)).toMatchObject({
      key: "GET /research",
      classification: "REGRESSION",
      reason: "endpoint missing from the candidate capture",
    });
    expect(result.verdict).toBe("REGRESSION");
  });

  it("blocks a candidate-only endpoint unless an allowNew expectation names it", () => {
    const candidateOnly = endpointRecord({ path: "/api/new-critical-door" });
    const blocked = classify(
      captureDocument([]),
      captureDocument([candidateOnly], "http://candidate.invalid"),
      { intentionalChanges: [] },
    );
    expect(onlyResult(blocked)).toMatchObject({
      key: "GET /api/new-critical-door",
      classification: "REGRESSION",
    });

    const allowed = classify(
      captureDocument([]),
      captureDocument([candidateOnly], "http://candidate.invalid"),
      {
        intentionalChanges: [{
          method: "GET",
          path: "/api/new-critical-door",
          allowNew: true,
          rationale: "reviewed additive critical door",
          allow: [],
        }],
      },
    );
    expect(onlyResult(allowed)).toMatchObject({
      classification: "INTENTIONAL_CHANGE",
      rationale: "reviewed additive critical door",
    });
    expect(allowed.verdict).toBe("PASS");
  });

  it.each([200, 204, 301, 302, 307, 308, 401, 403])(
    "treats live status %i changing to 404 or 5xx as a regression",
    (liveStatus) => {
      for (const failedStatus of [404, 500, 503]) {
        const result = classifyPair(
          endpointRecord({ status: liveStatus }),
          endpointRecord({ status: failedStatus }),
        );
        const row = onlyResult(result);

        expect(row.classification, `${liveStatus} -> ${failedStatus}`).toBe("REGRESSION");
        expect(row.reason, `${liveStatus} -> ${failedStatus}`).toContain(
          "currently-live critical endpoint disappeared",
        );
        expect(result.verdict).toBe("REGRESSION");
      }
    },
  );

  it("accepts only the differences matched by an intentional-change rule", () => {
    const before = endpointRecord({ headers: { "cache-control": "public" } });
    const after = endpointRecord({ headers: { "cache-control": "private" } });
    const expectations = {
      intentionalChanges: [
        {
          method: "GET",
          path: "/research",
          rationale: "reviewed cache policy change",
          allow: ["^header cache-control: public -> private$"],
        },
      ],
    };

    const intentional = classifyPair(before, after, expectations);
    expect(onlyResult(intentional)).toMatchObject({
      classification: "INTENTIONAL_CHANGE",
      rationale: "reviewed cache policy change",
    });
    expect(intentional.verdict).toBe("PASS");

    const unmatched = classifyPair(
      before,
      endpointRecord({
        headers: {
          "cache-control": "private",
          "referrer-policy": "no-referrer",
        },
      }),
      expectations,
    );
    expect(onlyResult(unmatched)).toMatchObject({ classification: "REGRESSION" });
    expect(onlyResult(unmatched).reason).toContain("header referrer-policy");
    expect(unmatched.verdict).toBe("REGRESSION");
  });

  it("requires human review for an otherwise unchanged shape fingerprint drift", () => {
    const result = classifyPair(
      endpointRecord(),
      endpointRecord({ shape: { fingerprint: "fedcba9876543210" } }),
    );

    expect(onlyResult(result)).toMatchObject({
      classification: "HUMAN_REVIEW_REQUIRED",
      diffs: [
        "shape-fingerprint 0123456789abcdef -> fedcba9876543210",
      ],
    });
    expect(result.verdict).toBe("HUMAN_REVIEW_REQUIRED");
  });

  it("allows only one reviewed fingerprint transition and blocks a third fingerprint", () => {
    const before = endpointRecord();
    const reviewedAfter = endpointRecord({
      shape: { fingerprint: "fedcba9876543210" },
    });
    const expectations = {
      intentionalChanges: [{
        method: "GET",
        path: "/research",
        rationale: "reviewed document skeleton",
        allow: [
          "^shape-fingerprint 0123456789abcdef -> fedcba9876543210$",
        ],
      }],
    };

    const reviewed = classifyPair(before, reviewedAfter, expectations);
    expect(onlyResult(reviewed)).toMatchObject({
      classification: "INTENTIONAL_CHANGE",
      diffs: [
        "shape-fingerprint 0123456789abcdef -> fedcba9876543210",
      ],
    });
    expect(reviewed.verdict).toBe("PASS");

    const unreviewed = classifyPair(
      before,
      endpointRecord({ shape: { fingerprint: "aaaaaaaaaaaaaaaa" } }),
      expectations,
    );
    expect(onlyResult(unreviewed)).toMatchObject({
      classification: "REGRESSION",
    });
    expect(onlyResult(unreviewed).reason).toContain(
      "shape-fingerprint 0123456789abcdef -> aaaaaaaaaaaaaaaa",
    );
    expect(unreviewed.verdict).toBe("REGRESSION");
  });

  it("detects a Link header change", () => {
    const result = classifyPair(
      endpointRecord(),
      endpointRecord({
        headers: {
          link: '<https://xeniostechnology.com/research>; rel="canonical"',
        },
      }),
    );
    const row = onlyResult(result);

    expect(row.classification).toBe("REGRESSION");
    expect(row.diffs.join("\n")).toContain("header link:");
  });

  it.each([
    ["root", false, "root"],
    ["metaRobots", "index,follow", "meta-robots"],
    ["canonical", "https://xeniostechnology.com/not-research", "canonical"],
    ["ogUrl", "https://xeniostechnology.com/not-research", "og-url"],
    ["jsonLd", 1, "json-ld"],
    ["jsonLdTypes", ["Organization"], "json-ld-types"],
    ["title", "Unexpected title", "title"],
  ] as const)("detects an HTML %s marker change even when the skeleton hash is identical", (marker, value, diagnosticLabel) => {
    const beforeMarkers = { ...DEFAULT_MARKERS };
    const afterMarkers = { ...DEFAULT_MARKERS, [marker]: value };
    const result = classifyPair(
      endpointRecord({ shape: { markers: beforeMarkers } }),
      endpointRecord({ shape: { markers: afterMarkers } }),
    );
    const row = onlyResult(result);

    expect(row.classification).toBe("REGRESSION");
    expect(row.diffs.join("\n")).toContain(diagnosticLabel);
    expect(result.verdict).toBe("REGRESSION");
  });
});

describe("shapeFingerprint", () => {
  it("distinguishes equal-length malformed JSON documents without retaining either body", () => {
    const leftBody = "{oops";
    const rightBody = "[oops";
    expect(leftBody).toHaveLength(rightBody.length);

    const left = shapeFingerprint("application/json", leftBody);
    const right = shapeFingerprint("application/json", rightBody);

    expect(left.kind).toBe("json-unparseable");
    expect(right.kind).toBe("json-unparseable");
    expect(left.fingerprint).not.toBe(right.fingerprint);
    expect(JSON.stringify([left, right])).not.toContain("oops");
  });

  it("normalizes checkout line endings for public text evidence", () => {
    const lf = shapeFingerprint("text/plain; charset=utf-8", "User-agent: *\nAllow: /\n");
    const crlf = shapeFingerprint("text/plain; charset=utf-8", "User-agent: *\r\nAllow: /\r\n");

    expect(lf).toEqual(crlf);
  });

  it("detects a same-length text or XML change after the first 64 characters", () => {
    const prefix = "<urlset>" + "x".repeat(80);
    const left = shapeFingerprint("application/xml", `${prefix}A</urlset>`);
    const right = shapeFingerprint("application/xml", `${prefix}B</urlset>`);

    expect(left.fingerprint).not.toBe(right.fingerprint);
    expect(JSON.stringify([left, right])).not.toContain(prefix);
  });

  it("records nested and string feature states without retaining unrelated values", () => {
    const body = JSON.stringify({
      capability: { state: "disabled", enabled: false },
      careAvailable: false,
      customerName: "Ada Private",
    });
    const shape = shapeFingerprint("application/json", body);

    expect(shape.state).toEqual([
      "capability.enabled=false",
      "capability.state=disabled",
      "careAvailable=false",
    ]);
    expect(JSON.stringify(shape)).not.toContain("Ada Private");
  });

  it("records sorted JSON-LD type identities so same-count swaps are visible", () => {
    const html = (type: string) =>
      `<!doctype html><html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"${type}"}</script></head><body><div id="root"></div></body></html>`;
    const organization = shapeFingerprint("text/html", html("Organization"));
    const website = shapeFingerprint("text/html", html("WebSite"));

    expect(organization.markers?.jsonLdTypes).toEqual(["Organization"]);
    expect(website.markers?.jsonLdTypes).toEqual(["WebSite"]);
    expect(organization.markers?.jsonLdTypes).not.toEqual(website.markers?.jsonLdTypes);
  });
});

describe("captureEndpoint", () => {
  it("records only safe metadata and a fingerprint, never the raw sensitive response value", async () => {
    const sensitiveSentinel = "XR-DO-NOT-PERSIST-7e1d7c875c";
    const body = JSON.stringify({ privateToken: sensitiveSentinel, nested: { customer: "Ada" } });
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(body);
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("expected an ephemeral TCP address");

      const record = await captureEndpoint(
        `http://127.0.0.1:${address.port}`,
        "GET",
        "/metadata-fixture",
      );
      const serialized = JSON.stringify(record);

      expect(record).toMatchObject({
        method: "GET",
        path: "/metadata-fixture",
        status: 200,
        contentType: "application/json",
      });
      expect(Object.prototype.hasOwnProperty.call(record, "body")).toBe(false);
      expect(serialized).not.toContain(sensitiveSentinel);
      expect(serialized).not.toContain(body);
      expect(serialized).not.toContain("Ada");
      expect(record.shape.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("times out an unresponsive endpoint and records a non-sensitive unreachable shape", async () => {
    const server = createServer(() => {
      // Deliberately never answer.
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("expected an ephemeral TCP address");
      const record = await captureEndpoint(
        `http://127.0.0.1:${address.port}`,
        "GET",
        "/never-answers",
        25,
      );
      expect(record).toMatchObject({
        status: 0,
        contentType: "",
        shape: { kind: "unreachable", fingerprint: "" },
      });
      expect(JSON.stringify(record)).not.toContain(`127.0.0.1:${address.port}`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

describe("critical-endpoint-diff compare CLI", () => {
  it("returns the unmasked contract exit codes 0, 1, and 2", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "xenios-critical-diff-"));
    temporaryDirectories.push(directory);

    const baseline = captureDocument([endpointRecord()]);
    const candidates = [
      {
        label: "pass",
        expected: 0,
        document: captureDocument([endpointRecord()], "http://candidate.invalid"),
      },
      {
        label: "regression",
        expected: 1,
        document: captureDocument(
          [endpointRecord({ status: 500 })],
          "http://candidate.invalid",
        ),
      },
      {
        label: "review",
        expected: 2,
        document: captureDocument(
          [endpointRecord({ shape: { fingerprint: "fedcba9876543210" } })],
          "http://candidate.invalid",
        ),
      },
    ];

    const baselinePath = path.join(directory, "baseline.json");
    const expectationsPath = path.join(directory, "expectations.json");
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    writeFileSync(expectationsPath, '{"intentionalChanges":[]}\n');

    for (const candidate of candidates) {
      const candidatePath = path.join(directory, `${candidate.label}.json`);
      writeFileSync(candidatePath, `${JSON.stringify(candidate.document, null, 2)}\n`);

      const run = spawnSync(
        process.execPath,
        [
          CLI,
          "compare",
          "--baseline",
          baselinePath,
          "--candidate",
          candidatePath,
          "--expectations",
          expectationsPath,
        ],
        { cwd: REPO_ROOT, encoding: "utf8", timeout: 30_000 },
      );
      const evidence = [
        `case=${candidate.label}`,
        `error=${run.error ? String(run.error) : "none"}`,
        `signal=${run.signal ?? "none"}`,
        `stdout:\n${run.stdout}`,
        `stderr:\n${run.stderr}`,
      ].join("\n");

      expect(run.error, evidence).toBeUndefined();
      expect(run.signal, evidence).toBeNull();
      expect(run.status, evidence).toBe(candidate.expected);
    }
  });
});
