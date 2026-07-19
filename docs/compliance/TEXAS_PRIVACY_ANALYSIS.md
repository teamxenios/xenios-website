# Texas consumer privacy analysis for xenios research

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: material growth in member or applicant volume; any sale or sharing of personal data; any change to RESEARCH_HEALTH_DATA_ENABLED or biometric collection; any targeted-advertising integration; annual review otherwise.

Ground truth: docs/security/CURRENT_STATE_FACTS.md. Counsel must confirm every legal conclusion. No statutory citations, thresholds, or deadlines are asserted as fact here; counsel supplies the operative numbers from current law.

## 1. Why Texas law is the starting point

xenios is a Texas-based company processing Texans' personal data, so Texas consumer privacy law is our home-state regime. Texas has a comprehensive consumer data privacy law that, stated generally, applies to businesses that conduct business in Texas or target Texas residents and that process or sell personal data, with a notable carve-out for small businesses as defined by federal small-business standards (with a narrower rule for selling sensitive data). Whether and when xenios falls inside or outside that carve-out, and how the law's exemptions apply to us, is for counsel to confirm. We do not assume exemption; we build toward compliance.

## 2. Current posture, honestly stated

- Scale: a small private membership platform (applications, human review, $50 activation planned but commerce is currently disabled, whole-life membership). Volume is small.
- Data: applicant identity (name, email), free-text goals and interests, membership and application status, notification records. Confidential zone. No health data, no biometrics, no ID documents, no payment data today.
- We do not sell personal data and do not run targeted advertising.
- Likely posture (counsel must confirm): at current scale we may sit within the small-business carve-out, but the sensitive-data rules can bite smaller businesses too, so section 4 matters regardless.

## 3. Consumer rights we support now

Regardless of strict applicability, we honor the core rights the Texas law grants, because they are cheap to honor at our scale and honest to promise:

1. Access: a member or applicant can ask what personal data we hold about them; we answer by manual export from Supabase.
2. Correction: we correct inaccurate identity data on request.
3. Deletion: we delete an applicant's or member's personal data on verified request, subject to legal retention duties counsel identifies. Note: the application audit trail is append-only; the deletion procedure for it needs a documented design (planned).
4. Portability: the manual export above, in a common format.
5. No discrimination for exercising rights.

Today these are handled by hand through team@xeniostechnology.com. There is no Privacy Center or data-subject request tooling yet (fact sheet: NOT BUILT; RESEARCH_PRIVACY_CENTER_ENABLED defaults false). Requests are logged with dates and outcomes.

## 4. Sensitive-data cautions

Texas law treats certain categories as sensitive, generally including health information, biometric data, precise geolocation, and data revealing certain protected characteristics, and requires consent before processing them. Counsel must confirm the exact categories and consent standard. For us:

1. Health data and biometrics are in the "prohibited" data zone (shared/research/security-types.ts) and are not collected. RESEARCH_HEALTH_DATA_ENABLED, RESEARCH_LAB_UPLOADS_ENABLED, and RESEARCH_WEARABLES_ENABLED default false.
2. Free-text goals may contain volunteered health details. We do not solicit them, do not mine them, and treat application bodies as Confidential (excluded from logs).
3. If any sensitive-data flag ever opens, consent capture through the consent registry (health_data_collection kind) becomes mandatory before collection, and this analysis is re-run with counsel first. Selling sensitive data is simply prohibited as company policy.
4. Identity or age verification (RESEARCH_IDENTITY_VERIFICATION_ENABLED, RESEARCH_AGE_VERIFICATION_ENABLED, both false, no vendor selected) would introduce ID documents: Restricted zone, counsel review before build.

## 5. Trigger points for a full privacy program

Any of these upgrades us from the current lightweight posture to a formal program (privacy notice review, request tooling, vendor DPAs, records of processing):

1. Counsel concludes the small-business carve-out does not or will no longer cover us.
2. Member volume grows past the point where manual request handling is reliable.
3. Any sensitive-data flag opens (section 4).
4. Any data sale, sharing for targeted advertising, or new category of processing.
5. Members in states or countries whose laws counsel flags as applicable to us.

## 6. Vendors and processors

Personal data currently flows through three vendors: Render (hosting), Supabase (database and auth), and Resend (email delivery). All are ordinary processors acting on our instructions. Before a full privacy program stands up, the interim rules are:

1. No new vendor receives applicant or member personal data without an owner decision recorded in writing.
2. Vendor terms are reviewed for data-processing commitments when counsel stands up the formal program; until then we rely on each vendor's standard DPA.
3. The external_exports contract tables stay disabled; no data leaves the primary stores.

## 7. Standing rules

- Public copy never claims compliance with a named privacy statute without counsel sign-off.
- Every new field or table declares a data zone before it ships.
- All conclusions above about applicability, exemptions, and thresholds are working analysis. Counsel must confirm.
