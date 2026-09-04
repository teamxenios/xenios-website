import {
  FOUNDER_COMMAND_CENTER_API_PATH,
  parseFounderCommandCenterResponse,
  type FounderCommandCenterResponse,
} from "@shared/research/founder-command-center";
import { apiGet, type ApiResult } from "../lib/api";

/**
 * The Founder Command Center has one read-only transport: one authorized GET
 * for its already-aggregated, privacy-bounded DTO. A malformed success body is
 * an error, never an invitation for the browser to infer missing cards or
 * invent zeroes.
 */
export async function getFounderCommandCenter(
  token: string,
): Promise<ApiResult<FounderCommandCenterResponse>> {
  const result = await apiGet<unknown>(FOUNDER_COMMAND_CENTER_API_PATH, token);
  // This privacy-minimal surface never renders server/proxy prose. Keep only
  // the state (and denial code, whose copy is resolved locally) so exception
  // text, record identifiers, or contact details cannot cross an error path.
  if (result.kind === "unauthorized") return { kind: "unauthorized" };
  if (result.kind === "forbidden") return { kind: "forbidden" };
  if (result.kind === "denied") {
    return { kind: "denied", code: result.code };
  }
  if (result.kind === "unavailable") return { kind: "unavailable" };
  if (result.kind === "error") {
    return {
      kind: "error",
      code: "command_center_unavailable",
      message: "The read-only command center could not be loaded.",
    };
  }
  const parsed = parseFounderCommandCenterResponse(result.data);
  return parsed
    ? { kind: "ok", data: parsed }
    : {
        kind: "error",
        code: "invalid_command_center_response",
        message: "The command center returned an invalid aggregate response.",
      };
}
