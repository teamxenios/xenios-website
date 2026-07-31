// The readiness-driven Care admin surfaces.
//
// Providers, credentials, licensure, service areas, scheduling, and pharmacy
// configuration all sit behind the same two real endpoints:
//   GET /api/care/appointments/admin/readiness   (care:administer)
//   GET /api/care/pharmacy/admin/readiness       (care:administer)
//
// Those endpoints return readiness booleans and required-input labels. They do
// NOT return a roster, a credential, a licence, a patient, or a formulary
// entry, and this file never manufactures one. Each surface shows the labels
// the server actually returned, plus the exact gaps that remain.

import { useCallback, useMemo, useState } from "react";
import type { CareAppointmentRequiredInputLabel } from "@shared/care/appointments";
import type { CarePrescriptionRequiredInputLabel } from "@shared/care/prescriptions";
import CareAdminLayout from "./CareAdminLayout";
import { careAdminArea, type CareAdminAreaKey } from "./contracts";
import { useCareAdminRead, type CareAdminSelector } from "./useCareAdminRead";
import {
  CareAdminBlockedActions,
  CareAdminKnownGaps,
  CareAdminLoadStates,
  CareAdminPanel,
} from "./ui";

type RequiredInputLabel =
  | CareAppointmentRequiredInputLabel
  | CarePrescriptionRequiredInputLabel;

interface Readiness {
  softwareReady: boolean;
  operationalReady: boolean;
  publicReady: boolean;
  requiredInputs: readonly RequiredInputLabel[];
}

const APPOINTMENT_READINESS_PATH = "/api/care/appointments/admin/readiness";
const PHARMACY_READINESS_PATH = "/api/care/pharmacy/admin/readiness";

const selectReadiness: CareAdminSelector<Readiness> = (body) => {
  const readiness = body.readiness as Partial<Readiness> | undefined;
  if (!readiness || typeof readiness !== "object") return null;
  if (
    typeof readiness.softwareReady !== "boolean" ||
    typeof readiness.operationalReady !== "boolean" ||
    typeof readiness.publicReady !== "boolean" ||
    !Array.isArray(readiness.requiredInputs)
  ) {
    return null;
  }
  return {
    softwareReady: readiness.softwareReady,
    operationalReady: readiness.operationalReady,
    publicReady: readiness.publicReady,
    requiredInputs: readiness.requiredInputs.filter(
      (label): label is RequiredInputLabel => typeof label === "string",
    ),
  };
};

/** Labels a focused surface cares about. Undefined means show them all. */
const LABEL_FILTERS: Partial<Record<CareAdminAreaKey, readonly string[]>> = {
  providers: ["LICENSED CLINICIAN RECORD REQUIRED", "CLINICIAN COVERAGE REQUIRED"],
  credentials: ["CLINICIAN CREDENTIAL VERIFICATION REQUIRED"],
  licensure: ["CLINICIAN LICENSE REQUIRED"],
  "service-areas": [
    "SUPPORTED STATE REQUIRED",
    "CLINICIAN COVERAGE REQUIRED",
    "PHARMACY SUPPORTED STATES REQUIRED",
  ],
};

function ReadinessSummary({ readiness }: { readiness: Readiness }) {
  return (
    <div className="card mt-6" data-care-admin-state="ready">
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div>
          <dt className="mono-label text-ink-mute">SOFTWARE</dt>
          <dd className="body-m mt-2">
            {readiness.softwareReady ? "Complete" : "Needs review"}
          </dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">REAL INPUTS</dt>
          <dd className="body-m mt-2">
            {readiness.operationalReady ? "Verified" : "Required"}
          </dd>
        </div>
        <div>
          <dt className="mono-label text-ink-mute">PUBLIC ACCESS</dt>
          <dd className="body-m mt-2">
            {readiness.publicReady ? "Recorded, not activated here" : "Not approved"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function RequiredInputs({
  labels,
  emptyLabel,
}: {
  labels: readonly RequiredInputLabel[];
  emptyLabel: string;
}) {
  if (labels.length === 0) {
    return (
      <div className="card mt-4" data-care-admin-state="empty">
        <p className="body-m text-ink-2">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <ul className="mt-4 grid grid-cols-1 gap-3">
      {labels.map((label) => (
        <li className="card min-w-0" key={label}>
          <p className="mono-label text-ink break-words">{label}</p>
        </li>
      ))}
    </ul>
  );
}

function ReadinessSurface({
  areaKey,
  path,
  emptyLabel,
}: {
  areaKey: CareAdminAreaKey;
  path: string;
  emptyLabel: string;
}) {
  const area = careAdminArea(areaKey);
  const { state, reload } = useCareAdminRead<Readiness>(path, selectReadiness);
  const filter = LABEL_FILTERS[areaKey];
  const labels =
    state.kind === "ready"
      ? filter
        ? state.data.requiredInputs.filter((label) => filter.includes(label))
        : state.data.requiredInputs
      : [];

  return (
    <CareAdminLayout area={area} activeKey={areaKey}>
      <CareAdminPanel
        title="Server-recorded readiness"
        id={`care-admin-${areaKey}-readiness`}
        busy={state.kind === "loading"}
      >
        <CareAdminLoadStates
          state={state}
          loadingLabel="Reading the recorded readiness evidence…"
          onRetry={reload}
        />
        {state.kind === "ready" && (
          <>
            <ReadinessSummary readiness={state.data} />
            <RequiredInputs labels={labels} emptyLabel={emptyLabel} />
          </>
        )}
        <CareAdminBlockedActions area={area} />
        <CareAdminKnownGaps area={area} />
      </CareAdminPanel>
    </CareAdminLayout>
  );
}

export function CareAdminScheduling() {
  return (
    <ReadinessSurface
      areaKey="scheduling"
      path={APPOINTMENT_READINESS_PATH}
      emptyLabel="The server returned no outstanding scheduling inputs. That is not an activation, and this console still has no appointment queue to work."
    />
  );
}

export function CareAdminProviders() {
  return (
    <ReadinessSurface
      areaKey="providers"
      path={APPOINTMENT_READINESS_PATH}
      emptyLabel="The server reported no outstanding clinician-record input. No roster is available to display, so no provider is listed."
    />
  );
}

export function CareAdminCredentials() {
  return (
    <ReadinessSurface
      areaKey="credentials"
      path={APPOINTMENT_READINESS_PATH}
      emptyLabel="The server reported no outstanding credential-verification input. Individual credential records cannot be read, so none are listed."
    />
  );
}

export function CareAdminLicensure() {
  return (
    <ReadinessSurface
      areaKey="licensure"
      path={APPOINTMENT_READINESS_PATH}
      emptyLabel="The server reported no outstanding licence input for this query. Individual licence records cannot be read, so none are listed."
    />
  );
}

export function CareAdminPharmacy() {
  return (
    <ReadinessSurface
      areaKey="pharmacy"
      path={PHARMACY_READINESS_PATH}
      emptyLabel="The server returned no outstanding pharmacy inputs. That is not an activation, and no pharmacy record is readable here."
    />
  );
}

/**
 * Service areas is the one readiness surface with a query control: the two
 * endpoints accept a state code. Asking about a state is a read. It is not a
 * claim that Care is offered there, and the copy says so.
 */
export function CareAdminServiceAreas() {
  const areaKey: CareAdminAreaKey = "service-areas";
  const area = careAdminArea(areaKey);
  const [draft, setDraft] = useState("");
  const [stateCode, setStateCode] = useState("");

  const appointmentPath = useMemo(
    () =>
      stateCode
        ? `${APPOINTMENT_READINESS_PATH}?stateCode=${encodeURIComponent(stateCode)}`
        : APPOINTMENT_READINESS_PATH,
    [stateCode],
  );
  const pharmacyPath = useMemo(
    () =>
      stateCode
        ? `${PHARMACY_READINESS_PATH}?stateCode=${encodeURIComponent(stateCode)}`
        : PHARMACY_READINESS_PATH,
    [stateCode],
  );

  const appointments = useCareAdminRead<Readiness>(
    appointmentPath,
    selectReadiness,
  );
  const pharmacy = useCareAdminRead<Readiness>(pharmacyPath, selectReadiness);

  const apply = useCallback(() => {
    const normalized = draft.trim().toUpperCase();
    setStateCode(/^[A-Z]{2}$/.test(normalized) ? normalized : "");
  }, [draft]);

  const filter = LABEL_FILTERS[areaKey] ?? [];
  const labels = [
    ...(appointments.state.kind === "ready"
      ? appointments.state.data.requiredInputs
      : []),
    ...(pharmacy.state.kind === "ready" ? pharmacy.state.data.requiredInputs : []),
  ].filter((label, index, all) => filter.includes(label) && all.indexOf(label) === index);

  return (
    <CareAdminLayout area={area} activeKey={areaKey}>
      <CareAdminPanel
        title="Readiness for one state"
        id="care-admin-service-areas"
        busy={
          appointments.state.kind === "loading" || pharmacy.state.kind === "loading"
        }
      >
        <div className="card mt-6">
          <label className="mono-label text-ink-mute" htmlFor="care-admin-state-code">
            STATE CODE
          </label>
          <input
            id="care-admin-state-code"
            className="body-m mt-3 block w-full max-w-[12ch]"
            value={draft}
            maxLength={2}
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
            aria-describedby="care-admin-state-help"
          />
          <p className="body-m text-ink-2 mt-4" id="care-admin-state-help">
            This asks the server what evidence is on file for one state. It is a
            read. It does not add a state, and it does not mean Care is offered
            there.
          </p>
          <button type="button" className="btn btn-secondary mt-6" onClick={apply}>
            Check this state
          </button>
        </div>

        <CareAdminLoadStates
          state={appointments.state}
          loadingLabel="Reading clinician and scheduling evidence…"
          onRetry={appointments.reload}
        />
        <CareAdminLoadStates
          state={pharmacy.state}
          loadingLabel="Reading pharmacy coverage evidence…"
          onRetry={pharmacy.reload}
        />
        {appointments.state.kind === "ready" && pharmacy.state.kind === "ready" && (
          <RequiredInputs
            labels={labels}
            emptyLabel="The server reported no outstanding coverage input for this query. No supported-state list is readable, so none is shown."
          />
        )}
        <CareAdminKnownGaps area={area} />
      </CareAdminPanel>
    </CareAdminLayout>
  );
}
