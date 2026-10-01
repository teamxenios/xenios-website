import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
const RECEIPTS_PATH = path.join(
  REPO_ROOT,
  "docs/product-imagery/evidence/batch0-render-receipts.json",
);
const OUTPUT_PATH = path.join(
  REPO_ROOT,
  "docs/product-imagery/manifests/batch-000-c2pa-provenance.json",
);
const GENERATED_AT = "2026-10-01T15:30:00.000Z";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CBOR_BREAK = Symbol("cbor-break");
const CBOR_INDEFINITE = Symbol("cbor-indefinite");
const UTF8 = new TextDecoder("utf-8", { fatal: true });

class CborReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  take(length, label) {
    assert.ok(Number.isSafeInteger(length) && length >= 0, `${label} length is invalid`);
    assert.ok(this.offset + length <= this.bytes.length, `Truncated ${label}`);
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  argument(additional) {
    if (additional < 24) return additional;
    if (additional === 24) return this.take(1, "CBOR uint8").readUInt8(0);
    if (additional === 25) return this.take(2, "CBOR uint16").readUInt16BE(0);
    if (additional === 26) return this.take(4, "CBOR uint32").readUInt32BE(0);
    if (additional === 27) {
      const value = this.take(8, "CBOR uint64").readBigUInt64BE(0);
      return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
    }
    if (additional === 31) return CBOR_INDEFINITE;
    throw new Error(`Reserved CBOR additional information ${additional}`);
  }

  length(value, label) {
    assert.notEqual(value, CBOR_INDEFINITE, `${label} is indefinite`);
    assert.equal(typeof value, "number", `${label} exceeds the safe integer range`);
    assert.ok(Number.isSafeInteger(value) && value >= 0, `${label} is invalid`);
    return value;
  }

  halfFloat() {
    const bits = this.take(2, "CBOR float16").readUInt16BE(0);
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x03ff;
    if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
    if (exponent === 31) return fraction === 0 ? sign * Infinity : Number.NaN;
    return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
  }

  simple(additional) {
    if (additional < 20) return { simple: additional };
    if (additional === 20) return false;
    if (additional === 21) return true;
    if (additional === 22) return null;
    if (additional === 23) return undefined;
    if (additional === 24) return { simple: this.take(1, "CBOR simple value").readUInt8(0) };
    if (additional === 25) return this.halfFloat();
    if (additional === 26) return this.take(4, "CBOR float32").readFloatBE(0);
    if (additional === 27) return this.take(8, "CBOR float64").readDoubleBE(0);
    if (additional === 31) return CBOR_BREAK;
    throw new Error(`Reserved CBOR simple value ${additional}`);
  }

  value() {
    assert.ok(this.offset < this.bytes.length, "Unexpected end of CBOR input");
    const initial = this.bytes[this.offset++];
    const major = initial >> 5;
    const additional = initial & 0x1f;
    if (major === 7) return this.simple(additional);
    const argument = this.argument(additional);

    if (major === 0) {
      assert.notEqual(argument, CBOR_INDEFINITE, "Indefinite CBOR unsigned integer");
      return argument;
    }
    if (major === 1) {
      assert.notEqual(argument, CBOR_INDEFINITE, "Indefinite CBOR negative integer");
      return typeof argument === "bigint" ? -1n - argument : -1 - argument;
    }
    if (major === 2 || major === 3) {
      if (argument === CBOR_INDEFINITE) {
        const chunks = [];
        while (true) {
          const chunk = this.value();
          if (chunk === CBOR_BREAK) break;
          if (major === 2) assert.ok(Buffer.isBuffer(chunk), "Invalid indefinite byte chunk");
          else assert.equal(typeof chunk, "string", "Invalid indefinite text chunk");
          chunks.push(chunk);
        }
        return major === 2 ? Buffer.concat(chunks) : chunks.join("");
      }
      const bytes = this.take(this.length(argument, major === 2 ? "byte string" : "text string"), "CBOR string");
      return major === 2 ? bytes : UTF8.decode(bytes);
    }
    if (major === 4) {
      const values = [];
      if (argument === CBOR_INDEFINITE) {
        while (true) {
          const value = this.value();
          if (value === CBOR_BREAK) break;
          values.push(value);
        }
      } else {
        for (let index = 0; index < this.length(argument, "array"); index += 1) {
          values.push(this.value());
        }
      }
      return values;
    }
    if (major === 5) {
      const value = {};
      const readEntry = () => {
        const key = this.value();
        if (key === CBOR_BREAK) return false;
        assert.ok(
          typeof key === "string" || typeof key === "number" || typeof key === "bigint",
          "Unsupported non-scalar CBOR map key",
        );
        const normalized = String(key);
        assert.ok(!Object.hasOwn(value, normalized), `Duplicate CBOR map key ${normalized}`);
        const entry = this.value();
        assert.notEqual(entry, CBOR_BREAK, "CBOR map value cannot be a break marker");
        value[normalized] = entry;
        return true;
      };
      if (argument === CBOR_INDEFINITE) {
        while (readEntry()) {}
      } else {
        for (let index = 0; index < this.length(argument, "map"); index += 1) readEntry();
      }
      return value;
    }
    if (major === 6) {
      assert.notEqual(argument, CBOR_INDEFINITE, "Indefinite CBOR tag");
      return { tag: argument, value: this.value() };
    }
    throw new Error(`Unsupported CBOR major type ${major}`);
  }
}

function decodeCbor(bytes) {
  const reader = new CborReader(bytes);
  const value = reader.value();
  assert.notEqual(value, CBOR_BREAK, "Top-level CBOR cannot be a break marker");
  assert.equal(reader.offset, bytes.length, "Trailing bytes after CBOR value");
  return value;
}

function exactlyOne(values, label) {
  assert.equal(values.length, 1, `${label}: expected exactly 1, found ${values.length}`);
  return values[0];
}

function pngChunks(bytes) {
  assert.ok(bytes.subarray(0, 8).equals(PNG_SIGNATURE), "Expected a PNG signature");
  const chunks = [];
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    const dataStart = at + 8;
    const dataEnd = dataStart + length;
    const next = dataEnd + 4;
    assert.ok(next <= bytes.length, `Truncated PNG chunk ${type}`);
    chunks.push({ type, data: bytes.subarray(dataStart, dataEnd) });
    at = next;
    if (type === "IEND") break;
  }
  return chunks;
}

function walkIsoBoxes(bytes, start = 0, end = bytes.length, out = []) {
  for (let at = start; at + 8 <= end; ) {
    let size = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    let header = 8;
    if (size === 1) {
      assert.ok(at + 16 <= end, `Truncated extended ${type} box`);
      const extended = bytes.readBigUInt64BE(at + 8);
      assert.ok(extended <= BigInt(Number.MAX_SAFE_INTEGER), `${type} box is too large`);
      size = Number(extended);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    assert.ok(size >= header && at + size <= end, `Invalid ${type} box size ${size}`);
    const payloadStart = at + header;
    const payloadEnd = at + size;
    if (type === "cbor") {
      out.push(decodeCbor(bytes.subarray(payloadStart, payloadEnd)));
    } else if (type === "jumb") {
      walkIsoBoxes(bytes, payloadStart, payloadEnd, out);
    }
    at += size;
  }
  return out;
}

function taggedString(value, label) {
  const selected = value && typeof value === "object" && "value" in value ? value.value : value;
  assert.equal(typeof selected, "string", `${label} must be a string`);
  return selected;
}

function embeddedRfc3161GeneralizedTime(coseSign1) {
  assert.equal(coseSign1?.tag, 18, "Expected tagged COSE_Sign1");
  assert.ok(Array.isArray(coseSign1.value), "Expected COSE_Sign1 array value");
  const [protectedHeader, unprotected, detachedPayload, signature] = coseSign1.value;
  assert.ok(Buffer.isBuffer(protectedHeader), "Expected COSE protected header bytes");
  assert.equal(detachedPayload, null, "Expected a detached COSE payload");
  assert.ok(Buffer.isBuffer(signature), "Expected COSE signature bytes");
  const tokens = unprotected?.sigTst2?.tstTokens;
  const token = exactlyOne(Array.isArray(tokens) ? tokens : [], "sigTst2 timestamp token");
  assert.ok(Buffer.isBuffer(token?.val), "Expected RFC3161 token bytes");
  const candidates = [
    ...Buffer.from(token.val).toString("latin1").matchAll(/20\d{12}(?:\.\d+)?Z/g),
  ].map((match) => match[0]);
  const generalizedTime = exactlyOne(
    [...new Set(candidates)],
    "RFC3161 GeneralizedTime",
  );
  const match = generalizedTime.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/,
  );
  assert.ok(match, "Unsupported RFC3161 GeneralizedTime");
  return {
    generalizedTime,
    iso:
      `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}` +
      `${match[7] || ""}Z`,
    tokenCount: tokens.length,
    coseTag: coseSign1.tag,
    detachedPayload: true,
  };
}

export function extractC2paStructural(pngPath) {
  const bytes = fs.readFileSync(pngPath);
  const caBx = exactlyOne(
    pngChunks(bytes).filter((chunk) => chunk.type === "caBX"),
    "PNG caBX chunk",
  );
  const decoded = walkIsoBoxes(caBx.data);
  const actionsAssertion = exactlyOne(
    decoded.filter((value) => Array.isArray(value?.actions)),
    "c2pa.actions assertion",
  );
  const claim = exactlyOne(
    decoded.filter(
      (value) =>
        typeof value?.instanceID === "string" &&
        value?.claim_generator_info &&
        typeof value.claim_generator_info === "object",
    ),
    "c2pa claim",
  );
  const coseSign1 = exactlyOne(
    decoded.filter((value) => value?.tag === 18 && Array.isArray(value?.value)),
    "COSE_Sign1",
  );
  const created = exactlyOne(
    actionsAssertion.actions.filter((action) => action?.action === "c2pa.created"),
    "c2pa.created action",
  );
  const actionTimes = Object.fromEntries(
    actionsAssertion.actions
      .filter((action) => typeof action?.action === "string" && action.when)
      .map((action) => [action.action, taggedString(action.when, `${action.action}.when`)]),
  );
  return {
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    c2pa: {
      caBxBytes: caBx.data.length,
      decodedCborBoxes: decoded.length,
      instanceId: claim.instanceID,
      claimGenerator: {
        name: claim.claim_generator_info.name,
        specVersion: claim.claim_generator_info.specVersion,
        c2paRsVersion: claim.claim_generator_info["org.contentauth.c2pa_rs"],
      },
      generator: {
        name: created.softwareAgent?.name,
        model: created.softwareAgent?.version,
        digitalSourceType: created.digitalSourceType,
      },
      actions: actionsAssertion.actions.map((action) => action.action),
      actionTimes,
      embeddedRfc3161Timestamp: embeddedRfc3161GeneralizedTime(coseSign1),
    },
  };
}

function utcNanoseconds(value) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/,
  );
  assert.ok(match, `Unsupported UTC timestamp: ${value}`);
  const epochMs = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    0,
  );
  return BigInt(epochMs) * 1_000_000n + BigInt((match[7] || "").padEnd(9, "0").slice(0, 9));
}

export function deltaMilliseconds(later, earlier) {
  const delta = utcNanoseconds(later) - utcNanoseconds(earlier);
  const sign = delta < 0n ? "-" : "";
  const absolute = delta < 0n ? -delta : delta;
  return `${sign}${absolute / 1_000_000n}.${String(absolute % 1_000_000n).padStart(6, "0")}`;
}

export function buildC2paProvenance() {
  const receipts = JSON.parse(fs.readFileSync(RECEIPTS_PATH, "utf8"));
  assert.equal(receipts.observations.length, 25);
  const assets = receipts.observations.map((observation) => {
    const extracted = extractC2paStructural(path.join(REPO_ROOT, observation.repositoryPath));
    assert.equal(extracted.sha256, observation.outputSha256);
    const created = extracted.c2pa.actionTimes["c2pa.created"];
    const embeddedRfc3161 = extracted.c2pa.embeddedRfc3161Timestamp.iso;
    return {
      jobId: observation.jobId,
      repositoryPath: observation.repositoryPath,
      outputSha256: extracted.sha256,
      ...extracted.c2pa,
      receiptObservation: {
        generatedAtObserved: observation.generatedAtObserved,
        receiptMinusCreatedMs: deltaMilliseconds(observation.generatedAtObserved, created),
        receiptMinusEmbeddedRfc3161Ms: deltaMilliseconds(
          observation.generatedAtObserved,
          embeddedRfc3161,
        ),
        embeddedRfc3161MinusCreatedMs: deltaMilliseconds(embeddedRfc3161, created),
        authority: "observational_only_not_signed_receipt_time",
      },
    };
  });
  assert.equal(new Set(assets.map((asset) => asset.instanceId)).size, 25);
  assert.ok(
    assets.every(
      (asset) =>
        asset.generator.name === "ChatGPT" &&
        asset.generator.model === "gpt-image" &&
        asset.generator.digitalSourceType ===
          "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" &&
        asset.claimGenerator.name === "OpenAI Media Service API" &&
        asset.claimGenerator.specVersion === "2.2.0" &&
        asset.claimGenerator.c2paRsVersion === "0.79.2" &&
        asset.actions.includes("c2pa.created") &&
        asset.actions.includes("c2pa.converted") &&
        asset.actions.includes("c2pa.watermarked.unbound"),
    ),
    "All Batch 0 C2PA claims must retain the observed generator and action identity",
  );
  const job19 = assets.find((asset) => asset.jobId.startsWith("batch0-19-"));
  assert.ok(job19);
  return {
    schemaVersion: 1,
    kind: "batch0_c2pa_structural_provenance",
    generatedAt: GENERATED_AT,
    sourceReceipts: path.relative(REPO_ROOT, RECEIPTS_PATH).replaceAll("\\", "/"),
    extraction: {
      method: "offline_structural_png_cabx_jumbf_cbor_decode",
      decoder: "repository_self_contained_fail_closed_cbor_subset",
      decoderSource: "scripts/product-imagery/extract-c2pa-provenance.mjs",
      officialC2paValidatorUsed: false,
      authority: "structural_evidence_not_cryptographic_validation_or_approval",
      limitations: [
        "PNG CRC values were not revalidated by this extractor.",
        "COSE and RFC3161 signatures, certificate chains, revocation, assertion hashes, and asset binding were not cryptographically validated.",
        "A pinned official c2patool remains required for authoritative C2PA validation.",
      ],
    },
    summary: {
      assets: assets.length,
      caBxPresent: assets.length,
      sha256MatchesReceipts: assets.length,
      uniqueInstanceIds: new Set(assets.map((asset) => asset.instanceId)).size,
      generatorName: "ChatGPT",
      generatorModel: "gpt-image",
      claimGenerator: "OpenAI Media Service API",
      digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
      publicOrPublicationApproval: false,
    },
    job19Observation: {
      receiptMinusCreatedMs: job19.receiptObservation.receiptMinusCreatedMs,
      explanation:
        "The embedded creation claim and RFC3161 token time precede local receipt by about 592.5 seconds. This is consistent with delayed tool delivery or local write of an already-manifested render, but cannot be proven without provider/tool timing logs or cryptographic validation.",
      caution:
        "generatedAtObserved is an observational local clock, not signed receipt evidence and not reliable generation-order proof.",
    },
    assets,
  };
}

export function writeC2paProvenance() {
  const provenance = buildC2paProvenance();
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const provenance = writeC2paProvenance();
  console.log(
    `C2PA structural provenance: ${provenance.summary.assets}/25 caBX manifests, ` +
      `${provenance.summary.uniqueInstanceIds} unique instance IDs, 0 publication approvals.`,
  );
}
