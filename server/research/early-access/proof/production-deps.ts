/**
 * THE PRODUCTION COMPOSITION FOR THE CUSTOMER PAYMENT-PROOF DOOR.
 *
 * EVERY DEPENDENCY HERE IS DURABLE OR IT IS NOT SUPPLIED. There is no
 * in-memory fallback on this path, and `memory-store.ts` (which labels itself
 * not-for-production) is deliberately not imported. A deployment that cannot
 * build these refuses by not mounting the door at all, which is the same shape
 * as the cart's own F4 rule: production plus the flag plus no durable store
 * refuses rather than accepting a customer's proof into RAM. Telling a customer
 * their proof is in and then losing it on the next restart is worse than the
 * door not existing.
 *
 * WHAT IS COMPOSED, AND FROM WHERE.
 *
 *   submissions   SupabaseProofSubmissionStore over M62's begin/confirm RPCs
 *   bindings      SupabaseEarlyAccessLegalBindingDirectory, read only, over M62
 *   agreements    the legal engine's AgreementAuthority, recomputed per call
 *   presentation  createRegistryPaymentPresentation over the protected registry
 *   products      Product Control, the same reader pricing and the catalogue use
 *   sender        the existing Resend client, one fixed internal recipient
 *   pdfParser     the pdf-lib structural parser already in this repository
 *
 * `checkouts` is deliberately NOT built here. The proof path must read the very
 * cart store the quote, the checkout and the status route read, so it is passed
 * in at the mount rather than resolved a second time; two cart stores would be
 * two answers to "is this order still awaiting payment".
 *
 * THE SENDER IS RESOLVED LAZILY. `getResendClient()` is async and throws when
 * no provider is configured, and a throw at boot would take down a process for
 * a surface that may never be used. Resolved at send time, an unconfigured
 * provider becomes a clean `refused`, which the service records as `failed` on
 * a row that already exists, so the customer is told the upload could not be
 * delivered and no email is silently lost.
 */

import { getResendClient, TEAM_EMAIL } from "../../../services/email";
import { resolveDocumentsStore } from "../../membership-activation/persistence/documents-store";
import type { EarlyAccessPersistenceQuery } from "../persistence/executor";
import {
  createConfiguredPaymentMethodRegistry,
  createEnvPaymentMethodRegistrySource,
  createSystemPaymentClock,
} from "../commerce/payment-method-registry";
import {
  buildEarlyAccessAgreementAuthority,
  toMemberSignatureReader,
} from "../legal/production-authority";
import { SupabaseEarlyAccessLegalBindingDirectory } from "../legal/supabase-legal-binding-directory";
import { pdfLibStructuralParser } from "./containers";
import {
  createResendInternalOrderEmailSender,
  type InternalEmailSendResult,
  type InternalOrderEmailSender,
  type ResendLikeClient,
} from "./internal-order-email";
import { createProductionProductDisplayPort } from "./product-display";
import { createRegistryPaymentPresentation } from "./payment-presentation";
import { SupabaseProofSubmissionStore } from "./supabase-submission-store";
import type { ProofSubmissionDeps } from "./submission-service";

/**
 * The dependencies the mount supplies, minus the two the mount owns.
 *
 * `checkouts` comes from the resolved cart store and `now` from the
 * registration's clock, so both are the same objects every other cart door
 * uses.
 */
export type EarlyAccessProofDependencies = Omit<ProofSubmissionDeps, "checkouts" | "now">;

/**
 * The from-address, mirroring the default `server/services/email.ts` already
 * applies when no FROM_EMAIL is configured.
 *
 * Restated rather than imported because that module keeps its default private
 * and `server/services/**` is a protected path this lane does not edit. The
 * value is the site's own team address, which is already exported, so the two
 * cannot drift on the part that matters.
 */
const INTERNAL_FROM_DEFAULT = `xenios <${TEAM_EMAIL}>`;

/** How the Resend client is obtained. Injected so this is testable offline. */
export type ResendClientResolver = () => Promise<
  Readonly<{ client: ResendLikeClient; fromEmail?: string }>
>;

/**
 * Narrow the real Resend client to the surface this lane declares.
 *
 * The SDK types `emails.send` against a discriminated union that requires
 * either `react`, `html` or `text`, which a plain record cannot satisfy
 * structurally even when it carries the right keys. The payload
 * `createResendInternalOrderEmailSender` builds is exactly the `{from, to,
 * subject, text, attachments}` shape that union admits, so the cast is at this
 * one boundary and nowhere near the decision logic. Nothing about the payload
 * or the recipient is chosen here.
 */
function toResendLikeClient(client: {
  emails: { send(payload: never, options?: never): Promise<unknown> };
}): ResendLikeClient {
  return Object.freeze({
    emails: Object.freeze({
      send: (payload: Record<string, unknown>, options?: Record<string, unknown>) =>
        client.emails.send(payload as never, options as never) as Promise<{
          data?: { id?: string } | null;
          error?: unknown;
        }>,
    }),
  });
}

/**
 * A sender that resolves its provider on first use.
 *
 * The resolution is cached only on SUCCESS. A deployment that becomes
 * configured after boot starts working without a restart, and one that is
 * misconfigured keeps answering `refused` rather than caching a broken client.
 *
 * Nothing about the failure is logged. A provider error object can carry the
 * request it failed on, and that request carries the attachment.
 */
export function createLazyResendInternalOrderEmailSender(
  resolve: ResendClientResolver = async () => {
    const resolved = await getResendClient();
    return Object.freeze({
      client: toResendLikeClient(resolved.client),
      ...(resolved.fromEmail === undefined ? {} : { fromEmail: resolved.fromEmail }),
    });
  },
): InternalOrderEmailSender {
  let sender: InternalOrderEmailSender | null = null;

  return Object.freeze({
    async send(input: Parameters<InternalOrderEmailSender["send"]>[0]): Promise<InternalEmailSendResult> {
      if (sender === null) {
        try {
          const resolved = await resolve();
          sender = createResendInternalOrderEmailSender({
            client: resolved.client,
            fromEmail:
              typeof resolved.fromEmail === "string" && resolved.fromEmail.trim().length > 0
                ? resolved.fromEmail
                : INTERNAL_FROM_DEFAULT,
          });
        } catch {
          // No provider. Nothing was sent and nothing can have been, so this is
          // a clean refusal rather than the ambiguous case.
          return Object.freeze({ outcome: "refused" as const });
        }
      }
      return sender.send(input);
    },
  });
}

/**
 * Build every durable dependency the proof submission service needs.
 *
 * Called only from the durable branch of the Early Access persistence root, so
 * there is no path from a memory or refused deployment to a mounted door.
 */
export function buildEarlyAccessProofDependencies(deps: {
  readonly query: EarlyAccessPersistenceQuery;
  readonly env: NodeJS.ProcessEnv;
  readonly warnings?: string[];
}): EarlyAccessProofDependencies {
  const documents = resolveDocumentsStore();
  const agreements = buildEarlyAccessAgreementAuthority({
    env: deps.env,
    versions: documents,
    signatures: toMemberSignatureReader(documents),
    ...(deps.warnings ? { warnings: deps.warnings } : {}),
  });

  return Object.freeze({
    submissions: new SupabaseProofSubmissionStore(deps.query),
    bindings: new SupabaseEarlyAccessLegalBindingDirectory(deps.query),
    agreements: agreements.authority,
    // The SAME protected registry and clock the payment-instructions route and
    // the checkout notifier read, so the method a customer is shown, the method
    // the email quotes, and the method the submission records are one fact.
    presentation: createRegistryPaymentPresentation({
      methodRegistry: createConfiguredPaymentMethodRegistry(
        createEnvPaymentMethodRegistrySource(deps.env),
      ),
      clock: createSystemPaymentClock(),
    }),
    products: createProductionProductDisplayPort(),
    sender: createLazyResendInternalOrderEmailSender(),
    pdfParser: pdfLibStructuralParser(),
  });
}
