// xenios research: the evidence-to-commerce Guide source.
//
// The commerce surface (GET /api/research/guides and /guides/:slug) needs a
// guide list, and the REAL guide material lives as packets under
// content/research-guides/{individual,blends}/<slug>/. This module reads those
// packets and maps them onto the wire DTOs the commerce routes serve, so the
// member library shows the real editorial pipeline instead of a hardcoded
// empty list.
//
// Truthfulness rules, structural:
//
//   1. A content file can never assert publication. Every packet in the tree
//      is an unreviewed draft (see content/research-guides/README.md), and
//      publication is decided by the evidence review gate in guides.ts (five
//      review roles plus a named-human founder capability), never by front
//      matter. This adapter therefore NEVER emits "published" or "updated",
//      and the detail path answers every known slug with the
//      guide_not_published denial until a reviewed revision exists.
//   2. Every summary field is carried from the packet or honestly absent:
//      title from the draft's front matter (falling back to its first heading,
//      then the slug itself), publishedAt always null, relatedProductSkus from
//      the catalog's own product-to-guide mapping inverted, never guessed.
//   3. A packet directory without a readable GUIDE_DRAFT.md is a real planned
//      topic with nothing drafted, which is exactly what "coming_soon" means.
//   4. A deployment without the content tree on disk has no evidence source,
//      so the list is the truthful empty and every slug is absent (null).

import fs from "node:fs";
import path from "node:path";
import type { GuideDetailDto, GuideSummaryDto } from "@shared/research/commerce-api";

/** Where the guide packets live, relative to the server process's working directory. */
export const CONTENT_GUIDES_RELATIVE_DIR = "content/research-guides";

/** The two packet lanes. member-faq is education material, not a Guide packet. */
const PACKET_LANES = ["individual", "blends"] as const;

const DRAFT_FILENAME = "GUIDE_DRAFT.md";

export interface ContentGuideSource {
  listForMember(): Promise<GuideSummaryDto[]>;
  getForMember(slug: string): Promise<GuideDetailDto | { denied: "guide_not_published" } | null>;
}

export interface ContentGuideSourceOptions {
  /** Absolute content root. Defaults to the repo location under cwd. */
  contentDir?: string;
  /** Guide slug -> product SKUs, from the catalog inversion below. Default: none. */
  relatedSkusByGuideSlug?: ReadonlyMap<string, readonly string[]>;
}

/**
 * Inverts the catalog's product-to-guide mapping (CatalogProduct.relatedGuideSlugs)
 * so each Guide summary can carry the SKUs that cite it. The catalog is the only
 * authority for this relation; nothing here adds or reorders a link.
 */
export function relatedProductSkusByGuideSlug(
  products: ReadonlyArray<{ sku: string; relatedGuideSlugs: readonly string[] }>,
): Map<string, string[]> {
  const bySlug = new Map<string, string[]>();
  for (const product of products) {
    for (const guideSlug of product.relatedGuideSlugs) {
      const skus = bySlug.get(guideSlug) ?? [];
      if (skus.indexOf(product.sku) === -1) skus.push(product.sku);
      bySlug.set(guideSlug, skus);
    }
  }
  return bySlug;
}

// ---------------------------------------------------------------------------
// Front matter (title and workflow state only; no YAML dependency)
// ---------------------------------------------------------------------------

interface DraftHead {
  title: string | null;
  workflowState: string | null;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Reads the packet draft's front matter block plus the first markdown heading.
 * Tolerant on purpose: a missing or malformed block yields nulls and the caller
 * falls back, it never throws and never invents a value.
 */
function parseDraftHead(raw: string): DraftHead {
  // Some packets carry a UTF-8 BOM; strip it by code point, no invisible regex.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split(/\r?\n/);
  let title: string | null = null;
  let workflowState: string | null = null;

  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === "---") break;
      const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
      if (!match) continue;
      const key = match[1];
      const value = stripQuotes(match[2]);
      if (key === "title" && value !== "") title = value;
      // workflow_state is the packet's own state field; status is its older name.
      if ((key === "workflow_state" || (key === "status" && workflowState === null)) && value !== "") {
        workflowState = value;
      }
    }
  }

  if (title === null) {
    for (const line of lines) {
      const heading = /^#\s+(.+)$/.exec(line);
      if (heading) {
        title = heading[1].trim();
        break;
      }
    }
  }

  return { title, workflowState };
}

/**
 * The wire status a packet may claim. in_review is the only forward state a
 * content file can assert; published/updated are the review gate's to grant
 * (guides.ts), so any other value, including a claimed "published", reads as
 * in_development. That is the safe direction: understated, never overstated.
 */
function statusOf(workflowState: string | null): GuideSummaryDto["status"] {
  return workflowState === "in_review" ? "in_review" : "in_development";
}

// ---------------------------------------------------------------------------
// The source
// ---------------------------------------------------------------------------

export function createContentGuideSource(
  options: ContentGuideSourceOptions = {},
): ContentGuideSource {
  const contentDir = options.contentDir ?? path.resolve(process.cwd(), CONTENT_GUIDES_RELATIVE_DIR);
  const relatedBySlug = options.relatedSkusByGuideSlug ?? new Map<string, readonly string[]>();

  // Scanned once per source, lazily, so building the commerce dependencies
  // costs no filesystem work until the guide surface is actually queried.
  let cache: GuideSummaryDto[] | null = null;

  function relatedSkus(slug: string): string[] {
    return (relatedBySlug.get(slug) ?? []).slice();
  }

  function summarize(lane: string, slug: string): GuideSummaryDto {
    const draftPath = path.join(contentDir, lane, slug, DRAFT_FILENAME);
    let head: DraftHead | null = null;
    try {
      head = parseDraftHead(fs.readFileSync(draftPath, "utf8"));
    } catch {
      // No readable draft: the topic exists (the packet directory is real) and
      // nothing is written yet, which is precisely coming_soon.
      head = null;
    }
    if (head === null) {
      return {
        slug,
        title: slug,
        status: "coming_soon",
        publishedAt: null,
        relatedProductSkus: relatedSkus(slug),
      };
    }
    return {
      slug,
      // The slug is the fallback title: derived from the packet's own
      // directory name, never a prettified guess at a compound name.
      title: head.title ?? slug,
      status: statusOf(head.workflowState),
      // Never a date here: nothing in this tree has published (rule 1).
      publishedAt: null,
      relatedProductSkus: relatedSkus(slug),
    };
  }

  function scan(): GuideSummaryDto[] {
    if (cache !== null) return cache;
    const summaries: GuideSummaryDto[] = [];
    for (const lane of PACKET_LANES) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(path.join(contentDir, lane), { withFileTypes: true });
      } catch {
        // The lane (or the whole tree) is not on disk in this deployment, so
        // this lane contributes nothing: the truthful empty, not a throw.
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        summaries.push(summarize(lane, entry.name));
      }
    }
    summaries.sort((a, b) => a.slug.localeCompare(b.slug));
    cache = summaries;
    return summaries;
  }

  return {
    listForMember: () => Promise.resolve(scan()),
    getForMember(slug) {
      const wanted = typeof slug === "string" ? slug.trim() : "";
      if (wanted === "") return Promise.resolve(null);
      const known = scan().some((summary) => summary.slug === wanted);
      // Known packet: unpublished by rule 1, so the detail path denies rather
      // than rendering draft material. Unknown slug: absent (the route 404s).
      // When the review gate publishes a revision, the published detail flows
      // through the evidence GuideService (guides.ts memberDetail), not here.
      return Promise.resolve(known ? { denied: "guide_not_published" as const } : null);
    },
  };
}
