// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESOURCE_PDF_MAX_BYTES,
  type ResourceAdminDto,
  type ResourceAdminListResponse,
  type ResourceVersionAdminDto,
} from "@shared/research/resource-hub/contract";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  review: vi.fn(),
  download: vi.fn(),
  unsubscribeAuth: vi.fn(),
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: vi.fn(async () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: mocks.unsubscribeAuth } },
      }),
    },
  })),
}));

vi.mock("../../adapters/resourceHubAdmin", () => ({
  listResourceHubResources: mocks.list,
  uploadResourceHubVersion: mocks.upload,
  reviewResourceHubVersion: mocks.review,
  downloadResourceHubVersion: mocks.download,
  adminResourceVersionDownloadPath: (resourceId: string, versionId: string) =>
    `/api/admin/research/resource-hub/resources/${resourceId}/versions/${versionId}/download`,
}));

import { ResourceHubAdminBody } from "./ResourceHubAdmin";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = "e30.eyJzdWIiOiJhZG1pbiJ9.signature";
const RESOURCE_A = "11111111-1111-4111-8111-111111111111";
const RESOURCE_B = "22222222-2222-4222-8222-222222222222";

function version(overrides: Partial<ResourceVersionAdminDto> = {}): ResourceVersionAdminDto {
  return {
    versionId: "v-draft",
    versionNumber: 1,
    state: "draft",
    usagePolicy: "private",
    audience: ["all_partners"],
    sizeBytes: 204800,
    sha256: "b".repeat(64),
    originalFilename: "onboarding.pdf",
    contentType: "application/pdf",
    validation: { ok: true, reasons: [] },
    uploadedAt: "2026-09-06T01:00:00.000Z",
    reviewedAt: null,
    publishedAt: null,
    withdrawnAt: null,
    supersedesVersionId: null,
    changeSummary: null,
    ...overrides,
  };
}

function resource(overrides: Partial<ResourceAdminDto> = {}): ResourceAdminDto {
  return {
    resourceId: RESOURCE_A,
    title: "Partner onboarding guide",
    purpose: "Read this before your first partner conversation.",
    kind: "pdf",
    createdAt: "2026-09-06T00:30:00.000Z",
    currentPublishedVersionId: null,
    versions: [version()],
    ...overrides,
  };
}

// One resource exercising every state at once, plus a second one with a
// quarantined upload whose validation failed.
function fullLibrary(): ResourceAdminListResponse {
  return {
    ok: true,
    resources: [
      resource({
        currentPublishedVersionId: "v-published",
        versions: [
          version({ versionId: "v-superseded", versionNumber: 1, state: "superseded", reviewedAt: "2026-09-01T00:00:00.000Z", publishedAt: "2026-09-01T01:00:00.000Z" }),
          version({ versionId: "v-published", versionNumber: 2, state: "published", usagePolicy: "external_share", reviewedAt: "2026-09-02T00:00:00.000Z", publishedAt: "2026-09-02T01:00:00.000Z", supersedesVersionId: "v-superseded", changeSummary: "Updated commission language." }),
          version({ versionId: "v-review-ready", versionNumber: 3, state: "in_review", reviewedAt: "2026-09-03T00:00:00.000Z" }),
          version({ versionId: "v-review-unreviewed", versionNumber: 4, state: "in_review" }),
          version({ versionId: "v-review-draft-policy", versionNumber: 5, state: "in_review", reviewedAt: "2026-09-03T00:00:00.000Z", usagePolicy: "draft" }),
          version({ versionId: "v-withdrawn", versionNumber: 5, state: "withdrawn", withdrawnAt: "2026-09-04T00:00:00.000Z" }),
          version({ versionId: "v-draft", versionNumber: 6, state: "draft" }),
        ],
      }),
      resource({
        resourceId: RESOURCE_B,
        title: "Broken upload",
        purpose: "This one never passed validation.",
        versions: [
          version({
            versionId: "v-quarantined",
            versionNumber: 1,
            state: "quarantined",
            originalFilename: "not-really.pdf",
            validation: { ok: false, reasons: ["Not a PDF: magic bytes missing"] },
          }),
        ],
      }),
    ],
  };
}

let host: HTMLDivElement;
let root: Root | null;

async function renderPage() {
  await act(async () => {
    root = createRoot(host);
    root.render(<ResourceHubAdminBody token={TOKEN} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const byTestId = <T extends HTMLElement>(id: string) => host.querySelector<T>(`[data-testid="${id}"]`);
const click = (el: HTMLElement | null) => act(async () => { el?.click(); });

function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null, value: string) {
  if (!el) throw new Error("missing field");
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  return act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function attachFile(file: File) {
  const input = host.querySelector<HTMLInputElement>("#resource-hub-file");
  if (!input) throw new Error("missing file input");
  return act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: { 0: file, length: 1, item: () => file } });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function pdfFile(name = "guide.pdf", content = "%PDF-1.4 synthetic bytes") {
  return new File([content], name, { type: "application/pdf" });
}

async function fillValidForm() {
  await setValue(host.querySelector("#resource-hub-title"), "Affiliate intro");
  await setValue(host.querySelector("#resource-hub-purpose"), "Send this to someone considering becoming an affiliate.");
  await setValue(host.querySelector("#resource-hub-usage"), "training");
  await click(host.querySelector("#resource-hub-audience-affiliate"));
}

const submit = () => click(byTestId("resource-hub-submit"));
const alerts = () => Array.from(host.querySelectorAll('[role="alert"]')).map((el) => el.textContent ?? "").join(" | ");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = null;
  mocks.list.mockReset();
  mocks.upload.mockReset();
  mocks.review.mockReset();
  mocks.download.mockReset();
  mocks.list.mockResolvedValue({ kind: "ok", data: fullLibrary() });
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  host.remove();
  vi.restoreAllMocks();
});

describe("Resource Hub admin page", () => {
  it("renders every resource with its version states, validation reasons, and the standing no-notification note", async () => {
    await renderPage();

    expect(mocks.list).toHaveBeenCalledWith(TOKEN);
    expect(host.querySelectorAll("article.card")).toHaveLength(2);
    const html = host.innerHTML;
    expect(html).toContain("Partner onboarding guide");
    expect(html).toContain("Read this before your first partner conversation.");
    expect(html).toContain("Published: version 2");
    for (const label of ["Superseded", "Published", "In review", "Withdrawn", "Draft", "Quarantined"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Validation failed");
    expect(html).toContain("Not a PDF: magic bytes missing");
    expect(html).toContain("Updated commission language.");
    expect(html).toContain("200 KB");
    expect(html).toContain("sha256 bbbbbbbbbbbb…");
    expect(html).not.toContain("b".repeat(64));
    expect(html).toContain("Supersedes");
    expect(html).toContain("Version 1");

    const note = byTestId("resource-hub-standing-note");
    expect(note?.textContent).toContain("sends no notifications");
    expect(note?.textContent).toContain("External sharing is not enabled in this release");

    expect(html).not.toMatch(/storage|supabase|signedUrl/iu);
  });

  it("offers only the transitions each version state allows", async () => {
    await renderPage();
    const has = (id: string) => byTestId(id) !== null;

    // draft: request review, approve, preview; no publish, no withdraw
    expect(has("action-request_review-v-draft")).toBe(true);
    expect(has("action-approve_content-v-draft")).toBe(true);
    expect(has("preview-v-draft")).toBe(true);
    expect(has("action-publish-v-draft")).toBe(false);
    expect(has("action-withdraw-v-draft")).toBe(false);

    // in_review with a recorded content approval and passing validation: publish
    expect(has("action-publish-v-review-ready")).toBe(true);
    // an approval is recorded once: the approved version offers Publish, not a second approval
    expect(has("action-approve_content-v-review-ready")).toBe(false);
    expect(has("action-request_review-v-review-ready")).toBe(false);

    // in_review with no recorded approval: no publish yet
    expect(has("action-publish-v-review-unreviewed")).toBe(false);
    expect(has("action-approve_content-v-review-unreviewed")).toBe(true);

    // in_review, approved, but labelled "Draft / review required": never publishable
    expect(has("action-publish-v-review-draft-policy")).toBe(false);
    expect(has("action-approve_content-v-review-draft-policy")).toBe(false);
    expect(has("preview-v-review-draft-policy")).toBe(true);

    // published: withdraw and preview only
    expect(has("action-withdraw-v-published")).toBe(true);
    expect(has("preview-v-published")).toBe(true);
    expect(has("action-publish-v-published")).toBe(false);
    expect(has("action-approve_content-v-published")).toBe(false);

    // terminal states: preview only
    for (const id of ["v-superseded", "v-withdrawn"]) {
      expect(has(`preview-${id}`)).toBe(true);
      for (const action of ["request_review", "approve_content", "publish", "withdraw"]) {
        expect(has(`action-${action}-${id}`)).toBe(false);
      }
    }

    // quarantined: nothing, not even a preview of unvalidated bytes
    expect(has("preview-v-quarantined")).toBe(false);
    for (const action of ["request_review", "approve_content", "publish", "withdraw"]) {
      expect(has(`action-${action}-v-quarantined`)).toBe(false);
    }
    expect(byTestId("version-v-quarantined")?.textContent).toContain("No actions until validation passes.");
  });

  it.each([
    ["request_review", "v-draft"],
    ["publish", "v-review-ready"],
  ] as const)("records %s through the adapter with the exact resource and version ids, then reloads", async (action, versionId) => {
    mocks.review.mockResolvedValue({ kind: "ok", data: { ok: true, resource: fullLibrary().resources[0] } });
    await renderPage();
    await click(byTestId(`action-${action}-${versionId}`));
    await flush();

    expect(mocks.review).toHaveBeenCalledTimes(1);
    expect(mocks.review).toHaveBeenCalledWith(TOKEN, RESOURCE_A, versionId, {
      action,
      idempotencyKey: expect.stringMatching(/^.{8,120}$/u),
    });
    expect(mocks.list).toHaveBeenCalledTimes(2);
    // The outcome line lives above the boundary so it survives the reload.
    expect(byTestId("resource-hub-outcome")?.getAttribute("role")).toBe("status");
    expect(byTestId("resource-hub-outcome")?.textContent).toContain('Recorded. "Partner onboarding guide" version');
    expect(host.querySelectorAll("article.card")).toHaveLength(2);
  });

  it.each([
    ["approve_content", "v-draft", "Confirm approval"],
    ["withdraw", "v-published", "Confirm withdrawal"],
  ] as const)("asks for a reason before recording %s and sends it with the action", async (action, versionId, confirmLabel) => {
    mocks.review.mockResolvedValue({ kind: "ok", data: { ok: true, resource: fullLibrary().resources[0] } });
    await renderPage();

    expect(byTestId(`reason-form-${versionId}`)).toBeNull();
    await click(byTestId(`action-${action}-${versionId}`));
    expect(byTestId(`reason-form-${versionId}`)).not.toBeNull();
    expect(byTestId(`confirm-${versionId}`)?.textContent).toBe(confirmLabel);

    // An empty reason is refused client-side; nothing is sent.
    await click(byTestId(`confirm-${versionId}`));
    expect(mocks.review).not.toHaveBeenCalled();
    expect(alerts()).toContain("at least 3 characters");

    await setValue(byTestId<HTMLInputElement>(`reason-${versionId}`), "Checked against the current partner rules.");
    await click(byTestId(`confirm-${versionId}`));
    await flush();

    expect(mocks.review).toHaveBeenCalledWith(TOKEN, RESOURCE_A, versionId, {
      action,
      reason: "Checked against the current partner rules.",
      idempotencyKey: expect.any(String),
    });
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("shows the server's refusal for a stale transition without pretending it happened", async () => {
    mocks.review.mockResolvedValue({
      kind: "denied",
      code: "resource_state_conflict",
      message: "Version 6 is no longer a draft.",
    });
    await renderPage();
    await click(byTestId("action-request_review-v-draft"));
    await flush();

    expect(alerts()).toContain("Version 6 is no longer a draft.");
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it("streams the admin preview through the adapter with the bearer and saves it, and reports a denial honestly", async () => {
    const createObjectURL = vi.fn(() => "blob:synthetic");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.getAttribute("download") ?? "");
    });
    mocks.download
      .mockResolvedValueOnce({ kind: "ok", blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }), filename: null })
      .mockResolvedValueOnce({ kind: "forbidden" });
    await renderPage();

    await click(byTestId("preview-v-published"));
    await flush();
    expect(mocks.download).toHaveBeenCalledWith(TOKEN, RESOURCE_A, "v-published");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["onboarding.pdf"]);

    await click(byTestId("preview-v-draft"));
    await flush();
    expect(alerts()).toContain("not authorized to read this version");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  it("rejects a non-PDF file client-side and sends nothing", async () => {
    await renderPage();
    await fillValidForm();
    await attachFile(new File(["hello"], "notes.txt", { type: "text/plain" }));
    await submit();
    await flush();

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(alerts()).toContain('"notes.txt" is not a PDF');
  });

  it("rejects an oversize PDF client-side and shows its size", async () => {
    await renderPage();
    await fillValidForm();
    const big = pdfFile("big.pdf");
    Object.defineProperty(big, "size", { configurable: true, value: RESOURCE_PDF_MAX_BYTES + 1 });
    await attachFile(big);
    expect(host.textContent).toContain("big.pdf · 15.0 MB");
    await submit();
    await flush();

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(alerts()).toContain("larger than the 15.0 MB limit");
  });

  it("requires an audience and a purpose before sending any bytes", async () => {
    await renderPage();
    await setValue(host.querySelector("#resource-hub-title"), "Affiliate intro");
    await attachFile(pdfFile());
    await submit();
    await flush();

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(alerts()).toContain("Choose at least one audience.");
    expect(alerts()).toContain("at least 10 characters");
  });

  it("uploads a valid PDF with the exact metadata and one idempotency key, then reloads", async () => {
    const uploaded = resource({
      resourceId: "33333333-3333-4333-8333-333333333333",
      title: "Affiliate intro",
      versions: [version({ versionId: "v-new", versionNumber: 1, state: "quarantined" })],
    });
    mocks.upload.mockResolvedValue({ kind: "ok", data: { ok: true, resource: uploaded } });
    await renderPage();
    await fillValidForm();
    const chosen = pdfFile();
    await attachFile(chosen);
    expect(host.textContent).toContain("guide.pdf · 24 B");
    await submit();
    await flush();
    await flush();

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [token, body, sent] = mocks.upload.mock.calls[0];
    expect(token).toBe(TOKEN);
    expect(body).toEqual({
      title: "Affiliate intro",
      purpose: "Send this to someone considering becoming an affiliate.",
      usagePolicy: "training",
      audience: ["affiliate"],
      originalFilename: "guide.pdf",
      idempotencyKey: expect.stringMatching(/^.{8,120}$/u),
    });
    expect(sent).toBe(chosen);
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(byTestId("resource-hub-outcome")?.textContent).toContain('Uploaded "Affiliate intro" as version 1');
    expect(byTestId("resource-hub-outcome")?.textContent).toContain("It is quarantined");
    expect((host.querySelector("#resource-hub-title") as HTMLInputElement).value).toBe("");
  });

  it("hands the adapter metadata only and the untouched File: no base64, no content type, no bytes in the payload", async () => {
    mocks.upload.mockResolvedValue({ kind: "ok", data: { ok: true, resource: fullLibrary().resources[0] } });
    await renderPage();
    await fillValidForm();
    const chosen = pdfFile("guide.pdf", "%PDF-1.4 bytes the page must never read");
    await attachFile(chosen);
    await submit();
    await flush();
    await flush();

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const call = mocks.upload.mock.calls[0];
    expect(call).toHaveLength(3);
    const [, metadata, file] = call;
    expect(Object.keys(metadata).sort()).toEqual(
      ["audience", "idempotencyKey", "originalFilename", "purpose", "title", "usagePolicy"].sort(),
    );
    expect(metadata).not.toHaveProperty("bytesBase64");
    expect(metadata).not.toHaveProperty("contentType");
    expect(JSON.stringify(metadata)).not.toContain("%PDF");
    expect(file).toBeInstanceOf(File);
    expect(file).toBe(chosen);
    expect((file as File).name).toBe("guide.pdf");
    expect((file as File).size).toBe(chosen.size);
  });

  it("sends the chosen resource id and change summary when uploading a new version", async () => {
    mocks.upload.mockResolvedValue({ kind: "ok", data: { ok: true, resource: fullLibrary().resources[0] } });
    await renderPage();
    await fillValidForm();
    await setValue(host.querySelector("#resource-hub-version-of"), RESOURCE_A);
    await setValue(host.querySelector("#resource-hub-change-summary"), "Refreshed the pricing table.");
    await attachFile(pdfFile());
    await submit();
    await flush();
    await flush();

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0][1]).toEqual(expect.objectContaining({
      resourceId: RESOURCE_A,
      changeSummary: "Refreshed the pricing table.",
    }));
  });

  it("places server field errors on the field they name and keeps the form", async () => {
    mocks.upload.mockResolvedValue({
      kind: "denied",
      code: "invalid_resource_upload",
      message: "The PDF failed validation.",
      fieldErrors: { file: ["Magic bytes are not %PDF"], title: ["A resource with this title already exists"] },
    });
    await renderPage();
    await fillValidForm();
    await attachFile(pdfFile());
    await submit();
    await flush();
    await flush();

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(host.querySelector("#resource-hub-file-error")?.textContent).toContain("Magic bytes are not %PDF");
    expect(host.querySelector("#resource-hub-title-error")?.textContent).toContain("already exists");
    expect(alerts()).toContain("The PDF failed validation.");
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect((host.querySelector("#resource-hub-title") as HTMLInputElement).value).toBe("Affiliate intro");
  });

  it("renders the empty state when no resource exists", async () => {
    mocks.list.mockResolvedValue({ kind: "ok", data: { ok: true, resources: [] } });
    await renderPage();
    expect(host.textContent).toContain("No resources uploaded yet.");
    expect(host.querySelectorAll("article.card")).toHaveLength(0);
    expect(byTestId("resource-hub-upload")).not.toBeNull();
  });

  it("shows an honest unavailable state that names what is missing", async () => {
    mocks.list.mockResolvedValue({ kind: "unavailable" });
    await renderPage();
    expect(host.textContent).toContain("The Resource Hub is not reachable.");
    expect(host.textContent).toContain("Nothing has been uploaded or published from this screen.");
    expect(host.querySelectorAll("article.card")).toHaveLength(0);
    expect(byTestId("resource-hub-upload")).toBeNull();
  });

  it.each([
    [{ kind: "unauthorized" }, "Your admin session has ended."],
    [{ kind: "forbidden" }, "Access denied."],
  ])("renders no resource data when the session is %o", async (result, copy) => {
    mocks.list.mockResolvedValue(result);
    await renderPage();
    expect(host.textContent).toContain(copy);
    expect(host.querySelectorAll("article.card")).toHaveLength(0);
    expect(host.innerHTML).not.toContain("onboarding.pdf");
    expect(byTestId("resource-hub-upload")).toBeNull();
  });
});

describe("Resource Hub admin responsive layout", () => {
  it("uses fluid grid tracks, wrap-safe text, and no fixed widths so narrow viewports never overflow", () => {
    const source = readFileSync(join(HERE, "ResourceHubAdmin.tsx"), "utf8");
    expect(source).toContain("minmax(min(280px, 100%), 1fr)");
    expect(source).toContain("minmax(min(220px, 100%), 1fr)");
    expect(source).toContain("minmax(min(200px, 100%), 1fr)");
    expect(source).toContain("minmax(min(190px, 100%), 1fr)");
    expect(source).toContain('overflowWrap: "anywhere"');
    expect(source).toContain("flex-wrap");
    expect(source).not.toMatch(/minmax\(\d+px, 1fr\)/u);
    expect(source).not.toMatch(/minWidth: [1-9]/u);
    expect(source).not.toMatch(/\bwidth: \d+/u);
  });
});
