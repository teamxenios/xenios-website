import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ResearchDataTable,
  ResearchFilterBar,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  useDebounced,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/guides: guide publishing from the operations side. The
// member area already lists guides read-only; the admin management surface
// (draft, review, publish, version) publishes with the member platform.
// ---------------------------------------------------------------------------

type AdminGuideRow = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  status: string;
  version: string | null;
  updated_at: string | null;
};

export default function GuidesAdmin() {
  return (
    <AdminScreen
      title="Guides"
      lead="Guide drafting, review, and publishing. Members only ever see the published version."
    >
      {(token) => <GuidesBody token={token} />}
    </AdminScreen>
  );
}

function GuidesBody({ token }: { token: string }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const resource = useAdminResource<{ ok: boolean; guides: AdminGuideRow[] }>(token, "/api/admin/research/guides");

  const filtered = useMemo(() => {
    const list = resource.data?.guides ?? [];
    const q = debounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter((g) => g.title.toLowerCase().includes(q) || (g.category ?? "").toLowerCase().includes(q));
  }, [resource.data, debounced]);

  return (
    <div className="grid gap-6">
      <ResearchFilterBar>
        <ResearchSearch value={search} onChange={setSearch} label="Search guides" placeholder="Title or category" />
      </ResearchFilterBar>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        onRetry={resource.reload}
        unavailableTitle="Guide management publishes with the member platform."
        unavailableBody="Members already read published guides in their area. Draft, review, and version management land here when the guides admin API responds."
      >
        <ResearchDataTable<AdminGuideRow>
          caption="Guides"
          columns={[
            {
              key: "title",
              header: "Guide",
              render: (g) => (
                <Link href={`${ADMIN_ROUTES.guides}/${g.id}`} className="font-700 underline">
                  {g.title}
                </Link>
              ),
            },
            { key: "category", header: "Category", render: (g) => g.category ?? "" },
            {
              key: "status",
              header: "Status",
              render: (g) => (
                <ResearchStatusBadge label={g.status} tone={g.status === "published" ? "success" : "neutral"} />
              ),
            },
            { key: "version", header: "Version", render: (g) => (g.version ? `v${g.version}` : "") },
            { key: "updated", header: "Updated", render: (g) => fmtDate(g.updated_at) },
          ]}
          rows={filtered}
          rowKey={(g) => g.id}
          empty="No guides yet."
        />
      </AdminBoundary>

      <ResearchSecureNotice>
        Guides are educational reference material. Editorial review keeps them free of health claims before anything is
        published to members.
      </ResearchSecureNotice>
    </div>
  );
}
