/** Presentation only. The existing form and server remain transaction authorities. */
import { EARLY_ACCESS_REQUEST_CTA, finalRequestActionLabel } from "../early-access/request-experience-copy";
export type RequestBarStep = "products" | "contact" | "review";
export interface RequestBarState {
  readonly step: RequestBarStep;
  readonly selectedCount: number;
  readonly continuationEnabled: boolean;
  readonly storageReady: boolean;
  readonly configReady: boolean;
  readonly contactReady: boolean;
  readonly requirementsNeedRefresh: boolean;
  readonly requirementsCount: number;
  readonly allAcknowledged: boolean;
  readonly busy: boolean;
  readonly frozen: boolean;
}
export interface RequestBarAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly type: "button" | "submit";
  readonly hint: string;
}
export function requestBarAction(state: RequestBarState): RequestBarAction {
  const label = state.step === "review" ? finalRequestActionLabel(state.frozen, state.busy && state.frozen)
    : state.busy ? "Working…" : state.step === "products" ? EARLY_ACCESS_REQUEST_CTA.details
    : EARLY_ACCESS_REQUEST_CTA.finalReview;
  const type = state.step === "contact" ? "submit" : "button";
  const result = (disabled: boolean, hint: string): RequestBarAction => ({ label, type, disabled, hint });
  if (state.busy) return result(true, "Please wait for the current operation. No duplicate request will be sent.");
  if (!state.storageReady) return result(true, "Safe retry storage is unavailable. Contact support.");
  if (!state.continuationEnabled) return result(true, "Complete the current access and policy requirements above.");
  if (state.requirementsNeedRefresh) return result(true, "Refresh the request requirements above, then confirm them.");
  if (!state.configReady) return result(true, "Current request requirements are unavailable or still loading.");
  if (!Number.isSafeInteger(state.selectedCount) || state.selectedCount < 1) {
    return result(true, "Choose an eligible item. Your request stays within reach.");
  }
  if (state.step === "review" && (!state.contactReady || !Number.isSafeInteger(state.requirementsCount)
      || state.requirementsCount < 1 || !state.allAcknowledged)) {
    return result(true, "Review your details and confirm every current acknowledgment above.");
  }
  if (state.step === "review" && state.frozen) {
    return result(false, "Retry only the same request. Do not create a replacement while its result is uncertain.");
  }
  return result(false, "Request for review only. No payment is collected here.");
}

/** Do not mistake pinch zoom for a keyboard. Never mutate viewport/zoom settings. */
export function requestBarKeyboardOffset(
  layoutHeight: number, visualHeight: number, offsetTop: number, scale: number, editableFocused: boolean,
): number {
  if (!editableFocused || ![layoutHeight, visualHeight, offsetTop, scale].every(Number.isFinite)
      || layoutHeight <= 0 || visualHeight <= 0 || offsetTop < 0 || Math.abs(scale - 1) > 0.01) return 0;
  return Math.round(Math.max(0, Math.min(layoutHeight, layoutHeight - visualHeight - offsetTop)));
}
