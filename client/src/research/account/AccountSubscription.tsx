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
      eyebrow="Membership + billing"
      title="Membership, separated from Care."
      lead="Review plan and renewal status without confusing administrative membership with provider or pharmacy operations."
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(data) => <AccountSubscriptionView data={data} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
