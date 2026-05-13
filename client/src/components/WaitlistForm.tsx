import { useState } from "react";
import { content } from "@/lib/content";

interface Props {
  onSuccess?: (data: { position: number; count: number }) => void;
  variant?: "light" | "dark";
  compact?: boolean;
}

const F = content.waitlistForm;

export default function WaitlistForm({ onSuccess, variant = "light", compact = false }: Props) {
  const [form, setForm] = useState({
    email: "",
    role: "",
    practiceName: "",
    teamSize: "",
    clientsActive: "",
    toolsToday: "",
    message: "",
    consent: false,
    website: "", // honeypot
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  const inputCls = `input-field ${variant === "dark" ? "dark" : ""}`;
  const isDark = variant === "dark";
  const labelCls = `eyebrow mb-2 block ${isDark ? "text-paper/70" : "text-ink-muted"}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.consent) {
      setErrorMsg(F.consentRequired);
      return;
    }
    setStatus("submitting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          role: form.role,
          practiceName: form.practiceName || null,
          teamSize: form.teamSize,
          clientsActive: form.clientsActive,
          toolsToday: form.toolsToday || null,
          message: form.message || null,
          consent: form.consent,
          website: form.website,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setStatus("error");
        setErrorMsg(data?.message || F.errorGeneric);
        return;
      }
      setStatus("success");
      onSuccess?.({ position: data.position ?? 0, count: data.count ?? 0 });
    } catch {
      setStatus("error");
      setErrorMsg(F.errorGeneric);
    }
  };

  if (compact) {
    return (
      <form
        onSubmit={handleSubmit}
        className="flex flex-col md:flex-row gap-3 w-full"
        data-testid="form-waitlist-compact"
      >
        <input
          type="email"
          required
          placeholder={F.fields.email.placeholder}
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className={`${inputCls} flex-1 md:max-w-sm`}
          data-testid="input-email"
        />
        <select
          required
          value={form.role}
          onChange={(e) => update("role", e.target.value)}
          className={`${inputCls} md:max-w-[220px]`}
          data-testid="select-role"
        >
          <option value="">I am a…</option>
          {F.roleOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          required
          value={form.teamSize}
          onChange={(e) => update("teamSize", e.target.value)}
          className={`${inputCls} md:max-w-[160px]`}
          data-testid="select-team-size"
        >
          <option value="">Team size</option>
          {F.teamSizeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          required
          value={form.clientsActive}
          onChange={(e) => update("clientsActive", e.target.value)}
          className={`${inputCls} md:max-w-[160px]`}
          data-testid="select-clients"
        >
          <option value="">Active clients</option>
          {F.clientsActiveOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label className={`flex items-center gap-2 text-xs ${isDark ? "text-paper/80" : "text-ink-muted"} md:hidden`}>
          <input type="checkbox" required checked={form.consent} onChange={(e) => update("consent", e.target.checked)} />
          {F.fields.consent.label}
        </label>
        <button
          type="submit"
          disabled={status === "submitting"}
          className={`btn btn-primary ${isDark ? "btn-on-dark" : ""}`}
          data-testid="button-submit"
        >
          {status === "submitting" ? F.submitting : F.submit}
        </button>
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(e) => update("website", e.target.value)}
          className="hidden"
          aria-hidden="true"
        />
        <label className={`hidden md:flex items-center gap-2 text-xs ${isDark ? "text-paper/80" : "text-ink-muted"} basis-full`}>
          <input type="checkbox" required checked={form.consent} onChange={(e) => update("consent", e.target.checked)} data-testid="checkbox-consent" />
          {F.fields.consent.label}
        </label>
        {errorMsg && <p className="text-error text-sm basis-full" data-testid="text-form-error">{errorMsg}</p>}
        {status === "success" && (
          <p className={`${isDark ? "text-paper" : "text-ink"} text-sm basis-full`} data-testid="text-form-success">
            You're on the list. Check your inbox.
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-waitlist-full">
      <div>
        <label htmlFor="wl-email" className={labelCls}>{F.fields.email.label}</label>
        <input
          id="wl-email"
          type="email"
          required
          placeholder={F.fields.email.placeholder}
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className={inputCls}
          data-testid="input-email"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="wl-role" className={labelCls}>{F.fields.role.label}</label>
          <select
            id="wl-role"
            required
            value={form.role}
            onChange={(e) => update("role", e.target.value)}
            className={inputCls}
            data-testid="select-role"
          >
            <option value="">{F.fields.role.placeholder}</option>
            {F.roleOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="wl-practice" className={labelCls}>{F.fields.practiceName.label}</label>
          <input
            id="wl-practice"
            type="text"
            maxLength={120}
            placeholder={F.fields.practiceName.placeholder}
            value={form.practiceName}
            onChange={(e) => update("practiceName", e.target.value)}
            className={inputCls}
            data-testid="input-practice-name"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="wl-team-size" className={labelCls}>{F.fields.teamSize.label}</label>
          <select
            id="wl-team-size"
            required
            value={form.teamSize}
            onChange={(e) => update("teamSize", e.target.value)}
            className={inputCls}
            data-testid="select-team-size"
          >
            <option value="">{F.fields.teamSize.placeholder}</option>
            {F.teamSizeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="wl-clients" className={labelCls}>{F.fields.clientsActive.label}</label>
          <select
            id="wl-clients"
            required
            value={form.clientsActive}
            onChange={(e) => update("clientsActive", e.target.value)}
            className={inputCls}
            data-testid="select-clients-active"
          >
            <option value="">{F.fields.clientsActive.placeholder}</option>
            {F.clientsActiveOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="wl-tools" className={labelCls}>{F.fields.toolsToday.label}</label>
        <input
          id="wl-tools"
          type="text"
          maxLength={300}
          placeholder={F.fields.toolsToday.placeholder}
          value={form.toolsToday}
          onChange={(e) => update("toolsToday", e.target.value)}
          className={inputCls}
          data-testid="input-tools-today"
        />
      </div>

      <div>
        <label htmlFor="wl-message" className={labelCls}>{F.fields.message.label}</label>
        <textarea
          id="wl-message"
          maxLength={1000}
          placeholder={F.fields.message.placeholder}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          className={`${inputCls} textarea-field`}
          rows={4}
          data-testid="textarea-message"
        />
      </div>

      <label className={`flex items-start gap-3 text-sm ${isDark ? "text-paper/85" : "text-ink-muted"}`}>
        <input
          type="checkbox"
          required
          checked={form.consent}
          onChange={(e) => update("consent", e.target.checked)}
          className="mt-1.5"
          data-testid="checkbox-consent"
        />
        <span>{F.fields.consent.label}</span>
      </label>

      {/* Honeypot */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={(e) => update("website", e.target.value)}
        className="hidden"
        aria-hidden="true"
      />

      {errorMsg && (
        <p className="text-error text-sm" role="alert" data-testid="text-form-error">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className={`btn btn-primary ${isDark ? "btn-on-dark" : ""} w-full md:w-auto`}
        data-testid="button-submit"
      >
        {status === "submitting" ? F.submitting : F.submit}
      </button>
    </form>
  );
}
