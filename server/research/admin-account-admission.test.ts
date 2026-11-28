import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountReadAuthority, type AccountReadScope } from "./admin-accounts/authority";
import { createAdminAccountService, type AccountDirectoryReader } from "./admin-accounts/service";
import { isRecoveryPurposeSession } from "./member-auth";
import { ADMIN_ACCOUNT_DENIED_AUDIT_RATE_LIMIT_RPC, ADMIN_ACCOUNT_DENIED_AUDIT_WINDOW_SECONDS, ADMIN_ACCOUNT_DENIED_AUDIT_MAXIMUM, ADMIN_ACCOUNT_READ_CURRENT_RPC, ADMIN_ACCOUNT_READ_ENABLED_ENV, buildCanonicalAdminAccountAdmission, createAdminAccountAdmission,
  type AdminAccountAdmissionPorts } from "./admin-account-admission";

const sdk = vi.hoisted(() => ({ anon: vi.fn(), admin: vi.fn(), identity: vi.fn(), configured: vi.fn() }));
vi.mock("../supabase", () => ({ getSupabaseAnon: sdk.anon, getSupabaseAdmin: sdk.admin,
  getSupabaseConnectionIdentity: sdk.identity, supabaseConfigured: sdk.configured }));

const projectUrl = "https://account-fixture.supabase.co";
const actorId = "11111111-1111-4111-8111-111111111111";
const otherActor = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const targetId = "44444444-4444-4444-8444-444444444444";
const otherTarget = "55555555-5555-4555-8555-555555555555";
const requestId = "66666666-6666-4666-8666-666666666666";
const instant = 1_800_000_000_000;
/** Auth verification is an explicit controlled port here; these are not genuinely signed provider JWTs. */
function token(patch: Record<string, unknown> = {}) {
  const claims = { iss: projectUrl + "/auth/v1", aud: "authenticated", role: "authenticated", sub: actorId,
    session_id: sessionId, aal: "aal2", is_anonymous: false, exp: instant / 1000 + 1200, iat: instant / 1000,
    amr: [{ method: "password", timestamp: instant / 1000 - 7200 }, { method: "totp", timestamp: instant / 1000 - 30 }], ...patch };
  return Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "."
    + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".fixture-signature";
}
function detailScope(id = targetId): AccountReadScope {
  return { actorId, capability: "accountRead", operation: "detail", targetId: id };
}
function fixture() {
  let clock = instant;
  const ports: AdminAccountAdmissionPorts = {
    projectUrl, ready: vi.fn(() => true),
    connection: vi.fn(() => ({ configuredUrl: projectUrl, anonUrl: projectUrl, adminUrl: projectUrl })),
    authenticate: vi.fn<AdminAccountAdmissionPorts["authenticate"]>(async () => ({ id: actorId })),
    currentAssurance: vi.fn<AdminAccountAdmissionPorts["currentAssurance"]>(async () => "aal2"),
    current: vi.fn<AdminAccountAdmissionPorts["current"]>(async () => true),
    allowDeniedAudit: vi.fn<AdminAccountAdmissionPorts['allowDeniedAudit']>(async () => true),
    audit: { appendAccessAudit: vi.fn(async () => undefined) }, now: () => clock, requestId: () => requestId,
  };
  const binding = createAdminAccountAdmission(ports);
  const deps = { available: binding.ready, verifyIdentity: ports.authenticate, isRecovery: isRecoveryPurposeSession, admission: binding.admission };
  const reader: AccountDirectoryReader = {
    list: vi.fn<AccountDirectoryReader["list"]>(async query => ({ ok: true, kind: "CANONICAL_AUTH_ACCOUNT_PAGE_V1", accounts: [],
      page: query.page, perPage: query.perPage, total: 0, nextPage: null })),
    detail: vi.fn<AccountDirectoryReader["detail"]>(async id => ({ userId: id, emailHint: null, displayLabel: null,
      displayLabelSource: "user_supplied_not_authority", emailConfirmation: "no_email", pendingEmailChange: false,
      lastSignInAt: null, providerBan: "not_reported" })),
  };
  return { ports, binding, reader, authority: createAccountReadAuthority(deps),
    service: createAdminAccountService({ ...deps, reader }), advance: (milliseconds: number) => { clock += milliseconds; } };
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Root canonical super-admin account-read admission", () => {
  it("completes the real U3 directory path only through current authority and the existing awaited audit port", async () => {
    const f = fixture();
    await expect(f.service.list(token(), {})).resolves.toMatchObject({ total: 0, accounts: [] });
    expect(f.ports.current).toHaveBeenCalledWith(actorId, sessionId);
    expect(vi.mocked(f.ports.current).mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(f.ports.allowDeniedAudit).not.toHaveBeenCalled();
    expect(vi.mocked(f.ports.current).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(f.reader.list).mock.invocationCallOrder[0]);
    expect(vi.mocked(f.reader.list).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(f.ports.audit.appendAccessAudit).mock.invocationCallOrder[0]);
    expect(f.ports.audit.appendAccessAudit).toHaveBeenCalledExactlyOnceWith({ authUserId: actorId,
      routeGroup: "/api/admin/research/accounts", role: "super_admin", decision: "allowed",
      reasonCode: "account_read_directory_provided", requestId, seedNamespace: null, occurredAt: new Date(instant) });
  });
  it("binds a detail read and minimal audit to the exact canonical target UUID", async () => {
    const f = fixture();
    await expect(f.service.detail(token(), targetId)).resolves.toMatchObject({ account: { userId: targetId } });
    expect(f.reader.detail).toHaveBeenCalledExactlyOnceWith(targetId);
    const event = vi.mocked(f.ports.audit.appendAccessAudit).mock.calls[0][0];
    expect(event).toEqual({ authUserId: actorId, routeGroup: "/api/admin/research/accounts/" + targetId,
      role: "super_admin", decision: "allowed", reasonCode: "account_read_detail_provided",
      requestId, seedNamespace: null, occurredAt: new Date(instant) });
    expect(JSON.stringify(event)).not.toContain(token());
  });
  it("keeps the real U3 instance-local principal fence for a different target or forged principal", async () => {
    const f = fixture(), principal = await f.authority.authorize(token(), "detail", targetId);
    await expect(f.authority.requireCurrent(principal, "detail", otherTarget)).rejects.toMatchObject({ code: "account_read_denied" });
    await expect(f.authority.requireCurrent({ ...principal }, "detail", targetId)).rejects.toMatchObject({ code: "account_read_denied" });
    expect(f.reader.detail).not.toHaveBeenCalled();
  });
  it("refuses a different verified actor and malformed operation/target binding before the current-session RPC", async () => {
    const f = fixture();
    await expect(f.binding.admission.admit({ ...detailScope(), actorId: otherActor, token: token() })).resolves.toBeNull();
    await expect(f.binding.admission.admit({ actorId, capability: "accountRead", operation: "directory", targetId, token: token() })).resolves.toBeNull();
    expect(f.ports.current).not.toHaveBeenCalled();
  });
  it.each([
    ["stale factor", instant / 1000 - 301], ["future factor", instant / 1000 + 1],
    ["fractional factor", instant / 1000 - 0.5], ["missing factor timestamp", undefined],
  ] as const)("refuses %s even when iat is fresh and the canonical RPC would allow", async (_name, timestamp) => {
    const f = fixture();
    const bearer = token({ amr: [{ method: "password", timestamp: instant / 1000 }, { method: "totp", timestamp }] });
    await expect(f.binding.admission.admit({ ...detailScope(), token: bearer })).resolves.toBeNull();
    expect(f.ports.current).not.toHaveBeenCalled();
  });
  it("allows the exact 300-second boundary and refuses it on the next currentness check after that bound", async () => {
    const f = fixture(), bearer = token({ amr: [{ method: "password", timestamp: instant / 1000 - 800 },
      { method: "totp", timestamp: instant / 1000 - 300 }] });
    const lease = await f.binding.admission.admit({ ...detailScope(), token: bearer });
    expect(lease).not.toBeNull(); f.advance(1);
    await expect(lease!.isCurrent()).resolves.toBe(false);
  });
  it.each([
    ["recovery", { amr: [{ method: "recovery", timestamp: instant / 1000 }, { method: "totp", timestamp: instant / 1000 }] }],
    ["wrong issuer", { iss: "https://foreign.supabase.co/auth/v1" }], ["wrong subject", { sub: otherActor }],
    ["expired", { exp: instant / 1000 }], ["anonymous", { is_anonymous: true }],
    ["token AAL1", { aal: "aal1" }], ["missing session", { session_id: undefined }],
    ["no factor event", { amr: [{ method: "password", timestamp: instant / 1000 }] }],
  ] as const)("refuses %s from the otherwise authenticated token without borrowing privilege", async (_name, patch) => {
    const f = fixture();
    await expect(f.binding.admission.admit({ ...detailScope(), token: token(patch) })).resolves.toBeNull();
    expect(f.ports.current).not.toHaveBeenCalled();
  });
  it("refuses assurance-port AAL1 even when verified-token claims report AAL2", async () => {
    const f = fixture(); vi.mocked(f.ports.currentAssurance).mockResolvedValue("aal1");
    await expect(f.service.detail(token(), targetId)).rejects.toMatchObject({ code: "account_read_denied" });
    expect(f.reader.detail).not.toHaveBeenCalled();
    expect(f.ports.audit.appendAccessAudit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ role: null,
      decision: 'denied', reasonCode: 'account_read_fresh_totp_required' }));
  });
  it("withholds a result when the role/session RPC reports revocation during the provider read", async () => {
    const f = fixture();
    vi.mocked(f.reader.list).mockImplementation(async query => {
      vi.mocked(f.ports.current).mockResolvedValue(false);
      return { ok: true, kind: "CANONICAL_AUTH_ACCOUNT_PAGE_V1", accounts: [], page: query.page, perPage: query.perPage, total: 0, nextPage: null };
    });
    await expect(f.service.list(token(), {})).rejects.toMatchObject({ code: "account_read_denied" });
    expect(f.ports.audit.appendAccessAudit).not.toHaveBeenCalled();
  });
  it("refuses a changed canonical actor during an issued lease currentness check", async () => {
    const f = fixture(), lease = await f.binding.admission.admit({ ...detailScope(), token: token() });
    vi.mocked(f.ports.authenticate).mockResolvedValue({ id: otherActor });
    await expect(lease!.isCurrent()).resolves.toBe(false);
  });
  it("does not let mutation of the input carrier replace the token captured by an issued lease", async () => {
    const f = fixture(), original = token(), input = { ...detailScope(), token: original };
    const lease = await f.binding.admission.admit(input);
    input.token = token({ session_id: otherActor });
    await expect(lease!.isCurrent()).resolves.toBe(true);
    expect(f.ports.authenticate).toHaveBeenLastCalledWith(original);
  });
  it.each([{ data: null }, { data: "true" }, { data: {} }, { data: [] }, { data: 1 }])("refuses malformed RPC data $data rather than treating it as authority", async ({ data }) => {
    const f = fixture(); vi.mocked(f.ports.current).mockResolvedValue(data);
    await expect(f.service.list(token(), {})).rejects.toMatchObject({ code: "account_read_unavailable" });
    expect(f.reader.list).not.toHaveBeenCalled();
  });
  it("refuses false or failed session authority before any target account read", async () => {
    const f = fixture(); vi.mocked(f.ports.current).mockResolvedValue(false);
    await expect(f.service.list(token(), {})).rejects.toMatchObject({ code: "account_read_denied" });
    expect(f.reader.list).not.toHaveBeenCalled();
    vi.mocked(f.ports.current).mockRejectedValue(new Error("missing RPC with private provider detail"));
    await expect(f.service.list(token(), {})).rejects.toMatchObject({ code: "account_read_unavailable", message: "account_read_unavailable" });
    expect(f.reader.list).not.toHaveBeenCalled();
  });
  it("withholds data on an audit failure and never returns the provider error text", async () => {
    const f = fixture(); vi.mocked(f.ports.audit.appendAccessAudit).mockRejectedValue(new Error("private provider detail"));
    await expect(f.service.detail(token(), targetId)).rejects.toMatchObject({ code: "account_read_unavailable", message: "account_read_unavailable" });
    expect(f.reader.detail).toHaveBeenCalledOnce();
  });
  it("audits an authorized not-found outcome without fabricating an account or dropping its target", async () => {
    const f = fixture(); vi.mocked(f.reader.detail).mockResolvedValue(null);
    await expect(f.service.detail(token(), targetId)).rejects.toMatchObject({ code: "account_not_found" });
    expect(f.ports.audit.appendAccessAudit).toHaveBeenCalledWith(expect.objectContaining({
      routeGroup: "/api/admin/research/accounts/" + targetId, reasonCode: "account_read_detail_not_found" }));
  });
  it("denies an unavailable or drifted canonical connection before authentication and target reads", async () => {
    const f = fixture(); vi.mocked(f.ports.connection).mockReturnValue({ configuredUrl: projectUrl,
      anonUrl: "https://foreign.supabase.co", adminUrl: projectUrl });
    await expect(f.service.list(token(), {})).rejects.toMatchObject({ code: "account_read_unavailable" });
    expect(f.ports.authenticate).not.toHaveBeenCalled(); expect(f.reader.list).not.toHaveBeenCalled();
  });
  it('audits one verified directory role-or-session refusal with no invented role or account read', async () => {
    const f = fixture(); vi.mocked(f.ports.current).mockResolvedValue(false);
    await expect(f.service.list(token(), {})).rejects.toMatchObject({ code: 'account_read_denied' });
    expect(f.ports.allowDeniedAudit).toHaveBeenCalledExactlyOnceWith(actorId);
    expect(f.ports.audit.appendAccessAudit).toHaveBeenCalledExactlyOnceWith({ authUserId: actorId,
      routeGroup: '/api/admin/research/accounts', role: null, decision: 'denied',
      reasonCode: 'account_read_authority_required', requestId, seedNamespace: null, occurredAt: new Date(instant) });
    expect(f.reader.list).not.toHaveBeenCalled();
    const nearExpiry = fixture();
    vi.mocked(nearExpiry.ports.current).mockImplementation(async () => { nearExpiry.advance(2_000); return false; });
    await expect(nearExpiry.service.list(token({ exp: instant / 1000 + 1 }), {})).rejects.toMatchObject({ code: 'account_read_denied' });
    expect(nearExpiry.ports.audit.appendAccessAudit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      authUserId: actorId, role: null, decision: 'denied', reasonCode: 'account_read_authority_required' }));
    expect(nearExpiry.reader.list).not.toHaveBeenCalled();
  });
  it('binds a denied detail record to the verified actor and validated requested target only', async () => {
    const f = fixture(); vi.mocked(f.ports.current).mockResolvedValue(false);
    await expect(f.service.detail(token(), targetId.toUpperCase())).rejects.toMatchObject({ code: 'account_read_denied' });
    const event = vi.mocked(f.ports.audit.appendAccessAudit).mock.calls[0][0];
    expect(event).toEqual({ authUserId: actorId, routeGroup: '/api/admin/research/accounts/' + targetId,
      role: null, decision: 'denied', reasonCode: 'account_read_authority_required', requestId,
      seedNamespace: null, occurredAt: new Date(instant) });
    expect(JSON.stringify(event)).not.toContain(token()); expect(JSON.stringify(event)).not.toContain('email');
    expect(f.reader.detail).not.toHaveBeenCalled();
  });
  it('audits a matching verified ordinary actor whose TOTP event is stale without querying account authority', async () => {
    const f = fixture(), bearer = token({ amr: [{ method: 'password', timestamp: instant / 1000 - 600 },
      { method: 'totp', timestamp: instant / 1000 - 301 }] });
    await expect(f.service.detail(bearer, targetId)).rejects.toMatchObject({ code: 'account_read_denied' });
    expect(f.ports.audit.appendAccessAudit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ authUserId: actorId,
      role: null, decision: 'denied', reasonCode: 'account_read_fresh_totp_required' }));
    expect(f.ports.current).not.toHaveBeenCalled(); expect(f.reader.detail).not.toHaveBeenCalled();
  });
  it('audits insufficient first-factor-only assurance without treating it as account-read authority', async () => {
    for (const aal of ['aal1', undefined]) {
      const f = fixture(), bearer = token({ aal, amr: [{ method: 'password', timestamp: instant / 1000 }] });
      await expect(f.service.list(bearer, {})).rejects.toMatchObject({ code: 'account_read_denied' });
      expect(f.ports.audit.appendAccessAudit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ role: null,
        decision: 'denied', reasonCode: 'account_read_fresh_totp_required' }));
      expect(f.ports.currentAssurance).not.toHaveBeenCalled(); expect(f.ports.current).not.toHaveBeenCalled();
      expect(f.reader.list).not.toHaveBeenCalled();
    }
  });
  it('creates no victim audit or budget key when the canonical verifier returns no user or fails', async () => {
    const absent = fixture(); vi.mocked(absent.ports.authenticate).mockResolvedValue(null);
    await expect(absent.binding.admission.admit({ ...detailScope(), token: 'unsigned.invalid.carrier' })).resolves.toBeNull();
    expect(absent.ports.allowDeniedAudit).not.toHaveBeenCalled(); expect(absent.ports.audit.appendAccessAudit).not.toHaveBeenCalled();
    const failed = fixture(); vi.mocked(failed.ports.authenticate).mockRejectedValue(new Error('private Auth verifier error'));
    await expect(failed.binding.admission.admit({ ...detailScope(), token: token() })).rejects.toMatchObject({
      code: 'account_read_unavailable', message: 'account_read_unavailable' });
    expect(failed.ports.allowDeniedAudit).not.toHaveBeenCalled(); expect(failed.ports.audit.appendAccessAudit).not.toHaveBeenCalled();
  });
  it('creates no victim log for cross-actor cross-subject foreign-issuer or malformed-scope carriers', async () => {
    const inputs = [
      { ...detailScope(), actorId: otherActor, token: token({ aal: 'aal1' }) },
      { ...detailScope(), token: token({ sub: otherActor, aal: 'aal1' }) },
      { ...detailScope(), token: token({ iss: 'https://foreign.supabase.co/auth/v1', aal: 'aal1' }) },
      { ...detailScope(), targetId: 'not-a-uuid', token: token({ aal: 'aal1' }) },
    ];
    for (const input of inputs) {
      const f = fixture(); await expect(f.binding.admission.admit(input)).resolves.toBeNull();
      expect(f.ports.allowDeniedAudit).not.toHaveBeenCalled(); expect(f.ports.audit.appendAccessAudit).not.toHaveBeenCalled();
      expect(f.ports.current).not.toHaveBeenCalled();
    }
  });
  it.each(['false', 'error', 'nonboolean'] as const)('withholds denial as unavailable when durable audit budget is %s', async mode => {
    const f = fixture(); vi.mocked(f.ports.current).mockResolvedValue(false);
    if (mode === 'error') vi.mocked(f.ports.allowDeniedAudit).mockRejectedValue(new Error('private durable quota error'));
    else vi.mocked(f.ports.allowDeniedAudit).mockResolvedValue(mode === 'nonboolean' ? 'true' as unknown as boolean : false);
    await expect(f.service.list(token(), {})).rejects.toMatchObject({ code: 'account_read_unavailable', message: 'account_read_unavailable' });
    expect(f.ports.audit.appendAccessAudit).not.toHaveBeenCalled(); expect(f.reader.list).not.toHaveBeenCalled();
  });
  it('withholds eligible denied access when the awaited existing audit sink fails without leaking its error', async () => {
    const f = fixture(); vi.mocked(f.ports.current).mockResolvedValue(false);
    vi.mocked(f.ports.audit.appendAccessAudit).mockRejectedValue(new Error('private denied audit failure'));
    await expect(f.service.detail(token(), targetId)).rejects.toMatchObject({ code: 'account_read_unavailable', message: 'account_read_unavailable' });
    expect(f.ports.allowDeniedAudit).toHaveBeenCalledOnce(); expect(f.ports.audit.appendAccessAudit).toHaveBeenCalledOnce();
    expect(f.reader.detail).not.toHaveBeenCalled();
  });
  it('keeps closed readiness inert before verification quota or denied-audit work', async () => {
    const f = fixture(); vi.mocked(f.ports.ready).mockReturnValue(false);
    await expect(f.service.list(token(), {})).rejects.toMatchObject({ code: 'account_read_unavailable' });
    expect(f.ports.authenticate).not.toHaveBeenCalled(); expect(f.ports.currentAssurance).not.toHaveBeenCalled();
    expect(f.ports.current).not.toHaveBeenCalled(); expect(f.ports.allowDeniedAudit).not.toHaveBeenCalled();
    expect(f.ports.audit.appendAccessAudit).not.toHaveBeenCalled(); expect(f.reader.list).not.toHaveBeenCalled();
  });
  it("does not renew factor age during a slow true RPC", async () => {
    const f = fixture(); vi.mocked(f.ports.current).mockImplementation(async () => { f.advance(301_000); return true; });
    await expect(f.binding.admission.admit({ ...detailScope(), token: token() })).resolves.toBeNull();
  });
  it("rejects extra audit fields and invalid directory not-found without writing them", async () => {
    const f = fixture();
    await expect(f.binding.admission.audit({ ...detailScope(), outcome: "provided", email: "fixture@example.invalid" } as Parameters<typeof f.binding.admission.audit>[0])).rejects.toMatchObject({ code: "account_read_unavailable" });
    await expect(f.binding.admission.audit({ actorId, capability: "accountRead", operation: "directory", targetId: null,
      outcome: "not_found" })).rejects.toMatchObject({ code: "account_read_unavailable" });
    expect(f.ports.audit.appendAccessAudit).not.toHaveBeenCalled();
  });
});

describe("canonical singleton binding", () => {
  function setup() {
    vi.stubEnv("SUPABASE_URL", projectUrl);
    vi.stubEnv(ADMIN_ACCOUNT_READ_ENABLED_ENV, "true");
    vi.spyOn(Date, "now").mockReturnValue(instant);
    const identity: { configuredUrl: string | null; anonUrl: string | null; adminUrl: string | null } = {
      configuredUrl: projectUrl, anonUrl: projectUrl, adminUrl: projectUrl };
    sdk.identity.mockReturnValue(identity); sdk.configured.mockReturnValue(true);
    const getUser = vi.fn(async () => ({ data: { user: { id: actorId } }, error: null }));
    const assurance = vi.fn(async () => ({ data: { currentLevel: "aal2" }, error: null }));
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: true as unknown, error: null as unknown }));
    const listUsers = vi.fn(), getUserById = vi.fn();
    sdk.anon.mockReturnValue({ auth: { getUser, mfa: { getAuthenticatorAssuranceLevel: assurance } } });
    sdk.admin.mockReturnValue({ rpc, auth: { admin: { listUsers, getUserById } } });
    const audit = { appendAccessAudit: vi.fn(async () => undefined) };
    return { identity, getUser, assurance, rpc, audit, listUsers, getUserById };
  }
  it("does not construct clients at composition and invokes only the exact neutral RPC after canonical verification", async () => {
    const f = setup(), binding = buildCanonicalAdminAccountAdmission({ projectUrl, ready: () => true, audit: f.audit });
    expect(sdk.anon).not.toHaveBeenCalled(); expect(sdk.admin).not.toHaveBeenCalled();
    const lease = await binding.admission.admit({ ...detailScope(), token: token() });
    expect(lease).not.toBeNull();
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith(ADMIN_ACCOUNT_READ_CURRENT_RPC, { p_actor_user_id: actorId, p_session_id: sessionId });
    expect(f.getUser.mock.invocationCallOrder[0]).toBeLessThan(f.rpc.mock.invocationCallOrder[0]);
  });
  it("requires the explicit rollout switch as well as reviewed readiness, without constructing a client", async () => {
    const f = setup(); vi.stubEnv(ADMIN_ACCOUNT_READ_ENABLED_ENV, "false");
    const binding = buildCanonicalAdminAccountAdmission({ projectUrl, ready: () => true, audit: f.audit });
    await expect(binding.admission.admit({ ...detailScope(), token: token() })).rejects.toMatchObject({ code: "account_read_unavailable" });
    expect(sdk.anon).not.toHaveBeenCalled(); expect(sdk.admin).not.toHaveBeenCalled();
  });
  it("refuses a cold admin singleton instead of starting its Auth admin key self-check on a denied request", async () => {
    const f = setup(); f.identity.adminUrl = null;
    // Sentinel for the existing factory's cold-constructor listUsers self-check;
    // invoking this getter would be an unwanted read, not a mocked authority.
    const listUsers = vi.fn();
    sdk.admin.mockImplementation(() => { listUsers(); return { rpc: f.rpc }; });
    const binding = buildCanonicalAdminAccountAdmission({ projectUrl, ready: () => true, audit: f.audit });
    expect(binding.ready()).toBe(false);
    await expect(binding.admission.admit({ ...detailScope(), token: token() })).rejects.toMatchObject({ code: "account_read_unavailable" });
    expect(sdk.anon).not.toHaveBeenCalled(); expect(sdk.admin).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("refuses a lost admin cache on a previously issued lease before any new SDK or health-read call", async () => {
    const f = setup(), listUsers = vi.fn();
    sdk.admin.mockImplementation(() => {
      if (f.identity.adminUrl === null) listUsers();
      return { rpc: f.rpc };
    });
    const binding = buildCanonicalAdminAccountAdmission({ projectUrl, ready: () => true, audit: f.audit });
    const lease = await binding.admission.admit({ ...detailScope(), token: token() });
    expect(lease).not.toBeNull();
    vi.clearAllMocks(); f.identity.adminUrl = null;
    expect(binding.ready()).toBe(false);
    await expect(lease!.isCurrent()).rejects.toMatchObject({ code: "account_read_unavailable" });
    expect(sdk.anon).not.toHaveBeenCalled(); expect(sdk.admin).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("keeps unavailable composition inert and rejects an admin singleton from another project", async () => {
    const f = setup(), closed = buildCanonicalAdminAccountAdmission({ projectUrl, ready: () => false, audit: f.audit });
    await expect(closed.admission.admit({ ...detailScope(), token: token() })).rejects.toMatchObject({ code: "account_read_unavailable" });
    expect(sdk.anon).not.toHaveBeenCalled(); expect(sdk.admin).not.toHaveBeenCalled();
    f.identity.adminUrl = "https://foreign.supabase.co";
    const wrong = buildCanonicalAdminAccountAdmission({ projectUrl, ready: () => true, audit: f.audit });
    await expect(wrong.admission.admit({ ...detailScope(), token: token() })).rejects.toMatchObject({ code: "account_read_unavailable" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('uses only the existing canonical durable limiter RPC with an opaque actor key before one denied audit', async () => {
    const f = setup();
    f.rpc.mockImplementation(async (name: string) => ({ data: name === ADMIN_ACCOUNT_READ_CURRENT_RPC ? false : true, error: null }));
    const binding = buildCanonicalAdminAccountAdmission({ projectUrl, ready: () => true, audit: f.audit });
    await expect(binding.admission.admit({ ...detailScope(), token: token() })).resolves.toBeNull();
    expect(f.rpc).toHaveBeenCalledWith(ADMIN_ACCOUNT_DENIED_AUDIT_RATE_LIMIT_RPC, {
      p_key: 'admin-account-read-denial:bd7662a5eeb41614e720d477abfcb2272e19a8a70a93b7e3bc8560d44ad326e9', p_window_seconds: ADMIN_ACCOUNT_DENIED_AUDIT_WINDOW_SECONDS,
      p_max_hits: ADMIN_ACCOUNT_DENIED_AUDIT_MAXIMUM });
    expect(f.audit.appendAccessAudit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ role: null, decision: 'denied' }));
    expect(f.rpc.mock.invocationCallOrder.at(-1)).toBeLessThan(f.audit.appendAccessAudit.mock.invocationCallOrder[0]);
    const budget = f.rpc.mock.calls.find(call => call[0] === ADMIN_ACCOUNT_DENIED_AUDIT_RATE_LIMIT_RPC)![1];
    expect(JSON.stringify(budget)).not.toContain(actorId); expect(JSON.stringify(budget)).not.toContain(token());
    expect(f.listUsers).not.toHaveBeenCalled(); expect(f.getUserById).not.toHaveBeenCalled();
  });
  it('refuses malformed or failed canonical budget RPC without a denial write target read or private error', async () => {
    const f = setup(); let budgetResult: { data: unknown; error: unknown } = { data: 'true', error: null };
    f.rpc.mockImplementation(async (name: string) => name === ADMIN_ACCOUNT_DENIED_AUDIT_RATE_LIMIT_RPC
      ? budgetResult : { data: false, error: null });
    const binding = buildCanonicalAdminAccountAdmission({ projectUrl, ready: () => true, audit: f.audit });
    for (const result of [{ data: 'true', error: null }, { data: null, error: new Error('private budget RPC failure') }]) {
      budgetResult = result;
      await expect(binding.admission.admit({ ...detailScope(), token: token() })).rejects.toMatchObject({
        code: 'account_read_unavailable', message: 'account_read_unavailable' });
    }
    expect(f.audit.appendAccessAudit).not.toHaveBeenCalled(); expect(f.listUsers).not.toHaveBeenCalled(); expect(f.getUserById).not.toHaveBeenCalled();
  });

});
