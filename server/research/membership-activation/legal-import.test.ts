import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DocumentLifecycle,
  seedPlaceholderDrafts,
  sha256Hex,
  type DocumentCategory,
} from "./documents";
import { createInMemoryDocumentsStore } from "./persistence/documents-store";
import {
  COUNSEL_APPROVAL_REFERENCE,
  LEGAL_PACKAGE_EFFECTIVE_DATE,
  LEGAL_PACKAGE_RELATIVE_DIR,
  LEGAL_PACKAGE_SEMVER,
  LegalImportConflict,
  LegalImportHashMismatch,
  MEMBER_FACING_IMPORT_PLAN,
  PACKAGE_SIGNING_SEQUENCE,
  isRegistrableMemberFacingSource,
  parseProvenance,
  registerLegalPackage,
} from "./legal-import";

// The real imported package in the repo. These tests intentionally read the
// actual files: hash verification and verbatim preservation are the point.
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PACKAGE_DIR = path.join(REPO_ROOT, LEGAL_PACKAGE_RELATIVE_DIR);

const CATEGORY_ENTRIES = MEMBER_FACING_IMPORT_PLAN.filter((e) => e.target.kind === "category");
const ADDITIONAL_ENTRIES = MEMBER_FACING_IMPORT_PLAN.filter(
  (e) => e.target.kind === "additional_required_document",
);

function build() {
  const store = createInMemoryDocumentsStore();
  let n = 0;
  const lifecycle = new DocumentLifecycle(store, {
    now: () => new Date("2026-07-22T12:00:00.000Z"),
    newId: () => `legal-${++n}`,
  });
  return { store, lifecycle };
}

async function register(overrides: { packageDir?: string } = {}) {
  const { store, lifecycle } = build();
  const result = await registerLegalPackage(lifecycle, store, {
    packageDir: overrides.packageDir ?? PACKAGE_DIR,
  });
  return { store, lifecycle, result };
}

// A tamperable copy of just the member-facing files, in a temp directory.
function copyMemberFacing(destRoot: string): void {
  fs.mkdirSync(path.join(destRoot, "member_facing"), { recursive: true });
  for (const entry of MEMBER_FACING_IMPORT_PLAN) {
    fs.copyFileSync(path.join(PACKAGE_DIR, entry.sourceFile), path.join(destRoot, entry.sourceFile));
  }
}

let tmpRoot: string;
beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xr-legal-import-"));
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The plan and sequence match the package's own machine-readable manifest
// ---------------------------------------------------------------------------

describe("package signing sequence", () => {
  it("covers all 17 member-facing documents with orders exactly 1 through 17", () => {
    expect(MEMBER_FACING_IMPORT_PLAN).toHaveLength(17);
    expect(PACKAGE_SIGNING_SEQUENCE.map((e) => e.signingOrder)).toEqual(
      Array.from({ length: 17 }, (_, i) => i + 1),
    );
  });

  it("puts the electronic records consent first", () => {
    const first = PACKAGE_SIGNING_SEQUENCE[0];
    expect(first.sourceFile).toBe("member_facing/01_electronic_records_signature_consent.md");
    expect(first.target).toEqual({ kind: "category", category: "electronic_record_consent" });
  });

  it("matches the package's website_integration_manifest.json entry by entry", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_DIR, "supporting", "website_integration_manifest.json"), "utf8"),
    ) as {
      documents: Array<{
        document_id: string;
        filename: string;
        title: string;
        signing_order: number;
        stage: string;
        separate_conspicuous_acceptance: boolean;
        required: boolean;
      }>;
    };
    expect(manifest.documents).toHaveLength(17);
    for (const doc of manifest.documents) {
      const entry = MEMBER_FACING_IMPORT_PLAN.find(
        (e) => e.sourceFile === `member_facing/${doc.filename}`,
      );
      expect(entry, doc.filename).toBeDefined();
      expect(entry?.documentId).toBe(doc.document_id);
      expect(entry?.title).toBe(doc.title);
      expect(entry?.signingOrder).toBe(doc.signing_order);
      expect(entry?.stage).toBe(doc.stage);
      expect(entry?.separateConspicuousAcceptance).toBe(doc.separate_conspicuous_acceptance);
      expect(entry?.requirement).toBe(doc.required ? "required" : "optional");
    }
  });

  it("pins every plan hash to the package's RELEASE_HASH_MANIFEST.json value", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_DIR, "RELEASE_HASH_MANIFEST.json"), "utf8"),
    ) as { files: Array<{ path: string; sha256: string }> };
    for (const entry of MEMBER_FACING_IMPORT_PLAN) {
      const listed = manifest.files.find((f) => f.path === entry.sourceFile);
      expect(listed, entry.sourceFile).toBeDefined();
      expect(entry.sourceSha256).toBe(listed?.sha256);
    }
  });

  it("marks separate conspicuous acceptance for exactly arbitration and the release", () => {
    const separate = MEMBER_FACING_IMPORT_PLAN.filter((e) => e.separateConspicuousAcceptance);
    expect(separate.map((e) => e.documentId).sort()).toEqual(["XR-LEGAL-08", "XR-LEGAL-17"]);
    expect(separate.map((e) => e.signingOrder).sort((a, b) => a - b)).toEqual([8, 9]);
  });
});

// ---------------------------------------------------------------------------
// Hash verification: a tampered byte refuses the whole import
// ---------------------------------------------------------------------------

describe("hash verification", () => {
  it("refuses the entire import when one byte of one source is tampered", async () => {
    const tampered = path.join(tmpRoot, "tampered");
    copyMemberFacing(tampered);
    const target = path.join(tampered, "member_facing/08_arbitration_class_jury_waiver.md");
    const bytes = fs.readFileSync(target);
    bytes[bytes.length - 3] = bytes[bytes.length - 3] === 0x61 ? 0x62 : 0x61;
    fs.writeFileSync(target, bytes);

    const { store, lifecycle } = build();
    await expect(
      registerLegalPackage(lifecycle, store, { packageDir: tampered }),
    ).rejects.toBeInstanceOf(LegalImportHashMismatch);

    // Atomic: nothing was registered, not even the untampered documents.
    const all = await store.listVersions();
    expect(all).toHaveLength(0);
  });

  it("refuses when a source file is missing entirely", async () => {
    const partial = path.join(tmpRoot, "partial");
    copyMemberFacing(partial);
    fs.rmSync(path.join(partial, "member_facing/02_privacy_policy.md"));
    const { store, lifecycle } = build();
    await expect(
      registerLegalPackage(lifecycle, store, { packageDir: partial }),
    ).rejects.toThrow(/02_privacy_policy\.md/);
    expect(await store.listVersions()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Registration against the real package
// ---------------------------------------------------------------------------

describe("registerLegalPackage", () => {
  it("registers the twelve category documents at approved_for_publication, not published", async () => {
    const { result } = await register();
    expect(result.registered).toHaveLength(CATEGORY_ENTRIES.length);
    expect(result.registered).toHaveLength(12);
    for (const record of result.registered) {
      expect(record.status).toBe("approved_for_publication");
      expect(record.publishedAt).toBeNull();
      expect(record.semver).toBe(LEGAL_PACKAGE_SEMVER);
      expect(record.counselReview).toBe("approved");
    }
    expect(result.excluded).toEqual([]);
  });

  it("preserves every registered document byte for byte against its source file", async () => {
    const { result } = await register();
    for (const entry of CATEGORY_ENTRIES) {
      const record = result.registered.find(
        (r) => parseProvenance(r.notes)?.sourceFile === entry.sourceFile,
      );
      expect(record, entry.sourceFile).toBeDefined();
      const source = fs.readFileSync(path.join(PACKAGE_DIR, entry.sourceFile), "utf8");
      expect(record?.content).toBe(source);
      expect(record?.contentHash).toBe(sha256Hex(source));
      expect(record?.title).toBe(entry.title);
    }
    for (const entry of ADDITIONAL_ENTRIES) {
      const record = result.additional.find((r) => r.sourceFile === entry.sourceFile);
      expect(record, entry.sourceFile).toBeDefined();
      const source = fs.readFileSync(path.join(PACKAGE_DIR, entry.sourceFile), "utf8");
      expect(record?.content).toBe(source);
      expect(record?.contentHash).toBe(sha256Hex(source));
    }
  });

  it("records provenance on every registered version: source, hash, order, flags, approval, effective date", async () => {
    const { result } = await register();
    for (const record of result.registered) {
      const provenance = parseProvenance(record.notes);
      expect(provenance).not.toBeNull();
      const entry = CATEGORY_ENTRIES.find((e) => e.sourceFile === provenance?.sourceFile);
      expect(entry).toBeDefined();
      expect(provenance?.sourceSha256).toBe(entry?.sourceSha256);
      expect(provenance?.signingOrder).toBe(entry?.signingOrder);
      expect(provenance?.required).toBe(entry?.requirement === "required");
      expect(provenance?.separateConspicuousAcceptance).toBe(entry?.separateConspicuousAcceptance);
      expect(provenance?.counselApprovalReference).toBe(COUNSEL_APPROVAL_REFERENCE);
      expect(provenance?.effectiveDate).toBe(LEGAL_PACKAGE_EFFECTIVE_DATE);
    }
  });

  it("is idempotent: a re-run registers nothing new and the store is unchanged", async () => {
    const { store, lifecycle, result } = await register();
    const before = await store.listVersions();
    const second = await registerLegalPackage(lifecycle, store, { packageDir: PACKAGE_DIR });
    expect(second.registered).toHaveLength(0);
    expect(second.alreadyRegistered).toHaveLength(result.registered.length);
    const after = await store.listVersions();
    expect(after).toEqual(before);
    // The derived additional records are identical run to run.
    expect(second.additional).toEqual(result.additional);
  });

  it("refuses loudly when a category already holds v1.0.0 with different content", async () => {
    const { store, lifecycle } = build();
    const squatter = await lifecycle.createDraft({
      category: "privacy_notice",
      semver: LEGAL_PACKAGE_SEMVER,
      jurisdiction: "Texas",
      content: "Some other text claiming to be the privacy policy v1.0.0.",
    });
    await expect(
      registerLegalPackage(lifecycle, store, { packageDir: PACKAGE_DIR }),
    ).rejects.toBeInstanceOf(LegalImportConflict);
    // Nothing was silently superseded and no package version was written.
    const all = await store.listVersions();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(squatter.id);
  });

  it("leaves previously seeded placeholder drafts standing as drafts beside the real versions", async () => {
    const { store, lifecycle } = build();
    const placeholders = await seedPlaceholderDrafts(lifecycle, store);
    expect(placeholders).toHaveLength(16);
    const result = await registerLegalPackage(lifecycle, store, { packageDir: PACKAGE_DIR });
    expect(result.registered).toHaveLength(12);
    for (const placeholder of placeholders) {
      const still = await store.getVersion(placeholder.id);
      expect(still?.status).toBe("draft");
      expect(still?.semver).toBe("0.1.0");
    }
  });
});

// ---------------------------------------------------------------------------
// SOPs are never signable
// ---------------------------------------------------------------------------

describe("internal policies stay unsignable", () => {
  it("rejects internal_policies and supporting paths as registrable sources", () => {
    expect(isRegistrableMemberFacingSource("internal_policies/01_manual_identity_review_sop.md")).toBe(false);
    expect(isRegistrableMemberFacingSource("supporting/MEMBER_SIGNING_SEQUENCE.md")).toBe(false);
    expect(isRegistrableMemberFacingSource("approval_records/APPROVAL_RECORD_INDEX.md")).toBe(false);
    expect(isRegistrableMemberFacingSource("member_facing/../internal_policies/x.md")).toBe(false);
    expect(isRegistrableMemberFacingSource("member_facing/02_privacy_policy.md")).toBe(true);
  });

  it("registers no document sourced outside member_facing/", async () => {
    const { store, result } = await register();
    for (const record of await store.listVersions()) {
      const provenance = parseProvenance(record.notes);
      expect(provenance?.sourceFile.startsWith("member_facing/")).toBe(true);
    }
    for (const record of result.additional) {
      expect(record.sourceFile.startsWith("member_facing/")).toBe(true);
    }
    // Exactly the 17 member-facing documents, none of the 18 SOPs.
    expect(result.registered.length + result.additional.length).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// Signing order and separate acknowledgment in the registered output
// ---------------------------------------------------------------------------

describe("signing order and acknowledgment flags", () => {
  it("orders registered documents by the package sequence with e-records first", async () => {
    const { result } = await register();
    const orders = result.registered.map((r) => parseProvenance(r.notes)?.signingOrder ?? -1);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(parseProvenance(result.registered[0].notes)?.signingOrder).toBe(1);
    expect(result.registered[0].category).toBe("electronic_record_consent");
  });

  it("sets the domain separate-acknowledgment flag on the arbitration version", async () => {
    const { result } = await register();
    const arbitration = result.registered.find((r) => r.category === "arbitration_agreement");
    expect(arbitration?.requiresSeparateAcknowledgment).toBe(true);
    expect(arbitration?.activationStep).toBe("arbitration_acknowledgment");
    expect(parseProvenance(arbitration?.notes ?? null)?.separateConspicuousAcceptance).toBe(true);
  });

  it("enforces the package's separate conspicuous acceptance for the release document", async () => {
    const { result } = await register();
    const release = result.registered.find((r) => r.category === "membership_covenant");
    expect(release?.title).toBe(
      "Release, Waiver, Covenant Not to Sue, Limitation of Liability and Indemnification",
    );
    const provenance = parseProvenance(release?.notes ?? null);
    expect(provenance?.documentId).toBe("XR-LEGAL-17");
    expect(provenance?.signingOrder).toBe(9);
    expect(provenance?.separateConspicuousAcceptance).toBe(true);
    // The registry flags the covenant slot, so the domain record itself
    // carries and enforces the package-required separate acknowledgment.
    expect(release?.requiresSeparateAcknowledgment).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The registry ends complete
// ---------------------------------------------------------------------------

describe("resulting registry", () => {
  it("holds every required member-facing document at approved_for_publication", async () => {
    const { store, result } = await register();
    for (const entry of CATEGORY_ENTRIES) {
      const categoryName = (entry.target as { kind: "category"; category: DocumentCategory }).category;
      const versions = await store.listVersions(categoryName);
      const imported = versions.find((v) => v.semver === LEGAL_PACKAGE_SEMVER);
      expect(imported, categoryName).toBeDefined();
      expect(imported?.status).toBe("approved_for_publication");
    }
    const requiredAdditional = ADDITIONAL_ENTRIES.filter((e) => e.requirement === "required");
    expect(requiredAdditional).toHaveLength(4);
    for (const entry of requiredAdditional) {
      const record = result.additional.find((r) => r.sourceFile === entry.sourceFile);
      expect(record?.status).toBe("approved_for_publication");
      expect(record?.requirement).toBe("required");
    }
    // The cookie notice is the package's single optional document.
    const cookie = result.additional.find((r) => r.documentId === "XR-LEGAL-16");
    expect(cookie?.requirement).toBe("optional");
  });
});
