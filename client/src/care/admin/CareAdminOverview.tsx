// The console index. It answers one question honestly: what can a Care
// administrator actually do in this build, and what is still missing.

import { Link } from "wouter";
import CareAdminLayout from "./CareAdminLayout";
import type { CareCapabilityStatus } from "@shared/care/contracts";
import {
  careAdminArea,
  pendingCareAdminAreas,
  wiredCareAdminAreas,
  type CareAdminArea,
} from "./contracts";
import { useCareAdminRead, type CareAdminSelector } from "./useCareAdminRead";
import { CareAdminLoadStates, CareAdminNote, CareAdminPanel } from "./ui";

const CAPABILITY_PATH = "/api/care/status";

const selectCapability: CareAdminSelector<CareCapabilityStatus> = (body) => {
  const capability = body.capability as Partial<CareCapabilityStatus> | undefined;
  if (!capability || capability.rail !== "care") return null;
  if (
    typeof capability.state !== "string" ||
    typeof capability.enabled !== "boolean" ||
    typeof capability.publicMessage !== "string"
  ) {
    return null;
  }
  return capability as CareCapabilityStatus;
};

function AreaList({
  areas,
  label,
}: {
  areas: readonly CareAdminArea[];
  label: string;
}) {
  return (
    <div className="card mt-6">
      <p className="mono-label text-ink-mute mb-4">{label}</p>
      <ul className="grid grid-cols-1 gap-4">
        {areas.map((area) => (
          <li key={area.key} className="min-w-0">
            <Link href={area.path} className="body-m">
              {area.label}
            </Link>
            <p className="body-m text-ink-2 mt-2">{area.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CareAdminOverview() {
  const area = careAdminArea("overview");
  const { state, reload } = useCareAdminRead<CareCapabilityStatus>(
    CAPABILITY_PATH,
    selectCapability,
  );
  const wired = wiredCareAdminAreas().filter((entry) => entry.key !== "overview");
  const pending = pendingCareAdminAreas();

  return (
    <CareAdminLayout area={area} activeKey="overview">
      <CareAdminPanel
        title="Current Care capability"
        id="care-admin-overview-capability"
        busy={state.kind === "loading"}
      >
        <CareAdminLoadStates
          state={state}
          loadingLabel="Reading the Care capability…"
          onRetry={reload}
        />
        {state.kind === "ready" && (
          <div className="card mt-6" data-care-admin-state="ready">
            <p className="mono-label text-ink-mute">
              {state.data.state.replaceAll("_", " ")}
            </p>
            <p className="body-m text-ink-2 mt-3">{state.data.publicMessage}</p>
            <p className="body-m text-ink-2 mt-3">
              {state.data.enabled
                ? "Care is enabled on the server. Clinical controls in this console stay closed regardless."
                : "Care is not enabled, so every Care administrator read is refused by the server."}
            </p>
          </div>
        )}
      </CareAdminPanel>

      <CareAdminPanel title="What this console can read" id="care-admin-overview-wired">
        <AreaList areas={wired} label="WIRED TO A REAL ENDPOINT" />
        <CareAdminNote label="WHAT THAT MEANS">
          <p>
            These surfaces call a real Care contract and show only what it
            returned. Where the server returns readiness labels rather than
            records, that is what appears: no roster, credential, licence,
            patient, or formulary entry is created to fill a gap.
          </p>
        </CareAdminNote>
      </CareAdminPanel>

      <CareAdminPanel title="What is missing" id="care-admin-overview-pending">
        <AreaList areas={pending} label="NO SERVER CONTRACT YET" />
        <CareAdminNote label="WHAT THAT MEANS">
          <p>
            Each of these opens to a page naming the exact endpoint that does not
            exist. Nothing is stubbed and nothing is faked, so an operator can
            tell the difference between "empty" and "not built".
          </p>
        </CareAdminNote>
      </CareAdminPanel>
    </CareAdminLayout>
  );
}
