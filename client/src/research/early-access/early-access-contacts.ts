/** Approved public destinations. Never includes a customer reference or session data. */
export const EARLY_ACCESS_CONTACTS = Object.freeze([
  { id: "website", label: "Xenios website", href: "https://xeniostechnology.com", group: "Explore" },
  { id: "early-access", label: "Early Access", href: "https://xeniostechnology.com/earlyaccess", group: "Explore" },
  { id: "booking", label: "Book the team", href: "https://calendly.com/team-xeniostechnology/30min", group: "Explore" },
  { id: "team", label: "Email the Xenios team", href: "mailto:team@xeniostechnology.com", group: "People" },
  { id: "instagram", label: "Xenios on Instagram", href: "https://www.instagram.com/officialxenios/", group: "Follow" },
  { id: "x", label: "Xenios on X", href: "https://x.com/xenioshealth", group: "Follow" },
  { id: "linkedin", label: "Xenios on LinkedIn", href: "https://www.linkedin.com/company/officialxenios", group: "Follow" },
  { id: "facebook", label: "Xenios on Facebook", href: "https://www.facebook.com/people/Xenios/61590788618749/", group: "Follow" },
  { id: "samuel-phone", label: "Call Samuel · 737-418-6381", href: "tel:+17374186381", group: "People" },
  { id: "samuel-email", label: "Email Samuel", href: "mailto:samuel@xeniostechnology.com", group: "People" },
  { id: "seth-phone", label: "Call Seth · 970-415-3774", href: "tel:+19704153774", group: "People" },
  { id: "seth-email", label: "Email Seth", href: "mailto:seth@xeniostechnology.com", group: "People" },
] as const);

export const EARLY_ACCESS_BOOKING = EARLY_ACCESS_CONTACTS[2];

/** Interests start a conversation, never a product recommendation or eligibility decision. */
export const EARLY_ACCESS_INTERESTS = Object.freeze([
  "Weight management", "Sleep", "Recovery", "Muscle and strength", "Skin and hair", "Energy",
] as const);

export function earlyAccessInterestHref(interest: typeof EARLY_ACCESS_INTERESTS[number]): string {
  return `${EARLY_ACCESS_CONTACTS[3].href}?subject=${encodeURIComponent(`Early Access conversation: ${interest}`)}`;
}
