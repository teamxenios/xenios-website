/**
 * Argument parsing for the Kris Launch A artifact builder.
 *
 * WHY THIS IS ITS OWN MODULE. The builder is a top-level script: importing it
 * runs it. Its argument handling is also the one place where a slip becomes a
 * SAFETY defect rather than an inconvenience, because the output path decides
 * whether the reconciliation gate runs at all (the gate only reconciles when a
 * previous artifact exists at that path). So the decision lives here, where it
 * can be tested without a private intake file.
 *
 * THE DEFECT THIS EXISTS TO CLOSE. `process.argv[3] ?? DEFAULT_OUTPUT` treats
 * ANY third argument as the output path, including a flag. The natural
 * invocation
 *
 *     tsx build-kris-launch-a.ts intake.json --allow-purchase-opening
 *
 * therefore set the output path to the literal string
 * "--allow-purchase-opening", which never exists on disk, which skipped the
 * whole gate, and which wrote the artifact to a file of that name instead of
 * the catalog. The operator asking for the MOST supervised build got the
 * LEAST supervised one, silently.
 *
 * The rule here is deliberately strict rather than clever: a leading "--" is
 * a flag, never a path; an unrecognized flag is refused rather than ignored,
 * because a misspelled approval flag must not read as "no approval given"
 * only after the build has already made its decision.
 */

/** Flags the builder understands. Anything else beginning with "--" is refused. */
export const BUILDER_FLAGS = Object.freeze(["--allow-purchase-opening"] as const);

export interface BuilderArgs {
  /** The private intake JSON. Required. */
  readonly intakePath: string;
  /** Where the artifact is written. Positional, else the caller's default. */
  readonly outputPath: string;
  /** The operator's explicit, auditable approval to open a purchase path. */
  readonly allowPurchaseOpening: boolean;
}

export class BuilderArgsError extends Error {}

/**
 * Parse the builder's arguments from the tail of process.argv (everything
 * after node and the script path).
 *
 * @param argv    the argument tail, e.g. process.argv.slice(2)
 * @param defaultOutput  where to write when no output positional is given
 */
export function parseBuilderArgs(
  argv: readonly string[],
  defaultOutput: string,
): BuilderArgs {
  const positionals: string[] = [];
  let allowPurchaseOpening = false;

  for (const argument of argv) {
    if (argument.startsWith("--")) {
      if (!BUILDER_FLAGS.includes(argument as (typeof BUILDER_FLAGS)[number])) {
        throw new BuilderArgsError(
          `unknown flag ${argument}; expected one of ${BUILDER_FLAGS.join(", ")}`,
        );
      }
      if (argument === "--allow-purchase-opening") allowPurchaseOpening = true;
      continue;
    }
    positionals.push(argument);
  }

  const intakePath = positionals[0];
  if (intakePath === undefined || intakePath === "") {
    throw new BuilderArgsError(
      "usage: build-kris-launch-a.ts <private-intake.json> [output] [--allow-purchase-opening]",
    );
  }
  if (positionals.length > 2) {
    throw new BuilderArgsError(
      `expected at most two positional arguments, received ${positionals.length}: ${positionals.join(", ")}`,
    );
  }

  return Object.freeze({
    intakePath,
    outputPath: positionals[1] ?? defaultOutput,
    allowPurchaseOpening,
  });
}
