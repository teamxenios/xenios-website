import type {
  AuthenticatedExperience,
  AuthenticatedLandingResponse,
} from "@shared/research/admin-authority";

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
export async function getAuthenticatedLanding(
  accessToken: string,
): Promise<AuthenticatedLandingResponse | null> {
  const response = await fetch("/api/research/auth/landing", {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = (await responseBody(response)) as
    | AuthenticatedLandingResponse
    | null;
  return response.ok && body?.ok ? body : null;
}

export async function setAuthenticatedExperience(
  accessToken: string,
  experience: AuthenticatedExperience,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<AuthenticatedLandingResponse | null> {
  const response = await fetch("/api/research/auth/experience", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      experience,
      expectedVersion,
      idempotencyKey,
    }),
  });
  const body = (await responseBody(response)) as
    | AuthenticatedLandingResponse
    | null;
  return response.ok && body?.ok ? body : null;
}
