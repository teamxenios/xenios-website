# Complete integrated path classification

Source: `756a906877dbc174b7e228a259d2faa9c3af48ca`; tree: `787432948d9464880df1dcfc5dff58eec7d889aa`.

65 accepted source/test/candidate paths: 36 runtime, 25 tests, 2 SQL candidates, 1 local SQL verifier and 1 MC-01 rollback companion. All 65 pass the composition invariant. 63 exact accepted final blobs; AssistedOrderPage semantic composition and HTTP 400/403 refusal test are the two intentional differences. See evidence/composition-invariants.json for accepted Git blobs and actual LF SHA-256 values.

| Path | Class | Last accepted input | Binding |
| --- | --- | --- | --- |
| `client/src/clarity/brand.ts` | runtime | `70cd421a6ab79513744f531d921b3ece61044874` | exact-accepted-final-blob |
| `client/src/components/Footer.tsx` | runtime | `70cd421a6ab79513744f531d921b3ece61044874` | exact-accepted-final-blob |
| `client/src/components/Navbar.tsx` | runtime | `70cd421a6ab79513744f531d921b3ece61044874` | exact-accepted-final-blob |
| `client/src/index.css` | runtime | `70cd421a6ab79513744f531d921b3ece61044874` | exact-accepted-final-blob |
| `client/src/research/account-portal/account-portal.css` | runtime | `70cd421a6ab79513744f531d921b3ece61044874` | exact-accepted-final-blob |
| `client/src/research/assisted-order/AssistedOrderConfirmationPage.tsx` | runtime | `70cd421a6ab79513744f531d921b3ece61044874` | exact-accepted-final-blob |
| `client/src/research/assisted-order/AssistedOrderPage.tsx` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | DE-final-plus-exact-Core-customer-wrapper |
| `client/src/research/assisted-order/AssistedOrderStatusPage.tsx` | runtime | `70cd421a6ab79513744f531d921b3ece61044874` | exact-accepted-final-blob |
| `client/src/research/assisted-order/assisted-order.css` | runtime | `c93bf5a2c1e2b50c5b40c65f0149033ad84658a0` | exact-accepted-final-blob |
| `client/src/research/catalog-priority/catalog-priority.css` | runtime | `70cd421a6ab79513744f531d921b3ece61044874` | exact-accepted-final-blob |
| `client/src/clarity/premium-shell.test.tsx` | test | `1a409e2f7e1fcdeffc78d24428eeb626d7888e9c` | exact-accepted-final-blob |
| `client/src/research/assisted-order/assisted-order-premium.test.tsx` | test | `2a791beeb26b75266b9468aa4a32a4cd07fe871d` | exact-accepted-final-blob |
| `client/src/clarity/pages.tsx` | runtime | `94e89be7c959087edfde4ebddf2f50fa5e02cc36` | exact-accepted-final-blob |
| `client/src/clarity/partner-sign-in.test.tsx` | test | `806c58a83bb3c0f1f75b9e003de14aa525069950` | exact-accepted-final-blob |
| `client/src/research/adapters/cartProductSelection.test.ts` | test | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `client/src/research/adapters/cartProductSelection.ts` | runtime | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `client/src/research/adapters/memberCatalog.test.ts` | test | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/adapters/memberCatalog.ts` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/pages/adminx/ProductAdminDetail.tsx` | runtime | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `client/src/research/products-diagnostics/RequiredInputState.test.tsx` | test | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `client/src/research/products-diagnostics/RequiredInputState.tsx` | runtime | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `server/research/catalog/member-catalog-projection.test.ts` | test | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `server/research/catalog/member-catalog-projection.ts` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `server/research/catalog/member-catalog-service.test.ts` | test | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `server/research/catalog/member-catalog-service.ts` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `server/research/catalog/product-control-reader.test.ts` | test | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `server/research/catalog/product-control-reader.ts` | runtime | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `server/research/commerce/cart-product-selection.test.ts` | test | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `server/research/commerce/cart-product-selection.ts` | runtime | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `server/research/commerce/persistence/persistent-cart.test.ts` | test | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `server/research/commerce/persistence/persistent-cart.ts` | runtime | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `server/research/master-offerings/direct-commerce-selections.test.ts` | test | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `server/research/products-diagnostics/product-admin-production.test.ts` | test | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `server/research/products-diagnostics/product-admin-production.ts` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `shared/research/cart-product-selection.ts` | runtime | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `shared/research/product-admin.ts` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `supabase/candidates/20261003_research_media_commerce_decoupling.rollback.md` | SQL rollback companion | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `supabase/candidates/20261003_research_media_commerce_decoupling.sql` | SQL candidate | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `supabase/verification/research_media_commerce_decoupling_local.mjs` | local SQL verifier | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` | exact-accepted-final-blob |
| `client/src/research/assisted-order/AssistedOrderPage.test.tsx` | test | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/early-access/EarlyAccessProductCard.test.tsx` | test | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/early-access/EarlyAccessProductCard.tsx` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/early-access/cart/EarlyAccessCartCatalogue.tsx` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/master-offerings/MasterOfferingCard.tsx` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/master-offerings/MasterOfferingDetail.tsx` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/products-diagnostics/MemberCatalogExperience.test.tsx` | test | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/products-diagnostics/MemberCatalogExperience.tsx` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/products-diagnostics/MemberProductDetailExperience.test.tsx` | test | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/products-diagnostics/MemberProductDetailExperience.tsx` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/products-diagnostics/product-media-surfaces.test.tsx` | test | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/ui/ProductMedia.test.tsx` | test | `e6a8171b5b2d4ad78930c214997532e16601a48e` | exact-accepted-final-blob |
| `client/src/research/ui/ProductMedia.tsx` | runtime | `e6a8171b5b2d4ad78930c214997532e16601a48e` | exact-accepted-final-blob |
| `client/src/research/ui/product-media.css` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `server/research/catalog/product-media-schema.test.ts` | test | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `shared/research/member-catalog.ts` | runtime | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `shared/research/product-media.test.ts` | test | `e6a8171b5b2d4ad78930c214997532e16601a48e` | exact-accepted-final-blob |
| `shared/research/product-media.ts` | runtime | `e6a8171b5b2d4ad78930c214997532e16601a48e` | exact-accepted-final-blob |
| `supabase/candidates/20261005_research_product_media_descriptor.sql` | SQL candidate | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` | exact-accepted-final-blob |
| `client/src/research/adapters/commerce.ts` | runtime | `38d3e467961e12256bd6c5726210b455c3719076` | exact-accepted-final-blob |
| `client/src/research/adapters/product-subscription-create.test.ts` | test | `38d3e467961e12256bd6c5726210b455c3719076` | accepted-test-plus-PS-R5-400-case |
| `client/src/research/pages/member/ProductPage.subscription.test.tsx` | test | `38d3e467961e12256bd6c5726210b455c3719076` | exact-accepted-final-blob |
| `client/src/research/pages/member/ProductPage.tsx` | runtime | `38d3e467961e12256bd6c5726210b455c3719076` | exact-accepted-final-blob |
| `client/src/research/product-subscriptions/ProductSubscriptionCreate.test.tsx` | test | `7806fb5939a69189e085739fad8cc832cfab201a` | exact-accepted-final-blob |
| `client/src/research/product-subscriptions/ProductSubscriptionCreate.tsx` | runtime | `7806fb5939a69189e085739fad8cc832cfab201a` | exact-accepted-final-blob |
| `server/research/commerce/subscription-intent-journey.test.ts` | test | `38d3e467961e12256bd6c5726210b455c3719076` | exact-accepted-final-blob |

Registration commit `66fda5c` changed only .xenios/ACTIVE_TASKS.json, .xenios/SESSION_REGISTRY.json, .xenios/CODE_OWNERSHIP.json and the new session file. They contain only this integration task/session/lease additions. Producer corpus history was not imported. The source commit changes exactly the 65 paths above. Subsequent records commits are limited to this records directory and the integration's own continuity/handoff entries.
