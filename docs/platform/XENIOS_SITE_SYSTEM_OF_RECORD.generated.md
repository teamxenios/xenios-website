# Xenios Site System of Record

Generated from source commit: `a33bb75e4466d33c43e867fbafc97bf4524f712a` (2026-09-04T21:05:29-05:00)

Source tree: `c9160f0c7144f7be87100b6fa4d7a2c80a59cfca` on `codex/xenios-major-ordering-admin-sor-20260904`

Recorded production: `db5a2d447114c1e8a14185a9865ded50ee3f1ac6` / `dep-dad08h740ujc73aprfcg` (live_verified)

> Source, test, browser, and production status are independent evidence axes. A mounted route is never treated as deployment proof.

## Important capabilities

| Capability | Persona | Route | Source | Tests | Browser | Production | Owner task | Next exact action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Living Site System of Record | founder_engineering_operations | — | source_present | focused_tests_pass | unknown | built_not_deployed | XENIOS-MAJOR-ORDERING-ADMIN-SOR-20260904 | Regenerate and byte-check the three artifacts after every committed coherent source checkpoint. |
| Research public gateway | public_research_visitor | /research | mounted | focused_tests_pass | unknown | live_verified | CARE-RESEARCH-POSTLAUNCH-20260831 | Keep pathway copy aligned with current server-authorized Research, Care, account, and assisted-order doors. |
| Quick Early Access ordering | quick_early_access_customer | /research/early-access | mounted | focused_tests_pass | browser_verified | deployed_not_authenticated_smoked | XENIOS-QUICK-EARLY-ACCESS-V2-20260904 | Build the source-qualified, member-scoped normalized customer timeline from canonical account and order projections without inferring source from reference prefixes or list scans. |
| Assisted and volume Research order requests | research_customer | /research/early-access/order-request | mounted | full_suite_pass | unknown | deployed_not_authenticated_smoked | ASSISTED-ORDER-MOUNT | Reuse this request authority from the Order Entry Hub and later Quick Early Access simplification. |
| Customer account and order history portal | research_customer | /research/account | mounted | focused_tests_pass | browser_verified | unknown | UX-AUTH-ACCOUNT-CONTINUITY-20260904 | Build the normalized customer timeline on these canonical account and order projections. |
| Referral recommendation and durable attribution continuity | partner_affiliate_and_referral_recipient | /r/:code | mounted | full_suite_pass | browser_verified | built_not_deployed | UX-REFERRAL-RECOMMENDATION-V1-20260904 | Preserve referral and intended-destination context through the Order Entry Hub without changing referral authority. |
| Xenios Care manual access request | care_requester | /care | mounted | focused_tests_pass | unknown | live_verified | CARE-MANUAL-ACCESS-20260831 | Keep Care access separate from Research ordering and route clinical needs only to this Care-owned workflow. |
| Care access request operations queue | founder_care_operations | /admin/research/care-requests | mounted | focused_tests_pass | unknown | deployed_not_authenticated_smoked | CARE-ADMIN-RELIABILITY-20260903 | Expose only bounded aggregate attention in the Founder Command Center and link here for operations. |
| Membership application and review | applicant_and_membership_operations | /research/apply | mounted | unknown | unknown | blocked_external | APP-MEMBERSHIP | Continue operator UX improvements without opening the public write until legal versions are authoritative. |
| Product Control and pricing operations | founder_product_operations | /admin/research/products | mounted | unknown | unknown | deployed_not_authenticated_smoked | unassigned | Add reviewed price-approval, comparison, bulk-draft, import-preview, and release-readiness UX on this authority. |
| Manual payment review | founder_finance_operations | /admin/research/early-access/payments | mounted | unknown | unknown | deployed_not_authenticated_smoked | unassigned | Expose a read-only attention count in the Founder Command Center and keep all review actions in this workflow. |
| Fulfillment and tracking operations | founder_fulfillment_operations | /admin/research/early-access/fulfillment | mounted | unknown | unknown | deployed_not_authenticated_smoked | FULFILLMENT-MOUNT | Expose read-only paid-awaiting-release, missing-tracking, and exception attention in the Founder Command Center. |
| Clinic, organization, and professional-buyer orientation | organization_buyer | /research/organizations | mounted | unknown | unknown | blocked_external | F7-ACCOUNT-MOUNT | Route organization interest here without implying that a workspace already exists. |
| Order Entry Hub | all_legitimate_ordering_personas | /research/order | mounted | focused_tests_pass | browser_verified | built_not_deployed | XENIOS-MAJOR-ORDERING-ADMIN-SOR-20260904 | Resolve canonical request and shipment-event read-authority gaps before the normalized customer timeline; preserve this hub's intent-only role. Local browser evidence is not production certification. |
| Founder Command Center | founder_admin_operations | /admin/research/command-center | mounted | focused_tests_pass | browser_verified | built_not_deployed | XENIOS-MAJOR-ORDERING-ADMIN-SOR-20260904 | Preserve the read-only projection while extending canonical workflow sources. Local synthetic auth/unavailable-state browser evidence is not production admin/API certification. |

## Site route inventory

| Route | Persona | Domain | Source | Tests | Browser | Production | Registration evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| / | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:154 |
| /about | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:165 |
| /admin | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/App.tsx:181 |
| /admin/research | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/App.tsx:183; client/src/research/adminx-section.tsx:141 |
| /admin/research/* | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/App.tsx:184 |
| /admin/research/activation-bridge | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:179 |
| /admin/research/activation-checklist | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:180 |
| /admin/research/activation-queue | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:178 |
| /admin/research/activation-readiness | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:182 |
| /admin/research/activation-reconciliation | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:181 |
| /admin/research/applications | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:145 |
| /admin/research/applications/:id | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:146 |
| /admin/research/assisted-orders | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:162 |
| /admin/research/assisted-orders/:requestId | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:163 |
| /admin/research/audit | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:187 |
| /admin/research/blueprint-review | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:151 |
| /admin/research/capabilities | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:176 |
| /admin/research/care-requests | founder_care_operations | operations | mounted | focused_tests_pass | unknown | deployed_not_authenticated_smoked | client/src/research/adminx-section.tsx:143 |
| /admin/research/command-center | founder_admin_operations | operations | mounted | focused_tests_pass | browser_verified | built_not_deployed | client/src/research/adminx-section.tsx:142 |
| /admin/research/commerce-queues | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:167 |
| /admin/research/early-access/fulfillment | founder_fulfillment_operations | operations | mounted | unknown | unknown | deployed_not_authenticated_smoked | client/src/research/adminx-section.tsx:186 |
| /admin/research/early-access/payments | founder_finance_operations | operations | mounted | unknown | unknown | deployed_not_authenticated_smoked | client/src/research/adminx-section.tsx:185 |
| /admin/research/early-access/releases | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:184 |
| /admin/research/esign | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:183 |
| /admin/research/fulfillment | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:166 |
| /admin/research/guides | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:170 |
| /admin/research/guides/:id | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:171 |
| /admin/research/inventory | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:159 |
| /admin/research/inventory/coas | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:158 |
| /admin/research/inventory/lots | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:157 |
| /admin/research/members | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:147 |
| /admin/research/members/:id | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:148 |
| /admin/research/orders | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:164 |
| /admin/research/orders/:id | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:165 |
| /admin/research/partners | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:172 |
| /admin/research/partners/:id | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:173 |
| /admin/research/plans | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:149 |
| /admin/research/plans/:id | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:150 |
| /admin/research/privacy | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:175 |
| /admin/research/product-configuration | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:154 |
| /admin/research/product-requests | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:155 |
| /admin/research/product-requests/:id | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:156 |
| /admin/research/products | founder_product_operations | operations | mounted | unknown | unknown | deployed_not_authenticated_smoked | client/src/research/adminx-section.tsx:152 |
| /admin/research/products/:id | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:153 |
| /admin/research/questions | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:168 |
| /admin/research/questions/:id | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:169 |
| /admin/research/referral-lifecycle | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:144 |
| /admin/research/required-inputs | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:177 |
| /admin/research/security | founder_admin_operations | operations | mounted | unknown | unknown | unknown | client/src/research/adminx-section.tsx:174 |
| /agents | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:205 |
| /argos | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:202 |
| /book | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:179 |
| /care | care_requester | care | mounted | focused_tests_pass | unknown | live_verified | client/src/App.tsx:197 |
| /care/* | care_requester | care | mounted | unknown | unknown | unknown | client/src/App.tsx:198 |
| /care/appointments | care_requester | care | mounted | unknown | unknown | unknown | client/src/App.tsx:194 |
| /care/consent | care_requester | care | mounted | unknown | unknown | unknown | client/src/App.tsx:193 |
| /care/eligibility | care_requester | care | mounted | unknown | unknown | unknown | client/src/App.tsx:192 |
| /care/pharmacy | care_requester | care | mounted | unknown | unknown | unknown | client/src/App.tsx:196 |
| /care/prescriptions | care_requester | care | mounted | unknown | unknown | unknown | client/src/App.tsx:195 |
| /careers | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:168 |
| /careers/:slug | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:167 |
| /careers/innovative-product-builder | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:166 |
| /compliance | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:172 |
| /concepts | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:180 |
| /contact | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:170 |
| /developers | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:206 |
| /disclosures | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:177 |
| /early-interest | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:178 |
| /ecosystem | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:161 |
| /enterprise | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:207 |
| /faq | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:210 |
| /for-clients | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:158 |
| /for-coaches | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:157 |
| /for-practitioners | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:162 |
| /for/:slug | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:163 |
| /health | public_health_visitor | care | mounted | unknown | unknown | unknown | client/src/App.tsx:186 |
| /how-it-works | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:156 |
| /investors | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:173 |
| /kairos | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:201 |
| /manifesto | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:164 |
| /mvps | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:200 |
| /network | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:160 |
| /ontology | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:208 |
| /partners | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/App.tsx:209 |
| /press | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:174 |
| /privacy | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:175 |
| /product | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:155 |
| /r/:code | partner_affiliate_and_referral_recipient | referrals_partners | mounted | full_suite_pass | browser_verified | built_not_deployed | client/src/App.tsx:187 |
| /research | public_research_visitor | research_experience | mounted | focused_tests_pass | unknown | live_verified | client/src/App.tsx:190; client/src/research/section.tsx:302 |
| /research/__gallery/:page | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:350 |
| /research/* | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/App.tsx:191 |
| /research/about | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:329 |
| /research/access | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:452 |
| /research/access-gate | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:454 |
| /research/access-hub | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:305 |
| /research/access-state | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:324 |
| /research/account | research_customer | identity_accounts | mounted | focused_tests_pass | browser_verified | unknown | client/src/research/section.tsx:363 |
| /research/account/care | research_customer | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:357 |
| /research/account/documents | research_customer | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:358 |
| /research/account/interests | research_customer | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:361 |
| /research/account/orders | research_customer | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:355 |
| /research/account/orders/:reference | research_customer | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:354 |
| /research/account/profile | research_customer | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:359 |
| /research/account/security | research_customer | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:360 |
| /research/account/subscription | research_customer | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:356 |
| /research/account/support | research_customer | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:362 |
| /research/activate | public_research_visitor | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:323 |
| /research/affiliates | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:342 |
| /research/application-status | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:320 |
| /research/application/status | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:319 |
| /research/apply | applicant_and_membership_operations | research_experience | mounted | unknown | unknown | blocked_external | client/src/research/section.tsx:315 |
| /research/apply/review | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:316 |
| /research/apply/status | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:318 |
| /research/apply/success | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:317 |
| /research/build-a-system | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:445 |
| /research/cart | public_research_visitor | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:447 |
| /research/contact | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:337 |
| /research/documents | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:334 |
| /research/early-access | quick_early_access_customer | commerce | mounted | focused_tests_pass | browser_verified | deployed_not_authenticated_smoked | client/src/research/section.tsx:308 |
| /research/early-access/order-request | research_customer | commerce | mounted | full_suite_pass | unknown | deployed_not_authenticated_smoked | client/src/research/section.tsx:312 |
| /research/early-access/order-request/:publicReference | quick_early_access_customer | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:314 |
| /research/early-access/order-request/confirmation/:publicReference | quick_early_access_customer | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:313 |
| /research/faq | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:331 |
| /research/framework | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:449 |
| /research/guides | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:435 |
| /research/how-it-works | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:330 |
| /research/learn | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:446 |
| /research/lots/:lotCode | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:335 |
| /research/member | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:367 |
| /research/member/assessment | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:372 |
| /research/member/blueprint | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:373 |
| /research/member/cart | research_member | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:397 |
| /research/member/catalog | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:384 |
| /research/member/catalog/:family/:slug | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:383 |
| /research/member/checkout | research_member | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:398 |
| /research/member/diagnostics | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:389 |
| /research/member/documents | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:376 |
| /research/member/documents-center | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:377 |
| /research/member/education | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:391 |
| /research/member/goals | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:379 |
| /research/member/goals/:slug | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:380 |
| /research/member/guides | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:395 |
| /research/member/guides/:slug | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:396 |
| /research/member/kris-catalog | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:386 |
| /research/member/kris-catalog/:family/:slug | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:385 |
| /research/member/membership | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:368 |
| /research/member/metabolic-care | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:388 |
| /research/member/orders | research_member | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:399 |
| /research/member/orders/:id | research_member | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:400 |
| /research/member/privacy | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:370 |
| /research/member/product-requests | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:394 |
| /research/member/product-requests/new | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:393 |
| /research/member/products | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:381 |
| /research/member/products/:slug | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:382 |
| /research/member/profile | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:371 |
| /research/member/questions | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:402 |
| /research/member/referrals | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:403 |
| /research/member/security | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:369 |
| /research/member/storage | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:390 |
| /research/member/subscriptions | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:401 |
| /research/member/supplements | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:387 |
| /research/member/support | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:392 |
| /research/member/tracker | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:378 |
| /research/member/welcome | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:325 |
| /research/member/xenios-30 | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:374 |
| /research/member/xenios-90 | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:375 |
| /research/membership | research_member | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:448 |
| /research/order | all_legitimate_ordering_personas | commerce | mounted | focused_tests_pass | browser_verified | built_not_deployed | client/src/research/section.tsx:306 |
| /research/orders | public_research_visitor | commerce | mounted | unknown | unknown | unknown | client/src/research/section.tsx:436 |
| /research/organizations | organization_buyer | organizations | mounted | unknown | unknown | blocked_external | client/src/research/section.tsx:340 |
| /research/partners | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:341 |
| /research/partners/apply | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:407 |
| /research/partners/campaigns | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:412 |
| /research/partners/commissions | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:416 |
| /research/partners/compliance | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:419 |
| /research/partners/conversions | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:415 |
| /research/partners/dashboard | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:410 |
| /research/partners/events | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:413 |
| /research/partners/leads | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:414 |
| /research/partners/links | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:411 |
| /research/partners/onboarding | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:408 |
| /research/partners/organizations | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:418 |
| /research/partners/payouts | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:417 |
| /research/partners/resources | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:420 |
| /research/partners/security | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:422 |
| /research/partners/support | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:421 |
| /research/partners/training | partner_affiliate | referrals_partners | mounted | unknown | unknown | unknown | client/src/research/section.tsx:409 |
| /research/peptides | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:441 |
| /research/policies | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:336 |
| /research/policies/:policy | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:343 |
| /research/privacy | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:327 |
| /research/product/:slug | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:432 |
| /research/products | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:425 |
| /research/products/:slug | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:429 |
| /research/products/peptides | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:426 |
| /research/products/quantum | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:428 |
| /research/products/supplements | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:427 |
| /research/professionals | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:451 |
| /research/profile | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:439 |
| /research/programs | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:450 |
| /research/quality | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:332 |
| /research/quantum | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:443 |
| /research/referrals | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:438 |
| /research/reset-password | public_research_visitor | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:322 |
| /research/shop | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:444 |
| /research/sign-in | public_research_visitor | identity_accounts | mounted | unknown | unknown | unknown | client/src/research/section.tsx:321 |
| /research/subscriptions | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:437 |
| /research/supplements | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:442 |
| /research/supplier-access | supplier_fulfillment | supplier_fulfillment | mounted | unknown | unknown | unknown | client/src/research/section.tsx:307 |
| /research/support | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:326 |
| /research/systems | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:440 |
| /research/terms | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:328 |
| /research/testing | public_research_visitor | research_experience | mounted | unknown | unknown | unknown | client/src/research/section.tsx:333 |
| /research/wholesale | organization_buyer | organizations | mounted | unknown | unknown | unknown | client/src/research/section.tsx:453 |
| /security | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:171 |
| /storefront | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:159 |
| /telemedicine | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:204 |
| /terms | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:176 |
| /waitlist | public_visitor | corporate_site | mounted | unknown | unknown | unknown | client/src/App.tsx:169 |

## Status vocabulary

- `source_present`
- `mounted`
- `focused_tests_pass`
- `full_suite_pass`
- `browser_verified`
- `built_not_deployed`
- `deployed_not_authenticated_smoked`
- `live_verified`
- `feature_gated`
- `blocked_external`
- `superseded`
- `unknown`

## Invariants

- Production status is explicit evidence tied to an exact production SHA; it is never inferred from source presence.
- A mounted route is not proof of deployment, authentication, data readiness, payment, fulfillment, or clinical action.
- One canonical identity, catalog, pricing, order, referral, Care, notification, and audit authority is extended rather than duplicated.
- Requests are not paid orders; payment is not fulfillment; Care access requests are not appointments, treatment, prescriptions, or clinical decisions.
- Generated records contain technical coordination facts only: no credentials, customer exports, patient data, clinical narratives, or raw payment evidence.
