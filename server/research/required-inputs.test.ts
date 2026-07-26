import express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  registerRequiredInputApi,
  type RequiredInputRepository,
} from "./required-inputs";
import {
  valueMayBeStored,
  type DomainReadiness,
  type RequiredInput,
} from "@shared/research/required-inputs";

const INPUT: RequiredInput = {
  id: "077ff55c-8787-4713-9802-1e7d697ac967",
  key: "products.variant.retail_price",
  domain: "products",
  label: "RETAIL PRICE REQUIRED",
  description: "Approved price for the exact product variant.",
  whyRequired: "Commerce cannot publish without an approved price.",
  recordType: "product_variant",
  recordId: null,
  fieldPath: "pricing.retail",
  currentState: "missing",
  blockingLevel: "blocks_transaction",
  responsibleRole: "product_admin",
  verificationMethod: "Product administrator review.",
  evidenceRequired: ["Approved price record", "Effective date"],
  entryMode: "record_reference",
  enteredValue: null,
  externalReferenceName: null,
  enteredBy: null,
  enteredAt: null,
  verifiedBy: null,
  verifiedAt: null,
  rejectionReason: null,
  publicLaunchImpact: "Product commerce remains unavailable.",
  nextAction: "Enter and approve the price.",
  adminEntryHref: "/admin/research/products",
  version: 1,
  auditHistory: [],
};

const READINESS: DomainReadiness = {
  domain: "products",
  launchStatus: "internal_review",
  softwareComplete: true,
  realInputsRequired: true,
  publicEnabled: false,
  manifestApproved: true,
  expectedInputCount: 1,
  actualInputCount: 1,
  blockingInputCount: 1,
  blockingKeys: [INPUT.key],
  version: 2,
};

function harness() {
  const repository = {
    list: vi.fn(async () => [INPUT]),
    readinessAll: vi.fn(async () => [READINESS]),
    define: vi.fn(async () => INPUT),
    transition: vi.fn(async () => ({
      ...INPUT,
      currentState: "entered" as const,
      version: 2,
    })),
    setManifest: vi.fn(async () => READINESS),
    readiness: vi.fn(async () => READINESS),
    transitionLaunch: vi.fn(async () => READINESS),
  } satisfies RequiredInputRepository;
  const app = express();
  app.use(express.json());
  registerRequiredInputApi(app, repository, (req, _res, next) => {
    (req as typeof req & { adminEmail: string }).adminEmail =
      "release@example.test";
    next();
  });
  return { app, repository };
}

describe("required-input and readiness APIs", () => {
  it("does not read governance records before administrator authorization", async () => {
    const { repository } = harness();
    const app = express();
    app.use(express.json());
    registerRequiredInputApi(app, repository, (_req, res) =>
      res.status(401).json({ ok: false, code: "sign_in_required" }),
    );

    const response = await request(app).get(
      "/api/admin/research/required-inputs",
    );
    expect(response.status).toBe(401);
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.readinessAll).not.toHaveBeenCalled();
  });

  it("returns exact input and readiness summaries behind the admin boundary", async () => {
    const { app } = harness();
    const response = await request(app).get(
      "/api/admin/research/required-inputs",
    );

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({
      total: 1,
      missing: 1,
      transactionBlocking: 1,
      verified: 0,
    });
    expect(response.body.items[0]).toMatchObject({
      label: "RETAIL PRICE REQUIRED",
      currentState: "missing",
    });
    expect(response.body.readiness).toEqual([READINESS]);
  });

  it("refuses vague or malformed input definitions before persistence", async () => {
    const { app, repository } = harness();
    const response = await request(app)
      .post("/api/admin/research/required-inputs")
      .send({ key: "TBD", label: "Missing" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("validation_failed");
    expect(repository.define).not.toHaveBeenCalled();
  });

  it("passes optimistic version and actor through an allowed state transition", async () => {
    const { app, repository } = harness();
    const response = await request(app)
      .post(
        `/api/admin/research/required-inputs/${INPUT.id}/transition`,
      )
      .send({
        expectedVersion: 1,
        targetState: "entered",
        externalReferenceName: "price-record:variant-1",
        reason: "Approved source record entered for review.",
      });

    expect(response.status).toBe(200);
    expect(repository.transition).toHaveBeenCalledWith(
      INPUT.id,
      expect.objectContaining({
        expectedVersion: 1,
        targetState: "entered",
      }),
      "release@example.test",
    );
  });

  it("requires an exact entered value or reference for entered state", async () => {
    const { app, repository } = harness();
    const response = await request(app)
      .post(
        `/api/admin/research/required-inputs/${INPUT.id}/transition`,
      )
      .send({
        expectedVersion: 1,
        targetState: "entered",
        reason: "Attempted without the required source record.",
      });

    expect(response.status).toBe(400);
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it("keeps secret entry modes reference-only", () => {
    expect(valueMayBeStored("external_secret", "secret-value")).toBe(false);
    expect(valueMayBeStored("external_secret", null)).toBe(true);
    expect(valueMayBeStored("direct", "approved-value")).toBe(true);
  });

  it("routes launch transitions through the server validator", async () => {
    const { app, repository } = harness();
    const response = await request(app)
      .post("/api/admin/research/readiness/products/transition")
      .send({
        expectedVersion: 2,
        targetStatus: "ready_for_real_data",
        reason: "Internal review completed.",
      });

    expect(response.status).toBe(200);
    expect(repository.transitionLaunch).toHaveBeenCalledWith(
      "products",
      expect.objectContaining({ targetStatus: "ready_for_real_data" }),
      "release@example.test",
    );
  });
});

describe("required-input readiness migration posture", () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      "../../supabase/research-required-input-readiness.sql",
    ),
    "utf8",
  );

  it("forces RLS and denies browser authority on every governance table", () => {
    expect(sql.match(/force row level security/g)).toHaveLength(4);
    expect(sql.match(/revoke all on table/g)).toHaveLength(4);
    expect(sql).not.toMatch(/create\s+policy/i);
  });

  it("creates no operational, required-input, or launch-control seed rows", () => {
    const declarativeMigration = sql.split(
      "create or replace function public.research_define_required_input",
    )[0];
    expect(declarativeMigration).not.toMatch(/insert\s+into/i);
    expect(sql).not.toMatch(
      /insert into public\.research_(products|orders|inventory|members|care)\s*\(/i,
    );
    expect(sql).not.toMatch(
      /select\s+public\.research_(define_required_input|set_readiness_manifest)\s*\(/i,
    );
  });

  it("keeps governance audit append-only with a fixed search path", () => {
    expect(sql).toContain("research_required_input_audit_no_mutation");
    expect(sql).toContain("research_domain_launch_audit_no_mutation");
    expect(sql).toMatch(/set search_path = pg_catalog/);
  });

  it("fails public enablement closed on manifest, count, or blocking inputs", () => {
    expect(sql).toContain("if p_target_status = 'public_enabled'");
    expect(sql).toContain("v_before.manifest_hash is null");
    expect(sql).toContain("<> (v_readiness->>'expectedInputCount')::integer");
    expect(sql).toContain(
      "(v_readiness->>'blockingInputCount')::integer <> 0",
    );
  });

  it("never stores a credential value for an external-secret input", () => {
    expect(sql).toContain(
      "entry_mode <> 'external_secret' or entered_value is null",
    );
    expect(sql).toContain("secret_value_forbidden");
    expect(sql).toContain("secret_reference_name_invalid");
    expect(sql).toContain("research_required_input_sensitive_reference_only");
  });

  it("requires review and an independent verifier before resolution", () => {
    expect(sql).toContain(
      "when 'under_review' then p_target_state in ('verified', 'rejected', 'not_applicable')",
    );
    expect(sql).toContain("independent_verifier_required");
  });
});
