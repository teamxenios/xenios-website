import { Link, useParams } from "wouter";
import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountOrders } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { decodeAccountOrderReference } from "../account-portal/routes";
import { AccountOrderDetailView } from "../account-portal/views/OrderDetailView";
import { ACCOUNT_PORTAL_ROUTES } from "../lib/routes";
import { useResearch } from "../core";

export default function AccountOrderDetail() {
  const { memberToken, memberChecking } = useResearch();
  const params = useParams<{ reference: string }>();
  const reference = decodeAccountOrderReference(params.reference ?? "");

  return (
    <AccountPortalShell
      eyebrow="Commerce history"
      title="Commerce record details."
      lead="Payment, fulfillment, and available line detail from the exact record attached to this signed-in account."
      currentPath={ACCOUNT_PORTAL_ROUTES.orders}
      actions={<Link className="btn btn-ghost" href={ACCOUNT_PORTAL_ROUTES.orders}>All commerce history</Link>}
    >
      {memberChecking || !memberToken ? <AccountResourceBoundary snapshot={memberChecking
        ? { state: "loading" } : { state: "denied", reason: "auth_required" }}>{() => null}</AccountResourceBoundary>
        : <OwnedOrderDetail key={memberToken} token={memberToken} reference={reference} />}
    </AccountPortalShell>
  );
}

function OwnedOrderDetail({ token, reference }: { token: string; reference: string }) {
  const snapshot = useAccountResource(loadAccountOrders, token);
  return <AccountResourceBoundary snapshot={snapshot}>
    {(data) => <AccountOrderDetailView data={data} reference={reference} />}
  </AccountResourceBoundary>;
}
