// xenios. v3 — canonical copy
// All copy lives here. Stealth guardrails: no team-member names, no founder photos.

export type GradientPreset =
  | "grad-01-dawn"
  | "grad-02-tide"
  | "grad-03-fieldwork"
  | "grad-04-meridian"
  | "grad-05-meadow"
  | "grad-06-horizon";

export const ROTATING_ROLES = [
  "strength coaches",
  "longevity clinicians",
  "GLP-1 specialists",
  "functional medicine physicians",
  "registered dietitians",
  "nutrition coaches",
  "sleep coaches",
  "hormone therapy practitioners",
  "peptide protocol practices",
  "sports performance coaches",
  "recovery coaches",
  "mental performance coaches",
  "concierge clinicians",
  "corporate wellness directors",
  "pelvic health PTs",
  "pre/postnatal coaches",
  "endurance coaches",
  "health & life coaches",
];

export const PRACTITIONER_TILES: { value: string; label: string; oneLiner: string; preset: GradientPreset }[] = [
  { value: "strength_coach", label: "Strength coaches", oneLiner: "Programming, recovery, and load — running on one OS instead of three tools.", preset: "grad-01-dawn" },
  { value: "longevity_clinician", label: "Longevity clinicians", oneLiner: "Diagnostics, panels, and protocols unified per client, longitudinally.", preset: "grad-04-meridian" },
  { value: "glp1_specialist", label: "GLP-1 specialists", oneLiner: "Titration, side-effect tracking, and adherence with agent-managed touchpoints.", preset: "grad-02-tide" },
  { value: "functional_medicine_md", label: "Functional medicine MDs", oneLiner: "Root-cause work with the labs and history surfaced in the practitioner's voice.", preset: "grad-05-meadow" },
  { value: "registered_dietitian", label: "Registered dietitians", oneLiner: "Macros, CGM, food logs, and follow-up — agent-mediated, not copy-pasted.", preset: "grad-03-fieldwork" },
  { value: "nutrition_coach", label: "Nutrition coaches", oneLiner: "Habit work scaled by the Education and Check-in Agents.", preset: "grad-06-horizon" },
  { value: "sleep_coach", label: "Sleep coaches", oneLiner: "Oura + Eight Sleep + subjective markers, one continuous outcome view.", preset: "grad-01-dawn" },
  { value: "hormone_therapy", label: "Hormone therapy practitioners", oneLiner: "Panels, dosing, symptom tracking — context preserved between visits.", preset: "grad-04-meridian" },
  { value: "peptide_protocol", label: "Peptide protocol practices", oneLiner: "Protocols documented, scope-aware, jurisdictionally flagged.", preset: "grad-02-tide" },
  { value: "sports_performance", label: "Sports performance coaches", oneLiner: "Training load, HRV, recovery — one operating picture per athlete.", preset: "grad-05-meadow" },
  { value: "recovery_coach", label: "Recovery coaches", oneLiner: "Hyperice, Therabody, sleep, soft-tissue — handoff-ready by default.", preset: "grad-03-fieldwork" },
  { value: "mental_performance", label: "Mental performance coaches", oneLiner: "Mindset work with the same client profile as the rest of the team.", preset: "grad-06-horizon" },
  { value: "endurance_coach", label: "Endurance coaches", oneLiner: "Power, pace, and fueling — wired into the proactive stack.", preset: "grad-01-dawn" },
  { value: "concierge_clinician", label: "Concierge clinicians", oneLiner: "24/7 access tier supported by always-on agents under your judgment.", preset: "grad-04-meridian" },
  { value: "corporate_wellness", label: "Corporate wellness directors", oneLiner: "One practitioner can serve a whole company team, agent-managed.", preset: "grad-02-tide" },
  { value: "pelvic_health_pt", label: "Pelvic health PTs", oneLiner: "Sensitive scope handled with HIPAA-aware logging and consent.", preset: "grad-05-meadow" },
  { value: "pre_postnatal", label: "Pre/postnatal coaches", oneLiner: "Phase-aware protocols and check-ins through pregnancy and recovery.", preset: "grad-03-fieldwork" },
  { value: "health_life_coach", label: "Health & life coaches", oneLiner: "Whole-person work without losing the data thread.", preset: "grad-06-horizon" },
];

export const AGENTS: { name: string; role: string; never: string }[] = [
  { name: "Onboarding Agent", role: "Sends intake, pairs wearables, pulls history, schedules baseline labs.", never: "Never sets a protocol." },
  { name: "Protocol Agent", role: "Drafts programming, nutrition frames, recovery cycles in the practitioner's documented voice.", never: "Never publishes without practitioner approval until a trust threshold is set." },
  { name: "Check-in Agent", role: "Runs scheduled and adaptive check-ins; flags drift.", never: "Never makes clinical interpretations." },
  { name: "Communication Agent", role: "Handles async client messages with summaries, tone-matched drafts, escalation rules.", never: "Never responds without practitioner-defined guardrails." },
  { name: "Education Agent", role: "Pulls just-in-time micro-lessons matched to the client's protocol and current data.", never: "Never substitutes for clinician explanation." },
  { name: "Outcomes Agent", role: "Aggregates wearable, lab, subjective, and behavior data into a longitudinal outcome view.", never: "Never diagnoses." },
  { name: "Billing Agent", role: "Handles invoices, subscriptions, HSA/FSA tagging, dunning, refunds.", never: "Never sets pricing." },
  { name: "Compliance Agent", role: "Logs PHI handling, enforces scope of practice, alerts on drift.", never: "Never operates outside the configured scope." },
];

export const ECOSYSTEM_CLUSTERS: { heading: string; names: string[] }[] = [
  { heading: "Wearables & biometrics", names: ["WHOOP", "Oura", "Apple Health", "Garmin", "Polar", "Fitbit", "Coros"] },
  { heading: "Continuous glucose & metabolic", names: ["Levels", "Lingo", "Dexcom", "Stelo", "Abbott"] },
  { heading: "Labs & diagnostics", names: ["Function Health", "Superpower", "Inside Tracker", "Marek Health", "Hone", "Quest", "Labcorp"] },
  { heading: "Longevity imaging & screening", names: ["Ezra", "Prenuvo", "Neko Health"] },
  { heading: "GLP-1 & metabolic Rx", names: ["Zepbound", "Wegovy", "Ozempic", "Mounjaro", "compounded GLP-1 programs"] },
  { heading: "Peptide & advanced protocols", names: ["BPC-157 protocols", "semaglutide programs", "tirzepatide programs", "retatrutide programs"] },
  { heading: "Supplements", names: ["Thorne", "Pure Encapsulations", "Momentous", "Designs for Health"] },
  { heading: "Recovery & sleep", names: ["Hyperice", "Therabody", "Plunge", "Eight Sleep"] },
  { heading: "Nutrition tracking", names: ["Cronometer", "MacroFactor", "MyFitnessPal"] },
  { heading: "Mental performance & mindset", names: ["Headspace", "Calm", "Othership", "Open"] },
  { heading: "AI foundations", names: ["Anthropic", "OpenAI"] },
  { heading: "Training context", names: ["TrueCoach exports", "Trainerize exports"] },
  { heading: "Compliance & billing infra", names: ["Stripe", "Plaid"] },
];

export const ALL_ECOSYSTEM_NAMES = ECOSYSTEM_CLUSTERS.flatMap((c) => c.names);

export const REVENUE_CHIPS = [
  "Outcome-based pricing",
  "Recurring digital products",
  "Agent-managed group cohorts",
  "Transparent affiliate / device revenue",
  "Network referral revenue",
  "Lab & longevity reorder revenue",
  "GLP-1 & peptide protocol revenue (where lawful)",
  "Corporate wellness contracts",
  "HSA / FSA-eligible cash-pay services",
  "Concierge / 24-7 agent tier",
];

export const FAQ_QA: { q: string; a: string }[] = [
  { q: "What is xenios.?", a: "xenios. (Xenios Technologies, Austin, TX) is the AI-native operating system for proactive and preventive health practitioners — a multi-agent OS that augments the practitioner instead of replacing them." },
  { q: "Who is xenios. built for?", a: "Proactive health practitioners — strength coaches, longevity clinicians, GLP-1 specialists, functional medicine MDs, registered dietitians, recovery coaches, mental performance coaches, and the rest of the proactive stack." },
  { q: "How does xenios. use AI?", a: "xenios. is a multi-agent system. Eight specialized agents — Onboarding, Protocol, Check-in, Communication, Education, Outcomes, Billing, Compliance — work in the practitioner's voice, under their judgment, with HIPAA-aware logging and scope-of-practice guardrails." },
  { q: "Does xenios. integrate with wearables and labs?", a: "xenios. is designed to connect with WHOOP, Oura, Function Health, Levels, Eight Sleep, Inside Tracker, Hone, and the wider proactive health ecosystem. Brand names are property of their respective owners; integration availability varies." },
  { q: "Where is xenios. based?", a: "Austin, Texas. All roles are remote, Austin preferred. The team comes from $710M+ in prior exits, including FinDox and InstaMed." },
];

export const content = {
  contact: {
    email: "team@xeniostechnology.com",
    location: "Austin, TX",
  },
  socials: [
    { label: "Instagram @officialxenios", url: "https://www.instagram.com/officialxenios" },
    { label: "LinkedIn /company/officialxenios", url: "https://www.linkedin.com/company/officialxenios" },
  ],
  ribbon: {
    prefix: "xenios is in stealth. early access opens in waves.",
    cta: "join the waitlist →",
    href: "/waitlist",
  },
  nav: {
    items: [
      { href: "/product", label: "Product" },
      { href: "/for-practitioners", label: "Practitioners" },
      { href: "/ecosystem", label: "Ecosystem" },
      { href: "/network", label: "Network" },
      { href: "/about", label: "About" },
      { href: "/careers", label: "Careers" },
    ],
    cta: "Join Waitlist",
  },
  footer: {
    tagline: "the proactive health OS.",
    bottom: "© 2026 xenios technologies · Austin, TX · stealth",
    disclaimer: "Xenios is software, not medical care.",
    sitemap: [
      { href: "/", label: "Home" },
      { href: "/product", label: "Product" },
      { href: "/for-practitioners", label: "Practitioners" },
      { href: "/ecosystem", label: "Ecosystem" },
      { href: "/network", label: "Network" },
      { href: "/about", label: "About" },
      { href: "/careers", label: "Careers" },
      { href: "/waitlist", label: "Waitlist" },
      { href: "/contact", label: "Contact" },
    ],
    legal: [
      { href: "/privacy", label: "privacy" },
      { href: "/terms", label: "terms" },
    ],
  },

  home: {
    seo: {
      title: "xenios. — the proactive health OS",
      description: "The AI-native operating system for proactive and preventive health practitioners. Built in Austin. Join 550+ on the waitlist.",
      path: "/",
    },
    hero: {
      counterPill: "on the waitlist · live",
      headlinePrefix: "xenios. is the proactive health OS for",
      subhead: "Connecting every dot in the proactive health ecosystem.",
      lede: "550+ practitioners already in line — from boutique strength studios to longevity clinics, GLP-1 programs, and pro-sports performance teams.",
      primaryCta: "Join the waitlist →",
      secondaryCta: "How it works",
    },
    whoEyebrow: "WHO'S SIGNING UP",
    whoChips: [
      "Boutique strength studios",
      "Longevity clinics",
      "GLP-1 programs",
      "Functional medicine practices",
      "Pro-sports performance teams",
      "RDs and nutrition coaches",
      "Concierge clinicians",
      "Peptide protocol practices",
    ],
    whoSubline: "Built for the people who work with WHOOP, Oura, Function Health, Levels, Eight Sleep, and the rest of the proactive health stack.",
    movement: {
      eyebrow: "THE PROACTIVE HEALTH MOVEMENT",
      h2: "The proactive health economy is the largest, fastest-growing health market on earth.",
      paras: [
        "The global wellness economy reached $6.3 trillion in 2023 and is projected to hit $9 trillion by 2028 (Global Wellness Institute, 2024). Cash-pay wellness, GLP-1 prescribing, longevity diagnostics, and continuous biometrics are reshaping primary care faster than any incumbent EMR can keep up.",
        "The practitioners building this future — coaches, longevity clinicians, GLP-1 specialists, RDs, FM physicians — have been running their entire practice across a dozen disconnected tools. xenios. is the OS that finally unifies them.",
      ],
      stats: [
        "$6.3T — global wellness economy in 2023 (Global Wellness Institute, 2024)",
        "$9T — projected by 2028",
        "$710M+ — prior exits from the team",
      ],
    },
    builtFor: {
      eyebrow: "BUILT FOR",
      h2: "One operating system for every proactive health practitioner.",
    },
    ecosystem: {
      eyebrow: "DESIGNED TO CONNECT WITH",
      h2: "Designed to connect to every dot.",
      sub: "xenios. is the operating system; the ecosystem is the field it plays on.",
      disclaimer: "Brand names are property of their respective owners. xenios. is designed to connect with the proactive health ecosystem; integration availability varies by partner.",
    },
    multiAgent: {
      eyebrow: "THE MULTI-AGENT OS",
      h2: "An OS, not an app. Agents, not workflows.",
      body: "Every practice gets a team of specialized agents that work in your voice, under your judgment, never replacing you. They onboard your clients, write protocols in your style, check in on schedule, communicate with intelligence, surface education, track outcomes, send invoices, and stay compliant — so you can serve 10x to 100x the clients with 10x the depth of care.",
    },
    networkBlock: {
      eyebrow: "THE PRACTITIONER NETWORK",
      h2: "The proactive health team that finally talks to itself.",
      paras: [
        "A personal trainer hands off to an RD. The RD pings a functional medicine MD for a lab review. The MD sends a longevity panel to the client's diagnostics provider. The recovery coach loops in for return-to-training.",
        "On xenios., that handoff happens agent-to-agent — context preserved, scope respected, client experience seamless. Referral revenue routes back to the originator automatically.",
      ],
    },
    threeStrip: {
      eyebrow: "THE OS LAYER",
      items: [
        { num: "01", title: "Living Profile", body: "Every metric, every protocol, every conversation in one continuously updated profile.", preset: "grad-01-dawn" as GradientPreset },
        { num: "02", title: "Protocol Engine", body: "Programming, nutrition, recovery, supplementation — written in your voice, adapted in real time.", preset: "grad-04-meridian" as GradientPreset },
        { num: "03", title: "Outcomes Layer", body: "Biomarkers, behavior, and subjective markers tracked into measurable client outcomes.", preset: "grad-06-horizon" as GradientPreset },
      ],
    },
    revenue: {
      eyebrow: "NEW REVENUE STREAMS",
      h2: "Growth no competitor can offer.",
      body: "Because xenios. is the OS layer — connected to wearables, labs, GLP-1 pharmacies, supplements, and the practitioner network — every practitioner unlocks revenue lines that have been locked away inside disconnected platforms.",
    },
    heritage: {
      eyebrow: "HERITAGE",
      h2: "Built by operators behind $710M+ in prior exits — including FinDox and InstaMed.",
      sub: "Stealth. Pre-seed. Building in Austin.",
    },
    finalCta: {
      eyebrow: "EARLY ACCESS",
      h2: "Join the proactive health OS.",
      sub: "No spam. You'll get one email when we open early access.",
      primary: "Join the waitlist →",
      secondary: "Read the manifesto",
    },
    commonQuestions: {
      eyebrow: "COMMON QUESTIONS",
      h2: "Five answers, often asked.",
    },
  },

  product: {
    seo: {
      title: "Product — xenios. proactive health OS",
      description: "Multi-agent AI for coaches, clinicians, and longevity practitioners. Living profiles, protocols, ecosystem connectors, outcomes.",
      path: "/product",
    },
    eyebrow: "THE PRODUCT",
    h1: "The proactive health OS.",
    sub: "Seven capabilities. One operating system. Eight agents under your judgment.",
    capabilities: [
      { num: "01", name: "Living Client Profile", line: "Every metric, every protocol, every conversation in one continuously updated profile.", preset: "grad-01-dawn" as GradientPreset },
      { num: "02", name: "Protocol Engine", line: "Programming, nutrition, recovery, supplementation — written in your voice, adapted in real time.", preset: "grad-02-tide" as GradientPreset },
      { num: "03", name: "Coach Agent", line: "Your AI second-in-command. Drafts check-ins, summarizes data, never replaces your judgment.", preset: "grad-03-fieldwork" as GradientPreset },
      { num: "04", name: "Ecosystem Connector", line: "Designed to plug into wearables, labs, CGM, GLP-1, recovery, and nutrition platforms.", preset: "grad-04-meridian" as GradientPreset },
      { num: "05", name: "Outcomes Layer", line: "Biomarkers, behavior, and subjective markers tracked into measurable client outcomes.", preset: "grad-05-meadow" as GradientPreset },
      { num: "06", name: "The Practitioner Network", line: "Agent-to-agent referrals across the proactive health team.", preset: "grad-06-horizon" as GradientPreset },
      { num: "07", name: "The Revenue Layer", line: "Outcome pricing, group cohorts, transparent affiliate flows, network referral revenue. (Coming after launch.)", preset: "grad-04-meridian" as GradientPreset },
    ],
    multiAgent: {
      eyebrow: "MULTI-AGENT ARCHITECTURE",
      h2: "Eight agents. One practice. Infinite leverage.",
      principles: [
        "Voice & judgment first — every agent loads the practitioner's voice corpus and decision rules.",
        "HIPAA-aware — PHI flagged, encrypted, logged.",
        "Agents talk to each other — shared context, shared client profile, no copy-paste.",
        "Agents talk to other practitioners' agents — see the practitioner network.",
        "100× promise — one practitioner can now serve 10× to 100× the clients with 10× the depth of care.",
      ],
    },
    network: {
      eyebrow: "THE PRACTITIONER NETWORK",
      h2: "The proactive health team that finally talks to itself.",
      body: "Today, a client wired into proactive health works with five-plus practitioners, none of whom share context. xenios. solves that.",
      bullets: [
        "Agent-mediated handoff preserves the full client profile, history, and originating protocol.",
        "Scope-aware — each receiving agent operates only inside its practitioner's scope.",
        "Referral revenue routes automatically back to the originator.",
        "Network directory of xenios. practitioners filtered by modality, geography, verified credentials.",
      ],
      flowExample: "Trainer → RD → FM MD → longevity panel provider → recovery coach → mental performance coach. One client. One unified protocol. Six practitioners, all paid, all in context, all in their voice.",
    },
    revenue: {
      eyebrow: "REVENUE LAYER (COMING AFTER LAUNCH)",
      h2: "Growth no competitor can offer.",
      body: "Ten new revenue lines unlocked specifically because xenios. is the OS + agent + ecosystem layer:",
      lines: [
        "Outcome-based pricing — charge on measurable client wins, enabled by the Outcomes Layer.",
        "Recurring digital products — Protocol Agent generates courses, programs, content from existing protocols; sold as evergreen.",
        "Group cohorts — one protocol, many clients, agent-managed; cohorts of 50 without losing personalization.",
        "Transparent affiliate / device revenue — supplements, recovery, sleep — disclosed and tracked.",
        "Network referral revenue — automatic routing when handing off to another xenios. practitioner.",
        "Lab & longevity panel reorder revenue — recurring revenue on Function Health, Inside Tracker, Hone, Marek panels.",
        "GLP-1 and peptide protocol revenue where legally permissible in the practitioner's jurisdiction.",
        "Corporate wellness contracts — one practitioner serves an entire company team via the OS.",
        "HSA / FSA-eligible cash-pay services flagged automatically by the Billing Agent.",
        "Premium concierge tier — 24/7 agent access, white-glove, higher ARPU.",
      ],
      footnote: "Frame all ten as enabled by, not promised by the platform; \"coming after launch\" applies to the full Revenue Layer module.",
    },
    glossary: {
      eyebrow: "GLOSSARY",
      items: [
        { term: "proactive health OS", def: "An operating system layer — not a workflow tool — that unifies the practitioner's clients, agents, and ecosystem connections in one continuously updated profile." },
        { term: "agentic AI", def: "AI that takes action — drafts, schedules, summarizes, escalates — under explicit practitioner-defined guardrails, rather than answering one prompt at a time." },
        { term: "multi-agent system", def: "Eight specialized agents (Onboarding, Protocol, Check-in, Communication, Education, Outcomes, Billing, Compliance) that share context and operate inside scope of practice." },
        { term: "professional network", def: "Agent-to-agent handoffs between xenios. practitioners with referral revenue routed automatically back to the originator." },
        { term: "outcomes layer", def: "Longitudinal aggregation of biomarker, behavior, and subjective data into measurable client outcomes." },
      ],
    },
    closer: {
      h: "Built for the practitioners building the next era of care.",
      primary: "Join the waitlist →",
      secondary: "See the ecosystem",
    },
  },

  forPractitioners: {
    seo: {
      title: "Built for proactive health practitioners — xenios.",
      description: "Strength coaches, longevity clinicians, GLP-1 specialists, RDs, FM physicians — one OS for proactive practice.",
      path: "/for-practitioners",
    },
    eyebrow: "BUILT FOR",
    h1: "Built for proactive health practitioners.",
    sub: "Eighteen practice types. One operating system. Designed to connect with the proactive stack you already use.",
    closer: {
      h: "Whatever you practice, the OS speaks your modality.",
      body: "Every audience card maps to a tailored agent persona, a curated ecosystem connector list, and a scope-of-practice guardrail set.",
      primary: "Join the waitlist →",
      secondary: "Read the product",
    },
  },

  ecosystem: {
    seo: {
      title: "The proactive health ecosystem — xenios.",
      description: "Designed to connect with WHOOP, Oura, Function Health, Levels, Eight Sleep, and the wider proactive health stack.",
      path: "/ecosystem",
    },
    eyebrow: "THE ECOSYSTEM",
    h1: "The proactive health ecosystem.",
    sub: "Fifty-two names across thirteen clusters. xenios. is designed to connect with all of them.",
    disclaimer: "Brand names are property of their respective owners. xenios. is designed to connect with the proactive health ecosystem; integration availability varies by partner. We do not claim partnership or endorsement.",
    closer: {
      h: "If a dot in proactive health is missing from this list, tell us.",
      primary: "Join the waitlist →",
      secondary: "Suggest an integration",
    },
  },

  network: {
    seo: {
      title: "The practitioner network — xenios.",
      description: "Agent-to-agent referrals across the proactive health team. Context preserved. Scope respected. Revenue routed back.",
      path: "/network",
    },
    eyebrow: "THE NETWORK",
    h1: "The proactive health team that finally talks to itself.",
    sub: "Today, a client wired into proactive health works with five-plus practitioners — none of whom share context. xenios. solves that.",
    pillars: [
      { num: "01", title: "Agent-mediated handoff", body: "Full client profile, history, and originating protocol travel with the referral. No re-intake. No lost context." },
      { num: "02", title: "Scope-aware", body: "Each receiving agent operates only inside its practitioner's scope of practice. Compliance Agent enforces it." },
      { num: "03", title: "Referral revenue routing", body: "Revenue from a successful handoff routes automatically back to the originator. Transparent. Tracked. On every payout." },
      { num: "04", title: "Network directory", body: "Discoverable directory of xenios. practitioners filtered by modality, geography, and verified credentials." },
    ],
    flow: {
      eyebrow: "EXAMPLE FLOW",
      h2: "One client. One unified protocol. Six practitioners.",
      steps: [
        "Trainer originates the client and sets the strength baseline.",
        "RD picks up nutrition with the trainer's training load already loaded.",
        "FM MD reviews labs the RD flagged — no second intake.",
        "Longevity panel provider runs imaging on the MD's standing order.",
        "Recovery coach inherits HRV trends and panel results.",
        "Mental performance coach loops in with the full longitudinal profile.",
      ],
      footnote: "All paid. All in context. All in their voice.",
    },
    closer: {
      h: "The handoff is the product.",
      primary: "Join the waitlist →",
      secondary: "See the product",
    },
  },

  about: {
    seo: {
      title: "About xenios. — built in Austin",
      description: "From the team behind $710M+ in prior exits, including FinDox and InstaMed.",
      path: "/about",
    },
    eyebrow: "ABOUT",
    h1: "Built by operators behind $710M+ in prior exits.",
    sub: "Including FinDox and InstaMed. Stealth. Pre-seed. Building in Austin.",
    paragraphs: [
      "xenios. (Xenios Technologies, Austin, TX) is the AI-native operating system for proactive and preventive health practitioners. We started this because the practitioners who are actually building the future of preventive care have been running their entire practice across a dozen disconnected tools — and the tools weren't built for them.",
      "Healthcare's incumbent stack was built for sick care, billing codes, and reactive medicine. The proactive health practitioner — the strength coach with a $400/month membership, the longevity clinic running quarterly panels, the GLP-1 program titrating across a hundred clients — has been left to stitch their own OS out of spreadsheets, group chats, and a half-dozen narrow apps.",
      "xenios. is the OS that finally unifies them. Multi-agent. Practitioner-voiced. HIPAA-aware. Designed to connect with the proactive stack the practitioner already uses — never to replace the practitioner.",
    ],
    beliefsHeader: "What we believe",
    beliefs: [
      "Care moves upstream. The next decade of healthcare is proactive, not reactive.",
      "The practitioner is the unit of compounding. Software augments — it doesn't replace.",
      "Agents work for the practitioner — never around them. Voice and judgment first.",
      "The ecosystem is the field, not the product. xenios. is the operating system.",
      "Networks beat silos. Agent-to-agent handoffs are the future of multi-disciplinary care.",
    ],
    teamBlock: {
      h: "From the team behind",
      body: "$710M+ in prior exits including FinDox and InstaMed. We don't put founder photos on stealth sites. We don't list team names. The work speaks first.",
    },
    closer: {
      h: "Stealth. Pre-seed. Building in Austin.",
      primary: "Join the waitlist →",
      secondary: "Open careers",
    },
  },

  careers: {
    seo: {
      title: "Careers — xenios. (remote, Austin preferred)",
      description: "Help build the operating system for proactive health. Remote, Austin preferred.",
      path: "/careers",
    },
    eyebrow: "CAREERS",
    h1: "Help build the operating system for proactive health.",
    sub: "Remote, Austin preferred. All roles are founding. All ship product in their first month.",
    howWeWork: {
      h: "How we work",
      items: [
        "Remote-first, Austin-preferred. Quarterly in-person weeks.",
        "Async by default; meetings are scheduled, short, and have an artifact.",
        "Product, design, and engineering ship together — no throw-overs.",
        "We default to writing — RFCs, decision memos, interview scorecards.",
        "Compensation: meaningful equity + market cash. Pre-seed band.",
      ],
    },
    rolesEyebrow: "OPEN ROLES",
    roles: [
      { num: "01", title: "Founding engineer (full-stack)", eyebrow: "ENG", body: "Own the OS layer end-to-end — from agent runtime to client UI. Build with React, TypeScript, and the multi-agent runtime.", location: "Remote · Austin preferred", subject: "[ROLE — Founding engineer]", preset: "grad-01-dawn" as GradientPreset },
      { num: "02", title: "Founding designer (product + brand)", eyebrow: "DESIGN", body: "Carry the brand from the marketing site into the product surface. Heavy geometric sans, atmospheric gradients, editorial rigor.", location: "Remote · Austin preferred", subject: "[ROLE — Founding designer]", preset: "grad-02-tide" as GradientPreset },
      { num: "03", title: "Agent / ML engineer", eyebrow: "ENG", body: "Design the multi-agent runtime — voice loading, scope enforcement, agent-to-agent handoff, observability.", location: "Remote · Austin preferred", subject: "[ROLE — Agent engineer]", preset: "grad-04-meridian" as GradientPreset },
      { num: "04", title: "Founding GTM / practitioner relations", eyebrow: "GTM", body: "Run the early-access cohorts. Onboard the first hundred practices. Turn live use into product feedback.", location: "Remote · Austin preferred", subject: "[ROLE — GTM]", preset: "grad-05-meadow" as GradientPreset },
      { num: "05", title: "Compliance & clinical operations", eyebrow: "OPS", body: "Stand up HIPAA posture, scope-of-practice guardrails, and the legal/regulatory surface across all 18 practitioner types.", location: "Remote · Austin preferred", subject: "[ROLE — Compliance]", preset: "grad-06-horizon" as GradientPreset },
    ],
    closer: {
      h: "Don't see your role?",
      body: "If you can prove you should be on the founding team, write us with a portfolio and the role you'd build for yourself.",
      subject: "[ROLE — Open application]",
    },
  },

  waitlistPage: {
    seo: {
      title: "Join the xenios. waitlist",
      description: "Early access to the proactive health OS.",
      path: "/waitlist",
    },
    eyebrow: "EARLY ACCESS",
    h1: "Be on the list when the proactive health OS ships.",
    sub: "We're opening early access in waves. The waitlist decides the order. Tell us a little about your practice. We do the rest.",
    counterSuffix: "practitioners on the waitlist · updated in real time",
    successTitle: "YOU'RE IN",
    successPositionLabel: "on the waitlist",
    successBody: "We sent a confirmation to {email}. We'll come back when early access opens.",
    successLinks: [
      { label: "Follow along on Instagram @officialxenios", href: "https://www.instagram.com/officialxenios" },
      { label: "Connect on LinkedIn /company/officialxenios", href: "https://www.linkedin.com/company/officialxenios" },
    ],
    successCloser: "Tell another practitioner. The network only works if the right people show up.",
    trustBlock: [
      "We do not sell, share, or rent your data. We use it to decide who to onboard, in what order, and how to talk to you when early access opens.",
      "One email per wave. You can unsubscribe with a single click.",
      "xenios. is software, not medical care.",
    ],
  },

  waitlistForm: {
    submit: "Join the waitlist →",
    submitting: "joining…",
    consentRequired: "Please accept the privacy notice to continue.",
    errorGeneric: "Something broke on our side. Try again in a moment.",
    fields: {
      firstName: { label: "First name", placeholder: "First name" },
      lastName: { label: "Last name", placeholder: "Last name" },
      email: { label: "Email", placeholder: "you@practice.com" },
      practitionerType: { label: "What kind of practice?", placeholder: "Choose one" },
      city: { label: "City", placeholder: "Austin" },
      country: { label: "Country", placeholder: "United States" },
      freeText: { label: "Anything you want us to know? (optional)", placeholder: "What you do, who you serve, what's broken in your stack today." },
      howHeard: { label: "How did you hear about us? (optional)", placeholder: "A practitioner, a feed, a referral, the wind…" },
      consent: { label: "I've read how xenios. handles waitlist data and I'm happy for you to email me when early access opens." },
    },
  },

  contactPage: {
    seo: {
      title: "Contact xenios.",
      description: "team@xeniostechnology.com — single inbox for press, partners, candidates, and practitioners.",
      path: "/contact",
    },
    eyebrow: "CONTACT",
    h1: "One inbox. One human team. Two business days.",
    sub: "Tell us who you are. Subject lines are auto-prefixed so the right inbox label catches it.",
    formEyebrow: "WRITE TO US",
    cards: [
      { num: "01", title: "Practitioners", body: "If you run a proactive practice and want early access, the waitlist is the fastest path.", href: "/waitlist", hrefLabel: "Join the waitlist →", subject: "[PRACTITIONER]" },
      { num: "02", title: "Investors", body: "Pre-seed. Inbound only. Skip the deck request — write us with the thesis you'd want us to share back.", subject: "[INVESTOR]" },
      { num: "03", title: "Press & creators", body: "Stealth means we're not pitching coverage yet, but we read every note and reply when there's a fit.", subject: "[PRESS]" },
      { num: "04", title: "Integration partners", body: "If you build for the proactive stack — wearables, labs, recovery, GLP-1, supplements — we want to talk.", subject: "[PARTNER]" },
      { num: "05", title: "Candidates", body: "All open roles live on careers. Don't see a fit? Write anyway.", href: "/careers", hrefLabel: "Open roles →", subjectMulti: ["[ROLE — Founding engineer]", "[ROLE — Founding designer]", "[ROLE — Agent engineer]", "[ROLE — GTM]", "[ROLE — Compliance]", "[ROLE — Open application]"] },
      { num: "06", title: "Anything else", body: "If none of the above quite fit, write to us anyway. The team reads every note.", subject: "[HELLO]" },
    ],
    personaOptions: [
      { value: "practitioner" as const, label: "A proactive health practitioner", prefix: "[PRACTITIONER]" },
      { value: "investor" as const, label: "An investor", prefix: "[INVESTOR]" },
      { value: "journalist_creator" as const, label: "A journalist or creator", prefix: "[PRESS]" },
      { value: "integration_partner" as const, label: "An integration / brand partner", prefix: "[PARTNER]" },
      { value: "candidate" as const, label: "A candidate for a role", prefix: "[ROLE — OPEN]" },
      { value: "other" as const, label: "Something else", prefix: "[HELLO]" },
    ],
    successTitle: "we got it.",
    successBody: "The xenios. team reads every message and comes back within two business days.",
    closer: { h: "One inbox. One team.", body: "team@xeniostechnology.com — that's it. No DM black hole. No 12-step ticket flow." },
  },

  privacy: {
    seo: { title: "Privacy — xenios.", description: "How xenios. handles waitlist data.", path: "/privacy" },
    eyebrow: "LEGAL",
    h1: "Privacy.",
    paragraphs: [
      "We collect what you give us through the waitlist and contact forms — first name, last name, email, practice type, city, country, and the optional fields you choose to fill in. We attach a coarse IP-derived country and a user-agent string for spam and abuse prevention.",
      "We use this data to decide who to onboard, in what order, and how to talk to you when early access opens. We do not sell, share, or rent your data. We do not use it for advertising profiling.",
      "Email goes through Resend. Data is stored on managed PostgreSQL inside our cloud account. Backups are encrypted at rest and in transit.",
      "You can ask us to forget you, export your data, or unsubscribe by writing to team@xeniostechnology.com. We will action requests within fourteen days.",
      "When the product ships and starts handling client PHI, we'll publish a separate, more substantive privacy policy that covers HIPAA posture, BAAs, sub-processors, and data residency. Until then, this site is a marketing surface and does not collect or process client PHI.",
    ],
  },

  terms: {
    seo: { title: "Terms — xenios.", description: "Marketing-site terms of use.", path: "/terms" },
    eyebrow: "LEGAL",
    h1: "Terms of use.",
    paragraphs: [
      "This site is a marketing surface for Xenios Technologies, a Delaware corporation operating in Austin, Texas. By using it, you agree to use it lawfully and without attempting to disrupt or compromise its security.",
      "xenios. is software, not medical care. Nothing on this site, in our emails, in our social posts, or in any future product communication should be construed as medical advice, diagnosis, or treatment. Always consult a qualified clinician for personal health decisions.",
      "All trademarks, logos, and brand names referenced — including but not limited to WHOOP, Oura, Function Health, Levels, Eight Sleep, Inside Tracker, Hone, Hyperice, Therabody, Plunge, Apple Health, Garmin, Polar, Fitbit, Coros, Stripe, Plaid, Anthropic, OpenAI, and others listed in the ecosystem — are the property of their respective owners. No partnership, endorsement, or sponsorship is claimed by Xenios Technologies.",
      "Until early access opens and a master service agreement is in place, no contract is formed by joining the waitlist or contacting us.",
      "These terms can change. We'll publish the date of the most recent version when they do.",
    ],
  },
};
