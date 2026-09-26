# 09 — Practice model

Principal case: Stephen Toth / Compass (`STEPHEN_COMPASS_CASE_STUDY.md`). Applies to physician practices, PAs, NPs, coaches, trainers, med spas, gyms/studios, wellness organizations, functional-lab practices, behavioral-health practices, retreats and corporate wellness.

Each capability is labelled: **NOW** (implemented and mounted) · **BUILT-DARK** (code exists, flag/decision/SQL closed) · **NEAR** (proposed next, needs engineering) · **LATER** (vision) · **DECISION** (needs Samuel/counsel before any build or promise).

## The five models at a glance

| Model | One line a practice reads | Who holds the client relationship | Who can order | Clinical authority | Status |
| --- | --- | --- | --- | --- | --- |
| A — Referral | "Share your link. Your clients create their own accounts. You're credited for what they order." | Practice (coaching); client owns the account | The client, for themselves | None for Research; Care is separate | Page NOW-able; attribution BUILT-DARK |
| B — Practice workspace | "Sign in to see your referrals, orders and commission in one place." | unchanged | Nobody orders on anyone's behalf (D-08) | None | API BUILT-DARK (tables unapplied); pages NEAR |
| C — Care for your clients | "When a client needs a clinician, send them to Care. Our clinician decides; your coaching continues." | Practice keeps coaching; Eon clinician owns medical decisions | Clinician prescribes if appropriate | Eon clinician only (never the practice by default) | Care request NOW; practice attribution into Care DECISION (Q-03/Q-04) |
| D — In-clinic inventory | "Under review. Ask us." | — | — | Licensing/pharmacy review | DECISION (D-11: not offered) |
| E — Programs & services | "Coming later: coaching, labs, retreats and more." | — | — | Depends on service | LATER (H-02) |

## Model A — Referral

**Flow**

1. Practice reads `/practices/referrals` and submits a **practice inquiry** (NOW via contact route; NEAR durable record — see `10_NOTIFICATION_MATRIX.csv` N-09).
2. Xenios qualifies the practice (call; Samuel's clinic questionnaire — content owned by Samuel; spec provides the slot, not the questions).
3. On approval, the practice is provisioned as a partner (existing partner lifecycle: application → identity/tax/payout → agreement → training → active; `shared/research/distribution.ts`). Approval email with activation link → `/activate`.
4. Practice receives a **referral link and code** (Referral V1 — BUILT-DARK; `xr_aff` signed cookie; typed codes stored as unmatched claims until matched).
5. Client follows the link, creates their own account / submits their own order, **accepts the research-use terms personally**, and is attributed to the practice.
6. Orders flow through the normal Research order lifecycle (request → quote/payment instructions → human verification → fulfilment).
7. Commission accrues on eligible Research orders only (D-07); held, approved, payable, paid per the commission ledger; reported in the workspace.

**Rules**

- The client owns the account and their data. The practice is recorded as the referring practice (D-09).
- Attribution rule: last-touch within the attribution window configured in code (30 days, `distribution.ts:114`) — **not published** as a number until D-07; public copy says "clients who sign up or order with your link or code".
- Self-referral is denied (config).
- No commission on Care services, consultations or prescriptions (D-07/Q-03).
- A practice never sees a client's Care information.
- A practice-referred client is never auto-routed into Care; Care happens only if the client (or practice, by advising the client) chooses Care.

## Model B — Practice / organization workspace

**What it is:** a signed-in view for an approved practice. Built on the existing partner workspace (dashboard, links, conversions, commissions, payouts, resources, compliance, support, security) for NOW/BUILT-DARK items, and on the Pack 02 organization account for staff roles (BUILT-DARK; tables unapplied; name collision CUX-17).

**Roles** (from `shared/research/account-identity.ts:10-15`, mapped to practice language):

| Code role | Practice-facing name | Can do |
| --- | --- | --- |
| `organization_owner` | Practice owner | Everything below + invite/remove staff, edit practice profile, see commission and payouts |
| `organization_admin` | Practice admin | Invite staff, edit profile, see referrals and reports |
| `business_buyer` | (not used for practices at launch) | Would allow practice-owned purchases for the practice itself — **not** for clients; hidden until D-08/D-11 |
| `billing_viewer` | Billing contact | See commission statements and payouts only |

**Visibility (D-10 default)**

| Data | Practice sees | Condition |
| --- | --- | --- |
| Number of referrals (sign-ups), orders, conversions by period | Yes | Always (NOW in portal as counts) |
| Commission entries and state; payout batches | Yes | Always, once program active |
| Referred client's name and order status (placed / shipped) | Yes | Only if the client opted in at sign-up (NEAR; requires consent capture — Q-06) |
| Which products a client ordered | No | Until counsel answers Q-06 |
| Anything from Care | No | Only with the patient's written authorization, handled inside the secure clinical system |

**Explicitly excluded:** client impersonation; ordering on a client's behalf; editing a client's account; any prescribing or clinical action; bulk export of client personal data.

**Staff access flow (NEAR):** owner invites by email → invitee receives invitation (existing `organization-invitations/accept` API) → sets password (initial-password change enforced by API) → sees workspace per role.

## Model C — Care integration for practice clients

**Flow**

1. Practice advises a client that a clinician should be involved.
2. Client submits **Start Care** themselves (`/care/schedule`). Optional field (NEAR, DECISION Q-03/Q-04): "Were you referred by a practice?" — recorded for relationship context only; **no commission**.
3. Human review → secure clinical handoff → licensed clinician decides independently (treat / don't treat / needs more information).
4. Follow-up: the clinician owns medical follow-up for anything they prescribe. The practice continues coaching. The patient decides what to share with the practice.

**Must say publicly (after D-09/Q-04):** the practice does not become responsible for Eon's clinical decisions; Eon's clinician does not take over the practice's coaching relationship; nothing is prescribed automatically.

**Must not say:** that the practice can "approve" treatment for its clients; that referral guarantees treatment; any turnaround time.

Note on the transcript: Samuel told Stephen "at the end of the day, you guys should be approving, you know, everything for your clients". For Care this cannot be the public model — a practice approving a clinician's treatment inverts clinical authority. For Research orders the client decides for themselves. Flagged for Samuel in Q-04.

## Model D — Wholesale / in-clinic inventory

Separate authority from referrals and Care. Requires: legal (resale of research-use materials, state rules), pharmacy/licensing (if any compounded product), storage and handling, product documentation, pricing tiers (price book has internal 5+/10+ tiers — not public), fulfilment and returns. **Default D-11: not offered.** `/practices` shows: "In-clinic inventory: under review. If you're interested, tell us in your inquiry." No price, no timeline.

## Model E — Programs and services (future)

Coaching, nutrition, training, functional labs, behavioral health, retreats, recovery programs, diagnostics, education, specialty programs. **LATER.** Not in launch navigation. The Compass relationship (coaching + labs + behavioral health + retreats) is the reference customer when this is designed. Any clinical service (labs, behavioral health) needs its own authority review.

## Practice lifecycle and status vocabulary

| Stage | Customer-facing label | Operator state | Who acts next | Notification |
| --- | --- | --- | --- | --- |
| Inquiry sent | "Inquiry received" | `inquiry_received` | Xenios (founder queue) | On-screen ref + email (N-09) |
| Qualification | "We're reviewing your practice" | `qualifying` | Xenios → call / questionnaire | Email from a person |
| More info | "We need a few details" | `more_info` | Practice | Email with what's needed |
| Declined | "Not a fit right now" | `declined` | — | Email |
| Approved | "Approved — activate your account" | `approved_pending_activation` | Practice | Activation email → `/activate` (N-11) |
| Active | "Active" | partner `active` | — | Welcome + workspace link |
| Paused | "Paused — contact us" | `suspended` / `quality_review` | Xenios | Email (existing lifecycle notifications) |

The words **inquiry, application, approval, activation, sign-in** are never interchangeable (brief §7).

## Support boundary for practice clients

- Product information and order status: Xenios support.
- Dosing, reconstitution, suitability: **not provided for Research products**; for Care patients, the clinician.
- Coaching: the practice.
- Any future support assistant: product documentation and order status only; hands off anything clinical (Q-09).

## Legal / clinical questions that need owner or counsel decisions

Q-01 (practice referral model review), Q-02 (parent-account ordering), Q-03 (commission to licensed referrers; Research-only), Q-04 (provider of record, follow-up, sharing back), Q-06 (client consent for visibility), Q-07 (research-use acknowledgment for referred clients), Q-10 (outside provider orders), Q-11 (premixed formats). See `03_OPEN_QUESTIONS.md`.
