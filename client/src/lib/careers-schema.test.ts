import { describe, expect, it } from "vitest";
import { CAREERS_ROLES, type CareerRole } from "./careers";
import { buildJobPostingJsonLd, careerDetailRobots } from "./careers-schema";

const fixture: CareerRole = {
  slug: "fixture",
  group: "open",
  type: "Fixture",
  title: "Fixture role",
  tagline: "Test only",
  summary: "A non-public test fixture.",
  location: "Remote",
  detail: [{ kind: "paragraph", text: "Test only." }],
};

describe("career structured data", () => {
  it("publishes no named roles in the first clarity release", () => {
    expect(CAREERS_ROLES).toEqual([]);
  });

  it("uses a real country only for an exact approved US label", () => {
    expect(buildJobPostingJsonLd({ ...fixture, location: "Remote, United States" })).toMatchObject({
      applicantLocationRequirements: { "@type": "Country", name: "United States" },
    });
    for (const location of ["Remote", "Remote, AUS", "Remote, RUS", "Remote, US-based"]) {
      expect(buildJobPostingJsonLd({ ...fixture, location })).not.toHaveProperty("applicantLocationRequirements");
    }
  });

  it("keeps unknown career detail pages out of the index", () => {
    expect(careerDetailRobots(undefined)).toBe("noindex, nofollow");
    expect(careerDetailRobots(fixture)).toBeUndefined();
  });
});
