import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import { listQuestions } from "../../adapters/adminOps";
import {
  ResearchDataTable,
  ResearchFilterBar,
  ResearchPagination,
  ResearchSearch,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTabs,
  useDebounced,
} from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { fmtDate, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/questions: the member question inbox. Publishes with the
// member platform. Safe preview discipline is structural here: list rows
// carry subject metadata only (topic, status, dates), never the question
// body, because member questions can contain health context. The body opens
// deliberately on the detail page.
// ---------------------------------------------------------------------------

type AdminQuestionRow = {
  id: string;
  member_email: string;
  topic: string | null;
  status: string;
  asked_at: string;
  last_activity_at: string | null;
};

const QUESTION_QUEUES = [
  { key: "open", label: "Open" },
  { key: "answered", label: "Answered" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

const PAGE_SIZE = 20;

export default function QuestionsAdmin() {
  return (
    <AdminScreen
      title="Questions"
      lead="The member question inbox. Rows show subject metadata only; the question itself opens on the detail page."
    >
      {(token) => <QuestionsBody token={token} />}
    </AdminScreen>
  );
}

function QuestionsBody({ token }: { token: string }) {
  const [queue, setQueue] = useState("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const loadQuestionsQueue = useCallback(
    (t: string) => listQuestions<{ ok: boolean; questions: AdminQuestionRow[] }>(t, queue === "all" ? "" : queue),
    [queue],
  );
  const resource = useAdminResource(token, loadQuestionsQueue);

  const filtered = useMemo(() => {
    const list = resource.data?.questions ?? [];
    const q = debounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.member_email.toLowerCase().includes(q) || (r.topic ?? "").toLowerCase().includes(q));
  }, [resource.data, debounced]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);

  return (
    <div className="grid gap-6">
      <ResearchTabs
        tabs={QUESTION_QUEUES}
        active={queue}
        onSelect={(key) => {
          setQueue(key);
          setPage(1);
        }}
        label="Question queues"
      />
      <ResearchFilterBar>
        <ResearchSearch
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search questions"
          placeholder="Member email or topic"
        />
      </ResearchFilterBar>

      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="The question inbox publishes with the member platform."
        unavailableBody="Members see an honest pending state on their Questions page until this opens, and questions sent by email still reach a person."
      >
        <ResearchDataTable<AdminQuestionRow>
          caption="Member questions"
          columns={[
            {
              key: "member",
              header: "Member",
              render: (r) => (
                <Link href={`${ADMIN_ROUTES.questions}/${r.id}`} className="font-700 underline">
                  <span style={{ overflowWrap: "anywhere" }}>{r.member_email}</span>
                </Link>
              ),
            },
            { key: "topic", header: "Topic", render: (r) => r.topic ?? "General" },
            {
              key: "status",
              header: "Status",
              render: (r) => (
                <ResearchStatusBadge
                  label={r.status}
                  tone={r.status === "open" ? "warning" : r.status === "answered" ? "success" : "neutral"}
                />
              ),
            },
            { key: "asked", header: "Asked", render: (r) => fmtDate(r.asked_at) },
            { key: "activity", header: "Last activity", render: (r) => fmtDate(r.last_activity_at) },
          ]}
          rows={filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE)}
          rowKey={(r) => r.id}
          empty="No questions in this queue."
        />
        <ResearchPagination page={clamped} pageCount={pageCount} onPage={setPage} />
      </AdminBoundary>

      <ResearchSecureNotice>
        Question bodies never render in this list. A member's question can contain health context, so it opens only on
        the detail page, deliberately, one question at a time.
      </ResearchSecureNotice>
    </div>
  );
}
