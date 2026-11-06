import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { fixtureContact, memberSession } from "./fixture.mjs";
import {
  createMountedPolicyFixture, isPolicyFixtureRequest, policyMembers, policyPaths, policyProductNames,
} from "./policy-v2-fixture.mjs";

const profile = "policy-v2-mixed";
const candidateHead = "1475d418283e646554872db3992abc8a392af423";
const candidateTree = "5917bf218fabc308857a20ae9e568841f1e50970";
const origin = "http://127.0.0.1:5199";
const entry = "/earlyaccess";
const blank = "/__xenios_qa_policy_origin";
const attemptKey = "xenios.assisted-order.intent-attempt.v1";
const receiptKey = "xenios.assisted-order.intent-receipt.v1";
const historicalBodySha256 = "98918e35e5a0f749790fb31cd406399818ced5d197cbed02679744ccf94ac325";
const policyBodySha256 = "491d2559f05f6201ee0279bbd0fb711ebc7eeb1fd0a826c8d9141373c146fa06";
const protocolChecks = [
  "EXACT_V2_DOCUMENT", "HISTORICAL_V1_PRESERVED", "FRESH_OWNER_UNACCEPTED",
  "STALE_V1_REFUSED", "STALE_V1_DID_NOT_UNLOCK", "EXACT_V2_ACCEPTED",
  "V2_STANDING_CONFIRMED", "V2_REPLAY_IDEMPOTENT",
];
const required = [
  "EXACT_MOUNTED_ENTRY_AND_PRIOR_V1_DRAFT", "V1_SAVED_REPLY_LOST",
  "V2_POLICY_PROTOCOL", "V1_FROZEN_EXPLICIT_RETRY",
  "FIRST_REFUSAL_CLEARS_OWNED_MARKER_WITHOUT_WRITE", "SAME_MOUNT_RETAINS_DRAFT",
  "EXPLICIT_V2_ACCEPTANCE_PRESERVES_V1", "FRESH_ACKNOWLEDGMENTS_NO_AUTOSEND",
  "EXPLICIT_NEW_V2_REQUEST_RETAINS_DRAFT", "CLOSED_INTAKE_FOREIGN_RECOVERY_REFUSED",
  "CLOSED_INTAKE_OWNER_RECOVERS_ORIGINAL", "CLOSED_INTAKE_OWNER_REOPENS_DISPLAY_ONLY",
  "FOREIGN_MEMBER_CANNOT_REOPEN_REFERENCE", "EXACT_SYNTHETIC_WRITE_BUDGET",
];

export function verifyPolicyResult(result, expected, allowance) {
  assert.deepEqual(Object.keys(result).sort(), [
    "allowance", "candidateSha", "candidateTree", "checks", "harnessRevision", "limits", "network",
    "policyTransition", "profile", "runAttempt", "runId", "scope", "status", "writeCounts",
  ]);
  assert.equal(result.scope, "NON-PRODUCTION SYNTHETIC BROWSER EVIDENCE");
  assert.equal(result.status, "passed");
  assert.equal(result.profile, profile);
  assert.equal(expected.candidateSha, candidateHead);
  assert.equal(expected.candidateTree, candidateTree);
  for (const field of ["candidateSha", "candidateTree", "harnessRevision", "runId", "runAttempt"]) {
    assert.equal(result[field], expected[field]);
  }
  assert.match(result.harnessRevision, /^[a-f0-9]{40}$/);
  assert.match(result.runId, /^[1-9][0-9]*$/);
  assert.equal(result.runAttempt, 1);
  assert.deepEqual(result.allowance, allowance);
  assert.equal(allowance.currentRunId, result.runId);
  assert.equal(allowance.attempt, 1);
  assert.equal(allowance.maximumAttempts, 1);
  assert.equal(allowance.remainingAfterThisRun, 0);
  assert.deepEqual(allowance.distinctRunIds, [result.runId]);
  assert.deepEqual(Object.keys(result.network).sort(),
    ["blockedExternal", "fixtureForwardFailures", "loopbackOnly", "serviceWorkers", "unexpectedWrites"]);
  assert(Number.isSafeInteger(result.network.blockedExternal) && result.network.blockedExternal >= 0);
  assert.equal(result.network.loopbackOnly, true);
  assert.equal(result.network?.serviceWorkers, "blocked");
  assert.equal(result.network?.unexpectedWrites, 0);
  assert.equal(result.network?.fixtureForwardFailures, 0);
  assert.deepEqual(result.checks, required);
  assert.deepEqual(result.writeCounts, { submissions: 4, recoveries: 2, acceptanceCalls: 4, savedRequests: 2 });
  assert.deepEqual(result.policyTransition, {
    schemaVersion: 1, scope: "synthetic-loopback-policy-protocol", productionVerified: false, requestCount: 8,
    expectedAgreement: { kind: "early_access_terms", version: "v2" },
    policyBodySha256, historicalPolicyBodySha256: historicalBodySha256, checks: protocolChecks, databaseRowsInspected: false,
  });
}

const bootstrap = new Map([
  ["/api/research/early-access/session", { authenticated: true, expiresAt: null }],
  ["/api/research/early-access/assisted-orders/config", { enabled: false }],
]);
const memberPath = "/api/research/member/me";
function fakeMember(owner) {
  const member = policyMembers[owner];
  if (!member) return null;
  const user = { ...memberSession.user, id: member.authUserId };
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = [part({ alg: "HS256", typ: "JWT" }),
    part({ sub: user.id, exp: memberSession.expires_at, amr: [{ method: "password" }] }),
    "synthetic-signature"].join(".");
  return { session: { ...memberSession, user, access_token: token }, bearer: "Bearer " + token, cartScope: member.cartScope };
}

async function createContext(browser, fixture, network, owner, mobile = false) {
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 };
  const context = await browser.newContext({
    viewport, screen: viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    locale: "en-US", serviceWorkers: "block", acceptDownloads: false,
  });
  const member = fakeMember(owner);
  if (member) await context.addInitScript(({ base, session }) => {
    if (location.origin === base) localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
  }, { base: origin, session: member.session });
  const calls = [];
  let lostReplies = owner === "prior" ? 2 : 0;
  let verified = 0;
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      network.blockedExternal += 1;
      if (method !== "GET") network.unexpectedWrites += 1;
      return route.abort("blockedbyclient");
    }
    if (isPolicyFixtureRequest(method, url)) {
      const auth = request.headers().authorization ?? null;
      const isIntent = url.pathname.startsWith(policyPaths.intent);
      const isPost = method === "POST";
      const body = isPost ? request.postDataBuffer() : null;
      const publicConfigProbe = method === "GET" && url.pathname === policyPaths.config && auth === null;
      if ((isIntent && !publicConfigProbe && auth !== (member?.bearer ?? null)) ||
          (isPost && (!body || body.length > 32768 ||
            !request.headers()["content-type"]?.startsWith("application/json")))) {
        network.fixtureForwardFailures += 1;
        return route.abort("blockedbyclient");
      }
      let response, payload, input;
      try {
        if (isPost) input = JSON.parse(body.toString("utf8"));
        response = await fetch(fixture.origin + url.pathname + url.search, {
          method, redirect: "error", signal: AbortSignal.timeout(7500),
          headers: { accept: "application/json", "x-xenios-qa-owner": owner,
            ...(isPost ? { "content-type": "application/json" } : {}) },
          ...(isPost ? { body } : {}),
        });
        const bytes = await response.text();
        assert(response.headers.get("content-type")?.includes("application/json") && bytes.length <= 262144);
        payload = JSON.parse(bytes);
      } catch {
        network.fixtureForwardFailures += 1;
        return route.abort("failed");
      }
      if (isPost) calls.push({ path: url.pathname, status: response.status, input, payload });
      // Simulate reply loss only after the real service has confirmed a save.
      if (url.pathname === policyPaths.intent && method === "POST" && lostReplies && response.ok &&
          payload.kind === "unapproved_selection_request") {
        lostReplies -= 1;
        return route.abort("failed");
      }
      return route.fulfill({ status: response.status, json: payload, headers: { "cache-control": "no-store" } });
    }
    if (method !== "GET") {
      network.unexpectedWrites += 1;
      return route.abort("blockedbyclient");
    }
    if (url.pathname === blank && !url.search) {
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Synthetic QA</title>" });
    }
    if (url.pathname === "/api/config" && !url.search) return route.fulfill({ json: {
      metaPixelId: null, turnstileSiteKey: null, calendlyUrl: "",
      supabaseUrl: member ? origin : null, supabaseAnonKey: member ? "synthetic-loopback-only" : null,
    } });
    if (url.pathname === "/api/research/me" && !url.search) {
      return route.fulfill({ json: { configured: true, authed: !member } });
    }
    if (url.pathname === memberPath && !url.search && member && request.headers().authorization === member.bearer) {
      verified += 1;
      return route.fulfill({ json: { ok: true, member: {
        firstName: "Synthetic", status: "active", applicationStatus: "approved", cartScope: member.cartScope,
      } } });
    }
    if (bootstrap.has(url.pathname) && !url.search) {
      return route.fulfill({ json: bootstrap.get(url.pathname) });
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/preview-auth") ||
        url.pathname.startsWith("/auth/") || ["fetch", "xhr"].includes(request.resourceType())) {
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  return { context, page, calls, verified: () => verified };
}

const button = (page, name) => page.getByRole("button", { name, exact: true });
const mixed = (page) => page.getByTestId("request-door-mixed");
const savedHeading = (page) => page.getByRole("heading", { name: "Request saved for review", exact: true });
const fields = (page) => mixed(page).locator("fieldset.xenios-order-acknowledgments input[type=checkbox]");
const submit = (page) => button(page, "Submit for review");
const storage = (page, key) => page.evaluate((name) => {
  const raw = sessionStorage.getItem(name);
  return raw === null ? null : JSON.parse(raw);
}, key);
const setStorage = (page, key, value) => page.evaluate(({ name, data }) => {
  if (data === null) sessionStorage.removeItem(name);
  else sessionStorage.setItem(name, JSON.stringify(data));
}, { name: key, data: value });
const traffic = (slot, path) => slot.calls.filter((row) => row.path === path);
const latest = (slot, path) => traffic(slot, path).at(-1);
const policyVersion = (page, version) => page.getByTestId("early-access-agreement-provenance")
  .filter({ hasText: new RegExp("^Policy version: " + version + "$") }).waitFor();
async function settledPriorReply(slot, count) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (traffic(slot, policyPaths.intent).length === count) {
      await slot.page.waitForFunction(() => [...document.querySelectorAll("button")]
        .some((node) => node.textContent === "Retry same request" && !node.disabled));
      return;
    }
    await delay(100);
  }
  throw new Error("The synthetic saved reply did not reach the transport");
}
const legalVersion = (input) => input.agreements.find((pair) => pair.kind === "early_access_terms")?.version;

async function openReview(slot, mobile) {
  const { page } = slot;
  await page.goto(origin + entry, { waitUntil: "domcontentloaded" });
  assert.equal(new URL(page.url()).pathname, entry);
  await page.getByTestId("quick-order-request-only").waitFor();
  await page.getByTestId("early-access-agreement-accepted").waitFor();
  await policyVersion(page, "v1");
  for (const name of policyProductNames) {
    const card = mixed(page).locator(".xenios-order-card").filter({ hasText: name });
    await card.getByRole("button", { name: /^Add\b/ }).click();
  }
  await button(page, "Increase requested quantity for Synthetic research").click();
  const summary = mixed(page).getByRole("complementary", { name: "Selected request items" });
  if (mobile) await summary.getByRole("button", { name: "Review request (2)", exact: true }).click();
  await summary.getByRole("button", { name: "Continue to contact", exact: true }).click();
  const form = mixed(page).locator("form");
  for (const [name, value] of Object.entries(fixtureContact)) {
    await form.locator("input[name=" + JSON.stringify(name) + "]").fill(value);
  }
  await form.getByLabel("Billing address is the same", { exact: true }).uncheck();
  const billing = { billingLine1: "200 Example Billing Street", billingCity: "Austin",
    billingRegion: "TX", billingPostalCode: "78702", billingCountryCode: "US" };
  for (const [name, value] of Object.entries(billing)) {
    await form.locator("input[name=" + JSON.stringify(name) + "]").fill(value);
  }
  await form.locator("input[name=age]").check();
  await form.getByRole("button", { name: "Review request", exact: true }).click();
  await mixed(page).getByRole("heading", { name: "Review your request", exact: true }).waitFor();
}

async function acknowledge(page, fresh = false) {
  const boxes = fields(page);
  await boxes.first().waitFor();
  assert.equal(await boxes.count(), 5);
  for (const field of await boxes.all()) {
    if (fresh) assert.equal(await field.isChecked(), false);
    await field.check();
  }
}

async function protocolCheck(candidate, slot) {
  const { verifySyntheticPolicyProtocol } = await import(pathToFileURL(
    join(candidate, "scripts/evidence/lib/policy-fixture-v2.mjs")).href);
  await slot.page.goto(origin + blank);
  return verifySyntheticPolicyProtocol({ origin, request: (data) => slot.page.evaluate(async (input) => {
    if (location.origin !== input.origin) throw new Error("Wrong loopback origin");
    const response = await fetch(input.path, {
      method: input.method, credentials: "same-origin", cache: "no-store", redirect: "error",
      ...(input.body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(input.body) } : {}),
    });
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Expected JSON");
    return { ok: response.ok, status: response.status, payload: await response.json() };
  }, data) });
}

async function waitForPreview(preview, expected) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (preview.exitCode !== null || preview.signalCode !== null) break;
    let response;
    try { response = await fetch(origin + "/__xenios_evidence_provenance", { redirect: "error", signal: AbortSignal.timeout(500) }); }
    catch { /* Retry only startup readiness, never a business action. */ }
    if (response?.ok) {
      const ready = await response.json();
      assert.equal(ready.candidateSha, expected.candidateSha);
      assert.equal(ready.sourceTree, expected.candidateTree);
      return;
    }
    await delay(250);
  }
  throw new Error("Loopback preview did not become ready");
}

async function capture(candidate, output, expected, allowance) {
  const result = { scope: "NON-PRODUCTION SYNTHETIC BROWSER EVIDENCE", profile, ...expected, allowance,
    network: { loopbackOnly: false, serviceWorkers: "blocked", unexpectedWrites: 0,
      blockedExternal: 0, fixtureForwardFailures: 0 },
    checks: [], status: "failed",
    limits: "Exact built page and candidate handlers. Synthetic principals, catalog, readiness and in-memory persistence. No hosted production or managed database evidence.",
  };
  let fixture, preview, browser;
  let stage = "loopback_namespace";
  try {
    const interfaces = JSON.parse(execFileSync("ip", ["-json", "link", "show"], { encoding: "utf8" }));
    result.network.loopbackOnly = interfaces.length === 1 && interfaces[0].ifname === "lo" && interfaces[0].flags.includes("UP");
    assert(result.network.loopbackOnly);
    assert.equal(expected.candidateSha, candidateHead);
    assert.equal(expected.candidateTree, candidateTree);
    assert.equal(allowance.currentRunId, expected.runId);
    assert.equal(allowance.maximumAttempts, 1);
    assert.deepEqual(allowance.distinctRunIds, [expected.runId]);
    stage = "candidate_preview";
    preview = spawn(process.execPath, ["scripts/preview-research.mjs"], {
      cwd: candidate, env: { HOME: process.env.HOME, PATH: process.env.PATH, PORT: "5199" },
      stdio: "ignore",
    });
    await waitForPreview(preview, expected);
    stage = "actual_handler_fixture";
    fixture = await createMountedPolicyFixture(candidate);
    browser = await chromium.launch({ headless: true, timeout: 12000 });
    const make = (owner, mobile) => createContext(browser, fixture, result.network, owner, mobile);
    const prior = await make("prior");
    const draft = await make("draft", true);
    stage = "mounted_historical_drafts";
    await openReview(prior, false);
    await openReview(draft, true);
    assert(prior.verified() > 0);
    await acknowledge(prior.page);
    await acknowledge(draft.page);
    result.checks.push(required[0]);

    stage = "save_v1_drop_reply";
    await submit(prior.page).click();
    await settledPriorReply(prior, 1);
    const priorFirst = latest(prior, policyPaths.intent);
    const marker = await storage(prior.page, attemptKey);
    assert.equal(priorFirst.status, 200);
    assert.equal(legalVersion(priorFirst.input), "v1");
    assert.equal(marker.key, priorFirst.input.idempotencyKey);
    assert.deepEqual(Object.keys(marker).sort(), ["acceptedAt", "key", "state"]);
    assert.equal(fixture.savedCount(), 1);
    result.checks.push(required[1]);

    stage = "v2_protocol";
    fixture.cutover();
    const protocol = await make("protocol");
    result.policyTransition = await protocolCheck(candidate, protocol);
    assert(fixture.acceptedAt("protocol", "v2"));
    result.checks.push(required[2]);
    stage = "explicit_frozen_v1_retry";
    assert.equal(traffic(prior, policyPaths.intent).length, 1);
    await button(prior.page, "Retry same request").click();
    await settledPriorReply(prior, 2);
    const priorRetry = latest(prior, policyPaths.intent);
    assert.equal(traffic(prior, policyPaths.intent).length, 2);
    assert.equal(priorRetry.status, 200);
    assert.deepEqual(priorRetry.input, priorFirst.input);
    assert.equal(priorRetry.payload.publicReference, priorFirst.payload.publicReference);
    assert.equal((await storage(prior.page, attemptKey)).key, marker.key);
    assert.equal(fixture.savedCount(), 1);
    result.checks.push(required[3]);

    stage = "first_refusal_preserves_review";
    const reviewMount = await mixed(draft.page).locator(".xenios-order-page").elementHandle();
    await submit(draft.page).click();
    await button(draft.page, "Refresh requirements").waitFor();
    await policyVersion(draft.page, "v2");
    const refused = latest(draft, policyPaths.intent);
    assert.equal(refused.status, 403);
    assert.equal(refused.payload.error, "agreement_standing_required");
    assert.equal(legalVersion(refused.input), "v1");
    assert.equal(await storage(draft.page, attemptKey), null);
    assert.equal(fixture.savedCount(), 1);
    result.checks.push(required[4]);
    assert(await reviewMount.evaluate((node) => node.isConnected));
    await mixed(draft.page).getByRole("heading", { name: "Review your request", exact: true }).waitFor();
    // The requirements are intentionally empty until refreshed. Use the
    // stable review heading to bind the same live panel at this point.
    const panel = mixed(draft.page).getByRole("heading", { name: "Review your request", exact: true }).locator("..");
    const text = await panel.innerText();
    assert(text.includes(fixtureContact.name) && text.includes(fixtureContact.email));
    assert(text.includes("Synthetic clinical") && text.includes("Synthetic research") && text.includes("Requested quantity: 2"));
    assert.equal(traffic(draft, policyPaths.intent).length, 1);
    result.checks.push(required[5]);

    stage = "explicit_policy_acceptance_and_refresh";
    const priorAcceptance = fixture.acceptedAt("draft", "v1");
    assert.equal(priorAcceptance, "2026-10-14T12:00:00.000Z");
    assert.equal(fixture.acceptedAt("draft", "v2"), null);
    await draft.page.getByTestId("early-access-agreement-checkbox").check();
    await draft.page.getByTestId("early-access-agreement-submit").click();
    await draft.page.getByTestId("early-access-agreement-accepted").waitFor();
    assert.equal(traffic(draft, policyPaths.accept).length, 1);
    assert.deepEqual(latest(draft, policyPaths.accept).input, { kind: "early_access_terms", version: "v2" });
    assert.equal(fixture.acceptedAt("draft", "v1"), priorAcceptance);
    assert(fixture.acceptedAt("draft", "v2"));
    result.checks.push(required[6]);
    await button(draft.page, "Refresh requirements").click();
    await fields(draft.page).first().waitFor();
    assert.equal(await submit(draft.page).isEnabled(), false);
    assert.equal(traffic(draft, policyPaths.intent).length, 1);
    await acknowledge(draft.page, true);
    assert.equal(traffic(draft, policyPaths.intent).length, 1);
    result.checks.push(required[7]);
    await submit(draft.page).click();
    await savedHeading(draft.page).waitFor();
    const saved = latest(draft, policyPaths.intent);
    assert.equal(saved.status, 200);
    assert.equal(legalVersion(saved.input), "v2");
    assert.notEqual(saved.input.idempotencyKey, refused.input.idempotencyKey);
    assert.deepEqual(saved.input.lines, refused.input.lines);
    assert.deepEqual(saved.input.contact, refused.input.contact);
    assert.equal(saved.input.contact.billingSameAsShipping, false);
    assert.equal(saved.input.contact.billingAddress.line1, "200 Example Billing Street");
    assert.equal(fixture.savedCount(), 2);
    result.checks.push(required[8]);

    stage = "closed_intake_foreign_owner";
    fixture.closeIntake();
    const other = await make("other");
    await other.page.goto(origin + blank);
    await setStorage(other.page, attemptKey, marker);
    await other.page.goto(origin + entry, { waitUntil: "domcontentloaded" });
    await button(other.page, "Check saved request").click();
    await other.page.getByText(/The saved result is not yet confirmed/).waitFor();
    assert.deepEqual(latest(other, policyPaths.recover).input, { idempotencyKey: marker.key });
    assert.deepEqual(latest(other, policyPaths.recover).payload, { receipt: null });
    assert.equal(await savedHeading(other.page).count(), 0);
    assert.equal((await storage(other.page, attemptKey)).key, marker.key);
    assert(other.verified() > 0);
    result.checks.push(required[9]);

    stage = "closed_intake_original_owner";
    await prior.page.reload({ waitUntil: "domcontentloaded" });
    await button(prior.page, "Check saved request").waitFor();
    assert.equal(await prior.page.getByTestId("quick-order-agreement-mount").count(), 0);
    await button(prior.page, "Check saved request").click();
    await savedHeading(prior.page).waitFor();
    const recovery = latest(prior, policyPaths.recover);
    assert.deepEqual(recovery.input, { idempotencyKey: marker.key });
    assert.deepEqual(recovery.payload, { receipt: priorFirst.payload });
    assert.equal(await storage(prior.page, attemptKey), null);
    const display = await storage(prior.page, receiptKey);
    assert.deepEqual(Object.keys(display).sort(), ["createdAt", "owner", "pageLoad", "publicReference"]);
    assert.equal(display.owner, policyMembers.prior.cartScope);
    assert.equal(display.publicReference, priorFirst.payload.publicReference);
    result.checks.push(required[10]);

    stage = "closed_intake_receipt_reopen";
    await prior.page.reload({ waitUntil: "domcontentloaded" });
    await savedHeading(prior.page).waitFor();
    await prior.page.getByText("This reference was confirmed earlier in this browser tab. Nothing was sent again.", { exact: true }).waitFor();
    await prior.page.getByText(display.publicReference, { exact: true }).waitFor();
    assert.equal(traffic(prior, policyPaths.recover).length, 1);
    assert.equal(traffic(prior, policyPaths.intent).length, 2);
    result.checks.push(required[11]);

    stage = "foreign_receipt_record";
    await setStorage(other.page, attemptKey, null);
    await setStorage(other.page, receiptKey, display);
    await other.page.reload({ waitUntil: "domcontentloaded" });
    await other.page.getByText(/The request form is currently unavailable/).waitFor();
    assert.equal(await savedHeading(other.page).count(), 0);
    assert.equal(await other.page.getByText(display.publicReference, { exact: true }).count(), 0);
    assert.equal(await storage(other.page, receiptKey), null);
    result.checks.push(required[12]);

    stage = "exact_write_accounting";
    const slots = [draft, prior, other, protocol];
    const count = (path) => slots.reduce((total, slot) => total + traffic(slot, path).length, 0);
    result.writeCounts = { submissions: count(policyPaths.intent), recoveries: count(policyPaths.recover),
      acceptanceCalls: count(policyPaths.accept), savedRequests: fixture.savedCount() };
    result.checks.push(required[13]);
    result.status = "passed";
    verifyPolicyResult(result, expected, allowance);
  } catch {
    result.status = "failed";
    result.failedStage = stage;
  } finally {
    try {
      await browser?.close();
      await fixture?.close();
    } catch {
      result.status = "failed";
      result.failedStage ??= "loopback_cleanup";
    } finally {
      preview?.kill();
      await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    }
  }
  if (result.status !== "passed") {
    console.error("Synthetic policy capture failed at " + result.failedStage);
    process.exitCode = 1;
  }
}

async function main(args) {
  if (args[0] === "--validate") {
    const output = args[1];
    const result = JSON.parse(await readFile(join(output, "result.json"), "utf8"));
    const allowance = JSON.parse(await readFile(join(output, "allowance.json"), "utf8"));
    verifyPolicyResult(result, {
      candidateSha: process.env.CANDIDATE_SHA, candidateTree: process.env.CANDIDATE_TREE,
      harnessRevision: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID,
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    }, allowance);
    return;
  }
  const [candidate, output, candidateSha, tree, harnessRevision, runId, runAttempt, allowanceFile] = args;
  const allowance = JSON.parse(await readFile(allowanceFile, "utf8"));
  await capture(candidate, output, { candidateSha, candidateTree: tree, harnessRevision, runId,
    runAttempt: Number(runAttempt) }, allowance);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(process.argv.slice(2)); }
  catch { console.error("Synthetic policy profile could not verify the exact run evidence"); process.exitCode = 1; }
}
