import { z } from "zod";

export const CARE_MANUAL_ACCESS_STATUS_PATH = "/api/care/access-request/status";
export const CARE_MANUAL_ACCESS_REQUEST_PATH = "/api/care/access-request";
export const CARE_MANUAL_ACCESS_SOURCE_PAGE = "/care/schedule";

export const CARE_US_STATE_VALUES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA",
  "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX",
  "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export const CARE_US_STATE_LABELS: Record<(typeof CARE_US_STATE_VALUES)[number], string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

export const CARE_GOAL_VALUES = [
  "new_care_request",
  "care_questions",
  "existing_request_support",
  "not_sure",
] as const;

export type CareGoal = (typeof CARE_GOAL_VALUES)[number];

export const CARE_GOAL_LABELS: Record<CareGoal, string> = {
  new_care_request: "I want to start a new Care request",
  care_questions: "I have questions before I start",
  existing_request_support: "I need help with an existing request",
  not_sure: "I am not sure yet",
};

export const CARE_CONTACT_METHOD_VALUES = ["email", "phone", "text"] as const;
export type CareContactMethod = (typeof CARE_CONTACT_METHOD_VALUES)[number];

export const CARE_CONTACT_METHOD_LABELS: Record<CareContactMethod, string> = {
  email: "Email",
  phone: "Phone call",
  text: "Text message",
};

export const CARE_CONTACT_WINDOW_VALUES = [
  "morning",
  "afternoon",
  "evening",
  "anytime",
] as const;
export type CareContactWindow = (typeof CARE_CONTACT_WINDOW_VALUES)[number];

export const CARE_CONTACT_WINDOW_LABELS: Record<CareContactWindow, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  anytime: "Any time",
};

const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

export const careManualAccessRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: optionalTrimmedString(40).refine(
    (value) => value === undefined || /^[+()0-9 .-]{7,40}$/u.test(value),
    "Enter a valid phone number.",
  ),
  locationState: z.enum(CARE_US_STATE_VALUES),
  careGoal: z.enum(CARE_GOAL_VALUES),
  contactMethod: z.enum(CARE_CONTACT_METHOD_VALUES),
  contactWindow: z.enum(CARE_CONTACT_WINDOW_VALUES),
  adultConfirmation: z.literal(true),
  boundaryAcknowledgement: z.literal(true),
  website: optionalTrimmedString(200),
  turnstileToken: optionalTrimmedString(2048),
}).strict().superRefine((value, context) => {
  if (value.contactMethod !== "email" && !value.phone) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phone"],
      message: "A phone number is required for calls or text messages.",
    });
  }
});

export type CareManualAccessRequest = z.infer<typeof careManualAccessRequestSchema>;

export type CareManualAccessAvailability = Readonly<{
  ok: true;
  acceptingRequests: boolean;
  workflow: "manual_human_follow_up";
  typicalResponse: "one_business_day";
  clinicalHandoff: "separate_secure_step_after_review";
}>;

export type CareManualAccessResponse = Readonly<{
  ok: true;
  reference: string;
  saved: true;
  confirmationSent: boolean;
}>;
