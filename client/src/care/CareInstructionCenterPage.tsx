import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type {
  CarePatientInstruction,
  CareSupplyKit,
  CareSupplyReplacement,
} from "@shared/care/instructions";
import { careApiFetch } from "./api";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "auth_required" }
  | { kind: "error" }
  | {
      kind: "ready";
      instructions: CarePatientInstruction[];
      supplyKits: CareSupplyKit[];
      replacements: CareSupplyReplacement[];
    };

export default function CareInstructionCenterPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const [instructionResponse, supplyResponse] = await Promise.all([
        careApiFetch("/api/care/instructions"),
        careApiFetch("/api/care/supplies"),
      ]);
      const [instructionBody, supplyBody] = await Promise.all([
        instructionResponse.json().catch(() => ({})),
        supplyResponse.json().catch(() => ({})),
      ]);
      if (instructionResponse.status === 401 || supplyResponse.status === 401) {
        return setState({ kind: "auth_required" });
      }
      if (
        (instructionResponse.status === 503 &&
          instructionBody?.code === "care_disabled") ||
        (supplyResponse.status === 503 && supplyBody?.code === "care_disabled")
      ) {
        return setState({ kind: "disabled" });
      }
      if (
        !instructionResponse.ok ||
        !supplyResponse.ok ||
        instructionBody?.ok !== true ||
        supplyBody?.ok !== true ||
        !Array.isArray(instructionBody.instructions) ||
        !Array.isArray(supplyBody.supplyKits) ||
        !Array.isArray(supplyBody.replacements)
      ) {
        throw new Error("care_instruction_center_unavailable");
      }
      setState({
        kind: "ready",
        instructions: instructionBody.instructions,
        supplyKits: supplyBody.supplyKits,
        replacements: supplyBody.replacements,
      });
    } catch {
      setState({ kind: "error" });
    }
  }, []);
  useEffect(() => void load(), [load]);

  const acknowledge = async (instruction: CarePatientInstruction) => {
    setBusyId(instruction.id);
    try {
      const response = await careApiFetch(
        `/api/care/instructions/${instruction.id}/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instructionVersion: instruction.version,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) throw new Error("acknowledgment_failed");
      await load();
    } catch {
      setState({ kind: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const requestReplacement = async (kit: CareSupplyKit) => {
    setBusyId(kit.id);
    try {
      const response = await careApiFetch(
        `/api/care/supplies/${kit.id}/replacements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        },
      );
      if (!response.ok) throw new Error("replacement_failed");
      await load();
    } catch {
      setState({ kind: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const empty =
    state.kind === "ready" &&
    state.instructions.length === 0 &&
    state.supplyKits.length === 0;

  return (
    <div className="overflow-x-clip">
      <PageShell>
        <SeoHead
          title="Care instruction center, xenios"
          description="Private patient-specific Care instructions and verified supply details."
          path="/care/instructions"
        />
        <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · INSTRUCTION CENTER</p>
        <h1 className="display-m max-w-[18ch]">
          Patient-specific information, from verified sources.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          This private area stays empty until an assigned human clinician
          releases instructions tied to your signed prescription and verified
          pharmacy, manufacturer, and clinician sources.
        </p>

        <section
          className="mt-10 max-w-[940px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-instruction-status"
        >
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="care-instruction-status" className="h2">
            {state.kind === "loading" && "Checking your private Care records…"}
            {state.kind === "disabled" && "Patient instructions are not currently available."}
            {state.kind === "auth_required" && "Sign in is required."}
            {state.kind === "error" && "The Instruction Center is temporarily unavailable."}
            {empty && "No patient-specific instructions are recorded."}
            {state.kind === "ready" && !empty && "Your Instruction Center"}
          </h2>

          {state.kind === "loading" && (
            <div className="card mt-6">
              <p className="body-m text-ink-mute">
                No instruction, acknowledgment, or replacement action is
                available while authorization is confirmed.
              </p>
            </div>
          )}
          {state.kind === "disabled" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Care remains disabled until real clinical, pharmacy, privacy,
                instruction, supply, support, and release requirements pass.
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                View Care status
              </Link>
            </div>
          )}
          {state.kind === "auth_required" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Patient-specific instructions are private and require an
                authorized Care account.
              </p>
              <Link href="/research/sign-in" className="btn btn-primary mt-6">
                Sign in securely
              </Link>
            </div>
          )}
          {state.kind === "error" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Nothing was changed. Confirm the current record again before
                relying on instructions or supply details.
              </p>
              <button type="button" className="btn btn-secondary mt-6" onClick={() => void load()}>
                Try again
              </button>
            </div>
          )}
          {empty && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                No signed patient-specific instruction or verified supply kit
                exists. General education is never substituted for clinician
                or pharmacy direction.
              </p>
              <Link href="/care" className="btn btn-secondary mt-6">
                Review Care status
              </Link>
            </div>
          )}

          {state.kind === "ready" && state.instructions.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-4">
              {state.instructions.map((instruction) => {
                const acknowledged =
                  instruction.acknowledgedVersion === instruction.version;
                return (
                  <article className="card" key={instruction.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="mono-label text-pulse">
                          {instruction.status === "released" &&
                          instruction.sourceChainCurrent
                            ? "CURRENT CLINICIAN INSTRUCTION"
                            : "INSTRUCTION HISTORY"}
                        </p>
                        <h3 className="h3 mt-2">Version {instruction.version}</h3>
                      </div>
                      <span className="mono-label text-ink-mute">
                        {acknowledged ? "ACKNOWLEDGED" : "REVIEW REQUIRED"}
                      </span>
                    </div>
                    <div className="rule-top mt-6 pt-6">
                      <p className="body-m text-ink-2 whitespace-pre-wrap">
                        {instruction.instructionContent}
                      </p>
                    </div>
                    {instruction.status === "released" &&
                      instruction.sourceChainCurrent &&
                      !acknowledged && (
                      <button
                        type="button"
                        className="btn btn-primary mt-6"
                        disabled={busyId === instruction.id}
                        onClick={() => void acknowledge(instruction)}
                      >
                        {busyId === instruction.id
                          ? "Saving…"
                          : "Acknowledge this version"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {state.kind === "ready" && state.supplyKits.length > 0 && (
            <div className="mt-10">
              <p className="mono-label text-pulse mb-3">VERIFIED SUPPLY DETAILS</p>
              <div className="grid grid-cols-1 gap-4">
                {state.supplyKits.map((kit) => {
                  const supplierVerified =
                    kit.supplySourceVerificationState === "verified" &&
                    Boolean(kit.verifiedSupplierReference);
                  const openReplacement = state.replacements.find(
                    (replacement) =>
                      replacement.supplyKitId === kit.id &&
                      ["requested", "approved"].includes(replacement.status),
                  );
                  return (
                    <article className="card" key={kit.id}>
                      <h3 className="h3">{kit.productSpecificDevice}</h3>
                      <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div>
                          <dt className="mono-label text-ink-mute">
                            {supplierVerified
                              ? "VERIFIED SUPPLY SOURCE"
                              : "VERIFIED SUPPLY SOURCE REQUIRED"}
                          </dt>
                          <dd className="body-m mt-2">
                            {supplierVerified
                              ? kit.verifiedSupplierReference
                              : "The supply relationship is not currently verified. Replacement actions remain unavailable."}
                          </dd>
                        </div>
                        <div>
                          <dt className="mono-label text-ink-mute">REPLACEMENT CADENCE</dt>
                          <dd className="body-m mt-2">{kit.replacementCadence}</dd>
                        </div>
                      </dl>
                      {!supplierVerified || !kit.replacementEligible ? (
                        <p className="body-m text-ink-2 mt-6" role="status">
                          Supply replacement unavailable until the exact
                          instruction and supply relationships are current and
                          verified.
                        </p>
                      ) : openReplacement ? (
                        <p className="body-m text-ink-2 mt-6">
                          Replacement status: {openReplacement.status}.
                        </p>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary mt-6"
                          disabled={busyId === kit.id}
                          onClick={() => void requestReplacement(kit)}
                        >
                          {busyId === kit.id ? "Saving…" : "Request a replacement"}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>
        </div>
      </PageShell>
    </div>
  );
}
