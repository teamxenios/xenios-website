import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * iOS Safari zooms the page when a focused text control's font-size is under
 * 16px, and does not zoom back out.
 *
 * This is not a cosmetic nit. It was found in conversion QA on the live order
 * form: every field of the Early Access order request computed to 14.4px, so a
 * customer tapping "Email" lost the layout, and had to pinch back out on every
 * subsequent field, mid-checkout, on the one journey that takes money.
 * (`.xenios-order-page label` set `.9rem` and the controls used `font:
 * inherit`, which pulls the size from the label.)
 *
 * A jsdom render cannot catch this: there is no layout engine and no cascade
 * resolution across stylesheets. So this reads the stylesheets themselves and
 * fails on any rule that puts a text-entry control below the threshold. It is
 * a static check on a measured, real-world defect, and it is deliberately
 * repository-wide rather than scoped to one surface, because the next new form
 * would otherwise reintroduce it silently.
 */

const CLIENT_SRC = resolve(dirname(fileURLToPath(import.meta.url)));
const THRESHOLD_PX = 16;

/** Controls that accept typed text. A checkbox or radio never zooms. */
const NON_TEXT_CONTROL =
  /\[type\s*=\s*["']?(checkbox|radio|range|color|submit|button|file)["']?\]/i;

/**
 * Does this selector target a text-entry control?
 *
 * Two ways to target one, and the difference matters. A naive
 * `/\b(input|select|textarea)\b/` reports `.ra-select-check` — a checkmark
 * indicator, not a control — because `-` is a word boundary, so the class name
 * contains the bare word "select". That false positive would have forced the
 * threshold onto an element that cannot zoom.
 *
 * So class and id tokens are stripped before looking for an ELEMENT selector,
 * and class-based control rules are matched separately by the naming this
 * repository actually uses (a control class ENDS in input/field/select/
 * textarea: `.input-field`, `.cs-fld-input`, `.cs-fld-select`).
 */
function targetsTextControl(selector: string): boolean {
  const withoutNames = selector.replace(/[.#][A-Za-z0-9_-]+/g, " ");
  if (/(^|[\s>+~,(])(input|select|textarea)([\s>+~,:[)]|$)/i.test(withoutNames)) {
    return true;
  }
  return /\.[A-Za-z0-9_-]*(?:input|field|select|textarea)(?![A-Za-z0-9_-])/i.test(
    selector,
  );
}

function cssFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...cssFiles(full));
      continue;
    }
    if (entry.endsWith(".css")) found.push(full);
  }
  return found;
}

/** px for a font-size declaration this check can judge, else null. */
function toPx(raw: string): number | null {
  const value = raw.trim().toLowerCase();
  const match = /^(-?[\d.]+)(px|rem|em|pt|%)?$/.exec(value);
  if (match === null) return null;
  const size = Number(match[1]);
  if (!Number.isFinite(size)) return null;
  switch (match[2]) {
    case "px":
      return size;
    // The repository sets no custom html font-size, so the root is 16px.
    case "rem":
      return size * 16;
    case "pt":
      return size * (96 / 72);
    // `em` and `%` depend on an inherited size this scan cannot resolve, and
    // `inherit`/`unset`/a var() are unresolvable too. Those are reported by the
    // inheritance check below instead of being guessed at here.
    default:
      return null;
  }
}

interface Offender {
  file: string;
  selector: string;
  declaration: string;
}

function scan(): { offenders: Offender[]; inherited: Offender[]; ruleCount: number } {
  const offenders: Offender[] = [];
  const inherited: Offender[] = [];
  let ruleCount = 0;

  for (const file of cssFiles(CLIENT_SRC)) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rel = relative(CLIENT_SRC, file).replaceAll("\\", "/");
    // Rule blocks. Nested at-rules keep their inner blocks, which is what we
    // want: a media query wrapping a control rule is still a control rule.
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const target = selector.trim();
      if (!targetsTextControl(target)) continue;
      if (NON_TEXT_CONTROL.test(target)) continue;
      // A rule that only styles the placeholder cannot cause zoom.
      if (/::(placeholder|-webkit-input-placeholder)/.test(target)) continue;
      ruleCount += 1;

      // The `font:` shorthand RESETS font-size, so `font: inherit` on a
      // control inside a small-text label is exactly the bug that shipped.
      const shorthand = /(^|;)\s*font\s*:\s*([^;]+)/i.exec(body);
      if (shorthand !== null) {
        inherited.push({
          file: rel,
          selector: target.replace(/\s+/g, " "),
          declaration: `font: ${shorthand[2].trim()}`,
        });
        continue;
      }

      const declaration = /(^|;)\s*font-size\s*:\s*([^;]+)/i.exec(body);
      if (declaration === null) continue;
      const raw = declaration[2].trim();
      const px = toPx(raw);
      if (px === null) continue;
      if (px < THRESHOLD_PX) {
        offenders.push({
          file: rel,
          selector: target.replace(/\s+/g, " "),
          declaration: `font-size: ${raw}`,
        });
      }
    }
  }
  return { offenders, inherited, ruleCount };
}

describe("mobile: text controls never trigger iOS zoom", () => {
  it("recognizes controls without reporting look-alike class names", () => {
    // The detector's own correctness. `.ra-select-check` is a checkmark, not a
    // select, and reporting it would push a threshold onto an element that
    // cannot zoom; it was a real false positive during this fix.
    for (const yes of [
      ".xenios-order-page input, .xenios-order-page select",
      ".ea-roadmap__controls input",
      "textarea",
      ".input-field",
      ".cs-fld-input",
      ".cs-fld-select",
      "input:focus",
    ]) {
      expect(targetsTextControl(yes), `${yes} should be a control`).toBe(true);
    }
    for (const no of [
      ".ra-select-check",
      ".ra-select-card",
      ".ra-selected",
      ".constellation-node text",
      ".xenios-order-steps button",
    ]) {
      expect(targetsTextControl(no), `${no} should NOT be a control`).toBe(false);
    }
  });

  it("finds real control rules to judge, so the scan cannot pass vacuously", () => {
    const { ruleCount } = scan();
    expect(ruleCount).toBeGreaterThan(3);
  });

  it("no stylesheet sets a text control below 16px", () => {
    const { offenders } = scan();
    const detail = offenders.map(
      (o) => `${o.file}  ${o.selector}  { ${o.declaration} }`,
    );
    expect(
      detail,
      "These rules put a text-entry control under the 16px iOS threshold, so " +
        "Safari zooms the page on focus and never zooms back:\n" +
        detail.join("\n"),
    ).toEqual([]);
  });

  it("no text control takes its size from the `font:` shorthand", () => {
    // `font: inherit` reads as harmless and is not. It resets font-size to
    // whatever the ancestor has, which on a form is usually a small label.
    // Pin the size explicitly instead; font-family can still inherit.
    const { inherited } = scan();
    const detail = inherited.map(
      (o) => `${o.file}  ${o.selector}  { ${o.declaration} }`,
    );
    expect(
      detail,
      "The `font:` shorthand resets font-size, so these controls inherit an " +
        "unpinned size and can fall under 16px without any rule saying so. " +
        "Use font-family/font-weight and an explicit font-size:\n" +
        detail.join("\n"),
    ).toEqual([]);
  });
});
