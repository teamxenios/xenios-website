import crypto from "crypto";
import type { PlanDocumentType } from "@shared/research/member-platform";
import { capabilityEnabled } from "./capabilities";

// ---------------------------------------------------------------------------
// xenios research member platform: the document renderer seam (Wave 3, G9).
//
// Rendering is a PROVIDER, not a hard dependency: the platform must behave
// truthfully when no rendering engine is wired and no credentials exist. So
// every renderer returns a ProviderResult instead of throwing for the ordinary
// disabled path, and selectDocumentRenderer() picks the provider from the
// capability state rather than from an ambient import.
//
// PRIVACY RULE, enforced by the shape of RenderInput: the renderer receives an
// OPAQUE memberRef (the member id) and never a name, email, or any other
// contact detail. canonicalRenderJson() rebuilds the payload from an explicit
// field list, so a caller who tries to smuggle an extra field into the input
// cannot get it into a rendered document.
// ---------------------------------------------------------------------------

export type RenderSection = {
  heading: string;
  body: string;
};

export type RenderInput = {
  type: PlanDocumentType;
  title: string;
  templateVersion: string;
  // Opaque member reference (the member id). NEVER a name or an email.
  memberRef: string;
  sections: RenderSection[];
};

export type RenderedDocument = {
  bytes: Uint8Array;
  contentType: string;
  checksumSha256: string;
  byteLength: number;
};

// Provider failure codes. DISABLED is the ordinary keys-later state and maps to
// the capability_disabled denial; the others describe a wired-but-broken
// provider and are reported honestly rather than as a fake success.
export type ProviderErrorCode = "DISABLED" | "NOT_CONFIGURED" | "RENDER_FAILED";

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProviderErrorCode; message?: string };

export interface DocumentRenderer {
  render(input: RenderInput): Promise<ProviderResult<RenderedDocument>>;
}

// Thrown by a real adapter that was selected but has no engine or credentials
// behind it. Callers map this to capability_disabled and write nothing, so a
// half-wired production never produces a phantom document row.
export class NotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConfigured";
  }
}

export function isNotConfigured(err: unknown): boolean {
  return err instanceof NotConfigured || (err as { name?: unknown } | null)?.name === "NotConfigured";
}

// ---------------------------------------------------------------------------
// Canonical input (stable key order, explicit field list)
// ---------------------------------------------------------------------------

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = canonicalize(source[key]);
    return out;
  }
  return value;
}

// The exact payload a renderer is allowed to see, in a stable order. Rebuilt
// field by field on purpose: this is where the "opaque reference only" rule is
// enforced, not in a comment.
export function canonicalRenderJson(input: RenderInput): string {
  return JSON.stringify(
    canonicalize({
      type: input.type,
      title: input.title,
      templateVersion: input.templateVersion,
      memberRef: input.memberRef,
      sections: input.sections.map((section) => ({ heading: section.heading, body: section.body })),
    }),
  );
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// Disabled provider (the default when the capability is off)
// ---------------------------------------------------------------------------

export class DisabledDocumentRenderer implements DocumentRenderer {
  async render(_input: RenderInput): Promise<ProviderResult<RenderedDocument>> {
    return {
      ok: false,
      code: "DISABLED",
      message: "Document rendering is not enabled.",
    };
  }
}

// ---------------------------------------------------------------------------
// Test provider (deterministic; used only under NODE_ENV=test)
// ---------------------------------------------------------------------------

export const TEST_DOCUMENT_MARKER = "XENIOS-TEST-DOCUMENT/1";
const TEST_DOCUMENT_CONTENT_TYPE = "text/plain; charset=utf-8";

// Deterministic by construction: the bytes are the marker, the digest of the
// canonical input, and the canonical input itself. The same input always
// produces the same bytes and therefore the same checksum, so tests can pin a
// checksum without pinning a PDF library's output. Carrying the canonical JSON
// verbatim also makes "the renderer never received a name" an observable fact
// in tests rather than a claim.
export class TestDocumentRenderer implements DocumentRenderer {
  async render(input: RenderInput): Promise<ProviderResult<RenderedDocument>> {
    const canonical = canonicalRenderJson(input);
    const digest = sha256Hex(canonical);
    const bytes = Buffer.from(`${TEST_DOCUMENT_MARKER}\ndigest: ${digest}\n${canonical}\n`, "utf8");
    return {
      ok: true,
      value: {
        bytes: new Uint8Array(bytes),
        contentType: TEST_DOCUMENT_CONTENT_TYPE,
        checksumSha256: sha256Hex(bytes),
        byteLength: bytes.byteLength,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Real adapter SHELL (deliberately inert)
// ---------------------------------------------------------------------------

// The seam a real PDF engine plugs into. No PDF dependency is added to
// package.json by this lane: adding one is a coordinator decision, and an
// unwired engine must not be simulated.
//
// What would be wired here, exactly:
//   1. A server-side PDF engine dependency (the layout renderer) injected as
//      `engine` at construction, from the module that owns the dependency.
//   2. `templateVersion` selects the stored layout; the engine renders the
//      title and sections into that layout.
//   3. The engine receives the SAME canonical payload as every other provider,
//      so it never sees a member name; the opaque memberRef is the only
//      identity in the document, and it is what the storage path keys on.
//   4. The checksum is taken over the finished bytes, so it is a property of
//      the artifact and not of the request.
export type PdfEngine = {
  render(input: { title: string; templateVersion: string; sections: RenderSection[] }): Promise<Uint8Array>;
};

export class ServerPdfRenderer implements DocumentRenderer {
  constructor(private readonly engine: PdfEngine | null = null) {}

  // True only when BOTH a renderer dependency and the capability are present.
  static isConfigured(engine: PdfEngine | null): boolean {
    return engine !== null && capabilityEnabled("document_rendering");
  }

  async render(input: RenderInput): Promise<ProviderResult<RenderedDocument>> {
    // Capability off is the ordinary, truthful disabled path.
    if (!capabilityEnabled("document_rendering")) {
      return { ok: false, code: "DISABLED", message: "Document rendering is not enabled." };
    }
    // Capability on but no engine: refuse loudly. Callers catch NotConfigured
    // and write nothing, so a half-wired deployment never fabricates a record.
    if (!this.engine) {
      throw new NotConfigured(
        "ServerPdfRenderer has no PDF engine wired. Inject a PdfEngine before enabling document rendering in production.",
      );
    }
    const canonical = canonicalRenderJson(input);
    const parsed = JSON.parse(canonical) as {
      title: string;
      templateVersion: string;
      sections: RenderSection[];
    };
    try {
      const bytes = await this.engine.render({
        title: parsed.title,
        templateVersion: parsed.templateVersion,
        sections: parsed.sections,
      });
      const buffer = Buffer.from(bytes);
      return {
        ok: true,
        value: {
          bytes: new Uint8Array(buffer),
          contentType: "application/pdf",
          checksumSha256: sha256Hex(buffer),
          byteLength: buffer.byteLength,
        },
      };
    } catch (err) {
      if (isNotConfigured(err)) throw err;
      return {
        ok: false,
        code: "RENDER_FAILED",
        message: "The document could not be rendered.",
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

// Selection order, and why:
//   1. Capability OFF  -> Disabled, ALWAYS, including under test. The disabled
//      path is a real behavior with its own denial (capability_disabled), so a
//      test must be able to exercise it; letting the test provider override a
//      disabled capability would hide exactly the failure mode that matters.
//   2. NODE_ENV=test   -> the deterministic Test provider, so the suite gets
//      stable checksums with no PDF dependency.
//   3. Otherwise       -> the real adapter shell. It has no engine, so it
//      throws NotConfigured, which callers surface as capability_disabled with
//      nothing written. Nothing is ever faked in development or production.
export function selectDocumentRenderer(): DocumentRenderer {
  if (!capabilityEnabled("document_rendering")) return new DisabledDocumentRenderer();
  if (process.env.NODE_ENV === "test") return new TestDocumentRenderer();
  return new ServerPdfRenderer();
}
