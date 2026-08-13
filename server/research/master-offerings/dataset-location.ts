/**
 * Where the member-safe catalog dataset lives, in every environment.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The reader used to be built from one environment variable and nothing else.
 * Unset, it returned null and the catalog answered 503. That is honest, but it
 * meant the only working configuration was an absolute path typed by hand, and
 * in practice the only file that path ever pointed at lived under `.local`,
 * which is gitignored and therefore absent from the git clone the deploy builds
 * from. So the catalog could not be reached in production at all, and the one
 * setup that did work was a path on somebody's laptop.
 *
 * The fix is not a cleverer environment variable. It is a COMMITTED artifact
 * with a stable repo-relative path, so the dataset is in the clone, present at
 * build time and at runtime, survives every restart on an ephemeral filesystem,
 * and changes through a reviewable diff. Swapping in a new master catalog then
 * becomes a data change, which is the whole point.
 *
 * RESOLUTION ORDER
 *   1. XENIOS_MASTER_OFFERINGS_DATASET, when set. An explicit operator override
 *      always wins, so a deployment can point at a secret file or a mounted
 *      volume without a code change.
 *   2. The committed repo artifact, found relative to the working directory.
 *   3. Nothing. The composition root turns that into an unavailable surface,
 *      never an empty catalog.
 *
 * WHY THE WORKING DIRECTORY AND NOT __dirname
 * -------------------------------------------
 * The server is bundled by esbuild into a single dist/index.cjs, so a path
 * resolved from this module's own directory means one thing in development and
 * another after bundling. Both `npm run dev` and `npm run start` run from the
 * project root, so the working directory is the one location that means the
 * same thing in both. The bounded walk upward covers a process started from a
 * subdirectory without turning into an unbounded filesystem search.
 */

import path from "path";

export const MASTER_OFFERINGS_DATASET_ENV_VAR = "XENIOS_MASTER_OFFERINGS_DATASET";

/**
 * The committed artifact, repo relative. The reconciliation command regenerates
 * this exact path, so a future master catalog arrives as a diff to one file.
 */
export const MASTER_OFFERINGS_COMMITTED_DATASET_PATH = path.posix.join(
  "server",
  "research",
  "master-offerings",
  "data",
  "member-safe-master-offerings.generated.json",
);

/** How many parent directories to try above the working directory. */
const MAX_PARENT_WALK = 3;

export interface DatasetLocationProbe {
  exists(filePath: string): boolean;
}

export type MasterOfferingDatasetLocation = {
  filePath: string;
  /** Which rule produced this path. Reported so a misconfiguration says why. */
  source: "environment_override" | "committed_artifact";
};

/**
 * Every path the committed artifact could sit at, nearest first.
 *
 * Exported so a test can assert the candidate list rather than infer it from a
 * resolution result, and so an operator diagnostic can print what was tried.
 */
export function committedDatasetCandidates(cwd: string): readonly string[] {
  const candidates: string[] = [];
  let directory = cwd;
  for (let step = 0; step <= MAX_PARENT_WALK; step += 1) {
    candidates.push(path.resolve(directory, MASTER_OFFERINGS_COMMITTED_DATASET_PATH));
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return candidates;
}

export function resolveMasterOfferingDatasetLocation(input: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  probe: DatasetLocationProbe;
}): MasterOfferingDatasetLocation | null {
  const configured = input.env[MASTER_OFFERINGS_DATASET_ENV_VAR];
  if (typeof configured === "string" && configured.trim() !== "") {
    // Deliberately NOT probed for existence. An operator who names a path and
    // gets it wrong must see "dataset file is not readable" against the path
    // they chose, not a silent fall through to a different dataset. Falling
    // back here would let a typo serve stale committed data while the operator
    // believed the override was live.
    return {
      filePath: path.resolve(input.cwd, configured.trim()),
      source: "environment_override",
    };
  }

  for (const candidate of committedDatasetCandidates(input.cwd)) {
    if (input.probe.exists(candidate)) {
      return { filePath: candidate, source: "committed_artifact" };
    }
  }

  return null;
}
