import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";

// ---------------------------------------------------------------------------
// Shared plumbing for the partner family (pages/partners/* only). Every
// partner data surface loads through usePartnerResource so all 17 routes
// branch identically: ok renders server facts, unauthorized asks for
// sign-in, and an unpublished endpoint (404/501/503, or 403 while partner
// grants do not exist yet) lands on the honest "being prepared" state.
// Nothing here invents data.
// ---------------------------------------------------------------------------

export type BoundaryState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

export const PARTNER_PENDING_TITLE = "The partner platform is being prepared.";
export const PARTNER_PENDING_BODY =
  "This area goes live when the Research Rep platform launches. Nothing is wrong with your account, and nothing is required from you right now.";

export const PARTNER_SUPPORT_EMAIL = "research@xeniostechnology.com";

export function usePartnerResource<T>(path: string, token: string | null) {
  const [state, setState] = useState<BoundaryState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [data, setData] = useState<T | null>(null);

  const reload = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    const result = await apiGet<T>(path, token);
    if (result.kind === "ok") {
      setData(result.data);
      setState("ok");
      return;
    }
    if (result.kind === "unauthorized") {
      setState("unauthorized");
      return;
    }
    if (result.kind === "unavailable" || result.kind === "forbidden") {
      setState("unavailable");
      return;
    }
    setErrorMessage(result.message);
    setState("error");
  }, [path, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, errorMessage, data, reload };
}

// One capability fetch per page (the module-level cache in lib/capabilities
// keeps repeat mounts cheap).
export function usePartnerCapabilities(token: string | null) {
  const [statuses, setStatuses] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchCapabilities(token).then((s) => {
      if (alive) setStatuses(s);
    });
    return () => {
      alive = false;
    };
  }, [token]);
  return statuses;
}

// Unavailable-tolerant form submission. An unpublished endpoint produces an
// honest "nothing was submitted" outcome (never a fake success), with the
// support email as the working path.
export type SubmitOutcome =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "accepted"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

export async function submitPartnerRequest(
  path: string,
  body: unknown,
  token: string | null,
  unavailableMessage: string,
): Promise<SubmitOutcome> {
  const result = await apiPost<{ message?: string }>(path, body, token);
  if (result.kind === "ok") {
    return { kind: "accepted", message: result.data?.message ?? "Received. The team will follow up by email." };
  }
  if (result.kind === "unavailable" || result.kind === "forbidden") {
    return { kind: "unavailable", message: unavailableMessage };
  }
  if (result.kind === "unauthorized") {
    return { kind: "error", message: "Your session has ended. Please sign in again and retry." };
  }
  return { kind: "error", message: result.message };
}
