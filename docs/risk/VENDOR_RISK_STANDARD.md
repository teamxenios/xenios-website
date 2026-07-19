# Vendor risk standard

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: adding or replacing any vendor, a vendor breach notice, a
material change to a vendor's data processing terms, or contract renewal.

## 1. Purpose

Every vendor that touches xenios research data widens the attack surface.
This standard lists what each current vendor actually receives, the questions
answered before any new vendor is added, and the contract terms we require
(counsel must confirm all contract conclusions).

## 2. Vendor inventory and data exposure (current state)

Active today:

1. Supabase (Postgres + Auth). Highest exposure: all application data
   (identity, stated goals and interests, Confidential zone), member
   accounts and auth credentials, application event audit, notification
   outbox, referral tables. RLS is enabled on every research table with no
   public policies; access is service-role only from the server. Status
   tokens are not stored (minted at send time).
2. Resend (email delivery). Sees recipient email addresses and full email
   bodies, which include signed status links. This is the accepted, designed
   exception to the token rule in section 5: status tokens travel only by
   email, so the email provider necessarily transports them. Resend must be
   treated as a high-trust vendor for that reason.
3. Render (hosting). Runs the Express server, so it can technically observe
   anything the app processes, plus environment secrets (service keys,
   RESEARCH_SESSION_SECRET, RESEND_API_KEY). Trusted infrastructure tier.
4. GitHub (source code). Holds code and configuration, never secrets and
   never applicant or member data. Any secret found in history triggers
   immediate rotation.

Planned, not yet in use:

5. Google Workspace (planned). Intended for internal operations. The Drive
   and Sheets export contract tables exist but exports are disabled; no
   applicant or member data flows to Google today.
6. Identity verification vendor (planned, not selected). Would receive the
   most sensitive data in the system: ID documents and liveness checks,
   which stay with the vendor. xenios receives signed results only. See
   docs/security/IDENTITY_PROOFING_STANDARD.md.
7. Stripe (planned). Would receive payment details for the activation fee.
   Card data must never touch xenios servers (hosted checkout or elements
   only). No commerce is live today; all commerce flags are off.

No vendor receives health data, because the platform collects none.

## 3. Assessment before adding any vendor

Answer in writing before signing anything:

1. What is the minimum data this vendor needs, field by field, and what
   data zone (public, internal, confidential, restricted, prohibited) does
   each field sit in? Prohibited-zone data disqualifies the integration.
2. Can the integration be designed so sensitive evidence stays with the
   vendor and xenios stores only results or references?
3. Where is the data stored and processed, and is it used to train models
   or shared with subprocessors? List the subprocessors.
4. What is the vendor's security posture: published audits or certifications
   (for example SOC 2), breach history, retention defaults, deletion
   guarantees?
5. What happens at offboarding: can we get our data out and get a written
   deletion confirmation?
6. What is the blast radius if this vendor is fully compromised, and what
   is our rollback (can the feature flag turn it off cleanly)?
7. Who is the named human owner of this vendor relationship?

The completed assessment is stored in docs/risk/ next to this standard.

## 4. Contract requirements (counsel must confirm every item)

For any vendor processing applicant or member personal data we require:

1. A data processing agreement (DPA) restricting processing to our
   instructions and naming subprocessors.
2. Deletion on termination and on request, with written confirmation.
3. Breach notification to xenios without undue delay; counsel must confirm
   what notice window and content to require, and how vendor breaches map
   to our own obligations under frameworks such as the FTC Health Breach
   Notification Rule (likely inapplicable while no health data is collected;
   counsel must confirm) and Texas consumer privacy law.
4. No sale of, and no independent use of, xenios data.
5. If the vendor could ever touch health-adjacent data in the future, a
   HIPAA business associate analysis first. xenios is not a HIPAA covered
   entity today and is not HIPAA compliant; counsel must confirm the
   analysis before any such data category is introduced.

## 5. Standing rules

1. No vendor may receive status tokens or secrets. Signed status tokens
   exist only in emails to the applicant (Resend transport is the sole,
   designed exception); API keys and session secrets live in environment
   configuration on Render and are never sent to, logged by, or stored with
   any other vendor.
2. Every vendor integration ships behind a feature flag or an env-gated
   code path so it can be disabled without a deploy where possible.
3. Vendor credentials are rotated on suspicion, on staff change, and on a
   schedule to be set when the team grows beyond a single admin.
4. This inventory is reviewed whenever the review trigger fires, and the
   fact sheet (docs/security/CURRENT_STATE_FACTS.md) is updated in the same
   change if the vendor list changes.
