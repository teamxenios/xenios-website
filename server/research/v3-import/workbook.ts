/**
 * Reading the V3 master workbook. Server only.
 *
 * The workbook is not committed to this repository. It is supplied to the
 * importer as plain cell arrays, so this lane can be unit tested with small
 * fixtures and the release authority can run the real file through the same
 * code path (scripts/v3-import-dry-run.mts).
 *
 * Sheet shape, verified against
 * XENIOS_RESEARCH_COMPLETE_MASTER_2026-08-01_V3.xlsx
 * (sha256 e2f7a8e1a59fbda8e01af1fc090112b8b51cc20bf30a890bab53c1d38dbc7f47):
 * row 0 is a title, row 1 is a subtitle, row 2 is the header, and data starts
 * at row 3. Short rows are padded rather than dropped, because a trailing empty
 * cell in a spreadsheet is an absent value and not a malformed row.
 *
 * Nothing here interprets a value. Interpretation is import.ts.
 */

/** The sheets this lane reads. Any other sheet in the file is ignored. */
export const V3_SHEET_OFFER_INDEX = "21 Full Offer Index";
export const V3_SHEET_PRICE_BOOK = "26 JV Complete Price Book";
export const V3_SHEET_IMAGE_MANIFEST = "48 Product Image Manifest";
export const V3_SHEET_PEPTIDE_MASTER = "05 Peptide Master";

/** The header row index in every sheet of this workbook. */
export const V3_HEADER_ROW_INDEX = 2;

export type V3Cell = string | number | boolean | null;

/** One sheet as raw cells, exactly as the spreadsheet holds them. */
export interface V3RawSheet {
  readonly name: string;
  readonly rows: ReadonlyArray<readonly V3Cell[]>;
}

/**
 * The workbook as this lane needs it. The peptide master is optional: without
 * it, peptide rows simply carry no exact variant SKU, which is a reported gap
 * rather than a reason to invent one.
 */
export interface V3RawWorkbook {
  readonly offerIndex: V3RawSheet;
  readonly priceBook: V3RawSheet;
  readonly imageManifest: V3RawSheet;
  readonly peptideMaster?: V3RawSheet;
}

/** One data row, addressable by header name and traceable to a cell. */
export interface V3SheetRow {
  readonly sheet: string;
  /** 1-based spreadsheet row number, so an operator can open the exact cell. */
  readonly rowNumber: number;
  readonly cells: ReadonlyMap<string, V3Cell>;
}

export class V3WorkbookShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V3WorkbookShapeError";
  }
}

function headerNames(sheet: V3RawSheet): readonly string[] {
  const header = sheet.rows[V3_HEADER_ROW_INDEX];
  if (header === undefined) {
    throw new V3WorkbookShapeError(
      `sheet "${sheet.name}" has no header row at index ${V3_HEADER_ROW_INDEX}`,
    );
  }
  const names = header.map((cell) => String(cell ?? "").trim());
  if (names.every((name) => name.length === 0)) {
    throw new V3WorkbookShapeError(
      `sheet "${sheet.name}" header row at index ${V3_HEADER_ROW_INDEX} is empty`,
    );
  }
  return names;
}

/**
 * Every data row of a sheet, keyed by header name. A duplicate header name is a
 * shape error rather than a last-one-wins merge, because a silently shadowed
 * column would make a value read from the wrong place.
 */
export function readV3SheetRows(sheet: V3RawSheet): readonly V3SheetRow[] {
  const names = headerNames(sheet);
  const seen = new Set<string>();
  for (const name of names) {
    if (name.length === 0) continue;
    if (seen.has(name)) {
      throw new V3WorkbookShapeError(
        `sheet "${sheet.name}" repeats the header "${name}"`,
      );
    }
    seen.add(name);
  }

  const rows: V3SheetRow[] = [];
  for (let index = V3_HEADER_ROW_INDEX + 1; index < sheet.rows.length; index += 1) {
    const raw = sheet.rows[index] ?? [];
    const cells = new Map<string, V3Cell>();
    for (let column = 0; column < names.length; column += 1) {
      const name = names[column];
      if (name.length === 0) continue;
      cells.set(name, raw[column] ?? null);
    }
    rows.push({ sheet: sheet.name, rowNumber: index + 1, cells });
  }
  return rows;
}

/** A trimmed string, or null for an absent or blank cell. */
export function cellText(row: V3SheetRow, header: string): string | null {
  const value = row.cells.get(header);
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

/**
 * A money cell as integer cents, or null when absent.
 *
 * Returns the string "unparsable" for a cell that is present but is not an
 * exact non-negative amount at two decimal places. Nothing is rounded into
 * shape and nothing is coerced from text, because a mis-read cost or price is
 * exactly the error this lane exists to prevent.
 */
export function cellAmountCents(
  row: V3SheetRow,
  header: string,
): number | null | "unparsable" {
  const value = row.cells.get(header);
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") {
    return String(value).trim().length === 0 ? null : "unparsable";
  }
  if (!Number.isFinite(value) || value < 0) return "unparsable";
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) return "unparsable";
  // Reject anything finer than a cent rather than silently rounding it.
  if (Math.abs(value * 100 - cents) > 1e-6) return "unparsable";
  return cents;
}
