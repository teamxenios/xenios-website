import type { ResearchInquiryType } from "@shared/research/inquiries";

export const PUBLIC_INQUIRY_NOTIFICATION_TEMPLATES = Object.freeze({
  customer: "public_inquiry_received_customer",
  operator: "public_inquiry_received_operator",
});

function clean(value: unknown, fallback: string, maximum = 500): string {
  if (typeof value !== "string") return fallback;
  const normalized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .trim();
  return normalized ? normalized.slice(0, maximum) : fallback;
}

function label(type: ResearchInquiryType): string {
  switch (type) {
    case "practice": return "practice inquiry";
    case "partner_interest": return "partner inquiry";
    case "strategic": return "strategic inquiry";
    case "supplier": return "supplier inquiry";
    case "career_interest": return "general-interest application";
  }
}

function inquiryType(value: unknown): ResearchInquiryType | null {
  return value === "practice" || value === "partner_interest" ||
    value === "strategic" || value === "supplier" ||
    value === "career_interest"
    ? value
    : null;
}

export function renderPublicInquiryOutboxEmail(
  templateKey: string,
  payload: Record<string, unknown>,
): Readonly<{ subject: string; text: string }> | null {
  const type = inquiryType(payload.inquiryType);
  const reference = clean(payload.reference, "", 20);
  if (!type || !/^INQ-[0-9A-F]{8}$/u.test(reference)) return null;

  if (templateKey === PUBLIC_INQUIRY_NOTIFICATION_TEMPLATES.customer) {
    const firstName = clean(payload.firstName, "there", 80);
    const noun = label(type);
    const boundary = type === "supplier"
      ? "This inquiry does not create supplier access."
      : type === "career_interest"
        ? "We will contact you if we would like to talk."
        : "This inquiry does not create an account or approve anything.";
    return {
      subject: `Xenios ${noun} received — ${reference}`,
      text: `Hi ${firstName},\n\nWe received your ${noun}. Your reference is ${reference}.\n\n${boundary}\n\nKeep this reference for your records. If you need help, contact support at https://xeniostechnology.com/support.\n\nXenios\nresearch@xeniostechnology.com`,
    };
  }

  if (templateKey === PUBLIC_INQUIRY_NOTIFICATION_TEMPLATES.operator) {
    const name = clean(payload.fullName, "Name unavailable", 120);
    const email = clean(payload.email, "Email unavailable", 254);
    const organization = clean(payload.organizationName, "Not provided", 160);
    const role = clean(payload.role, "Not provided", 120);
    const region = clean(payload.region, "Not provided", 120);
    const phone = clean(payload.phone, "Not provided", 32);
    const message = clean(payload.message, "No message provided", 2_000);
    return {
      subject: `Public ${label(type)} received — ${reference}`,
      text: `A durable public inquiry is ready for founder review.\n\nReference: ${reference}\nType: ${label(type)}\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nOrganization: ${organization}\nRole: ${role}\nRegion: ${region}\n\nMessage:\n${message}\n\nReview the canonical founder command center: https://xeniostechnology.com/admin/research`,
    };
  }

  return null;
}
