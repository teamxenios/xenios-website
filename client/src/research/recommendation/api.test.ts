// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_API, type RecommendationReadableAlias } from "@shared/research/referral-v1";
import { captureRecommendation, listReadableAliases, mutateReadableAlias, readableAliasSession, recommendationMemberToken, type ReadableCodeCommand } from "./api";

const auth = vi.hoisted(() => ({ getClient: vi.fn(), getSession: vi.fn() }));
vi.mock("@/lib/supabaseBrowser", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/supabaseBrowser")>(),
  getSupabaseBrowser: auth.getClient,
}));
const token = (method: string) => `synthetic.${btoa(JSON.stringify({ amr: [{ method }] }))}.synthetic`;
beforeEach(() => {
  auth.getClient.mockReset().mockResolvedValue({ auth: { getSession: auth.getSession } });
  auth.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: token("password") } } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, destinationPath: "/care", attribution: "recognized", accountBinding: "bound" }) }));
  window.history.replaceState(null, "", "/");
});

describe("owned readable-code HTTP contracts", () => {
  const actor = "11111111-1111-4111-8111-111111111111";
  const sessionId = "22222222-2222-4222-8222-222222222222";
  const oldId = "33333333-3333-4333-8333-333333333333";
  const newId = "44444444-4444-4444-8444-444444444444";
  const key = "55555555-5555-4555-8555-555555555555";
  const ordinary = `synthetic.${btoa(JSON.stringify({ sub: actor, session_id: sessionId, amr: [{ method: "password" }] }))}.synthetic`;
  const csrf = "C".repeat(43);
  const alias = (id = oldId): RecommendationReadableAlias => ({ code: "SAM-123", assignedAt: "2026-09-04T12:00:00Z", link: {
    id, url: `${location.origin}/r/r1_${"A".repeat(43)}`, destinationPath: "/health", state: "ready",
    createdAt: "2026-09-04T12:00:00Z", expiresAt: "2026-12-04T12:00:00Z", revokedAt: null, opens: 0, accountsLinked: 0,
  } });
  const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const assign: ReadableCodeCommand = Object.freeze({ kind: "assign", code: "SAM-123", linkId: oldId, key });
  const move: ReadableCodeCommand = Object.freeze({ kind: "reassign", code: "SAM-123", expectedLinkId: oldId, linkId: newId, reason: "New campaign destination", key });
  const options = { current: () => true };
  const bootstrap = () => response({ ok: true, csrfToken: csrf });
  function hold<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
  beforeEach(() => {
    vi.mocked(fetch).mockImplementation(async path => path === REFERRAL_API.bootstrap ? bootstrap() as Response
      : response({ ok: true, aliases: [alias()] }) as Response);
  });
  it("reads only the current own projection with the supplied bearer, without SDK or anonymous fallback", async () => {
    expect(await listReadableAliases(ordinary, options)).toEqual({ kind: "ok", data: [alias()] });
    expect(fetch).toHaveBeenCalledWith(REFERRAL_API.readableAliases, expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", headers: { Accept: "application/json", Authorization: `Bearer ${ordinary}` } }));
    expect(auth.getClient).not.toHaveBeenCalled();
  });
  it("waits for the explicit visitor bootstrap, then sends only assignment fields with fixed key and CSRF", async () => {
    const held = hold<Response>(); vi.mocked(fetch).mockReturnValueOnce(held.promise).mockResolvedValueOnce(response({ ok: true, alias: alias(), created: true }) as Response);
    const pending = mutateReadableAlias(ordinary, assign, options);
    expect(fetch).toHaveBeenCalledTimes(1);
    held.resolve(bootstrap() as Response);
    expect(await pending).toEqual({ kind: "ok", data: true });
    const [path, init] = vi.mocked(fetch).mock.calls[1];
    expect(path).toBe(REFERRAL_API.readableAliases);
    expect(JSON.parse(String(init?.body))).toEqual({ code: "SAM-123", linkId: oldId });
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: expect.objectContaining({ Authorization: `Bearer ${ordinary}`, "Idempotency-Key": key, "X-Xenios-Referral-CSRF": csrf }) }));
    expect(auth.getClient).not.toHaveBeenCalled();
  });
  it("uses the actual reassign endpoint and strict CAS/reason body, accepting its recorded flat receipt", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(bootstrap() as Response).mockResolvedValueOnce(response({ ok: true, alias: alias(newId), previousLinkId: oldId, reassignedAt: "2026-09-07T12:00:00Z", replayed: true }) as Response);
    expect(await mutateReadableAlias(ordinary, move, options)).toEqual({ kind: "ok", data: true });
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(REFERRAL_API.reassignReadableAlias);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({ code: "SAM-123", expectedLinkId: oldId, linkId: newId, reason: "New campaign destination" });
  });
  it.each([401, 403, 429, 503])("refuses bootstrap HTTP %s without sending a mutation", async status => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ok: false, code: "secret-provider-detail" }, status) as Response);
    expect(await mutateReadableAlias(ordinary, move, options)).toEqual({ kind: "error", status, code: "request_rejected" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([{ ok: true, csrfToken: "wrong" }, { ok: true, csrfToken: csrf, customer: "private" }, { ok: true }])("rejects malformed bootstrap %# before any command dispatch", async body => {
    vi.mocked(fetch).mockResolvedValueOnce(response(body) as Response);
    expect((await mutateReadableAlias(ordinary, move, options)).kind).toBe("error");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("cannot dispatch after the credential frame retires while bootstrap is held", async () => {
    const held = hold<Response>(); let active = true; vi.mocked(fetch).mockReturnValueOnce(held.promise);
    const pending = mutateReadableAlias(ordinary, move, { current: () => active });
    active = false; held.resolve(bootstrap() as Response);
    expect(await pending).toEqual({ kind: "error", status: 0, code: "operation_retired" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects an old body that finishes JSON parsing after retirement", async () => {
    const held = hold<unknown>(); let active = true;
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: () => held.promise } as Response);
    const pending = listReadableAliases(ordinary, { current: () => active });
    await Promise.resolve(); active = false; held.resolve({ ok: true, aliases: [alias()] });
    expect((await pending).kind).toBe("error");
  });
  it.each([
    { ok: true, aliases: [alias(), alias()] },
    { ok: true, aliases: [{ ...alias(), code: "lower-case" }] },
    { ok: true, aliases: [{ ...alias(), code: null }] },
    { ok: true, aliases: [{ ...alias(), customer: "private" }] },
    { ok: true, aliases: [{ ...alias(), link: { ...alias().link, state: "invented" } }] },
    { ok: true, aliases: [{ ...alias(), link: { ...alias().link, id: "foreign-id" } }] },
    { ok: true, aliases: [], eligible: true },
  ])("rejects malformed/private/duplicate list projection %# rather than displaying an empty list", async body => {
    vi.mocked(fetch).mockResolvedValueOnce(response(body) as Response);
    expect(await listReadableAliases(ordinary, options)).toEqual({ kind: "error", status: 0, code: "invalid_response" });
  });
  it.each([401, 403, 503])("keeps denied/unavailable list HTTP %s distinct from empty", async status => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ok: false }, status) as Response);
    expect(await listReadableAliases(ordinary, options)).toEqual({ kind: "error", status, code: "request_rejected" });
  });
  it.each([
    { ...move, code: "sam-123" }, { ...move, reason: "no" }, { ...move, reason: "\tprivate\nreason" },
    { ...move, reason: "x".repeat(201) }, { ...move, linkId: oldId }, { ...assign, code: "ＳＡＭ" }, { ...assign, key: "not-a-uuid" },
  ] as ReadableCodeCommand[])("refuses invalid command %# without any bootstrap or mutation", async command => {
    expect(await mutateReadableAlias(ordinary, command, options)).toEqual({ kind: "error", status: 400, code: "invalid_input" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { ok: true, alias: alias(), previousLinkId: oldId, reassignedAt: "2026-09-07T12:00:00Z", replayed: false },
    { ok: true, alias: alias(newId), previousLinkId: newId, reassignedAt: "2026-09-07T12:00:00Z", replayed: false },
    { ok: true, alias: { ...alias(newId), code: "FOREIGN" }, previousLinkId: oldId, reassignedAt: "2026-09-07T12:00:00Z", replayed: false },
    { ok: true, value: { alias: alias(newId) } },
  ])("refuses a wrong-command or noncanonical receipt %# as unconfirmed", async body => {
    vi.mocked(fetch).mockResolvedValueOnce(bootstrap() as Response).mockResolvedValueOnce(response(body) as Response);
    expect(await mutateReadableAlias(ordinary, move, options)).toEqual({ kind: "error", status: 0, code: "invalid_response" });
  });
  it("retains the original command bytes and key across a lost-response retry, with a fresh bootstrap", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(bootstrap() as Response).mockRejectedValueOnce(new Error("lost reply"))
      .mockResolvedValueOnce(bootstrap() as Response).mockResolvedValueOnce(response({ ok: true, alias: alias(newId), previousLinkId: oldId, reassignedAt: "2026-09-07T12:00:00Z", replayed: true }) as Response);
    expect((await mutateReadableAlias(ordinary, move, options)).kind).toBe("error");
    expect((await mutateReadableAlias(ordinary, move, options)).kind).toBe("ok");
    const calls = vi.mocked(fetch).mock.calls.filter(([path]) => path === REFERRAL_API.reassignReadableAlias);
    expect(calls).toHaveLength(2); expect(calls[0][1]?.body).toBe(calls[1][1]?.body);
    expect((calls[0][1]?.headers as Record<string, string>)["Idempotency-Key"]).toBe(key);
    expect((calls[1][1]?.headers as Record<string, string>)["Idempotency-Key"]).toBe(key);
  });
  it("bounds an ignored transport at 30 seconds without starting another request", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(() => {}));
      const pending = mutateReadableAlias(ordinary, move, options);
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await pending).kind).toBe("error"); expect(fetch).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("requires a normal actor/session partition and never replaces rejected credentials", async () => {
    expect(readableAliasSession(ordinary)).toBe(`${actor}:${sessionId}`);
    expect(readableAliasSession(token("recovery"))).toBeNull();
    expect(readableAliasSession(token("password"))).toBeNull();
    expect((await listReadableAliases(token("recovery"), options)).kind).toBe("error");
    expect(fetch).not.toHaveBeenCalled(); expect(auth.getClient).not.toHaveBeenCalled();
  });
});
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("recommendation canonical account continuity", () => {
  it("uses the existing normal session for a public recipient's explicit capture", async () => {
    await captureRecommendation(`r1_${"A".repeat(43)}`, "synthetic-csrf");
    expect(auth.getClient).toHaveBeenCalledTimes(1);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(REFERRAL_API.capture, expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${token("password")}`, "X-Xenios-Referral-CSRF": "synthetic-csrf" }) }));
  });
  it.each(["otp", "magiclink", "recovery", "unknown-purpose"])("omits the existing %s session without replacing identity", async method => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: token(method) } } });
    await captureRecommendation(`r1_${"A".repeat(43)}`, "synthetic-csrf");
    expect((vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it("never initializes auth from a recovery-marked URL", async () => {
    window.history.replaceState(null, "", "/#type=recovery&access_token=synthetic-recovery");
    expect(await recommendationMemberToken()).toBeNull();
    expect(auth.getClient).not.toHaveBeenCalled();
  });
  it("does not replace an explicitly supplied principal with a different persisted account", async () => {
    expect(await recommendationMemberToken("synthetic-explicit-member")).toBe("synthetic-explicit-member");
    expect(auth.getClient).not.toHaveBeenCalled();
    expect(await recommendationMemberToken(token("recovery"))).toBeNull();
    expect(await recommendationMemberToken(null)).toBeNull();
    expect(auth.getClient).not.toHaveBeenCalled();
  });
  it("treats unconfigured, signed-out, and failed canonical session reads as anonymous", async () => {
    auth.getClient.mockResolvedValueOnce(null);
    expect(await recommendationMemberToken()).toBeNull();
    auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    expect(await recommendationMemberToken()).toBeNull();
    auth.getSession.mockRejectedValueOnce(new Error("unavailable"));
    expect(await recommendationMemberToken()).toBeNull();
  });
});
