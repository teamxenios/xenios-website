import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountCare } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { AccountCareView } from "../account-portal/views/CareView";
import { useResearch } from "../core";

export default function AccountCare() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountCare, memberToken);
  return (
    <AccountPortalShell
      eyebrow="Care operations"
      title="Care, step by step."
      lead="A neutral operational timeline for intake, provider review, and pharmacy fulfillment—without clinical detail or implied outcomes."
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(data) => <AccountCareView data={data} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
