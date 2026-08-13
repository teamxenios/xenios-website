import {
  MASTER_OFFERING_DISPLAY_LABELS,
  MASTER_OFFERING_FAMILIES,
  MASTER_OFFERING_FAMILY_LABELS,
  isMasterOfferingDisplayState,
  isMasterOfferingFamily,
  type MasterOfferingCatalogQuery,
  type MasterOfferingDisplayState,
  type MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import {
  MASTER_OFFERING_FILTER_STATES,
} from "./integration-packet";
import {
  downloadMasterOfferingPriceList,
  type MasterOfferingPriceListDownloadResult,
} from "./catalogApi";
import type { MasterOfferingPriceListFormat } from "@shared/research/master-offerings/pricing-contract";

const ALL = "all";

/**
 * Search, family, and availability. The vocabulary is the closed shared one, so
 * a control can only ever narrow the member-safe catalog. Nothing here can
 * select audience, breadth, launch scope, or commerce mode.
 */
export function MasterOfferingCatalogControls({
  query,
  onChange,
}: {
  query: MasterOfferingCatalogQuery;
  onChange: (next: MasterOfferingCatalogQuery) => void;
}) {
  const family = query.families?.[0] ?? ALL;
  const state = query.states?.[0] ?? ALL;

  return (
    <div className="card grid gap-4 md:grid-cols-3">
      <label className="grid gap-2" htmlFor="mo-catalog-search">
        <span className="form-label">Search the catalog</span>
        <input
          id="mo-catalog-search"
          className="input-field"
          type="search"
          maxLength={160}
          value={query.q ?? ""}
          placeholder="Product or strength"
          onChange={(event) => {
            const q = event.target.value;
            // A new search starts at page one. Keeping the old page would show
            // an empty page and read as "no results".
            const { page: _page, ...rest } = query;
            onChange(q.trim() ? { ...rest, q } : rest);
          }}
        />
      </label>

      <label className="grid gap-2" htmlFor="mo-catalog-family">
        <span className="form-label">Family</span>
        <select
          id="mo-catalog-family"
          className="input-field"
          value={family}
          onChange={(event) => {
            const value = event.target.value;
            const { page: _page, families: _families, ...rest } = query;
            onChange(
              isMasterOfferingFamily(value)
                ? { ...rest, families: [value as MasterOfferingFamily] }
                : rest,
            );
          }}
        >
          <option value={ALL}>All families</option>
          {MASTER_OFFERING_FAMILIES.map((value) => (
            <option key={value} value={value}>
              {MASTER_OFFERING_FAMILY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2" htmlFor="mo-catalog-state">
        <span className="form-label">Availability</span>
        <select
          id="mo-catalog-state"
          className="input-field"
          value={state}
          onChange={(event) => {
            const value = event.target.value;
            const { page: _page, states: _states, ...rest } = query;
            onChange(
              isMasterOfferingDisplayState(value)
                ? { ...rest, states: [value as MasterOfferingDisplayState] }
                : rest,
            );
          }}
        >
          <option value={ALL}>Any availability</option>
          {MASTER_OFFERING_FILTER_STATES.map((value) => (
            <option key={value} value={value}>
              {MASTER_OFFERING_DISPLAY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * The price-list download. The browser fetches the server-authored file with
 * the canonical member token; it never assembles catalog data client-side.
 */
export function MasterOfferingPriceListDownload({
  query,
  memberToken,
  download = downloadMasterOfferingPriceList,
}: {
  query: MasterOfferingCatalogQuery;
  memberToken: string | null;
  download?: (
    token: string | null,
    query: MasterOfferingCatalogQuery,
    format: MasterOfferingPriceListFormat,
  ) => Promise<MasterOfferingPriceListDownloadResult>;
}) {
  const [busy, setBusy] = useState<MasterOfferingPriceListFormat | null>(null);
  const [failure, setFailure] = useState(false);

  // The member route normally has a token. During session hydration or after
  // sign-out, hiding the export is safer and more honest than presenting a
  // control that cannot authenticate its request.
  if (!memberToken) return null;

  async function start(format: MasterOfferingPriceListFormat) {
    if (busy !== null) return;
    setBusy(format);
    setFailure(false);
    const result = await download(memberToken, query, format);
    setFailure(!result.ok);
    setBusy(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn btn-secondary min-h-[44px]"
        data-testid="mo-download-csv"
        disabled={busy !== null}
        onClick={() => void start("csv")}
      >
        {busy === "csv" ? "Preparing CSV" : "Download price list, CSV"}
      </button>
      <button
        type="button"
        className="btn btn-secondary min-h-[44px]"
        data-testid="mo-download-json"
        disabled={busy !== null}
        onClick={() => void start("json")}
      >
        {busy === "json" ? "Preparing JSON" : "Download price list, JSON"}
      </button>
      <p className="body-s text-ink-mute">
        The download matches the filters above and lists approved prices only.
      </p>
      {failure && (
        <p className="body-s text-ink-mute" role="alert" data-testid="mo-download-error">
          The price list could not be downloaded. Please try again.
        </p>
      )}
    </div>
  );
}
import { useState } from "react";
