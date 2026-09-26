# Stephen Toth / Compass — practice case study

Source: Google Meet notes by Gemini + full transcript, "Steve Toth and Samuel Boadu", 2026-09-25 12:34 CDT (Drive `1zth0U-n2QvyeM0MJ3DQbqvk_0kz7Zjw3cN7JVinGK50`). Class **D (stakeholder input)**. Gemini's summary was checked against the transcript; where they differ, the transcript wins and the difference is noted. Participants: Stephen Toth (PA, veteran, Fort Collins CO; owner, Compass Coaching & Wellness), Tammy Brannen (LCSW, group practice, retreats), Samuel Boadu, Seth (COO; appears in transcript as a masked phone number).

This is the principal B2B2C use case. Nothing said on the call is a verified product or legal promise until it appears in `02_DECISIONS.md` as approved and in `CLAIM_LEDGER.csv` as verified.

## Who Compass is

- **Now:** lab-informed health and wellness *coaching* (functional labs → goals → plan). Stephen "first want[s] to start this by just the coaching" and does **not** want his medical license pulled in yet (00:07:53).
- **Later:** Stephen may treat medically under his PA license, plus coach, plus educate about peptides (00:07:53).
- **Alongside:** Tammy's behavioral-health group practice; they will cross-refer and share clients (00:08:51). Retreats (therapy-integrated; future Costa Rica/Mexico; veterans, first responders, law enforcement).

## What Stephen experienced on the website

> "I looked at your website and … it was overwhelming … I didn't know like where to even start." (00:08:51–00:09:52)
> "I saw you had two sides to that and that's where I kind of got confused." (00:29:50)

He could not tell (a) where to start, (b) what the Research vs clinical "two sides" meant, or (c) how a practice fits. Samuel agreed the calls to action "need to be … way more simpler" (00:09:52). **Design test:** Stephen must be able to answer every question in the table below from the public site alone, without a call.

## Stephen and Tammy's questions → where the new site answers them

| # | Question (paraphrased from transcript) | Time | Answer the site must give | Where | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Where do I even start? | 00:08:51 | Homepage audience selector → "For Practices" | `/`, header | Spec'd |
| 2 | What happens to my coaching client once I decide peptides might help? | 00:15:16 | Two routes, chosen per client: **Research order** (client orders for themselves) or **Care** (client sees an Eon clinician). You don't have to involve your license for either. | `/practices` §How referrals work | Spec'd; exact wording needs D-09 |
| 3 | Would my client still be medically evaluated, or is that bypassed? What if I want it? | 00:16:35 | Research orders are **not** clinically evaluated. If you want a clinician involved, refer the client to **Care** instead. | `/practices/care` | Spec'd; transcript shows Samuel first said "bypassed", then "totally fine" to add review — site must present it as the Care route, not as an add-on to Research |
| 4 | How do we partner? What are the options? | 00:17:40 | Model A referral (now), Model B workspace (when approved), Model C Care integration, Model D inventory (not offered; under review). | `/practices` | Spec'd |
| 5 | How does this benefit me economically? | 00:21:46 | "Your practice earns a commission on eligible orders placed by clients you refer. Rates, holds and payout timing are in your partner agreement." No public numbers until D-07. | `/practices/referrals` | Needs D-07, D-10 |
| 6 | How do you know a client is from me? Account number? | 00:23:05 | Your practice gets a link and a code. When a client signs up or orders with it, they're attributed to your practice. | `/practices/referrals` | Needs Referral V1 + bindings live (engineering) |
| 7 | What does the client pay to become your client? | 00:24:19 | "Creating an account is free." Consultation cost: **do not state** until D-06 (Samuel said "right now it's no cost" — not durable). | `/faq`, `/care` | Account-free: ops verify (C-021); consult cost: open |
| 8 | Can I create client accounts and place orders on their behalf (parent account)? (Tammy) | 00:25:26 | **Not today.** Clients create and own their accounts. A practice account shows referrals and reporting; it does not order for clients. Reason, stated plainly: the client must personally accept the research-use terms. | `/practices/workspace`, FAQ | Needs D-08 (recommend "not at launch") |
| 9 | Wouldn't ordering for them make me legally responsible / prescribing? | 00:27:33 | We agree this needs your own counsel; we will not ask a practice to order on a client's behalf. | `/practices` legal boundary block | Aligned with Stephen's own preference (00:28:49) |
| 10 | If I refer to your clinical side, who takes control of follow-up? | 00:31:53 | Eon's clinician makes medical decisions for Care patients. Your practice keeps its coaching relationship; the client chooses what to share with you. Follow-up ownership stated per Care plan. | `/practices/care` | Needs D-09 + clinical review (Q-04) |
| 11 | If I send you a client, do I lose them? | 00:31:53 | "Your client stays your client. We don't market competing coaching or practice services to clients you refer." | `/practices` | **Founder promise — needs D-09** |
| 12 | Will dosing and reconstitution information be available? | 00:32:51 | Research products: product documentation only; **no dosing instructions**. Care: your clinician provides instructions. A support assistant, if launched, will not give dosing advice. | `/faq`, product pages | Boundary per brief §4.5; Q-09 |
| 13 | Lyophilized vials or premixed syringes/pens? (Tammy) | 00:33:52 | "Research products ship as described on each product page (for example, lyophilized powder in a vial)." Premixed: do not mention. | product page format field | Format per product: ops verify (C-017) |
| 14 | What if a client already has an order from their own provider? | 00:14:31 | Do not answer publicly. | — | Q-10 counsel |
| 15 | Can we cross-promote coaching programs and retreats? | 00:37:47 | Not in launch IA; future "Programs" (Model E). | — | D-14 |

## Gemini summary vs transcript — corrections that matter

| Gemini says | Transcript actually shows | Consequence |
| --- | --- | --- |
| "Medical directors review and authorize all medical compound orders" | Samuel said providers will be "signing off on orders" and that *medical compounds* require approval async/sync; he also said a practice-referred Research order would bypass evaluation. | Do not publish "all orders are physician-approved". Research ≠ clinician-reviewed. |
| "Clinic parent accounts allow providers to place orders directly and track client commissions" | Proposed by Tammy; Samuel/Seth said it "could totally work"; Stephen raised liability; recorded under **Needs Further Discussion**. | Not a capability. D-08. |
| "Referral pathways and commission structures were established" | Economics were described verbally (commission on sales; monthly payout per Seth; weekly statements per Samuel). No rate agreed. | Not established. D-07/D-10. |
| "Rebranding … to Infinity Health" | Samuel said he is changing the name to Infinity Health. The execution brief (later) names Eon Health as the working favorite for the clinical arm and Infinity as the umbrella. | D-01/D-02 must resolve. |
| "393 SKUs, 114 peptides" | Said by Samuel. | Repo: 420 canonical / 513 reconciled / 439 live; do not publish a count (C-011). |

## Design requirements derived from Compass

1. **Practices are a first-class audience** with their own header item and page (not a card among eight).
2. **Referral is the default model.** The client creates and owns the account; the practice is attached as referrer.
3. **Research and Care are two separately labelled routes** a practice can send a client down; the practice never has to put its license behind a Research order.
4. **No practice ordering on a client's behalf** at launch; the reason is stated, not hidden.
5. **Client ownership language is explicit and approved** (the thing Stephen worried about most).
6. **Economics are described structurally in public** (what earns, when paid, where reported) and numerically only in the agreement.
7. **Every practice submission is an inquiry or an application**, never implied approval; the confirmation says who calls back and what they will ask.
8. **An intake/workflow questionnaire** (Samuel's action item) is the natural second step after an inquiry; the spec gives it a place (`09_PRACTICE_MODEL.md` §Onboarding) without inventing its content.
9. **Educational content ≠ clinical instruction.** Anything resembling dosing guidance is Care-only.
