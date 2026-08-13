import { z } from "zod";

export const B2B_SPONSORED_CLAIM_SOURCE = "b2b_buyer_sponsored_claim" as const;
export const ROMAN_HEALTH_MARKETPLACE_KEY = "roman-health-marketplace" as const;

const ExactIdentitySnapshotSchema = z.object({
  authUserIds: z.array(z.string().uuid()).max(2),
  applicationIds: z.array(z.string().uuid()).max(2),
  memberIds: z.array(z.string().uuid()).max(2),
  sponsorshipIds: z.array(z.string().uuid()).max(2),
}).strict();

const SponsoredClaimSchema = z.object({
  sponsorshipId: z.string().uuid(),
  applicationId: z.string().uuid(),
  normalizedEmail: z.string().trim().email().max(254),
  businessKey: z.string().min(1),
  businessDisplayName: z.string().min(1),
  state: z.enum(["claim_queued", "activated", "revoked", "expired"]),
  profileKey: z.literal("KRIS_VOLUME_PARTNER"),
  profileVersion: z.number().int().positive(),
  profileEffectiveAt: z.string().datetime({ offset: true }),
}).strict();

export type ExactIdentitySnapshot = z.infer<typeof ExactIdentitySnapshotSchema>;
export type SponsoredB2BClaim = z.infer<typeof SponsoredClaimSchema>;

const BaseInputSchema = z.object({
  path: z.literal("new_sponsored_claim"),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  country: z.string().trim().min(2).max(80),
  applicantType: z.enum(["individual", "professional"]),
  businessKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  businessDisplayName: z.string().trim().min(1).max(160),
  roles: z.tuple([z.literal("organization_owner"), z.literal("business_buyer")]),
  profileKey: z.literal("KRIS_VOLUME_PARTNER"),
  profileVersion: z.number().int().positive(),
  profileEffectiveAt: z.string().datetime({ offset: true }),
}).strict();

export const SponsoredB2BClaimInputSchema = BaseInputSchema;
export type SponsoredB2BClaimInput = z.input<typeof SponsoredB2BClaimInputSchema>;

export interface SponsoredB2BClaimDeps {
  inspectExactEmail(normalizedEmail: string): Promise<ExactIdentitySnapshot>;
  prepareSponsoredClaim(input: z.output<typeof SponsoredB2BClaimInputSchema>): Promise<SponsoredB2BClaim>;
  /** Best-effort wakeup only. The preparation RPC already owns durable queueing. */
  kickNotificationOutbox(): Promise<void>;
}

export type PrepareSponsoredB2BClaimResult =
  | {
      ok: true;
      state: "claim_queued";
      sponsorshipId: string;
      applicationId: string;
      normalizedEmail: string;
      businessKey: string;
    }
  | {
      ok: false;
      code:
        | "INVALID_INPUT"
        | "AMBIGUOUS_STOP"
        | "IDENTITY_APPEARED_STOP"
        | "PREPARATION_FAILED"
        | "PREPARATION_RESULT_INVALID"
        | "POST_PREPARE_IDENTITY_CONFLICT";
      sponsorshipId?: string;
      applicationId?: string;
    };

function snapshotIsEmpty(value: ExactIdentitySnapshot): boolean {
  return value.authUserIds.length === 0
    && value.applicationIds.length === 0
    && value.memberIds.length === 0
    && value.sponsorshipIds.length === 0;
}

function snapshotIsAmbiguous(value: ExactIdentitySnapshot): boolean {
  return value.authUserIds.length > 1
    || value.applicationIds.length > 1
    || value.memberIds.length > 1
    || value.sponsorshipIds.length > 1;
}

function exactClaim(
  raw: unknown,
  input: z.output<typeof SponsoredB2BClaimInputSchema>,
  expectedState: SponsoredB2BClaim["state"],
): SponsoredB2BClaim | null {
  const parsed = SponsoredClaimSchema.safeParse(raw);
  if (!parsed.success) return null;
  const row = parsed.data;
  return row.normalizedEmail.toLowerCase() === input.email
    && row.businessKey === input.businessKey
    && row.businessDisplayName === input.businessDisplayName
    && row.profileKey === input.profileKey
    && row.profileVersion === input.profileVersion
    && row.profileEffectiveAt === input.profileEffectiveAt
    && row.state === expectedState
    ? row
    : null;
}

/**
 * Internal B2B sponsorship preparation. It deliberately bypasses the public
 * essay form without pretending that its age/terms/application attestations
 * were made. The protected database RPC repeats the exact-email preflight
 * under an advisory lock and records the distinct sponsorship provenance.
 *
 * The same database transaction durably enqueues a dedicated, truthful B2B
 * account_claim template. Kris selects the password in the already-mounted
 * canonical claim UI; this service neither receives nor sets it.
 */
export async function prepareSponsoredB2BClaim(
  deps: SponsoredB2BClaimDeps,
  rawInput: unknown,
): Promise<PrepareSponsoredB2BClaimResult> {
  const parsed = SponsoredB2BClaimInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const input = parsed.data;

  const rawSnapshot = await deps.inspectExactEmail(input.email);
  const snapshot = ExactIdentitySnapshotSchema.safeParse(rawSnapshot);
  if (!snapshot.success || snapshotIsAmbiguous(snapshot.data)) {
    return { ok: false, code: "AMBIGUOUS_STOP" };
  }
  if (!snapshotIsEmpty(snapshot.data)) {
    return { ok: false, code: "IDENTITY_APPEARED_STOP" };
  }

  let prepared: SponsoredB2BClaim | null = null;
  try {
    prepared = exactClaim(await deps.prepareSponsoredClaim(input), input, "claim_queued");
  } catch {
    return { ok: false, code: "PREPARATION_FAILED" };
  }
  if (!prepared) return { ok: false, code: "PREPARATION_RESULT_INVALID" };

  const afterRaw = await deps.inspectExactEmail(input.email).catch(() => null);
  const after = ExactIdentitySnapshotSchema.safeParse(afterRaw);
  if (
    !after.success
    || after.data.authUserIds.length !== 0
    || after.data.memberIds.length !== 0
    || after.data.applicationIds.length !== 1
    || after.data.applicationIds[0] !== prepared.applicationId
    || after.data.sponsorshipIds.length !== 1
    || after.data.sponsorshipIds[0] !== prepared.sponsorshipId
  ) {
    return {
      ok: false,
      code: "POST_PREPARE_IDENTITY_CONFLICT",
      sponsorshipId: prepared.sponsorshipId,
      applicationId: prepared.applicationId,
    };
  }
  await deps.kickNotificationOutbox().catch(() => {});

  return {
    ok: true,
    state: "claim_queued",
    sponsorshipId: prepared.sponsorshipId,
    applicationId: prepared.applicationId,
    normalizedEmail: input.email,
    businessKey: input.businessKey,
  };
}
