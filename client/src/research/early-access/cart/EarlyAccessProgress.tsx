import type { EarlyAccessCheckoutStep } from "./history";

const STEPS: readonly Readonly<{ key: EarlyAccessCheckoutStep; label: string }>[] = [
  { key: "catalog", label: "Catalogue" },
  { key: "cart", label: "Cart" },
  { key: "details", label: "Shipping" },
  { key: "review", label: "Review" },
  { key: "payment", label: "Payment" },
  { key: "status", label: "Status" },
];

export function EarlyAccessProgress({ step, onBack }: Readonly<{ step: EarlyAccessCheckoutStep; onBack?: () => void }>) {
  const index = Math.max(0, STEPS.findIndex((entry) => entry.key === step));
  return (
    <nav aria-label="Early Access checkout progress" className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="mono-label text-ink-mute">Step {index + 1} of {STEPS.length} · {STEPS[index]?.label}</p>
        {onBack ? <button type="button" className="btn btn-secondary" onClick={onBack}>Back</button> : null}
      </div>
      <ol className="hidden min-w-0 grid-cols-6 gap-2 md:grid" aria-label="Checkout steps">
        {STEPS.map((entry, position) => (
          <li key={entry.key} aria-current={position === index ? "step" : undefined}
            className={`rounded border px-2 py-2 text-center body-xs ${position === index ? "border-[var(--pulse)] font-700" : "border-[var(--rule)] text-ink-mute"}`}>
            {entry.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}
