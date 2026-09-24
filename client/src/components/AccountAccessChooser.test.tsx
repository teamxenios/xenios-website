// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AccountAccessChooser from "./AccountAccessChooser";

describe("AccountAccessChooser", () => {
  it("keeps sign-in, activation, ordering, Care, partner, business, and supplier intents distinct", () => {
    const html = renderToStaticMarkup(<AccountAccessChooser />);
    for (const href of [
      "/research/sign-in", "/research/activate", "/research/order", "/care/schedule",
      "/research/partners", "/research/organizations", "/research/supplier-access",
    ]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("sign in before submitting an application");
    expect(html).not.toContain("Create account");
  });
});
