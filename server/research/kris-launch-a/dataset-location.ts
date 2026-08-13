/**
 * Where the Launch A catalog artifact lives, in every environment.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * The sibling master-offerings lane learned this the expensive way, and the
 * lesson is written down in its own dataset-location.ts: a reader configured
 * ONLY by an environment variable has exactly one working setup, an absolute
 * path typed by hand, and the only file that path ever pointed at lived under
 * `.local`, which is gitignored and therefore absent from the clone the deploy
 * builds from. The catalog could not be reached in production at all.
 *
 * Launch A inherits the fix rather than the mistake. The artifact is COMMITTED
 * at a stable repo-relative path, so it is in the clone, present at build time
 * and at runtime, survives a restart on an ephemeral filesystem, and changes
 * through a reviewable diff. Regenerating from a new workbook is then a data
 * change, which is the whole point.
 *
 * RESOLUTION ORDER
 *   1. XENIOS_KRIS_LAUNCH_A_DATASET, when set. An explicit operator override
 *      always wins, so a deployment can point at a mounted volume or a secret
 *      file without a code change.
 *   2. The committed repo artifact, found relative to the working directory.
 *   3. Nothing. The composition root turns that into an unavailable surface
 *      (503), never an empty catalog. "We cannot reach the price sheet" and
 *      "Kris has nothing to buy" are different answers and must stay different.
 *
 * WHY THE WORKING DIRECTORY AND NOT __dirname
 * -------------------------------------------
 * The server is bundled by esbuild into a single dist/index.cjs, so a path
 * resolved from this module's own directory means one thing in development and
 * another after bundling. Both `npm run dev` and `npm run start` run from the
 * project root, so the working directory is the one anchor that means the same
 * thing in both. The bounded walk upward covers a process started from a
 * subdirectory without becoming an unbounded filesystem search.
 */

import path from "path";

export const KRIS_LAUNCH_A_DATASET_ENV_VAR = "XENIOS_KRIS_LAUNCH_A_DATASET";

/**
 * The committed artifact, repo relative. `scripts/research/build-kris-launch-a.ts`
 * writes this exact path, so a repriced workbook arrives as a diff to one file.
 */
export const KRIS_LAUNCH_A_COMMITTED_DATASET_PATH = path.posix.join(
  "server",
  "research",
  "kris-launch-a",
  "data",
  "kris-launch-a-catalog.generated.json",
);

/** How many parent directories to try above the working directory. */
const MAX_PARENT_WALK = 3;

export interface KrisDatasetLocationProbe {
  exists(filePath: string): boolean;
}

export type KrisDatasetLocation = {
  filePath: string;
  /** Which rule produced this path, so a misconfiguration can say why. */
  source: "environment_override" | "committed_artifact";
};

/**
 * Every path the committed artifact could sit at, nearest first.
 *
 * Exported so a test can assert the candidate list rather than infer it from a
 * resolution result, and so an operator diagnostic can print what was tried.
 */
export function krisCommittedDatasetCandidates(cwd: string): readonly string[] {
  const candidates: string[] = [];
  let directory = cwd;
  for (let step = 0; step <= MAX_PARENT_WALK; step += 1) {
    candidates.push(path.resolve(directory, KRIS_LAUNCH_A_COMMITTED_DATASET_PATH));
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return candidates;
}

export function resolveKrisDatasetLocation(input: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  probe: KrisDatasetLocationProbe;
}): KrisDatasetLocation | null {
  const configured = input.env[KRIS_LAUNCH_A_DATASET_ENV_VAR];
  if (typeof configured === "string" && configured.trim() !== "") {
    // Deliberately NOT probed for existence. An operator who names a path and
    // gets it wrong must see "dataset file is not readable" against the path
    // they chose, not a silent fall through to a different dataset. Falling
    // back here would let a typo serve the committed catalog while the operator
    // believed their override was live, which on a confidential price sheet is
    // the worst kind of quiet.
    return {
      filePath: path.resolve(input.cwd, configured.trim()),
      source: "environment_override",
    };
  }

  for (const candidate of krisCommittedDatasetCandidates(input.cwd)) {
    if (input.probe.exists(candidate)) {
      return { filePath: candidate, source: "committed_artifact" };
    }
  }

  return null;
}
