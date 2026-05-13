import { useState } from "react";
import { Link } from "wouter";
import { content } from "@/lib/content";
import { useWaitlistCount } from "@/hooks/use-waitlist-count";

export default function TopRibbon() {
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
              LIVE • {count.toLocaleString()}
            </span>
          </p>
          <button
            onClick={() => setHidden(true)}
            aria-label="Dismiss announcement"
            data-testid="button-ribbon-dismiss"
            className="text-paper/70 hover:text-paper text-base px-2 -mr-2"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
