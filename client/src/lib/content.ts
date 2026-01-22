import { ShieldCheck, Zap, Brain, Activity, Heart, Globe, Layers, Users } from "lucide-react";

export const content = {
  hero: {
    title: {
      line1: "PROACTIVE",
      line2: "PREVENTIVE",
      line3: "PERFORMANCE."
    },
    subtitle: "The next operating system for proactive and preventive health professionals. Empowering coaches and trainers with clinical-grade workflows.",
    cta: "Request Early Access",
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
    description: "A command center for your entire team. Monitor compliance, readiness, and load at a glance."
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
      { question: "Who is Xenios designed for?", answer: "Xenios is built specifically for personal trainers, health coaches, strength coaches, and team performance staff." },
      { question: "Does it integrate with wearables?", answer: "Yes, we support partner integrations with major wearable providers to aggregate client data." },
      { question: "Is this an EHR system?", answer: "No. Xenios is a performance management operating system, not an Electronic Health Record." },
      { question: "Is client data secure?", answer: "Absolutely. We employ enterprise-grade security and strict permission controls for all data." },
      { question: "Can I use it for a single team?", answer: "Yes, our team plans are scalable from small groups to professional organizations." },
      { question: "Do you offer API access?", answer: "Yes, data interoperability is core to our mission. API access is available on Pro plans." },
      { question: "Is there a limit on clients?", answer: "Our pricing tiers are designed to scale with your business or organization size." },
      { question: "Can staff share access?", answer: "Yes, we support granular roles for head coaches, assistants, and support staff." },
      { question: "Does it replace my programming tool?", answer: "Xenios is designed to work alongside your programming tools, focusing on holistic monitoring and management." },
      { question: "How do I get started?", answer: "Request early access to join our pilot program for performance professionals." }
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
      social: ["TW", "IG", "LI"]
    }
  }
};
