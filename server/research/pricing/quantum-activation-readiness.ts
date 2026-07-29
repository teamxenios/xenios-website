/**
 * Quantum activation readiness: the deterministic checker for founder
 * decision QNT-001 (Quantum, one vial, member, USD 180000 cents).
 *
 * This module answers exactly one question: are all the facts in place for
 * the release manager to activate the QNT-001 member price through the
 * protected approval flow? It never activates anything. There is no
 * execution function here, and the eligible verdict is deliberately named
 * ELIGIBLE_PENDING_PROTECTED_APPROVAL: eligibility is a fact report, not an
 * action. Production mutation goes only through the SECURITY DEFINER RPCs
 * research_admin_create_product_price and
 * research_admin_approve_product_price (supabase migration
 * 20260726143000_research_product_control_center.sql).
 *
 * Identity rule: canonical resolution requires the exact product_id and the
 * exact variant_id. Name matching ("Quantum", "1 vial") is never authoritative
 * evidence on its own. Today's repo truth: Quantum exists only as a legacy
 * in-code record (server/research/products-data.ts, priceCents null), with no
 * research_products row and no variant, so QNT-001 is BLOCKED with the
 * canonical product row and the one-vial variant as the missing facts.
 */

import type {
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import type { PricingProductSource } from "./authoritative-price-resolver";
import type { PriceDecisionRow } from "./price-decision-import";

export const QUANTUM_DECISION_ID = "QNT-001";

/** The exact approved facts of QNT-001. Anything else is a mismatch. */
export const QUANTUM_EXPECTED = {
  audience: "member",
  currency: "USD",
  amountCents: 180000,
} as const;

/**
 * The closed list of facts the readiness sequence can find missing, in the
 * order the sequence checks them. A BLOCKED verdict lists exactly the facts
 * that are missing, nothing vaguer.
 */
export const QUANTUM_MISSING_FACTS = [
  "founder approval (decision_status APPROVED)",
  "decision identity QNT-001",
  "audience member",
  "currency USD",
  "amount 180000 cents",
  "approval note referencing QNT-001",
  "canonical product row",
  "product published",
  "product active",
  "one-vial variant",
  "variant approved",
  "variant active",
  "member eligibility",
  "no overlapping approved member USD price",
] as const;

export type QuantumMissingFact = (typeof QUANTUM_MISSING_FACTS)[number];

/**
 * The exact price row the protected approval flow would create. A preview,
 * never an instruction this module can carry out.
 */
export interface QuantumPriceRowPreview {
  decisionId: typeof QUANTUM_DECISION_ID;
  productId: string;
  variantId: string;
  audience: typeof QUANTUM_EXPECTED.audience;
  amountCents: typeof QUANTUM_EXPECTED.amountCents;
  currency: typeof QUANTUM_EXPECTED.currency;
  effectiveAt: string | null;
  expiresAt: string | null;
  approvalNote: string;
  /** The only path that may ever create this row. */
  mutationPath: "release_manager_protected_approval";
}

export type QuantumActivationAssessment =
  | {
      verdict: "ELIGIBLE_PENDING_PROTECTED_APPROVAL";
      rowPreview: QuantumPriceRowPreview;
      /** Always false. This module cannot execute anything. */
      autoExecution: false;
    }
  | {
      verdict: "BLOCKED";
      missing: QuantumMissingFact[];
      /** Always false. This module cannot execute anything. */
      autoExecution: false;
    };

export interface QuantumActivationInput {
  /**
   * The injected Product Control read seam. Pass null when readers are
   * unavailable; the canonical product row is then a missing fact.
   */
  source: PricingProductSource | null;
  /** The founder decision row, already validated by the import module. */
  decision: PriceDecisionRow;
  /** The reference instant for the overlap check. Strict ISO-8601. */
  evaluatedAt: string;
}

interface Window {
  start: number;
  end: number;
}

function decisionWindow(
  decision: PriceDecisionRow,
  fallbackStart: number,
): Window {
  const start =
    decision.effectiveAt === null
      ? fallbackStart
      : (parseProductControlTimestamp(decision.effectiveAt) ?? fallbackStart);
  const end =
    decision.expiresAt === null
      ? Number.POSITIVE_INFINITY
      : (parseProductControlTimestamp(decision.expiresAt) ??
        Number.POSITIVE_INFINITY);
  return { start, end };
}

/**
 * A stored price counts as approved effective when it carries approval facts
 * and is active or approved awaiting activation. An unparseable stored window
 * overlaps conservatively: this checker fails closed, never open.
 */
function overlapsApprovedMemberUsdPrice(
  prices: readonly AdminProductPrice[],
  window: Window,
  productId: string,
  variantId: string,
): boolean {
  return prices.some((price) => {
    if (
      price.productId !== productId ||
      price.variantId !== variantId ||
      price.audience !== QUANTUM_EXPECTED.audience ||
      price.currency !== QUANTUM_EXPECTED.currency
    ) {
      return false;
    }
    if (price.status !== "active" && price.status !== "approved") return false;
    if (!price.approvedBy) return false;
    const start = parseProductControlTimestamp(price.effectiveAt);
    if (start === null) return true;
    if (price.expiresAt === null) {
      return window.end > start;
    }
    const end = parseProductControlTimestamp(price.expiresAt);
    if (end === null) return true;
    return start < window.end && window.start < end;
  });
}

/**
 * Run the exact readiness sequence for QNT-001 and report every missing
 * fact. Read-only. Never executes, schedules, or recommends bypassing the
 * protected approval flow.
 */
export async function assessQuantumActivation(
  input: QuantumActivationInput,
): Promise<QuantumActivationAssessment> {
  const at = parseProductControlTimestamp(input.evaluatedAt);
  if (at === null) {
    throw new RangeError(
      "evaluatedAt must be a strict ISO-8601 timestamp with a zone",
    );
  }

  const decision = input.decision;
  const missing = new Set<QuantumMissingFact>();

  // The decision itself must be the approved QNT-001 in its exact terms.
  if (decision.decisionStatus !== "APPROVED") {
    missing.add("founder approval (decision_status APPROVED)");
  }
  if (decision.decisionId !== QUANTUM_DECISION_ID) {
    missing.add("decision identity QNT-001");
  }
  if (decision.audience !== QUANTUM_EXPECTED.audience) {
    missing.add("audience member");
  }
  if (decision.currency !== QUANTUM_EXPECTED.currency) {
    missing.add("currency USD");
  }
  if (decision.amountCents !== QUANTUM_EXPECTED.amountCents) {
    missing.add("amount 180000 cents");
  }
  if (!decision.approvalNote.includes(QUANTUM_DECISION_ID)) {
    missing.add("approval note referencing QNT-001");
  }

  // Canonical product: exact product_id resolved against Product Control.
  // The product_name saying "Quantum" is never sufficient on its own.
  const product =
    decision.productId !== null && input.source !== null
      ? await input.source.readProductForPricing(decision.productId)
      : null;
  if (product === null || product.id !== decision.productId) {
    missing.add("canonical product row");
  } else {
    if (product.status !== "published") missing.add("product published");
    if (!product.active) missing.add("product active");
  }

  // Exact one-vial variant: exact variant_id on the resolved product.
  let variant: AdminProductVariant | null = null;
  if (decision.variantId === null || product === null) {
    missing.add("one-vial variant");
  } else {
    const matches = product.variants.filter(
      (candidate: AdminProductVariant) =>
        candidate.id === decision.variantId &&
        candidate.productId === product.id,
    );
    if (matches.length !== 1) {
      missing.add("one-vial variant");
    } else {
      variant = matches[0];
      if (variant.status !== "approved") missing.add("variant approved");
      if (!variant.active) missing.add("variant active");
      if (!variant.memberEligible) missing.add("member eligibility");
    }
  }

  // No overlapping approved effective member USD price for this identity.
  if (product !== null && variant !== null) {
    const window = decisionWindow(decision, at);
    if (
      overlapsApprovedMemberUsdPrice(
        product.prices,
        window,
        product.id,
        variant.id,
      )
    ) {
      missing.add("no overlapping approved member USD price");
    }
  }

  if (missing.size > 0) {
    return {
      verdict: "BLOCKED",
      missing: QUANTUM_MISSING_FACTS.filter((fact) => missing.has(fact)),
      autoExecution: false,
    };
  }

  return {
    verdict: "ELIGIBLE_PENDING_PROTECTED_APPROVAL",
    rowPreview: {
      decisionId: QUANTUM_DECISION_ID,
      productId: decision.productId as string,
      variantId: decision.variantId as string,
      audience: QUANTUM_EXPECTED.audience,
      amountCents: QUANTUM_EXPECTED.amountCents,
      currency: QUANTUM_EXPECTED.currency,
      effectiveAt: decision.effectiveAt,
      expiresAt: decision.expiresAt,
      approvalNote: decision.approvalNote,
      mutationPath: "release_manager_protected_approval",
    },
    autoExecution: false,
  };
}
