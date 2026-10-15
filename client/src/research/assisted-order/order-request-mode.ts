import { useEffect, useState } from "react";
import { parseAssistedOrderConfig } from "./wizard-state";
import { ASSISTED_ORDER_DRAFT_KEY, readAssistedOrderDraft } from "./draft-store";
import { REQUEST_INTENT_ATTEMPT_KEY, readIntentAttempt } from "./request-intent-attempt";

export type OrderRequestMode = Readonly<{ kind: "checking" | "legacy" | "mixed" | "unavailable" }>;
export type OrderRequestContinuity = "none" | "legacy" | "mixed" | "blocked";

/** Called once by a door owner and passed to its CTA and embedded entry.
 * No module-global identity cache, automatic retry or refresh-driven mode swap.
 * This public readiness result grants no identity, catalog or submit authority.
 */
export function useOrderRequestMode(active = true, scope = "standalone"): OrderRequestMode {
  const [observed, setObserved] = useState<{ scope: string; state: OrderRequestMode } | null>(null);
  useEffect(() => {
    if (!active) { setObserved(null); return; }
    let current = true;
    void (async () => {
      let kind: OrderRequestMode["kind"] = "unavailable";
      try {
        const response = await fetch("/api/research/early-access/request-intents/config", {
          credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
        });
        const body: unknown = await response.json();
        if (body && typeof body === "object" && !Array.isArray(body)) {
          const row = body as Record<string, unknown>;
          if (response.status === 503 && row.enabled === false && row.error === "request_intent_disabled") kind = "legacy";
          else if (response.ok && row.enabled === true && parseAssistedOrderConfig(body)) kind = "mixed";
        }
      } catch { /* Unknown readiness is NOT proof the feature is off. */ }
      if (current) setObserved({ scope, state: { kind } });
    })();
    return () => { current = false; };
  }, [active, scope]);
  return active && observed?.scope === scope ? observed.state : { kind: "checking" };
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
