import { apiPost, type ApiResult } from "../lib/api";
import type {
  WhiteLabelCommandResult,
  WhiteLabelPackagingReviewInput,
} from "@shared/research/partners/white-label";

export function submitWhiteLabelPackaging(
  input: WhiteLabelPackagingReviewInput,
  token: string | null,
): Promise<ApiResult<{ result: WhiteLabelCommandResult }>> {
  return apiPost(
    "/api/research/partner/organizations/white-label/packaging-review",
    input,
    token,
  );
}
