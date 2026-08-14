import { useState } from "react";

/**
 * Payment-proof upload.
 *
 * SUBMITTING PROOF DOES NOT PAY THE ORDER. It records that the customer says
 * they sent money. Only a named human confirming the transfer arrived moves the
 * order on, and this component says so before, during and after the upload,
 * because a customer who believes the upload settled it will expect a shipment
 * that is not coming.
 *
 * Client-side validation here is a courtesy that fails fast on obvious
 * mistakes. It is NOT the security boundary: the server validates MIME,
 * extension, size and checksum independently, and must reject anything this
 * misses. Nothing here should ever be relied on as a control.
 */

export const EARLY_ACCESS_PROOF_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const EARLY_ACCESS_PROOF_MAX_BYTES = 10 * 1024 * 1024;

export type ProofRejection = "type" | "size" | "empty" | null;

/** Pure so it can be tested without a DOM file picker. */
export function rejectProof(file: { type: string; size: number } | null): ProofRejection {
  if (file === null) return "empty";
  if (file.size <= 0) return "empty";
  if (!(EARLY_ACCESS_PROOF_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > EARLY_ACCESS_PROOF_MAX_BYTES) return "size";
  return null;
}

const REJECTION_COPY: Record<Exclude<ProofRejection, null>, string> = {
  type: "That file type is not accepted. Send a JPG, PNG, WEBP or PDF.",
  size: "That file is larger than 10 MB. Send a smaller screenshot or PDF.",
  empty: "That file appears to be empty. Choose the receipt or screenshot again.",
};

export interface EarlyAccessProofUploadProps {
  orderNumber: string;
  onSubmit(file: File): Promise<void> | void;
  submitting?: boolean;
  testId?: string;
}

export function EarlyAccessProofUpload({
  orderNumber,
  onSubmit,
  submitting = false,
  testId = "early-access-proof-upload",
}: EarlyAccessProofUploadProps) {
  const [rejection, setRejection] = useState<ProofRejection>(null);
  const [chosen, setChosen] = useState<File | null>(null);

  return (
    <section data-testid={testId} className="grid min-w-0 gap-3">
      <h3>Record proof of payment</h3>

      <p data-testid={`${testId}-not-payment`}>
        Recording proof does not pay your order. Xenios records this file's details and checksum;
        the file itself stays on your device, so keep it and send it through your Xenios support
        contact. Your order stays unpaid until a member of our team confirms the money arrived.
      </p>

      <input
        type="file"
        data-testid={`${testId}-input`}
        accept={EARLY_ACCESS_PROOF_TYPES.join(",")}
        disabled={submitting}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          const why = rejectProof(file);
          setRejection(why);
          setChosen(why === null ? file : null);
        }}
      />

      {rejection !== null ? (
        <p role="alert" data-testid={`${testId}-rejection`}>
          {REJECTION_COPY[rejection]}
        </p>
      ) : null}

      <button
        type="button"
        data-testid={`${testId}-submit`}
        disabled={chosen === null || submitting}
        onClick={() => {
          if (chosen !== null) void onSubmit(chosen);
        }}
      >
        {submitting ? "Recording proof" : "Record proof details"}
      </button>

      <p data-testid={`${testId}-order`}>Order {orderNumber}</p>
    </section>
  );
}
