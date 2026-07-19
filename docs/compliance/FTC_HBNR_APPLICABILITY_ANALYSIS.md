# FTC Health Breach Notification Rule applicability analysis

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: any change to RESEARCH_HEALTH_DATA_ENABLED, RESEARCH_LAB_UPLOADS_ENABLED, or RESEARCH_WEARABLES_ENABLED; any feature that infers or records health status; any security incident involving applicant or member data.

Ground truth: docs/security/CURRENT_STATE_FACTS.md. Counsel must confirm every legal conclusion here. No deadlines or section numbers are cited in this document; the operative timelines must come from counsel reading the current rule text.

## 1. Why this rule matters to us specifically

xenios research is not HIPAA-covered (see docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md). The FTC Health Breach Notification Rule (HBNR) is the regime that reaches non-HIPAA consumer platforms that hold health records, and the FTC has interpreted it broadly to cover wellness apps and platforms that draw health information from consumers. A peptide-education membership platform is exactly the kind of adjacent-to-health product the FTC watches. So even though we collect no health data today, this rule, not HIPAA, is our most likely federal breach-notification exposure if our data ever shades into health information. Counsel must confirm this framing.

## 2. What the rule covers, generally

Stated generally and subject to counsel confirmation: the HBNR requires vendors of personal health records, and related entities, that are not HIPAA-covered to notify affected individuals, the FTC, and in some cases media, after a breach of security involving unsecured identifiable health information. "Breach" includes unauthorized disclosure, not only hacking. The FTC has taken the position that the rule reaches apps and platforms that manage consumer health information from one or more sources.

## 3. Today's data sits at the boundary

What we hold: applicant identity (name, email) plus free-text goals and interests, and membership status. Our working view, which counsel must confirm:

1. Identity and membership records alone are personal data, not health records. On this view the HBNR does not currently apply to us.
2. The boundary risk is the free-text goals field and the nature of the platform itself. An applicant may volunteer health details ("recovering from an injury", "interested in metabolic health") in free text. Membership in a research-peptide platform could itself be argued to reveal a health interest. Whether volunteered free text or membership status makes us a "vendor of personal health records" is a genuine open question for counsel, not something we assert either way.

Posture in the meantime: treat application bodies as Confidential zone, keep them out of server logs (already enforced), do not mine or categorize free text for health signals, and do not build features that infer health status from application data.

## 4. What triggers clear applicability

Any of these moves us from boundary to clearly in scope, and each is behind a flag that defaults false:

1. RESEARCH_HEALTH_DATA_ENABLED: structured collection of member health information.
2. RESEARCH_LAB_UPLOADS_ENABLED: lab results are unambiguously health records.
3. RESEARCH_WEARABLES_ENABLED: biometric streams.
4. Any recommendation, tracking, or logging feature keyed to a member's health state, even if built from data we already hold.

None of these ship without counsel sign-off, an updated version of this analysis, health_data_collection consent captured in the consent registry, and a written breach-response plan.

## 5. Breach-notification posture today

We currently have no formal incident tooling (fact sheet: NOT BUILT). Interim posture:

1. Any suspected unauthorized access to or disclosure of applicant or member data is escalated to the owner immediately and logged with timestamps and scope.
2. We do not assume the HBNR does not apply to a given incident; because our data sits at the boundary, counsel is consulted on notification duties (FTC, state, contractual) for any real incident involving application content.
3. Notification decisions, including a decision not to notify, are made with counsel and documented.
4. We never characterize an incident publicly before the facts and counsel review support the characterization.

A proper incident-response runbook is planned under docs/security and is a prerequisite for opening any health-data flag.

## 6. Minimization measures that keep us at the boundary

The cheapest breach defense is not holding the data. Current controls that keep our exposure narrow, all BUILT per the fact sheet:

1. Application and admin API bodies are excluded from server logs; Referrer-Policy is no-referrer; status tokens travel only by email and are scrubbed from URLs client-side.
2. Supabase RLS is enabled on every research table with no public policies; access is service-role only, server-side.
3. The application form asks for identity and goals, nothing structured about health, and we keep it that way deliberately.
4. No exports to Drive or Sheets are live (contract tables only, disabled), so applicant data has no secondary copies to breach.

## 7. Interaction with state breach law

Separately from the HBNR, state breach-notification statutes (including Texas law) can apply to a breach of ordinary identity data such as names and emails combined with other elements. That analysis is independent of whether our data is "health" data. Counsel must confirm which state notification duties would attach to a breach of our current data set; the incident posture in section 5 already routes every real incident through counsel for exactly this reason.

## 8. Standing rules

- Never market xenios research as a health platform while claiming the HBNR does not apply to us. The two positions undermine each other.
- Every legal conclusion above is working analysis. Counsel must confirm applicability, the trigger analysis in section 4, and all notification timelines and recipients before they are relied on.
