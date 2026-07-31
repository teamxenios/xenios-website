// Feature flags, access, and audit.
//
// Flags is read-only by construction: it prints the server-authoritative Care
// capability and offers no control that could change it. The named clinical
// gates have no server contract, so this surface prints no value for them and
// says why rather than guessing.
//
// Access renders the role and permission matrix from the shared constants that
// the server itself enforces, so it cannot drift from the real policy.

import CareAdminLayout from "./CareAdminLayout";
import {
  CARE_PERMISSIONS,
  CARE_ROLES,
  CARE_ROLE_PERMISSIONS,
  type CareCapabilityStatus,
} from "@shared/care/contracts";
import {
  CARE_CLINICAL_GATE_EXPLANATION,
  CARE_CLINICAL_GATE_NAMES,
  careAdminArea,
} from "./contracts";
import { useCareAdminRead, type CareAdminSelector } from "./useCareAdminRead";
import {
  CareAdminKnownGaps,
  CareAdminLoadStates,
  CareAdminNote,
  CareAdminPanel,
} from "./ui";

const CAPABILITY_PATH = "/api/care/status";
const ACCESS_PROBE_PATH = "/api/care/audit/access";

const selectCapability: CareAdminSelector<CareCapabilityStatus> = (body) => {
  const capability = body.capability as Partial<CareCapabilityStatus> | undefined;
  if (!capability || capability.rail !== "care") return null;
  if (
    typeof capability.state !== "string" ||
    typeof capability.enabled !== "boolean" ||
    typeof capability.publicMessage !== "string" ||
    typeof capability.checkedAt !== "string"
  ) {
    return null;
  }
  return capability as CareCapabilityStatus;
};

const selectProbe: CareAdminSelector<true> = () => true;

export function CareAdminFlags() {
  const area = careAdminArea("flags");
  const { state, reload } = useCareAdminRead<CareCapabilityStatus>(
    CAPABILITY_PATH,
    selectCapability,
  );

  return (
    <CareAdminLayout area={area} activeKey="flags">
      <CareAdminPanel
        title="Care capability, as the server reports it"
        id="care-admin-flags"
        busy={state.kind === "loading"}
      >
        <CareAdminLoadStates
          state={state}
          loadingLabel="Reading the Care capability…"
          onRetry={reload}
        />
        {state.kind === "ready" && (
          <div className="card mt-6" data-care-admin-state="ready">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <dt className="mono-label text-ink-mute">STATE</dt>
                <dd className="body-m mt-2">
                  {state.data.state.replaceAll("_", " ")}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-ink-mute">ENABLED</dt>
                <dd className="body-m mt-2">
                  {state.data.enabled ? "true" : "false"}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-ink-mute">PUBLIC MESSAGE</dt>
                <dd className="body-m mt-2">{state.data.publicMessage}</dd>
              </div>
              <div>
                <dt className="mono-label text-ink-mute">CHECKED AT</dt>
                <dd className="body-m mt-2 break-words">{state.data.checkedAt}</dd>
              </div>
            </dl>
            <p className="body-m text-ink-2 mt-6">
              This value is read-only here. It is set on the server from the
              stored capability row plus its release approval, and this console
              exposes no control that could change it.
            </p>
          </div>
        )}

        <CareAdminNote label="CLINICAL GATES">
          <p>{CARE_CLINICAL_GATE_EXPLANATION}</p>
          <ul className="mt-4 grid grid-cols-1 gap-2">
            {CARE_CLINICAL_GATE_NAMES.map((name) => (
              <li className="mono-label text-ink break-words" key={name}>
                {name} · no server contract
              </li>
            ))}
          </ul>
          <p className="mt-4">
            Because no value can be read, every clinical control in this console
            is rendered closed and carries no handler that could run it.
          </p>
        </CareAdminNote>

        <CareAdminKnownGaps area={area} />
      </CareAdminPanel>
    </CareAdminLayout>
  );
}

function RolePermissionMatrix() {
  return (
    <div className="card mt-6">
      <p className="mono-label text-ink-mute mb-4">
        ROLES AND PERMISSIONS, AS ENFORCED BY THE SERVER
      </p>
      <ul className="grid grid-cols-1 gap-4">
        {CARE_ROLES.map((role) => (
          <li key={role} className="min-w-0">
            <p className="mono-label text-ink break-words">{role}</p>
            <p className="body-m text-ink-2 mt-2 break-words">
              {CARE_ROLE_PERMISSIONS[role].join(", ")}
            </p>
          </li>
        ))}
      </ul>
      <p className="body-m text-ink-2 mt-6">
        {CARE_PERMISSIONS.length} permissions are defined. This view is
        read-only: no role assignment can be created, changed, or revoked here.
      </p>
    </div>
  );
}

export function CareAdminAccess() {
  const area = careAdminArea("access");
  const { state, reload } = useCareAdminRead<true>(ACCESS_PROBE_PATH, selectProbe);

  return (
    <CareAdminLayout area={area} activeKey="access">
      <CareAdminPanel
        title="Who can reach what"
        id="care-admin-access"
        busy={state.kind === "loading"}
      >
        <RolePermissionMatrix />
        <CareAdminNote label="BOUNDARY PROBE">
          <p>
            The probe below calls the one endpoint reserved for the security
            role. A Care administrator is expected to be refused by it, because
            care:security_audit is a separate role, and a refusal here is the
            boundary working.
          </p>
        </CareAdminNote>
        <CareAdminLoadStates
          state={state}
          loadingLabel="Calling the access boundary probe…"
          onRetry={reload}
        />
        {state.kind === "ready" && (
          <div className="card mt-6" data-care-admin-state="ready">
            <p className="body-m text-ink-2">
              The probe was allowed, so this account holds care:security_audit.
              The probe returns no record of any kind.
            </p>
          </div>
        )}
        <CareAdminKnownGaps area={area} />
      </CareAdminPanel>
    </CareAdminLayout>
  );
}

export function CareAdminAudit() {
  const area = careAdminArea("audit");
  const { state, reload } = useCareAdminRead<true>(ACCESS_PROBE_PATH, selectProbe);

  return (
    <CareAdminLayout area={area} activeKey="audit">
      <CareAdminPanel
        title="Access boundary"
        id="care-admin-audit"
        busy={state.kind === "loading"}
      >
        <CareAdminNote label="WHAT THIS IS">
          <p>
            Every Care permission check writes an access decision on the server.
            No endpoint reads that trail back, so no audit entries are listed
            here and none are invented. What this surface can do is exercise the
            boundary live.
          </p>
        </CareAdminNote>
        <CareAdminLoadStates
          state={state}
          loadingLabel="Calling the access boundary probe…"
          onRetry={reload}
        />
        {state.kind === "ready" && (
          <div className="card mt-6" data-care-admin-state="ready">
            <p className="body-m text-ink-2">
              The probe was allowed for this account. It returns no patient,
              actor, or decision detail.
            </p>
          </div>
        )}
        <CareAdminKnownGaps area={area} />
      </CareAdminPanel>
    </CareAdminLayout>
  );
}
