/**
 * An explicit hold on a row whose formulation we cannot state.
 *
 * WHY THIS EXISTS
 *
 * The founder's direct-order rule has four clauses: the research peptides
 * family, a confirmed RUO classification, a current retail price, and NO
 * EXPLICIT HOLD. The first three were enforced. The fourth existed nowhere in
 * the codebase.
 *
 * One row depends on it. `CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split
 * pending)` — workbook GRP-0422, $99 — is in the peptides family, is channelled
 * RUO Research, and carries an approved price. It therefore satisfies every
 * test the storefront applies, and would be offered as a direct purchase. Its
 * own specification says the component split is pending, and its recommended
 * action says the exact formulation must be confirmed before activation. We
 * would be selling a vial whose contents we cannot describe.
 *
 * That is why the founder's target is 111 direct and 1 blocked out of 112 RUO
 * peptide rows, and this module is the "1".
 *
 * WHY A DECLARATION AND NOT A PARSE
 *
 * The obvious implementation is to read the composition: split the
 * specification on "+" and hold any row whose components lack amounts. That
 * was measured against all 112 RUO rows and it holds FOUR, not one:
 *
 *   NAD+ 1000 mg                          "+" belongs to the molecule name
 *   NAD+ 500 mg                           same
 *   SEMAGLUTIDE+BPC-157 5 mg/650 mcg      composition IS stated, slash-formatted
 *   CJC-1295 WITH DAC + IPAMORELIN ...    the genuine one
 *
 * Refusing to sell NAD+ because its name contains a plus sign is exactly the
 * kind of confident, invisible wrongness this catalog has already been bitten
 * by. So the hold is taken from what the source DECLARES, never from what a
 * string appears to imply. If a row's formulation is unresolved, the workbook
 * says so in words, and those words survive into the canonical variant label
 * unchanged — all 135 peptide labels in the shipped artifact are exact copies
 * of their workbook specification.
 *
 * Adding a hold is therefore a data act, not a code act: mark the row in the
 * workbook and the storefront refuses it. Removing one is the same in reverse,
 * which is what makes this safe to unblock the moment the split is confirmed.
 */

/**
 * The phrases by which a source row declares that its own composition is not
 * yet settled. Matched case-insensitively against the declared specification.
 *
 * Deliberately narrow. Each entry must be a phrase that states pendency about
 * the FORMULATION itself — not about supplier paperwork, pricing, or
 * documentation, which are real but different holds with different owners. A
 * row can be awaiting a COA and still be exactly describable.
 */
export const FORMULATION_HOLD_MARKERS: readonly RegExp[] = Object.freeze([
  /\bsplit\s+pending\b/i,
  /\bcomponent\s+split\s+(is\s+)?(pending|unconfirmed|to\s+be\s+confirmed)\b/i,
  /\bformulation\s+pending\b/i,
  /\bcomposition\s+pending\b/i,
]);

export interface FormulationHold {
  /** The exact declared text that triggered the hold, for the audit trail. */
  declaredIn: string;
  /** Which authority held it: the reviewed record, or a declared marker. */
  source: "reviewed_record" | "declared_marker";
}

/**
 * Specifications compare on a normalized form, so incidental spacing or case
 * cannot let a held product through. The server reader normalizes the reviewed
 * record the same way.
 */
export function normalizeHeldSpecification(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * The hold a specification declares about itself, or null when it declares
 * none.
 *
 * A blank or absent specification is NOT a hold. An unstated specification is
 * a different defect — a row we know nothing about — and treating silence as a
 * declaration would let a data gap masquerade as a considered decision.
 */
export function declaredFormulationHold(
  specification: string | null | undefined,
  reviewedHolds?: ReadonlySet<string> | null,
): FormulationHold | null {
  if (typeof specification !== "string") return null;
  const trimmed = specification.trim();
  if (trimmed === "") return null;

  // The reviewed record first: it is what the founder actually decided, and it
  // survives the canonical rewrite that strips internal wording from a
  // customer-facing product name.
  if (reviewedHolds && reviewedHolds.has(normalizeHeldSpecification(trimmed))) {
    return { declaredIn: trimmed, source: "reviewed_record" };
  }

  // A declared marker still holds, for a raw workbook row that has not been
  // through reconciliation yet. This can only add a hold, never remove one.
  for (const marker of FORMULATION_HOLD_MARKERS) {
    if (marker.test(trimmed)) return { declaredIn: trimmed, source: "declared_marker" };
  }
  return null;
}

/** True when the row is held by the reviewed record or declares itself unresolved. */
export function isFormulationHeld(
  specification: string | null | undefined,
  reviewedHolds?: ReadonlySet<string> | null,
): boolean {
  return declaredFormulationHold(specification, reviewedHolds) !== null;
}
