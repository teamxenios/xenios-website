import { afterEach, describe, expect, it, vi } from "vitest";
import { createHistoryClaimApi, freezeHistoryConfirmation, HISTORY_CLAIM_PATH, historyClaimSession, parseHistoryClaimLink } from "./history-claim-api";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const code = "A".repeat(43), ref = "eac_" + "a".repeat(32);
const jwt = (sub = id(1), session = id(2), recovery = false) => "e30." + btoa(JSON.stringify({ sub, session_id: session,
  amr: [{ method: recovery ? "recovery" : "password" }] })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "") + ".eA";
const binding = { actorAuthUserId: id(1), sessionId: id(2), accessToken: jwt() };
const command = () => ({ claimId: id(3), challengeToken: code });
const context = () => ({ ok: true, auth: { userId: id(1), email: "fixture@example.invalid", emailVerified: true },
  personal: { memberId: id(4), firstName: "Synthetic", lastName: "Customer", status: "active" }, organizations: [],
  security: { passwordChangeRequired: false, mfaAvailable: false, passkeyAvailable: false } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("personal history claim API", () => {
  it("reads the actual flat context and retains only the personal authenticated projection", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json(context()));
    expect(await createHistoryClaimApi(binding, () => true, transport).context()).toEqual({ actorAuthUserId: id(1), memberId: id(4), email: "fixture@example.invalid" });
    expect(transport.mock.calls[0]).toEqual(["/api/research/account/context", expect.objectContaining({ method: "GET", body: undefined,
      credentials: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
      headers: { Accept: "application/json", Authorization: "Bearer " + binding.accessToken } })]);
  });
  it.each(["actor", "personal-missing", "inactive", "unverified", "extra", "nested-envelope"])("refuses %s context", async kind => {
    const value: Record<string, unknown> = context();
    if (kind === "actor") (value.auth as { userId: string }).userId = id(99);
    if (kind === "personal-missing") value.personal = null;
    if (kind === "inactive") (value.personal as { status: string }).status = "closed";
    if (kind === "unverified") (value.auth as { emailVerified: boolean }).emailVerified = false;
    if (kind === "extra") value.secret = "PRIVATE_SENTINEL";
    const wire = kind === "nested-envelope" ? { ok: true, value } : value;
    await expect(createHistoryClaimApi(binding, () => true, vi.fn<typeof fetch>().mockResolvedValue(json(wire))).context()).rejects.toMatchObject({
      kind: ["actor", "personal-missing", "inactive"].includes(kind) ? "denied" : "unavailable" });
  });
  it("sends personal-only request and treats delivery acceptance as a separate fact", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true, claimId: id(3), deliveryAccepted: false }));
    expect(await createHistoryClaimApi(binding, () => true, transport).requestChallenge(ref)).toEqual({ claimId: id(3), deliveryAccepted: false });
    expect(transport.mock.calls[0][0]).toBe("/api/research/account/claims/request");
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ customerRef: ref, target: { subjectType: "personal" } });
  });
  it("freezes and posts exactly the original confirmation, accepting linked or replayed only", async () => {
    const input = command(), frozen = freezeHistoryConfirmation(input)!; input.claimId = id(99);
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ok: true, customerRef: ref, linked: true, replayed: false }))
      .mockResolvedValueOnce(json({ ok: true, customerRef: ref, linked: false, replayed: true }));
    const api = createHistoryClaimApi(binding, () => true, transport);
    expect(Object.isFrozen(frozen)).toBe(true); expect((await api.confirm(frozen, ref)).replayed).toBe(false);
    expect((await api.confirm(frozen, ref)).replayed).toBe(true);
    expect(transport.mock.calls.map(([path, init]) => [path, init?.body])).toEqual([
      ["/api/research/account/claims/confirm", JSON.stringify(command())], ["/api/research/account/claims/confirm", JSON.stringify(command())] ]);
  });
  it.each(["neither", "both", "foreign-reference", "extra"])("refuses %s success evidence", async kind => {
    const value = { ok: true, customerRef: kind === "foreign-reference" ? "eac_" + "b".repeat(32) : ref,
      linked: kind !== "neither", replayed: kind === "both" };
    if (kind === "extra") Object.assign(value, { privateContact: "PRIVATE_SENTINEL" });
    await expect(createHistoryClaimApi(binding, () => true, vi.fn<typeof fetch>().mockResolvedValue(json(value))).confirm(command(), ref)).rejects.toMatchObject({ kind: "unavailable" });
  });
  it.each([[401, "AUTH_REQUIRED", "signed_out"], [403, "CUSTOMER_EMAIL_MISMATCH", "denied"], [403, "EMAIL_VERIFICATION_REQUIRED", "denied"],
    [428, "PASSWORD_CHANGE_REQUIRED", "password_required"], [400, "CLAIM_CHALLENGE_INVALID", "invalid_claim"],
    [409, "CLAIM_ALREADY_BOUND", "conflict"], [503, "SERVICE_UNAVAILABLE", "unavailable"], [200, "AUTH_REQUIRED", "unavailable"],
    [500, "AUTH_REQUIRED", "unavailable"]] as const)("handles HTTP%s/%s without reflected diagnostics", async (status, error, kind) => {
    const api = createHistoryClaimApi(binding, () => true, vi.fn<typeof fetch>().mockResolvedValue(json({ ok: false, code: error, message: "PRIVATE_SENTINEL" }, status)));
    await expect(api.confirm(command())).rejects.toMatchObject({ kind, message: "The history claim could not be confirmed." });
  });
  it.each(["actor", "session", "recovery", "absent"])("refuses a %s binding before dispatch", async kind => {
    const transport = vi.fn<typeof fetch>();
    const value = { ...binding, ...(kind === "actor" ? { actorAuthUserId: id(99) } : kind === "session" ? { sessionId: id(99) }
      : { accessToken: kind === "recovery" ? jwt(id(1), id(2), true) : "" }) };
    await expect(createHistoryClaimApi(value, () => true, transport).context()).rejects.toMatchObject({ kind: "signed_out" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("fences dispatch and a late JSON completion against the starting credential", async () => {
    let current = false; const body = deferred<unknown>(), transport = vi.fn<typeof fetch>().mockResolvedValue({ status: 200, json: () => body.promise } as Response);
    const api = createHistoryClaimApi(binding, () => current, transport);
    await expect(api.context()).rejects.toMatchObject({ kind: "stale" }); expect(transport).not.toHaveBeenCalled();
    current = true; const result = api.context(); await Promise.resolve(); current = false; body.resolve(context());
    await expect(result).rejects.toMatchObject({ kind: "stale" });
  });
  it("bounds an unconfirmed POST and does not resend it", async () => {
    vi.useFakeTimers(); const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const result = createHistoryClaimApi(binding, () => true, transport).confirm(command());
    const rejected = expect(result).rejects.toMatchObject({ kind: "unavailable" });
    await vi.advanceTimersByTimeAsync(30_000); await rejected;
    expect(transport).toHaveBeenCalledTimes(1); expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("rejects actor fields/invalid inputs without dispatch or a replacement confirmation", async () => {
    const transport = vi.fn<typeof fetch>(), api = createHistoryClaimApi(binding, () => true, transport);
    expect(freezeHistoryConfirmation({ ...command(), actor: id(1) })).toBeNull();
    await expect(api.requestChallenge("XRI-UNKNOWN")).rejects.toMatchObject({ kind: "invalid_claim" });
    await expect(api.confirm({ ...command(), challengeToken: "short" })).rejects.toMatchObject({ kind: "invalid_claim" });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("exact ephemeral email link", () => {
  it("recognizes only the existing exact emailed path and frozen credential", () => {
    const value = parseHistoryClaimLink(HISTORY_CLAIM_PATH, "?claim=" + id(3) + "&token=" + code);
    expect(value).toEqual({ kind: "ready", command: command() });
    if (value.kind === "ready") expect(Object.isFrozen(value.command)).toBe(true);
    expect(historyClaimSession(jwt())).toEqual({ actorAuthUserId: id(1), sessionId: id(2) });
  });
  it.each(["duplicate-claim", "duplicate-token", "unknown", "missing", "short", "fragment", "overlong"])("refuses %s input", kind => {
    let search = "?claim=" + id(3) + "&token=" + code, hash = "";
    if (kind === "duplicate-claim") search += "&claim=" + id(3);
    if (kind === "duplicate-token") search += "&token=" + code;
    if (kind === "unknown") search += "&returnTo=%2Fresearch%2Faccount";
    if (kind === "missing") search = "?claim=" + id(3);
    if (kind === "short") search = "?claim=" + id(3) + "&token=x";
    if (kind === "fragment") hash = "#token=" + code;
    if (kind === "overlong") search += "x".repeat(601);
    expect(parseHistoryClaimLink(HISTORY_CLAIM_PATH, search, hash)).toEqual({ kind: "invalid" });
  });
  it.each(["/research/account", HISTORY_CLAIM_PATH + "/", "/other", "/Research/account/claim-history"])("does not consume %s credentials", path => {
    expect(parseHistoryClaimLink(path, "?claim=" + id(3) + "&token=" + code)).toEqual({ kind: "foreign" });
  });
});
