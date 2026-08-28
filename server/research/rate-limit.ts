import { getSupabaseAdmin, supabaseConfigured } from "../supabase";

// Durable fixed-window rate limiting (V3 section 71: an in-memory map is
// insufficient when the service can run across multiple instances). The
// counter lives in Postgres behind one atomic function
// (research_rate_limit_hit, supabase/research-referral-fraud.sql), so every
// instance shares the same window.
//
// Default failure posture: if the database call fails or Supabase is
// unconfigured, we fall back to a per-process in-memory window rather than
// blocking the request path. Callers that rely on one shared durable budget
// can explicitly deny instead; they must never mistake this process-local
// fallback for durable cross-instance truth.

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, windowSeconds: number, maxHits: number): boolean {
  const now = Date.now();
  // Opportunistic sweep so the fallback map cannot grow without bound.
  if (memory.size > 10_000) {
    memory.forEach((v, k) => {
      if (v.resetAt < now) memory.delete(k);
    });
  }
  const bucket = memory.get(key);
  if (!bucket || bucket.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= maxHits;
}

export type RateLimitFailurePolicy = "memory_fallback" | "deny";

export type RateLimitOptions = Readonly<{
  durableFailurePolicy?: RateLimitFailurePolicy;
}>;

// Returns true when the hit is ALLOWED (inside the window's budget).
export async function rateLimitHit(
  key: string,
  windowSeconds: number,
  maxHits: number,
  options: RateLimitOptions = {},
): Promise<boolean> {
  if (supabaseConfigured()) {
    try {
      const client: any = getSupabaseAdmin();
      if (typeof client.rpc === "function") {
        const { data, error } = await client.rpc("research_rate_limit_hit", {
          p_key: key,
          p_window_seconds: windowSeconds,
          p_max_hits: maxHits,
        });
        if (!error && typeof data === "boolean") return data;
      }
    } catch (err) {
      console.error("[rate limit] durable limiter failed:", err);
    }
  }
  if (options.durableFailurePolicy === "deny") return false;
  return memoryHit(key, windowSeconds, maxHits);
}

/**
 * The caller's address, as the deployment's proxy chain actually establishes it.
 *
 * This used to read `x-forwarded-for` and take the LEFTMOST entry, which is not
 * the client: it is whatever the client SENT. Cloudflare appends the address it
 * observes rather than replacing the header, so anyone can prepend a value of
 * their choosing and it lands in that position. Every limiter keyed on it —
 * the shared research password door, account claim, forgot-password,
 * application submit, resend-link — could therefore be bypassed completely by
 * varying one header per request, which is not a weak limit but no limit at
 * all. Account claim is the worst of them: it consumes a one-time claim token
 * and sets a new password, so an unthrottled grind is an account takeover
 * before the real applicant ever signs in.
 *
 * `req.ip` is Express's own derivation through the app's `trust proxy` hop
 * count, which this deployment sets to the verified number of hops. A
 * client-supplied X-Forwarded-For is appended to rather than honoured, so the
 * value here is the address the edge recorded and cannot be chosen by the
 * caller. The socket address is the fallback for compositions that do not run
 * behind Express.
 */
export function requestIp(req: {
  ip?: unknown;
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string | null };
}): string {
  if (typeof req.ip === "string" && req.ip.length > 0) return req.ip;
  return req.socket?.remoteAddress ?? "unknown";
}
