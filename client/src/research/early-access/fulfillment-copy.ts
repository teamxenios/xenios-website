/**
 * The fulfillment target sentence, as one client constant.
 *
 * ONE copy, in one file, imported everywhere it is shown. It is a TARGET and
 * never a delivery guarantee, and the wording is not ours to soften or shorten:
 * a shortened variant already exists in the server module's own test file, which
 * is exactly the drift this single constant prevents.
 *
 * TEMPORARY. The canonical sentence is being exported from a shared module by
 * the integration lane. When it lands, this file is deleted and every import
 * repointed at the shared export in the same commit. Do not add a second copy
 * anywhere in the meantime, and do not inline the string at a call site.
 */
export const EARLY_ACCESS_FULFILLMENT_TARGET_COPY =
  "Current fulfillment target: within 72 hours after payment verification and product availability confirmation. Tracking will be provided when the shipment is released.";
