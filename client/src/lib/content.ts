// xenios v6 — canonical copy (lowercase wordmark, no period anywhere)
// Audience phrasing: "coaches, trainers, and practitioners".
// Public agent narrative: TWO surfaces only — "the xenios agent" + "the xenios client agent".
// No competitor names. No em dashes in any user-facing string.

export const SITE = {
  name: "xenios",
  legalName: "Xenios Technologies, Inc.",
  url: "https://xeniostechnology.com",
  email: "team@xeniostechnology.com",
  location: "Remote first. Austin preferred.",
  baselineCount: 550,
  positioning: "the AI-adjunct operations system for coaches, trainers, and practitioners.",
  poster: "Your business. Your clients. The AI that connects them.",
};

// 6-item nav per Part 3 §2 (Product, How it works, For coaches, For clients, Manifesto, Careers)
export const NAV_ITEMS = [
  { label: "product", href: "/product" },
  { label: "how it works", href: "/how-it-works" },
  { label: "for coaches", href: "/for-coaches" },
  { label: "for clients", href: "/for-clients" },
  { label: "manifesto", href: "/manifesto" },
  { label: "careers", href: "/careers" },
] as const;

export const SOCIALS = [
  { label: "Instagram, @officialxenios", url: "https://www.instagram.com/officialxenios/" },
  { label: "LinkedIn, /company/officialxenios", url: "https://www.linkedin.com/company/officialxenios" },
] as const;

// ── ROTATING HERO — exactly 16 entries (Part 3 §3) ────────────────────────────
export const ROTATING_ROLES = [
  "strength coaches",
  "personal trainers",
  "online coaches",
  "sports performance coaches",
  "nutritionists",
  "functional medicine doctors",
  "longevity clinicians",
  "GLP-1 coaches",
  "concierge physicians",
  "performance labs",
  "recovery studios",
  "hormone clinics",
  "peptide clinics",
  "biohacking clinics",
  "physical therapists",
  "chiropractors",
] as const;

// ── TWO SURFACES (Part 3 §6) ──────────────────────────────────────────────────
export const SURFACES = {
  coach: {
    eyebrow: "the xenios agent",
    title: "for you.",
    body: [
      "Drafts your messages in your voice. Builds your programs. Tracks your clients between sessions. Runs your check-ins. Handles your billing. Surfaces who needs you today and who can wait.",
      "It works because you taught it how you work.",
    ],
    cta: { label: "Coach surface", href: "/for-coaches" },
  },
  client: {
    eyebrow: "the xenios client agent",
    title: "for them.",
    body: [
      "A pocket coach that knows their program, their data, their goals, and the way you actually talk to them.",
      "Answers their questions. Holds them accountable. Teaches them the why. Hands the hard stuff back to you, every time.",
    ],
    cta: { label: "Client surface", href: "/for-clients" },
  },
};

// ── 25 ICPs (Part 10) ─────────────────────────────────────────────────────────
export interface IcpEntry {
  slug: string;
  value: string;       // schema enum value (snake_case)
  label: string;       // display label
  oneLiner: string;    // per-page H1 sub-line
  problem: string;     // 2-sentence problem
  bullets: string[];   // 3 category-specific workflow bullets
  replaces: string[];  // category-specific stack list
}

export const ICP_LIST: IcpEntry[] = [
  {
    slug: "strength-coaches", value: "strength_coaches", label: "Strength coaches",
    oneLiner: "The operating system for strength coaches who run programming, check-ins, and meet prep on five disconnected tools.",
    problem: "Strength coaches stitch programming apps, video review, intake forms, and billing into a workweek that has nothing to do with coaching. Every athlete is reassembled by hand.",
    bullets: [
      "Periodization and meet prep in your voice, versioned per athlete.",
      "Velocity, RPE, video, and wearable data on one record.",
      "Group, cohort, and 1:1 billing on one rail.",
    ],
    replaces: ["Programming app", "Video review tool", "Intake form tool", "Billing platform", "Spreadsheet glue"],
  },
  {
    slug: "personal-trainers", value: "personal_trainers", label: "Personal trainers",
    oneLiner: "The operating system for personal trainers who deserve more than a programming app and a billing tool stapled together.",
    problem: "Personal trainers run two-thirds of their week on coordination. The programming app does not talk to billing, intake, or messaging.",
    bullets: [
      "Build programs in your voice and assign in two clicks.",
      "Unified inbox across SMS, in-app, and email.",
      "Native subscriptions, packages, and one-offs.",
    ],
    replaces: ["Programming app", "White-label client app", "Billing tool", "Intake forms", "Notes doc"],
  },
  {
    slug: "sports-performance", value: "sports_performance", label: "Sports performance coaches",
    oneLiner: "The operating system for sports performance coaches across DIII, DI, and pro.",
    problem: "Performance staff run rosters of 80 to 200 athletes on tools designed for one. Force plate data lives one place, programming another, lab work nowhere.",
    bullets: [
      "Athlete records that hold programming, force plate, lab, and check-in history.",
      "Cohort programming with per-athlete branching.",
      "Coach-side agent for staff, athlete-side agent for the roster.",
    ],
    replaces: ["AMS", "Force plate platform", "Programming tool", "Messaging platform", "Spreadsheet roster"],
  },
  {
    slug: "functional-medicine", value: "functional_medicine", label: "Functional medicine",
    oneLiner: "Functional medicine practices without the legacy EMR drag.",
    problem: "Functional medicine clinics run protocols on a sick-care EMR that was never designed for proactive care. The practitioner is the integration layer.",
    bullets: [
      "Protocol library, lab review, and follow-through on one rail.",
      "HIPAA-ready posture, BAA on request.",
      "Patient-side agent that answers in your voice between visits.",
    ],
    replaces: ["Sick-care EMR", "Lab portal", "Patient portal", "Supplement dispensary", "Notes doc"],
  },
  {
    slug: "longevity-clinics", value: "longevity_clinics", label: "Longevity clinics",
    oneLiner: "The operations layer for longevity clinics that want to deliver care, not data entry.",
    problem: "Longevity clinics promise the most modern care on the oldest tools. Patient experience is concierge, but the back office is duct tape.",
    bullets: [
      "One patient record across labs, devices, programs, and visits.",
      "Outcomes layer that members and referring physicians both respect.",
      "Optional telemedicine for licensed practitioners.",
    ],
    replaces: ["Sick-care EMR", "Patient portal", "Membership billing", "Lab portals", "Concierge messaging tool"],
  },
  {
    slug: "concierge-medicine", value: "concierge_medicine", label: "Concierge medicine",
    oneLiner: "Concierge medicine with an agent on the practitioner side and a pocket physician on the patient side.",
    problem: "Concierge medicine sells access. The tools sell friction. Members get a phone number and a portal nobody loves.",
    bullets: [
      "Pocket coach for every member that knows their record.",
      "Visit notes drafted by the agent in your voice.",
      "Membership billing native to the operating system.",
    ],
    replaces: ["Sick-care EMR", "Membership platform", "Concierge messaging tool", "Lab portals", "Notes doc"],
  },
  {
    slug: "performance-labs", value: "performance_labs", label: "Performance labs",
    oneLiner: "The performance lab operating system. Testing, protocol, and follow-up on one rail.",
    problem: "Performance labs run a beautiful test and then hand the client a PDF and a hope. The follow-through stack is broken.",
    bullets: [
      "Test results, protocol, and follow-up on one record.",
      "Native scheduling, packages, and reorder flow.",
      "Client agent that keeps members on protocol between visits.",
    ],
    replaces: ["Lab portal", "Scheduling tool", "Membership billing", "Email follow-up", "Spreadsheet"],
  },
  {
    slug: "recovery-studios", value: "recovery_studios", label: "Recovery studios",
    oneLiner: "The recovery studio operations layer. Memberships, modalities, outcomes.",
    problem: "Recovery studios run on booking software built for hair salons. Modality history, outcomes, and member education live nowhere.",
    bullets: [
      "Member record across modalities, programs, and outcomes.",
      "Native memberships and class packages.",
      "Education and protocol guidance pushed by the client agent.",
    ],
    replaces: ["Booking platform", "Membership tool", "Email marketing", "Loyalty app", "Spreadsheet"],
  },
  {
    slug: "telemedicine-startups", value: "telemedicine_startups", label: "Telemedicine startups",
    oneLiner: "The proactive-care operations layer for telemedicine startups.",
    problem: "Telemedicine startups built for transactions are losing the proactive-care market. The visit is no longer the unit. The relationship is.",
    bullets: [
      "Async and live visits inside one operating system.",
      "Programs and protocols between visits, not just visit notes.",
      "Pocket coach on the patient side that holds the relationship.",
    ],
    replaces: ["Visit-only EMR", "Patient portal", "Email follow-up", "Notes doc", "Disconnected billing"],
  },
  {
    slug: "preventive-care", value: "preventive_care", label: "Preventive care",
    oneLiner: "The operations layer for preventive care, finally.",
    problem: "Preventive care has been promised for two decades and delivered by nobody. The tools were built for sickness.",
    bullets: [
      "One client record across programs, labs, and devices.",
      "Outcomes layer that proves the work.",
      "Native commerce for protocols, supplements, and packages.",
    ],
    replaces: ["Sick-care EMR", "Lab portal", "Patient portal", "Email follow-up", "Spreadsheet"],
  },
  {
    slug: "nutrition-companies", value: "nutrition_companies", label: "Nutrition companies",
    oneLiner: "The operations rail under modern nutrition companies.",
    problem: "Nutrition companies run programs on coaching apps that were never built for nutrition. Adherence and outcomes are guesswork.",
    bullets: [
      "Client record across food logs, labs, and programs.",
      "Native commerce for plans, packages, and meal services.",
      "Client agent for the daily food and supplement question.",
    ],
    replaces: ["Coaching app", "Food logging tool", "Billing platform", "Email follow-up", "Spreadsheet"],
  },
  {
    slug: "supplement-brands", value: "supplement_brands", label: "Supplement brands",
    oneLiner: "Supplement brands, with native practitioner distribution.",
    problem: "Supplement brands rely on third-party dispensaries and creator codes. The practitioner relationship is rented.",
    bullets: [
      "Native practitioner distribution with revenue share.",
      "Reorder, refill, and protocol routing inside the patient app.",
      "Outcomes layer that ties product to result.",
    ],
    replaces: ["Third-party dispensary", "Affiliate link tool", "Email marketing", "Reorder spreadsheet"],
  },
  {
    slug: "athlete-brands", value: "athlete_brands", label: "Athlete brands",
    oneLiner: "The athlete brand operating system. Programs, audience, commerce, outcomes.",
    problem: "Athlete brands stack a coaching app, a content tool, a commerce tool, and a link page. The audience is fragmented across all four.",
    bullets: [
      "Programs, content, and commerce on one rail.",
      "Pocket coach in the audience's pocket.",
      "Native subscriptions, packages, and merch.",
    ],
    replaces: ["Coaching app", "Content tool", "Commerce tool", "Link page", "Email platform"],
  },
  {
    slug: "corporate-wellness", value: "corporate_wellness", label: "Corporate wellness",
    oneLiner: "Corporate wellness that delivers outcomes, not engagement screenshots.",
    problem: "Corporate wellness vendors report engagement because they cannot report outcomes. The buyer is tired.",
    bullets: [
      "Cohort enrollment and employer reporting native.",
      "Outcomes layer at the population and individual level.",
      "Pocket coach for every employee, real coach behind it.",
    ],
    replaces: ["Engagement platform", "Health risk assessment tool", "Email reminders", "Wellness portal"],
  },
  {
    slug: "healthcare-systems", value: "healthcare_systems", label: "Healthcare systems",
    oneLiner: "The proactive health layer healthcare systems have been missing.",
    problem: "Healthcare systems own the EMR. They do not own the relationship between visits. The proactive layer has no rail.",
    bullets: [
      "Proactive layer that runs alongside the EMR, not against it.",
      "Care team agent and patient agent under system governance.",
      "Outcomes layer for population and value-based contracts.",
    ],
    replaces: ["Patient portal", "Population health bolt-on", "Disconnected wellness vendor", "Spreadsheet"],
  },
  {
    slug: "military", value: "military", label: "Military",
    oneLiner: "The operations system for military performance and tactical readiness programs.",
    problem: "Tactical performance programs run on civilian coaching tools. Readiness data and program data never meet.",
    bullets: [
      "Operator record across programming, readiness, recovery, and labs.",
      "Cohort and unit-level programming with per-operator branching.",
      "Reporting that respects chain of command.",
    ],
    replaces: ["Civilian coaching app", "Spreadsheet", "Disconnected readiness tool", "Email"],
  },
  {
    slug: "biohacking-clinics", value: "biohacking_clinics", label: "Biohacking clinics",
    oneLiner: "Biohacking clinics on one operating system, not seven.",
    problem: "Biohacking clinics run on the most stacks per square foot in the industry. Every modality has its own tool.",
    bullets: [
      "Member record across modalities, labs, programs, and outcomes.",
      "Native memberships and packages.",
      "Pocket coach that keeps members on protocol.",
    ],
    replaces: ["Booking platform", "Membership tool", "Lab portal", "Programming app", "Email follow-up"],
  },
  {
    slug: "physical-therapists", value: "physical_therapists", label: "Physical therapists",
    oneLiner: "Physical therapy without the EMR tax.",
    problem: "Physical therapy practices run on EMRs designed for billing codes, not for outcomes or patient experience.",
    bullets: [
      "Patient record across visits, programs, and home exercise adherence.",
      "Programs and check-ins between visits.",
      "Outcomes layer that proves the work.",
    ],
    replaces: ["Sick-care EMR", "Home exercise app", "Patient portal", "Billing tool", "Notes doc"],
  },
  {
    slug: "chiropractors", value: "chiropractors", label: "Chiropractors",
    oneLiner: "Chiropractic care with a real client app and real outcomes.",
    problem: "Chiropractors deliver hands-on care and then send patients home with a paper sheet. The relationship goes cold between visits.",
    bullets: [
      "Patient record across visits, programs, and recovery cues.",
      "Pocket coach that holds the in-between.",
      "Native memberships and packages.",
    ],
    replaces: ["Sick-care EMR", "Patient portal", "Email reminders", "Booking platform"],
  },
  {
    slug: "hormone-clinics", value: "hormone_clinics", label: "Hormone clinics",
    oneLiner: "Hormone clinics with protocol versioning, lab review, and patient follow-through native.",
    problem: "Hormone clinics run protocols on tools that cannot version a protocol or remember a lab cycle.",
    bullets: [
      "Versioned protocols per patient, with lab review cadence built in.",
      "Patient agent that answers protocol questions in your voice.",
      "Optional telemedicine for licensed practitioners.",
    ],
    replaces: ["Sick-care EMR", "Lab portal", "Patient portal", "Pharmacy email", "Spreadsheet"],
  },
  {
    slug: "peptide-clinics", value: "peptide_clinics", label: "Peptide clinics",
    oneLiner: "Peptide clinics with compliance, protocol, and patient engagement on one rail.",
    problem: "Peptide clinics live in a regulatory grey zone with patients asking for clarity. The tools were built for neither.",
    bullets: [
      "Versioned protocols with scope-aware guardrails.",
      "Patient agent that holds the protocol between visits.",
      "Compliance posture and audit trail built in.",
    ],
    replaces: ["Sick-care EMR", "Patient portal", "Pharmacy email", "Compliance spreadsheet"],
  },
  {
    slug: "self-insured-employers", value: "self_insured_employers", label: "Self-insured employers",
    oneLiner: "The proactive health operating layer for self-insured employers.",
    problem: "Self-insured employers pay for sick care and hope for prevention. The proactive layer has no operating system.",
    bullets: [
      "Cohort enrollment, employer reporting, and population outcomes.",
      "Pocket coach for every employee, real coach behind it.",
      "Direct contract with the proactive health stack you choose.",
    ],
    replaces: ["Carrier wellness bolt-on", "Engagement platform", "Email reminders", "Spreadsheet"],
  },
  {
    slug: "elite-athletes", value: "elite_athletes", label: "Elite athletes",
    oneLiner: "The operating system for elite athletes and the teams around them.",
    problem: "Elite athletes carry six providers in their phone. Nobody talks. The athlete is the integration layer.",
    bullets: [
      "One athlete record that the whole team writes into.",
      "Agent-side coordination across coach, PT, nutritionist, and physician.",
      "Outcomes layer for performance and longevity.",
    ],
    replaces: ["Programming app", "Recovery app", "Nutrition app", "Notes doc", "Group chat"],
  },
  {
    slug: "creators", value: "creators", label: "Creators",
    oneLiner: "The operating system for health creators who want a real coaching business, not a link page.",
    problem: "Health creators sell access to their brain through a link page. The audience is large, the relationship is shallow.",
    bullets: [
      "Programs, content, and pocket coach for your audience.",
      "Native subscriptions, packages, and one-offs.",
      "Outcomes layer that proves the work.",
    ],
    replaces: ["Link page", "Email platform", "Coaching app", "Content tool", "Affiliate spreadsheet"],
  },
  {
    slug: "sports-agencies", value: "sports_agencies", label: "Sports agencies",
    oneLiner: "The performance, recovery, and care operations layer for sports agencies.",
    problem: "Sports agencies coordinate the athlete's career. Nobody coordinates the athlete's body. The provider stack is invisible to the agency.",
    bullets: [
      "Athlete record across coach, PT, nutritionist, and physician.",
      "Agent-side coordination so the team actually talks.",
      "Reporting the agency can use without breaking trust.",
    ],
    replaces: ["Group chat", "Spreadsheet", "Disconnected provider tools", "Email follow-up"],
  },
];

export const ICP_BY_SLUG: Record<string, IcpEntry> = Object.fromEntries(ICP_LIST.map((i) => [i.slug, i]));
export const ICP_BY_VALUE: Record<string, IcpEntry> = Object.fromEntries(ICP_LIST.map((i) => [i.value, i]));

// Backwards-compat alias used by existing components (WaitlistForm, IcpPage)
export const PRACTITIONER_TILES = ICP_LIST.map((i) => ({ slug: i.slug, value: i.value, label: i.label }));

// ── ECOSYSTEM (Part 9 — 18 categories) ────────────────────────────────────────
export const ECOSYSTEM_CATEGORIES = [
  "Wearables and continuous biosensors",
  "Diagnostic labs and at-home testing",
  "GLP-1 and metabolic care",
  "Peptides and longevity protocols",
  "Recovery technology",
  "Performance equipment",
  "Nutrition and meal services",
  "Supplements",
  "Education and content",
  "Coaching and training platforms",
  "EHR / EMR adjacency",
  "Payments and identity",
  "Longevity clinics and labs",
  "Sport science and performance labs",
  "Clinical decision support",
  "Hormone and endocrine",
  "Mental performance and sleep",
  "Connected devices and at-home diagnostics",
];

// ── PRODUCT capabilities (Part 4) ─────────────────────────────────────────────
export const CAPABILITIES = [
  { name: "Programs and protocols", body: "Build, version, and assign programs. Use your library or ours. The agent adapts blocks to each client and explains the why in your voice." },
  { name: "Intake and onboarding", body: "Smart intake that fills itself from connected devices, labs, and prior history. Clients land ready to work." },
  { name: "Check-ins", body: "Daily, weekly, or on a cadence you define. Agent drafts the reply, you approve, client gets it in your voice." },
  { name: "Messaging", body: "Unified inbox across SMS, in-app, and email. Agent triages, drafts, and flags clinical or out-of-scope items for you." },
  { name: "Education", body: "Auto-curated lessons and content tuned to each client's level, goals, and devices. Your voice, your method." },
  { name: "Billing and commerce", body: "Subscriptions, packages, one-offs, gift cards, affiliate splits, supplement and equipment storefront, all native." },
  { name: "Network and referrals", body: "Refer between coaches, trainers, and practitioners on the network. Bring your roster. Grow without leaving." },
  { name: "Outcomes", body: "Track adherence, progress, retention, and what is actually moving for each client. Report on the work, not the noise." },
  { name: "Care delivery (post-launch)", body: "Optional telemedicine layer for licensed practitioners who want to deliver care inside xenios." },
];

// ── REPLACEMENT NARRATIVE (Part 3 §5) ─────────────────────────────────────────
export const REPLACES = {
  oldLabels: [
    "Programming app",
    "Intake form tool",
    "White-label client app",
    "Messaging platform",
    "Billing platform",
    "EMR or notes tool",
    "Content tool",
    "Affiliate link tool",
  ],
  newLabels: [
    "One inbox",
    "One client record",
    "One agent that drafts in your voice",
    "One pocket coach on the client's phone",
    "One billing rail",
    "One outcomes layer",
  ],
};

// ── CAREERS (Part 12 — 5 founding roles, NO advisor) ──────────────────────────
export const CAREERS_ROLES = [
  {
    slug: "founding-senior-software-engineer",
    title: "Founding Senior Software Engineer",
    subjectPrefix: "Careers: Founding Senior Software Engineer",
    summary: "Owns the core platform. Go services, Postgres, the data model, and the API surface every other surface calls into.",
    role: "You will be the second engineer on the platform. You own the core services, the data model, and the API surface that the xenios agent runtime and every client surface call into. You write Go services, Postgres schemas, and TypeScript when the surface meets the user. You set the patterns the rest of the team will inherit.",
    first90: [
      "Stand up the production-grade client record service. One record per client, written by both surfaces, queryable by the agent.",
      "Ship the unified inbox backend (SMS, in-app, email) with idempotent message ingestion and a clean event model.",
      "Build the programs and protocols service. Version-aware, branchable, assignable per client, observable by the agent.",
      "Define our service boundaries, our deploy pipeline, our observability defaults, and our on-call rotation.",
      "Pair with the AI / ML Platform Engineer on the agent runtime's read and write paths.",
    ],
    youBring: [
      "6+ years shipping production backends. Go preferred. TypeScript or Rust experience is welcome.",
      "Deep Postgres. Schema design, migrations, query plans, the boring parts done right.",
      "Familiarity with agentic LLM patterns is a plus. You build the platform the model is sitting on.",
      "Experience at a 2 to 20 person startup or a small platform team inside a larger company.",
      "HIPAA or any regulated data environment experience is a strong plus.",
    ],
    success: "The first 50 coaches, trainers, and practitioners are running their businesses on the platform you built. The agent is reading and writing through your APIs. Nothing is on fire. The next engineer wants to work on the codebase you set up.",
  },
  {
    slug: "founding-product-engineer",
    title: "Founding Product Engineer",
    subjectPrefix: "Careers: Founding Product Engineer",
    summary: "Lives where design and engineering meet. Ships the surfaces coaches, trainers, practitioners, and their clients touch every day.",
    role: "You live where design and engineering meet. You ship the surfaces that coaches, trainers, and practitioners touch every day. You also ship the client surface that their clients, athletes, and patients touch. You move fast in TypeScript, Next.js, and React, and you make the product feel inevitable.",
    first90: [
      "Ship the v1 coach inbox, the v1 client record view, and the v1 client app onboarding flow.",
      "Partner with the UI / UX Designer to take the visual system from spec to shipping product, with no quality loss.",
      "Wire the xenios agent and the xenios client agent into the surfaces so the AI is felt, not narrated.",
      "Build the founder-direct feedback loop. The first 50 coaches, trainers, and practitioners tell us what is wrong and you make it right in the same week.",
    ],
    youBring: [
      "4+ years shipping production product surfaces.",
      "Strong TypeScript, React, and Next.js App Router.",
      "Real opinions on UX. You read the design spec and find three things to improve before lunch.",
      "Comfortable with Framer Motion, accessibility, and the small details that make a product feel finished.",
      "Bonus: prior work on coaching, fitness, healthcare, or any multi-surface relationship-driven product.",
    ],
    success: "The first time a coach opens xenios, they say \"this is what I wish the other tool had been.\" The first time their client opens the app, they keep it open. You shipped that.",
  },
  {
    slug: "founding-ai-platform-engineer",
    title: "Founding AI / ML Platform Engineer",
    subjectPrefix: "Careers: Founding AI Platform Engineer",
    summary: "Owns the xenios agent runtime. Eval rigor, guardrails, voice corpus pipeline, autonomy controls, safety posture.",
    role: "You own the xenios agent runtime. Both surfaces (the xenios agent for the coach, trainer, or practitioner, and the xenios client agent for the client, athlete, or patient) call your code. You own the eval rigor, the guardrails, the voice corpus pipeline, the autonomy controls, and the safety posture. You are not building a chatbot. You are building the substrate of a regulated, voice-faithful, accountability-aware AI that sits between a practitioner and their client. The bar is high.",
    first90: [
      "Stand up the agent runtime. Tool calling, memory, voice corpus retrieval, autonomy levels, escalation paths.",
      "Build the voice corpus pipeline. Ingest a coach's prior messages, programs, and content. Produce a faithful, measurable voice model. Continuously refine from edits.",
      "Build the eval harness. Voice fidelity, factual accuracy, scope adherence, safety, escalation correctness. Per-coach, per-client, per-workflow.",
      "Build the guardrails. No clinical opinion outside scope. No impersonation. No off-method advice. Hard rails.",
      "Pair with the Senior Software Engineer on every read and write the agent does into the platform.",
    ],
    youBring: [
      "4+ years building real ML or LLM systems in production.",
      "Hands-on with current agentic patterns (tool use, planning, memory, retrieval, multi-turn evals).",
      "Strong opinions on eval rigor. You do not ship a prompt without a measurement.",
      "Comfortable with Python and TypeScript. Comfortable on the infrastructure side, not just the notebook side.",
      "Bonus: prior work in healthcare, coaching, voice cloning, or any domain where impersonation has consequences.",
    ],
    success: "Coaches, trainers, and practitioners on xenios say the agent sounds like them. The eval scores prove it. The guardrails hold. No client ever receives a message the coach would not have approved. The autonomy dial works as advertised.",
  },
  {
    slug: "founding-ui-ux-designer",
    title: "Founding UI / UX Designer",
    subjectPrefix: "Careers: Founding UI / UX Designer",
    summary: "Defines the xenios visual system. Owns the coach surface and the client surface end to end.",
    role: "You define the xenios visual system. You own the coach surface and the client surface. You make the AI-adjunct operations system feel like infrastructure, not like another wellness app. The wordmark is xenios, lowercase, no period. The palette is cream and ink with restrained accents. The typography is heavy geometric sans. Everything else is yours to build.",
    first90: [
      "Ship the v1 design system. Tokens, type scale, component library, motion language, accessibility floor.",
      "Design the v1 coach inbox, client record view, programs and protocols editor, and outcomes layer.",
      "Design the v1 client app: pocket coach, today's session, check-ins, messaging, education.",
      "Define the visual handling of the xenios agent and the xenios client agent across both surfaces. The AI should feel like a calm presence, not a pop-up.",
      "Set the bar on visual quality. No blank boxes. No invisible text. No empty states. Every slot is a real composition.",
    ],
    youBring: [
      "5+ years designing complex, multi-surface product systems.",
      "A portfolio that shows opinionated visual systems, not just template work.",
      "Native fluency in Figma. Comfort with motion (Framer Motion, Rive, or After Effects) is a strong plus.",
      "Strong accessibility chops. WCAG AA is the floor, not the ceiling.",
      "Bonus: prior work in coaching, healthcare, fitness, or consumer products with a daily-use loop.",
    ],
    success: "A coach opens xenios and feels like the product was made for them. A client opens the app and stops checking the other fitness app. An investor takes one look at the homepage and understands the category in ten seconds. You shipped that.",
  },
  {
    slug: "founding-coach-partnerships-lead",
    title: "Founding Coach Partnerships Lead",
    subjectPrefix: "Careers: Founding Coach Partnerships Lead",
    summary: "Recruits, onboards, and serves the first 100 coaches, trainers, and practitioners on xenios.",
    role: "You recruit, onboard, and serve the first 100 coaches, trainers, and practitioners on xenios. You are the human at the founder line who makes sure the founding cohort feels like a founding cohort, not a beta list. You know this industry. You know the difference between a power user on a legacy coaching app, a strength and conditioning director, a functional medicine clinic operator, and a longevity physician. You know who actually moves the needle and who just has a podcast.",
    first90: [
      "Recruit the first 100 founding-cohort coaches, trainers, and practitioners across our priority ICPs.",
      "Run the founder-direct onboarding for each one. Voice corpus interview. Stack audit. First-30-day plan.",
      "Build the feedback loop into the product team. Every blocker, every miss, every win, into the same room every week.",
      "Stand up the referral and partnership motion. Brand partners, coaching networks, professional associations.",
      "Be the human face of the company to the audience the company is built for.",
    ],
    youBring: [
      "5+ years in coaching, training, performance, or proactive health. Operator credibility, not just sales credibility.",
      "Existing relationships across at least three of our ICPs.",
      "Comfortable on the phone, on Zoom, on Loom, and in person.",
      "Can write a clean, voice-faithful email. Can host a founders-and-coaches dinner. Can read a P&L.",
      "Bonus: previous experience launching a category-defining product into a coach, trainer, or practitioner audience.",
    ],
    success: "100 founding-cohort accounts onboarded. 80%+ active in week four. A waitlist that no longer needs paid acquisition. A product team that hears the customer every Monday.",
  },
] as const;

// ── CONTACT (Part 11 /contact) ────────────────────────────────────────────────
export const CONTACT_PREFIXES = [
  { prefix: "Waitlist", desc: "General waitlist questions" },
  { prefix: "Founding Cohort", desc: "Onboarding and early-access" },
  { prefix: "Partnership", desc: "Brand or ecosystem partnership" },
  { prefix: "Ecosystem", desc: "Integration and API" },
  { prefix: "Press", desc: "Press, media, podcast" },
  { prefix: "Investor", desc: "Investor inquiries" },
  { prefix: "Careers: [role]", desc: "Job applications" },
  { prefix: "Security", desc: "Security and disclosure" },
  { prefix: "Compliance", desc: "BAA, SOC 2, legal" },
  { prefix: "Telemedicine", desc: "Care delivery partnerships" },
];

// Personas used by ContactForm — drives subject prefix on server side
export const CONTACT_PERSONAS = [
  { value: "practitioner", label: "Coach, trainer, or practitioner" },
  { value: "investor", label: "Investor" },
  { value: "journalist_creator", label: "Press, media, or creator" },
  { value: "integration_partner", label: "Brand or ecosystem partner" },
  { value: "enterprise", label: "Enterprise / health system" },
  { value: "candidate", label: "Job candidate" },
  { value: "other", label: "Something else" },
];

// ── SHELL COPY (Navbar, Ribbon, Footer, Forms) ────────────────────────────────
export const content = {
  nav: {
    items: NAV_ITEMS,
    cta: "Join waitlist",
  },
  ribbon: {
    prefix: "Founding cohort is open. 550+ coaches, trainers, and practitioners on the waitlist.",
    cta: "Join",
    href: "/waitlist",
  },
  footer: {
    tagline: "An AI workspace for health and performance professionals.",
    location: SITE.location,
    columns: {
      product: [
        { label: "Product", href: "/product" },
        { label: "How it works", href: "/how-it-works" },
        { label: "For coaches", href: "/for-coaches" },
        { label: "For clients", href: "/for-clients" },
        { label: "Telemedicine", href: "/telemedicine" },
        { label: "Storefront", href: "/storefront" },
        { label: "Network", href: "/network" },
        { label: "Ecosystem", href: "/ecosystem" },
        { label: "For practitioners", href: "/for-practitioners" },
      ],
      company: [
        { label: "Manifesto", href: "/manifesto" },
        { label: "About", href: "/about" },
        { label: "Careers", href: "/careers" },
        { label: "Press", href: "/press" },
        { label: "Contact", href: "/contact" },
      ],
      resources: [
        { label: "Security", href: "/security" },
        { label: "Compliance", href: "/compliance" },
        { label: "Investors", href: "/investors" },
        { label: "llms.txt", href: "/llms.txt" },
      ],
      legal: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ],
    },
    copyright: "© 2026 Xenios Technologies, Inc.",
  },
  contact: {
    email: SITE.email,
  },
  socials: SOCIALS,
  waitlistForm: {
    submit: "Join the waitlist",
    submitting: "Joining...",
    consentRequired: "Please confirm you understand we will email you about xenios.",
    errorGeneric: "Something broke on our side. Try again in a moment.",
    fields: {
      firstName: { label: "First name", placeholder: "First name" },
      lastName: { label: "Last name", placeholder: "Last name" },
      email: { label: "Email", placeholder: "you@yourpractice.com" },
      practitionerType: { label: "Role / category", placeholder: "Pick the closest fit" },
      city: { label: "City", placeholder: "City" },
      country: { label: "Country", placeholder: "Country" },
      freeText: { label: "What would you replace?", placeholder: "Optional. The disconnected stack you would retire if xenios shipped tomorrow." },
      howHeard: { label: "How did you hear about xenios?", placeholder: "Optional" },
      consent: { label: "I understand xenios will email me about the founding cohort and the waitlist. I can opt out any time." },
    },
  },
  waitlistPage: {
    headline: "JOIN THE WAITLIST",
    sub: "550+ coaches, trainers, and practitioners are already in line.",
    youWillGet: [
      "Priority onboarding when the founding cohort opens.",
      "Founder-direct support during onboarding.",
      "Founding pricing, locked in for the life of your account.",
      "A seat in the room when we ship.",
    ],
    trustBlock: [
      "We send the email you would want to receive. Nothing else.",
      "We do not sell your information. We do not train third-party models on it.",
      "By joining the waitlist you agree to receive xenios product updates. Opt out at any time.",
    ],
  },
};

export type Content = typeof content;

// ── PER-PAGE SEO META ─────────────────────────────────────────────────────────
export const PAGES = {
  home: { title: "xenios, the AI-adjunct operations system", description: "The AI-adjunct operations system for coaches, trainers, and practitioners. One inbox, one client record, one agent that drafts in your voice, one pocket coach for your clients.", path: "/" },
  product: { title: "Product, xenios", description: "One operating system for the work you actually do: programs, intake, check-ins, messaging, education, billing, network, outcomes, care.", path: "/product" },
  howItWorks: { title: "How it works, xenios", description: "Connect your stack. Teach your voice. Approve the first batch. Move the autonomy dial. The xenios agent runs the back office. The xenios client agent runs the in-between.", path: "/how-it-works" },
  forCoaches: { title: "For coaches, xenios", description: "The xenios agent is the operator you needed. Drafts your messages, builds your programs, runs your check-ins, handles your billing, in your voice.", path: "/for-coaches" },
  forClients: { title: "For clients, xenios", description: "The xenios client agent is a pocket coach that knows your program, your data, your goals, and the way your coach actually talks to you.", path: "/for-clients" },
  telemedicine: { title: "Telemedicine, xenios", description: "Optional care delivery layer for licensed practitioners. Async, live, and in-between, on the same operating system that runs the rest of the practice.", path: "/telemedicine" },
  storefront: { title: "Storefront, xenios", description: "Native subscriptions, packages, one-offs, supplements, equipment, and gift cards. The commerce rail your practice deserves.", path: "/storefront" },
  network: { title: "Network, xenios", description: "Refer between coaches, trainers, and practitioners on the network. Bring your roster. Grow without leaving.", path: "/network" },
  ecosystem: { title: "Ecosystem, xenios", description: "Eighteen categories of partners and integrations across the proactive health stack. Wearables, labs, recovery, nutrition, supplements, and more.", path: "/ecosystem" },
  forPractitioners: { title: "For practitioners, xenios", description: "Twenty-five categories of coaches, trainers, and practitioners across performance, longevity, recovery, and clinical care. Find your fit.", path: "/for-practitioners" },
  manifesto: { title: "Manifesto, xenios", description: "We build for the people doing the work upstream of disease. Coaches, trainers, and practitioners deserve infrastructure as serious as the work.", path: "/manifesto" },
  about: { title: "About, xenios", description: "Built in Austin by operators behind $710M+ in prior exits, including FinDox and InstaMed. Founded by Alex Houston.", path: "/about" },
  careers: { title: "Careers, xenios", description: "Five founding roles. Remote first, Austin preferred. Help build the operating system for proactive health.", path: "/careers" },
  waitlist: { title: "Join the waitlist, xenios", description: "550+ coaches, trainers, and practitioners are already in line for the founding cohort.", path: "/waitlist" },
  contact: { title: "Contact, xenios", description: "Founding cohort, partnership, press, investor, careers, security, compliance. A human reads every message.", path: "/contact" },
  security: { title: "Security, xenios", description: "Security posture, encryption, access control, and disclosure. HIPAA-aware, BAA on request.", path: "/security" },
  compliance: { title: "Compliance, xenios", description: "HIPAA, SOC 2 (in progress), and the regulated-care posture coaches, trainers, and practitioners can build a business on.", path: "/compliance" },
  investors: { title: "Investors, xenios", description: "Pre-seed, Austin TX, in stealth. Building the AI-adjunct operations system for coaches, trainers, and practitioners.", path: "/investors" },
  press: { title: "Press, xenios", description: "Press, media, podcast, and creator inquiries. Brand assets on request.", path: "/press" },
  privacy: { title: "Privacy, xenios", description: "Privacy policy. We send the email you would want to receive. Nothing else.", path: "/privacy" },
  terms: { title: "Terms, xenios", description: "Terms of service for xenios.", path: "/terms" },
  notFound: { title: "Not found, xenios", description: "That page is not here.", path: "/404" },
} as const;

// Adapter for legacy components / SEO consumers
export const ALL_ECOSYSTEM_NAMES = ECOSYSTEM_CATEGORIES;

// Contact page copy (used by ContactForm + Contact page)
export const CONTACT_PAGE = {
  headline: "Talk to us.",
  sub: "Founding cohort. Partnership. Press. Investor. Careers. A human reads every message.",
  successTitle: "We have it.",
  successBody: "A human will reply inside two business days.",
  personaOptions: [
    { value: "practitioner", label: "Coach, trainer, or practitioner", prefix: "[Founding Cohort]" },
    { value: "investor", label: "Investor", prefix: "[Investor]" },
    { value: "journalist_creator", label: "Press, media, or creator", prefix: "[Press]" },
    { value: "integration_partner", label: "Brand or ecosystem partner", prefix: "[Partnership]" },
    { value: "enterprise", label: "Enterprise / health system", prefix: "[Enterprise]" },
    { value: "candidate", label: "Job candidate", prefix: "[Careers]" },
    { value: "other", label: "Something else", prefix: "[Hello]" },
  ],
};

// Hook content used by ContactForm (kept under a stable name)
(content as any).contactPage = CONTACT_PAGE;

