/**
 * Private Early Access: turning an `eac_` handle into a legally identified
 * signer.
 *
 * WHY THIS FILE EXISTS
 *
 * An `eac_` customer reference proves browser or roster continuity. It is a
 * truncated sha-256 of either a roster row id, a continuity cookie token, or a
 * session id. None of those is a person. The signature engine, correctly,
 * refuses to record anything else: SignatureRecord.memberId is documented as
 * "the ONLY identity a signature can carry", there is no signing-on-behalf
 * input, and none may be added.
 *
 * So an Early Access customer cannot sign as themselves until a durable,
 * verified binding exists between the handle they carry and a real
 * research_members row. This file is that binding and its resolution rules. It
 * creates no member, verifies no email and mints no identity: member creation
 * and email proof already exist in members.ts (an admin-approved application
 * plus a signed claim-purpose token, which is what proves email ownership).
 * This module only records and checks the join.
 *
 * WHAT IT WILL NOT DO
 *
 * It will not infer a binding. A handle that merely looks like it belongs to
 * the same human, because the display name matches or the email was typed into
 * a box, is not a binding. Weak provenance refuses. An unbound handle refuses.
 * A handle already bound to a different member refuses rather than rebinding,
 * because rebinding would let a second person inherit the first person's
 * signatures and orders.
 *
 * THE INVARIANT THIS FILE EXISTS TO HOLD
 *
 * Another customer or member can never satisfy an order. Ownership of the
 * checkout and identity of the signer are checked as one act, against the same
 * resolved binding, so a valid member signature attached to someone else's
 * checkout is a refusal and not a completion.
 */

/**
 * How the Early Access identity layer says it knows this customer.
 *
 * These are the existing values on EarlyAccessCustomer.boundBy. `verified_link`
 * and `session_code` mean the customer redeemed something only the mailbox
 * owner could hold. `email_entry` means someone typed an address, which is a
 * claim rather than proof.
 */
export type EarlyAccessBoundBy = "email_entry" | "verified_link" | "session_code";

/** Provenance strong enough to hang a legal signature on. */
export const SIGNING_GRADE_PROVENANCE: readonly EarlyAccessBoundBy[] = Object.freeze([
  "verified_link",
  "session_code",
]);

export function isSigningGradeProvenance(
  boundBy: EarlyAccessBoundBy | null | undefined,
): boolean {
  return boundBy !== null && boundBy !== undefined && SIGNING_GRADE_PROVENANCE.includes(boundBy);
}

/**
 * The resolved Early Access customer, normalized.
 *
 * The tree carries two shapes for the same fact: EarlyAccessCustomer.aliasRefs
 * in the routes layer and CartCustomer.aliases in the cart layer. This module
 * takes a normalized shape so it works against both without either lane having
 * to change its own vocabulary.
 */
export type EarlyAccessSignerCandidate = Readonly<{
  /** The primary handle. Roster-backed where a roster identity resolved. */
  customerRef: string;
  /** Server-derived alternates for the same human. Never read from a request. */
  aliasRefs?: readonly string[];
  boundBy?: EarlyAccessBoundBy;
}>;

/**
 * The durable join between an Early Access handle and a member.
 *
 * Append-only. A correction is a new record that supersedes, never an edit,
 * for the same reason the signature table refuses UPDATE: the question a year
 * from now is not who is bound today, it is who was bound at the moment the
 * paper was signed.
 */
export type EarlyAccessSignerBinding = Readonly<{
  /** The primary handle this binding is keyed on. */
  customerRef: string;
  /**
   * Every handle covered by this binding, primary included. Aliases are carried
   * on the binding so that a customer who later loses a continuity cookie still
   * resolves to the same member through the roster handle.
   */
  coveredRefs: readonly string[];
  /** research_members.id. */
  memberId: string;
  /** research_members.auth_user_id, carried so the join can be re-proven. */
  authUserId: string;
  /** The verified email on the member row at binding time. */
  memberEmail: string;
  /** How the binding was established. */
  verification: EarlyAccessBindingVerification;
  boundAt: string;
  /** Set when a later binding replaced this one. */
  supersededAt?: string | null;
}>;

/**
 * What proved the binding.
 *
 * `member_claim_token` means the same signed claim-purpose token that creates a
 * member proved the mailbox, and the Early Access handle was present in that
 * same authenticated request. `named_admin_review` is the manual path for an
 * existing checkout placed before any of this existed; it names the human who
 * reviewed it, because a manual join with no named reviewer is an unaccountable
 * assertion.
 */
export type EarlyAccessBindingVerification =
  | Readonly<{ method: "member_claim_token"; tokenPurpose: "account_claim" }>
  | Readonly<{ method: "named_admin_review"; reviewedBy: string; reference: string }>;

export interface EarlyAccessSignerBindingStore {
  /** The active binding covering this handle, or null. Primary or alias. */
  findByCustomerRef(customerRef: string): Promise<EarlyAccessSignerBinding | null>;
  /** The active binding for this member, or null. */
  findByMemberId(memberId: string): Promise<EarlyAccessSignerBinding | null>;
}

/** Resolves nothing, and says so. An unwired deployment signs nothing. */
export class NoEarlyAccessSignerBindingStore implements EarlyAccessSignerBindingStore {
  async findByCustomerRef(): Promise<EarlyAccessSignerBinding | null> {
    return null;
  }
  async findByMemberId(): Promise<EarlyAccessSignerBinding | null> {
    return null;
  }
}

export const SIGNER_RESOLUTION_REFUSALS = [
  /** No binding exists for any handle this customer holds. */
  "binding_required",
  /** A binding exists but the handle's provenance is not signing grade. */
  "binding_unverified",
  /** Two handles this customer holds resolve to different members. */
  "binding_conflict",
  /** The binding was superseded and no active one replaced it. */
  "binding_superseded",
  /** The checkout is owned by a handle this customer does not hold. */
  "checkout_not_owned",
  /** The checkout's owning handle resolves to a different member. */
  "foreign_member",
] as const;

export type SignerResolutionRefusal = (typeof SIGNER_RESOLUTION_REFUSALS)[number];

export type ResolvedSigner =
  | Readonly<{
      ok: true;
      memberId: string;
      authUserId: string;
      memberEmail: string;
      /** The handle the binding is keyed on. */
      customerRef: string;
      binding: EarlyAccessSignerBinding;
    }>
  | Readonly<{ ok: false; code: SignerResolutionRefusal; detail?: string }>;

function refuse(code: SignerResolutionRefusal, detail?: string): ResolvedSigner {
  return Object.freeze(detail === undefined ? { ok: false, code } : { ok: false, code, detail });
}

/** Every handle this customer holds: primary first, then server-derived aliases. */
export function handlesFor(candidate: EarlyAccessSignerCandidate): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ref of [candidate.customerRef, ...(candidate.aliasRefs ?? [])]) {
    if (typeof ref !== "string" || ref.length === 0) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push(ref);
  }
  return Object.freeze(out);
}

/**
 * Resolve the legally identified signer behind an Early Access customer.
 *
 * Every handle the customer holds is looked up, not just the primary, because a
 * customer whose roster identity resolved carries the roster handle as primary
 * and the continuity handle as an alias, and the binding may be keyed on either
 * depending on which existed first. If two handles resolve to different
 * members, that is a conflict and it refuses: silently preferring one would
 * pick whose signatures count.
 */
export async function resolveSigner(
  candidate: EarlyAccessSignerCandidate,
  store: EarlyAccessSignerBindingStore,
): Promise<ResolvedSigner> {
  const handles = handlesFor(candidate);
  if (handles.length === 0) return refuse("binding_required");

  const found: EarlyAccessSignerBinding[] = [];
  for (const ref of handles) {
    const binding = await store.findByCustomerRef(ref);
    if (binding) found.push(binding);
  }
  if (found.length === 0) return refuse("binding_required");

  const memberIds: string[] = [];
  for (const candidateBinding of found) {
    if (!memberIds.includes(candidateBinding.memberId)) memberIds.push(candidateBinding.memberId);
  }
  if (memberIds.length > 1) {
    return refuse("binding_conflict", [...memberIds].sort().join(","));
  }

  const active = found.filter((b) => !b.supersededAt);
  if (active.length === 0) return refuse("binding_superseded");

  // Provenance is checked AFTER a binding is found, so an unbound customer is
  // told to bind rather than told their provenance is weak. The two refusals
  // lead to different next steps and collapsing them would misdirect.
  if (!isSigningGradeProvenance(candidate.boundBy)) {
    return refuse("binding_unverified", candidate.boundBy ?? "absent");
  }

  const binding = active[0];
  return Object.freeze({
    ok: true,
    memberId: binding.memberId,
    authUserId: binding.authUserId,
    memberEmail: binding.memberEmail,
    customerRef: binding.customerRef,
    binding,
  } as const);
}

/**
 * Resolve the signer AND prove they own the checkout, as one act.
 *
 * Ownership is the existing rule (`[customerRef, ...aliases].includes(...)`),
 * applied here against the same candidate whose binding produced the member, so
 * the signature and the order can never come apart. A member who signed
 * everything still cannot satisfy a checkout that a different handle owns.
 */
export async function resolveSignerForCheckout(
  candidate: EarlyAccessSignerCandidate,
  checkoutCustomerRef: string,
  store: EarlyAccessSignerBindingStore,
): Promise<ResolvedSigner> {
  const handles = handlesFor(candidate);
  if (!handles.includes(checkoutCustomerRef)) return refuse("checkout_not_owned");

  const resolved = await resolveSigner(candidate, store);
  if (!resolved.ok) return resolved;

  // The handle that actually owns the checkout must resolve to the same member.
  // Holding the owning handle is not enough on its own: if that specific handle
  // carries a different binding, the person signing is not the person the order
  // belongs to.
  const owningBinding = await store.findByCustomerRef(checkoutCustomerRef);
  if (!owningBinding) return refuse("binding_required", checkoutCustomerRef);
  if (owningBinding.memberId !== resolved.memberId) {
    return refuse("foreign_member", checkoutCustomerRef);
  }
  return resolved;
}
