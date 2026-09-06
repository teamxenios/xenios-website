// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESOURCE_USAGE_POLICY_LABELS,
  type ResourceCardDto,
  type ResourceLibraryResponse,
} from "@shared/research/resource-hub/contract";
import { PARTNER_ROUTES } from "../../lib/routes";
import { PARTNER_PENDING_TITLE } from "./shared";

const session = vi.hoisted(() => ({ token: "synthetic-member-one" as string | null }));
const mocks = vi.hoisted(() => ({ library: vi.fn() }));

vi.mock("../../core", () => ({ useResearch: () => ({ memberToken: session.token }) }));
// Only the library read is mocked: the download goes through the real
// adapter so the bearer, the path, and the blob handling are what is tested.
vi.mock("../../adapters/partner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../adapters/partner")>()),
  getPartnerResources: mocks.library,
}));

import Resources from "./Resources";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESOURCE_ID = "5f1c2f3a-0000-4000-8000-000000000001";

function card(overrides: Partial<ResourceCardDto> = {}): ResourceCardDto {
  return {
    resourceId: RESOURCE_ID,
    versionId: "6a1c2f3a-0000-4000-8000-000000000002",
    title: "Affiliate introduction one-pager",
    purpose: "Send this to someone considering becoming an affiliate.",
    kind: "pdf",
    versionNumber: 2,
    usagePolicy: "external_share",
    usageLabel: RESOURCE_USAGE_POLICY_LABELS.external_share,
    audience: ["affiliate", "all_partners"],
    publishedAt: "2026-09-05T10:00:00.000Z",
    reviewedAt: "2026-09-04T10:00:00.000Z",
    sizeBytes: 1258291,
    sha256: "a".repeat(64),
    actions: { read: true, download: true, share: false },
    downloadPath: `/api/research/partner/resources/${RESOURCE_ID}/download`,
    ...overrides,
  };
}

function library(resources: ResourceCardDto[]): ResourceLibraryResponse {
  return { ok: true, resources, asOf: "2026-09-06T00:00:00.000Z" };
}

function pdfResponse(headers: Record<string, string> = {}, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(
      status === 200
        ? { "content-type": "application/pdf", "content-disposition": 'attachment; filename="affiliate-intro-v2.pdf"', ...headers }
        : { "content-type": "application/json", ...headers },
    ),
    blob: async () => new Blob(["%PDF-1.4 synthetic"], { type: "application/pdf" }),
    json: async () => ({ ok: false, code: "forbidden" }),
  };
}

let host: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.spyOn>;
let savedAs: string[];

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function render() {
  await act(async () => { root.render(<Resources />); });
  await flush();
}
const downloadButton = () => host.querySelector<HTMLButtonElement>(`[data-testid="download-${RESOURCE_ID}"]`);
const click = (button: HTMLElement | null) => act(async () => { button?.click(); });
const articles = () => host.querySelectorAll("article.card");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  session.token = "synthetic-member-one";
  mocks.library.mockReset();
  mocks.library.mockResolvedValue({ kind: "ok", data: library([card()]) });
  fetcher = vi.fn().mockResolvedValue(pdfResponse());
  vi.stubGlobal("fetch", fetcher);
  createObjectURL = vi.fn(() => "blob:synthetic-object-url");
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  savedAs = [];
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    savedAs.push(`${this.getAttribute("download")}|${this.getAttribute("href")}`);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("partner resources library", () => {
  it("renders each card from the server projection with its usage label, purpose, audience, and size, and offers no share control", async () => {
    mocks.library.mockResolvedValue({
      kind: "ok",
      data: library([
        card(),
        card({
          resourceId: "7b1c2f3a-0000-4000-8000-000000000003",
          versionId: "8c1c2f3a-0000-4000-8000-000000000004",
          title: "Rep working notes",
          purpose: "For your own preparation before a conversation. Do not forward.",
          usagePolicy: "private",
          usageLabel: RESOURCE_USAGE_POLICY_LABELS.private,
          audience: ["research_rep"],
          versionNumber: 1,
          sizeBytes: 51200,
          downloadPath: "/api/research/partner/resources/7b1c2f3a-0000-4000-8000-000000000003/download",
        }),
      ]),
    });
    await render();

    expect(mocks.library).toHaveBeenCalledWith("synthetic-member-one");
    expect(articles()).toHaveLength(2);
    const html = host.innerHTML;
    expect(html).toContain("Affiliate introduction one-pager");
    expect(html).toContain("Send this to someone considering becoming an affiliate.");
    expect(html).toContain("Approved to share");
    expect(html).toContain("Private working material");
    expect(html).toContain("Affiliate, All partners");
    expect(html).toContain("Research Rep");
    expect(html).toContain("1.2 MB");
    expect(html).toContain("50 KB");
    expect(html).toContain("PDF · v2");
    expect(html).toContain("Who this is for and how to use it");

    // The lead names all four labels; the intro card links to Compliance for
    // anything that is not "Approved to share".
    for (const label of Object.values(RESOURCE_USAGE_POLICY_LABELS)) expect(host.textContent).toContain(label);
    expect(host.querySelector(`a[href="${PARTNER_ROUTES.compliance}"]`)?.textContent).toContain("Compliance");
    expect(host.textContent).not.toContain("cleared for sharing as-is");
    expect(host.textContent).not.toContain("Everything here is cleared");

    // Actions come from card.actions: a download button per card, no share
    // control anywhere, and never a link to bytes.
    expect(host.querySelectorAll('button[data-testid^="download-"]')).toHaveLength(2);
    const shareControls = Array.from(host.querySelectorAll("button, a")).filter((el) => /share/iu.test(el.textContent ?? ""));
    expect(shareControls).toHaveLength(0);
    expect(host.querySelector("a[download]")).toBeNull();
    expect(host.querySelector('a[href*="/download"]')).toBeNull();
    expect(html).not.toMatch(/https?:\/\//u);
    expect(html).not.toMatch(/storage|supabase|sha256/iu);
  });

  it("downloads through the server-authorized path with the member bearer and saves the streamed bytes", async () => {
    await render();
    await click(downloadButton());
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/research/partner/resources/${RESOURCE_ID}/download`,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Authorization: "Bearer synthetic-member-one" },
      }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(savedAs).toEqual(["affiliate-intro-v2.pdf|blob:synthetic-object-url"]);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(downloadButton()?.disabled).toBe(false);
  });

  it.each([
    [401, "Your session has ended"],
    [403, "not available to your account"],
    [404, "not available for download right now"],
  ])("shows an honest error and saves nothing when the server answers %s", async (status, copy) => {
    fetcher.mockResolvedValue(pdfResponse({}, status));
    await render();
    await click(downloadButton());
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(copy);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
    expect(articles()).toHaveLength(1);
  });

  it("refuses to fetch a download path that is not the application's partner resource path and never renders it", async () => {
    mocks.library.mockResolvedValue({
      kind: "ok",
      data: library([card({ downloadPath: "https://storage.example.test/signed/affiliate.pdf?token=leak" })]),
    });
    await render();
    expect(host.innerHTML).not.toContain("storage.example.test");
    await click(downloadButton());
    await flush();

    expect(fetcher).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("valid download path");
    expect(host.innerHTML).not.toContain("storage.example.test");
  });

  it("renders no download control when the server marks a card not downloadable", async () => {
    mocks.library.mockResolvedValue({
      kind: "ok",
      data: library([
        card({
          usagePolicy: "draft",
          usageLabel: RESOURCE_USAGE_POLICY_LABELS.draft,
          actions: { read: false, download: false, share: false },
          downloadPath: null,
        }),
      ]),
    });
    await render();

    expect(articles()).toHaveLength(1);
    expect(downloadButton()).toBeNull();
    expect(host.textContent).toContain("Download not available");
    expect(host.textContent).toContain("Draft / review required");
  });

  it("renders the empty state when nothing is published for the partner's role", async () => {
    mocks.library.mockResolvedValue({ kind: "ok", data: library([]) });
    await render();
    expect(host.textContent).toContain("No published resources for your role yet.");
    expect(articles()).toHaveLength(0);
  });

  it("renders the partner pending state when the library is unavailable, without inventing a resource", async () => {
    mocks.library.mockResolvedValue({ kind: "unavailable" });
    await render();
    expect(host.textContent).toContain(PARTNER_PENDING_TITLE);
    expect(host.textContent).toContain("nothing is cleared for sharing");
    expect(articles()).toHaveLength(0);
  });

  it("asks a signed-out person to sign in and never calls the library", async () => {
    session.token = null;
    await render();
    expect(host.textContent).toContain("Please sign in.");
    expect(mocks.library).not.toHaveBeenCalled();
    expect(articles()).toHaveLength(0);
  });
});

describe("partner resources responsive layout", () => {
  it("uses fluid grid tracks and wrap-safe text so narrow viewports never overflow", () => {
    const source = readFileSync(join(HERE, "Resources.tsx"), "utf8");
    expect(source).toContain("minmax(min(180px, 100%), 1fr)");
    expect(source).toContain('overflowWrap: "anywhere"');
    expect(source).toContain("flex-wrap");
    expect(source).not.toMatch(/minmax\(\d+px, 1fr\)/u);
    expect(source).not.toMatch(/minWidth: [1-9]/u);
  });
});
