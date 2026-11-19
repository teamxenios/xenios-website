import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNT_INSTALLATION_SOURCE_PINS, ACCOUNT_INSTALLATION_UNRESOLVED_CONTRACTS,
  AccountInstallationPackageError, buildAccountInstallationPackage, type AccountInstallationSource } from "./installation-package";

const sources = () => ACCOUNT_INSTALLATION_SOURCE_PINS.map(pin => ({ path: pin.path, sql: readFileSync(resolve(process.cwd(), pin.path), "utf8").replaceAll("\r\n", "\n") }));
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

describe("finite account installation source payload", () => {
  it("conserves complete canonical source bytes except the exact two outer transaction envelopes", () => {
    const input = sources(), result = buildAccountInstallationPackage(input), body = Buffer.from(result.transactionBodySql, "utf8");
    expect(result.managedExecutable).toBe(false); expect(result.status).toBe("source_payload_only");
    expect(result.unresolvedContracts).toEqual(ACCOUNT_INSTALLATION_UNRESOLVED_CONTRACTS);
    expect(result.unresolvedContracts).toHaveLength(5);
    expect(result.transactionRequirement).toBe("one_provider_owned_transaction");
    expect(result.requiresExternalPreimageValidation).toBe(true);
    expect(result.bodyBytes).toBe(body.length); expect(result.bodySha256).toBe(sha(body));
    // Independently calculated from pinned Git blobs and the two fixed byte envelopes.
    expect(result.bodyBytes).toBe(82715);
    expect(result.bodySha256).toBe("318c93ba60d87fd9dcdb145ad2162931eaf6ef54c0ebf7c31ba8f78d482806d5");
    expect(result.components.map(component => component.removedOuterTransaction)).toEqual([false, false, false, true, true]);
    for (const [index, component] of result.components.entries()) {
      const original = Buffer.from(input[index].sql, "utf8");
      const section = body.subarray(component.bodyStartByte, component.bodyEndByte);
      expect(component.sourceSha256).toBe(sha(original)); expect(component.payloadSha256).toBe(sha(section));
      expect(section.length).toBe(original.length - (index < 3 ? 0 : 15));
      if (index < 3) expect(section.equals(original)).toBe(true);
      else {
        // Recover the exact input by restoring ONLY its known OUTER envelope.
        // This includes all nested DO/routine BEGIN/END and dollar-quoted SQL.
        const at = original.indexOf(Buffer.from("\nbegin;\n")) + 1;
        expect(Buffer.concat([section.subarray(0, at), Buffer.from("begin;\n"), section.subarray(at), Buffer.from("commit;\n")]).equals(original)).toBe(true);
      }
    }
    expect(result.transactionBodySql).toContain("do $guarded_foundation$");
    expect(result.transactionBodySql).toContain("v_ddl text := $foundation_ddl$");
    expect(result.transactionBodySql).toContain("create or replace function public.research_account_commit_customer_claim(");
    expect((result.transactionBodySql.match(/^begin;\s*$/gm) ?? [])).toHaveLength(0);
    expect((result.transactionBodySql.match(/^commit;\s*$/gm) ?? [])).toHaveLength(0);
  });

  it("produces identical receipts for LF Git blobs and ordinary CRLF checkouts without mutating inputs", () => {
    const lf = sources(), windows = lf.map(source => ({ ...source, sql: source.sql.replaceAll("\n", "\r\n") }));
    const before = structuredClone(windows);
    expect(buildAccountInstallationPackage(windows)).toEqual(buildAccountInstallationPackage(lf));
    expect(windows).toEqual(before);
  });

  it.each([null, undefined, "sql", {}, [null]])("rejects malformed source input without echoing it: %j", input => {
    expect(() => buildAccountInstallationPackage(input as unknown as readonly AccountInstallationSource[])).toThrow(AccountInstallationPackageError);
  });

  it.each(["missing", "extra", "reordered", "duplicate", "foreign path"])("refuses a %s source set rather than assembling a partial/adopted chain", kind => {
    const input = sources();
    if (kind === "missing") input.pop();
    if (kind === "extra") input.push(input[0]);
    if (kind === "reordered") [input[0], input[1]] = [input[1], input[0]];
    if (kind === "duplicate") input[1] = input[0];
    if (kind === "foreign path") input[0] = { ...input[0], path: "supabase/production/research-track-b-commerce.sql" };
    expect(() => buildAccountInstallationPackage(input)).toThrow("account_installation_package_source_set_invalid");
  });

  it.each(["body", "outer begin", "outer commit", "BOM", "bare CR", "trailing SQL"])("rejects changed %s bytes before envelope handling", kind => {
    const input = sources(), index = kind === "outer commit" ? 4 : 3;
    const sql = input[index].sql;
    input[index].sql = kind === "body" ? sql.replace("security definer", "security invoker")
      : kind === "outer begin" ? sql.replace("\nbegin;\n", "\nBEGIN;\n")
      : kind === "outer commit" ? sql.replace(/commit;\n$/, "rollback;\n")
      : kind === "BOM" ? "\uFEFF" + sql
      : kind === "bare CR" ? sql.replace("\n", "\r") : sql + "select 'UNTRUSTED_SQL';\n";
    expect(() => buildAccountInstallationPackage(input)).toThrow("account_installation_package_source_bytes_mismatch");
  });

  it("refuses caller-supplied execution/configuration fields and emits no approval override", () => {
    const input = sources();
    Object.assign(input[0], { managedExecutable: true, project: "foreign", sqlSuffix: "COMMIT" });
    expect(() => buildAccountInstallationPackage(input)).toThrow("account_installation_package_input_invalid");
    const packageValue = buildAccountInstallationPackage(sources());
    expect(Object.isFrozen(packageValue)).toBe(true); expect(Object.isFrozen(packageValue.components)).toBe(true);
    expect(packageValue.components.every(Object.isFrozen)).toBe(true);
    expect(packageValue).not.toHaveProperty("apply"); expect(packageValue).not.toHaveProperty("connection");
    expect(packageValue).not.toHaveProperty("migrationId"); expect(packageValue).not.toHaveProperty("approved");
  });
});
