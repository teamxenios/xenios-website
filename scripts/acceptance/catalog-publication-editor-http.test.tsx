import { afterAll, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import express from "express";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { ProductPublicationEditor } from "../../client/src/research/pages/adminx/ProductPublicationEditor";
import { createCatalogPublicationPort } from "../../client/src/research/adapters/catalogPublication";
import { createProductControlPublicationAuthorityAdmin, createSupabasePublicationAuthorityStore } from "../../server/research/products-diagnostics/publication-authority.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";
const M = "33333333-3333-4333-8333-333333333333";
const R = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const identity = { offeringId: "mo_ab", offeringVariantId: "mov_cd", productId: P, variantId: V };
const staff = "qa-staff@fixture.invalid";
const token = "qa-controlled-staff-token";
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const product = { id: P, variants: [{ id: V, productId: P, label: "Selected controlled variant" }, { id: OTHER, productId: P, label: "Unmapped controlled variant" }], media: [{ id: M, productId: P, state: "approved", filename: "controlled-approved.png" }] };
const traces: unknown[] = [];
const nativeFetch = globalThis.fetch;
const cleanupDom = (globalThis as any).__qaCleanupDom as () => unknown;

// QA_CLEANUP_POLICY_BEGIN
type OwnedStep = { name: string; acquired: boolean; run: () => unknown | Promise<unknown> };
async function withinBudget<T>(run: () => T | Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(run), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Unconfirmed " + name + " after " + ms + "ms")), ms);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function finishOwnedSteps(steps: OwnedStep[], budgetMs = 2000) {
  const rows: { name: string; state: "NOT_ACQUIRED" | "CONFIRMED" | "UNCONFIRMED" }[] = [];
  const errors: { name: string; error: unknown }[] = [];
  for (const step of steps) {
    if (!step.acquired) { rows.push({ name: step.name, state: "NOT_ACQUIRED" }); continue; }
    try { await withinBudget(step.run, budgetMs, step.name); rows.push({ name: step.name, state: "CONFIRMED" }); }
    catch (error) { errors.push({ name: step.name, error }); rows.push({ name: step.name, state: "UNCONFIRMED" }); }
  }
  return { rows, errors };
}
function combinedFailure(caught: boolean, primary: unknown, errors: { name: string; error: unknown }[], name: string) {
  const all = [...(caught ? [primary] : []), ...errors.map(entry => entry.error)];
  return all.length ? new AggregateError(all, name + ": primary and cleanup failures retained") : null;
}
const failureText = (value: unknown) => value instanceof Error ? value.name + ": " + value.message : String(value);
// QA_CLEANUP_POLICY_END

async function mounted(name: string, run: (h: any) => Promise<void>) {
  const requests: any[] = [], rpcCalls: any[] = [], bindingChecks: any[] = [], eligibilityChecks: any[] = [];
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const snapshot = { identity, productVersion: 2, variantVersion: 3,
    sourceSha256: hash("controlled-saved-source"), contentSha256: hash("controlled-saved-content"),
    content: { summary: "Controlled summary <b>rendered as text</b>", overview: "Saved controlled overview" },
    media: { id: M, version: 1, altText: "Controlled approved illustration", contentType: "image/png", sizeBytes: bytes.length, storageIdentitySha256: hash("private-fixture-storage-identity") } };
  const approval = { identity, sourceSha256: snapshot.sourceSha256, contentSha256: snapshot.contentSha256,
    mediaId: M, mediaVersion: 1, contentApprovalSha256: hash("controlled-content-approval"), rightsApprovalSha256: hash("controlled-rights-approval"), mediaSha256: hash(bytes),
    usage: "public_catalog_display", state: "approved", expiresAt: null, width: 1, height: 1, representation: "catalog_reference", packagingDesign: false };
  const state = { generation: 7, currentRevisionId: null as string | null, rights: true, eligible: true, ambiguousSealOnce: true, sealWrites: 0, transitionWrites: 0 };
  const revisions = new Map<string, any>(), operations = new Map<string, { intent: any; receipt: any }>();
  const history: any[] = [];
  const failure = (message: string) => ({ data: null, error: { code: "P0001", message } });
  const rpc = async (method: string, args: any) => {
    rpcCalls.push({ method, args: copy(args) });
    if ("p_actor" in args) expect(args.p_actor).toBe(staff);
    if (method === "research_catalog_publication_admin_state") return { error: null, data: copy({ identity, generation: state.generation, currentRevisionId: state.currentRevisionId,
      revisions: [...revisions.keys()].map(revisionId => ({ revisionId, previouslyPublished: history.some(h => h.operation === "publish" && h.revisionId === revisionId) })), operations: history, historyTruncated: true }) };
    if (method === "research_catalog_publication_replay") {
      const old = operations.get(args.p_actor + ":" + args.p_key);
      if (!old) return { data: null, error: null };
      if (JSON.stringify(old.intent) !== JSON.stringify(args.p_intent)) return failure("publication_idempotency_conflict");
      return { data: copy(old.receipt), error: null };
    }
    if (method === "research_catalog_publication_source") {
      expect(args).toEqual({ p_identity: identity, p_media_id: M });
      return { data: copy(snapshot), error: null };
    }
    if (method === "research_catalog_approval_for_source") return { data: state.rights ? copy(approval) : null, error: null };
    if (method === "research_catalog_publication_revision") return { data: copy(revisions.get(args.p_revision_id) ?? null), error: null };
    if (method === "research_catalog_publication_current") return { data: copy({ generation: state.generation, revision: revisions.get(state.currentRevisionId ?? "") ?? null }), error: null };
    if (method === "research_catalog_approval_state") return { data: { identity, approvalVersion: 1, ownerCapability: null, approvals: [], historyTruncated: false }, error: null };
    if (method === "research_catalog_publication_seal_verified" || method === "research_catalog_publication_transition_verified") {
      const intent = args.p_intent;
      expect(intent.identity).toEqual(identity);
      if (intent.expectedGeneration !== state.generation) return failure("publication_generation_conflict");
      const sealing = method === "research_catalog_publication_seal_verified";
      if (sealing) {
        expect(intent.operation).toBe("seal"); expect(args.p_evidence).toEqual(approval);
        revisions.set(R, { id: R, identity, snapshot: copy(snapshot), evidence: copy(approval) }); state.sealWrites++;
      } else { state.generation++; state.currentRevisionId = intent.operation === "withdraw" ? null : intent.revisionId; state.transitionWrites++; }
      const receipt = { identity, operation: intent.operation, revisionId: sealing ? R : state.currentRevisionId, generation: state.generation, replayed: false };
      operations.set(args.p_actor + ":" + args.p_key, { intent: copy(intent), receipt: copy(receipt) });
      history.push({ operation: intent.operation, revisionId: receipt.revisionId, generation: receipt.generation, at: new Date().toISOString() });
      // Controlled database uncertainty: commit exactly once but fail to supply
      // a complete RPC acknowledgment. The real route/transport must stay unknown.
      if (sealing && state.ambiguousSealOnce) { state.ambiguousSealOnce = false; return { data: undefined, error: null }; }
      return { data: copy(receipt), error: null };
    }
    throw Error("Unexpected controlled RPC: " + method);
  };
  const app = express(); app.use(express.json({ limit: "32kb" }));
  const admin = createProductControlPublicationAuthorityAdmin({
    requireAdmin(req: any, res: any, next: any) {
      if (req.get("Authorization") !== "Bearer " + token) return res.status(403).json({ error: "controlled_actor_refused" });
      req.adminEmail = staff; next();
    },
    identityFor: async (p: string, v: string) => p === P && v === V ? identity : null,
    ports: { store: createSupabasePublicationAuthorityStore({ rpc }),
      assertBinding: async (id: any) => { bindingChecks.push(copy(id)); return JSON.stringify(id) === JSON.stringify(identity); },
      isEligible: async (id: any) => { eligibilityChecks.push(copy(id)); return state.eligible; },
      readMediaBytes: async () => bytes, readApprovalMediaBytes: async () => bytes,
    },
  });
  admin.register(app);
  const owned: { server: ReturnType<typeof createServer> | null; root: ReturnType<typeof createRoot> | null; host: HTMLDivElement | null; fetch: boolean } = { server: null, root: null, host: null, fetch: false };
  const pending = new Set<Promise<Response>>(), requestControllers = new Set<AbortController>();
  let primary: unknown, caught = false, complete = false, cleanupConfirmed = false, closed = false;
  let finalization: Awaited<ReturnType<typeof finishOwnedSteps>> = { rows: [], errors: [] };
  try {
  const server = createServer(app); owned.server = server; server.listen(0, "127.0.0.1");
  await once(server, "listening", { signal: AbortSignal.timeout(3000) });
  const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const host = document.createElement("div"); owned.host = host; document.body.append(host);
  const root = createRoot(host); owned.root = root;
  const active = () => { if (closed) throw Error("Owned fixture is closed"); };
  owned.fetch = true;
  globalThis.fetch = ((input: any, init: any = {}) => {
    const operation = (async () => {
    active();
    if (typeof input !== "string") throw Error("Only selected string transport paths admitted");
    const url = new URL(input, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/api/admin/research/products/") || !["GET", "POST"].includes(init.method ?? "GET")) throw Error("Unexpected network scope");
    const headers = new Headers(init.headers);
    const record: any = { method: init.method ?? "GET", path: url.pathname, search: url.search, key: headers.get("Idempotency-Key"), body: init.body === undefined ? null : JSON.parse(init.body), cache: init.cache, credentials: init.credentials, authorizationPresent: headers.has("Authorization") };
    requests.push(record);
    const controller = new AbortController(); requestControllers.add(controller);
    const external = init.signal as AbortSignal | undefined;
    const abortExternal = () => controller.abort(external?.reason);
    const deadline = setTimeout(() => controller.abort(new Error("Owned HTTP deadline after 5000ms")), 5000);
    try {
      if (external?.aborted) abortExternal(); else external?.addEventListener("abort", abortExternal, { once: true });
      const response = await nativeFetch(url, { ...init, signal: controller.signal });
      record.status = response.status; record.cacheControl = response.headers.get("Cache-Control"); record.response = await withinBudget(() => response.clone().json(), 5000, "owned HTTP body");
      return response;
    } catch (error) { controller.abort(error); record.networkError = failureText(error).slice(0, 1000); throw error; }
    finally { clearTimeout(deadline); external?.removeEventListener("abort", abortExternal); requestControllers.delete(controller); }
    })();
    pending.add(operation); void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  }) as typeof fetch;
  const wait = async (ok: () => boolean, label: string) => {
    active(); const deadline = Date.now() + 3000;
    while (!ok() && Date.now() < deadline) { active(); await act(async () => { await new Promise(r => setTimeout(r, 10)); }); }
    if (!ok()) throw Error(label + ": " + host.textContent + "\n" + JSON.stringify(requests.slice(-4)));
  };
  const button = (label: string) => { active(); const b = [...host.querySelectorAll("button")].find(b => b.textContent === label); if (!b) throw Error("Missing button " + label); return b; };
  const click = async (label: string) => { expect(button(label).disabled).toBe(false); await act(async () => button(label).click()); };
  const field = (label: string) => { active(); const node = [...host.querySelectorAll("label")].find(l => l.textContent === label); if (!node) throw Error("Missing label " + label); return document.getElementById(node.htmlFor) as HTMLSelectElement | HTMLTextAreaElement; };
  const select = async (label: string, value: string) => { await act(async () => { const node = field(label); node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); }); };
  const render = async (variantId = V, bearer = token) => { active(); await act(async () => root.render(createElement(ProductPublicationEditor, { token: bearer, product: product as any, variantId, makePort: createCatalogPublicationPort }))); };
  await withinBudget(() => run({ host, state, requests, rpcCalls, operations, history, revisions, approval, bindingChecks, eligibilityChecks, wait, button, click, field, select, render }), 12000, "test body"); complete = true;
  } catch (error) { caught = true; primary = error; }
  finally {
    closed = true;
    finalization = await finishOwnedSteps([
      { name: "root_unmount", acquired: !!owned.root, run: async () => { await act(async () => owned.root!.unmount()); if (owned.host?.hasChildNodes()) throw Error("Mounted children remain"); } },
      { name: "pending_request_abort", acquired: requestControllers.size > 0, run: () => { for (const controller of requestControllers) controller.abort(new Error("Owned fixture cleanup")); } },
      { name: "pending_request_drain", acquired: pending.size > 0, run: async () => { await Promise.allSettled([...pending]); if (pending.size || requestControllers.size) throw Error("Owned requests remain"); } },
      { name: "host_remove", acquired: !!owned.host, run: () => { owned.host!.remove(); if (owned.host!.isConnected) throw Error("Owned host remains attached"); } },
      { name: "server_connections_close", acquired: !!owned.server, run: () => owned.server!.closeAllConnections() },
      { name: "server_close", acquired: !!owned.server, run: async () => { await new Promise<void>((resolve, reject) => owned.server!.close(error => error ? reject(error) : resolve())); if (owned.server!.listening || owned.server!.address() !== null) throw Error("Owned loopback close unconfirmed"); } },
      { name: "fetch_restore", acquired: owned.fetch, run: () => { globalThis.fetch = nativeFetch; if (globalThis.fetch !== nativeFetch) throw Error("Fetch restore unconfirmed"); } },
    ]);
    cleanupConfirmed = finalization.errors.length === 0;
    traces.push({ name, complete, primaryCaught: caught, error: caught ? failureText(primary).slice(0, 1000) : null,
      cleanupSteps: finalization.rows, cleanupErrors: finalization.errors.map(entry => ({ name: entry.name, error: failureText(entry.error).slice(0, 1000) })),
      initialGeneration: 7, state: copy(state), requests, rpcCalls, bindingChecks, eligibilityChecks,
      ownedLoopbackClosed: owned.server ? finalization.rows.some(row => row.name === "server_close" && row.state === "CONFIRMED") : null,
      sourceServiceFactory: "createProductControlPublicationAuthorityAdmin + createSupabasePublicationAuthorityStore" });
  }
  const failure = combinedFailure(caught, primary, finalization.errors, name);
  if (failure) throw failure;
  expect(cleanupConfirmed).toBe(true);
}

it("mounts the real editor and transports factual head, exact-key seal recovery, publish and withdrawal after rights lapse", async () => mounted("controlled complete publication journey", async h => {
  await h.render(); await h.wait(() => h.host.textContent.includes("Current generation: 7"), "Factual nonzero head");
  expect(h.requests[0]).toMatchObject({ method: "GET", path: `/api/admin/research/products/${P}/variants/${V}/catalog-publication`, body: null, search: "", status: 200 });
  await h.select("Approved media to review for this exact variant", M); await h.click("Preview proposed revision");
  await h.wait(() => h.host.textContent.includes("Proposed revision — not published"), "Actual preview response");
  expect(h.host.textContent).toContain("Controlled summary <b>rendered as text</b>"); expect(h.host.querySelector("b")).toBeNull();
  await h.click("Seal approved revision"); await h.wait(() => h.host.textContent.includes("Unconfirmed seal"), "Incomplete committed RPC stays unknown");
  expect(h.state.sealWrites).toBe(1); expect(h.operations.size).toBe(1);
  await h.click("Read current publication"); await h.wait(() => h.host.textContent.includes("previous command is still unconfirmed"), "History does not resolve pending command");
  expect(h.host.textContent).toContain("Unconfirmed seal");
  await h.click("Retry exact command"); await h.wait(() => !h.host.textContent.includes("Unconfirmed seal") && h.host.textContent.includes("Current generation: 7"), "Same-key actual receipt recovery");
  const seals = h.requests.filter((r: any) => r.path.endsWith("/seal"));
  expect(seals).toHaveLength(2); expect(seals[0].status).toBe(503); expect(seals[1].status).toBe(200);
  expect(seals[0].key).toBeTruthy(); expect(seals[1].key).toBe(seals[0].key); expect(seals[1].body).toEqual(seals[0].body);
  expect(seals[0].body.expectedGeneration).toBe(7); expect(seals[1].response.replayed).toBe(true); expect(h.state.sealWrites).toBe(1);
  await h.select("Sealed revision", R); await h.click("Publish selected revision");
  await h.wait(() => h.host.textContent.includes("Current generation: 8") && h.host.textContent.includes("Current revision: " + R), "Confirmed published head");
  const publish = h.requests.find((r: any) => r.path.endsWith("/publish")); expect(publish.body).toEqual({ expectedGeneration: 7, revisionId: R }); expect(publish.status).toBe(200);
  h.state.rights = false; h.state.eligible = false;
  const before = h.rpcCalls.length, checksBefore = h.eligibilityChecks.length;
  await act(async () => { const textarea = h.field("Reason for withdrawal or rollback") as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Controlled withdrawal after rights lapse"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
  await h.click("Withdraw current revision");
  await h.wait(() => h.host.textContent.includes("Current generation: 9") && h.host.textContent.includes("Current revision: None published"), "Withdrawal does not need renewed rights");
  const withdraw = h.requests.find((r: any) => r.path.endsWith("/withdraw")); expect(withdraw.status).toBe(200); expect(withdraw.body.expectedGeneration).toBe(8);
  expect(h.eligibilityChecks.length).toBe(checksBefore); expect(h.rpcCalls.slice(before).some((r: any) => r.method === "research_catalog_approval_for_source")).toBe(false);
  expect(h.state.transitionWrites).toBe(2); expect(h.operations.size).toBe(3);
  expect(h.requests.every((r: any) => r.credentials === "same-origin" && r.cache === "no-store" && r.authorizationPresent && r.cacheControl.includes("no-store"))).toBe(true);
}));

it("keeps a deliberately selected unmapped variant closed without substituting the mapped sibling", async () => mounted("unmapped exact variant", async h => {
  await h.render(OTHER); await h.wait(() => h.host.textContent.includes("current publication could not be confirmed"), "Unmapped selection refused");
  expect(h.requests).toHaveLength(1); expect(h.requests[0].path).toContain(`/variants/${OTHER}/`);
  expect(h.requests[0].status).not.toBe(200); expect(h.rpcCalls).toHaveLength(0); expect(h.button("Preview proposed revision").disabled).toBe(true);
}));

it("refuses an unauthorized mounted actor before publication database access or commands", async () => mounted("unauthorized operator", async h => {
  await h.render(V, "controlled-denied-actor"); await h.wait(() => h.host.textContent.includes("current publication could not be confirmed"), "Operator refusal");
  expect(h.requests).toHaveLength(1); expect(h.requests[0].status).toBe(403); expect(h.rpcCalls).toHaveLength(0);
  expect(h.button("Preview proposed revision").disabled).toBe(true); expect(h.button("Publish selected revision").disabled).toBe(true);
}));

afterAll(async () => {
  let domEvidence: unknown = null;
  const finalization = await finishOwnedSteps([
    { name: "dom_close_and_global_restore", acquired: true, run: () => { if (typeof cleanupDom !== "function") throw Error("Missing owned DOM cleanup"); domEvidence = cleanupDom(); } },
    { name: "no_clobber_trace", acquired: true, run: () => writeFileSync(new URL("./catalog-publication-editor-http.trace.json", import.meta.url), JSON.stringify({ kind: "QA_AUTHORED_MOUNTED_EDITOR_REAL_HTTP_AUTHORITY_TRACE", cases: traces, domCleanup: domEvidence,
      scope: "Actual ReactDOM editor/default GET+POST transport/real Express authority wrappers. Controlled actor, SDK-shaped RPC/storage/rights/eligibility; no native SQL/Auth/managed/public publication or owner-grant proof." }, null, 2) + "\n", { encoding: "utf8", flag: "wx" }) },
  ]);
  const failure = combinedFailure(false, undefined, finalization.errors, "suite finalizers");
  if (failure) throw failure;
});
