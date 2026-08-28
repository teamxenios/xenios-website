import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountOrders } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { AccountOrdersView } from "../account-portal/views/OrdersView";
import { useResearch } from "../core";

export default function AccountOrders() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountOrders, memberToken);
  return (
    <AccountPortalShell
      eyebrow="Commerce + fulfillment"
      title="Commerce history, without ambiguity."
      lead="Research records and Care/pharmacy fulfillment remain visibly separate, with only available payment and fulfillment evidence shown."
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(data) => <AccountOrdersView data={data} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
