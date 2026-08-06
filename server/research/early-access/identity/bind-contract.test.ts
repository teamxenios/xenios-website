import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  InMemorySessionBindingStore,
  SESSION_BINDING_PROVENANCES,
  asSessionBindingProvenance,
  type SessionBindingProvenance,
} from "./identity-verification";

/**
 * THE BIND CONTRACT: every caller states how it bound.
 *
 * `bind` used to default to "email_entry". That default was safe in one
 * direction (a forgetful caller could not mint a verified session) and unsafe
 * in the one that matters: it allowed a call site to bind a session without
 * ever saying how, so "which doors record a verified identity" was a question
 * you answered by reading every caller and hoping you found them all.
 *
 * Since the verified-link gate that field decides who may see a price, accept
 * the agreement and place an order, so the audit has to be mechanical.
 *
 * These tests are deliberately source-level as well as behavioural. The
 * production call sites are covered by `tsc` (the parameter is required and
 * `npm run check` compiles server/ and scripts/), but the repository excludes
 * `**\/*.test.ts` from that compile, so a typecheck alone would not notice a
 * test binding without provenance, and restoring the default would not fail
 * anything at all. The assertions below are what make that mutation visible.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const IDENTITY_SOURCE = join(import.meta.dirname, "identity-verification.ts");

/** Every .ts file under the given roots, tests included. */
function typescriptFiles(roots: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (entry === "node_modules" || entry === "dist" || entry === "build") continue;
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.endsWith(".ts") || entry.endsWith(".tsx")) found.push(path);
    }
  };
  for (const root of roots) walk(join(REPO_ROOT, root));
  return found;
}

describe("the bind signature states provenance, with no default", () => {
  const source = readFileSync(IDENTITY_SOURCE, "utf8");

  it("declares boundBy as a REQUIRED parameter on the port", () => {
    const declaration = source.slice(source.indexOf("interface SessionBindingStore"));
    const bind = declaration.slice(declaration.indexOf("bind("), declaration.indexOf("): Promise<boolean>"));

    expect(bind).toContain("boundBy: SessionBindingProvenance");
    // The two shapes that would reopen the hole: an optional marker, or a
    // default value. Either one lets a caller bind without saying how.
    expect(bind).not.toContain("boundBy?");
    expect(bind).not.toMatch(/boundBy\s*:\s*SessionBindingProvenance\s*=/);
  });

  it("declares boundBy as a REQUIRED parameter on the in-memory store", () => {
    const method = source.slice(
      source.indexOf("class InMemorySessionBindingStore"),
    );
    const bind = method.slice(method.indexOf("async bind("), method.indexOf("): Promise<boolean> {"));

    expect(bind).toContain("boundBy: SessionBindingProvenance");
    expect(bind).not.toContain("boundBy?");
    expect(bind).not.toMatch(/boundBy\s*:\s*SessionBindingProvenance\s*=/);
  });
});

describe("every call site passes a provenance explicitly", () => {
  /**
   * A `.bind(` on a session-binding store, anywhere in server/ or scripts/,
   * with fewer than three arguments.
   *
   * `Function.prototype.bind` (`something.bind(this)`) is excluded by name:
   * only receivers that are session-binding stores are inspected, which is
   * what `BINDING_RECEIVER` matches.
   */
  const BINDING_RECEIVER = /\b(?:\w+\.)?(?:bindings|sessionBindings|store)\.bind\(/g;

  /** The balanced argument list starting at an opening parenthesis. */
  function argumentsAt(text: string, openIndex: number): string | null {
    let depth = 0;
    for (let index = openIndex; index < text.length; index += 1) {
      const character = text[index];
      if ("([{".includes(character)) depth += 1;
      else if (")]}".includes(character)) {
        depth -= 1;
        if (depth === 0) return text.slice(openIndex + 1, index);
      }
    }
    return null;
  }

  /** Top-level argument count, so a nested call counts as one argument. */
  function argumentCount(args: string): number {
    if (args.trim().length === 0) return 0;
    let depth = 0;
    let count = 1;
    for (const character of args) {
      if ("([{".includes(character)) depth += 1;
      else if (")]}".includes(character)) depth -= 1;
      else if (character === "," && depth === 0) count += 1;
    }
    return count;
  }

  /** Every session-binding `bind(...)` in the repository, with its arguments. */
  function callSites(): { path: string; args: string }[] {
    const sites: { path: string; args: string }[] = [];
    for (const path of typescriptFiles(["server", "scripts"])) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(BINDING_RECEIVER)) {
        const open = (match.index ?? 0) + match[0].length - 1;
        const args = argumentsAt(text, open);
        if (args === null) continue;
        sites.push({ path: path.slice(REPO_ROOT.length + 1), args });
      }
    }
    return sites;
  }

  it("has no session-binding bind call with fewer than three arguments", () => {
    const offenders = callSites()
      .filter((site) => argumentCount(site.args) < 3)
      .map((site) => `${site.path}: .bind(${site.args.trim()})`);

    // This is how the missing provenance on scripts/preview-early-access.ts
    // was found: it was a real production script binding a session without
    // ever saying how, and nothing else in the build noticed.
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("finds the call sites it claims to be checking", () => {
    // The guard above passes trivially if the pattern matches nothing, which
    // is the failure mode of every source-scanning test. This pins that it is
    // actually looking at something, including the one production door that
    // mints a verified identity.
    const sites = callSites();

    expect(sites.length).toBeGreaterThanOrEqual(8);
    expect(
      sites.some(
        (site) =>
          site.path.endsWith(join("identity", "identity-verification.ts")) &&
          site.args.includes('"verified_link"'),
      ),
    ).toBe(true);
  });
});

describe("a provenance the vocabulary does not contain", () => {
  it("normalizes to the weak one, in every shape a store could return", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "verified",
      "VERIFIED_LINK",
      "verified_link ",
      "admin",
      0,
      1,
      true,
      {},
      [],
      { boundBy: "verified_link" },
    ]) {
      expect(asSessionBindingProvenance(raw)).toBe("email_entry");
    }
    // And the one string that is the strong provenance.
    expect(asSessionBindingProvenance("verified_link")).toBe("verified_link");
  });

  it("is normalized on the way INTO the store, not merely on the way out", async () => {
    const store = new InMemorySessionBindingStore();
    await store.bind("sess", "cus", "VERIFIED_LINK" as unknown as SessionBindingProvenance);
    expect(await store.binding("sess")).toEqual({
      customerId: "cus",
      boundBy: "email_entry",
    });
  });

  it("keeps the vocabulary to exactly two values", () => {
    // A third provenance would need its own decision at every gate. If one is
    // ever added, this fails and forces that decision to be made deliberately.
    expect([...SESSION_BINDING_PROVENANCES]).toEqual(["email_entry", "verified_link"]);
  });
});
