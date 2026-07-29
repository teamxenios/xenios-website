import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import type { CarePharmacyOrder } from "@shared/care/prescriptions";
import { careApiFetch } from "./api";
import CarePharmacyReadinessPanel from "./CarePharmacyReadinessPanel";

type State =
  | { kind: "loading" }
  | { kind: "disabled" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; orders: CarePharmacyOrder[] };

export default function CarePharmacyOrdersPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await careApiFetch("/api/care/pharmacy/orders");
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        setState({ kind: "forbidden" });
        return;
      }
      if (response.status === 503 && body?.code === "care_disabled") {
        setState({ kind: "disabled" });
        return;
      }
      if (!response.ok || body?.ok !== true || !Array.isArray(body.orders)) {
        throw new Error("unavailable");
      }
      setState({ kind: "ready", orders: body.orders });
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
        title="Care pharmacy status, xenios"
        description="Read-only, fail-closed Care pharmacy readiness status."
        path="/care/pharmacy"
      />
      <div className="container-x pt-24 md:pt-36 pb-20" id="main-content">
        <p className="mono-cap text-pulse mb-6">CARE · PHARMACY</p>
        <h1 className="display-m max-w-[18ch]">
          Pharmacy operations remain unavailable.
        </h1>
        <p className="body-l text-ink-2 mt-8 max-w-[64ch]">
          This frontend is read-only. It cannot receive, accept, dispense, ship,
          deliver, cancel, clarify, or change a pharmacy record.
        </p>

        <section
          className="mt-10 max-w-[980px]"
          aria-live="polite"
          aria-busy={state.kind === "loading"}
          aria-labelledby="care-pharmacy-status"
          data-care-read-only="true"
        >
          <p className="mono-label text-pulse mb-3">CURRENT STATUS</p>
          <h2 id="care-pharmacy-status" className="h2">
            {state.kind === "loading" &&
              "Checking restricted pharmacy status…"}
            {state.kind === "disabled" &&
              "Pharmacy operations are disabled."}
            {state.kind === "forbidden" &&
              "Authorized pharmacy access is required."}
            {state.kind === "error" &&
              "Pharmacy status is temporarily unavailable."}
            {state.kind === "ready" &&
              state.orders.length === 0 &&
              "No pharmacy records are assigned."}
            {state.kind === "ready" &&
              state.orders.length > 0 &&
              "Restricted pharmacy records exist."}
          </h2>

          {state.kind === "loading" && (
            <div className="card mt-6">
              <p className="body-m text-ink-mute">
                No operational control is available while authorization is
                confirmed.
              </p>
            </div>
          )}
          {state.kind === "disabled" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                No prescription, provider, dispensing, fulfillment, or shipping
                action can be taken.
              </p>
            </div>
          )}
          {state.kind === "forbidden" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                This page does not expose patient, prescription, pharmacy, or
                fulfillment details without authorized access.
              </p>
            </div>
          )}
          {state.kind === "error" && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                Nothing was changed. Care pharmacy operations remain
                unavailable.
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
          {state.kind === "ready" && state.orders.length === 0 && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                No operational record is presented and no pharmacy action is
                available.
              </p>
            </div>
          )}
          {state.kind === "ready" && state.orders.length > 0 && (
            <div className="card mt-6">
              <p className="body-m text-ink-2">
                An authorized read returned restricted records. This shell does
                not display patient, prescription, pharmacy, tracking, or
                fulfillment details and exposes no operational controls.
              </p>
            </div>
          )}
        </section>

        {(state.kind === "disabled" ||
          state.kind === "error" ||
          state.kind === "ready") && <CarePharmacyReadinessPanel />}
      </div>
    </PageShell>
  );
}
