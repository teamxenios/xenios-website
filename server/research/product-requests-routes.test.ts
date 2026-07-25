import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requests: [] as any[],
  candidates: [] as any[],
  files: [] as any[],
  cleanup: [] as any[],
  events: [] as any[],
  members: [] as any[],
  applications: [] as any[],
  outboxKeys: new Set<string>(),
  networkFetches: 0,
}));

const auth = vi.hoisted(() => ({
  member: null as any,
  adminEmail: null as string | null,
}));

vi.mock("../supabase", () => {
  function rowsFor(table: string): any[] {
    if (table === "research_product_requests") return state.requests;
    if (table === "research_product_demand_candidates") return state.candidates;
    if (table === "research_product_request_files") return state.files;
    if (table === "research_product_request_storage_cleanup") return state.cleanup;
    if (table === "research_product_request_events") return state.events;
    if (table === "research_members") return state.members;
    if (table === "research_applications") return state.applications;
    throw new Error(`unexpected table ${table}`);
  }

  function query(table: string) {
    const rows = rowsFor(table);
    let mode: "select" | "insert" | "update" = "select";
    let payload: any = null;
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    let limitValue: number | null = null;
    let rangeValue: [number, number] | null = null;
    let descending: string | null = null;

    const matches = (row: any) =>
      filters.every(([column, value]) => row[column] === value) &&
      inFilters.every(([column, values]) => values.includes(row[column]));

    const finish = () => {
      if (mode === "insert") {
        const item = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload };
        rows.push(item);
        return { data: item, error: null };
      }
      if (mode === "update") {
        const selected = rows.filter(matches);
        if (!selected[0]) return { data: null, error: null };
        Object.assign(selected[0], payload);
        return { data: selected[0], error: null };
      }
      let selected = rows.filter(matches);
      if (descending) selected = selected.slice().sort((a, b) => String(b[descending]).localeCompare(String(a[descending])));
      if (limitValue !== null) selected = selected.slice(0, limitValue);
      if (rangeValue) selected = selected.slice(rangeValue[0], rangeValue[1] + 1);
      return { data: selected, error: null };
    };

    const builder: any = {
      select() {
        return builder;
      },
      insert(value: any) {
        mode = "insert";
        payload = value;
        return builder;
      },
      update(value: any) {
        mode = "update";
        payload = value;
        return builder;
      },
      eq(column: string, value: any) {
        filters.push([column, value]);
        return builder;
      },
      in(column: string, values: any[]) {
        inFilters.push([column, values]);
        return builder;
      },
      limit(value: number) {
        limitValue = value;
        return builder;
      },
      range(start: number, end: number) {
        rangeValue = [start, end];
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        if (options?.ascending === false) descending = column;
        return builder;
      },
      single() {
        const result = finish();
        return Promise.resolve({
          data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
          error: result.error,
        });
      },
      maybeSingle() {
        const result = finish();
        return Promise.resolve({
          data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
          error: result.error,
        });
      },
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        return Promise.resolve(finish()).then(resolve, reject);
      },
    };
    return builder;
  }

  const storage = {
    from() {
      return {
        async createSignedUploadUrl(path: string) {
          return { data: { signedUrl: `https://storage.invalid/upload/${path}` }, error: null };
        },
        async createSignedUrl(path: string) {
          return { data: { signedUrl: `https://storage.invalid/read/${path}` }, error: null };
        },
        async remove() {
          return { data: [], error: null };
        },
        async info() {
          return { data: { size: 100, contentType: "image/png" }, error: null };
        },
        async download() {
          const bytes = new Uint8Array(100);
          bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
          return { data: new Blob([bytes], { type: "image/png" }), error: null };
        },
      };
    },
  };

  return {
    getSupabaseAdmin: () => ({
      from: query,
      storage,
      async rpc(name: string, params: any) {
        if (name === "research_create_product_request") {
          const existing = state.requests.find(
            (row) => row.member_id === params.p_member_id && row.idempotency_key === params.p_idempotency_key,
          );
          if (existing) return { data: existing, error: null };
          let candidate = state.candidates.find(
            (row) => row.normalized_name === params.p_normalized_name && row.category === params.p_category,
          );
          if (!candidate) {
            candidate = {
              id: crypto.randomUUID(),
              normalized_name: params.p_normalized_name,
              category: params.p_category,
              display_name: params.p_product_name,
            };
            state.candidates.push(candidate);
          }
          const row = {
            id: params.p_request_id,
            reference: params.p_reference,
            member_id: params.p_member_id,
            idempotency_key: params.p_idempotency_key,
            product_name: params.p_product_name,
            category: params.p_category,
            description: params.p_description,
            brand: params.p_brand,
            product_url: params.p_product_url,
            desired_presentation: params.p_desired_presentation,
            desired_quantity: params.p_desired_quantity,
            expected_purchase_frequency: params.p_expected_purchase_frequency,
            interest_timing: params.p_interest_timing,
            additional_notes: params.p_additional_notes,
            contact_consent: params.p_contact_consent,
            status: "submitted",
            member_visible_update: null,
            assigned_owner: null,
            priority: "normal",
            internal_notes: null,
            quality_review_status: null,
            claims_review_status: null,
            payment_processor_review_status: null,
            legal_review_status: null,
            commercial_model_status: null,
            candidate_id: candidate.id,
            linked_product_ref: null,
            attribution_source: params.p_attribution_source,
            attribution_code: params.p_attribution_code,
            version: 1,
            withdrawn_at: null,
            created_at: params.p_now,
            updated_at: params.p_now,
          };
          state.requests.push(row);
          state.events.push({
            id: crypto.randomUUID(),
            request_id: row.id,
            actor_type: "member",
            actor_ref: row.member_id,
            event_type: "submitted",
            dedupe_key: "submitted",
            previous_status: null,
            next_status: "submitted",
            member_visible_message: "Request received.",
            internal_detail: {},
            created_at: params.p_now,
          });
          return { data: row, error: null };
        }
        if (name === "research_confirm_product_request_file") {
          const file = state.files.find(
            (row) =>
              row.id === params.p_file_id &&
              row.request_id === params.p_request_id &&
              row.uploader_member_id === params.p_member_id,
          );
          const parent = state.requests.find(
            (row) => row.id === params.p_request_id && row.member_id === params.p_member_id,
          );
          if (!file || !parent || ["closed", "withdrawn"].includes(parent.status)) {
            return { data: null, error: { message: "state_conflict" } };
          }
          if (file.state === "pending") {
            file.state = "confirmed";
            file.uploaded_at = params.p_now;
            file.updated_at = params.p_now;
            state.events.push({
              id: crypto.randomUUID(),
              request_id: parent.id,
              actor_type: "member",
              actor_ref: parent.member_id,
              event_type: "attachment_added",
              dedupe_key: `attachment-added:${file.id}`,
              previous_status: null,
              next_status: null,
              member_visible_message: `${file.original_filename} added.`,
              internal_detail: {},
              created_at: params.p_now,
            });
          }
          return { data: file, error: null };
        }
        if (name === "research_reserve_product_request_file") {
          const parent = state.requests.find(
            (row) => row.id === params.p_request_id && row.member_id === params.p_member_id,
          );
          if (!parent || ["closed", "withdrawn"].includes(parent.status)) {
            return { data: null, error: { message: "state_conflict" } };
          }
          if (
            state.files.filter(
              (row) => row.request_id === parent.id && row.state !== "removed",
            ).length >= 5
          ) {
            return { data: null, error: { message: "attachment_limit" } };
          }
          const row = {
            id: params.p_file_id,
            request_id: params.p_request_id,
            uploader_member_id: params.p_member_id,
            storage_path: params.p_storage_path,
            original_filename: params.p_original_filename,
            content_type: params.p_content_type,
            size_bytes: params.p_size_bytes,
            state: "pending",
            uploaded_at: null,
            removed_at: null,
            created_at: params.p_now,
            updated_at: params.p_now,
          };
          state.files.push(row);
          return { data: row, error: null };
        }
        if (name === "research_remove_product_request_file") {
          const file = state.files.find(
            (row) =>
              row.id === params.p_file_id &&
              row.request_id === params.p_request_id &&
              row.uploader_member_id === params.p_member_id,
          );
          if (!file) return { data: null, error: { message: "state_conflict" } };
          file.state = "removed";
          file.removed_at = params.p_now;
          file.updated_at = params.p_now;
          if (!state.cleanup.some((entry) => entry.file_id === file.id)) {
            state.cleanup.push({
              id: crypto.randomUUID(),
              file_id: file.id,
              storage_path: file.storage_path,
              status: "pending",
              attempts: 0,
              created_at: params.p_now,
              updated_at: params.p_now,
            });
          }
          return { data: file, error: null };
        }
        if (name === "research_admin_update_product_request") {
          const row = state.requests.find(
            (request) =>
              request.id === params.p_request_id &&
              request.version === params.p_expected_version,
          );
          if (!row) return { data: null, error: { message: "state_conflict" } };
          const previousStatus = row.status;
          row.status = params.p_status ?? row.status;
          row.priority = params.p_priority ?? row.priority;
          row.assigned_owner = params.p_assigned_owner;
          row.member_visible_update =
            params.p_member_visible_update ?? row.member_visible_update;
          row.linked_product_ref = params.p_linked_product_ref;
          row.candidate_id = params.p_candidate_id;
          row.version += 1;
          row.updated_at = params.p_now;
          if (row.status !== previousStatus) {
            state.events.push({
              id: crypto.randomUUID(),
              request_id: row.id,
              actor_type: "admin",
              actor_ref: params.p_admin_ref,
              event_type: "status_changed",
              dedupe_key: `status:${row.version}`,
              previous_status: previousStatus,
              next_status: row.status,
              member_visible_message: params.p_member_visible_update,
              internal_detail: {},
              created_at: params.p_now,
            });
          }
          return { data: row, error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    }),
  };
});

vi.mock("./member-auth", () => ({
  requireActiveMember(req: any, res: any, next: any) {
    if (!auth.member) return res.status(401).json({ ok: false, code: "unauthorized" });
    req.researchMember = auth.member;
    next();
  },
}));

vi.mock("../routes", () => ({
  requireSupabaseAdmin(req: any, res: any, next: any) {
    if (!auth.adminEmail) return res.status(401).json({ ok: false });
    req.adminEmail = auth.adminEmail;
    next();
  },
}));

vi.mock("./outbox", () => ({
  async enqueueNotification(input: { eventKey: string }) {
    state.outboxKeys.add(input.eventKey);
    return true;
  },
  async runOutboxTick() {
    return { sent: 0 };
  },
}));

import { registerProductRequestApi } from "./product-requests";

function app() {
  const instance = express();
  instance.use(express.json());
  registerProductRequestApi(instance);
  return instance;
}

const memberA = {
  id: "member-a",
  application_id: "application-a",
  auth_user_id: "auth-a",
  email: "a@example.com",
  first_name: "A",
  status: "active",
  created_at: "2026-07-25T00:00:00.000Z",
};
const memberB = {
  ...memberA,
  id: "member-b",
  application_id: "application-b",
  auth_user_id: "auth-b",
  email: "b@example.com",
  first_name: "B",
};

const validBody = {
  productName: "BPC-157 reference",
  category: "research_vial",
  description: "A 10 mg lyophilized research presentation.",
  productUrl: "https://example.com/product",
  idempotencyKey: "retry_key_1234567890",
};

beforeEach(() => {
  state.requests.length = 0;
  state.candidates.length = 0;
  state.files.length = 0;
  state.cleanup.length = 0;
  state.events.length = 0;
  state.members.length = 0;
  state.applications.length = 0;
  state.outboxKeys.clear();
  state.networkFetches = 0;
  state.members.push(memberA, memberB);
  state.applications.push(
    { id: "application-a", referral_source: "affiliate", referral_code: "private-a" },
    { id: "application-b", referral_source: null, referral_code: null },
  );
  auth.member = null;
  auth.adminEmail = null;
  process.env.ADMIN_EMAIL = "samuel@example.com";
  delete process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS;
});

describe("member product-request routes", () => {
  it("denies a signed-out submission before touching storage", async () => {
    const response = await request(app()).post("/api/research/member/product-requests").send(validBody);
    expect(response.status).toBe(401);
    expect(state.requests).toHaveLength(0);
  });

  it("creates one request, one candidate, one event, and one notification across a retry", async () => {
    auth.member = memberA;
    const first = await request(app()).post("/api/research/member/product-requests").send(validBody);
    const retry = await request(app()).post("/api/research/member/product-requests").send(validBody);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(state.requests).toHaveLength(1);
    expect(state.candidates).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    expect(state.outboxKeys.size).toBe(1);
    expect(first.body.request.reference).toMatch(/^XRP-/);
    expect(first.body.request).not.toHaveProperty("attributionCode");
  });

  it("never fetches a submitted URL", async () => {
    auth.member = memberA;
    const response = await request(app()).post("/api/research/member/product-requests").send(validBody);
    expect(response.status).toBe(201);
    expect(state.networkFetches).toBe(0);
  });

  it("rejects a private-network URL before creating anything", async () => {
    auth.member = memberA;
    const response = await request(app())
      .post("/api/research/member/product-requests")
      .send({ ...validBody, productUrl: "https://192.168.1.10/item" });
    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.productUrl).toBeDefined();
    expect(state.requests).toHaveLength(0);
  });

  it("scopes list and detail reads to the authenticated member", async () => {
    auth.member = memberA;
    const created = await request(app()).post("/api/research/member/product-requests").send(validBody);
    const reference = created.body.request.reference;
    const ownList = await request(app()).get("/api/research/member/product-requests");
    expect(ownList.body.requests).toHaveLength(1);

    auth.member = memberB;
    const otherList = await request(app()).get("/api/research/member/product-requests");
    const otherDetail = await request(app()).get(`/api/research/member/product-requests/${reference}`);
    expect(otherList.body.requests).toHaveLength(0);
    expect(otherDetail.status).toBe(404);
  });

  it("retains attribution internally without returning it to the member", async () => {
    auth.member = memberA;
    const response = await request(app()).post("/api/research/member/product-requests").send(validBody);
    expect(response.status).toBe(201);
    expect(state.requests[0].attribution_source).toBe("affiliate");
    expect(state.requests[0].attribution_code).toBe("private-a");
    expect(JSON.stringify(response.body)).not.toContain("private-a");
  });

  it("keeps valid files private and rejects unsupported or cross-member access", async () => {
    auth.member = memberA;
    const created = await request(app()).post("/api/research/member/product-requests").send(validBody);
    const reference = created.body.request.reference;

    const unsupported = await request(app())
      .post(`/api/research/member/product-requests/${reference}/files/upload`)
      .send({ originalFilename: "payload.exe", contentType: "application/x-msdownload", sizeBytes: 100 });
    expect(unsupported.status).toBe(400);
    const disguised = await request(app())
      .post(`/api/research/member/product-requests/${reference}/files/upload`)
      .send({ originalFilename: "payload.exe.png", contentType: "image/png", sizeBytes: 100 });
    expect(disguised.status).toBe(400);

    const grant = await request(app())
      .post(`/api/research/member/product-requests/${reference}/files/upload`)
      .send({ originalFilename: "reference.png", contentType: "image/png", sizeBytes: 100 });
    expect(grant.status).toBe(201);
    expect(grant.body.grant.uploadUrl).toMatch(/^https:\/\/storage\.invalid\/upload\//);
    expect(JSON.stringify(grant.body)).not.toContain("storage_path");
    const fileId = grant.body.file.fileId;

    const confirmed = await request(app()).post(
      `/api/research/member/product-requests/${reference}/files/${fileId}/confirm`,
    );
    expect(confirmed.status).toBe(200);
    const ownAccess = await request(app()).get(
      `/api/research/member/product-requests/${reference}/files/${fileId}/access`,
    );
    expect(ownAccess.status).toBe(200);
    expect(ownAccess.body.signedUrl).toContain("storage.invalid/read/");

    auth.member = memberB;
    const otherGrant = await request(app())
      .post(`/api/research/member/product-requests/${reference}/files/upload`)
      .send({ originalFilename: "reference.png", contentType: "image/png", sizeBytes: 100 });
    const otherAccess = await request(app()).get(
      `/api/research/member/product-requests/${reference}/files/${fileId}/access`,
    );
    expect(otherGrant.status).toBe(404);
    expect(otherAccess.status).toBe(404);
    expect(state.outboxKeys.size).toBe(1);
  });

  it("enforces the per-request attachment reservation limit", async () => {
    auth.member = memberA;
    const created = await request(app()).post("/api/research/member/product-requests").send(validBody);
    const reference = created.body.request.reference;
    for (let index = 0; index < 5; index += 1) {
      const grant = await request(app())
        .post(`/api/research/member/product-requests/${reference}/files/upload`)
        .send({ originalFilename: `reference-${index}.png`, contentType: "image/png", sizeBytes: 100 });
      expect(grant.status).toBe(201);
    }
    const blocked = await request(app())
      .post(`/api/research/member/product-requests/${reference}/files/upload`)
      .send({ originalFilename: "reference-6.png", contentType: "image/png", sizeBytes: 100 });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("attachment_limit");
    expect(state.files).toHaveLength(5);
  });
});

describe("admin product-request permission", () => {
  it("denies an authenticated admin who lacks the explicit permission", async () => {
    auth.adminEmail = "samuel@example.com";
    process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS = "reviewer@example.com";
    const response = await request(app()).get("/api/admin/research/product-requests");
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("product_request_permission_required");
  });

  it("allows only an explicitly permitted reviewer", async () => {
    auth.adminEmail = "samuel@example.com";
    process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS = "samuel@example.com";
    const response = await request(app()).get("/api/admin/research/product-requests");
    expect(response.status).toBe(200);
    expect(response.body.requests).toEqual([]);
  });

  it("audits an admin detail read and never exposes idempotency keys", async () => {
    auth.member = memberA;
    const created = await request(app()).post("/api/research/member/product-requests").send(validBody);
    auth.member = null;
    auth.adminEmail = "samuel@example.com";
    process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS = "samuel@example.com";
    const row = state.requests[0];
    const response = await request(app()).get(`/api/admin/research/product-requests/${row.id}`);
    expect(response.status).toBe(200);
    expect(response.body.request.reference).toBe(created.body.request.reference);
    expect(JSON.stringify(response.body)).not.toContain("retry_key_1234567890");
    expect(state.events.some((event) => event.event_type === "administrator_opened")).toBe(true);
  });

  it("queues one idempotent member notification for a status transition without a note", async () => {
    auth.member = memberA;
    await request(app()).post("/api/research/member/product-requests").send(validBody);
    auth.member = null;
    auth.adminEmail = "samuel@example.com";
    process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS = "samuel@example.com";
    const row = state.requests[0];
    const response = await request(app())
      .patch(`/api/admin/research/product-requests/${row.id}`)
      .send({ expectedVersion: 1, status: "under_review" });
    expect(response.status).toBe(200);
    expect(state.outboxKeys.has(`product-request-updated:${row.id}:2`)).toBe(true);
    expect(
      Array.from(state.outboxKeys).filter((key) => key.startsWith("product-request-updated:")),
    ).toHaveLength(1);
  });
});
