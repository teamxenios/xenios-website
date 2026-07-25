import { describe, expect, it } from "vitest";
import { buildOperationsDashboard, type OperationsDashboardInput } from "./operations-dashboard";

const input: OperationsDashboardInput = {
  generatedAt: "2026-07-25T16:00:00.000Z",
  pending_applications: 1,
  pending_activation: 2,
  payment_verification: 3,
  paid_orders: 4,
  ready_fulfillment: 5,
  overdue_acknowledgement: 6,
  shipping_today: 7,
  late_orders: 8,
  exceptions: 9,
  low_inventory: 10,
  quarantined_lots: 11,
  missing_coas: 12,
  affiliate_applications: 13,
  active_affiliates: 14,
  commissions: 15,
  payouts: 16,
  professional_applications: 17,
  active_professional_accounts: 18,
  notification_failures: 19,
};

describe("operations dashboard", () => {
  it("links every required metric to its underlying queue", () => {
    const dashboard = buildOperationsDashboard(input);
    expect(dashboard.metrics).toHaveLength(19);
    for (const metric of dashboard.metrics) {
      expect(metric.href).toMatch(/^\//);
      expect(metric.href).toMatch(/queue=|status=/);
      expect(metric.value).toBe(input[metric.key]);
    }
  });

  it("makes the first populated danger queue the single primary action", () => {
    expect(buildOperationsDashboard(input).priorityHref).toContain("overdue=true");
  });
});
