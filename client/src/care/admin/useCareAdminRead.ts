// One loader for every wired Care admin surface.
//
// It maps the Care API's fail-closed response codes onto the four states each
// surface must render, and it never invents data: a response that is not a
// clean 200 with `ok: true` becomes a non-ready state, never an empty record
// list that could read as "nothing to worry about".
//
// Selectors are module-level constants in the calling surface, so the effect
// below can depend on them honestly instead of hiding them behind a ref.

import { useCallback, useEffect, useState } from "react";
import { careApiFetch } from "../api";
import { useCareAdminAuthorization } from "./authorization";
import type { CareAdminLoadState } from "./ui";

export type CareAdminSelector<TData> = (
  body: Record<string, unknown>,
) => TData | null;

export interface CareAdminReadResult<TData> {
  state: CareAdminLoadState<TData>;
  reload: () => void;
}

export async function readCareAdmin<TData>(
  path: string,
  select: CareAdminSelector<TData>,
): Promise<CareAdminLoadState<TData>> {
  try {
    const response = await careApiFetch(path);
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (response.status === 401 || response.status === 403) {
      return { kind: "unauthorized" };
    }
    if (response.status === 503 && body?.code === "care_disabled") {
      return {
        kind: "care_disabled",
        message:
          typeof body.message === "string" && body.message.trim().length > 0
            ? body.message
            : "Care is not enabled.",
      };
    }
    if (!response.ok || body?.ok !== true) return { kind: "error" };
    const data = select(body);
    if (data === null) return { kind: "error" };
    return { kind: "ready", data };
  } catch {
    return { kind: "error" };
  }
}

export function useCareAdminRead<TData>(
  path: string,
  select: CareAdminSelector<TData>,
): CareAdminReadResult<TData> {
  const [state, setState] = useState<CareAdminLoadState<TData>>({
    kind: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  // A surface renders its own hooks outside the guard, so without this the
  // read would fire for a visitor the server has not authorized. No Care read
  // leaves the browser until the server said yes.
  const { authorization } = useCareAdminAuthorization();
  const authorized = authorization.kind === "authorized";

  useEffect(() => {
    if (!authorized) {
      setState({ kind: "loading" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    void readCareAdmin<TData>(path, select).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [authorized, path, attempt, select]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, reload };
}
