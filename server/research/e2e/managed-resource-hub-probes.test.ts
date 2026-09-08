import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ACTOR_NAMES, HUB_BUCKET, HUB_TABLES, PRODUCTION_PROJECT, sha256 } from "../../../scripts/revenue-launch/lib/managed-resource-hub-boundary";
import {
  PROBE_EXPECTED_WRITES,
  createManagedHubProbeBoundary,
  probeText,
  toManagedPlan,
  validateManagedHubProbePlan,
  type ManagedHubProbePlan,
  type ProbeEvent,
} from "../../../scripts/revenue-launch/lib/managed-resource-hub-probe-boundary";
import { PROVIDER_TIMESTAMP, differentBytesVariant, microsecondVariant, parseManagedHubProbePlanBytes } from "../../../scripts/revenue-launch/managed-resource-hub-probes";

// Local doubles only: no server, no HTTP client, no managed adapter, no production composition.
const projectRef = "abcdefghijklmnopqrst";
const origin = `https://${projectRef}.supabase.co`;
const runId = "hubqa-local-boundary-probes";
const foundationRunId = "hubqa-local-boundary";
const AT = "2026-09-08T00:00:00.000Z";
const uid = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const pdf = new TextEncoder().encode("%PDF-1.7\nbenign fixture bytes for probe boundary doubles\n%%EOF");
const text = probeText(runId);
const admin = "admin@qa.invalid";

function rawPlan() {
  const actors = Object.fromEntries(ACTOR_NAMES.map((name, index) => [name, { authUserId: uid(index + 1), email: `${name}@qa.invalid`, memberId: name === "admin" ? null : uid(index + 11), memberStatus: name === "admin" ? null : "active", partner: ["inside", "outside", "blocked"].includes(name) ? { id: uid(index + 21), role: name === "outside" ? "affiliate" : "research_rep", state: name === "blocked" ? "suspended" : "active" } : null }]));
  return {
    schemaVersion: 1, kind: "managed-hub-probes", runId, foundationRunId,
    sourceSha: "a".repeat(40), sourceTree: "b".repeat(40), precisionFixCommit: "c".repeat(40),
    sourceReview: { accepted: true, reviewedSha: "a".repeat(40), reviewedTree: "b".repeat(40), evidenceSha256: "a".repeat(64) },
    target: { projectRef, origin, isolatedQualificationEnvironment: true, ownerApprovalSha256: "b".repeat(64) },
    credentialsFile: "C:/private/credentials.json", receiptDirectory: "C:/private/fresh-probe-run", actors,
    pdf: { path: "C:/private/benign.pdf", sha256: sha256(pdf), sizeBytes: pdf.length, metadata: { title: "Qualification fixture", purpose: "Benign managed qualification fixture only", usagePolicy: "training", audience: ["research_rep"], originalFilename: "qualification.pdf", idempotencyKey: runId }, benignSyntheticFixture: true, contentAudienceApprovalSha256: "c".repeat(64) },
    retainedRows: { preserve: true, maxRowsPerTable: 100 }, expectedWrites: { ...PROBE_EXPECTED_WRITES },
    recovery: "preserve-all-stop-and-review-actual-state-before-retry",
  };
}
const plan = (): ManagedHubProbePlan => validateManagedHubProbePlan(rawPlan()).plan;

const key = (rid: number, vid: number) => `resource-library/${uid(rid)}/v1-${uid(vid)}.pdf`;
const storageUrl = (rid: number, vid: number) => `${origin}/storage/v1/object/${HUB_BUCKET}/${key(rid, vid)}`;
const versionsUrl = `${origin}/rest/v1/${HUB_TABLES[1]}`;
const lookupUrl = `${versionsUrl}?select=id&upload_idempotency_key=eq.${runId}`;
const versionReadUrl = (vid: number) => `${versionsUrl}?select=id&id=eq.${uid(vid)}`;
const upload = { method: "POST", headers: { "content-type": "application/pdf", "x-upsert": "false" }, body: pdf };
const resourceRow = (rid: number) => ({ id: uid(rid), title: "Qualification fixture", purpose: "Benign managed qualification fixture only", kind: "pdf", created_at: AT, created_by_admin: admin, current_published_version_id: null });
const versionRow = (rid: number, vid: number) => ({ id: uid(vid), resource_id: uid(rid), version_number: 1, state: "draft", usage_policy: "training", audience: ["research_rep"], size_bytes: pdf.length, sha256: sha256(pdf), original_filename: "qualification.pdf", content_type: "application/pdf", storage_key: key(rid, vid), validation_ok: true, validation_reasons: [], uploaded_at: AT, uploaded_by_admin: admin, supersedes_version_id: null, change_summary: null, upload_idempotency_key: runId });
const nullCas = (vid: number) => `${versionsUrl}?id=eq.${uid(vid)}&state=eq.draft&reviewed_at=is.null&reviewed_by_admin=is.null&review_reason=is.null&select=id`;
const microCas = (vid: number, at = "2026-09-08T00:00:00.123456+00:00") => `${versionsUrl}?id=eq.${uid(vid)}&state=eq.in_review&reviewed_at=eq.${encodeURIComponent(at)}&reviewed_by_admin=eq.${encodeURIComponent(admin)}&review_reason=eq.${encodeURIComponent(text.approvalA)}&select=id`;
const patch = (body: Record<string, unknown>) => ({ method: "PATCH", body: JSON.stringify(body) });
const post = (body: Record<string, unknown>) => ({ method: "POST", body: JSON.stringify(body) });

type Responder = (req: { method: string; url: URL; body: string }) => Response | Promise<Response>;
/** A staging double with the provider outcomes the probes depend on: 201 then 23505 for version inserts, `[]` for a lost CAS. */
function stagingDouble(overrides: Partial<{ versionInsert: Responder; patch: Responder }> = {}): Responder {
  let versionInserts = 0;
  return ({ method, url, body }) => {
    const path = url.pathname;
    if (path.startsWith("/storage/v1/object/") && method === "POST") return new Response("{}", { status: 200 });
    if (path.startsWith("/storage/v1/object/") && method === "GET") return new Response(pdf, { status: 200 });
    if (path === `/rest/v1/${HUB_TABLES[1]}` && method === "POST") {
      if (overrides.versionInsert) return overrides.versionInsert({ method, url, body });
      return ++versionInserts === 1 ? new Response(null, { status: 201 }) : new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }), { status: 409 });
    }
    if (path === `/rest/v1/${HUB_TABLES[1]}` && method === "PATCH") return overrides.patch ? overrides.patch({ method, url, body }) : new Response(JSON.stringify([{ id: url.searchParams.get("id")?.slice(3) }]), { status: 200 });
    if (path.startsWith("/rest/v1/rpc/")) return new Response(null, { status: 204 });
    if (method === "POST") return new Response(null, { status: 201 });
    return new Response("[]", { status: 200 });
  };
}
function setup(responder: Responder = stagingDouble(), gateMs = 2_000) {
  const events: ProbeEvent[] = [];
  const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const body = init?.body ? Buffer.from(init.body as ArrayBuffer).toString("utf8") : "";
    return responder({ method: init?.method ?? "GET", url, body });
  });
  const boundary = createManagedHubProbeBoundary(plan(), upstream as unknown as typeof fetch, (event) => events.push(event), { gateMs });
  return { boundary, events, upstream };
}
const calls = (upstream: ReturnType<typeof vi.fn>, predicate: (url: string, init: RequestInit | undefined) => boolean) => upstream.mock.calls.filter(([input, init]) => predicate(String(input), init as RequestInit | undefined)).length;
async function ownTwo(boundary: ReturnType<typeof createManagedHubProbeBoundary>) {
  boundary.enableWrites();
  await boundary.fetch(storageUrl(40, 41), upload);
  await boundary.fetch(storageUrl(42, 43), upload);
}
/** Runs the race the way the runner does: two lookups, two inserts, one winner. */
async function race(boundary: ReturnType<typeof createManagedHubProbeBoundary>) {
  await ownTwo(boundary);
  await boundary.fetch(lookupUrl);
  await boundary.fetch(lookupUrl);
  await boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}`, post(resourceRow(40)));
  await boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}`, post(resourceRow(42)));
  const first = await boundary.fetch(versionsUrl, post(versionRow(40, 41)));
  const second = await boundary.fetch(versionsUrl, post(versionRow(42, 43)));
  return { first, second };
}

describe("managed Hub probe plan", () => {
  it("accepts the probe plan and projects it onto the foundation plan rules", () => {
    const { plan: probe, managed } = validateManagedHubProbePlan(rawPlan());
    expect(probe.expectedWrites).toEqual(PROBE_EXPECTED_WRITES);
    expect(managed.runId).toBe(runId);
    expect(managed.expectedWrites.deliveries).toBe(4);
    expect(toManagedPlan(probe)).toEqual(managed);
  });
  it.each([
    ["a foundation-shaped run id", { runId: foundationRunId }, "probe_plan_schema"],
    ["a probe that names itself as its foundation", { foundationRunId: runId }, "probe_run_identity"],
    ["foundation write expectations", { expectedWrites: { objects: 1, resources: 1, versions: 1, reviews: 2, publications: 1, withdrawals: 1, deliveries: 4 } }, "probe_plan_schema"],
    ["a non-preserving retained-row policy", { retainedRows: { preserve: false, maxRowsPerTable: 100 } }, "probe_plan_schema"],
    ["the production project", { target: { ...rawPlan().target, projectRef: PRODUCTION_PROJECT, origin: `https://${PRODUCTION_PROJECT}.supabase.co` } }, "project_binding"],
  ])("rejects %s", (_label, override, code) => {
    expect(() => validateManagedHubProbePlan({ ...rawPlan(), ...override })).toThrow(code);
  });
  it("keeps the foundation audience and fixture rules", () => {
    const broad = rawPlan();
    broad.pdf.metadata.audience = ["all_partners"];
    expect(() => validateManagedHubProbePlan(broad)).toThrow("audience_control");
    const mismatched = rawPlan();
    mismatched.pdf.metadata.idempotencyKey = foundationRunId;
    expect(() => validateManagedHubProbePlan(mismatched)).toThrow("fixture_scope");
  });
});

describe("probe boundary: scope and refusals with local doubles", () => {
  it("denies every mutation before writes are enabled without contacting the provider", async () => {
    const { boundary, upstream } = setup();
    await expect(boundary.fetch(storageUrl(40, 41), upload)).rejects.toThrow("preflight_is_read_only");
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    ["POST", "/auth/v1/token"], ["POST", "/auth/v1/admin/users"], ["POST", "/auth/v1/logout"],
    ["POST", "/rest/v1/research_members"], ["POST", "/rest/v1/notification_outbox"], ["POST", "/rest/v1/rpc/arbitrary"],
    ["DELETE", `/storage/v1/object/${HUB_BUCKET}/${key(40, 41)}`], ["DELETE", `/rest/v1/${HUB_TABLES[1]}?id=eq.${uid(41)}`],
    ["POST", "/storage/v1/bucket"], ["GET", "/storage/v1/object/public/anything"], ["POST", `/storage/v1/object/list/${HUB_BUCKET}`],
  ])("refuses forbidden %s %s", async (method, route) => {
    const { boundary, upstream } = setup();
    boundary.enableWrites();
    await expect(boundary.fetch(`${origin}${route}`, { method, body: method === "GET" ? undefined : "{}" })).rejects.toThrow();
    expect(upstream).not.toHaveBeenCalled();
  });
  it("refuses the production origin even on an allowed path", async () => {
    const { boundary, upstream } = setup();
    await expect(boundary.fetch(`https://${PRODUCTION_PROJECT}.supabase.co/auth/v1/user`)).rejects.toThrow("request_origin_or_path");
    expect(upstream).not.toHaveBeenCalled();
  });
  it("owns at most two distinct uploads of the approved bytes", async () => {
    const { boundary, upstream } = setup();
    await ownTwo(boundary);
    expect(boundary.scope.uploads).toEqual([{ resourceId: uid(40), versionId: uid(41), objectKey: key(40, 41) }, { resourceId: uid(42), versionId: uid(43), objectKey: key(42, 43) }]);
    await expect(boundary.fetch(storageUrl(44, 45), upload)).rejects.toThrow("request_cap");
    expect(upstream).toHaveBeenCalledTimes(2);
    const reused = setup();
    reused.boundary.enableWrites();
    await reused.boundary.fetch(storageUrl(40, 41), upload);
    await expect(reused.boundary.fetch(storageUrl(40, 46), upload)).rejects.toThrow("storage_scope");
    const wrongBytes = setup();
    wrongBytes.boundary.enableWrites();
    await expect(wrongBytes.boundary.fetch(storageUrl(40, 41), { ...upload, body: differentBytesVariant(pdf) })).rejects.toThrow("storage_bytes");
    expect(wrongBytes.upstream).not.toHaveBeenCalled();
  });
  it("lets reads walk retained ids but never a write, and refuses retention after writes start", async () => {
    const retained = () => {
      const fixture = setup();
      fixture.boundary.retain(HUB_TABLES[0], [uid(90)]);
      fixture.boundary.retain(HUB_TABLES[1], [uid(91)]);
      return fixture;
    };
    const reads = retained();
    await reads.boundary.fetch(`${versionsUrl}?select=id&resource_id=eq.${uid(90)}&order=version_number.asc`);
    await reads.boundary.fetch(versionReadUrl(91));
    expect(reads.upstream).toHaveBeenCalledTimes(2);
    const unknown = retained();
    await expect(unknown.boundary.fetch(versionReadUrl(92))).rejects.toThrow("hub_read_scope");
    expect(unknown.upstream).not.toHaveBeenCalled();
    // Every refusal stops the run for good, exactly like the foundation boundary.
    await expect(unknown.boundary.fetch(versionReadUrl(91))).rejects.toThrow("run_stopped");
    const objectWrite = retained();
    objectWrite.boundary.enableWrites();
    await expect(objectWrite.boundary.fetch(storageUrl(90, 93), upload)).rejects.toThrow("storage_scope");
    const rowWrite = retained();
    rowWrite.boundary.enableWrites();
    await expect(rowWrite.boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}`, post(resourceRow(90)))).rejects.toThrow("resource_insert_scope");
    expect(() => rowWrite.boundary.retain(HUB_TABLES[2], [uid(94)])).toThrow("retain_after_writes");
    expect(objectWrite.upstream).not.toHaveBeenCalled();
    expect(rowWrite.upstream).not.toHaveBeenCalled();
  });
  it("refuses a lookup for any key but this run's", async () => {
    const { boundary, upstream } = setup();
    await expect(boundary.fetch(`${versionsUrl}?select=id&upload_idempotency_key=eq.${foundationRunId}`)).rejects.toThrow("hub_read_scope");
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("probe boundary: the upload race", () => {
  it("holds every version insert until both key lookups answered, then lets Postgres decide", async () => {
    const { boundary, upstream, events } = setup();
    await ownTwo(boundary);
    await boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[0]}`, post(resourceRow(40)));
    let settled = false;
    const insert = boundary.fetch(versionsUrl, post(versionRow(40, 41))).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(settled).toBe(false);
    expect(calls(upstream, (url, init) => url === versionsUrl && init?.method === "POST")).toBe(0);
    await boundary.fetch(lookupUrl);
    expect(boundary.lookupsObserved()).toBe(1);
    await boundary.fetch(lookupUrl);
    expect((await insert).status).toBe(201);
    expect(boundary.scope.winnerVersionId).toBe(uid(41));
    expect(boundary.scope.winnerResourceId).toBe(uid(40));
    expect(events.filter((e) => e.operation === "versions" && e.phase === "attempt")).toHaveLength(1);
  });
  it("fails closed when the second lookup never arrives", async () => {
    const { boundary, upstream } = setup(stagingDouble(), 50);
    await ownTwo(boundary);
    await expect(boundary.fetch(versionsUrl, post(versionRow(40, 41)))).rejects.toThrow("race_gate_timeout");
    expect(calls(upstream, (url, init) => url === versionsUrl && init?.method === "POST")).toBe(0);
    await expect(boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("run_stopped");
  });
  it("does not count a preflight lookup toward the race gate", async () => {
    const { boundary } = setup();
    await boundary.fetch(lookupUrl);
    expect(boundary.lookupsObserved()).toBe(0);
  });
  it("classifies the loser's 23505 as the one expected conflict and keeps the run healthy", async () => {
    const { boundary, events } = setup();
    const { first, second } = await race(boundary);
    expect([first.status, second.status]).toEqual([201, 409]);
    expect(boundary.counts).toMatchObject({ objects: 2, resources: 2, versions: 2, versionConflicts: 1 });
    expect(boundary.scope.winnerVersionId).toBe(uid(41));
    expect(events.find((e) => e.operation === "versions" && e.phase === "response" && e.status === 409)).toMatchObject({ expectedConflict: true, versionId: uid(43) });
    boundary.assertHealthy();
    await expect(boundary.fetch(versionsUrl, post(versionRow(40, 41)))).rejects.toThrow("request_cap");
  });
  it("stops on a 409 that is not a unique violation, on a 5xx, and on a second winning insert", async () => {
    const other = setup(stagingDouble({ versionInsert: () => new Response(JSON.stringify({ code: "23503" }), { status: 409 }) }));
    await expect(race(other.boundary)).rejects.toThrow("provider_or_uncertain_write");
    await expect(other.boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("run_stopped");
    const outage = setup(stagingDouble({ versionInsert: () => new Response("failure", { status: 503 }) }));
    await expect(race(outage.boundary)).rejects.toThrow("provider_or_uncertain_write");
    const noConstraint = setup(stagingDouble({ versionInsert: () => new Response(null, { status: 201 }) }));
    await expect(race(noConstraint.boundary)).rejects.toThrow("unexpected_second_version");
    await expect(noConstraint.boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("run_stopped");
  });
  it.each([
    ["another upload's object", { storage_key: key(42, 43) }],
    ["a foreign upload key", { upload_idempotency_key: foundationRunId }],
    ["altered bytes identity", { sha256: "b".repeat(64) }],
  ])("refuses a version insert carrying %s before the provider", async (_label, override) => {
    const { boundary, upstream } = setup();
    await ownTwo(boundary);
    await boundary.fetch(lookupUrl);
    await boundary.fetch(lookupUrl);
    await expect(boundary.fetch(versionsUrl, post({ ...versionRow(40, 41), ...override }))).rejects.toThrow("version_insert_scope");
    expect(calls(upstream, (url, init) => url === versionsUrl && init?.method === "POST")).toBe(0);
  });
});

describe("probe boundary: conditional reviews and precision", () => {
  it("allows NULL-provenance and populated-provenance conditional patches and journals only predicate kinds", async () => {
    const { boundary, events, upstream } = setup();
    await race(boundary);
    await boundary.fetch(nullCas(41), patch({ state: "in_review" }));
    await boundary.fetch(nullCas(41).replace("state=eq.draft", "state=eq.in_review"), patch({ state: "in_review", reviewed_at: AT, reviewed_by_admin: admin, review_reason: text.approvalA }));
    await boundary.fetch(microCas(41), patch({ change_summary: text.casMs }));
    await boundary.fetch(microCas(41), patch({ reviewed_at: "2026-09-08T00:00:00.123456+00:00" }));
    expect(boundary.counts.reviews).toBe(4);
    const attempts = events.filter((e) => e.operation === "reviews" && e.phase === "attempt");
    expect(attempts.map((e) => e.predicates)).toEqual([
      { reviewed_at: "is", reviewed_by_admin: "is", review_reason: "is" },
      { reviewed_at: "is", reviewed_by_admin: "is", review_reason: "is" },
      { reviewed_at: "eq", reviewed_by_admin: "eq", review_reason: "eq" },
      { reviewed_at: "eq", reviewed_by_admin: "eq", review_reason: "eq" },
    ]);
    const forwarded = String(upstream.mock.calls.at(-1)?.[0]);
    expect(forwarded).toContain("reviewed_at=eq.2026-09-08T00%3A00%3A00.123456%2B00%3A00");
    expect(JSON.stringify(events)).not.toContain("qa.invalid");
  });
  it("classifies a zero-row conditional update as an expected conflict, twice at most", async () => {
    let lost = 0;
    const { boundary, events } = setup(stagingDouble({ patch: () => new Response(++lost <= 3 ? "[]" : "[{}]", { status: 200 }) }));
    await race(boundary);
    await boundary.fetch(nullCas(41), patch({ state: "in_review" }));
    await boundary.fetch(nullCas(41), patch({ state: "in_review" }));
    expect(boundary.counts).toMatchObject({ reviews: 2, reviewConflicts: 2 });
    expect(events.filter((e) => e.operation === "reviews" && e.expectedConflict)).toHaveLength(2);
    boundary.assertHealthy();
    await expect(boundary.fetch(nullCas(41), patch({ state: "in_review" }))).rejects.toThrow("conflict_cap");
    await expect(boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("run_stopped");
  });
  it.each([
    ["an unowned version", nullCas(47), patch({ state: "in_review" }), "review_cas_scope"],
    ["an unconditional patch", `${versionsUrl}?id=eq.${uid(41)}`, patch({ state: "in_review" }), "review_cas_scope"],
    ["a foreign reason predicate", microCas(41).replace(encodeURIComponent(text.approvalA), encodeURIComponent("Some other reason")), patch({ change_summary: text.casMs }), "review_cas_scope"],
    ["an unparseable timestamp predicate", microCas(41, "not-a-timestamp"), patch({ change_summary: text.casMs }), "review_cas_scope"],
    ["a state other than in_review", nullCas(41), patch({ state: "published" }), "review_patch_scope"],
    ["an unknown change summary", microCas(41), patch({ change_summary: "free text" }), "review_patch_scope"],
    ["bytes identity in the patch", nullCas(41), patch({ state: "in_review", sha256: "b".repeat(64) }), "review_patch_scope"],
    ["provenance without its timestamp", nullCas(41), patch({ state: "in_review", reviewed_by_admin: admin, review_reason: text.approvalA }), "review_provenance"],
    ["a foreign reviewer", nullCas(41), patch({ state: "in_review", reviewed_at: AT, reviewed_by_admin: "someone@qa.invalid", review_reason: text.approvalA }), "review_provenance"],
  ])("refuses %s before the provider", async (_label, url, init, code) => {
    const { boundary, upstream } = setup();
    await race(boundary);
    const before = upstream.mock.calls.length;
    await expect(boundary.fetch(url, init)).rejects.toThrow(code);
    expect(upstream.mock.calls.length).toBe(before);
  });
  it("holds armed review patches until two reads of the winner version answered, and fails closed otherwise", async () => {
    const { boundary, upstream } = setup(stagingDouble(), 2_000);
    expect(() => boundary.armReviewGate()).toThrow("review_gate_scope");
    await race(boundary);
    boundary.armReviewGate();
    let settled = false;
    const approval = boundary.fetch(nullCas(41), patch({ state: "in_review" })).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(settled).toBe(false);
    await boundary.fetch(versionReadUrl(43)); // the loser's version is not the winner: does not count
    await boundary.fetch(versionReadUrl(41));
    expect(boundary.reviewReadsObserved()).toBe(1);
    await boundary.fetch(versionReadUrl(41));
    expect((await approval).status).toBe(200);
    boundary.disarmReviewGate();
    await boundary.fetch(nullCas(41), patch({ state: "in_review" }));
    expect(calls(upstream, (url, init) => init?.method === "PATCH")).toBe(2);
    const stalled = setup(stagingDouble(), 50);
    await race(stalled.boundary);
    stalled.boundary.armReviewGate();
    await expect(stalled.boundary.fetch(nullCas(41), patch({ state: "in_review" }))).rejects.toThrow("review_gate_timeout");
  });
});

describe("probe boundary: transitions and deliveries", () => {
  const publish = (rid: number, vid: number) => post({ p_resource_id: uid(rid), p_version_id: uid(vid), p_actor: admin, p_at: AT });
  const withdraw = (reason: string) => post({ p_resource_id: uid(40), p_version_id: uid(41), p_actor: admin, p_at: AT, p_reason: reason });
  const delivery = { id: uid(60), resource_id: uid(40), version_id: uid(41), member_id: uid(12), requested_at: AT, outcome: "delivered", reason: null };
  it("permits publication, withdrawal and deliveries for the race winner only", async () => {
    const { boundary, upstream } = setup();
    await race(boundary);
    const before = upstream.mock.calls.length;
    await boundary.fetch(`${origin}/rest/v1/rpc/research_resource_hub_publish`, publish(40, 41));
    await boundary.fetch(`${origin}/rest/v1/rpc/research_resource_hub_withdraw`, withdraw(text.withdraw));
    await boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[2]}`, post(delivery));
    await boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[2]}`, post({ ...delivery, id: uid(61), version_id: null, outcome: "denied", reason: "not_published" }));
    expect(upstream.mock.calls.length - before).toBe(4);
    expect(boundary.counts).toMatchObject({ publications: 1, withdrawals: 1, deliveries: 2 });
    await expect(boundary.fetch(`${origin}/rest/v1/${HUB_TABLES[2]}`, post({ ...delivery, id: uid(62) }))).rejects.toThrow("request_cap");
  });
  it.each([
    ["publication before any winner", false, "rpc/research_resource_hub_publish", publish(40, 41), "transition_scope"],
    ["a delivery before any winner", false, HUB_TABLES[2], post(delivery), "delivery_scope"],
    ["publication of the loser", true, "rpc/research_resource_hub_publish", publish(42, 43), "transition_scope"],
    ["withdrawal with a foreign reason", true, "rpc/research_resource_hub_withdraw", withdraw("wrong"), "withdraw_reason"],
    ["a delivery against the loser", true, HUB_TABLES[2], post({ ...delivery, resource_id: uid(42) }), "delivery_scope"],
    ["a delivery to a non-partner member", true, HUB_TABLES[2], post({ ...delivery, member_id: uid(15) }), "delivery_scope"],
  ])("refuses %s before the provider", async (_label, raced, table, init, code) => {
    const { boundary, upstream } = setup();
    if (raced) await race(boundary);
    else await ownTwo(boundary);
    const before = upstream.mock.calls.length;
    await expect(boundary.fetch(`${origin}/rest/v1/${table}`, init)).rejects.toThrow(code);
    expect(upstream.mock.calls.length).toBe(before);
  });
  it("reads only owned objects and refuses redirects and oversized responses", async () => {
    const { boundary } = setup();
    await ownTwo(boundary);
    expect((await boundary.fetch(storageUrl(42, 43))).status).toBe(200);
    await expect(boundary.fetch(storageUrl(44, 45))).rejects.toThrow("storage_scope");
    const redirecting = setup(() => new Response(null, { status: 302, headers: { location: "https://example.invalid" } }));
    await expect(redirecting.boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("redirect");
    const oversized = setup(() => new Response(new Uint8Array(2 * 1024 * 1024 + 1)));
    await expect(oversized.boundary.fetch(`${origin}/auth/v1/user`)).rejects.toThrow("response_cap");
  });
  it("requires a durable write-ahead receipt before any request", async () => {
    const upstream = vi.fn();
    const boundary = createManagedHubProbeBoundary(plan(), upstream as unknown as typeof fetch, () => {
      throw new Error("disk unavailable");
    });
    boundary.enableWrites();
    await expect(boundary.fetch(storageUrl(40, 41), upload)).rejects.toThrow("transport_or_receipt_failure");
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("probe runner helpers and composition boundary", () => {
  it("derives a microsecond value from provider text and refuses other shapes", () => {
    expect(microsecondVariant("2026-09-08T00:00:00.123+00:00")).toBe("2026-09-08T00:00:00.123456+00:00");
    expect(microsecondVariant("2026-09-08T00:00:00+00:00")).toBe("2026-09-08T00:00:00.123456+00:00");
    expect(() => microsecondVariant("2026-09-08T00:00:00.123Z")).toThrow("provider_timestamp_shape");
    expect(PROVIDER_TIMESTAMP.test("2026-09-08T00:00:00.123456+00:00")).toBe(true);
    expect(PROVIDER_TIMESTAMP.test("2026-09-08T00:00:00.123456Z")).toBe(false);
    expect(new Date("2026-09-08T00:00:00.123456+00:00").toISOString()).toBe("2026-09-08T00:00:00.123Z");
  });
  it("derives a different-bytes variant that still starts as a PDF", () => {
    const variant = differentBytesVariant(pdf);
    expect(sha256(variant)).not.toBe(sha256(pdf));
    expect(Buffer.from(variant.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });
  it("binds the parsed probe plan and approval hash to exactly the same bytes", () => {
    const bytes = Buffer.from(JSON.stringify(rawPlan()));
    const parsed = parseManagedHubProbePlanBytes(bytes);
    expect(parsed.plan).toEqual(plan());
    expect(parsed.planSha256).toBe(sha256(bytes));
    expect(() => parseManagedHubProbePlanBytes(new Uint8Array(64 * 1024 + 1))).toThrow("private_json_size");
    expect(() => parseManagedHubProbePlanBytes(Buffer.from("malformed"))).toThrow("private_json_parse");
  });
  it("keeps default preflight credential-free and composes the real production adapters in execution", () => {
    const source = readFileSync(new URL("../../../scripts/revenue-launch/managed-resource-hub-probes.ts", import.meta.url), "utf8");
    expect(source).toContain('status: "LOCAL_PREFLIGHT_PASS"');
    expect(source).toContain('import("../../server/research/resource-hub/production")');
    expect(source).toContain('import("../../server/research/resource-hub/supabase-store")');
    expect(source).toContain('NODE_ENV: "production"');
    expect(source).toContain('RESEARCH_RESOURCE_HUB_ENABLED: "true"');
    expect(source).not.toContain('import("../../server/index');
    expect(source).not.toContain("createInMemory");
    expect(source).not.toContain("signInWithPassword");
    expect(source).not.toContain(".remove(");
    expect(source).not.toContain(".delete(");
    expect(source).toContain("armReviewGate()");
    expect(source).toContain('"real sign-in/logout/account switching"');
    expect(source).toContain("preservedPartialWrites: true");
  });
});
