import type { Express, Request, RequestHandler } from "express";
import pg from "pg";
import { z } from "zod";
import { registerPrivateQuoteDispatch } from "../../../outbox";
import { EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT } from "../../../policies-data";
import { sha256AssistedOrderHasher as hash } from "../../defaults";
import type { AssistedOrderViewer } from "../../ports";
import type { AssistedOrderProductionWiring } from "../../production-deps";
import { requestIntentRepository, requestIntentStaffReader } from "../../request-intent/rpc-repository";
import { AssistedOrderQuoteService } from "../service";
import { bindReviewedXriQuoteLines } from "../xri-line-bindings";
import { attachApprovedPrivateQuotes } from "./compose.mjs";
import { resendTransport, TEAM } from "./mail.mjs";
import { pgTransactions } from "./pg.mjs";

export const STAGING_QUOTE_ORIGIN = "https://xenios-research-staging.onrender.com";
const STAGING_REF = "tetynodzrtmdbuzgboro";
const STAGING_SERVICE = "srv-d9h4f4m7r5hc73ctjng0";
const STAGING_LOGIN = "ea_quote_stage_login";
const STAGING_POOLER = "aws-1-us-west-2.pooler.supabase.com";
// Public Supabase Root 2021 CA from the provider's prod/ssl/prod-ca-2021.crt.
// SHA-256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA.
// The shared pooler uses this chain rather than Node's public CA store.
const SUPABASE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;
const RECIPIENT = "samuel@xeniostechnology.com";
const TENANT = "ea-staging";
const SELLER = "team-xenios-stage";
const SELLER_LABEL = "Team Xenios (staging)";

export function isPrivateQuoteStaging(env: NodeJS.ProcessEnv): boolean {
  return env.RENDER === "true" && env.RENDER_SERVICE_ID === STAGING_SERVICE &&
    env.IS_PULL_REQUEST !== "true" && env.RENDER_EXTERNAL_URL === STAGING_QUOTE_ORIGIN &&
    env.SUPABASE_URL?.replace(/\/$/, "") === `https://${STAGING_REF}.supabase.co`;
}

/** Parse before creating a socket. Driver options cannot weaken TLS or switch identities. */
export function stagingQuotePoolOptions(env: NodeJS.ProcessEnv): pg.PoolConfig | null {
  if (!isPrivateQuoteStaging(env) || !env.EA_STAGE_QUOTE_DATABASE_URL) return null;
  try {
    const uri = new URL(env.EA_STAGE_QUOTE_DATABASE_URL);
    const pooled = uri.hostname === STAGING_POOLER &&
      uri.username === `${STAGING_LOGIN}.${STAGING_REF}`;
    if (uri.protocol !== "postgresql:" || !pooled || uri.port !== "5432" ||
        uri.pathname !== "/postgres" || uri.search || uri.hash || !uri.password) return null;
    return {
      host: uri.hostname,
      port: 5432,
      user: uri.username,
      password: decodeURIComponent(uri.password),
      database: "postgres",
      ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
      max: 2,
      connectionTimeoutMillis: 4_000,
    };
  } catch { return null; }
}

/** Uses the same transaction and pool as the staging quote desk; no DDL or quote data. */
export function mountStagingQuoteConnection(
  app: Express, env: NodeJS.ProcessEnv, requireAdmin: RequestHandler,
  connect = (config: pg.PoolConfig) => new pg.Pool(config),
) {
  if (!isPrivateQuoteStaging(env)) return null;
  const options = stagingQuotePoolOptions(env);
  const pool = options ? connect(options) : null;
  pool?.on("error", () => { /* Only the authenticated probe reports availability. */ });
  const transact = pool ? pgTransactions(pool, { assumeStagingRuntimeRole: true }) : null;
  app.get("/api/staff/early-access/private-quotes/staging-readiness",
    (_req, res, next) => {
      res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
      next();
    },
    requireAdmin,
    async (_req, res) => {
      let restrictedConnection = false;
      try {
        if (transact) {
          restrictedConnection = await transact("ea-staging", "readiness", async (q) => {
            const rows = await q("SELECT session_user = 'ea_quote_stage_login' AS ok");
            return rows[0]?.ok === true;
          });
        }
      } catch { /* A connection, privilege, or query failure stays closed. */ }
      return res.status(restrictedConnection ? 200 : 503).json({
        restrictedConnection,
        resendConfigured: Boolean(env.RESEND_API_KEY?.trim()),
      });
    });
  return pool;
}

// A staging administrator records the already-reviewed, single synthetic XRI
// fixture in server configuration. The browser cannot select the recipient,
// request, seller, amount, attempt key, or approval evidence.
const fixtureSchema = z.object({
  xriId: z.string().uuid(),
  ownerHash: z.string().regex(/^[a-f0-9]{64}$/),
  attemptHash: z.string().regex(/^[a-f0-9]{64}$/),
  customerRef: z.string().min(1).max(180),
  issuerId: z.string().uuid(),
  recipientId: z.string().uuid(),
  productId: z.string().min(1).max(180),
  variantId: z.string().min(1).max(180),
  approvalEvidenceId: z.string().min(1).max(180),
  unitPriceCents: z.number().int().positive().max(100_00),
  validUntil: z.string().datetime(),
}).strict();

type VerifyAccount = (userId: string) => Promise<{
  email: string;
  confirmedAt: string;
} | null>;

export function mountStagingPrivateQuotePortal(
  app: Express, wiring: AssistedOrderProductionWiring,
  viewers: { customer(req: Request): Promise<AssistedOrderViewer> },
  requireAdmin: RequestHandler, verifyAccount: VerifyAccount,
  connect?: (config: pg.PoolConfig) => pg.Pool,
): void {
  const { env, supabaseRpc, agreementGate, requiredAgreements } = wiring;
  const pool = mountStagingQuoteConnection(app, env, requireAdmin, connect);
  if (!pool || !supabaseRpc || !agreementGate || !requiredAgreements?.some(({ kind, version }) =>
    kind === EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT.kind && version === EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT.version)) return;
  const currentPolicy = requiredAgreements;

  let untrusted: unknown;
  try { untrusted = JSON.parse(env.EA_STAGE_QUOTE_FIXTURE ?? "null"); }
  catch { return; }
  const parsed = fixtureSchema.safeParse(untrusted);
  const tag = env.EA_STAGE_QUOTE_TAG_KEY ?? "";
  if (!parsed.success || !/^[a-f0-9]{64}$/.test(tag)) return;
  const fixture = parsed.data;
  const expiry = Date.parse(fixture.validUntil);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 7 * 86400_000) return;

  const repository = requestIntentRepository(supabaseRpc);
  const staffReader = requestIntentStaffReader(supabaseRpc);
  const lineId = "stage-reviewed-line";
  const targetId = `stage-${fixture.xriId}`;
  const configuredAdmin = env.ADMIN_EMAIL?.trim().toLowerCase();
  const deliveryEnabled = env.EA_STAGE_QUOTE_DELIVERY_APPROVED === "true";
  const transport = resendTransport({
    enabled: deliveryEnabled, apiKey: env.RESEND_API_KEY,
    verifiedSender: TEAM, verifiedReplyTo: TEAM, portalVerified: true,
    portalOrigin: STAGING_QUOTE_ORIGIN,
  });
  if (deliveryEnabled && !transport.ready()) return;

  const issuerIsCurrent = async () => {
    const user = await verifyAccount(fixture.issuerId);
    return !!configuredAdmin && user?.email === configuredAdmin;
  };
  const currentStanding = () => agreementGate.accepted(fixture.customerRef);

  async function loadScope(xriId: string, seller: string) {
    if (xriId !== fixture.xriId || seller !== SELLER || Date.now() >= expiry ||
        !await currentStanding() || !await issuerIsCurrent()) return null;
    const attempt = await repository.findAttempt(fixture.ownerHash, fixture.attemptHash);
    if (attempt?.receipt.requestId !== fixture.xriId) return null;
    const [intent, recipient] = await Promise.all([
      // This fixed staging subject must retain the actual pending-review read
      // capability. The RPC checks it at storage and audits the access.
      staffReader.get(fixture.xriId, fixture.issuerId),
      verifyAccount(fixture.recipientId),
    ]);
    if (!intent || intent.lines.length !== 1 || recipient?.email !== RECIPIENT ||
        intent.contact.email.trim().toLowerCase() !== RECIPIENT ||
        !currentPolicy.every(p => intent.agreements.some(a => a.kind === p.kind && a.version === p.version))) return null;
    const source = intent.lines.find(x => x.productId === fixture.productId && x.variantId === fixture.variantId);
    if (!source || source.clinicalReviewRequired || source.sourceRefusal !== null) return null;
    return {
      tenant: TENANT, intent, currentStanding: true,
      target: { requestId: targetId, sellerId: SELLER, lines: [{
        lineId, productId: source.productId, variantId: source.variantId,
        productName: source.productName, specification: source.specification,
        quantity: source.quantity, unitPriceCents: null, currency: "USD" as const,
      }] },
      binding: { requestId: targetId, publicReference: intent.publicReference,
        actorMemberId: null, earlyAccessSessionHash: fixture.ownerHash, normalizedEmail: null },
      bindings: [{ xriRequestId: xriId, xriReference: intent.publicReference,
        issueRequestId: targetId, issueLineId: lineId, sellerId: SELLER,
        approvalEvidenceId: fixture.approvalEvidenceId, clearedForQuotation: true, source }],
      contact: { email: recipient.email, requestId: xriId, verified: true, deliveryAllowed: true,
        revision: hash.stableHash([fixture.recipientId, recipient.confirmedAt, recipient.email]) },
    };
  }

  async function customerPrincipal(req: Request) {
    const viewer = await viewers.customer(req);
    if (req.headers.authorization && (viewer.actorType !== "member" || !viewer.authUserId)) return null;
    if (!viewer.capabilities.has("assisted_orders:read_own") || !viewer.earlyAccessSessionHash ||
        viewer.earlyAccessCustomerRef !== fixture.customerRef || !await currentStanding()) return null;
    const ownerHash = viewer.actorType === "member" && viewer.authUserId && viewer.memberId
      ? hash.stableHash(["request-intent-owner", "member", viewer.authUserId])
      : viewer.actorType === "early_access_session"
        ? hash.stableHash(["request-intent-owner", "session", viewer.earlyAccessCustomerRef, viewer.earlyAccessSessionHash])
        : null;
    if (ownerHash !== fixture.ownerHash) return null;
    return { ...viewer, tenant: TENANT, memberId: null, earlyAccessSessionHash: ownerHash };
  }

  type ScopedViewer = { tenant?: string; subject?: string; earlyAccessSessionHash?: string | null };
  attachApprovedPrivateQuotes({
    enabled: true, router: app, pool, assumeStagingRuntimeRole: true,
    stageDispatchPaused: !deliveryEnabled, deferStagingNotice: true, transport, tagKey: Buffer.from(tag, "hex"),
    Engine: AssistedOrderQuoteService, bind: bindReviewedXriQuoteLines,
    customerPrincipal, staffGuard: requireAdmin,
    async ownedRequests() {
      // The workflow rechecks ownership, standing, exact request, and current
      // clearance before returning any quote. There is no query parameter.
      return [{ xriId: fixture.xriId, seller: SELLER, sellerLabel: SELLER_LABEL, requestLineCount: 1 }];
    },
    async staffPrincipal(req: Request & { adminEmail?: string }) {
      if (req.adminEmail?.trim().toLowerCase() !== configuredAdmin || !await issuerIsCurrent()) return null;
      return { tenant: TENANT, subject: fixture.issuerId, actorLabel: fixture.issuerId,
        capabilities: new Set(["assisted_orders:manage"]) };
    },
    async csrfChecked(req: Request) {
      return req.get("origin") === STAGING_QUOTE_ORIGIN && !!req.is("application/json") &&
        (!req.get("sec-fetch-site") || req.get("sec-fetch-site") === "same-origin");
    },
    async issueInput(req: Request) {
      if (!req.body || Object.getPrototypeOf(req.body) !== Object.prototype || Object.keys(req.body).length) {
        throw new Error("The staged fixture is fixed.");
      }
      return { xriId: fixture.xriId, seller: SELLER, attempt: "one-staging-notice", expectedVersion: 0,
        validUntil: fixture.validUntil,
        lines: [{ requestLineId: lineId, unitPriceCents: fixture.unitPriceCents, pricingBasis: "Approved synthetic staging price" }] };
    },
    authority: {
      async forIssue(_q: unknown, viewer: ScopedViewer, xriId: string, seller: string) {
        if (viewer.tenant !== TENANT || viewer.subject !== fixture.issuerId) return null;
        const context = await loadScope(xriId, seller);
        return context && { ...context, issueAuthorized: true, notifyAuthorized: true };
      },
      async forCustomer(_q: unknown, viewer: ScopedViewer, xriId: string, seller: string) {
        if (viewer.tenant !== TENANT || viewer.earlyAccessSessionHash !== fixture.ownerHash) return null;
        const context = await loadScope(xriId, seller);
        return context && { ...context, customerAuthorized: true };
      },
      async forDispatch(_q: unknown, job: { tenant: string; issuer: string; xriId: string; seller: string }) {
        if (!deliveryEnabled || job.tenant !== TENANT || job.issuer !== fixture.issuerId) return null;
        const context = await loadScope(job.xriId, job.seller);
        return context && { ...context, dispatchAuthorized: true };
      },
      // The one-email rehearsal verifies actual delivery and threading in the
      // recipient and team inboxes. An accepted send is never delivery proof.
      async verifiedDispatchEvidence() { return null; },
    },
    registerPrivateQuoteDispatch,
  });
}
