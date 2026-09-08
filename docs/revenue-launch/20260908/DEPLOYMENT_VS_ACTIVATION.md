# Deployment versus activation — what users can actually do, 2026-09-08

Two milestones, stated separately so that approving one is never mistaken for
having the other.

## Milestone 1 — deploy the qualified code (`45f95dfe…`, flag off)

What changes on the live site the moment this is serving, with
`RESEARCH_RESOURCE_HUB_ENABLED` absent and the migration applied but dormant:

| Who | What they can do after Milestone 1 | What they still cannot do |
| --- | --- | --- |
| Every visitor | Same public site as today at `ff3c496`. | — |
| Signed-in customer | Same account experience as today; the account-state isolation repairs (no stale data after logout or account switch) are live. | Purchase, pay, or track an order: `commerceEnabled` stays `false`. |
| Approved affiliate / research rep | Partner dashboard with the repaired pages. A **Resources** entry appears in the partner navigation and opens an **empty library** with the honest panel "The resource library is published here when the partner platform launches. Until then, nothing is cleared for sharing." The recommendation **QR export** code is present on the Links page, but has no rendered browser proof yet and is not represented as launched. | Read or download any Xenios resource: the library answers empty and every byte read answers 503 `resource_hub_unavailable`. Share links or QR as a launched programme. |
| Admin | Admin doors exist at `/api/admin/research/resource-hub/*` and answer honestly dark: list empty, item reads 404, every write 503. | Upload, review, publish or withdraw a resource. |
| Recruiter, sales AE, organization user | Nothing new is delivered to these roles by this release. | Their workflows remain out of scope. |

Database after Milestone 1: three new tables (`research_resource_library`,
`research_resource_versions`, `research_resource_deliveries`) with FORCE RLS
and no client policies, three functions, one private bucket
`research-resource-library`, zero rows. The application does not read them
while the flag is off, so an unapplied or half-applied migration cannot
surface as a user-visible error either.

In plain terms: **Milestone 1 installs the machinery and turns nothing on.**

## Milestone 2 — activate and verify the Resource Hub

Separate approval, after Milestone 1 is serving and observed clean. In order:

1. **Flag.** Set `RESEARCH_RESOURCE_HUB_ENABLED=true` on the Render service
   (exact env change, restart, serving SHA unchanged). `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are already configured (`supabaseConfigured:
   true` on the live health endpoint).
2. **Content.** An admin uploads the approved documents through the real
   admin doors: upload (raw PDF + metadata header, scanned by the strict
   tokenizer — documents carrying embedded Content Credentials will be
   refused until re-exported), review, publish to an audience
   (`all_partners` / `research_reps`), with withdraw available. This is where
   the founder's internal PDFs either pass the scanner or get re-exported;
   nothing is pre-loaded.
3. **Users.** Decide who is in the audience: which affiliates and reps are
   `active` partners in production. Suspended and non-partner members stay
   denied by the existing gate.
4. **Live checks** (read-only, authorized): signed-in active affiliate sees
   the published library at `/research/partners/resources`; byte-exact
   download through the signed member session door; signed-out request
   answers 401; non-partner member answers 404 `partner_not_found`; a
   withdrawn version disappears from the library; delivery rows append once
   per download; admin denial for a non-admin member; no Storage policy error
   in logs.
5. **Rollback of activation** is the flag alone: set it back to absent and
   the hub is dark again with content and history retained.

Only after step 4 passes is it true that "affiliates can use the Resource
Hub."

## What neither milestone delivers

Price activation, payments, checkout, fulfilment, tracking, recruiter and
sales-AE workflows, organization access, customer/affiliate CRM as
operational features. They are part of the mission and are **not** in this
candidate as operational features. Describing Milestone 1 or 2 as the full
Xenios Health launch would be false.
