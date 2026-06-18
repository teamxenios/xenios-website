import { Fragment, useEffect, useState, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Local copies of the row/summary shapes the admin API returns.
// These mirror server/supabase-store.ts. We never import server code here.
interface WaitlistRow {
  id: string;
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
  source_page?: string | null;
  landing_page?: string | null;
  referrer_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  status: string;
  email_status: string | null;
  created_at: string;
  updated_at: string;
}

interface LoiRow {
  id: string;
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
  source_page?: string | null;
  landing_page?: string | null;
  referrer_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  status: string;
  email_status: string | null;
  created_at: string;
}

interface BookingRow {
  id: string;
  name: string | null;
  email: string | null;
  event_time: string | null;
  source: string | null;
  status: string | null;
  created_at: string;
}

interface NoteRow {
  id: string;
  record_type: string;
  record_id: string;
  note: string;
  author: string | null;
  created_at: string;
}

interface AnalyticsSummary {
  waitlistTotal: number;
  loiTotal: number;
  bookingsTotal: number;
  displayCount: number;
  daily: { date: string; waitlist: number; loi: number; bookings: number }[];
}

const WAITLIST_STATUSES = [
  "New",
  "Contacted",
  "Qualified",
  "Not a fit",
  "Converted",
  "Archived",
];

const LOI_STATUSES = [
  "New",
  "Reviewing",
  "Followed up",
  "Signed",
  "Not moving forward",
];

type TabKey = "waitlist" | "loi" | "bookings" | "analytics";

function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncate(value?: string | null, max = 80): string {
  if (!value) return "";
  return value.length > max ? value.slice(0, max) + "..." : value;
}

export default function Admin() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(null);

  // Login form state.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("waitlist");

  useEffect(() => {
    let unsub: (() => void) | undefined;
    getSupabaseBrowser().then((client) => {
      if (!client) {
        setConfigured(false);
        setAuthReady(true);
        return;
      }
      setConfigured(true);
      setSupabase(client);
      client.auth.getSession().then(({ data }) => {
        setSession(!!data.session);
        setToken(data.session?.access_token ?? null);
        setAuthReady(true);
      });
      const { data: listener } = client.auth.onAuthStateChange((_event, s) => {
        setSession(!!s);
        setToken(s?.access_token ?? null);
      });
      unsub = () => listener.subscription.unsubscribe();
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoginError(null);
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoginError(error.message || "Admin login failed. Check your email and password.");
      }
    } catch (err: any) {
      setLoginError(err?.message || "Admin login failed. Check your email and password.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAdminEmail(null);
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/admin/me", { headers: { Authorization: "Bearer " + token } })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.success) setAdminEmail(j.email ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <PageShell>
      <SeoHead title="xenios admin" description="Admin dashboard" path="/admin" />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">ADMIN</p>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="display-l">Dashboard</h1>
          {session && (
            <div className="flex items-center gap-4">
              {adminEmail && (
                <span className="body-s text-ink-mute" data-testid="text-admin-email">
                  {adminEmail}
                </span>
              )}
              <button
                type="button"
                className="btn"
                onClick={handleSignOut}
                data-testid="button-admin-signout"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="container-x pb-24 rule-top pt-12">
        {configured === false && (
          <p className="body-l text-ink-2" data-testid="text-admin-not-configured">
            Admin is not configured yet.
          </p>
        )}

        {configured && !authReady && (
          <p className="body-l text-ink-mute" data-testid="text-admin-loading">
            Loading...
          </p>
        )}

        {configured && authReady && !session && (
          <LoginScreen
            email={email}
            password={password}
            onEmail={setEmail}
            onPassword={setPassword}
            onSubmit={handleSignIn}
            error={loginError}
            submitting={signingIn}
          />
        )}

        {configured && authReady && session && token && (
          <>
            <div className="flex flex-wrap gap-2 mb-10" role="tablist">
              <TabButton id="tab-waitlist" active={tab === "waitlist"} onClick={() => setTab("waitlist")}>
                Waitlist
              </TabButton>
              <TabButton id="tab-loi" active={tab === "loi"} onClick={() => setTab("loi")}>
                Early interest
              </TabButton>
              <TabButton id="tab-bookings" active={tab === "bookings"} onClick={() => setTab("bookings")}>
                Bookings
              </TabButton>
              <TabButton id="tab-analytics" active={tab === "analytics"} onClick={() => setTab("analytics")}>
                Analytics
              </TabButton>
            </div>

            {tab === "waitlist" && <WaitlistTab token={token} />}
            {tab === "loi" && <LoiTab token={token} />}
            {tab === "bookings" && <BookingsTab token={token} />}
            {tab === "analytics" && <AnalyticsTab token={token} />}
          </>
        )}
      </section>
    </PageShell>
  );
}

function TabButton({
  id,
  active,
  onClick,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`btn ${active ? "btn-primary" : ""}`}
      data-testid={id}
    >
      {children}
    </button>
  );
}

function LoginScreen({
  email,
  password,
  onEmail,
  onPassword,
  onSubmit,
  error,
  submitting,
}: {
  email: string;
  password: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  error: string | null;
  submitting: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="max-w-[40ch] space-y-6" data-testid="form-admin-login">
      <h2 className="display-s">Sign in</h2>
      <div>
        <label htmlFor="admin-email" className="form-label">
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          className="input-field"
          data-testid="input-admin-email"
        />
      </div>
      <div>
        <label htmlFor="admin-password" className="form-label">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          className="input-field"
          data-testid="input-admin-password"
        />
      </div>
      {error && (
        <div
          className="border border-[color:var(--error)] text-[color:var(--error)] px-4 py-3 rounded body-s"
          data-testid="text-login-error"
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary w-full md:w-auto"
        data-testid="button-admin-signin"
      >
        {submitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

function useAdminData<T>(token: string, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(path, { headers: { Authorization: "Bearer " + token } })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j?.success) {
          throw new Error(j?.error || "Failed to load data.");
        }
        return j.data as T;
      })
      .then((d) => setData(d))
      .catch((err: any) => setError(err?.message || "Failed to load data."))
      .finally(() => setLoading(false));
  }, [token, path]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

async function exportCsv(token: string, type: "waitlist" | "loi" | "bookings") {
  const res = await fetch("/api/admin/export?type=" + type, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = type + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function StateLine({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <p className="body-s text-ink-mute" data-testid="text-data-loading">
        Loading...
      </p>
    );
  }
  if (error) {
    return (
      <p className="body-s text-[color:var(--error)]" data-testid="text-data-error">
        {error}
      </p>
    );
  }
  return null;
}

function FilterBar({
  type,
  search,
  onSearch,
  role,
  onRole,
  source,
  onSource,
  roles,
  sources,
  token,
}: {
  type: "waitlist" | "loi" | "bookings";
  search: string;
  onSearch: (v: string) => void;
  role: string;
  onRole: (v: string) => void;
  source: string;
  onSource: (v: string) => void;
  roles: string[];
  sources: string[];
  token: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 mb-6">
      <div>
        <label htmlFor={`search-${type}`} className="form-label">
          Search
        </label>
        <input
          id={`search-${type}`}
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="name, email, company"
          className="input-field"
          data-testid={`input-search-${type}`}
        />
      </div>
      <div>
        <label htmlFor={`filter-role-${type}`} className="form-label">
          Role
        </label>
        <select
          id={`filter-role-${type}`}
          value={role}
          onChange={(e) => onRole(e.target.value)}
          className="input-field"
          data-testid={`select-filter-role-${type}`}
        >
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`filter-source-${type}`} className="form-label">
          Source
        </label>
        <select
          id={`filter-source-${type}`}
          value={source}
          onChange={(e) => onSource(e.target.value)}
          className="input-field"
          data-testid={`select-filter-source-${type}`}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => exportCsv(token, type)}
        data-testid={`button-export-${type}`}
      >
        Export CSV
      </button>
    </div>
  );
}

function NotesPanel({
  token,
  recordType,
  recordId,
}: {
  token: string;
  recordType: "waitlist" | "loi";
  recordId: string;
}) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/notes?record_type=${recordType}&record_id=${recordId}`, {
      headers: { Authorization: "Bearer " + token },
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j?.success) throw new Error(j?.error || "Failed to load notes.");
        return j.data as NoteRow[];
      })
      .then((d) => setNotes(d))
      .catch((err: any) => setError(err?.message || "Failed to load notes."))
      .finally(() => setLoading(false));
  }, [token, recordType, recordId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addNote() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          record_type: recordType,
          record_id: recordId,
          note: draft.trim(),
        }),
      });
      const j = await res.json();
      if (res.ok && j?.success) {
        setDraft("");
        load();
      } else {
        setError(j?.error || "Failed to add note.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to add note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-ink/5 rounded p-4 space-y-4" data-testid={`panel-notes-${recordId}`}>
      {loading && <p className="body-s text-ink-mute">Loading notes...</p>}
      {error && <p className="body-s text-[color:var(--error)]">{error}</p>}
      {!loading && notes.length === 0 && <p className="body-s text-ink-mute">No notes yet.</p>}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="body-s text-ink-2" data-testid={`text-note-${n.id}`}>
            <span className="text-ink-mute mono-cap mr-2">{formatDate(n.created_at)}</span>
            {n.note}
          </li>
        ))}
      </ul>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder="Add a note"
        className="input-field textarea-field"
        data-testid={`textarea-note-${recordId}`}
      />
      <button
        type="button"
        className="btn"
        disabled={saving}
        onClick={addNote}
        data-testid={`button-add-note-${recordId}`}
      >
        {saving ? "Adding..." : "Add note"}
      </button>
    </div>
  );
}

function WaitlistTab({ token }: { token: string }) {
  const { data, loading, error, reload } = useAdminData<WaitlistRow[]>(token, "/api/admin/waitlist");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [source, setSource] = useState("");
  const [openNotes, setOpenNotes] = useState<string | null>(null);

  const rows = data ?? [];
  const roles = Array.from(new Set(rows.map((r) => r.role).filter(Boolean) as string[]));
  const sources = Array.from(new Set(rows.map((r) => r.source_page).filter(Boolean) as string[]));

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const hit =
      !q ||
      (r.name ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.company ?? "").toLowerCase().includes(q);
    const roleHit = !role || r.role === role;
    const sourceHit = !source || r.source_page === source;
    return hit && roleHit && sourceHit;
  });

  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/waitlist/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ status }),
    });
    reload();
  }

  return (
    <div data-testid="tab-content-waitlist">
      <FilterBar
        type="waitlist"
        search={search}
        onSearch={setSearch}
        role={role}
        onRole={setRole}
        source={source}
        onSource={setSource}
        roles={roles}
        sources={sources}
        token={token}
      />
      <StateLine loading={loading} error={error} />
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-left body-s border-collapse" data-testid="table-waitlist">
            <thead>
              <tr className="mono-cap text-ink-mute border-b border-ink/15">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 pr-4">Clients</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Campaign</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-ink/10 align-top" data-testid={`row-waitlist-${r.id}`}>
                    <td className="py-2 pr-4">{r.name}</td>
                    <td className="py-2 pr-4">{r.email}</td>
                    <td className="py-2 pr-4">{r.role}</td>
                    <td className="py-2 pr-4">{r.company}</td>
                    <td className="py-2 pr-4">{r.client_count}</td>
                    <td className="py-2 pr-4">{r.source_page}</td>
                    <td className="py-2 pr-4">{r.utm_campaign}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="py-2 pr-4">
                      <select
                        value={r.status}
                        onChange={(e) => setStatus(r.id, e.target.value)}
                        className="input-field"
                        data-testid={`select-status-${r.id}`}
                      >
                        {WAITLIST_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setOpenNotes(openNotes === r.id ? null : r.id)}
                        data-testid={`button-notes-${r.id}`}
                      >
                        Notes
                      </button>
                    </td>
                  </tr>
                  {openNotes === r.id && (
                    <tr key={r.id + "-notes"}>
                      <td colSpan={10} className="py-2 pr-4">
                        <NotesPanel token={token} recordType="waitlist" recordId={r.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-ink-mute">
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LoiTab({ token }: { token: string }) {
  const { data, loading, error, reload } = useAdminData<LoiRow[]>(token, "/api/admin/loi");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [source, setSource] = useState("");
  const [openNotes, setOpenNotes] = useState<string | null>(null);

  const rows = data ?? [];
  const roles = Array.from(new Set(rows.map((r) => r.role).filter(Boolean) as string[]));
  const sources = Array.from(new Set(rows.map((r) => r.source_page).filter(Boolean) as string[]));

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const hit =
      !q ||
      (r.name ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.business_name ?? "").toLowerCase().includes(q);
    const roleHit = !role || r.role === role;
    const sourceHit = !source || r.source_page === source;
    return hit && roleHit && sourceHit;
  });

  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/loi/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ status }),
    });
    reload();
  }

  return (
    <div data-testid="tab-content-loi">
      <FilterBar
        type="loi"
        search={search}
        onSearch={setSearch}
        role={role}
        onRole={setRole}
        source={source}
        onSource={setSource}
        roles={roles}
        sources={sources}
        token={token}
      />
      <StateLine loading={loading} error={error} />
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-left body-s border-collapse" data-testid="table-loi">
            <thead>
              <tr className="mono-cap text-ink-mute border-b border-ink/15">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Business</th>
                <th className="py-2 pr-4">Clients</th>
                <th className="py-2 pr-4">Why interested</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-ink/10 align-top" data-testid={`row-loi-${r.id}`}>
                    <td className="py-2 pr-4">{r.name}</td>
                    <td className="py-2 pr-4">{r.email}</td>
                    <td className="py-2 pr-4">{r.role}</td>
                    <td className="py-2 pr-4">{r.business_name}</td>
                    <td className="py-2 pr-4">{r.client_count}</td>
                    <td className="py-2 pr-4 max-w-[28ch]">{truncate(r.why_interested)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="py-2 pr-4">
                      <select
                        value={r.status}
                        onChange={(e) => setStatus(r.id, e.target.value)}
                        className="input-field"
                        data-testid={`select-status-${r.id}`}
                      >
                        {LOI_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setOpenNotes(openNotes === r.id ? null : r.id)}
                        data-testid={`button-notes-${r.id}`}
                      >
                        Notes
                      </button>
                    </td>
                  </tr>
                  {openNotes === r.id && (
                    <tr key={r.id + "-notes"}>
                      <td colSpan={9} className="py-2 pr-4">
                        <NotesPanel token={token} recordType="loi" recordId={r.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-ink-mute">
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BookingsTab({ token }: { token: string }) {
  const { data, loading, error } = useAdminData<BookingRow[]>(token, "/api/admin/bookings");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [source, setSource] = useState("");

  const rows = data ?? [];
  const sources = Array.from(new Set(rows.map((r) => r.source).filter(Boolean) as string[]));

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const hit =
      !q ||
      (r.name ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q);
    const sourceHit = !source || r.source === source;
    return hit && sourceHit;
  });

  return (
    <div data-testid="tab-content-bookings">
      <FilterBar
        type="bookings"
        search={search}
        onSearch={setSearch}
        role={role}
        onRole={setRole}
        source={source}
        onSource={setSource}
        roles={[]}
        sources={sources}
        token={token}
      />
      <StateLine loading={loading} error={error} />
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-left body-s border-collapse" data-testid="table-bookings">
            <thead>
              <tr className="mono-cap text-ink-mute border-b border-ink/15">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Event time</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-ink/10" data-testid={`row-booking-${r.id}`}>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4">{r.email}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(r.event_time)}</td>
                  <td className="py-2 pr-4">{r.source}</td>
                  <td className="py-2 pr-4">{r.status}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDate(r.created_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-ink-mute">
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, testid }: { label: string; value: number; testid: string }) {
  return (
    <div className="border border-ink/15 rounded p-6">
      <p className="mono-cap text-ink-mute mb-2">{label}</p>
      <p className="display-s" data-testid={testid}>
        {value}
      </p>
    </div>
  );
}

function AnalyticsTab({ token }: { token: string }) {
  const { data, loading, error } = useAdminData<AnalyticsSummary>(token, "/api/admin/analytics");

  return (
    <div data-testid="tab-content-analytics">
      <StateLine loading={loading} error={error} />
      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <StatCard label="Waitlist total" value={data.waitlistTotal} testid="text-analytics-waitlist-total" />
            <StatCard label="Early interest total" value={data.loiTotal} testid="text-analytics-loi-total" />
            <StatCard label="Bookings total" value={data.bookingsTotal} testid="text-analytics-bookings-total" />
            <StatCard label="Display count" value={data.displayCount} testid="text-analytics-display-count" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left body-s border-collapse" data-testid="table-analytics-daily">
              <thead>
                <tr className="mono-cap text-ink-mute border-b border-ink/15">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Waitlist</th>
                  <th className="py-2 pr-4">Early interest</th>
                  <th className="py-2 pr-4">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.slice(-14).map((d) => (
                  <tr key={d.date} className="border-b border-ink/10" data-testid={`row-daily-${d.date}`}>
                    <td className="py-2 pr-4 whitespace-nowrap">{d.date}</td>
                    <td className="py-2 pr-4">{d.waitlist}</td>
                    <td className="py-2 pr-4">{d.loi}</td>
                    <td className="py-2 pr-4">{d.bookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
