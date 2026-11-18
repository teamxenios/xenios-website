# Business enquiry application composition

Root source preparation over qualified `2644a206` (#525/run44398865292).
That source ran 105 focused cases, including 21 real PostgreSQL cases, and all
six required hosted checks passed. Application companion execution is separate.

The composition uses the existing durable business service/RPC and ordinary
Supabase/Care JWT verifier. SQL rechecks dedicated business roles/capabilities
or canonical B2B membership on each read/command. A request queue-reader role,
domain, form field or frontend selector supplies none of that authority.
The new application SQL extends existing role constraints without replacing
their permitted values, seeds two capabilities disabled, and grants no human role.

GET `/api/research/business-inquiries/config` returns only enabled state and,
when all database policy/visibility/retention/staff prerequisites pass, an opaque
attempt prefix. A purpose-separated signed HttpOnly/Secure/SameSite=Strict
cookie binds that prefix. It contains no contact details and grants no Auth,
catalog, organization or staff capability. Its TTL is explicit configuration,
not the catalog-entry policy. Same-origin JSON and the canonical durable rate
limit protect submission. Missing or failed durable limiting refuses.

Before a new explicit attempt, the client loads config and freezes
`attemptPrefix + crypto.randomUUID()` with its validated payload. It never
regenerates either after an uncertain result. Repeated config calls preserve
the same valid cookie. Expiry, replacement or a changed nonce rejects the old
prefix instead of creating the same enquiry under a different owner hash.
Such an expired uncertain attempt needs support reconciliation; it is never
shown as saved or automatically resubmitted. No anonymous email lookup exists.

The existing organization form remains separate from affiliate, partner and
supplier local draft forms. The page is unavailable until actual readiness is
bound. A saved onscreen reference is not an acknowledgement email, account,
quote, stock reservation, order or wholesale approval. Business notification
intent dispatch and its own durable business-data policy remain separate from
the approved Early Access request-specific policies.

## Proposed activation actions, not approved or executed

1. Review the exact combined source/SQL bytes and real owned-PG/HTTP/UI checks.
2. Obtain actual business-scope retention/recipient records and visibility owner.
   Do not reuse request-only policies by changing their scope in JSON.
3. Register the two candidate SQL files through Root's CLI-generated migration
   sequence, ledger, DAG and actual apply-twice proof. No filename is invented here.
4. Apply under a separately approved exact managed action; verify ACLs, RLS,
   preserved role constraints, capabilities off and no role assignment.
5. Approve named narrow reader/operator assignment and monitoring ownership.
6. Bind the real business policy/readiness; configure exact service/project,
   `RESEARCH_BUSINESS_INQUIRY_CONTEXT_SECONDS` and
   `RESEARCH_BUSINESS_INQUIRY_ENABLED`. These flags remain off in this source work.
7. Run an approved controlled synthetic enquiry/retry/staff/foreign-org check,
   reporting actual request persistence separately from notification delivery.

Rollback disables the application flag and database configuration; it does not
delete saved enquiries, rewrite receipts, revoke unrelated roles or replay mail.
The signed context is scoped to canonical SITE_URL, so copied cookies are refused
in another environment. Existing secret rotation invalidates pending context;
the frozen-prefix refusal prevents automatic duplicate creation after rotation.

No merge, deployment, managed SQL, policy publication, production grant, customer
submission or provider action is authorized by this document. Samuel must review
the concrete action packet and approve the exact action first.
# Staff request-desk composition successor

Root composes the author's joined production-HTTP/owned-PG case34350e58,
documentation9eadcf85 and six-file read-only business queuea2984e19 in this
same525 stream. The existing `/care/request-intents` shell offers Product
requests and Business enquiries views to its ordinary authenticated session.
Opening the business view is explicit; it performs no background enquiry read
while Product requests is selected. It uses the same canonical SDK token,
Care transport and synchronous current-binding fence, with a new opaque local
generation on credential binding change. This is UI state, never role authority.
The server's separate business permissions still decide list/detail access.
No request-reader, website-admin or clinical role gains business access here.

One view is mounted at a time, preserving one primary heading. Returning to
product requests retains the existing session's in-memory review command
journal. Business denial clears that queue without disabling the product
request desk. Logout invalidates the shared binding before React updates and
discards a pending business response. No Auth store, credential persistence,
route, assignment operation, role grant, notification or managed action is added.

Three actual-shell regression cases are authored for on-demand canonical
transport, separate business denial and pending read after logout. The author's
28 renderer/58 API cases and joined real-PG journey are also in the focused
business gate. All new successor execution remains pending until its exact
hosted run finishes. Green93705058 remains predecessor evidence, including its
298 focused passes/realPG21/applicationPG5 and full19993PASS/83SKIP; the10644
fixture bootstrap failure is retained. No new pass is inferred from this text.

Exacte9d54eb5 subsequently passed all six jobs in44414358566:410focused,
including real durablePG22/applicationPG5, queue28/API58 and actual Care desk25;
full20,083PASS/83SKIP. Independent review then found a finite view-lifetime
defect: switching away and back reset the child queue's403denial on the same
Root binding. The successor remembers actual401/403 at the business API binding
above that child remount. Product review and its journal remain independent;
an eligible new credential binding can establish a fresh business context.
The new shell regression exercises that denial/reentry/credential-refresh chain.
The JSON fixture now carries its real application/json content type. New
successor execution is separate from the green e9 predecessor.
