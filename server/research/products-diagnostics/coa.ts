import crypto from "crypto";
import type {
  ProductCertificateRecord,
  ProductLotRecord,
  ProductVariantRecord,
} from "./model";

export const COA_LIMITATION_NOTICE =
  "A certificate reports the tests and results stated for one exact lot. A reported purity result does not establish sterility, safety, potency, or suitability for human use.";

export interface CertificateAccessActor {
  memberId: string;
  active: boolean;
}

export interface PrivateCertificateProvider {
  createSignedReadUrl(input: {
    storageKey: string;
    memberId: string;
    certificateId: string;
    expiresInSeconds: number;
  }): Promise<
    | { ok: true; signedUrl: string; expiresAt: string }
    | { ok: false; code: "disabled" | "not_configured" | "unavailable" }
  >;
}

export interface CertificateAccessAudit {
  record(event: {
    auditId: string;
    memberId: string;
    certificateId: string;
    lotId: string;
    accessedAt: string;
    outcome: "attempted" | "granted" | "denied";
    reason: string;
  }): Promise<void>;
}

export type CertificateAccessResult =
  | {
      ok: true;
      signedUrl: string;
      expiresAt: string;
      certificateId: string;
      lotCode: string;
      notice: string;
    }
  | {
      ok: false;
      code:
        | "membership_required"
        | "variant_not_found"
        | "lot_not_found"
        | "certificate_not_found"
        | "documentation_pending"
        | "certificate_withdrawn"
        | "private_access_unavailable";
      message: string;
    };

export class DisabledPrivateCertificateProvider implements PrivateCertificateProvider {
  async createSignedReadUrl(): Promise<{ ok: false; code: "disabled" }> {
    return { ok: false, code: "disabled" };
  }
}

export class MemoryCertificateAudit implements CertificateAccessAudit {
  readonly events: Array<Parameters<CertificateAccessAudit["record"]>[0]> = [];

  async record(event: Parameters<CertificateAccessAudit["record"]>[0]): Promise<void> {
    this.events.push(event);
  }
}

function denied(
  code: Extract<CertificateAccessResult, { ok: false }>["code"],
  message: string,
): CertificateAccessResult {
  return { ok: false, code, message };
}

export class ExactLotCertificateService {
  constructor(
    private readonly variants: readonly ProductVariantRecord[],
    private readonly lots: readonly ProductLotRecord[],
    private readonly certificates: readonly ProductCertificateRecord[],
    private readonly provider: PrivateCertificateProvider,
    private readonly audit: CertificateAccessAudit,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async requestAccess(input: {
    actor: CertificateAccessActor;
    sku: string;
    lotCode: string;
  }): Promise<CertificateAccessResult> {
    const at = this.now().toISOString();
    if (!input.actor.active) {
      return denied("membership_required", "Active membership is required to open private lot documentation.");
    }
    const variant = this.variants.find((item) => item.sku === input.sku);
    if (!variant) return denied("variant_not_found", "The requested product variant was not found.");

    const lot = this.lots.find(
      (item) => item.variantId === variant.variantId && item.lotCode === input.lotCode,
    );
    if (!lot) {
      return denied(
        "lot_not_found",
        "No certificate is linked to that exact product lot. Check the lot code and try again.",
      );
    }

    const certificate = this.certificates.find((item) => item.lotId === lot.lotId);
    if (!certificate) {
      return denied("certificate_not_found", "No certificate is recorded for that exact lot.");
    }

    const auditBase = {
      auditId: crypto.randomUUID(),
      memberId: input.actor.memberId,
      certificateId: certificate.certificateId,
      lotId: lot.lotId,
      accessedAt: at,
    };

    if (certificate.documentState === "withdrawn" || certificate.verificationState === "withdrawn") {
      await this.audit.record({ ...auditBase, outcome: "denied", reason: "certificate_withdrawn" });
      return denied("certificate_withdrawn", "This lot document has been withdrawn and is not available.");
    }

    if (
      certificate.documentState !== "available" ||
      certificate.verificationState !== "document_on_file" ||
      !certificate.privateStorageKey
    ) {
      await this.audit.record({ ...auditBase, outcome: "denied", reason: "documentation_pending" });
      return denied(
        "documentation_pending",
        "Documentation for this exact lot is still pending review.",
      );
    }

    await this.audit.record({
      ...auditBase,
      outcome: "attempted",
      reason: "exact_lot_match",
    });
    const grant = await this.provider.createSignedReadUrl({
      storageKey: certificate.privateStorageKey,
      memberId: input.actor.memberId,
      certificateId: certificate.certificateId,
      expiresInSeconds: 5 * 60,
    });
    if (!grant.ok) {
      await this.audit.record({
        ...auditBase,
        auditId: crypto.randomUUID(),
        outcome: "denied",
        reason: "private_access_unavailable",
      });
      return denied(
        "private_access_unavailable",
        "Private certificate access is not available right now. Try again later.",
      );
    }
    await this.audit.record({
      ...auditBase,
      auditId: crypto.randomUUID(),
      outcome: "granted",
      reason: "signed_url_minted",
    });

    return {
      ok: true,
      signedUrl: grant.signedUrl,
      expiresAt: grant.expiresAt,
      certificateId: certificate.certificateId,
      lotCode: lot.lotCode,
      notice: COA_LIMITATION_NOTICE,
    };
  }
}
