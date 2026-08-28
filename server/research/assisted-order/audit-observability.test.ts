import { describe, expect, it } from "vitest";
import { assistedOrderAuditLogLine } from "./audit-observability";

describe("assisted-order audit observability", () => {
  it("keeps only allowlisted event and actor categories", () => {
    const line = assistedOrderAuditLogLine({
      eventType: "assisted_order.document_uploaded",
      actorType: "member",
      requestId: "private-record-7",
      actorId: "private-member-7",
      evidence: { email: "private@example.test", objectPath: "private/path" },
      occurredAt: "2026-08-28T00:00:00.000Z",
    });

    expect(line).toBe("assisted_order_audit event=assisted_order.document_uploaded actor=member");
    expect(line).not.toContain("private");
    expect(line).not.toContain("example.test");
    expect(line).not.toContain("2026");
  });

  it("maps unexpected runtime values to bounded unknown categories", () => {
    expect(
      assistedOrderAuditLogLine({
        eventType: "assisted_order.submitted private-record-7",
        actorType: { private: "member-7" },
      }),
    ).toBe("assisted_order_audit event=unknown actor=unknown");
  });
});
