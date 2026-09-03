import { lazy, Suspense } from "react";
import { Redirect, Route, Switch, Link } from "wouter";
import { AdminScreen } from "./pages/adminx/AdminResearchHome";
import { ResearchLoadingState } from "./ui/kit";

// The Samuel admin operations family, mounted by App.tsx at /admin/research*.
// Presentation only: the browser never grants authority; every panel's data
// comes from admin-authorized APIs (pages/adminx/auth.ts mirrors the existing
// /admin Supabase-session pattern) and a 401/403 renders an honest denied
// state. Code-split per page.

const AdminResearchHome = lazy(() => import("./pages/adminx/AdminResearchHome"));
const CareAccessRequests = lazy(() => import("./pages/adminx/CareAccessRequests"));
const AssistedOrderQueue = lazy(() =>
  import("./assisted-order/AdminAssistedOrderQueue").then((m) => ({
    default: m.AdminAssistedOrderQueue,
  })),
);
const AssistedOrderDetail = lazy(() =>
  import("./assisted-order/AdminAssistedOrderDetail").then((m) => ({
    default: m.AdminAssistedOrderDetailPage,
  })),
);
const Applications = lazy(() => import("./pages/adminx/Applications"));
const ApplicationDetail = lazy(() => import("./pages/adminx/ApplicationDetail"));
const Members = lazy(() => import("./pages/adminx/Members"));
const MemberDetail = lazy(() => import("./pages/adminx/MemberDetail"));
const Plans = lazy(() => import("./pages/adminx/Plans"));
const PlanDetail = lazy(() => import("./pages/adminx/PlanDetail"));
const BlueprintReview = lazy(() => import("./pages/adminx/BlueprintReview"));
const ProductsAdmin = lazy(() => import("./pages/adminx/ProductsAdmin"));
const Website3Configuration = lazy(() => import("./pages/adminx/Website3Configuration"));
const ProductRequestsAdmin = lazy(() => import("./pages/adminx/ProductRequestsAdmin"));
const ProductRequestAdminDetail = lazy(() => import("./pages/adminx/ProductRequestAdminDetail"));
const ProductAdminDetail = lazy(() => import("./pages/adminx/ProductAdminDetail"));
const InventoryLotsBody = lazy(async () => {
  const module = await import("./pages/adminx/InventoryLotsAdmin");
  return { default: module.InventoryLotsBody };
});
const LotCoasBody = lazy(async () => {
  const module = await import("./pages/adminx/LotCoasAdmin");
  return { default: module.LotCoasBody };
});
const OrdersAdmin = lazy(() => import("./pages/adminx/OrdersAdmin"));
const OrderAdminDetail = lazy(() => import("./pages/adminx/OrderAdminDetail"));
const Fulfillment = lazy(() => import("./pages/adminx/Fulfillment"));
const CommerceQueues = lazy(() => import("./pages/adminx/CommerceQueues"));
const QuestionsAdmin = lazy(() => import("./pages/adminx/QuestionsAdmin"));
const QuestionAdminDetail = lazy(() => import("./pages/adminx/QuestionAdminDetail"));
const GuidesAdmin = lazy(() => import("./pages/adminx/GuidesAdmin"));
const GuideAdminDetail = lazy(() => import("./pages/adminx/GuideAdminDetail"));
const PartnersAdmin = lazy(() => import("./pages/adminx/PartnersAdmin"));
const PartnerAdminDetail = lazy(() => import("./pages/adminx/PartnerAdminDetail"));
const SecurityAdmin = lazy(() => import("./pages/adminx/SecurityAdmin"));
const PrivacyAdmin = lazy(() => import("./pages/adminx/PrivacyAdmin"));
const Capabilities = lazy(() => import("./pages/adminx/Capabilities"));
const RequiredInputs = lazy(() => import("./pages/adminx/RequiredInputs"));
const Audit = lazy(() => import("./pages/adminx/Audit"));
const ActivationQueue = lazy(() => import("./pages/adminx/ActivationQueue"));
const ActivationBridge = lazy(() => import("./pages/adminx/ActivationBridge"));
const ActivationChecklist = lazy(() => import("./pages/adminx/ActivationChecklist"));
const ActivationReconciliation = lazy(() => import("./pages/adminx/ActivationReconciliation"));
const ActivationReadiness = lazy(() => import("./pages/adminx/ActivationReadiness"));
const EsignDocuments = lazy(() => import("./pages/adminx/EsignDocuments"));
const EarlyAccessReleases = lazy(() => import("./pages/adminx/EarlyAccessReleases"));
const EarlyAccessPaymentReview = lazy(() => import("./pages/adminx/EarlyAccessPaymentReview"));
const EarlyAccessFulfillment = lazy(() => import("./pages/adminx/EarlyAccessFulfillment"));

function NotFound() {
  return (
    <section className="container-x" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <p className="mono-cap text-ink-mute mb-5">Not found</p>
      <h1 className="display-s">That page is not part of research operations.</h1>
      <Link href="/admin/research" className="btn btn-secondary mt-8">Back to overview</Link>
    </section>
  );
}

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<ResearchLoadingState />}>{children}</Suspense>;
}

function InventoryFamilyNav({ current }: { current: "lots" | "coas" }) {
  return (
    <nav aria-label="Inventory administration" className="ra-subnav mb-6">
      <Link
        href="/admin/research/inventory/lots"
        className={`ra-subnav-link ${current === "lots" ? "ra-subnav-active" : ""}`}
        aria-current={current === "lots" ? "page" : undefined}
      >
        Inventory &amp; lots
      </Link>
      <Link
        href="/admin/research/inventory/coas"
        className={`ra-subnav-link ${current === "coas" ? "ra-subnav-active" : ""}`}
        aria-current={current === "coas" ? "page" : undefined}
      >
        Exact-lot COAs
      </Link>
    </nav>
  );
}

function InventoryLotsIntegrated() {
  return (
    <AdminScreen
      title="Inventory & lots"
      lead="Exact receiving, lot status, and append-only quantity movements. Counts change only through recorded commands."
    >
      {(token) => (
        <>
          <InventoryFamilyNav current="lots" />
          <InventoryLotsBody token={token} />
        </>
      )}
    </AdminScreen>
  );
}

function LotCoasIntegrated() {
  return (
    <AdminScreen
      title="Exact-lot COAs"
      lead="Private upload references, explicit missing-test states, independent review, and controlled publication."
    >
      {(token) => (
        <>
          <InventoryFamilyNav current="coas" />
          <LotCoasBody token={token} />
        </>
      )}
    </AdminScreen>
  );
}

export default function AdminResearchSection() {
  return (
    <Switch>
      <Route path="/admin/research">{() => <S><AdminResearchHome /></S>}</Route>
      <Route path="/admin/research/care-requests">{() => <S><CareAccessRequests /></S>}</Route>
      <Route path="/admin/research/applications">{() => <S><Applications /></S>}</Route>
      <Route path="/admin/research/applications/:id">{() => <S><ApplicationDetail /></S>}</Route>
      <Route path="/admin/research/members">{() => <S><Members /></S>}</Route>
      <Route path="/admin/research/members/:id">{() => <S><MemberDetail /></S>}</Route>
      <Route path="/admin/research/plans">{() => <S><Plans /></S>}</Route>
      <Route path="/admin/research/plans/:id">{() => <S><PlanDetail /></S>}</Route>
      <Route path="/admin/research/blueprint-review">{() => <S><BlueprintReview /></S>}</Route>
      <Route path="/admin/research/products">{() => <S><ProductsAdmin /></S>}</Route>
      <Route path="/admin/research/products/:id">{() => <S><ProductAdminDetail /></S>}</Route>
      <Route path="/admin/research/product-configuration">{() => <S><Website3Configuration /></S>}</Route>
      <Route path="/admin/research/product-requests">{() => <S><ProductRequestsAdmin /></S>}</Route>
      <Route path="/admin/research/product-requests/:id">{() => <S><ProductRequestAdminDetail /></S>}</Route>
      <Route path="/admin/research/inventory/lots">{() => <S><InventoryLotsIntegrated /></S>}</Route>
      <Route path="/admin/research/inventory/coas">{() => <S><LotCoasIntegrated /></S>}</Route>
      <Route path="/admin/research/inventory">
        <Redirect to="/admin/research/inventory/lots" />
      </Route>
      <Route path="/admin/research/assisted-orders">{() => <S><AssistedOrderQueue /></S>}</Route>
      <Route path="/admin/research/assisted-orders/:requestId">{() => <S><AssistedOrderDetail /></S>}</Route>
      <Route path="/admin/research/orders">{() => <S><OrdersAdmin /></S>}</Route>
      <Route path="/admin/research/orders/:id">{() => <S><OrderAdminDetail /></S>}</Route>
      <Route path="/admin/research/fulfillment">{() => <S><Fulfillment /></S>}</Route>
      <Route path="/admin/research/commerce-queues">{() => <S><CommerceQueues /></S>}</Route>
      <Route path="/admin/research/questions">{() => <S><QuestionsAdmin /></S>}</Route>
      <Route path="/admin/research/questions/:id">{() => <S><QuestionAdminDetail /></S>}</Route>
      <Route path="/admin/research/guides">{() => <S><GuidesAdmin /></S>}</Route>
      <Route path="/admin/research/guides/:id">{() => <S><GuideAdminDetail /></S>}</Route>
      <Route path="/admin/research/partners">{() => <S><PartnersAdmin /></S>}</Route>
      <Route path="/admin/research/partners/:id">{() => <S><PartnerAdminDetail /></S>}</Route>
      <Route path="/admin/research/security">{() => <S><SecurityAdmin /></S>}</Route>
      <Route path="/admin/research/privacy">{() => <S><PrivacyAdmin /></S>}</Route>
      <Route path="/admin/research/capabilities">{() => <S><Capabilities /></S>}</Route>
      <Route path="/admin/research/required-inputs">{() => <S><RequiredInputs /></S>}</Route>
      <Route path="/admin/research/activation-queue">{() => <S><ActivationQueue /></S>}</Route>
      <Route path="/admin/research/activation-bridge">{() => <S><ActivationBridge /></S>}</Route>
      <Route path="/admin/research/activation-checklist">{() => <S><ActivationChecklist /></S>}</Route>
      <Route path="/admin/research/activation-reconciliation">{() => <S><ActivationReconciliation /></S>}</Route>
      <Route path="/admin/research/activation-readiness">{() => <S><ActivationReadiness /></S>}</Route>
      <Route path="/admin/research/esign">{() => <S><EsignDocuments /></S>}</Route>
      <Route path="/admin/research/early-access/releases">{() => <S><EarlyAccessReleases /></S>}</Route>
      <Route path="/admin/research/early-access/payments">{() => <S><EarlyAccessPaymentReview /></S>}</Route>
      <Route path="/admin/research/early-access/fulfillment">{() => <S><EarlyAccessFulfillment /></S>}</Route>
      <Route path="/admin/research/audit">{() => <S><Audit /></S>}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}
