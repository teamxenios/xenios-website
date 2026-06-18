import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

// Node 20 has no global WebSocket. supabase-js eagerly builds a realtime client
// at construction, so we must supply a transport even though we never subscribe.
const realtime = { transport: ws as unknown as typeof WebSocket };

// Lazy clients: never construct at import time, so a missing key cannot crash
// the whole server. Supabase-backed routes guard with supabaseConfigured().

let _admin: SupabaseClient | null = null;
let _anon: SupabaseClient | null = null;

const url = () => process.env.SUPABASE_URL ?? "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = () => process.env.SUPABASE_ANON_KEY ?? "";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Server-side admin client. Uses the service_role key, which bypasses RLS.
// NEVER expose this client or the service_role key to the browser.
export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    if (!url() || !serviceKey()) {
      throw new Error("Supabase admin not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");
    }
    _admin = createClient(url(), serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime,
    });
  }
  return _admin;
}

// Anon client used only to verify a user's Supabase Auth JWT (admin login).
export function getSupabaseAnon(): SupabaseClient {
  if (!_anon) {
    if (!url() || !anonKey()) {
      throw new Error("Supabase anon not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing)");
    }
    _anon = createClient(url(), anonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime,
    });
  }
  return _anon;
}
