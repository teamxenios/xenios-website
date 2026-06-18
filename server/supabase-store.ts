import { getSupabaseAdmin } from "./supabase";

// The public counter is a fixed base plus the real number of waitlist rows.
// Locked at 556 today (Part 5a / appendix). New signups increment it.
export const WAITLIST_BASE_COUNT = 556;

export interface Attribution {
  source_page?: string | null;
  landing_page?: string | null;
  referrer_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
}

export interface WaitlistInput extends Attribution {
  name?: string | null;
  email: string;
  phone?: string | null;
  role?: string | null;
  company?: string | null;
  city?: string | null;
  handle_or_url?: string | null;
  client_count?: string | null;
  interest?: string | null;
  consent?: boolean;
  ip?: string | null;
}

export interface LoiInput extends Attribution {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  business_name?: string | null;
  role?: string | null;
  url_or_handle?: string | null;
  client_count?: string | null;
  why_interested?: string | null;
  nonbinding_ack?: boolean;
  ip?: string | null;
}

export interface WaitlistRow extends WaitlistInput {
  id: string;
  status: string;
  email_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoiRow extends LoiInput {
  id: string;
  status: string;
  email_status: string | null;
  created_at: string;
}

// Count of real signups (excludes the display base offset).
export async function getWaitlistRowCount(): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("waitlist_signups")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function getDisplayCount(): Promise<number> {
  const rows = await getWaitlistRowCount();
  return WAITLIST_BASE_COUNT + rows;
}

// Upsert on email: a repeat signup updates the existing row with the latest
// attribution + timestamp instead of creating a duplicate.
export async function upsertWaitlist(input: WaitlistInput): Promise<WaitlistRow> {
  const row = {
    ...input,
    email: input.email.toLowerCase().trim(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabaseAdmin()
    .from("waitlist_signups")
    .upsert(row, { onConflict: "email" })
    .select()
    .single();
  if (error) throw error;
  return data as WaitlistRow;
}

export async function setWaitlistEmailStatus(id: string, status: "sent" | "failed"): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("waitlist_signups")
    .update({ email_status: status })
    .eq("id", id);
  if (error) console.error("[supabase] failed to set waitlist email_status:", error.message);
}

// LOI keeps history: always insert a new row (no dedupe).
export async function insertLoi(input: LoiInput): Promise<LoiRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("loi_submissions")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as LoiRow;
}

export async function setLoiEmailStatus(id: string, status: "sent" | "failed"): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("loi_submissions")
    .update({ email_status: status })
    .eq("id", id);
  if (error) console.error("[supabase] failed to set loi email_status:", error.message);
}
