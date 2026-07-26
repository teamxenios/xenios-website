import type {
  AdminCsvColumn,
  AdminCsvLimits,
  AdminCsvParseOptions,
  AdminCsvParseResult,
  AdminCsvRecord,
  AdminCsvSchema,
  AdminCsvSerializeOptions,
  AdminCsvSerializeResult,
  AdminCsvValidationError,
  AdminCsvValue,
} from "@shared/research/admin-data-exchange";
import { ADMIN_CSV_DEFAULT_LIMITS } from "@shared/research/admin-data-exchange";

const UTF8_BOM = "\uFEFF";
const FORMULA_RISK = /^\s*[=+\-@]/;

const ERROR_MESSAGES = {
  invalid_schema: "CSV schema configuration is invalid.",
  invalid_utf8: "CSV input must be valid UTF-8.",
  byte_limit_exceeded: "CSV byte limit exceeded.",
  row_limit_exceeded: "CSV row limit exceeded.",
  column_limit_exceeded: "CSV column limit exceeded.",
  bom_not_allowed: "CSV byte-order mark is not allowed.",
  control_character: "CSV contains a prohibited control character.",
  empty_file: "CSV input does not contain a header row.",
  malformed_quoting: "CSV quoting is malformed.",
  malformed_line_ending: "CSV contains an unsupported line ending.",
  duplicate_header: "CSV contains a duplicate header.",
  missing_required_header: "CSV is missing a required header.",
  unexpected_header: "CSV contains an unexpected header.",
  inconsistent_row: "CSV row has an inconsistent column count.",
  formula_risk: "CSV cell begins with a spreadsheet formula marker.",
  invalid_field_value: "CSV field value cannot be serialized.",
} as const;

function error<TKey extends string>(
  code: keyof typeof ERROR_MESSAGES,
  scope: AdminCsvValidationError<TKey>["scope"],
  coordinates: Omit<
    AdminCsvValidationError<TKey>,
    "code" | "scope" | "message"
  > = {},
): AdminCsvValidationError<TKey> {
  return {
    code,
    scope,
    message: ERROR_MESSAGES[code],
    ...coordinates,
  };
}

function limitsWithDefaults(
  limits: Partial<AdminCsvLimits> | undefined,
): AdminCsvLimits {
  return { ...ADMIN_CSV_DEFAULT_LIMITS, ...limits };
}

function validateLimits<TKey extends string>(
  limits: AdminCsvLimits,
): AdminCsvValidationError<TKey>[] {
  if (
    !Number.isSafeInteger(limits.maxBytes) ||
    !Number.isSafeInteger(limits.maxRows) ||
    !Number.isSafeInteger(limits.maxColumns) ||
    limits.maxBytes <= 0 ||
    limits.maxRows <= 0 ||
    limits.maxColumns <= 0
  ) {
    return [error("invalid_schema", "file")];
  }
  return [];
}

function validateSchema<TKey extends string>(
  schema: AdminCsvSchema<TKey>,
): AdminCsvValidationError<TKey>[] {
  if (!schema.columns.length) {
    return [error("invalid_schema", "header")];
  }
  const headers = new Set<string>();
  const keys = new Set<string>();
  for (const column of schema.columns) {
    if (
      !column.header ||
      !column.key ||
      headers.has(column.header) ||
      keys.has(column.key) ||
      isFormulaRisk(column.header) ||
      containsProhibitedControl(column.header) ||
      containsProhibitedControl(column.key)
    ) {
      return [error("invalid_schema", "header")];
    }
    headers.add(column.header);
    keys.add(column.key);
  }
  return [];
}

function containsProhibitedControl(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (
      point === 0 ||
      point === 0x7f ||
      (point < 0x20 && point !== 0x0a && point !== 0x0d) ||
      (point >= 0x80 && point <= 0x9f)
    ) {
      return true;
    }
  }
  return false;
}

type RawParseResult<TKey extends string> =
  | { ok: true; rows: string[][] }
  | { ok: false; error: AdminCsvValidationError<TKey> };

function parseRows<TKey extends string>(csv: string): RawParseResult<TKey> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;

  const completeField = () => {
    row.push(field);
    field = "";
    quoteClosed = false;
  };
  const completeRow = () => {
    completeField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (inQuotes) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (quoteClosed) {
      if (character === ",") {
        completeField();
        continue;
      }
      if (character === "\n") {
        completeRow();
        continue;
      }
      if (character === "\r") {
        if (csv[index + 1] !== "\n") {
          return {
            ok: false,
            error: error("malformed_line_ending", "file"),
          };
        }
        completeRow();
        index += 1;
        continue;
      }
      return { ok: false, error: error("malformed_quoting", "file") };
    }

    if (character === '"') {
      if (field.length > 0) {
        return { ok: false, error: error("malformed_quoting", "file") };
      }
      inQuotes = true;
      continue;
    }
    if (character === ",") {
      completeField();
      continue;
    }
    if (character === "\n") {
      completeRow();
      continue;
    }
    if (character === "\r") {
      if (csv[index + 1] !== "\n") {
        return {
          ok: false,
          error: error("malformed_line_ending", "file"),
        };
      }
      completeRow();
      index += 1;
      continue;
    }
    field += character;
  }

  if (inQuotes) {
    return { ok: false, error: error("malformed_quoting", "file") };
  }
  if (quoteClosed || field.length > 0 || row.length > 0) {
    completeRow();
  }
  return { ok: true, rows };
}

function decodeUtf8(
  input: Uint8Array | string,
): { ok: true; text: string; bytes: Uint8Array } | { ok: false } {
  if (typeof input === "string") {
    return { ok: true, text: input, bytes: new TextEncoder().encode(input) };
  }
  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(input),
      bytes: input,
    };
  } catch {
    return { ok: false };
  }
}

function isFormulaRisk(value: string): boolean {
  return FORMULA_RISK.test(value);
}

export function parseAdminCsv<TKey extends string>(
  input: Uint8Array | string,
  schema: AdminCsvSchema<TKey>,
  options: AdminCsvParseOptions = {},
): AdminCsvParseResult<TKey> {
  const limits = limitsWithDefaults(options.limits);
  const configurationErrors = [
    ...validateLimits<TKey>(limits),
    ...validateSchema(schema),
  ];
  if (configurationErrors.length) {
    return { ok: false, errors: configurationErrors };
  }

  const decoded = decodeUtf8(input);
  if (!decoded.ok) {
    return { ok: false, errors: [error("invalid_utf8", "file")] };
  }
  if (decoded.bytes.byteLength > limits.maxBytes) {
    return {
      ok: false,
      errors: [error("byte_limit_exceeded", "file")],
    };
  }

  let csv = decoded.text;
  if (csv.startsWith(UTF8_BOM)) {
    if (options.allowBom === false) {
      return { ok: false, errors: [error("bom_not_allowed", "file")] };
    }
    csv = csv.slice(1);
  }
  if (containsProhibitedControl(csv)) {
    return { ok: false, errors: [error("control_character", "file")] };
  }

  const parsed = parseRows<TKey>(csv);
  if (!parsed.ok) {
    return { ok: false, errors: [parsed.error] };
  }
  if (!parsed.rows.length) {
    return { ok: false, errors: [error("empty_file", "header")] };
  }

  const [headers, ...dataRows] = parsed.rows;
  const errors: AdminCsvValidationError<TKey>[] = [];
  if (headers.length > limits.maxColumns) {
    errors.push(error("column_limit_exceeded", "header"));
  }
  if (dataRows.length > limits.maxRows) {
    errors.push(error("row_limit_exceeded", "file"));
  }

  const headerIndexes = new Map<string, number>();
  headers.forEach((header, index) => {
    if (headerIndexes.has(header)) {
      errors.push(
        error("duplicate_header", "header", { column: index + 1 }),
      );
    } else {
      headerIndexes.set(header, index);
    }
    if (isFormulaRisk(header)) {
      errors.push(error("formula_risk", "header", { column: index + 1 }));
    }
  });

  const schemaByHeader = new Map(
    schema.columns.map((column) => [column.header, column] as const),
  );
  for (const column of schema.columns) {
    if (column.required !== false && !headerIndexes.has(column.header)) {
      errors.push(
        error("missing_required_header", "header", { field: column.key }),
      );
    }
  }
  if (schema.strictHeaders !== false) {
    headers.forEach((header, index) => {
      if (!schemaByHeader.has(header)) {
        errors.push(
          error("unexpected_header", "header", { column: index + 1 }),
        );
      }
    });
  }

  const records: AdminCsvRecord<TKey>[] = [];
  dataRows.forEach((values, dataIndex) => {
    const rowNumber = dataIndex + 2;
    if (values.length !== headers.length) {
      errors.push(error("inconsistent_row", "row", { row: rowNumber }));
      return;
    }
    const record = {} as AdminCsvRecord<TKey>;
    schema.columns.forEach((column) => {
      const columnIndex = headerIndexes.get(column.header);
      const value = columnIndex === undefined ? "" : values[columnIndex];
      record[column.key] = value;
      if (isFormulaRisk(value)) {
        errors.push(
          error("formula_risk", "field", {
            row: rowNumber,
            column:
              columnIndex === undefined ? undefined : columnIndex + 1,
            field: column.key,
          }),
        );
      }
    });
    records.push(record);
  });

  if (errors.length) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    headers,
    records,
    byteLength: decoded.bytes.byteLength,
  };
}

function serializedValue(
  value: AdminCsvValue,
): { ok: true; value: string } | { ok: false } {
  if (value === null || value === undefined) {
    return { ok: true, value: "" };
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return { ok: false };
  }
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return { ok: false };
  }
  const text = String(value);
  if (containsProhibitedControl(text)) {
    return { ok: false };
  }
  return { ok: true, value: isFormulaRisk(text) ? `'${text}` : text };
}

function quoteCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function serializeAdminCsv<TKey extends string>(
  records: readonly Readonly<Partial<Record<TKey, AdminCsvValue>>>[],
  schema: AdminCsvSchema<TKey>,
  options: AdminCsvSerializeOptions = {},
): AdminCsvSerializeResult {
  const limits = limitsWithDefaults(options.limits);
  const configurationErrors = [
    ...validateLimits(limits),
    ...validateSchema(schema),
  ];
  if (configurationErrors.length) {
    return { ok: false, errors: configurationErrors };
  }
  if (schema.columns.length > limits.maxColumns) {
    return {
      ok: false,
      errors: [error("column_limit_exceeded", "header")],
    };
  }
  if (records.length > limits.maxRows) {
    return { ok: false, errors: [error("row_limit_exceeded", "file")] };
  }

  const errors: AdminCsvValidationError[] = [];
  const rows = [schema.columns.map((column) => column.header)];
  records.forEach((record, recordIndex) => {
    const row: string[] = [];
    schema.columns.forEach((column, columnIndex) => {
      const result = serializedValue(record[column.key]);
      if (!result.ok) {
        errors.push(
          error("invalid_field_value", "field", {
            row: recordIndex + 2,
            column: columnIndex + 1,
            field: column.key,
          }),
        );
        row.push("");
      } else {
        row.push(result.value);
      }
    });
    rows.push(row);
  });
  if (errors.length) {
    return { ok: false, errors };
  }

  const prefix = options.includeBom ? UTF8_BOM : "";
  const csv =
    prefix +
    rows
      .map((row) => row.map(quoteCsvCell).join(","))
      .join("\r\n") +
    "\r\n";
  const bytes = new TextEncoder().encode(csv);
  if (bytes.byteLength > limits.maxBytes) {
    return {
      ok: false,
      errors: [error("byte_limit_exceeded", "file")],
    };
  }
  return { ok: true, csv, bytes, byteLength: bytes.byteLength };
}

export function adminCsvFormulaRisk(value: string): boolean {
  return isFormulaRisk(value);
}
