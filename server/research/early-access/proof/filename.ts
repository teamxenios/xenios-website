/**
 * SAFE FILENAMES FOR A TRANSIENT PAYMENT PROOF.
 *
 * A filename is attacker controlled and it travels further than most people
 * expect: it becomes an email attachment name in an operator's mail client, it
 * is echoed to the customer, and it is written into a metadata row. So it is
 * rebuilt here rather than filtered.
 *
 * WHY REBUILDING BEATS FILTERING. A deny list has to anticipate every hostile
 * character. This module instead admits a small set of characters, normalises
 * to NFC first so a decomposed lookalike cannot smuggle a second form past the
 * allowlist, and then appends the ONE extension that the validated container
 * actually is. The result is a name that cannot contain a path separator, a
 * traversal segment, a control character, a bidi override, or a second
 * extension, because none of those can survive being reconstructed.
 *
 * THE BIDI ATTACK THIS EXISTS FOR. U+202E RIGHT-TO-LEFT OVERRIDE renders
 * "proof\u202egnp.exe" as "proof exe.png" in most mail clients. The operator
 * reads a PNG and clicks an executable. Unicode general-category Cf (format)
 * characters, the Cc controls, and the U+2066..U+2069 isolates are therefore
 * removed outright rather than escaped, and they are removed BEFORE the
 * allowlist runs so a stripped name cannot be reassembled into a hostile one.
 *
 * NOTHING HERE TOUCHES BYTES. This module never sees the file. It is pure and
 * synchronous so it can be exercised exhaustively without any I/O.
 */

import type { EarlyAccessProofContentType } from "../commerce/payment-proof";

/** The one extension each validated container is renamed to. */
const CANONICAL_EXTENSION: Readonly<Record<EarlyAccessProofContentType, string>> =
  Object.freeze({
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
  });

/** Stem length before the extension. Long enough to stay recognisable. */
export const PROOF_FILENAME_STEM_MAX = 64;

/** Used when nothing recognisable survives sanitisation. */
export const PROOF_FILENAME_FALLBACK_STEM = "payment-proof";

/**
 * Characters removed before anything else looks at the string.
 *
 * Cc: C0 and C1 control characters, including NUL and the newline that would
 * otherwise let a name inject a second MIME header line.
 * Cf: every Unicode format character, which is the class that contains the
 * bidi overrides (U+202A..U+202E), the isolates (U+2066..U+2069), the zero
 * width joiners, and U+FEFF.
 * Also the Unicode line and paragraph separators, which some header encoders
 * treat as line breaks.
 */
const INVISIBLE_OR_DIRECTIONAL =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0605\u061c\u06dd\u070f\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/g;

/** Everything the rebuilt stem is allowed to contain. */
const STEM_ALLOWED = /[^A-Za-z0-9._ -]+/g;

/** Runs of separators collapse, so "a___b" and "a - - b" do not survive. */
const COLLAPSE_SEPARATORS = /[._ -]{2,}/g;

/** Leading and trailing separators, including the dot that hides a file. */
const TRIM_SEPARATORS = /^[._ -]+|[._ -]+$/g;

/**
 * Windows device names. An attachment saved as "CON.png" or "LPT1.png" is a
 * long-standing footgun on the operator's own machine, and the cost of
 * refusing them is one prefixed character.
 */
const RESERVED_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type SafeProofFilename = Readonly<{
  /** The rebuilt name, always ending in the container's canonical extension. */
  value: string;
  /**
   * True when the submitted name contained material that was removed, so a
   * caller can record that the operator is not looking at the customer's
   * literal filename. This is an observation, never a refusal.
   */
  rewritten: boolean;
}>;

/**
 * Rebuild an attacker-supplied filename into one that is safe to attach, echo
 * and store.
 *
 * This never fails. A name made entirely of hostile characters becomes the
 * fallback stem plus the container's extension, because refusing the upload
 * over a filename would punish a customer for their phone's naming scheme
 * while doing nothing for safety: the name is not the payload.
 */
export function safeProofFilename(
  raw: unknown,
  contentType: EarlyAccessProofContentType,
): SafeProofFilename {
  const extension = CANONICAL_EXTENSION[contentType];
  const submitted = typeof raw === "string" ? raw : "";

  // NFC first. A decomposed sequence can otherwise pass the allowlist as its
  // combining parts and then render as a different character entirely.
  let stem: string;
  try {
    stem = submitted.normalize("NFC");
  } catch {
    stem = submitted;
  }

  stem = stem.replace(INVISIBLE_OR_DIRECTIONAL, "");

  // Drop every directory component before the allowlist runs, so "../../x"
  // cannot become "....x" and read as a traversal attempt to a later reader.
  const lastSeparator = Math.max(stem.lastIndexOf("/"), stem.lastIndexOf("\\"));
  if (lastSeparator >= 0) stem = stem.slice(lastSeparator + 1);

  // Remove the submitted extension. The container decides the real one, and a
  // name is not allowed to carry a second one.
  const lastDot = stem.lastIndexOf(".");
  if (lastDot > 0) stem = stem.slice(0, lastDot);

  stem = stem
    .replace(STEM_ALLOWED, "-")
    .replace(COLLAPSE_SEPARATORS, "-")
    .replace(TRIM_SEPARATORS, "")
    .slice(0, PROOF_FILENAME_STEM_MAX)
    .replace(TRIM_SEPARATORS, "");

  if (stem.length === 0) stem = PROOF_FILENAME_FALLBACK_STEM;
  if (RESERVED_DEVICE.test(stem)) stem = `${PROOF_FILENAME_FALLBACK_STEM}-${stem}`;

  const value = `${stem}${extension}`;
  return Object.freeze({ value, rewritten: value !== submitted });
}
