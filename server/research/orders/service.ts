// The canonical order service: the seam the composition root wires.
//
// Three transaction families can become an order, and each arrives with its
// own vocabulary. Rather than teach the domain three dialects, each family
// gets a named entry point here that translates its facts into ONE conversion
// input. The domain below stays single-dialect, and a fourth family later is
// a fourth function here rather than a fourth branch inside the domain.
//
// What this file deliberately does NOT do:
//
//   - It does not read the assisted-order, Early Access or cart stores. The
//     caller passes the facts it already holds. That keeps this lane free of
//     any dependency on modules other lanes own, and it means no conversion
//     can happen as a side effect of a read.
//   - It does not decide that money arrived. Payment evidence is produced by
//     the manual verification lane and passed in; this service only refuses
//     to mint a paid order without it.
//   - It does not accept a quote. Acceptance belongs to the quote engine,
//     which mints the acceptanceId this service consumes as evidence.

import {
  convertToCanonicalOrder,
  createMemberCanonicalOrderHistory,
  recordCanonicalFulfillmentEvent,
  recordCanonicalPaymentVerified,
  type CanonicalFulfillmentEventInput,
  type CanonicalOrderActor,
  type CanonicalOrderAcceptanceEvidence,
  type CanonicalOrderAttribution,
  type CanonicalOrderBindingsPort,
  type CanonicalOrderConversionInput,
  type CanonicalOrderConversionResult,
  type CanonicalOrderMutationResult,
  type CanonicalOrderPaymentEvidence,
  type CanonicalOrderRepository,
  type CanonicalOrderShippingSnapshot,
  type MemberCanonicalOrderHistory,
} from "./canonical-order";
import type { CanonicalOrderView } from "@shared/research/orders/canonical-order";

/** The facts every conversion carries, whatever family it came from. */
interface CommonConversionFacts {
  customerRef: string;
  memberId?: string | null;
  organizationRef?: string | null;
  attribution?: CanonicalOrderAttribution | null;
  shipping: CanonicalOrderShippingSnapshot;
  lines: CanonicalOrderConversionInput["lines"];
  shippingCents: number;
  expectedTotalCents: number;
  placedAt: string;
  convertedBy: CanonicalOrderActor;
  at: Date;
}

/**
 * An accepted quote on an assisted research request.
 *
 * Payment is OPTIONAL here and that is the point: an accepted quote is a
 * genuine order the customer owes money on, and it converts into an
 * `awaiting_payment` canonical order. It becomes `paid` later, through
 * `markPaymentVerified`, when the manual verification lane produces evidence.
 * Nothing in between can shortcut that.
 */
export interface AssistedRequestConversion extends CommonConversionFacts {
  requestRef: string;
  acceptance: CanonicalOrderAcceptanceEvidence;
  payment?: CanonicalOrderPaymentEvidence | null;
}

/** An Early Access single-product placement whose payment was verified. */
export interface EarlyAccessPlacementConversion extends CommonConversionFacts {
  orderNumber: string;
  payment: CanonicalOrderPaymentEvidence;
}

/** An Early Access cart checkout that settled. */
export interface EarlyAccessCartConversion extends CommonConversionFacts {
  cartCheckoutNumber: string;
  payment: CanonicalOrderPaymentEvidence;
}

export interface CanonicalOrderService {
  /** XRR- request + accepted quote -> canonical order. */
  convertAcceptedAssistedRequest(
    input: AssistedRequestConversion,
  ): Promise<CanonicalOrderConversionResult>;
  /** XEA- placement with verified payment -> canonical order. */
  convertEarlyAccessPlacement(
    input: EarlyAccessPlacementConversion,
  ): Promise<CanonicalOrderConversionResult>;
  /** XEC- settled cart checkout -> canonical order. */
  convertEarlyAccessCartCheckout(
    input: EarlyAccessCartConversion,
  ): Promise<CanonicalOrderConversionResult>;
  /** Records verified payment against an already-converted order. */
  markPaymentVerified(
    orderNumber: string,
    evidence: CanonicalOrderPaymentEvidence,
    actor: CanonicalOrderActor,
    at: Date,
  ): Promise<CanonicalOrderMutationResult>;
  /** Records a fulfillment event backed by real dispatch or carrier evidence. */
  recordFulfillment(
    orderNumber: string,
    event: CanonicalFulfillmentEventInput,
  ): Promise<CanonicalOrderMutationResult>;
  /** The customer's own history. Ownership-scoped; never a lookup-then-check. */
  listForMember(memberId: string): Promise<CanonicalOrderView[]>;
  getForMember(memberId: string, orderNumber: string): Promise<CanonicalOrderView | null>;
}

export interface CanonicalOrderServiceDeps {
  repository: CanonicalOrderRepository;
  bindings: CanonicalOrderBindingsPort;
}

export function createCanonicalOrderService(
  deps: CanonicalOrderServiceDeps,
): CanonicalOrderService {
  const history: MemberCanonicalOrderHistory = createMemberCanonicalOrderHistory({
    bindings: deps.bindings,
    repository: deps.repository,
  });

  function common(
    facts: CommonConversionFacts,
  ): Omit<CanonicalOrderConversionInput, "source" | "acceptance" | "payment"> {
    return {
      customer: { customerRef: facts.customerRef, memberId: facts.memberId ?? null },
      organizationRef: facts.organizationRef ?? null,
      attribution: facts.attribution ?? null,
      shipping: facts.shipping,
      lines: facts.lines,
      shippingCents: facts.shippingCents,
      expectedTotalCents: facts.expectedTotalCents,
      placedAt: facts.placedAt,
      convertedBy: facts.convertedBy,
      at: facts.at,
    };
  }

  return {
    convertAcceptedAssistedRequest(input) {
      return convertToCanonicalOrder(
        {
          ...common(input),
          source: {
            kind: "assisted_request_quote",
            // The request IS the source transaction for this family: the quote
            // lives inside it, and the accepted quote ref rides along as
            // evidence rather than as a second identity.
            sourceRef: input.requestRef,
            requestRef: input.requestRef,
          },
          acceptance: input.acceptance,
          payment: input.payment ?? null,
        },
        deps.repository,
      );
    },

    convertEarlyAccessPlacement(input) {
      return convertToCanonicalOrder(
        {
          ...common(input),
          source: {
            kind: "early_access_placement",
            sourceRef: input.orderNumber,
            requestRef: null,
          },
          acceptance: null,
          payment: input.payment,
        },
        deps.repository,
      );
    },

    convertEarlyAccessCartCheckout(input) {
      return convertToCanonicalOrder(
        {
          ...common(input),
          source: {
            kind: "early_access_cart_checkout",
            sourceRef: input.cartCheckoutNumber,
            requestRef: null,
          },
          acceptance: null,
          payment: input.payment,
        },
        deps.repository,
      );
    },

    markPaymentVerified(orderNumber, evidence, actor, at) {
      return recordCanonicalPaymentVerified(orderNumber, evidence, actor, at, deps.repository);
    },

    recordFulfillment(orderNumber, event) {
      return recordCanonicalFulfillmentEvent(orderNumber, event, deps.repository);
    },

    listForMember(memberId) {
      return history.listForMember(memberId);
    },

    getForMember(memberId, orderNumber) {
      return history.getForMember(memberId, orderNumber);
    },
  };
}
