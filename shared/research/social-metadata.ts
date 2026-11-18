/** Constant share identities. No request URL, query, actor, selection or token is accepted. */
export const XENIOS_SOCIAL_ORIGIN = "https://xeniostechnology.com";
export const HOME_SOCIAL_IDENTITY = Object.freeze({
  title: "Tensa Health & Infinity",
  description: "Proactive, personalized health and software for health and wellness providers. Explore Tensa Health Early Access; Infinity is in development.",
  url: XENIOS_SOCIAL_ORIGIN,
  image: `${XENIOS_SOCIAL_ORIGIN}/og/xenios-home-full-vision-v3.png`,
  imageAlt: "Xenios: a more connected future for health. Tensa Health Early Access: peptides and supplements. Infinity: software for proactive health and wellness providers, in development.",
  imageWidth: 1200, imageHeight: 630, imageType: "image/png",
});
export const EARLY_ACCESS_SOCIAL_IDENTITY = Object.freeze({
  title: "Early Access: Peptides, Supplements & More",
  description: "Browse clinical options, laboratory research peptides, supplements and topicals. Submit selections for team review and next steps.",
  url: `${XENIOS_SOCIAL_ORIGIN}/earlyaccess`,
  image: `${XENIOS_SOCIAL_ORIGIN}/og/xenios-early-access-v1.png`,
  imageAlt: "Tensa Health Early Access: peptides, supplements and more. Browse the catalog and submit selections for team review and next steps.",
  imageWidth: 1200, imageHeight: 630, imageType: "image/png",
});
