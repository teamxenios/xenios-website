import { useCallback, useEffect, useState } from "react";
import { createLatestOperation } from "../lib/latest-operation";
import { parseAssistedOrderConfig } from "./wizard-state";
import { ASSISTED_ORDER_DRAFT_KEY, readAssistedOrderDraft } from "./draft-store";
import { REQUEST_INTENT_ATTEMPT_KEY, readIntentAttempt } from "./request-intent-attempt";

export type OrderRequestMode = Readonly<{
  kind: "checking" | "legacy" | "mixed" | "unavailable";
  retry?: () => void;
}>;
export type OrderRequestContinuity = "none" | "legacy" | "mixed" | "blocked";

async function readRequestMode(signal: AbortSignal): Promise<OrderRequestMode["kind"]> {
  const response = await fetch("/api/research/early-access/request-intents/config", {
    credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal,
  });
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) return "unavailable";
  const row = body as Record<string, unknown>;
  if (response.status === 503 && row.enabled === false && row.error === "request_intent_disabled") {
    return "legacy";
  }
  return response.ok && row.enabled === true && parseAssistedOrderConfig(body) ? "mixed" : "unavailable";
}

/** One scoped readiness read, with an explicit retry for an unconfirmed response. */
export function useOrderRequestMode(active = true, scope = "standalone"): OrderRequestMode {
  const [operation] = useState(createLatestOperation);
  const [probe, setProbe] = useState({ active, scope });
  const [observed, setObserved] = useState<{ probe: typeof probe; kind: OrderRequestMode["kind"] } | null>(null);
  const current = probe.active === active && probe.scope === scope;
  // A fresh probe also covers a return to a previously seen scope.
  if (!current) setProbe({ active, scope });

  useEffect(() => {
    if (!probe.active) return;
    const controller = new AbortController();
    void operation.run(() => readRequestMode(controller.signal), 12_000).then((result) => {
      if (controller.signal.aborted || result.kind === "cancelled") return;
      if (result.kind === "timeout") controller.abort();
      setObserved({ probe, kind: result.kind === "value" ? result.value : "unavailable" });
    });
    return () => {
      operation.invalidate();
      controller.abort();
    };
  }, [operation, probe]);

  const retry = useCallback(() => {
    setProbe((pending) => pending === probe ? { ...probe } : pending);
  }, [probe]);
  const kind = current && observed?.probe === probe ? observed.kind : "checking";
  return kind === "unavailable" ? { kind, retry } : { kind };
}

/** Routing hint only. Never clears, repairs, logs or copies a saved attempt.
 * Stored state grants no owner authority; each original server path still
 * authenticates the current customer. Corrupt/unreadable state blocks switching.
 */
export function readOrderRequestContinuity(storage: Pick<Storage, "getItem"> | null): OrderRequestContinuity {
  if (!storage) return "blocked";
  try {
    const mixedRaw = storage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    const legacyRaw = storage.getItem(ASSISTED_ORDER_DRAFT_KEY);
    const mixed = mixedRaw !== null ? readIntentAttempt(storage) : null;
    const legacy = legacyRaw !== null ? readAssistedOrderDraft(storage as Storage) : null;
    if (mixedRaw !== null && !mixed || legacyRaw !== null && !legacy) return "blocked";
    const retainedLegacy = !!legacy && (legacy.attemptState === "uncertain"
      || legacy.acceptedAt !== null || legacy.selections.length > 0);
    if (mixed && retainedLegacy) return "blocked";
    if (mixed) return "mixed";
    if (retainedLegacy) return "legacy";
    return "none";
  } catch { return "blocked"; }
}
export function selectOrderRequestDoor(mode: OrderRequestMode, prior: OrderRequestContinuity) {
  if (prior !== "none") return prior;
  return mode.kind;
}
