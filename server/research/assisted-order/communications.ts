// Assisted-order outbox email rendering. The outbox worker refuses any
// template key it cannot render (unknown keys walk to failed_permanent), so
// these renderers must exist in the same change that enqueues the intents.
//
// PRIVACY BOUNDARY, ENFORCED AT RENDER TIME: each template reads an explicit
// allowlist of payload fields and ignores everything else. No identity
// document bytes or storage paths, no shipping or billing address, no payment
// evidence, no supplier data, and no procurement economics can reach an email
// even if a future payload accidentally carries them. Admin depth lives
// behind the admin link, which requires the admin bearer session.

const SITE_ORIGIN = "https://xeniostechnology.com";

function text(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function money(cents: unknown): string {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) {
    return "to be confirmed";
  }
  return `$${(cents / 100).toFixed(2)} USD (estimate)`;
}

export function renderAssistedOrderOutboxEmail(
  templateKey: string,
  payload: Record<string, unknown>,
): { subject: string; text: string } | null {
  const reference = text(payload.publicReference);

  if (templateKey === "research.assisted_order.submitted.customer") {
    const statusPath = text(payload.statusPath);
    const lineCount = count(payload.lineCount);
    return {
      subject: `Xenios Research order request received (${reference})`,
      text: [
        `Your Xenios Research order request has been received.`,
        ``,
        `Reference: ${reference}`,
        lineCount !== null ? `Requested items: ${lineCount}` : "",
        `Estimated value: ${money(payload.estimatedTotalCents)}`,
        ``,
        `A member of the Xenios team reviews every request personally. You will`,
        `hear from us about agreements, payment, and fulfillment. Nothing is`,
        `charged automatically.`,
        ``,
        statusPath ? `Track your request: ${SITE_ORIGIN}${statusPath}` : "",
        ``,
        `Xenios Research products are for research use only.`,
      ].filter((line) => line !== "").join("\n"),
    };
  }

  if (templateKey === "research.assisted_order.submitted.admin") {
    const adminPath = text(payload.adminPath);
    const lineCount = count(payload.lineCount);
    const modes = Array.isArray(payload.workflowModes)
      ? payload.workflowModes.filter((m) => typeof m === "string").join(", ")
      : "";
    return {
      subject: `New assisted order request ${reference}`,
      text: [
        `A new assisted order request needs review.`,
        ``,
        `Reference: ${reference}`,
        `Customer: ${text(payload.fullLegalName)} <${text(payload.email)}>`,
        lineCount !== null ? `Lines: ${lineCount}` : "",
        `Estimated value: ${money(payload.estimatedTotalCents)}`,
        modes ? `Workflow: ${modes}` : "",
        ``,
        adminPath ? `Review: ${SITE_ORIGIN}${adminPath}` : "",
      ].filter((line) => line !== "").join("\n"),
    };
  }

  if (templateKey === "research.assisted_order.status_changed.customer") {
    const status = text(payload.status).replace(/_/g, " ");
    const message = text(payload.customerMessage);
    return {
      subject: `Xenios Research order request update (${reference})`,
      text: [
        `Your Xenios Research order request has an update.`,
        ``,
        `Reference: ${reference}`,
        status ? `Status: ${status}` : "",
        message ? `` : "",
        message,
        ``,
        `Track your request: ${SITE_ORIGIN}/research/early-access/order-request/${reference}`,
      ].filter((line) => line !== "").join("\n"),
    };
  }

  if (templateKey === "research.assisted_order.document_uploaded.admin") {
    const adminPath = text(payload.adminPath);
    return {
      subject: `Document received for assisted order ${reference}`,
      text: [
        `A verification document was uploaded for request ${reference}.`,
        ``,
        `Document type: ${text(payload.documentType)}`,
        ``,
        `The document itself is available only inside the admin review screen.`,
        adminPath ? `Review: ${SITE_ORIGIN}${adminPath}` : "",
      ].filter((line) => line !== "").join("\n"),
    };
  }

  return null;
}
