import { useState } from "react";
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
import type { MasterOfferingPriceListFormat } from "@shared/research/master-offerings/pricing-contract";
import {
  MASTER_OFFERING_PRICE_LIST_FAILURE_COPY,
  fetchMasterOfferingPriceList,
  saveMasterOfferingPriceList,
} from "./catalogApi";
import { MASTER_OFFERING_FILTER_STATES } from "./integration-packet";

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
    <div className="card grid min-w-0 gap-4 md:grid-cols-3">
      <label className="grid min-w-0 gap-2" htmlFor="mo-catalog-search">
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
            //
            // `q` is dropped too, and that is the whole point: without it,
            // emptying the box handed back the query it came from, so the old
            // search stayed in the URL and in the results and the member could
            // not clear it. The family and availability selects already drop
            // their own key this way.
            const { page: _page, q: _q, ...rest } = query;
            onChange(q.trim() ? { ...rest, q } : rest);
          }}
        />
      </label>

      <label className="grid min-w-0 gap-2" htmlFor="mo-catalog-family">
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

      <label className="grid min-w-0 gap-2" htmlFor="mo-catalog-state">
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
 * The price-list download.
 *
 * It fetches the export with the member's bearer token and hands the bytes to
 * the browser, because a link download cannot carry that header and the export
 * route has no cookie fallback. The file is still composed entirely by the
 * server: nothing here assembles catalog data, and a response that is not the
 * format that was asked for is refused rather than saved.
 */
export function MasterOfferingPriceListDownload({
  query,
  memberToken = null,
  fetchPriceList = fetchMasterOfferingPriceList,
  savePriceList = saveMasterOfferingPriceList,
}: {
  query: MasterOfferingCatalogQuery;
  memberToken?: string | null;
  fetchPriceList?: typeof fetchMasterOfferingPriceList;
  savePriceList?: typeof saveMasterOfferingPriceList;
}) {
  const [busy, setBusy] = useState<MasterOfferingPriceListFormat | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function download(format: MasterOfferingPriceListFormat) {
    if (busy !== null) return;
    setBusy(format);
    setMessage(null);
    const result = await fetchPriceList(memberToken, query, format);
    setBusy(null);
    if (!result.ok) {
      setMessage(MASTER_OFFERING_PRICE_LIST_FAILURE_COPY[result.failure]);
      return;
    }
    savePriceList(result.blob, result.filename);
    setMessage("Your price list download has started.");
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-secondary min-h-[44px]"
          data-testid="mo-download-csv"
          disabled={busy !== null}
          onClick={() => void download("csv")}
        >
          {busy === "csv" ? "Preparing CSV" : "Download price list, CSV"}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-[44px]"
          data-testid="mo-download-json"
          disabled={busy !== null}
          onClick={() => void download("json")}
        >
          {busy === "json" ? "Preparing JSON" : "Download price list, JSON"}
        </button>
        <p className="body-s text-ink-mute min-w-0 break-words">
          The download matches the filters above and lists approved prices only.
        </p>
      </div>
      <p
        className="body-s text-ink-mute min-w-0 break-words"
        role="status"
        aria-live="polite"
        data-testid="mo-download-status"
      >
        {message ?? ""}
      </p>
    </div>
  );
}
