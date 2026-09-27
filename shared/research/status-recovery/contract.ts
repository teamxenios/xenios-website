export const STATUS_RECOVERY_NEUTRAL_MESSAGE =
  "If the details match an eligible order, we’ll send a secure status link to the email already associated with it.";

export const STATUS_RECOVERY_NEUTRAL_RESPONSE = Object.freeze({
  ok: true as const,
  message: STATUS_RECOVERY_NEUTRAL_MESSAGE,
});

export const STATUS_RECOVERY_EMAIL_LIFETIME_MINUTES = 30;
export const STATUS_RECOVERY_SESSION_LIFETIME_HOURS = 24;

export type StatusRecoverySubjectType = "assisted_order";

export type StatusRecoveryRequestInput = Readonly<{
  reference: string;
  email: string;
}>;

export type StatusRecoveryExchangeInput = Readonly<{
  token: string;
}>;

export type StatusRecoveryTimelineItem = Readonly<{
  status: string;
  occurredAt: string;
  customerMessage: string | null;
}>;

export type StatusRecoveryStatusView = Readonly<{
  subjectType: StatusRecoverySubjectType;
  reference: string;
  status: string;
  statusLabel: string;
  whatHappened: string;
  nextStep: string;
  nextStepOwner: "customer" | "xenios";
  returnPath: "/status";
  supportPath: "/support";
  updatedAt: string;
  timeline: readonly StatusRecoveryTimelineItem[];
}>;

export function normalizeStatusRecoveryReference(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function normalizeStatusRecoveryEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isEligibleStatusRecoveryReference(value: string): boolean {
  return /^XRR-\d{8}-[0-9A-F]{10}$/u.test(value);
}

export function isCareStyleReference(value: string): boolean {
  return /^CARE-[A-Z0-9-]{4,64}$/u.test(value);
}

export function isStatusRecoveryEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

export function isStatusRecoveryToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);
}
