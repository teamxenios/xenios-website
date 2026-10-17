export const CARE_SURFACE_STATES = [
  "loading",
  "empty",
  "error",
  "pending",
  "unavailable",
  "disabled",
  "success",
] as const;

export type CareSurfaceStateKind = (typeof CARE_SURFACE_STATES)[number];

export interface CareSurfaceContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly live: "off" | "polite" | "assertive";
}

const CONTENT: Readonly<Record<CareSurfaceStateKind, CareSurfaceContent>> = {
  loading: {
    eyebrow: "STATUS CHECK",
    title: "Confirming Care availability",
    description: "Care remains unavailable while its status is confirmed.",
    live: "polite",
  },
  empty: {
    eyebrow: "NO INFORMATION AVAILABLE",
    title: "There is nothing to review",
    description: "No Care record or clinical activity is available in this view.",
    live: "polite",
  },
  error: {
    eyebrow: "STATUS UNAVAILABLE",
    title: "Care status could not be confirmed",
    description: "No Care service or clinical action is available while status is unavailable.",
    live: "assertive",
  },
  pending: {
    eyebrow: "DOCUMENTATION PENDING",
    title: "Care is being prepared",
    description: "Required clinical, privacy, and operational documentation has not been approved.",
    live: "polite",
  },
  unavailable: {
    eyebrow: "UNAVAILABLE",
    title: "Care is not available",
    description: "No treatment, prescription, appointment, or medical advice is available here.",
    live: "polite",
  },
  disabled: {
    eyebrow: "CARE DISABLED",
    title: "Care is not active",
    description: "Care remains disabled until every required authorization and readiness gate is approved.",
    live: "polite",
  },
  success: {
    eyebrow: "STATUS CONFIRMED",
    title: "This information is ready to review",
    description: "This presentation state does not enable a Care service or clinical action.",
    live: "polite",
  },
};

export function isCareSurfaceStateKind(value: unknown): value is CareSurfaceStateKind {
  return typeof value === "string" && CARE_SURFACE_STATES.includes(value as CareSurfaceStateKind);
}

export function careSurfaceContent(value: unknown): CareSurfaceContent {
  return CONTENT[isCareSurfaceStateKind(value) ? value : "unavailable"];
}

export const CARE_BOUNDARY_KINDS = ["clinical", "emergency", "privacy"] as const;
export type CareBoundaryKind = (typeof CARE_BOUNDARY_KINDS)[number];

export interface CareBoundaryContent {
  readonly label: string;
  readonly title: string;
  readonly description: string;
}

const BOUNDARIES: Readonly<Record<CareBoundaryKind, CareBoundaryContent>> = {
  clinical: {
    label: "CLINICAL BOUNDARY",
    title: "No clinical service is active",
    description: "This interface does not provide diagnosis, treatment, prescribing, or medical advice.",
  },
  emergency: {
    label: "EMERGENCY BOUNDARY",
    title: "This site is not emergency care",
    description: "For an emergency, contact local emergency services now.",
  },
  privacy: {
    label: "PRIVACY BOUNDARY",
    title: "Research access does not authorize Care",
    description: "Research information is kept separate and does not grant access to clinical records or actions.",
  },
};

export function careBoundaryContent(value: unknown): CareBoundaryContent {
  return BOUNDARIES[
    typeof value === "string" && CARE_BOUNDARY_KINDS.includes(value as CareBoundaryKind)
      ? (value as CareBoundaryKind)
      : "clinical"
  ];
}
