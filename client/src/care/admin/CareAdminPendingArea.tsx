// An area with no server contract.
//
// The point of this page is that it is NOT a stub. It shows no table, no
// placeholder row, and no sample record. It names the endpoint that does not
// exist so the gap is visible and actionable, and it renders inside the same
// role guard as every other surface.

import CareAdminLayout from "./CareAdminLayout";
import { careAdminArea, type CareAdminAreaKey } from "./contracts";
import { CareAdminPanel, CareAdminPendingContract } from "./ui";

export default function CareAdminPendingArea({
  areaKey,
}: {
  areaKey: CareAdminAreaKey;
}) {
  const area = careAdminArea(areaKey);
  return (
    <CareAdminLayout area={area} activeKey={areaKey}>
      <CareAdminPanel title={`${area.label} is not built yet`} id={`care-admin-${areaKey}`}>
        <CareAdminPendingContract area={area} />
      </CareAdminPanel>
    </CareAdminLayout>
  );
}
