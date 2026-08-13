import type { KrisPriceProfile } from "@shared/research/kris-launch-a/contract";

/**
 * Who is entitled to the KRIS_VOLUME_PARTNER price profile.
 *
 * WHY THIS IS NOT "the logged-in member sees Kris prices"
 * ------------------------------------------------------
 * The Kris workbook is a confidential partner price sheet. It is not consumer
 * pricing and it must never become consumer pricing by default. So entitlement
 * is explicit: a viewer resolves to a profile, or resolves to nothing and is
 * refused. There is no fallback profile, because a fallback would be exactly
 * the accident this guards against.
 *
 * WHY MEMBER ID IS PREFERRED OVER EMAIL
 * -------------------------------------
 * An email address is a routing detail. It can be changed, aliased, reassigned
 * inside an organization, or reused after an account closes, and none of those
 * should silently move a partner price sheet to someone else. The canonical
 * member id cannot.
 *
 * But the member id does not exist until the account is activated, and Launch A
 * has to work from the founder-confirmed address on day one. So the email is a
 * BOOTSTRAP, deliberately marked as one in the result. Once the member row
 * exists, configure the id: the id path wins, the email path stops being
 * consulted, and the binding stops depending on a mutable field.
 *
 * Both values are configuration rather than literals in a branch, so changing
 * who Kris is stays a reviewable change and never a code edit.
 */

export const KRIS_PARTNER_EMAIL_ENV_VAR = "XENIOS_KRIS_PARTNER_EMAIL";
export const KRIS_PARTNER_MEMBER_ID_ENV_VAR = "XENIOS_KRIS_PARTNER_MEMBER_ID";

/**
 * The founder-confirmed Launch A address.
 *
 * Committed rather than left to the environment so that the person entitled to
 * a confidential price sheet is visible in a diff and in review. An operator
 * can still override it, and should replace it entirely with the member id as
 * soon as the account is activated.
 */
export const KRIS_PARTNER_FOUNDER_CONFIRMED_EMAIL = "info@romanhealthcollective.com";

export interface KrisViewerIdentity {
  /** The canonical member id, when the account exists. Null before activation. */
  memberId: string | null;
  /** The authenticated address. Never a value the browser supplied. */
  email: string;
}

export type KrisEntitlement =
  | {
      entitled: true;
      profile: KrisPriceProfile;
      /**
       * Which fact granted it. `member_id` is the durable binding;
       * `founder_confirmed_email` is the pre-activation bootstrap and is the
       * signal that this deployment still has the id to configure.
       */
      boundBy: "member_id" | "founder_confirmed_email";
    }
  | { entitled: false; reason: "no_matching_profile" };

export interface KrisEntitlementEnv {
  [key: string]: string | undefined;
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function configuredEmail(env: KrisEntitlementEnv): string {
  const configured = normalizeEmail(env[KRIS_PARTNER_EMAIL_ENV_VAR]);
  return configured !== "" ? configured : KRIS_PARTNER_FOUNDER_CONFIRMED_EMAIL;
}

/**
 * Resolve one viewer to a price profile, or to nothing.
 *
 * Fails closed. A blank email, a blank configured id, or anything that does not
 * match exactly resolves to not entitled, and the caller refuses rather than
 * showing an unpriced or a differently priced catalog.
 */
export function resolveKrisEntitlement(
  viewer: KrisViewerIdentity,
  env: KrisEntitlementEnv = process.env,
): KrisEntitlement {
  const configuredMemberId = (env[KRIS_PARTNER_MEMBER_ID_ENV_VAR] ?? "").trim();
  const viewerMemberId = (viewer.memberId ?? "").trim();

  if (configuredMemberId !== "" && viewerMemberId !== "") {
    // Canonical identity is configured. It is the only authority from here on:
    // a mismatch is a refusal, and the email is deliberately not consulted as a
    // second chance, because that would reintroduce the mutable binding this
    // branch exists to retire.
    return viewerMemberId === configuredMemberId
      ? { entitled: true, profile: "KRIS_VOLUME_PARTNER", boundBy: "member_id" }
      : { entitled: false, reason: "no_matching_profile" };
  }

  const viewerEmail = normalizeEmail(viewer.email);
  if (viewerEmail !== "" && viewerEmail === configuredEmail(env)) {
    return {
      entitled: true,
      profile: "KRIS_VOLUME_PARTNER",
      boundBy: "founder_confirmed_email",
    };
  }

  return { entitled: false, reason: "no_matching_profile" };
}

/**
 * True while entitlement still rests on the address rather than the member id.
 *
 * Worth surfacing in an operator diagnostic: it is the outstanding piece of
 * Launch A hardening, and it is easy to forget precisely because everything
 * works without it.
 */
export function krisEntitlementAwaitingMemberId(
  env: KrisEntitlementEnv = process.env,
): boolean {
  return (env[KRIS_PARTNER_MEMBER_ID_ENV_VAR] ?? "").trim() === "";
}
