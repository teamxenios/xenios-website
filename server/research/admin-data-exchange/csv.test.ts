import { describe, expect, it } from "vitest";
import type {
  AdminCsvErrorCode,
  AdminCsvSchema,
} from "@shared/research/admin-data-exchange";
import {
  adminCsvFormulaRisk,
  parseAdminCsv,
  serializeAdminCsv,
} from "./csv";

type Field = "sku" | "name" | "notes";

const schema: AdminCsvSchema<Field> = {
  strictHeaders: true,
  columns: [
    { key: "sku", header: "SKU" },
    { key: "name", header: "Product Name" },
    { key: "notes", header: "Notes", required: false },
  ],
};

function errorCodes(result: ReturnType<typeof parseAdminCsv<Field>>) {
  return result.ok ? [] : result.errors.map((item) => item.code);
}

describe("Research administration CSV parsing", () => {
  it("parses RFC 4180 quotes, embedded newlines, commas, and Unicode", () => {
    const result = parseAdminCsv(
      new TextEncoder().encode(
        'SKU,Product Name,Notes\r\nA-1,"Café, Δ","Line one\r\nLine ""two"""\r\n',
      ),
      schema,
    );

    expect(result).toEqual({
      ok: true,
      headers: ["SKU", "Product Name", "Notes"],
      records: [
        {
          sku: "A-1",
          name: "Café, Δ",
          notes: 'Line one\r\nLine "two"',
        },
      ],
      byteLength: expect.any(Number),
    });
  });

  it("accepts LF input and an optional leading UTF-8 BOM", () => {
    const accepted = parseAdminCsv(
      "\uFEFFSKU,Product Name\nA-1,Alpha\n",
      schema,
    );
    expect(accepted.ok).toBe(true);

    const rejected = parseAdminCsv(
      "\uFEFFSKU,Product Name\nA-1,Alpha\n",
      schema,
      { allowBom: false },
    );
    expect(errorCodes(rejected)).toEqual(["bom_not_allowed"]);
  });

  it("rejects invalid UTF-8 without exposing decoder or input content", () => {
    const result = parseAdminCsv(new Uint8Array([0xc3, 0x28]), schema);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: "invalid_utf8",
          scope: "file",
          message: "CSV input must be valid UTF-8.",
        },
      ],
    });
  });

  it.each([
    ["duplicate_header", "SKU,SKU\r\nA-1,Alpha\r\n"],
    ["missing_required_header", "SKU,Notes\r\nA-1,Safe\r\n"],
    ["unexpected_header", "SKU,Product Name,Secret\r\nA-1,Alpha,no\r\n"],
    ["inconsistent_row", "SKU,Product Name\r\nA-1\r\n"],
  ] as const)("returns stable %s validation metadata", (code, csv) => {
    const result = parseAdminCsv(csv, schema);
    expect(errorCodes(result)).toContain(code);
    if (!result.ok) {
      expect(JSON.stringify(result.errors)).not.toContain(csv);
      expect(result.errors.every((item) => !("value" in item))).toBe(true);
    }
  });

  it.each([
    'SKU,Product Name\r\nA-1,"unterminated\r\n',
    'SKU,Product Name\r\nA-1,un"expected\r\n',
    'SKU,Product Name\r\nA-1,"closed"tail\r\n',
  ])("rejects malformed quoting", (csv) => {
    expect(errorCodes(parseAdminCsv(csv, schema))).toEqual([
      "malformed_quoting",
    ]);
  });

  it("rejects bare carriage returns and prohibited controls", () => {
    expect(
      errorCodes(parseAdminCsv("SKU,Product Name\rA-1,Alpha", schema)),
    ).toEqual(["malformed_line_ending"]);
    expect(
      errorCodes(parseAdminCsv("SKU,Product Name\r\nA-1,Al\u0000pha", schema)),
    ).toEqual(["control_character"]);
    expect(
      errorCodes(parseAdminCsv("SKU,Product Name\r\nA-1,\tAlpha", schema)),
    ).toEqual(["control_character"]);
  });

  it("reports formula-risk fields by stable coordinates without raw values", () => {
    const secretFormula = "  =HYPERLINK(\"https://invalid.example\",\"secret\")";
    const result = parseAdminCsv(
      `SKU,Product Name\r\nA-1,"${secretFormula.replaceAll('"', '""')}"\r\n`,
      schema,
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: "formula_risk",
          scope: "field",
          message: "CSV cell begins with a spreadsheet formula marker.",
          row: 2,
          column: 2,
          field: "name",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("HYPERLINK");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("enforces configurable byte, row, and column limits", () => {
    expect(
      errorCodes(
        parseAdminCsv("SKU,Product Name\r\nA-1,Alpha\r\n", schema, {
          limits: { maxBytes: 4 },
        }),
      ),
    ).toEqual(["byte_limit_exceeded"]);
    expect(
      errorCodes(
        parseAdminCsv(
          "SKU,Product Name\r\nA-1,Alpha\r\nA-2,Beta\r\n",
          schema,
          { limits: { maxRows: 1 } },
        ),
      ),
    ).toContain("row_limit_exceeded");
    expect(
      errorCodes(
        parseAdminCsv("SKU,Product Name\r\nA-1,Alpha\r\n", schema, {
          limits: { maxColumns: 1 },
        }),
      ),
    ).toContain("column_limit_exceeded");
  });

  it("can ignore unexpected headers only when the schema explicitly opts out", () => {
    const relaxed = {
      ...schema,
      strictHeaders: false,
    } satisfies AdminCsvSchema<Field>;
    const result = parseAdminCsv(
      "SKU,Product Name,External Note\r\nA-1,Alpha,ignored\r\n",
      relaxed,
    );
    expect(result).toMatchObject({
      ok: true,
      records: [{ sku: "A-1", name: "Alpha", notes: "" }],
    });
  });
});

describe("Research administration CSV serialization", () => {
  it("rejects formula-risk schema headers before producing a spreadsheet", () => {
    const unsafeSchema: AdminCsvSchema<"value"> = {
      columns: [{ key: "value", header: " =IMPORTDATA" }],
    };

    expect(serializeAdminCsv([{ value: "safe" }], unsafeSchema)).toMatchObject({
      ok: false,
      errors: [{ code: "invalid_schema", scope: "header" }],
    });
  });

  it("uses schema order, CRLF output, RFC quoting, and deterministic bytes", () => {
    const records = [
      {
        notes: 'Line one\nLine "two"',
        name: "Café, Δ",
        sku: "A-1",
      },
    ];
    const first = serializeAdminCsv(records, schema);
    const second = serializeAdminCsv(records, schema);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true });
    if (!first.ok) return;
    expect(first.csv).toBe(
      'SKU,Product Name,Notes\r\nA-1,"Café, Δ","Line one\nLine ""two"""\r\n',
    );
    expect(new TextDecoder().decode(first.bytes)).toBe(first.csv);
  });

  it.each(["=1+1", " +SUM(A1:A2)", "-2+3", "\n@external"])(
    "neutralizes export formula risk for %j",
    (risky) => {
      const result = serializeAdminCsv(
        [{ sku: "A-1", name: risky, notes: "" }],
        schema,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const parsed = parseAdminCsv(result.bytes, schema);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.records[0].name).toBe(`'${risky}`);
      expect(adminCsvFormulaRisk(parsed.records[0].name)).toBe(false);
    },
  );

  it("supports deterministic BOM output and round-trip parsing", () => {
    const serialized = serializeAdminCsv(
      [{ sku: "A-1", name: "Alpha", notes: "π" }],
      schema,
      { includeBom: true },
    );
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(serialized.csv.startsWith("\uFEFF")).toBe(true);
    expect(parseAdminCsv(serialized.bytes, schema)).toMatchObject({
      ok: true,
      records: [{ sku: "A-1", name: "Alpha", notes: "π" }],
    });
  });

  it("enforces output limits and rejects unsupported field values safely", () => {
    expect(
      serializeAdminCsv([{ sku: "A-1", name: "Alpha" }], schema, {
        limits: { maxRows: 0 },
      }),
    ).toMatchObject({
      ok: false,
      errors: [{ code: "invalid_schema" }],
    });
    expect(
      serializeAdminCsv(
        [{ sku: "A-1", name: "Alpha" }, { sku: "A-2", name: "Beta" }],
        schema,
        { limits: { maxRows: 1 } },
      ),
    ).toMatchObject({
      ok: false,
      errors: [{ code: "row_limit_exceeded" }],
    });
    expect(
      serializeAdminCsv(
        [{ sku: "A-1", name: Number.POSITIVE_INFINITY }],
        schema,
      ),
    ).toMatchObject({
      ok: false,
      errors: [
        {
          code: "invalid_field_value",
          row: 2,
          column: 2,
          field: "name",
        },
      ],
    });
  });
});

describe("Research administration CSV bounded property coverage", () => {
  it("round-trips deterministic safe Unicode records across bounded generated cases", () => {
    let state = 0x5eed1234;
    const next = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    };
    const alphabet = [
      "A",
      "z",
      "0",
      " ",
      ",",
      '"',
      "\n",
      "é",
      "Δ",
      "中",
      "🙂",
    ];
    const generated = (length: number) =>
      Array.from(
        { length },
        () => alphabet[next() % alphabet.length],
      ).join("");

    for (let caseIndex = 0; caseIndex < 128; caseIndex += 1) {
      const record = {
        sku: `SKU-${caseIndex}`,
        name: `N${generated(next() % 18)}`,
        notes: `T${generated(next() % 32)}`,
      };
      const serialized = serializeAdminCsv([record], schema);
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) continue;
      const parsed = parseAdminCsv(serialized.bytes, schema);
      expect(parsed).toMatchObject({ ok: true, records: [record] });
    }
  });

  it("keeps every malformed-file error object free of supplied content", () => {
    const sensitive = "private-token-value";
    const cases = [
      `SKU,Product Name\r\nA-1,"${sensitive}`,
      `SKU,Product Name\r\nA-1,=${sensitive}\r\n`,
      `SKU,Product Name\r\nA-1,Alpha,${sensitive}\r\n`,
    ];
    const allowedCodes = new Set<AdminCsvErrorCode>([
      "malformed_quoting",
      "formula_risk",
      "inconsistent_row",
    ]);

    for (const csv of cases) {
      const result = parseAdminCsv(csv, schema);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors.every((item) => allowedCodes.has(item.code))).toBe(
        true,
      );
      expect(JSON.stringify(result.errors)).not.toContain(sensitive);
      expect(JSON.stringify(result.errors)).not.toContain(csv);
    }
  });
});
