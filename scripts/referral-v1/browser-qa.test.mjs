import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localOrigin, safeEvidenceUrl, evidenceDirectory, parseOptions, WIDTHS, browserCapabilitiesSource, assertPersonaBinding } from "./browser-qa.mjs";

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
  it("cannot substitute aggregate counts, an early binding, or a different link for per-persona proof", () => {
    assert.throws(() => assertPersonaBinding({ db: { bindings: 3 } }, "recovery", null));
    assert.throws(() => assertPersonaBinding({ bindingByPersona: { recovery: { count: 1, linkId: "link-one" } } }, "recovery", null));
    assert.throws(() => assertPersonaBinding({ bindingByPersona: { recovery: { count: 1, linkId: "link-two" } } }, "recovery", "link-one"));
    assert.deepEqual(assertPersonaBinding({ bindingByPersona: { recovery: { count: 0, linkId: null } } }, "recovery", null), { persona: "recovery", count: 0, linkId: null });
    assert.deepEqual(assertPersonaBinding({ bindingByPersona: { recovery: { count: 1, linkId: "link-one" } } }, "recovery", "link-one"), { persona: "recovery", count: 1, linkId: "link-one" });
  });
});
