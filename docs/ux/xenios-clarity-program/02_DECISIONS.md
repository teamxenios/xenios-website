# 02 — Decisions (index)

**Owner answers are recorded only in `17_OWNER_DECISION_PACKET.md`.** This file keeps the ID map, the brand/legal transition table, and the list of things that need no decision. (Reconciled 2026-09-26 against `3298f279`; the earlier full text was superseded to avoid two sources of truth.)

## ID map (original → packet)

| Original | Packet | Topic | Change in reconciliation |
| --- | --- | --- | --- |
| D-01 | A-1 | Public brand now | none |
| D-02 | B-1 | Root/header change | **Now includes amending the 2026-07-29 core-site protection directive**; fallback defined |
| D-03 | B-2 | Hero line | deferred-state wording added |
| D-04 | C-1 | Public products | tied to the founder's 2026-08-17 "14 featured" layer |
| D-05 | C-2 | Public prices | volume tiers explicitly not public |
| D-06 | D-1 | Care availability/cost/speed | none |
| D-12 | D-2 | Clinician/pharmacy/testing/shipping claims | occurrence counts at `3298f279` added |
| D-08 | E-1 | Practice ordering for clients | none |
| D-10 | E-2 | Practice visibility | none |
| D-07 | F-1 | Commission | **Corrected:** the founder directive of 2026-08-17 (20% / 7.5%, 21-day hold, $50, biweekly Friday, clinical never commissionable) is the governing source; the 20/15 draft is superseded |
| D-09 | G-1 | Client ownership | deferred-state wording added |
| D-11 | H-1 | Wholesale | founder-approved volume discounts noted (not public) |
| H-01 | I-1 | Careers | promoted to a decision (packet format) |

Total: 13 decisions.

## Brand and legal transition

| Layer | Today (repo) | Working architecture (brief) | Safe now | Needs counsel/founder first |
| --- | --- | --- | --- | --- |
| Legal/contracting entity | Xenios Technologies, Inc. (Privacy, Terms, footer, SEO); Gateway footer "Xenios Technology" (error) | unchanged | Correct the Gateway string everywhere | Any entity change or DBA |
| Umbrella / technology | "xenios" coach workspace at `/` | **Infinity** | Move the workspace to `/workspace` (only if B-1 is approved) without Infinity text | Public use of "Infinity"; domain |
| Clinical / customer health | "Xenios Care", "Xenios Health", "Care + Research" | **Eon Health** (working favorite); "Infinity Health" said to Stephen | Pathways named "Care" and "Research products" under "Xenios" | Choosing Eon vs Infinity Health; trademark; DBA vs separate entity; Care provider-of-record entity (Q-04) |
| Domain / email | xeniostechnology.com; team@, research@ | — | Keep | Any change |
| Policies | Xenios Technologies, Inc. | — | Keep | Re-papering under a new brand |

Rule: brand strings come from one module. If B-1 is approved it lives in the shared chrome; under the fallback it lives in `client/src/research/` and `client/src/care/` (allowed zones).

## Helpful defaults (no answer needed)

| ID | Topic | Default |
| --- | --- | --- |
| H-02 | Programs / coaching marketplace | Not in launch navigation; one FAQ line "planned" |
| H-03 | Analytics | Existing first-party path; no new third-party trackers |
| H-04 | Support channel | One support page; Care keeps its own form |
| H-05 | Retreat cross-promotion | Out of scope |
| H-06 | Label | "Research products" (nav/cards), "Research order" (pathway) |
| H-07 | "Medical team" page (a System Labs audit recommendation) | Deferred until D-2 verifies named clinicians |

## Safe for Claude to specify

IA, page hierarchy, section order, CTA vocabulary, persona flows, product template, states, status vocabulary, responsive and accessibility rules, analytics names, acceptance criteria, jargon removal, dead-end fixes, legal-string fix.
