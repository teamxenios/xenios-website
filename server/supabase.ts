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

// One-time, non-fatal self-test of the admin key's privileges. An anon-grade
// key in the service slot is a SILENT catastrophe: every RLS-protected read
// returns empty (looking like missing data) and every write fails with an RLS
// violation surfaced only as a generic 500. This happened in production on
// 2026-07-19 when the project's API keys were migrated to Supabase's new
// format and the sb_publishable_ key landed in SUPABASE_SERVICE_ROLE_KEY.
// listUsers requires service-role privileges, so it cleanly distinguishes the
// two grades. Log-only; never blocks a request.
let serviceKeyChecked = false;
function verifyServiceRole(client: SupabaseClient): void {
  if (serviceKeyChecked) return;
  serviceKeyChecked = true;
  void client.auth.admin
    .listUsers({ page: 1, perPage: 1 })
    .then(({ error }) => {
      if (error) {
        console.error(
          "[supabase] SERVICE KEY CHECK FAILED: the key in SUPABASE_SERVICE_ROLE_KEY does not have " +
            "service-role privileges. Symptoms: RLS-protected reads return empty and every insert " +
            "fails with an RLS violation (generic 500s on applications, waitlist, outbox). With " +
            "Supabase's new API keys this variable must hold the sb_secret_... key, never the " +
            "sb_publishable_... key. Provider said: " + error.message,
        );
      } else {
        console.log("[supabase] service key check ok (service-role privileges confirmed)");
      }
    })
    .catch((err) => console.error("[supabase] service key check errored (network?):", err));
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
    verifyServiceRole(_admin);
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
