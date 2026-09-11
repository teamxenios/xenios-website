// The caller must refuse precisely, before any effect, whenever genuine
// approval is absent or wrong; and it must re-verify on every authorization.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createCheckoutRecoveryCaller,
  RECOVERY_APPROVAL_KIND,
  RECOVERY_CALLER_ENV as E,
  verifyRecoveryApproval,
} from "./checkout-recovery-caller";
import { RECOVERY_PASS_EFFECTS, type CheckoutRecoveryPassInput } from "./checkout-recovery-pass";
import type { CheckoutExecutionClient } from "./persistence/checkout-executions-store";

const NOW = new Date("2026-09-11T12:00:00.000Z");
const REF = "abcdefghijklmnopqrst";
const SHA = "a".repeat(40);
const PATH = "/approvals/recovery.json";

const doc = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    kind: RECOVERY_APPROVAL_KIND,
    environment: "staging",
    projectRef: REF,
    applicationSha: SHA,
    expiresAt: "2026-09-12T12:00:00.000Z",
    effects: [...RECOVERY_PASS_EFFECTS],
    memberIds: "all",
    approvedBy: "founder",
    approvedAt: "2026-09-11T09:00:00.000Z",
    ...overrides,
  });
const digest = (bytes: string) => createHash("sha256").update(bytes).digest("hex");

function setup(options: { document?: string; env?: Record<string, string | undefined>; pinned?: string } = {}) {
  const files = new Map<string, string>([[PATH, options.document ?? doc()]]);
  const env: Record<string, string | undefined> = {
    [E.enabled]: "true",
    [E.approvalPath]: PATH,
    [E.approvalSha256]: options.pinned ?? digest(files.get(PATH)!),
    [E.environment]: "staging",
    [E.applicationSha]: SHA,
    [E.databaseUrl]: `https://${REF}.supabase.co`,
    ...options.env,
  };
  const reads = vi.fn(async (path: string) => {
    const body = files.get(path);
    if (body === undefined) throw new Error("ENOENT");
    return body;
  });
  const clients = vi.fn((_origin: string) => ({}) as CheckoutExecutionClient);
  const payment = { retrievePayment: vi.fn(), cancelAuthorization: vi.fn() };
  const passes: CheckoutRecoveryPassInput[] = [];
  const runOnce = vi.fn(async () => ({
    ok: true as const, status: "exhausted" as const,
    considered: 0, attempted: 0, recorded: 0, settled: 0, skipped: 0, escalated: 0, deferred: 0, pages: 1, resumed: 0,
  }));
  const outcomes: unknown[] = [];
  const caller = createCheckoutRecoveryCaller({
    env,
    readApproval: reads,
    createExecutionClient: clients,
    payment: payment as never,
    now: () => NOW,
    newId: () => "00000000-0000-4000-8000-00000000c0de",
    onOutcome: (result) => outcomes.push(result),
    createPass(input) {
      passes.push(input);
      return { runOnce };
    },
  });
  return { caller, env, files, reads, clients, payment, passes, runOnce, outcomes };
}

describe("disabled by default", () => {
  it("does nothing at all unless explicitly enabled", async () => {
    for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
      const h = setup({ env: { [E.enabled]: value } });
      expect(await h.caller.runOnce()).toEqual({ ok: false, status: "disabled" });
      expect(h.reads).not.toHaveBeenCalled();
      expect(h.clients).not.toHaveBeenCalled();
      expect(h.passes).toHaveLength(0);
    }
  });
});

describe("refuses precisely, before any effect", () => {
  const cases: Array<[string, Parameters<typeof setup>[0], string]> = [
    ["no approval path is configured", { env: { [E.approvalPath]: undefined } }, "approval_not_configured"],
    ["no pinned digest is configured", { env: { [E.approvalSha256]: undefined } }, "approval_not_configured"],
    ["the pinned digest is not a digest", { env: { [E.approvalSha256]: "approved" } }, "approval_not_configured"],
    ["the deployment declares no environment", { env: { [E.environment]: undefined } }, "environment_not_declared"],
    ["the running commit is unknown", { env: { [E.applicationSha]: undefined } }, "application_identity_missing"],
    ["there is no database target", { env: { [E.databaseUrl]: undefined } }, "database_target_missing"],
    ["the database target is not a project", { env: { [E.databaseUrl]: "https://example.invalid" } }, "database_target_missing"],
    ["the document cannot be read", { env: { [E.approvalPath]: "/nowhere.json" } }, "approval_unreadable"],
    ["the document is not the pinned one", { pinned: "b".repeat(64) }, "approval_digest_mismatch"],
    ["the document is not JSON", { document: "{" }, "approval_invalid"],
    ["the document carries an extra field", { document: doc({ extra: true }) }, "approval_invalid"],
    ["the document is another kind", { document: doc({ kind: "xenios.something_else.v1" }) }, "approval_invalid"],
    ["the document omits an effect", { document: doc({ effects: RECOVERY_PASS_EFFECTS.slice(1) }) }, "approval_invalid"],
    ["the document is dated in the future", { document: doc({ approvedAt: "2026-09-12T00:00:00.000Z" }) }, "approval_invalid"],
    ["the approval has expired", { document: doc({ expiresAt: "2026-09-11T11:59:59.999Z" }) }, "approval_expired"],
    ["a staging approval runs in production", { env: { [E.environment]: "production" } }, "environment_mismatch"],
    ["a staging approval names the production project", { document: doc({ projectRef: "yvzeduaxbwgcwllhywff" }), env: { [E.databaseUrl]: "https://yvzeduaxbwgcwllhywff.supabase.co" } }, "environment_mismatch"],
    ["the approval names another project", { document: doc({ projectRef: "zzzzzzzzzzzzzzzzzzzz" }) }, "database_target_mismatch"],
    ["the approval names other code", { document: doc({ applicationSha: "b".repeat(40) }) }, "application_mismatch"],
  ];
  for (const [name, options, code] of cases) {
    it(`when ${name}`, async () => {
      const h = setup(options);
      expect(await h.caller.runOnce()).toEqual({ ok: false, status: "unavailable", code });
      // Nothing was connected and the pass was never constructed.
      expect(h.clients).not.toHaveBeenCalled();
      expect(h.passes).toHaveLength(0);
      expect(h.payment.cancelAuthorization).not.toHaveBeenCalled();
      expect(h.outcomes).toEqual([{ ok: false, status: "unavailable", code }]);
    });
  }
});

describe("a genuine approval reaches the pass, and is re-verified every time", () => {
  it("hands the pass exactly the verified context and runs it once", async () => {
    const h = setup();
    const result = await h.caller.runOnce();
    expect(result).toMatchObject({ ok: true, status: "exhausted" });
    expect(h.passes).toHaveLength(1);
    expect(h.passes[0]!.context).toEqual({
      environment: "staging",
      projectRef: REF,
      applicationSha: SHA,
      approvalSha256: digest(doc()),
      expiresAt: "2026-09-12T12:00:00.000Z",
      effects: [...RECOVERY_PASS_EFFECTS],
      memberIds: "all",
    });
    expect(h.passes[0]!.enabled).toBe(true);
    expect(h.runOnce).toHaveBeenCalledWith({ owner: "00000000-0000-4000-8000-00000000c0de" });
  });

  it("re-reads and re-hashes the document on every authorization, not only at start", async () => {
    const h = setup();
    await h.caller.runOnce();
    const authorize = h.passes[0]!.authorize;
    const before = h.reads.mock.calls.length;
    await expect(authorize()).resolves.toMatchObject({ projectRef: REF });
    expect(h.reads.mock.calls.length).toBe(before + 1);

    // The document is changed after start. The next authorization refuses.
    h.files.set(PATH, doc({ memberIds: ["00000000-0000-4000-8000-000000000001"] }));
    await expect(authorize()).rejects.toMatchObject({ code: "approval_digest_mismatch" });
  });

  it("refuses the next authorization when different code is deployed mid-run", async () => {
    const h = setup();
    await h.caller.runOnce();
    h.env[E.applicationSha] = "c".repeat(40);
    await expect(h.passes[0]!.authorize()).rejects.toMatchObject({ code: "application_mismatch" });
  });

  it("connects only to the database the process is configured for", async () => {
    const h = setup();
    await h.caller.runOnce();
    const connect = h.passes[0]!.connect;
    connect(h.passes[0]!.context);
    expect(h.clients).toHaveBeenCalledWith(`https://${REF}.supabase.co`);
    expect(() => connect({ ...h.passes[0]!.context, projectRef: "zzzzzzzzzzzzzzzzzzzz" })).toThrow(/connection_refused/);
  });

  it("does not echo the caller's context: verification derives it from the document and observed facts", async () => {
    const env = {
      [E.approvalPath]: PATH, [E.approvalSha256]: digest(doc()), [E.environment]: "staging",
      [E.applicationSha]: SHA, [E.databaseUrl]: `https://${REF}.supabase.co`,
    };
    const context = await verifyRecoveryApproval({ env, readApproval: async () => doc(), now: () => NOW });
    // The digest in the context is the PINNED one, the identity is the one the
    // platform reports; neither came from the thing being verified.
    expect(context.approvalSha256).toBe(env[E.approvalSha256]);
    expect(context.applicationSha).toBe(env[E.applicationSha]);
  });
});

describe("the schedule", () => {
  it("does not overlap runs inside one process", async () => {
    const h = setup();
    let release!: () => void;
    h.runOnce.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, status: "exhausted", considered: 0, attempted: 0, recorded: 0, settled: 0, skipped: 0, escalated: 0, deferred: 0, pages: 1, resumed: 0 }); }),
    );
    const first = h.caller.runOnce();
    await vi.waitFor(() => expect(h.runOnce).toHaveBeenCalledTimes(1));
    expect(await h.caller.runOnce()).toEqual({ ok: false, status: "unavailable", code: "already_running" });
    release();
    await first;
  });

  it("refuses an interval shorter than a minute, and is not started by construction", () => {
    const h = setup();
    expect(() => h.caller.start(1000)).toThrow(/at_least_one_minute/);
    // Construction alone read nothing.
    expect(h.reads).not.toHaveBeenCalled();
  });
});
