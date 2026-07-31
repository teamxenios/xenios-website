import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type {
  CarePatientLabResultItem,
  CareStorageState,
} from "@shared/care/safety";
import {
  isCareStorageState,
  loadCareRead,
  storageMissingExplanation,
  type CareReadState,
} from "./request-state";

/**
 * The patient view of lab results.
 *
 * Read only. This file contains no form, no control that could release a
 * result, and no request other than the one read below. A result appears here
 * only after the server has confirmed a named person released it, so nothing on
 * this page decides what a patient may see.
 */

export const CARE_LAB_RESULTS_PATH = "/care/labs";

interface LabResultsView {
  storage: CareStorageState;
  results: readonly CarePatientLabResultItem[];
  awaitingRelease: number;
}

function isResultItem(value: unknown): value is CarePatientLabResultItem {
  const item = value as Partial<CarePatientLabResultItem> | null;
  return (
    typeof item === "object" &&
    item !== null &&
    typeof item.labResultId === "string" &&
    typeof item.panelName === "string" &&
    typeof item.releasedAt === "string"
  );
}

function parse(body: Record<string, unknown>): LabResultsView | null {
  if (!isCareStorageState(body.storage) || !Array.isArray(body.results)) {
    return null;
  }
  return {
    storage: body.storage,
    results: body.results.filter(isResultItem),
    awaitingRelease:
      typeof body.awaitingRelease === "number" && body.awaitingRelease > 0
        ? body.awaitingRelease
        : 0,
  };
}

export default function CareLabResultsPage() {
  const [state, setState] = useState<CareReadState<LabResultsView>>({
    kind: "loading",
  });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setState(await loadCareRead("/api/care/labs", parse));
  }, []);

  useEffect(() => void load(), [load]);

  return (
    <PageShell>
      <SeoHead
        title="Care lab results, xenios"
        description="The private view of released lab results in the separate Xenios Care pathway."
        path={CARE_LAB_RESULTS_PATH}
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · LAB RESULTS</p>
        <h1 className="display-m max-w-[20ch]">
          A result appears here after your clinician has released it.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          Results are reviewed by a clinician before they are shared, so this
          page can be empty while work is in progress. Nothing here interprets a
          result, and nothing here is medical advice.
        </p>

        <section
          className="mt-10"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-labs-status"
          data-care-labs-read-only="true"
        >
          <p className="mono-label text-pulse mb-3">YOUR RESULTS</p>
          <h2 id="care-labs-status" className="h2">
            {state.kind === "loading" && "Checking for released results…"}
            {state.kind === "disabled" && "Lab results are not available yet."}
            {state.kind === "auth_required" && "Sign in is required."}
            {state.kind === "forbidden" &&
              "This area is limited to your own Care record."}
            {state.kind === "error" &&
              "Lab results are temporarily unavailable."}
            {state.kind === "ready" &&
              (state.data.results.length === 0
                ? "No result has been released to you."
                : "Released results")}
          </h2>

          {state.kind === "loading" && (
            <div className="card mt-6">
              <p className="body-m text-ink-mute">
                Nothing is shown while this check is in progress.
              </p>
            </div>
          )}

          {state.kind === "disabled" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">{state.message}</p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}

          {state.kind === "auth_required" && (
            <div className="card mt-6">
              <p className="mono-label text-pulse mb-2">AUTHORIZATION REQUIRED</p>
              <p className="body-m text-ink-2">
                Results are private and require an authorized Care account.
              </p>
              <Link href="/research/sign-in" className="btn btn-primary mt-6">
                Sign in securely
              </Link>
            </div>
          )}

          {state.kind === "forbidden" && (
            <div className="card mt-6">
              <p className="mono-label text-pulse mb-2">NOT AUTHORIZED</p>
              <p className="body-m text-ink-2">
                Your account cannot read this record, so nothing is shown here.
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}

          {state.kind === "error" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Nothing was changed. Do not treat an empty page as a result.
                Check again before relying on it.
              </p>
              <button
                type="button"
                className="btn btn-secondary mt-6"
                onClick={() => void load()}
              >
                Try again
              </button>
            </div>
          )}

          {state.kind === "ready" && !state.data.storage.available && (
            <div className="card mt-6">
              <p className="mono-label text-ink-mute mb-2">NO RECORD YET</p>
              <p className="body-m text-ink-2">
                {storageMissingExplanation(state.data.storage, "A lab result")}
              </p>
            </div>
          )}

          {state.kind === "ready" &&
            state.data.storage.available &&
            state.data.results.length === 0 && (
              <div className="card mt-6">
                <p className="body-m text-ink-2">
                  Nothing has been released to you. A result stays with your
                  clinician until they release it, and this page never shows a
                  result before that.
                </p>
              </div>
            )}

          {state.kind === "ready" && state.data.results.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 mt-6" role="list">
              {state.data.results.map((item) => (
                <li className="card" key={item.labResultId}>
                  <p className="body-l break-words">{item.panelName}</p>
                  <p className="body-s text-ink-2 mt-2">
                    {`Released ${item.releasedAt}`}
                  </p>
                  <p className="body-s text-ink-mute mt-3">
                    Discuss this result with your clinician. It is not
                    interpreted here.
                  </p>
                </li>
              ))}
            </ul>
          )}

          {state.kind === "ready" && state.data.awaitingRelease > 0 && (
            <div className="card mt-6">
              <p className="mono-label text-ink-mute mb-2">WITH YOUR CLINICIAN</p>
              <p className="body-m text-ink-2">
                {`${state.data.awaitingRelease} ${
                  state.data.awaitingRelease === 1 ? "result is" : "results are"
                } being reviewed and ${
                  state.data.awaitingRelease === 1 ? "has" : "have"
                } not been released to you.`}
              </p>
            </div>
          )}
        </section>

        <section className="mt-12 rule-top pt-10" aria-labelledby="care-labs-emergency">
          <h2 id="care-labs-emergency" className="h3">
            This page is not emergency care.
          </h2>
          <p className="body-m text-ink-2 mt-4 max-w-[60ch]">
            If you may be experiencing a medical emergency, contact local
            emergency services now. Do not wait for a result or a reply.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
