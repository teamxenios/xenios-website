import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const researchRoot = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(researchRoot, "../index.css"), "utf8");
const applySource = readFileSync(resolve(researchRoot, "pages/Apply.tsx"), "utf8");
const shellsSource = readFileSync(resolve(researchRoot, "ui/shells.tsx"), "utf8");

describe("Research 44px pointer-target source contracts", () => {
  it("gives mobile shared subnavigation links a 44 by 44 CSS box", () => {
    expect(indexCss).toMatch(
      /@media \(max-width: 640px\) \{[\s\S]*?\.ra-subnav-link \{[^}]*min-width: 44px;[^}]*min-height: 44px;[^}]*display: inline-flex;[^}]*align-items: center;[^}]*justify-content: center;/,
    );
  });

  it("gives the standalone Apply documentation links a 44 by 44 target class", () => {
    expect(indexCss).toMatch(
      /\.ra-documentation-link \{[^}]*min-width: 44px;[^}]*min-height: 44px;[^}]*display: inline-flex;[^}]*align-items: center;/,
    );
    expect(applySource).toMatch(
      /href=\{ACCESS_ROUTES\.terms\} className="body-s ra-documentation-link"/,
    );
    expect(applySource).toMatch(
      /href=\{ACCESS_ROUTES\.privacy\} className="body-s ra-documentation-link"/,
    );
  });

  it("keeps every nonprotected admin-shell navigation target at least 44px tall", () => {
    expect(indexCss).toMatch(
      /\.ra-admin-top-link \{[^}]*min-width: 44px;[^}]*min-height: 44px;[^}]*display: inline-flex;[^}]*align-items: center;/,
    );
    expect(indexCss).toMatch(/\.ra-admin-nav-link \{\s*min-height: 44px;/);
    expect(shellsSource).toContain('className="wordmark ra-admin-top-link"');
    expect(shellsSource).toContain('className="body-s text-ink-mute ra-admin-top-link"');
  });
});
