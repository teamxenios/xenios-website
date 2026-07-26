export type AdminCsvValue = string | number | boolean | null | undefined;

export interface AdminCsvColumn<TKey extends string = string> {
  key: TKey;
  header: string;
  required?: boolean;
}

export interface AdminCsvSchema<TKey extends string = string> {
  columns: readonly AdminCsvColumn<TKey>[];
  strictHeaders?: boolean;
}

export interface AdminCsvLimits {
  maxBytes: number;
  maxRows: number;
  maxColumns: number;
}

export interface AdminCsvParseOptions {
  allowBom?: boolean;
  limits?: Partial<AdminCsvLimits>;
}

export interface AdminCsvSerializeOptions {
  includeBom?: boolean;
  limits?: Partial<AdminCsvLimits>;
}

export const ADMIN_CSV_DEFAULT_LIMITS: Readonly<AdminCsvLimits> = {
  maxBytes: 5 * 1024 * 1024,
  maxRows: 10_000,
  maxColumns: 128,
};

export const ADMIN_CSV_ERROR_CODES = [
  "invalid_schema",
  "invalid_utf8",
  "byte_limit_exceeded",
  "row_limit_exceeded",
  "column_limit_exceeded",
  "bom_not_allowed",
  "control_character",
  "empty_file",
  "malformed_quoting",
  "malformed_line_ending",
  "duplicate_header",
  "missing_required_header",
  "unexpected_header",
  "inconsistent_row",
  "formula_risk",
  "invalid_field_value",
] as const;

export type AdminCsvErrorCode = (typeof ADMIN_CSV_ERROR_CODES)[number];
export type AdminCsvErrorScope = "file" | "header" | "row" | "field";

/**
 * Deliberately contains only stable coordinates and schema keys.
 * Raw cells, rows, file content, and decoder/provider messages are excluded.
 */
export interface AdminCsvValidationError<TKey extends string = string> {
  code: AdminCsvErrorCode;
  scope: AdminCsvErrorScope;
  message: string;
  row?: number;
  column?: number;
  field?: TKey;
}

export type AdminCsvRecord<TKey extends string = string> = Record<TKey, string>;

export type AdminCsvParseResult<TKey extends string = string> =
  | {
      ok: true;
      headers: readonly string[];
      records: readonly AdminCsvRecord<TKey>[];
      byteLength: number;
    }
  | {
      ok: false;
      errors: readonly AdminCsvValidationError<TKey>[];
    };

export type AdminCsvSerializeResult =
  | {
      ok: true;
      csv: string;
      bytes: Uint8Array;
      byteLength: number;
    }
  | {
      ok: false;
      errors: readonly AdminCsvValidationError[];
    };
