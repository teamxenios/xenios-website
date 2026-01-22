import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import CredibilityStrip from "@/components/CredibilityStrip";
import BiomarkerTicker from "@/components/BiomarkerTicker";
import WhatItDoesSection from "@/components/WhatItDoesSection";
import ValueProps from "@/components/ValueProps";
import WhatIfSection from "@/components/WhatIfSection";
import DashboardSection from "@/components/DashboardSection";
import FeatureRows from "@/components/FeatureRows";
import ConditionsSection from "@/components/ConditionsSection";
import AudienceSection from "@/components/AudienceSection";
import TimelineSection from "@/components/TimelineSection";
import FAQSection from "@/components/FAQSection";
import WaitlistForm from "@/components/WaitlistForm";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground overflow-x-hidden">
      <Navbar />

      <HeroSection />
      
      <CredibilityStrip />

      <BiomarkerTicker />
      
      <WhatItDoesSection />

      <ValueProps />
      
      <WhatIfSection />
      
      <DashboardSection />
      
      <FeatureRows />
      
      <ConditionsSection />
      
      <AudienceSection />
      
      <TimelineSection />
      
      <FAQSection />

      {/* Waitlist / CTA */}
      <Section id="waitlist" className="bg-background text-center py-32">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="max-w-xl mx-auto space-y-8"
        >
          <h2 className="text-5xl font-display font-semibold tracking-tighter">Get early access to Xenios.</h2>
          <p className="text-xl text-muted-foreground">
            The operating system for trainers, coaches, and performance teams.
          </p>
          <div className="pt-4">
            <WaitlistForm />
          </div>
        </motion.div>
      </Section>

      <Footer />
    </div>
  );
}
