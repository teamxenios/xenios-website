import { describe, expect, it } from "vitest";
import { CAREERS_ROLES } from "./careers";
import { buildJobPostingJsonLd, careerDetailRobots } from "./careers-schema";

function role(slug: string) {
  const result = CAREERS_ROLES.find((candidate) => candidate.slug === slug);
  if (!result) throw new Error(`missing career fixture: ${slug}`);
  return result;
}

describe("career structured data", () => {
  it("uses a real country only for a role explicitly constrained to the US", () => {
    expect(buildJobPostingJsonLd(role("founding-designer"))).toMatchObject({
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: {
        "@type": "Country",
        name: "United States",
      },
    });
  });

  it("does not invent a country for a location described only as remote", () => {
    const json = buildJobPostingJsonLd(role("founding-senior-ai-software-engineer"));
    expect(json).toMatchObject({ jobLocationType: "TELECOMMUTE" });
    expect(json).not.toHaveProperty("applicantLocationRequirements");
    expect(JSON.stringify(json)).not.toContain('"name":"Remote"');
  });

  it.each(["Remote, AUS", "Remote, RUS", "Remote, US-based"])(
    "does not treat a US substring as an approved country label: %s",
    (location) => {
      const json = buildJobPostingJsonLd({
        ...role("founding-senior-ai-software-engineer"),
        location,
      });
      expect(json).not.toHaveProperty("applicantLocationRequirements");
    },
  );

  it.each(["Remote, us", "Remote, USA", "Remote, United States"])(
    "accepts a normalized, exact approved US location label: %s",
    (location) => {
      expect(buildJobPostingJsonLd({ ...role("founding-designer"), location })).toMatchObject({
        applicantLocationRequirements: {
          "@type": "Country",
          name: "United States",
        },
      });
    },
  );

  it("keeps unknown career detail pages out of the index", () => {
    expect(careerDetailRobots(undefined)).toBe("noindex, nofollow");
    expect(careerDetailRobots(role("founding-designer"))).toBeUndefined();
  });
});
