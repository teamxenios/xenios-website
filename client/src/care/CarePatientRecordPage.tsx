import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type { CareCapabilityStatus } from "@shared/care/contracts";
import {
  CARE_PATIENT_RECORD_PATH,
  carePatientActionStates,
  carePatientAvailableSurfaces,
  carePatientPendingSurfaces,
  type CarePatientActionState,
} from "@shared/care/patient-surfaces";
import { careApiFetch } from "./api";

/**
 * The patient's map of Care.
 *
 * A patient could previously reach four separate Care screens with no way to
 * know that those four were the whole of it, and every other Care path fell
 * through to a generic shell. This page is the honest index: it separates the
 * surfaces that read a real server contract from the ones that have no contract
 * at all, and it names the missing endpoint for each of the second kind.
 *
 * Read only by construction. The only request it makes is the public Care
 * status read. Every patient action is rendered so the intended workflow stays
 * visible and reviewable, and every one of them is disabled with a plain
 * reason. There is no write path from this file to any Care record.
 */

type State =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "error" }
  | { kind: "ready"; status: CareCapabilityStatus };

/**
 * Whatever the server reports, no control on this page is usable, because this
 * release ships no patient write path. If Care ever reports itself active, the
 * control still explains why it does nothing here.
 */
const NO_WRITE_PATH_EXPLANATION =
  "This release has no path from this screen to a Care record, so the control does nothing.";

function actionExplanation(action: CarePatientActionState): string {
  return action.enabled || action.explanation.length === 0
    ? NO_WRITE_PATH_EXPLANATION
    : action.explanation;
}

export default function CarePatientRecordPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await careApiFetch("/api/care/status");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        return setState({ kind: "unauthorized" });
      }
      if (!response.ok || body?.capability?.rail !== "care") {
        throw new Error("care_status_unavailable");
      }
      setState({ kind: "ready", status: body.capability });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const careEnabled = state.kind === "ready" && state.status.enabled;
  const actions = carePatientActionStates(careEnabled);
  const available = carePatientAvailableSurfaces();
  const pending = carePatientPendingSurfaces();

  return (
    <PageShell>
      <SeoHead
        title="Your Care record, xenios"
        description="What Xenios Care can and cannot show you today. No clinical service has been enabled."
        path={CARE_PATIENT_RECORD_PATH}
        robots="noindex, nofollow"
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · YOUR RECORD</p>
        <h1 className="display-m text-balance max-w-[20ch]">
          What Care can show you, and what it cannot.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          Most of a care record does not exist here yet. This page separates the
          few screens that read a real record from the ones that have nothing
          behind them, so nothing on this site implies care you are not
          receiving.
        </p>

        <section
          className="mt-10 max-w-[920px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-record-status"
          data-care-read-only="true"
        >
          <p className="mono-label text-pulse mb-3">CARE STATUS</p>
          <h2 id="care-record-status" className="h2">
            {state.kind === "loading" && "Checking Care status…"}
            {state.kind === "unauthorized" && "Sign in is required."}
            {state.kind === "error" && "Care status is temporarily unavailable."}
            {state.kind === "ready" && state.status.publicMessage}
          </h2>
          {state.kind === "loading" && (
            <div className="card mt-6">
              <p className="body-m text-ink-mute">
                No Care action is enabled while this check is in progress.
              </p>
            </div>
          )}
          {state.kind === "unauthorized" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Your own Care records are private and require an authorized Care
                account. The list below describes what exists, not what you have.
              </p>
              <Link href="/research/sign-in" className="btn btn-primary mt-6">
                Sign in securely
              </Link>
            </div>
          )}
          {state.kind === "error" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Nothing was changed. Care remains unavailable, and no clinical
                service has been enabled.
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
              <p className="mono-label text-ink-mute">
                {state.status.state.replaceAll("_", " ")}
              </p>
              <p className="body-m text-ink-2 mt-3">
                Research membership does not unlock Care, and nothing recorded in
                Research is treated as a clinical record.
              </p>
            </div>
          )}
        </section>

        <section
          className="mt-14 max-w-[920px]"
          aria-labelledby="care-available-title"
        >
          <p className="mono-label text-pulse mb-3">READS A REAL RECORD</p>
          <h2 id="care-available-title" className="h2">
            These screens read something.
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 list-none p-0">
            {available.map((surface) => (
              <li className="card flex flex-col" key={surface.key}>
                <h3 className="h3">{surface.title}</h3>
                <p className="body-m text-ink-2 mt-3">{surface.summary}</p>
                <p className="body-s text-ink-mute mt-4 break-words">
                  <code>{surface.contract}</code>
                </p>
                <Link
                  href={surface.path}
                  className="btn btn-secondary mt-6 self-start"
                >
                  Open {surface.title.toLowerCase()}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="mt-14 max-w-[920px]"
          aria-labelledby="care-pending-title"
        >
          <p className="mono-label text-ink-mute mb-3">NOT BUILT</p>
          <h2 id="care-pending-title" className="h2">
            These have no record behind them.
          </h2>
          <p className="body-m text-ink-2 mt-6 max-w-[64ch]">
            Each one names the server contract that would have to exist first.
            None of them is scheduled here, and none of them should be read as a
            promise.
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 list-none p-0">
            {pending.map((surface) => (
              <li className="card flex flex-col" key={surface.key}>
                <h3 className="h3">{surface.title}</h3>
                <p className="body-m text-ink-2 mt-3">{surface.reason}</p>
                <p className="mono-label text-ink-mute mt-6">MISSING CONTRACT</p>
                <p className="body-s text-ink-2 mt-2 break-words">
                  <code>{surface.missingContract ?? surface.contract}</code>
                </p>
                <Link
                  href={surface.path}
                  className="btn btn-ghost mt-6 self-start"
                >
                  Why {surface.title.toLowerCase()} is unavailable
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="mt-14 max-w-[920px]"
          aria-labelledby="care-actions-title"
        >
          <p className="mono-label text-ink-mute mb-3">ACTIONS</p>
          <h2 id="care-actions-title" className="h2">
            Nothing here can be started yet.
          </h2>
          <p className="body-m text-ink-2 mt-6 max-w-[64ch]">
            These are shown so the intended workflow is visible and reviewable.
            Every one is turned off, and none of them sends anything to a person.
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 list-none p-0">
            {actions.map((action) => (
              <li className="card" key={action.action}>
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  disabled
                  aria-disabled="true"
                  aria-describedby={`care-patient-action-${action.action}`}
                  data-care-action-enabled="false"
                >
                  {action.label}
                </button>
                <p
                  id={`care-patient-action-${action.action}`}
                  className="body-s text-ink-2 mt-3 break-words"
                >
                  {actionExplanation(action)}
                </p>
                <p className="mono-label text-ink-mute mt-3">UNAVAILABLE</p>
              </li>
            ))}
          </ul>
        </section>

        <aside className="mt-14 max-w-[760px] pt-10 rule-top">
          <p className="mono-cap text-pulse mb-4">EMERGENCY BOUNDARY</p>
          <p className="body-m text-ink-2">
            This site is not emergency care. If you may be experiencing a medical
            emergency, contact local emergency services now. Do not wait for a
            message or response from Xenios.
          </p>
        </aside>
      </div>
    </PageShell>
  );
}
