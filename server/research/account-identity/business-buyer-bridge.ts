import { z } from "zod";

export const ROMAN_BUYER_ID = "8f942c0e-370b-4b7b-98ce-a0b931193f08";
export const ROMAN_BUYER_NAME = "Roman Health";
export const ROMAN_BUYER_SLUG = "roman-health";
export const ROMAN_BUYER_COUNTRY = "USA";
export const ROMAN_BUYER_STATE = "Texas";
export const ROMAN_OPERATOR_LEGAL_NAME = "Kristopher Lopez";
export const ROMAN_OPERATOR_EMAIL = "info@romanhealthcollective.com";

const AuthIdentitySchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  emailConfirmedAt: z.string().nullable(),
}).strict();

export const BusinessBuyerContextSchema = z.object({
  buyerId: z.string().uuid(),
  buyerSlug: z.string().min(1),
  customerRef: z.string().regex(/^eac_[a-f0-9]{32}$/),
  priceProfile: z.literal("KRIS_VOLUME_PARTNER"),
  roles: z.array(z.enum(["buyer_owner", "buyer_operator"])).min(1),
}).strict();

export type BusinessBuyerContext = z.infer<typeof BusinessBuyerContextSchema>;

export interface BusinessBuyerActivationDeps {
  findAuthByEmail(email: string): Promise<unknown | null>;
  inviteAuthUser(email: string, redirectTo: string): Promise<unknown>;
  finalizeClaim(input: {
    buyerId: string;
    authUserId: string;
    email: string;
    actorLabel: string;
  }): Promise<unknown>;
}

export type BusinessBuyerActivationResult =
  | { ok: true; state: "claim_sent"; authUserId: string }
  | { ok: true; state: "ready"; context: BusinessBuyerContext }
  | { ok: false; code: "AUTH_CONFLICT" | "CLAIM_PENDING" | "INVITE_FAILED" | "BINDING_FAILED" };

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function redirect(siteUrl: string): string {
  const base = new URL(siteUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("Business buyer claim requires an HTTPS site URL.");
  }
  return new URL("/research/reset-password", base).href;
}

export async function activateRomanBusinessBuyer(
  deps: BusinessBuyerActivationDeps,
  options: { siteUrl: string; actorLabel: string },
): Promise<BusinessBuyerActivationResult> {
  const existingRaw = await deps.findAuthByEmail(ROMAN_OPERATOR_EMAIL);
  if (!existingRaw) {
    try {
      const invited = AuthIdentitySchema.parse(
        await deps.inviteAuthUser(ROMAN_OPERATOR_EMAIL, redirect(options.siteUrl)),
      );
      if (normalizeEmail(invited.email) !== ROMAN_OPERATOR_EMAIL) {
        return { ok: false, code: "INVITE_FAILED" };
      }
      return { ok: true, state: "claim_sent", authUserId: invited.id };
    } catch {
      return { ok: false, code: "INVITE_FAILED" };
    }
  }

  const parsed = AuthIdentitySchema.safeParse(existingRaw);
  if (!parsed.success || normalizeEmail(parsed.data.email) !== ROMAN_OPERATOR_EMAIL) {
    return { ok: false, code: "AUTH_CONFLICT" };
  }
  if (!parsed.data.emailConfirmedAt) return { ok: false, code: "CLAIM_PENDING" };

  try {
    const context = BusinessBuyerContextSchema.parse(await deps.finalizeClaim({
      buyerId: ROMAN_BUYER_ID,
      authUserId: parsed.data.id,
      email: ROMAN_OPERATOR_EMAIL,
      actorLabel: options.actorLabel,
    }));
    if (context.buyerId !== ROMAN_BUYER_ID) return { ok: false, code: "BINDING_FAILED" };
    return { ok: true, state: "ready", context };
  } catch {
    return { ok: false, code: "BINDING_FAILED" };
  }
}
