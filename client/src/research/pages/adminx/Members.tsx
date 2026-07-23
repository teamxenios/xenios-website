import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ResearchDataTable,
  ResearchFilterBar,
  ResearchPagination,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  useDebounced,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { listMembers } from "../../adapters/adminOps";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/members: the member roster. The dedicated members API
// publishes with the member platform; until it responds, this page renders
// an honest pending state and points at the Applications queue, where active
// memberships are already visible today. Safe preview discipline: rows carry
// account metadata only, never assessment or tracker data.
// ---------------------------------------------------------------------------

type AdminMemberRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  plan: string | null;
  activated_at: string | null;
  last_sign_in_at: string | null;
};

const PAGE_SIZE = 20;

export default function Members() {
  return (
    <AdminScreen
      title="Members"
      lead="Every member account: status, plan, and activation date. Health data never appears in this list."
    >
      {(token) => <MembersBody token={token} />}
    </AdminScreen>
  );
}

function MembersBody({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const resource = useAdminResource<{ ok: boolean; members: AdminMemberRow[] }>(token, listMembers);

  const filtered = useMemo(() => {
    const list = resource.data?.members ?? [];
    const q = debounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.email.toLowerCase().includes(q) ||
        `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLowerCase().includes(q),
    );
  }, [resource.data, debounced]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);

  return (
    <div className="grid gap-6">
      <ResearchFilterBar>
        <ResearchSearch
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search members"
          placeholder="Name or email"
        />
      </ResearchFilterBar>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The member roster publishes with the member platform."
        unavailableBody="This page is built and renders live accounts the moment the members API responds. Until then, active memberships are visible in the Applications queue under the Active chip."
      >
        <ResearchDataTable<AdminMemberRow>
          caption="Member accounts"
          columns={[
            {
              key: "member",
              header: "Member",
              render: (m) => (
                <Link href={`${ADMIN_ROUTES.members}/${m.id}`} className="font-700 underline">
                  {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}
                </Link>
              ),
            },
            { key: "email", header: "Email", render: (m) => <span style={{ overflowWrap: "anywhere" }}>{m.email}</span> },
            {
              key: "status",
              header: "Status",
              render: (m) => (
                <ResearchStatusBadge
                  label={m.status}
                  tone={m.status === "active" ? "success" : m.status === "paused" ? "warning" : "neutral"}
                />
              ),
            },
            { key: "plan", header: "Plan", render: (m) => m.plan ?? "Founding Membership" },
            { key: "activated", header: "Activated", render: (m) => fmtDate(m.activated_at) },
            { key: "seen", header: "Last sign-in", render: (m) => fmtDate(m.last_sign_in_at) },
          ]}
          rows={filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE)}
          rowKey={(m) => m.id}
          empty="No member accounts yet."
        />
        <ResearchPagination page={clamped} pageCount={pageCount} onPage={setPage} />
      </AdminBoundary>

      <div className="card">
        <p className="mono-label text-ink-mute">Where members come from</p>
        <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
          Membership is application-first: every account here started as an approved application whose $50
          activation payment (including the first 30 days of membership) was verified by a person.
        </p>
        <Link href={ADMIN_ROUTES.applications} className="body-s underline text-ink-mute mt-3 inline-block">
          Open the application queue
        </Link>
      </div>

      <ResearchSecureNotice>
        Assessment, tracker, and question content never appears in roster rows. Member health data stays inside the
        member's own record and is opened deliberately, one member at a time.
      </ResearchSecureNotice>
    </div>
  );
}
