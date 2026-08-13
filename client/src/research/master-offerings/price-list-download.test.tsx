// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MasterOfferingPriceListDownload } from "./MasterOfferingCatalogControls";
import {
  fetchMasterOfferingPriceList,
  saveMasterOfferingPriceList,
} from "./catalogApi";

/**
 * The price list is a download, and a download needs the member token.
 *
 * The regression this guards: the control used to be a plain `<a href
 * download>`. A link download is a browser navigation, and a navigation
 * cannot carry an `Authorization: Bearer` header, so the export route saw no
 * viewer at all and the browser wrote the refusal body to disk as the price
 * list. The member got a file that was an error, and the page looked fine.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function response(
  body: string,
  init: { status?: number; type?: string; disposition?: string } = {},
) {
  const headers = new Headers();
  headers.set("content-type", init.type ?? "text/csv; charset=utf-8");
  if (init.disposition) headers.set("content-disposition", init.disposition);
  return {
    status: init.status ?? 200,
    ok: (init.status ?? 200) < 400,
    headers,
    blob: async () => new Blob([body], { type: headers.get("content-type") ?? "" }),
  } as unknown as Response;
}

function click(host: HTMLElement, testId: string) {
  const control = host.querySelector(`[data-testid="${testId}"]`);
  act(() => control?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function status(host: HTMLElement): string {
  return (
    host.querySelector('[data-testid="mo-download-status"]')?.textContent ?? ""
  );
}

const QUERY = { q: "bpc", families: ["research_vials"] as const };

describe("price list adapter", () => {
  it("sends the bearer token and the filters, and keeps the server filename", async () => {
    const fetchImpl = vi.fn(async () =>
      response("name,price\r\n", {
        disposition:
          'attachment; filename="xenios-research-price-list-2026-08-13.csv"',
      }),
    );
    const result = await fetchMasterOfferingPriceList(
      "member-token",
      QUERY,
      "csv",
      fetchImpl as never,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "/api/research/catalog-display/v2/price-list?q=bpc&families=research_vials&format=csv",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer member-token",
    );
    expect(init.cache).toBe("no-store");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filename).toBe("xenios-research-price-list-2026-08-13.csv");
    }
  });

  it("never asks without a token, because the route is bearer only", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchMasterOfferingPriceList(
      null,
      QUERY,
      "csv",
      fetchImpl as never,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, failure: "unauthorized" });
  });

  it("refuses to save the app shell an unmounted route answers with", async () => {
    // The SPA catch-all returns the app shell as HTML with 200. Saving that as
    // a .csv is exactly the failure that looked like success before.
    const fetchImpl = vi.fn(async () =>
      response("<!DOCTYPE html>", { type: "text/html" }),
    );
    const result = await fetchMasterOfferingPriceList(
      "member-token",
      QUERY,
      "csv",
      fetchImpl as never,
    );
    expect(result).toEqual({ ok: false, failure: "unavailable" });
  });

  it("maps each refusal onto its own honest outcome", async () => {
    const cases: Array<[number, string]> = [
      [401, "unauthorized"],
      [403, "restricted"],
      [413, "too_large"],
      [503, "unavailable"],
      [500, "error"],
    ];
    for (const [code, failure] of cases) {
      const result = await fetchMasterOfferingPriceList(
        "member-token",
        QUERY,
        "csv",
        (async () =>
          response("{}", { status: code, type: "application/json" })) as never,
      );
      expect(result).toEqual({ ok: false, failure });
    }
  });

  it("falls back to a safe filename when the header is missing or unusable", async () => {
    for (const disposition of [
      undefined,
      'attachment; filename="../../etc/passwd"',
      'attachment; filename="report.exe"',
    ]) {
      const result = await fetchMasterOfferingPriceList(
        "member-token",
        QUERY,
        "csv",
        (async () => response("a,b\r\n", { disposition })) as never,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.filename).toBe("xenios-research-price-list.csv");
      }
    }
  });
});

describe("price list download control", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads with the token and reports that it started", async () => {
    const fetchPriceList = vi.fn(async () => ({
      ok: true as const,
      blob: new Blob(["name,price\r\n"], { type: "text/csv" }),
      filename: "xenios-research-price-list-2026-08-13.csv",
    }));
    const savePriceList = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingPriceListDownload
        query={QUERY}
        memberToken="member-token"
        fetchPriceList={fetchPriceList as never}
        savePriceList={savePriceList}
      />,
    );
    click(host, "mo-download-csv");
    await settle();
    expect(fetchPriceList).toHaveBeenCalledWith("member-token", QUERY, "csv");
    expect(savePriceList).toHaveBeenCalledTimes(1);
    expect(status(host)).toBe("Your price list download has started.");

    click(host, "mo-download-json");
    await settle();
    expect(fetchPriceList).toHaveBeenLastCalledWith(
      "member-token",
      QUERY,
      "json",
    );
    unmount();
  });

  it("says so plainly on a refusal and saves nothing", async () => {
    const fetchPriceList = vi.fn(async () => ({
      ok: false as const,
      failure: "unauthorized" as const,
    }));
    const savePriceList = vi.fn();
    const { host, unmount } = render(
      <MasterOfferingPriceListDownload
        query={QUERY}
        memberToken={null}
        fetchPriceList={fetchPriceList as never}
        savePriceList={savePriceList}
      />,
    );
    click(host, "mo-download-csv");
    await settle();
    expect(savePriceList).not.toHaveBeenCalled();
    expect(status(host)).toBe("Please sign in again to download the price list.");
    unmount();
  });

  it("hands the browser a real object url and releases it", () => {
    const created = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:price-list");
    const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clicks: string[] = [];
    const anchor = document.createElement("a");
    anchor.click = () => clicks.push(anchor.getAttribute("download") ?? "");
    vi.spyOn(document, "createElement").mockImplementation(((
      tag: string,
    ) =>
      tag === "a"
        ? anchor
        : Object.getPrototypeOf(document).createElement.call(
            document,
            tag,
          )) as never);

    saveMasterOfferingPriceList(
      new Blob(["a,b\r\n"], { type: "text/csv" }),
      "xenios-research-price-list-2026-08-13.csv",
    );
    expect(created).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual(["xenios-research-price-list-2026-08-13.csv"]);
    expect(revoked).toHaveBeenCalledWith("blob:price-list");
    expect(anchor.isConnected).toBe(false);
  });
});
