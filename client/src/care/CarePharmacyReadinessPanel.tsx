import { useCallback, useEffect, useState } from "react";
import type { CarePrescriptionRequiredInputLabel } from "@shared/care/prescriptions";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | {
      kind: "ready";
      softwareReady: boolean;
      operationalReady: boolean;
      publicReady: boolean;
      requiredInputs: CarePrescriptionRequiredInputLabel[];
    };

const actionCopy: Record<CarePrescriptionRequiredInputLabel, string> = {
  "MEDICAL GROUP REQUIRED": "Enter and verify the medical-group relationship.",
  "CLINICIAN COVERAGE REQUIRED": "Verify current clinician coverage for the patient’s state.",
  "PATIENT-SPECIFIC PRESCRIPTION CONTENT REQUIRED": "An assigned human clinician must enter and verify the exact prescription content.",
  "PHARMACY PARTNER REQUIRED": "Create and verify the real pharmacy relationship.",
  "PHARMACY LEGAL IDENTITY REQUIRED": "Enter and verify the pharmacy’s legal identity.",
  "PHARMACY LICENSE VERIFICATION REQUIRED": "Verify a current pharmacy license for the applicable state.",
  "PHARMACY SUPPORTED STATES REQUIRED": "Verify dispensing and shipping coverage for the applicable state.",
  "EXECUTED PHARMACY AGREEMENT REQUIRED": "Record the verified executed pharmacy agreement.",
  "PHARMACY INTEGRATION REQUIRED": "Configure and verify the pharmacy integration.",
  "PHARMACY SUPPORT CONTACT REQUIRED": "Enter and verify the pharmacy support contact.",
  "CARE ACTIVATION APPROVAL REQUIRED": "Complete the server-authoritative Care release review.",
};

export default function CarePharmacyReadinessPanel({ stateCode }: { stateCode?: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const query = stateCode ? `?stateCode=${encodeURIComponent(stateCode)}` : "";
      const response = await careApiFetch(`/api/care/pharmacy/admin/readiness${query}`);
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) return setState({ kind: "forbidden" });
      if (!response.ok || body?.ok !== true || !body.readiness) throw new Error("unavailable");
      setState({ kind: "ready", ...body.readiness });
    } catch {
      setState({ kind: "error" });
    }
  }, [stateCode]);
  useEffect(() => void load(), [load]);

  return (
    <section className="mt-8" aria-live="polite" aria-busy={state.kind === "loading"} aria-labelledby="care-pharmacy-readiness">
      <p className="mono-label text-pulse mb-3">PRESCRIPTION &amp; PHARMACY READINESS</p>
      <h2 id="care-pharmacy-readiness" className="h2">Software completion and verified real inputs remain separate.</h2>
      {state.kind === "loading" && <div className="card mt-6"><p className="body-m text-ink-mute">Verifying required pharmacy records…</p></div>}
      {state.kind === "forbidden" && <div className="card mt-6"><p className="body-m text-ink-2">These details require the clinical administrator role.</p></div>}
      {state.kind === "error" && <div className="card mt-6"><p className="body-m text-ink-2">Readiness could not be confirmed. Care remains blocked.</p><button type="button" className="btn btn-secondary mt-6" onClick={() => void load()}>Try again</button></div>}
      {state.kind === "ready" && (
        <>
          <div className="card mt-6"><dl className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div><dt className="mono-label text-ink-mute">SOFTWARE</dt><dd className="body-m mt-2">{state.softwareReady ? "Complete" : "Needs review"}</dd></div>
            <div><dt className="mono-label text-ink-mute">REAL INPUTS</dt><dd className="body-m mt-2">{state.operationalReady ? "Verified" : "Required"}</dd></div>
            <div><dt className="mono-label text-ink-mute">PUBLIC RELEASE</dt><dd className="body-m mt-2">{state.publicReady ? "Approved" : "Blocked"}</dd></div>
          </dl></div>
          <div className="mt-4 grid grid-cols-1 gap-3">
            {state.requiredInputs.map((label) => <article className="card" key={label}><h3 className="mono-label text-ink">{label}</h3><p className="body-m text-ink-2 mt-3">{actionCopy[label]}</p></article>)}
          </div>
        </>
      )}
    </section>
  );
}
