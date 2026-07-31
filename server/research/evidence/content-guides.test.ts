// The evidence-to-commerce guide source, proven two ways:
//
//   1. Over a fixture tree, so the faithful-mapping rules are exact: front
//      matter carried, publication never assertable by a content file, honest
//      coming_soon for a packet with no draft, truthful empty with no tree.
//   2. Over the REAL content/research-guides tree, so the number the member
//      library shows is the number of packets that actually exist in the repo.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  createContentGuideSource,
  relatedProductSkusByGuideSlug,
} from "./content-guides";

// ---------------------------------------------------------------------------
// Fixture tree
// ---------------------------------------------------------------------------

const tmpRoots: string[] = [];

afterAll(() => {
  for (const root of tmpRoots) fs.rmSync(root, { recursive: true, force: true });
});

function fixtureTree(packets: Record<string, string | null>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xr-guides-"));
  tmpRoots.push(root);
  for (const [rel, draft] of Object.entries(packets)) {
    const dir = path.join(root, rel);
    fs.mkdirSync(dir, { recursive: true });
    if (draft !== null) fs.writeFileSync(path.join(dir, "GUIDE_DRAFT.md"), draft, "utf8");
  }
  return root;
}

const DRAFT = [
  "---",
  'title: "Alpha Research Guide"',
  "type: research-guide",
  "status: draft",
  "workflow_state: draft",
  "---",
  "",
  "# Alpha",
  "Body text.",
].join("\n");

describe("content guide source over a fixture tree", () => {
  it("maps a real draft packet faithfully onto GuideSummaryDto", async () => {
    const root = fixtureTree({ "individual/alpha": DRAFT });
    const source = createContentGuideSource({
      contentDir: root,
      relatedSkusByGuideSlug: new Map([["alpha", ["P001", "P002"]]]),
    });
    expect(await source.listForMember()).toEqual([
      {
        slug: "alpha",
        title: "Alpha Research Guide",
        status: "in_development",
        publishedAt: null,
        relatedProductSkus: ["P001", "P002"],
      },
    ]);
  });

  it("never lets a content file assert publication; in_review is the only forward state", async () => {
    const root = fixtureTree({
      "individual/reviewing": DRAFT.replace("workflow_state: draft", "workflow_state: in_review"),
      // A packet claiming publication is understated to in_development: only the
      // evidence review gate (guides.ts) can publish, never front matter.
      "individual/liar": DRAFT.replace("workflow_state: draft", "workflow_state: published"),
    });
    const source = createContentGuideSource({ contentDir: root });
    const guides = await source.listForMember();
    expect(guides.map((g) => [g.slug, g.status])).toEqual([
      ["liar", "in_development"],
      ["reviewing", "in_review"],
    ]);
    for (const guide of guides) expect(guide.publishedAt).toBeNull();
  });

  it("reports a packet directory with no draft as coming_soon, title honestly the slug", async () => {
    const root = fixtureTree({ "blends/future-blend": null });
    const source = createContentGuideSource({ contentDir: root });
    expect(await source.listForMember()).toEqual([
      {
        slug: "future-blend",
        title: "future-blend",
        status: "coming_soon",
        publishedAt: null,
        relatedProductSkus: [],
      },
    ]);
  });

  it("falls back to the first heading, then the slug, when front matter has no title", async () => {
    const root = fixtureTree({
      "individual/headed": "no front matter here\n# Headed Guide\ntext",
      "individual/bare": "just text, no heading",
    });
    const guides = await createContentGuideSource({ contentDir: root }).listForMember();
    expect(guides.map((g) => [g.slug, g.title])).toEqual([
      ["bare", "bare"],
      ["headed", "Headed Guide"],
    ]);
  });

  it("denies the detail of a known unpublished packet and answers null for an unknown slug", async () => {
    const root = fixtureTree({ "individual/alpha": DRAFT });
    const source = createContentGuideSource({ contentDir: root });
    expect(await source.getForMember("alpha")).toEqual({ denied: "guide_not_published" });
    expect(await source.getForMember("does-not-exist")).toBeNull();
    expect(await source.getForMember("")).toBeNull();
  });

  it("reads the truthful empty when the content tree is not on disk", async () => {
    const source = createContentGuideSource({
      contentDir: path.join(os.tmpdir(), "xr-guides-absent", String(Date.now())),
    });
    expect(await source.listForMember()).toEqual([]);
    expect(await source.getForMember("alpha")).toBeNull();
  });
});

describe("relatedProductSkusByGuideSlug", () => {
  it("inverts the catalog's product-to-guide links without inventing or duplicating", () => {
    const map = relatedProductSkusByGuideSlug([
      { sku: "P001", relatedGuideSlugs: ["bpc-157", "tb-500"] },
      { sku: "P002", relatedGuideSlugs: ["bpc-157"] },
      { sku: "P002", relatedGuideSlugs: ["bpc-157"] },
      { sku: "P003", relatedGuideSlugs: [] },
    ]);
    expect(map.get("bpc-157")).toEqual(["P001", "P002"]);
    expect(map.get("tb-500")).toEqual(["P001"]);
    expect(map.get("unmapped")).toBeUndefined();
  });
});

describe("content guide source over the real repository tree", () => {
  const source = createContentGuideSource();

  it("lists every real guide packet: 20 individual plus 6 blends, all unpublished drafts", async () => {
    const guides = await source.listForMember();
    // The real count on disk (content/research-guides/{individual,blends}).
    expect(guides).toHaveLength(26);
    expect(new Set(guides.map((g) => g.slug)).size).toBe(26);
    for (const guide of guides) {
      // Every packet is an AI draft at workflow state draft (the tree README),
      // so nothing may present as published and no date may be shown.
      expect(guide.status).toBe("in_development");
      expect(guide.publishedAt).toBeNull();
      expect(guide.title.length).toBeGreaterThan(0);
    }
  });

  it("carries the real front matter titles, including the BOM-prefixed blend files", async () => {
    const guides = await source.listForMember();
    const bySlug = new Map(guides.map((g) => [g.slug, g]));
    expect(bySlug.get("bpc-157")?.title).toBe("BPC-157 Research Guide");
    // klow's GUIDE_DRAFT.md starts with a UTF-8 BOM; the title must still parse.
    expect(bySlug.get("klow")?.title).toBe("KLOW: Research Guide");
  });

  it("keeps every real packet's detail behind the publication gate", async () => {
    expect(await source.getForMember("bpc-157")).toEqual({ denied: "guide_not_published" });
    expect(await source.getForMember("klow")).toEqual({ denied: "guide_not_published" });
    expect(await source.getForMember("not-a-guide")).toBeNull();
  });
});
