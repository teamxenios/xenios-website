# Supplement Media Source Register

| Brand | Workbook rows | Approved discovery hosts | Default rights state | Adapter priority |
|---|---:|---|---|---|
| Momentous | 76 | `livemomentous.com` | `OFFICIAL_SOURCE_RIGHTS_PENDING` | Shopify product JSON, Product JSON-LD, official-page metadata |
| Pure Encapsulations | 413 | `pureencapsulationspro.com` | `OFFICIAL_SOURCE_RIGHTS_PENDING` | Product JSON-LD, official-page metadata, authorized supplier feed when provided |
| Life Extension | 384 | `lifeextension.com` | `OFFICIAL_SOURCE_RIGHTS_PENDING` | Product JSON-LD, official-page metadata, authorized supplier feed when provided |
| NutriDyn | 20 | `nutridyn.com` | `OFFICIAL_SOURCE_RIGHTS_PENDING` | Product JSON-LD, official-page metadata, authorized reseller/media feed when provided |

The allowlist excludes marketplaces, competitor storefronts, affiliate reviews, blogs, social reposts, and search-engine caches. Redirects are followed only when the destination remains on an approved host for the same brand.

Supplier API, media-kit, authorized reseller-portal, and manual-upload adapters implement the same `OfficialSourceAdapter` contract. Authentication, rate limits, robots directives, and terms of access must be honored; the factory never bypasses access controls.
