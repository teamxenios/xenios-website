import { useEffect, useState } from "react";
import {
  isTebraPublicConfiguration,
  TEBRA_PUBLIC_CONFIGURATION_PATH,
  type TebraPublicConfiguration,
} from "@shared/care/tebra-experience";

export { TEBRA_PUBLIC_CONFIGURATION_PATH };

export type TebraConfigurationLoadState =
  | { kind: "loading" }
  | { kind: "ready"; configuration: TebraPublicConfiguration }
  | { kind: "error" };

export function useTebraPublicConfiguration() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<TebraConfigurationLoadState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });

    fetch(TEBRA_PUBLIC_CONFIGURATION_PATH, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("tebra_configuration_unavailable");
        return response.json();
      })
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        if (!isTebraPublicConfiguration(body)) {
          throw new Error("tebra_configuration_invalid");
        }
        setState({ kind: "ready", configuration: body });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });

    return () => controller.abort();
  }, [attempt]);

  return {
    state,
    retry: () => setAttempt((current) => current + 1),
  };
}
