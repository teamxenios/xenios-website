import {
  getSupabaseBrowser,
  isRecoveryAccessToken,
} from "@/lib/supabaseBrowser";
import type { Session } from "@supabase/supabase-js";

/** A caller may narrow this transport to its currently displayed session.
 * This predicate grants no authority; the server verifies every operation.
 */
export type CareSessionFence = (session: Session | null) => boolean;

export async function careApiFetch(
  path: string,
  init: RequestInit = {},
  sessionFence?: CareSessionFence,
): Promise<Response> {
  const headers = new Headers(init.headers);
  let session: Session | null = null;
  try {
    const supabase = await getSupabaseBrowser();
    session = supabase ? (await supabase.auth.getSession()).data.session : null;
    const token = session?.access_token ?? null;
    if (token && !isRecoveryAccessToken(token)) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    // The server returns 401. Never substitute a weaker credential.
    session = null;
  }
  // Check the actual SDK result after its await, immediately before dispatch.
  // A failed binding must not become the legacy anonymous fallback.
  if (sessionFence && (!session || isRecoveryAccessToken(session.access_token) || !sessionFence(session))) {
    throw new Error("The current Care session could not be confirmed.");
  }
  return fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: init.cache ?? "no-store",
    headers,
  });
}
