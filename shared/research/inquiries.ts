import { z } from "zod";

export const RESEARCH_INQUIRY_API_PATH = "/api/research/inquiries" as const;

export const RESEARCH_INQUIRY_TYPES = [
  "practice",
  "partner_interest",
  "strategic",
  "supplier",
  "career_interest",
] as const;

export const RESEARCH_INQUIRY_INTERESTS = [
  "refer_clients",
  "care_for_clients",
  "in_clinic_inventory",
  "partner_program",
  "strategic_partnership",
  "supplier_relationship",
  "general_interest",
  "not_sure",
] as const;

export const RESEARCH_INQUIRY_STATUS = "New" as const;
export const RESEARCH_INQUIRY_CONFIRMATION_DELIVERIES = [
  "queued",
  "not_queued",
] as const;
export type ResearchInquiryConfirmationDelivery =
  (typeof RESEARCH_INQUIRY_CONFIRMATION_DELIVERIES)[number];

const optionalText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).optional();

export const researchInquiryRequestSchema = z
  .object({
    inquiryType: z.enum(RESEARCH_INQUIRY_TYPES),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: z
      .string()
      .trim()
      .min(7)
      .max(32)
      .regex(/^[+()0-9.\-\s]+$/u, "Enter a valid phone number.")
      .optional(),
    organizationName: optionalText(160),
    organizationKind: optionalText(120),
    role: optionalText(120),
    region: optionalText(120),
    interest: z.enum(RESEARCH_INQUIRY_INTERESTS).optional(),
    documentationAvailable: z.boolean().optional(),
    message: optionalText(2_000),
    organizationWebsite: z.string().trim().url().max(300).optional(),
    // Deliberately a separate hidden trap from organizationWebsite.
    website: z.string().max(200).optional(),
    turnstileToken: z.string().max(4_096).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const required: Array<keyof typeof input> = [];
    if (input.inquiryType === "practice") {
      required.push(
        "organizationName",
        "organizationKind",
        "role",
        "region",
        "interest",
        "message",
      );
    } else if (input.inquiryType === "supplier") {
      required.push(
        "organizationName",
        "organizationKind",
        "region",
        "documentationAvailable",
        "message",
      );
    } else if (input.inquiryType === "strategic") {
      required.push("organizationName", "message");
    } else {
      required.push("message");
    }

    for (const field of required) {
      if (input[field] !== undefined) continue;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "This field is required for this inquiry type.",
      });
    }

    const allowedInterests: Partial<
      Record<(typeof RESEARCH_INQUIRY_TYPES)[number], readonly string[]>
    > = {
      practice: [
        "refer_clients",
        "care_for_clients",
        "in_clinic_inventory",
        "not_sure",
      ],
      partner_interest: ["partner_program", "not_sure"],
      strategic: ["strategic_partnership", "not_sure"],
      supplier: ["supplier_relationship", "not_sure"],
      career_interest: ["general_interest", "not_sure"],
    };
    if (
      input.interest !== undefined &&
      !allowedInterests[input.inquiryType]?.includes(input.interest)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interest"],
        message: "Choose an interest that matches this inquiry type.",
      });
    }
  });

export const researchInquiryAcceptedResponseSchema = z
  .object({
    ok: z.literal(true),
    accepted: z.literal(true),
    replayed: z.boolean(),
    reference: z.string().regex(/^INQ-[0-9A-F]{8}$/u),
    status: z.literal(RESEARCH_INQUIRY_STATUS),
    inquiryType: z.enum(RESEARCH_INQUIRY_TYPES),
    confirmation: z.string().min(1).max(500),
    confirmationDelivery: z.enum(RESEARCH_INQUIRY_CONFIRMATION_DELIVERIES),
  })
  .strict();

export type ResearchInquiryRequest = z.infer<typeof researchInquiryRequestSchema>;
export type ResearchInquiryType = ResearchInquiryRequest["inquiryType"];
export type ResearchInquiryAcceptedResponse = z.infer<
  typeof researchInquiryAcceptedResponseSchema
>;

export const RESEARCH_INQUIRY_CONFIRMATIONS: Readonly<
  Record<ResearchInquiryType, string>
> = Object.freeze({
  practice:
    "Your inquiry was received. This is an inquiry — it doesn't create an account or approve anything. Someone from our team will contact you. We don't promise a response time.",
  partner_interest:
    "Your inquiry was received. This is an inquiry — it doesn't create an account or approve anything. Someone from our team will contact you. We don't promise a response time.",
  strategic:
    "Your inquiry was received. This is an inquiry — it doesn't create an account or approve anything. Someone from our team will contact you. We don't promise a response time.",
  supplier:
    "Your inquiry was received. This is an inquiry — it doesn't create supplier access. Someone from our team will contact you. We don't promise a response time.",
  career_interest:
    "Your application was received. We'll contact you if we'd like to talk.",
});
