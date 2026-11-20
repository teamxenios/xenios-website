/** Actual temporary filesystem controls; all authority is explicitly OWNED
 * synthetic test input. No default or production admission implementation. */
import { mkdtemp, chmod, stat, readFile, readdir, writeFile, symlink, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { canonical, sha256, CODE_PINS, SOURCE_COMMIT, SOURCE_UNITS, type InstallIntent, type InstallReceipt } from "./request-intent-no-mail-install";
import { createNoMailOperatorAdapter, OPERATOR_SOURCE_SHA256, type RootNoMailAdmission, type RootNoMailBindings } from "./request-intent-no-mail-operator";

const intent = (): InstallIntent => ({ executionId: "owned_execution_original", implementationSource: "f".repeat(40),
  target: { project: "owned_target_no_mail", service: "owned_service_no_mail" }, expectedVersion: 170011, wallMs: 10000,
  preimageSha256: "a".repeat(64), postimageSha256: "b".repeat(64), source: SOURCE_COMMIT, codePins: CODE_PINS,
  sourcePins: SOURCE_UNITS.map(unit => unit.sha256) });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "xenios-no-mail-operator-")); await chmod(directory, 0o700);
  const metadata = await stat(directory, { bigint: true }), until = Date.now() + 120000;
  const verify = vi.fn(async (input: Parameters<RootNoMailBindings["verifyAdmission"]>[0]): Promise<RootNoMailAdmission> => ({
    actionId: "OWNED_SYNTHETIC_ACTION", evidenceId: "OWNED_SYNTHETIC_ADMISSION", providerEvidenceId: "OWNED_NOT_PROVIDER_PROOF",
    purpose: input.purpose, intentSha256: sha256(canonical(input.intent)), adapterSha256: OPERATOR_SOURCE_SHA256,
    validUntilUnixMs: until, custodyDirectory: directory, custodyDevice: String(metadata.dev), custodyInode: String(metadata.ino),
  }));
  const secret = vi.fn<RootNoMailBindings["targetSecret"]>(async () => { throw Error("no actual provider in filesystem test"); });
  const bindings: RootNoMailBindings = { actionId: "OWNED_SYNTHETIC_ACTION", custodyDirectory: directory,
    target: { ...intent().target, expectedVersion: 170011 }, verifyAdmission: verify, targetSecret: secret };
  return { directory, verify, secret, bindings, adapter: createNoMailOperatorAdapter(bindings)!,
    close: async () => { expect(resolve(directory).startsWith(resolve(tmpdir()) + "/") || resolve(directory).startsWith(resolve(tmpdir()) + "\\")).toBe(true); await rm(directory, { recursive: true, force: true }); } };
}
const signal = () => new AbortController().signal;

it("has no default adapter or filesystem/credential side effect without real callbacks", () => {
  expect(createNoMailOperatorAdapter()).toBeUndefined(); expect(createNoMailOperatorAdapter(null)).toBeUndefined();
});
it("two independent actual factory callers have one durable OS reservation winner", async () => {
  const f = await fixture(); try {
    const other = createNoMailOperatorAdapter(f.bindings)!;
    const results = await Promise.allSettled([f.adapter.operator.authorizeAndReserve(intent(), signal()), other.operator.authorizeAndReserve(intent(), signal())]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const names = await readdir(join(f.directory, "no-mail-install-once")); expect(names).toEqual(["reservation.json"]);
    const saved = JSON.parse(await readFile(join(f.directory, "no-mail-install-once/reservation.json"), "utf8"));
    expect(saved.payload.intentSha256).toBe(sha256(canonical(intent()))); expect(saved.digest).toBe(sha256(canonical({ protocol: saved.protocol, payload: saved.payload })));
    expect(f.secret).not.toHaveBeenCalled();
  } finally { await f.close(); }
});
it("a new executionId or restarted adapter cannot escape the original spent slot", async () => {
  const f = await fixture(); try {
    await f.adapter.operator.authorizeAndReserve(intent(), signal());
    const fresh = createNoMailOperatorAdapter(f.bindings)!;
    await expect(fresh.operator.authorizeAndReserve({ ...intent(), executionId: "owned_other_execution" }, signal())).rejects.toThrow();
    await expect(fresh.operator.openFreshConnection(intent(), signal())).rejects.toThrow("no_local_reservation");
    expect(await readdir(f.directory)).toEqual(["no-mail-install-once"]); expect(f.secret).not.toHaveBeenCalled();
  } finally { await f.close(); }
});
it("an alternate custody path cannot reuse the authentic original path binding", async () => {
  const f = await fixture(), alternative = await mkdtemp(join(tmpdir(), "xenios-no-mail-alternate-")); try {
    await chmod(alternative, 0o700);
    const other = createNoMailOperatorAdapter({ ...f.bindings, custodyDirectory: alternative })!;
    await expect(other.operator.authorizeAndReserve(intent(), signal())).rejects.toThrow("admission_unavailable");
    expect(await readdir(alternative)).toEqual([]); expect(f.secret).not.toHaveBeenCalled();
  } finally { await f.close(); await rm(alternative, { recursive: true, force: true }); }
});
it("a failed secret handoff spends opening once and never retries native allocation", async () => {
  const f = await fixture(); try {
    await f.adapter.operator.authorizeAndReserve(intent(), signal());
    await expect(f.adapter.operator.openFreshConnection(intent(), signal())).rejects.toThrow("secret_port_unavailable");
    await expect(f.adapter.operator.openFreshConnection(intent(), signal())).rejects.toThrow();
    expect(f.secret).toHaveBeenCalledTimes(1);
    expect((await readdir(join(f.directory, "no-mail-install-once"))).sort()).toEqual(["opening.json", "reservation.json"]);
    expect(await readFile(join(f.directory, "no-mail-install-once/reservation.json"), "utf8")).not.toContain("password");
  } finally { await f.close(); }
});
it("revocation or expiry renewal after reserve refuses before secret lookup and preserves evidence", async () => {
  for (const change of ["revoked", "renewed"] as const) {
    const f = await fixture(); try {
      await f.adapter.operator.authorizeAndReserve(intent(), signal());
      const original = f.verify.getMockImplementation()!;
      f.verify.mockImplementation(async input => {
        if (change === "revoked") throw Error("owned revoked");
        const result = await original(input); return { ...result, validUntilUnixMs: result.validUntilUnixMs + 1000 };
      });
      await expect(f.adapter.operator.openFreshConnection(intent(), signal())).rejects.toThrow();
      expect(f.secret).not.toHaveBeenCalled(); expect(await readdir(join(f.directory, "no-mail-install-once"))).toEqual(["reservation.json"]);
    } finally { await f.close(); }
  }
});
it("pre-abort, target/source drift and unknown intent fields refuse without persisting caller data", async () => {
  const f = await fixture(); try {
    const abort = new AbortController(); abort.abort();
    await expect(f.adapter.operator.authorizeAndReserve(intent(), abort.signal)).rejects.toThrow("aborted");
    await expect(f.adapter.operator.authorizeAndReserve({ ...intent(), target: { ...intent().target, project: "owned_wrong_target" } }, signal())).rejects.toThrow("target_pin");
    await expect(f.adapter.operator.authorizeAndReserve({ ...intent(), sourcePins: [] }, signal())).rejects.toThrow("source");
    const extra = { ...intent(), privateCustomerText: "must-not-enter-custody" };
    await expect(f.adapter.operator.authorizeAndReserve(extra, signal())).rejects.toThrow("shape");
    expect(await readdir(f.directory)).toEqual([]); expect(f.secret).not.toHaveBeenCalled();
  } finally { await f.close(); }
});
it("refuses a changed/partial reservation instead of adopting it", async () => {
  const f = await fixture(); try {
    await f.adapter.operator.authorizeAndReserve(intent(), signal());
    await writeFile(join(f.directory, "no-mail-install-once/reservation.json"), '{"protocol":"partial"}', { mode: 0o600 });
    await expect(f.adapter.operator.openFreshConnection(intent(), signal())).rejects.toThrow("shape"); expect(f.secret).not.toHaveBeenCalled();
    expect(await readdir(join(f.directory, "no-mail-install-once"))).toEqual(["reservation.json"]);
  } finally { await f.close(); }
});
it("refuses symlink custody and permissive custody without making a fresh root", async () => {
  const f = await fixture(), alias = f.directory + "-alias"; try {
    await symlink(f.directory, alias, "dir");
    const original = f.verify.getMockImplementation()!;
    const other = createNoMailOperatorAdapter({ ...f.bindings, custodyDirectory: alias,
      verifyAdmission: async input => ({ ...await original(input), custodyDirectory: alias }) })!;
    await expect(other.operator.authorizeAndReserve(intent(), signal())).rejects.toThrow("canonical_custody_path");
    await chmod(f.directory, 0o755);
    await expect(f.adapter.operator.authorizeAndReserve(intent(), signal())).rejects.toThrow("custody_permissions");
    expect(await readdir(f.directory)).toEqual([]); expect(f.secret).not.toHaveBeenCalled();
  } finally { await rm(alias, { force: true }); await chmod(f.directory, 0o700); await f.close(); }
});
it("cannot journal a fabricated prepared receipt without its actual native connection record", async () => {
  const f = await fixture(); try {
    await f.adapter.operator.authorizeAndReserve(intent(), signal());
    const projection: InstallReceipt = { executionId: intent().executionId, intentSha256: sha256(canonical(intent())), outcome: "refused", replayAllowed: false,
      phase: "prepared_journal", commitSent: false, commitAcknowledged: false, pid: 12345, backendStart: "2026-11-20T12:00:00.000000Z",
      actualPreimageSha256: intent().preimageSha256, actualPostimageSha256: intent().postimageSha256, ordinaryBeforeSha256: "c".repeat(64), ordinaryAfterSha256: "c".repeat(64),
      unarmedVerified: true, preparedJournal: null, finalJournal: null, sqlState: null, observations: [] };
    await expect(f.adapter.operator.journal("prepared", projection, signal())).rejects.toThrow();
    expect(await readdir(join(f.directory, "no-mail-install-once"))).toEqual(["reservation.json"]); expect(f.secret).not.toHaveBeenCalled();
  } finally { await f.close(); }
});
