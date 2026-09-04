import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localOrigin, safeEvidenceUrl, safeEvidenceError, evidenceDirectory, parseOptions, WIDTHS, browserCapabilitiesSource, assertPersonaBinding, ReferralBrowser, PWA_INSTALL_PROMOTION_ABSENT_EXPRESSION } from "./browser-qa.mjs";

describe("referral browser evidence boundaries", () => {
  it("permits only an explicit loopback origin", () => {
    assert.equal(localOrigin("http://127.0.0.1:5238"), "http://127.0.0.1:5238");
    for (const value of ["https://xeniostechnology.com", "http://localhost:5238", "http://127.0.0.1", "http://person:secret@127.0.0.1:5238", "http://127.0.0.1:5238/path", "http://127.0.0.1:5238/?x=1"]) assert.throws(() => localOrigin(value));
  });
  it("keeps generated artifacts inside the owned directory", () => {
    assert.match(evidenceDirectory("candidate-320"), /browser-candidate-320$/);
    for (const value of ["../elsewhere", "A", "", "a/b", "a\\b"]) assert.throws(() => evidenceDirectory(value));
  });
  it("redacts navigation credentials and opaque invitation paths from telemetry", () => {
    assert.equal(safeEvidenceUrl("http://127.0.0.1:5238/r/r1_secret?token=private#access_token=secret"), "http://127.0.0.1:5238/r/OPAQUE-REDACTED?REDACTED#REDACTED");
  });
  it("redacts credential URLs in errors while preserving the failure and stack meaning", () => {
    const error = "Error: navigate http://user:secret@127.0.0.1:5238/research/reset-password?returnTo=private#access_token=synthetic-private&refresh_token=synthetic-refresh: load event not fired within 30000 ms\n    at PageSession.navigate (file:///workspace/cdp.mjs:12:3)";
    const safe = safeEvidenceError(error);
    assert.match(safe, /reset-password\?REDACTED#REDACTED load event not fired within 30000 ms/);
    assert.match(safe, /PageSession\.navigate \(file:\/\/\/workspace\/cdp\.mjs:12:3\)/);
    assert.doesNotMatch(safe, /user:|secret|synthetic-private|synthetic-refresh|returnTo/);
    assert.equal(safeEvidenceError("token=opaque access_token=private refresh_token=hidden"), "token=[REDACTED] access_token=[REDACTED] refresh_token=[REDACTED]");
    assert.equal(safeEvidenceError(`invite r1_${"Z".repeat(43)} JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdWJqZWN0In0.signature`), "invite r1_[REDACTED] JWT [JWT-REDACTED]");
    const harness = readFileSync(new URL("./browser-qa.mjs", import.meta.url), "utf8");
    assert.match(harness, /row\.error = safeEvidenceError/);
    assert.match(harness, /report\.errors\.push\(safeEvidenceError/);
    assert.match(harness, /console\.error\("REFERRAL_BROWSER_QA_FAIL", safeEvidenceError/);
  });
  it("has all nine required widths and no silent option widening", () => {
    assert.deepEqual(parseOptions([]).widths, WIDTHS);
    assert.deepEqual(parseOptions(["--only-320"]).widths, [320]);
    assert.throws(() => parseOptions(["--allow-external"]));
    assert.throws(() => parseOptions(["--preview-script=../../unrelated.mjs"]));
  });
  it("stubs only declared browser capability branches and never core API responses", () => {
    const source = browserCapabilitiesSource();
    assert.match(source, /navigator, 'share'/); assert.match(source, /navigator, 'clipboard'/);
    assert.doesNotMatch(source, /fetch|XMLHttpRequest|localStorage|Supabase/);
    const harness = readFileSync(new URL("./browser-qa.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(harness, /Network\.setBypassServiceWorker|ServiceWorker\.stopAllWorkers|Fetch\.fulfillRequest|unregister\(/);
  });
  it("fails closed when either install promotion is present without rejecting the update notice", async () => {
    const evaluate = (texts) => Function("document", `return ${PWA_INSTALL_PROMOTION_ABSENT_EXPRESSION}`)({
      querySelectorAll: selector => { assert.equal(selector, '[role="status"]'); return texts.map(textContent => ({ textContent })); },
    });
    assert.equal(evaluate([]), true);
    assert.equal(evaluate(["A new version of xenios is ready."]), true);
    assert.equal(evaluate(["Add xenios to your home screen. Install"]), false);
    assert.equal(evaluate(["Install xenios: tap Share, then “Add to Home Screen”."]), false);

    await assert.doesNotReject(ReferralBrowser.prototype.assertNoPwaInstallPromotion.call({ page: { evaluate: async expression => { assert.equal(expression, PWA_INSTALL_PROMOTION_ABSENT_EXPRESSION); return true; } } }, "fixture"));
    await assert.rejects(ReferralBrowser.prototype.assertNoPwaInstallPromotion.call({ page: { evaluate: async () => false } }, "fixture"), /PWA install promotion was visible on sensitive fixture/);
  });
  it("asserts install-promotion absence for snapshots plus explicit public Research and Care arrivals", () => {
    const harness = readFileSync(new URL("./browser-qa.mjs", import.meta.url), "utf8");
    const snapshot = harness.slice(harness.indexOf("async snapshot("), harness.indexOf("\n}\n\nconst buttonExpression"));
    assert.equal((snapshot.match(/assertNoPwaInstallPromotion/g) ?? []).length, 2);
    assert.match(harness, /arrive\("location\.pathname \+ location\.search === '\/research'"\);\n\s+await browser\.assertNoPwaInstallPromotion\("public Research arrival"\)/);
    assert.match(harness, /arrive\("location\.pathname === '\/care'"\);\n\s+await browser\.assertNoPwaInstallPromotion\("Care arrival"\)/);
    assert.match(harness, /arrive\("location\.pathname === '\/care'"\);\n\s+await browser\.assertNoPwaInstallPromotion\("Care recovery-path arrival"\)/);
  });
  it("cannot substitute aggregate counts, an early binding, or a different link for per-persona proof", () => {
    assert.throws(() => assertPersonaBinding({ db: { bindings: 3 } }, "recovery", null));
    assert.throws(() => assertPersonaBinding({ bindingByPersona: { recovery: { count: 1, linkId: "link-one" } } }, "recovery", null));
    assert.throws(() => assertPersonaBinding({ bindingByPersona: { recovery: { count: 1, linkId: "link-two" } } }, "recovery", "link-one"));
    assert.deepEqual(assertPersonaBinding({ bindingByPersona: { recovery: { count: 0, linkId: null } } }, "recovery", null), { persona: "recovery", count: 0, linkId: null });
    assert.deepEqual(assertPersonaBinding({ bindingByPersona: { recovery: { count: 1, linkId: "link-one" } } }, "recovery", "link-one"), { persona: "recovery", count: 1, linkId: "link-one" });
  });
  it("fully settles user-driven navigation and fails closed before the next navigation", async () => {
    const steps = [];
    const browser = {
      wait: async expression => steps.push(["wait", expression]),
      page: {
        settle: async options => steps.push(["settle", options]),
        evaluate: async expression => { steps.push(["verify", expression]); return true; },
      },
    };
    await ReferralBrowser.prototype.arrive.call(browser, "exactDestination");
    assert.deepEqual(steps, [["wait", "exactDestination"], ["wait", "document.readyState === 'complete'"], ["settle", { quietMs: 800, maxSettleMs: 30000 }], ["verify", "exactDestination"]]);
    browser.page.settle = async () => { throw new Error("pending Manifest"); };
    await assert.rejects(ReferralBrowser.prototype.arrive.call(browser, "exactDestination"), /pending Manifest/);
    browser.page.settle = async () => {};
    browser.page.evaluate = async () => false;
    await assert.rejects(ReferralBrowser.prototype.arrive.call(browser, "exactDestination"), /Destination changed/);
  });
});
