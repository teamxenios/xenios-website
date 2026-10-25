import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  CARE_EMERGENCY_NOTICE,
  CARE_NO_TRANSMISSION_NOTICE,
  isRecord,
  labelFor,
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
 * Care support.
 *
 * Two truths carry this page, and both of them are unwelcome, which is exactly
 * why they are stated at the top rather than buried.
 *
 * Nothing is transmitted. Care has no outbound transport, so a support request
 * is recorded and nobody is told it exists. The control says "Record", the
 * confirmation says recorded, and neither ever says sent, received, or that
 * somebody is looking into it.
 *
 * Support is not a clinical channel. Nobody clinical reads it. A medical
 * question written here would sit unread by anyone qualified to answer it,
 * which is worse than not writing it, so this page says so before the form
 * rather than after it.
 *
 * A request nobody has taken is reported as nobody having taken it. That is
 * the honest state, and softening it into reassurance is the specific failure
 * this surface refuses.
 */

export const CARE_SUPPORT_PATH = "/care/support";

const SCOPE_NOTICE =
  "Support handles account, billing, scheduling, and technical questions. It is not a clinical channel, nobody clinical reads it, and it must not be used for a medical question or an urgent problem.";

const TOPICS = [
  ["account", "Account"],
  ["billing", "Billing"],
  ["scheduling", "Scheduling"],
  ["technical", "Technical"],
  ["other", "Something else"],
] as const;

const TOPIC_LABELS = {
  account: "Account",
  billing: "Billing",
  scheduling: "Scheduling",
  technical: "Technical",
  other: "Something else",
} as const;

const STATUS_LABELS = {
  received: "Recorded",
  in_progress: "Recorded as in progress",
  resolved: "Recorded as resolved",
  closed: "Closed",
} as const;

type KnownStatus = keyof typeof STATUS_LABELS;

const BODY_LIMIT = 4000;

const SUBJECT: CareSurfaceSubject = {
  possessive: "Your support requests",
  plural: "support requests",
};

interface RequestRow {
  id: string;
  topic: string;
  status: KnownStatus | null;
  assigned: boolean;
  recordedAt: string | null;
  resolvedAt: string | null;
}

interface SupportData {
  storage: CareSurfaceStorage;
  rows: readonly RequestRow[];
  unreadable: number;
  recordingAvailable: boolean;
}

function knownStatus(value: unknown): KnownStatus | null {
  return typeof value === "string" && value in STATUS_LABELS
    ? (value as KnownStatus)
    : null;
}

function toRow(value: unknown): RequestRow | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value.id);
  if (!id) return null;
  const status = knownStatus(value.status);
  return {
    id,
    topic: labelFor(TOPIC_LABELS, value.topic, "Not categorized"),
    status,
    assigned: value.assigned === true,
    recordedAt: optionalString(value.recordedAt),
    // Resolved only where the status itself says resolved, so a stray date can
    // never read as an outcome that did not happen.
    resolvedAt: status === "resolved" ? optionalString(value.resolvedAt) : null,
  };
}

function parse(body: Record<string, unknown>): SupportData | null {
  if (!Array.isArray(body.requests)) return null;
  const parsed = body.requests.map(toRow);
  const storage = readStorage(body);
  return {
    storage,
    rows: parsed.filter((row): row is RequestRow => row !== null),
    unreadable: parsed.filter((row) => row === null).length,
    recordingAvailable: body.submissionAvailable === true && storage.available,
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
          "Your request was recorded. It was not sent to anybody, nobody has been notified that it exists, and nobody has taken it yet. It is held for a person to read later.",
      };
    case "not_served":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message: `Your request was not recorded and nobody will see it. This release answers nothing at ${write.contract}, so there was nothing to write to. Keep what you wrote and contact the team directly.`,
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
          "Your request was not recorded and nobody will see it. It was rejected before anything was written. Check that it is not empty and is within the length limit, then try again.",
      };
    case "auth_required":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message:
          "Your request was not recorded and nobody will see it. You are not signed in. Sign in and write it again.",
      };
    case "forbidden":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message:
          "Your request was not recorded and nobody will see it. Your account does not hold the permission this needs.",
      };
    case "disabled":
      return { tone: "refused", heading: "NOT RECORDED", message: write.message };
    case "error":
      return {
        tone: "refused",
        heading: "NOT RECORDED",
        message:
          "Your request was not recorded and nobody will see it. Something failed and no record came back, so it must not be treated as kept. Keep what you wrote and try again.",
      };
  }
}

export default function CareSupportPage() {
  const [state, setState] = useState<CarePatientSurfaceState<SupportData>>({
    kind: "loading",
  });
  const [write, setWrite] = useState<CareRecordWriteState>({ kind: "idle" });
  const [topic, setTopic] = useState<string>(TOPICS[0][0]);
  const [requestBody, setRequestBody] = useState("");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setState(await loadCarePatientSurface(CARE_ROUTE_CONTRACTS.support, parse));
  }, []);

  useEffect(() => void load(), [load]);

  const data = state.kind === "ready" ? state.data : null;
  const headline = careSurfaceHeadline(state, SUBJECT);
  const canRecord = data?.recordingAvailable === true;
  const trimmedBody = requestBody.trim();
  const submitting = write.kind === "submitting";
  const outcome = writeOutcome(write);

  const record = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canRecord || submitting || trimmedBody.length === 0) return;
      setWrite({ kind: "submitting" });
      const result = await recordCarePatientEntry(
        CARE_ROUTE_CONTRACTS.support,
        { topic, body: trimmedBody, idempotencyKey: newIdempotencyKey() },
        (body) => isRecord(body.request) && typeof body.request.id === "string",
      );
      setWrite(result);
      if (result.kind === "recorded") {
        setRequestBody("");
        await load();
      }
    },
    [canRecord, load, submitting, topic, trimmedBody],
  );

  return (
    <PageShell>
      <SeoHead
        title="Care support, xenios"
        description="Record a support request in the separate Xenios Care pathway. Support is not a clinical channel and Care sends nothing."
        path={CARE_SUPPORT_PATH}
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · SUPPORT</p>
        <h1 className="display-m max-w-[22ch]">
          Support is not a clinical channel, and nothing written here is sent.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">{SCOPE_NOTICE}</p>

        <CareNoTransmissionNotice
          notice={CARE_NO_TRANSMISSION_NOTICE}
          emergency={CARE_EMERGENCY_NOTICE}
        />

        <section
          className="mt-12 max-w-[920px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-support-status"
        >
          <p className="mono-label text-pulse mb-3">YOUR REQUESTS</p>
          <h2 id="care-support-status" className="h2">
            {headline ??
              (!data?.storage.available
                ? "Your support requests cannot be read yet."
                : data.rows.length === 0
                  ? "No support request is recorded for you."
                  : "Support requests recorded for you")}
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
                {storageMissingExplanation(data.storage, SUBJECT.possessive)}
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}

          {data && data.storage.available && data.rows.length === 0 && (
            <div className="card mt-6">
              <p className="body-m text-ink-2 max-w-[64ch]">
                You have not written a support request. One appears here only
                after it is recorded, and this page never invents one.
              </p>
            </div>
          )}

          {data && data.rows.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 mt-6" role="list">
              {data.rows.map((row) => (
                <li className="card" key={row.id}>
                  <p className="mono-label text-ink-mute">
                    {row.topic.toUpperCase()}
                  </p>
                  <h3 className="h3 mt-3">
                    {row.status
                      ? STATUS_LABELS[row.status]
                      : "State not recognized"}
                  </h3>
                  <p className="body-m text-ink-2 mt-4 max-w-[60ch]">
                    {row.assigned
                      ? "A named person has taken this request. That does not mean it has been answered."
                      : "Nobody has taken this request yet, and nobody has been told it exists."}
                  </p>
                  <dl className="mt-4">
                    <div className="flex flex-col gap-1 py-3 rule-top">
                      <dt className="mono-label text-ink-mute">RECORDED</dt>
                      <dd className="body-m break-words">
                        {row.recordedAt ?? "Not recorded"}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1 py-3 rule-top">
                      <dt className="mono-label text-ink-mute">RESOLVED</dt>
                      <dd className="body-m break-words">
                        {row.resolvedAt ?? "Not recorded"}
                      </dd>
                    </div>
                  </dl>
                  <p className="body-s text-ink-mute mt-4 max-w-[60ch]">
                    Request text is not displayed on this page.
                  </p>
                </li>
              ))}
            </ul>
          )}

          {data && data.unreadable > 0 && (
            <div className="card mt-6" role="alert">
              <p className="mono-label text-pulse mb-2">NOT DISPLAYED</p>
              <p className="body-m text-ink-2 max-w-[64ch]">
                {`${data.unreadable} request${data.unreadable === 1 ? "" : "s"} came back in a shape this page could not read completely, so ${data.unreadable === 1 ? "it is" : "they are"} not shown rather than shown partly. This is reported instead of hidden.`}
              </p>
            </div>
          )}
        </section>

        {data && (
          <section
            className="mt-12 max-w-[640px]"
            aria-labelledby="care-support-compose-title"
          >
            <p className="mono-label text-pulse mb-3">WRITE SOMETHING DOWN</p>
            <h2 id="care-support-compose-title" className="h2">
              Record a support request
            </h2>
            <p className="body-m text-ink-2 mt-4 max-w-[60ch]">
              This records what you write. It does not send it, nobody is
              notified, and nobody clinical reads support.
            </p>

            <form className="mt-8" onSubmit={(event) => void record(event)}>
              <label
                htmlFor={"care-support-topic"}
                className="mono-label block mb-3"
              >
                TOPIC
              </label>
              <select
                id={"care-support-topic"}
                name="topic"
                className="input-field"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                aria-describedby={"care-support-topic-help"}
                disabled={!canRecord || submitting}
              >
                {TOPICS.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p id={"care-support-topic-help"} className="body-s text-ink-mute mt-2">
                There is no clinical topic on purpose. A medical question does
                not belong here.
              </p>

              <label
                htmlFor={"care-support-body"}
                className="mono-label block mb-3 mt-8"
              >
                WHAT YOU NEED
              </label>
              <textarea
                id={"care-support-body"}
                name="body"
                className="input-field textarea-field"
                rows={6}
                value={requestBody}
                onChange={(event) => setRequestBody(event.target.value)}
                maxLength={BODY_LIMIT}
                required
                aria-describedby={"care-support-body-help"}
                disabled={!canRecord || submitting}
              />
              <p id={"care-support-body-help"} className="body-s text-ink-mute mt-2">
                {`Up to ${BODY_LIMIT} characters. Do not use this for an urgent or emergency problem, because nobody is reading it.`}
              </p>

              <button
                type="submit"
                className="btn btn-primary mt-8"
                disabled={!canRecord || submitting || trimmedBody.length === 0}
                aria-describedby={"care-support-submit-help"}
              >
                {submitting ? "Recording…" : "Record this request"}
              </button>
              <p
                id={"care-support-submit-help"}
                className="body-s text-ink-2 mt-3 max-w-[60ch]"
              >
                {canRecord
                  ? "This button records your request. It does not send it, and nobody is notified."
                  : "This button is unavailable, because nothing here can hold a Care support request yet. Taking one now would be telling you it was kept when it was not."}
              </p>
            </form>
          </section>
        )}

        {outcome && (
          <div
            className="card mt-8 max-w-[640px]"
            role="alert"
            aria-labelledby="care-support-outcome"
          >
            <p
              id="care-support-outcome"
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

        <section
          className="mt-16 pt-12 rule-top max-w-[760px]"
          aria-labelledby="care-support-boundary"
        >
          <p className="mono-cap text-ink-mute mb-5">EMERGENCY BOUNDARY</p>
          <h2 id="care-support-boundary" className="display-s">
            This site is not emergency care.
          </h2>
          <p className="body-m text-ink-2 mt-6 max-w-[64ch]">
            If you may be experiencing a medical emergency, contact local
            emergency services now. Do not wait for a message or a response from
            Xenios, because none is coming from this page.
          </p>
          <Link href="/contact" className="btn btn-secondary mt-8">
            Other ways to reach Xenios
          </Link>
        </section>
      </div>
    </PageShell>
  );
}
