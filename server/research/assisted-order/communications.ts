// Assisted-order outbox email rendering. The outbox worker refuses any
// template key it cannot render (unknown keys walk to failed_permanent), so
// these renderers must exist in the same change that enqueues the intents.
//
// PRIVACY BOUNDARY, ENFORCED AT RENDER TIME: each template reads an explicit
// allowlist of payload fields and ignores everything else. No identity
// document bytes or storage paths, no payment evidence, no supplier data, and
// no procurement economics — cost, margin, markup, multiplier — can reach any
// email even if a future payload accidentally carries them, because nothing
// here reads those fields.
//
// THE BOUNDARY IS NOT SYMMETRIC, deliberately (founder decision 2026-08-21).
// Payment automation is deferred: the founder fulfils these orders BY HAND and
// must be able to do it from the email alone, without opening the database. So
// the ADMIN template additionally renders phone, shipping address, accepted
// agreement versions and notes. The CUSTOMER template renders none of those —
// it has no reader for them — so extending the operator's view can never widen
// what is mailed to a customer.
//
// What stays out of BOTH, whatever the payload carries: procurement economics,
// identity-document bytes or paths, and payment evidence.

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

/**
 * The shipping address block, ADMIN ONLY.
 *
 * Read field by field rather than spread, so an address object that later
 * grows a field nobody reviewed cannot silently appear in an operator's inbox.
 * A partial address still renders what it has: an operator chasing a missing
 * postcode is better served by four correct lines than by silence.
 */
function shippingBlock(payload: Record<string, unknown>): string[] {
  const raw = payload.shippingAddress;
  if (typeof raw !== "object" || raw === null) return [];
  const address = raw as Record<string, unknown>;
  const line1 = text(address.line1);
  const line2 = text(address.line2);
  const city = text(address.city);
  const region = text(address.region);
  const postalCode = text(address.postalCode);
  const countryCode = text(address.countryCode);
  const lines = [line1, line2].filter((part) => part !== "");
  const locality = [city, region, postalCode].filter((part) => part !== "").join(", ");
  if (locality !== "") lines.push(locality);
  if (countryCode !== "") lines.push(countryCode);
  if (lines.length === 0) return [];
  return ["Ship to:", ...lines.map((part) => `  ${part}`)];
}

/**
 * Accepted agreements, ADMIN ONLY: what was accepted, at which exact published
 * version, and when. The version and the timestamp are what make this evidence
 * rather than a checkbox, so a row missing either is rendered as incomplete
 * instead of being quietly dropped.
 */
function agreementBlock(payload: Record<string, unknown>): string[] {
  const raw = payload.agreements;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const rendered: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const agreement = entry as Record<string, unknown>;
    const kind = text(agreement.kind);
    if (kind === "") continue;
    const version = text(agreement.version);
    const acceptedAt = text(agreement.acceptedAt);
    const detail = [
      version === "" ? "version not recorded" : `version ${version}`,
      acceptedAt === "" ? "time not recorded" : acceptedAt,
    ].join(" | ");
    rendered.push(`  - ${kind} (${detail})`);
  }
  if (rendered.length === 0) return [];
  return ["Agreements accepted:", ...rendered];
}

/** Customer notes, ADMIN ONLY: the general note and any per-line notes. */
function noteBlock(payload: Record<string, unknown>): string[] {
  const rendered: string[] = [];
  const general = text(payload.generalNotes);
  if (general !== "") rendered.push(`  ${general}`);
  const raw = payload.lines;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== "object" || entry === null) continue;
      const line = entry as Record<string, unknown>;
      const note = text(line.customerNotes);
      const name = text(line.productName);
      if (note === "") continue;
      rendered.push(`  ${name === "" ? "line" : name}: ${note}`);
    }
  }
  if (rendered.length === 0) return [];
  return ["Customer notes:", ...rendered];
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
      subject: `Order received — Xenios Research (${reference})`,
      text: [
        // "Order received" and nothing stronger. Never paid, confirmed,
        // reserved, in stock or shipped: at this moment the only true fact is
        // that the request arrived, and payment instructions are sent by hand
        // after a person checks availability.
        `Order received. Thank you.`,
        ``,
        `Reference: ${reference}`,
        lineCount !== null ? `Requested items: ${lineCount}` : "",
        ...lineBlock(payload),
        `Estimated value: ${money(payload.estimatedTotalCents)}`,
        paymentSentence(payload),
        ``,
        `A member of the Xenios team reviews every order personally. We will`,
        `email you to confirm availability and to send payment instructions.`,
        `Nothing is charged automatically, and your order is not confirmed or`,
        `shipped until we contact you.`,
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
        `Status: ${text(payload.orderStatusLabel) || "Order Received / Awaiting Manual Review"}`,
        ``,
        // Everything needed to fulfil by hand, in the order an operator uses
        // it: who, how to reach them, where it goes, what they asked for, what
        // it comes to, what they agreed to, what they said.
        `Customer: ${text(payload.fullLegalName)} <${text(payload.email)}>`,
        text(payload.mobilePhone) ? `Phone: ${text(payload.mobilePhone)}` : "Phone: not provided",
        text(payload.organizationName)
          ? `Organization: ${text(payload.organizationName)}`
          : null,
        ``,
        ...shippingBlock(payload),
        ``,
        lineCount !== null ? `Lines: ${lineCount}` : null,
        ...lineBlock(payload),
        `Order total: ${money(payload.estimatedTotalCents)}`,
        modes ? `Workflow: ${modes}` : null,
        paymentSentence(payload) || null,
        affiliateLine(payload),
        ``,
        ...agreementBlock(payload),
        ``,
        ...noteBlock(payload),
        ``,
        `Next action: confirm availability and pricing, then email the customer`,
        `payment instructions. Nothing is paid, reserved or shipped yet.`,
        ``,
        adminPath ? `Review: ${SITE_ORIGIN}${adminPath}` : null,
        // Only genuinely absent lines are dropped (null). Deliberate blank
        // lines survive, because a human reads this one by hand and an
        // unbroken wall of text is how a shipping address gets misread.
      ].filter((line): line is string => line !== null).join("\n"),
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
