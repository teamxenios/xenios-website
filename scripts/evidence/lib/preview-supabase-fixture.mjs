/**
 * Isolated Supabase-shaped fixture for the production-composition preview.
 *
 * The preview server must exercise the durable Early Access session adapter:
 * production refuses the in-memory application repository. A fixture that
 * rejects every POST therefore makes the principal launch surface impossible
 * to render. This handler implements only the four service-role RPCs that mint,
 * resolve, and revoke an opaque preview session. Every value retained here is a
 * lowercase SHA-256 digest, all state is process-local and bounded, and every
 * other mutation is refused.
 */

const LOWER_HEX_SHA256 = /^[a-f0-9]{64}$/u;

export const PREVIEW_PRIVATE_ACCESS_ROLE = "private_early_access_member";
export const PREVIEW_NONCE_TTL_MS = 5 * 60 * 1000;
export const PREVIEW_SESSION_TTL_MS = 240 * 60 * 1000;
export const PREVIEW_SESSION_STATE_LIMIT = 4096;
export const PREVIEW_SUPABASE_BODY_LIMIT_BYTES = 16 * 1024;

const RPC = Object.freeze({
  issueNonce: "research_private_early_access_issue_nonce",
  exchangeNonce: "research_private_early_access_exchange_nonce",
  sessionActive: "research_private_early_access_session_active",
  revokeSession: "research_private_early_access_revoke_session",
});

const RPC_PREFIX = "/rest/v1/rpc/";

function sendJson(response, statusCode, value, extraHeaders = {}) {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [name, headerValue] of Object.entries(extraHeaders)) {
    response.setHeader(name, headerValue);
  }
  response.end(JSON.stringify(value));
}

function exactKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && expected.every((key, index) => key === actual[index]);
}

function validCommon(args, ownerId, expectedKeys) {
  return exactKeys(args, [...expectedKeys].sort()) &&
    args.p_owner_id === ownerId &&
    args.p_access_role === PREVIEW_PRIVATE_ACCESS_ROLE;
}

async function readJsonObject(request, limitBytes) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limitBytes) {
      const error = new Error("preview Supabase request body exceeds the fixed limit");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
  } catch {
    const error = new Error("preview Supabase request body is not JSON");
    error.code = "INVALID_JSON";
    throw error;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("preview Supabase request body is not an object");
    error.code = "INVALID_JSON";
    throw error;
  }
  return parsed;
}

function scalarForInvalidCall(rpcName) {
  return rpcName === RPC.issueNonce || rpcName === RPC.exchangeNonce ? null : false;
}

/**
 * Return one Node HTTP request handler. The caller binds it only to an
 * ephemeral 127.0.0.1 port and never exposes that port through the evidence
 * proxy.
 */
export function createPreviewSupabaseRequestHandler({
  ownerId,
  serviceRoleKey,
  now = () => Date.now(),
  stateLimit = PREVIEW_SESSION_STATE_LIMIT,
  bodyLimitBytes = PREVIEW_SUPABASE_BODY_LIMIT_BYTES,
} = {}) {
  if (typeof ownerId !== "string" || ownerId.length === 0) {
    throw new Error("preview Supabase fixture requires its exact session owner");
  }
  if (typeof serviceRoleKey !== "string" || serviceRoleKey.length === 0) {
    throw new Error("preview Supabase fixture requires its placeholder service-role key");
  }
  if (typeof now !== "function") throw new Error("preview Supabase fixture requires a clock");
  if (!Number.isSafeInteger(stateLimit) || stateLimit < 1 || stateLimit > 10_000) {
    throw new Error("preview Supabase fixture state limit is invalid");
  }
  if (!Number.isSafeInteger(bodyLimitBytes) || bodyLimitBytes < 256 || bodyLimitBytes > 64 * 1024) {
    throw new Error("preview Supabase fixture body limit is invalid");
  }

  const nonces = new Map();
  const sessions = new Map();

  return async function previewSupabaseRequest(request, response) {
    try {
      const method = (request.method || "GET").toUpperCase();
      const requestPath = new URL(request.url || "/", "http://127.0.0.1").pathname;

      if (method === "GET" || method === "HEAD") {
        const payload = requestPath.startsWith("/auth/v1/admin/users")
          ? { users: [] }
          : requestPath.startsWith("/auth/v1/")
            ? { user: null }
            : [];
        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Content-Range", "*/0");
        response.end(method === "HEAD" ? "" : JSON.stringify(payload));
        return;
      }

      const rpcName = requestPath.startsWith(RPC_PREFIX)
        ? requestPath.slice(RPC_PREFIX.length)
        : "";
      if (method !== "POST" || !Object.values(RPC).includes(rpcName)) {
        sendJson(response, 503, {
          code: "preview_write_refused",
          message: "The isolated preview accepts only its ephemeral private-session RPC lifecycle.",
        });
        return;
      }

      const authorization = request.headers.authorization;
      const apiKey = request.headers.apikey;
      if (authorization !== `Bearer ${serviceRoleKey}` || apiKey !== serviceRoleKey) {
        sendJson(response, 403, {
          code: "preview_service_role_refused",
          message: "The isolated preview session RPC requires its local placeholder service role.",
        });
        return;
      }

      const args = await readJsonObject(request, bodyLimitBytes);
      const clockMs = now();
      if (!Number.isFinite(clockMs)) throw new Error("preview Supabase fixture clock is invalid");

      if (rpcName === RPC.issueNonce) {
        if (!validCommon(args, ownerId, ["p_access_role", "p_nonce_hash", "p_owner_id"]) ||
            !LOWER_HEX_SHA256.test(args.p_nonce_hash)) {
          sendJson(response, 200, null);
          return;
        }
        const existing = nonces.get(args.p_nonce_hash);
        if (existing) {
          sendJson(
            response,
            200,
            !existing.consumed && existing.expiresAtMs > clockMs
              ? new Date(existing.expiresAtMs).toISOString()
              : null,
          );
          return;
        }
        if (nonces.size >= stateLimit) {
          sendJson(response, 200, null);
          return;
        }
        const expiresAtMs = clockMs + PREVIEW_NONCE_TTL_MS;
        nonces.set(args.p_nonce_hash, { consumed: false, issuedAtMs: clockMs, expiresAtMs });
        sendJson(response, 200, new Date(expiresAtMs).toISOString());
        return;
      }

      if (rpcName === RPC.exchangeNonce) {
        if (!validCommon(args, ownerId, ["p_access_role", "p_nonce_hash", "p_owner_id", "p_session_hash"]) ||
            !LOWER_HEX_SHA256.test(args.p_nonce_hash) ||
            !LOWER_HEX_SHA256.test(args.p_session_hash)) {
          sendJson(response, 200, null);
          return;
        }
        const nonce = nonces.get(args.p_nonce_hash);
        if (!nonce || nonce.consumed || nonce.expiresAtMs <= clockMs ||
            nonce.issuedAtMs > clockMs ||
            sessions.has(args.p_session_hash) || sessions.size >= stateLimit) {
          sendJson(response, 200, null);
          return;
        }
        const expiresAtMs = clockMs + PREVIEW_SESSION_TTL_MS;
        sessions.set(args.p_session_hash, {
          issuedAtMs: clockMs,
          expiresAtMs,
          revoked: false,
        });
        nonce.consumed = true;
        sendJson(response, 200, new Date(expiresAtMs).toISOString());
        return;
      }

      if (!validCommon(args, ownerId, ["p_access_role", "p_owner_id", "p_session_hash"]) ||
          !LOWER_HEX_SHA256.test(args.p_session_hash)) {
        sendJson(response, 200, scalarForInvalidCall(rpcName));
        return;
      }
      const session = sessions.get(args.p_session_hash);
      if (rpcName === RPC.sessionActive) {
        sendJson(response, 200, Boolean(
          session &&
          !session.revoked &&
          session.issuedAtMs <= clockMs &&
          session.expiresAtMs > clockMs,
        ));
        return;
      }
      if (rpcName === RPC.revokeSession) {
        if (session) session.revoked = true;
        sendJson(response, 200, Boolean(session));
        return;
      }
      throw new Error("unreachable preview Supabase RPC branch");
    } catch (error) {
      if (response.headersSent || response.writableEnded) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      if (error?.code === "BODY_TOO_LARGE") {
        sendJson(response, 413, { code: "preview_body_too_large" });
        return;
      }
      if (error?.code === "INVALID_JSON") {
        sendJson(response, 400, { code: "preview_invalid_json" });
        return;
      }
      sendJson(response, 500, { code: "preview_fixture_failure" });
    }
  };
}
