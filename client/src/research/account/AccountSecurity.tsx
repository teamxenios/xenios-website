import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { loadAccountOverview } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { ACCOUNT_PORTAL_EXTENSION_ROUTES } from "../account-portal/routes";
import { AccountSecurityView } from "../account-portal/views/SecurityView";
import { useResearch } from "../core";

export default function AccountSecurity() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountOverview, memberToken);
  return (
    <AccountPortalShell
      eyebrow="Account security"
      title="Security and recovery."
      lead="Use the existing recovery path, with unavailable controls described honestly."
      currentPath={ACCOUNT_PORTAL_EXTENSION_ROUTES.security}
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(data) => <AccountSecurityView data={data} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
