# Cookie and Tracking Notice

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-PUB-005 |
| Title | Cookie and Tracking Notice |
| Audience | public |
| Required member state | all stages: applies from first visit to /research, before any application or membership |
| Trigger | first visit to /research; linked from the Privacy link and from any cookie preference control |
| Route | /research and all /research/* surfaces |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; cookie preference records kept while the preference is active plus [COUNSEL: confirm period] |
| Acceptance event | strictly necessary cookies: n/a (notice only); any non-essential cookies: preference selection recorded server-side with timestamp and notice version before they are set |
| Withdrawal supported | yes; non-essential cookie preferences can be changed or revoked at any time via the cookie settings control and browser settings; strictly necessary cookies cannot be declined while using the site |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-PUB-004, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC guidance on online tracking; state attorney general privacy resources |
| Review date | 2026-07-19 |

## 1. What this notice covers

This notice explains the cookies and similar technologies used on the Xenios Research
site at /research and everything under it, including the application layer and the
member website. A cookie is a small file a website stores in your browser; similar
technologies include local storage and session tokens.

## 2. What we use, by category

### 2.1 Strictly necessary

These are required for the site to work and cannot be switched off while you use it:

- Session cookies that keep you signed in and enforce the multi-factor authentication
  every member account requires.
- The entrance-gate session that records that the shared entrance password was
  entered. It unlocks only the entrance and application layer, nothing member-facing.
- Security cookies: cross-site request forgery protection, rate limiting, and fraud
  and abuse prevention.
- Load and error handling needed to serve pages reliably.

### 2.2 Functional

Used only to remember choices you make, such as interface preferences and your cookie
preference itself. [CONFIG: exact functional cookies in use at launch; list to be
generated from the deployed system before publication.]

### 2.3 Analytics

[CONFIG: analytics provider and configuration, if any is enabled at launch.] If
analytics run, they are configured for first-party, aggregate measurement of how the
site is used (pages, errors, performance), not for building advertising profiles. If
analytics require consent in your state, they will not run before you consent.

### 2.4 Advertising

None on member or health surfaces. See section 3.

## 3. Standing commitments

These are program rules, not aspirations:

1. No advertising pixels, advertising SDKs, or third-party advertising trackers run on
   member surfaces or on any surface that handles health-related data (the assessment,
   the tracker, plans, Guides, progress media, and support).
2. No tracker, assessment, or other health-related data is sent to advertising
   platforms. Ever.
3. We do not sell personal data collected by cookies or similar technologies.
4. Non-essential cookies default to off until you choose otherwise, where consent is
   required.

## 4. Third parties

Strictly necessary operation may involve infrastructure providers (hosting, content
delivery, the payment processor on checkout pages) that set technical cookies to
provide their service. They are contractually limited to providing that service.
[CONFIG: list of third-party services that set cookies at launch.] Telegram support
happens inside the Telegram app, not on our site, and is covered by the General
Privacy Notice (XR-PUB-004).

## 5. Your choices

- Cookie settings: where non-essential cookies exist, a cookie settings control on the
  site lets you accept, decline, or change categories at any time. Changes apply going
  forward.
- Browser controls: you can block or delete cookies in your browser. Blocking strictly
  necessary cookies will break sign-in and the member site.
- Global Privacy Control and similar signals: [COUNSEL: confirm whether and how
  browser opt-out preference signals must be honored in the states that recognize
  them, and specify the required behavior before launch].

## 6. Changes and contact

We may update this notice as the site changes; updates are versioned and apply
prospectively. Questions: research@xeniostechnology.com. This notice does not waive
rights that cannot be waived under applicable law, and it does not relieve Xenios of
duties imposed by law.

## Open items for counsel

- [CONFIG: exact functional cookies in use at launch] (section 2.2).
- [CONFIG: analytics provider and configuration, if any is enabled at launch]; counsel
  to confirm whether the chosen configuration requires opt-in consent in any state
  (section 2.3).
- [CONFIG: list of third-party services that set cookies at launch] (section 4).
- [COUNSEL: confirm Global Privacy Control and opt-out preference signal handling by
  state] (section 5).
- [COUNSEL: confirm period] for cookie preference record retention (metadata table).
- Confirm whether a cookie banner is required at all for a strictly-necessary-only
  configuration, or whether the settings link alone suffices.
- Reconcile with the earlier draft docs/privacy/PRIVACY_PROGRAM.md, which states no
  advertising trackers run on /research surfaces; keep the two consistent at
  publication.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
