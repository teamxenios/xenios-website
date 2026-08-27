import { AssistedOrderApiError } from "./api";

const STATUS_UNAVAILABLE =
  "The request status is temporarily unavailable. Please try again.";

/** Customer surfaces never render exception or upstream response text. */
export function assistedOrderStatusErrorCopy(error: unknown): string {
  if (!(error instanceof AssistedOrderApiError)) return STATUS_UNAVAILABLE;
  if (error.status === 401 || error.status === 403 || error.status === 404) {
    return "This secure status link is not valid or has expired. Contact Xenios Research for help.";
  }
  if (error.status === 429) {
    return "Too many status requests were made. Please wait a moment and try again.";
  }
  return STATUS_UNAVAILABLE;
}

export function assistedOrderUploadErrorCopy(error: unknown): string {
  if (!(error instanceof AssistedOrderApiError)) {
    return "The document could not be uploaded securely. Please try again.";
  }
  if (error.status === 401 || error.status === 403 || error.status === 404) {
    return "This secure upload session is no longer valid. Refresh your request status before trying again.";
  }
  if (error.status === 400 || error.status === 413 || error.status === 415) {
    return "This file could not be accepted. Choose a JPG, PNG, or PDF that meets the requested size limit.";
  }
  if (error.status === 429) {
    return "Too many upload attempts were made. Please wait a moment and try again.";
  }
  return "The document could not be uploaded securely. Please try again.";
}
