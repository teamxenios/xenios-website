import { useCallback, useEffect, useState } from "react";
import type { CareAppointmentRequiredInputLabel } from "@shared/care/appointments";
import { careApiFetch } from "./api";

type ReadinessState =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "auth_required" }
  | { kind: "forbidden" }
  | {
      kind: "ready";
      softwareReady: boolean;
      operationalReady: boolean;
      publicReady: boolean;
      requiredInputs: readonly CareAppointmentRequiredInputLabel[];
    }
  | { kind: "error" };

const requirementCopy: Record<CareAppointmentRequiredInputLabel, string> = {
  "MEDICAL GROUP REQUIRED":
    "A verified medical-group relationship and governance record is required.",
  "LICENSED CLINICIAN RECORD REQUIRED":
    "An independently verified licensed-clinician record is required.",
  "CLINICIAN LICENSE REQUIRED":
    "A current license for the patient’s physical state is required.",
  "CLINICIAN CREDENTIAL VERIFICATION REQUIRED":
    "Completed clinician credential review is required.",
  "CLINICIAN COVERAGE REQUIRED":
    "Verified clinician coverage for the patient’s current state is required.",
  "SUPPORTED STATE REQUIRED":
    "An approved supported-state decision is required.",
  "TELEHEALTH PROVIDER REQUIRED":
    "A verified telehealth-provider relationship is required.",
  "SCHEDULING PROVIDER REQUIRED":
    "A verified scheduling-provider relationship is required.",
  "APPOINTMENT REMINDER CONFIGURATION REQUIRED":
    "Approved appointment-reminder timing is required.",
  "CARE ACTIVATION APPROVAL REQUIRED":
    "Separate server-authoritative release approval is required.",
};

export default function CareAppointmentReadinessPanel({
  stateCode,
}: {
  stateCode?: string;
}) {
  const [state, setState] = useState<ReadinessState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const query = stateCode ? `?stateCode=${encodeURIComponent(stateCode)}` : "";
      const response = await careApiFetch(
        `/api/care/appointments/admin/readiness${query}`,
      );
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setState({ kind: "auth_required" });
        return;
      }
      if (response.status === 403) {
        setState({ kind: "forbidden" });
        return;
      }
      if (response.status === 503 && body?.code === "care_disabled") {
        setState({ kind: "disabled" });
        return;
      }
      if (!response.ok || body?.ok !== true || !body.readiness) {
        throw new Error("care_readiness_unavailable");
      }
      setState({ kind: "ready", ...body.readiness });
    } catch {
      setState({ kind: "error" });
    }
  }, [stateCode]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className="mt-8"
      aria-labelledby="care-appointment-readiness-title"
      aria-live="polite"
      aria-busy={state.kind === "loading"}
      data-care-readonly-readiness="true"
    >
      <p className="mono-label text-pulse mb-3">
        READ-ONLY APPOINTMENT READINESS
      </p>
      <h2 id="care-appointment-readiness-title" className="h2">
        Operational evidence and public availability remain separate.
      </h2>
      {state.kind === "loading" && (
        <div className="card mt-6">
          <p className="body-m text-ink-mute">
            Verifying the required operational records…
          </p>
        </div>
      )}
      {state.kind === "disabled" && (
        <div className="card mt-6">
          <p className="body-m text-ink-2">
            Care is not available. No scheduling, provider, or activation
            control is exposed by this frontend.
          </p>
        </div>
      )}
      {state.kind === "auth_required" && (
        <div className="card mt-6">
          <p className="body-m text-ink-2">
            Readiness evidence requires an authorized Care administrator.
          </p>
        </div>
      )}
      {state.kind === "forbidden" && (
        <div className="card mt-6">
          <p className="body-m text-ink-2">
            This account cannot review Care readiness evidence. No operational
            controls are available.
          </p>
        </div>
      )}
      {state.kind === "error" && (
        <div className="card mt-6">
          <p className="body-m text-ink-2">
            Readiness could not be confirmed. No launch state was changed.
          </p>
          <button className="btn btn-secondary mt-6" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <>
          <div className="card mt-6">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <dt className="mono-label text-ink-mute">SOFTWARE</dt>
                <dd className="body-m mt-2">
                  {state.softwareReady ? "Complete" : "Needs review"}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-ink-mute">REAL INPUTS</dt>
                <dd className="body-m mt-2">
                  {state.operationalReady ? "Verified" : "Required"}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-ink-mute">FRONTEND ACCESS</dt>
                <dd className="body-m mt-2">
                  Unavailable
                </dd>
              </div>
            </dl>
            <p className="body-m text-ink-2 mt-6">
              {state.publicReady
                ? "A readiness record exists, but this frontend cannot activate or expose Care."
                : "Public Care access has not been approved and remains unavailable here."}
            </p>
          </div>
          {state.requiredInputs.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3">
              {state.requiredInputs.map((label) => (
                <article className="card" key={label}>
                  <h3 className="mono-label text-ink">{label}</h3>
                  <p className="body-m text-ink-2 mt-3">
                    {requirementCopy[label]}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="card mt-4">
              <p className="body-m text-ink-2">
                No additional required-input labels were returned. This does not
                activate Care; public access remains unavailable here.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
