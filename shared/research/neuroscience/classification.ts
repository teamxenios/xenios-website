// xenios neuroscience: operating class, row verification, and surface routing.
//
// ---------------------------------------------------------------------------
// The problem this module solves
// ---------------------------------------------------------------------------
//
// The neuroscience opportunity map is a DISCOVERY list. It was assembled by
// looking at what exists in the world, including what a third party site
// (Scientific Sean) lists. A discovery list tells us what to go and check. It
// does not tell us what we may sell, who may supply it, what it costs, whether
// a prescriber is required, or whether it is available at all.
//
// So this module does two separate jobs and keeps them separate:
//
//   1. CLASSIFY. Put every row into exactly one operating class, using an
//      ordered, explicit rule set that fails closed to `investigational_held`.
//      Classification is cheap and can be done from the sheet.
//   2. VERIFY. Decide whether the row has row level evidence behind it. This
//      cannot be done from the sheet. Every imported row starts UNVERIFIED, and
//      an unverified row can never present as an offer, whatever its class.
//
// Building the capability without presenting an incomplete inventory as
// verified is the whole point. The catalog is complete in code and empty in
// evidence, and it says so.
//
// ---------------------------------------------------------------------------
// Routing convention
// ---------------------------------------------------------------------------
//
// This module invents no second routing convention. It reuses the two that
// already exist in this repository:
//
//   - `CARE_ROUTE_CONTRACTS.publicShell` from `@shared/care/contracts` for the
//     Care destination.
//   - `resolvePrivateLaneOfferMode` and `describeOfferMode` from
//     `@shared/research/catalog/offer-readiness` for what a Research surface may
//     say about buying something. That resolver pins the global commerce switch
//     to false, so direct checkout is structurally unreachable here.
//
// A `prescription_required_pathway` or `clinician_supervised_service` item
// routes to Care and never exposes a Research add to cart, verified or not.

import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  describeOfferMode,
  mayDisplayAmount as offerModeMayDisplayAmount,
  resolvePrivateLaneOfferMode,
  isSelfServePurchase,
  type CoaEvidenceState,
  type OfferAvailabilityMode,
  type OfferLane,
} from "@shared/research/catalog/offer-readiness";

// ---------------------------------------------------------------------------
// The operating classes
// ---------------------------------------------------------------------------

/**
 * The complete, closed set of operating classes. No class outside this list
 * exists, and nothing here was invented for convenience.
 */
export const NEURO_OPERATING_CLASSES = [
  "education",
  "consumer_wellness",
  "authorized_supplement",
  "research_material",
  "professional_assessment",
  "clinician_supervised_service",
  "prescription_required_pathway",
  "investigational_held",
] as const;

export type NeuroOperatingClass = (typeof NEURO_OPERATING_CLASSES)[number];

/**
 * The classes the build directive requires to route to Care with no Research
 * add to cart, ever.
 */
export const CARE_MANDATED_CLASSES = [
  "prescription_required_pathway",
  "clinician_supervised_service",
] as const;

/**
 * A professional assessment is delivered by a person, not shipped, so it routes
 * to Care as well. Kept in its own list so the mandated pair above stays
 * exactly what the directive names.
 */
export const CARE_ROUTED_SERVICE_CLASSES = ["professional_assessment"] as const;

const CARE_ROUTED: ReadonlySet<NeuroOperatingClass> = new Set<NeuroOperatingClass>([
  ...CARE_MANDATED_CLASSES,
  ...CARE_ROUTED_SERVICE_CLASSES,
]);

export function isCareRoutedClass(operatingClass: NeuroOperatingClass): boolean {
  return CARE_ROUTED.has(operatingClass);
}

/** The classes that can, with enough evidence, become a Research offer. */
const OFFERABLE_CLASSES: ReadonlySet<NeuroOperatingClass> = new Set<NeuroOperatingClass>([
  "consumer_wellness",
  "authorized_supplement",
  "research_material",
]);

/** The offer lane each offerable class resolves through. */
const CLASS_OFFER_LANE: Readonly<Partial<Record<NeuroOperatingClass, OfferLane>>> = {
  consumer_wellness: "supplement",
  authorized_supplement: "supplement",
  research_material: "research_material",
};

// ---------------------------------------------------------------------------
// Row level verification
// ---------------------------------------------------------------------------

/**
 * The six things that have to be established, per row, before a discovery entry
 * is anything more than a lead. Named directly after the build directive:
 * exact products, services, rights, prescriber requirements, source, price, and
 * availability.
 */
export const NEURO_VERIFICATION_INPUTS = [
  "exact_product_or_service",
  "rights_to_offer",
  "prescriber_requirement",
  "source",
  "approved_customer_amount",
  "availability",
] as const;

export type NeuroVerificationInput = (typeof NEURO_VERIFICATION_INPUTS)[number];

/**
 * A pointer to the document that settled one input.
 *
 * There is no free text "notes" field on purpose. Evidence is a document
 * somebody recorded, not a sentence somebody wrote.
 */
export interface EvidenceReference {
  readonly documentId: string;
  readonly recordedBy: string;
  /** ISO 8601 date. */
  readonly recordedAt: string;
}

export type NeuroVerification = Readonly<Record<NeuroVerificationInput, EvidenceReference | null>>;

/** The state every imported discovery row starts in. Nothing is established. */
export const UNVERIFIED: NeuroVerification = Object.freeze(
  Object.fromEntries(NEURO_VERIFICATION_INPUTS.map((input) => [input, null])),
) as NeuroVerification;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/;

function isEvidence(reference: EvidenceReference | null): reference is EvidenceReference {
  if (reference === null) return false;
  if (typeof reference.documentId !== "string" || reference.documentId.trim().length === 0) return false;
  if (typeof reference.recordedBy !== "string" || reference.recordedBy.trim().length === 0) return false;
  if (typeof reference.recordedAt !== "string" || !ISO_DATE.test(reference.recordedAt.trim())) return false;
  return true;
}

/** The inputs still outstanding on a row, by name. */
export function missingVerificationInputs(
  verification: NeuroVerification,
): readonly NeuroVerificationInput[] {
  return NEURO_VERIFICATION_INPUTS.filter((input) => !isEvidence(verification[input]));
}

/** A row is verified only when every one of the six inputs has a real document behind it. */
export function isRowVerified(verification: NeuroVerification): boolean {
  return missingVerificationInputs(verification).length === 0;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface NeuroClassificationInput {
  /** The workbook's "Class" column, verbatim. */
  readonly sourceClass: string;
  /** The workbook's "Xenios Route" column, verbatim. */
  readonly sourceRoute: string;
  /** The workbook's "Lane / Status" column, verbatim. */
  readonly sourceLane: string;
}

export interface NeuroClassification {
  readonly operatingClass: NeuroOperatingClass;
  /** Which rule decided it, so a surprising row can be traced without guessing. */
  readonly ruleId: string;
}

function norm(value: string): string {
  return (value ?? "").toLowerCase().trim();
}

/**
 * The ordered rule set.
 *
 * Order is load bearing. The hold rules run first, so a row that says "held" in
 * its lane can never be lifted into an offerable class by a later rule that
 * matches its route. Anything the rules do not recognise falls through to
 * `investigational_held`, which is the fail closed outcome: not presentable,
 * not purchasable, waiting on a human.
 */
export function classifyNeuroRow(input: NeuroClassificationInput): NeuroClassification {
  const lane = norm(input.sourceLane);
  const route = norm(input.sourceRoute);
  const cls = norm(input.sourceClass);

  // 1. Explicit holds. "Held", "Investigational" as a lane of its own, or a
  //    route that says do not pursue, or a clinical development watch.
  if (
    lane === "held" ||
    lane === "investigational" ||
    lane.includes("held") ||
    route.startsWith("do not pursue") ||
    route.includes("clinical-development watch")
  ) {
    return { operatingClass: "investigational_held", ruleId: "NEU-RULE-01-HELD" };
  }

  // 2. Prescription pathways. A prescriber is required, so this is a Care route
  //    with no Research purchase of any kind.
  //
  //    The class test is deliberately narrow. `cls.startsWith("prescription")`
  //    and the Schedule II test catch a row whose class IS a prescription class.
  //    A looser `includes("prescription")` would sweep in "Research / prescription
  //    abroad" and "Supplement / prescription by country", where the workbook's own
  //    route puts the row on the Research or supplement rail and the open question
  //    is jurisdiction. That question is one of the six verification inputs
  //    (`prescriber_requirement`), so it is answered by verification, not by
  //    reclassifying the row on a substring match.
  if (
    lane === "prescription required" ||
    route.includes("lawful pharmacy") ||
    route.includes("controlled-telemedicine") ||
    route.includes("controlled status") ||
    cls.startsWith("prescription") ||
    cls.includes("schedule ii")
  ) {
    return { operatingClass: "prescription_required_pathway", ruleId: "NEU-RULE-02-PRESCRIPTION" };
  }

  // 3. Services a clinician orders, performs, or reviews.
  if (
    route.includes("clinician-ordered") ||
    route.includes("licensed professional evaluation") ||
    route.includes("licensed workflow") ||
    route.includes("professional referral")
  ) {
    return { operatingClass: "clinician_supervised_service", ruleId: "NEU-RULE-03-CLINICIAN-SERVICE" };
  }

  // 4. Assessments delivered by a professional.
  if (
    route.includes("professional assessment service") ||
    route.includes("validated wellness assessment")
  ) {
    return { operatingClass: "professional_assessment", ruleId: "NEU-RULE-04-ASSESSMENT" };
  }

  // 5. The Qualified Research rail.
  if (route.startsWith("qualified research")) {
    return { operatingClass: "research_material", ruleId: "NEU-RULE-05-RESEARCH" };
  }

  // 6. Authorized supplements.
  if (route.startsWith("authorized supplement")) {
    return { operatingClass: "authorized_supplement", ruleId: "NEU-RULE-06-SUPPLEMENT" };
  }

  // 7. Education first entries.
  if (route.startsWith("education")) {
    return { operatingClass: "education", ruleId: "NEU-RULE-07-EDUCATION" };
  }

  // 8. Consumer wellness, only where the sheet states a public wellness lane and
  //    no stronger rule above claimed the row.
  if (lane === "public wellness") {
    return { operatingClass: "consumer_wellness", ruleId: "NEU-RULE-08-CONSUMER-WELLNESS" };
  }

  // 9. Fail closed. A multi rail row, a bare "product review", or anything the
  //    rules do not recognise is held. It is not an offer and it is not a guess.
  return { operatingClass: "investigational_held", ruleId: "NEU-RULE-09-FAIL-CLOSED" };
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export interface NeuroRecord {
  readonly id: string;
  readonly item: string;
  /** The three workbook columns, kept verbatim so a classification can be audited. */
  readonly sourceClass: string;
  readonly sourceRoute: string;
  readonly sourceLane: string;
  readonly operatingClass: NeuroOperatingClass;
  readonly classificationRuleId: string;
  /** Where the row came from. A discovery source is a lead, not a supplier. */
  readonly discoverySource: string;
  /** The professional or reviewer the workbook says this row needs. */
  readonly requiredProfessionalReview: string;
  /** The workbook's public boundary sentence, kept verbatim. */
  readonly publicBoundary: string;
  readonly verification: NeuroVerification;
  /** Founder approved customer amount in integer cents. Null until approved. */
  readonly approvedCustomerAmountCents: number | null;
  readonly supplierSkuCode: string | null;
  readonly internalVariantSku: string | null;
  readonly coaEvidence: CoaEvidenceState;
  readonly unavailable: boolean;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export const NEURO_SURFACES = ["research", "care", "education", "internal_only"] as const;
export type NeuroSurface = (typeof NEURO_SURFACES)[number];

export interface NeuroPresentation {
  readonly surface: NeuroSurface;
  /** The Care destination, or null when the item does not route to Care. */
  readonly careRoute: string | null;
  /** Whether a Research surface may show an add to cart control. */
  readonly addToCart: boolean;
  /** The offer mode, only on the Research surface. Null everywhere else. */
  readonly offerMode: OfferAvailabilityMode | null;
  /** Whether a member may see an amount. False whenever there is no approved amount. */
  readonly mayDisplayAmount: boolean;
  /** The exact sentence a surface may show. Never a price, never "$0". */
  readonly label: string;
  /** Plain language reasons, for operations. */
  readonly reasons: readonly string[];
}

const NOT_AVAILABLE = "Not currently available";

/**
 * The single resolver every surface calls.
 *
 * Ordered so that each step can only weaken the outcome:
 *   1. Care routed classes leave immediately, with add to cart false.
 *   2. Held classes are never presented.
 *   3. Education is presented without commerce.
 *   4. An unverified row is display only, whatever its class.
 *   5. Only a verified, offerable row reaches the existing offer resolver, and
 *      that resolver pins direct checkout off.
 */
export function resolveNeuroPresentation(record: NeuroRecord): NeuroPresentation {
  const missing = missingVerificationInputs(record.verification);
  const verified = missing.length === 0;

  if (isCareRoutedClass(record.operatingClass)) {
    const reasons = [
      record.operatingClass === "prescription_required_pathway"
        ? "A prescriber is required, so this is a Care pathway and never a Research purchase."
        : "This is delivered by a licensed professional, so it is a Care pathway and never a Research purchase.",
    ];
    if (!verified) {
      reasons.push(`Row verification is outstanding: ${missing.join(", ")}.`);
    }
    return {
      surface: "care",
      careRoute: CARE_ROUTE_CONTRACTS.publicShell,
      addToCart: false,
      offerMode: null,
      mayDisplayAmount: false,
      label: "Speak with a licensed professional",
      reasons,
    };
  }

  if (record.operatingClass === "investigational_held") {
    return {
      surface: "internal_only",
      careRoute: null,
      addToCart: false,
      offerMode: null,
      mayDisplayAmount: false,
      label: NOT_AVAILABLE,
      reasons: [
        "The row is held. Its operating class is not settled, so it is not presented on any customer surface.",
      ],
    };
  }

  if (record.operatingClass === "education") {
    return {
      surface: "education",
      careRoute: null,
      addToCart: false,
      offerMode: null,
      mayDisplayAmount: false,
      label: "Education only",
      reasons: ["Education content carries no offer and no commerce control."],
    };
  }

  if (!verified) {
    return {
      surface: "research",
      careRoute: null,
      addToCart: false,
      offerMode: "DISPLAY_ONLY",
      mayDisplayAmount: false,
      label: NOT_AVAILABLE,
      reasons: [
        "This row came from a discovery source and has not been verified row by row.",
        `Outstanding verification: ${missing.join(", ")}.`,
      ],
    };
  }

  const lane = CLASS_OFFER_LANE[record.operatingClass];
  /* c8 ignore next 3 -- unreachable: every offerable class has a lane, asserted in tests */
  if (lane === undefined) {
    return {
      surface: "internal_only",
      careRoute: null,
      addToCart: false,
      offerMode: null,
      mayDisplayAmount: false,
      label: NOT_AVAILABLE,
      reasons: ["No offer lane is mapped for this operating class."],
    };
  }

  const mode = resolvePrivateLaneOfferMode({
    lane,
    approvedMemberAmountCents: record.approvedCustomerAmountCents,
    supplierSkuCode: record.supplierSkuCode,
    internalVariantSku: record.internalVariantSku,
    coaEvidence: record.coaEvidence,
    unavailable: record.unavailable,
  });

  return {
    surface: "research",
    careRoute: null,
    addToCart: isSelfServePurchase(mode),
    offerMode: mode,
    mayDisplayAmount: offerModeMayDisplayAmount(mode),
    label: describeOfferMode(mode),
    reasons: ["Row verification is complete. The offer mode comes from the shared offer resolver."],
  };
}

/**
 * Whether a row may present as an offer at all.
 *
 * An offer means a surface shows a member something they can ask to buy. A
 * display only card is not an offer.
 */
export function mayPresentAsOffer(record: NeuroRecord): boolean {
  if (!OFFERABLE_CLASSES.has(record.operatingClass)) return false;
  if (!isRowVerified(record.verification)) return false;
  const presentation = resolveNeuroPresentation(record);
  if (presentation.surface !== "research") return false;
  return presentation.offerMode === "DIRECT_PRIVATE_PURCHASE" ||
    presentation.offerMode === "APPROVAL_REQUIRED_PURCHASE" ||
    presentation.offerMode === "REQUEST_ACCESS_ONLY";
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface NeuroStateCounts {
  readonly total: number;
  readonly byOperatingClass: Readonly<Record<NeuroOperatingClass, number>>;
  readonly bySurface: Readonly<Record<NeuroSurface, number>>;
  readonly verified: number;
  readonly unverified: number;
  readonly presentableAsOffer: number;
  readonly withAddToCart: number;
}

export function countNeuroStates(records: readonly NeuroRecord[]): NeuroStateCounts {
  const byOperatingClass = Object.fromEntries(
    NEURO_OPERATING_CLASSES.map((value) => [value, 0]),
  ) as Record<NeuroOperatingClass, number>;
  const bySurface = Object.fromEntries(NEURO_SURFACES.map((value) => [value, 0])) as Record<
    NeuroSurface,
    number
  >;

  let verified = 0;
  let presentableAsOffer = 0;
  let withAddToCart = 0;

  for (const record of records) {
    byOperatingClass[record.operatingClass] += 1;
    const presentation = resolveNeuroPresentation(record);
    bySurface[presentation.surface] += 1;
    if (isRowVerified(record.verification)) verified += 1;
    if (mayPresentAsOffer(record)) presentableAsOffer += 1;
    if (presentation.addToCart) withAddToCart += 1;
  }

  return {
    total: records.length,
    byOperatingClass,
    bySurface,
    verified,
    unverified: records.length - verified,
    presentableAsOffer,
    withAddToCart,
  };
}
