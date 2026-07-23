import { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { ResearchStatusBadge } from "../../ui/kit";
import type { AgreementDto } from "../../adapters/activation";
import {
  signNativeAgreement,
  type NativeSignatureMethod,
  type NativeSignInput,
} from "../../adapters/esign";

// ---------------------------------------------------------------------------
// EmbeddedAgreementSigner. The native, in-page e-signature experience for the
// activation agreements step. The member reviews and signs every required
// agreement WITHOUT leaving the page: no new tab, no redirect, no iframe, no
// external login. One agreement is shown at a time, in signing order, with the
// full published text scrollable in the page, two acknowledgments (never
// prechecked), a legal-name field, and a typed or drawn signature.
//
// Honest states only: no "signed" state is shown before the server responds
// ok; the server stamps the authoritative signedAt. If the native capability
// is off, the signer shows a calm "being set up" panel rather than crashing.
// ---------------------------------------------------------------------------

export interface EmbeddedAgreementSignerProps {
  /** The ordered required agreements (electronic_record_consent first). */
  agreements: AgreementDto[];
  token: string | null;
  /** Called once, when every required agreement has been signed. */
  onAllComplete: () => void;
}

/** A stable per-attempt token so a retry replays instead of double-signing. */
function stableToken(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    // fall through to the math fallback
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** The next unsigned index at or after `from`, or -1 when none remain. */
function nextUnsigned(agreements: AgreementDto[], signed: Set<string>, from: number): number {
  for (let i = from; i < agreements.length; i += 1) {
    if (!signed.has(agreements[i].documentVersionId)) return i;
  }
  return -1;
}

function todayDisplay(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function EmbeddedAgreementSigner({
  agreements,
  token,
  onAllComplete,
}: EmbeddedAgreementSignerProps) {
  const total = agreements.length;

  // Seed the signed set from the server's per-agreement flag, then advance in
  // signing order. The set only grows as the server confirms each signature.
  const [signedIds, setSignedIds] = useState<Set<string>>(
    () => new Set(agreements.filter((a) => a.signed).map((a) => a.documentVersionId)),
  );
  const [index, setIndex] = useState<number>(() => nextUnsigned(agreements, signedIds, 0));
  const [notEnabled, setNotEnabled] = useState(false);

  const allDone = index === -1 && total > 0;

  // Fire onAllComplete exactly once, when the last required signature lands.
  const firedRef = useRef(false);
  useEffect(() => {
    if (allDone && !firedRef.current) {
      firedRef.current = true;
      onAllComplete();
    }
  }, [allDone, onAllComplete]);

  function handleSigned(documentVersionId: string) {
    setSignedIds((prev) => {
      const next = new Set(prev);
      next.add(documentVersionId);
      setIndex(nextUnsigned(agreements, next, index + 1));
      return next;
    });
  }

  if (total === 0) return null;

  if (notEnabled) {
    return (
      <section className="card" data-testid="embedded-signer-not-enabled">
        <p className="body-m font-700">Electronic signing is being set up.</p>
        <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
          In-page signing is not switched on for your account yet. Nothing is signed on your behalf, and your
          approval window is honored. You will be able to sign here the moment it opens.
        </p>
      </section>
    );
  }

  if (allDone) {
    return (
      <section className="card" data-testid="embedded-signer-complete">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
            ✓
          </span>
          <p className="body-m font-700">All agreements signed.</p>
        </div>
        <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
          Every required agreement is signed. Your signed copies have been saved to your Document Center.
        </p>
      </section>
    );
  }

  const current = agreements[index];
  const hasNext = nextUnsigned(agreements, signedIds, index + 1) !== -1;

  return (
    <div className="grid gap-4" data-testid="embedded-signer">
      <AgreementStep
        // Key by document so advancing mounts a fresh, blank step.
        key={current.documentVersionId}
        agreement={current}
        position={index + 1}
        total={total}
        hasNext={hasNext}
        token={token}
        onSigned={() => handleSigned(current.documentVersionId)}
        onCapabilityDisabled={() => setNotEnabled(true)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One agreement: full text, acknowledgments, legal name, signature, sign.
// ---------------------------------------------------------------------------

function AgreementStep({
  agreement,
  position,
  total,
  hasNext,
  token,
  onSigned,
  onCapabilityDisabled,
}: {
  agreement: AgreementDto;
  position: number;
  total: number;
  hasNext: boolean;
  token: string | null;
  onSigned: () => void;
  onCapabilityDisabled: () => void;
}) {
  // The blank form state: nothing is ever prechecked, no name, no signature.
  const [reviewedFull, setReviewedFull] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [separateAck, setSeparateAck] = useState(false);
  const [typedLegalName, setTypedLegalName] = useState("");
  const [method, setMethod] = useState<NativeSignatureMethod>("typed");
  const [drawnDirty, setDrawnDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);

  const padRef = useRef<SignatureCanvas | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  if (idempotencyKeyRef.current === null) {
    idempotencyKeyRef.current = `${agreement.documentVersionId}:${stableToken()}`;
  }

  const needsAck = agreement.requiresSeparateAcknowledgment;
  const isArbitration = agreement.category === "arbitration_agreement";
  const ackLabel = isArbitration
    ? "I separately acknowledge the arbitration provisions, including how disputes are resolved and the court and jury rights I am agreeing to give up."
    : "I separately acknowledge this release and waiver, including the claims I am giving up and the liability limits I am agreeing to.";

  const name = typedLegalName.trim();
  const signaturePresent = method === "typed" ? name.length > 0 : drawnDirty;
  const ready =
    reviewedFull && acceptTerms && (!needsAck || separateAck) && name.length > 0 && signaturePresent;

  const idBase = agreement.documentVersionId;

  function clearDrawing() {
    padRef.current?.clear();
    setDrawnDirty(false);
  }

  function extractDrawnPng(): string | null {
    const pad = padRef.current;
    if (!pad) return null;
    if (typeof pad.isEmpty === "function" && pad.isEmpty()) return null;
    const dataUrl = pad.toDataURL("image/png");
    const marker = "base64,";
    const at = dataUrl.indexOf(marker);
    return at >= 0 ? dataUrl.slice(at + marker.length) : dataUrl;
  }

  async function sign() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const drawn = method === "drawn" ? extractDrawnPng() : null;
    if (method === "drawn" && !drawn) {
      setBusy(false);
      setError("Please draw your signature, or switch to typing it.");
      return;
    }

    const input: NativeSignInput = {
      documentVersionId: agreement.documentVersionId,
      // True as a statement of fact: the FULL text is rendered above.
      fullDocumentShown: reviewedFull,
      affirmativeConsent: acceptTerms,
      ...(needsAck ? { separateAcknowledgment: separateAck } : {}),
      signatureMethod: method,
      typedLegalName: name,
      drawnPngBase64: drawn,
      idempotencyKey: idempotencyKeyRef.current as string,
    };

    const res = await signNativeAgreement(token, input);
    setBusy(false);

    // A replay returns ok with replayed:true; both are success.
    if (res.kind === "ok") {
      setSigned(true);
      return;
    }
    // The capability being off, whether surfaced as a machine code or as an
    // unpublished endpoint, is an honest "not set up yet" state, not an error.
    if (res.kind === "unavailable") {
      onCapabilityDisabled();
      return;
    }
    if (res.kind === "denied") {
      if (res.code === "capability_disabled") {
        onCapabilityDisabled();
        return;
      }
      if (res.code === "electronic_consent_required") {
        setError("Sign the electronic records consent first; it makes the other documents signable.");
        return;
      }
      setError(res.message ?? "This document cannot be signed right now. Please try again.");
      return;
    }
    setError(
      res.kind === "error" ? res.message : "This document could not be signed. Please try again.",
    );
  }

  if (signed) {
    return (
      <section
        className="card"
        aria-label={`${agreement.title} signed`}
        data-testid={`embedded-signed-${agreement.category}`}
      >
        <div className="flex items-center gap-3">
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
            ✓
          </span>
          <p className="body-m font-700" data-testid="embedded-signed-title">
            {agreement.title} signed
          </p>
        </div>
        <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
          Your signed copy has been saved to your Document Center.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-4"
          style={{ minHeight: 44 }}
          onClick={onSigned}
          data-testid="embedded-continue"
        >
          {hasNext ? "Continue to the next agreement" : "Finish"}
        </button>
      </section>
    );
  }

  return (
    <section
      className="card"
      aria-label={`${agreement.title} agreement`}
      data-testid={`embedded-agreement-${agreement.category}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mono-label text-ink-mute" data-testid="embedded-progress">
          Agreement {position} of {total}
        </p>
        <ResearchStatusBadge label="Signature required" tone="warning" />
      </div>
      <p className="body-m font-700 mt-1">{agreement.title}</p>
      <p className="mono-label text-ink-mute mt-1">
        v{agreement.semver} · {agreement.jurisdiction}
      </p>

      {/* The FULL published text, scrollable, line breaks preserved. */}
      <div
        className="ra-agreement-body body-s text-ink-2 mt-3"
        style={{
          maxHeight: 320,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          border: "1px solid var(--hairline, rgba(0,0,0,0.12))",
          borderRadius: 8,
          padding: 12,
        }}
        tabIndex={0}
        role="document"
        aria-label={`${agreement.title}, full text`}
        data-testid={`embedded-content-${agreement.category}`}
      >
        {agreement.content}
      </div>

      <div className="mt-5 grid gap-4">
        {/* Acknowledgment 1: reviewed the full agreement (fullDocumentShown). */}
        <label
          className="flex items-start gap-3 body-s text-ink-2"
          htmlFor={`ack-reviewed-${idBase}`}
          style={{ minHeight: 44 }}
        >
          <input
            id={`ack-reviewed-${idBase}`}
            type="checkbox"
            checked={reviewedFull}
            onChange={(e) => setReviewedFull(e.target.checked)}
            data-testid={`embedded-reviewed-${agreement.category}`}
          />
          <span>I confirm that I reviewed the full agreement.</span>
        </label>

        {/* Acknowledgment 2: accept the specific terms (affirmativeConsent). */}
        <label
          className="flex items-start gap-3 body-s text-ink-2"
          htmlFor={`ack-accept-${idBase}`}
          style={{ minHeight: 44 }}
        >
          <input
            id={`ack-accept-${idBase}`}
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            data-testid={`embedded-accept-${agreement.category}`}
          />
          <span>I understand and accept the specific terms above.</span>
        </label>

        {/* The separate acknowledgment, only when the registry flags it. */}
        {needsAck && (
          <label
            className="flex items-start gap-3 body-s text-ink-2"
            htmlFor={`ack-separate-${idBase}`}
            style={{ minHeight: 44 }}
          >
            <input
              id={`ack-separate-${idBase}`}
              type="checkbox"
              checked={separateAck}
              onChange={(e) => setSeparateAck(e.target.checked)}
              data-testid={`embedded-separate-${agreement.category}`}
            />
            <span>{ackLabel}</span>
          </label>
        )}

        {/* Legal name. */}
        <div>
          <label htmlFor={`legal-name-${idBase}`} className="form-label">
            Legal name
          </label>
          <input
            id={`legal-name-${idBase}`}
            className="input-field"
            autoComplete="name"
            value={typedLegalName}
            onChange={(e) => setTypedLegalName(e.target.value)}
            data-testid={`embedded-name-${agreement.category}`}
            style={{ minHeight: 44 }}
          />
        </div>

        {/* Signature: typed or drawn. */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="form-label">Signature</legend>
          <div className="flex flex-wrap gap-2 mt-1" role="radiogroup" aria-label="Signature method">
            <label className="flex items-center gap-2 body-s text-ink-2" style={{ minHeight: 44 }}>
              <input
                type="radio"
                name={`sig-method-${idBase}`}
                checked={method === "typed"}
                onChange={() => setMethod("typed")}
                data-testid={`embedded-method-typed-${agreement.category}`}
              />
              <span>Type signature</span>
            </label>
            <label className="flex items-center gap-2 body-s text-ink-2" style={{ minHeight: 44 }}>
              <input
                type="radio"
                name={`sig-method-${idBase}`}
                checked={method === "drawn"}
                onChange={() => setMethod("drawn")}
                data-testid={`embedded-method-drawn-${agreement.category}`}
              />
              <span>Draw signature</span>
            </label>
          </div>

          {method === "typed" ? (
            <div
              className="mt-3"
              data-testid={`embedded-typed-preview-${agreement.category}`}
              aria-label="Typed signature preview"
              style={{
                minHeight: 64,
                display: "flex",
                alignItems: "center",
                padding: "8px 14px",
                border: "1px solid var(--hairline, rgba(0,0,0,0.12))",
                borderRadius: 8,
                fontFamily: "'Segoe Script','Brush Script MT',cursive",
                fontStyle: "italic",
                fontSize: 26,
              }}
            >
              {name || <span className="body-s text-ink-mute" style={{ fontFamily: "inherit" }}>Your typed name appears here as your signature.</span>}
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              <div
                data-testid={`embedded-canvas-${agreement.category}`}
                style={{
                  border: "1px solid var(--hairline, rgba(0,0,0,0.24))",
                  borderRadius: 8,
                  background: "#fff",
                  touchAction: "none",
                  width: "100%",
                  maxWidth: 460,
                }}
              >
                <SignatureCanvas
                  ref={padRef}
                  penColor="#111"
                  onEnd={() => setDrawnDirty(true)}
                  canvasProps={{
                    width: 460,
                    height: 150,
                    "aria-label": `Draw your signature for ${agreement.title}`,
                    role: "img",
                    style: { width: "100%", height: 150, display: "block" },
                  }}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 44 }}
                  onClick={clearDrawing}
                  data-testid={`embedded-clear-${agreement.category}`}
                >
                  Clear
                </button>
                <span className="body-s text-ink-mute">
                  Keyboard only? Choose Type signature above.
                </span>
              </div>
            </div>
          )}
        </fieldset>

        <p className="body-s text-ink-mute" data-testid={`embedded-date-${agreement.category}`}>
          Signed date: {todayDisplay()}. Xenios records the exact time when your signature is saved.
        </p>

        <div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 44 }}
            disabled={busy || !ready}
            onClick={() => void sign()}
            data-testid={`embedded-sign-${agreement.category}`}
          >
            {busy ? "Signing..." : "Sign and continue"}
          </button>
        </div>

        {error && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }} data-testid="embedded-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
