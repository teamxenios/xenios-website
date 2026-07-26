import {
  getSupabaseBrowser,
  isRecoveryAccessToken,
} from "@/lib/supabaseBrowser";

export async function careApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const supabase = await getSupabaseBrowser();
    const token = supabase
      ? (await supabase.auth.getSession()).data.session?.access_token ?? null
      : null;
    if (token && !isRecoveryAccessToken(token)) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    // The server returns 401. Never substitute a weaker credential.
  }
  return fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: init.cache ?? "no-store",
    headers,
  });
}
