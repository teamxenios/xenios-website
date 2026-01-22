import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import { content } from "@/lib/content";
import { Check, Clock, Shield, Star, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";

export default function Coaches() {
  const [_, setLocation] = useLocation();

  const handleApply = () => {
    // Scroll to waitlist or open application form
    document.getElementById('application-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-24 lg:pt-48 lg:pb-32 px-6 border-b border-border bg-secondary/5">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-display font-semibold tracking-tighter mb-6"
          >
            {content.coachesPage.hero.title}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl md:text-2xl text-muted-foreground font-light leading-relaxed mb-12 max-w-2xl mx-auto"
          >
            {content.coachesPage.hero.subtitle}
          </motion.p>
          <motion.button 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onClick={handleApply}
            className="bg-primary text-primary-foreground h-14 px-8 rounded-full text-lg font-medium hover:scale-105 transition-transform active:scale-95 shadow-lg shadow-primary/20"
          >
            {content.coachesPage.hero.cta}
          </motion.button>
        </div>
      </section>

      {/* Requirements & Commitment Grid */}
      <Section className="bg-background">
        <div className="grid md:grid-cols-2 gap-16">
          {/* Requirements */}
          <div className="space-y-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-foreground">
                <Users size={24} />
              </div>
              <h2 className="text-3xl font-display font-medium">{content.coachesPage.requirements.title}</h2>
            </div>
            <ul className="space-y-6">
              {content.coachesPage.requirements.items.map((item, i) => (
                <li key={i} className="flex items-start gap-4 text-lg text-muted-foreground">
                  <Check className="w-6 h-6 text-primary shrink-0 mt-1" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Time Commitment */}
          <div className="space-y-8 p-8 border border-border rounded-3xl bg-secondary/10">
            <div className="flex items-center gap-4 mb-6">
               <div className="w-12 h-12 rounded-full bg-background border border-border flex items-center justify-center text-foreground">
                <Clock size={24} />
              </div>
              <h2 className="text-3xl font-display font-medium">{content.coachesPage.commitment.title}</h2>
            </div>
            <p className="text-xl text-foreground font-medium">
              {content.coachesPage.commitment.description}
            </p>
            <div className="flex items-start gap-3 p-4 bg-background rounded-xl border border-border">
              <Shield className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                {content.coachesPage.commitment.note}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Benefits */}
      <Section className="bg-foreground text-background">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
             <h2 className="text-4xl font-display font-medium mb-4">{content.coachesPage.benefits.title}</h2>
             <p className="text-zinc-400">Exclusive perks for our founding partners.</p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-6">
            {content.coachesPage.benefits.items.map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
                <Star className="w-6 h-6 text-white shrink-0" />
                <span className="text-lg font-medium text-zinc-200">{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center" id="application-form">
            <button 
              onClick={() => window.open('mailto:partners@xenios.inc?subject=Founding%20Partner%20Application', '_blank')}
              className="bg-white text-black h-14 px-12 rounded-full text-lg font-medium hover:bg-zinc-200 transition-colors w-full sm:w-auto"
            >
              Apply via Email
            </button>
            <p className="mt-4 text-sm text-zinc-500">
              Limited spots available for the Q1 2026 cohort.
            </p>
          </div>
        </div>
      </Section>

      <Footer />
    </div>
  );
}
