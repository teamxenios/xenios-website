import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * F5 — SOURCE CODE MUST BE READABLE AS TEXT.
 *
 * Four files carried a raw NUL byte (0x00) written directly into a template
 * literal as a composite-key delimiter, rather than the two-character escape.
 *
 * The delimiter itself is a GOOD choice and this test does not object to it: a
 * NUL cannot occur inside a product or variant identifier, so `a` + NUL + `b`
 * cannot collide with any other pair the way a space, colon or pipe can. What
 * is wrong is spelling it as a literal byte.
 *
 * The cost is review integrity, and it is not theoretical. Plain `grep`
 * reports such a file as "Binary file matches" and refuses to show the line;
 * `git grep` searches it happily; a diff can render it as "Binary files
 * differ". A reviewer who cannot read a diff cannot review the file, and two
 * of the four decide what may be sold and to whom.
 *
 * It is also invisible to the author. One of the four was introduced by the
 * same change whose commit message warned about the other three. That is
 * exactly the class of defect a machine should be checking for, because a
 * human reading a diff cannot see it at all.
 */

const REPO_ROOT = path.resolve(__dirname, "..");
const SOURCE_ROOTS = ["server", "shared", "client/src", "scripts"] as const;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"] as const;
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "build", ".git", "coverage"]);

function sourceFiles(absoluteDir: string): string[] {
  const found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(absoluteDir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = path.join(absoluteDir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(full);
  }
  return found;
}

describe("no source file contains a raw NUL byte", () => {
  it("keeps every TypeScript and JavaScript source readable as text", () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(path.join(REPO_ROOT, root))) {
        // Read as BYTES. Reading as utf8 would hide the very thing being
        // looked for behind a decoded string.
        const bytes = readFileSync(file);
        const count = bytes.filter((byte) => byte === 0).length;
        if (count > 0) {
          offenders.push(`${path.relative(REPO_ROOT, file).replace(/\\/g, "/")} (${count})`);
        }
      }
    }

    expect(
      offenders,
      "Raw NUL bytes found in source. Write the escape sequence instead of the " +
        "byte, and keep the delimiter exactly as it was so no key changes:\n" +
        offenders.join("\n"),
    ).toEqual([]);
    // The whole client tree is walked, so the budget is a property of the
    // machine rather than of the code under test.
  }, 60_000);
});
