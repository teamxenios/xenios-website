import { useCallback, useEffect, useRef, useState } from "react";
import { useResearch } from "../../core";
import {
  fetchQuestions,
  fetchTelegramLink,
  linkTelegram,
  rateAnswer,
  submitQuestion,
  submitVoiceQuestion,
  unlinkTelegram,
} from "../../adapters/guides";
import {
  fetchCapabilities,
  statusFor,
  type CapabilityStatus,
  type ResearchCapability,
} from "../../lib/capabilities";
import { devFixture } from "../../lib/fixtures";
import { failureText } from "../../lib/denials";
import { ResearchMemberShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchDrawer,
  ResearchEmptyState,
  ResearchLoadingState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  ResearchTimeline,
  type BadgeTone,
} from "../../ui/kit";

// ---------------------------------------------------------------------------
// Member questions (/research/member/questions). The whole surface sits
// behind the "questions" capability boundary; the voice panel additionally
// sits behind "private_media" and the Telegram panel behind
// "telegram_support". Honest states only: the list renders real server data,
// dev fixtures via devFixture, or a truthful pending state, never invented
// facts. Deliberately absent everywhere: queue position numbers and any
// self-service "mark urgent" control. The response expectation is stated
// once, calmly: a first response typically arrives within about 12 hours.
// ---------------------------------------------------------------------------

type QuestionState = "pending" | "being_reviewed" | "more_info_needed" | "answer_ready" | "completed";

interface QuestionTimelineEvent {
  at: string;
  title: string;
  detail?: string;
}

interface QuestionItem {
  id: string;
  subject: string;
  body: string;
  state: QuestionState;
  createdAt: string;
  answer?: string | null;
  rating?: number | null;
  followUpOfId?: string | null;
  timeline: QuestionTimelineEvent[];
}

const STATE_META: Record<QuestionState, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "pending" },
  being_reviewed: { label: "Being Reviewed", tone: "info" },
  more_info_needed: { label: "More Information Needed", tone: "warning" },
  answer_ready: { label: "Answer Ready", tone: "success" },
  completed: { label: "Completed", tone: "neutral" },
};

type StatusMap = Map<ResearchCapability, CapabilityStatus>;

type ListState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

interface FollowUpLink {
  questionId: string;
  subject: string;
}

function fixtureQuestions(): QuestionItem[] {
  return [
    {
      id: "fx-q-3",
      subject: "Timing the evening protocol around late training",
      body: "On days I train after 8pm, should the evening steps in my Blueprint move earlier, or stay anchored to bedtime?",
      state: "pending",
      createdAt: "2026-07-18",
      timeline: [{ at: "2026-07-18", title: "Question received", detail: "Development preview data." }],
    },
    {
      id: "fx-q-2",
      subject: "Interpreting week two tracker energy dips",
      body: "My self-rated energy dropped on the two days after long runs. Is that expected in this block, or worth adjusting?",
      state: "answer_ready",
      createdAt: "2026-07-14",
      answer:
        "A short dip on the day after your longest sessions is consistent with the training load in this block. Keep logging sleep alongside it for another week; if the dip stretches past one day, we will look at recovery spacing together. Development preview data, not real guidance.",
      timeline: [
        { at: "2026-07-14", title: "Question received", detail: "Development preview data." },
        { at: "2026-07-14", title: "Being reviewed", detail: "Picked up by the research team." },
        { at: "2026-07-15", title: "Answer ready", detail: "A written answer is available below." },
      ],
    },
    {
      id: "fx-q-1",
      subject: "Storage guidance for the starter materials",
      body: "The materials arrived while I was traveling. Is a week at room temperature a problem?",
      state: "completed",
      createdAt: "2026-07-02",
      answer:
        "A week at normal room temperature is within the handling guidance for those materials. Refrigerate on arrival going forward and note the dates in your tracker. Development preview data, not real guidance.",
      rating: null,
      timeline: [
        { at: "2026-07-02", title: "Question received", detail: "Development preview data." },
        { at: "2026-07-02", title: "Being reviewed", detail: "Picked up by the research team." },
        { at: "2026-07-03", title: "Answer ready", detail: "A written answer was published." },
        { at: "2026-07-05", title: "Completed", detail: "You confirmed the answer resolved the question." },
      ],
    },
  ];
}

export default function Questions() {
  const { memberToken } = useResearch();
  const [statuses, setStatuses] = useState<StatusMap | null>(null);
  const [listState, setListState] = useState<ListState>("loading");
  const [listError, setListError] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<FollowUpLink | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchCapabilities(memberToken).then((s) => {
      if (alive) setStatuses(s);
    });
    return () => {
      alive = false;
    };
  }, [memberToken]);

  const loadQuestions = useCallback(async () => {
    setListState("loading");
    setListError(undefined);
    const result = await fetchQuestions<{ questions?: QuestionItem[] }>(memberToken);
    if (result.kind === "ok") {
      setItems(Array.isArray(result.data.questions) ? result.data.questions : []);
      setListState("ok");
      return;
    }
    if (result.kind === "unavailable") {
      const fixture = devFixture(fixtureQuestions);
      if (fixture) {
        setItems(fixture);
        setListState("ok");
      } else {
        setItems([]);
        setListState("unavailable");
      }
      return;
    }
    if (result.kind === "unauthorized") {
      setListState("unauthorized");
      return;
    }
    setListError(result.kind === "forbidden" ? result.message : result.message);
    setListState("error");
  }, [memberToken]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const openItem = items.find((q) => q.id === openId) ?? null;

  const startFollowUp = (question: QuestionItem) => {
    setFollowUp({ questionId: question.id, subject: question.subject });
    setOpenId(null);
    // Bring the form into view so the linked context is visible immediately.
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  return (
    <ResearchMemberShell
      title="Questions"
      lead="Ask the research team anything about your protocol, your tracker, or your materials. A person reads every question, and a first response typically arrives within about 12 hours."
    >
      {statuses === null ? (
        <ResearchLoadingState label="Checking availability" />
      ) : (
        <ResearchCapabilityBoundary status={statusFor(statuses, "questions")}>
          <div className="grid gap-6">
            <div ref={formRef}>
              <NewQuestionForm
                token={memberToken}
                followUp={followUp}
                onClearFollowUp={() => setFollowUp(null)}
                onSubmitted={() => {
                  setFollowUp(null);
                  void loadQuestions();
                }}
              />
            </div>

            <VoiceQuestionPanel status={statusFor(statuses, "private_media")} token={memberToken} />

            <section aria-label="Your questions">
              <h2 className="mono-label text-ink-mute">Your questions</h2>
              <div className="mt-3">
                <ResearchRouteBoundary
                  state={listState}
                  errorMessage={listError}
                  onRetry={() => void loadQuestions()}
                  unavailableTitle="Your question history is not connected yet."
                  unavailableBody="Questions you submit are still received. Your history will appear here once this area is connected to the server."
                >
                  {items.length === 0 ? (
                    <ResearchEmptyState
                      title="No questions yet."
                      body="When you ask your first question it will appear here with its current state, and the full history of each question stays available to you."
                    />
                  ) : (
                    <ul className="grid gap-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {items.map((question) => (
                        <li key={question.id}>
                          <div className="card flex flex-wrap items-start justify-between gap-4" data-testid={`question-${question.id}`}>
                            <div style={{ minWidth: 0 }}>
                              <p className="mono-label text-ink-mute">Asked {question.createdAt}</p>
                              <p className="body-m font-700 mt-1">{question.subject}</p>
                              <p className="body-s text-ink-2 mt-1" style={{ maxWidth: "56ch" }}>
                                {question.body.length > 140 ? question.body.slice(0, 140) + "..." : question.body}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <ResearchStatusBadge
                                label={STATE_META[question.state]?.label ?? question.state}
                                tone={STATE_META[question.state]?.tone ?? "neutral"}
                              />
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setOpenId(question.id)}
                                aria-label={`View details for: ${question.subject}`}
                              >
                                View details
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </ResearchRouteBoundary>
              </div>
            </section>

            <TelegramPanel status={statusFor(statuses, "telegram_support")} token={memberToken} />

            <ResearchSecureNotice>
              Questions are private to you and the research team. Nothing you ask here is shared with other members, and
              nothing here is medical advice.
            </ResearchSecureNotice>
          </div>

          {openItem && (
            <QuestionDrawer
              question={openItem}
              token={memberToken}
              onClose={() => setOpenId(null)}
              onFollowUp={() => startFollowUp(openItem)}
            />
          )}
        </ResearchCapabilityBoundary>
      )}
    </ResearchMemberShell>
  );
}

// ---------------------------------------------------------------------------
// New question form. Posts to the questions endpoint; when the endpoint is
// unpublished the entry is kept as a local draft on this device and the copy
// says so plainly. A follow-up link (set from a question's drawer) rides
// along as followUpOf so the team sees the connection.
// ---------------------------------------------------------------------------

const QUESTION_DRAFT_KEY = "xenios-research-question-draft-v1";

interface QuestionDraft {
  subject: string;
  body: string;
  savedAt?: string;
}

const EMPTY_QUESTION_DRAFT: QuestionDraft = { subject: "", body: "" };

function readQuestionDraft(): QuestionDraft {
  try {
    const raw = window.localStorage.getItem(QUESTION_DRAFT_KEY);
    if (!raw) return EMPTY_QUESTION_DRAFT;
    const parsed = JSON.parse(raw) as Partial<QuestionDraft>;
    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      body: typeof parsed.body === "string" ? parsed.body : "",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : undefined,
    };
  } catch {
    return EMPTY_QUESTION_DRAFT;
  }
}

function writeQuestionDraft(draft: QuestionDraft): void {
  try {
    window.localStorage.setItem(QUESTION_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // storage unavailable: the form still works for this session
  }
}

function clearQuestionDraft(): void {
  try {
    window.localStorage.removeItem(QUESTION_DRAFT_KEY);
  } catch {
    // ignore
  }
}

type FormFeedback = { tone: "success" | "info" | "error"; text: string } | null;

function NewQuestionForm({
  token,
  followUp,
  onClearFollowUp,
  onSubmitted,
}: {
  token: string | null;
  followUp: FollowUpLink | null;
  onClearFollowUp: () => void;
  onSubmitted: () => void;
}) {
  const [draft, setDraft] = useState<QuestionDraft>(() =>
    typeof window === "undefined" ? EMPTY_QUESTION_DRAFT : readQuestionDraft(),
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(null);

  useEffect(() => {
    if (followUp && draft.subject.trim() === "") {
      const next = { ...draft, subject: `Follow-up: ${followUp.subject}` };
      setDraft(next);
      writeQuestionDraft(next);
    }
    // Only react to a newly attached follow-up link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followUp]);

  const update = (patch: Partial<QuestionDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      writeQuestionDraft(next);
      return next;
    });
  };

  const submit = async () => {
    if (draft.subject.trim() === "" || draft.body.trim() === "") {
      setFeedback({ tone: "error", text: "Add a subject and the question itself before sending." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const result = await submitQuestion<{ id?: string }>(
      {
        subject: draft.subject.trim(),
        body: draft.body.trim(),
        followUpOf: followUp?.questionId ?? null,
        submittedAt: new Date().toISOString(),
      },
      token,
    );
    setBusy(false);
    if (result.kind === "ok") {
      clearQuestionDraft();
      setDraft(EMPTY_QUESTION_DRAFT);
      setFeedback({
        tone: "success",
        text: "Question sent. A person will read it, and a first response typically arrives within about 12 hours.",
      });
      onSubmitted();
      return;
    }
    if (result.kind === "unavailable") {
      setFeedback({
        tone: "info",
        text: "Question submission is not connected to the server yet. Your question is saved as a draft on this device, and the form will keep it until submission opens. If it is time-sensitive, email research@xeniostechnology.com.",
      });
      return;
    }
    if (result.kind === "unauthorized") {
      setFeedback({ tone: "error", text: "Your session has ended. Sign in again, your draft is kept on this device." });
      return;
    }
    setFeedback({
      tone: "error",
      text: failureText(result, "That did not go through. Please try again."),
    });
  };

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label="Ask a new question"
    >
      <p className="mono-label text-ink-mute">Ask a question</p>
      <p className="body-s text-ink-2 mt-2" style={{ maxWidth: "56ch" }}>
        Write as much or as little as you need. Drafts stay on this device until the question is sent.
      </p>

      {followUp && (
        <div className="mt-4 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
          <span className="chip">Follow-up to: {followUp.subject}</span>
          <button type="button" className="btn btn-ghost" onClick={onClearFollowUp}>
            Remove link
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-6">
        <div>
          <label htmlFor="question-subject" className="form-label">
            Subject
          </label>
          <input
            id="question-subject"
            type="text"
            className="input-field"
            value={draft.subject}
            maxLength={140}
            onChange={(e) => update({ subject: e.target.value })}
            placeholder="A short summary of what you are asking"
          />
        </div>
        <div>
          <label htmlFor="question-body" className="form-label">
            Your question
          </label>
          <textarea
            id="question-body"
            className="input-field"
            rows={6}
            value={draft.body}
            onChange={(e) => update({ body: e.target.value })}
            placeholder="The full question, with any context that helps."
          />
        </div>
      </div>

      {feedback && (
        <p
          className={`body-s mt-4 ${feedback.tone === "error" ? "" : "text-ink-2"}`}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.text}
        </p>
      )}
      {draft.savedAt && !feedback && (
        <p className="body-s text-ink-mute mt-4" role="status">
          Draft saved on this device.
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Sending..." : "Send question"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            clearQuestionDraft();
            setDraft(EMPTY_QUESTION_DRAFT);
            onClearFollowUp();
            setFeedback({ tone: "info", text: "Draft cleared from this device." });
          }}
        >
          Clear draft
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Voice question panel. The recorder exists ONLY when private_media is
// enabled: while the capability is pending the boundary renders its honest
// panel and no recording control is present at all. The one minute limit is
// stated in copy and enforced in code (auto-stop at 60 seconds).
// ---------------------------------------------------------------------------

const VOICE_LIMIT_SECONDS = 60;

type RecorderPhase = "idle" | "recording" | "recorded";

function VoiceQuestionPanel({ status, token }: { status: CapabilityStatus; token: string | null }) {
  return (
    <section className="card" aria-label="Voice question">
      <p className="mono-label text-ink-mute">Voice question</p>
      <p className="body-s text-ink-2 mt-2" style={{ maxWidth: "56ch" }}>
        Prefer to talk it through? Record a voice question of up to one minute. It is stored privately and answered the
        same way as a written question.
      </p>
      <div className="mt-4">
        <ResearchCapabilityBoundary status={status}>
          <VoiceRecorder token={token} />
        </ResearchCapabilityBoundary>
      </div>
    </section>
  );
}

function VoiceRecorder({ token }: { token: string | null }) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FormFeedback>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const supported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof window.MediaRecorder !== "undefined";

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearTimer();
      releaseStream();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // Cleanup uses the latest audioUrl via closure per render.
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const startRecording = async () => {
    setFeedback(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setBlob(recorded);
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(recorded);
        });
        setPhase("recorded");
        releaseStream();
      };
      recorder.start();
      setPhase("recording");
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((prev) => {
          const next = prev + 1;
          if (next >= VOICE_LIMIT_SECONDS) {
            stopRecording();
            return VOICE_LIMIT_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch {
      setFeedback({
        tone: "error",
        text: "Microphone access was declined or is unavailable. You can allow it in your browser settings, or ask your question in writing above.",
      });
    }
  };

  const discard = () => {
    setBlob(null);
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSeconds(0);
    setPhase("idle");
    setFeedback(null);
  };

  const submit = async () => {
    if (!blob) return;
    setBusy(true);
    setFeedback(null);
    const base64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const value = typeof reader.result === "string" ? reader.result : null;
        resolve(value ? value.split(",")[1] ?? null : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!base64) {
      setBusy(false);
      setFeedback({ tone: "error", text: "The recording could not be prepared for upload. Please record again." });
      return;
    }
    const result = await submitVoiceQuestion<{ id?: string }>(
      {
        audio: base64,
        mimeType: blob.type || "audio/webm",
        durationSeconds: seconds,
        submittedAt: new Date().toISOString(),
      },
      token,
    );
    setBusy(false);
    if (result.kind === "ok") {
      discard();
      setFeedback({
        tone: "success",
        text: "Voice question sent. A person will listen to it, and a first response typically arrives within about 12 hours.",
      });
      return;
    }
    if (result.kind === "unavailable") {
      setFeedback({
        tone: "info",
        text: "Voice uploads are not connected to the server yet. Your recording stays on this device only and is discarded when you leave this page, so please ask in writing above for now.",
      });
      return;
    }
    if (result.kind === "unauthorized") {
      setFeedback({ tone: "error", text: "Your session has ended. Sign in again to send your voice question." });
      return;
    }
    setFeedback({
      tone: "error",
      text: failureText(result, "That did not go through. Please try again."),
    });
  };

  if (!supported) {
    return (
      <p className="body-s text-ink-2" style={{ maxWidth: "56ch" }}>
        This browser does not support in-page recording. You can ask your question in writing above.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {phase === "idle" && (
          <button type="button" className="btn btn-secondary" onClick={() => void startRecording()}>
            Start recording
          </button>
        )}
        {phase === "recording" && (
          <>
            <button type="button" className="btn btn-primary" onClick={stopRecording}>
              Stop recording
            </button>
            <span className="body-s tabular text-ink-2" role="timer" aria-live="polite">
              Recording: {seconds}s of {VOICE_LIMIT_SECONDS}s
            </span>
          </>
        )}
        {phase === "recorded" && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
              {busy ? "Sending..." : "Send voice question"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={discard} disabled={busy}>
              Discard and re-record
            </button>
          </>
        )}
      </div>

      {phase === "recorded" && audioUrl && (
        <div className="mt-4">
          <p className="form-label">Review your recording ({seconds}s)</p>
          {/* Captions are not applicable: this is the member's own just-recorded voice memo. */}
          <audio controls src={audioUrl} style={{ width: "100%", maxWidth: 420 }} aria-label="Your recorded voice question" />
        </div>
      )}

      <p className="body-s text-ink-mute mt-3" style={{ maxWidth: "52ch" }}>
        Recordings stop automatically at one minute. Nothing is uploaded until you choose to send it.
      </p>

      {feedback && (
        <p
          className={`body-s mt-3 ${feedback.tone === "error" ? "" : "text-ink-2"}`}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question detail drawer: full body, timeline, the answer when one exists, a
// 1 to 5 star rating (an accessible radio group) on completed questions, and
// a linked follow-up button.
// ---------------------------------------------------------------------------

function QuestionDrawer({
  question,
  token,
  onClose,
  onFollowUp,
}: {
  question: QuestionItem;
  token: string | null;
  onClose: () => void;
  onFollowUp: () => void;
}) {
  const meta = STATE_META[question.state] ?? { label: question.state, tone: "neutral" as BadgeTone };
  const showAnswer = (question.state === "answer_ready" || question.state === "completed") && !!question.answer;
  const canFollowUp = question.state === "answer_ready" || question.state === "completed";

  return (
    <ResearchDrawer open title={question.subject} onClose={onClose}>
      <div className="grid gap-6">
        <div className="flex items-center gap-3">
          <ResearchStatusBadge label={meta.label} tone={meta.tone} />
          <span className="body-s text-ink-mute">Asked {question.createdAt}</span>
        </div>

        <div>
          <p className="mono-label text-ink-mute">Your question</p>
          <p className="body-s text-ink-2 mt-2" style={{ whiteSpace: "pre-wrap" }}>
            {question.body}
          </p>
        </div>

        {question.state === "more_info_needed" && (
          <p className="body-s text-ink-2" role="status">
            The research team needs a little more information before answering. Use the follow-up button below or reply
            with the details in a new question, and it will pick up where this one left off.
          </p>
        )}

        {showAnswer && (
          <div className="card" style={{ margin: 0 }}>
            <p className="mono-label text-ink-mute">Answer from the research team</p>
            <p className="body-s text-ink-2 mt-2" style={{ whiteSpace: "pre-wrap" }}>
              {question.answer}
            </p>
          </div>
        )}

        {question.state === "completed" && <AnswerRating question={question} token={token} />}

        <div>
          <p className="mono-label text-ink-mute">History</p>
          <div className="mt-2">
            <ResearchTimeline items={question.timeline} />
          </div>
        </div>

        {canFollowUp && (
          <div>
            <button type="button" className="btn btn-secondary" onClick={onFollowUp}>
              Ask a linked follow-up question
            </button>
          </div>
        )}
      </div>
    </ResearchDrawer>
  );
}

// ---------------------------------------------------------------------------
// Answer rating: five real radio inputs in a fieldset, so keyboard and
// screen-reader behavior is native. Stars are decoration; the labels carry
// the meaning. Ratings tolerate an unpublished endpoint honestly.
// ---------------------------------------------------------------------------

function AnswerRating({ question, token }: { question: QuestionItem; token: string | null }) {
  const [rating, setRating] = useState<number | null>(question.rating ?? null);
  const [savedRating, setSavedRating] = useState<number | null>(question.rating ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const groupName = `answer-rating-${question.id}`;

  const submit = async (value: number) => {
    setBusy(true);
    setMessage(null);
    const result = await rateAnswer<{ saved?: boolean }>(question.id, { rating: value }, token);
    setBusy(false);
    if (result.kind === "ok") {
      setSavedRating(value);
      setMessage(`Thank you. You rated this answer ${value} of 5.`);
      return;
    }
    if (result.kind === "unavailable") {
      setMessage("Ratings are not connected to the server yet. Your selection was not saved.");
      return;
    }
    if (result.kind === "unauthorized") {
      setMessage("Your session has ended. Sign in again to rate this answer.");
      return;
    }
    setMessage(failureText(result, "That did not go through. Please try again."));
  };

  return (
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="form-label">Rate this answer</legend>
      <div role="radiogroup" aria-label="Rate this answer from 1, lowest, to 5, highest" className="flex flex-wrap gap-2 mt-2">
        {[1, 2, 3, 4, 5].map((value) => {
          const checked = rating === value;
          return (
            <label
              key={value}
              className={`chip ${checked ? "ra-chip-selected" : "text-ink-2"}`}
              style={{ cursor: busy ? "default" : "pointer" }}
            >
              <input
                type="radio"
                name={groupName}
                value={value}
                checked={checked}
                className="sr-only"
                onChange={() => {
                  setRating(value);
                  void submit(value);
                }}
              />
              <span aria-hidden="true">{"★".repeat(value)}</span>
              <span className="sr-only">
                {value} {value === 1 ? "star" : "stars"}
              </span>
            </label>
          );
        })}
      </div>
      {savedRating !== null && !message && (
        <p className="body-s text-ink-mute mt-2" role="status">
          You rated this answer {savedRating} of 5.
        </p>
      )}
      {message && (
        <p className="body-s text-ink-2 mt-2" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Telegram link panel. The link and unlink controls exist only when the
// telegram_support capability is enabled; until then the boundary renders
// its honest pending copy and this panel adds a plain reassurance that
// questions asked here still reach a person.
// ---------------------------------------------------------------------------

interface TelegramLinkState {
  linked: boolean;
  username?: string | null;
}

function fixtureTelegram(): TelegramLinkState {
  return { linked: false };
}

function TelegramPanel({ status, token }: { status: CapabilityStatus; token: string | null }) {
  return (
    <section className="card" aria-label="Telegram support">
      <p className="mono-label text-ink-mute">Telegram support</p>
      <p className="body-s text-ink-2 mt-2" style={{ maxWidth: "56ch" }}>
        Link your Telegram account to ask questions and receive answers there as well. It is optional; everything works
        from this page either way.
      </p>
      <div className="mt-4">
        <ResearchCapabilityBoundary status={status}>
          <TelegramControls token={token} />
        </ResearchCapabilityBoundary>
      </div>
      {status.state !== "enabled" && (
        <p className="body-s text-ink-mute mt-3" style={{ maxWidth: "52ch" }}>
          Until Telegram is connected, questions asked on this page still reach a person the same way.
        </p>
      )}
    </section>
  );
}

function TelegramControls({ token }: { token: string | null }) {
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [link, setLink] = useState<TelegramLinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchTelegramLink<TelegramLinkState>(token).then((result) => {
      if (!alive) return;
      if (result.kind === "ok") {
        setLink({ linked: result.data.linked === true, username: result.data.username ?? null });
        setState("ready");
        return;
      }
      if (result.kind === "unavailable") {
        const fixture = devFixture(fixtureTelegram);
        if (fixture) {
          setLink(fixture);
          setState("ready");
        } else {
          setState("unavailable");
        }
        return;
      }
      setState("error");
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const linkAccount = async () => {
    setBusy(true);
    setMessage(null);
    const result = await linkTelegram<{ linkUrl?: string }>(token);
    setBusy(false);
    if (result.kind === "ok") {
      if (result.data.linkUrl) {
        setMessage("A secure linking window has been prepared. Open the link below to finish in Telegram.");
        window.open(result.data.linkUrl, "_blank", "noopener,noreferrer");
      } else {
        setMessage("Linking started. Follow the instructions sent to your account to finish in Telegram.");
      }
      return;
    }
    if (result.kind === "unavailable") {
      setMessage("Telegram linking is not connected to the server yet. Nothing was changed.");
      return;
    }
    setMessage(
      result.kind === "unauthorized"
        ? "Your session has ended. Sign in again to link Telegram."
        : failureText(result, "That did not go through. Please try again."),
    );
  };

  const unlinkAccount = async () => {
    setBusy(true);
    setMessage(null);
    const result = await unlinkTelegram<{ unlinked?: boolean }>(token);
    setBusy(false);
    if (result.kind === "ok") {
      setLink({ linked: false });
      setMessage("Telegram has been unlinked. You can relink at any time.");
      return;
    }
    if (result.kind === "unavailable") {
      setMessage("Telegram unlinking is not connected to the server yet. Nothing was changed.");
      return;
    }
    setMessage(
      result.kind === "unauthorized"
        ? "Your session has ended. Sign in again to unlink Telegram."
        : failureText(result, "That did not go through. Please try again."),
    );
  };

  if (state === "loading") return <ResearchLoadingState label="Checking Telegram status" />;
  if (state === "unavailable") {
    return (
      <p className="body-s text-ink-2" style={{ maxWidth: "52ch" }}>
        Telegram linking is not connected to the server yet. Questions asked on this page still reach a person.
      </p>
    );
  }
  if (state === "error" || link === null) {
    return (
      <p className="body-s text-ink-2" style={{ maxWidth: "52ch" }} role="status">
        Telegram status could not be loaded right now. Questions asked on this page still reach a person.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <ResearchStatusBadge label={link.linked ? "Linked" : "Not linked"} tone={link.linked ? "success" : "neutral"} />
        {link.linked && link.username && <span className="body-s text-ink-2">Connected as {link.username}</span>}
        {link.linked ? (
          <button type="button" className="btn btn-secondary" onClick={() => void unlinkAccount()} disabled={busy}>
            {busy ? "Working..." : "Unlink Telegram"}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => void linkAccount()} disabled={busy}>
            {busy ? "Working..." : "Link Telegram"}
          </button>
        )}
      </div>
      {message && (
        <p className="body-s text-ink-2 mt-3" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
