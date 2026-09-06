import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountSubscription } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { AccountSubscriptionView } from "../account-portal/views/SubscriptionView";
import { useResearch } from "../core";

export default function AccountSubscription() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountSubscription, memberToken);
  return (
    <AccountPortalShell
      eyebrow="Historical records"
      title="Membership, separated from Care."
      lead="Review recorded plans, billing states, and receipts. Paid membership is not required for approved customer access; product subscriptions and Care remain separate."
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(data) => <AccountSubscriptionView data={data} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
