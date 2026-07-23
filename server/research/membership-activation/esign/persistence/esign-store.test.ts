import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ArchiveRecord,
  ProviderEventLogEntry,
  SigningRequestRecord,
  TemplateMappingRecord,
} from "../contracts";
import {
  archiveToRow,
  createInMemoryEsignStore,
  createSupabaseEsignStore,
  requestToRow,
  resolveEsignStore,
  rowToArchive,
  rowToRequest,
  rowToTemplate,
  templateToRow,
  type ArchiveRow,
  type SigningRequestRow,
  type TemplateMappingRow,
} from "./esign-store";

const NOW = "2026-07-22T12:00:00.000Z";

const HISTORY: ProviderEventLogEntry = {
  eventId: "evt-1",
  type: "viewed",
  occurredAt: NOW,
  recordedAt: NOW,
};

function request(overrides: Partial<SigningRequestRecord> = {}): SigningRequestRecord {
  return {
    id: "req-1",
    memberId: "member-1",
    packetOrDocumentId: "ver-1",
    mode: "opensign_document",
    provider: "opensign",
    providerTemplateId: "ptid-1",
    providerTemplateVersion: "1",
    providerDocumentId: "pdoc-1",
    xeniosDocumentVersionIds: ["ver-1"],
    sourceContentHashes: ["hash-1"],
    signerIdentifier: "member@example.com",
    signingLinkStatus: "created",
    viewedAt: null,
    signedAt: null,
    completedAt: null,
    declinedAt: null,
    expiredAt: null,
    signedPdfRef: null,
    certificateRef: null,
    signedPdfHash: null,
    certificateHash: null,
    verifiedEventIds: [],
    providerEventHistory: [],
    xeniosAcceptanceEventIds: [],
    idempotencyKey: "idem-1",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A fully populated, completed request to exercise every field through the mappers. */
function completedRequest(): SigningRequestRecord {
  return request({
    id: "req-complete",
    mode: "opensign_packet",
    providerDocumentId: "pdoc-complete",
    xeniosDocumentVersionIds: ["ver-1", "ver-2"],
    sourceContentHashes: ["hash-1", "hash-2"],
    signingLinkStatus: "completed",
    viewedAt: NOW,
    signedAt: NOW,
    completedAt: NOW,
    signedPdfRef: "esign/member-1/pdoc-complete/signed.pdf",
    certificateRef: "esign/member-1/pdoc-complete/certificate.pdf",
    signedPdfHash: "sha-signed",
    certificateHash: "sha-cert",
    verifiedEventIds: ["evt-1", "evt-2"],
    providerEventHistory: [HISTORY, { ...HISTORY, eventId: "evt-2", type: "completed" }],
    xeniosAcceptanceEventIds: ["esign:evt-2:ver-1", "esign:evt-2:ver-2"],
  });
}

function template(overrides: Partial<TemplateMappingRecord> = {}): TemplateMappingRecord {
  return {
    templateKey: "tmpl_abc",
    provider: "opensign",
    providerTemplateId: "ptid-1",
    providerTemplateVersion: "1",
    mode: "opensign_document",
    xeniosDocumentVersionIds: ["ver-1"],
    sourceContentHashes: ["hash-1"],
    provisioningStatus: "provisioned",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function archive(overrides: Partial<ArchiveRecord> = {}): ArchiveRecord {
  return {
    id: "arc-1",
    memberId: "member-1",
    packetOrDocumentId: "ver-1",
    documentVersionId: "ver-1",
    provider: "opensign",
    providerDocumentId: "pdoc-1",
    signedPdfRef: "esign/member-1/pdoc-1/signed.pdf",
    signedPdfHash: "sha-signed",
    certificateRef: "esign/member-1/pdoc-1/certificate.pdf",
    certificateHash: "sha-cert",
    xeniosSourceHash: "hash-1",
    signerEmail: "member@example.com",
    completedAt: NOW,
    retentionClass: "legal_7y",
    accessClassification: "member_and_admin",
    archiveStatus: "stored",
    emailDeliveryStatus: "pending",
    localExportStatus: "not_exported",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("signing request row mapping", () => {
  it("round-trips a created request through the mappers", () => {
    const rec = request();
    expect(rowToRequest(requestToRow(rec))).toEqual(rec);
  });

  it("round-trips a fully populated completed request with every field set", () => {
    const rec = completedRequest();
    expect(rowToRequest(requestToRow(rec))).toEqual(rec);
  });

  it("stamps the tenant column on every row", () => {
    expect(requestToRow(request()).tenant).toBe("xenios_research");
    expect(templateToRow(template()).tenant).toBe("xenios_research");
    expect(archiveToRow(archive()).tenant).toBe("xenios_research");
  });

  it("returns null for a row with an unknown signing link status", () => {
    const base = requestToRow(request());
    expect(rowToRequest({ ...base, signing_link_status: "half_signed" } as SigningRequestRow)).toBeNull();
  });

  it("returns null for a row with an unknown mode", () => {
    const base = requestToRow(request());
    expect(rowToRequest({ ...base, mode: "docusign_magic" } as SigningRequestRow)).toBeNull();
  });

  it("returns null for a malformed jsonb array or event history rather than guessing", () => {
    const base = requestToRow(request());
    expect(rowToRequest({ ...base, xenios_document_version_ids: "ver-1" } as SigningRequestRow)).toBeNull();
    expect(rowToRequest({ ...base, source_content_hashes: [1, 2] } as SigningRequestRow)).toBeNull();
    expect(
      rowToRequest({ ...base, provider_event_history: [{ eventId: "x", type: "teleport" }] } as SigningRequestRow),
    ).toBeNull();
  });
});

describe("template + archive row mapping", () => {
  it("round-trips a template mapping", () => {
    const rec = template();
    expect(rowToTemplate(templateToRow(rec))).toEqual(rec);
  });

  it("returns null for a template row with an unknown provisioning status", () => {
    const base = templateToRow(template());
    expect(rowToTemplate({ ...base, provisioning_status: "half_baked" } as TemplateMappingRow)).toBeNull();
  });

  it("round-trips an archive record", () => {
    const rec = archive();
    expect(rowToArchive(archiveToRow(rec))).toEqual(rec);
  });

  it("returns null for an archive row with an unknown classification or status", () => {
    const base = archiveToRow(archive());
    expect(rowToArchive({ ...base, access_classification: "everyone" } as ArchiveRow)).toBeNull();
    expect(rowToArchive({ ...base, archive_status: "misplaced" } as ArchiveRow)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// In-memory reference
// ---------------------------------------------------------------------------

describe("createInMemoryEsignStore", () => {
  it("inserts, gets, updates, and lists signing requests by member", async () => {
    const store = createInMemoryEsignStore();
    await store.requests.insert(request({ id: "r1" }));
    await store.requests.insert(request({ id: "r2", providerDocumentId: "pdoc-2", idempotencyKey: "idem-2" }));

    expect((await store.requests.getById("r1"))!.id).toBe("r1");
    expect(await store.requests.getById("missing")).toBeNull();

    const updated = request({ id: "r1", signingLinkStatus: "viewed", viewedAt: NOW });
    await store.requests.update(updated);
    expect((await store.requests.getById("r1"))!.signingLinkStatus).toBe("viewed");

    const mine = await store.requests.listByMember("member-1");
    expect(mine).toHaveLength(2);
  });

  it("finds a request by provider document id and by idempotency key", async () => {
    const store = createInMemoryEsignStore();
    await store.requests.insert(request({ id: "r1", providerDocumentId: "pdoc-xyz", idempotencyKey: "idem-xyz" }));

    expect((await store.requests.getByProviderDocumentId("pdoc-xyz"))!.id).toBe("r1");
    expect(await store.requests.getByProviderDocumentId("nope")).toBeNull();
    expect((await store.requests.getByIdempotencyKey("member-1", "idem-xyz"))!.id).toBe("r1");
    expect(await store.requests.getByIdempotencyKey("member-1", "other")).toBeNull();
    expect(await store.requests.getByIdempotencyKey("other-member", "idem-xyz")).toBeNull();
  });

  it("refuses a duplicate insert and an update of a missing request", async () => {
    const store = createInMemoryEsignStore();
    await store.requests.insert(request({ id: "r1" }));
    await expect(store.requests.insert(request({ id: "r1" }))).rejects.toThrow();
    await expect(store.requests.update(request({ id: "ghost" }))).rejects.toThrow();
  });

  it("does not let a caller mutate a stored request through a returned reference", async () => {
    const store = createInMemoryEsignStore();
    await store.requests.insert(request({ id: "r1" }));
    const loaded = await store.requests.getById("r1");
    (loaded as SigningRequestRecord).signerIdentifier = "tampered@example.com";
    expect((await store.requests.getById("r1"))!.signerIdentifier).toBe("member@example.com");
  });

  it("upserts and lists template mappings deterministically", async () => {
    const store = createInMemoryEsignStore();
    await store.templates.upsert(template({ templateKey: "tmpl_b" }));
    await store.templates.upsert(template({ templateKey: "tmpl_a" }));
    await store.templates.upsert(template({ templateKey: "tmpl_b", provisioningStatus: "drifted" }));

    expect((await store.templates.getByKey("tmpl_b"))!.provisioningStatus).toBe("drifted");
    const all = await store.templates.list();
    expect(all.map((m) => m.templateKey)).toEqual(["tmpl_a", "tmpl_b"]);
  });

  it("stores archive records and lists them by member through the archive facet", async () => {
    const store = createInMemoryEsignStore();
    await store.archive.insert(archive({ id: "arc-1" }));
    await store.archive.insert(archive({ id: "arc-2", memberId: "member-2" }));
    await expect(store.archive.insert(archive({ id: "arc-1" }))).rejects.toThrow();

    const loaded = await store.archive.getById("arc-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.archiveStatus).toBe("stored");

    // archive.listByMember is what the admin document center and packet ZIP need.
    const mine = await store.archive.listByMember("member-1");
    expect(mine.map((r) => r.id)).toEqual(["arc-1"]);
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store, exercised against a fake client (no network)
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the supabase-js fluent client covering exactly the calls
 * the e-sign store makes across its three tables, recording every operation so
 * a test can assert the table ops issued.
 */
function fakeSupabase(): {
  client: SupabaseClient;
  requests: Map<string, SigningRequestRow>;
  templates: Map<string, TemplateMappingRow>;
  archive: Map<string, ArchiveRow>;
  ops: Array<{ table: string; op: string }>;
} {
  const requests = new Map<string, SigningRequestRow>();
  const templates = new Map<string, TemplateMappingRow>();
  const archive = new Map<string, ArchiveRow>();
  const ops: Array<{ table: string; op: string }> = [];

  const keyField = (table: string): string =>
    table === "research_fm_esign_templates" ? "template_key" : "id";
  const bucket = (table: string): Map<string, Record<string, unknown>> => {
    if (table === "research_fm_esign_requests") return requests as Map<string, Record<string, unknown>>;
    if (table === "research_fm_esign_templates") return templates as Map<string, Record<string, unknown>>;
    return archive as Map<string, Record<string, unknown>>;
  };

  function builder(table: string) {
    const state: { op: string; filters: Array<{ col: string; val: unknown }>; payload?: unknown } = {
      op: "select",
      filters: [],
    };
    const api: Record<string, unknown> = {};
    const matches = (row: Record<string, unknown>) => state.filters.every((f) => row[f.col] === f.val);

    const result = (single: boolean): { data: unknown; error: { code?: string; message: string } | null } => {
      ops.push({ table, op: state.op });
      const store = bucket(table);
      const kf = keyField(table);
      if (state.op === "select") {
        const rows = Array.from(store.values()).filter((r) => matches(r));
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      }
      if (state.op === "insert") {
        const row = state.payload as Record<string, unknown>;
        const key = String(row[kf]);
        if (store.has(key)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        store.set(key, { ...row });
        return { data: null, error: null };
      }
      if (state.op === "upsert") {
        const row = state.payload as Record<string, unknown>;
        store.set(String(row[kf]), { ...row });
        return { data: null, error: null };
      }
      if (state.op === "update") {
        const idFilter = state.filters.find((f) => f.col === "id") ?? state.filters.find((f) => f.col === kf);
        const existing = idFilter ? store.get(String(idFilter.val)) : undefined;
        if (!existing || !idFilter) return { data: null, error: null };
        const merged = { ...existing, ...(state.payload as Record<string, unknown>) };
        store.set(String(idFilter.val), merged);
        return { data: single ? { id: existing.id } : [{ id: existing.id }], error: null };
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
      upsert(payload: unknown) {
        state.op = "upsert";
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
  return { client, requests, templates, archive, ops };
}

describe("createSupabaseEsignStore (fake client)", () => {
  it("inserts then loads a signing request round-trip", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseEsignStore(client);
    const rec = request();
    await store.requests.insert(rec);
    expect(await store.requests.getById(rec.id)).toEqual(rec);
    expect((await store.requests.getByProviderDocumentId(rec.providerDocumentId!))!.id).toBe(rec.id);
    expect((await store.requests.getByIdempotencyKey(rec.memberId, rec.idempotencyKey))!.id).toBe(rec.id);
  });

  it("updates a request in place and throws when the row is missing", async () => {
    const { client, requests } = fakeSupabase();
    const store = createSupabaseEsignStore(client);
    const rec = request();
    await store.requests.insert(rec);
    await store.requests.update({ ...rec, signingLinkStatus: "viewed", viewedAt: NOW });
    expect(requests.size).toBe(1);
    expect((await store.requests.getById(rec.id))!.signingLinkStatus).toBe("viewed");
    await expect(store.requests.update(request({ id: "ghost" }))).rejects.toThrow(/matched no row/);
  });

  it("throws loudly on a request insert failure", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseEsignStore(client);
    const rec = request();
    await store.requests.insert(rec);
    await expect(store.requests.insert(rec)).rejects.toThrow(/insert failed/);
  });

  it("upserts a template, reads it back, and routes archive writes to the archive table", async () => {
    const { client, templates, archive: archiveRows } = fakeSupabase();
    const store = createSupabaseEsignStore(client);
    await store.templates.upsert(template());
    expect((await store.templates.getByKey("tmpl_abc"))!.providerTemplateId).toBe("ptid-1");
    expect(templates.size).toBe(1);

    await store.archive.insert(archive());
    expect(archiveRows.size).toBe(1);
    expect(await store.archive.getById("arc-1")).not.toBeNull();
    expect((await store.archive.listByMember("member-1")).map((r) => r.id)).toEqual(["arc-1"]);
  });

  it("issues each facet's ops against its own table", async () => {
    const { client, ops } = fakeSupabase();
    const store = createSupabaseEsignStore(client);
    await store.requests.insert(request());
    await store.requests.getById("req-1");
    await store.requests.update(request({ signingLinkStatus: "signed", signedAt: NOW }));
    await store.templates.upsert(template());
    await store.templates.getByKey("tmpl_abc");
    await store.archive.insert(archive());
    await store.archive.listByMember("member-1");

    const requestOps = ops.filter((o) => o.table === "research_fm_esign_requests");
    expect(requestOps.every((o) => ["insert", "select", "update"].includes(o.op))).toBe(true);
    const templateOps = ops.filter((o) => o.table === "research_fm_esign_templates");
    expect(templateOps.every((o) => ["upsert", "select"].includes(o.op))).toBe(true);
    const archiveOps = ops.filter((o) => o.table === "research_fm_esign_archive");
    expect(archiveOps.every((o) => ["insert", "select"].includes(o.op))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Resolver fallback
// ---------------------------------------------------------------------------

describe("resolveEsignStore", () => {
  it("falls back to a working in-memory store when Supabase is not configured", async () => {
    const savedUrl = process.env.SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const store = resolveEsignStore();
      const rec = request();
      await store.requests.insert(rec);
      expect((await store.requests.getById(rec.id))!.id).toBe(rec.id);
    } finally {
      if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
      if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    }
  });
});
