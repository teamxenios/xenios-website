import { z } from "zod";
import {
  CATALOG_INTEREST_CUSTOMER_EVENT,
  CATALOG_INTEREST_TEAM_EVENT,
} from "@shared/catalog-interest";
import type { CatalogAuthority } from "./authority";

const catalogSnapshotSchema = z.object({
  revision: z.string().min(1).max(100),
  url: z.string().url().max(2048),
  approvedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  state: z.enum(["approved", "manual_review"]),
}).strict();

const jobBase = {
  eventKey: z.string().min(1).max(240),
  recipient: z.string().email().max(320),
} as const;

const mailJobSchema = z.discriminatedUnion("eventType", [
  z.object({
    ...jobBase,
    eventType: z.literal(CATALOG_INTEREST_CUSTOMER_EVENT),
    payload: z.object({
      schemaVersion: z.literal(1),
      receipt: z.string().regex(/^XHC-[A-Z0-9]{12}$/u),
      email: z.string().email().max(320),
      catalog: catalogSnapshotSchema,
    }).strict(),
  }).strict(),
  z.object({
    ...jobBase,
    eventType: z.literal(CATALOG_INTEREST_TEAM_EVENT),
    payload: z.object({
      schemaVersion: z.literal(1),
      receipt: z.string().regex(/^XHC-[A-Z0-9]{12}$/u),
      email: z.string().email().max(320),
      marketingConsent: z.boolean(),
      catalog: catalogSnapshotSchema,
    }).strict(),
  }).strict(),
]);

export type CatalogInterestMailJob = z.infer<typeof mailJobSchema>;

export interface CatalogMailProvider {
  send(input: Readonly<{
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    idempotencyKey: string;
  }>): Promise<Readonly<{
    providerMessageId?: string | null;
    errorCode?: string | null;
  }>>;
}

export type CatalogMailSender = string | (() => Promise<string | null | undefined>);

export type CatalogMailDelivery =
  | Readonly<{ outcome: "sent"; providerMessageId: string }>
  | Readonly<{
    outcome: "failed";
    retryable: boolean;
    code: "invalid_job" | "manual_review_required" | "provider_failure" | "provider_id_missing";
  }>;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function sameOptionalInstant(left: string | null, right: string | null): boolean {
  return left === null || right === null
    ? left === right
    : sameInstant(left, right);
}

function validSender(value: string): boolean {
  if (!value || value.length > 320 || /[\r\n]/u.test(value)) return false;
  const displayMatch = value.match(/^[^<>]{1,160}<([^<>]+)>$/u);
  const address = (displayMatch?.[1] ?? value).trim();
  return z.string().email().safeParse(address).success;
}

function render(job: CatalogInterestMailJob) {
  const receipt = escapeHtml(job.payload.receipt);
  if (job.eventType === CATALOG_INTEREST_CUSTOMER_EVENT) {
    if (job.payload.catalog.state !== "approved") return null;
    const url = escapeHtml(job.payload.catalog.url);
    return {
      subject: `Your xenios catalog request ${job.payload.receipt}`,
      text: [
        "Your xenios catalog request is ready.",
        `Catalog: ${job.payload.catalog.url}`,
        `Reference: ${job.payload.receipt}`,
        "This is catalog information only. It is not an order, stock confirmation, approval, invoice, payment request, or fulfillment confirmation.",
      ].join("\n\n"),
      html: `<p>Your xenios catalog request is ready.</p><p><a href="${url}">Open the catalog</a></p><p>Reference: <strong>${receipt}</strong></p><p>This is catalog information only. It is not an order, stock confirmation, approval, invoice, payment request, or fulfillment confirmation.</p>`,
    };
  }
  return {
    subject: `Catalog interest ${job.payload.receipt}${job.payload.catalog.state === "manual_review" ? " needs review" : ""}`,
    text: [
      `Catalog request: ${job.payload.receipt}`,
      `Email: ${job.payload.email}`,
      `Catalog revision: ${job.payload.catalog.revision}`,
      `Authority state: ${job.payload.catalog.state}`,
      `Optional marketing opt-in: ${job.payload.marketingConsent ? "yes" : "no"}`,
    ].join("\n"),
    html: `<p>Catalog request: <strong>${receipt}</strong></p><p>Email: ${escapeHtml(job.payload.email)}</p><p>Catalog revision: ${escapeHtml(job.payload.catalog.revision)}</p><p>Authority state: ${job.payload.catalog.state}</p><p>Optional marketing opt-in: ${job.payload.marketingConsent ? "yes" : "no"}</p>`,
  };
}

export async function sendCatalogInterestMail(
  rawJob: unknown,
  provider: CatalogMailProvider,
  from: CatalogMailSender,
  currentAuthority: CatalogAuthority | null,
): Promise<CatalogMailDelivery> {
  const parsed = mailJobSchema.safeParse(rawJob);
  if (!parsed.success) {
    return { outcome: "failed", retryable: false, code: "invalid_job" };
  }
  if (
    parsed.data.eventType === CATALOG_INTEREST_CUSTOMER_EVENT &&
    parsed.data.recipient.toLowerCase() !== parsed.data.payload.email.toLowerCase()
  ) {
    return { outcome: "failed", retryable: false, code: "invalid_job" };
  }
  if (parsed.data.eventType === CATALOG_INTEREST_CUSTOMER_EVENT && (
    !currentAuthority ||
    currentAuthority.state !== "approved" ||
    currentAuthority.revision !== parsed.data.payload.catalog.revision ||
    currentAuthority.url !== parsed.data.payload.catalog.url ||
    !sameInstant(currentAuthority.approvedAt, parsed.data.payload.catalog.approvedAt) ||
    !sameInstant(currentAuthority.expiresAt, parsed.data.payload.catalog.expiresAt) ||
    !sameOptionalInstant(currentAuthority.revokedAt, parsed.data.payload.catalog.revokedAt)
  )) {
    return { outcome: "failed", retryable: false, code: "manual_review_required" };
  }
  const content = render(parsed.data);
  if (!content) {
    return { outcome: "failed", retryable: false, code: "manual_review_required" };
  }
  // Sender identity is deployment configuration, not durable job data. Keep a
  // missing or malformed identity retryable so fixing configuration and
  // requeueing can recover without ever inventing a fallback sender.
  let resolvedFrom: string;
  try {
    resolvedFrom = (typeof from === "function" ? await from() : from)?.trim() ?? "";
  } catch {
    return { outcome: "failed", retryable: true, code: "provider_failure" };
  }
  if (!validSender(resolvedFrom)) {
    return { outcome: "failed", retryable: true, code: "provider_failure" };
  }
  try {
    const result = await provider.send({
      from: resolvedFrom,
      to: parsed.data.recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
      idempotencyKey: parsed.data.eventKey,
    });
    if (result.errorCode) {
      return { outcome: "failed", retryable: true, code: "provider_failure" };
    }
    const providerMessageId = result.providerMessageId?.trim();
    if (!providerMessageId) {
      return {
        outcome: "failed",
        retryable: true,
        code: "provider_id_missing",
      };
    }
    return { outcome: "sent", providerMessageId };
  } catch {
    return { outcome: "failed", retryable: true, code: "provider_failure" };
  }
}

interface ResendLike {
  emails: {
    send(
      message: Readonly<{ from: string; to: string; subject: string; text: string; html: string }>,
      options: Readonly<{ idempotencyKey: string }>,
    ): Promise<Readonly<{ data?: { id?: string | null } | null; error?: { name?: string } | null }>>;
  };
}

/** Real-provider port. Constructing this adapter does not send anything. */
export function createResendCatalogMailProvider(client: ResendLike): CatalogMailProvider {
  return {
    async send(input) {
      const result = await client.emails.send({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }, { idempotencyKey: input.idempotencyKey });
      return {
        providerMessageId: result.data?.id ?? null,
        // Any provider error wins over a simultaneously returned ID. Some SDK
        // error shapes omit `name`; that ambiguity must never become `sent`.
        errorCode: result.error
          ? result.error.name?.trim() || "provider_error"
          : null,
      };
    },
  };
}
