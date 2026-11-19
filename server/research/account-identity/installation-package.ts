import { createHash } from "node:crypto";

/** Immutable source assembly only. This module has no connection/apply API,
 * migration identity or authority to approve the still-unselected core ACLs. */
export const ACCOUNT_INSTALLATION_SOURCE_SHA = "ae792657bb8faa8f93cf7effc34e4e9c313f839a";
export const ACCOUNT_INSTALLATION_SOURCE_PINS = Object.freeze([
  Object.freeze({ path: "supabase/research-membership.sql", bytes: 3404, sha256: "a5741c2cd9d25e7fec0631e0609cc3e8385f4808026680465ee4a46cf26c46d8", beginOffset: null }),
  Object.freeze({ path: "supabase/research-members.sql", bytes: 1140, sha256: "aa9f6c539f755f08042f90f7799885320e58e2f775f4078fbc6f10cf21b0aded", beginOffset: null }),
  Object.freeze({ path: "supabase/research-orders.sql", bytes: 9246, sha256: "dcac210951410775608f9c0b5413cdcdf054a7741136e1d2844b28375a3c76d0", beginOffset: null }),
  Object.freeze({ path: "supabase/pack02-candidates/20260812_research_account_organizations.sql", bytes: 59747, sha256: "3d9454f7981bb7516efa66e03e19babe00225cb27d871ba155431b5bed6c3eb9", beginOffset: 746 }),
  Object.freeze({ path: "supabase/candidates/account_history_claim_replay.sql", bytes: 9204, sha256: "84ff901e4947ff239d0115eb739d987d620218cfa4d85020c23370d1d100cff3", beginOffset: 312 }),
] as const);

export const ACCOUNT_INSTALLATION_UNRESOLVED_CONTRACTS = Object.freeze([
  "core_acl", "provider_owned_transaction_and_history", "managed_principal",
  "native_event_hooks", "registered_migration_identity",
] as const);

export type AccountInstallationSource = Readonly<{ path: string; sql: string }>;
export type AccountInstallationPackageErrorCode = "input_invalid" | "source_set_invalid" | "source_bytes_mismatch" | "outer_envelope_mismatch";
export class AccountInstallationPackageError extends Error {
  constructor(readonly code: AccountInstallationPackageErrorCode) {
    super("account_installation_package_" + code); this.name = "AccountInstallationPackageError";
  }
}
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A BODY for a later independently governed transaction, not executable managed
 * migration SQL. Only the two pinned outer envelopes are removed, at exact UTF8
 * byte positions. Routine/DO/string bytes and every complete core source remain.
 * A caller must not mistake this receipt for principal/ACL/history approval. */
export function buildAccountInstallationPackage(sources: readonly AccountInstallationSource[]) {
  try {
    if (!Array.isArray(sources)) throw new AccountInstallationPackageError("input_invalid");
    if (sources.length !== ACCOUNT_INSTALLATION_SOURCE_PINS.length) throw new AccountInstallationPackageError("source_set_invalid");
    const chunks: Buffer[] = [];
    let offset = 0;
    const components = ACCOUNT_INSTALLATION_SOURCE_PINS.map((pin, index) => {
      const input: unknown = sources[index];
      if (!input || typeof input !== "object" || Array.isArray(input)
        || Object.keys(input).sort().join(",") !== "path,sql"
        || typeof (input as AccountInstallationSource).path !== "string"
        || typeof (input as AccountInstallationSource).sql !== "string") throw new AccountInstallationPackageError("input_invalid");
      const source = input as AccountInstallationSource;
      if (source.path !== pin.path) throw new AccountInstallationPackageError("source_set_invalid");
      // ONLY checkout CRLF normalization. No trim, BOM acceptance, extraction,
      // statement replacement or case/whitespace repair of canonical bytes.
      const canonical = source.sql.replaceAll("\r\n", "\n");
      const bytes = Buffer.from(canonical, "utf8");
      if (canonical.includes("\r") || bytes.length !== pin.bytes || hash(bytes) !== pin.sha256) {
        throw new AccountInstallationPackageError("source_bytes_mismatch");
      }
      let payload = bytes;
      if (pin.beginOffset !== null) {
        const commitOffset = bytes.length - 8;
        if (!bytes.subarray(pin.beginOffset, pin.beginOffset + 7).equals(Buffer.from("begin;\n"))
          || !bytes.subarray(commitOffset).equals(Buffer.from("commit;\n"))) {
          throw new AccountInstallationPackageError("outer_envelope_mismatch");
        }
        payload = Buffer.concat([bytes.subarray(0, pin.beginOffset), bytes.subarray(pin.beginOffset + 7, commitOffset)]);
      }
      if (index > 0) { chunks.push(Buffer.from("\n")); offset++; }
      const bodyStartByte = offset;
      chunks.push(payload); offset += payload.length;
      return Object.freeze({ path: pin.path, sourceBytes: bytes.length, sourceSha256: pin.sha256,
        payloadBytes: payload.length, payloadSha256: hash(payload), bodyStartByte, bodyEndByte: offset,
        removedOuterTransaction: pin.beginOffset !== null });
    });
    const body = Buffer.concat(chunks);
    return Object.freeze({ sourceSha: ACCOUNT_INSTALLATION_SOURCE_SHA,
      status: "source_payload_only" as const, managedExecutable: false as const,
      transactionRequirement: "one_provider_owned_transaction" as const,
      requiresExternalPreimageValidation: true as const,
      unresolvedContracts: ACCOUNT_INSTALLATION_UNRESOLVED_CONTRACTS,
      components: Object.freeze(components), transactionBodySql: body.toString("utf8"),
      bodyBytes: body.length, bodySha256: hash(body) });
  } catch (error) {
    if (error instanceof AccountInstallationPackageError) throw error;
    throw new AccountInstallationPackageError("input_invalid");
  }
}
