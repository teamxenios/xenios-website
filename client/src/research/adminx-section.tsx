import { lazy, Suspense } from "react";
import { Route, Switch, Link } from "wouter";
import { ResearchLoadingState } from "./ui/kit";

// The Samuel admin operations family, mounted by App.tsx at /admin/research*.
// Presentation only: the browser never grants authority; every panel's data
// comes from admin-authorized APIs (pages/adminx/auth.ts mirrors the existing
// /admin Supabase-session pattern) and a 401/403 renders an honest denied
// state. Code-split per page.

const AdminResearchHome = lazy(() => import("./pages/adminx/AdminResearchHome"));
const Applications = lazy(() => import("./pages/adminx/Applications"));
const ApplicationDetail = lazy(() => import("./pages/adminx/ApplicationDetail"));
const Members = lazy(() => import("./pages/adminx/Members"));
const MemberDetail = lazy(() => import("./pages/adminx/MemberDetail"));
const Plans = lazy(() => import("./pages/adminx/Plans"));
const PlanDetail = lazy(() => import("./pages/adminx/PlanDetail"));
const ProductsAdmin = lazy(() => import("./pages/adminx/ProductsAdmin"));
const ProductAdminDetail = lazy(() => import("./pages/adminx/ProductAdminDetail"));
const Inventory = lazy(() => import("./pages/adminx/Inventory"));
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
const Audit = lazy(() => import("./pages/adminx/Audit"));

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

export default function AdminResearchSection() {
  return (
    <Switch>
      <Route path="/admin/research">{() => <S><AdminResearchHome /></S>}</Route>
      <Route path="/admin/research/applications">{() => <S><Applications /></S>}</Route>
      <Route path="/admin/research/applications/:id">{() => <S><ApplicationDetail /></S>}</Route>
      <Route path="/admin/research/members">{() => <S><Members /></S>}</Route>
      <Route path="/admin/research/members/:id">{() => <S><MemberDetail /></S>}</Route>
      <Route path="/admin/research/plans">{() => <S><Plans /></S>}</Route>
      <Route path="/admin/research/plans/:id">{() => <S><PlanDetail /></S>}</Route>
      <Route path="/admin/research/products">{() => <S><ProductsAdmin /></S>}</Route>
      <Route path="/admin/research/products/:id">{() => <S><ProductAdminDetail /></S>}</Route>
      <Route path="/admin/research/inventory">{() => <S><Inventory /></S>}</Route>
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
      <Route path="/admin/research/audit">{() => <S><Audit /></S>}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}
