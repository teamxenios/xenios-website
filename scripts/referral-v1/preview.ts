/** LOCAL-ONLY browser rehearsal. Real Gen2 SQL/controller/guards; synthetic Auth,
 * application and request/order fixtures. Never a deployable server or email test.
 */
import express, { type Request } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import type { Server } from "node:http";
import { startReferralRehearsalDatabase } from "../../server/research/partners/referral-v1-rehearsal";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const origin = "http://127.0.0.1:5238";
const password = "Synthetic-preview-password-2026";
const anonKey = "synthetic-preview-anon-key";
const serviceKey = "synthetic-preview-service-key-never-production";
type Persona = { email: string; password: string; authId: string; memberId?: string; partnerId?: string; token: string; refresh: string };

export async function startReferralPreview() {
  if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY) {
    throw new Error("Referral preview refuses production mode or inherited provider credentials");
  }
  if (process.env.XR_REFERRAL_PREVIEW_PORT && process.env.XR_REFERRAL_PREVIEW_PORT !== "5238") throw new Error("Preview port must be loopback 5238");
  const runtimePath = process.env.XR_REFERRAL_V1_PG_RUNTIME ?? process.env.XENIOS_REFERRAL_V1_WSL_RUNTIME;
  const keep = new Set(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "APPDATA", "PATHEXT", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS"]);
  for (const key of Object.keys(process.env)) if (!keep.has(key.toUpperCase())) delete process.env[key];
  const secret = randomBytes(32).toString("base64url");
  Object.assign(process.env, {
    NODE_ENV: "development", SITE_URL: origin, SUPABASE_URL: `${origin}/preview-supabase`,
    SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    ADMIN_EMAIL: "admin@preview.invalid", RESEARCH_PUBLIC: "false",
    RESEARCH_ACCESS_PASSWORD: "synthetic-review-only", RESEARCH_SESSION_SECRET: randomBytes(32).toString("base64url"),
    AFFILIATE_SYSTEM_ENABLED: "true", AFFILIATE_PORTAL_ENABLED: "true", AFFILIATE_CODES_ENABLED: "true",
    RESEARCH_REFERRAL_V1_ENABLED: "true", RESEARCH_PARTNER_LINK_SECRET: secret,
    AFFILIATE_CODE_UNLOCKS_EARLY_ACCESS: "false", RESEARCH_REFERRALS_ENABLED: "false",
  });

  let outboundAttemptsDenied = 0;
  let ownedDatabasePort: number | null = null;
  const rawFetch = globalThis.fetch.bind(globalThis);
  const originalConnect = net.Socket.prototype.connect;
  const localHost = (host: unknown) => typeof host === "string" && ["127.0.0.1", "localhost", "::1"].includes(host);
  globalThis.fetch = (async (input: string | URL | globalThis.Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== origin) { outboundAttemptsDenied++; throw new Error("Preview external fetch denied"); }
    return rawFetch(input, init);
  }) as typeof fetch;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: any[]) {
    const normalized = Array.isArray(args[0]) ? args[0] : args;
    const options = normalized[0];
    const host = typeof options === "object" ? options.host ?? "localhost" : normalized[1] ?? "localhost";
    const port = Number(typeof options === "object" ? options.port : options);
    if (!localHost(host) || !Number.isInteger(port) || port !== 5238 && port !== ownedDatabasePort || typeof options === "string" && !/^\d+$/.test(options)) {
      outboundAttemptsDenied++; throw new Error("Preview external socket denied");
    }
    return originalConnect.apply(this, args as any);
  } as typeof originalConnect;

  const db = await startReferralRehearsalDatabase({ root, runtimePath, onPortReady: (port) => { ownedDatabasePort = port; } }).catch((error) => {
    globalThis.fetch = rawFetch;
    net.Socket.prototype.connect = originalConnect;
    throw error;
  });
  let server: Server | null = null;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (server) await new Promise<void>((resolve) => { server!.closeAllConnections(); server!.close(() => resolve()); });
    try { await db.stop(); }
    finally {
      globalThis.fetch = rawFetch;
      net.Socket.prototype.connect = originalConnect;
    }
  };
  try {
    // Real canonical limiter SQL; provider transport alone is synthetic.
    const fraudSql = readFileSync(path.join(root, "supabase/research-referral-fraud.sql"), "utf8");
    const rateStart = fraudSql.indexOf("create table if not exists public.research_rate_limits (");
    const rateEnd = fraudSql.indexOf("end $$;", rateStart) + "end $$;".length;
    if (rateStart < 0 || rateEnd < rateStart) throw new Error("Canonical rate-limit source missing");
    await db.sql(fraudSql.slice(rateStart, rateEnd));
    await db.sql("alter table public.research_rate_limits enable row level security; grant select,insert,update,delete on public.research_rate_limits to service_role; grant execute on function public.research_rate_limit_hit(text,integer,integer) to service_role");
    // Only the application/Auth transport is synthetic. The member row and exact
    // Auth UUID ownership are still persisted/read by the production member guard.
    await db.sql("alter table public.research_applications add column email text, add column first_name text, add column status text, add column source_page text, add column submitted_at timestamptz default now(), add column approval_expires_at timestamptz; alter table public.research_members add column billing_state text");
    const personas = new Map<string, Persona>();
    const tokens = new Map<string, { persona: Persona; recovery: boolean }>();
    const makeToken = (authId: string, recovery = false) => [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: authId, aud: "authenticated", role: "authenticated", amr: [{ method: recovery ? "otp" : "password" }], exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"),
      randomBytes(32).toString("base64url"),
    ].join(".");
    const addPersona = (email: string, authId: string, extras: Partial<Persona> = {}) => {
      const persona: Persona = { email, authId, password, token: makeToken(authId), refresh: `synthetic-refresh-${randomUUID()}`, ...extras };
      personas.set(email, persona); tokens.set(persona.token, { persona, recovery: false }); return persona;
    };
    const fixture = async (name: string) => {
      const seeded = name === "owner" ? await db.seedPartner() : await (async () => {
        const actorAuthUserId = randomUUID(), memberId = randomUUID(), applicationId = randomUUID();
        await db.sql("insert into public.research_applications(id) values($1)", [applicationId]);
        await db.sql("insert into public.research_members(id,application_id,auth_user_id,email,first_name,status) values($1,$2,$3,$4,$5,'active')", [memberId, applicationId, actorAuthUserId, `${name}@preview.invalid`, `Synthetic ${name}`]);
        return { actorAuthUserId, memberId };
      })();
      const persona = addPersona(`${name}@preview.invalid`, seeded.actorAuthUserId, seeded);
      await db.sql("update public.research_members set email=$1,first_name=$2,billing_state='active' where id=$3", [persona.email, `Synthetic ${name}`, seeded.memberId]);
      await db.sql("update public.research_applications a set email=$1,first_name=$2,status='active' from public.research_members m where m.id=$3 and a.id=m.application_id", [persona.email, `Synthetic ${name}`, seeded.memberId]);
      return persona;
    };
    const owner = await fixture("owner"), recipient = await fixture("recipient"), admin = await fixture("admin");
    const recoveryPersona = await fixture("recovery");
    const recoveryToken = makeToken(recoveryPersona.authId, true);
    tokens.set(recoveryToken, { persona: recoveryPersona, recovery: true });
    const claimId = randomUUID(), claimEmail = "claim@preview.invalid";
    await db.sql("insert into public.research_applications(id,email,first_name,status,source_page,approval_expires_at) values($1,$2,'Synthetic Claim','approved_pending_payment','local_referral_preview',now()+interval '1 day')", [claimId, claimEmail]);

    // Import only after environment and outbound boundaries have been set.
    const [{ registerReferralV1Api }, { buildReferralV1Dependencies }, { requireMember, requireActiveMember }, { requireSupabaseAdmin },
      { registerMemberApi }, membership, research, tokenModule] = await Promise.all([
      import("../../server/research/partners/referral-v1-routes"), import("../../server/research/partners/referral-v1-production"),
      import("../../server/research/member-auth"), import("../../server/routes"), import("../../server/research/members"),
      import("../../server/research/membership"), import("../../server/research/index"), import("../../server/research/partners/referral-v1-tokens"),
    ]);
    const app = express(); app.disable("x-powered-by"); app.use(express.json({ limit: "32kb" }));
    app.use((req, res, next) => {
      if (req.headers.host !== "127.0.0.1:5238") { res.status(400).json({ error: "preview_host_required" }); return; }
      res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" }); next();
    });
    const bearer = (req: Request) => req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
    const auth = (req: Request) => tokens.get(bearer(req));
    const user = (persona: Persona) => ({ id: persona.authId, aud: "authenticated", role: "authenticated", email: persona.email,
      email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [] });
    const session = (persona: Persona) => ({ access_token: persona.token, token_type: "bearer", expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: persona.refresh, user: user(persona) });
    app.get("/api/config", (_req, res) => res.json({ metaPixelId: null, turnstileSiteKey: null, calendlyUrl: null, supabaseUrl: `${origin}/preview-supabase`, supabaseAnonKey: anonKey }));
    app.post("/preview-supabase/auth/v1/token", (req, res) => {
      const persona = req.query.grant_type === "refresh_token" ? [...personas.values()].find((p) => p.refresh === req.body.refresh_token) : personas.get(String(req.body.email ?? "").toLowerCase());
      if (!persona || req.query.grant_type !== "refresh_token" && req.body.password !== persona.password) { res.status(400).json({ error: "invalid_grant", error_description: "Invalid synthetic credentials" }); return; }
      res.json(session(persona));
    });
    app.get("/preview-supabase/auth/v1/user", (req, res) => { const entry = auth(req); entry ? res.json(user(entry.persona)) : res.status(401).json({ error: "invalid_token" }); });
    app.put("/preview-supabase/auth/v1/user", (req, res) => {
      const entry = auth(req);
      if (!entry?.recovery || typeof req.body.password !== "string" || req.body.password.length < 10) { res.status(401).json({ error: "invalid_recovery_session" }); return; }
      entry.persona.password = req.body.password; res.json(user(entry.persona));
    });
    app.post("/preview-supabase/auth/v1/logout", (req, res) => { if (auth(req)?.recovery) tokens.delete(bearer(req)); res.status(204).end(); });
    app.post("/preview-supabase/auth/v1/recover", (_req, res) => res.json({})); // No email is sent.
    app.get("/preview-supabase/auth/v1/admin/users", (req, res) => {
      if (req.get("apikey") !== serviceKey) { res.status(403).json({ error: "forbidden" }); return; }
      res.json({ users: [...personas.values()].map(user), aud: "authenticated" });
    });
    app.post("/preview-supabase/auth/v1/admin/users", (req, res) => {
      if (req.get("apikey") !== serviceKey || req.body.email !== claimEmail || typeof req.body.password !== "string") { res.status(403).json({ error: "forbidden" }); return; }
      if (personas.has(claimEmail)) { res.status(422).json({ message: "User already exists" }); return; }
      res.json(user(addPersona(claimEmail, randomUUID(), { password: req.body.password })));
    });
    const fixtureLineage = new Set<string>();
    const seedLineage = async (accountKey: string) => {
      if (fixtureLineage.has(accountKey)) return;
      const row = (await db.sql("select id from public.research_members where auth_user_id=$1", [accountKey.slice(5)])).rows[0];
      if (!row) return;
      const address = JSON.stringify({ line1: "Synthetic", city: "Synthetic", region: "ZZ", postalCode: "00000", countryCode: "US" });
      const client = await db.connection();
      try {
        await client.query("begin");
        await client.query("insert into public.research_orders(member_id,subtotal_cents,total_cents,state) values($1,0,0,'draft')", [row.id]);
        await client.query("insert into public.research_assisted_order_requests(id,public_reference,idempotency_key_hash,request_fingerprint,actor_member_id,normalized_email,full_legal_name,mobile_phone,shipping_address,billing_address,age_confirmed,source) values($1,$2,$3,$4,$5,'synthetic@example.invalid','Synthetic local fixture','0000000000',$6::jsonb,$6::jsonb,true,'early_access_manual_order_bridge')", [randomUUID(), `XRR-20260904-${randomBytes(5).toString("hex").toUpperCase()}`, randomUUID(), randomUUID(), row.id, address]);
        await client.query("commit"); fixtureLineage.add(accountKey);
      } catch (error) { await client.query("rollback"); throw error; }
      finally { await client.end(); }
    };
    app.use("/preview-supabase/rest/v1", (req, res, next) => { if (req.get("apikey") !== serviceKey) { res.status(403).json({ message: "Preview service bridge only" }); return; } next(); });
    app.post("/preview-supabase/rest/v1/rpc/:name", async (req, res) => {
      try {
        if (req.params.name === "research_rate_limit_hit") {
          res.json((await db.sql("select public.research_rate_limit_hit($1,$2,$3) as allowed", [req.body.p_key, req.body.p_window_seconds, req.body.p_max_hits], "service_role")).rows[0].allowed); return;
        }
        const result = await db.rpc.rpc(String(req.params.name), req.body);
        if (result.error) { res.status(503).json({ message: "Local RPC unavailable" }); return; }
        res.json(result.data);
      } catch { res.status(503).json({ message: "Local RPC unavailable" }); }
    });
    app.get("/preview-supabase/rest/v1/:table", async (req, res) => {
      try {
        if (req.params.table === "research_application_events") { res.json([]); return; }
        if (!["research_members", "research_applications"].includes(String(req.params.table))) { res.status(503).json({ message: "Outside preview fixture" }); return; }
        const allowed = req.params.table === "research_members" ? ["id", "auth_user_id", "email", "application_id"] : ["id", "email"];
        const filters = Object.entries(req.query).filter(([key]) => allowed.includes(key));
        if (filters.length !== 1 || typeof filters[0][1] !== "string" || !filters[0][1].startsWith("eq.")) { res.status(400).json({ message: "Bounded fixture query required" }); return; }
        const rows = (await db.sql(`select * from public.${req.params.table} where ${filters[0][0]}=$1 limit 2`, [filters[0][1].slice(3)])).rows;
        if (req.get("accept")?.includes("vnd.pgrst.object")) res.json(rows[0] ?? null); else res.json(rows);
      } catch { res.status(503).json({ message: "Local fixture query unavailable" }); }
    });
    app.post("/preview-supabase/rest/v1/research_members", async (req, res) => {
      try {
        const p = req.body;
        if (p.application_id !== claimId || p.email !== claimEmail || p.auth_user_id !== personas.get(claimEmail)?.authId) { res.status(403).json({ message: "Synthetic claim only" }); return; }
        await db.sql("insert into public.research_members(application_id,auth_user_id,email,first_name,status,billing_state) values($1,$2,$3,$4,$5,$6)", [p.application_id, p.auth_user_id, p.email, p.first_name, p.status, p.billing_state ?? null]);
        res.status(201).json(null);
      } catch { res.status(409).json({ message: "Synthetic member insert refused" }); }
    });
    app.all(/^\/preview-supabase\//, (_req, res) => res.status(503).json({ message: "Outside synthetic Auth/application bridge" }));

    // Preview scope boundary precedes the real registration. Unrelated intake,
    // payment, messaging and clinical writes cannot reach their real handlers.
    const getDoors = new Set(["/api/research/me", "/api/research/member/me", "/api/research/catalog", "/api/research/applications/status", "/api/research/partner/links", "/api/admin/me", "/api/admin/research/referral-lifecycle"]);
    const postDoors = new Set(["/api/research/member/claim", "/api/research/member/forgot-password", "/api/research/partner/links", "/api/research/referral/resolve", "/api/research/referral/bootstrap", "/api/research/referral/capture", "/api/research/referral/bind"]);
    app.use("/api", (req, res, next) => {
      const route = `/api${req.path}`;
      if (req.method === "GET" && getDoors.has(route) || req.method === "POST" && (postDoors.has(route) || /^\/api\/research\/partner\/links\/[a-f0-9-]{36}\/revoke$/.test(route))) return next();
      res.status(404).json({ code: "outside_local_referral_preview" });
    });
    // Catalog is intentionally empty/commerce-off; no fabricated product authority.
    app.get("/api/research/catalog", requireActiveMember, (_req, res) => res.json({ products: [], commerce: { research: false, consumer: false }, email: "research@preview.invalid" }));
    app.get("/api/admin/me", requireSupabaseAdmin, (_req, res) => res.json({ success: true, email: admin.email }));
    app.use(research.researchPageGate);
    research.registerResearchApi(app);
    membership.registerMembershipApi(app);
    registerMemberApi(app);
    const deps = buildReferralV1Dependencies();
    registerReferralV1Api(app, deps, { requireMember, requireAdmin: requireSupabaseAdmin });
    const dist = path.join(root, "dist/public");
    app.use(express.static(dist));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
    server = await new Promise<Server>((resolve, reject) => { const listener = app.listen(5238, "127.0.0.1", () => resolve(listener)); listener.on("error", reject); });

    const link = async (destinationPath: string) => {
      const linkId = randomUUID(), token = tokenModule.referralPublicToken(secret, linkId, 1)!;
      const result = await deps.store.issue({ actorAuthUserId: owner.authId, idempotencyKey: randomUUID(), linkId, tokenHashHex: tokenModule.referralDigest(token), tokenKeyVersion: 1, destinationPath, expiresInDays: 30 });
      if (!result.ok) throw new Error("Real preview link issuance failed");
      return { id: result.value.link.id, path: `/r/${token}` };
    };
    const care = await link("/care"), researchLink = await link("/research/member/catalog"), revoked = await link("/health");
    const revokedResult = await deps.store.revoke({ actorAuthUserId: owner.authId, linkId: revoked.id, idempotencyKey: randomUUID() });
    if (!revokedResult.ok) throw new Error("Real preview revocation failed");
    const expiredId = randomUUID(), expiredToken = tokenModule.referralPublicToken(secret, expiredId, 1)!;
    await db.sql("insert into public.research_partner_links(id,partner_id,code,channel,created_at,referral_version,token_hash_hex,token_key_version,destination_path,expires_at) values($1::uuid,$2,$1::uuid::text,'signed_link',now()-interval '60 days',1,$3,1,'/health',now()-interval '30 days')", [expiredId, owner.partnerId, tokenModule.referralDigest(expiredToken)]);
    const claimToken = membership.makeResearchToken("account_claim", claimId);
    const publicPersona = (p: Persona) => ({ email: p.email, password: p.password });
    const manifest = { origin, personas: { owner: publicPersona(owner), recipient: publicPersona(recipient), admin: publicPersona(admin) },
      claim: { path: `/research/apply/status?token=${encodeURIComponent(claimToken)}&returnTo=%2Fresearch%2Fmember%2Fcatalog`, email: claimEmail, password },
      recovery: { path: `/research/reset-password?returnTo=%2Fresearch%2Fmember%2Fcatalog#access_token=${recoveryToken}&refresh_token=${recoveryPersona.refresh}&expires_in=3600&token_type=bearer&type=recovery`, email: recoveryPersona.email, newPassword: "Synthetic-recovered-password-2026" },
      fixtureLinks: { care: care.path, research: researchLink.path, revoked: revoked.path, expired: `/r/${expiredToken}` } };
    const telemetry = async () => {
      const bindingByPersona: Record<string, { count: number; linkId: string | null }> = {};
      for (const role of ["recipient", "recovery", "claim"]) {
        const email = `${role}@preview.invalid`;
        // The fixed synthetic email identifies a fixture, never an authorization
        // fallback. Its exact Auth UUID must match the canonical member and key.
        const row = (await db.sql("select count(*)::int as count,min(b.referral_link_id::text) as link_id from public.research_members m join public.research_affiliate_customer_bindings b on b.customer_key='auth:'||m.auth_user_id::text where m.email=$1 and m.auth_user_id=$2::uuid and b.referral_version=1", [email, personas.get(email)?.authId ?? null])).rows[0];
        bindingByPersona[role] = { count: row.count, linkId: row.link_id };
      }
      return { outboundAttemptsDenied, bindingByPersona, db: (await db.sql("select (select count(*)::int from public.research_partner_links where referral_version=1) links,(select count(*)::int from public.research_attribution_touches where referral_version=1) touches,(select count(*)::int from public.research_affiliate_customer_bindings where referral_version=1) bindings,(select count(*)::int from public.research_partner_referral_events) events,(select count(*)::int from public.research_orders) lineage")).rows[0], runtime: db.runtimeEvidence };
    };
    const seedLineageFixtures = async () => {
      // Test-only IPC action; NEVER invoked by a referral API or member/me probe.
      const rows = (await db.sql("select customer_key from public.research_affiliate_customer_bindings where referral_version=1 order by customer_key limit 100")).rows;
      for (const row of rows) await seedLineage(row.customer_key);
      return { type: "browser-qa-lineage-seeded", synthetic: true, seededAccounts: fixtureLineage.size };
    };
    return { manifest, stop, telemetry, seedLineageFixtures };
  } catch (error) { await stop(); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startReferralPreview().then((preview) => {
    console.log(`REFERRAL_PREVIEW_READY ${JSON.stringify(preview.manifest)}`);
    const shutdown = async () => { await preview.stop(); process.exit(0); };
    process.on("message", async (message: any) => {
      if (message?.type === "browser-qa-telemetry") process.send?.(await preview.telemetry());
      if (message?.type === "browser-qa-seed-lineage") {
        try { process.send?.(await preview.seedLineageFixtures()); }
        catch { process.send?.({ type: "browser-qa-lineage-seeded", synthetic: true, error: "synthetic_fixture_seed_failed" }); }
      }
      if (message?.type === "browser-qa-stop") await shutdown();
    });
    // Standalone diagnostic runs have no IPC channel. A bounded stdin command
    // provides the same graceful path without a public shutdown endpoint.
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { if (String(chunk).trim() === "browser-qa-stop") void shutdown(); });
    process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
  }).catch(() => { console.error("REFERRAL_PREVIEW_FAILED local setup unavailable"); process.exitCode = 1; });
}
