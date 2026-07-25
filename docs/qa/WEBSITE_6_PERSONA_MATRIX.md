# Website 6 persona and journey matrix

This is the release-level persona contract. Domain tests may prove individual
services; Website 6 owns the cross-surface access and presentation evidence.

| Persona | Entry | Permitted surface | Must be denied | Required QA state |
|---|---|---|---|---|
| Public | `/`, `/research` | Public marketing; gated Research entrance | Member, partner, admin data | Route, SEO, mobile, keyboard, WCAG smoke |
| Applicant | `/research/apply` | Application, status, support, legal | Member catalog and admin | Form validation, retry, loading, status-token privacy |
| Approved unclaimed | `/research/application-status` | Claim flow | Active member content before claim/activation | Claim token expiry and replay |
| Pending member | `/research/activate` | Activation checklist | Active-only catalog, plans, tracker | Incomplete, retry, expired session, concurrent tab |
| Active member | `/research/member` | Member home and all enabled member capabilities | Other member records and admin | Full member journey; empty/loading/error/recovery |
| Trainer | Partner/admin delegated entry | Training content assigned to role | Member health data and unrelated operations | Delegated-role deny matrix |
| Affiliate applicant | `/research/partners/apply` | Partner application | Partner dashboard before approval | Validation, duplicate submission, retry |
| Affiliate | `/research/partners` | Own dashboard, links, commissions, resources | Other affiliate/member/admin data | Own-record isolation and mobile |
| Mitch | `/admin/research` | Assigned operational queues | Super-admin-only and unrelated sensitive data | Delegated authorization |
| Fulfillment staff | `/admin/research/fulfillment` | Assigned shipments and evidence | Assessment, prescription, unrelated PII | Minimum-field presentation and audit |
| Inventory manager | `/admin/research/inventory` | Lots, stock, COAs | Member health data | Upload validation and least privilege |
| Customer support | Admin support surfaces | Necessary support records | Clinical/lab/payment secrets | Redacted error and data-leak scan |
| Affiliate manager | Partner admin surfaces | Applications, compliance, commissions | Member health records | Delegated authorization |
| Professional account | `/research/partners` | Professional/organization workflows | Consumer member private records | Organization isolation |
| Research admin | `/admin/research` | Research administration | Production secrets and raw credentials | Supabase admin session and recovery-token denial |
| Super admin | `/admin/research` | Explicitly enabled administrative actions | Client-side authority assumptions | Server authorization for every mutation |
| Care preview patient | `/care` when enabled | Preview patient experience | Research/admin data | Disabled-by-default and noindex |
| Clinician | Care clinician surface when enabled | Assigned patient clinical workflow | Unassigned patients and pharmacy operations | Role and assignment enforcement |
| Clinical admin | Care admin surface when enabled | Clinical administration | Super-admin/Research data | Role separation |
| Pharmacy operations | Care pharmacy surface when enabled | Assigned pharmacy operations | Clinical notes not required for fulfillment | Minimum necessary data |

## Required state dimensions

Every implemented journey is evaluated for loading, empty, disabled, validation
error, server error, retry/recovery, expired session, concurrent tabs, reduced
motion, 200% zoom/reflow, and the 320/375/430/tablet/desktop viewport matrix.
Unimplemented Care routes must remain disabled, absent from the sitemap, and
`noindex`.

