import { ShieldCheck, Zap, Brain, Activity } from "lucide-react";
import Section from "./Section";

const PROPS = [
  {
    icon: ShieldCheck,
    title: "Clinical Accuracy",
    desc: "Validated against gold-standard medical equipment for reliable data you can trust."
  },
  {
    icon: Zap,
    title: "Instant Feedback",
    desc: "Latency-free processing means you know your body's status the moment it changes."
  },
  {
    icon: Brain,
    title: "AI Interpretation",
    desc: "Our neural engine contextualizes data points to explain 'why' not just 'what'."
  },
  {
    icon: Activity,
    title: "Trend Forecasting",
    desc: "Predictive modeling helps you anticipate health dips before they become problems."
  }
];

export default function ValueProps() {
  return (
    <Section id="included">
      <div className="mb-16 max-w-2xl">
        <h2 className="text-4xl md:text-5xl font-display font-medium tracking-tight mb-6">
          Intelligence, <br />
          <span className="text-muted-foreground">encoded.</span>
        </h2>
        <p className="text-xl text-muted-foreground">
          We've condensed a medical lab into a seamless digital experience.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PROPS.map((prop, i) => (
          <div key={i} className="p-8 bg-secondary/30 rounded-2xl hover:bg-secondary/50 transition-colors">
            <prop.icon className="w-8 h-8 mb-6 text-foreground" strokeWidth={1.5} />
            <h3 className="text-xl font-display font-medium mb-3">{prop.title}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {prop.desc}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
