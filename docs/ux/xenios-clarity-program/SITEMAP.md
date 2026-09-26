# Sitemap (target)

Legend: **[new]** new public page · **[keep]** existing route/authority kept (restyled into shared chrome) · **[alias]** new URL rendering existing authority · **[auth]** requires sign-in / token · **[dark]** exists but closed until its flag/decision opens it.

```
/                                   [new]   Home — health front door
├── /individuals                    [new]   For Individuals
├── /products                       [new]   Product index (approved publication set only)
│   └── /products/:slug             [new]   Reusable product page
├── /care                           [keep]  Care overview
│   ├── /care/schedule              [keep]  Start Care (request form)
│   ├── /care/how-it-works          [keep]
│   ├── /care/provider-review       [keep]
│   ├── /care/portal                [keep]  "Where is my Care account?"
│   └── /care/support               [keep]  Care support form
├── /research                       [new]   How research orders work (replaces gateway)
│   ├── /research/order             [keep]  Order options (simplified)
│   ├── /research/early-access/…    [keep]  Order / cart (labels change; route names may stay)
│   └── /research/early-access/order-request[/:ref]  [keep] Request Order + status
├── /practices                      [new]   For Practices
│   ├── /practices/referrals        [new]   Model A — referral
│   ├── /practices/workspace        [new]   Model B — practice workspace
│   └── /practices/care             [new]   Model C — Care for your clients
├── /partners                       [new]   Partner program + strategic partnerships
│   └── /partners/apply             [alias][dark] Partner application (open only when enabled)
├── /suppliers                      [new]   Suppliers, labs, pharmacies, fulfilment
├── /careers                        [keep]
│   └── /careers/:slug              [keep]
├── /how-it-works                   [new]   Care vs Research, step by step
├── /quality                        [new]   Quality & documentation (consolidated)
│   └── /research/lots/:lotCode     [keep]  Lot lookup
├── /faq                            [new]
├── /about                          [new]   Company (rewritten)
├── /support                        [new]   Support hub
│   └── /contact                    [keep]  General contact form
├── /status                         [new]   Check Status (lookup)
├── /sign-in                        [alias] Sign In (+ returning-user chooser)
│   ├── /research/reset-password    [keep]
│   └── /activate                   [alias][auth-token] Approved-account activation
├── /research/account/*             [keep][auth] Customer account (orders, documents, Care status, profile, support)
├── /research/partners/*            [keep][auth][dark] Partner workspace (dashboard, links, commissions, payouts…)
├── /workspace                      [new location] Coach AI workspace home (current `/`)
│   └── /workspace/how-it-works, /product, /for-coaches, /for-clients, /storefront, /network,
│       /ecosystem, /for-practitioners, /for/:slug, /manifesto, /waitlist   [keep URLs; out of primary nav]
├── /privacy /terms /disclosures /research/policies  [keep]  Legal
├── /press /investors /security /compliance           [keep]  Company (footer)
└── /admin → /admin/research/command-center           [keep][auth, server-guarded, unlinked]
```

Page count: 20 new public pages or aliases; 20 kept customer-facing routes restyled; 16 redirects; 0 authority routes removed.
