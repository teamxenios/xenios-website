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

// ---------------------------------------------------------------------------
// Admin dashboard helpers (service-role; only reachable behind admin auth).
// ---------------------------------------------------------------------------

export interface BookingRow {
  id: string;
  name: string | null;
  email: string | null;
  event_time: string | null;
  source: string | null;
  status: string | null;
  created_at: string;
}

export interface NoteRow {
  id: string;
  record_type: string;
  record_id: string;
  note: string;
  author: string | null;
  created_at: string;
}

export interface ConceptItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  status: string;
  date: string | null;
  visible: boolean;
  sort_order: number;
}

export async function listWaitlist(): Promise<WaitlistRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("waitlist_signups")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WaitlistRow[];
}

export async function listLoi(): Promise<LoiRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("loi_submissions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LoiRow[];
}

export async function listBookings(): Promise<BookingRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendly_bookings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookingRow[];
}

export async function updateWaitlistStatus(id: string, status: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("waitlist_signups")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateLoiStatus(id: string, status: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("loi_submissions")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function listNotes(recordType: string, recordId: string): Promise<NoteRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_notes")
    .select("*")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NoteRow[];
}

export async function listNotesByType(recordType: string): Promise<NoteRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_notes")
    .select("*")
    .eq("record_type", recordType)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NoteRow[];
}

export async function addNote(input: {
  record_type: string;
  record_id: string;
  note: string;
  author?: string | null;
}): Promise<NoteRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("admin_notes")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as NoteRow;
}

export async function insertBooking(input: {
  name?: string | null;
  email?: string | null;
  event_time?: string | null;
  source?: string | null;
  status?: string | null;
}): Promise<BookingRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("calendly_bookings")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as BookingRow;
}

export async function listVisibleConcepts(): Promise<ConceptItem[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("concept_gallery_items")
    .select("*")
    .eq("visible", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ConceptItem[];
}

export interface AnalyticsSummary {
  waitlistTotal: number;
  loiTotal: number;
  bookingsTotal: number;
  displayCount: number;
  daily: { date: string; waitlist: number; loi: number; bookings: number }[];
}

export async function getAnalytics(): Promise<AnalyticsSummary> {
  const [wl, loi, bk] = await Promise.all([listWaitlist(), listLoi(), listBookings()]);
  const days = 30;
  const today = new Date();
  const buckets: Record<string, { waitlist: number; loi: number; bookings: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets[d.toISOString().slice(0, 10)] = { waitlist: 0, loi: 0, bookings: 0 };
  }
  const bump = (ts: string | null, key: "waitlist" | "loi" | "bookings") => {
    if (!ts) return;
    const k = ts.slice(0, 10);
    if (buckets[k]) buckets[k][key]++;
  };
  wl.forEach((r) => bump(r.created_at, "waitlist"));
  loi.forEach((r) => bump(r.created_at, "loi"));
  bk.forEach((r) => bump(r.created_at, "bookings"));
  return {
    waitlistTotal: wl.length,
    loiTotal: loi.length,
    bookingsTotal: bk.length,
    displayCount: WAITLIST_BASE_COUNT + wl.length,
    daily: Object.entries(buckets).map(([date, v]) => ({ date, ...v })),
  };
}
