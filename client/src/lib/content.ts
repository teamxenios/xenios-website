// xenios v5 — canonical copy (lowercase wordmark, no period)
// Source of truth for all marketing copy across the site.

// ──────────────────────────────────────────────────────────────────────────────
// SITE-WIDE
// ──────────────────────────────────────────────────────────────────────────────

export const SITE = {
  name: "xenios",
  legalName: "Xenios Technologies, Inc.",
  url: "https://xeniostechnology.com",
  email: "team@xeniostechnology.com",
  location: "Austin, TX",
  baselineCount: 550,
  positioning: "the AI-native operating system for human performance, preventive health, longevity, and care coordination.",
  category: "This is not another wellness app. This is infrastructure.",
};

// 6-item nav per spec 3.2
export const NAV_ITEMS = [
  { label: "product", href: "/product" },
  { label: "agents", href: "/agents" },
  { label: "ecosystem", href: "/ecosystem" },
  { label: "enterprise", href: "/enterprise" },
  { label: "for practitioners", href: "/for-practitioners" },
  { label: "manifesto", href: "/manifesto" },
] as const;

export const SOCIALS = [
  { label: "Instagram → @officialxenios", url: "https://www.instagram.com/officialxenios/" },
  { label: "LinkedIn → /company/officialxenios", url: "https://www.linkedin.com/company/officialxenios" },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// ROTATING HERO (18 entries, per spec 3.3)
// ──────────────────────────────────────────────────────────────────────────────

export const ROTATING_ROLES = [
  "human performance",
  "preventive health",
  "longevity",
  "proactive care",
  "strength coaches",
  "functional medicine",
  "GLP-1 programs",
  "performance labs",
  "longevity clinics",
  "concierge medicine",
  "recovery studios",
  "hormone clinics",
  "peptide clinics",
  "sports performance teams",
  "corporate wellness",
  "preventive healthcare systems",
  "elite athletes",
  "the next era of care",
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// 5-LAYER ARCHITECTURE (spec 3.6)
// ──────────────────────────────────────────────────────────────────────────────

export const LAYERS_5 = [
  { num: "01", name: "INTELLIGENCE", body: "The agentic AI layer. Eight specialized agents and a Conductor orchestrating intelligence in the practitioner's voice, under the practitioner's judgment.", linkLabel: "explore the agents", href: "/agents" },
  { num: "02", name: "CARE", body: "The telemedicine layer. Video consults, async clinical messaging, e-prescribing where lawful, lab ordering and result return, and charting that finally feels fast.", linkLabel: "explore care delivery", href: "/telemedicine" },
  { num: "03", name: "COMMERCE", body: "The storefront layer. Branded apps, digital products, drop-ship fulfillment, subscription billing, HSA/FSA flagging, group cohorts, outcome-based packages.", linkLabel: "explore commerce", href: "/storefront" },
  { num: "04", name: "DATA", body: "The ontology layer. A standardized model of biomarkers, protocols, behaviors, outcomes, and signals — the interoperability primitive proactive health has been missing.", linkLabel: "explore the ontology", href: "/ontology" },
  { num: "05", name: "NETWORK", body: "The practitioner network. Agent-to-agent referrals with scope-aware handoffs and revenue routing across coaches, clinicians, labs, and recovery operators.", linkLabel: "explore the network", href: "/network" },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// THE 8 + 1 AGENTS (spec 3.7, 5)
// ──────────────────────────────────────────────────────────────────────────────

export const CONDUCTOR = {
  name: "The Conductor",
  short: "Orchestration across every agent.",
  body: "The Conductor holds the practice context. It decides which agent acts when, which agent escalates to a human, and which agent stays quiet. It is the runtime that makes the other eight feel like one mind.",
  scope: [
    "routes inbound signals to the right agent",
    "resolves conflicts when multiple agents have a stake",
    "surfaces decisions that need the practitioner's eyes",
    "learns from every approval and override",
  ],
  never: "The Conductor never acts on its own outside of routing. Every clinically material action is owned by a downstream agent under explicit autonomy configuration.",
};

export const AGENTS = [
  {
    name: "Onboarding Agent",
    short: "intake, wearables pairing, baseline labs",
    body: "The first hour of every client, automated. Sends intake forms, pairs wearables, pulls history, schedules baseline labs, builds the initial living profile. The client experience feels like a high-end concierge welcome. The practitioner experience is two clicks.",
    scope: [
      "intake forms (custom, conditional, modality-specific)",
      "wearable pairing (WHOOP, Oura, Apple Health, Garmin, more)",
      "baseline lab ordering (Function Health, Quest, Labcorp, Rupa)",
      "history import from prior tools",
    ],
    never: "Sets a protocol. That belongs to the Protocol Agent and the practitioner.",
  },
  {
    name: "Protocol Agent",
    short: "programming, nutrition, recovery, supplementation",
    body: "Programming in your voice and modality. Drafts training, nutrition, recovery, supplementation, and lifestyle programs adapted to the client's living profile and the practitioner's documented voice. Personalizes infinitely. Versions everything. Branches for life events.",
    scope: [
      "programming in the practitioner's style",
      "personalization against the living profile",
      "versioning, A/B, retro-analysis",
      "branching logic for life events (travel, injury, surgery, GLP-1, pregnancy)",
    ],
    never: "Publishes without practitioner approval until the trust threshold is explicitly set per client.",
  },
  {
    name: "Check-in Agent",
    short: "scheduled and adaptive touch points",
    body: "Runs the cadence of check-ins the practitioner defines. Adapts the timing, the format, and the questions based on what the client's signals say today. Flags drift early. Loops the human in when the signal warrants it.",
    scope: [
      "scheduled check-ins (daily, weekly, monthly)",
      "adaptive check-ins triggered by wearable or behavioral signals",
      "escalation routing",
      "drift detection",
    ],
    never: "Makes clinical interpretations. That belongs to the practitioner.",
  },
  {
    name: "Communication Agent",
    short: "async messaging, summaries, escalation",
    body: "Async messaging with intelligence. Handles inbound client messages, drafts tone-matched responses, summarizes threads for the practitioner, and routes anything urgent or out-of-scope to a human. Always under the practitioner's voice corpus.",
    scope: [
      "inbound message triage",
      "tone-matched drafts",
      "thread summarization",
      "escalation rules",
    ],
    never: "Responds without practitioner-defined guardrails. Crosses scope-of-practice.",
  },
  {
    name: "Education Agent",
    short: "personalized content, just-in-time micro-lessons",
    body: "Pulls micro-lessons, articles, video, and protocol-specific guidance matched to the client's current state. Replaces the generic education library with education that arrives the moment it's needed.",
    scope: [
      "protocol-aligned micro-lessons",
      "just-in-time delivery",
      "content sourced from practitioner-curated library or licensed sources",
    ],
    never: "Substitutes for clinician explanation in clinical workflows.",
  },
  {
    name: "Outcomes Agent",
    short: "biomarker, behavior, subjective tracking",
    body: "Proof, longitudinal and honest. Aggregates wearable, lab, behavioral, and subjective data into a longitudinal outcome view. Renders it in the language clients understand and the language referring physicians respect. Powers outcome-based pricing.",
    scope: [
      "biomarker tracking",
      "behavior tracking",
      "subjective tracking",
      "outcome attribution",
      "referring-physician summaries",
    ],
    never: "Diagnoses.",
  },
  {
    name: "Commerce Agent",
    short: "cart, checkout, subscriptions, fulfillment, dunning",
    body: "The storefront that runs itself. Handles cart, checkout, subscriptions, dunning, refunds, drop-ship fulfillment, supplement reorder routing, GLP-1 and peptide protocol routing where lawful, and HSA/FSA flagging.",
    scope: [
      "cart, checkout, subscriptions",
      "invoicing, dunning, refunds",
      "drop-ship fulfillment (Fullscript, Wellevate, Thorne, Designs for Health, Pure Encapsulations, Momentous, Hyperice, Therabody, Eight Sleep, more)",
      "HSA/FSA flagging",
      "protocol routing where lawful",
    ],
    never: "Sets pricing. The practitioner sets pricing.",
  },
  {
    name: "Compliance Agent",
    short: "HIPAA logging, scope guardrails, audit trail",
    body: "HIPAA-aware. Scope-aware. Always on. Logs every PHI interaction, enforces scope-of-practice guardrails, alerts on drift, runs the audit trail, surfaces compliance posture in real time. The quiet agent that keeps the rest honest.",
    scope: [
      "PHI logging",
      "scope-of-practice enforcement per practitioner",
      "audit trail",
      "compliance posture dashboard",
    ],
    never: "Operates outside the configured scope. Hides anything from audit.",
  },
] as const;

export const AGENT_PRINCIPLES = [
  { title: "VOICE & JUDGMENT FIRST", body: "Every agent loads the practitioner's voice corpus and decision rules. The agent acts in the practitioner's style or it does not act." },
  { title: "CONFIGURABLE AUTONOMY", body: "Three modes per agent per client: SUGGEST, DRAFT, AUTO-APPROVE. Set globally or per relationship. Move the slider as trust compounds." },
  { title: "CROSS-AGENT COORDINATION", body: "Agents share one context, one living profile, one ontology. No copy-paste. No re-asking. The practitioner's reality, one source of truth." },
  { title: "CROSS-PRACTITIONER COORDINATION", body: "Agents talk to other practitioners' agents — scope-aware, context-preserved, revenue-routed. The proactive health team that finally talks to itself." },
  { title: "LEARNS FROM YOUR OUTCOMES", body: "Every approval, every override, every outcome teaches the system. The practitioner's expertise compounds into the substrate." },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// 12 CAPABILITIES (spec PART 4)
// ──────────────────────────────────────────────────────────────────────────────

export const CAPABILITIES_12 = [
  { num: "01", name: "LIVING CLIENT PROFILE", body: "Every wearable stream, lab panel, protocol, behavior, and subjective check-in unified into one continuously-updated profile. Searchable. Exportable. Practitioner-owned. Client-owned." },
  { num: "02", name: "PROTOCOL ENGINE", body: "Author once, in your voice. Personalize infinitely against the client's living profile. Version-controlled. Branching logic for life events. Shareable across your team." },
  { num: "03", name: "COACH AGENT", body: "Your AI second-in-command. Drafts check-ins, surfaces anomalies, writes notes to referring physicians. Never ships without your sign-off until you set the threshold. Always in your voice.", linkLabel: "explore all eight agents", href: "/agents" },
  { num: "04", name: "ECOSYSTEM CONNECTOR", body: "Designed to connect with WHOOP, Oura, Apple Health, Garmin, Function Health, Levels, Lingo, Dexcom, Eight Sleep, Inside Tracker, Hone, Marek Health, Rupa Health, and the rest of the proactive stack.", linkLabel: "see the full ecosystem", href: "/ecosystem" },
  { num: "05", name: "OUTCOMES LAYER", body: "Biomarkers, behavior, and subjective markers tracked into measurable client outcomes. Proof in the language clients understand. Proof in the language referring physicians respect." },
  { num: "06", name: "PRACTITIONER NETWORK", body: "Agent-to-agent referrals across coaches, clinicians, labs, and recovery operators. Scope-aware handoffs. Revenue routing.", linkLabel: "explore the network", href: "/network" },
  { num: "07", name: "TELEMEDICINE", body: "Video consults, async clinical messaging, e-prescribing where lawful, lab ordering and result return, fast charting, multi-state licensure handling, insurance and superbill generation.", linkLabel: "explore the care layer", href: "/telemedicine" },
  { num: "08", name: "STOREFRONT", body: "Branded apps. Digital products. Drop-ship fulfillment. Subscriptions. HSA/FSA flagging. Group cohorts. Outcome-based packages.", linkLabel: "explore the commerce layer", href: "/storefront" },
  { num: "09", name: "WHITE-LABEL BRANDED APP", body: "iOS + Android with your logo, color, and voice. Comes standard. Replaces the white-label app builders that charge a premium for half the experience." },
  { num: "10", name: "COMPLIANCE LAYER", body: "HIPAA-aware logging. Encryption in transit and at rest. Audit trails. BAA available. Scope-of-practice guardrails enforced per agent.", linkLabel: "see security and compliance", href: "/security" },
  { num: "11", name: "ONTOLOGY LAYER", body: "A standardized model of biomarkers, protocols, behaviors, and outcomes. The interoperability primitive proactive health has been missing.", linkLabel: "explore the ontology", href: "/ontology" },
  { num: "12", name: "DEVELOPER PLATFORM", body: "REST API, webhooks, agent SDKs. Build on top of xenios. The Stripe-grade developer experience proactive health has been waiting for.", linkLabel: "read the docs", href: "/developers" },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// FRAGMENTED STACK (spec 3.5 left panel)
// ──────────────────────────────────────────────────────────────────────────────

export const FRAGMENTED_STACK = [
  "programming tool", "intake forms", "in-app messaging", "white-label app",
  "billing platform", "sick-care EMR", "payment processor", "affiliate setup",
  "spreadsheet stack", "group chat", "CRM", "email sequences",
  "wearable apps", "lab portals",
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// TELEMEDICINE (spec PART 6)
// ──────────────────────────────────────────────────────────────────────────────

export const TELEMED_STRIP_4 = [
  { cap: "HIPAA-COMPLIANT VIDEO", body: "every consult inside your branded app" },
  { cap: "ASYNC CLINICAL MESSAGING", body: "full audit trail, scope-aware" },
  { cap: "E-PRESCRIBING", body: "controlled and non-controlled, where lawful" },
  { cap: "LAB ORDERING & RESULTS", body: "Quest, Labcorp, Function Health, Marek, Inside Tracker, Rupa Health" },
] as const;

export const TELEMED_SECTIONS = [
  { title: "HIPAA-COMPLIANT VIDEO", body: "Every consult inside your branded app. Recording, transcript, structured notes auto-generated by the Communication Agent. No third-party video tools. No context loss.", bullets: ["HIPAA-compliant by design", "transcript + structured notes auto-generated", "recording optional, client-consented", "inside your branded app, not a third-party domain"] },
  { title: "ASYNC CLINICAL MESSAGING", body: "The async-first model the modern practitioner actually runs on. Scope-aware drafting. Escalation routing. Full audit trail.", bullets: ["scope-aware drafting by the Communication Agent", "escalation rules per relationship", "full audit trail for compliance", "PHI-tagged automatically"] },
  { title: "E-PRESCRIBING", body: "For licensed practitioners where lawful. Controlled and non-controlled. Integrated with the major pharmacy networks. Surescripts-compatible.", bullets: ["controlled and non-controlled", "Surescripts-compatible", "state licensure honored automatically", "compounding pharmacy routing for GLP-1 and peptide protocols where lawful"] },
  { title: "LAB ORDERING & RESULT RETURN", body: "Quest. Labcorp. Function Health. Inside Tracker. Marek Health. Rupa Health. One ordering flow. Results return into the living profile and trigger the Protocol Agent automatically.", bullets: ["Quest, Labcorp, Function Health, Inside Tracker, Marek Health, Rupa Health", "results return into the living profile", "protocol adjustments drafted automatically by the Protocol Agent", "referring-physician summary generated by the Outcomes Agent"] },
  { title: "CHARTING THAT'S ACTUALLY FAST", body: "The chart writes itself from the consult. The practitioner edits, approves, signs. Minutes, not hours. The single biggest hour-recovery in the platform.", bullets: ["consult-to-chart in minutes", "scope-aware templates", "audit-ready signatures", "interoperability primitives in the ontology layer"] },
  { title: "MULTI-STATE LICENSURE", body: "Practitioners working across states get licensure honored automatically. The Compliance Agent enforces it per consult, per Rx, per lab.", bullets: [] },
  { title: "INSURANCE & HSA / FSA", body: "Superbills generated automatically. HSA/FSA-eligible services flagged by the Commerce Agent. Cash-pay first, claims-friendly when needed.", bullets: [] },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// STOREFRONT (spec PART 7)
// ──────────────────────────────────────────────────────────────────────────────

export const STOREFRONT_BLOCKS = [
  { title: "BRANDED STOREFRONT", body: "Your logo. Your color. Your domain. Your voice. The Commerce Agent runs the storefront end-to-end." },
  { title: "DIGITAL PRODUCTS", body: "Programs, courses, protocols, cohort access — all generated by the Protocol Agent from your existing IP. Sold as one-time or evergreen subscription." },
  { title: "DROP-SHIP FULFILLMENT", body: "Compatible with Fullscript, Wellevate, Thorne, Designs for Health, Pure Encapsulations, Momentous, Standard Process, Klaire Labs, Hyperice, Therabody, Eight Sleep, WHOOP, Oura, and more. Transparent margin. Auto-reorder." },
  { title: "GLP-1 & PEPTIDE PROTOCOLS", body: "Routed via compliant compounding pharmacies and licensed prescribers where lawful in your jurisdiction. Protocol Agent personalizes the protocol. Commerce Agent handles fulfillment. Compliance Agent enforces scope." },
  { title: "GROUP COHORTS", body: "One protocol, many clients, agent-managed. The Protocol Agent personalizes inside the cohort frame. Sell cohorts of 10 or 200 with the same depth." },
  { title: "OUTCOME-BASED PACKAGES", body: "Charge on measurable client wins. The Outcomes Agent powers the attribution. A new pricing axis no legacy tool can support." },
  { title: "SUBSCRIPTIONS", body: "Every plan, every cadence. Dunning automated. Refunds clean. Upgrades and downgrades surfaced by the Communication Agent at the right moment." },
  { title: "HSA / FSA FLAGGING", body: "Eligible services flagged automatically. Receipts auto-generated. The Compliance Agent keeps the audit clean." },
  { title: "WHITE-LABEL BRANDED APP", body: "iOS + Android. Your logo. Your color. Your voice. Comes standard. Sell the branded experience as a premium tier if you want." },
  { title: "REVENUE ROUTING", body: "Network referrals, supplement margin, panel reorder revenue, GLP-1 and peptide protocol revenue — all routed transparently back to the originating practitioner." },
] as const;

export const REVENUE_CHIPS = [
  "outcome-based pricing",
  "recurring digital products",
  "agent-managed group cohorts",
  "transparent supplement & device revenue",
  "network referral revenue",
  "lab & longevity panel reorder",
  "GLP-1 & peptide protocols (where lawful)",
  "corporate wellness contracts",
  "HSA / FSA-eligible cash-pay",
  "concierge / 24-7 agent tier",
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// NETWORK (spec PART 8)
// ──────────────────────────────────────────────────────────────────────────────

export const NETWORK_BLOCKS = [
  { title: "AGENT-TO-AGENT HANDOFFS", body: "A strength coach hands off to an RD. The RD pings a functional medicine MD for a lab review. The MD orders a longevity panel. A recovery coach loops in for return-to-training. A mental performance coach joins for the high-stakes moments. Every handoff carries the full living profile, the originating protocol, and the conversation context. No copy-paste. No lost signal." },
  { title: "SCOPE-AWARE COORDINATION", body: "Each receiving agent operates only inside its practitioner's scope of practice. The Compliance Agent enforces it. The client experience stays seamless even as the practitioner stack expands." },
  { title: "REFERRAL REVENUE ROUTING", body: "Revenue routes back to the originating practitioner automatically. Transparent margin. No paperwork. No invoicing. The Commerce Agent handles it." },
  { title: "THE NETWORK DIRECTORY", body: "A directory of xenios practitioners filtered by modality, geography, verified credentials, and outcome history. Open to every practitioner on the platform. Discoverable. Searchable. Honest." },
  { title: "EXAMPLE FLOW", body: "Strength coach → registered dietitian → functional medicine MD → longevity panel provider → recovery coach → mental performance coach. One client. One unified protocol. Six practitioners, all in context, all in voice, all paid." },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// ONTOLOGY (spec PART 9)
// ──────────────────────────────────────────────────────────────────────────────

export const ONTOLOGY_SECTIONS = [
  { title: "A STANDARDIZED MODEL OF PROACTIVE HEALTH", body: 'The ontology is the conceptual substrate of the platform. It defines what a "biomarker" is, what a "protocol" is, what an "outcome" is, what a "behavior" is — and how they relate. Every signal in the ecosystem flows into this model.' },
  { title: "DESIGNED TO BE PROGRAMMED", body: "The ontology is exposed through the developer platform. Build a new integration, a new analytical surface, a new modality, a new agent — and it plugs into the same model the entire platform runs on." },
  { title: "CLIENT-OWNED. PRACTITIONER-OWNED. PORTABLE.", body: "The client owns their record. The practitioner owns their slice of practice data. Both can export. Both can revoke. Neither is locked in by the substrate." },
  { title: "INTEROPERABILITY WITH THE BROADER STACK", body: "Designed to interoperate with FHIR for clinical environments, and with the proactive ecosystem (WHOOP, Oura, Apple Health, Garmin, Function Health, Levels, Lingo, Dexcom, Eight Sleep, Inside Tracker, Hone, Marek Health, Rupa Health) for everything upstream of disease." },
  { title: "THE PALANTIR-GRADE LAYER FOR HUMAN PERFORMANCE", body: "This is the substrate Apple Health was supposed to be. Rebuilt for the proactive practitioner. Built to be programmed. Built to scale." },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// DEVELOPERS (spec PART 10)
// ──────────────────────────────────────────────────────────────────────────────

export const DEVELOPER_SECTIONS = [
  { title: "REST API", body: "Stable, versioned, predictable. Every resource the platform models is exposed through a clean, RESTful interface." },
  { title: "WEBHOOKS", body: "Subscribe to every meaningful event in the platform: new signal, new outcome, new protocol, new client, new referral, new payment. Build automations on top." },
  { title: "AGENT SDKs", body: "Define new agents, extend existing agents, hook into the Conductor's routing. Build the workflows your practice needs without forking the platform." },
  { title: "THE ONTOLOGY, EXPOSED", body: "Read and write against the same model the platform uses internally. Biomarkers, protocols, behaviors, outcomes — all programmable." },
  { title: "ENTERPRISE-GRADE", body: "99.95% uptime target. SOC 2 roadmap. BAA available. Multi-region. Audit trails. Role-based access. SSO." },
  { title: "BUILDING TOWARD: AN APP STORE FOR PROACTIVE HEALTH", body: "A future where every developer in the space can ship an integration, an agent, or a modality on top of the xenios substrate — and every practitioner can install it in one click." },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// ENTERPRISE (spec PART 11)
// ──────────────────────────────────────────────────────────────────────────────

export const ENTERPRISE_SECTIONS = [
  { title: "MULTI-PRACTITIONER ORGANIZATIONS", body: "Role-based access. Practice-wide protocols. Shared client profiles where clinically appropriate. Per-practitioner scope enforcement. Cross-practitioner referral and revenue routing." },
  { title: "PERFORMANCE LABS", body: "Testing, programming, outcome attribution, athlete portals, longitudinal data across cohorts and seasons. The performance-lab OS." },
  { title: "LONGEVITY CLINICS", body: "Panels, protocols, members, longitudinal data, telemedicine, supplement and device fulfillment, group cohorts, branded apps. The longevity-clinic OS." },
  { title: "HEALTHCARE SYSTEMS", body: "The preventive care layer over your EMR. Connects to FHIR. Surfaces the upstream signals your sick-care EMR doesn't model. Modular, optional, additive." },
  { title: "MILITARY OPTIMIZATION PROGRAMS", body: "Unit-level human performance at scale. Cohort programming, biomarker-driven adjustments, recovery and readiness scoring, longitudinal performance data. Built to meet DoD-grade compliance requirements." },
  { title: "SPORTS ORGANIZATIONS", body: "The performance layer under every athlete. Every signal, every coach, every practitioner, one substrate. Agency, team, and individual views." },
  { title: "SELF-INSURED EMPLOYERS", body: "Preventive care as a measured benefit. Cohort programs, outcome attribution, HSA/FSA-eligible flows, transparent reporting. The employer-wellness layer that finally moves outcomes." },
  { title: "SECURITY & COMPLIANCE", body: "HIPAA-aware. SOC 2 roadmap. BAA available. Multi-region hosting. Audit trails. SSO. Role-based access controls. Encryption at rest and in transit." },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// ECOSYSTEM (spec PART 12) — 18 categories, 100+ brands
// ──────────────────────────────────────────────────────────────────────────────

export const ECOSYSTEM_CATEGORIES = [
  { name: "WEARABLES & BIOMETRICS", brands: ["WHOOP", "Oura", "Apple Health", "Apple Watch", "Garmin Connect", "Garmin Forerunner", "Polar Vantage", "Polar H10", "COROS Pace", "Suunto", "Fitbit", "Withings", "Samsung Health", "Renpho", "Eufy", "Apollo Neuro"] },
  { name: "CONTINUOUS GLUCOSE & METABOLIC", brands: ["Levels", "Lingo", "Dexcom", "Stelo", "Abbott Libre", "Veri", "Signos", "January AI", "Nutrisense", "Zoe"] },
  { name: "LABS & DIAGNOSTICS", brands: ["Function Health", "Superpower", "Inside Tracker", "Marek Health", "Hone", "Maximus", "Quest", "Labcorp", "Rupa Health", "Mosaic Diagnostics", "ZRT Labs", "DUTCH Test", "GI-MAP", "Genova Diagnostics", "Vibrant America", "Boston Heart", "Bristle", "Bioma"] },
  { name: "LONGEVITY IMAGING & SCREENING", brands: ["Ezra", "Prenuvo", "Neko Health", "Cleerly", "Heart Test Labs"] },
  { name: "GLP-1 & METABOLIC RX (WHERE LAWFUL)", brands: ["Zepbound", "Wegovy", "Ozempic", "Mounjaro", "compounded GLP-1 programs", "Eden", "Henry Meds", "Mochi Health", "Form Health", "Calibrate", "Found", "Sequence"] },
  { name: "PEPTIDE & ADVANCED PROTOCOLS (WHERE LAWFUL)", brands: ["BPC-157 protocols", "semaglutide programs", "tirzepatide programs", "retatrutide programs", "NAD+", "NMN", "methylene blue protocols"] },
  { name: "SUPPLEMENTS — PRACTITIONER CHANNELS", brands: ["Fullscript", "Wellevate", "Rupa Health", "Designs for Health", "Pure Encapsulations", "Thorne", "Momentous", "Standard Process", "Klaire Labs", "Metagenics", "Ortho Molecular", "BiOptimizers", "Quicksilver Scientific", "Microbiome Labs"] },
  { name: "SUPPLEMENTS — DTC BRANDS", brands: ["Athletic Greens (AG1)", "LMNT", "Onnit", "MUD\\WTR", "Four Sigmatic", "Ritual", "Cymbiotika", "Just Thrive", "OmniBiotic", "Seed Daily Synbiotic", "ARMRA"] },
  { name: "RECOVERY & RED LIGHT", brands: ["Hyperice", "Hypervolt", "Normatec", "Therabody", "Theragun", "Sunlighten", "Joovv"] },
  { name: "SLEEP TECH", brands: ["Eight Sleep", "Pod 4 Ultra", "Withings Sleep", "WHOOP Recovery", "Apollo Neuro"] },
  { name: "COLD & HEAT EXPOSURE", brands: ["Plunge", "Ice Barrel", "Sunlighten", "Higher Dose", "Cold Plunge by Renu"] },
  { name: "NUTRITION TRACKING", brands: ["Cronometer", "MacroFactor", "Carbon Diet Coach", "MyFitnessPal", "Lifesum", "Eat This Much"] },
  { name: "MENTAL PERFORMANCE & MINDSET", brands: ["Headspace", "Calm", "Othership", "Open", "Ten Percent Happier", "Mindvalley", "Brain.fm"] },
  { name: "LONGEVITY FRAMEWORKS (REFERENCE)", brands: ["Bryan Johnson Blueprint", "Peter Attia Centenarian Decathlon", "Don't Die protocol"] },
  { name: "AI FOUNDATIONS", brands: ["Anthropic", "OpenAI"] },
  { name: "COMPLIANCE & PAYMENTS INFRASTRUCTURE", brands: ["Stripe", "Plaid", "Persona"] },
  { name: "CLINICAL INTEROPERABILITY", brands: ["FHIR", "HL7", "Surescripts (e-prescribing rails)"] },
  { name: "LICENSURE & TELEHEALTH RAILS", brands: ["state-by-state licensure honored", "multi-state collaboration networks"] },
] as const;

export const ALL_ECOSYSTEM_NAMES: string[] = ECOSYSTEM_CATEGORIES.flatMap((c) => c.brands);

// ──────────────────────────────────────────────────────────────────────────────
// 25 ICPs (spec 3.12 + PART 14)
// ──────────────────────────────────────────────────────────────────────────────

export const ICP_LIST = [
  { slug: "strength-coaches", value: "strength_coaches", label: "strength coaches", oneliner: "one OS for programming, recovery, outcomes" },
  { slug: "personal-trainers", value: "personal_trainers", label: "personal trainers", oneliner: "branded app, agents, commerce on one stack" },
  { slug: "sports-performance", value: "sports_performance", label: "sports performance", oneliner: "every athlete, every signal, one practice" },
  { slug: "functional-medicine", value: "functional_medicine", label: "functional medicine", oneliner: "intake, labs, protocols, charting, billing" },
  { slug: "longevity-clinics", value: "longevity_clinics", label: "longevity clinics", oneliner: "panels, protocols, members, longitudinal data" },
  { slug: "concierge-medicine", value: "concierge_medicine", label: "concierge medicine", oneliner: "premium care delivery, fully orchestrated" },
  { slug: "performance-labs", value: "performance_labs", label: "performance labs", oneliner: "testing, programming, outcome attribution" },
  { slug: "recovery-studios", value: "recovery_studios", label: "recovery studios", oneliner: "modalities, members, retention, revenue" },
  { slug: "telemedicine-startups", value: "telemedicine_startups", label: "telemedicine startups", oneliner: "the infrastructure underneath your build" },
  { slug: "preventive-care", value: "preventive_care", label: "preventive care systems", oneliner: "proactive orchestration at population scale" },
  { slug: "nutrition-companies", value: "nutrition_companies", label: "nutrition companies", oneliner: "protocols, cohorts, drop-ship, outcomes" },
  { slug: "supplement-brands", value: "supplement_brands", label: "supplement brands", oneliner: "practitioner channel, transparent margin" },
  { slug: "athlete-brands", value: "athlete_brands", label: "athlete brands", oneliner: "programs, cohorts, audience monetization" },
  { slug: "corporate-wellness", value: "corporate_wellness", label: "corporate wellness", oneliner: "team programs, agents, outcome reporting" },
  { slug: "healthcare-systems", value: "healthcare_systems", label: "healthcare systems", oneliner: "the preventive care layer over your EMR" },
  { slug: "military", value: "military", label: "military optimization", oneliner: "unit-level human performance at scale" },
  { slug: "biohacking-clinics", value: "biohacking_clinics", label: "biohacking clinics", oneliner: "modalities, panels, protocols, members" },
  { slug: "physical-therapists", value: "physical_therapists", label: "physical therapists", oneliner: "cash-pay practice, fully orchestrated" },
  { slug: "chiropractors", value: "chiropractors", label: "chiropractors", oneliner: "wellness programs, members, commerce" },
  { slug: "hormone-clinics", value: "hormone_clinics", label: "hormone clinics", oneliner: "protocols, labs, telemed, fulfillment" },
  { slug: "peptide-clinics", value: "peptide_clinics", label: "peptide clinics", oneliner: "protocol orchestration where lawful" },
  { slug: "self-insured-employers", value: "self_insured_employers", label: "self-insured employers", oneliner: "preventive care as a benefit, measured" },
  { slug: "elite-athletes", value: "elite_athletes", label: "elite athletes", oneliner: "your team, your data, your orchestration" },
  { slug: "creators", value: "creators", label: "creators & influencers", oneliner: "audience to outcomes via cohorts" },
  { slug: "sports-agencies", value: "sports_agencies", label: "sports agencies", oneliner: "the performance layer under every athlete" },
] as const;

// Backward-compat alias for existing waitlist form
export const PRACTITIONER_TILES = ICP_LIST.map((i) => ({ value: i.value, label: i.label, sub: i.oneliner }));

// Per-ICP detail (spec PART 14) — keyed by slug
export interface IcpDetail {
  display: string;
  stack: string[];
  ecosystem: string[];
  network: string;
  revenue: string[];
}

export const ICP_DETAILS: Record<string, IcpDetail> = {
  "strength-coaches": { display: "The OS for the strength coach who runs the practice they always wanted to run.", stack: ["programming app", "spreadsheet stack", "group chat", "billing platform", "ad-hoc affiliate setup", "intake forms"], ecosystem: ["WHOOP", "Oura", "Garmin", "Apple Health", "Momentous", "Thorne", "Hyperice", "Therabody"], network: "refers to RDs, FM MDs, recovery coaches, mental performance coaches", revenue: ["outcome-based pricing", "recurring digital products", "group cohorts", "supplement & device revenue", "network referrals"] },
  "personal-trainers": { display: "Your branded app, your agents, your storefront — on one stack.", stack: ["programming app", "in-app messaging", "white-label app builder", "billing platform"], ecosystem: ["WHOOP", "Oura", "Apple Health", "Garmin", "MyFitnessPal", "Cronometer", "AG1", "LMNT"], network: "refers to RDs, recovery, PT", revenue: ["digital products", "cohorts", "supplement & device", "branded app premium tier"] },
  "sports-performance": { display: "Every athlete. Every signal. One practice.", stack: ["athlete portal", "team management tool", "spreadsheet stack", "video coach"], ecosystem: ["WHOOP", "Garmin", "COROS", "Polar H10", "Hyperice Normatec", "Eight Sleep", "Function Health"], network: "refers to PT, FM MDs, mental performance, recovery", revenue: ["outcome-based packages", "group cohorts", "team enterprise contracts"] },
  "functional-medicine": { display: "Intake, labs, protocols, charting, billing — finally one substrate.", stack: ["practice management", "charting EMR", "supplement dispensary", "lab portal", "superbill generator"], ecosystem: ["Rupa Health", "Function Health", "DUTCH Test", "GI-MAP", "Mosaic", "Fullscript", "Wellevate", "Designs for Health", "Pure Encapsulations"], network: "refers to coaches, RDs, hormone clinics, longevity clinics", revenue: ["supplement dispensary", "panel reorder", "telemedicine", "group cohorts", "HSA/FSA"] },
  "longevity-clinics": { display: "Panels, protocols, members, longitudinal data — the longevity-clinic OS.", stack: ["member portal", "panel ordering", "custom Notion/Airtable stack", "billing"], ecosystem: ["Function Health", "Superpower", "Inside Tracker", "Hone", "Maximus", "Ezra", "Prenuvo", "Neko Health", "Cleerly"], network: "refers to FM, recovery, PT, mental performance, peptide clinics", revenue: ["membership subscriptions", "panel reorder", "supplement & device", "outcome-based", "concierge tier"] },
  "concierge-medicine": { display: "Premium care delivery, fully orchestrated.", stack: ["concierge EMR", "text-message platform", "ad-hoc telemedicine", "billing"], ecosystem: ["Function Health", "Quest", "Labcorp", "Rupa Health", "Fullscript", "Hone"], network: "receives from coaches, refers to specialists", revenue: ["membership", "supplement dispensary", "panel reorder", "24-7 agent tier"] },
  "performance-labs": { display: "Testing, programming, outcome attribution — under one substrate.", stack: ["lab testing tools", "custom dashboard", "email reports", "separate program tool"], ecosystem: ["Boston Heart", "Inside Tracker", "Function Health", "Marek Health", "WHOOP", "Garmin"], network: "refers to coaches, FM, longevity clinics", revenue: ["testing packages", "outcome packages", "supplement reorder", "cohort programs"] },
  "recovery-studios": { display: "Modalities, members, retention, revenue — orchestrated.", stack: ["studio management software", "POS", "membership platform", "ad-hoc upsell"], ecosystem: ["Hyperice Normatec", "Therabody", "Sunlighten", "Plunge", "Eight Sleep", "Apollo Neuro"], network: "receives from coaches, sports performance, PT", revenue: ["memberships", "retail device revenue", "group cohorts", "branded app"] },
  "telemedicine-startups": { display: "The infrastructure underneath your build.", stack: ["custom EMR", "custom video stack", "custom billing", "custom fulfillment"], ecosystem: ["Quest", "Labcorp", "Rupa", "Surescripts", "Stripe", "compounding pharmacy networks"], network: "enterprise integration via API", revenue: ["build on the platform, charge your own margin"] },
  "preventive-care": { display: "Proactive orchestration at population scale.", stack: ["legacy population health tools", "sick-care EMR", "disconnected risk models"], ecosystem: ["FHIR interoperability", "Function Health", "WHOOP", "Apple Health"], network: "enterprise referrals across the network", revenue: ["enterprise contracts", "outcome-attribution reporting"] },
  "nutrition-companies": { display: "Protocols, cohorts, drop-ship, outcomes.", stack: ["nutrition tracking", "cohort tool", "drop-ship fulfillment", "separate billing"], ecosystem: ["Cronometer", "MacroFactor", "MyFitnessPal", "Fullscript", "Thorne", "AG1", "LMNT"], network: "receives from coaches, refers to FM", revenue: ["cohort sales", "supplement & device", "outcome packages"] },
  "supplement-brands": { display: "Practitioner channel, transparent margin.", stack: ["DTC site", "separate practitioner channel", "affiliate setups"], ecosystem: ["Fullscript", "Wellevate (as distribution)", "xenios as practitioner-channel orchestration"], network: "every supplement-prescribing practitioner on xenios is your channel", revenue: ["practitioner-channel orders", "subscription reorder", "cohort bundling"] },
  "athlete-brands": { display: "Programs, cohorts, audience monetization — on infrastructure.", stack: ["email list", "ad-hoc course platform", "DTC store", "affiliate codes"], ecosystem: ["WHOOP", "Oura", "Garmin", "Momentous", "Thorne", "Hyperice"], network: "hand-off to coaches who run the audience's protocols", revenue: ["programs", "cohorts", "drop-ship", "branded app subscriptions"] },
  "corporate-wellness": { display: "Team programs, agents, outcome reporting.", stack: ["generic wellness vendor", "separate biometric screening", "disconnected reporting"], ecosystem: ["WHOOP", "Function Health", "Levels", "Eight Sleep", "Headspace"], network: "enterprise referrals across specialists", revenue: ["per-employee subscription", "cohort programs", "outcome attribution", "HSA/FSA"] },
  "healthcare-systems": { display: "The preventive care layer over your EMR.", stack: ["legacy EMR (sick-care)", "disconnected wellness initiatives", "no preventive substrate"], ecosystem: ["FHIR interoperability", "WHOOP", "Function Health", "Apple Health"], network: "enterprise referrals", revenue: ["enterprise contracts", "outcome-attribution", "preventive-care reimbursement"] },
  "military": { display: "Unit-level human performance at scale.", stack: ["unit-specific dashboards", "disconnected biometric programs", "paper protocols"], ecosystem: ["Garmin Tactix", "WHOOP", "Polar", "Eight Sleep", "Function Health"], network: "enterprise across units, specialists, and embedded clinicians", revenue: ["DoD-grade enterprise contracts", "multi-year deployments"] },
  "biohacking-clinics": { display: "Modalities, panels, protocols, members — orchestrated.", stack: ["membership tool", "modality scheduling", "separate panel ordering", "ad-hoc upsell"], ecosystem: ["Function Health", "Inside Tracker", "Hone", "Sunlighten", "Plunge", "Hyperice", "NAD+", "NMN"], network: "refers to FM, longevity, peptide clinics", revenue: ["membership", "modality bundles", "panel reorder", "supplement & device", "protocols where lawful"] },
  "physical-therapists": { display: "Cash-pay practice, fully orchestrated.", stack: ["PT EMR", "in-app messaging", "billing", "separate exercise prescription tool"], ecosystem: ["Hyperice", "Theragun", "recovery devices", "Function Health"], network: "receives from coaches, sports performance; refers to FM, recovery", revenue: ["cash-pay subscriptions", "group cohorts", "supplement & device", "HSA/FSA"] },
  "chiropractors": { display: "Wellness programs, members, commerce — on one substrate.", stack: ["chiro EMR", "separate wellness program tool", "ad-hoc retail"], ecosystem: ["recovery devices", "supplements", "longevity panels"], network: "receives from coaches, refers to FM and recovery", revenue: ["wellness memberships", "retail revenue", "supplement reorder"] },
  "hormone-clinics": { display: "Protocols, labs, telemed, fulfillment.", stack: ["telemed tool", "separate lab portal", "separate fulfillment", "separate billing"], ecosystem: ["Hone", "Maximus", "DUTCH Test", "ZRT", "compounding pharmacy networks"], network: "receives from FM, longevity, coaches; refers to recovery", revenue: ["subscription protocols", "lab reorder", "supplement & device", "telemedicine"] },
  "peptide-clinics": { display: "Protocol orchestration where lawful.", stack: ["fragmented compounding-pharmacy stack", "ad-hoc telemed", "separate billing"], ecosystem: ["compounding pharmacy networks", "Hone", "Maximus", "peptide protocol catalog"], network: "receives from longevity, FM; refers to recovery, FM", revenue: ["subscription protocols", "telemed", "panel reorder", "compliance-grade audit trail"] },
  "self-insured-employers": { display: "Preventive care as a benefit, finally measured.", stack: ["generic wellness vendor", "disconnected screening", "zero outcome attribution"], ecosystem: ["WHOOP", "Function Health", "Levels", "Headspace", "Eight Sleep"], network: "enterprise referrals to specialists in the network", revenue: ["per-employee subscription", "outcome attribution", "claims-impact reporting"] },
  "elite-athletes": { display: "Your team, your data, your orchestration.", stack: ["personal trainer", "separate nutritionist", "separate recovery", "separate doctor", "separate everything"], ecosystem: ["WHOOP", "Oura", "Garmin", "Function Health", "Hyperice Normatec", "Eight Sleep"], network: "every member of your team on one substrate", revenue: ["concierge tier", "personal substrate license"] },
  "creators": { display: "Audience to outcomes via cohorts.", stack: ["email list", "course platform", "separate DTC store", "affiliate codes"], ecosystem: ["WHOOP", "Oura", "Function Health", "Momentous", "Thorne", "AG1"], network: "hand-off to vetted practitioners running your protocols at scale", revenue: ["cohorts", "digital products", "branded app subscriptions", "supplement & device"] },
  "sports-agencies": { display: "The performance layer under every athlete you represent.", stack: ["zero — agencies operate on relationships, not infrastructure"], ecosystem: ["WHOOP", "Garmin", "Function Health", "every athlete's existing stack"], network: "every practitioner on every athlete's team", revenue: ["agency-tier subscription", "performance-attribution reporting"] },
};

// ──────────────────────────────────────────────────────────────────────────────
// CAREERS (spec 15.3) — 5 founding roles, NO ADVISOR
// ──────────────────────────────────────────────────────────────────────────────

export const CAREERS_ROLES = [
  { num: "01", title: "FOUNDING SENIOR SOFTWARE ENGINEER", body: "Owns the core platform: client profile, protocol engine, integrations, agent runtime. TypeScript, Postgres, distributed systems, agentic LLM patterns.", subject: "[ROLE — SENIOR SW ENG]" },
  { num: "02", title: "FOUNDING PRODUCT ENGINEER", body: "Ships the surfaces practitioners actually touch. Lives where product, design, and engineering meet.", subject: "[ROLE — PRODUCT ENG]" },
  { num: "03", title: "FOUNDING AI / ML ENGINEER", body: "Owns the agent layer. Trains, evaluates, ships. Retrieval, planning, eval rigor, guardrails for regulated-adjacent environments.", subject: "[ROLE — AI/ML ENG]" },
  { num: "04", title: "FOUNDING UI / UX DESIGNER", body: "Defines how xenios feels. Owns the visual system, the interaction language, the practitioner's daily surface.", subject: "[ROLE — DESIGNER]" },
  { num: "05", title: "FOUNDING COACH PARTNERSHIPS LEAD", body: "Owns the first hundred practitioners. Recruits, onboards, grows with them. Already lives in the proactive health world.", subject: "[ROLE — COACH PARTNERSHIPS]" },
] as const;

export const HOW_WE_WORK = [
  "Remote-first. Austin preferred for in-person sprint weeks.",
  "Founding equity for every founding hire.",
  "Small team. High trust. Few meetings. Long arcs.",
  "We hire for taste, judgment, and shipping muscle.",
  "We expect every founding hire to act like a founder, because they are one.",
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// CONTACT (spec 15.5) — 7 paths
// ──────────────────────────────────────────────────────────────────────────────

export const CONTACT_PATHS = [
  { num: "01", label: "PRACTITIONERS", body: "join the waitlist", subject: "", href: "/waitlist" },
  { num: "02", label: "INVESTORS", body: "team@xeniostechnology.com", subject: "[INVESTOR]" },
  { num: "03", label: "PRESS, INFLUENCERS & CREATORS", body: "team@xeniostechnology.com", subject: "[PRESS] or [CREATOR]" },
  { num: "04", label: "INTEGRATION PARTNERS", body: "team@xeniostechnology.com", subject: "[PARTNER]" },
  { num: "05", label: "ENTERPRISE", body: "team@xeniostechnology.com", subject: "[ENTERPRISE]" },
  { num: "06", label: "CANDIDATES", body: "see open roles", subject: "", href: "/careers" },
  { num: "07", label: "GENERAL", body: "team@xeniostechnology.com", subject: "[HELLO]" },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// FAQ (legacy + JSON-LD)
// ──────────────────────────────────────────────────────────────────────────────

export const FAQ_QA = [
  { q: "What is xenios?", a: "xenios (Xenios Technologies, Austin, TX) is the AI-native operating system for proactive health — the orchestration layer connecting every signal, every workflow, and every practitioner moving care upstream of disease." },
  { q: "Who is xenios built for?", a: "Every practitioner, clinic, lab, system, and operator moving care upstream — from solo strength coaches and longevity clinicians to performance labs, healthcare systems, military programs, and self-insured employers." },
  { q: "How does xenios use AI?", a: "xenios is a multi-agent system. Eight specialized agents and a Conductor work in the practitioner's voice, under their judgment, with HIPAA-aware logging and scope-of-practice guardrails." },
  { q: "Does xenios integrate with wearables and labs?", a: "xenios is designed to connect with WHOOP, Oura, Function Health, Levels, Eight Sleep, Inside Tracker, Hone, and the wider proactive health ecosystem. Brand names are property of their respective owners; integration availability varies." },
  { q: "Where is xenios based?", a: "Austin, Texas. All roles are remote, Austin preferred. The team comes from $710M+ in prior exits, including FinDox and InstaMed." },
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// PAGE-LEVEL META + COPY
// ──────────────────────────────────────────────────────────────────────────────

export const PAGES = {
  home: { title: "xenios — the AI-native OS for proactive health", description: "The AI-native operating system for human performance, preventive health, longevity, and care coordination. From the team behind $710M+ in prior exits." },
  product: { title: "Product — xenios", description: "The operating system for proactive health, in twelve capabilities." },
  agents: { title: "Agents — xenios", description: "Eight agents and one Conductor — the first AI workforce built for proactive care." },
  telemedicine: { title: "Telemedicine — xenios", description: "Video, async clinical messaging, e-prescribing, lab ordering, and fast charting — inside your branded experience." },
  storefront: { title: "Storefront — xenios", description: "Every practitioner runs a storefront. Every storefront runs itself." },
  network: { title: "Practitioner network — xenios", description: "The proactive health team that finally talks to itself. Agent-to-agent referrals with revenue routing." },
  ontology: { title: "Health ontology — xenios", description: "The interoperability primitive proactive health has been missing. Built to be programmed." },
  developers: { title: "Developers — xenios", description: "Programmable health infrastructure. REST API, webhooks, agent SDKs, and the ontology — exposed." },
  enterprise: { title: "Enterprise — xenios", description: "The substrate underneath proactive care at scale. Performance labs, longevity clinics, healthcare systems, military, sports orgs, and self-insured employers." },
  ecosystem: { title: "Ecosystem — xenios", description: "Designed to connect to every dot. 100+ brands across 18 categories of the proactive health stack." },
  forPractitioners: { title: "For practitioners — xenios", description: "Built for the people building the next era of care. 25 archetypes, one substrate." },
  manifesto: { title: "Manifesto — xenios", description: "Care, finally upstream. Why we are building the AI-native operating system for proactive health." },
  about: { title: "About xenios — built in Austin", description: "Xenios Technologies — pre-seed, stealth, Austin, TX. From the team behind $710M+ in prior exits including FinDox and InstaMed." },
  careers: { title: "Careers — xenios (remote, Austin preferred)", description: "Five founding roles. All remote, Austin preferred. Build the operating system for the next fifty years of human health." },
  waitlist: { title: "Join the xenios waitlist", description: "Be on the list when the proactive health OS ships. 550+ practitioners and counting." },
  contact: { title: "Contact xenios", description: "One inbox. Every door. team@xeniostechnology.com." },
  security: { title: "Security & data — xenios", description: "Built for the most sensitive surface in human life. HIPAA-aware. BAA available. SOC 2 on the roadmap." },
  compliance: { title: "Compliance — xenios", description: "Built to be audited. HIPAA, SOC 2 roadmap, BAAs, subprocessors, data residency, export and deletion." },
  investors: { title: "Investors — xenios", description: "If your thesis lives where the puck is going, we should talk." },
  press: { title: "Press — xenios", description: "The story we'll tell when we're ready. team@xeniostechnology.com — subject [PRESS] or [CREATOR]." },
  privacy: { title: "Privacy — xenios", description: "How we collect, use, and protect data on xeniostechnology.com." },
  terms: { title: "Terms — xenios", description: "Terms of service for xeniostechnology.com." },
  notFound: { title: "Not found — xenios", description: "The page you're looking for hasn't been written yet." },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// MANIFESTO (spec 15.1) — full body, paragraphs
// ──────────────────────────────────────────────────────────────────────────────

export const MANIFESTO_PARAGRAPHS = [
  "For a hundred years, \"healthcare\" has meant the system you go to after something has already gone wrong. The chart opens when the symptom arrives. The billing code requires a diagnosis. The infrastructure was built for reaction.",
  "We are alive in the first decade where that arrangement is breaking.",
  "A new class of practitioner has emerged — the strength coach, the registered dietitian, the GLP-1 specialist, the longevity clinician, the functional medicine doctor, the recovery operator, the concierge physician, the performance scientist, the executive coach — who does not wait for the symptom. They look at the wearable, the panel, the protocol, the sleep, the meal, the recovery, the mood. They move upstream. They are the most important workforce in the proactive health era.",
  "And almost no one built the infrastructure for them.",
  "What got built instead was an archipelago. A programming tool that thinks it's an EMR. An EMR that thinks it's a CRM. A messaging app that pretends to be HIPAA-compliant. A nutrition platform that doesn't talk to the wearable. A billing tool that doesn't talk to anything. The proactive practitioner — whose entire job is to integrate signal across a life — has been forced to integrate it across twelve tabs, by hand, at night, for free.",
  "We have been here before. The team behind xenios has spent two decades shipping infrastructure into U.S. healthcare. We have written boring layers underneath payments, compliance, and clinical data exchange — the layers that look invisible right up until they are missing. Prior work is responsible for $710M+ in combined enterprise outcomes, including FinDox and InstaMed. We know what production-grade looks like in regulated environments. We are building xenios with that standard from day one.",
] as const;

export const MANIFESTO_AFTER = [
  "What we are building is not coaching software.",
  "xenios is the AI-native operating system for proactive health — the orchestration layer connecting every signal, every workflow, every practitioner in the ecosystem. Eight specialized agents and a Conductor. Telemedicine. A branded storefront. A practitioner network. A programmable health ontology. A developer platform. An enterprise tier.",
  "This is the infrastructure proactive health has been waiting for.",
] as const;

export const MANIFESTO_BELIEFS = [
  { num: "One.", body: "The leverage in healthcare is finally being handed to the practitioner doing the work, not the platform charging the rent. We are building software that hands it to them." },
  { num: "Two.", body: "This decade will decide the shape of proactive care for the next fifty years. The infrastructure that gets adopted now — by the coaches, the clinicians, the systems — becomes the infrastructure of human health by 2075. We are building for the long arc." },
  { num: "Three.", body: "AI is not the product. AI is the substrate. The product is the practitioner who, with AI as their second pair of hands, can hold more clients, write better protocols, and deliver outcomes a single human could never deliver alone. The agent acts in the practitioner's voice and judgment, or it has no place in this stack." },
  { num: "Four.", body: "The proactive health ecosystem is the most exciting it has ever been and the most fragmented it has ever been. xenios is the connective tissue. Every signal, every tool, every human, one substrate." },
] as const;

export const MANIFESTO_CLOSER = [
  "Every dot connected.",
  "Every hour returned.",
  "Every practitioner amplified.",
  "",
  "The proactive health era starts now.",
  "We are building the operating system.",
  "Be on the list when it ships.",
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// LEGACY content shape used by Navbar / Footer / WaitlistForm / etc.
// ──────────────────────────────────────────────────────────────────────────────

export const content = {
  nav: { items: NAV_ITEMS as readonly { label: string; href: string }[], cta: "Join waitlist" },
  contact: { email: SITE.email, location: SITE.location },
  socials: SOCIALS,
  footer: {
    tagline: "the AI-native operating system for proactive health",
    bottom: "© 2026 Xenios Technologies, Inc. — Austin, TX · in stealth",
    disclaimer: "not a medical device. not medical advice.",
    legal: [
      { label: "privacy", href: "/privacy" },
      { label: "terms", href: "/terms" },
    ],
    columns: {
      product: [
        { label: "product", href: "/product" },
        { label: "agents", href: "/agents" },
        { label: "telemedicine", href: "/telemedicine" },
        { label: "storefront", href: "/storefront" },
        { label: "network", href: "/network" },
        { label: "ontology", href: "/ontology" },
        { label: "developers", href: "/developers" },
        { label: "enterprise", href: "/enterprise" },
        { label: "ecosystem", href: "/ecosystem" },
        { label: "for practitioners", href: "/for-practitioners" },
      ],
      company: [
        { label: "manifesto", href: "/manifesto" },
        { label: "about", href: "/about" },
        { label: "careers", href: "/careers" },
        { label: "investors", href: "/investors" },
        { label: "press", href: "/press" },
        { label: "contact", href: "/contact" },
        { label: "security", href: "/security" },
        { label: "compliance", href: "/compliance" },
      ],
    },
  },
  waitlistForm: {
    fields: {
      firstName: { label: "FIRST NAME", placeholder: "" },
      lastName: { label: "LAST NAME", placeholder: "" },
      email: { label: "EMAIL", placeholder: "you@practice.com" },
      practitionerType: { label: "I AM A...", placeholder: "Pick the closest match" },
      city: { label: "CITY", placeholder: "Austin" },
      country: { label: "COUNTRY", placeholder: "United States" },
      freeText: { label: "WHAT YOU'D MOST WANT XENIOS TO SOLVE FIRST (OPTIONAL)", placeholder: "" },
      howHeard: { label: "HOW DID YOU HEAR ABOUT US? (OPTIONAL)", placeholder: "" },
      consent: { label: "I'm okay receiving build updates from xenios at the email above." },
    },
    submit: "Join the waitlist →",
    submitting: "Joining...",
    consentRequired: "Please confirm you're okay receiving build updates.",
    errorGeneric: "Something went wrong. Please try again.",
  },
  ribbon: {
    prefix: "the AI-native OS for proactive health · ",
    cta: "join the waitlist →",
    href: "/waitlist",
  },
  contactPage: {
    eyebrow: "ONE INBOX. EVERY DOOR.",
    headline: "Talk to xenios.",
    sub: "team@xeniostechnology.com is read by a human. We reply to every serious note inside two business days.",
    successTitle: "we have it.",
    successBody: "A human reads every reply. Expect us inside two business days.",
    personaOptions: [
      { value: "practitioner", label: "Practitioner / clinic", prefix: "[PRACTITIONER]" },
      { value: "investor", label: "Investor", prefix: "[INVESTOR]" },
      { value: "journalist_creator", label: "Press / creator / influencer", prefix: "[PRESS]" },
      { value: "integration_partner", label: "Integration partner", prefix: "[PARTNER]" },
      { value: "enterprise", label: "Enterprise / system", prefix: "[ENTERPRISE]" },
      { value: "candidate", label: "Candidate (open role)", prefix: "[ROLE — OPEN]" },
      { value: "other", label: "Something else", prefix: "[HELLO]" },
    ] as const,
  },
  waitlistPage: {
    eyebrow: "EARLY ACCESS",
    headline: "Be on the list when the proactive health OS ships.",
    counter: "550+ on the waitlist · live",
    trustBlock: [
      "From the team behind $710M+ in prior exits including FinDox and InstaMed.",
      "Austin, TX · pre-seed · stealth.",
      "We don't share your email. Ever. See /security.",
    ],
    success: {
      headline: "You're in.",
      sub: (pos: number, email: string) => `You're #${pos} on the waitlist. We just sent a confirmation to ${email}.`,
      followups: ["Follow @officialxenios on Instagram", "Follow xenios on LinkedIn"],
      tail: "The vision shows up there first.",
    },
  },
};
