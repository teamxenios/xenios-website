# 03 — Open questions

These do **not** block the clarity implementation if the defaults in `02_DECISIONS.md` are accepted; they block specific future capabilities or specific claims. Owner = who must answer. Nothing here should be answered by Codex or Claude.

| ID | Question | Owner | Blocks | Default until answered |
| --- | --- | --- | --- | --- |
| Q-01 | Is the practice-referral → client-self-orders-Research model acceptable for a licensed practitioner (Stephen's own attorney review, per his action item)? | Practice's counsel + Xenios counsel | Nothing on the site; affects practice onboarding materials | Site says "Talk to your own counsel about your obligations" |
| Q-02 | Could a practice parent account ever order for clients (with a client-signed acknowledgment, as Seth suggested)? What liability does that create for the practice and for Xenios? | Xenios counsel | D-08 reversal | Not offered |
| Q-03 | May Xenios pay commission to licensed practitioners (PA/NP/MD) for referrals, and on which order types? Research products only? State-specific rules? | Xenios counsel | Commission terms in agreement; D-07 | Research orders only; no Care commission |
| Q-04 | For a practice-referred Care patient, who is the provider of record, who owns follow-up, and what may be shared back to the referring practice? | Clinical lead + counsel | `/practices/care` detail, Care handoff copy | Clinician owns medical decisions and follow-up; sharing only with patient's written authorization |
| Q-05 | In which states is Care available today? | Operations + clinical | Any state list; serviceability copy | "We confirm availability after your request" |
| Q-06 | Consent mechanism for a referred client to let their practice see name/order status (Research). Is order-level visibility (which product) acceptable at all? | Counsel + founder | Practice reporting beyond counts | Counts + commission only; names/status only with opt-in (future) |
| Q-07 | Exact research-use acknowledgment text for practice-referred clients; does it need to name the referring practice? | Counsel | Referral onboarding copy | Current Research Use Policy unchanged |
| Q-08 | Which medical directors/clinicians have signed agreements, and may they be named? | Founder + counsel | Any clinician naming (C-006) | Not named |
| Q-09 | Support assistant ("AI chatbot", promised to Compass within a week): scope and hard boundary on dosing/clinical questions; who reviews its content? | Founder + clinical | Any assistant on public pages | Not on public pages; if added later, product-documentation and order-status answers only; hands off clinical questions to Care |
| Q-10 | Can Xenios fulfil a prescription/order a client already has from an outside provider? Under what pharmacy rules? | Pharmacy + counsel | Any mention | Not mentioned |
| Q-11 | Premixed / pre-dosed formats (Tammy's request) — regulatory and pharmacy feasibility. | Samuel (action item) + pharmacy | Any mention | Not mentioned |
| Q-12 | Which pharmacy(ies) and suppliers are contracted and verified today (after replacing the primary supplier)? COA availability per lot? | Operations | C-005, C-008, C-009, quality copy | Process-only quality copy |
| Q-13 | There is no customer-facing status lookup for a Care request reference (`CARE-XXXXXXXX`). Should one exist, or is email follow-up the status channel? | Founder + Care ops | "Check Status" for Care | "Check Status" explains Care status arrives by email/phone from our team; offers Care support form |
| Q-14 | Who owns business inquiries operationally (practice, partner, supplier), and what is the first-contact expectation we can truthfully state? | Founder / COO (Seth) | Operator queue owner field; confirmation copy | Owner = founder queue; no timing promise |
| Q-15 | Decisions recorded only in the 2026-09-26 thread archive (Gmail attachment, not readable by this lane). | Samuel | Possible conflicts with this spec | Samuel confirms or overrides in `02_DECISIONS.md` review |
| Q-16 | Delayed-order remedies (lifetime 50% discount, $500 credit mentioned to Compass): how are they recorded and applied to specific customers? | Operations | Nothing public (never public copy) | Handled manually per customer |
| Q-17 | Should `/research/member/metabolic-care` (member-only) remain the "Explore Care" target from product pages, or should all Care entry go through `/care`? | Founder | Care CTA target | `/care` (public) |
