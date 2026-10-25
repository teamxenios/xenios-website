import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  isRecord,
  labelFor,
  loadCarePatientSurface,
  optionalString,
  readStorage,
  storageMissingExplanation,
  type CarePatientSurfaceState,
  type CareSurfaceStorage,
} from "./patient-surface";
import {
  CareSurfaceStateCard,
  careSurfaceHeadline,
  type CareSurfaceSubject,
} from "./CarePatientSurfaceStates";

/**
 * Patient instructions.
 *
 * Read only. This page has no write path of any kind, because an instruction
 * is something a clinician publishes and a patient reads.
 *
 * The one rule that shapes the display: an instruction shown here was
 * published by a named clinician. The served handler applies that gate before
 * anything leaves the server, and this page never reconstructs an instruction
 * from a draft, never renders an item missing its publication date, and never
 * shows instruction text that the record does not say exists. A draft nobody
 * stood behind is reported as a count of unpublished work, never as guidance.
 */

export const CARE_INSTRUCTIONS_PATH = "/care/instructions";

const CATEGORY_LABELS = {
  medication_use: "Medication use",
  appointment_preparation: "Appointment preparation",
  self_monitoring: "Self monitoring",
  safety: "Safety",
  administrative: "Administrative",
} as const;

const SUBJECT: CareSurfaceSubject = {
  possessive: "Your instructions",
  plural: "instructions",
};

interface InstructionRow {
  id: string;
  title: string;
  category: string;
  version: string;
  publishedAt: string;
  acknowledgedAt: string | null;
  bodyAvailable: boolean;
}

interface InstructionsData {
  storage: CareSurfaceStorage;
  rows: readonly InstructionRow[];
  unreadable: number;
  awaitingPublication: number;
}

/**
 * An item is used only when every field the display depends on is present.
 * `publishedAt` is required here as well as on the server, so a record that
 * lost its publication stamp on the way cannot be rendered as published.
 */
function toRow(value: unknown): InstructionRow | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value.id);
  const title = optionalString(value.title);
  const version = optionalString(value.version);
  const publishedAt = optionalString(value.publishedAt);
  if (!id || !title || !version || !publishedAt) return null;
  return {
    id,
    title,
    category: labelFor(CATEGORY_LABELS, value.category, "Not categorized"),
    version,
    publishedAt,
    acknowledgedAt: optionalString(value.acknowledgedAt),
    bodyAvailable: value.bodyAvailable === true,
  };
}

function parse(body: Record<string, unknown>): InstructionsData | null {
  if (!Array.isArray(body.instructions)) return null;
  const parsed = body.instructions.map(toRow);
  return {
    storage: readStorage(body),
    rows: parsed.filter((row): row is InstructionRow => row !== null),
    unreadable: parsed.filter((row) => row === null).length,
    awaitingPublication:
      typeof body.awaitingPublication === "number" && body.awaitingPublication > 0
        ? body.awaitingPublication
        : 0,
  };
}

export default function CareInstructionsPage() {
  const [state, setState] = useState<CarePatientSurfaceState<InstructionsData>>({
    kind: "loading",
  });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setState(
      await loadCarePatientSurface(CARE_ROUTE_CONTRACTS.instructions, parse),
    );
  }, []);

  useEffect(() => void load(), [load]);

  const headline = careSurfaceHeadline(state, SUBJECT);
  const data = state.kind === "ready" ? state.data : null;

  return (
    <PageShell>
      <SeoHead
        title="Care instructions, xenios"
        description="Patient-specific instructions a named clinician published, in the separate Xenios Care pathway."
        path={CARE_INSTRUCTIONS_PATH}
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · INSTRUCTIONS</p>
        <h1 className="display-m max-w-[20ch]">
          An instruction reaches you only after a clinician published it.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          This private area shows instructions a named clinician wrote for you
          and published. It never shows a draft, never writes an instruction of
          its own, and offers no way to change one. If something here is not
          clear, it is not a substitute for asking the person who wrote it.
        </p>

        <section
          className="mt-10 max-w-[920px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-instructions-status"
          data-care-read-only="true"
        >
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="care-instructions-status" className="h2">
            {headline ??
              (!data?.storage.available
                ? "Your instructions cannot be read yet."
                : data.rows.length === 0
                  ? "No instruction has been published for you."
                  : "Instructions published for you")}
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
                Nothing has been published for you. An instruction appears here
                only after a clinician wrote it for you and published it, and
                this page never invents one.
              </p>
            </div>
          )}

          {data && data.rows.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 mt-6" role="list">
              {data.rows.map((row) => (
                <li className="card" key={row.id}>
                  <p className="mono-label text-ink-mute">
                    {row.category.toUpperCase()}
                  </p>
                  <h3 className="h3 mt-3 break-words">{row.title}</h3>
                  <dl className="mt-4">
                    <div className="flex flex-col gap-1 py-3 rule-top">
                      <dt className="mono-label text-ink-mute">PUBLISHED</dt>
                      <dd className="body-m break-words">{row.publishedAt}</dd>
                    </div>
                    <div className="flex flex-col gap-1 py-3 rule-top">
                      <dt className="mono-label text-ink-mute">VERSION</dt>
                      <dd className="body-m break-words">{row.version}</dd>
                    </div>
                    <div className="flex flex-col gap-1 py-3 rule-top">
                      <dt className="mono-label text-ink-mute">
                        YOU CONFIRMED READING
                      </dt>
                      <dd className="body-m break-words">
                        {row.acknowledgedAt ?? "Not recorded"}
                      </dd>
                    </div>
                  </dl>
                  <p className="body-s text-ink-2 mt-4 max-w-[64ch]">
                    {row.bodyAvailable
                      ? "The full text is held with your clinical record. It is not displayed on this page."
                      : "No text is recorded for this instruction yet, so there is nothing to read here."}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {data && data.awaitingPublication > 0 && (
            <div className="card mt-6">
              <p className="mono-label text-ink-mute mb-2">NOT PUBLISHED</p>
              <p className="body-m text-ink-2 max-w-[64ch]">
                {`${data.awaitingPublication} instruction${data.awaitingPublication === 1 ? " is" : "s are"} written but not published, so ${data.awaitingPublication === 1 ? "it is" : "they are"} not shown. An unpublished instruction is work in progress that nobody has stood behind yet, and reading one as guidance would be reading something no clinician released.`}
              </p>
            </div>
          )}

          {data && data.unreadable > 0 && (
            <div className="card mt-6" role="alert">
              <p className="mono-label text-pulse mb-2">NOT DISPLAYED</p>
              <p className="body-m text-ink-2 max-w-[64ch]">
                {`${data.unreadable} record${data.unreadable === 1 ? "" : "s"} came back in a shape this page could not read completely, so ${data.unreadable === 1 ? "it is" : "they are"} not shown rather than shown partly. This is reported instead of hidden.`}
              </p>
            </div>
          )}
        </section>

        <section
          className="mt-16 pt-12 rule-top max-w-[760px]"
          aria-labelledby="care-instructions-boundary"
        >
          <p className="mono-cap text-ink-mute mb-5">CLINICAL BOUNDARY</p>
          <h2 id="care-instructions-boundary" className="display-s">
            This page gives no medical advice.
          </h2>
          <p className="body-m text-ink-2 mt-6 max-w-[64ch]">
            Nothing here is generated, summarized, or interpreted for you. If
            you may be experiencing a medical emergency, contact local emergency
            services now. Do not wait for a message or a response from Xenios.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
