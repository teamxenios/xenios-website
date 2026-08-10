# Rollback notes: research_fm_document_category_expansion (migration 63)

## What this migration changes

Two CHECK constraints, and nothing else.

| Object | Kind | Reversible |
| --- | --- | --- |
| `research_fm_document_versions_category_check` | replaced check constraint (16 to 20 values) | yes |
| `research_fm_document_signatures_category_check` | replaced check constraint (16 to 20 values) | yes |

It creates no table, no index, no trigger, no function, no grant and no row. It
drops nothing that is not immediately recreated in a wider form. It publishes no
legal document, creates no signature, records no legal binding and registers no
agreement package.

The original constraints were inline column checks with server-generated names.
M63 drops any single-column check on `category` by structural discovery rather
than by name, then adds one canonical, named constraint per table. That is what
makes a second apply a no-op in effect.

## The safe rollback

The migration is additive in the only sense that matters: it widens an accepted
set. Rolling it back is therefore only meaningful while no row uses one of the
four new categories. Check first, and refuse to narrow if any exist:

```sql
select category, count(*)
  from public.research_fm_document_versions
 where category in ('website_terms_of_use','product_purchase_terms',
                    'shipping_claims_replacement_policy','payment_evidence_upload_consent')
 group by category
union all
select category, count(*)
  from public.research_fm_document_signatures
 where category in ('website_terms_of_use','product_purchase_terms',
                    'shipping_claims_replacement_policy','payment_evidence_upload_consent')
 group by category;
```

If that returns zero rows, the narrowing is safe:

```sql
begin;
alter table public.research_fm_document_versions
  drop constraint research_fm_document_versions_category_check;
alter table public.research_fm_document_versions
  add constraint research_fm_document_versions_category_check check (category in (
    'electronic_record_consent','founding_membership_agreement','activation_terms',
    'recurring_membership_authorization','immediate_cancellation_acknowledgment',
    'membership_covenant','confidentiality_covenant','privacy_notice',
    'research_education_disclaimer','assumption_of_risk_acknowledgment',
    'no_guarantee_acknowledgment','arbitration_agreement','manual_payment_bridge_terms',
    'identity_age_verification_consent','sensitive_health_data_consent',
    'referral_store_credit_terms'));
alter table public.research_fm_document_signatures
  drop constraint research_fm_document_signatures_category_check;
alter table public.research_fm_document_signatures
  add constraint research_fm_document_signatures_category_check check (category in (
    'electronic_record_consent','founding_membership_agreement','activation_terms',
    'recurring_membership_authorization','immediate_cancellation_acknowledgment',
    'membership_covenant','confidentiality_covenant','privacy_notice',
    'research_education_disclaimer','assumption_of_risk_acknowledgment',
    'no_guarantee_acknowledgment','arbitration_agreement','manual_payment_bridge_terms',
    'identity_age_verification_consent','sensitive_health_data_consent',
    'referral_store_credit_terms'));
commit;
```

## NOT AN AD-HOC ROLLBACK ONCE A DOCUMENT IS PUBLISHED

If any document version has been published in one of the four new categories, or
any member has signed one, narrowing the constraint would make the table refuse
its own rows and would strand a legal record. Do not do it. A published legal
document and a member signature are permanent records: the versions table
refuses DELETE on anything past draft, and the signatures table is append-only
by trigger. Rolling back after publication needs explicit legal review, not a
migration.

The application half of this correction (the four `DocumentCategory` values and
the four manifest mappings) must be rolled back together with the schema half,
or the code will write categories the database refuses. They are one change.

## What this migration does NOT undo

M63 removes a structural blocker; it does not activate anything. After M63 the
Early Access legal package is still unpublished, still undesignated, and still
unsigned. `registerLegalPackage` and `DocumentLifecycle.publish` still have no
production caller, and `SupabaseEarlyAccessLegalBindingWriter` still has no
production write caller. Rolling M63 back re-creates the deadlock; it does not
turn anything off, because nothing was turned on.

## Verification

`supabase/verification/research-fm-document-category-expansion.verify.sql`,
driven by `scripts/verify-m63-legal-signability.sh 16` and `... 17`.
