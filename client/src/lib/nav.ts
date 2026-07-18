import { SOCIALS, SITE } from "./content";

export type NavLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavLink[];
};

export const primaryNav: NavLink[] = [
  { label: "Product", href: "/product" },
  { label: "For Coaches", href: "/for-coaches" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Research", href: "/research" },
  { label: "Careers", href: "/careers" },
  { label: "About", href: "/about" },
];

export const menuGroups: NavGroup[] = [
  {
    label: "Product",
    items: [
      { label: "Product", href: "/product" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "For Coaches", href: "/for-coaches" },
      { label: "For Clients", href: "/for-clients" },
      { label: "Storefront", href: "/storefront" },
      { label: "Network", href: "/network" },
      { label: "Ecosystem", href: "/ecosystem" },
      { label: "For Practitioners", href: "/for-practitioners" },
      { label: "Research", href: "/research" },
      { label: "Book a Call", href: "/book" },
      { label: "Early Access", href: "/waitlist" },
      { label: "Concepts", href: "/concepts" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "Manifesto", href: "/manifesto" },
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Press", href: "/press" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Security", href: "/security" },
      { label: "Compliance", href: "/compliance" },
      { label: "Investors", href: "/investors" },
      { label: "llms.txt", href: "/llms.txt", external: true },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Disclosures", href: "/disclosures" },
    ],
  },
];

export const navSocials = SOCIALS;
export const contactEmail = SITE.email;
export const earlyAccessCta = { label: "Request Early Access", href: "/waitlist" } as const;
