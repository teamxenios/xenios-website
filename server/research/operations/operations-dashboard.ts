export type OperationsMetricKey =
  | "pending_applications"
  | "pending_activation"
  | "payment_verification"
  | "paid_orders"
  | "ready_fulfillment"
  | "overdue_acknowledgement"
  | "shipping_today"
  | "late_orders"
  | "exceptions"
  | "low_inventory"
  | "quarantined_lots"
  | "missing_coas"
  | "affiliate_applications"
  | "active_affiliates"
  | "commissions"
  | "payouts"
  | "professional_applications"
  | "active_professional_accounts"
  | "notification_failures";

export interface OperationsMetric {
  key: OperationsMetricKey;
  label: string;
  value: number;
  href: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
}

export interface OperationsDashboardInput extends Record<OperationsMetricKey, number> {
  generatedAt: string;
}

const DEFINITIONS: ReadonlyArray<Omit<OperationsMetric, "value">> = [
  { key: "pending_applications", label: "Pending applications", href: "/admin/research/applications?queue=pending", tone: "warning" },
  { key: "pending_activation", label: "Pending activation", href: "/admin/research/activation?queue=pending", tone: "warning" },
  { key: "payment_verification", label: "Payment verification", href: "/admin/research/activation?queue=payment", tone: "warning" },
  { key: "paid_orders", label: "Paid orders", href: "/admin/research/orders?status=paid", tone: "info" },
  { key: "ready_fulfillment", label: "Ready for fulfillment", href: "/operations/mitch?queue=awaiting_acknowledgement", tone: "info" },
  { key: "overdue_acknowledgement", label: "Overdue acknowledgment", href: "/operations/mitch?queue=awaiting_acknowledgement&overdue=true", tone: "danger" },
  { key: "shipping_today", label: "Shipping today", href: "/operations/mitch?queue=due_today", tone: "info" },
  { key: "late_orders", label: "Late orders", href: "/admin/research/orders?status=late", tone: "danger" },
  { key: "exceptions", label: "Exceptions", href: "/operations/mitch?queue=exceptions", tone: "danger" },
  { key: "low_inventory", label: "Low inventory", href: "/admin/research/inventory?queue=low", tone: "warning" },
  { key: "quarantined_lots", label: "Quarantined lots", href: "/admin/research/inventory?queue=quarantined", tone: "danger" },
  { key: "missing_coas", label: "Missing COAs", href: "/admin/research/inventory?queue=missing-coa", tone: "danger" },
  { key: "affiliate_applications", label: "Affiliate applications", href: "/admin/research/partners?queue=applications", tone: "warning" },
  { key: "active_affiliates", label: "Active affiliates", href: "/admin/research/partners?status=active", tone: "success" },
  { key: "commissions", label: "Commission items", href: "/admin/research/partners?queue=commissions", tone: "info" },
  { key: "payouts", label: "Payouts", href: "/admin/research/partners?queue=payouts", tone: "info" },
  { key: "professional_applications", label: "Professional applications", href: "/admin/research/professionals?queue=applications", tone: "warning" },
  { key: "active_professional_accounts", label: "Active professional accounts", href: "/admin/research/professionals?status=active", tone: "success" },
  { key: "notification_failures", label: "Notification failures", href: "/admin/research/security?queue=notification-failures", tone: "danger" },
] as const;

export function buildOperationsDashboard(input: OperationsDashboardInput): {
  metrics: OperationsMetric[];
  generatedAt: string;
  priorityHref: string;
} {
  const metrics = DEFINITIONS.map((definition) => ({
    ...definition,
    value: Number.isFinite(input[definition.key]) ? Math.max(0, Math.trunc(input[definition.key])) : 0,
  }));
  const priority =
    metrics.find((metric) => metric.tone === "danger" && metric.value > 0) ??
    metrics.find((metric) => metric.tone === "warning" && metric.value > 0) ??
    metrics[0];
  return { metrics, generatedAt: input.generatedAt, priorityHref: priority.href };
}
