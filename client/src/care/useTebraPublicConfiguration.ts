// PARKED, 2026-09-14. Nothing outside this module's own tests imports its public configuration hook.
//
// Care takes access requests directly today: the public journey is the
// manual access form and CarePortalPage, not a third-party scheduler. This
// file is kept rather than deleted because its security and accessibility
// tests are real coverage of a surface that may return, and deleting a
// tested boundary to tidy a tree is how a boundary comes back untested.
//
// Do not mount it without re-reading those tests first.
//
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
