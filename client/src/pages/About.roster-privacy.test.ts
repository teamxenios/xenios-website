import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Founder decision D006 (2026-07-30) makes the clinical roster confidential.
 * The names must not appear in public page source, public API payloads, client
 * bundles, structured metadata, or sitemap content. A clinician's identity is
 * disclosed to a patient only inside the confidential Care process.
 *
 * This guard exists because the rule was already broken once: "Dr. Wesley Nahm,
 * MD, CMO and Medical Director" shipped in the live production bundle via the
 * public /about page, and the sitemap advertised that page for indexing. The
 * About page predates D006, so this was a collision between an ordinary company
 * leadership page and a new privacy decision, not a coding error. Samuel chose
 * removal over amending D006.
 *
 * WHY SCAN SOURCE RATHER THAN THE BUILT BUNDLE: everything under client/src is
 * compiled into the client bundle that any visitor can fetch, and client/public
 * is served verbatim. Scanning the inputs catches a reintroduction at the commit
 * that causes it, with a filename and line, instead of after a deploy. It also
 * runs without a build step. The tradeoff is stated plainly: this proves the
 * names are absent from the SOURCES of the public bundle, not that a particular
 * built artifact is clean. A built-artifact scan belongs in the Playwright and
 * release-smoke layer, which is Codex's to add.
 */

// Surnames only. A surname is the part that survives reformatting: "Dr. Wesley
// Nahm, MD", "W. Nahm" and "Nahm, MD" all trip on "Nahm", where a full-string
// match would miss every one of them.
const RESTRICTED_ROSTER_SURNAMES = [
  "Nahm",
  "Baluch",
  "Fatuyi",
  "Khaleghi",
] as const;

// This file necessarily contains the denylist itself, so it must not scan itself.
const SELF = resolve(__dirname, "About.roster-privacy.test.ts");

// Roots whose contents reach an unauthenticated visitor: client/src is bundled,
// client/public is served as-is (it holds sitemap.xml and robots.txt).
const PUBLIC_ROOTS = [
  resolve(__dirname, "..", ".."), // client/src
  resolve(__dirname, "..", "..", "..", "public"), // client/public
];

const SCANNABLE = /\.(tsx?|jsx?|css|html|json|xml|txt|md)$/i;
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

function collectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // a root that does not exist is not a failure
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (SCANNABLE.test(entry) && full !== SELF) out.push(full);
    }
  };
  walk(root);
  return out;
}

describe("D006 confidential clinical roster is absent from every public surface", () => {
  const files = PUBLIC_ROOTS.flatMap(collectFiles);

  it("scans a non-trivial number of public-surface files", () => {
    // Guards the guard: a broken path would make every assertion below pass
    // vacuously, which is the classic way a privacy test silently stops working.
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(RESTRICTED_ROSTER_SURNAMES)(
    "no publicly reachable source mentions %s",
    (surname) => {
      const hits: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        text.split(/\r?\n/).forEach((line, index) => {
          if (line.includes(surname)) {
            hits.push(`${relative(REPO_ROOT, file)}:${index + 1}: ${line.trim().slice(0, 160)}`);
          }
        });
      }
      expect(
        hits,
        `Founder decision D006 forbids the confidential clinical roster on any public surface, ` +
          `and "${surname}" reaches the client bundle from:\n${hits.join("\n")}\n\n` +
          `A clinician's identity is disclosed only inside the confidential Care process. ` +
          `If Samuel later amends D006 to permit a specific public name, remove that one ` +
          `surname from RESTRICTED_ROSTER_SURNAMES and record the amendment, rather than ` +
          `deleting this guard.`,
      ).toEqual([]);
    },
    // Reads every public-surface file once per surname, so it grows with the
    // repo and breaches the 5s default under a full parallel run while
    // passing in isolation. Same headroom the other file-scanning guards
    // carry: a timeout, not a performance assertion. A privacy guard that
    // fails only under load teaches people to re-run it, which is how a real
    // leak eventually gets waved through.
    30_000,
  );

  it("the About page team list carries no clinical title", () => {
    // The roster leaked as a role string ("CMO and Medical Director") attached to
    // a name. Names are covered above; this covers the titles that would signal a
    // clinical identity even if a future entry used initials or a display name.
    const about = readFileSync(resolve(__dirname, "About.tsx"), "utf8");
    const teamBlock = about.slice(about.indexOf("const TEAM"), about.indexOf("const VALUES"));
    for (const title of ["Medical Director", "CMO", "Chief Medical", "MD,", ", MD", "Nurse Practitioner"]) {
      expect(
        teamBlock.includes(title),
        `The public About team list must not carry the clinical title "${title}" (D006).`,
      ).toBe(false);
    }
  });
});
