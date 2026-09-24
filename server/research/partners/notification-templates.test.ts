import { describe, expect, it } from "vitest";
import { PARTNER_NOTIFICATION_TEMPLATES, renderPartnerOutboxEmail } from "./notification-templates";

describe("partner notification templates", () => {
  it("keeps application receipt distinct from approval or activation", () => {
    const mail = renderPartnerOutboxEmail(PARTNER_NOTIFICATION_TEMPLATES.customerApplication, { legalName: "Synthetic Partner", role: "research_rep" });
    expect(mail?.text).toContain("We received your research rep application");
    expect(mail?.text).toContain("does not approve, certify, or activate");
    expect(mail?.text).toContain("/research/partners/dashboard");
  });

  it("renders lifecycle status and refuses unknown templates", () => {
    expect(renderPartnerOutboxEmail(PARTNER_NOTIFICATION_TEMPLATES.customerLifecycle, { action: "reinstate", state: "active" })?.text).toContain("status is now active");
    expect(renderPartnerOutboxEmail("unknown", {})).toBeNull();
  });
});
