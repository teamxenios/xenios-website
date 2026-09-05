import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountOverviewPage } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { AccountOverviewView } from "../account-portal/views/OverviewView";
import { useResearch } from "../core";

export default function AccountOverview() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountOverviewPage, memberToken);
  return (
    <AccountPortalShell
      title="Your account, clearly organized."
      lead="Account access, commerce and billing history, Care operations, documents, and support—each with its own source of truth."
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(page) => (
          <AccountOverviewView data={page.overview} catalogPriority={page.catalogPriority} />
        )}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
