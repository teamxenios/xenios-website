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
