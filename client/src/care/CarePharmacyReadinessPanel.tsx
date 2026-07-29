import { useCallback, useEffect, useState } from "react";
import type { CarePrescriptionRequiredInputLabel } from "@shared/care/prescriptions";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "auth_required" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | {
      kind: "ready";
      softwareReady: boolean;
      operationalReady: boolean;
      publicReady: boolean;
      requiredInputs: CarePrescriptionRequiredInputLabel[];
    };

const requirementCopy: Record<CarePrescriptionRequiredInputLabel, string> = {
  "MEDICAL GROUP REQUIRED":
    "A verified medical-group relationship is required.",
  "CLINICIAN COVERAGE REQUIRED":
    "Current clinician coverage for the patient’s state is required.",
  "PATIENT-SPECIFIC PRESCRIPTION CONTENT REQUIRED":
    "Patient-specific content verified by an assigned human clinician is required.",
  "PHARMACY PARTNER REQUIRED":
    "A verified real-pharmacy relationship is required.",
  "PHARMACY LEGAL IDENTITY REQUIRED":
    "A verified pharmacy legal identity is required.",
  "PHARMACY LICENSE VERIFICATION REQUIRED":
    "A current pharmacy license for the applicable state is required.",
  "PHARMACY SUPPORTED STATES REQUIRED":
    "Verified dispensing and shipping coverage for the applicable state is required.",
  "EXECUTED PHARMACY AGREEMENT REQUIRED":
    "A verified executed pharmacy agreement is required.",
  "PHARMACY INTEGRATION REQUIRED":
    "A verified pharmacy integration is required.",
  "PHARMACY SUPPORT CONTACT REQUIRED":
    "A verified pharmacy support contact is required.",
  "CARE ACTIVATION APPROVAL REQUIRED":
    "Separate server-authoritative release approval is required.",
};

export default function CarePharmacyReadinessPanel({
  stateCode,
  clinicianUserId,
  pharmacyId,
  prescriptionId,
}: {
  stateCode?: string;
  clinicianUserId?: string;
  pharmacyId?: string;
  prescriptionId?: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const query = new URLSearchParams();
      if (stateCode) query.set("stateCode", stateCode);
      if (clinicianUserId) query.set("clinicianUserId", clinicianUserId);
      if (pharmacyId) query.set("pharmacyId", pharmacyId);
      if (prescriptionId) query.set("prescriptionId", prescriptionId);
      const suffix = query.size ? `?${query.toString()}` : "";
      const response = await careApiFetch(`/api/care/pharmacy/admin/readiness${suffix}`);
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) return setState({ kind: "auth_required" });
      if (response.status === 403) return setState({ kind: "forbidden" });
      if (response.status === 503 && body?.code === "care_disabled") {
        return setState({ kind: "disabled" });
      }
      if (!response.ok || body?.ok !== true || !body.readiness) throw new Error("unavailable");
      setState({ kind: "ready", ...body.readiness });
    } catch {
      setState({ kind: "error" });
    }
  }, [clinicianUserId, pharmacyId, prescriptionId, stateCode]);
  useEffect(() => void load(), [load]);

  return (
    <section
      className="mt-8"
      aria-live="polite"
      aria-busy={state.kind === "loading"}
      aria-labelledby="care-pharmacy-readiness"
      data-care-readonly-readiness="true"
    >
      <p className="mono-label text-pulse mb-3">
        READ-ONLY PRESCRIPTION &amp; PHARMACY READINESS
      </p>
      <h2 id="care-pharmacy-readiness" className="h2">
        Operational evidence and public availability remain separate.
      </h2>
      {state.kind === "loading" && <div className="card mt-6"><p className="body-m text-ink-mute">Verifying required pharmacy records…</p></div>}
      {state.kind === "disabled" && <div className="card mt-6"><p className="body-m text-ink-2">Care is not available. No prescription, dispensing, shipping, provider, or activation control is exposed by this frontend.</p></div>}
      {state.kind === "auth_required" && <div className="card mt-6"><p className="body-m text-ink-2">Readiness evidence requires an authorized Care administrator.</p></div>}
      {state.kind === "forbidden" && <div className="card mt-6"><p className="body-m text-ink-2">This account cannot review pharmacy-readiness evidence. No operational controls are available.</p></div>}
      {state.kind === "error" && <div className="card mt-6"><p className="body-m text-ink-2">Readiness could not be confirmed. Care remains blocked.</p><button type="button" className="btn btn-secondary mt-6" onClick={() => void load()}>Try again</button></div>}
      {state.kind === "ready" && (
        <>
          <div className="card mt-6"><dl className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div><dt className="mono-label text-ink-mute">SOFTWARE</dt><dd className="body-m mt-2">{state.softwareReady ? "Complete" : "Needs review"}</dd></div>
            <div><dt className="mono-label text-ink-mute">REAL INPUTS</dt><dd className="body-m mt-2">{state.operationalReady ? "Verified" : "Required"}</dd></div>
            <div><dt className="mono-label text-ink-mute">FRONTEND ACCESS</dt><dd className="body-m mt-2">Unavailable</dd></div>
          </dl>
          <p className="body-m text-ink-2 mt-6">
            {state.publicReady
              ? "A readiness record exists, but this frontend cannot activate or expose Care."
              : "Public Care access has not been approved and remains unavailable here."}
          </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3">
            {state.requiredInputs.length > 0 ? state.requiredInputs.map((label) => <article className="card min-w-0" key={label}><h3 className="mono-label text-ink break-words">{label}</h3><p className="body-m text-ink-2 mt-3">{requirementCopy[label]}</p></article>) : (
              <div className="card">
                <p className="body-m text-ink-2">
                  No additional required-input labels were returned. This does
                  not activate Care; public access remains unavailable here.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
