import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProductRequestSchema,
  fileSignatureMatches,
  isProductRequestAdmin,
  normalizeDemandName,
  toMemberProductRequest,
  validateProductRequestFilename,
  validateSubmittedProductUrl,
} from "./product-requests";

const originalPermissionList = process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS;
const originalAdminEmail = process.env.ADMIN_EMAIL;

afterEach(() => {
  if (originalPermissionList === undefined) delete process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS;
  else process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS = originalPermissionList;
  if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = originalAdminEmail;
});

describe("product-request URL storage boundary", () => {
  it("accepts a normal HTTPS reference without fetching it", () => {
    expect(validateSubmittedProductUrl("https://example.com/catalog/item?q=1#section")).toEqual({
      ok: true,
      value: "https://example.com/catalog/item?q=1",
    });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "http://example.com/product",
    "https://localhost/product",
    "https://shop.local/product",
    "https://127.0.0.1/product",
    "https://10.0.0.8/product",
    "https://172.20.0.8/product",
    "https://192.168.1.8/product",
    "https://169.254.1.1/product",
    "https://100.64.0.1/product",
    "https://198.18.0.1/product",
    "https://192.0.2.1/product",
    "https://203.0.113.1/product",
    "https://[::1]/product",
    "https://[fd00::1]/product",
    "https://[::ffff:127.0.0.1]/product",
    "https://user:secret@example.com/product",
    "not a url",
  ])("rejects unsafe or non-public URL %s", (value) => {
    expect(validateSubmittedProductUrl(value).ok).toBe(false);
  });

  it("allows no URL at all", () => {
    expect(validateSubmittedProductUrl(null)).toEqual({ ok: true, value: null });
  });

  it("contains no server-side network fetch or preview implementation", () => {
    const source = readFileSync(resolve(__dirname, "product-requests.ts"), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain("getPublicUrl");
    expect(source).not.toMatch(/dns\.(lookup|resolve)/);
  });
});

describe("product-request validation and demand grouping", () => {
  it("requires product name, category, description, and a retry key", () => {
    expect(
      createProductRequestSchema.safeParse({
        productName: "BPC-157 reference",
        category: "research_vial",
        description: "A 10 mg lyophilized research presentation.",
        idempotencyKey: "retry_key_1234567890",
      }).success,
    ).toBe(true);
    expect(createProductRequestSchema.safeParse({}).success).toBe(false);
  });

  it("normalizes equivalent names to one demand candidate key", () => {
    expect(normalizeDemandName("  BPC–157  Reference ")).toBe("bpc 157 reference");
    expect(normalizeDemandName("BPC-157 reference")).toBe("bpc 157 reference");
  });

  it("rejects unsupported categories and oversized text", () => {
    expect(
      createProductRequestSchema.safeParse({
        productName: "Item",
        category: "medical_treatment",
        description: "A legitimate research description.",
        idempotencyKey: "retry_key_1234567890",
      }).success,
    ).toBe(false);
    expect(
      createProductRequestSchema.safeParse({
        productName: "Item",
        category: "other",
        description: "x".repeat(4001),
        idempotencyKey: "retry_key_1234567890",
      }).success,
    ).toBe(false);
  });

  it("requires filename/type agreement and verifies content signatures", () => {
    expect(validateProductRequestFilename("reference.png", "image/png").ok).toBe(true);
    expect(validateProductRequestFilename("payload.exe.png", "image/png").ok).toBe(false);
    expect(validateProductRequestFilename("reference.pdf", "image/png").ok).toBe(false);
    expect(
      fileSignatureMatches(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
    expect(fileSignatureMatches("image/png", new TextEncoder().encode("<script>"))).toBe(false);
  });
});

describe("product-request privacy and permissions", () => {
  it("serializes only the member-safe contract", () => {
    const member = toMemberProductRequest({
      id: "internal-request-id",
      reference: "XRP-SAFE",
      member_id: "member-internal-id",
      idempotency_key: "secret-retry-key",
      product_name: "Research reference",
      category: "research_vial",
      description: "Requested research presentation.",
      brand: null,
      product_url: null,
      desired_presentation: null,
      desired_quantity: null,
      expected_purchase_frequency: null,
      interest_timing: null,
      additional_notes: null,
      contact_consent: false,
      status: "under_review",
      member_visible_update: "The team is reviewing the technical file.",
      assigned_owner: "Private reviewer",
      priority: "high",
      internal_notes: "Never member visible",
      quality_review_status: "internal",
      claims_review_status: "internal",
      payment_processor_review_status: "internal",
      legal_review_status: "internal",
      commercial_model_status: "internal",
      candidate_id: "internal-candidate",
      linked_product_ref: null,
      attribution_source: "affiliate",
      attribution_code: "private-code",
      version: 2,
      withdrawn_at: null,
      created_at: "2026-07-25T00:00:00.000Z",
      updated_at: "2026-07-25T01:00:00.000Z",
    });
    const serialized = JSON.stringify(member);
    expect(serialized).not.toContain("internal-request-id");
    expect(serialized).not.toContain("member-internal-id");
    expect(serialized).not.toContain("secret-retry-key");
    expect(serialized).not.toContain("Private reviewer");
    expect(serialized).not.toContain("Never member visible");
    expect(serialized).not.toContain("private-code");
    expect(member.memberVisibleUpdate).toContain("technical file");
  });

  it("omits internal audit events from member history", () => {
    const base = {
      id: "request-id",
      reference: "XRP-SAFE",
      member_id: "member-id",
      idempotency_key: "retry",
      product_name: "Research reference",
      category: "other" as const,
      description: "Requested research presentation.",
      brand: null,
      product_url: null,
      desired_presentation: null,
      desired_quantity: null,
      expected_purchase_frequency: null,
      interest_timing: null,
      additional_notes: null,
      contact_consent: false,
      status: "under_review" as const,
      member_visible_update: null,
      assigned_owner: null,
      priority: "normal" as const,
      internal_notes: null,
      quality_review_status: null,
      claims_review_status: null,
      payment_processor_review_status: null,
      legal_review_status: null,
      commercial_model_status: null,
      candidate_id: null,
      linked_product_ref: null,
      attribution_source: null,
      attribution_code: null,
      version: 2,
      withdrawn_at: null,
      created_at: "2026-07-25T00:00:00.000Z",
      updated_at: "2026-07-25T01:00:00.000Z",
    };
    const events = [
      {
        id: "event-1",
        request_id: "request-id",
        actor_type: "admin" as const,
        actor_ref: "admin@example.com",
        event_type: "internal_note_added",
        dedupe_key: "note:2",
        previous_status: null,
        next_status: null,
        member_visible_message: null,
        internal_detail: { note: "private diligence note" },
        created_at: "2026-07-25T01:00:00.000Z",
      },
      {
        id: "event-2",
        request_id: "request-id",
        actor_type: "admin" as const,
        actor_ref: "admin@example.com",
        event_type: "status_changed",
        dedupe_key: "status:2",
        previous_status: "submitted" as const,
        next_status: "under_review" as const,
        member_visible_message: "The team started its review.",
        internal_detail: {},
        created_at: "2026-07-25T01:01:00.000Z",
      },
    ];
    const result = toMemberProductRequest(base, [], events);
    expect(result.events).toHaveLength(1);
    expect(JSON.stringify(result.events)).not.toContain("private diligence note");
  });

  it("requires the explicit reviewer allowlist when configured", () => {
    process.env.ADMIN_EMAIL = "samuel@example.com";
    process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS = "reviewer@example.com";
    expect(isProductRequestAdmin("samuel@example.com")).toBe(false);
    expect(isProductRequestAdmin("reviewer@example.com")).toBe(true);
  });

  it("fails closed when the product-request reviewer list is not configured", () => {
    process.env.ADMIN_EMAIL = "samuel@example.com";
    delete process.env.RESEARCH_PRODUCT_REQUEST_ADMIN_EMAILS;
    expect(isProductRequestAdmin("SAMUEL@example.com")).toBe(false);
    expect(isProductRequestAdmin("fulfillment@example.com")).toBe(false);
  });
});

describe("migration and hard-boundary contracts", () => {
  const sql = readFileSync(resolve(__dirname, "../../supabase/research-product-requests.sql"), "utf8");

  it("keeps every table RLS-on with no browser policy", () => {
    expect(sql.match(/enable row level security/g)).toHaveLength(5);
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).toContain("revoke all on function");
  });

  it("creates a private size- and MIME-constrained Storage bucket", () => {
    expect(sql).toContain("'research-product-requests'");
    expect(sql).toMatch(/false,\s*10485760/);
    expect(sql).toContain("'application/pdf'");
  });

  it("reserves uploads under a member lock and durably queues object cleanup", () => {
    expect(sql).toContain("research_reserve_product_request_file");
    expect(sql).toContain("'product-request-upload:' || p_member_id::text");
    expect(sql).toMatch(/count\(\*\)[\s\S]*?>= 5/);
    expect(sql).toMatch(/count\(\*\)[\s\S]*?>= 10/);
    expect(sql).toContain("research_product_request_storage_cleanup");
    expect(sql).toContain("research_queue_abandoned_product_request_files");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("on conflict (file_id) do nothing");
  });

  it("atomically creates a request, demand candidate, and submitted event", () => {
    expect(sql).toContain("research_create_product_request");
    expect(sql).toContain("on conflict (normalized_name, category)");
    expect(sql).toContain("on conflict (member_id, idempotency_key)");
    expect(sql).toContain("'submitted', 'submitted'");
    expect(sql).toContain("'member_product_request_received'");
    expect(sql).toContain("on conflict (event_key) do nothing");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("research_product_request_events_append_only");
  });

  it("keeps attachment names and storage paths out of notification payloads", () => {
    const outboxSections = sql.match(/insert into public\.research_notification_outbox[\s\S]*?on conflict \(event_key\) do nothing;/g) ?? [];
    expect(outboxSections).toHaveLength(2);
    for (const section of outboxSections) {
      expect(section).not.toContain("storage_path");
      expect(section).not.toContain("original_filename");
      expect(section).not.toContain("product_url");
    }
  });

  it("has no product, order, inventory, price, or commerce mutation", () => {
    expect(sql).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+public\.research_products\b/i);
    expect(sql).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+public\.research_orders\b/i);
    expect(sql).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+public\.research_inventory/i);
    expect(sql).not.toMatch(/commerce_enabled\s*=/i);
  });
});
