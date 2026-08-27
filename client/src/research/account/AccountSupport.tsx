import { AccountPortalShell } from "../account-portal/AccountPortalShell";
import { createAccountSupportCase, loadAccountSupport } from "../account-portal/api";
import { AccountResourceBoundary, useAccountResource } from "../account-portal/resource";
import { AccountSupportView } from "../account-portal/views/SupportView";
import { useResearch } from "../core";

export default function AccountSupport() {
  const { memberToken } = useResearch();
  const snapshot = useAccountResource(loadAccountSupport, memberToken);
  return (
    <AccountPortalShell
      eyebrow="Account support"
      title="The right help, in the right lane."
      lead="Open and review account, order, Care-operation, or pharmacy-operation support without placing sensitive clinical detail in the portal."
    >
      <AccountResourceBoundary snapshot={snapshot}>
        {(cases) => <AccountSupportView cases={cases} onSubmit={(input) => createAccountSupportCase(memberToken, input)} />}
      </AccountResourceBoundary>
    </AccountPortalShell>
  );
}
