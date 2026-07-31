// The Care admin role guard.
//
// Authorization is decided by the server, never by the browser. The guard
// probes a real care:administer endpoint and renders its children only on a
// clean 200. A member, a provider, an anonymous visitor, a transport failure,
// and a disabled Care capability all land in a non-authorized state, so the
// console fails closed in every direction.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { careApiFetch } from "../api";

/** The probe. A real care:administer contract, chosen because it reads no patient record. */
export const CARE_ADMIN_PROBE_PATH = "/api/care/appointments/admin/readiness";

export type CareAdminAuthorization =
  | { kind: "checking" }
  | { kind: "care_disabled"; message: string }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | { kind: "authorized" };

export function isCareAdminAuthorized(
  authorization: CareAdminAuthorization,
): boolean {
  return authorization.kind === "authorized";
}

const FALLBACK_DISABLED_MESSAGE = "Care is not enabled.";

export async function probeCareAdminAuthorization(): Promise<CareAdminAuthorization> {
  try {
    const response = await careApiFetch(CARE_ADMIN_PROBE_PATH);
    const body = (await response.json().catch(() => ({}))) as {
      ok?: unknown;
      code?: unknown;
      message?: unknown;
    };
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403) return { kind: "forbidden" };
    if (response.status === 503 && body?.code === "care_disabled") {
      return {
        kind: "care_disabled",
        message:
          typeof body.message === "string" && body.message.trim().length > 0
            ? body.message
            : FALLBACK_DISABLED_MESSAGE,
      };
    }
    if (!response.ok || body?.ok !== true) return { kind: "unavailable" };
    return { kind: "authorized" };
  } catch {
    return { kind: "unavailable" };
  }
}

export interface CareAdminAuthorizationValue {
  authorization: CareAdminAuthorization;
  recheck: () => void;
}

const AuthorizationContext = createContext<CareAdminAuthorizationValue>({
  authorization: { kind: "checking" },
  recheck: () => undefined,
});

export function useCareAdminAuthorization(): CareAdminAuthorizationValue {
  return useContext(AuthorizationContext);
}

export function CareAdminAuthorizationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [authorization, setAuthorization] = useState<CareAdminAuthorization>({
    kind: "checking",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAuthorization({ kind: "checking" });
    void probeCareAdminAuthorization().then((next) => {
      if (!cancelled) setAuthorization(next);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const recheck = useCallback(() => setAttempt((value) => value + 1), []);

  return (
    <AuthorizationContext.Provider value={{ authorization, recheck }}>
      {children}
    </AuthorizationContext.Provider>
  );
}

const DENIAL_COPY: Record<
  Exclude<CareAdminAuthorization["kind"], "authorized">,
  { heading: string; detail: string; retry: boolean }
> = {
  checking: {
    heading: "Checking Care administrator access…",
    detail:
      "Nothing is shown while the server confirms this account. No Care record is loaded.",
    retry: false,
  },
  unauthenticated: {
    heading: "Sign in as a Care administrator.",
    detail:
      "This console is not open to visitors. No Care record, patient, provider, or configuration is shown here.",
    retry: false,
  },
  forbidden: {
    heading: "This account is not a Care administrator.",
    detail:
      "Membership, a patient account, and a clinician account do not reach this console. Nothing on this page is available to them.",
    retry: false,
  },
  care_disabled: {
    heading: "Care is not enabled.",
    detail:
      "The server refuses every Care administrator read while the capability is off, so this console has nothing to show.",
    retry: true,
  },
  unavailable: {
    heading: "Care administrator access could not be confirmed.",
    detail:
      "Nothing was read and nothing was changed. This console stays closed until the server answers.",
    retry: true,
  },
};

/**
 * Renders `children` only when the server authorized this account. Every other
 * outcome renders an explanation and no Care data.
 */
export function CareAdminGuard({ children }: { children: ReactNode }) {
  const { authorization, recheck } = useCareAdminAuthorization();

  if (authorization.kind === "authorized") return <>{children}</>;

  const copy = DENIAL_COPY[authorization.kind];
  const heading =
    authorization.kind === "care_disabled" ? authorization.message : copy.heading;

  return (
    <section
      className="card mt-8 max-w-[720px]"
      aria-live="polite"
      aria-busy={authorization.kind === "checking"}
      data-care-admin-authorization={authorization.kind}
    >
      <p className="mono-label text-pulse mb-3">ACCESS</p>
      <strong className="body-l">{heading}</strong>
      <p className="body-m text-ink-2 mt-3">{copy.detail}</p>
      {copy.retry && (
        <button type="button" className="btn btn-secondary mt-6" onClick={recheck}>
          Try again
        </button>
      )}
    </section>
  );
}
