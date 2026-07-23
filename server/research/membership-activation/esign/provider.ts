// xenios research: OpenSign e-signature provider adapter.
//
// This is the EXECUTION boundary only. The xenios agreement engine stays the
// source of legal truth (document identity, version, source hash, required
// order, activation gate). A provider completion is proof of a signature event;
// it is never proof that the xenios gate may advance. That decision lives above
// this adapter and is driven by a VERIFIED webhook, never by a browser redirect.
//
// Design mirrors the repo's other provider boundaries (payment.ts, shipping.ts):
//   - The HTTP transport is an INJECTED seam, so every test runs against canned
//     provider-shaped responses and no test can reach the network.
//   - Credentials live only inside the transport closure / request headers and
//     never appear on a returned result or a thrown error.
//   - Disabled is the safe default; a live adapter constructs only from a
//     complete configuration, behind the flag, after the synthetic-data guard.
//
// ---------------------------------------------------------------------------
// ASSUMPTIONS TO CONFIRM against OpenSign's published API docs (v1.2) BEFORE
// live use. Every one of these is isolated to a small helper so confirming it
// later is a one-line, localized edit:
//   - Template create:   POST {baseUrl}/api/v1/templates          (toTemplateBody / readTemplateResponse)
//   - Document create:   POST {baseUrl}/api/v1/documents          (toSigningRequestBody / readSigningSessionResponse)
//   - Completed file:    GET  {fileUrl}                           (absolute URL taken from a verified webhook)
//   - API auth header:   x-api-token: <apiToken>                  (authHeaders)
//   - Webhook signature: header `x-webhook-signature`, HMAC-SHA256 hex of the
//                        exact raw request body, keyed by the webhook secret.  (verifyWebhook)
//   - Webhook field/event names and the provider event -> canonical type map.  (OPENSIGN_EVENT_TYPE_MAP / readWebhookEvent)
// Confirming any of these does not change the safety-critical crypto or the
// resolver, only the mapping helpers.
// ---------------------------------------------------------------------------

import crypto from "crypto";
import {
  ESIGN_EVENT_TYPES,
  type CreateSigningSessionInput,
  type EsignErrorCode,
  type EsignEventType,
  type EsignProvider,
  type EsignProviderResult,
  type EsignTemplateSpec,
  type EsignWebhookEvent,
  type EsignWebhookVerification,
  type FetchCompletedFileInput,
  type FetchedFile,
  type SigningSession,
} from "./contracts";
import { assertNoSyntheticDataInProduction } from "../../commerce/production-guards";

// ---------------------------------------------------------------------------
// Result envelope helpers (the contract's EsignProviderResult, not the shared
// capability ProviderResult; the two are deliberately distinct shapes).
// ---------------------------------------------------------------------------

function ok<T>(value: T): EsignProviderResult<T> {
  return { ok: true, value };
}

function fail<T>(code: EsignErrorCode, message: string): EsignProviderResult<T> {
  return { ok: false, code, message };
}

/** The completed-file ceiling. A larger download is refused, not buffered. */
export const MAX_COMPLETED_FILE_BYTES = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Injected HTTP transport seams
// ---------------------------------------------------------------------------

export interface EsignHttpRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface EsignHttpJsonResponse {
  status: number;
  json: unknown;
  text: string;
}

/** JSON transport. The one seam for template/document API calls. */
export type EsignFetchJson = (req: EsignHttpRequest) => Promise<EsignHttpJsonResponse>;

export interface EsignBytesResponse {
  status: number;
  bytes: Buffer;
  contentType: string | null;
}

/** Binary transport, separate because a completed PDF is bytes, not JSON. */
export type EsignFetchBytes = (
  url: string,
  headers: Record<string, string>,
) => Promise<EsignBytesResponse>;

// ---------------------------------------------------------------------------
// Disabled provider (the safe default)
// ---------------------------------------------------------------------------

/**
 * A disabled provider does nothing and, crucially, verifies nothing. Every
 * async method returns a structured DISABLED refusal, and verifyWebhook reports
 * `malformed` because a provider with no configured secret cannot authenticate
 * any body. It never returns `ok: true`.
 */
export class DisabledEsignProvider implements EsignProvider {
  readonly name = "disabled";
  readonly isLive = false;

  async provisionTemplate(): Promise<
    EsignProviderResult<{ providerTemplateId: string; providerTemplateVersion: string }>
  > {
    return fail("DISABLED", "The e-signature provider is not enabled.");
  }

  async createSigningSession(): Promise<EsignProviderResult<SigningSession>> {
    return fail("DISABLED", "The e-signature provider is not enabled.");
  }

  async fetchCompletedFile(): Promise<EsignProviderResult<FetchedFile>> {
    return fail("DISABLED", "The e-signature provider is not enabled.");
  }

  verifyWebhook(): EsignWebhookVerification {
    return { ok: false, code: "malformed" };
  }
}

// ---------------------------------------------------------------------------
// OpenSign adapter configuration
// ---------------------------------------------------------------------------

export interface OpenSignAdapterConfig {
  /** OpenSign service origin, e.g. a self-hosted OpenSign instance. */
  baseUrl: string;
  /** Server-side API token. Lives only in request headers, never on a result. */
  apiToken: string;
  /** HMAC key for webhook verification. Never leaves the crypto path. */
  webhookSecret: string;
  /** Where the signer returns after signing. May be overridden per session. */
  redirectUrl: string | null;
  /** Namespace/folder that groups xenios templates on the provider. */
  templateNamespace: string;
  /** True in the provider's sandbox; forwarded so nothing binding is created. */
  sandboxMode: boolean;
  /** Request an email one-time-passcode step on the signing link. */
  emailOtpEnabled: boolean;
  /** Allow a per-session access code (never a predictable value). */
  accessCodeEnabled: boolean;
  /** Default signing-link lifetime in minutes, when the caller gives none. */
  signingLinkTtlMinutes: number | null;
}

// ---------------------------------------------------------------------------
// Small, confirm-later mapping helpers (structure isolated on purpose)
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Map an EsignTemplateSpec to the OpenSign template create body. FIELD NAMES
 * ARE ASSUMED; confirm against OpenSign's template API before live use. The
 * xenios source hash travels with each document so provider/xenios drift is
 * detectable later.
 */
function toTemplateBody(spec: EsignTemplateSpec, config: OpenSignAdapterConfig): Record<string, unknown> {
  return {
    name: `${config.templateNamespace}:${spec.templateKey}`,
    title: spec.title,
    namespace: config.templateNamespace,
    sendInOrder: true,
    sandbox: config.sandboxMode,
    documents: spec.documents.map((doc) => ({
      externalId: doc.xeniosDocumentVersionId,
      title: doc.title,
      category: doc.category,
      sourceContentHash: doc.sourceContentHash,
      widgets: doc.widgets.map((widget) => ({
        name: widget.name,
        type: widget.type,
        required: widget.required,
        page: widget.page ?? 1,
      })),
    })),
  };
}

/**
 * Read the provider template id and version out of a create response. RESPONSE
 * FIELD NAMES ARE ASSUMED. Returns null when the id is absent so the caller can
 * report PROVIDER_ERROR rather than mint a broken mapping.
 */
function readTemplateResponse(
  json: unknown,
): { providerTemplateId: string; providerTemplateVersion: string } | null {
  const record = asRecord(json);
  if (!record) return null;
  const providerTemplateId =
    asNonEmptyString(record.objectId) ?? asNonEmptyString(record.id) ?? asNonEmptyString(record.templateId);
  if (!providerTemplateId) return null;
  // A provider that does not version templates yields "1" (documented default),
  // never a random value, so the mapping stays deterministic.
  const providerTemplateVersion =
    asNonEmptyString(record.version) ?? asNonEmptyString(record.templateVersion) ?? "1";
  return { providerTemplateId, providerTemplateVersion };
}

/**
 * Map a CreateSigningSessionInput to the OpenSign document create body. FIELD
 * NAMES ARE ASSUMED. The externalReference is echoed so a later webhook maps
 * back to the xenios signing request; access code and link ttl are honored only
 * when configured.
 */
function toSigningRequestBody(
  input: CreateSigningSessionInput,
  config: OpenSignAdapterConfig,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    templateId: input.providerTemplateId,
    externalReference: input.externalReference,
    signers: [{ email: input.signerEmail, memberId: input.memberId }],
    // We take a signing LINK back rather than have the provider email it.
    sendEmail: false,
    emailOtp: config.emailOtpEnabled,
    sandbox: config.sandboxMode,
  };
  const redirectUrl = input.redirectUrl ?? config.redirectUrl;
  if (redirectUrl) body.redirectUrl = redirectUrl;
  if (config.accessCodeEnabled && input.accessCode) body.accessCode = input.accessCode;
  const ttlMinutes = input.linkTtlMinutes ?? config.signingLinkTtlMinutes;
  if (ttlMinutes && ttlMinutes > 0) body.expireInMinutes = ttlMinutes;
  return body;
}

/**
 * Read a signing session out of a document create response. RESPONSE FIELD
 * NAMES ARE ASSUMED. Returns null when the document id or signing url is absent.
 */
function readSigningSessionResponse(json: unknown): SigningSession | null {
  const record = asRecord(json);
  if (!record) return null;
  const providerDocumentId =
    asNonEmptyString(record.objectId) ?? asNonEmptyString(record.id) ?? asNonEmptyString(record.documentId);
  const signingUrl =
    asNonEmptyString(record.url) ?? asNonEmptyString(record.signingUrl) ?? asNonEmptyString(record.signUrl);
  if (!providerDocumentId || !signingUrl) return null;
  const expiresAt =
    asNonEmptyString(record.expiresAt) ?? asNonEmptyString(record.expireDate) ?? null;
  return { providerDocumentId, signingUrl, expiresAt };
}

/**
 * Provider event name -> canonical EsignEventType. VALUES ARE ASSUMED; confirm
 * against OpenSign's webhook docs. An event name absent from this table is an
 * unknown event and the webhook is reported `malformed`, never silently mapped.
 * Keys are compared lower-cased.
 */
const OPENSIGN_EVENT_TYPE_MAP: Record<string, EsignEventType> = {
  created: "created",
  sent: "created",
  viewed: "viewed",
  opened: "viewed",
  signed: "signed",
  completed: "completed",
  finished: "completed",
  declined: "declined",
  rejected: "declined",
  revoked: "revoked",
  voided: "revoked",
  expired: "expired",
};

// A compile-time reminder that every mapped value is a real ESIGN_EVENT_TYPES
// member; unused at runtime but keeps the map honest if the contract changes.
const _EVENT_TYPE_GUARD: ReadonlySet<EsignEventType> = new Set(ESIGN_EVENT_TYPES);

/**
 * Parse a verified webhook body into an EsignWebhookEvent. FIELD NAMES ARE
 * ASSUMED. Returns null (which the caller reports as `malformed`) when the event
 * type is unknown or a required field is missing. Called ONLY after the HMAC has
 * verified, so the body is trusted-authentic before it is parsed.
 */
function readWebhookEvent(parsed: unknown): EsignWebhookEvent | null {
  const root = asRecord(parsed);
  if (!root) return null;

  const rawType =
    asNonEmptyString(root.event) ?? asNonEmptyString(root.type) ?? asNonEmptyString(root.status);
  const type = rawType ? OPENSIGN_EVENT_TYPE_MAP[rawType.toLowerCase()] : undefined;
  if (!type || !_EVENT_TYPE_GUARD.has(type)) return null;

  const eventId = asNonEmptyString(root.eventId) ?? asNonEmptyString(root.id);
  const providerDocumentId =
    asNonEmptyString(root.documentId) ?? asNonEmptyString(root.objectId);
  const occurredAt =
    asNonEmptyString(root.occurredAt) ??
    asNonEmptyString(root.createdAt) ??
    asNonEmptyString(root.timestamp);
  if (!eventId || !providerDocumentId || !occurredAt) return null;

  return {
    eventId,
    type,
    providerDocumentId,
    signedFileUrl: asNonEmptyString(root.signedFileUrl) ?? asNonEmptyString(root.signedUrl),
    certificateUrl: asNonEmptyString(root.certificateUrl) ?? asNonEmptyString(root.certificateFileUrl),
    signerEmail: asNonEmptyString(root.signerEmail) ?? asNonEmptyString(root.email),
    externalReference: asNonEmptyString(root.externalReference),
    occurredAt,
  };
}

/** application/pdf, tolerating a charset or other parameter suffix. */
function isPdfContentType(contentType: string): boolean {
  return contentType.split(";")[0].trim().toLowerCase() === "application/pdf";
}

/**
 * Normalize a signature header to a lowercase hex string, or null when it is not
 * valid hex. Tolerates an optional `sha256=` prefix (a common webhook
 * convention); confirm whether OpenSign uses one. Non-hex or odd-length input is
 * rejected rather than silently truncated by Buffer.from(..., "hex").
 */
function normalizeSignatureHex(header: string): string | null {
  let value = header.trim();
  const eq = value.indexOf("=");
  if (eq >= 0 && value.slice(0, eq).trim().toLowerCase() === "sha256") {
    value = value.slice(eq + 1).trim();
  }
  if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) return null;
  return value.toLowerCase();
}

// ---------------------------------------------------------------------------
// OpenSign adapter
// ---------------------------------------------------------------------------

export class OpenSignAdapter implements EsignProvider {
  readonly name = "opensign";
  readonly isLive = true;

  constructor(
    private readonly config: OpenSignAdapterConfig,
    private readonly fetchJson: EsignFetchJson,
    private readonly fetchBytes: EsignFetchBytes,
  ) {}

  private baseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "");
  }

  /**
   * Auth + content headers. The API token sits here and ONLY here, so it never
   * reaches a result envelope or an error message.
   */
  private authHeaders(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-token": this.config.apiToken,
    };
  }

  async provisionTemplate(
    spec: EsignTemplateSpec,
  ): Promise<EsignProviderResult<{ providerTemplateId: string; providerTemplateVersion: string }>> {
    let response: EsignHttpJsonResponse;
    try {
      response = await this.fetchJson({
        method: "POST",
        url: `${this.baseUrl()}/api/v1/templates`,
        headers: this.authHeaders(),
        body: JSON.stringify(toTemplateBody(spec, this.config)),
      });
    } catch {
      return fail("PROVIDER_ERROR", "The e-signature provider could not be reached.");
    }
    if (response.status < 200 || response.status >= 300) {
      return fail("PROVIDER_ERROR", `The e-signature provider returned HTTP ${response.status}.`);
    }
    const mapped = readTemplateResponse(response.json);
    if (!mapped) {
      return fail("PROVIDER_ERROR", "The provider template response was missing required fields.");
    }
    return ok(mapped);
  }

  async createSigningSession(
    input: CreateSigningSessionInput,
  ): Promise<EsignProviderResult<SigningSession>> {
    let response: EsignHttpJsonResponse;
    try {
      response = await this.fetchJson({
        method: "POST",
        url: `${this.baseUrl()}/api/v1/documents`,
        headers: this.authHeaders(),
        body: JSON.stringify(toSigningRequestBody(input, this.config)),
      });
    } catch {
      return fail("PROVIDER_ERROR", "The e-signature provider could not be reached.");
    }
    if (response.status < 200 || response.status >= 300) {
      return fail("PROVIDER_ERROR", `The e-signature provider returned HTTP ${response.status}.`);
    }
    const session = readSigningSessionResponse(response.json);
    if (!session) {
      return fail("PROVIDER_ERROR", "The provider signing-session response was missing required fields.");
    }
    return ok(session);
  }

  async fetchCompletedFile(input: FetchCompletedFileInput): Promise<EsignProviderResult<FetchedFile>> {
    let response: EsignBytesResponse;
    try {
      response = await this.fetchBytes(input.fileUrl, { "x-api-token": this.config.apiToken });
    } catch {
      return fail("PROVIDER_ERROR", "The e-signature provider could not be reached.");
    }
    if (response.status < 200 || response.status >= 300) {
      return fail("PROVIDER_ERROR", `The e-signature provider returned HTTP ${response.status}.`);
    }
    if (!response.contentType || !isPdfContentType(response.contentType)) {
      return fail("REFUSED", "The completed file was not a PDF and was refused.");
    }
    if (response.bytes.length > MAX_COMPLETED_FILE_BYTES) {
      return fail("REFUSED", "The completed file exceeded the maximum allowed size and was refused.");
    }
    return ok({ bytes: response.bytes, contentType: response.contentType });
  }

  /**
   * SAFETY-CRITICAL. Verifies the raw webhook body against the configured secret
   * with HMAC-SHA256 in constant time, then parses. The raw body and the
   * signature are NEVER logged. `nowMs` is accepted for a future staleness
   * window; OpenSign's scheme carries no signed timestamp today, so it is unused.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null, nowMs: number): EsignWebhookVerification {
    void nowMs;
    if (!signatureHeader) return { ok: false, code: "invalid_signature" };

    const providedHex = normalizeSignatureHex(signatureHeader);
    if (!providedHex) return { ok: false, code: "invalid_signature" };

    const expectedHex = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(rawBody, "utf8")
      .digest("hex");
    const expectedBuffer = Buffer.from(expectedHex, "hex");
    const providedBuffer = Buffer.from(providedHex, "hex");
    // Length guard BEFORE timingSafeEqual, which throws on a length mismatch.
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return { ok: false, code: "invalid_signature" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, code: "malformed" };
    }
    const event = readWebhookEvent(parsed);
    if (!event) return { ok: false, code: "malformed" };
    return { ok: true, event };
  }
}

// ---------------------------------------------------------------------------
// Production transports (inert until a resolver builds them; tests inject fakes)
// ---------------------------------------------------------------------------

/**
 * The real JSON transport. Wraps global fetch and is constructed ONLY at
 * resolution time when no transport is injected, so it never runs in a test.
 */
export function buildFetchTransport(): EsignFetchJson {
  return async (req) => {
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: response.status, json, text };
  };
}

/** The real binary transport, for downloading a completed PDF as bytes. */
export function buildFetchBytesTransport(): EsignFetchBytes {
  return async (url, headers) => {
    const response = await fetch(url, { method: "GET", headers });
    const arrayBuffer = await response.arrayBuffer();
    return {
      status: response.status,
      bytes: Buffer.from(arrayBuffer),
      contentType: response.headers.get("content-type"),
    };
  };
}

// ---------------------------------------------------------------------------
// Resolution (three-state, mirrors resolveShippingProvider)
// ---------------------------------------------------------------------------

/** Injectable transports so a test never touches global fetch. */
export interface ResolveEsignDeps {
  fetchJson?: EsignFetchJson;
  fetchBytes?: EsignFetchBytes;
}

function parseTtlMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Chooses the e-sign provider. Defaults to Disabled.
 *
 *   1. RESEARCH_ESIGN_ENABLED !== "true"                 -> Disabled (feature off, silent).
 *   2. enabled but provider unconfigured                 -> Disabled (routes surface capability_disabled).
 *   3. enabled + configured                              -> OpenSignAdapter, AFTER the synthetic-data guard.
 *
 * Every env name is server-side only and never exposed to the client. Values are
 * never logged; the synthetic guard is handed only non-secret fields.
 */
export function resolveEsignProvider(
  env: NodeJS.ProcessEnv = process.env,
  deps?: ResolveEsignDeps,
): EsignProvider {
  if (env.RESEARCH_ESIGN_ENABLED !== "true") return new DisabledEsignProvider();

  const baseUrl = env.OPENSIGN_BASE_URL;
  const apiToken = env.OPENSIGN_API_TOKEN;
  const webhookSecret = env.OPENSIGN_WEBHOOK_SECRET;
  if (env.RESEARCH_ESIGN_PROVIDER !== "opensign" || !baseUrl || !apiToken || !webhookSecret) {
    return new DisabledEsignProvider();
  }

  const config: OpenSignAdapterConfig = {
    baseUrl,
    apiToken,
    webhookSecret,
    redirectUrl: env.OPENSIGN_REDIRECT_URL ?? null,
    templateNamespace: env.OPENSIGN_TEMPLATE_NAMESPACE ?? "xenios-research",
    sandboxMode: env.OPENSIGN_SANDBOX_MODE === "true",
    emailOtpEnabled: env.OPENSIGN_EMAIL_OTP_ENABLED === "true",
    accessCodeEnabled: env.OPENSIGN_ACCESS_CODE_ENABLED === "true",
    signingLinkTtlMinutes: parseTtlMinutes(env.OPENSIGN_SIGNING_LINK_TTL_MINUTES),
  };

  // A live adapter must never construct over sandbox fixtures in a
  // production-like process. Only non-secret fields are scanned, so the guard's
  // own error can never carry the token or the webhook secret. Throws BEFORE the
  // adapter (and any provider call) exists.
  assertNoSyntheticDataInProduction(
    { esign: { baseUrl: config.baseUrl, templateNamespace: config.templateNamespace } },
    env,
  );

  const fetchJson = deps?.fetchJson ?? buildFetchTransport();
  const fetchBytes = deps?.fetchBytes ?? buildFetchBytesTransport();
  return new OpenSignAdapter(config, fetchJson, fetchBytes);
}
