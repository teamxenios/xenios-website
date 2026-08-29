import { extname } from "node:path";
import { TextDecoder } from "node:util";

export const TEXT_ARTIFACT_EXTENSIONS = new Set([
  ".csv",
  ".html",
  ".json",
  ".log",
  ".md",
  ".txt",
  ".xml",
]);

// Browser evidence is emitted as PNG. Other image/container formats can carry
// opaque EXIF, comment, or profile payloads, so they are not silently accepted
// as equivalent screenshots.
export const MANUAL_IMAGE_ARTIFACT_EXTENSIONS = new Set([".png"]);

export function classifyEvidenceArtifact(path) {
  const extension = extname(String(path)).toLowerCase();
  if (TEXT_ARTIFACT_EXTENSIONS.has(extension)) {
    return { kind: "TEXT", extension };
  }
  if (MANUAL_IMAGE_ARTIFACT_EXTENSIONS.has(extension)) {
    return { kind: "MANUAL_IMAGE", extension };
  }
  return {
    kind: "UNSCANNABLE",
    extension: extension || null,
    reason: extension
      ? `unsupported artifact extension: ${extension}`
      : "artifact has no extension",
  };
}

export function decodeUtf8TextArtifact(bytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { valid: false, reason: "text artifact is not valid UTF-8", text: null };
  }
  if (text.includes("\0")) {
    return { valid: false, reason: "text artifact contains NUL bytes", text: null };
  }
  return { valid: true, reason: null, text };
}

const PNG_SIGNATURE = "89504e470d0a1a0a";
// Chrome DevTools screenshots use only these chunks. Keeping the allowlist this
// narrow prevents EXIF, profiles, comments, or future opaque ancillary chunks
// from becoming an unscanned data channel.
const ALLOWED_PNG_CHUNKS = new Set(["IHDR", "IDAT", "IEND"]);

/**
 * Validate that a manual-review image is a structurally bounded PNG without
 * textual, EXIF, ICC-profile, or unknown ancillary payloads. The pixel stream
 * remains subject to the mandatory visual review.
 */
export function validateManualReviewPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33) {
    return { valid: false, reason: "PNG is too short" };
  }
  if (bytes.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    return { valid: false, reason: "invalid PNG signature" };
  }

  let offset = 8;
  let ihdrCount = 0;
  let idatCount = 0;
  let iendCount = 0;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      return { valid: false, reason: "truncated PNG chunk" };
    }
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) {
      return { valid: false, reason: "PNG chunk exceeds file bounds" };
    }
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (!/^[A-Za-z]{4}$/u.test(type) || !ALLOWED_PNG_CHUNKS.has(type)) {
      return { valid: false, reason: `PNG contains disallowed chunk: ${type || "unknown"}` };
    }
    if (type === "IHDR") {
      ihdrCount++;
      if (offset !== 8 || length !== 13) {
        return { valid: false, reason: "invalid PNG IHDR" };
      }
      if (bytes.readUInt32BE(offset + 8) === 0 || bytes.readUInt32BE(offset + 12) === 0) {
        return { valid: false, reason: "PNG dimensions must be non-zero" };
      }
    } else if (type === "IDAT") {
      idatCount++;
    } else if (type === "IEND") {
      iendCount++;
      if (length !== 0 || end !== bytes.length) {
        return { valid: false, reason: "PNG IEND must terminate the file" };
      }
    }
    offset = end;
  }

  if (ihdrCount !== 1 || idatCount < 1 || iendCount !== 1) {
    return { valid: false, reason: "PNG is missing required chunks" };
  }
  return { valid: true, reason: null };
}

export function validateEvidenceArtifactBytes(path, bytes) {
  const classification = classifyEvidenceArtifact(path);
  if (classification.kind === "TEXT") {
    const decoded = decodeUtf8TextArtifact(bytes);
    return { ...classification, ...decoded };
  }
  if (classification.kind === "MANUAL_IMAGE") {
    return { ...classification, ...validateManualReviewPng(bytes) };
  }
  return { ...classification, valid: false };
}
