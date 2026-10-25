import { apiGet, apiPatch, apiPost, type ApiResult } from "../lib/api";
import type {
  WhiteLabelApplicationInput,
  WhiteLabelBrandInput,
  WhiteLabelCommandResult,
  WhiteLabelFulfillmentInput,
  WhiteLabelQuoteRequestInput,
  WhiteLabelSelectionInput,
  WhiteLabelSupportInput,
  WhiteLabelWorkspaceView,
} from "@shared/research/partners/white-label";

const BASE = "/api/research/partner/organizations/white-label";

export type WhiteLabelToken = string | null;

export function getWhiteLabelWorkspace(
  token: WhiteLabelToken,
): Promise<ApiResult<{ workspace: WhiteLabelWorkspaceView }>> {
  return apiGet(BASE, token);
}

export function submitWhiteLabelApplication(
  input: WhiteLabelApplicationInput,
  token: WhiteLabelToken,
): Promise<ApiResult<{ result: WhiteLabelCommandResult }>> {
  return apiPost(`${BASE}/application`, input, token);
}

export function saveWhiteLabelBrand(
  input: WhiteLabelBrandInput,
  token: WhiteLabelToken,
): Promise<ApiResult<{ result: WhiteLabelCommandResult }>> {
  return apiPatch(`${BASE}/brand`, input, token);
}

export function addWhiteLabelSelection(
  input: WhiteLabelSelectionInput,
  token: WhiteLabelToken,
): Promise<ApiResult<{ result: WhiteLabelCommandResult }>> {
  return apiPost(`${BASE}/selections`, input, token);
}

export function requestWhiteLabelQuote(
  input: WhiteLabelQuoteRequestInput,
  token: WhiteLabelToken,
): Promise<ApiResult<{ result: WhiteLabelCommandResult }>> {
  return apiPost(`${BASE}/quotes`, input, token);
}

export function setWhiteLabelFulfillment(
  input: WhiteLabelFulfillmentInput,
  token: WhiteLabelToken,
): Promise<ApiResult<{ result: WhiteLabelCommandResult }>> {
  return apiPatch(`${BASE}/fulfillment`, input, token);
}

export function openWhiteLabelSupport(
  input: WhiteLabelSupportInput,
  token: WhiteLabelToken,
): Promise<ApiResult<{ result: WhiteLabelCommandResult }>> {
  return apiPost(`${BASE}/support`, input, token);
}
