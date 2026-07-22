# Optional Sexual-Wellness Data Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-003 |
| Title | Optional Sexual-Wellness Data Consent |
| Audience | member |
| Required member state | active member, mandatory assessment complete; presented only if the member chooses to enable sexual-wellness logging |
| Trigger | first attempt to enable or log optional sexual-wellness data (for example logging related to the Intimacy and Vitality goal area) |
| Route | /research/member (tracker, sexual-wellness section) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state consumer-health-data laws review pending; heightened state rules for sexual-health data review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; deleted on revocation when the member elects deletion, subject to applicable law |
| Acceptance event | separate, unbundled checkbox + timestamp + document version + member reference recorded server-side; a distinct consent event is written to the consent registry, never combined with any other acceptance |
| Withdrawal supported | yes (revocable at any time with a deletion election; revocation stops new collection prospectively; elected deletion of stored sexual-wellness data is honored subject to applicable law) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-001, XR-TRK-002, XR-MEM-012, XR-MEM-027, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC health privacy enforcement materials |
| Review date | 2026-07-19 |

## 1. Strictly optional

Sexual-wellness logging is an optional tracker feature. It is never required for
membership, for the assessment, for any plan, for any purchase (including products in the
Intimacy and Vitality category), or for any other part of Xenios Research. Declining this
consent has no effect on anything else you can do as a member. The option simply stays
off, and nothing in your member experience labels you as having declined.

You can buy Intimacy and Vitality products without ever enabling sexual-wellness logging.
Purchasing history and this logging are separate things.

## 2. What this consent covers

If you enable it, this consent covers observations you choose to log about sexual wellness
and intimacy (for example entries connected to the Intimacy and Vitality goal area). It
covers only data you enter yourself. Xenios does not infer sexual-wellness data from your
other tracker entries, your orders, or your browsing, and it does not backfill this
category from anything you did before you consented.

## 3. Private by default, and handled as more sensitive

Sexual-wellness data gets stricter handling than the rest of the tracker:

1. Private by default. It is stored under its own category flag, separated from your other
   tracker metrics, and is excluded from any view that does not strictly need it.
2. Access. Visible to you. Founder and reviewer access during plan review is limited to
   what you have chosen to expose to plan personalization
   `[CONFIG: whether sexual-wellness entries are visible in founding-phase plan review by
   default, or only on a per-entry share election]`. `[COUNSEL: confirm the default; the
   privacy-protective default is per-entry election]`
3. Never in support channels. Telegram is never the system of record, and sexual-wellness
   data is not handled over Telegram.
4. Never shared outward. It is excluded from Professional Sharing Authorizations
   (XR-TRK-011) unless you name the category explicitly in the authorization scope.
5. Never for advertising. Like all tracker data, it is never sent to advertising
   platforms, never sold, and never available to affiliates or Research Reps.
6. Audited. Every access is logged, and the access audit is available on request.

## 4. Purposes

If enabled, this data is used only to personalize your plans and check-ins in the areas
you asked Xenios to address, and to show you your own trends. It does not diagnose any
condition, and it is not medical care. Concerns about sexual health belong with a licensed
professional (see XR-TRK-013).

## 5. Revocation with deletion election

1. How. Revoke at any time in your member privacy settings. Revocation is immediate and
   requires no reason.
2. Effect. New collection stops prospectively and the sexual-wellness section locks.
3. Deletion election. At revocation you choose whether to also delete stored
   sexual-wellness data. Because this category is more sensitive, the revocation flow asks
   the deletion question explicitly rather than burying it. Elected deletion is honored
   subject to applicable law, and Xenios confirms completion to you.
4. What survives. Only records Xenios must keep by law (for example audit and security
   records referencing that a consent existed and was revoked) are retained under
   XR-POL-005. The retained record of the consent event does not include the logged
   sexual-wellness content itself.

## 6. What this consent does not do

This consent does not waive rights that cannot be waived under applicable law, and it does
not relieve Xenios of duties imposed by law. It does not permit any use beyond section 4,
and silence or continued membership is never treated as consent to this category.

## Open items for counsel

- Confirm heightened state requirements for sexual-health and intimate data (consent form,
  separate notice, deletion timelines, authorized-agent rights) and whether this consent
  meets them: `[COUNSEL: heightened state rules for sexual-health data]`.
- Decide the founding-phase reviewer visibility default for sexual-wellness entries:
  `[COUNSEL: confirm the default]` / `[CONFIG: reviewer visibility default]`.
- Confirm whether the consent registry needs a distinct consent kind for this category,
  and reconcile with the earlier repository draft docs/security/CONSENT_REGISTRY.md (the
  health_data_collection consent kind is reserved until legal gates clear).
- Confirm retention of the consent and revocation events after elected deletion:
  `[COUNSEL: confirm period]`.
- Reconcile scope with XR-MEM-012 (Sensitive Health Data Consent), which reserves
  sexual-wellness questions to a separate consent; confirm this document is that consent
  and that no other document collects this category.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
