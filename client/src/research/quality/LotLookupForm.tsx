import { type FormEvent, useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { useLocation } from "wouter";
import { normalizePublicLotCode } from "@shared/research/quality/public-lot";

export function LotLookupForm({
  initialLotCode = "",
  onExactSubmit,
}: {
  initialLotCode?: string;
  onExactSubmit?: (lotCode: string) => boolean;
}) {
  const [, setLocation] = useLocation();
  const [value, setValue] = useState(initialLotCode);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => setValue(initialLotCode), [initialLotCode]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const lotCode = normalizePublicLotCode(value);
    if (lotCode === null) {
      setError("Use 3–64 letters, numbers, periods, underscores, or hyphens.");
      return;
    }
    setError(null);
    if (onExactSubmit?.(lotCode)) return;
    setLocation(`/research/lots/${encodeURIComponent(lotCode)}`);
  }

  return (
    <form className="quality-lookup" onSubmit={submit} noValidate>
      <label className="mono-label text-ink-mute" htmlFor={inputId}>
        Lot code from the product label
      </label>
      <div>
        <input
          autoCapitalize="characters"
          autoComplete="off"
          className="input-field"
          id={inputId}
          name="lotCode"
          onChange={(event) => {
            setValue(event.target.value);
            if (error !== null) setError(null);
          }}
          placeholder="Example: LOT-2026-001"
          spellCheck={false}
          value={value}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error !== null}
        />
        {error ? (
          <p className="body-s mt-2" id={errorId} role="alert" style={{ color: "var(--error)" }}>
            {error}
          </p>
        ) : null}
      </div>
      <button className="btn btn-primary" type="submit">
        Verify lot <Search aria-hidden="true" size={17} />
      </button>
    </form>
  );
}
