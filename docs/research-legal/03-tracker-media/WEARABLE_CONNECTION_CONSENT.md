# Wearable Connection Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-010 |
| Title | Wearable Connection Consent |
| Audience | member |
| Required member state | active member, mandatory assessment complete; wearable integrations are a future feature and are disabled at launch |
| Trigger | first attempt to connect a wearable or health platform (Apple HealthKit, Android Health Connect, Oura, WHOOP), once the feature launches; one consent per connection |
| Route | /research/member (tracker, connections settings) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state consumer-health-data laws review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. Additionally gated on the wearable feature itself being approved and enabled. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; synced data handled per the member's disconnect election |
| Acceptance event | per-connection consent: scope selection + checkbox + timestamp + document version + member reference recorded server-side, in addition to the platform's own permission screen; a consent event per connection is written to the consent registry |
| Withdrawal supported | yes (disconnect any connection at any time from settings; sync stops immediately; previously synced data is kept or deleted per the member's election, subject to applicable law) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-001, XR-TRK-002, XR-MEM-012, XR-POL-005, XR-POL-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials |
| Review date | 2026-07-19 |

## 1. A future feature, consented in advance of nothing

Wearable and platform connections (Apple HealthKit, Android Health Connect, Oura, WHOOP)
are planned but not live. No wearable data flows today. This document exists so the
consent is designed before the feature ships, not after. It becomes presentable only when
the integration launches, and launching the integration is itself gated: it changes the
FTC Health Breach Notification Rule analysis (XR-POL-008) and must not be enabled until
counsel signs off. `[COUNSEL: confirm this consent, the updated XR-POL-008 analysis, and a
written breach-response plan are all preconditions to enabling any wearable integration]`

## 2. One consent per connection, scoped

Each connection is consented separately. Connecting Oura does not connect WHOOP. For each
connection, the consent screen shows, before you agree:

1. Scopes: the exact data types Xenios requests (for example sleep stages, heart rate,
   activity, readiness or recovery scores) `[CONFIG: the scope list per provider]`. Xenios
   requests the minimum scopes the tracker metrics need, and requesting a new scope later
   requires a new consent.
2. Sync cadence: how often Xenios pulls or receives data
   `[CONFIG: sync cadence per provider]`. Sync happens in the background at that cadence,
   not continuously, and you can see the last sync time.
3. Direction: data flows from the platform to Xenios. Xenios does not write tracker data
   back into HealthKit, Health Connect, Oura, or WHOOP
   `[COUNSEL: confirm one-way flow as the launch design]`.
4. The platform's own permission screen: Apple, Google, Oura, or WHOOP will also ask you
   to approve the connection under their rules. Both approvals are required.

## 3. Source labeling and conflicts

Every synced value is labeled with its source and sync time, so a wearable number is never
presented as something you logged. When a manual entry and a wearable value cover the same
thing and disagree, the tracker surfaces the conflict and shows both, with the source of
each. It does not silently overwrite your manual entry, and it does not silently prefer
the wearable. You choose which value your metrics use
`[CONFIG: default conflict resolution when the member has not chosen]`.

## 4. How synced data is treated

Synced wearable data becomes tracker data and gets the full tracker treatment described in
the Tracker Privacy Notice (XR-TRK-001): consumer-health-data framing, no advertising use,
no sale, no affiliate or Research Rep access, private storage, access audit, export, and
deletion. It is used for the same purposes as manual data: plans, check-ins, and progress.
It is never used to diagnose, dose, or direct medication, and a wearable alert is not
something Xenios monitors or responds to (see XR-TRK-013).

## 5. Disconnecting

1. How. Disconnect any connection at any time from your tracker connections settings, and
   also revoke Xenios's access from the platform's own settings. Either action stops the
   flow; doing both is cleanest.
2. Effect. Sync stops immediately. Nothing new arrives from that source.
3. Your data election. At disconnect you choose whether previously synced data from that
   source is kept in your tracker history or deleted. Elected deletion is honored subject
   to applicable law. Records Xenios must keep by law are retained under XR-POL-005.
4. No penalty. Disconnecting never affects your membership, your plans continuing, or any
   other tracker feature. Manual logging keeps working.

## 6. What this consent does not do

This consent does not waive rights that cannot be waived under applicable law, and it does
not relieve Xenios of duties imposed by law. It does not authorize any scope, source, or
use beyond what the connection screen showed you, and a token or connection obtained for
one scope cannot be reused for another.

## Open items for counsel

- Confirm the gating chain: updated XR-POL-008 (FTC Health Breach Notification Rule)
  analysis, breach-response plan, and counsel sign-off before any wearable flag is
  enabled; reconcile with the earlier repository draft
  docs/compliance/FTC_HBNR_APPLICABILITY_ANALYSIS.md, which defines
  RESEARCH_WEARABLES_ENABLED as a clear-applicability trigger.
- Confirm platform-imposed contract terms (Apple HealthKit, Google Health Connect, Oura,
  WHOOP developer terms) and whether any of them require additional member-facing language
  in this consent: `[COUNSEL: platform developer terms review]`.
- Confirm per-provider scope lists and sync cadence disclosures:
  `[CONFIG: scope list per provider]`, `[CONFIG: sync cadence per provider]`.
- Confirm the one-way data-flow design and the default conflict-resolution rule:
  `[COUNSEL: confirm one-way flow]`, `[CONFIG: default conflict resolution]`.
- Confirm retention and deletion mechanics for synced data after disconnect, including
  deletion timelines under state law: `[COUNSEL: confirm period]`.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
