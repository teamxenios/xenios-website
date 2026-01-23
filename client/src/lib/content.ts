import { ShieldCheck, Zap, Brain, Activity, Heart, Globe, Layers, Users } from "lucide-react";

export const content = {
  contact: {
    email: "team@xeniostechnology.com",
    phone: "737-418-6381",
    location: "Austin, Texas",
    socials: [
      { label: "Instagram", url: "https://www.instagram.com/officialxenios/?hl=en" },
      { label: "LinkedIn", url: "https://www.linkedin.com/company/officialxenios" }
    ]
  },
  hero: {
    title: {
      line1: "The operating",
      line2: "system for proactive",
      line3: "health professionals."
    },
    subtitle: "Xenios reduces admin work, captures coaching intelligence, and turns real sessions and client data into better decisions and better outcomes.",
    cta: "Join the Waitlist",
    ctaSecondary: "For Coaches",
    builtFor: [
      "Personal Trainers",
      "Health Coaches", 
      "Strength Coaches",
      "Team Coaches",
      "Pro Athlete Coaches",
      "Basketball",
      "Football",
      "Performance Staff"
    ],
    features: [
      {
        icon: Activity,
        title: "Clinical Grade Workflows",
        text: "Standardize your coaching methodology with validated protocols and precise metric tracking."
      },
      {
        icon: Globe,
        title: "Connected Ecosystem",
        text: "Seamlessly aggregate data from wearables, labs, and assessment tools in one view."
      },
      {
        icon: Layers,
        title: "Data Interoperability",
        text: "Future connectivity ensuring your data flows freely between the tools you trust."
      },
      {
        icon: Users,
        title: "Team Management",
        text: "Orchestrate performance for entire rosters with granular permission controls."
      }
    ]
  },

  credibility: {
    statement: "Engineered for the demands of elite performance environments.",
    items: [
      "200+ letters of intent from elite coaches",
      "10+ hours per week saved by reducing admin",
      "Real coaching workflows, not generic templates"
    ]
  },
  
  whatItDoes: {
    headline: "What Xenios does.",
    description: "A unified operating system that sits at the center of your coaching practice.",
    cards: [
      {
        title: "Capture",
        description: "Record sessions, transcribe automatically, and extract the important moments. Ingest data from wearables, labs, scans, and documents via secure connectors.",
        icon: "Mic"
      },
      {
        title: "Understand",
        description: "Coaching analytics that identify what works and where clients stall. Turn raw data sources into clear performance vectors.",
        icon: "Brain"
      },
      {
        title: "Operate",
        description: "One workflow hub for programming, check-ins, documentation, and communication. Eliminate tool fatigue and contextual switching.",
        icon: "Command"
      }
    ]
  },

  nav: {
    links: [
      { id: "included", label: "Platform" },
      { id: "conditions", label: "Focus Areas" },
      { id: "foryou", label: "For Coaches" },
      { id: "forpros", label: "For Teams" },
      { id: "faq", label: "FAQ" }
    ],
    cta: "Join Waitlist"
  },

  ticker: [
    { label: "Recovery", value: "92", unit: "%", desc: "Readiness optimized" },
    { label: "Load", value: "Low", unit: "vol", desc: "Training load balanced" },
    { label: "Sleep", value: "8.2", unit: "hrs", desc: "Restoration target met" },
    { label: "Mobility", value: "95", unit: "pts", desc: "Range of motion peak" },
    { label: "Strength", value: "PR", unit: "kg", desc: "New baseline set" },
    { label: "HRV", value: "112", unit: "ms", desc: "Autonomic balance" },
    { label: "Zone 2", value: "45", unit: "min", desc: "Aerobic base building" },
    { label: "Recovery", value: "92", unit: "%", desc: "Readiness optimized" },
    { label: "Load", value: "Low", unit: "vol", desc: "Training load balanced" },
    { label: "Sleep", value: "8.2", unit: "hrs", desc: "Restoration target met" },
    { label: "Mobility", value: "95", unit: "pts", desc: "Range of motion peak" }
  ],

  valueProps: {
    headline: "The OS for",
    headlineAccent: "prevention.",
    description: "Built for personal trainers, strength coaches, and performance staff who demand more.",
    items: [
      {
        icon: ShieldCheck,
        title: "Validated Protocols",
        desc: "Implement evidence-based strategies without the administrative burden."
      },
      {
        icon: Zap,
        title: "Partner Integrations",
        desc: "Connect your favorite hardware and software for a unified coaching experience."
      },
      {
        icon: Brain,
        title: "Intelligent Insights",
        desc: "Turn raw streams of athlete data into clear, actionable programming adjustments."
      },
      {
        icon: Activity,
        title: "Performance Trending",
        desc: "Visualize long-term adaptation and prevent overtraining before it occurs."
      }
    ]
  },

  whatIf: {
    headline: "What if performance was...",
    points: [
      { title: "Integrated, not isolated", desc: "All your athlete data in a single, secure environment." },
      { title: "Proactive, not reactive", desc: "Address limitations before they become injuries." },
      { title: "Collaborative, not siloed", desc: "Keep S&C, medical, and coaching staff aligned." },
      { title: "Continuous, not episodic", desc: "Monitor adaptation 24/7, not just during sessions." },
      { title: "Scalable, not manual", desc: "Automate routine analysis to focus on coaching." }
    ]
  },

  dashboard: {
    headline: "Your roster, visualized.",
    description: "A command center for your entire team. Monitor compliance, readiness, and load at a glance.",
    cards: [
      { title: "Readiness Score", value: "87", unit: "%", trend: "+5", status: "high" },
      { title: "HRV Trend", value: "68", unit: "ms", trend: "+12", status: "high" },
      { title: "Training Load", value: "Moderate", unit: "", trend: "", status: "moderate" },
      { title: "Sleep Consistency", value: "7.4", unit: "hrs", trend: "-0.3", status: "moderate" },
      { title: "Zone 2 Minutes", value: "142", unit: "min", trend: "+18", status: "high" },
      { title: "Recovery Status", value: "Good", unit: "", trend: "", status: "high" },
    ],
    chartLabels: {
      weeks: ["Week 1", "Week 2", "Week 3", "Week 4"],
      levels: ["Low", "Moderate", "High"],
      comparison: ["Baseline", "Current"],
    },
    sidebar: [
      { title: "Session Notes", count: 12, label: "This week" },
      { title: "Strength Progress", count: 8, label: "PRs logged" },
      { title: "Client Adherence", count: 94, label: "% compliance" },
      { title: "Check-in Summary", count: 23, label: "Completed" },
    ],
    athletes: [
      { name: "Alex M.", readiness: 92, status: "Ready" },
      { name: "Jordan K.", readiness: 78, status: "Monitor" },
      { name: "Sam T.", readiness: 85, status: "Ready" },
      { name: "Chris L.", readiness: 64, status: "Rest" },
    ]
  },

  features: [
    {
      title: "Workflow Standardization",
      desc: "Create and deploy custom assessment protocols across your entire organization. Ensure consistency in data collection and athlete monitoring.",
      image: "/feature-geo-1.png",
      align: "left"
    },
    {
      title: "Future Connectivity",
      desc: "Built for the era of connected health. We prioritize data interoperability so you can build the tech stack that fits your philosophy.",
      image: "/feature-geo-2.png",
      align: "right"
    }
  ],

  conditions: {
    headline: "Performance Vectors.",
    categories: [
      {
        category: "Metabolic Health",
        items: ["Energy System Development", "Fuel Utilization", "Body Composition", "Metabolic Efficiency"]
      },
      {
        category: "Cardiovascular",
        items: ["Aerobic Capacity", "Recovery Kinetics", "HRV Trends", "Work Capacity"]
      },
      {
        category: "Musculoskeletal",
        items: ["Load Management", "Movement Quality", "Strength Symmetry", "Power Output"]
      },
      {
        category: "Readiness",
        items: ["Sleep Hygiene", "Stress Resilience", "Cognitive Load", "Autonomic Balance"]
      }
    ]
  },

  audience: {
    personal: {
      label: "For Coaches",
      headline: "Individual Professionals",
      description: "For personal trainers, health coaches, and strength coaches managing private clients.",
      features: [
        "Client Readiness Monitoring",
        "Automated Check-ins",
        "Program Compliance Tracking",
        "Wearable Data Aggregation",
        "Custom Branding"
      ]
    },
    professional: {
      label: "For Teams",
      headline: "Performance Staff",
      description: "For basketball, football, and pro athlete coaches managing high-performance rosters.",
      features: [
        "Roster Management",
        "Staff Roles & Permissions",
        "Department Interoperability",
        "Aggregate Reporting",
        "Secure Data Export"
      ]
    }
  },

  timeline: [
    {
      number: "01",
      title: "Onboard",
      items: ["• Import client rosters", "• Connect partner integrations", "• Set baseline protocols"]
    },
    {
      number: "02",
      title: "Monitor",
      items: ["• Track daily readiness", "• Visualize training load", "• Identify risk factors"]
    },
    {
      number: "03",
      title: "Optimize",
      items: ["• Adjust programming", "• Improving performance outcomes", "• Scale your impact"]
    }
  ],

  faq: {
    headline: "Common Questions.",
    description: "Learn more about the Xenios platform.",
    items: [
      { question: "Who is Xenios for?", answer: "Xenios is built specifically for personal trainers, health coaches, strength coaches, team performance staff, and related wellness professionals." },
      { question: "What problems does it solve?", answer: "Xenios reduces administrative burden, centralizes fragmented client data, and provides actionable intelligence to improve coaching outcomes." },
      { question: "What data sources can it use?", answer: "We connect with major wearables (Oura, Whoop, Garmin, Apple Health), lab providers, and can even ingest data from spreadsheets and PDF reports." },
      { question: "How does session recording work?", answer: "Our secure mobile app records audio during sessions, automatically transcribes it, and extracts key coaching insights and action items." },
      { question: "When does the MVP launch?", answer: "We are currently in a closed beta with select partners. The public MVP is scheduled for release in Q2 2026." },
      { question: "How do Founding Coach Partners work?", answer: "Founding Partners get early access to the platform and direct input into the product roadmap in exchange for feedback and workflow data." },
      { question: "Is client data secure?", answer: "Absolutely. We employ enterprise-grade security and strict permission controls for all data. You own your data." },
      { question: "Is this an EHR system?", answer: "No. Xenios is a performance management operating system, not an Electronic Health Record." }
    ]
  },

  footer: {
    tagline: "The operating system for high-performance biology. Powering the next generation of health professionals.",
    columns: {
      platform: {
        title: "Platform",
        links: ["Workflows", "Integrations", "Security", "Pricing"]
      },
      company: {
        title: "Company",
        links: ["About Xenios", "Careers", "Blog", "Contact"]
      }
    },
    bottom: {
      copyright: "© 2026 Xenios Inc. All rights reserved.",
      legal: ["Privacy Policy", "Terms of Service"],
      social: [
        { label: "IG", url: "https://www.instagram.com/officialxenios/?hl=en" },
        { label: "LI", url: "https://www.linkedin.com/company/officialxenios" }
      ]
    }
  },

  coachesPage: {
    hero: {
      title: "Founding Coach Partners",
      subtitle: "Co-build with Xenios during MVP. Shape the roadmap, get early access, and define the future of coaching technology.",
      cta: "Apply to be a Founding Coach Partner"
    },
    requirements: {
      title: "Who we're looking for",
      items: [
        "20+ active clients managed monthly",
        "10+ admin hours spent weekly",
        "Uses multiple data sources (wearables, spreadsheets, apps)"
      ]
    },
    commitment: {
      title: "Time Commitment",
      description: "2 to 4 hours per month plus ongoing usage of the platform.",
      note: "Only anonymized workflow samples. No private identifying client details."
    },
    benefits: {
      title: "Partner Benefits",
      items: [
        "Lifetime free access to the platform",
        "Priority support & direct engineering access",
        "Private community of elite coaches",
        "Recognition as a Founding Partner (Optional)"
      ]
    }
  }
};
