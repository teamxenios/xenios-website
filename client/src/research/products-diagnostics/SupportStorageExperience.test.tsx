import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ResearchEducationCenter,
  StorageAndOrganization,
  SupportCenter,
} from "./SupportStorageExperience";

beforeAll(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("https://xeniostechnology.com/research/member/education"),
  });
});

describe("Website 3 support and education experiences", () => {
  it("uses the shared member shell for support, storage, and education", () => {
    const support = renderToStaticMarkup(
      <SupportCenter categories={["Products"]} />,
    );
    const storage = renderToStaticMarkup(
      <StorageAndOrganization accessories={["Temperature logger"]} />,
    );
    const education = renderToStaticMarkup(
      <ResearchEducationCenter
        boundary="No human-use instructions."
        topics={[
          {
            topicId: "coa",
            label: "How COAs work",
            summary: "Exact-lot documents only.",
            href: "/research/education/certificates",
          },
        ]}
        storageSources={[
          {
            sourceId: "lot",
            label: "Exact-lot quality document",
            status: "Lot-scoped source",
            summary: "Applies only to the verified lot.",
          },
        ]}
      />,
    );
    for (const html of [support, storage, education]) {
      expect(html).toContain("research-app");
      expect(html).toContain("ra-pagehead");
      expect(html).not.toMatch(/from-(?:blue|indigo)|shadow-(?:xl|2xl)/);
    }
    expect(education).toContain("Storage information sources");
    expect(education).toContain("No human-use instructions");
  });

  it("renders a truthful empty education state", () => {
    const html = renderToStaticMarkup(
      <ResearchEducationCenter
        boundary="No human-use instructions."
        topics={[]}
        storageSources={[]}
      />,
    );
    expect(html).toContain("No education topics are published yet.");
  });
});
