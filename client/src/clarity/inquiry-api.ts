export type InquiryType = "practice" | "partner_interest" | "strategic" | "supplier" | "career_interest";
export type InquiryInterest =
  | "refer_clients"
  | "care_for_clients"
  | "in_clinic_inventory"
  | "partner_program"
  | "strategic_partnership"
  | "supplier_relationship"
  | "general_interest"
  | "not_sure";

export type InquiryRequest = {
  inquiryType: InquiryType;
  fullName: string;
  email: string;
  phone?: string;
  organizationName?: string;
  organizationKind?: string;
  role?: string;
  region?: string;
  interest?: InquiryInterest;
  documentationAvailable?: boolean;
  message?: string;
  organizationWebsite?: string;
  website?: string;
  turnstileToken?: string;
};

export type InquiryReceipt = {
  ok: true;
  accepted: true;
  replayed: boolean;
  reference: string;
  status: "New";
  inquiryType: InquiryType;
  confirmation: string;
  confirmationDelivery: "queued" | "not_queued";
};

export class InquirySubmissionError extends Error {
  constructor(
    message: string,
    readonly kind: "rejected" | "uncertain",
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

const ENDPOINT = "/api/research/inquiries";

export async function submitInquiry(payload: InquiryRequest): Promise<InquiryReceipt> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new InquirySubmissionError(
      "We're not sure this went through. Please don't resend yet.",
      "uncertain",
    );
  }

  const body = await response.json().catch(() => ({})) as Partial<InquiryReceipt> & {
    message?: string;
    fieldErrors?: Record<string, string>;
  };

  if (
    response.ok &&
    body.ok === true &&
    body.accepted === true &&
    typeof body.replayed === "boolean" &&
    typeof body.reference === "string" &&
    /^INQ-[0-9A-F]{8}$/u.test(body.reference) &&
    body.status === "New" &&
    body.inquiryType === payload.inquiryType &&
    typeof body.confirmation === "string" &&
    body.confirmation.length > 0 &&
    (body.confirmationDelivery === "queued" || body.confirmationDelivery === "not_queued")
  ) {
    return body as InquiryReceipt;
  }

  if (response.ok) {
    throw new InquirySubmissionError(
      "The server response did not confirm a durable reference. Please don't resend yet.",
      "uncertain",
    );
  }

  if (response.status === 503 || response.status >= 500) {
    throw new InquirySubmissionError(
      body.message || "We're not sure this went through. Please don't resend yet.",
      "uncertain",
    );
  }

  throw new InquirySubmissionError(
    body.message || "We couldn't send your inquiry. Nothing was saved. Please check the form and try again.",
    "rejected",
    body.fieldErrors,
  );
}
