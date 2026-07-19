import { getSupabaseAdmin, supabaseConfigured } from "../supabase";

// Durable fixed-window rate limiting (V3 section 71: an in-memory map is
// insufficient when the service can run across multiple instances). The
// counter lives in Postgres behind one atomic function
// (research_rate_limit_hit, supabase/research-referral-fraud.sql), so every
// instance shares the same window.
//
// Failure posture: if the database call fails or Supabase is unconfigured,
// we fall back to a per-process in-memory window rather than blocking the
// request path. Rate limiting is a throttle, not a security gate; the
// endpoints behind it keep their own privacy and validation guarantees.

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

// Returns true when the hit is ALLOWED (inside the window's budget).
export async function rateLimitHit(key: string, windowSeconds: number, maxHits: number): Promise<boolean> {
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
      console.error("[rate limit] durable limiter failed, using memory fallback:", err);
    }
  }
  return memoryHit(key, windowSeconds, maxHits);
}

export function requestIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string | null } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}
