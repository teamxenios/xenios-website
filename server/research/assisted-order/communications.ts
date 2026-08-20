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

/** A bare amount, for a line inside a list where "(estimate)" is already said. */
function amount(cents: unknown): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) {
    return null;
  }
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The ordered-items block, from the v2 payload's `lines`.
 *
 * ALLOWLISTED FIELD BY FIELD, like every other template in this file: product
 * name, specification, quantity, and the two retail amounts. A payload that
 * carries anything else — an address, a document path, a supplier — cannot
 * reach an email through here, because nothing reads it.
 *
 * Returns an empty array for a v1 payload, which has no `lines` at all. That is
 * what keeps rows queued before this change renderable: they simply render the
 * summary they always did, instead of walking to failed_permanent.
 */
function lineBlock(payload: Record<string, unknown>): string[] {
  const raw = payload.lines;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const rendered: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const line = entry as Record<string, unknown>;
    const name = text(line.productName);
    if (name === "") continue;
    const spec = text(line.specification);
    const quantity = count(line.quantity);
    const unit = amount(line.unitPriceCents);
    const total = amount(line.lineEstimateCents);
    const parts = [spec === "" ? name : `${name} — ${spec}`];
    if (quantity !== null) parts.push(`qty ${quantity}`);
    // An unpriced line is truthful about being unpriced. It is never rendered
    // as $0.00, which would read as free.
    parts.push(unit === null ? "price on request" : `${unit} each`);
    if (total !== null) parts.push(`${total} line total`);
    rendered.push(`  - ${parts.join(" | ")}`);
  }
  if (rendered.length === 0) return [];
  return ["Items:", ...rendered];
}

/**
 * The affiliate attribution, for the ADMIN email only.
 *
 * Two different facts, never merged. `affiliateAttributionRef` is
 * server-verified from the signed attribution cookie. `declaredAffiliateCode` is
 * a code the customer typed, which is a claim and nothing more until someone
 * matches it by hand — so it is labelled as unverified wherever it appears.
 * Saying "none" explicitly matters: a silent absence reads like a bug when an
 * affiliate insists they sent the customer.
 */
function affiliateLine(payload: Record<string, unknown>): string {
  const verified = text(payload.affiliateAttributionRef);
  const declared = text(payload.declaredAffiliateCode);
  if (verified === "" && declared === "") return "Affiliate: none recorded";
  const parts: string[] = [];
  if (verified !== "") parts.push(`verified ${verified}`);
  if (declared !== "") parts.push(`customer-entered "${declared}" (unverified)`);
  return `Affiliate: ${parts.join("; ")}`;
}

/** The next steps the receipt already computed, when the payload carries them. */
function nextStepBlock(payload: Record<string, unknown>): string[] {
  const raw = payload.nextSteps;
  if (!Array.isArray(raw)) return [];
  const steps = raw.map((step) => text(step)).filter((step) => step !== "");
  if (steps.length === 0) return [];
  return ["What happens next:", ...steps.map((step) => `  - ${step}`), ""];
}

/** Plain-language payment state. Unknown states say nothing rather than guess. */
function paymentSentence(payload: Record<string, unknown>): string {
  const state = text(payload.paymentState);
  if (state === "none_due_yet") {
    return "Payment status: nothing is due yet, and nothing is charged automatically.";
  }
  return "";
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
        ...lineBlock(payload),
        `Estimated value: ${money(payload.estimatedTotalCents)}`,
        paymentSentence(payload),
        ``,
        `A member of the Xenios team reviews every request personally. You will`,
        `hear from us about agreements, payment, and fulfillment. Nothing is`,
        `charged automatically.`,
        ``,
        ...nextStepBlock(payload),
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
        ...lineBlock(payload),
        `Estimated value: ${money(payload.estimatedTotalCents)}`,
        modes ? `Workflow: ${modes}` : "",
        paymentSentence(payload),
        affiliateLine(payload),
        ``,
        `Next action: review the request, confirm the agreements and pricing,`,
        `then issue payment instructions from the admin screen.`,
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
