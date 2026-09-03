import { PUBLIC_QUALITY_ROUTES } from "../quality/routes";
import { ACCOUNT_PORTAL_EXTENSION_ROUTES } from "../account-portal/routes";

// The canonical route manifest for the Supreme frontend (single source of
// truth; a parity test asserts every manifest route is registered in the
// section router). Legacy aliases stay registered in section.tsx but are not
// part of the manifest.

export const ACCESS_ROUTES = {
  gateway: "/research",
  accessHub: "/research/access-hub",
  supplierAccess: "/research/supplier-access",
  organizations: "/research/organizations",
  affiliates: "/research/affiliates",
  apply: "/research/apply",
  applicationStatus: "/research/application-status",
  signIn: "/research/sign-in",
  resetPassword: "/research/reset-password",
  support: "/research/support",
  about: "/research/about",
  howItWorks: "/research/how-it-works",
  faq: "/research/faq",
  policies: "/research/policies",
  contact: "/research/contact",
  privacy: "/research/privacy",
  terms: "/research/terms",
  activate: "/research/activate",
  // The distinct screens for server-issued member-access denial codes
  // (billing, inactive membership, recovery-purpose session). The code rides
  // in ?code=; activation_required routes to `activate` instead.
  accessState: "/research/access-state",
  earlyAccess: "/research/early-access",
} as const;

// The personal customer account portal: six routes, MOUNTED (section.tsx)
// and present in ALL_MANIFEST_ROUTES, each behind RequireMember with every
// read on the customer-account API's own Bearer boundary — never the legacy
// shared review password. Organization reads are not required: the portal
// degrades without Pack 02, whose identity/organization family (the parked
// ACCOUNT_ROUTES below) remains unmounted until the account schema lands
// through the governed migration chain.
export const ACCOUNT_PORTAL_ROUTES = {
  home: "/research/account",
  orders: "/research/account/orders",
  subscription: "/research/account/subscription",
  care: "/research/account/care",
  documents: "/research/account/documents",
  support: "/research/account/support",
  // Lane 04 extension: one bounded detail family plus three static pages.
  // Ten entries total; ALL_MANIFEST_ROUTES consumes Object.values() once.
  ...ACCOUNT_PORTAL_EXTENSION_ROUTES,
} as const;

// Parked account-identity and organization routes remain named for their
// existing components, while the personal customer portal above is mounted
// independently and degrades without organization reads.
export const ACCOUNT_ROUTES = {
  signIn: "/research/account/sign-in",
  home: ACCOUNT_PORTAL_ROUTES.home,
  claimHistory: "/research/account/claim-history",
  initialPassword: "/research/account/security/initial-password",
  organizationInvitation: "/research/account/organization-invitations/accept",
  organization: "/research/account/organizations/:organizationId",
} as const;

export const MEMBER_ROUTES = {
  home: "/research/member",
  profile: "/research/member/profile",
  assessment: "/research/member/assessment",
  blueprint: "/research/member/blueprint",
  xenios30: "/research/member/xenios-30",
  xenios90: "/research/member/xenios-90",
  documents: "/research/member/documents",
  tracker: "/research/member/tracker",
  goals: "/research/member/goals",
  goal: "/research/member/goals/:slug",
  products: "/research/member/products",
  product: "/research/member/products/:slug",
  // The full member-safe catalog (master offerings v2). Separate from
  // `products`, which is the v1 member catalog and stays exactly as it is.
  fullCatalog: "/research/member/catalog",
  // One v2 offering. The family segment is not decoration: the v2 detail API
  // is /products/:family/:slug, so a link without it cannot restore the
  // product it points at.
  fullCatalogProduct: "/research/member/catalog/:family/:slug",
  // The Kris Launch A partner catalog. Browse, login and price: it sells
  // nothing, and its browser contract has no add-to-cart member at all.
  krisCatalog: "/research/member/kris-catalog",
  // One Launch A item. The family segment is not decoration: the detail API
  // is by family and slug, so a link without it cannot restore the item it
  // points at.
  krisCatalogProduct: "/research/member/kris-catalog/:family/:slug",
  supplements: "/research/member/supplements",
  metabolicCare: "/research/member/metabolic-care",
  diagnostics: "/research/member/diagnostics",
  storage: "/research/member/storage",
  education: "/research/member/education",
  supportCenter: "/research/member/support",
  productRequests: "/research/member/product-requests",
  newProductRequest: "/research/member/product-requests/new",
  guides: "/research/member/guides",
  guide: "/research/member/guides/:slug",
  cart: "/research/member/cart",
  checkout: "/research/member/checkout",
  orders: "/research/member/orders",
  order: "/research/member/orders/:id",
  subscriptions: "/research/member/subscriptions",
  questions: "/research/member/questions",
  referrals: "/research/member/referrals",
  security: "/research/member/security",
  privacy: "/research/member/privacy",
  membership: "/research/member/membership",
  documentCenter: "/research/member/documents-center",
} as const;

export const PARTNER_ROUTES = {
  home: "/research/partners",
  apply: "/research/partners/apply",
  onboarding: "/research/partners/onboarding",
  training: "/research/partners/training",
  dashboard: "/research/partners/dashboard",
  links: "/research/partners/links",
  campaigns: "/research/partners/campaigns",
  events: "/research/partners/events",
  leads: "/research/partners/leads",
  conversions: "/research/partners/conversions",
  commissions: "/research/partners/commissions",
  payouts: "/research/partners/payouts",
  organizations: "/research/partners/organizations",
  compliance: "/research/partners/compliance",
  resources: "/research/partners/resources",
  support: "/research/partners/support",
  security: "/research/partners/security",
} as const;

export const ADMIN_ROUTES = {
  home: "/admin/research",
  careRequests: "/admin/research/care-requests",
  applications: "/admin/research/applications",
  application: "/admin/research/applications/:id",
  members: "/admin/research/members",
  member: "/admin/research/members/:id",
  plans: "/admin/research/plans",
  plan: "/admin/research/plans/:id",
  blueprintReview: "/admin/research/blueprint-review",
  products: "/admin/research/products",
  product: "/admin/research/products/:id",
  productConfiguration: "/admin/research/product-configuration",
  productRequests: "/admin/research/product-requests",
  productRequest: "/admin/research/product-requests/:id",
  inventory: "/admin/research/inventory",
  orders: "/admin/research/orders",
  order: "/admin/research/orders/:id",
  fulfillment: "/admin/research/fulfillment",
  questions: "/admin/research/questions",
  question: "/admin/research/questions/:id",
  guides: "/admin/research/guides",
  guide: "/admin/research/guides/:id",
  partners: "/admin/research/partners",
  partner: "/admin/research/partners/:id",
  security: "/admin/research/security",
  privacy: "/admin/research/privacy",
  capabilities: "/admin/research/capabilities",
  requiredInputs: "/admin/research/required-inputs",
  commerceQueues: "/admin/research/commerce-queues",
  assistedOrders: "/admin/research/assisted-orders",
  activationQueue: "/admin/research/activation-queue",
  activationBridge: "/admin/research/activation-bridge",
  activationChecklist: "/admin/research/activation-checklist",
  activationReconciliation: "/admin/research/activation-reconciliation",
  activationReadiness: "/admin/research/activation-readiness",
  esignDocuments: "/admin/research/esign",
  earlyAccessReleases: "/admin/research/early-access/releases",
  earlyAccessFulfillment: "/admin/research/early-access/fulfillment",
  audit: "/admin/research/audit",
} as const;

export const ALL_MANIFEST_ROUTES: string[] = [
  ...Object.values(ACCESS_ROUTES),
  ...Object.values(PUBLIC_QUALITY_ROUTES),
  ...Object.values(ACCOUNT_PORTAL_ROUTES),
  ...Object.values(MEMBER_ROUTES),
  ...Object.values(PARTNER_ROUTES),
  ...Object.values(ADMIN_ROUTES),
];
