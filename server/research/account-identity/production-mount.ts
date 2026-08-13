import type { Express } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, getSupabaseAnon } from "../../supabase";
import { getResendClient } from "../../services/email";
import {
  createProductionAccountIdentityDeps,
  createSupabaseAccountAuthVerifier,
  type AccountNotificationDelivery,
  type PasswordChangeEvidence,
  type SupabaseAuthClient,
} from "./production-deps";
import { createSupabaseAccountIdentityStore } from "./production-store";
import { registerAccountIdentityApi } from "./routes";

const DEFAULT_SITE_URL = "https://xeniostechnology.com";

const unavailablePasswordEvidence: PasswordChangeEvidence = {
  async changedAfter() {
    // Supabase's user.updated_at is not proof that a password changed. Until a
    // canonical password-change event exists, the initial-password flag stays
    // set and the API answers PASSWORD_CHANGE_REQUIRED (428).
    return null;
  },
};

function notificationIdempotencyKey(notification: Parameters<AccountNotificationDelivery["deliver"]>[0]): string | null {
  try {
    const url = new URL(notification.actionUrl);
    const parameter = notification.kind === "organization_invitation" ? "invitation" : "claim";
    const id = url.searchParams.get(parameter);
    return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? `pack02-${notification.kind}-${id.toLowerCase()}`
      : null;
  } catch {
    return null;
  }
}

export function createImmediateAccountNotificationDelivery(
  resolveProvider: typeof getResendClient = getResendClient,
): AccountNotificationDelivery {
  return {
    async deliver(notification) {
      try {
        const idempotencyKey = notificationIdempotencyKey(notification);
        if (!idempotencyKey) return false;
        const { client, fromEmail, replyToEmail } = await resolveProvider();
        const organizationInvitation = notification.kind === "organization_invitation";
        const result = await client.emails.send({
          from: fromEmail ?? "Xenios Research <research@xeniostechnology.com>",
          replyTo: replyToEmail,
          to: notification.recipient,
          subject: organizationInvitation
            ? "Your Xenios organization invitation"
            : "Confirm your Xenios order-history claim",
          text: [
            organizationInvitation
              ? "Use this secure link to accept your Xenios organization invitation:"
              : "Use this secure link to confirm your Xenios order-history claim:",
            notification.actionUrl,
            "",
            `This link expires at ${notification.expiresAt}.`,
          ].join("\n"),
        }, { idempotencyKey });
        return result.error === null && typeof result.data?.id === "string" && result.data.id.length > 0;
      } catch {
        // Never log the provider error object: it may include the action URL.
        return false;
      }
    },
  };
}

const immediateAccountNotificationDelivery = createImmediateAccountNotificationDelivery();

export type ProductionAccountIdentityMountOptions = {
  admin?: SupabaseClient;
  anon?: SupabaseAuthClient;
  notifications?: AccountNotificationDelivery;
  passwordEvidence?: PasswordChangeEvidence;
  siteUrl?: string;
};

export function buildProductionAccountIdentityDependencies(
  options: ProductionAccountIdentityMountOptions = {},
) {
  const admin = options.admin ?? getSupabaseAdmin();
  const anon = options.anon ?? (getSupabaseAnon() as unknown as SupabaseAuthClient);
  return createProductionAccountIdentityDeps({
    auth: createSupabaseAccountAuthVerifier(anon),
    store: createSupabaseAccountIdentityStore(admin),
    notifications: options.notifications ?? immediateAccountNotificationDelivery,
    // Explicitly refusing evidence is safer than treating auth.users.updated_at
    // (which changes for unrelated reasons) as proof of a password change.
    passwordEvidence: options.passwordEvidence ?? unavailablePasswordEvidence,
    siteUrl: options.siteUrl ?? process.env.SITE_URL ?? DEFAULT_SITE_URL,
  });
}

export function registerProductionAccountIdentityApi(
  app: Express,
  options: ProductionAccountIdentityMountOptions = {},
): void {
  registerAccountIdentityApi(app, buildProductionAccountIdentityDependencies(options));
}
