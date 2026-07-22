// xenios research member platform: shared contracts for the non-commerce
// member operating system (Website 2 lane, G2-G5 + G10).
//
// CONTRACT-FIRST FILE. Every payload here is frozen together with
// docs/agent-coordination/contracts/MEMBER_PLATFORM_API.md at the lane's first
// milestone so the Website (UI) and PowerShell (integration) sessions can build
// against it before the backend lands. Extend ADDITIVELY; breaking changes go
// through the coordinator.
//
// Conventions (match merged code):
// - Success envelope { ok: true, ... }; denials { ok: false, code }.
// - The application state machine lives in membership-types.ts and is frozen;
//   this file builds ON TOP of it and never redefines it.
// - Dates are ISO-8601 strings in UTC. Ids are opaque strings.
// - No zod here: shared contracts are dependency-free types plus const arrays,
//   like membership-types.ts. Server-side request validation owns zod.

import type { ApplicationStatus, MemberBillingState, MemberStatus } from "./membership-types";

// ---------------------------------------------------------------------------
// Envelope + denial codes
// ---------------------------------------------------------------------------

export type MemberPlatformOk<T> = { ok: true } & T;
export type MemberPlatformErr = {
  ok: false;
  code: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};
export type MemberPlatformResponse<T> = MemberPlatformOk<T> | MemberPlatformErr;

// Denial codes the UI must route on (superset of the merged guard codes).
export const MEMBER_PLATFORM_DENIAL_CODES = [
  "activation_required",
  "billing_past_due",
  "membership_inactive",
  "recovery_session",
  "admin_required",
  "not_found",
  "validation_failed",
  "state_conflict",
  "rate_limited",
  "capability_disabled",
] as const;
export type MemberPlatformDenialCode = (typeof MEMBER_PLATFORM_DENIAL_CODES)[number];

// ---------------------------------------------------------------------------
// Capability states (G0 contract: member-safe booleans only)
// ---------------------------------------------------------------------------

export const MEMBER_PLATFORM_CAPABILITIES = [
  "identity_verification",
  "private_media",
  "telegram_support",
  "infinity_events",
  "document_rendering",
] as const;
export type MemberPlatformCapability = (typeof MEMBER_PLATFORM_CAPABILITIES)[number];

export type CapabilityStatusView = { enabled: boolean };
export type MemberCapabilitiesPayload = {
  capabilities: Record<MemberPlatformCapability, CapabilityStatusView>;
};

// Admin diagnostics carry names and states only, never values.
export type AdminCapabilityDiagnostic = {
  capability: MemberPlatformCapability;
  state: "enabled" | "disabled" | "misconfigured" | "pending_credentials" | "pending_approval";
  missingEnvironmentVariables: string[];
  missingApprovals: string[];
  checkedAt: string;
};

// ---------------------------------------------------------------------------
// Member overview (the dashboard head payload)
// ---------------------------------------------------------------------------

export type MemberOverview = {
  memberId: string;
  preferredName: string;
  memberStatus: MemberStatus;
  billingState: MemberBillingState;
  applicationStatus: ApplicationStatus;
  assessment: AssessmentStatusSummary;
  blueprint: { state: BlueprintState; updatedAt: string | null };
  currentXenios30: { planId: string; monthLabel: string; state: PlanPublicationState } | null;
  currentXenios90: { planId: string; phase: Xenios90Phase; state: PlanPublicationState } | null;
  unacknowledgedDocuments: number;
  openQuestions: number;
  trackerUnlocked: boolean;
  nextAction: { key: MemberNextActionKey; label: string; dueAt: string | null } | null;
};

export const MEMBER_NEXT_ACTION_KEYS = [
  "complete_assessment",
  "review_blueprint",
  "acknowledge_document",
  "monthly_check_in",
  "answer_information_request",
  "none",
] as const;
export type MemberNextActionKey = (typeof MEMBER_NEXT_ACTION_KEYS)[number];

// ---------------------------------------------------------------------------
// Member profile (structured, version-safe sections; sensitive split)
// ---------------------------------------------------------------------------

export const PROFILE_SECTION_KEYS = [
  "basic_information",
  "goals",
  "body_and_routine",
  "fitness",
  "nutrition",
  "sleep",
  "energy",
  "stress",
  "current_products",
  "allergies_and_restrictions",
  "basic_safety_context",
  "budget",
  "routine_complexity",
  "format_preferences",
  "communication_preferences",
  "media_settings",
  "privacy_choices",
] as const;
export type ProfileSectionKey = (typeof PROFILE_SECTION_KEYS)[number];

// Sections carrying health-adjacent content; served only through the
// sensitive-profile endpoint and never included in the ordinary account view.
export const SENSITIVE_PROFILE_SECTIONS: readonly ProfileSectionKey[] = [
  "body_and_routine",
  "sleep",
  "energy",
  "stress",
  "current_products",
  "allergies_and_restrictions",
  "basic_safety_context",
] as const;

export type ProfileSection = {
  key: ProfileSectionKey;
  schemaVersion: number;
  // Section payloads are structured objects validated server-side against the
  // section's schema version; the shared contract keeps them opaque.
  data: Record<string, unknown>;
  updatedAt: string;
};

export type MemberProfileView = {
  memberId: string;
  sections: ProfileSection[];
  completeness: { completedSections: number; totalSections: number };
};

export type ProfileUpdateRequest = {
  section: ProfileSectionKey;
  schemaVersion: number;
  data: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Assessment (versioned definition, autosave, submission, 3-day deadline)
// ---------------------------------------------------------------------------

export const ASSESSMENT_MODES = ["initial", "monthly_check_in"] as const;
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];

export type AssessmentQuestionKind =
  | "single_choice"
  | "multi_choice"
  | "scale"
  | "number"
  | "short_text"
  | "long_text";

export type AssessmentQuestion = {
  id: string;
  sectionId: string;
  kind: AssessmentQuestionKind;
  prompt: string;
  required: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  unit?: string;
  // Adaptive branching: the question is shown only when every condition holds.
  showWhen?: { questionId: string; equals: string[] }[];
  consentRef?: string; // agreement key gating this question block, if any
};

export type AssessmentSection = {
  id: string;
  title: string;
  order: number;
  questions: AssessmentQuestion[];
};

export type AssessmentDefinition = {
  definitionId: string;
  version: number;
  mode: AssessmentMode;
  targetMinutes: number;
  sections: AssessmentSection[];
};

export type AssessmentAnswer = {
  questionId: string;
  value: string | number | string[] | null;
};

export type AssessmentAutosaveRequest = {
  definitionId: string;
  definitionVersion: number;
  answers: AssessmentAnswer[]; // partial set; server merges by questionId
  clientSavedAt: string;
};

export type AssessmentResponseState = {
  responseId: string;
  definitionId: string;
  definitionVersion: number;
  mode: AssessmentMode;
  status: "not_started" | "in_progress" | "submitted";
  answers: AssessmentAnswer[];
  startedAt: string | null;
  lastSavedAt: string | null;
  submittedAt: string | null;
};

export type AssessmentStatusSummary = {
  required: boolean;
  status: "not_started" | "in_progress" | "submitted";
  dueAt: string | null; // activation time + 3 days for the initial assessment
  overdue: boolean;
  remindersSent: number;
};

export type AssessmentSubmitRequest = {
  definitionId: string;
  definitionVersion: number;
  confirmReviewed: true; // member confirmed the review-before-submit screen
};

// ---------------------------------------------------------------------------
// Recommendation + Blueprint (transparent, explained, never dosing)
// ---------------------------------------------------------------------------

export const BLUEPRINT_STATES = [
  "not_started",
  "assessment_due",
  "assessment_submitted",
  "preliminary",
  "samuel_review",
  "more_information_needed",
  "published",
  "updated",
] as const;
export type BlueprintState = (typeof BLUEPRINT_STATES)[number];

export const BLUEPRINT_TRANSITIONS: Record<BlueprintState, BlueprintState[]> = {
  not_started: ["assessment_due"],
  assessment_due: ["assessment_submitted"],
  assessment_submitted: ["preliminary"],
  preliminary: ["samuel_review"],
  samuel_review: ["more_information_needed", "published"],
  more_information_needed: ["samuel_review", "assessment_submitted"],
  published: ["updated", "samuel_review"],
  updated: ["samuel_review"],
};

// A recommendation item always explains itself and never carries dosing,
// administration, or treatment language. `disposition` is the only vocabulary
// for availability.
export type RecommendationDisposition =
  | "recommended"
  | "optional"
  | "excluded"
  | "duplicate_warning"
  | "possible_research_pathway"
  | "needs_samuel_review"
  | "not_available";

export type RecommendationItem = {
  id: string;
  kind: "lifestyle" | "fitness_program" | "nutrition_program" | "supplement_foundation" | "product_option" | "research_pathway";
  title: string;
  disposition: RecommendationDisposition;
  explanation: string; // why this appears, in plain language
  sourceSignals: string[]; // which profile/assessment inputs produced it
};

export type BlueprintView = {
  blueprintId: string;
  state: BlueprintState;
  version: number;
  primaryGoal: string;
  secondaryGoals: string[];
  topPriorities: [string, string, string] | string[];
  recommendations: RecommendationItem[];
  questionsForReview: string[]; // items the engine flagged for Samuel
  confidence: "low" | "medium" | "high";
  reviewedBy: string | null; // display name only; server enforces identity
  publishedAt: string | null;
  supersededByVersion: number | null;
  memberAcknowledgedAt: string | null;
};

export type BlueprintAcknowledgeRequest = { blueprintId: string; version: number };

// Samuel-only review actions (server-authorized; the browser never picks
// arbitrary states).
export type BlueprintReviewAction =
  | { action: "approve_and_publish"; comment?: string }
  | { action: "request_information"; memberVisibleMessage: string; internalNote?: string }
  | { action: "revise"; internalNote: string };

// ---------------------------------------------------------------------------
// Xenios 30 / Xenios 90 plans
// ---------------------------------------------------------------------------

export const PLAN_PUBLICATION_STATES = [
  "draft",
  "samuel_review",
  "published",
  "superseded",
  "archived",
] as const;
export type PlanPublicationState = (typeof PLAN_PUBLICATION_STATES)[number];

export type Xenios30Plan = {
  planId: string;
  monthLabel: string; // e.g. "2026-08"
  state: PlanPublicationState;
  version: number;
  fitnessDocumentId: string | null;
  nutritionDocumentId: string | null;
  blueprintActions: string[];
  supplementFoundation: RecommendationItem[];
  productGuidance: RecommendationItem[];
  adherenceTargets: { key: string; label: string; target: string }[];
  trackerMetricKeys: TrackerMetricKey[];
  checkInDueAt: string | null;
  reviewedBy: string | null;
  publishedAt: string | null;
  memberAcknowledgedAt: string | null;
};

export const XENIOS_90_PHASES = ["foundation", "progression", "consolidation"] as const;
export type Xenios90Phase = (typeof XENIOS_90_PHASES)[number];

export type Xenios90Milestone = { id: string; label: string; targetMonth: 1 | 2 | 3; done: boolean };

export type Xenios90Plan = {
  planId: string;
  state: PlanPublicationState;
  version: number;
  currentPhase: Xenios90Phase;
  phaseGoals: Record<Xenios90Phase, string[]>;
  milestones: Xenios90Milestone[];
  monthlyVersions: { monthLabel: string; xenios30PlanId: string }[];
  publishedAt: string | null;
};

// Monthly Review Week + the one included early plan change.
export type MonthlyReviewState = {
  reviewWeekStart: string | null;
  checkInStatus: "not_due" | "due" | "submitted" | "reviewed" | "published";
  earlyChangeUsedThisMonth: boolean;
  slaDeadline: string | null; // publish within 48 elapsed hours of check-in
};

export type EarlyPlanChangeRequest = { reason: string };

// ---------------------------------------------------------------------------
// Documents (records + private signed access + acknowledgment)
// ---------------------------------------------------------------------------

export const PLAN_DOCUMENT_TYPES = [
  "blueprint_pdf",
  "fitness_plan_pdf",
  "nutrition_plan_pdf",
  "xenios90_roadmap_pdf",
  "other",
] as const;
export type PlanDocumentType = (typeof PLAN_DOCUMENT_TYPES)[number];

export type PlanDocument = {
  documentId: string;
  type: PlanDocumentType;
  title: string;
  version: number;
  templateVersion: string;
  checksumSha256: string;
  status: "current" | "archived";
  supersedesDocumentId: string | null;
  reviewedBy: string | null;
  publishedAt: string;
  acknowledgedAt: string | null;
};

// Signed access: the server returns a short-lived signed URL; documents are
// never emailed as ordinary attachments and never publicly addressable.
export type DocumentAccessRequest = { documentId: string };
export type DocumentAccessGrant = {
  documentId: string;
  signedUrl: string;
  expiresAt: string;
};

export type DocumentAcknowledgeRequest = { documentId: string; version: number };

// ---------------------------------------------------------------------------
// Tracker observations (six domains; no single mystery score)
// ---------------------------------------------------------------------------

export const TRACKER_METRIC_KEYS = [
  "plan_adherence",
  "body_and_appearance",
  "sleep_and_recovery",
  "energy_stress_vitality",
  "performance_and_function",
  "data_completeness",
] as const;
export type TrackerMetricKey = (typeof TRACKER_METRIC_KEYS)[number];

export const OBSERVATION_SOURCES = ["manual", "voice_note", "photo", "video", "system"] as const;
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

export type TrackerObservation = {
  observationId: string;
  metricKey: TrackerMetricKey;
  source: ObservationSource;
  recordedAt: string;
  timezone: string;
  unit: string | null;
  originalValue: string | number;
  normalizedValue: number | null;
  confidence: "low" | "medium" | "high";
  notes: string | null;
  planId: string | null;
  createdAt: string;
};

export type TrackerObservationInput = {
  metricKey: TrackerMetricKey;
  recordedAt: string;
  timezone: string;
  unit?: string;
  value: string | number;
  notes?: string;
  planId?: string;
};

export type TrackerProgressView = {
  unlocked: boolean;
  windowDays: 7 | 30 | 90;
  metrics: {
    metricKey: TrackerMetricKey;
    observations: TrackerObservation[];
    textSummary: string; // accessibility: every chart has a text summary
  }[];
};

// ---------------------------------------------------------------------------
// Private media (photos, voice, video; elections; signed access)
// ---------------------------------------------------------------------------

export const PRIVATE_MEDIA_KINDS = [
  "progress_photo",
  "voice_note",
  "exercise_video",
] as const;
export type PrivateMediaKind = (typeof PRIVATE_MEDIA_KINDS)[number];

export const MEDIA_PROCESSING_STATES = [
  "uploaded",
  "scanning",
  "processing",
  "processed",
  "processing_failed",
  "deleted",
] as const;
export type MediaProcessingState = (typeof MEDIA_PROCESSING_STATES)[number];

// The member's standing election for raw media. There is no automatic-delete
// default; the member chooses at first upload and can change it later. A
// failed processing job NEVER deletes the only safe copy.
export const RETENTION_ELECTIONS = ["retain_raw", "delete_raw_after_processing"] as const;
export type RetentionElection = (typeof RETENTION_ELECTIONS)[number];

export type PrivateMediaRecord = {
  mediaId: string;
  kind: PrivateMediaKind;
  processingState: MediaProcessingState;
  retentionElection: RetentionElection;
  hasFaceBlurredDerivative: boolean;
  hasTranscript: boolean;
  durationSeconds: number | null; // voice/video capped at 60
  capturedAt: string | null;
  uploadedAt: string;
  rawDeletedAt: string | null;
};

export type MediaUploadIntentRequest = {
  kind: PrivateMediaKind;
  contentType: string;
  contentLengthBytes: number;
  capturedAt?: string;
  retentionElection?: RetentionElection; // required on first upload
  requestFaceBlur?: boolean; // photos only; blur is processing, not recognition
};

export type MediaUploadIntentGrant = {
  mediaId: string;
  uploadUrl: string; // signed, single-use
  expiresAt: string;
  maxBytes: number;
};

export type MediaAccessGrant = {
  mediaId: string;
  variant: "raw" | "face_blurred" | "transcript";
  signedUrl: string;
  expiresAt: string;
};

// ---------------------------------------------------------------------------
// Questions and support (statuses, ratings, follow-ups; no queue numbers)
// ---------------------------------------------------------------------------

export const QUESTION_STATUSES = [
  "pending",
  "being_reviewed",
  "more_information_needed",
  "answer_ready",
  "completed",
] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const QUESTION_CATEGORIES = [
  "plan",
  "product",
  "account",
  "shipping",
  "privacy",
  "other",
] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export type MemberQuestion = {
  questionId: string;
  category: QuestionCategory;
  status: QuestionStatus;
  source: "web" | "telegram_text" | "telegram_voice";
  bodyText: string | null; // voice questions carry a transcript reference instead
  transcriptMediaId: string | null;
  answerText: string | null;
  answeredAt: string | null;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  followUpOfQuestionId: string | null; // closed questions get linked follow-ups
  createdAt: string;
  slaTargetAt: string | null; // approximately 12 hours; a target, not a promise
};

export type QuestionCreateRequest = {
  category: QuestionCategory;
  bodyText: string;
  followUpOfQuestionId?: string;
};

export type QuestionRateRequest = { questionId: string; rating: 1 | 2 | 3 | 4 | 5 };

// ---------------------------------------------------------------------------
// Telegram linking (one-time token; Telegram is never the system of record)
// ---------------------------------------------------------------------------

export type TelegramLinkStart = {
  linkToken: string; // single-use, short-lived; shown once
  expiresAt: string;
  botUsername: string | null; // null while the capability is disabled
};

export type TelegramLinkState = {
  linked: boolean;
  linkedAt: string | null;
  telegramDisplayName: string | null; // display only; never IDs or tokens
};

// ---------------------------------------------------------------------------
// Samuel admin queues (server-authorized; step-up marked, never self-granted)
// ---------------------------------------------------------------------------

export const ADMIN_QUEUE_KEYS = [
  "applications",
  "identity_status",
  "agreement_status",
  "assessment_due",
  "blueprint_review",
  "monthly_plan_review",
  "questions",
  "account_blocks",
  "privacy_requests",
  "security_events",
  "sla_risk",
  "product_concerns",
] as const;
export type AdminQueueKey = (typeof ADMIN_QUEUE_KEYS)[number];

export type AdminQueueItem = {
  itemId: string;
  queue: AdminQueueKey;
  subjectRef: string; // opaque member/application reference, never PII in lists
  safeSummary: string;
  priority: "critical" | "high" | "normal";
  slaDeadline: string | null;
  requiresStepUp: boolean;
  createdAt: string;
};

export type AdminQueuePage = {
  queue: AdminQueueKey;
  items: AdminQueueItem[];
  nextCursor: string | null;
  total: number;
};

// ---------------------------------------------------------------------------
// SLA + Infinity event boundary (safe payloads only)
// ---------------------------------------------------------------------------

export const SLA_KINDS = [
  "assessment_deadline",
  "blueprint_review",
  "monthly_plan_review",
  "question_response",
] as const;
export type SlaKind = (typeof SLA_KINDS)[number];

export const INFINITY_EVENT_TYPES = [
  "research.review.sla_at_risk",
  "research.review.overdue",
  "research.question.response_due",
  "research.question.overdue",
  "research.assessment.overdue",
  "research.security.account_event",
  "research.privacy.request_received",
] as const;
export type InfinityEventType = (typeof INFINITY_EVENT_TYPES)[number];

// Infinity payloads carry opaque references and safe summaries only: never raw
// health answers, private media, tokens, or member contact details.
export type InfinityEvent = {
  eventId: string;
  type: InfinityEventType;
  priority: "critical" | "high" | "normal";
  subjectRef: string;
  safeSummary: string;
  slaDeadline: string | null;
  adminTarget: string; // admin route link or opaque target
  emittedAt: string;
};
