import { normalizeDeclaredReferralInput, type DeclaredReferralInput } from "./request-intent/referral-input";
/** Optional request context. Reported facts never establish attribution or eligibility. */
export const REQUEST_GOALS = {
  compare_options: "Compare product options",
  understand_details: "Understand the product details",
  check_availability: "Check availability",
  ask_about_process: "Understand how the request process works",
} as const;
export type RequestGoal = keyof typeof REQUEST_GOALS;
export type ReferralChoice = Readonly<{ mode: "use_saved"; admissionRevision: string }>
  | Readonly<{ mode: "replace" } & DeclaredReferralInput>
  | Readonly<{ mode: "omit" }>;
export type OptionalRequestIntake = Readonly<{
  goal?: RequestGoal; referralName?: string; referralCode?: string; referralChoice?: ReferralChoice;
}>;
function dataObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== "string" || !allowed.includes(key)
      || !("value" in Object.getOwnPropertyDescriptor(value, key)!))) throw new Error("invalid_optional_intake");
  // Copy into a null-prototype object so omitted fields cannot be supplied by
  // a polluted Object.prototype after the descriptor checks above.
  const row: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) row[key] = descriptor.value;
  return row;
}
export function normalizeReferralChoice(value: unknown): ReferralChoice {
  const row = dataObject(value, ["mode", "admissionRevision", "referralName", "referralCode"]);
  if (row.mode === "omit" && Object.keys(row).length === 1) return { mode: "omit" };
  if (row.mode === "use_saved" && Object.keys(row).length === 2
    && typeof row.admissionRevision === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.admissionRevision))
    return { mode: "use_saved", admissionRevision: row.admissionRevision.toLowerCase() };
  if (row.mode === "replace" && !Object.hasOwn(row, "admissionRevision")) {
    const facts = normalizeDeclaredReferralInput({ referralName: row.referralName, referralCode: row.referralCode });
    if (facts) return { mode: "replace", ...facts };
  }
  throw new Error("invalid_optional_intake");
}
/** undefined = skipped/legacy. Values never grant access, trigger recommendations, or resolve a referrer. */
export function normalizeOptionalIntake(value: unknown): OptionalRequestIntake | undefined {
  if (value === undefined) return undefined;
  const row = dataObject(value, ["goal", "referralName", "referralCode", "referralChoice"]);
  if (row.goal !== undefined && (typeof row.goal !== "string" || !Object.prototype.hasOwnProperty.call(REQUEST_GOALS, row.goal)))
    throw new Error("invalid_optional_intake");
  const facts = normalizeDeclaredReferralInput({ referralName: row.referralName, referralCode: row.referralCode });
  const referralChoice = row.referralChoice === undefined ? undefined : normalizeReferralChoice(row.referralChoice);
  if (referralChoice && (Object.hasOwn(row, "referralName") || Object.hasOwn(row, "referralCode"))) throw new Error("invalid_optional_intake");
  return row.goal || facts || referralChoice ? {
    ...(row.goal ? { goal: row.goal as RequestGoal } : {}),
    ...facts,
    ...(referralChoice ? { referralChoice } : {}),
  } : undefined;
}
