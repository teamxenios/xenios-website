export const PARTNER_NOTIFICATION_TEMPLATES = {
  customerApplication: "partner_application_received_customer",
  adminApplication: "partner_application_received_admin",
  customerLifecycle: "partner_lifecycle_customer",
  adminLifecycle: "partner_lifecycle_admin",
} as const;

const clean = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim().slice(0, 180) : fallback;

export function renderPartnerOutboxEmail(templateKey: string, payload: Record<string, unknown>) {
  const legalName = clean(payload.legalName, "Partner applicant");
  const role = clean(payload.role, "partner").replace(/_/g, " ");
  const state = clean(payload.state, "under review").replace(/_/g, " ");
  const action = clean(payload.action, "review update").replace(/_/g, " ");
  if (templateKey === PARTNER_NOTIFICATION_TEMPLATES.customerApplication) return {
    subject: "Xenios Research partner application received",
    text: `Hello ${legalName},\n\nWe received your ${role} application. Current state: application. A person will review it. Submission does not approve, certify, or activate partner access.\n\nYour partner dashboard shows the recorded status and next authorized action: https://xeniostechnology.com/research/partners/dashboard\n\nSupport: research@xeniostechnology.com\n\nXenios Research`,
  };
  if (templateKey === PARTNER_NOTIFICATION_TEMPLATES.adminApplication) return {
    subject: "Partner application received",
    text: `A ${role} partner application was recorded for ${legalName}. Contact: ${clean(payload.contactEmail, "not available")}. Review it in the canonical partner administration workflow: https://xeniostechnology.com/admin/research/partners`,
  };
  if (templateKey === PARTNER_NOTIFICATION_TEMPLATES.customerLifecycle) return {
    subject: `Xenios Research partner status: ${state}`,
    text: `Your partner status is now ${state}. This update followed the recorded ${action} action.\n\nOpen your dashboard for the current status and next authorized action: https://xeniostechnology.com/research/partners/dashboard\n\nXenios Research\nresearch@xeniostechnology.com`,
  };
  if (templateKey === PARTNER_NOTIFICATION_TEMPLATES.adminLifecycle) return {
    subject: `Partner lifecycle update: ${state}`,
    text: `Partner ${clean(payload.partnerId, "unknown")} is now ${state} after ${action}. Review the canonical partner record for details.`,
  };
  return null;
}
