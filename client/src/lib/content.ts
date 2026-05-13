// Centralized verbatim copy from Spec v2.
// Six gradient presets: 01-dawn, 02-tide, 03-fieldwork, 04-meridian, 05-meadow, 06-horizon.

export type GradientPreset =
  | "grad-01-dawn"
  | "grad-02-tide"
  | "grad-03-fieldwork"
  | "grad-04-meridian"
  | "grad-05-meadow"
  | "grad-06-horizon";

export const contact = {
  email: "team@xeniostechnology.com",
  instagram: "https://www.instagram.com/officialxenios/",
  instagramHandle: "@officialxenios",
  linkedin: "https://www.linkedin.com/company/officialxenios",
  linkedinLabel: "Xenios on LinkedIn",
  location: "Austin, TX",
};

export const nav = {
  items: [
    { href: "/product", label: "product" },
    { href: "/manifesto", label: "manifesto" },
    { href: "/#ecosystem", label: "ecosystem" },
    { href: "/careers", label: "careers" },
    { href: "/about", label: "about" },
    { href: "/contact", label: "contact" },
  ],
  cta: "join the waitlist →",
};

export const ribbon = {
  prefix: "xenios is in stealth. early access opens in waves.",
  cta: "join the waitlist →",
  href: "/waitlist",
};

export const socials = [
  { label: "instagram → @officialxenios", url: contact.instagram },
  { label: "linkedin → /company/officialxenios", url: contact.linkedin },
];

export const footer = {
  tagline: "infrastructure for the next fifty years of human health.",
  sitemap: [
    { href: "/product", label: "product" },
    { href: "/manifesto", label: "manifesto" },
    { href: "/#ecosystem", label: "ecosystem" },
    { href: "/careers", label: "careers" },
    { href: "/about", label: "about" },
    { href: "/contact", label: "contact" },
    { href: "/investors", label: "investors" },
    { href: "/partners", label: "partners" },
    { href: "/faq", label: "faq" },
    { href: "/security", label: "security" },
  ],
  bottom: "© 2026 Xenios Technologies, Inc. — Austin, TX",
  disclaimer: "in stealth. not a medical device. not medical advice.",
};

// 18 audience tiles (built-for grid)
export const audienceTiles = [
  { num: "01", label: "Personal trainers & strength coaches", cap: "performance is data now", value: "personal_trainer" },
  { num: "02", label: "Nutritionists & registered dietitians", cap: "every meal, every signal", value: "nutritionist" },
  { num: "03", label: "GLP-1 & metabolic health coaches", cap: "protocols that personalize", value: "glp1_coach" },
  { num: "04", label: "Longevity & performance specialists", cap: "panels, paired with practice", value: "longevity" },
  { num: "05", label: "Functional medicine practitioners", cap: "root cause, fully connected", value: "functional_medicine" },
  { num: "06", label: "Health coaches & wellness pros", cap: "your protocols, your voice", value: "health_coach" },
  { num: "07", label: "RNs & RDs in cash-pay practice", cap: "clinical-grade, coach-friendly", value: "rn_rd_cashpay" },
  { num: "08", label: "Recovery, sleep & mind coaches", cap: "every modality, one substrate", value: "recovery_sleep_mind" },
  { num: "09", label: "Biohackers running 1:1 programs", cap: "n=1, at scale", value: "biohacker_1on1" },
  { num: "10", label: "Sports & team performance coaches", cap: "the locker room, connected", value: "sports_team" },
  { num: "11", label: "Physical therapists (cash-pay)", cap: "movement meets metrics", value: "physical_therapist" },
  { num: "12", label: "Chiropractors with wellness programs", cap: "beyond the adjustment", value: "chiropractor" },
  { num: "13", label: "Concierge medicine practitioners", cap: "care that anticipates", value: "concierge_md" },
  { num: "14", label: "Hormone & HRT specialists", cap: "signals, panels, plans", value: "hormone_hrt" },
  { num: "15", label: "Fertility & reproductive wellness", cap: "the long arc of health", value: "fertility" },
  { num: "16", label: "Mental performance & executive coaches", cap: "cognition is a signal", value: "mental_performance" },
  { num: "17", label: "Recovery & cold-plunge studio operators", cap: "throughput, with proof", value: "recovery_studio" },
  { num: "18", label: "Independent clinic operators", cap: "the practice as platform", value: "clinic_operator" },
] as const;

// Built-for grid — gradient rotation across the 18 tiles
const TILE_PRESETS: GradientPreset[] = [
  "grad-01-dawn", "grad-02-tide", "grad-03-fieldwork",
  "grad-04-meridian", "grad-05-meadow", "grad-06-horizon",
];
export const audienceTilesWithPresets = audienceTiles.map((t, i) => ({
  ...t,
  preset: TILE_PRESETS[i % TILE_PRESETS.length],
}));

// Constellation node labels (16 satellites)
export const ecosystemNodes = [
  "wearables",
  "continuous glucose",
  "lab panels",
  "longevity markers",
  "GLP-1 protocols",
  "sleep & HRV",
  "nutrition logs",
  "training load",
  "recovery data",
  "supplement stacks",
  "hormone panels",
  "mental performance",
  "calendars",
  "billing",
  "client comms",
  "referring physicians",
];

export const home = {
  hero: {
    eyebrow: "the proactive health era",
    h1: "The proactive health OS.",
    sub: "Connecting every dot in the proactive health ecosystem — wearables, labs, GLP-1, longevity panels, recovery, nutrition, training, and the practitioner who pulls it all together.",
    primaryCta: "join the waitlist →",
    secondaryCta: "read the manifesto →",
    counterSuffix: "practitioners on the waitlist · updated in real time",
  },
  thesis: {
    eyebrow: "THE THESIS",
    h2: "Coaching was never the bottleneck. Infrastructure was.",
    body: "The proactive health practitioner has the protocols, the science, and the relationships. What they don't have is a substrate that makes every signal talk to every other signal — and gives the hours back. Xenios is that substrate.",
    inlineLinkLabel: "see what xenios connects →",
    inlineLinkHref: "/#ecosystem",
  },
  ecosystem: {
    eyebrow: "THE ECOSYSTEM",
    h2: "Every signal. One practitioner.",
    body1: "The proactive health stack is the most exciting it has ever been — and the most fragmented it has ever been. Wearables don't talk to labs. Labs don't talk to GLP-1 protocols. Protocols don't talk to calendars. Calendars don't talk to outcomes. The practitioner is the integration layer, and the practitioner is exhausted.",
    body2: "Xenios is the connective tissue. Every dot, one substrate, one practitioner in command.",
    inlineLinkLabel: "meet the ecosystem partners →",
    inlineLinkHref: "/partners",
  },
  builtFor: {
    eyebrow: "BUILT FOR EVERY PRACTITIONER MOVING CARE UPSTREAM",
    h2: "If your practice is proactive, preventive, or performance-oriented — xenios is for you.",
    closing: "If you run a proactive, preventive, or performance-oriented practice, xenios was built for you.",
    inlineLinkLabel: "see the full picture in the manifesto →",
    inlineLinkHref: "/manifesto",
  },
  trust: {
    eyebrow: "WHO IS BUILDING THIS",
    body: "A founding team with prior healthcare-infrastructure exits totaling $710M+ — including FinDox and InstaMed — building the operating system the practitioner economy has been waiting for.",
    stats: ["$710M+ PRIOR EXITS", "AUSTIN HQ", "REMOTE TEAM", "PRE-SEED STEALTH"],
    inlineLinkLabel: "more about the team and the mission →",
    inlineLinkHref: "/about",
  },
  finalCta: {
    eyebrow: "THE WAITLIST",
    h2: "Every dot connected. Every hour returned. Every practitioner amplified. The proactive health era starts now.",
    counterPrefix: "practitioners. and counting.",
    primaryCta: "join the waitlist →",
    secondaryCta: "talk to the team →",
  },
};

export const manifesto = {
  eyebrow: "MANIFESTO",
  h1: "Care, finally upstream.",
  paragraphs: [
    "For a hundred years, \"healthcare\" has meant the system you go to after something has already gone wrong. The chart opens when the symptom arrives. The billing code requires a diagnosis. The infrastructure was built for reaction.",
    "We are alive in the first decade where that arrangement is breaking.",
    "A new class of practitioner has emerged — the personal trainer, the nutritionist, the GLP-1 coach, the longevity doctor, the functional medicine practitioner, the recovery operator, the concierge clinician, the executive performance coach — who does not wait for the symptom. They look at the wearable, the panel, the protocol, the program, the sleep, the meal, the mood. They move upstream. They are the most important workforce in the proactive health era.",
    "And they are running the most important work of their lives on spreadsheets, screenshots, group chats, and stitched-together tools that were never built to talk to each other.",
    "We think this is the largest mismatch in modern software.",
  ],
  bridge: "Xenios is the operating system for the proactive health practitioner.",
  thesisParas: [
    "The thesis is simple. Coaching was never the bottleneck. Infrastructure was. Every dot in the proactive health stack — wearables, labs, GLP-1 protocols, food logs, training programs, recovery data, mental health, longevity panels, calendars, billing, referrals, outcomes — runs on a different system. The practitioner is the integration layer. The practitioner is exhausted.",
    "We are building the substrate where every signal becomes one client profile, every protocol becomes infinitely personalizable, every hour of admin becomes an hour of practice, and every AI agent acts with the practitioner's voice, judgment, and protocols — never replacing the human, always extending them.",
  ],
  beliefsHeader: "We believe four things.",
  beliefs: [
    {
      number: "One.",
      body: "The leverage in healthcare is finally being handed to the practitioner doing the work, not the platform charging the rent. We are building software that hands it to them.",
    },
    {
      number: "Two.",
      body: "This decade will decide the shape of proactive care for the next fifty years. The infrastructure that gets adopted now — by the coaches, the clinicians, the operators — becomes the infrastructure of human health by 2075. We are building for the long arc.",
    },
    {
      number: "Three.",
      body: "AI is not the product. AI is the substrate. The product is the practitioner who, with AI as their second pair of hands, can hold more clients, write better protocols, and deliver outcomes a single human could never deliver alone. The agent acts in the practitioner's voice and judgment, or it has no place in this stack.",
    },
    {
      number: "Four.",
      body: "Connecting the dots is the work. The proactive health ecosystem is the most exciting it has ever been and the most fragmented it has ever been. Xenios is the connective tissue. Every signal, every tool, every human, one substrate.",
    },
  ],
  closingPull: [
    "Every dot connected. Every hour returned. Every practitioner amplified.",
    "The proactive health era starts now.",
    "We are building the operating system.",
    "Be on the list when it ships.",
  ],
  cta: {
    primary: "join the waitlist →",
    secondary: "see what xenios connects →",
  },
};

export const product = {
  eyebrow: "THE PRODUCT",
  h1: "The operating system, in five capabilities.",
  sub: "We are in stealth. We are not going to walk you through the whole roadmap. We will tell you what the practitioner gets in the first release — and why each piece exists.",
  inlineLinkLabel: "join the waitlist for early access →",
  capabilities: [
    {
      num: "01",
      eyebrow: "THE LIVING CLIENT PROFILE",
      title: "Every signal, unified.",
      body: [
        "Today the practitioner has the client's wearable in one app, their lab panel in a PDF, their training log in a spreadsheet, their food log in a screenshot, and their last conversation in a thread.",
        "Xenios collapses that into one living profile. Wearable streams, lab panels, longevity markers, GLP-1 protocols, nutrition, training load, recovery, sleep, hormones, mood — all in one substrate, updated in real time, fully searchable, fully exportable, fully under the practitioner's control.",
        "The profile is the dot the other dots connect to.",
      ],
      preset: "grad-01-dawn" as GradientPreset,
    },
    {
      num: "02",
      eyebrow: "THE PROTOCOL ENGINE",
      title: "Author once. Personalize infinitely.",
      body: [
        "Every great practitioner has a playbook — the protocols, programs, and progressions they would run on every client if there were twenty-four hours in a day and no admin.",
        "Xenios is where that playbook lives. Author once, in your own voice, with your own science. Personalize infinitely against the client's living profile. Update the protocol once and it propagates everywhere it lives. The playbook is yours. The leverage is finally yours.",
      ],
      preset: "grad-02-tide" as GradientPreset,
    },
    {
      num: "03",
      eyebrow: "THE COACH AGENT",
      title: "Acts with your voice. Defers to your judgment.",
      body: [
        "The agent layer is not a replacement for the practitioner. It is the practitioner's second pair of hands.",
        "The Coach Agent is trained on the practitioner's protocols, the client's living profile, and the practitioner's voice. It drafts the check-in. It surfaces the anomaly in last night's HRV. It writes the weekly note to the referring physician. It does not ship anything without the practitioner's sign-off.",
        "The human is in command. Always.",
      ],
      preset: "grad-03-fieldwork" as GradientPreset,
    },
    {
      num: "04",
      eyebrow: "THE ECOSYSTEM CONNECTOR",
      title: "The dots, finally talking.",
      body: [
        "Wearables. Continuous glucose. Lab panels. Longevity markers. GLP-1 protocols. Sleep and HRV. Nutrition logs. Training load. Recovery data. Supplement stacks. Hormone panels. Mental performance scores. Calendars. Billing. Client comms. Referring physicians.",
        "All of it, in one substrate. Read, write, route, reconcile. The practitioner stops being the integration layer.",
      ],
      preset: "grad-04-meridian" as GradientPreset,
      inlineLinkLabel: "see the ecosystem map →",
      inlineLinkHref: "/#ecosystem",
    },
    {
      num: "05",
      eyebrow: "THE OUTCOMES LAYER",
      title: "Proof, in the language clients and referring physicians understand.",
      body: [
        "Proactive care has always had a proof problem. Subjective wins are real but uncountable. Objective wins are countable but unevenly captured. Xenios closes the gap.",
        "The Outcomes Layer turns every signal into proof — for the client, for the referring physician, for the underwriter, for the next program cohort. The practitioner stops having to explain why what they do works. The data explains.",
      ],
      preset: "grad-05-meadow" as GradientPreset,
    },
  ],
  closer: "There is more. We will show you the rest when the door opens.",
  ctaPrimary: "join the waitlist →",
  ctaSecondary: "talk to the team →",
};

export const contactPage = {
  eyebrow: "CONTACT",
  h1: "One inbox. Every door.",
  sub: "We are a small team in stealth. To keep response times fast, every inbound runs through team@xeniostechnology.com — sorted by subject line. Pick the path that matches you and use the prefix in brackets.",
  cards: [
    {
      num: "01",
      title: "FOR PRACTITIONERS",
      body: "You run a proactive, preventive, or performance-oriented practice and want early access.",
      action: "Join the waitlist at /waitlist",
      note: "(Already on the list? Watch for your invite email.)",
      href: "/waitlist",
      hrefLabel: "join the waitlist →",
    },
    {
      num: "02",
      title: "FOR INVESTORS",
      body: "You run a fund whose thesis lives in proactive health, longevity, applied AI infrastructure, or vertical SaaS.",
      action: "Email team@xeniostechnology.com",
      subject: "[INVESTOR]",
      moreHref: "/investors",
      moreLabel: "more context →",
    },
    {
      num: "03",
      title: "FOR PRESS, INFLUENCERS & CONTENT CREATORS",
      body: "You write, podcast, or build audience in the proactive health space and want to talk to us — on the record or off.",
      action: "Email team@xeniostechnology.com",
      subjectMulti: ["[PRESS] for journalists", "[CREATOR] for influencers, podcasters, creators"],
    },
    {
      num: "04",
      title: "FOR INTEGRATION PARTNERS",
      body: "You build a wearable, a lab, a longevity panel, a CGM, a recovery device, a software tool, or any other signal in the ecosystem and want to plug into Xenios.",
      action: "Email team@xeniostechnology.com",
      subject: "[PARTNER]",
      moreHref: "/partners",
      moreLabel: "more context →",
    },
    {
      num: "05",
      title: "FOR CANDIDATES",
      body: "You want to build the operating system with us. All roles are remote, Austin preferred.",
      action: "See open roles at /careers",
      subject: "[ROLE — JOB TITLE]",
      moreHref: "/careers",
      moreLabel: "open roles →",
    },
    {
      num: "06",
      title: "GENERAL",
      body: "Anything else.",
      action: "team@xeniostechnology.com",
      subject: "[HELLO]",
    },
  ],
  formEyebrow: "OR JUST WRITE US",
  personaOptions: [
    { value: "practitioner", label: "a practitioner", prefix: "[PRACTITIONER]" },
    { value: "investor", label: "an investor", prefix: "[INVESTOR]" },
    { value: "journalist_creator", label: "a journalist or creator", prefix: "[PRESS]" },
    { value: "integration_partner", label: "a potential integration partner", prefix: "[PARTNER]" },
    { value: "candidate", label: "a candidate", prefix: "[ROLE — OPEN]" },
    { value: "other", label: "something else", prefix: "[HELLO]" },
  ],
  successTitle: "We have it.",
  successBody: "Thanks. We read every message at team@xeniostechnology.com. Expect a reply within two business days.",
  errorTitle: "Something broke on our side.",
  errorBody: "Write us directly at team@xeniostechnology.com and we'll pick it up there.",
  closer: {
    h: "While you wait —",
    body: "follow @officialxenios on Instagram and Xenios on LinkedIn. The vision shows up there first.",
  },
};

export const investors = {
  eyebrow: "INVESTORS",
  h1: "If your thesis lives where the puck is going, we should talk.",
  paragraphs: [
    "Xenios is a pre-seed company in stealth, headquartered in Austin, Texas. We are building the operating system for the proactive health practitioner — the connective tissue between every signal, tool, and human in the proactive health ecosystem.",
    "The founding team has prior healthcare-infrastructure exits totaling $710M+, including FinDox and InstaMed.",
    "We are not running a process. We are talking, carefully and quietly, to a small number of funds and operators whose conviction in proactive health, longevity, applied AI infrastructure, or vertical SaaS for the practitioner economy is already strong.",
    "If that's you, write us.",
  ],
  inboundEyebrow: "HOW TO REACH US",
  inboundLines: [
    "→ team@xeniostechnology.com",
    "→ Subject prefix: [INVESTOR]",
    "→ Please include: fund name, thesis fit in one paragraph, recent relevant investments.",
  ],
  closingNote: "We reply to every serious note.",
  whyWeExist: [
    "Coaching was never the bottleneck. Infrastructure was.",
    "This decade decides the shape of proactive care for the next fifty years.",
    "We intend to be the substrate it runs on.",
  ],
  closer: [
    { label: "read the manifesto →", href: "/manifesto" },
    { label: "see the product overview →", href: "/product" },
    { label: "meet the ecosystem →", href: "/#ecosystem" },
  ],
};

export const partners = {
  eyebrow: "PARTNERS",
  h1: "The ecosystem is the product.",
  sub: "Xenios is the connective tissue between every dot in proactive health. We can't be that alone — and we don't want to be. If you build a signal, a device, a panel, a tool, an audience, or a piece of content that lives in this space, there is a door for you here.",
  tracks: [
    {
      num: "01",
      title: "INTEGRATION PARTNERS",
      body: [
        "You build a wearable, a CGM, a lab panel, a longevity service, a recovery device, a training platform, a nutrition tool, a billing or scheduling system, or any other practitioner-adjacent product.",
        "We want your signal flowing through Xenios. Practitioners want it too. The substrate is open by design.",
      ],
      lines: [
        "→ team@xeniostechnology.com",
        "→ Subject prefix: [PARTNER — INTEGRATION]",
        "→ Please include: company, what you ship, an API or data-spec link if one exists.",
      ],
      preset: "grad-01-dawn" as GradientPreset,
      subject: "[PARTNER — INTEGRATION]",
    },
    {
      num: "02",
      title: "CREATORS, PODCASTERS & WRITERS",
      body: [
        "You build audience in proactive health, longevity, performance, metabolic health, recovery, or the coach economy. You want early access, an honest conversation with the founders, or a co-built piece of content.",
        "We treat creators as peers. The vision deserves to be seen.",
      ],
      lines: [
        "→ team@xeniostechnology.com",
        "→ Subject prefix: [CREATOR]",
        "→ Please include: your platform, your audience focus, what you'd like to build.",
      ],
      preset: "grad-03-fieldwork" as GradientPreset,
      subject: "[CREATOR]",
    },
    {
      num: "03",
      title: "INFLUENCERS & FRONT-OF-CAMERA PRACTITIONERS",
      body: [
        "You are a public-facing proactive health practitioner with a real practice and a real audience. You want to be one of the first to run your practice on Xenios and one of the first to tell the ecosystem about it.",
        "We have a small, hand-picked early cohort. It is not a discount code program. It is a partnership.",
      ],
      lines: [
        "→ team@xeniostechnology.com",
        "→ Subject prefix: [CREATOR — PRACTITIONER]",
      ],
      preset: "grad-05-meadow" as GradientPreset,
      subject: "[CREATOR — PRACTITIONER]",
    },
  ],
  closerBody: "We answer every serious note inside two business days. Follow @officialxenios for the public side of this build.",
  ctaPrimary: "join the practitioner waitlist →",
  ctaSecondary: "read the manifesto →",
};

export const waitlistPage = {
  eyebrow: "EARLY ACCESS",
  h1: "Be on the list when the proactive health OS ships.",
  sub: "We're opening early access in waves. The waitlist decides the order. Tell us a little about your practice. We do the rest.",
  counterSuffix: "practitioners on the waitlist · updated in real time",
  successTitle: "You're in.",
  successPositionLabel: "on the waitlist",
  successBody: "We just sent a confirmation to {email}. Two quick favors while you wait:",
  successLinks: [
    { label: "→ Follow @officialxenios on Instagram", href: contact.instagram },
    { label: "→ Follow Xenios on LinkedIn", href: contact.linkedin },
  ],
  successCloser: "The vision shows up there first.",
  trustBlock: [
    "Built by a team with prior healthcare-infrastructure exits totaling $710M+ — including FinDox and InstaMed.",
    "Headquartered in Austin, TX. Pre-seed. In stealth.",
    "We don't share your email. Ever. See /security.",
  ],
};

export const waitlistForm = {
  fields: {
    firstName: { label: "First name", placeholder: "First name" },
    lastName: { label: "Last name", placeholder: "Last name" },
    email: { label: "Email", placeholder: "you@practice.com" },
    practitionerType: { label: "I am a…", placeholder: "Choose one" },
    city: { label: "City", placeholder: "Austin" },
    country: { label: "Country", placeholder: "United States" },
    freeText: {
      label: "What you'd most want xenios to solve first (optional)",
      placeholder: "1–3 sentences",
    },
    howHeard: { label: "How did you hear about us? (optional)", placeholder: "Twitter, a friend, a podcast…" },
    consent: {
      label: "I'm okay receiving build updates from xenios at the email above.",
    },
  },
  submit: "join the waitlist →",
  submitting: "joining…",
  consentRequired: "Please agree to receive build updates to continue.",
  errorGeneric: "Something went wrong. Please try again.",
};

export const about = {
  eyebrow: "ABOUT",
  h1: "A small team. A long arc. One operating system.",
  intro: [
    "Xenios Technologies, Inc. is a pre-seed company headquartered in Austin, Texas. We are building the operating system for the proactive health practitioner — the connective tissue between every signal, tool, and human in the proactive health ecosystem.",
    "We are in stealth because the work deserves it. We will introduce the team in full when the product opens. Until then, here is what matters.",
  ],
  team: {
    h: "THE TEAM",
    body: "A founding team with prior healthcare-infrastructure exits totaling $710M+, including FinDox and InstaMed. Operators who have shipped into clinical workflows, payment rails, and the parts of the system where mistakes are not abstract. We have been here before. We know where the bodies are buried.",
  },
  beliefs: {
    h: "THE BELIEFS",
    items: [
      "Coaching was never the bottleneck. Infrastructure was.",
      "This decade decides the shape of proactive care for the next fifty years.",
      "Leverage belongs to the practitioner doing the work, not the platform charging the rent.",
      "AI agents act with the practitioner's voice and judgment, or they have no place in this stack.",
      "Connecting the dots is the work.",
    ],
  },
  company: {
    h: "THE COMPANY",
    body: "Headquartered in Austin, TX. Remote team. Hiring across engineering, product, design, and partnerships. All roles remote, Austin preferred.",
    links: [
      { label: "see open roles →", href: "/careers" },
      { label: "read the manifesto →", href: "/manifesto" },
      { label: "talk to the team →", href: "/contact" },
    ],
  },
};

export const careers = {
  eyebrow: "CAREERS",
  h1: "Build the operating system for the next fifty years of human health.",
  sub: "Five founding roles. All remote, Austin preferred. Every one of them ships into the first release. Every one of them earns equity in the substrate.",
  howWeWork: {
    h: "HOW WE WORK",
    items: [
      "Remote-first. Austin preferred for in-person sprint weeks.",
      "Founding equity for every founding hire.",
      "Small team. High trust. Few meetings. Long arcs.",
      "We hire for taste, judgment, and shipping muscle.",
      "We expect every founding hire to act like a founder, because they are one.",
    ],
  },
  rolesEyebrow: "OPEN ROLES — REMOTE / AUSTIN PREFERRED",
  roles: [
    {
      num: "01",
      eyebrow: "ENGINEERING",
      title: "Founding Senior Software Engineer",
      body: "Architect of the substrate. Owns the core platform: client profile, protocol engine, integrations, agent runtime. Comfortable in TypeScript, Postgres, distributed systems, and writing the boring code that has to be right.",
      location: "Remote, Austin preferred.",
      subject: "[ROLE — SENIOR SOFTWARE ENGINEER]",
      preset: "grad-04-meridian" as GradientPreset,
    },
    {
      num: "02",
      eyebrow: "ENGINEERING",
      title: "Founding Product Engineer",
      body: "Ships the surfaces practitioners actually touch. Builds, dogfoods, iterates. Lives where product, design, and engineering meet. Comfortable owning a feature end-to-end and shipping in days, not quarters.",
      location: "Remote, Austin preferred.",
      subject: "[ROLE — PRODUCT ENGINEER]",
      preset: "grad-01-dawn" as GradientPreset,
    },
    {
      num: "03",
      eyebrow: "AI / ML",
      title: "Founding AI / ML Engineer",
      body: "Owns the agent layer. Trains, evaluates, and ships the Coach Agent and the model infrastructure behind it. Comfortable with eval rigor, retrieval pipelines, and the line between \"demo\" and \"production\" for AI in regulated-adjacent workflows.",
      location: "Remote, Austin preferred.",
      subject: "[ROLE — AI/ML ENGINEER]",
      preset: "grad-02-tide" as GradientPreset,
    },
    {
      num: "04",
      eyebrow: "DESIGN",
      title: "Founding UI / UX Designer",
      body: "Shapes the substrate. Owns the visual system, the interaction language, and the practitioner's daily surface. Editorially literate. Comfortable in Figma and in prose. Reads design as argument.",
      location: "Remote, Austin preferred.",
      subject: "[ROLE — UI/UX DESIGNER]",
      preset: "grad-05-meadow" as GradientPreset,
    },
    {
      num: "05",
      eyebrow: "PARTNERSHIPS",
      title: "Founding Coach Partnerships Lead",
      body: "Owns the early cohort. Recruits, onboards, and grows with the first 100 practitioners on the platform. Already lives in the proactive health world — by background, by relationships, by instinct.",
      location: "Remote, Austin preferred.",
      subject: "[ROLE — COACH PARTNERSHIPS]",
      preset: "grad-03-fieldwork" as GradientPreset,
    },
  ],
  closer: {
    h: "Don't see your role but think you should be here?",
    body: "Write us anyway.",
    subject: "[ROLE — OPEN]",
  },
};

export const faq = {
  eyebrow: "FAQ",
  h1: "Honest answers.",
  items: [
    {
      q: "What is xenios?",
      a: "The operating system for the proactive health practitioner. The connective tissue between every signal, tool, and human in the proactive health ecosystem.",
    },
    {
      q: "Who is it for?",
      a: "Anyone running a proactive, preventive, or performance-oriented practice. Personal trainers and strength coaches. Nutritionists and registered dietitians. GLP-1 and metabolic health coaches. Longevity and performance specialists. Functional medicine practitioners. Health coaches and wellness pros. RNs and RDs in cash-pay practice. Recovery, sleep, and mind coaches. Biohackers running paid 1:1 programs. Sports and team performance coaches. Physical therapists in cash-pay practice. Chiropractors with wellness programs. Concierge medicine practitioners. Hormone and HRT specialists. Fertility and reproductive wellness coaches. Mental performance and executive coaches. Recovery and cold-plunge studio operators. Independent clinic operators. Anyone moving care upstream.",
    },
    {
      q: "When does it open?",
      a: "We're opening in waves. Position on the waitlist decides the order.",
    },
    {
      q: "Do I have to be in the U.S.?",
      a: "No. The waitlist is global. Early waves prioritize practitioners in North America for pilot reasons; international waves follow quickly.",
    },
    {
      q: "Is this a medical device?",
      a: "No. Xenios is software infrastructure for practitioners. It is not a medical device. It is not medical advice. It does not diagnose, treat, cure, or prevent any disease. Practitioners using Xenios remain responsible for the clinical decisions they make.",
    },
    {
      q: "Do you replace the coach with AI?",
      a: "No. We extend the coach with AI. The Coach Agent acts with the practitioner's voice, judgment, and protocols — and never ships anything without sign-off. The human is in command.",
    },
    {
      q: "Who is building this?",
      a: "A founding team with prior healthcare-infrastructure exits totaling $710M+, including FinDox and InstaMed. We will introduce the full team when the product opens.",
    },
    {
      q: "How do you handle my data and my clients' data?",
      a: "See /security. Short version: encryption in transit and at rest, least-privilege access internally, no sale of data ever, and a posture built for HIPAA-grade workflows where the practitioner operates in them.",
    },
    {
      q: "How do I join the waitlist?",
      a: "Right here: /waitlist.",
    },
    {
      q: "How do I reach the team?",
      a: "team@xeniostechnology.com. Subject-line conventions live at /contact.",
    },
    {
      q: "Is this company hiring?",
      a: "Yes. Five founding roles, all remote, Austin preferred. /careers.",
    },
    {
      q: "Are you raising?",
      a: "We're talking, quietly. /investors.",
    },
  ],
  closerLabel: "still have questions? talk to the team →",
  closerHref: "/contact",
};

export const security = {
  eyebrow: "SECURITY & DATA",
  h1: "Built for the most sensitive surface in human life.",
  intro: [
    "The proactive health practitioner sees more about their client than any other professional in that client's life. The substrate that holds that surface has to be worthy of it.",
    "We are building Xenios with that worthiness as a non-negotiable.",
  ],
  posture: {
    h: "OUR POSTURE",
    items: [
      "Encryption in transit (TLS 1.2+) and at rest (AES-256).",
      "Least-privilege access controls internally. Audit logs on every privileged action.",
      "Cloud infrastructure on hardened, SOC 2 Type II-aligned providers.",
      "Designed to operate in HIPAA-grade workflows where the practitioner operates in them. Practitioners running covered workflows can request a BAA in the early-access program.",
      "Backups and recovery designed for continuity, not theater.",
    ],
  },
  promises: {
    h: "OUR PROMISES",
    items: [
      "We do not sell your data. Ever. Not anonymized. Not aggregated. Not as a \"research partnership.\" Never.",
      "Practitioner-owned data stays practitioner-owned. Export is a first-class feature, not a retention trap.",
      "Clients have a path to access, correct, and delete their own data.",
    ],
  },
  limits: {
    h: "OUR LIMITS",
    body: "We are pre-seed. We are honest about where the formal certifications sit today and where they are going. We will publish a real trust-and-compliance page when the product opens. If you are an enterprise practitioner or operator with specific compliance needs, write us at team@xeniostechnology.com with subject prefix [SECURITY].",
  },
  closer: "Trust is a substrate too. We are building it the same way we are building the rest of this.",
};

export const privacy = {
  eyebrow: "PRIVACY",
  h1: "Privacy.",
  paragraphs: [
    "This boilerplate privacy statement covers the marketing site at xeniostechnology.com. We will publish a full data-protection policy when the product opens.",
    "We collect only the information you give us — primarily, your waitlist or contact form submission. We do not sell your data. We do not share your email with third parties. We use Resend to deliver email and Replit to host this site.",
    "We use first-party, privacy-respecting analytics only. We do not run third-party advertising trackers.",
    "You can request that we remove your email and any personal information we hold by writing to team@xeniostechnology.com.",
  ],
};

export const terms = {
  eyebrow: "TERMS",
  h1: "Terms of use.",
  paragraphs: [
    "This site is a marketing and waitlist surface for Xenios Technologies, Inc., a Delaware corporation headquartered in Austin, Texas. By using it you agree to use it lawfully and not to attempt to disrupt the service.",
    "Xenios is software infrastructure for practitioners. Nothing on this site is medical advice, a medical device, or a substitute for clinical judgment.",
    "We may update these terms as we approach product launch. The current version always lives at /terms. For questions, write team@xeniostechnology.com.",
  ],
};

export const content = {
  contact,
  nav,
  ribbon,
  socials,
  footer,
  audienceTiles: audienceTilesWithPresets,
  ecosystemNodes,
  home,
  manifesto,
  product,
  contactPage,
  investors,
  partners,
  waitlistPage,
  waitlistForm,
  about,
  careers,
  faq,
  security,
  privacy,
  terms,
};
