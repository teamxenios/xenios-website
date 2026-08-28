import { careerDescription, type CareerRole } from "./careers";

const APPROVED_US_LOCATION_LABELS = new Set(["us", "usa", "united states"]);

function hasApprovedUsLocationLabel(location: string): boolean {
  return location
    .split(",")
    .some((label) => APPROVED_US_LOCATION_LABELS.has(label.trim().toLowerCase()));
}

export function careerDetailRobots(role: CareerRole | undefined): "noindex, nofollow" | undefined {
  return role ? undefined : "noindex, nofollow";
}

export function buildJobPostingJsonLd(role: CareerRole): Record<string, unknown> {
  const locationConstraint = hasApprovedUsLocationLabel(role.location)
    ? {
        applicantLocationRequirements: {
          "@type": "Country",
          name: "United States",
        },
      }
    : {};

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: role.title,
    description: careerDescription(role),
    datePosted: "2026-06-22",
    employmentType: "CONTRACTOR",
    hiringOrganization: {
      "@type": "Organization",
      name: "Xenios Technologies, Inc.",
      sameAs: "https://xeniostechnology.com",
    },
    ...locationConstraint,
    jobLocationType: "TELECOMMUTE",
  };
}
