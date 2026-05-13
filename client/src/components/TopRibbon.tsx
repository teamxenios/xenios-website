import { useEffect, useState } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";
import { content } from "@/lib/content";

const STORAGE_KEY = "xenios-ribbon-dismissed-v1";

export default function TopRibbon() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  };

  return (
    <div className="bg-ink text-cream relative z-50" data-testid="top-ribbon">
      <div className="container mx-auto px-6 py-2.5 flex items-center justify-center text-sm">
        <span className="inline-flex items-center gap-2 text-center">
          <span className="w-1.5 h-1.5 rounded-full bg-orange animate-pulse-dot" />
          <span className="text-mono-100">
            {content.ribbon.text} {content.ribbon.suffix}{" "}
            <Link
              href={content.ribbon.href}
              className="text-orange underline-offset-4 hover:underline"
              data-testid="link-ribbon-cta"
            >
              → {content.ribbon.cta}
            </Link>
          </span>
        </span>
        <button
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-mono-300 hover:text-cream transition-colors"
          data-testid="button-ribbon-dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
