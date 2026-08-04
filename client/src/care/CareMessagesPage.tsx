import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  CARE_EMERGENCY_NOTICE,
  CARE_NO_TRANSMISSION_NOTICE,
  isRecord,
  loadCarePatientSurface,
  newIdempotencyKey,
  optionalString,
  readStorage,
  recordCarePatientEntry,
  storageMissingExplanation,
  type CarePatientSurfaceState,
  type CareRecordWriteState,
  type CareSurfaceStorage,
} from "./patient-surface";
import {
  CareNoTransmissionNotice,
  CareSurfaceStateCard,
  careSurfaceHeadline,
  type CareSurfaceSubject,
} from "./CarePatientSurfaceStates";

/**
 * Care messages.
 *
 * Care has no outbound transport of any kind. Nothing written on this page is
 * emailed, texted, pushed, or delivered to a clinician, and nobody is notified
 * that it exists. Writing something here creates a record that a person can
 * read later, and that is the whole of it.
 *
 * That constraint is not a caption on this page, it is the design of it:
 *
 * - the control is labelled "Record this message", never "Send"
 * - the confirmation says recorded, never sent, delivered, or received
 * - the transmission notice is written in this file rather than taken from the
 *   response, so no server field can ever upgrade the promise this page makes
 * - a thread is never described as read, answered, or being worked on, and an
 *   assigned clinician is reported as assigned on the record and nothing more
 *
 * The conversation a message goes into is chosen from the patient's own
 * threads. This page never accepts a typed conversation identifier, so the one
 * caller-supplied identifier the write route accepts can only ever be one the
 * server already handed this patient. The route checks ownership again
 * regardless, and this page trusts that check rather than its own list.
 */

export const CARE_MESSAGES_PATH = "/care/messages";

const THREAD_STATUS_LABELS = {
  open: "Open",
  awaiting_patient: "Recorded as waiting on you",
  awaiting_clinician: "Recorded as waiting on a clinician",
  closed: "Closed",
} as const;

type KnownThreadStatus = keyof typeof THREAD_STATUS_LABELS;

const NEW_CONVERSATION = "new";
const BODY_LIMIT = 4000;
const SUBJECT_LIMIT = 200;

const SUBJECT: CareSurfaceSubject = {
  possessive: "Your messages",
  plural: "messages",
};

interface ThreadRow {
  id: string;
  subject: string;
  status: KnownThreadStatus | null;
  messageCount: number | null;
  clinicianAssigned: boolean;
  lastMessageAt: string | null;
  lastMessageFrom: "patient" | "clinician" | null;
}

interface MessagesData {
  storage: CareSurfaceStorage;
  threads: readonly ThreadRow[];
  unreadable: number;
  recordingAvailable: boolean;
}

function threadStatus(value: unknown): KnownThreadStatus | null {
  return typeof value === "string" && value in THREAD_STATUS_LABELS
    ? (value as KnownThreadStatus)
    : null;
}

function lastFrom(value: unknown): "patient" | "clinician" | null {
  return value === "patient" || value === "clinician" ? value : null;
}

function toRow(value: unknown): ThreadRow | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value.id);
  if (!id) return null;
  return {
    id,
    subject: optionalString(value.subject) ?? "No subject recorded",
    status: threadStatus(value.status),
    messageCount:
      typeof value.messageCount === "number" && Number.isFinite(value.messageCount)
        ? value.messageCount
        : null,
    clinicianAssigned: value.clinicianAssigned === true,
    lastMessageAt: optionalString(value.lastMessageAt),
    lastMessageFrom: lastFrom(value.lastMessageFrom),
  };
}

function parse(body: Record<string, unknown>): MessagesData | null {
  if (!Array.isArray(body.threads)) return null;
  const parsed = body.threads.map(toRow);
  const storage = readStorage(body);
  return {
    storage,
    threads: parsed.filter((row): row is ThreadRow => row !== null),
    unreadable: parsed.filter((row) => row === null).length,
    // Offered only where the server says something can hold it, and only where
    // storage is actually available. The write route refuses independently of
    // whatever this page decided.
    recordingAvailable: body.sendAvailable === true && storage.available,
  };
}

function writeOutcome(write: CareRecordWriteState): {
  tone: "recorded" | "refused";
  heading: string;
  message: string;
} | null {
  switch (write.kind) {
    case "idle":
    case "submitting":
      return null;
    case "recorded":
      return {
        tone: "recorded",
        heading: "RECORDED, NOT SENT",
        message:
          "Your message was recorded. It was not sent to anybody, nobody has been notified that it exists, and no reply has been promised. It is held for a person to read later.",
      };
    case "not_served":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message: `Your message was not recorded and nobody will see it. This release answers nothing at ${write.contract}, so there was nothing to write to. Keep what you wrote and contact the team directly.`,
      };
    case "not_recorded":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message:
          write.missingTables.length > 0
            ? `${write.message} The missing record is named ${write.missingTables.join(", ")}.`
            : write.message,
      };
    case "refused":
      return { tone: "refused", heading: "NOT RECORDED", message: write.message };
    case "invalid":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message:
          "Your message was not recorded and nobody will see it. It was rejected before anything was written. Check that the message is not empty and is within the length limit, then try again.",
      };
    case "auth_required":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message:
          "Your message was not recorded and nobody will see it. You are not signed in. Sign in and write it again.",
      };
    case "forbidden":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message:
          "Your message was not recorded and nobody will see it. Your account does not hold the permission this needs.",
      };
    case "disabled":
      return { tone: "refused", heading: "NOT RECORDED", message: write.message };
    case "error":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message:
          "Your message was not recorded and nobody will see it. Something failed and no record came back, so it must not be treated as kept. Keep what you wrote and try again.",
      };
  }
}

export default function CareMessagesPage() {
  const [state, setState] = useState<CarePatientSurfaceState<MessagesData>>({
    kind: "loading",
  });
  const [write, setWrite] = useState<CareRecordWriteState>({ kind: "idle" });
  const [threadId, setThreadId] = useState<string>(NEW_CONVERSATION);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setState(await loadCarePatientSurface(CARE_ROUTE_CONTRACTS.messages, parse));
  }, []);

  useEffect(() => void load(), [load]);

  const data = state.kind === "ready" ? state.data : null;
  const headline = careSurfaceHeadline(state, SUBJECT);
  const canRecord = data?.recordingAvailable === true;
  const trimmedBody = messageBody.trim();
  const submitting = write.kind === "submitting";
  const outcome = writeOutcome(write);

  const record = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canRecord || submitting || trimmedBody.length === 0) return;
      setWrite({ kind: "submitting" });
      const result = await recordCarePatientEntry(
        CARE_ROUTE_CONTRACTS.messages,
        {
          threadId: threadId === NEW_CONVERSATION ? null : threadId,
          subject:
            threadId === NEW_CONVERSATION && messageSubject.trim().length > 0
              ? messageSubject.trim()
              : null,
          body: trimmedBody,
          idempotencyKey: newIdempotencyKey(),
        },
        // Believed only when a record came back with an identifier on it.
        (body) => isRecord(body.message) && typeof body.message.id === "string",
      );
      setWrite(result);
      if (result.kind === "recorded") {
        setMessageBody("");
        setMessageSubject("");
        await load();
      }
    },
    [canRecord, load, messageSubject, submitting, threadId, trimmedBody],
  );

  return (
    <PageShell>
      <SeoHead
        title="Care messages, xenios"
        description="Record a message in the separate Xenios Care pathway. Care sends nothing and notifies nobody."
        path={CARE_MESSAGES_PATH}
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · MESSAGES</p>
        <h1 className="display-m max-w-[22ch]">
          You can write something down here. It does not go anywhere.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          Care has no way to deliver a message. What you write is recorded so a
          person can read it later, and no email, text message, or notification
          is sent to you, to a clinician, or to anyone else. Nobody is watching
          this page.
        </p>

        <CareNoTransmissionNotice
          notice={CARE_NO_TRANSMISSION_NOTICE}
          emergency={CARE_EMERGENCY_NOTICE}
        />

        <section
          className="mt-12 max-w-[920px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-messages-status"
        >
          <p className="mono-label text-pulse mb-3">YOUR CONVERSATIONS</p>
          <h2 id="care-messages-status" className="h2">
            {headline ??
              (!data?.storage.available
                ? "Your conversations cannot be read yet."
                : data.threads.length === 0
                  ? "No conversation is recorded for you."
                  : "Conversations recorded for you")}
          </h2>

          <CareSurfaceStateCard
            state={state}
            subject={SUBJECT}
            onRetry={() => void load()}
          />

          {data && !data.storage.available && (
            <div className="card mt-6">
              <p className="mono-label text-pulse mb-2">RECORD NOT AVAILABLE</p>
              <p className="body-m text-ink-2 max-w-[64ch]">
                {storageMissingExplanation(data.storage, "Your conversations")}
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}

          {data && data.storage.available && data.threads.length === 0 && (
            <div className="card mt-6">
              <p className="body-m text-ink-2 max-w-[64ch]">
                Nothing has been written yet, by you or by anyone else. A
                conversation appears here only after a message is recorded in
                it, and this page never invents one.
              </p>
            </div>
          )}

          {data && data.threads.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 mt-6" role="list">
              {data.threads.map((thread) => (
                <li className="card" key={thread.id}>
                  <p className="mono-label text-ink-mute">
                    {thread.status
                      ? THREAD_STATUS_LABELS[thread.status].toUpperCase()
                      : "STATE NOT RECOGNIZED"}
                  </p>
                  <h3 className="h3 mt-3 break-words">{thread.subject}</h3>
                  <p className="body-m text-ink-2 mt-4 max-w-[60ch]">
                    {thread.clinicianAssigned
                      ? "A clinician is recorded as assigned to this conversation. That is a record, not an activity: it does not mean anyone has read it, and no reply has been promised."
                      : "Nobody is assigned to this conversation. Nobody has been told it exists."}
                  </p>
                  <dl className="mt-4">
                    <div className="flex flex-col gap-1 py-3 rule-top">
                      <dt className="mono-label text-ink-mute">
                        MESSAGES RECORDED
                      </dt>
                      <dd className="body-m">
                        {thread.messageCount === null
                          ? "Not recorded"
                          : String(thread.messageCount)}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1 py-3 rule-top">
                      <dt className="mono-label text-ink-mute">LAST WRITTEN</dt>
                      <dd className="body-m break-words">
                        {thread.lastMessageAt ?? "Not recorded"}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1 py-3 rule-top">
                      <dt className="mono-label text-ink-mute">
                        LAST WRITTEN BY
                      </dt>
                      <dd className="body-m">
                        {thread.lastMessageFrom === "patient"
                          ? "You"
                          : thread.lastMessageFrom === "clinician"
                            ? "A clinician"
                            : "Not recorded"}
                      </dd>
                    </div>
                  </dl>
                  <p className="body-s text-ink-mute mt-4 max-w-[60ch]">
                    Message text is not displayed on this page.
                  </p>
                </li>
              ))}
            </ul>
          )}

          {data && data.unreadable > 0 && (
            <div className="card mt-6" role="alert">
              <p className="mono-label text-pulse mb-2">NOT DISPLAYED</p>
              <p className="body-m text-ink-2 max-w-[64ch]">
                {`${data.unreadable} conversation${data.unreadable === 1 ? "" : "s"} came back in a shape this page could not read completely, so ${data.unreadable === 1 ? "it is" : "they are"} not shown rather than shown partly. This is reported instead of hidden.`}
              </p>
            </div>
          )}
        </section>

        {data && (
          <section
            className="mt-12 max-w-[640px]"
            aria-labelledby="care-messages-compose-title"
          >
            <p className="mono-label text-pulse mb-3">WRITE SOMETHING DOWN</p>
            <h2 id="care-messages-compose-title" className="h2">
              Record a message
            </h2>
            <p className="body-m text-ink-2 mt-4 max-w-[60ch]">
              This records what you write. It does not send it, and it does not
              tell anybody it is there.
            </p>

            <form className="mt-8" onSubmit={(event) => void record(event)}>
              <label
                htmlFor={"care-message-thread"}
                className="mono-label block mb-3"
              >
                CONVERSATION
              </label>
              <select
                id={"care-message-thread"}
                name="threadId"
                className="input-field"
                value={threadId}
                onChange={(event) => setThreadId(event.target.value)}
                aria-describedby={"care-message-thread-help"}
                disabled={!canRecord || submitting}
              >
                <option value={NEW_CONVERSATION}>Start a new conversation</option>
                {data.threads.map((thread) => (
                  <option value={thread.id} key={thread.id}>
                    {thread.subject}
                  </option>
                ))}
              </select>
              <p id={"care-message-thread-help"} className="body-s text-ink-mute mt-2">
                You can only add to a conversation that is already yours.
              </p>

              {threadId === NEW_CONVERSATION && (
                <>
                  <label
                    htmlFor={"care-message-subject"}
                    className="mono-label block mb-3 mt-8"
                  >
                    SUBJECT, OPTIONAL
                  </label>
                  <input
                    id={"care-message-subject"}
                    name="subject"
                    className="input-field"
                    value={messageSubject}
                    onChange={(event) => setMessageSubject(event.target.value)}
                    maxLength={SUBJECT_LIMIT}
                    autoComplete="off"
                    aria-describedby={"care-message-subject-help"}
                    disabled={!canRecord || submitting}
                  />
                  <p
                    id={"care-message-subject-help"}
                    className="body-s text-ink-mute mt-2"
                  >
                    {`Up to ${SUBJECT_LIMIT} characters. This is a label for you, not a request for attention.`}
                  </p>
                </>
              )}

              <label
                htmlFor={"care-message-body"}
                className="mono-label block mb-3 mt-8"
              >
                MESSAGE
              </label>
              <textarea
                id={"care-message-body"}
                name="body"
                className="input-field textarea-field"
                rows={6}
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                maxLength={BODY_LIMIT}
                required
                aria-describedby={"care-message-body-help"}
                disabled={!canRecord || submitting}
              />
              <p id={"care-message-body-help"} className="body-s text-ink-mute mt-2">
                {`Up to ${BODY_LIMIT} characters. Do not use this for an urgent or emergency problem, because nobody is reading it.`}
              </p>

              <button
                type="submit"
                className="btn btn-primary mt-8"
                disabled={!canRecord || submitting || trimmedBody.length === 0}
                aria-describedby={"care-message-submit-help"}
              >
                {submitting ? "Recording…" : "Record this message"}
              </button>
              <p id={"care-message-submit-help"} className="body-s text-ink-2 mt-3 max-w-[60ch]">
                {canRecord
                  ? "This button records your message. It does not send it, and nobody is notified."
                  : "This button is unavailable, because nothing here can hold a Care message yet. Writing one now would be telling you it was kept when it was not."}
              </p>
            </form>
          </section>
        )}

        {outcome && (
          <div
            className="card mt-8 max-w-[640px]"
            role="alert"
            aria-labelledby="care-messages-outcome"
          >
            <p
              id="care-messages-outcome"
              className={
                outcome.tone === "recorded"
                  ? "mono-label text-ink-mute mb-2"
                  : "mono-label text-pulse mb-2"
              }
            >
              {outcome.heading}
            </p>
            <p className="body-m text-ink-2 max-w-[60ch]">{outcome.message}</p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
