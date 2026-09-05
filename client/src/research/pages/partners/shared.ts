import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCapabilities,
  type CapabilityStatus,
  type ResearchCapability,
} from "../../lib/capabilities";
import { denialPresentation } from "../../lib/denials";
import type { PartnerLoader, PartnerToken } from "../../adapters/partner";

// ---------------------------------------------------------------------------
// Shared plumbing for the partner family (pages/partners/* only). Every
// partner data surface loads through usePartnerResource with a loader from
// adapters/partner (pages never spell API paths), so all 17 routes branch
// identically: ok renders server facts, unauthorized asks for sign-in, and an
// unpublished endpoint (404/501/503, or 403 while partner grants do not
// exist yet) lands on the honest "being prepared" state. Nothing here
// invents data.
// ---------------------------------------------------------------------------

export type BoundaryState =
  | "loading"
  | "ok"
  | "error"
  | "unavailable"
  | "unauthorized";

export const PARTNER_PENDING_TITLE = "The partner platform is being prepared.";
export const PARTNER_PENDING_BODY =
  "This area goes live when the Research Rep platform launches. Nothing is wrong with your account, and nothing is required from you right now.";

export const PARTNER_SUPPORT_EMAIL = "research@xeniostechnology.com";

type PartnerSnapshot<T> = {
  state: BoundaryState;
  errorMessage?: string;
  denied: { code: string; message?: string } | null;
  data: T | null;
};

export function usePartnerResource<T>(
  load: PartnerLoader<T>,
  token: PartnerToken,
) {
  // Match the canonical account resource pattern: the render observing a
  // principal/loader change must not expose even one frame of the old result.
  // The lifecycle also isolates A -> B -> A and Strict Mode effect restarts.
  const request = useMemo(
    () => ({
      load,
      token,
      lifecycle: { active: false, generation: 0 },
    }),
    [load, token],
  );
  const [result, setResult] = useState<{
    request: typeof request;
    snapshot: PartnerSnapshot<T>;
  } | null>(null);

  const reload = useCallback(async () => {
    // Retained event callbacks from an old principal or an unmounted consumer
    // must not start new requests. Existing in-flight requests remain reads,
    // but only this lifecycle's newest generation can publish a result.
    if (!request.lifecycle.active) return;
    const generation = ++request.lifecycle.generation;
    const publish = (snapshot: PartnerSnapshot<T>) => {
      if (
        request.lifecycle.active &&
        generation === request.lifecycle.generation
      ) {
        setResult({ request, snapshot });
      }
    };
    const empty = { data: null, denied: null };
    if (!request.token) {
      publish({ ...empty, state: "unauthorized" });
      return;
    }
    publish({ ...empty, state: "loading" });
    try {
      const response = await request.load(request.token);
      if (response.kind === "ok") {
        publish({ ...empty, state: "ok", data: response.data });
      } else if (response.kind === "unauthorized") {
        publish({ ...empty, state: "unauthorized" });
      } else if (
        response.kind === "unavailable" ||
        response.kind === "forbidden"
      ) {
        publish({ ...empty, state: "unavailable" });
      } else if (response.kind === "denied") {
        // Preserve the established machine-code presentation, never derive
        // partner authority from the status or from a server message.
        const presentation = denialPresentation(
          response.code,
          response.message,
        );
        publish({
          ...empty,
          state: presentation.tone === "pending" ? "unavailable" : "error",
          denied: { code: response.code, message: response.message },
          ...(presentation.tone === "pending"
            ? {}
            : {
                errorMessage: `${presentation.title} ${presentation.body}`,
              }),
        });
      } else {
        publish({ ...empty, state: "error", errorMessage: response.message });
      }
    } catch {
      publish({
        ...empty,
        state: "error",
        errorMessage:
          "The partner information could not be loaded. Please try again.",
      });
    }
  }, [request]);

  useEffect(() => {
    request.lifecycle.active = true;
    void reload();
    return () => {
      request.lifecycle.active = false;
      request.lifecycle.generation++;
    };
  }, [reload, request]);

  const snapshot: PartnerSnapshot<T> =
    result?.request === request && token
      ? result.snapshot
      : { state: token ? "loading" : "unauthorized", data: null, denied: null };
  return { ...snapshot, reload };
}

// One capability fetch per page (the module-level cache in lib/capabilities
// keeps repeat mounts cheap).
export function usePartnerCapabilities(token: string | null) {
  const request = useMemo(() => ({ token }), [token]);
  const [result, setResult] = useState<{
    request: typeof request;
    statuses: Map<ResearchCapability, CapabilityStatus> | null;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    setResult({ request, statuses: null });
    if (request.token) {
      void fetchCapabilities(request.token).then(
        (statuses) => {
          if (alive) setResult({ request, statuses });
        },
        () => {
          if (alive) setResult({ request, statuses: null });
        },
      );
    }
    return () => {
      alive = false;
    };
  }, [request]);
  return token && result?.request === request ? result.statuses : null;
}

// The submission plumbing (SubmitOutcome and the unavailable-tolerant POST
// core) lives in adapters/partner next to the endpoints it serves; re-export
// the type so page-level imports stay one-directional.
export type { SubmitOutcome } from "../../adapters/partner";
