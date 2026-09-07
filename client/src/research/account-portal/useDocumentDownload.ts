import { useCallback, useEffect, useMemo, useRef } from "react";
import { downloadAccountDocument, type AccountDocumentDownloadResult } from "./api";

/**
 * A document request belongs to the verified bearer and mounted account
 * view that started it. This hook creates no customer/partner/organization
 * authority: the canonical server still authorizes the exact document path.
 * Any token transition (including refresh) cancels old work conservatively.
 */
export function useDocumentDownload(token: string | null) {
  const session = useMemo(() => ({
    token,
    active: false,
    requests: new Map<string, AbortController>(),
  }), [token]);
  const currentSession = useRef(session);
  // The render observing a new token closes old completions immediately,
  // before effect cleanup can abort their network requests.
  currentSession.current = session;

  useEffect(() => {
    session.active = true;
    return () => {
      session.active = false;
      for (const request of session.requests.values()) request.abort();
      session.requests.clear();
    };
  }, [session]);

  return useCallback(async (path: string): Promise<AccountDocumentDownloadResult> => {
    if (!session.active || currentSession.current !== session) return "cancelled";
    if (!session.token) return "denied";
    // Separate documents may download concurrently; a newer attempt for the
    // same path replaces only that path's earlier request.
    session.requests.get(path)?.abort();
    const request = new AbortController();
    session.requests.set(path, request);
    const isCurrent = () => session.active
      && currentSession.current === session
      && session.requests.get(path) === request
      && !request.signal.aborted;
    try {
      return await downloadAccountDocument(session.token, path, {
        signal: request.signal,
        isCurrent,
      });
    } finally {
      if (session.requests.get(path) === request) session.requests.delete(path);
    }
  }, [session]);
}
