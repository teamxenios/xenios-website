import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const assistedOrderRoot = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(assistedOrderRoot, "assisted-order.css"), "utf8");

describe("assisted-order pointer target source contracts", () => {
  it("keeps text controls at least 44px tall without resizing checkbox or radio controls", () => {
    expect(css).toMatch(
      /\.xenios-order-page input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), \.xenios-order-page select, \.xenios-order-page textarea \{ min-height: 44px; \}/u,
    );
    expect(css).toMatch(/\.xenios-order-check input \{ width: 18px; height: 18px;/u);
  });
});
