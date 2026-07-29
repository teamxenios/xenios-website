import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { PricingProductSource } from "./authoritative-price-resolver";
import * as importModule from "./price-decision-import";
import {
  planImport,
  validateDecisionDocument,
  type DecisionRowIssueCode,
  type DecisionRowValidation,
  type PriceDecisionRow,
} from "./price-decision-import";
// The CLI is deliberately thin; its logic is tested by direct import here.
// eslint-disable-next-line import/no-relative-packages
import * as cli from "../../../scripts/import-price-decisions.mjs";

const AT = "2026-07-28T12:00:00+00:00";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_VARIANT_ID = "33333333-3333-4333-8333-333333333333";

function rawRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    decision_id: "SYN-001",
    product_name: "Synthetic Product",
    variant_selector: "1 vial",
    audience: "member",
    amount_cents: 180000,
    currency: "USD",
    decision_status: "APPROVED",
    production_action: "ACTIVATE_AFTER_EXACT_IDS_AND_READINESS",
    product_id: PRODUCT_ID,
    variant_id: VARIANT_ID,
    effective_at: null,
    expires_at: null,
    status: "active",
    approval_note: "Founder approved SYN-001",
    ...overrides,
  };
}

function firstRow(document: unknown): DecisionRowValidation {
  return validateDecisionDocument(document).rows[0];
}

function expectFatal(
  row: DecisionRowValidation,
  code: DecisionRowIssueCode,
  field?: string,
): void {
  expect(row.valid).toBe(false);
  const match = row.issues.find(
    (issue) =>
      issue.code === code &&
      issue.severity === "fatal" &&
      (field === undefined || issue.field === field),
  );
  expect(match, `expected fatal issue ${code}`).toBeDefined();
}

function decisionRow(
  overrides: Partial<PriceDecisionRow> = {},
): PriceDecisionRow {
  return {
    decisionId: "SYN-001",
    productName: "Synthetic Product",
    variantSelector: "1 vial",
    audience: "member",
    amountCents: 180000,
    currency: "USD",
    decisionStatus: "APPROVED",
    productionAction: "ACTIVATE_AFTER_EXACT_IDS_AND_READINESS",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    effectiveAt: null,
    expiresAt: null,
    status: "active",
    approvalNote: "Founder approved SYN-001",
    ...overrides,
  };
}

function variant(
  overrides: Partial<AdminProductVariant> = {},
): AdminProductVariant {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: "SKU-SYN-1VIAL",
    catalogNumber: null,
    label: "1 vial",
    strength: null,
    size: null,
    format: null,
    presentation: null,
    shippingClass: "standard",
    memberEligible: true,
    status: "approved",
    active: true,
    sortOrder: 0,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function price(overrides: Partial<AdminProductPrice> = {}): AdminProductPrice {
  return {
    id: "price-existing",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "member",
    amountCents: 180000,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00+00:00",
    expiresAt: null,
    status: "active",
    approvalNote: "internal review note",
    version: 1,
    createdBy: "admin",
    approvedBy: "reviewer",
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function detail(
  overrides: Partial<AdminProductDetail> = {},
): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "SYN-PRODUCT",
    slug: "synthetic-product",
    displayName: "Synthetic Product",
    canonicalName: "Synthetic Product",
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research material",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
    content: {
      shortDescription: null,
      longDescription: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      handlingInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      citations: [],
      reviewDate: null,
    },
    variants: [variant()],
    prices: [],
    media: [],
    history: [],
    ...overrides,
  };
}

function source(product: AdminProductDetail | null): PricingProductSource {
  return { readProductForPricing: async () => product };
}

describe("validateDecisionDocument", () => {
  it("accepts a fully valid APPROVED row with exact ids", () => {
    const result = validateDecisionDocument([rawRow()]);
    expect(result.documentValid).toBe(true);
    const row = result.rows[0];
    expect(row.valid).toBe(true);
    if (!row.valid) return;
    expect(row.classification).toBe("READY_FOR_PLANNING");
    expect(row.row.decisionId).toBe("SYN-001");
    expect(row.row.amountCents).toBe(180000);
    expect(row.issues).toEqual([]);
    expect(result.validRows).toHaveLength(1);
  });

  it("accepts an object document with a decisions array", () => {
    const result = validateDecisionDocument({ decisions: [rawRow()] });
    expect(result.documentValid).toBe(true);
    expect(result.counts.valid).toBe(1);
  });

  it("rejects a document that is neither an array nor a decisions object", () => {
    const result = validateDecisionDocument("not a document");
    expect(result.documentValid).toBe(false);
    expect(result.documentIssues[0].code).toBe("invalid_document_shape");
  });

  it("rejects a row that is not an object", () => {
    expectFatal(firstRow([42]), "row_not_object");
  });

  it("tolerates unknown fields but reports them as warnings", () => {
    const result = validateDecisionDocument([
      rawRow({ note_to_self: "remember this" }),
    ]);
    expect(result.documentValid).toBe(true);
    const row = result.rows[0];
    expect(row.valid).toBe(true);
    expect(
      row.issues.filter(
        (issue) =>
          issue.code === "unknown_field" && issue.severity === "warning",
      ),
    ).toHaveLength(1);
    expect(result.counts.warnings).toBe(1);
  });

  it("treats a missing required field as fatal for the row", () => {
    const row = rawRow();
    delete row.product_name;
    expectFatal(firstRow([row]), "missing_required_field", "product_name");
  });

  it("requires every schema key to be present even when nullable", () => {
    const row = rawRow();
    delete row.product_id;
    expectFatal(firstRow([row]), "missing_required_field", "product_id");
  });

  it.each([
    ["non-integer", 1800.5],
    ["zero", 0],
    ["negative", -180000],
    ["string", "180000"],
    ["unsafe", Number.MAX_SAFE_INTEGER + 2],
  ])("rejects %s amount_cents", (_label, amount) => {
    expectFatal(
      firstRow([rawRow({ amount_cents: amount })]),
      "invalid_amount_cents",
    );
  });

  it("rejects any currency other than USD", () => {
    expectFatal(
      firstRow([rawRow({ currency: "EUR" })]),
      "unsupported_currency",
    );
  });

  it("normalizes a lowercase usd to USD", () => {
    const row = firstRow([rawRow({ currency: "usd" })]);
    expect(row.valid).toBe(true);
    if (row.valid) expect(row.row.currency).toBe("USD");
  });

  it("rejects compare_at as an importable decision audience", () => {
    const row = firstRow([rawRow({ audience: "compare_at" })]);
    expectFatal(row, "invalid_audience", "audience");
    const issue = row.issues.find((entry) => entry.code === "invalid_audience");
    expect(issue?.message).toContain("not an importable decision audience");
  });

  it("rejects an unknown audience", () => {
    expectFatal(firstRow([rawRow({ audience: "everyone" })]), "invalid_audience");
  });

  it.each(["retail", "member", "professional", "wholesale"])(
    "accepts the %s audience",
    (audience) => {
      expect(firstRow([rawRow({ audience })]).valid).toBe(true);
    },
  );

  it("rejects an unknown decision_status", () => {
    expectFatal(
      firstRow([rawRow({ decision_status: "MAYBE" })]),
      "invalid_decision_status",
    );
  });

  it("rejects an unknown production_action", () => {
    expectFatal(
      firstRow([rawRow({ production_action: "JUST_DO_IT" })]),
      "invalid_production_action",
    );
  });

  it("rejects an unknown row status", () => {
    expectFatal(firstRow([rawRow({ status: "paused" })]), "invalid_row_status");
  });

  it("rejects a product_id that is not an exact uuid", () => {
    expectFatal(
      firstRow([rawRow({ product_id: "quantum-by-name" })]),
      "invalid_field_type",
      "product_id",
    );
  });

  it("rejects an invalid timestamp", () => {
    expectFatal(
      firstRow([rawRow({ effective_at: "yesterday" })]),
      "invalid_timestamp",
      "effective_at",
    );
  });

  it("rejects a window whose expiry is not after its start", () => {
    expectFatal(
      firstRow([
        rawRow({
          effective_at: "2026-08-01T00:00:00+00:00",
          expires_at: "2026-08-01T00:00:00+00:00",
        }),
      ]),
      "invalid_window",
    );
  });

  it("marks duplicate decision_ids fatal on every involved row", () => {
    const result = validateDecisionDocument([rawRow(), rawRow()]);
    expect(result.documentValid).toBe(false);
    for (const row of result.rows) {
      expectFatal(row, "duplicate_decision_id");
    }
  });

  it("rejects an active PROPOSED row", () => {
    expectFatal(
      firstRow([rawRow({ decision_status: "PROPOSED", status: "active" })]),
      "proposed_row_active",
    );
  });

  it("classifies an inactive PROPOSED row as held, never activatable", () => {
    const row = firstRow([
      rawRow({ decision_status: "PROPOSED", status: "inactive" }),
    ]);
    expect(row.valid).toBe(true);
    if (row.valid) expect(row.classification).toBe("HELD_PROPOSED");
  });

  it("classifies an APPROVED row with null ids as blocked identity, never an error", () => {
    const row = firstRow([rawRow({ product_id: null, variant_id: null })]);
    expect(row.valid).toBe(true);
    if (!row.valid) return;
    expect(row.classification).toBe("BLOCKED_UNRESOLVED_IDENTITY");
    expect(row.issues).toEqual([]);
  });

  it("classifies a QNT-001-shaped row (null ids) as blocked identity", () => {
    const row = firstRow([
      rawRow({
        decision_id: "QNT-001",
        product_name: "Quantum",
        product_id: null,
        variant_id: null,
        approval_note: "Founder approved QNT-001 member price",
      }),
    ]);
    expect(row.valid).toBe(true);
    if (row.valid) expect(row.classification).toBe("BLOCKED_UNRESOLVED_IDENTITY");
  });

  it("marks overlapping windows for the same identity and audience fatal on both rows", () => {
    const result = validateDecisionDocument([
      rawRow({
        decision_id: "SYN-001",
        effective_at: "2026-01-01T00:00:00+00:00",
        expires_at: null,
      }),
      rawRow({
        decision_id: "SYN-002",
        effective_at: "2026-06-01T00:00:00+00:00",
        expires_at: "2026-07-01T00:00:00+00:00",
      }),
    ]);
    expect(result.documentValid).toBe(false);
    for (const row of result.rows) {
      expectFatal(row, "overlapping_window_in_document");
    }
  });

  it("treats two open windows for the same identity as overlapping", () => {
    const result = validateDecisionDocument([
      rawRow({ decision_id: "SYN-001" }),
      rawRow({ decision_id: "SYN-002" }),
    ]);
    expect(result.documentValid).toBe(false);
  });

  it("allows non-overlapping windows for the same identity", () => {
    const result = validateDecisionDocument([
      rawRow({
        decision_id: "SYN-001",
        effective_at: "2026-01-01T00:00:00+00:00",
        expires_at: "2026-02-01T00:00:00+00:00",
      }),
      rawRow({
        decision_id: "SYN-002",
        effective_at: "2026-03-01T00:00:00+00:00",
        expires_at: null,
      }),
    ]);
    expect(result.documentValid).toBe(true);
  });

  it("allows overlapping windows when the audience differs", () => {
    const result = validateDecisionDocument([
      rawRow({ decision_id: "SYN-001", audience: "member" }),
      rawRow({ decision_id: "SYN-002", audience: "retail" }),
    ]);
    expect(result.documentValid).toBe(true);
  });

  it("allows overlapping windows when the variant differs", () => {
    const result = validateDecisionDocument([
      rawRow({ decision_id: "SYN-001" }),
      rawRow({ decision_id: "SYN-002", variant_id: OTHER_VARIANT_ID }),
    ]);
    expect(result.documentValid).toBe(true);
  });
});

describe("planImport", () => {
  it("rejects an invalid evaluatedAt", async () => {
    await expect(
      planImport({ rows: [], source: null, evaluatedAt: "soon" }),
    ).rejects.toThrow(RangeError);
  });

  it("never activates a PROPOSED row, even with exact ids and a ready product", async () => {
    const report = await planImport({
      rows: [decisionRow({ decisionStatus: "PROPOSED", status: "inactive" })],
      source: source(detail()),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("no_op");
    expect(report.rows[0].reasons[0]).toContain("never activatable");
  });

  it("classifies null ids as unresolved identity", async () => {
    const report = await planImport({
      rows: [decisionRow({ productId: null, variantId: null })],
      source: source(detail()),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("unresolved_identity");
    expect(report.rows[0].reasons[0]).toContain("product_id and variant_id");
  });

  it("blocks rows with exact ids when readers are absent", async () => {
    const report = await planImport({
      rows: [decisionRow()],
      source: null,
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("blocked_readiness");
    expect(report.rows[0].reasons[0]).toContain(
      "identity resolution is unavailable",
    );
  });

  it("blocks when no canonical product row resolves", async () => {
    const report = await planImport({
      rows: [decisionRow()],
      source: source(null),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("blocked_readiness");
    expect(report.rows[0].reasons[0]).toContain("no canonical product row");
  });

  it.each([
    ["unpublished product", detail({ status: "draft" }), "not published"],
    ["inactive product", detail({ active: false }), "product is not active"],
    ["missing variant", detail({ variants: [] }), "no variant resolves"],
    [
      "unapproved variant",
      detail({ variants: [variant({ status: "draft" })] }),
      "not approved",
    ],
    [
      "inactive variant",
      detail({ variants: [variant({ active: false })] }),
      "variant is not active",
    ],
    [
      "member-ineligible variant",
      detail({ variants: [variant({ memberEligible: false })] }),
      "not member eligible",
    ],
  ])("blocks readiness for a %s", async (_label, product, expected) => {
    const report = await planImport({
      rows: [decisionRow()],
      source: source(product),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("blocked_readiness");
    expect(report.rows[0].reasons.join(" ")).toContain(expected);
  });

  it("detects a conflict with an existing overlapping active price", async () => {
    const report = await planImport({
      rows: [decisionRow()],
      source: source(detail({ prices: [price({ amountCents: 170000 })] })),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("conflict_existing_active");
    expect(report.rows[0].reasons[0]).toContain("different amount");
  });

  it("classifies an identical existing active price as no_op", async () => {
    const report = await planImport({
      rows: [decisionRow()],
      source: source(detail({ prices: [price()] })),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("no_op");
  });

  it("does not conflict with an active price whose window ended before the decision starts", async () => {
    const report = await planImport({
      rows: [decisionRow({ effectiveAt: "2026-01-01T00:00:00+00:00" })],
      source: source(
        detail({
          prices: [
            price({
              effectiveAt: "2025-01-01T00:00:00+00:00",
              expiresAt: "2025-02-01T00:00:00+00:00",
            }),
          ],
        }),
      ),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("insert");
  });

  it("plans an update when a pending draft row exists for the identity", async () => {
    const report = await planImport({
      rows: [decisionRow()],
      source: source(
        detail({ prices: [price({ status: "draft", approvedBy: null })] }),
      ),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("update");
  });

  it("plans an insert when no price row exists for the identity", async () => {
    const report = await planImport({
      rows: [decisionRow()],
      source: source(detail()),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("insert");
  });

  it("ignores prices for other audiences or variants when planning", async () => {
    const report = await planImport({
      rows: [decisionRow()],
      source: source(
        detail({
          prices: [
            price({ audience: "retail", amountCents: 220000 }),
            price({ id: "price-other", variantId: OTHER_VARIANT_ID }),
          ],
        }),
      ),
      evaluatedAt: AT,
    });
    expect(report.rows[0].classification).toBe("insert");
  });

  it("aggregates counts across classifications", async () => {
    const report = await planImport({
      rows: [
        decisionRow({ decisionId: "SYN-001" }),
        decisionRow({ decisionId: "SYN-002", productId: null }),
        decisionRow({
          decisionId: "SYN-003",
          decisionStatus: "PROPOSED",
          status: "inactive",
        }),
      ],
      source: source(detail()),
      evaluatedAt: AT,
    });
    expect(report.counts).toEqual({
      insert: 1,
      update: 0,
      no_op: 1,
      conflict_existing_active: 0,
      unresolved_identity: 1,
      blocked_readiness: 0,
    });
    expect(report.dryRun).toBe(true);
    expect(report.executionPath).toBe("none");
    expect(report.note).toContain("research_admin_create_product_price");
  });

  it("exports no mutation path of any kind", () => {
    const exported = Object.entries(
      importModule as Record<string, unknown>,
    ).filter(([, value]) => typeof value === "function");
    expect(exported.length).toBeGreaterThan(0);
    for (const [name] of exported) {
      expect(name).not.toMatch(
        /execute|apply|commit|persist|write|mutate|activate|create|approve/i,
      );
    }
  });
});

describe("import-price-decisions CLI", () => {
  const fixture = [
    rawRow({
      decision_id: "QNT-001",
      product_name: "Quantum",
      product_id: null,
      variant_id: null,
      approval_note: "Founder approved QNT-001 member price",
    }),
  ];

  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    return {
      out,
      err,
      io: {
        log: (line: string) => out.push(line),
        error: (line: string) => err.push(line),
        loadModules: async () => importModule,
        now: () => AT,
      },
    };
  }

  it.each(["--execute", "--live", "--EXECUTE", "--apply", "--live=now"])(
    "detects the execution flag %s",
    (flag) => {
      expect(cli.findExecutionFlag(["decisions.json", flag])).toBe(flag);
    },
  );

  it("finds no execution flag in a clean invocation", () => {
    expect(cli.findExecutionFlag(["decisions.json"])).toBeNull();
  });

  it("refuses execution flags before doing anything else", async () => {
    const { err, io } = capture();
    const code = await cli.runCli(["decisions.json", "--execute"], io);
    expect(code).toBe(2);
    const text = err.join("\n");
    expect(text).toContain("REFUSED");
    expect(text).toContain("dry-run only");
    expect(text).toContain("research_admin_create_product_price");
  });

  it("prints usage when no path is given", async () => {
    const { err, io } = capture();
    const code = await cli.runCli([], io);
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("Usage:");
  });

  it("exits 2 when the file cannot be read", async () => {
    const { io } = capture();
    const code = await cli.runCli(["missing.json"], {
      ...io,
      readFile: () => {
        throw new Error("no such file");
      },
    });
    expect(code).toBe(2);
  });

  it("exits 1 on invalid JSON", async () => {
    const { io } = capture();
    const code = await cli.runCli(["bad.json"], {
      ...io,
      readFile: () => "{ not json",
    });
    expect(code).toBe(1);
  });

  it("runs a readers-absent dry run and reports unresolved identity", async () => {
    const { out, io } = capture();
    const code = await cli.runCli(["decisions.json"], {
      ...io,
      readFile: () => JSON.stringify(fixture),
    });
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("DRY RUN ONLY");
    expect(text).toContain("NO DATABASE WAS TOUCHED");
    expect(text).toContain("BLOCKED_UNRESOLVED_IDENTITY");
    expect(text).toContain("unresolved_identity");
    expect(text).toContain("research_admin_create_product_price");
    expect(text).toContain("research_admin_approve_product_price");
  });

  it("exits 1 and skips the plan on fatal schema errors", async () => {
    const { out, io } = capture();
    const code = await cli.runCli(["decisions.json"], {
      ...io,
      readFile: () =>
        JSON.stringify([rawRow({ amount_cents: -5 }), "not a row"]),
    });
    expect(code).toBe(1);
    const text = out.join("\n");
    expect(text).toContain("fatal");
    expect(text).toContain("No dry-run plan");
    expect(text).toContain("NO DATABASE WAS TOUCHED");
  });

  it("formats a report that names both protected RPCs", async () => {
    const validation = validateDecisionDocument(fixture);
    const plan = await planImport({
      rows: validation.validRows,
      source: null,
      evaluatedAt: AT,
    });
    const text = cli.formatDryRunReport(validation, plan);
    expect(text).toContain("research_admin_create_product_price");
    expect(text).toContain("research_admin_approve_product_price");
    expect(text).toContain("NO DATABASE WAS TOUCHED");
  });

  it(
    "smoke: spawning node on a fixture file dry-runs and refuses --live",
    { timeout: 120_000 },
    () => {
      const testDir = path.dirname(fileURLToPath(import.meta.url));
      const repoRoot = path.resolve(testDir, "..", "..", "..");
      const script = path.join(
        repoRoot,
        "scripts",
        "import-price-decisions.mjs",
      );
      const tempDir = mkdtempSync(
        path.join(os.tmpdir(), "xenios-price-dryrun-"),
      );
      try {
        const fixturePath = path.join(tempDir, "synthetic-decisions.json");
        writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

        const run = spawnSync(process.execPath, [script, fixturePath], {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: 90_000,
        });
        // Carry the child's output into the failure message so a CI-only
        // failure is diagnosable straight from the test report.
        const runEvidence = `child stderr:\n${run.stderr}\nchild stdout:\n${run.stdout}`;
        expect(run.status, runEvidence).toBe(0);
        expect(run.stdout, runEvidence).toContain("DRY RUN ONLY");
        expect(run.stdout, runEvidence).toContain("NO DATABASE WAS TOUCHED");
        expect(run.stdout, runEvidence).toContain("unresolved_identity");

        const refused = spawnSync(
          process.execPath,
          [script, fixturePath, "--live"],
          { cwd: repoRoot, encoding: "utf8", timeout: 90_000 },
        );
        const refusedEvidence = `child stderr:\n${refused.stderr}\nchild stdout:\n${refused.stdout}`;
        expect(refused.status, refusedEvidence).toBe(2);
        expect(refused.stderr, refusedEvidence).toContain("REFUSED");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
  );
});
