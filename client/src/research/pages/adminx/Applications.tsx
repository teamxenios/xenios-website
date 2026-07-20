import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ResearchDataTable,
  ResearchFilterBar,
  ResearchPagination,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTabs,
  useDebounced,
  type BadgeTone,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import {
  AdminBoundary,
  AdminScreen,
  APPLICATION_QUEUES,
  APPLICATION_STATUS_LABEL,
  type AdminApplication,
} from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/applications: the full membership review queue as a page.
// Queue chips select the server-side queue (the same queues the /admin tab
// uses); search and pagination are client-side over the returned rows. Rows
// carry identity and workflow metadata only; the full application opens on
// the detail page.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export function statusTone(status: string): BadgeTone {
  if (status === "active") return "success";
  if (status === "declined" || status === "expired") return "danger";
  if (status === "approved_pending_payment" || status === "more_information_requested") return "warning";
  if (status === "under_review" || status === "payment_pending") return "info";
  return "neutral";
}

export default function Applications() {
  return (
    <AdminScreen
      title="Applications"
      lead="Every membership application, by queue. Open a row for the full file, the timeline, and the review actions."
    >
      {(token) => <ApplicationsBody token={token} />}
    </AdminScreen>
  );
}

function ApplicationsBody({ token }: { token: string }) {
  const [queue, setQueue] = useState("new");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const resource = useAdminResource<{ ok: boolean; applications: AdminApplication[] }>(
    token,
    `/api/admin/research/applications?queue=${encodeURIComponent(queue)}`,
  );

  const filtered = useMemo(() => {
    const list = resource.data?.applications ?? [];
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) =>
        `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.organization ?? "").toLowerCase().includes(q),
    );
  }, [resource.data, debouncedSearch]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  return (
    <div className="grid gap-6">
      <ResearchTabs
        tabs={APPLICATION_QUEUES}
        active={queue}
        onSelect={(key) => {
          setQueue(key);
          setPage(1);
        }}
        label="Application queues"
      />
      <ResearchFilterBar>
        <ResearchSearch
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search applications"
          placeholder="Name, email, or organization"
        />
        <span className="body-s text-ink-mute" aria-live="polite">
          {resource.state === "ok" ? `${filtered.length} in view` : ""}
        </span>
      </ResearchFilterBar>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        onRetry={resource.reload}
        unavailableTitle="The application queue is not reachable."
        unavailableBody="The applications API is not responding in this environment."
      >
        <ResearchDataTable<AdminApplication>
          caption={`Applications in the ${queue} queue`}
          columns={[
            {
              key: "name",
              header: "Applicant",
              render: (a) => (
                <Link
                  href={`${ADMIN_ROUTES.applications}/${a.id}`}
                  className="font-700 underline"
                  data-testid={`link-application-${a.id}`}
                >
                  {a.first_name} {a.last_name}
                </Link>
              ),
            },
            {
              key: "email",
              header: "Email",
              render: (a) => <span style={{ overflowWrap: "anywhere" }}>{a.email}</span>,
            },
            { key: "type", header: "Type", render: (a) => a.applicant_type },
            {
              key: "location",
              header: "Location",
              render: (a) => [a.city, a.country].filter(Boolean).join(", "),
            },
            { key: "submitted", header: "Submitted", render: (a) => fmtDate(a.submitted_at) },
            {
              key: "status",
              header: "Status",
              render: (a) => (
                <ResearchStatusBadge label={APPLICATION_STATUS_LABEL[a.status] ?? a.status} tone={statusTone(a.status)} />
              ),
            },
          ]}
          rows={pageRows}
          rowKey={(a) => a.id}
          empty="Nothing in this queue."
        />
        <ResearchPagination page={clampedPage} pageCount={pageCount} onPage={setPage} />
      </AdminBoundary>

      <ResearchSecureNotice>
        Queue rows show application metadata only. Goals, fit notes, and the timeline live on the detail page.
      </ResearchSecureNotice>
    </div>
  );
}
