import type {
  EarlyAccessCartContact,
  EarlyAccessCartShipping,
} from "@shared/research/early-access-cart";

export function cartContactProblems(contact: EarlyAccessCartContact): string[] {
  const problems: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim())) {
    problems.push("Enter a valid email address for order updates.");
  }
  const digits = contact.phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    problems.push("Enter a valid phone number, 7 to 15 digits.");
  }
  return problems;
}

export function cartShippingProblems(shipTo: EarlyAccessCartShipping): string[] {
  const problems: string[] = [];
  if (shipTo.recipientName.trim().length < 2) problems.push("Enter the recipient's name.");
  if (shipTo.line1.trim().length < 3) problems.push("Enter the street address.");
  if (shipTo.city.trim().length < 2) problems.push("Enter the city.");
  if (shipTo.region.trim().length < 2) problems.push("Enter the state or region.");
  if (shipTo.postalCode.trim().length < 3) problems.push("Enter the postal code.");
  if (shipTo.country !== "US") problems.push("Early Access currently ships within the US.");
  return problems;
}

export function EarlyAccessCartDetails({
  contact,
  shipTo,
  problems,
  busy,
  onContact,
  onShipTo,
  onBack,
  onContinue,
}: Readonly<{
  contact: EarlyAccessCartContact;
  shipTo: EarlyAccessCartShipping;
  problems: readonly string[];
  busy: boolean;
  onContact(contact: EarlyAccessCartContact): void;
  onShipTo(shipTo: EarlyAccessCartShipping): void;
  onBack(): void;
  onContinue(): void;
}>) {
  const field = (name: keyof EarlyAccessCartShipping, value: string) => {
    onShipTo({
      ...shipTo,
      [name]:
        name === "country"
          ? "US"
          : name === "line2"
            ? value || null
            : value,
    });
  };

  return (
    <section className="grid gap-5" aria-labelledby="cart-details-heading">
      <div>
        <p className="mono-cap text-pulse">Contact and shipping</p>
        <h2 id="cart-details-heading" className="display-xs mt-2">Where should the cart go?</h2>
        <p className="body-s text-ink-mute mt-2">
          This information is used for order updates and fulfillment. It does not choose your identity.
        </p>
      </div>

      {problems.length > 0 ? (
        <div className="card border-[var(--pulse)] p-4" role="alert">
          <p className="body-s font-700">Review these fields:</p>
          <ul className="body-s mt-2 list-disc pl-5">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 body-s">
          Email
          <input
            className="input-field"
            autoComplete="email"
            inputMode="email"
            value={contact.email}
            onChange={(event) => onContact({ ...contact, email: event.target.value })}
          />
        </label>
        <label className="grid gap-1 body-s">
          Phone
          <input
            className="input-field"
            autoComplete="tel"
            inputMode="tel"
            value={contact.phone}
            onChange={(event) => onContact({ ...contact, phone: event.target.value })}
          />
        </label>
        <label className="grid gap-1 body-s md:col-span-2">
          Recipient
          <input
            className="input-field"
            autoComplete="name"
            value={shipTo.recipientName}
            onChange={(event) => field("recipientName", event.target.value)}
          />
        </label>
        <label className="grid gap-1 body-s md:col-span-2">
          Street address
          <input
            className="input-field"
            autoComplete="address-line1"
            value={shipTo.line1}
            onChange={(event) => field("line1", event.target.value)}
          />
        </label>
        <label className="grid gap-1 body-s md:col-span-2">
          Address line 2 <span className="text-ink-mute">(optional)</span>
          <input
            className="input-field"
            autoComplete="address-line2"
            value={shipTo.line2 ?? ""}
            onChange={(event) => field("line2", event.target.value)}
          />
        </label>
        <label className="grid gap-1 body-s">
          City
          <input
            className="input-field"
            autoComplete="address-level2"
            value={shipTo.city}
            onChange={(event) => field("city", event.target.value)}
          />
        </label>
        <label className="grid gap-1 body-s">
          State / region
          <input
            className="input-field"
            autoComplete="address-level1"
            value={shipTo.region}
            onChange={(event) => field("region", event.target.value)}
          />
        </label>
        <label className="grid gap-1 body-s">
          Postal code
          <input
            className="input-field"
            autoComplete="postal-code"
            value={shipTo.postalCode}
            onChange={(event) => field("postalCode", event.target.value)}
          />
        </label>
        <label className="grid gap-1 body-s">
          Country
          <input className="input-field" value="United States" disabled aria-disabled="true" />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onBack}>
          Back to cart
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onContinue}>
          {busy ? "Checking cart…" : "Review cart"}
        </button>
      </div>
    </section>
  );
}
