import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import { content } from "@/lib/content";
import { ArrowRight, BarChart3, Zap, Globe, MapPin, Briefcase } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const philosophyIcons = [BarChart3, Zap, Globe];

export default function Careers() {
  const { toast } = useToast();
  const [talentLink, setTalentLink] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleTalentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!talentLink.trim()) return;
    toast({
      title: "Thanks for reaching out",
      description: "We'll review your profile and get in touch.",
    });
    setTalentLink("");
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      <Navbar />

      <section className="pt-32 pb-24 lg:pt-48 lg:pb-32 px-6 border-b border-border bg-secondary/5">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-display font-semibold tracking-tighter mb-6"
            data-testid="text-careers-headline"
          >
            {content.careersPage.hero.title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl md:text-2xl text-muted-foreground font-light leading-relaxed max-w-2xl mx-auto"
            data-testid="text-careers-subtitle"
          >
            {content.careersPage.hero.subtitle}
          </motion.p>
        </div>
      </section>

      <Section className="bg-background">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight mb-12 text-center" data-testid="text-philosophy-title">
            {content.careersPage.philosophy.title}
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {content.careersPage.philosophy.cards.map((card, i) => {
              const Icon = philosophyIcons[i];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="p-8 rounded-3xl border border-border bg-secondary/5 space-y-4"
                  data-testid={`card-philosophy-${i}`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
                    <Icon className="w-6 h-6 text-foreground" />
                  </div>
                  <h3 className="text-xl font-display font-medium">{card.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{card.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Section>

      <Section className="bg-background">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight mb-4 text-center" data-testid="text-roles-title">
            {content.careersPage.roles.title}
          </h2>
          <p className="text-center text-muted-foreground mb-12">
            We're a small, focused team building foundational technology.
          </p>
          <div className="space-y-4">
            {content.careersPage.roles.positions.map((role, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="group p-6 md:p-8 rounded-3xl border border-border bg-background hover:bg-secondary/5 transition-colors cursor-pointer"
                data-testid={`card-role-${i}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <h3 className="text-xl font-display font-medium group-hover:text-primary transition-colors">
                      {role.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {role.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Briefcase className="w-4 h-4" />
                      {role.type}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {role.location}
                    </span>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      <Section className="bg-foreground text-background">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-display font-medium tracking-tight mb-4" data-testid="text-talent-cta">
            {content.careersPage.talentCta.text}
          </h2>
          <p className="text-zinc-400 mb-10">
            We're always looking for exceptional people who share our mission.
          </p>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-3"
            >
              <div className="w-12 h-12 mx-auto bg-green-500/10 text-green-400 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-zinc-300 text-lg">We'll be in touch.</p>
              <button
                onClick={() => setSubmitted(false)}
                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                data-testid="button-submit-another"
              >
                Submit another
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleTalentSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <Input
                type="url"
                placeholder="LinkedIn or portfolio URL"
                value={talentLink}
                onChange={(e) => setTalentLink(e.target.value)}
                required
                className="flex-1 h-12 rounded-full bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-0 focus-visible:border-zinc-600"
                data-testid="input-talent-link"
              />
              <Button
                type="submit"
                className="h-12 px-8 rounded-full bg-white text-black hover:bg-zinc-200 font-medium text-sm whitespace-nowrap"
                data-testid="button-talent-submit"
              >
                {content.careersPage.talentCta.button}
              </Button>
            </form>
          )}
        </div>
      </Section>

      <Footer />
    </div>
  );
}
