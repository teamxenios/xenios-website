import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "./config";

let clientPromise: Promise<SupabaseClient | null> | null = null;

// Browser-side Supabase client using the public anon/publishable key only.
// Used exclusively for admin login (Supabase Auth). Never holds the service key.
export function getSupabaseBrowser(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = getConfig().then((cfg) => {
      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
      return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    });
  }
  return clientPromise;
}
