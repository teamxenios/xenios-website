import { useCallback, useState } from "react";
import { Link, useParams } from "wouter";
import { answerQuestion, getQuestion, type AdminQuestionAnswer } from "../../adapters/adminOps";
import { ResearchSecureNotice, ResearchStatusBadge, ResearchTimeline } from "../../ui/kit";
import { ADMIN_ROUTES } from "../../lib/routes";
import { denialPresentation } from "../../lib/denials";
import { fmtDate, fmtDateTime, useAdminResource } from "./auth";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";

// ---------------------------------------------------------------------------
// /admin/research/questions/:id, one question thread. Publishes with the
// member platform. The reply composer posts to the real endpoint and
// degrades honestly when it is not published: the reply is never pretended
// sent.
// ---------------------------------------------------------------------------

type AdminQuestionDetail = {
  id: string;
  member_email: string;
  topic: string | null;
  status: string;
  asked_at: string;
  body: string;
  thread: Array<{ id: string; author: string; body: string; at: string }>;
};

export default function QuestionAdminDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  return (
    <AdminScreen
      title="Question"
      lead="One member question and its thread. Replies always come from a named person."
      actions={
        <Link href={ADMIN_ROUTES.questions} className="btn btn-secondary">
          Back to questions
        </Link>
      }
    >
      {(token) => <QuestionDetailBody token={token} id={id} />}
    </AdminScreen>
  );
}

function QuestionDetailBody({ token, id }: { token: string; id: string }) {
  const loadQuestion = useCallback(
    (t: string) => getQuestion<{ ok: boolean; question: AdminQuestionDetail }>(t, id),
    [id],
  );
  const resource = useAdminResource(token, loadQuestion);
  // A sent answer reloads the thread, which unmounts the composer; the
  // confirmation lives up here so it survives the reload.
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      {sentNotice && (
        <p className="body-s text-ink-2" role="status" aria-live="polite" data-testid="question-answer-sent">
          {sentNotice}
        </p>
      )}
      <AdminBoundary
        state={resource.state}
        message={resource.message}
        deniedCode={resource.deniedCode}
        onRetry={resource.reload}
        unavailableTitle="Question threads publish with the member platform."
        unavailableBody="This thread renders live when the questions API responds. Questions sent by email still reach a person in the meantime."
      >
        {(() => {
          const q = resource.data?.question;
          if (!q) return null;
          return (
            <>
              <section className="card" aria-label="Question">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div style={{ minWidth: 0 }}>
                    <p className="mono-label text-ink-mute">{q.topic ?? "General"}</p>
                    <p className="body-s text-ink-mute mt-1" style={{ overflowWrap: "anywhere" }}>
                      {q.member_email} · {fmtDate(q.asked_at)}
                    </p>
                  </div>
                  <ResearchStatusBadge
                    label={q.status}
                    tone={q.status === "open" ? "warning" : q.status === "answered" ? "success" : "neutral"}
                  />
                </div>
                <p className="body-m mt-4" style={{ whiteSpace: "pre-wrap" }}>
                  {q.body}
                </p>
              </section>
              <section aria-label="Thread">
                <h2 className="body-l font-700 mb-4">Thread</h2>
                <ResearchTimeline
                  items={(q.thread ?? []).map((entry) => ({
                    at: fmtDateTime(entry.at),
                    title: entry.author,
                    detail: entry.body,
                  }))}
                />
              </section>
              <ReplyComposer
                token={token}
                id={id}
                onSent={(notice) => {
                  setSentNotice(notice);
                  resource.reload();
                }}
              />
            </>
          );
        })()}
      </AdminBoundary>

      <ResearchSecureNotice>
        Question content can contain health context. It renders only on this page, for the signed-in reviewer, and
        replies are always from a named person, never automated.
      </ResearchSecureNotice>
    </div>
  );
}

function ReplyComposer({ token, id, onSent }: { token: string; id: string; onSent: (notice: string) => void }) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<AdminQuestionAnswer["status"]>("answer_ready");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const send = async () => {
    if (busy || body.trim().length < 2) return;
    setBusy(true);
    setMessage(null);
    // The real wire shape: answerText plus the status this answer moves the
    // question into (POST /api/admin/research/questions/:id/answer).
    const result = await answerQuestion<{ ok: boolean }>(token, id, { answerText: body.trim(), status });
    setBusy(false);
    if (result.kind === "ok") {
      setBody("");
      // The reload unmounts this composer, so the confirmation goes upward.
      onSent(status === "answer_ready" ? "Answer sent." : "Sent; the member is asked for more information.");
    } else if (result.kind === "unavailable") {
      setMessage("The answer endpoint is not published yet, so nothing was sent. Reply by email instead.");
    } else if (result.kind === "unauthorized") {
      setMessage("Your admin session has ended. Sign in again.");
    } else if (result.kind === "denied") {
      // Route on the machine code; the copy is ours (lib/denials).
      const p = denialPresentation(result.code, result.message);
      setMessage(`${p.title} ${p.body}`);
    } else {
      setMessage(result.kind === "forbidden" ? result.message ?? "This action is not allowed." : result.message);
    }
  };

  return (
    <section className="card" aria-label="Reply">
      <label htmlFor="question-reply" className="form-label">
        Answer as the research team
      </label>
      <textarea
        id="question-reply"
        className="input-field"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Plain answer, from a person. No health claims."
        data-testid="question-answer-text"
      />
      <div className="mt-3" style={{ maxWidth: 320 }}>
        <label htmlFor="question-answer-status" className="form-label">
          What this answer does
        </label>
        <select
          id="question-answer-status"
          className="input-field"
          value={status}
          onChange={(e) => setStatus(e.target.value as AdminQuestionAnswer["status"])}
          data-testid="question-answer-status"
        >
          <option value="answer_ready">Answer is ready for the member</option>
          <option value="more_information_needed">Ask the member for more information</option>
        </select>
      </div>
      {message && (
        <p className="body-s text-ink-2 mt-3" role="status" aria-live="polite">
          {message}
        </p>
      )}
      <div className="mt-4">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || body.trim().length < 2}
          onClick={() => void send()}
          data-testid="question-answer-send"
        >
          {busy ? "Sending..." : "Send answer"}
        </button>
      </div>
    </section>
  );
}
