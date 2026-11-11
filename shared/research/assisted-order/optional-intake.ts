/** Optional request context. The code is customer-reported, not attribution or eligibility. */
export const REQUEST_GOALS = {
  compare_options: "Compare product options",
  understand_details: "Understand the product details",
  check_availability: "Check availability",
  ask_about_process: "Understand how the request process works",
} as const;
export type RequestGoal = keyof typeof REQUEST_GOALS;
export type OptionalRequestIntake = Readonly<{ goal?: RequestGoal; referralCode?: string }>;
/** undefined = skipped/legacy. Values never grant access, trigger recommendations, or resolve a referrer. */
export function normalizeOptionalIntake(value: unknown): OptionalRequestIntake | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["goal", "referralCode"].includes(key))) throw new Error("invalid_optional_intake");
  const row = value as Record<string, unknown>;
  if (row.goal !== undefined && (typeof row.goal !== "string" || !Object.prototype.hasOwnProperty.call(REQUEST_GOALS, row.goal)))
    throw new Error("invalid_optional_intake");
  if (row.referralCode !== undefined && (typeof row.referralCode !== "string" || row.referralCode.length > 32))
    throw new Error("invalid_optional_intake");
  const code = typeof row.referralCode === "string" ? row.referralCode.trim() : "";
  if (code && !/^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/.test(code)) throw new Error("invalid_optional_intake");
  return row.goal || code ? {
    ...(row.goal ? { goal: row.goal as RequestGoal } : {}),
    ...(code ? { referralCode: code } : {}),
  } : undefined;
}
