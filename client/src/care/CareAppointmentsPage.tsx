import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { careApiFetch } from "./api";
import CareAppointmentReadinessPanel from "./CareAppointmentReadinessPanel";

type ViewState =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "auth_required" }
  | {
      kind: "ready";
      hasAppointments: boolean;
      requestAvailable: boolean;
    }
  | { kind: "error" };

export default function CareAppointmentsPage() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await careApiFetch("/api/care/appointments");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setState({ kind: "auth_required" });
        return;
      }
      if (response.status === 503 && body?.code === "care_disabled") {
        setState({ kind: "disabled" });
        return;
      }
      if (!response.ok || body?.ok !== true || !Array.isArray(body.appointments)) {
        throw new Error("care_appointments_unavailable");
      }
      setState({
        kind: "ready",
        hasAppointments: body.appointments.length > 0,
        requestAvailable: body.requestAvailable === true,
      });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell>
      <SeoHead
        title="Care appointments, xenios"
        description="Private appointment status for the separate Xenios Care pathway."
        path="/care/appointments"
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · APPOINTMENTS</p>
        <h1 className="display-m max-w-[19ch]">
          Scheduling stays connected to verified Care coverage.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          Appointments are separate from Research membership. A request is not
          treatment approval, a prescription, or a promise of availability.
        </p>

        <section
          className="mt-10 max-w-[920px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-appointments-title"
        >
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="care-appointments-title" className="h2">
            {state.kind === "loading" && "Checking appointment status…"}
            {state.kind === "disabled" &&
              "Clinician-guided scheduling is being prepared."}
            {state.kind === "auth_required" && "Sign in is required."}
            {state.kind === "error" &&
              "Appointment status is temporarily unavailable."}
            {state.kind === "ready" &&
              !state.hasAppointments &&
              "No Care appointments are recorded."}
            {state.kind === "ready" &&
              state.hasAppointments &&
              "Restricted appointment records exist."}
          </h2>

          {state.kind === "loading" && (
            <div className="card mt-6">
              <p className="body-m text-ink-mute">
                No scheduling action is enabled while this check is in progress.
              </p>
            </div>
          )}
          {state.kind === "disabled" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Scheduling remains unavailable until real medical-group,
                clinician, state-coverage, telehealth, and support requirements
                are verified.
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}
          {state.kind === "auth_required" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Appointment information is private and requires an authorized
                Care account.
              </p>
              <Link href="/research/sign-in" className="btn btn-primary mt-6">
                Sign in securely
              </Link>
            </div>
          )}
          {state.kind === "error" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Nothing was changed. Confirm the status again before taking any
                scheduling action.
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
          {state.kind === "ready" && !state.hasAppointments && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                {state.requestAvailable
                  ? "Care intake is a separate step from scheduling, and a clinician reads it first. Review your Care eligibility and complete your intake before any scheduling request."
                  : "Scheduling is not available until the required Care coverage and provider records are verified."}
              </p>
              <div className="flex flex-wrap gap-4 mt-6">
                <Link href="/care/eligibility" className="btn btn-primary">
                  Review Care eligibility
                </Link>
                {state.requestAvailable && (
                  <Link href="/care/intake" className="btn btn-secondary">
                    Go to Care intake
                  </Link>
                )}
              </div>
            </div>
          )}
          {state.kind === "ready" && state.hasAppointments && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                An authorized read returned restricted appointment records.
                This frontend displays no appointment details and exposes no
                scheduling or clinical actions.
              </p>
            </div>
          )}
        </section>

        {(state.kind === "disabled" ||
          state.kind === "error" ||
          state.kind === "ready") && <CareAppointmentReadinessPanel />}

        <aside className="mt-12 max-w-[760px] pt-10 rule-top">
          <p className="body-m text-ink-2">
            Care scheduling does not reuse Research assessment responses and
            does not permit an automated system to make a final clinical
            decision.
          </p>
        </aside>
      </div>
    </PageShell>
  );
}
