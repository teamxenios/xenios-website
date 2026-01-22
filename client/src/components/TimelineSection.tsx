import Section from "./Section";

export default function TimelineSection() {
  return (
    <Section className="border-t border-border">
      <div className="grid md:grid-cols-3 gap-12 text-center md:text-left">
        <div className="space-y-6 relative">
          <div className="text-5xl font-display font-bold text-muted-foreground/20">01</div>
          <h3 className="text-2xl font-display font-medium">Within Minutes</h3>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Connect your devices</li>
            <li>• Baseline establishment</li>
            <li>• Initial metabolic reading</li>
          </ul>
        </div>
        <div className="space-y-6 relative">
          <div className="text-5xl font-display font-bold text-muted-foreground/20">02</div>
          <h3 className="text-2xl font-display font-medium">Within Days</h3>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Pattern recognition</li>
            <li>• Sleep cycle analysis</li>
            <li>• Stress trigger identification</li>
          </ul>
        </div>
        <div className="space-y-6 relative">
          <div className="text-5xl font-display font-bold text-muted-foreground/20">03</div>
          <h3 className="text-2xl font-display font-medium">Within Months</h3>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Long-term trend forecasting</li>
            <li>• Lifestyle adaptation</li>
            <li>• Validated health improvement</li>
          </ul>
        </div>
      </div>
    </Section>
  );
}
