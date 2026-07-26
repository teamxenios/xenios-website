import { useCallback, useEffect, useState } from "react";
import type { CareAppointmentRequiredInputLabel } from "@shared/care/appointments";
import { careApiFetch } from "./api";

type ReadinessState =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | {
      kind: "ready";
      softwareReady: boolean;
      operationalReady: boolean;
      publicReady: boolean;
      requiredInputs: readonly CareAppointmentRequiredInputLabel[];
    }
  | { kind: "error" };

const nextAction: Record<CareAppointmentRequiredInputLabel, string> = {
  "MEDICAL GROUP REQUIRED":
    "Enter and verify the medical-group relationship and governance evidence.",
  "LICENSED CLINICIAN RECORD REQUIRED":
    "Create the clinician record before assignment can begin.",
  "CLINICIAN LICENSE REQUIRED":
    "Enter an unexpired license for the patient’s current state.",
  "CLINICIAN CREDENTIAL VERIFICATION REQUIRED":
    "Complete credential review before the clinician can be activated.",
  "CLINICIAN COVERAGE REQUIRED":
    "Verify active clinician coverage for the patient’s current state.",
  "SUPPORTED STATE REQUIRED":
    "Record and approve the state-coverage decision.",
  "TELEHEALTH PROVIDER REQUIRED":
    "Configure and verify the telehealth provider relationship.",
  "SCHEDULING PROVIDER REQUIRED":
    "Configure and verify the scheduling provider.",
  "APPOINTMENT REMINDER CONFIGURATION REQUIRED":
    "Approve reminder timing before appointments can be scheduled.",
  "CARE ACTIVATION APPROVAL REQUIRED":
    "Complete the server-authoritative Care release review.",
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
      if (response.status === 401 || response.status === 403) {
        setState({ kind: "forbidden" });
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
    >
      <p className="mono-label text-pulse mb-3">APPOINTMENT READINESS</p>
      <h2 id="care-appointment-readiness-title" className="h2">
        Software readiness and operational readiness remain separate.
      </h2>
      {state.kind === "loading" && (
        <div className="card mt-6">
          <p className="body-m text-ink-mute">
            Verifying the required operational records…
          </p>
        </div>
      )}
      {state.kind === "forbidden" && (
        <div className="card mt-6">
          <p className="body-m text-ink-2">
            Care readiness details require the clinical administrator role.
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
                <dt className="mono-label text-ink-mute">PUBLIC RELEASE</dt>
                <dd className="body-m mt-2">
                  {state.publicReady ? "Approved" : "Blocked"}
                </dd>
              </div>
            </dl>
          </div>
          {state.requiredInputs.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3">
              {state.requiredInputs.map((label) => (
                <article className="card" key={label}>
                  <h3 className="mono-label text-ink">{label}</h3>
                  <p className="body-m text-ink-2 mt-3">{nextAction[label]}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="card mt-4">
              <p className="body-m text-ink-2">
                All appointment-domain inputs are verified. Public release still
                remains subject to the canonical server launch gate.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
