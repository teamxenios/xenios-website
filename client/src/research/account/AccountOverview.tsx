import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountOverview } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { AccountOverviewView } from "../account-portal/views/OverviewView";
import { useResearch } from "../core";

export default function AccountOverview() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountOverview, memberToken);
  return (
    <AccountPortalShell
      title="Your account, clearly organized."
      lead="Membership, Research orders, Care operations, documents, and support—each with its own source of truth."
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(data) => <AccountOverviewView data={data} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
