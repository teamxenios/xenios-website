import { useCallback, useEffect, useState } from "react";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../../lib/capabilities";
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

export type BoundaryState = "loading" | "ok" | "error" | "unavailable" | "unauthorized";

export const PARTNER_PENDING_TITLE = "The partner platform is being prepared.";
export const PARTNER_PENDING_BODY =
  "This area goes live when the Research Rep platform launches. Nothing is wrong with your account, and nothing is required from you right now.";

export const PARTNER_SUPPORT_EMAIL = "research@xeniostechnology.com";

export function usePartnerResource<T>(load: PartnerLoader<T>, token: PartnerToken) {
  const [state, setState] = useState<BoundaryState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [denied, setDenied] = useState<{ code: string; message?: string } | null>(null);
  const [data, setData] = useState<T | null>(null);

  const reload = useCallback(async () => {
    setState("loading");
    setErrorMessage(undefined);
    setDenied(null);
    const result = await load(token);
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
    if (result.kind === "denied") {
      // Route on the machine code, never on the server message. Pages that
      // design a state for a specific code read `denied` and render it; the
      // default here maps a pending-tone denial to the honest unavailable
      // panel and everything else to an error with our own copy.
      setDenied({ code: result.code, message: result.message });
      const p = denialPresentation(result.code, result.message);
      if (p.tone === "pending") {
        setState("unavailable");
      } else {
        setErrorMessage(`${p.title} ${p.body}`);
        setState("error");
      }
      return;
    }
    setErrorMessage(result.message);
    setState("error");
  }, [load, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, errorMessage, denied, data, reload };
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

// The submission plumbing (SubmitOutcome and the unavailable-tolerant POST
// core) lives in adapters/partner next to the endpoints it serves; re-export
// the type so page-level imports stay one-directional.
export type { SubmitOutcome } from "../../adapters/partner";
