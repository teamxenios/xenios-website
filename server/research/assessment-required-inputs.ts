import type { Express } from "express";
import type { PrelaunchRole } from "@shared/research/prelaunch";
import type { RequiredInputDefinition } from "@shared/research/required-inputs";
import {
  buildPrelaunchGuard,
  type PrelaunchDependencies,
} from "./prelaunch";

export const ASSESSMENT_REQUIRED_INPUT_DOMAIN = "research_assessment";

const ADMIN_ENTRY_HREF =
  "/admin/research/required-inputs?domain=research_assessment";

// These are reviewed domain definitions, not persisted required-input rows.
// Website 2 retains authority to create canonical rows, approve a manifest,
// and advance the canonical launch state through the shared admin routes.
export const ASSESSMENT_REQUIRED_INPUT_DEFINITIONS = [
  {
    key: "research_assessment.consent.approved_content",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "SENSITIVE HEALTH DATA CONSENT CONTENT REQUIRED",
    description:
      "Counsel-approved content for the separate XR-MEM-012 consent presented before Assessment collection.",
    whyRequired:
      "Health-adjacent Assessment answers cannot be collected without approved, immutable consent content.",
    recordType: "agreement_definition",
    recordId: "XR-MEM-012",
    fieldPath: "content",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Independent review confirms the approved content is published as the exact XR-MEM-012 definition.",
    evidenceRequired: [
      "Counsel-approved consent content",
      "Published agreement definition",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Assessment collection remains disabled and stores no health-adjacent answers.",
    nextAction:
      "Link the approved XR-MEM-012 content record and submit it for independent review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.consent.effective_date",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "SENSITIVE HEALTH DATA CONSENT EFFECTIVE DATE REQUIRED",
    description:
      "The approved effective date for the published XR-MEM-012 consent definition.",
    whyRequired:
      "The server rejects draft or future consent definitions before collecting Assessment answers.",
    recordType: "agreement_definition",
    recordId: "XR-MEM-012",
    fieldPath: "effectiveDate",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Independent review confirms the effective date belongs to the approved published definition.",
    evidenceRequired: [
      "Approved effective date",
      "Published definition reference",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Assessment collection remains disabled until the consent is effective.",
    nextAction:
      "Link the approved effective-date record and submit it for review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.consent.content_hash",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "SENSITIVE HEALTH DATA CONSENT HASH VERIFICATION REQUIRED",
    description:
      "Verification that the stored content hash matches the exact XR-MEM-012 text presented to members.",
    whyRequired:
      "An acceptance must bind to the immutable content the member actually reviewed.",
    recordType: "agreement_definition",
    recordId: "XR-MEM-012",
    fieldPath: "contentHash",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Recompute the approved content hash and compare it with the published definition and acceptance presentation.",
    evidenceRequired: [
      "Recomputed content hash",
      "Published definition hash",
      "Acceptance presentation verification",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Assessment collection remains disabled when the content identity cannot be verified.",
    nextAction:
      "Link the hash-verification evidence and submit it for independent review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.configuration.collection_approval",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "ASSESSMENT COLLECTION APPROVAL REQUIRED",
    description:
      "Operational approval that the published consent, privacy controls, persistence, and support boundary are ready for collection.",
    whyRequired:
      "A browser flag cannot authorize health-data collection; the server must remain fail closed until the real launch decision is reviewed.",
    recordType: "assessment_configuration",
    recordId: "initial-v2",
    fieldPath: "collectionApproval",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Independent release review confirms consent readiness, privacy controls, production persistence, and server configuration.",
    evidenceRequired: [
      "Consent readiness verification",
      "Privacy and persistence verification",
      "Server configuration approval",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "The live Assessment remains truthfully unavailable and stores no answers.",
    nextAction:
      "Link the approved collection-readiness record and submit it for review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.trainer.qualified_identity",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "QUALIFIED TRAINER IDENTITY REQUIRED",
    description:
      "The verified internal identity authorized to receive a minimum-necessary trainer plan brief.",
    whyRequired:
      "A member Assessment cannot be assigned to an invented or unverified trainer.",
    recordType: "trainer_assignment_configuration",
    recordId: null,
    fieldPath: "trainerIdentity",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Independent review confirms the identity is real, authorized, and eligible for the assigned Research scope.",
    evidenceRequired: [
      "Verified internal identity",
      "Approved Research role assignment",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Trainer assignment remains unavailable until a qualified identity is verified.",
    nextAction:
      "Link the qualified trainer identity and submit it for independent review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.trainer.active_state",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "TRAINER ACTIVE STATE REQUIRED",
    description:
      "The reviewed active-state record for the trainer eligible to receive new assignments.",
    whyRequired:
      "Inactive, expired, or revoked trainers must not receive Assessment-derived work.",
    recordType: "trainer_assignment_configuration",
    recordId: null,
    fieldPath: "activeState",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Independent review confirms the trainer role is active, unexpired, and not revoked.",
    evidenceRequired: [
      "Active role record",
      "Expiration and revocation review",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "New trainer assignments remain blocked while active status is unverified.",
    nextAction:
      "Link the current active-state record and submit it for review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.trainer.member_scope",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "TRAINER MEMBER SCOPE REQUIRED",
    description:
      "The approved minimum-necessary member scope available to the assigned trainer.",
    whyRequired:
      "Trainer access must not expose raw Assessment answers, unrelated member records, or clinical data.",
    recordType: "trainer_assignment_configuration",
    recordId: null,
    fieldPath: "memberScope",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Privacy review confirms the trainer projection contains only the approved plan-brief fields.",
    evidenceRequired: [
      "Minimum-necessary field map",
      "Authorization test evidence",
      "Privacy review approval",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Trainer access remains blocked until the member-data boundary is approved.",
    nextAction:
      "Link the approved trainer-safe field map and authorization evidence.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.trainer.assignment_owner",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "TRAINER ASSIGNMENT OWNER REQUIRED",
    description:
      "The accountable internal owner who assigns, reassigns, and revokes trainer ownership.",
    whyRequired:
      "Assignment changes require a real accountable operator and an auditable correction path.",
    recordType: "trainer_assignment_configuration",
    recordId: null,
    fieldPath: "assignmentOwner",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Independent review confirms the owner has the persisted role and documented assignment responsibility.",
    evidenceRequired: [
      "Persisted role assignment",
      "Assignment ownership approval",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Trainer assignment remains unavailable without an accountable owner.",
    nextAction:
      "Link the approved assignment owner and submit the record for review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.plan_review.qualified_reviewer",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "QUALIFIED PLAN REVIEWER REQUIRED",
    description:
      "The verified human reviewer authorized to evaluate and publish a member plan.",
    whyRequired:
      "Assessment-derived drafts must remain behind an authorized human review boundary.",
    recordType: "plan_review_configuration",
    recordId: null,
    fieldPath: "qualifiedReviewer",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Independent review confirms persisted reviewer authorization and the minimum-necessary access boundary.",
    evidenceRequired: [
      "Persisted reviewer role",
      "Reviewer authorization test evidence",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Plan review and publication remain unavailable without a qualified reviewer.",
    nextAction:
      "Link the qualified reviewer record and submit it for independent review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.plan_review.ownership",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "PLAN REVIEW OWNERSHIP REQUIRED",
    description:
      "The approved owner of the plan-review queue and each assignment lifecycle.",
    whyRequired:
      "Review items must fail closed when no authorized owner is responsible for the member plan.",
    recordType: "plan_review_configuration",
    recordId: null,
    fieldPath: "reviewOwnership",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Independent review confirms queue ownership, reassignment authority, and revoked-owner handling.",
    evidenceRequired: [
      "Queue ownership approval",
      "Reassignment and revocation procedure",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Unowned plan-review items cannot advance to publication.",
    nextAction:
      "Link the approved review owner and correction procedure.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.plan_review.independent_verification",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "PLAN REVIEW VERIFICATION OWNER REQUIRED",
    description:
      "The independent reviewer responsible for accepting or rejecting plan-review governance inputs.",
    whyRequired:
      "The same actor who enters a launch-blocking fact cannot verify it under the canonical workflow.",
    recordType: "plan_review_configuration",
    recordId: null,
    fieldPath: "verificationOwner",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Confirm an approved internal reviewer or distinct super administrator owns independent verification.",
    evidenceRequired: [
      "Persisted independent-review role",
      "Separation-of-duties approval",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Plan-review readiness cannot be verified without independent ownership.",
    nextAction:
      "Link the independent verification owner and submit the record for review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
  {
    key: "research_assessment.plan_review.correction_supersession",
    domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
    label: "PLAN CORRECTION AND SUPERSESSION POLICY REQUIRED",
    description:
      "The approved operating policy for correction requests, rejected drafts, revision, publication, and supersession.",
    whyRequired:
      "Member plans require a governed correction path that preserves prior versions and audit history.",
    recordType: "plan_review_configuration",
    recordId: null,
    fieldPath: "correctionAndSupersessionPolicy",
    blockingLevel: "blocks_public_launch",
    responsibleRole: "internal_team",
    verificationMethod:
      "Independent review confirms the policy matches the server-owned state transitions and immutable audit history.",
    evidenceRequired: [
      "Correction workflow approval",
      "Supersession policy",
      "State-transition test evidence",
    ],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    publicLaunchImpact:
      "Plan publication remains blocked until correction and supersession ownership is approved.",
    nextAction:
      "Link the approved correction and supersession policy and submit it for review.",
    adminEntryHref: ADMIN_ENTRY_HREF,
  },
] as const satisfies readonly RequiredInputDefinition[];

export const ASSESSMENT_REQUIRED_INPUT_EXPECTED_COUNT =
  ASSESSMENT_REQUIRED_INPUT_DEFINITIONS.length;

export const ASSESSMENT_REQUIRED_INPUT_ALLOWED_ROLES = [
  "super_admin",
  "internal_team",
  "approved_internal_reviewer",
] as const satisfies readonly PrelaunchRole[];

export const ASSESSMENT_REQUIRED_INPUT_CANONICAL_ROUTES = {
  register: "/api/admin/research/required-inputs",
  list:
    "/api/admin/research/required-inputs?domain=research_assessment",
  readiness:
    "/api/admin/research/readiness/research_assessment",
  manifest:
    "/api/admin/research/readiness/research_assessment/manifest",
  launch:
    "/api/admin/research/readiness/research_assessment/transition",
  admin: ADMIN_ENTRY_HREF,
} as const;

export function registerAssessmentRequiredInputPlanApi(
  app: Express,
  prelaunchDependencies: PrelaunchDependencies,
) {
  const requirePlanReview = buildPrelaunchGuard(
    prelaunchDependencies,
    ASSESSMENT_REQUIRED_INPUT_ALLOWED_ROLES,
    { allowSeedContext: false },
  );

  app.get(
    "/api/internal/research/assessment/required-input-plan",
    requirePlanReview,
    (_req, res) => {
      res.set("Cache-Control", "no-store");
      res.set("Referrer-Policy", "no-referrer");
      return res.json({
        ok: true,
        plan: {
          domain: ASSESSMENT_REQUIRED_INPUT_DOMAIN,
          expectedInputCount: ASSESSMENT_REQUIRED_INPUT_EXPECTED_COUNT,
          definitions: ASSESSMENT_REQUIRED_INPUT_DEFINITIONS,
          canonicalRoutes: ASSESSMENT_REQUIRED_INPUT_CANONICAL_ROUTES,
          persistenceAuthorized: false,
          launchTransitionAuthorized: false,
        },
      });
    },
  );
}
