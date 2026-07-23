import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex, type DocumentVersionRecord } from "../documents";
import { DuplicateSignature, type SignatureRecord } from "../signatures";
import {
  createInMemoryDocumentsStore,
  createSupabaseDocumentsStore,
  resolveDocumentsStore,
  rowToSignature,
  rowToVersion,
  signatureToRow,
  versionToRow,
  type DocumentVersionRow,
  type SignatureRow,
} from "./documents-store";

const NOW = "2026-07-22T12:00:00.000Z";
const CONTENT = "DRAFT PLACEHOLDER, counsel-provided text replaces this before publication.";

function version(overrides: Partial<DocumentVersionRecord> = {}): DocumentVersionRecord {
  return {
    id: "0f5b3a1c-0000-4000-8000-000000000001",
    category: "founding_membership_agreement",
    title: "Founding Membership Agreement",
    semver: "1.0.0",
    status: "draft",
    effectiveDate: null,
    publishedAt: null,
    jurisdiction: "PLACEHOLDER, counsel to determine",
    content: CONTENT,
    contentHash: sha256Hex(CONTENT),
    downloadRef: null,
    requirement: "required",
    activationStep: "activation_agreements",
    reacceptanceRequired: false,
    requiresSeparateAcknowledgment: false,
    supersededVersionId: null,
    publisher: null,
    counselReview: "not_reviewed",
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function signature(overrides: Partial<SignatureRecord> = {}): SignatureRecord {
  return {
    id: "0f5b3a1c-0000-4000-8000-000000000101",
    memberId: "11111111-1111-4111-8111-111111111111",
    documentVersionId: "0f5b3a1c-0000-4000-8000-000000000001",
    category: "founding_membership_agreement",
    semver: "1.0.0",
    contentHash: sha256Hex(CONTENT),
    typedLegalName: "Sam Member",
    fullDocumentShown: true,
    affirmativeConsent: true,
    separateAcknowledgment: false,
    electronicConsentVersionId: "0f5b3a1c-0000-4000-8000-000000000002",
    ipHash: sha256Hex("203.0.113.9"),
    userAgentHash: sha256Hex("vitest"),
    signedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("version row mapping", () => {
  it("round-trips a draft version through the mappers", () => {
    const rec = version();
    expect(rowToVersion(versionToRow(rec))).toEqual(rec);
  });

  it("round-trips a published version with every field set", () => {
    const rec = version({
      status: "published",
      publishedAt: NOW,
      effectiveDate: "2026-07-22",
      publisher: "counsel-ops",
      counselReview: "approved",
      downloadRef: "media:doc-1",
      supersededVersionId: "0f5b3a1c-0000-4000-8000-000000000009",
      notes: "published",
    });
    expect(rowToVersion(versionToRow(rec))).toEqual(rec);
  });

  it("stamps the tenant column on every row", () => {
    expect(versionToRow(version()).tenant).toBe("xenios_research");
    expect(signatureToRow(signature()).tenant).toBe("xenios_research");
  });

  it("drops a row with an unknown category, status, requirement, or step rather than guessing", () => {
    const base = versionToRow(version());
    expect(rowToVersion({ ...base, category: "secret_addendum" } as DocumentVersionRow)).toBeNull();
    expect(rowToVersion({ ...base, status: "half_published" } as DocumentVersionRow)).toBeNull();
    expect(rowToVersion({ ...base, requirement: "suggested" } as DocumentVersionRow)).toBeNull();
    expect(rowToVersion({ ...base, activation_step: "step_zero" } as DocumentVersionRow)).toBeNull();
    expect(rowToVersion({ ...base, counsel_review: "vibes" } as DocumentVersionRow)).toBeNull();
  });
});

describe("signature row mapping", () => {
  it("round-trips a signature through the mappers", () => {
    const rec = signature();
    expect(rowToSignature(signatureToRow(rec))).toEqual(rec);
  });

  it("round-trips an arbitration signature with the separate acknowledgment", () => {
    const rec = signature({ category: "arbitration_agreement", separateAcknowledgment: true });
    expect(rowToSignature(signatureToRow(rec))).toEqual(rec);
  });

  it("refuses to hydrate a row missing either attestation (this system never wrote it)", () => {
    const base = signatureToRow(signature());
    expect(rowToSignature({ ...base, affirmative_consent: false } as SignatureRow)).toBeNull();
    expect(rowToSignature({ ...base, full_document_shown: false } as SignatureRow)).toBeNull();
  });

  it("drops a signature row with an unknown category", () => {
    const base = signatureToRow(signature());
    expect(rowToSignature({ ...base, category: "secret_addendum" } as SignatureRow)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// In-memory reference
// ---------------------------------------------------------------------------

describe("createInMemoryDocumentsStore", () => {
  it("inserts, gets, lists, and filters versions by category", async () => {
    const store = createInMemoryDocumentsStore();
    await store.insertVersion(version({ id: "v1" }));
    await store.insertVersion(version({ id: "v2", category: "privacy_notice", title: "Privacy Notice" }));

    expect((await store.getVersion("v1"))!.id).toBe("v1");
    expect(await store.getVersion("missing")).toBeNull();
    expect(await store.listVersions()).toHaveLength(2);
    const filtered = await store.listVersions("privacy_notice");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("v2");
  });

  it("refuses a duplicate insert and an update of a missing version", async () => {
    const store = createInMemoryDocumentsStore();
    await store.insertVersion(version({ id: "v1" }));
    await expect(store.insertVersion(version({ id: "v1" }))).rejects.toThrow();
    await expect(store.updateVersion(version({ id: "ghost" }))).rejects.toThrow();
  });

  it("getPublished returns only the published version of the category", async () => {
    const store = createInMemoryDocumentsStore();
    await store.insertVersion(version({ id: "v1", status: "superseded", publishedAt: NOW, counselReview: "approved" }));
    await store.insertVersion(
      version({ id: "v2", semver: "2.0.0", status: "published", publishedAt: NOW, counselReview: "approved" }),
    );
    await store.insertVersion(version({ id: "v3", semver: "3.0.0", status: "draft" }));

    const published = await store.getPublished("founding_membership_agreement");
    expect(published!.id).toBe("v2");
    expect(await store.getPublished("privacy_notice")).toBeNull();
  });

  it("enforces one signature per member per version with a typed duplicate error", async () => {
    const store = createInMemoryDocumentsStore();
    await store.insertSignature(signature({ id: "s1" }));
    await expect(store.insertSignature(signature({ id: "s2" }))).rejects.toThrow(DuplicateSignature);
    // A different member on the same version is fine.
    await store.insertSignature(signature({ id: "s3", memberId: "22222222-2222-4222-8222-222222222222" }));
  });

  it("scopes signature reads to the member", async () => {
    const store = createInMemoryDocumentsStore();
    await store.insertSignature(signature({ id: "s1" }));
    await store.insertSignature(
      signature({ id: "s2", memberId: "22222222-2222-4222-8222-222222222222" }),
    );
    const mine = await store.listSignaturesForMember("11111111-1111-4111-8111-111111111111");
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe("s1");
    expect(
      await store.getSignature("11111111-1111-4111-8111-111111111111", "0f5b3a1c-0000-4000-8000-000000000001"),
    ).not.toBeNull();
    expect(await store.getSignature("ghost", "0f5b3a1c-0000-4000-8000-000000000001")).toBeNull();
  });

  it("has no update and no delete for signatures (structural append-only port)", () => {
    const store = createInMemoryDocumentsStore();
    const surface = Object.keys(store as unknown as Record<string, unknown>);
    expect(surface).not.toContain("updateSignature");
    expect(surface).not.toContain("deleteSignature");
    expect(surface).not.toContain("deleteVersion");
  });

  it("does not let a caller mutate stored records through a returned reference", async () => {
    const store = createInMemoryDocumentsStore();
    await store.insertVersion(version({ id: "v1" }));
    const loaded = await store.getVersion("v1");
    loaded!.content = "tampered";
    expect((await store.getVersion("v1"))!.content).toBe(CONTENT);

    await store.insertSignature(signature({ id: "s1" }));
    const signatures = await store.listSignaturesForMember("11111111-1111-4111-8111-111111111111");
    (signatures[0] as { typedLegalName: string }).typedLegalName = "tampered";
    expect(
      (await store.listSignaturesForMember("11111111-1111-4111-8111-111111111111"))[0].typedLegalName,
    ).toBe("Sam Member");
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store, exercised against a fake client (no network)
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the supabase-js fluent client covering exactly the calls
 * the documents store makes. It records every operation per table so a test
 * can prove the signatures table only ever sees inserts.
 */
function fakeSupabase(options: { failSignatureInsertWith?: string } = {}): {
  client: SupabaseClient;
  versions: Map<string, DocumentVersionRow>;
  signatures: SignatureRow[];
  ops: Array<{ table: string; op: string }>;
} {
  const versions = new Map<string, DocumentVersionRow>();
  const signatures: SignatureRow[] = [];
  const ops: Array<{ table: string; op: string }> = [];

  function builder(table: string) {
    const state: {
      op: string;
      filters: Array<{ col: string; val: unknown }>;
      payload?: unknown;
    } = { op: "select", filters: [] };
    const api: Record<string, unknown> = {};

    const matches = (row: Record<string, unknown>) =>
      state.filters.every((f) => row[f.col] === f.val);

    const result = (single: boolean): { data: unknown; error: { code?: string; message: string } | null } => {
      ops.push({ table, op: state.op });
      if (table === "research_fm_document_versions") {
        if (state.op === "select") {
          const rows = Array.from(versions.values()).filter((r) =>
            matches(r as unknown as Record<string, unknown>),
          );
          return { data: single ? (rows[0] ?? null) : rows, error: null };
        }
        if (state.op === "insert") {
          const row = state.payload as DocumentVersionRow;
          if (versions.has(row.id)) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          versions.set(row.id, { ...row });
          return { data: null, error: null };
        }
        if (state.op === "update") {
          const idFilter = state.filters.find((f) => f.col === "id");
          const existing = idFilter ? versions.get(String(idFilter.val)) : undefined;
          if (!existing) return { data: null, error: null };
          const merged = { ...existing, ...(state.payload as Partial<DocumentVersionRow>) };
          versions.set(existing.id, merged as DocumentVersionRow);
          return { data: single ? { id: existing.id } : [{ id: existing.id }], error: null };
        }
      }
      if (table === "research_fm_document_signatures") {
        if (state.op === "select") {
          const rows = signatures.filter((r) => matches(r as unknown as Record<string, unknown>));
          return { data: single ? (rows[0] ?? null) : rows, error: null };
        }
        if (state.op === "insert") {
          if (options.failSignatureInsertWith) {
            return {
              data: null,
              error: { code: options.failSignatureInsertWith, message: "insert refused" },
            };
          }
          const row = state.payload as SignatureRow;
          const duplicate = signatures.some(
            (s) => s.member_id === row.member_id && s.document_version_id === row.document_version_id,
          );
          if (duplicate) return { data: null, error: { code: "23505", message: "duplicate key" } };
          signatures.push({ ...row });
          return { data: null, error: null };
        }
      }
      return { data: null, error: null };
    };

    Object.assign(api, {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters.push({ col, val });
        return api;
      },
      insert(payload: unknown) {
        state.op = "insert";
        state.payload = payload;
        return api;
      },
      update(payload: unknown) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      maybeSingle() {
        return Promise.resolve(result(true));
      },
      then(onF: (v: { data: unknown; error: { code?: string; message: string } | null }) => unknown) {
        return Promise.resolve(result(false)).then(onF);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, versions, signatures, ops };
}

describe("createSupabaseDocumentsStore (fake client)", () => {
  it("inserts then loads a version round-trip", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseDocumentsStore(client);
    const rec = version();
    await store.insertVersion(rec);
    expect(await store.getVersion(rec.id)).toEqual(rec);
  });

  it("updates a version in place and throws when the row is missing", async () => {
    const { client, versions } = fakeSupabase();
    const store = createSupabaseDocumentsStore(client);
    const rec = version();
    await store.insertVersion(rec);
    await store.updateVersion({ ...rec, status: "under_legal_review" });
    expect(versions.size).toBe(1);
    expect((await store.getVersion(rec.id))!.status).toBe("under_legal_review");
    await expect(store.updateVersion(version({ id: "ghost" }))).rejects.toThrow(/matched no row/);
  });

  it("throws loudly on a version insert failure", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseDocumentsStore(client);
    const rec = version();
    await store.insertVersion(rec);
    await expect(store.insertVersion(rec)).rejects.toThrow(/insert failed/);
  });

  it("lists versions by category and finds the single published one", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseDocumentsStore(client);
    await store.insertVersion(version({ id: "v1", status: "superseded", publishedAt: NOW, counselReview: "approved" }));
    await store.insertVersion(
      version({ id: "v2", semver: "2.0.0", status: "published", publishedAt: NOW, counselReview: "approved" }),
    );
    await store.insertVersion(version({ id: "v3", category: "privacy_notice", title: "Privacy Notice" }));

    expect(await store.listVersions("founding_membership_agreement")).toHaveLength(2);
    const published = await store.getPublished("founding_membership_agreement");
    expect(published!.id).toBe("v2");
    expect(await store.getPublished("privacy_notice")).toBeNull();
  });

  it("drops unknown rows on read instead of hydrating them", async () => {
    const { client, versions } = fakeSupabase();
    const store = createSupabaseDocumentsStore(client);
    const rec = version();
    await store.insertVersion(rec);
    versions.set("bad", { ...versionToRow(version({ id: "bad" })), status: "half_published" });
    expect(await store.listVersions("founding_membership_agreement")).toHaveLength(1);
    expect(await store.getVersion("bad")).toBeNull();
  });

  it("persists and reads signatures, scoped to the member", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseDocumentsStore(client);
    const rec = signature();
    await store.insertSignature(rec);
    await store.insertSignature(signature({ id: "s2", memberId: "22222222-2222-4222-8222-222222222222" }));

    expect(await store.getSignature(rec.memberId, rec.documentVersionId)).toEqual(rec);
    const mine = await store.listSignaturesForMember(rec.memberId);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(rec.id);
  });

  it("maps the database unique violation to the typed DuplicateSignature", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseDocumentsStore(client);
    await store.insertSignature(signature({ id: "s1" }));
    await expect(store.insertSignature(signature({ id: "s2" }))).rejects.toThrow(DuplicateSignature);
  });

  it("throws loudly (not DuplicateSignature) on any other signature insert failure", async () => {
    const { client } = fakeSupabase({ failSignatureInsertWith: "42P01" });
    const store = createSupabaseDocumentsStore(client);
    await expect(store.insertSignature(signature())).rejects.toThrow(/signature insert failed/);
  });

  it("the signatures table only ever sees select and insert operations", async () => {
    const { client, ops } = fakeSupabase();
    const store = createSupabaseDocumentsStore(client);
    await store.insertSignature(signature({ id: "s1" }));
    await store.getSignature("11111111-1111-4111-8111-111111111111", "0f5b3a1c-0000-4000-8000-000000000001");
    await store.listSignaturesForMember("11111111-1111-4111-8111-111111111111");
    const signatureOps = ops.filter((o) => o.table === "research_fm_document_signatures");
    expect(signatureOps.length).toBeGreaterThan(0);
    expect(signatureOps.every((o) => o.op === "insert" || o.op === "select")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Resolver fallback
// ---------------------------------------------------------------------------

describe("resolveDocumentsStore", () => {
  it("falls back to a working in-memory store when Supabase is not configured", async () => {
    const savedUrl = process.env.SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const store = resolveDocumentsStore();
      const rec = version();
      await store.insertVersion(rec);
      expect((await store.getVersion(rec.id))!.id).toBe(rec.id);
    } finally {
      if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
      if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    }
  });
});
