# 04 — Information architecture

Assumes the recommended defaults of D-01 (brand "Xenios") and D-02 (health front door at root; coach workspace at `/workspace`). If Samuel chooses otherwise, only the brand token and the root assignment change; the structure holds.

## Design principles

1. **One site, one header, one footer.** Every public page (health, Care, Research, practices, partners, suppliers, careers, workspace) uses the same chrome. The Care pill sub-nav and the Research MinimalChrome become in-page section navigation, not separate headers.
2. **Audience first, architecture never.** Visitors choose who they are and what they want; they never need to understand "Early Access", "member", "assisted", "organization" or "access hub" to start.
3. **One verb, one meaning.** The controlled CTA vocabulary (`05_COPY_DECK.md` §1) is the only set of button labels.
4. **Every action has a return path.** Every submission produces a reference and names where status lives (`10_NOTIFICATION_MATRIX.csv`).
5. **Authority stays where it is.** The redesign re-fronts existing Care, Research, partner, account and admin authorities; it does not create new ones (commerce stays dark, admin guard unchanged, clinical intake stays in the secure system).

## Option comparison

### Option A — Health front door with audience header (RECOMMENDED)

Root is the health front door. Header: **For Individuals · For Practices · Partners · How It Works · Quality · About · Careers · Sign In**, primary button **Start Care**. Hero offers **Start Care** and **Explore Products**; an audience selector immediately follows.

- Pros: matches the brief exactly; the most common intents (Care, products) are one click; practices get a first-class header item; Sign In is always visible.
- Cons: eight header items is dense — needs a disciplined collapse below 1200px (see Responsive rules).

### Option B — Two-door splash

Root shows two large doors: "For me" and "For my practice or business", each leading to its own sub-home; header minimal (Sign In, Menu).

- Pros: extremely simple first screen; clean separation of consumer vs B2B.
- Cons: adds a click before any product or Care content; hides prices and Care process from the first screen, the opposite of the System Labs lesson; returning partners/suppliers/candidates get lost behind "business"; weak for SEO.

### Option C — Status quo plus links (REJECTED)

Keep the coach workspace at root and improve links to `/health`. Rejected: preserves CUX-01/02/03, the cause of Stephen's and Seth's confusion.

**Recommendation: Option A.** Option B's strength (a clear individual/professional split) is absorbed into Option A's audience selector.

## Header (all public pages)

| Width | Visible without opening a menu | In the Menu |
| --- | --- | --- |
| ≥1280px | Logo · For Individuals · For Practices · Partners · How It Works · Quality · About · Careers · **Sign In** (text) · **Start Care** (primary button) | — |
| 1024–1279px | Logo · For Individuals · For Practices · Partners · How It Works · **Sign In** · **Start Care** · Menu | Quality · About · Careers · Support |
| <1024px (tablet, phone) | Logo · **Sign In** · **Start Care** · Menu | All eight items + Explore Products + Check Status + Support |

- Sign In is a text link at every width with a ≥44px target; Start Care is the only filled button in the header.
- "For Individuals" opens a small panel: Start Care · Explore Products · How Research orders work · Check Status.
- "For Practices" opens: How referrals work · Practice workspace · Care for your clients · Submit Inquiry.
- No sticky bottom bar on mobile (removes the Care-only sticky CTA of UX doc P1-07); the header itself is sticky and carries Sign In + Start Care.

## Audience selector (homepage section 2; reused on `/sign-in` for returning users)

Six tiles, each with: who it's for · whether an account is needed · what happens after you click · one CTA.

| Tile | For | Account needed? | CTA → |
| --- | --- | --- | --- |
| I want Care | Adults in the U.S. seeking clinician-guided treatment | No — start with a request | **Start Care** → `/care/schedule` |
| I want research products | Researchers, labs, professionals ordering for research use | No — order with your email; sign in to see history | **Explore Products** → `/products` |
| I run a practice | Clinics, providers, coaches, trainers, gyms, med spas, behavioral-health practices, retreats, corporate wellness | Not to learn; approved practices sign in | **For Practices** → `/practices` |
| I want to refer people | Affiliates, creators, individual referrers | After approval | **Become a Partner** → `/partners` |
| I supply or fulfil | Pharmacies, labs, manufacturers, distributors, fulfilment | By invitation | **Submit Inquiry** → `/suppliers` |
| I already have an account | Customers, practices, partners | Yes | **Sign In** → `/sign-in` |

Careers is in the header and footer, not the selector.

## Homepage content order

1. Hero — H1 (D-03), subhead, **Start Care** + **Explore Products**; a single line under the buttons: "Already a customer? **Sign In** · Have an order? **Check Status**".
2. Audience selector (above).
3. Products and pathways — three pathway tiles (Care · Research products · For Practices), then up to 6 product cards from the approved public set (D-04) with price or price state (D-05), then **Explore Products**.
4. How Care works — 3 steps (request → human review → secure clinical visit), boundary line, **Start Care**.
5. How research orders work — 4 steps (request order → we confirm and send payment details → we verify payment by hand → we ship and email tracking), research-use line, **Explore Products**.
6. For Practices — 3 models in one row (Refer clients · Practice workspace · Care for your clients) + "Your client stays your client" (D-09), **For Practices**.
7. Partners — one paragraph, **Become a Partner**.
8. Quality and documentation — process-only (D-12), link to lot lookup, **Quality**.
9. FAQ — 6 questions (Care vs Research, cost to start, what happens after I submit, can my practice order for me, where do I sign in, do you give dosing instructions), link to full FAQ.
10. Final CTA band — **Start Care** · **Explore Products** · **For Practices**.
11. Footer.

## Footer

| Individuals | Practices & partners | Company | Support | Legal |
| --- | --- | --- | --- | --- |
| Start Care · Explore Products · How It Works · Check Status · FAQ | For Practices · Become a Partner · Suppliers · Workspace for coaches | About · Careers · Quality · Press · Investors | Support · Contact · Sign In | Privacy · Terms · Research Use Policy · Disclosures · Accessibility |

Bottom line: "© 2026 Xenios Technologies, Inc." (single string from the brand module). Emergency line on Care-adjacent pages only: "If this is an emergency, call 911."

## Journeys (summary; full versions in `06_PERSONA_JOURNEYS.md`)

- **Individual — Care:** `/` → Start Care → `/care/schedule` → confirmation (ref `CARE-…`) → email → human follow-up → secure clinical system.
- **Individual — Research product:** `/` → Explore Products → `/products` → `/products/:slug` → **Request Order** → assisted request → confirmation (ref `XRR-…`) → payment instructions → verification → shipped → Check Status / Sign In.
- **Practice:** `/` → For Practices → `/practices` → (read models) → **Submit Inquiry** (practice) → confirmation + reference → founder queue → call/questionnaire → approval → activation email → `/activate` → partner/practice workspace.
- **Partner:** `/` → Partners → `/partners` → **Apply** (when open) or **Submit Inquiry** → … → activation → workspace.
- **Supplier:** footer/selector → `/suppliers` → **Submit Inquiry** → confirmation → qualification → invitation.
- **Candidate:** header Careers → `/careers/:slug` → **Apply** → confirmation.
- **Returning:** header **Sign In** → `/sign-in` → account (orders, documents, Care status), partner workspace, or founder command center (server-routed).
- **Founder/admin:** `/admin` (unlinked) or Sign In → server-verified → `/admin/research/command-center`.

## Route map (current → target)

Principle: keep every authority route; add public marketing routes; redirect superseded public entry points with 301s.

| Target route | Purpose | Implementation note (current source) |
| --- | --- | --- |
| `/` | Health front door | Replace `pages/Home.tsx` content; move current content to `/workspace` |
| `/individuals` | For Individuals | New page |
| `/products` | Public product index | New page; data from the existing storefront projection / publication authority (`server/research/storefront/*`) — only products with an approved publication record (D-04); signed-out price = D-05 |
| `/products/:slug` | Reusable product page | Reuse `research/storefront/StorefrontProductPage.tsx` structure; server-decided action only |
| `/care`, `/care/schedule`, `/care/portal`, `/care/how-it-works`, `/care/provider-review`, `/care/support` | Care | Keep routes and authority; move into shared chrome; copy per D-06 |
| `/research` | How research orders work | Replace Gateway at `/research` with an explainer; `/health` → 301 `/` |
| `/research/order`, `/research/early-access/*`, `/research/early-access/order-request/*` | Research ordering and status | Keep authority; relabel per copy deck; remove "Early Access" from customer-facing labels (route names may stay) |
| `/practices` | For Practices | New page (replaces `/research/organizations` as public entry) |
| `/practices/referrals` | Model A | New |
| `/practices/workspace` | Model B | New (explains; sign-in for approved practices) |
| `/practices/care` | Model C | New |
| `/partners` | Affiliates + strategic partnerships | New page; **remove** current `/partners → /ecosystem` redirect |
| `/partners/apply` | Partner application | Canonical alias of `/research/partners/apply` **only when the application is open**; otherwise the page shows the closed state + Submit Inquiry (see PAGE_SPECIFICATIONS P-11) |
| `/suppliers` | Suppliers | New public page (replaces `/research/supplier-access` entry) |
| `/careers`, `/careers/:slug` | Careers | Keep; shared chrome; Apply per H-01 |
| `/sign-in` | Sign in + returning-user chooser | Alias rendering the existing `/research/sign-in` authority with a chooser panel |
| `/activate` | Approved-account activation | Alias of `/research/activate` + claim flow |
| `/status` | Check Status | New lookup page routing to existing status authorities |
| `/support` | Support | New consolidated page (Care support form link; general contact form) |
| `/quality` | Quality & documentation | Consolidates `/research/quality`, `/testing`, `/documents`; keep `/research/lots/:lotCode` |
| `/how-it-works` | Both pathways | Replace coach page (moved to `/workspace/how-it-works`) |
| `/faq` | FAQ | New page (currently redirects to `/product`); consolidates `/research/faq` |
| `/about` | Company | Rewrite; coach "about" content moves to `/workspace` |
| `/contact` | General contact form | Keep (also embedded in `/support`) |
| `/workspace`, `/workspace/*` | Coach AI workspace (future Infinity) | Current Home, Product, How It Works, For Coaches, For Clients, Storefront, Network, Ecosystem, For Practitioners, `/for/:slug`, Manifesto, Waitlist move under this section or keep URLs but leave primary nav |
| `/admin`, `/admin/research/*` | Founder/admin | Unchanged, unlinked |

Redirects (301): `/health → /`; `/research/access-hub → /`; `/research/partners → /partners` (landing only; `/research/partners/*` workspace sub-routes unchanged); `/research/affiliates → /partners`; `/research/organizations → /practices`; `/research/supplier-access → /suppliers`; `/research/faq → /faq`; `/research/quality → /quality`; `/research/testing → /quality#testing`; `/research/documents → /quality#documents`; `/research/about → /about`; `/research/how-it-works → /how-it-works`; `/research/contact → /support`; `/research/support → /support`; `/faq` (remove redirect to `/product`); `/partners` (remove redirect to `/ecosystem`); `/enterprise → /practices`. Keep `noindex` on authenticated and token pages; public marketing pages become indexable once D-01 is decided.

## Responsive rules (all pages)

- Breakpoints to test: **390, 768, 1024, 1440**.
- No horizontal overflow at any width; tap targets ≥44px; body text ≥16px on mobile.
- Header behaviour as tabled above. Section order identical at every width; cards stack to one column <768, two columns 768–1279, three or more ≥1280.
- Every CTA reachable by keyboard; visible focus; skip-to-content link retained.
