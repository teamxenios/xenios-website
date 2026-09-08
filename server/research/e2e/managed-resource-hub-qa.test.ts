import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { PostgrestClient } from "@supabase/postgrest-js";
import { createSupabaseResourceHubStore } from "../resource-hub/supabase-store";
import { ACTOR_NAMES, APPLICATION_SHA, APPLICATION_TREE, EXPECTED_ATTEMPTS, EXPECTED_WRITES, HUB_BUCKET, HUB_TABLES, PRODUCTION_PROJECT, STAGING_PROJECT, assertStagingTarget, createManagedHubFetchBoundary, sha256, validateManagedHubPlan, type BoundaryEvent, type ManagedHubPlan, type WorkerName, type FixtureName, type ReviewSnapshot } from "../../../scripts/revenue-launch/lib/managed-resource-hub-boundary";
import { appendManagedHubJournal, parseManagedHubPlanBytes, validateManagedHubCredentials, stopManagedHubWorkers, createManagedHubStoreClient } from "../../../scripts/revenue-launch/managed-resource-hub-qa";

const projectRef = STAGING_PROJECT, origin = `https://${projectRef}.supabase.co`;
const uid = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const pdf = new TextEncoder().encode("%PDF-1.7\nbenign fixture bytes for boundary-only doubles\n%%EOF");
function plan(): ManagedHubPlan {
  const actors = Object.fromEntries(ACTOR_NAMES.map((name, index) => [name, { authUserId: uid(index + 1), email: `${name.toLowerCase()}@qa.invalid`, memberId: name.startsWith("admin") ? null : uid(index + 11), memberStatus: name.startsWith("admin") ? null : "active", partner: ["eligible", "suspended"].includes(name) ? { id: uid(index + 21), role: "research_rep", state: name === "suspended" ? "suspended" : "active" } : null }]));
  const fixture = (name: FixtureName) => ({ title: `hubqa-local-boundary ${name}`, purpose: "Benign managed qualification fixture only", usagePolicy: "private", audience: [name === "control" ? "affiliate" : "research_rep"], originalFilename: "qualification.pdf", idempotencyKey: `hubqa-local-boundary-${name}` });
  return validateManagedHubPlan({ schemaVersion: 2, runId: "hubqa-local-boundary", sourceSha: "a".repeat(40), sourceTree: "b".repeat(40), sourceReview: { accepted: true, reviewedSha: "a".repeat(40), reviewedTree: "b".repeat(40), evidenceSha256: "a".repeat(64) }, applicationSha: APPLICATION_SHA, applicationTree: APPLICATION_TREE, applicationReview: { accepted: true, reviewedSha: APPLICATION_SHA, reviewedTree: APPLICATION_TREE, evidenceSha256: "d".repeat(64) }, target: { projectRef, origin, isolatedQualificationEnvironment: true, ownerApprovalSha256: "b".repeat(64) }, credentialsFile: "C:/private/credentials.json", receiptDirectory: "C:/private/fresh-hub-run", actors, pdf: { path: "C:/private/benign.pdf", sha256: sha256(pdf), sizeBytes: pdf.length, losingFilename: "different-qualification.pdf", benignSyntheticFixture: true, contentAudienceApprovalSha256: "c".repeat(64) }, fixtures: { control: fixture("control"), journey: fixture("journey") }, precisionTimestamp: "2026-09-08T12:00:00.123456+00:00", baseline: { resources: 7, versions: 9, deliveries: 11, retainedStateReviewSha256: "e".repeat(64) }, expectedAttempts: EXPECTED_ATTEMPTS, expectedWrites: EXPECTED_WRITES, expectedRefusals: 5, recovery: "preserve-all-stop-and-review-actual-state-before-retry" });
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function setup(response: (url: URL, init?: RequestInit) => Response = () => json([]), recorder?: (event: BoundaryEvent) => void) {
  const events: BoundaryEvent[] = [];
  const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => response(new URL(String(input)), init));
  const boundary = createManagedHubFetchBoundary(plan(), upstream, event => { events.push(event); recorder?.(event); });
  return { boundary, events, upstream };
}
type Boundary = ReturnType<typeof createManagedHubFetchBoundary>;
const objectKey = (n = 40) => `resource-library/${uid(n)}/v1-${uid(n + 1)}.pdf`;
const storageUrl = (n = 40) => `${origin}/storage/v1/object/${HUB_BUCKET}/${objectKey(n)}`;
const upload = { method: "POST", headers: { "content-type": "application/pdf", "x-upsert": "false" }, body: pdf };
const versionLookup = (fixture: FixtureName) => `${origin}/rest/v1/${HUB_TABLES[1]}?select=*&upload_idempotency_key=eq.${plan().fixtures[fixture].idempotencyKey}`;
async function openRace(boundary: Boundary, fixture: FixtureName = "control") {
  boundary.beginPhase(fixture === "control" ? "race_identical" : "race_filename");
  await Promise.all([boundary.fetchFor("adminA")(versionLookup(fixture)), boundary.fetchFor("adminB")(versionLookup(fixture))]);
}
async function ownObject(boundary: Boundary) { await openRace(boundary); await boundary.fetch(storageUrl(), upload); }
const insert = (table: string, row: unknown) => [`${origin}/rest/v1/${table}`, { method: "POST", body: JSON.stringify(row) }] as const;
function resourceRow(n: number, fixture: FixtureName, worker: WorkerName) {
  const p = plan(), m = p.fixtures[fixture]; return { id: uid(n), title: m.title, purpose: m.purpose, kind: "pdf", created_at: "2026-09-08T12:00:00Z", created_by_admin: p.actors[worker].email, current_published_version_id: null };
}
function versionRow(n: number, fixture: FixtureName, worker: WorkerName) {
  const p = plan(), m = p.fixtures[fixture]; return { id: uid(n + 1), resource_id: uid(n), version_number: 1, state: "draft", usage_policy: "private", audience: m.audience, size_bytes: p.pdf.sizeBytes, sha256: p.pdf.sha256, original_filename: fixture === "journey" && worker === "adminB" ? p.pdf.losingFilename : m.originalFilename, content_type: "application/pdf", storage_key: objectKey(n), validation_ok: true, validation_reasons: [], uploaded_at: "2026-09-08T12:00:00Z", uploaded_by_admin: p.actors[worker].email, supersedes_version_id: null, change_summary: null, upload_idempotency_key: m.idempotencyKey };
}

/** Local benign PostgREST double: never sends requests, acquires credentials or simulates Auth proof. */
function providerDouble(staleResponse?: unknown) {
  const resources: Record<string, unknown>[] = [], versions: Record<string, unknown>[] = [], audits: Record<string, unknown>[] = [], objects: string[] = [];
  const upstream: typeof fetch = async (input, init) => {
    const u = new URL(String(input)), method = init?.method ?? "GET", table = u.pathname.slice(9);
    if (u.pathname.includes("/storage/v1/object/")) { if (method === "POST") { objects.push(u.pathname); return json({}); } return new Response(pdf); }
    const rows = table === HUB_TABLES[0] ? resources : table === HUB_TABLES[1] ? versions : audits;
    const matches = (row: Record<string, unknown>) => [...u.searchParams].filter(([k]) => !["select", "limit", "order"].includes(k)).every(([k, v]) => v === "is.null" ? row[k] === null : v.startsWith("eq.") ? String(row[k]) === v.slice(3) : v.startsWith("in.(") && v.slice(4, -1).split(",").includes(String(row[k])));
    if (method === "GET") return json(rows.filter(matches));
    const body: Record<string, unknown> = JSON.parse(Buffer.from(init?.body as ArrayBuffer).toString());
    if (method === "POST" && table.startsWith("rpc/")) return json(null);
    if (method === "POST") {
      if (table === HUB_TABLES[1] && versions.some(v => v.upload_idempotency_key === body.upload_idempotency_key)) return json({ code: "23505" }, 409);
      rows.push(table === HUB_TABLES[1] ? { ...body, reviewed_at: null, reviewed_by_admin: null, review_reason: null } : body); return new Response(null, { status: 201 });
    }
    if (method === "PATCH") {
      if (staleResponse !== undefined && String(body.review_reason).startsWith("Synthetic stale refusal")) return json(staleResponse);
      if (body.reviewed_at === "managed-qa-invalid-timestamp") return json({ code: "22007" }, 400);
      const row = rows.find(matches); if (!row) return json([]); Object.assign(row, body); return json([{ id: row.id }]);
    }
    throw new Error("Unexpected local provider request");
  };
  const events: BoundaryEvent[] = [], boundary = createManagedHubFetchBoundary(plan(), upstream, event => events.push(event));
  return { boundary, events, resources, versions, audits, objects };
}
async function completedRace(boundary: Boundary, fixture: FixtureName, n: number) {
  await openRace(boundary, fixture);
  for (const [worker, offset] of [["adminA", 0], ["adminB", 2]] as const) {
    await boundary.fetchFor(worker)(storageUrl(n + offset), upload);
    await boundary.fetchFor(worker)(...insert(HUB_TABLES[0], resourceRow(n + offset, fixture, worker)));
  }
  await Promise.all([boundary.fetchFor("adminB")(...insert(HUB_TABLES[1], versionRow(n + 2, fixture, "adminB"))), boundary.fetchFor("adminA")(...insert(HUB_TABLES[1], versionRow(n, fixture, "adminA")))]);
}
function reviewRequest(id: string, expected: ReviewSnapshot, patch: Record<string, unknown>) {
  const query = new URLSearchParams({ id: `eq.${id}`, state: `eq.${expected.state}`, reviewed_at: expected.reviewedAt === null ? "is.null" : `eq.${expected.reviewedAt}`, reviewed_by_admin: expected.reviewedByAdmin === null ? "is.null" : `eq.${expected.reviewedByAdmin}`, review_reason: expected.reviewReason === null ? "is.null" : `eq.${expected.reviewReason}`, select: "id" });
  return [`${origin}/rest/v1/${HUB_TABLES[1]}?${query}`, { method: "PATCH", body: JSON.stringify(patch) }] as const;
}
async function beforePrecision(staleResponse?: unknown) { const d = providerDouble(staleResponse); await completedRace(d.boundary, "control", 40); await completedRace(d.boundary, "journey", 50); d.boundary.beginPhase("retry_controls"); d.boundary.beginPhase("precision_seed"); return d; }
const draft: ReviewSnapshot = { state: "draft", reviewedAt: null, reviewedByAdmin: null, reviewReason: null };
const seed = (): ReviewSnapshot => ({ state: "in_review", reviewedAt: plan().precisionTimestamp, reviewedByAdmin: plan().actors.adminA.email, reviewReason: `Synthetic precision seed ${plan().runId}` });
const seedPatch = () => ({ state: "in_review", reviewed_at: seed().reviewedAt, reviewed_by_admin: seed().reviewedByAdmin, review_reason: seed().reviewReason });

// Equivalent controls replace the v1 single-admin/empty-database assumptions; none is managed evidence.
describe("managed Hub exact five-role staging plan", () => {
  it("accepts a retained baseline and bounded two-resource private plan", () => { expect(plan().expectedWrites.deliveries).toBe(6); expect(plan().baseline.resources).toBe(7); expect(ACTOR_NAMES).toHaveLength(5); });
  it.each([[PRODUCTION_PROJECT, `https://${PRODUCTION_PROJECT}.supabase.co`], [projectRef, "https://xeniostechnology.com"], [projectRef, "https://xenios-website.onrender.com"], [projectRef, `${origin}/`], [projectRef, `${origin}:443`], [projectRef, `${origin}/rest/v1`], [projectRef, `http://${projectRef}.supabase.co`], [projectRef, `https://user@${projectRef}.supabase.co`], [projectRef, "https://differentabcdefghijk.supabase.co"], ["bad", origin], ["abcdefghijklmnopqrst", "https://abcdefghijklmnopqrst.supabase.co"]])("rejects unapproved/ambiguous target %s %s", (ref, url) => expect(() => assertStagingTarget(ref, url)).toThrow());
  it("rejects unreviewed harness/application and broader audiences", () => {
    const p = plan(); p.sourceReview.reviewedSha = "d".repeat(40); expect(() => validateManagedHubPlan(p)).toThrow("source_review_binding");
    const app = plan(); app.applicationReview.reviewedTree = "d".repeat(40); expect(() => validateManagedHubPlan(app)).toThrow("source_review_binding");
    const broad = plan(); broad.fixtures.journey.audience = ["all_partners"]; expect(() => validateManagedHubPlan(broad)).toThrow("audience_control");
  });
  it("rejects role-budget expansion and requires a distinct second admin", () => { expect(() => validateManagedHubPlan({ ...plan(), actors: { ...plan().actors, outside: plan().actors.eligible } })).toThrow("plan_schema"); const p = plan(); p.actors.adminB.authUserId = p.actors.adminA.authUserId; expect(() => validateManagedHubPlan(p)).toThrow("distinct_principals"); });
  it("requires distinct emails and active existing member roles", () => { const p = plan(); p.actors.adminB.email = p.actors.adminA.email; expect(() => validateManagedHubPlan(p)).toThrow("distinct_emails"); const closed = plan(); closed.actors.eligible.memberStatus = "closed"; expect(() => validateManagedHubPlan(closed)).toThrow("member_plan"); });
  it("cannot name an existing resource or non-synthetic content", () => { const p = plan(); p.fixtures.journey.resourceId = uid(90); expect(() => validateManagedHubPlan(p)).toThrow("fixture_scope"); expect(() => validateManagedHubPlan({ ...plan(), pdf: { ...plan().pdf, benignSyntheticFixture: false } })).toThrow("plan_schema"); });
  it("requires same-role suspended control and an excluded control audience", () => { const p = plan(); if (p.actors.suspended.partner) p.actors.suspended.partner.state = "active"; expect(() => validateManagedHubPlan(p)).toThrow("partner_state_plan"); const p2 = plan(); p2.fixtures.control.audience = ["research_rep"]; expect(() => validateManagedHubPlan(p2)).toThrow("audience_control"); });
  it("requires private policy, run-bound keys and different safe filename only", () => { const p = plan(); p.fixtures.control.usagePolicy = "training"; expect(() => validateManagedHubPlan(p)).toThrow("fixture_scope"); const p2 = plan(); p2.pdf.losingFilename = "../other.pdf"; expect(() => validateManagedHubPlan(p2)).toThrow("filename_control"); });
});

describe("combined fetch boundary with local doubles only", () => {
  it("preflight denies every mutation before transport", async () => { const d = setup(); await expect(d.boundary.fetch(storageUrl(), upload)).rejects.toThrow("preflight_is_read_only"); expect(d.upstream).not.toHaveBeenCalled(); });
  it.each([["POST", "/auth/v1/token"], ["POST", "/auth/v1/admin/users"], ["POST", "/auth/v1/logout"], ["POST", "/rest/v1/research_members"], ["POST", "/rest/v1/notification_outbox"], ["POST", "/rest/v1/rpc/arbitrary"], ["DELETE", `/storage/v1/object/${HUB_BUCKET}`], ["POST", "/storage/v1/bucket"], ["GET", "/storage/v1/object/public/anything"]])("rejects forbidden %s %s", async (method, route) => { const d = setup(); d.boundary.beginPhase("race_identical"); await expect(d.boundary.fetch(`${origin}${route}`, { method, body: method === "GET" ? undefined : "{}" })).rejects.toThrow(); expect(d.upstream).not.toHaveBeenCalled(); });
  it("rejects off-target and encoded paths before transport", async () => { const d = setup(); await expect(d.boundary.fetch(`https://${PRODUCTION_PROJECT}.supabase.co/auth/v1/user`)).rejects.toThrow("request_origin_or_path"); expect(d.upstream).not.toHaveBeenCalled(); const d2 = setup(); await expect(d2.boundary.fetch(`${origin}/auth/v1/%2fuser`)).rejects.toThrow("request_origin_or_path"); });
  it("requires exact identity filters and caps those reads", async () => { const d = setup(); await d.boundary.fetch(`${origin}/rest/v1/research_members?select=*&auth_user_id=eq.${plan().actors.eligible.authUserId}`); expect(String(d.upstream.mock.calls[0]?.[0])).toContain("limit=2"); const other = setup(); await expect(other.boundary.fetch(`${origin}/rest/v1/research_members?select=*`)).rejects.toThrow("identity_read_scope"); });
  it.each(["select=id,research_members(*)", "select=id&select=*", "select=id&order=other.asc"])("refuses broadened projection/query %s", async query => { const d = setup(); await expect(d.boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}?${query}`)).rejects.toThrow(); expect(d.upstream).not.toHaveBeenCalled(); });
  it("permits only the bounded service-key read", async () => { const d = setup(); await d.boundary.fetch(`${origin}/auth/v1/admin/users?page=1&per_page=1`); expect(d.upstream).toHaveBeenCalledOnce(); await expect(d.boundary.fetch(`${origin}/auth/v1/admin/users?page=1&per_page=200`)).rejects.toThrow("endpoint"); });
  it("requires durable write-ahead receipt and per-worker immutable object cap", async () => { const d = setup(); await ownObject(d.boundary); const event = d.events.find(e => e.operation === "objects"); expect(event).toMatchObject({ phase: "attempt", objectKey: objectKey(), worker: "adminA", runPhase: "race_identical" }); await expect(d.boundary.fetch(storageUrl(60), upload)).rejects.toThrow("request_cap"); expect(d.upstream).toHaveBeenCalledTimes(3); });
  it.each(["bytes", "upsert", "bucket"])("refuses altered %s before writing", async control => { const d = setup(); await openRace(d.boundary); const init = control === "bytes" ? { ...upload, body: new TextEncoder().encode("wrong") } : control === "upsert" ? { ...upload, headers: { ...upload.headers, "x-upsert": "true" } } : upload; await expect(d.boundary.fetch(control === "bucket" ? storageUrl().replace(HUB_BUCKET, "other-bucket") : storageUrl(), init)).rejects.toThrow(); expect(d.upstream).toHaveBeenCalledTimes(2); });
  it("failed durable receipt sends no write", async () => { const d = setup(undefined, e => { if (e.write) throw new Error("disk unavailable"); }); await openRace(d.boundary); await expect(d.boundary.fetch(storageUrl(), upload)).rejects.toThrow("transport_or_receipt_failure"); expect(d.upstream).toHaveBeenCalledTimes(2); });
  it("preserves uncertain scope and permanently stops requests", async () => { const d = setup((_, init) => init?.method === "POST" ? json({}, 503) : json([])); await openRace(d.boundary); await expect(d.boundary.fetch(storageUrl(), upload)).rejects.toThrow("provider_or_uncertain_write"); expect(d.boundary.owned[0]?.objectKey).toBe(objectKey()); expect(d.boundary.owned[0]?.objectAcknowledged).toBe(false); await expect(d.boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("run_stopped"); });
  it("rejects redirects on actual transport with redirect:error", async () => { const d = setup(() => new Response(null, { status: 302 })); await expect(d.boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("redirect"); expect(d.upstream.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" }); });
  it("rejects oversized response streams", async () => { const d = setup(() => new Response(new Uint8Array(2 * 1024 * 1024 + 1))); await expect(d.boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("response_cap"); });
  it("only allows this-run resource and version inserts", async () => { const d = setup(); await ownObject(d.boundary); await d.boundary.fetch(...insert(HUB_TABLES[0], resourceRow(40, "control", "adminA"))); await expect(d.boundary.fetch(...insert(HUB_TABLES[1], { id: uid(99), resource_id: uid(40) }))).rejects.toThrow("version_insert_scope"); expect(d.upstream).toHaveBeenCalledTimes(4); });
  it("refuses unconditional review updates", async () => { const d = await beforePrecision(); await expect(d.boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[1]}?id=eq.${uid(41)}`, { method: "PATCH", body: JSON.stringify({ state: "in_review" }) })).rejects.toThrow("review_cas_scope"); });
  it("requires exact null provenance CAS and rejects forged snapshot", async () => { const d = await beforePrecision(); expect(() => d.boundary.setExpectedReview({ ...draft, reviewedByAdmin: "other@qa.invalid" })).toThrow("review_snapshot_binding"); d.boundary.setExpectedReview(draft); await d.boundary.fetch(...reviewRequest(uid(41), draft, seedPatch())); expect(d.versions[0]?.reviewed_at).toBe(plan().precisionTimestamp); });
  it.each([{ state: "in_review", reviewed_by_admin: "unexpected@qa.invalid", review_reason: "unexpected" }, { state: "in_review", reviewed_at: "2026-09-08", reviewed_by_admin: "unexpected@qa.invalid", review_reason: "unexpected" }])("refuses partial/foreign provenance patch %j", async patch => { const d = await beforePrecision(); d.boundary.setExpectedReview(draft); await expect(d.boundary.fetch(...reviewRequest(uid(41), draft, patch))).rejects.toThrow("review_provenance"); });
  it("cannot publish an unrelated resource or from a wrong phase", async () => { const d = await beforePrecision(); await expect(d.boundary.fetch(...insert("rpc/research_resource_hub_publish", { p_resource_id: uid(99), p_version_id: uid(41), p_actor: plan().actors.adminA.email, p_at: "2026-09-08T12:00:00Z" }))).rejects.toThrow("transition_scope"); });
  it("records no headers, bodies or raw identities", async () => { const d = setup(); await d.boundary.fetch(`${origin}/auth/v1/user`, { headers: { authorization: "Bearer local-double-secret" } }); expect(JSON.stringify(d.events)).not.toContain("local-double-secret"); expect(JSON.stringify(d.events)).not.toContain("qa.invalid"); });
  it("requires ordered, complete phases without inflight work", async () => { const d = setup(); expect(() => d.boundary.beginPhase("precision_seed")).toThrow("phase_order"); d.boundary.beginPhase("race_identical"); expect(() => d.boundary.beginPhase("race_filename")).toThrow("phase_incomplete"); });
  it("cannot start upload before both real empty snapshots", async () => { const d = setup(); d.boundary.beginPhase("race_identical"); await expect(d.boundary.fetch(storageUrl(), upload)).rejects.toThrow("upload_barrier_incomplete"); expect(d.upstream).not.toHaveBeenCalled(); });
  it("restricts full Hub lists at the provider to run-owned IDs", async () => { const d = setup(); await d.boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}?select=id`); expect(String(d.upstream.mock.calls[0]?.[0])).toContain("id=is.null"); expect(d.events[0]?.runScopedProjection).toBe(true); });
  it("allows only metadata HEAD counts against retained baseline", async () => { const d = setup(() => new Response(null, { headers: { "content-range": "*/7" } })); await d.boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}?select=id&limit=0`, { method: "HEAD", headers: { prefer: "count=exact" } }); expect(d.upstream).toHaveBeenCalledOnce(); await expect(d.boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}?select=*`, { method: "HEAD" })).rejects.toThrow("baseline_count_scope"); });
  it("retains the unique-race loser as owned object/resource only", async () => { const d = providerDouble(); await completedRace(d.boundary, "control", 40); expect(d.objects).toHaveLength(2); expect(d.resources).toHaveLength(2); expect(d.versions).toHaveLength(1); expect(d.boundary.owned[1]).toMatchObject({ worker: "adminB", objectAcknowledged: true, resourceAcknowledged: true, versionAcknowledged: false }); expect(d.events.filter(e => e.expectedRefusal)).toHaveLength(1); });
  it("does not accept an unrelated provider error as expected conflict", async () => { const d = setup((_, init) => init?.method === "POST" ? json({ code: "23505" }, 409) : json([])); await openRace(d.boundary); await expect(d.boundary.fetch(storageUrl(), upload)).rejects.toThrow("provider_or_uncertain_write"); });
  it("enforces the total shared request cap across both workers", async () => { const d = setup(); for (let n = 0; n < 4; n++) await d.boundary.fetchFor(n % 2 ? "adminB" : "adminA")(`${origin}/auth/v1/admin/users?page=1&per_page=1`); await expect(d.boundary.fetch(`${origin}/auth/v1/admin/users?page=1&per_page=1`)).rejects.toThrow("request_cap"); });
});

describe("precision/concurrency deterministic local boundary sequence", () => {
  it.each([false, 0, "", {}, [{}], [{ id: uid(41) }, { id: uid(41) }]])("rejects malformed zero-row CAS body %j", async body => {
    const d = await beforePrecision(body), b = d.boundary, p = plan();
    b.setExpectedReview(draft); await b.fetch(...reviewRequest(uid(41), draft, seedPatch()));
    b.beginPhase("precision_match"); b.setExpectedReview(seed()); await b.fetch(...reviewRequest(uid(41), seed(), { review_reason: `Synthetic precision match ${p.runId}` }));
    const stale = { ...seed(), reviewReason: `Synthetic precision match ${p.runId}`, reviewedAt: p.precisionTimestamp.replace(".123456", ".123457") };
    b.beginPhase("precision_stale"); b.setExpectedReview(stale);
    await expect(b.fetch(...reviewRequest(uid(41), stale, { review_reason: `Synthetic stale refusal ${p.runId}` }))).rejects.toThrow("review_response_shape");
    expect(b.expectedRefusals).toBe(2); expect(() => b.assertHealthy()).toThrow("run_stopped");
  });
  it("accounts exact attempts, acknowledgements, five narrow refusals and preserved orphans", async () => {
    const d = await beforePrecision(), b = d.boundary, p = plan();
    b.setExpectedReview(draft); await b.fetch(...reviewRequest(uid(41), draft, seedPatch()));
    b.beginPhase("precision_match"); b.setExpectedReview(seed()); await b.fetch(...reviewRequest(uid(41), seed(), { review_reason: `Synthetic precision match ${p.runId}` }));
    const matched = { ...seed(), reviewReason: `Synthetic precision match ${p.runId}` };
    b.beginPhase("precision_stale"); const stale = { ...matched, reviewedAt: p.precisionTimestamp.replace(".123456", ".123457") }; b.setExpectedReview(stale); const loser = await b.fetch(...reviewRequest(uid(41), stale, { review_reason: `Synthetic stale refusal ${p.runId}` })); expect(await loser.json()).toEqual([]);
    b.beginPhase("precision_provider"); b.setExpectedReview(matched); const provider = await b.fetch(...reviewRequest(uid(41), matched, { reviewed_at: "managed-qa-invalid-timestamp" })); expect(provider.status).toBe(400); expect(d.versions[0]?.reviewed_at).toBe(p.precisionTimestamp); expect(d.versions[0]?.review_reason).toBe(matched.reviewReason);
    b.beginPhase("request_review"); await b.fetch(...reviewRequest(uid(51), draft, { state: "in_review" }));
    b.beginPhase("review_race"); const snapshot: ReviewSnapshot = { ...draft, state: "in_review" };
    await Promise.all([b.fetchFor("adminA")(`${origin}/rest/v1/${HUB_TABLES[1]}?select=*&id=eq.${uid(51)}`), b.fetchFor("adminB")(`${origin}/rest/v1/${HUB_TABLES[1]}?select=*&id=eq.${uid(51)}`)]);
    const patch = (worker: WorkerName) => ({ state: "in_review", reviewed_at: "2026-09-08T12:01:00.123Z", reviewed_by_admin: p.actors[worker].email, review_reason: `Managed qualification ${p.runId}` });
    const responses = await Promise.all([b.fetchFor("adminB")(...reviewRequest(uid(51), snapshot, patch("adminB"))), b.fetchFor("adminA")(...reviewRequest(uid(51), snapshot, patch("adminA")))]); expect(await responses[0]?.json()).toEqual([]); expect(d.versions[1]?.reviewed_by_admin).toBe(p.actors.adminA.email);
    const transition = (name: "publish" | "withdraw", fixture: FixtureName) => { const w = b.winner(fixture); return b.fetch(...insert(`rpc/research_resource_hub_${name}`, { p_resource_id: w.resourceId, p_version_id: w.versionId, p_actor: p.actors.adminA.email, p_at: "2026-09-08T12:02:00Z", ...(name === "withdraw" ? { p_reason: `Qualification complete ${p.runId}` } : {}) })); };
    b.beginPhase("publish_control"); await transition("publish", "control"); b.beginPhase("publish_journey"); await transition("publish", "journey");
    b.beginPhase("delivery_checks");
    let deliveryId = 100;
    const deliver = (resource: number, version: number | null, member: "eligible" | "suspended", outcome: "delivered" | "denied", reason: string | null) => b.fetch(...insert(HUB_TABLES[2], { id: uid(deliveryId++), resource_id: uid(resource), version_id: version ? uid(version) : null, member_id: p.actors[member].memberId, requested_at: "2026-09-08T12:02:00Z", outcome, reason }));
    await deliver(40, 41, "eligible", "denied", "audience"); await deliver(50, 51, "suspended", "denied", "audience"); await deliver(50, 51, "eligible", "delivered", null); await deliver(42, null, "eligible", "denied", "not_published"); await deliver(52, null, "eligible", "denied", "not_published");
    b.beginPhase("withdraw_control"); await transition("withdraw", "control"); b.beginPhase("withdraw_journey"); await transition("withdraw", "journey"); b.beginPhase("postchecks"); await deliver(50, null, "eligible", "denied", "not_published");
    expect(() => b.assertComplete()).not.toThrow(); expect(b.acknowledged).toEqual(EXPECTED_WRITES); expect(b.expectedRefusals).toBe(5); expect(d.objects).toHaveLength(4); expect(d.resources).toHaveLength(4); expect(d.versions).toHaveLength(2); expect(d.audits).toHaveLength(6); expect(d.events.filter(e => e.write && e.phase === "response" && e.expectedRefusal)).toHaveLength(5);
  });
});

describe("managed CLI composition boundary", () => {
  it("permits the actual store's canonical version projection through the real Supabase query SDK during preflight", async () => {
    const d = setup();
    // No retries in this offline reproducer: inspect the first real SDK request directly.
    const sdk = new PostgrestClient(`${origin}/rest/v1`, { fetch: d.boundary.fetch, retry: false });
    const store = createSupabaseResourceHubStore(() => createManagedHubStoreClient(sdk));
    await expect(store.findVersionByUploadKey(plan().fixtures.control.idempotencyKey)).resolves.toBeNull();
    expect(d.upstream).toHaveBeenCalledOnce();
    const url = new URL(String(d.upstream.mock.calls[0]?.[0]));
    expect(url.searchParams.get("select")?.split(",")).toContain("sha256");
    expect(url.searchParams.get("upload_idempotency_key")).toBe(`eq.${plan().fixtures.control.idempotencyKey}`);
    await expect(store.listResources()).resolves.toEqual([]);
    await expect(store.listPublished()).resolves.toEqual([]);
    expect(d.upstream).toHaveBeenCalledTimes(3);
    const resourceList = new URL(String(d.upstream.mock.calls[1]?.[0]));
    const publishedList = new URL(String(d.upstream.mock.calls[2]?.[0]));
    expect(resourceList.searchParams.get("id")).toBe("is.null");
    expect(publishedList.searchParams.get("id")).toBe("is.null");
    expect(publishedList.searchParams.get("state")).toBe("eq.published");
    expect(d.events.every(event => !event.write)).toBe(true);
  });
  it.each(["hash:sha256", "sha256::text", "sha256->>value", "count()", "research_members(*)", "256sha"])("refuses projection syntax beyond ordinary column identifiers: %s", async projection => {
    const d = setup();
    const sdk = new PostgrestClient(`${origin}/rest/v1`, { fetch: d.boundary.fetch, retry: false });
    const result = await sdk.from(HUB_TABLES[1]).select(projection).eq("upload_idempotency_key", plan().fixtures.control.idempotencyKey);
    expect(result.error).not.toBeNull(); expect(d.upstream).not.toHaveBeenCalled();
    expect(d.boundary.failure).toMatchObject({ code: "projection_scope", stage: "request_validation", runPhase: "preflight", worker: "adminA", requestNumber: 1 });
    await expect(d.boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("run_stopped");
    expect(d.boundary.failure?.code).toBe("projection_scope");
    expect(d.events[0]).toMatchObject({ phase: "refusal", failureCode: "projection_scope", failureStage: "request_validation", write: false });
    expect(JSON.stringify(d.boundary.failure)).not.toContain(projection);
  });
  it("observes local benign child exit before reporting shutdown complete", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
    expect(await stopManagedHubWorkers([child])).toBe(true);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
  it("aborts pending transport and waits for the combined broker to settle", async () => {
    let started = () => {};
    const ready = new Promise<void>(resolve => { started = resolve; });
    const boundary = createManagedHubFetchBoundary(plan(), async (_input, init) => {
      started();
      return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted local double")), { once: true }));
    }, () => {});
    const pending = boundary.fetch(`${origin}/auth/v1/user`);
    const rejection = expect(pending).rejects.toThrow("transport_or_receipt_failure");
    await ready; boundary.stop(); await rejection; await expect(boundary.waitUntilIdle()).resolves.toBeUndefined();
    await expect(boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("run_stopped");
  });
  const token = (claims: Record<string, unknown>) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.local-double-not-signed`;
  const credentials = () => ({ projectRef, origin, serviceKey: `sb_secret_${"local_double".repeat(3)}`, anonKey: `sb_publishable_${"local_double".repeat(3)}`, bearers: Object.fromEntries(ACTOR_NAMES.map(name => [name, token({ iss: `${origin}/auth/v1`, sub: plan().actors[name].authUserId, exp: Math.floor(Date.now() / 1000) + 3600 })])) });
  it("accepts bound metadata without claiming authentication", () => { expect(validateManagedHubCredentials(credentials(), plan()).projectRef).toBe(projectRef); expect(validateManagedHubCredentials({ ...credentials(), anonKey: token({ ref: projectRef, role: "anon" }) }, plan()).projectRef).toBe(projectRef); });
  it.each([{ ref: PRODUCTION_PROJECT, role: "anon" }, { ref: projectRef, role: "service_role" }, { ref: projectRef, role: "authenticated" }])("refuses wrong target/grade legacy public key %j", claims => expect(() => validateManagedHubCredentials({ ...credentials(), anonKey: token(claims) }, plan())).toThrow("anon_key_grade_or_binding"));
  it.each([`sb_secret_${"local_double".repeat(3)}`, "unknown-opaque-key-not-supported", "sb_publishable_local double with spaces"])("refuses non-public opaque key", anonKey => expect(() => validateManagedHubCredentials({ ...credentials(), anonKey }, plan())).toThrow("anon_key_grade_or_binding"));
  it("rejects wrong-target credentials before constructing any client", () => expect(() => validateManagedHubCredentials({ ...credentials(), projectRef: PRODUCTION_PROJECT }, plan())).toThrow("project_binding"));
  it("rejects wrong-target/lifetime bearer metadata", () => { const c = credentials(); c.bearers.adminA = token({ iss: `${origin}/auth/v1`, sub: plan().actors.adminA.authUserId, exp: 1 }); expect(() => validateManagedHubCredentials(c, plan())).toThrow("bearer_target_or_lifetime"); });
  it("hashes and parses the same bounded plan bytes", () => { const bytes = Buffer.from(JSON.stringify(plan())), parsed = parseManagedHubPlanBytes(bytes); expect(parsed.plan).toEqual(plan()); expect(parsed.planSha256).toBe(sha256(bytes)); expect(() => parseManagedHubPlanBytes(new Uint8Array(64 * 1024 + 1))).toThrow("private_json_size"); expect(() => parseManagedHubPlanBytes(Buffer.from("malformed"))).toThrow("private_json_parse"); });
  it("completes partial journal writes before fsync", () => { const chunks: Uint8Array[] = []; let synced = false; appendManagedHubJournal(42, { operation: "objects", write: true }, (_fd, bytes, offset, length) => { expect(synced).toBe(false); const count = Math.min(length, 3); chunks.push(bytes.slice(offset, offset + count)); return count; }, fd => { expect(fd).toBe(42); synced = true; }); expect(Buffer.concat(chunks).toString()).toBe('{"operation":"objects","write":true}\n'); expect(synced).toBe(true); });
  it.each([0, -1, 1.5, 99999])("rejects journal write count %s without fsync", written => { const sync = vi.fn(); expect(() => appendManagedHubJournal(42, {}, () => written, sync)).toThrow("journal_short_write"); expect(sync).not.toHaveBeenCalled(); });
  it("keeps credential-free preflight, isolated canonical production adapters and honest proof limits", () => {
    const source = readFileSync(new URL("../../../scripts/revenue-launch/managed-resource-hub-qa.ts", import.meta.url), "utf8");
    for (const expected of ['status: "LOCAL_PREFLIGHT_PASS"', 'import("../../server/research/resource-hub/production")', 'NODE_ENV: "production"', 'RESEARCH_RESOURCE_HUB_ENABLED: "true"', '"real sign-in/logout/account switching"', '"different-hash stored PDF upload race recovery"', 'spawn(process.execPath', 'application_runtime_changed']) expect(source).toContain(expected);
    for (const forbidden of ['import("../../server/index', "createInMemory", "signInWithPassword", "auth.admin.createUser"]) expect(source).not.toContain(forbidden);
  });
});
