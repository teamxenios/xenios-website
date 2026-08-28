import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountOverview } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { ACCOUNT_PORTAL_EXTENSION_ROUTES } from "../account-portal/routes";
import { AccountInterestsView } from "../account-portal/views/InterestsView";
import { useResearch } from "../core";

export default function AccountInterests() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountOverview, memberToken);
  return (
    <AccountPortalShell
      eyebrow="Saved interests"
      title="Product interests."
      lead="Recorded interests and their current account-visible availability, without implied ordering or approval."
      currentPath={ACCOUNT_PORTAL_EXTENSION_ROUTES.interests}
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(data) => <AccountInterestsView interests={data.productInterests} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
