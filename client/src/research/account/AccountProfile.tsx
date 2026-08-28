import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountOverview } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { ACCOUNT_PORTAL_EXTENSION_ROUTES } from "../account-portal/routes";
import { AccountProfileView } from "../account-portal/views/ProfileView";
import { useResearch } from "../core";

export default function AccountProfile() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountOverview, memberToken);
  return (
    <AccountPortalShell
      eyebrow="Account identity"
      title="Your profile."
      lead="The identity attached to this private account, shown as a read-only record."
      currentPath={ACCOUNT_PORTAL_EXTENSION_ROUTES.profile}
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(data) => <AccountProfileView data={data} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
