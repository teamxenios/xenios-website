import type { EarlyAccessSubmissionAdminView } from "../hardening-contract";
import {
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "../persistence/executor";
import type {
  EarlyAccessAdminAgreementReviewPort,
  EarlyAccessAdminSubmissionReviewPort,
} from "./admin-payment-review";
import type {
  EarlyAccessAcceptedSubmissionEvidence,
  EarlyAccessAcceptedSubmissionEvidencePort,
} from "./settlement";

const RPC = Object.freeze({
  submission: "research_early_access_submission_admin_view",
  currentPackage: "research_early_access_current_agreement_package",
  attestation: "research_early_access_active_agreement_attestation",
});

function nullableObject(fn: string, value: unknown): Record<string, unknown> | null {
  return value === null || value === undefined ? null : expectObject(fn, value);
}

/** Service-role projections for the read-only founder review screen. */
export class SupabaseEarlyAccessAdminPaymentReviewStore
  implements
    EarlyAccessAdminSubmissionReviewPort,
    EarlyAccessAdminAgreementReviewPort,
    EarlyAccessAcceptedSubmissionEvidencePort
{
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async byCheckoutNumber(checkoutNumber: string): Promise<EarlyAccessSubmissionAdminView | null> {
    const raw = nullableObject(
      RPC.submission,
      await runEarlyAccessCall(this.query, {
        fn: RPC.submission,
        args: { p_checkout_number: checkoutNumber },
      }),
    );
    return raw === null ? null : Object.freeze(raw) as unknown as EarlyAccessSubmissionAdminView;
  }

  async acceptedForCheckout(
    checkoutNumber: string,
  ): Promise<EarlyAccessAcceptedSubmissionEvidence | null> {
    const submission = await this.byCheckoutNumber(checkoutNumber);
    if (
      submission === null ||
      submission.internalEmailAcceptance !== "accepted" ||
      submission.reconciliationRequired
    ) {
      return null;
    }
    return Object.freeze({
      submissionId: submission.submissionId,
      sha256: submission.proofSha256,
      filename: submission.filename,
      contentType: submission.contentType,
      byteSize: submission.byteSize,
    });
  }

  async forCheckout(checkoutNumber: string): Promise<Readonly<{
    satisfied: boolean;
    packageVersion: string | null;
  }>> {
    const [current, attestation] = await Promise.all([
      runEarlyAccessCall(this.query, { fn: RPC.currentPackage, args: {} }),
      runEarlyAccessCall(this.query, {
        fn: RPC.attestation,
        args: { p_checkout_number: checkoutNumber },
      }),
    ]);
    const currentRecord = nullableObject(RPC.currentPackage, current);
    const attestationRecord = nullableObject(RPC.attestation, attestation);
    const currentVersion =
      typeof currentRecord?.packageVersion === "string" ? currentRecord.packageVersion : null;
    const attestedVersion =
      typeof attestationRecord?.packageVersion === "string"
        ? attestationRecord.packageVersion
        : null;
    return Object.freeze({
      satisfied: currentVersion !== null && attestedVersion === currentVersion,
      packageVersion: currentVersion,
    });
  }
}
