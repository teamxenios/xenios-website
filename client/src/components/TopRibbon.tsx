import { Link } from "wouter";
import { content } from "@/lib/content";

export default function TopRibbon() {
  return (
    <div className="bg-ink text-paper" data-testid="ribbon-top">
      <div className="container-x">
        <div className="flex items-center justify-center gap-3 py-2 text-[11px] md:text-[12px] mono-sm overflow-hidden">
          <span className="truncate">{content.ribbon.text}</span>
          <Link
            href={content.ribbon.href}
            data-testid="link-ribbon-cta"
            className="text-orange-warm hover:text-paper whitespace-nowrap"
          >
            {content.ribbon.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
