// The member ACCOUNT surface paths, shared by the client adapter and the
// server route registration.
//
// Why a shared constant rather than a literal on each side: five member pages
// once fell through to the SPA catch-all because the client asked for
// /api/research/member/<name> while the server had registered
// /api/research/<name>, or had registered nothing at all. Both sides looked
// correct in isolation and both sides had passing tests. A path that is
// written once cannot drift; a path written twice always can, and the failure
// is silent because an unpublished path returns the app shell with a 200
// rather than an error.
//
// Only the seven paths of the member account surface live here. The rest of
// the member contract (profile, assessment, agreements, blueprint, plans,
// documents) is registered by modules that predate this file and is pinned by
// their own suites; nothing is moved here on their behalf.

export const MEMBER_ACCOUNT_API = {
  /** The member's own membership record: status, coverage, payments, paperwork. */
  membership: "/api/research/member/membership",
  /** Cancel the membership. */
  cancel: "/api/research/member/cancel",
  /** The member's sign-in history. */
  securitySessions: "/api/research/member/security/sessions",
  /** Consents on record and media stored for the member. */
  privacySummary: "/api/research/member/privacy/summary",
  /** Data-rights requests. */
  privacyExport: "/api/research/member/privacy/export",
  privacyCorrection: "/api/research/member/privacy/correction",
  privacyDeletion: "/api/research/member/privacy/deletion",
} as const;

export type MemberAccountPathKey = keyof typeof MEMBER_ACCOUNT_API;
