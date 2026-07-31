// The Care admin console router.
//
// App.tsx mounts /care and /care/* on the Care section, so this router is
// reached through client/src/care/section.tsx rather than through a new
// top-level route. Every path here renders inside CareAdminLayout, which wraps
// its content in the server-decided role guard.

import { Route, Switch } from "wouter";
import {
  CareAdminAccess,
  CareAdminAudit,
  CareAdminFlags,
} from "./CareAdminGovernance";
import CareAdminOverview from "./CareAdminOverview";
import CareAdminPendingArea from "./CareAdminPendingArea";
import {
  CareAdminCredentials,
  CareAdminLicensure,
  CareAdminPharmacy,
  CareAdminProviders,
  CareAdminScheduling,
  CareAdminServiceAreas,
} from "./CareAdminReadiness";
import { CareAdminAuthorizationProvider } from "./authorization";
import {
  CARE_ADMIN_BASE_PATH,
  careAdminArea,
  pendingCareAdminAreas,
} from "./contracts";

const PENDING_AREAS = pendingCareAdminAreas();

export default function CareAdminRoutes() {
  return (
    <CareAdminAuthorizationProvider>
      <Switch>
        <Route path={careAdminArea("scheduling").path}>
          <CareAdminScheduling />
        </Route>
        <Route path={careAdminArea("providers").path}>
          <CareAdminProviders />
        </Route>
        <Route path={careAdminArea("credentials").path}>
          <CareAdminCredentials />
        </Route>
        <Route path={careAdminArea("licensure").path}>
          <CareAdminLicensure />
        </Route>
        <Route path={careAdminArea("service-areas").path}>
          <CareAdminServiceAreas />
        </Route>
        <Route path={careAdminArea("pharmacy").path}>
          <CareAdminPharmacy />
        </Route>
        <Route path={careAdminArea("flags").path}>
          <CareAdminFlags />
        </Route>
        <Route path={careAdminArea("access").path}>
          <CareAdminAccess />
        </Route>
        <Route path={careAdminArea("audit").path}>
          <CareAdminAudit />
        </Route>
        {PENDING_AREAS.map((area) => (
          <Route path={area.path} key={area.key}>
            <CareAdminPendingArea areaKey={area.key} />
          </Route>
        ))}
        <Route path={CARE_ADMIN_BASE_PATH}>
          <CareAdminOverview />
        </Route>
        <Route>
          <CareAdminOverview />
        </Route>
      </Switch>
    </CareAdminAuthorizationProvider>
  );
}
