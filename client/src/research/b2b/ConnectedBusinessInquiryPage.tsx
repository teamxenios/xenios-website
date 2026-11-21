import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import OrganizationAccessPage from "./OrganizationAccessPage";

const ready = z.object({ enabled: z.literal(true), attemptPrefix: z.string().regex(/^[0-9a-f]{64}_$/) }).strict();
/** Availability and an attempt fence only. Server Auth, policy and SQL remain authoritative. */
export default function ConnectedBusinessInquiryPage() {
  const [connection, setConnection] = useState<{ generation: string; attemptPrefix: string } | null>(null);
  const lifetime = useRef(0), current = useRef<string | null>(null);
  useEffect(() => {
    const generation = ++lifetime.current, abort = new AbortController();
    current.current = null;
    void (async () => {
      try {
        const response = await fetch("/api/research/business-inquiries/config", {
          method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
          headers: { Accept: "application/json" }, signal: abort.signal,
        });
        if (abort.signal.aborted || generation !== lifetime.current || response.status !== 200 || response.redirected
          || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? "")) {
          // Release an unused fetch body while keeping rejected readiness unavailable.
          try { await response.body?.cancel(); } catch { /* Already aborted or unavailable. */ }
          return;
        }
        const text = await response.text();
        if (text.length > 512 || abort.signal.aborted || generation !== lifetime.current) return;
        const parsed = ready.safeParse(JSON.parse(text));
        if (!parsed.success) return;
        const token = `${generation}:${parsed.data.attemptPrefix}`;
        current.current = token;
        setConnection({ generation: token, attemptPrefix: parsed.data.attemptPrefix });
      } catch { /* Missing readiness never becomes a local draft or a saved enquiry. */ }
    })();
    return () => { current.current = null; lifetime.current += 1; abort.abort(); };
  }, []);
  const context = connection ? {
    enabled: true, contextGeneration: connection.generation, attemptPrefix: connection.attemptPrefix,
    isContextCurrent: (generation: string) => current.current === generation,
  } : { enabled: false, contextGeneration: "", isContextCurrent: () => false };
  return <OrganizationAccessPage businessInquiry={context} />;
}
