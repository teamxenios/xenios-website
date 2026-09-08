import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ACTOR_NAMES, EXPECTED_WRITES, HUB_BUCKET, HUB_TABLES, PRODUCTION_PROJECT, assertStagingTarget, createManagedHubFetchBoundary, sha256, validateManagedHubPlan, type BoundaryEvent, type ManagedHubPlan } from "../../../scripts/revenue-launch/lib/managed-resource-hub-boundary";
import { appendManagedHubJournal, parseManagedHubPlanBytes, validateManagedHubCredentials } from "../../../scripts/revenue-launch/managed-resource-hub-qa";

const projectRef = "abcdefghijklmnopqrst";
const origin = `https://${projectRef}.supabase.co`;
const uid = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const pdf = new TextEncoder().encode("%PDF-1.7\nbenign fixture bytes for boundary-only doubles\n%%EOF");
function plan(): ManagedHubPlan {
  const actors = Object.fromEntries(ACTOR_NAMES.map((name, index) => [name, { authUserId: uid(index + 1), email: `${name}@qa.invalid`, memberId: name === "admin" ? null : uid(index + 11), memberStatus: name === "admin" ? null : "active", partner: ["inside", "outside", "blocked"].includes(name) ? { id: uid(index + 21), role: name === "outside" ? "affiliate" : "research_rep", state: name === "blocked" ? "suspended" : "active" } : null }]));
  return validateManagedHubPlan({
    schemaVersion: 1, runId: "hubqa-local-boundary", sourceSha: "a".repeat(40), sourceTree: "b".repeat(40), precisionFixCommit: "c".repeat(40),
    sourceReview: { accepted: true, reviewedSha: "a".repeat(40), reviewedTree: "b".repeat(40), evidenceSha256: "a".repeat(64) },
    target: { projectRef, origin, isolatedQualificationEnvironment: true, ownerApprovalSha256: "b".repeat(64) },
    credentialsFile: "C:/private/credentials.json", receiptDirectory: "C:/private/fresh-hub-run", actors,
    pdf: { path: "C:/private/benign.pdf", sha256: sha256(pdf), sizeBytes: pdf.length, metadata: { title: "Qualification fixture", purpose: "Benign managed qualification fixture only", usagePolicy: "training", audience: ["research_rep"], originalFilename: "qualification.pdf", idempotencyKey: "hubqa-local-boundary" }, benignSyntheticFixture: true, contentAudienceApprovalSha256: "c".repeat(64) },
    expectedInitialHubRows: 0, expectedWrites: EXPECTED_WRITES, recovery: "preserve-all-stop-and-review-actual-state-before-retry",
  });
}
function setup(response: () => Response = () => new Response("{}", { status: 200 })) {
  const events: BoundaryEvent[] = [];
  const upstream = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
  const boundary = createManagedHubFetchBoundary(plan(), upstream as typeof fetch, (event) => events.push(event));
  return { boundary, events, upstream };
}
const objectKey = `resource-library/${uid(40)}/v1-${uid(41)}.pdf`;
const storageUrl = `${origin}/storage/v1/object/${HUB_BUCKET}/${objectKey}`;
const upload = { method: "POST", headers: { "content-type": "application/pdf", "x-upsert": "false" }, body: pdf };
async function ownObject(boundary: ReturnType<typeof createManagedHubFetchBoundary>) { boundary.enableWrites(); await boundary.fetch(storageUrl, upload); }

describe("managed Hub exact staging plan", () => {
  it("accepts the fixed bounded synthetic fixture plan", () => expect(plan().expectedWrites.deliveries).toBe(4));
  it.each([
    [PRODUCTION_PROJECT, `https://${PRODUCTION_PROJECT}.supabase.co`], [projectRef, "https://xeniostechnology.com"],
    [projectRef, "https://xenios-website.onrender.com"], [projectRef, `${origin}/`], [projectRef, `${origin}:443`],
    [projectRef, `${origin}/rest/v1`], [projectRef, `http://${projectRef}.supabase.co`], [projectRef, `https://user@${projectRef}.supabase.co`],
    [projectRef, "https://differentabcdefghijk.supabase.co"], ["bad", origin],
  ])("rejects wrong/ambiguous target %s %s", (ref, url) => expect(() => assertStagingTarget(ref, url)).toThrow());
  it("rejects unreviewed source and broader audiences", () => {
    const source = plan(); source.sourceReview.reviewedSha = "d".repeat(40);
    expect(() => validateManagedHubPlan(source)).toThrow("source_review_binding");
    const broad = plan(); broad.pdf.metadata.audience = ["all_partners"];
    expect(() => validateManagedHubPlan(broad)).toThrow("audience_control");
  });
  it("requires distinct existing principals and no account grants", () => {
    const duplicate = plan(); duplicate.actors.inside.authUserId = duplicate.actors.admin.authUserId;
    expect(() => validateManagedHubPlan(duplicate)).toThrow("distinct_principals");
    const closed = plan(); closed.actors.inside.memberStatus = "closed";
    expect(() => validateManagedHubPlan(closed)).toThrow("member_plan");
  });
  it("cannot name an existing resource or non-synthetic content", () => {
    const existing = plan(); existing.pdf.metadata.resourceId = uid(40);
    expect(() => validateManagedHubPlan(existing)).toThrow("fixture_scope");
    expect(() => validateManagedHubPlan({ ...plan(), pdf: { ...plan().pdf, benignSyntheticFixture: false } })).toThrow("plan_schema");
  });
});

describe("managed Hub fetch boundary with local doubles only", () => {
  it("preflight denies every mutation without contacting the provider", async () => {
    const { boundary, upstream } = setup();
    await expect(boundary.fetch(storageUrl, upload)).rejects.toThrow("preflight_is_read_only");
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    ["POST", "/auth/v1/token"], ["POST", "/auth/v1/admin/users"], ["POST", "/auth/v1/logout"],
    ["POST", "/rest/v1/research_members"], ["POST", "/rest/v1/notification_outbox"],
    ["POST", "/rest/v1/rpc/arbitrary"], ["DELETE", `/storage/v1/object/${HUB_BUCKET}`],
    ["POST", "/storage/v1/bucket"], ["GET", "/storage/v1/object/public/anything"],
  ])("rejects forbidden %s %s", async (method, route) => {
    const { boundary, upstream } = setup(); boundary.enableWrites();
    await expect(boundary.fetch(`${origin}${route}`, { method, body: method === "GET" ? undefined : "{}" })).rejects.toThrow();
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects an off-target request even when the path is allowed", async () => {
    const { boundary, upstream } = setup();
    await expect(boundary.fetch(`https://${PRODUCTION_PROJECT}.supabase.co/auth/v1/user`)).rejects.toThrow("request_origin_or_path");
    expect(upstream).not.toHaveBeenCalled();
  });
  it("requires scoped canonical identity reads and caps the result", async () => {
    const { boundary, upstream } = setup();
    await boundary.fetch(`${origin}/rest/v1/research_members?select=*&auth_user_id=eq.${plan().actors.inside.authUserId}`);
    expect(String(upstream.mock.calls[0]?.[0])).toContain("limit=2");
    const denied = setup();
    await expect(denied.boundary.fetch(`${origin}/rest/v1/research_members?select=*`)).rejects.toThrow("identity_read_scope");
  });
  it.each(["select=id,research_members(*)", "select=id&select=*", "select=id&order=other.asc"])("refuses broadened read projection or query %s", async (query) => {
    const { boundary, upstream } = setup();
    await expect(boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}?${query}`)).rejects.toThrow();
    expect(upstream).not.toHaveBeenCalled();
  });
  it("permits only the bounded service-key privilege self-check", async () => {
    const { boundary, upstream } = setup();
    await boundary.fetch(`${origin}/auth/v1/admin/users?page=1&per_page=1`);
    expect(upstream).toHaveBeenCalledOnce();
    await expect(boundary.fetch(`${origin}/auth/v1/admin/users?page=1&per_page=200`)).rejects.toThrow("endpoint");
  });
  it("journals immutable upload before network and refuses any second object", async () => {
    const events: BoundaryEvent[] = [];
    const provider = vi.fn(async () => { expect(events[0]?.phase).toBe("attempt"); expect(events[0]?.objectKey).toBe(objectKey); return new Response("{}"); });
    const boundary = createManagedHubFetchBoundary(plan(), provider as typeof fetch, (event) => events.push(event));
    await ownObject(boundary);
    expect(boundary.scope).toEqual({ resourceId: uid(40), versionId: uid(41), objectKey });
    await expect(boundary.fetch(storageUrl, upload)).rejects.toThrow("request_cap");
    expect(provider).toHaveBeenCalledOnce();
  });
  it("refuses altered PDF bytes, upsert and a different bucket before writing", async () => {
    for (const [url, init] of [[storageUrl, { ...upload, body: new TextEncoder().encode("wrong") }], [storageUrl, { ...upload, headers: { ...upload.headers, "x-upsert": "true" } }], [storageUrl.replace(HUB_BUCKET, "other-bucket"), upload]] as const) {
      const { boundary, upstream } = setup(); boundary.enableWrites();
      await expect(boundary.fetch(url, init)).rejects.toThrow();
      expect(upstream).not.toHaveBeenCalled();
    }
  });
  it("requires durable write-ahead receipt; failed receipt means zero network requests", async () => {
    const upstream = vi.fn();
    const boundary = createManagedHubFetchBoundary(plan(), upstream as typeof fetch, () => { throw new Error("disk unavailable"); });
    boundary.enableWrites();
    await expect(boundary.fetch(storageUrl, upload)).rejects.toThrow("transport_or_receipt_failure");
    expect(upstream).not.toHaveBeenCalled();
  });
  it("preserves an uncertain upload scope and stops every later request", async () => {
    const { boundary } = setup(() => new Response("failure", { status: 503 }));
    await expect(ownObject(boundary)).rejects.toThrow("provider_or_uncertain_write");
    expect(boundary.scope.objectKey).toBe(objectKey);
    await expect(boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("run_stopped");
  });
  it("rejects redirects and sets redirect:error on the actual transport", async () => {
    const { boundary, upstream } = setup(() => new Response(null, { status: 302, headers: { location: "https://example.invalid" } }));
    await expect(boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("redirect");
    expect(upstream.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });
  it("rejects oversized response streams", async () => {
    const { boundary } = setup(() => new Response(new Uint8Array(2 * 1024 * 1024 + 1)));
    await expect(boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("response_cap");
  });
  it("only allows this-run immutable resource and version inserts", async () => {
    const { boundary, upstream } = setup(); await ownObject(boundary);
    const p = plan();
    await boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}`, { method: "POST", body: JSON.stringify({ id: uid(40), title: p.pdf.metadata.title, purpose: p.pdf.metadata.purpose, kind: "pdf", created_at: new Date().toISOString(), created_by_admin: p.actors.admin.email, current_published_version_id: null }) });
    await expect(boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[1]}`, { method: "POST", body: JSON.stringify({ id: uid(99), resource_id: uid(40) }) })).rejects.toThrow("version_insert_scope");
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it("refuses legacy unconditional review PATCH before the provider", async () => {
    const { boundary, upstream } = setup(); await ownObject(boundary);
    await expect(boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[1]}?id=eq.${uid(41)}`, { method: "PATCH", body: JSON.stringify({ state: "in_review" }) })).rejects.toThrow("review_cas_scope");
    expect(upstream).toHaveBeenCalledOnce();
  });
  it("allows bound null-provenance CAS and refuses provenance overwrite", async () => {
    const { boundary, upstream } = setup(); await ownObject(boundary);
    const route = `${origin}/rest/v1/${HUB_TABLES[1]}?id=eq.${uid(41)}&state=eq.draft&reviewed_at=is.null&reviewed_by_admin=is.null&review_reason=is.null&select=id`;
    await boundary.fetch(route, { method: "PATCH", body: JSON.stringify({ state: "in_review" }) });
    await expect(boundary.fetch(route, { method: "PATCH", body: JSON.stringify({ state: "in_review", reviewed_at: new Date().toISOString(), reviewed_by_admin: "unexpected@qa.invalid", review_reason: "unexpected" }) })).rejects.toThrow("review_provenance");
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it("refuses a partial provenance patch without its review timestamp", async () => {
    const { boundary, upstream } = setup(); await ownObject(boundary);
    const route = `${origin}/rest/v1/${HUB_TABLES[1]}?id=eq.${uid(41)}&state=eq.draft&reviewed_at=is.null&reviewed_by_admin=is.null&review_reason=is.null&select=id`;
    await expect(boundary.fetch(route, { method: "PATCH", body: JSON.stringify({ state: "in_review", reviewed_by_admin: "unexpected@qa.invalid" }) })).rejects.toThrow("review_provenance");
    expect(upstream).toHaveBeenCalledOnce();
  });
  it("cannot invoke publication for an existing unrelated resource", async () => {
    const { boundary, upstream } = setup(); await ownObject(boundary);
    await expect(boundary.fetch(`${origin}/rest/v1/rpc/research_resource_hub_publish`, { method: "POST", body: JSON.stringify({ p_resource_id: uid(99), p_version_id: uid(41), p_actor: plan().actors.admin.email, p_at: new Date().toISOString() }) })).rejects.toThrow("transition_scope");
    expect(upstream).toHaveBeenCalledOnce();
  });
  it("records only metadata, never headers, bodies or identity values", async () => {
    const { boundary, events } = setup();
    await boundary.fetch(`${origin}/auth/v1/user`, { headers: { authorization: "Bearer local-double-secret" } });
    const text = JSON.stringify(events);
    expect(text).not.toContain("local-double-secret"); expect(text).not.toContain("qa.invalid");
  });
});

describe("managed CLI composition boundary", () => {
  const token = (claims: Record<string, unknown>) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.local-double-not-signed`;
  const credentials = () => ({
    projectRef, origin, serviceKey: `sb_secret_${"local_double".repeat(3)}`, anonKey: `sb_publishable_${"local_double".repeat(3)}`,
    bearers: Object.fromEntries(ACTOR_NAMES.map((name) => [name, token({ iss: `${origin}/auth/v1`, sub: plan().actors[name].authUserId, exp: Math.floor(Date.now() / 1000) + 3600 })])),
  });
  it("accepts bound metadata for supported keys without claiming authentication", () => {
    expect(validateManagedHubCredentials(credentials(), plan()).projectRef).toBe(projectRef);
    expect(validateManagedHubCredentials({ ...credentials(), anonKey: token({ ref: projectRef, role: "anon" }) }, plan()).projectRef).toBe(projectRef);
  });
  it.each([
    { ref: PRODUCTION_PROJECT, role: "anon" }, { ref: projectRef, role: "service_role" }, { ref: projectRef, role: "authenticated" },
  ])("refuses wrong target or grade legacy public key metadata %j", (claims) => {
    expect(() => validateManagedHubCredentials({ ...credentials(), anonKey: token(claims) }, plan())).toThrow("anon_key_grade_or_binding");
  });
  it.each([`sb_secret_${"local_double".repeat(3)}`, "unknown-opaque-key-not-supported", "sb_publishable_local double with spaces"])("refuses non-public opaque key in public slot", (anonKey) => {
    expect(() => validateManagedHubCredentials({ ...credentials(), anonKey }, plan())).toThrow("anon_key_grade_or_binding");
  });
  it("binds the parsed plan and approval hash to exactly the same bounded bytes", () => {
    const bytes = Buffer.from(JSON.stringify(plan()));
    const parsed = parseManagedHubPlanBytes(bytes);
    expect(parsed.plan).toEqual(plan()); expect(parsed.planSha256).toBe(sha256(bytes));
    expect(() => parseManagedHubPlanBytes(new Uint8Array(64 * 1024 + 1))).toThrow("private_json_size");
    expect(() => parseManagedHubPlanBytes(Buffer.from("malformed"))).toThrow("private_json_parse");
  });
  it("completes short journal writes before fsync", () => {
    const chunks: Uint8Array[] = [];
    let synced = false;
    appendManagedHubJournal(42, { operation: "objects", write: true }, (_fd, bytes, offset, length) => {
      expect(synced).toBe(false);
      const count = Math.min(length, 3); chunks.push(bytes.slice(offset, offset + count)); return count;
    }, (fd) => { expect(fd).toBe(42); synced = true; });
    expect(Buffer.concat(chunks).toString("utf8")).toBe('{"operation":"objects","write":true}\n');
    expect(synced).toBe(true);
  });
  it.each([0, -1, 1.5, 99999])("refuses invalid journal write count %s without fsync", (written) => {
    const sync = vi.fn();
    expect(() => appendManagedHubJournal(42, {}, () => written, sync)).toThrow("journal_short_write");
    expect(sync).not.toHaveBeenCalled();
  });
  it("keeps default preflight credential-free and uses actual production adapters in execution", () => {
    const source = readFileSync(new URL("../../../scripts/revenue-launch/managed-resource-hub-qa.ts", import.meta.url), "utf8");
    expect(source).toContain('status: "LOCAL_PREFLIGHT_PASS"');
    expect(source).toContain('import("../../server/research/resource-hub/production")');
    expect(source).toContain('NODE_ENV: "production"');
    expect(source).toContain('RESEARCH_RESOURCE_HUB_ENABLED: "true"');
    expect(source).not.toContain('import("../../server/index');
    expect(source).not.toContain("createInMemory");
    expect(source).not.toContain("signInWithPassword");
    expect(source).toContain('"non-null microsecond timestamp CAS"');
    expect(source).toContain('"real sign-in/logout/account switching"');
  });
});
