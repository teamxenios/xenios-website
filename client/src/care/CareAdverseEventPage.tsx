import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import {
  CARE_ADVERSE_EVENT_SEVERITIES,
  CARE_ADVERSE_EVENT_SEVERITY_LABELS,
  CARE_ADVERSE_EVENT_STATUS_LABELS,
  type CareAdverseEventItem,
  type CareStorageState,
} from "@shared/care/safety";
import {
  isCareStorageState,
  loadCareRead,
  storageMissingExplanation,
  type CareReadState,
} from "./request-state";

/**
 * Reporting a side effect or a problem, and seeing your own reports.
 *
 * This release ships no write path from this screen. There is no form element
 * and no submit handler in this file, so the report control cannot fire however
 * the page is driven, and the reason is stated in plain words rather than left
 * for someone to discover. The server refuses the same request independently
 * and names what is missing, so a report is never silently accepted.
 *
 * `submissionAvailable` from the server chooses the wording only. It never
 * enables a control.
 */

export const CARE_ADVERSE_EVENT_PATH = "/care/adverse-events";

interface AdverseEventsView {
  storage: CareStorageState;
  reports: readonly CareAdverseEventItem[];
  submissionAvailable: boolean;
}

function isReportItem(value: unknown): value is CareAdverseEventItem {
  const item = value as Partial<CareAdverseEventItem> | null;
  return (
    typeof item === "object" &&
    item !== null &&
    typeof item.adverseEventId === "string" &&
    typeof item.status === "string" &&
    typeof item.patientReportedSeverity === "string" &&
    typeof item.reportedAt === "string"
  );
}

function parse(body: Record<string, unknown>): AdverseEventsView | null {
  if (!isCareStorageState(body.storage) || !Array.isArray(body.reports)) {
    return null;
  }
  return {
    storage: body.storage,
    reports: body.reports.filter(isReportItem),
    // Anything other than an explicit yes leaves the control unusable.
    submissionAvailable: body.submissionAvailable === true,
  };
}

/**
 * Shown whatever the server reports, because this release contains no path from
 * this screen to a record. If the server ever says reporting is open, the
 * control still explains that it does nothing here.
 */
const NO_WRITE_PATH_REASON =
  "This release has no path from this screen to a record, so the control does nothing. Contact the team directly to report a problem, and contact local emergency services if this may be an emergency.";

export default function CareAdverseEventPage() {
  const [state, setState] = useState<CareReadState<AdverseEventsView>>({
    kind: "loading",
  });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setState(await loadCareRead("/api/care/adverse-events", parse));
  }, []);

  useEffect(() => void load(), [load]);

  return (
    <PageShell>
      <SeoHead
        title="Care adverse event reporting, xenios"
        description="Reporting a side effect or a problem in the separate Xenios Care pathway."
        path={CARE_ADVERSE_EVENT_PATH}
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · REPORT A PROBLEM</p>
        <h1 className="display-m max-w-[22ch]">
          Tell us about a side effect or a problem.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          A report reaches a person. It is never answered automatically, and
          nothing here gives medical advice.
        </p>

        <section
          className="mt-10 card"
          style={{ borderLeftColor: "var(--pulse)", borderLeftWidth: 3 }}
          aria-labelledby="care-adverse-emergency"
        >
          <h2 id="care-adverse-emergency" className="h3">
            This form is not emergency care.
          </h2>
          <p className="body-m text-ink-2 mt-4 max-w-[60ch]">
            If you may be experiencing a medical emergency, contact local
            emergency services now. Do not wait for a reply to a report.
          </p>
        </section>

        <section
          className="mt-12"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-adverse-report-title"
        >
          <p className="mono-label text-pulse mb-3">NEW REPORT</p>
          <h2 id="care-adverse-report-title" className="h2">
            Reporting is not open yet
          </h2>

          {state.kind === "loading" && (
            <div className="card mt-6">
              <p className="body-m text-ink-mute">
                Checking whether a report can be recorded…
              </p>
            </div>
          )}

          {state.kind === "auth_required" && (
            <div className="card mt-6">
              <p className="mono-label text-pulse mb-2">AUTHORIZATION REQUIRED</p>
              <p className="body-m text-ink-2">
                Reporting requires an authorized Care account so your report can
                be attached to your record and routed to a person.
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
                Your account cannot report here. Contact the team directly.
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

          {state.kind === "error" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Reporting is temporarily unavailable and nothing was recorded.
                Contact the team directly if this cannot wait.
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

          {state.kind === "ready" && (
            <div className="card mt-6">
              <p className="mono-label text-ink-mute mb-2">UNAVAILABLE</p>
              <p className="body-m text-ink-2" id="care-adverse-unavailable">
                {NO_WRITE_PATH_REASON}
              </p>
              {!state.data.storage.available && (
                <p className="body-s text-ink-mute mt-3">
                  {storageMissingExplanation(state.data.storage, "A report")}
                </p>
              )}

              <fieldset
                className="mt-6 border-0 p-0"
                disabled
                aria-describedby="care-adverse-unavailable"
              >
                <legend className="mono-label text-ink-mute mb-4">
                  WHAT A REPORT WILL ASK
                </legend>

                <label className="block" htmlFor="care-adverse-narrative">
                  <span className="body-s text-ink-2">
                    Describe the side effect or problem
                  </span>
                  <textarea
                    id="care-adverse-narrative"
                    name="narrative"
                    rows={5}
                    className="w-full mt-2"
                    disabled
                    aria-disabled="true"
                  />
                </label>

                <label className="block mt-6" htmlFor="care-adverse-severity">
                  <span className="body-s text-ink-2">
                    How severe does it feel to you
                  </span>
                  <select
                    id="care-adverse-severity"
                    name="patientReportedSeverity"
                    className="w-full mt-2"
                    disabled
                    aria-disabled="true"
                    defaultValue="unsure"
                  >
                    {CARE_ADVERSE_EVENT_SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {CARE_ADVERSE_EVENT_SEVERITY_LABELS[severity]}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  className="btn btn-primary mt-8"
                  disabled
                  aria-disabled="true"
                  data-care-action-enabled="false"
                >
                  Send this report
                </button>
              </fieldset>
            </div>
          )}
        </section>

        <section
          className="mt-12"
          aria-labelledby="care-adverse-history-title"
          aria-live="polite"
        >
          <p className="mono-label text-pulse mb-3">YOUR REPORTS</p>
          <h2 id="care-adverse-history-title" className="h2">
            {state.kind === "ready" && state.data.reports.length > 0
              ? "Reports you have sent"
              : "No report has been recorded"}
          </h2>

          {state.kind === "ready" && state.data.reports.length === 0 && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Nothing has been recorded for you. If you told someone about a
                problem another way, that conversation is not shown here.
              </p>
            </div>
          )}

          {state.kind === "ready" && state.data.reports.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 mt-6" role="list">
              {state.data.reports.map((report) => (
                <li className="card" key={report.adverseEventId}>
                  <p className="body-l">
                    {CARE_ADVERSE_EVENT_STATUS_LABELS[report.status]}
                  </p>
                  <p className="body-s text-ink-2 mt-2">
                    {`Reported ${report.reportedAt}. You described it as ${CARE_ADVERSE_EVENT_SEVERITY_LABELS[
                      report.patientReportedSeverity
                    ].toLowerCase()}.`}
                  </p>
                  <p className="body-s text-ink-mute mt-3">
                    {report.acknowledged
                      ? "A person has acknowledged this report."
                      : "No one has acknowledged this report yet."}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
