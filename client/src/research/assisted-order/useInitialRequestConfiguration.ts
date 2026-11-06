import { useCallback, useEffect, useRef, useState } from "react";
import type { RequestIntentApi } from "./request-intent-api";
import type { AssistedOrderWizardConfig } from "./wizard-state";
import { createLatestOperation } from "../lib/latest-operation";

export type ConfigurationReadState = "idle" | "loading" | "ready" | "error";

/** Initial read only. The existing proven-refusal refresh remains authoritative. */
export function useInitialRequestConfiguration(
  api: Pick<RequestIntentApi, "config">,
  enabled: boolean,
  onLoaded: (config: AssistedOrderWizardConfig | null) => void,
  timeoutMs = 12_000,
) {
  const operation = useRef(createLatestOperation());
  const callback = useRef(onLoaded);
  callback.current = onLoaded;
  const [state, setState] = useState<ConfigurationReadState>(enabled ? "loading" : "idle");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const observer = operation.current;
    if (!enabled) {
      observer.invalidate();
      setState("idle");
      return;
    }
    let current = true;
    setState("loading");
    callback.current(null);
    void observer.run(() => api.config(), timeoutMs).then((result) => {
      if (!current || result.kind === "cancelled") return;
      if (result.kind === "value") {
        callback.current(result.value);
        setState("ready");
      } else {
        // Selection/contact live in the parent and are never reset here.
        setState("error");
      }
    });
    return () => { current = false; observer.invalidate(); };
  }, [api, enabled, revision, timeoutMs]);
  const retry = useCallback(() => {
    if (enabled && state === "error") setRevision((value) => value + 1);
  }, [enabled, state]);
  return { state, retry } as const;
}
