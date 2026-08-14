import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GeneratedKrisCatalogSource,
  KrisDatasetUnavailable,
  createKrisCatalogSourceFromEnv,
  describeKrisDatasetLocation,
  loadKrisDataset,
  type KrisDatasetFileSystem,
} from "./dataset-reader";
import {
  KRIS_LAUNCH_A_COMMITTED_DATASET_PATH,
  KRIS_LAUNCH_A_DATASET_ENV_VAR,
  krisCommittedDatasetCandidates,
  resolveKrisDatasetLocation,
} from "./dataset-location";
import { rawArtifact } from "./test-fixtures";

function refusal(raw: unknown): string {
  try {
    loadKrisDataset(raw);
  } catch (error) {
    return error instanceof KrisDatasetUnavailable ? error.reason : "wrong error";
  }
  return "no refusal";
}

describe("loading an artifact", () => {
  it("loads a well formed one and indexes it both ways", () => {
    const loaded = loadKrisDataset(rawArtifact());
    expect(loaded.products).toHaveLength(2);
    expect(loaded.bySlug.get("research-capsules-alpha")?.id).toBe("kli_one");
    expect(loaded.byId.get("kli_two")?.slug).toBe("shipping-and-fulfillment-beta");
    expect(loaded.summary.countsAgree).toBe(true);
  });

  it("recounts rather than trusting the declared counts", () => {
    const loaded = loadKrisDataset(
      rawArtifact({ counts: { items: 99, priced: 99, pricePending: 0 } }),
    );
    expect(loaded.summary.items).toBe(2);
    expect(loaded.summary.priced).toBe(1);
    expect(loaded.summary.pricePending).toBe(1);
    expect(loaded.summary.declaredItems).toBe(99);
    // Reported, not believed, and visible rather than silent.
    expect(loaded.summary.countsAgree).toBe(false);
  });

  it("refuses an artifact whose privacy invariants are not all false", () => {
    const raw = rawArtifact();
    (raw.invariants as Record<string, boolean>).containsBuyCost = true;
    expect(refusal(raw)).toContain("containsBuyCost is not false");
  });

  it("refuses an artifact carrying a private key at any depth", () => {
    const raw = rawArtifact();
    (raw.products as Record<string, unknown>[])[0]["Buy Cost / Unit"] = "0.75";
    expect(refusal(raw)).toContain("private key Buy Cost / Unit");

    const nested = rawArtifact();
    (nested.products as Record<string, unknown>[])[1].detail = {
      inner: { selectedSupplier: "Someone" },
    };
    expect(refusal(nested)).toContain("private key selectedSupplier");
  });

  it("refuses a purchase flag or a purchase action in the DATA", () => {
    // The access policy in code is the only thing that speaks to
    // purchasability, and it always says false. Data that carried its own flag
    // would be a second authority.
    const raw = rawArtifact();
    (raw.products as Record<string, unknown>[])[0].purchasable = false;
    expect(refusal(raw)).toContain("private key purchasable");

    const cta = rawArtifact();
    (cta.products as Record<string, unknown>[])[0].add_to_cart = null;
    expect(refusal(cta)).toContain("private key add_to_cart");
  });

  it("refuses a duplicate slug or id, because a deep link must mean one product", () => {
    const slug = rawArtifact();
    (slug.products as Record<string, unknown>[])[1].slug = "research-capsules-alpha";
    expect(refusal(slug)).toContain("duplicate product slug");

    const id = rawArtifact();
    (id.products as Record<string, unknown>[])[1].id = "kli_one";
    expect(refusal(id)).toContain("duplicate product id");
  });

  it("refuses a family or channel outside the closed vocabulary", () => {
    const family = rawArtifact();
    (family.products as Record<string, unknown>[])[0].family = "wellness";
    expect(refusal(family)).toContain("unknown family");

    const channel = rawArtifact();
    (channel.products as Record<string, unknown>[])[0].channel = "direct_to_consumer";
    expect(refusal(channel)).toContain("unknown channel");
  });

  it("refuses a zero, negative or fractional price rather than rendering it", () => {
    for (const amountCents of [0, -100, 12.5]) {
      const raw = rawArtifact();
      const overlay = (raw.priceOverlays as Record<string, Record<string, unknown>>)
        .KRIS_VOLUME_PARTNER;
      overlay.kli_one = {
        state: "priced",
        amountCents,
        currency: "USD",
        basis: "Per listed unit",
      };
      expect(refusal(raw)).toContain("positive whole number of cents");
    }
  });

  it("refuses a price whose words disagree with its number", () => {
    const raw = rawArtifact();
    const overlay = (raw.priceOverlays as Record<string, Record<string, unknown>>)
      .KRIS_VOLUME_PARTNER;
    overlay.kli_one = {
      state: "priced",
      amountCents: 8800,
      currency: "USD",
      display: "$8.00",
      basis: "Per listed unit",
    };
    expect(refusal(raw)).toContain("displays an amount it does not carry");
  });

  it("refuses an overlay keyed to a product that is not in the catalog", () => {
    const raw = rawArtifact();
    const overlay = (raw.priceOverlays as Record<string, Record<string, unknown>>)
      .KRIS_VOLUME_PARTNER;
    overlay.kli_ghost = { state: "priced", amountCents: 100, currency: "USD" };
    expect(refusal(raw)).toContain("prices the unknown product kli_ghost");
  });

  it("refuses an undeclared profile and an unknown one", () => {
    const undeclared = rawArtifact();
    (undeclared.priceOverlays as Record<string, unknown>).SOME_OTHER_PROFILE = {};
    expect(refusal(undeclared)).toContain("undeclared profile");

    const unknown = rawArtifact({ priceProfiles: ["CONSUMER"] });
    expect(refusal(unknown)).toContain("unknown price profile");
  });

  it("treats a MISSING overlay entry as pending, which is a state and not a fault", () => {
    const raw = rawArtifact();
    const overlay = (raw.priceOverlays as Record<string, Record<string, unknown>>)
      .KRIS_VOLUME_PARTNER;
    delete overlay.kli_two;
    const loaded = loadKrisDataset(raw);
    expect(loaded.summary.priced).toBe(1);
    expect(loaded.summary.pricePending).toBe(1);
    expect(loaded.prices.get("KRIS_VOLUME_PARTNER")?.get("kli_two")).toBeUndefined();
  });

  it("refuses the empty, the malformed and the wrong schema", () => {
    expect(refusal(null)).toContain("not an object");
    expect(refusal(rawArtifact({ schemaVersion: 2 }))).toContain("schema version 2");
    expect(refusal(rawArtifact({ products: [] }))).toContain("no products");
    expect(refusal(rawArtifact({ invariants: undefined }))).toContain(
      "declares no invariants",
    );
  });
});

describe("the disk reader", () => {
  function files(text: string, mtimeMs = 1): KrisDatasetFileSystem & { reads: number } {
    return {
      reads: 0,
      statMtimeMs: () => mtimeMs,
      readText(this: { reads: number }) {
        this.reads += 1;
        return text;
      },
    };
  }

  it("parses once and serves the cache until the file changes", () => {
    let mtimeMs = 1;
    let reads = 0;
    const source = new GeneratedKrisCatalogSource("/dataset.json", {
      statMtimeMs: () => mtimeMs,
      readText: () => {
        reads += 1;
        return JSON.stringify(rawArtifact());
      },
    });
    source.products();
    source.products();
    source.findBySlug("research-capsules-alpha");
    expect(reads).toBe(1);
    mtimeMs = 2;
    source.products();
    expect(reads).toBe(2);
  });

  it("answers pending for a product the overlay does not carry", () => {
    const raw = rawArtifact();
    const overlay = (raw.priceOverlays as Record<string, Record<string, unknown>>)
      .KRIS_VOLUME_PARTNER;
    delete overlay.kli_two;
    const source = new GeneratedKrisCatalogSource(
      "/dataset.json",
      files(JSON.stringify(raw)),
    );
    expect(source.priceFor("KRIS_VOLUME_PARTNER", "kli_two")).toEqual({
      state: "pending",
      display: "Price pending",
    });
    // And for a product that does not exist at all, rather than throwing.
    expect(source.priceFor("KRIS_VOLUME_PARTNER", "kli_nothing").state).toBe("pending");
  });

  it("refuses an unreadable file and invalid JSON, never an empty catalog", () => {
    const missing = new GeneratedKrisCatalogSource("/gone.json", {
      statMtimeMs: () => {
        throw new Error("ENOENT");
      },
      readText: () => "",
    });
    expect(() => missing.products()).toThrow(/not readable/);

    const garbage = new GeneratedKrisCatalogSource("/bad.json", files("{nope"));
    expect(() => garbage.products()).toThrow(/not valid JSON/);
  });

  it("refuses to be constructed with a blank path", () => {
    expect(() => new GeneratedKrisCatalogSource("   ")).toThrow(KrisDatasetUnavailable);
  });
});

describe("where the dataset comes from", () => {
  const probe = (present: readonly string[]) => ({
    exists: (filePath: string) => present.includes(filePath),
  });

  it("prefers the operator override and never probes it", () => {
    const location = resolveKrisDatasetLocation({
      env: { [KRIS_LAUNCH_A_DATASET_ENV_VAR]: "  /mnt/secret/kris.json  " },
      cwd: "/app",
      probe: probe([]),
    });
    // Not probed on purpose: a typo must surface as "not readable" against the
    // path the operator chose, never as a silent fall through to committed data
    // while they believe the override is live.
    expect(location).toEqual({
      filePath: path.resolve("/app", "/mnt/secret/kris.json"),
      source: "environment_override",
    });
  });

  it("falls back to the committed artifact, found from the working directory", () => {
    const committed = path.resolve("/app", KRIS_LAUNCH_A_COMMITTED_DATASET_PATH);
    expect(
      resolveKrisDatasetLocation({ env: {}, cwd: "/app", probe: probe([committed]) }),
    ).toEqual({ filePath: committed, source: "committed_artifact" });
  });

  it("walks a bounded number of parents and then gives up honestly", () => {
    const candidates = krisCommittedDatasetCandidates(path.resolve("/a/b/c/d/e"));
    expect(candidates.length).toBeLessThanOrEqual(4);
    expect(
      resolveKrisDatasetLocation({ env: {}, cwd: "/app", probe: probe([]) }),
    ).toBeNull();
  });

  it("gives the composition root null rather than an empty catalog", () => {
    expect(
      createKrisCatalogSourceFromEnv({}, undefined, probe([]), "/app"),
    ).toBeNull();
    expect(describeKrisDatasetLocation({}, probe([]), "/app")).toBeNull();
  });

  it("resolves the real committed artifact in a plain clone with no env set", () => {
    const source = createKrisCatalogSourceFromEnv({});
    expect(source).toBeInstanceOf(GeneratedKrisCatalogSource);
    expect(source?.products().length).toBe(420);
  });
});

describe("private content inside a legitimate member-facing string", () => {
  // The banned-key scan catches a private FIELD arriving in the artifact.
  // These prove the reader also refuses private CONTENT arriving through a
  // field members are meant to see, which is how a regenerated workbook would
  // actually leak: an operator pasting sourcing detail into the notes column.
  // The false-positive control is the test above this block: the real
  // 420-row artifact must keep loading with the scan in place.

  function poisoned(mutate: (product: Record<string, unknown>) => void): unknown {
    const raw = rawArtifact() as { products: Array<Record<string, unknown>> };
    mutate(raw.products[0]);
    return raw;
  }

  it("refuses an operator note that carries supplier and cost detail", () => {
    const reason = refusal(
      poisoned((p) => {
        p.suppliedNote = "Selected supplier: Apex Labs. Buy cost $12.40/unit.";
      }),
    );
    expect(reason).toContain("private operational content");
    expect(reason).toContain("suppliedNote");
  });

  it("refuses a poisoned display name", () => {
    const reason = refusal(
      poisoned((p) => {
        p.displayName = "Alpha 10 mg (gross margin 62%)";
      }),
    );
    expect(reason).toContain("private operational content");
    expect(reason).toContain("displayName");
  });

  it("refuses a poisoned specification", () => {
    const reason = refusal(
      poisoned((p) => {
        p.specification = "10 mg, sourcing rationale attached";
      }),
    );
    expect(reason).toContain("private operational content");
    expect(reason).toContain("specification");
  });

  it("refuses a poisoned price basis", () => {
    const raw = rawArtifact() as {
      products: Array<Record<string, unknown>>;
      priceOverlays: Record<string, Record<string, Record<string, unknown>>>;
    };
    const overlay = raw.priceOverlays.KRIS_VOLUME_PARTNER;
    const pricedId = Object.keys(overlay).find(
      (id) => overlay[id].state === "priced",
    ) as string;
    overlay[pricedId].basis = "per vial (buy cost basis)";
    const reason = refusal(raw);
    expect(reason).toContain("private operational content");
    expect(reason).toContain("price basis");
  });

  it("names the field but never echoes the private text", () => {
    const reason = refusal(
      poisoned((p) => {
        p.suppliedNote = "Selected supplier: Apex Labs.";
      }),
    );
    // The refusal is thrown at load time and may be logged; carrying the
    // content would move the leak into the logs instead of stopping it.
    expect(reason).not.toContain("Apex");
    expect(reason).not.toContain("Selected supplier");
  });
});
