import { useCallback, useEffect, useState } from "react";
import {
  CARE_INSTRUCTION_REQUIRED_INPUT_LABELS,
  type CareInstructionRequiredInputLabel,
} from "@shared/care/instructions";
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
      requiredInputs: CareInstructionRequiredInputLabel[];
    };

const actionCopy: Record<CareInstructionRequiredInputLabel, string> = {
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.pharmacyLabel]:
    "Enter and verify the exact pharmacy label source.",
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.pharmacyInformation]:
    "Enter and verify the pharmacy-provided information source.",
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.clinicianDirection]:
    "The assigned clinician must enter and verify patient-specific direction.",
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.manufacturerMaterial]:
    "Enter and verify the applicable manufacturer material.",
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.patientInstructions]:
    "The assigned clinician must complete patient-specific instruction content.",
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.instructionReview]:
    "Complete the human-clinician instruction release review.",
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.device]:
    "Enter and verify the exact product-specific device record.",
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.supplier]:
    "Create and verify the real supply-source relationship.",
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.replacementCadence]:
    "Enter and verify the product-specific replacement cadence.",
  [CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.careActivation]:
    "Complete the server-authoritative Care release review.",
};

export default function CareInstructionReadinessPanel({
  prescriptionId,
}: {
  prescriptionId?: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const query = prescriptionId
        ? `?prescriptionId=${encodeURIComponent(prescriptionId)}`
        : "";
      const response = await careApiFetch(
        `/api/care/instructions/admin/readiness${query}`,
      );
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        return setState({ kind: "forbidden" });
      }
      if (!response.ok || body?.ok !== true || !body.readiness) {
        throw new Error("care_instruction_readiness_unavailable");
      }
      setState({ kind: "ready", ...body.readiness });
    } catch {
      setState({ kind: "error" });
    }
  }, [prescriptionId]);
  useEffect(() => void load(), [load]);

  return (
    <section
      className="mt-8"
      aria-live="polite"
      aria-busy={state.kind === "loading"}
      aria-labelledby="care-instruction-readiness"
    >
      <p className="mono-label text-pulse mb-3">INSTRUCTION &amp; SUPPLY READINESS</p>
      <h2 id="care-instruction-readiness" className="h2">
        Software completion and verified real inputs remain separate.
      </h2>
      {state.kind === "loading" && (
        <div className="card mt-6">
          <p className="body-m text-ink-mute">Verifying instruction and supply records…</p>
        </div>
      )}
      {state.kind === "forbidden" && (
        <div className="card mt-6">
          <p className="body-m text-ink-2">
            These details require the clinical administrator role.
          </p>
        </div>
      )}
      {state.kind === "error" && (
        <div className="card mt-6">
          <p className="body-m text-ink-2">
            Readiness could not be confirmed. Care remains blocked.
          </p>
          <button type="button" className="btn btn-secondary mt-6" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <>
          <div className="card mt-6">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div><dt className="mono-label text-ink-mute">SOFTWARE</dt><dd className="body-m mt-2">{state.softwareReady ? "Complete" : "Needs review"}</dd></div>
              <div><dt className="mono-label text-ink-mute">REAL INPUTS</dt><dd className="body-m mt-2">{state.operationalReady ? "Verified" : "Required"}</dd></div>
              <div><dt className="mono-label text-ink-mute">PUBLIC RELEASE</dt><dd className="body-m mt-2">{state.publicReady ? "Approved" : "Blocked"}</dd></div>
            </dl>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3">
            {state.requiredInputs.map((label) => (
              <article className="card" key={label}>
                <h3 className="mono-label text-ink">{label}</h3>
                <p className="body-m text-ink-2 mt-3">{actionCopy[label]}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
