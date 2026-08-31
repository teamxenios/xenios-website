const INVALID_PATH_CHARACTER = /[\\\s\u0000-\u001f\u007f]/u;
const DOT_SEGMENT = /\/(?:\.{1,2})(?:\/|$)/u;

/**
 * Canonicalizes a path-only value without turning encoded separators into path
 * boundaries. Literal query/hash suffixes are ignored; absolute URLs and
 * ambiguous or malformed paths fail closed.
 */
export function normalizeCarePath(value: string): string | null {
  if (typeof value !== "string") return null;

  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const suffixIndexes = [queryIndex, hashIndex].filter((index) => index >= 0);
  const suffixIndex = suffixIndexes.length > 0 ? Math.min(...suffixIndexes) : value.length;
  const encodedPath = value.slice(0, suffixIndex);

  if (!encodedPath.startsWith("/") || INVALID_PATH_CHARACTER.test(encodedPath)) {
    return null;
  }

  let decodedPath: string;
  try {
    // decodeURI intentionally preserves encoded reserved separators such as
    // %2F, so they cannot become a new routing boundary.
    decodedPath = decodeURI(encodedPath);
  } catch {
    return null;
  }

  if (
    INVALID_PATH_CHARACTER.test(decodedPath) ||
    decodedPath.includes("//") ||
    DOT_SEGMENT.test(decodedPath)
  ) {
    return null;
  }

  const lowerPath = decodedPath.toLowerCase();
  return lowerPath.length > 1 && lowerPath.endsWith("/")
    ? lowerPath.slice(0, -1)
    : lowerPath;
}

export function isCarePath(value: string): boolean {
  const normalized = normalizeCarePath(value);
  return normalized === "/care" || normalized?.startsWith("/care/") === true;
}

/** The exact public umbrella gateway for the Care and Research pathways. */
export function isHealthGatewayPath(value: string): boolean {
  return normalizeCarePath(value) === "/health";
}
