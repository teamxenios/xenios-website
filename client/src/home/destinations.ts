import { HOME_COPY, HOME_UI } from "./content";

type VerifiedDestination = Readonly<{
  href: string;
  label: string;
  kind: "same-page" | "in-page-anchor" | "internal-same-zone" | "internal-cross-zone";
  readiness: "VERIFIED";
}>;

export const HOME_DESTINATIONS = Object.freeze({
  home: { href: "/", label: HOME_UI.homeName, kind: "same-page", readiness: "VERIFIED" },
  health: { href: "#health", label: HOME_COPY["nav.health"], kind: "in-page-anchor", readiness: "VERIFIED" },
  infinity: { href: "#infinity", label: HOME_COPY["nav.infinity"], kind: "in-page-anchor", readiness: "VERIFIED" },
  about: { href: "/about", label: HOME_UI.about, kind: "internal-same-zone", readiness: "VERIFIED" },
  signIn: { href: "/research/sign-in", label: HOME_UI.signIn, kind: "internal-cross-zone", readiness: "VERIFIED" },
  healthRequest: { href: "/earlyaccess", label: HOME_COPY["health.cta"], kind: "internal-cross-zone", readiness: "VERIFIED" },
  foundingGroup: { href: "/waitlist", label: HOME_COPY["infinity.cta"], kind: "internal-same-zone", readiness: "VERIFIED" },
  partners: { href: "/contact", label: HOME_COPY["partners.cta"], kind: "internal-same-zone", readiness: "VERIFIED" },
  account: { href: "/research/sign-in", label: HOME_COPY["member.cta"], kind: "internal-cross-zone", readiness: "VERIFIED" },
  privacy: { href: "/privacy", label: HOME_UI.privacy, kind: "internal-same-zone", readiness: "VERIFIED" },
  terms: { href: "/terms", label: HOME_UI.terms, kind: "internal-same-zone", readiness: "VERIFIED" },
  disclosures: { href: "/disclosures", label: HOME_UI.disclosures, kind: "internal-same-zone", readiness: "VERIFIED" },
  contact: { href: "/contact", label: HOME_UI.contact, kind: "internal-same-zone", readiness: "VERIFIED" },
} satisfies Record<string, VerifiedDestination>);

export type HomeDestinationId = keyof typeof HOME_DESTINATIONS;
export type HomeDestination = (typeof HOME_DESTINATIONS)[HomeDestinationId];

export const HOME_FOOTER_DESTINATIONS = ["about", "privacy", "terms", "disclosures", "contact"] as const;
