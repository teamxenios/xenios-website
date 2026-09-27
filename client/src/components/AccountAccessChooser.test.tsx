// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AccountAccessChooser from "./AccountAccessChooser";

describe("AccountAccessChooser", () => {
  it("keeps sign-in, activation, products, Care, partner, practice, and supplier intents distinct", () => {
    const html = renderToStaticMarkup(<AccountAccessChooser />);
    for (const href of [
      "/sign-in", "/activate", "/products", "/care/schedule",
      "/partners", "/practices", "/suppliers#inquiry",
    ]) expect(html).toContain(`href="${href}"`);
    for (const label of ["Sign In", "Activate Account", "Explore Products", "Start Care", "Become a Partner", "For Practices", "Submit Inquiry"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("Create account");
    expect(html).not.toContain("Early Access");
  });
});
