import { useCallback } from "react";
import { Link, useParams } from "wouter";
import { getGuide } from "../../adapters/adminOps";
import { ResearchStatusBadge, ResearchTimeline } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/guides/:id, one guide from the operations side: publish
// state, version history, and the editorial trail. Publishes with the member
// platform.
// ---------------------------------------------------------------------------

type AdminGuideDetail = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  status: string;
  version: string | null;
  summary: string | null;
  updated_at: string | null;
  history: Array<{ at: string; title: string; detail?: string }>;
};

export default function GuideAdminDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Guide"
      lead="One guide: publish state, version, and the editorial history."
      actions={
        <Link href={ADMIN_ROUTES.guides} className="btn btn-secondary">
          Back to guides
        </Link>
      }
    >
      {(token) => <GuideDetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function GuideDetailBody({ token, id }: { token: string; id: string }) {
  const loadGuide = useCallback((t: string) => getGuide<{ ok: boolean; guide: AdminGuideDetail }>(t, id), [id]);
  const resource = useAdminResource(token, loadGuide);
  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="Guide management publishes with the member platform."
      unavailableBody="This guide record renders live when the guides admin API responds. The published member-facing version is unaffected."
    >
      {(() => {
        const g = resource.data?.guide;
        if (!g) return null;
        return (
          <div className="grid gap-6">
            <section className="card" aria-label="Guide record">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div style={{ minWidth: 0 }}>
                  <p className="body-l font-700">{g.title}</p>
                  <p className="mono-label text-ink-mute mt-1">
                    {g.category ?? "Uncategorized"}
                    {g.version ? ` · v${g.version}` : ""}
                  </p>
                </div>
                <ResearchStatusBadge label={g.status} tone={g.status === "published" ? "success" : "neutral"} />
              </div>
              {g.summary && <p className="body-s text-ink-2 mt-4 max-w-[64ch]">{g.summary}</p>}
              <p className="body-s text-ink-mute mt-4">Updated {fmtDate(g.updated_at) || "date not recorded"}</p>
            </section>
            <section aria-label="Editorial history">
              <h2 className="body-l font-700 mb-4">Editorial history</h2>
              <ResearchTimeline items={g.history ?? []} />
            </section>
          </div>
        );
      })()}
    </AdminBoundary>
  );
}
