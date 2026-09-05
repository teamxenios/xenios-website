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
import { MemberAccessDiagnosisPanel } from "./MemberAccessDiagnosisPanel";

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
      title="Customer accounts"
      lead="Recorded account status, plan history, and sign-in activity. Health data never appears in this list."
    >
      {(token) => <MembersBody key={token} token={token} />}
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
      <MemberAccessDiagnosisPanel key={token} token={token} />
      <ResearchFilterBar>
        <ResearchSearch
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search customer records"
          placeholder="Name or email"
        />
      </ResearchFilterBar>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The customer roster is unavailable."
        unavailableBody="This list could not be loaded. The exact-email inspection above is separate and can be used if its service is available. An unavailable roster does not mean that no accounts exist."
      >
        <ResearchDataTable<AdminMemberRow>
          caption="Customer account records"
          columns={[
            {
              key: "member",
              header: "Account",
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
            { key: "plan", header: "Recorded plan", render: (m) => m.plan ?? "Not recorded" },
            { key: "activated", header: "Activated", render: (m) => fmtDate(m.activated_at) },
            { key: "seen", header: "Last sign-in", render: (m) => fmtDate(m.last_sign_in_at) },
          ]}
          rows={filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE)}
          rowKey={(m) => m.id}
          empty="No customer account records returned."
        />
        <ResearchPagination page={clamped} pageCount={pageCount} onPage={setPage} />
      </AdminBoundary>

      <div className="card">
        <p className="mono-label text-ink-mute">Separate account decisions</p>
        <p className="body-s text-ink-2 mt-2 max-w-[64ch]">
          Customer approval, verified sign-in, partner eligibility, and product access are separate decisions.
          Paid membership is not the customer-access model. Historical plan and payment records remain available;
          a blank plan does not establish approval or a billing obligation.
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
