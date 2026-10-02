# Core UI inconsistencies observed at c0e25c73

Status: observed Core truth, not an imagery-lane decision.

This list preserves the 28 Core-internal inconsistencies reported by Claude in
`ae5c410ab6e5c27df94c5bdc5b6533ab821b6d4c`. The UI-convergence prototype uses
the dominant public Clarity shell as its baseline and does not silently resolve
any item below. Repeated themes are retained because Claude recorded them from
different review lenses and surfaces.

Core runtime: `c0e25c73a0d789829ea213e2ee040c68e06f0a75`

Core tree: `1771d18bad91b89e95414bebb8b574dc32729687`

## Chrome lens

1. **Assisted-order catalog width and gutters.** The assisted-order page uses
   its own near-full-width container and 16/10px gutters rather than the public
   `container-x` alignment. Core must decide whether that is a sanctioned wide
   layout or should converge.
2. **Double navigation on public Research pages.** The global Navbar and
   `PublicEditorialNav` appear together, repeat destinations, and differ in
   casing. The prototype records both patterns but uses the dominant public
   header for its main decision surfaces.
3. **Multiple wordmarks and shells.** Core renders `Xenios`, lowercase `xenios
   research`, `XENIOS / RESEARCH + CARE`, `xenios care + research`, and some
   `Xenios Health` copy. `BRAND.publicName` remains `Xenios`.
4. **Footer brand name disappears on mobile.** The global rule that hides
   `.clarity-brand-name` below 520px also affects the footer, leaving only the
   mark.
5. **Three section-navigation patterns.** Care tabs, Research editorial links,
   and Account Portal navigation use different components and control styles.

## Type and token lens

6. **Four H1 treatments.** Public pages, Care/sign-in, Early Access, and the
   assisted-order flow use materially different sizes, weights, tracking, and
   colors.
7. **Assisted-order token island.** `assisted-order.css` introduces green-black
   ink, green accent, pill buttons, larger radii, separate focus rings, and its
   own spacing system.
8. **Card primitive radius.** Generic `.card` is 4px, `.clarity-card` is 18px,
   and assisted-order panels/cards use 18px and 22px.
9. **State badge styles.** Core uses three badge systems with different type,
   casing, dots, tints, and spacing.
10. **Purple-to-teal accent is not an active Clarity rule.** Current routed
    Clarity UI uses flat `--pulse`. Purple-to-teal gradient primitives remain in
    legacy or unrouted CSS, so the proposed restrained accent still needs a
    founder/Core decision.
11. **Undefined `body-xs`.** Research cards reference `body-xs`, but Core does
    not define that class. The rendered result inherits a size instead of using
    an explicit type token.

## Catalog-card lens

12. **Featured and All-products cards have different anatomies.** Early Access,
    assisted-order, and member catalog surfaces each use a different card
    hierarchy and action model.
13. **Assisted-order and global token sets conflict.** Adjacent product journeys
    switch between green pill controls and the black rectangular Clarity
    controls.
14. **Raw family codes reach the customer UI.** Assisted-order cards and filters
    can expose snake_case family identifiers while Featured uses friendly
    labels.
15. **Status and action vocabulary varies.** Examples include `Order request`,
    `Request Order`, `Request pricing`, `Care pathway`, `Temporarily
    Unavailable`, and held-state labels that are not rendered as actions.
16. **Catalog width conflicts with site chrome.** The assisted-order content
    starts near the viewport edge while the header and footer use the centered
    public container.
17. **Public imagery policy is text-only.** `EarlyAccessProductCard` explicitly
    removes product media because a wrong image is worse than none, while the
    imagery lane is evaluating a future public image slot.

## Surface lens

18. **The product catalog is a token island.** This restates the ambiguity from
    the whole-surface perspective: there is no single Core answer for catalog
    color, radius, button, eyebrow, or width.
19. **There is no canonical card/detail pair.** Public assisted-order,
    Early Access, member master-offering, member diagnostic, and unrouted
    discovery components do not share one anatomy.
20. **Corner radius varies by surface.** Public information cards, research
    cards, and assisted-order panels carry three visible radius systems.
21. **Hero scale varies across the customer journey.** Moving from Products to
    Research to order request changes heading tier without one documented rule.
22. **Research chrome and brand naming diverge.** The second Research nav and
    footer use labels and destinations that do not match the global shell.
23. **Filter and chip vocabulary diverge.** Action filter labels do not map
    one-to-one to the labels shown on product cards.

## Copy, navigation, and truth lens

24. **Four public-facing brand names are in use.** `Xenios`, `Xenios Care`,
    `Xenios Health`, and `Xenios Research` appear in current source.
25. **One Research state has multiple names and casing.** `Direct Order`,
    `Order request`, and `Add to order request` are used for related behavior.
26. **Research navigation duplicates routes with different casing.** Examples
    include `How It Works` versus `How it works` and `Sign In` versus `Sign in`.
27. **`Explore Products` points to two destinations.** Global surfaces route to
    `/products`, while a pathway tile routes to `/research/early-access`.
28. **Price wording varies by catalog.** Assisted-order uses `Price on request`
    and Care-team language, while member catalog-display uses unconfirmed-price
    language.

## Completeness-critic addenda

Claude's later completeness critic added five further Core observations. They
do not change the original 28-count ledger:

- Three form-control systems and four focus-ring treatments.
- Declared Inter Tight weights do not exactly match the static files loaded.
- Public status and assisted-order status use different timelines.
- Legacy gradient and atmosphere tokens remain in Core but are not routed.
- Public no-photography policy conflicts with optional gated 4:3 media slots.

## Prototype handling rule

The private corrected preview uses the dominant public Clarity values for the
shared shell: white and soft-gray surfaces, Inter Tight and JetBrains Mono,
Core container breakpoints, 68px sticky header, rectangular 4px controls, and
4px product cards. Where a comparison depends on an inconsistent Core surface,
the preview labels that fact and shows the proposed delta separately. No item in
this document is approved for Core implementation.
