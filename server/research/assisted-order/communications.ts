// Assisted-order outbox email rendering. The outbox worker refuses any
// template key it cannot render (unknown keys walk to failed_permanent), so
// these renderers must exist in the same change that enqueues the intents.
//
// PRIVACY BOUNDARY, ENFORCED AT RENDER TIME: each template reads an explicit
// allowlist of payload fields and ignores everything else. No identity
// document bytes or storage paths, no payment evidence, no supplier data, and
// no procurement economics can reach an email even if a future payload
// accidentally carries them.
//
// THE BOUNDARY IS NOT THE SAME FOR BOTH RECIPIENTS, and saying so precisely
// matters more than saying it strictly:
//
//   CUSTOMER templates carry the customer's OWN order and nothing operational.
//   No address is echoed back — the customer already knows where they live, and
//   echoing it adds a copy of their address to a forwardable channel for no
//   benefit. No admin link, no attribution, no internal status.
//
//   ADMIN templates carry the operational facts, INCLUDING the shipping address
//   and phone. That is a deliberate decision recorded at the payload site in
//   service.ts: the founder handles an order by replying to this email, and
//   "without those the operator has to open the database to answer a customer,
//   which is the thing this email exists to avoid". It goes only to the
//   configured admin address. An earlier version of this comment said no
//   address could reach ANY email; that predated the v2 admin payload, and it
//   left the renderer dropping fields the payload was deliberately built to
//   carry. Correcting the comment as well as the code, so the next reader is
//   not told the opposite of what the file does.
//
// What stays out of BOTH: wholesale cost, supplier price, margin, markup,
// multiplier, benchmark internals, credentials, document bytes.

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
 * The shipping address, ADMIN ONLY. Field by field from the canonical address
 * shape; an unrecognised key cannot reach the email because nothing reads it.
 * Returns an empty array when the payload carries no address (a v1 row), so
 * older queued rows keep rendering instead of walking to failed_permanent.
 */
function shippingBlock(payload: Record<string, unknown>): string[] {
  const raw = payload.shippingAddress;
  if (typeof raw !== "object" || raw === null) return [];
  const address = raw as Record<string, unknown>;
  const line1 = text(address.line1);
  const city = text(address.city);
  if (line1 === "" && city === "") return [];
  const region = text(address.region);
  const postalCode = text(address.postalCode);
  const countryCode = text(address.countryCode);
  const cityLine = [city, region, postalCode]
    .filter((part) => part !== "")
    .join(", ");
  return [
    "Ship to:",
    ...[line1, text(address.line2), cityLine, countryCode]
      .filter((part) => part !== "")
      .map((part) => `  ${part}`),
  ];
}

/**
 * The agreements the customer accepted, with EXACT versions. An operator
 * answering a compliance question needs the version, not the word "accepted",
 * so a bare kind with no version renders the kind and says the version is
 * unrecorded rather than implying one.
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
    rendered.push(`  - ${kind} ${version === "" ? "(version unrecorded)" : version}`);
  }
  if (rendered.length === 0) return [];
  const acceptedAt = text(payload.acceptedAt);
  return [
    acceptedAt === "" ? "Agreements accepted:" : `Agreements accepted ${acceptedAt}:`,
    ...rendered,
  ];
}

/**
 * The destination, for the CUSTOMER, as a summary rather than an address.
 *
 * The customer needs to be able to spot that they typed the wrong city or
 * country before Xenios ships, which is a real failure this catches early. They
 * do not need their own street address read back to them, and echoing it puts a
 * second copy of a home address into a forwardable channel for no benefit.
 *
 * So: city, region, country. Enough to notice "that is not where I meant",
 * not enough to be worth intercepting. The street lines stay admin-only.
 */
function destinationSummary(payload: Record<string, unknown>): string {
  const raw = payload.shippingAddress;
  if (typeof raw !== "object" || raw === null) return "";
  const address = raw as Record<string, unknown>;
  const summary = [
    text(address.city),
    text(address.region),
    text(address.countryCode),
  ].filter((part) => part !== "");
  return summary.length === 0 ? "" : `Shipping to: ${summary.join(", ")}`;
}

/** Anything the customer typed. Rendered verbatim, never interpreted. */
function customerNotesBlock(payload: Record<string, unknown>): string[] {
  const notes = text(payload.customerNotes);
  return notes === "" ? [] : ["Customer notes:", `  ${notes}`];
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
        `Order total: ${money(payload.estimatedTotalCents)}`,
        destinationSummary(payload),
        paymentSentence(payload),
        ``,
        // Deliberately careful wording. This email is sent the moment the
        // request persists, which is BEFORE anyone has checked availability and
        // before any money exists. So it may say received, and it may not imply
        // paid, confirmed, in stock, reserved or shipped — a customer who reads
        // "confirmed" here stops watching for the email that actually matters.
        `Status: Order received. We have not charged you and nothing is`,
        `reserved yet.`,
        ``,
        `A member of the Xenios team reviews every request personally. We will`,
        `email you to confirm availability and to send your payment`,
        `instructions. Payment is arranged with us directly; nothing is charged`,
        `automatically and no card is stored.`,
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
    // Everything an operator needs to handle this order by REPLYING to this
    // email, without opening the database. The payload already carried all of
    // it; this template previously read six of the fields and dropped the rest,
    // which is why the founder still had to open the admin screen for an
    // address or a phone number.
    const phone = text(payload.mobilePhone);
    const totalQuantity = count(payload.totalQuantity);
    const operatorStatus = text(payload.operatorStatus);
    return {
      subject: `New assisted order request ${reference}`,
      text: [
        `A new assisted order request needs review.`,
        ``,
        `Reference: ${reference}`,
        operatorStatus !== ""
          ? `Status: ${operatorStatus}`
          : `Status: Order received. Awaiting manual review.`,
        ``,
        `Customer: ${text(payload.fullLegalName)} <${text(payload.email)}>`,
        phone !== "" ? `Phone: ${phone}` : "",
        ...shippingBlock(payload),
        ``,
        lineCount !== null ? `Lines: ${lineCount}` : "",
        ...lineBlock(payload),
        totalQuantity !== null ? `Total units: ${totalQuantity}` : "",
        `Order total: ${money(payload.estimatedTotalCents)}`,
        modes ? `Workflow: ${modes}` : "",
        paymentSentence(payload),
        affiliateLine(payload),
        ``,
        ...agreementBlock(payload),
        ...customerNotesBlock(payload),
        ``,
        `Next action: review the request, confirm availability and pricing,`,
        `then email the customer their payment instructions.`,
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
