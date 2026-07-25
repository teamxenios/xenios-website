import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  PRODUCT_REQUEST_CATEGORIES,
  PRODUCT_REQUEST_FILE_TYPES,
  PRODUCT_REQUEST_FREQUENCIES,
  PRODUCT_REQUEST_MAX_FILE_BYTES,
  PRODUCT_REQUEST_TIMINGS,
  type ProductRequestCategory,
  type ProductRequestFrequency,
  type ProductRequestTiming,
} from "@shared/research/product-requests";
import { useResearch } from "../../core";
import {
  confirmProductRequestFile,
  createProductRequest,
  requestProductFileUpload,
  uploadProductRequestFile,
} from "../../adapters/productRequests";
import { MEMBER_ROUTES } from "../../lib/routes";
import { ResearchMemberShell } from "../../ui/shells";
import { ResearchSecureNotice } from "../../ui/kit";

const CATEGORY_LABELS: Record<ProductRequestCategory, string> = {
  research_vial: "Research vial",
  blend: "Blend",
  supplement: "Supplement",
  laboratory_supply: "Laboratory supply",
  program: "Program",
  quantum: "Quantum",
  other: "Other",
};

const FREQUENCY_LABELS: Record<ProductRequestFrequency, string> = {
  one_time: "One time",
  occasionally: "Occasionally",
  monthly: "Monthly",
  not_sure: "Not sure",
};

const TIMING_LABELS: Record<ProductRequestTiming, string> = {
  asap: "As soon as practical",
  within_30_days: "Within 30 days",
  within_90_days: "Within 90 days",
  future_interest: "Future interest",
  researching: "Still researching",
};

function initialProductName(): string {
  try {
    return new URLSearchParams(window.location.search).get("product")?.slice(0, 180) ?? "";
  } catch {
    return "";
  }
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

export default function NewProductRequest() {
  const { memberToken } = useResearch();
  const [, navigate] = useLocation();
  const stableKey = useRef(idempotencyKey());
  const [productName, setProductName] = useState(initialProductName);
  const [category, setCategory] = useState<ProductRequestCategory>("research_vial");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [desiredPresentation, setDesiredPresentation] = useState("");
  const [desiredQuantity, setDesiredQuantity] = useState("");
  const [frequency, setFrequency] = useState<ProductRequestFrequency | "">("");
  const [timing, setTiming] = useState<ProductRequestTiming | "">("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fileProblem = useMemo(() => {
    if (!file) return null;
    if (!(PRODUCT_REQUEST_FILE_TYPES as readonly string[]).includes(file.type)) {
      return "Use a JPEG, PNG, WebP, or PDF file.";
    }
    if (file.size > PRODUCT_REQUEST_MAX_FILE_BYTES) return "The attachment must be 10 MB or smaller.";
    return null;
  }, [file]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || fileProblem) return;
    setBusy(true);
    setMessage(null);
    const created = await createProductRequest(
      {
        productName,
        category,
        description,
        brand: brand || null,
        productUrl: productUrl || null,
        desiredPresentation: desiredPresentation || null,
        desiredQuantity: desiredQuantity || null,
        expectedPurchaseFrequency: frequency || null,
        interestTiming: timing || null,
        additionalNotes: additionalNotes || null,
        contactConsent,
        idempotencyKey: stableKey.current,
      },
      memberToken,
    );
    if (created.kind !== "ok") {
      setBusy(false);
      setMessage(
        created.kind === "denied"
          ? created.message ?? "This request is not available for your account."
          : created.kind === "unauthorized"
            ? "Sign in again before submitting."
            : created.kind === "unavailable"
              ? "Product requests are not available yet."
              : created.message ?? "The request could not be submitted. Review the fields and try again.",
      );
      return;
    }

    const reference = created.data.request.reference;
    if (file) {
      const grant = await requestProductFileUpload(reference, file, memberToken);
      if (grant.kind !== "ok") {
        setBusy(false);
        setMessage(`Request ${reference} was received, but the attachment could not be prepared. Submit again to retry the attachment; the request will not duplicate.`);
        return;
      }
      const uploaded = await uploadProductRequestFile(grant.data.grant.uploadUrl, file);
      if (!uploaded) {
        setBusy(false);
        setMessage(`Request ${reference} was received, but the attachment upload did not finish. Submit again to retry the attachment; the request will not duplicate.`);
        return;
      }
      const confirmed = await confirmProductRequestFile(reference, grant.data.file.fileId, memberToken);
      if (confirmed.kind !== "ok") {
        setBusy(false);
        setMessage(`Request ${reference} was received, but the attachment could not be verified. Submit again to retry the attachment; the request will not duplicate.`);
        return;
      }
    }

    navigate(`${MEMBER_ROUTES.productRequests}?submitted=${encodeURIComponent(reference)}`);
  };

  return (
    <ResearchMemberShell
      eyebrow="Product requests"
      title="Request a research product"
      lead="Tell the research team what you are looking for. A request is reviewed as a demand signal; it does not create a product, order, price, approval, inventory, or availability promise."
      actions={
        <Link href={MEMBER_ROUTES.productRequests} className="btn btn-secondary">
          Your requests
        </Link>
      }
    >
      <form className="grid gap-6" onSubmit={(event) => void submit(event)} data-testid="product-request-form">
        <section className="card grid gap-4" aria-labelledby="request-basics">
          <h2 id="request-basics" className="body-l font-700">
            What are you looking for?
          </h2>
          <Field label="Product name" required>
            <input
              className="input-field"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              minLength={2}
              maxLength={180}
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Category" required>
            <select className="input-field" value={category} onChange={(event) => setCategory(event.target.value as ProductRequestCategory)}>
              {PRODUCT_REQUEST_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What are you looking for?" required hint="Describe the research item or presentation clearly enough for a person to review it.">
            <textarea
              className="input-field"
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={10}
              maxLength={4000}
              required
            />
          </Field>
          <Field label="Brand or manufacturer" hint="Optional">
            <input className="input-field" value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={180} />
          </Field>
          <Field
            label="Product URL"
            hint="Optional HTTPS reference. Xenios stores this link for review but does not automatically open, fetch, scrape, or preview it."
          >
            <input
              className="input-field"
              type="url"
              inputMode="url"
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              maxLength={2048}
              placeholder="https://example.com/product"
            />
          </Field>
        </section>

        <section className="card grid gap-4" aria-labelledby="request-interest">
          <h2 id="request-interest" className="body-l font-700">
            Presentation and interest
          </h2>
          <Field label="Desired size or presentation" hint="Optional">
            <input
              className="input-field"
              value={desiredPresentation}
              onChange={(event) => setDesiredPresentation(event.target.value)}
              maxLength={300}
            />
          </Field>
          <Field label="Desired quantity" hint="Optional">
            <input
              className="input-field"
              value={desiredQuantity}
              onChange={(event) => setDesiredQuantity(event.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Expected purchase frequency" hint="Optional">
            <select className="input-field" value={frequency} onChange={(event) => setFrequency(event.target.value as ProductRequestFrequency | "")}>
              <option value="">Choose one</option>
              {PRODUCT_REQUEST_FREQUENCIES.map((value) => (
                <option key={value} value={value}>
                  {FREQUENCY_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="When are you interested?" hint="Optional">
            <select className="input-field" value={timing} onChange={(event) => setTiming(event.target.value as ProductRequestTiming | "")}>
              <option value="">Choose one</option>
              {PRODUCT_REQUEST_TIMINGS.map((value) => (
                <option key={value} value={value}>
                  {TIMING_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Additional notes" hint="Optional">
            <textarea
              className="input-field"
              rows={4}
              value={additionalNotes}
              onChange={(event) => setAdditionalNotes(event.target.value)}
              maxLength={3000}
            />
          </Field>
        </section>

        <section className="card grid gap-4" aria-labelledby="request-file">
          <h2 id="request-file" className="body-l font-700">
            Reference file
          </h2>
          <Field label="Screenshot or PDF" hint="Optional. JPEG, PNG, WebP, or PDF, up to 10 MB. Stored privately.">
            <input
              className="input-field"
              type="file"
              accept={PRODUCT_REQUEST_FILE_TYPES.join(",")}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          {fileProblem && (
            <p className="body-s text-danger" role="alert">
              {fileProblem}
            </p>
          )}
          <label className="flex items-start gap-3 body-s">
            <input
              type="checkbox"
              checked={contactConsent}
              onChange={(event) => setContactConsent(event.target.checked)}
            />
            <span>The research team may contact me if more information is needed.</span>
          </label>
        </section>

        <ResearchSecureNotice>
          Include only product-identification details needed for this review. Do not include medical records, diagnoses,
          payment information, passwords, government identifiers, or other sensitive personal information.
        </ResearchSecureNotice>

        {message && (
          <p className="body-s text-ink-2" role="status" aria-live="polite">
            {message}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || Boolean(fileProblem)}
            data-testid="product-request-submit"
          >
            {busy ? "Submitting..." : "Submit request"}
          </button>
          <Link href={MEMBER_ROUTES.productRequests} className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </ResearchMemberShell>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="form-label">
        {label}
        {required ? " *" : ""}
      </span>
      {hint && <span className="body-s text-ink-mute">{hint}</span>}
      {children}
    </label>
  );
}
