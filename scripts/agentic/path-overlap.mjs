// Path-pattern overlap for lease conflict detection.
//
// WHY THIS EXISTS. The previous implementation normalised a pattern by cutting
// it at the first `**`:
//
//   const normalize = (p) => p.replace(/\*\*.*$/, "").replace(/[\\/]+$/, "");
//
// so `server/research/**request**` became `server/research`, and the prefix
// test then reported a conflict with EVERY active lease beneath that
// directory. Measured on the live board, that made REQUEST-CENTER unclaimable
// by anyone: it collided with four unrelated leases at once, including one
// whose only path was `server/research/account-identity/**`. Work was hidden
// from nine sessions, and lease ownership drifted into chat messages because
// the tool refused valid claims.
//
// WHAT THIS DOES INSTEAD. It asks the real question: does any concrete path
// exist that both patterns match? Two patterns conflict exactly when such a
// path exists.
//
// Glob semantics, standard:
//   - a segment that is exactly `**` matches zero or more whole segments
//   - `*` inside a segment matches any run of characters within that segment,
//     never across a `/`
//   - `**` appearing INSIDE a segment (as in `**request**`) is a within-segment
//     wildcard too; only a standalone `**` segment crosses directories
//
// One deliberate widening: a pattern that runs out of segments is treated as
// an ancestor of everything below it, so the directory lease
// `server/research/catalog` conflicts with `server/research/catalog/price.ts`.
// Lease paths in this repository are written as directory prefixes, and for a
// conflict check, over-reporting is the safe direction — a missed conflict puts
// two writers in one file, which is the failure this module exists to prevent.

/** Split a pattern into non-empty segments, tolerating Windows separators. */
export function patternSegments(pattern) {
  return String(pattern ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0);
}

/**
 * Do two single-segment wildcard patterns have a common match?
 *
 * Classic wildcard-intersection: walk both, and where either side has a `*`,
 * try both consuming nothing and absorbing one character from the other side.
 * Runs of `*` collapse, so `**request**` behaves as `*request*`.
 */
export function segmentsIntersect(a, b) {
  const memo = new Map();

  const walk = (i, j) => {
    const key = i * (b.length + 1) + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let result;
    if (i >= a.length && j >= b.length) {
      result = true;
    } else if (i < a.length && a[i] === "*") {
      // Star matches empty, or absorbs one character of b.
      result = walk(i + 1, j) || (j < b.length && walk(i, j + 1));
    } else if (j < b.length && b[j] === "*") {
      result = walk(i, j + 1) || (i < a.length && walk(i + 1, j));
    } else if (i >= a.length || j >= b.length) {
      result = false;
    } else {
      result = a[i] === b[j] && walk(i + 1, j + 1);
    }

    memo.set(key, result);
    return result;
  };

  return walk(0, 0);
}

/** A segment that crosses directory boundaries: exactly `**`, nothing else. */
function isGlobstar(segment) {
  return segment === "**";
}

/**
 * A segment carrying `**` INSIDE it, such as `**request**`.
 *
 * These are not standard glob. Whoever wrote `server/research/**request**`
 * meant "anything under server/research whose path mentions request", which
 * crosses directory boundaries — so reading the inner `**` as a within-segment
 * wildcard silently narrows the claim.
 *
 * That narrowing is not a harmless difference of opinion: it produces FALSE
 * NEGATIVES. `server/research/**request**` and `server/research/master-offerings/**`
 * both cover `server/research/master-offerings/request-projection.ts`, and a
 * within-segment reading reports no conflict, which hands two sessions the same
 * file. A missed conflict is the failure this module exists to prevent, and it
 * is strictly worse than the over-blocking it replaced.
 *
 * Deciding intersection precisely for these would mean intersecting two regular
 * languages. They are rare and pathological, so this takes the safe answer
 * instead: fall back to comparing literal prefixes, which over-reports. A task
 * that wants a precise lease should narrow its paths rather than rely on this.
 */
function hasInlineGlobstar(segment) {
  return !isGlobstar(segment) && segment.includes("**");
}

/** The literal directory prefix, i.e. everything before the first wildcard. */
function literalPrefix(segments) {
  const literal = [];
  for (const segment of segments) {
    if (segment.includes("*")) break;
    literal.push(segment);
  }
  return literal;
}

/** Conservative answer for pathological patterns: do the literal prefixes nest? */
function prefixesNest(a, b) {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.every((segment, i) => segment === longer[i]);
}

/**
 * Does any concrete path match both patterns?
 *
 * Exported for tests; `overlaps` is the name the CLI uses.
 */
export function patternsOverlap(a, b) {
  const left = patternSegments(a);
  const right = patternSegments(b);

  // Pathological patterns take the conservative answer. See hasInlineGlobstar:
  // reading `**request**` as within-segment silently narrows the claim and
  // hands two sessions the same file, which is the one outcome this check
  // exists to prevent.
  if (left.some(hasInlineGlobstar) || right.some(hasInlineGlobstar)) {
    return prefixesNest(literalPrefix(left), literalPrefix(right));
  }

  const memo = new Map();

  const walk = (i, j) => {
    const key = i * (right.length + 1) + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let result;
    if (i >= left.length || j >= right.length) {
      // One pattern is an ancestor of the other's remaining path space. See
      // the deliberate widening described at the top of this file.
      result = true;
    } else if (isGlobstar(left[i])) {
      // Match zero segments, or absorb one segment of the right-hand side.
      result = walk(i + 1, j) || walk(i, j + 1);
    } else if (isGlobstar(right[j])) {
      result = walk(i, j + 1) || walk(i + 1, j);
    } else {
      result = segmentsIntersect(left[i], right[j]) && walk(i + 1, j + 1);
    }

    memo.set(key, result);
    return result;
  };

  return walk(0, 0);
}

export { patternsOverlap as overlaps };
