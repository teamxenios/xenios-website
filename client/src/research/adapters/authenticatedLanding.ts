import type {
  AuthenticatedExperience,
  AuthenticatedLandingResponse,
} from "@shared/research/admin-access";
import { apiGet, apiPost, type ApiResult } from "../lib/api";

export function resolveAuthenticatedLanding(
  token: string,
): Promise<ApiResult<AuthenticatedLandingResponse>> {
  return apiGet("/api/research/auth/landing", token);
}

export function setAuthenticatedExperience(
  token: string,
  experience: AuthenticatedExperience,
): Promise<ApiResult<AuthenticatedLandingResponse>> {
  return apiPost("/api/research/auth/experience", { experience }, token);
}
