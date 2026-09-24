# Baseline coverage before repair

230 browser observations and 3,158 observed link instances were saved before application edits. These are observations, not 230 complete passing scenarios. Repeated header/footer links remain distinct occurrences. The link inventory does not yet cover every button, disclosure, keyboard action or form state.

## Scenario matrix

| Persona / scenario | Environment | Observation | Evidence / remaining limit |
| --- | --- | --- | --- |
| New visitor, mobile discovery | Candidate bundle | Sign in and Get access visible; chooser reaches partner pathway | candidate-home-390 and candidate-access-hub-mobile snapshots. Initial viewport names reflect requested size; exact pixels were later verified using CDP. |
| Public Research information | Candidate bundle | Support, policies, legal draft status, quality, testing, documents, contact, organizations, affiliates render | baseline-_research_* snapshots. Page render is not complete CTA testing. |
| Corporate public pages and aliases | Candidate bundle | Principal destinations render; legacy aliases reach intended corporate pages | baseline-_*, alias-* snapshots. External Kairos handoff NOT RUN. |
| Formal application | Candidate bundle | Apply, review and success routes stay closed, no application implied | candidate-application-closed and alias-* snapshots |
| Partner signed out | Candidate bundle | Dashboard denies data, sign-in preserves returnTo | candidate-partner-signed-out and candidate-partner-signin-return |
| Invalid application token | Candidate bundle | Invalid/expired message and request-new-link recovery | status-invalid-token. Real expired, consumed, approved and wrong-owner token states NOT RUN. |
| Recovery and unsafe returnTo | Candidate bundle | Recovery preserves internal destination; external destination omitted from continuation links | candidate-reset-* and signin-external-return-rejected. Provider delivery NOT RUN; generic recovery message does not prove delivery. |
| B2B submission without email provider | Candidate bundle | FAIL: falsely claims inquiry receipt, follow-up and future confirmation | candidate-partnership-no-provider-result; AUD-001 |
| Returning active customer | Synthetic account adapter + candidate SPA | Sign-in reaches account; all account navigation exercised; incomplete histories labeled unavailable | account-rich-* |
| Empty customer | Synthetic adapter | Empty/partial history is not fabricated complete zero; no partner navigation | account-empty-* |
| Missing partner relationship | Synthetic adapter | Direct dashboard says no partner attached, separates customer access | account-empty-partner-direct |
| Paused customer | Synthetic adapter | Inactive access screen, no automatic reopening | account-paused-signin |
| Account support | Synthetic memory adapter | Records support request and shows it in history; sign out reaches public Research home | account-rich-support-result, account-signout-result. Fixture supplies epoch timestamp; this is not evidence of a production date defect or durable persistence. |
| Care public access | Candidate bundle | Request unavailable, clear alternate support; clinical surfaces disabled/not activated | baseline-_care* |
| Signed-out account/catalog routes | Candidate bundle | Sign-in preserves requested destination | signedout-_research_account* and signedout-_research_member_catalog |
| Legacy member/partner routes | Candidate bundle | Most are deliberately under review | signedout-*; operations behind gate NOT RUN |
| Admin signed out | Candidate bundle | Shell visible; admin form or explicit sign-in alert blocks records/actions | signedout-_admin*, admin-signedout-settled |
| Responsive access hub | Candidate bundle | Captured actual 390×844, 768×1024, 1440×1000 layouts; no horizontal overflow at measured 390 and 1440 | access-hub-actual*.png. Earlier screenshot size labels are requests, not measurements. |
| Keyboard sample | Candidate bundle | Tab moves from gateway link to Explore Xenios summary with native outline | Direct browser DOM focus observation. Full keyboard/accessibility audit NOT RUN. |

## Notification/lifecycle matrix

| Event | Customer / internal notification | Persistence / authority | Fresh proof |
| --- | --- | --- | --- |
| Business inquiry | Team contact forward + courtesy customer reply | Existing email-owned contact route; no durable inquiry row | Missing-provider false success reproduced. Provider acceptance/rejection, retry and duplicate behavior need repair tests. |
| Account support | Existing customer-account support ports | Synthetic memory case only in this audit | Browser receipt visible; real DB/outbox/delivery NOT RUN. |
| Application status / approval / activation | Canonical application and Auth systems | Secure token, identity and approved-account boundaries | Missing/invalid UI observed. Real delivery, approval and binding NOT RUN. |
| Recovery | Canonical Auth recovery | Generic anti-enumeration response | Browser generic message only. Actual provider receipt/reset/consumption NOT RUN. |
| Research request/order/payment | Canonical Early Access / assisted / native commerce | Native commerce remains false; manual verification remains authoritative | Entry/gates only; invoice, proof, verification, fulfillment and notifications NOT RUN. |
| Care request / clinical handoff | Existing Care authority and notifications | Public routing separate from clinical systems | Unavailable public state observed. No clinical or administrative transition performed. |
| Partner attribution / commission / payout | Existing partner ledger | Owner-scoped synthetic fixture | Dashboard renders bounded activity. Real attribution, payout and notifications NOT RUN. |
| Supplier assignment / shipment / recall | Existing supplier / fulfillment authority | Invitation and exact assignment gates | Public invitation boundary and admin signed-out gates only. |

## Admin operations matrix

Founder command center, applications, members, plans, blueprint review, product configuration, product requests, inventory/lots/COAs, assisted orders, orders, fulfillment, commerce queues, questions, guides, partner management, activation and governance are covered by signed-out entry observations. Queue data, empty/error loading behavior under an authorized admin, mutations, duplicate protection, retries and audits remain BLOCKED by absence of a production-equivalent isolated privileged fixture in this run. Source declarations are catalogued in route-inventory.json; they are not operational proof.

## Repair decision

AUD-001 is a demonstrated P1 and can be repaired without changing Auth, database schema, commerce flags, pricing, Care, clinical authority, or outbox ownership. Await the existing team email provider's acceptance; return a truthful failure when unavailable or rejected; report courtesy-confirmation acceptance independently. Do not create another CRM or notification authority. Deferred: wider copy cleanup, speculative route redesign, and privileged workflows without browser evidence.

Full requested adversarial coverage is not complete. NOT READY is the only justified release recommendation until remaining scenarios, complete CTA exercise, privileged fixtures and release gates are satisfied. This baseline authorizes only the demonstrated narrow repair within the user's scoped repair instruction.
