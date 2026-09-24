import { useState } from "react";
import { Link, useLocation } from "wouter";
import { content } from "@/lib/content";
import { useWaitlistCount } from "@/hooks/use-waitlist-count";

function TopRibbonContent() {
  const [hidden, setHidden] = useState(false);
  const count = useWaitlistCount();
  if (hidden) return null;
  return (
    <div className="bg-ink text-paper" data-testid="ribbon-top" role="region" aria-label="Site announcement">
      <div className="container-x">
        <div className="flex items-center justify-between gap-3 py-2 text-[12px] tabular">
          <p className="truncate font-medium">
            <span className="opacity-90">{content.ribbon.prefix}</span>{" "}
            <Link
              href={content.ribbon.href}
              data-testid="link-ribbon-cta"
              className="text-paper underline-offset-2 hover:underline font-semibold"
            >
              {content.ribbon.cta}
            </Link>{" "}
            <span className="ml-2 opacity-90 mono-cap">
              <span className="counter-dot align-middle inline-block mr-2"></span>
              LIVE • {count.toLocaleString()} on the waitlist
            </span>
          </p>
          <button
            onClick={() => setHidden(true)}
            aria-label="Dismiss announcement"
            data-testid="button-ribbon-dismiss"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-paper/70 hover:text-paper text-base px-2 -mr-2"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TopRibbon() {
  const [location] = useLocation();
  // The founding-cohort ribbon belongs to the professional AI workspace. On
  // Care routes it could be mistaken for clinical availability or a Care
  // price, both of which are owned by live Care authorities instead of static
  // marketing copy. Keep the shared Xenios navigation, but remove that
  // unrelated promotion from the whole exact /care route family.
  const isCareRoute = location === "/care" || location.startsWith("/care/");
  if (isCareRoute) return null;
  return <TopRibbonContent />;
}
