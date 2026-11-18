export const RAW_HOME_COPY = Object.freeze({
  "nav.health": "Xenios Health",
  "nav.infinity": "Infinity",
  "hero.eyebrow": "Built by Xenios Technologies",
  "hero.headline": "Built around life.",
  "hero.lede": "A more connected vision for health. More room for the work only you can do. Explore two distinct directions, each with a clear place to begin.",
  "hero.note": "The vision is bigger. The next step is clear.",
  "health.label": "01 / Health & everyday life",
  "health.status": "Private Early Access",
  "health.name": "Xenios Health",
  "health.transition": "Our next chapter: Tensa Health",
  "health.line": "Your health is more than a moment.",
  "health.vision.label": "The full vision",
  "health.vision.body": "We are building toward a proactive-health experience that connects qualified clinical care, appropriate diagnostics, nutrition, movement, coaching and ongoing support. A wider view of your health, with practical help for everyday life.",
  "health.vision.note": "This is the Tensa Health vision, not a statement that every service is available today.",
  "health.now.label": "Where we are now",
  "health.now.title": "Start with private Early Access.",
  "health.now.body": "Browse the catalog and send your selected items to our team for review. We confirm the applicable pathway, availability and next steps before anything moves forward.",
  "health.step1": "Enter with your access password.",
  "health.step2": "Complete the access and contact steps.",
  "health.step3": "Explore the catalog and request a review.",
  "health.cta": "Enter health Early Access",
  "health.boundary": "A request is not a confirmed purchase, prescription or shipment. Clinical services follow their own professional pathway.",
  "infinity.label": "02 / Intelligence & meaningful work",
  "infinity.status": "In development",
  "infinity.name": "Infinity",
  "infinity.transition": "Software for people who work with people",
  "infinity.line": "More context. More human.",
  "infinity.vision.label": "The full vision",
  "infinity.vision.body": "We are building an identity-aware workspace for health and performance professionals. Client context, planning, follow-through and AI assistance, designed around how you work and the people you support.",
  "infinity.vision.note": "Our design principle: AI prepares the work. The professional decides what reaches a client.",
  "infinity.now.label": "Where we are now",
  "infinity.now.title": "Help shape the founding experience.",
  "infinity.now.body": "Infinity is in development. The current founding-group waitlist is the place to register your interest. Applying does not provide immediate access to a finished product.",
  "infinity.step1": "Apply through the founding-group waitlist.",
  "infinity.step2": "Receive information about next steps.",
  "infinity.step3": "Join when invited to an opening group.",
  "infinity.cta": "Join the Infinity waitlist",
  "infinity.boundary": "The software and health pathways are distinct. Joining one does not enroll you in the other.",
  "builtby.label": "Built by",
  "builtby.title": "Xenios Technologies",
  "builtby.body": "We build around a simple belief: people deserve more room for what matters. Health and technology are distinct parts of that work, connected by the same human purpose.",
  "partners.label": "Build with us",
  "partners.body": "For practitioners, coaches, organizations and potential partners. Tell us what you want to make possible.",
  "partners.cta": "Start a conversation",
  "member.label": "Already connected?",
  "member.body": "Return to your existing Xenios account. Your account permissions continue to determine what you can access.",
  "member.cta": "Account sign in",
  "footer.legal": "© 2026 Xenios Technologies, Inc."
} as const);

export type HomeCopySlot = keyof typeof RAW_HOME_COPY;
export type HomeCopy = Readonly<Record<HomeCopySlot, string>>;

// The prototype includes the second headline sentence. The waitlist uses
// the existing founding-group destination wording for this private preview.
export const HOME_COPY_OVERRIDES = Object.freeze({
  "hero.headline": "Built around life. Designed for possibility.",
  "infinity.cta": "Join the founding-group waitlist",
} satisfies Partial<HomeCopy>);

export const HOME_COPY: HomeCopy = Object.freeze({ ...RAW_HOME_COPY, ...HOME_COPY_OVERRIDES });

export const HOME_HEADLINE = Object.freeze({
  opening: "Built around ",
  life: "life.",
  continuation: "Designed for ",
  possibility: "possibility.",
});

export const HOME_UI = Object.freeze({
  skip: "Skip to content",
  wordmark: "xenios",
  homeName: "xenios home",
  primaryNavigation: "Primary",
  mobileNavigation: "Mobile primary",
  menu: "Menu",
  about: "About",
  mobileAbout: "About Xenios",
  signIn: "Sign in",
  jumpNavigation: "Explore the two offerings",
  healthJump: "Health",
  infinityJump: "Infinity",
  offerings: "Two distinct directions",
  footerNavigation: "Footer",
  privacy: "Privacy",
  terms: "Terms",
  disclosures: "Disclosures",
  contact: "Contact",
});

export const HOME_SEO = Object.freeze({
  title: "xenios | Xenios Health and Infinity",
  description: "A more connected vision for health. More room for the work only you can do. Two distinct directions from Xenios Technologies, each with a clear place to begin.",
  path: "/",
  robots: "noindex, nofollow",
});
