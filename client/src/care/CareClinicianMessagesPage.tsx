import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type { CareMessageConversation } from "@shared/care/communications";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; conversations: CareMessageConversation[] };

export default function CareClinicianMessagesPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await careApiFetch("/api/care/messages/clinician");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) return setState({ kind: "forbidden" });
      if (response.status === 503 && body?.code === "care_disabled") return setState({ kind: "disabled" });
      if (!response.ok || !Array.isArray(body.conversations)) throw new Error("unavailable");
      setState({ kind: "ready", conversations: body.conversations });
    } catch {
      setState({ kind: "error" });
    }
  }, []);
  useEffect(() => void load(), [load]);

  const reply = async (conversation: CareMessageConversation) => {
    const body = drafts[conversation.thread.id]?.trim();
    if (!body) return;
    setBusyId(conversation.thread.id);
    setSuccessId(null);
    try {
      const response = await careApiFetch(
        `/api/care/messages/clinician/${conversation.thread.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, idempotencyKey: crypto.randomUUID() }),
        },
      );
      if (!response.ok) throw new Error("message_failed");
      setDrafts((current) => ({ ...current, [conversation.thread.id]: "" }));
      setSuccessId(conversation.thread.id);
      await load();
    } catch {
      setState({ kind: "error" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="overflow-x-clip">
      <PageShell>
        <SeoHead title="Assigned Care messages, xenios" description="Restricted assigned-clinician messaging." path="/care/clinician/messages" />
        <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
          <p className="mono-cap text-pulse mb-6">CARE · CLINICIAN MESSAGES</p>
          <h1 className="display-m max-w-[18ch]">Only conversations assigned to you.</h1>
          <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
            Replies are stored inside the private Care record. This foundation
            sends no email, text, notification, or external provider message.
          </p>
          <section className="mt-10 max-w-[920px]" aria-live="polite" aria-busy={state.kind === "loading"}>
            {state.kind === "loading" && <div className="card"><h2 className="h2">Checking assigned conversations…</h2><p className="body-m text-ink-mute mt-4">Reply controls remain unavailable until assignment is confirmed.</p></div>}
            {state.kind === "disabled" && <div className="card"><h2 className="h2">Clinician messaging is disabled.</h2><p className="body-m text-ink-2 mt-4">No message can be recorded or delivered.</p></div>}
            {state.kind === "forbidden" && <div className="card"><h2 className="h2">Assigned clinician access is required.</h2><p className="body-m text-ink-2 mt-4">Unassigned clinicians cannot view or post to these conversations.</p></div>}
            {state.kind === "error" && <div className="card"><h2 className="h2">Assigned conversations are temporarily unavailable.</h2><p className="body-m text-ink-2 mt-4">Nothing was sent or changed.</p><button className="btn btn-secondary mt-6" type="button" onClick={() => void load()}>Try again</button></div>}
            {state.kind === "ready" && state.conversations.length === 0 && <div className="card"><h2 className="h2">No conversations are assigned.</h2><p className="body-m text-ink-2 mt-4">A conversation appears only for your exact patient appointment assignment.</p></div>}
            {state.kind === "ready" && state.conversations.length > 0 && (
              <div className="grid grid-cols-1 gap-4">
                {state.conversations.map((conversation) => (
                  <article className="card" key={conversation.thread.id}>
                    <p className="mono-label text-pulse">{conversation.thread.status}</p>
                    <h2 className="h3 mt-2">{conversation.thread.subjectCategory}</h2>
                    <div className="mt-5 grid grid-cols-1 gap-3">
                      {conversation.messages.map((message) => (
                        <div className="rule-top pt-3" key={message.id}>
                          <p className="mono-label text-ink-mute">{message.senderKind === "care_patient" ? "PATIENT" : "CLINICIAN"}</p>
                          <p className="body-m text-ink-2 mt-2 whitespace-pre-wrap">{message.body}</p>
                        </div>
                      ))}
                    </div>
                    <label className="body-m block mt-6">
                      Private reply
                      <textarea className="input mt-2 min-h-28 w-full" value={drafts[conversation.thread.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [conversation.thread.id]: event.target.value }))} />
                    </label>
                    {successId === conversation.thread.id && <p className="body-m mt-3" role="status">Reply recorded privately. No external delivery occurred.</p>}
                    <button type="button" className="btn btn-primary mt-5" disabled={busyId === conversation.thread.id || !(drafts[conversation.thread.id] ?? "").trim()} onClick={() => void reply(conversation)}>
                      {busyId === conversation.thread.id ? "Recording…" : "Record private reply"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </PageShell>
    </div>
  );
}
