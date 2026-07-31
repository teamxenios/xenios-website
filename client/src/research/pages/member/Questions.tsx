import { useCallback, useEffect, useState } from "react";
import {
  QUESTION_CATEGORIES,
  type MemberQuestion,
  type QuestionCategory,
  type TelegramLinkState,
} from "@shared/research/member-platform";
import { useResearch } from "../../core";
import {
  fetchQuestions,
  fetchTelegramLink,
  linkTelegram,
  rateAnswer,
  submitQuestion,
  unlinkTelegram,
} from "../../adapters/guides";
import { fetchCapabilities, statusFor, type CapabilityStatus } from "../../lib/capabilities";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchEmptyState,
  ResearchLoadingState,
  ResearchSecureNotice,
  ResearchStatusBadge,
  type BadgeTone,
} from "../../ui/kit";

type Phase = "loading" | "ready" | "unavailable" | "unauthorized" | "error";
type Notice = { tone: "success" | "error" | "info"; text: string } | null;

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  plan: "Plan",
  product: "Product",
  account: "Account",
  shipping: "Shipping",
  privacy: "Privacy",
  other: "Other",
};

const STATUS_META: Record<MemberQuestion["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "pending" },
  being_reviewed: { label: "Being reviewed", tone: "info" },
  more_information_needed: { label: "More information needed", tone: "warning" },
  answer_ready: { label: "Answer ready", tone: "success" },
  completed: { label: "Completed", tone: "neutral" },
};

function safeFailure(kind: string, action: string): string {
  if (kind === "unauthorized") return "Your session has ended. Sign in again and retry.";
  if (kind === "unavailable") return `${action} is unavailable right now. Nothing was changed.`;
  if (kind === "denied" || kind === "forbidden") return `You do not have access to ${action.toLowerCase()}.`;
  return `${action} could not be completed. Please try again.`;
}

export default function Questions() {
  const { memberToken } = useResearch();
  const [questionsStatus, setQuestionsStatus] = useState<CapabilityStatus | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<CapabilityStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<MemberQuestion[]>([]);

  useEffect(() => {
    let live = true;
    void fetchCapabilities(memberToken).then((statuses) => {
      if (!live) return;
      setQuestionsStatus(statusFor(statuses, "questions"));
      setTelegramStatus(statusFor(statuses, "telegram_support"));
    });
    return () => { live = false; };
  }, [memberToken]);

  const load = useCallback(async () => {
    setPhase("loading");
    const result = await fetchQuestions(memberToken);
    if (result.kind === "ok") {
      setQuestions(result.data.questions);
      setPhase("ready");
    } else {
      setQuestions([]);
      setPhase(result.kind === "unavailable" ? "unavailable" : result.kind === "unauthorized" ? "unauthorized" : "error");
    }
  }, [memberToken]);

  useEffect(() => { void load(); }, [load]);

  return (
    <ResearchMemberShell
      title="Questions"
      lead="Ask the research team about your plan, products, account, shipping, or privacy."
    >
      {questionsStatus === null ? <ResearchLoadingState label="Checking availability" /> : (
        <ResearchCapabilityBoundary status={questionsStatus}>
          <div className="grid gap-6" style={{ minWidth: 0 }}>
            <QuestionForm token={memberToken} onCreated={(question) => {
              setQuestions((current) => [question, ...current.filter((item) => item.questionId !== question.questionId)]);
              setPhase("ready");
            }} />

            <section aria-labelledby="your-questions-heading" style={{ minWidth: 0 }}>
              <h2 id="your-questions-heading" className="mono-label text-ink-mute">Your questions</h2>
              <div className="mt-3">
                {phase === "loading" && <ResearchLoadingState label="Loading your questions" />}
                {phase === "unavailable" && <StateMessage title="Questions are unavailable" body="Your questions could not be reached right now. Please try again." onRetry={load} />}
                {phase === "unauthorized" && <StateMessage title="Sign in required" body="Your session has ended. Sign in again to view your questions." />}
                {phase === "error" && <StateMessage title="Questions could not be loaded" body="The response could not be verified. No question data was shown." onRetry={load} />}
                {phase === "ready" && questions.length === 0 && (
                  <ResearchEmptyState title="No questions yet." body="Questions you send will appear here." />
                )}
                {phase === "ready" && questions.length > 0 && (
                  <ul className="grid gap-3" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {questions.map((question) => (
                      <QuestionCard key={question.questionId} question={question} token={memberToken} />
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {telegramStatus && <TelegramPanel status={telegramStatus} token={memberToken} />}
            <ResearchSecureNotice>
              Questions are private to you and the research team. Telegram is optional and is not the system of record.
            </ResearchSecureNotice>
          </div>
        </ResearchCapabilityBoundary>
      )}
    </ResearchMemberShell>
  );
}

function StateMessage({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="card" role="status" aria-live="polite">
      <p className="body-m font-700">{title}</p>
      <p className="body-s text-ink-2 mt-2">{body}</p>
      {onRetry && <button type="button" className="btn btn-secondary mt-3" onClick={onRetry}>Try again</button>}
    </div>
  );
}

function QuestionForm({ token, onCreated }: { token: string | null; onCreated: (question: MemberQuestion) => void }) {
  const [category, setCategory] = useState<QuestionCategory>("plan");
  const [bodyText, setBodyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = bodyText.trim();
    if (text.length < 3 || text.length > 4000) {
      setNotice({ tone: "error", text: "Enter a question between 3 and 4,000 characters." });
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await submitQuestion({ category, bodyText: text }, token);
    setBusy(false);
    if (result.kind === "ok") {
      setBodyText("");
      setNotice({ tone: "success", text: "Your question was sent." });
      onCreated(result.data.question);
      return;
    }
    setNotice({
      tone: result.kind === "unavailable" ? "info" : "error",
      text: ("code" in result && result.code === "rate_limited")
        ? "You have sent too many questions recently. Please wait and try again."
        : safeFailure(result.kind, "Question submission"),
    });
  };

  return (
    <section className="card" aria-labelledby="ask-question-heading" style={{ minWidth: 0 }}>
      <h2 id="ask-question-heading" className="body-l font-700">Ask a question</h2>
      <form className="grid gap-4 mt-4" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="form-label" htmlFor="question-category">Category</label>
          <select id="question-category" className="input mt-2" value={category} onChange={(event) => setCategory(event.target.value as QuestionCategory)}>
            {QUESTION_CATEGORIES.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="question-body">Question</label>
          <textarea
            id="question-body"
            className="input mt-2"
            rows={6}
            minLength={3}
            maxLength={4000}
            required
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
            style={{ width: "100%", maxWidth: "100%", resize: "vertical" }}
          />
          <p className="body-s text-ink-mute mt-1">{bodyText.length} / 4,000 characters</p>
        </div>
        <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send question"}</button></div>
      </form>
      {notice && <p className="body-s text-ink-2 mt-3" role={notice.tone === "error" ? "alert" : "status"} aria-live="polite">{notice.text}</p>}
    </section>
  );
}

function QuestionCard({ question, token }: { question: MemberQuestion; token: string | null }) {
  const meta = STATUS_META[question.status];
  return (
    <li className="card" style={{ minWidth: 0, overflowWrap: "anywhere" }} data-testid={`question-${question.questionId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <p className="mono-label text-ink-mute">{CATEGORY_LABELS[question.category]} · {new Date(question.createdAt).toLocaleDateString()}</p>
          {question.source === "telegram_voice"
            ? <p className="body-s text-ink-mute mt-2">Submitted by voice. The recording is available in your private media.</p>
            : <p className="body-m mt-2" style={{ whiteSpace: "pre-wrap" }}>{question.bodyText}</p>}
        </div>
        <ResearchStatusBadge label={meta.label} tone={meta.tone} />
      </div>
      {question.answerText && (
        <div className="mt-4">
          <h3 className="form-label">Answer</h3>
          <p className="body-m text-ink-2 mt-2" style={{ whiteSpace: "pre-wrap" }}>{question.answerText}</p>
        </div>
      )}
      {question.answerText && (question.status === "answer_ready" || question.status === "completed") && (
        <Rating question={question} token={token} />
      )}
    </li>
  );
}

function Rating({ question, token }: { question: MemberQuestion; token: string | null }) {
  const [selected, setSelected] = useState<number | null>(question.rating);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = async (rating: 1 | 2 | 3 | 4 | 5) => {
    setBusy(true);
    setMessage(null);
    const result = await rateAnswer(question.questionId, { questionId: question.questionId, rating }, token);
    setBusy(false);
    if (result.kind === "ok") {
      setSelected(rating);
      setMessage(`Rating saved: ${rating} of 5.`);
    } else {
      setMessage(safeFailure(result.kind, "Rating"));
    }
  };
  return (
    <fieldset className="mt-4" disabled={busy} style={{ border: 0, marginLeft: 0, padding: 0 }}>
      <legend className="form-label">Rate this answer</legend>
      <div className="flex flex-wrap gap-2 mt-2">
        {([1, 2, 3, 4, 5] as const).map((rating) => (
          <label key={rating} className={`chip ${selected === rating ? "ra-chip-selected" : "text-ink-2"}`}>
            <input type="radio" name={`rating-${question.questionId}`} value={rating} checked={selected === rating} onChange={() => void save(rating)} />
            <span>{rating} of 5</span>
          </label>
        ))}
      </div>
      {message && <p className="body-s text-ink-2 mt-2" role="status" aria-live="polite">{message}</p>}
    </fieldset>
  );
}

function TelegramPanel({ status, token }: { status: CapabilityStatus; token: string | null }) {
  return (
    <section className="card" aria-labelledby="telegram-heading" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <h2 id="telegram-heading" className="body-l font-700">Telegram</h2>
      <p className="body-s text-ink-2 mt-2">Link Telegram for notifications. Read full answers in your account.</p>
      <div className="mt-4">
        <ResearchCapabilityBoundary status={status}><TelegramControls token={token} /></ResearchCapabilityBoundary>
      </div>
    </section>
  );
}

function TelegramControls({ token }: { token: string | null }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<TelegramLinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    const result = await fetchTelegramLink(token);
    if (result.kind === "ok") {
      setState(result.data.state);
      setPhase("ready");
    } else {
      setState(null);
      setPhase(result.kind === "unavailable" ? "unavailable" : result.kind === "unauthorized" ? "unauthorized" : "error");
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const startLink = async () => {
    setBusy(true);
    setMessage(null);
    const result = await linkTelegram(token);
    setBusy(false);
    if (result.kind !== "ok") {
      setMessage(safeFailure(result.kind, "Telegram linking"));
      return;
    }
    const { linkToken, botUsername } = result.data.link;
    if (!botUsername) {
      setMessage("Telegram linking is not configured right now.");
      return;
    }
    const url = `https://t.me/${encodeURIComponent(botUsername.replace(/^@/, ""))}?start=${encodeURIComponent(linkToken)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setMessage("Telegram opened in a new tab. This one-time link is not stored by this page.");
  };

  const unlink = async () => {
    setBusy(true);
    setMessage(null);
    const result = await unlinkTelegram(token);
    setBusy(false);
    if (result.kind === "ok") {
      setState({ linked: false, linkedAt: null, telegramDisplayName: null });
      setMessage("Telegram was unlinked.");
    } else {
      setMessage(safeFailure(result.kind, "Telegram unlinking"));
    }
  };

  if (phase === "loading") return <ResearchLoadingState label="Checking Telegram status" />;
  if (phase !== "ready" || state === null) {
    return <StateMessage title={phase === "unauthorized" ? "Sign in required" : "Telegram status unavailable"} body="Telegram status could not be verified. Nothing was changed." onRetry={load} />;
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <ResearchStatusBadge label={state.linked ? "Linked" : "Not linked"} tone={state.linked ? "success" : "neutral"} />
        {state.linked && state.telegramDisplayName && <span className="body-s text-ink-2">Connected as {state.telegramDisplayName}</span>}
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void (state.linked ? unlink() : startLink())}>
          {busy ? "Working…" : state.linked ? "Unlink Telegram" : "Link Telegram"}
        </button>
      </div>
      {message && <p className="body-s text-ink-2 mt-3" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
