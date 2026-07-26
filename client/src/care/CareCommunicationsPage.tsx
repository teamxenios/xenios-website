import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import {
  CARE_ADVERSE_EVENT_CATEGORIES,
  CARE_ADVERSE_EVENT_URGENCIES,
  CARE_EMERGENCY_GUIDANCE,
  type CareAdverseEvent,
  type CareLabCase,
  type CareMessageConversation,
} from "@shared/care/communications";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "auth_required" }
  | { kind: "error" }
  | {
      kind: "ready";
      conversations: CareMessageConversation[];
      labCases: CareLabCase[];
      adverseEvents: CareAdverseEvent[];
    };

export default function CareCommunicationsPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [summary, setSummary] = useState("");
  const [category, setCategory] =
    useState<(typeof CARE_ADVERSE_EVENT_CATEGORIES)[number]>("adverse_event");
  const [urgency, setUrgency] =
    useState<(typeof CARE_ADVERSE_EVENT_URGENCIES)[number]>("routine");
  const [guidanceAcknowledged, setGuidanceAcknowledged] = useState(false);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [messageState, setMessageState] = useState<
    Record<string, "idle" | "saving" | "success" | "error">
  >({});
  const [submitState, setSubmitState] =
    useState<"idle" | "saving" | "success" | "error">("idle");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const responses = await Promise.all([
        careApiFetch("/api/care/messages"),
        careApiFetch("/api/care/labs"),
        careApiFetch("/api/care/adverse-events"),
      ]);
      const bodies = await Promise.all(
        responses.map((response) => response.json().catch(() => ({}))),
      );
      if (responses.some((response) => response.status === 401)) {
        return setState({ kind: "auth_required" });
      }
      if (
        responses.some(
          (response, index) =>
            response.status === 503 && bodies[index]?.code === "care_disabled",
        )
      ) {
        return setState({ kind: "disabled" });
      }
      if (
        responses.some((response) => !response.ok) ||
        !Array.isArray(bodies[0]?.conversations) ||
        !Array.isArray(bodies[1]?.labCases) ||
        !Array.isArray(bodies[2]?.adverseEvents)
      ) {
        throw new Error("care_communications_unavailable");
      }
      setState({
        kind: "ready",
        conversations: bodies[0].conversations,
        labCases: bodies[1].labCases,
        adverseEvents: bodies[2].adverseEvents,
      });
    } catch {
      setState({ kind: "error" });
    }
  }, []);
  useEffect(() => void load(), [load]);

  const postMessage = async (threadId: string) => {
    const body = messageDrafts[threadId]?.trim();
    if (!body) return;
    setMessageState((current) => ({ ...current, [threadId]: "saving" }));
    try {
      const response = await careApiFetch(`/api/care/messages/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error("care_message_failed");
      setMessageDrafts((current) => ({ ...current, [threadId]: "" }));
      setMessageState((current) => ({ ...current, [threadId]: "success" }));
      await load();
    } catch {
      setMessageState((current) => ({ ...current, [threadId]: "error" }));
    }
  };

  const reportIssue = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitState("saving");
    try {
      const response = await careApiFetch("/api/care/adverse-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          urgency,
          summary,
          emergencyGuidanceAcknowledged: guidanceAcknowledged,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error("care_issue_report_failed");
      setSummary("");
      setGuidanceAcknowledged(false);
      setSubmitState("success");
      await load();
    } catch {
      setSubmitState("error");
    }
  };

  const empty =
    state.kind === "ready" &&
    !state.conversations.length &&
    !state.labCases.length &&
    !state.adverseEvents.length;

  return (
    <div className="overflow-x-clip">
      <PageShell>
        <SeoHead
          title="Private Care communications, xenios"
          description="Private Care messages, laboratory status, and issue reporting."
          path="/care/communications"
        />
        <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
          <p className="mono-cap text-pulse mb-6">CARE · PRIVATE COMMUNICATIONS</p>
          <h1 className="display-m max-w-[18ch]">
            One private place for messages, laboratory status, and concerns.
          </h1>
          <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
            Records appear only when they belong to your Care account. This
            foundation does not send messages, place laboratory orders, or
            contact an external escalation service.
          </p>

          <section
            className="mt-10 max-w-[960px]"
            aria-live="polite"
            aria-busy={state.kind === "loading"}
          >
            {state.kind === "loading" && (
              <div className="card">
                <h2 className="h2">Confirming private Care access…</h2>
                <p className="body-m text-ink-mute mt-4">
                  No message, laboratory, or issue action is available while
                  authorization is checked.
                </p>
              </div>
            )}
            {state.kind === "disabled" && (
              <div className="card">
                <h2 className="h2">Care communications are not currently available.</h2>
                <p className="body-m text-ink-2 mt-4">
                  Care remains disabled until clinical, privacy, provider,
                  support, and release requirements pass.
                </p>
                <Link href="/care" className="btn btn-secondary mt-6">
                  View Care status
                </Link>
              </div>
            )}
            {state.kind === "auth_required" && (
              <div className="card">
                <h2 className="h2">Authorized Care access is required.</h2>
                <p className="body-m text-ink-2 mt-4">
                  These records are private and separate from Research.
                </p>
              </div>
            )}
            {state.kind === "error" && (
              <div className="card">
                <h2 className="h2">Private Care records are temporarily unavailable.</h2>
                <p className="body-m text-ink-2 mt-4">
                  Nothing was sent or changed. Confirm the records again before
                  relying on their status.
                </p>
                <button type="button" className="btn btn-secondary mt-6" onClick={() => void load()}>
                  Try again
                </button>
              </div>
            )}
            {empty && (
              <div className="card">
                <h2 className="h2">No private Care activity is recorded.</h2>
                <p className="body-m text-ink-2 mt-4">
                  Messages require an assigned clinician. Laboratory references
                  and issue history appear only after authorized records exist.
                </p>
              </div>
            )}

            {state.kind === "ready" && !empty && (
              <div className="grid grid-cols-1 gap-8">
                <section aria-labelledby="care-message-heading">
                  <p className="mono-label text-pulse mb-3">MESSAGES</p>
                  <h2 className="h2" id="care-message-heading">
                    Assigned clinician conversations
                  </h2>
                  <div className="mt-5 grid grid-cols-1 gap-4">
                    {state.conversations.length === 0 ? (
                      <div className="card">
                        <p className="body-m text-ink-2">
                          No assigned-clinician conversation exists.
                        </p>
                      </div>
                    ) : state.conversations.map(({ thread, messages }) => (
                      <article className="card" key={thread.id}>
                        <p className="mono-label text-pulse">{thread.status}</p>
                        <h3 className="h3 mt-2">{thread.subjectCategory}</h3>
                        {messages.length ? (
                          <ol className="mt-5 grid grid-cols-1 gap-3">
                            {messages.map((message) => (
                              <li className="border-t border-line pt-3" key={message.id}>
                                <p className="mono-label text-ink-mute">
                                  {message.senderKind === "care_patient"
                                    ? "YOU"
                                    : "ASSIGNED CLINICIAN"}
                                </p>
                                <p className="body-m text-ink-2 mt-2 whitespace-pre-wrap">
                                  {message.body}
                                </p>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="body-m text-ink-2 mt-4">
                            No messages are recorded in this conversation.
                          </p>
                        )}
                        {thread.status === "open" && (
                          <form
                            className="mt-6 border-t border-line pt-5"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void postMessage(thread.id);
                            }}
                          >
                            <label className="body-m" htmlFor={`care-message-${thread.id}`}>
                              Reply privately
                            </label>
                            <textarea
                              id={`care-message-${thread.id}`}
                              className="input mt-2 min-h-28 w-full"
                              required
                              value={messageDrafts[thread.id] ?? ""}
                              onChange={(event) =>
                                setMessageDrafts((current) => ({
                                  ...current,
                                  [thread.id]: event.target.value,
                                }))
                              }
                            />
                            <p className="body-s text-ink-mute mt-2">
                              This records a private Care message only. No external
                              messaging or notification is sent.
                            </p>
                            {messageState[thread.id] === "success" && (
                              <p className="body-m mt-3" role="status">
                                Your message was recorded privately.
                              </p>
                            )}
                            {messageState[thread.id] === "error" && (
                              <p className="body-m text-ink-2 mt-3" role="alert">
                                The message was not confirmed. Review it and try again.
                              </p>
                            )}
                            <button
                              type="submit"
                              className="btn btn-secondary mt-4"
                              disabled={messageState[thread.id] === "saving"}
                            >
                              {messageState[thread.id] === "saving"
                                ? "Recording..."
                                : "Record private reply"}
                            </button>
                          </form>
                        )}
                      </article>
                    ))}
                  </div>
                </section>

                <section aria-labelledby="care-lab-heading">
                  <p className="mono-label text-pulse mb-3">LABORATORY STATUS</p>
                  <h2 className="h2" id="care-lab-heading">
                    Reference metadata only
                  </h2>
                  <div className="mt-5 grid grid-cols-1 gap-4">
                    {state.labCases.length === 0 ? (
                      <div className="card">
                        <p className="body-m text-ink-2">
                          No laboratory order or result reference is recorded.
                        </p>
                      </div>
                    ) : state.labCases.map((labCase) => (
                      <article className="card" key={labCase.id}>
                        <p className="mono-label text-pulse">{labCase.status.replaceAll("_", " ")}</p>
                        <h3 className="h3 mt-2">Private laboratory record</h3>
                        <p className="body-m text-ink-2 mt-4">
                          This status does not provide ranges, interpretation,
                          diagnosis, or treatment advice.
                        </p>
                      </article>
                    ))}
                  </div>
                </section>

                <section aria-labelledby="care-issue-heading">
                  <p className="mono-label text-pulse mb-3">REPORT A CONCERN</p>
                  <h2 className="h2" id="care-issue-heading">
                    Record an adverse event or quality issue
                  </h2>
                  <div className="card mt-5">
                    <p className="body-m text-ink">{CARE_EMERGENCY_GUIDANCE}</p>
                    <form className="mt-6 grid grid-cols-1 gap-5" onSubmit={(event) => void reportIssue(event)}>
                      <label className="body-m">
                        Concern type
                        <select className="input mt-2 w-full" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                          <option value="adverse_event">Adverse event</option>
                          <option value="quality_concern">Quality concern</option>
                          <option value="device_issue">Device issue</option>
                          <option value="other_issue">Other issue</option>
                        </select>
                      </label>
                      <label className="body-m">
                        Urgency
                        <select className="input mt-2 w-full" value={urgency} onChange={(event) => setUrgency(event.target.value as typeof urgency)}>
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="possible_emergency">Possible emergency</option>
                        </select>
                      </label>
                      <label className="body-m">
                        What happened?
                        <textarea className="input mt-2 min-h-32 w-full" required value={summary} onChange={(event) => setSummary(event.target.value)} />
                      </label>
                      <label className="body-m flex items-start gap-3">
                        <input type="checkbox" required checked={guidanceAcknowledged} onChange={(event) => setGuidanceAcknowledged(event.target.checked)} />
                        <span>I have read the emergency guidance above.</span>
                      </label>
                      {submitState === "success" && (
                        <p className="body-m" role="status">
                          Your concern was recorded privately. This confirmation
                          does not mean an external escalation was sent.
                        </p>
                      )}
                      {submitState === "error" && (
                        <p className="body-m text-ink-2" role="alert">
                          The concern was not confirmed. Review the form and try again.
                        </p>
                      )}
                      <button type="submit" className="btn btn-primary justify-self-start" disabled={submitState === "saving"}>
                        {submitState === "saving" ? "Recording…" : "Record concern"}
                      </button>
                    </form>
                  </div>
                </section>

                {state.adverseEvents.length > 0 && (
                  <section aria-labelledby="care-issue-history">
                    <p className="mono-label text-pulse mb-3">ISSUE HISTORY</p>
                    <h2 className="h2" id="care-issue-history">Recorded concerns</h2>
                    <div className="mt-5 grid grid-cols-1 gap-4">
                      {state.adverseEvents.map((item) => (
                        <article className="card" key={item.id}>
                          <p className="mono-label text-pulse">{item.status}</p>
                          <h3 className="h3 mt-2">{item.category.replaceAll("_", " ")}</h3>
                          <p className="body-m text-ink-2 mt-4">{item.summary}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </section>
        </div>
      </PageShell>
    </div>
  );
}
