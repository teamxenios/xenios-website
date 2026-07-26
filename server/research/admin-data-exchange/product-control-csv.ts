import type {
  AdminCsvRecord,
  AdminCsvSchema,
  AdminCsvSerializeResult,
  AdminCsvValidationError,
} from "@shared/research/admin-data-exchange";
import type {
  MediaCsvDraftCommand,
  MediaCsvExportSource,
  PriceCsvDraftCommand,
  PriceCsvExportSource,
  ProductControlCsvBindingContext,
  ProductControlCsvDraftBundle,
  ProductControlCsvExportResult,
  ProductControlCsvField,
  ProductControlCsvParseOptions,
  ProductControlCsvProfile,
  ProductControlCsvRelationshipResult,
  ProductControlCsvResult,
  ProductControlCsvSerializeOptions,
  ProductControlCsvValidationError,
  ProductCsvDraftCommand,
  ProductCsvExportSource,
  VariantCsvDraftCommand,
  VariantCsvExportSource,
} from "@shared/research/admin-data-exchange/product-control-csv";
import {
  MEDIA_CSV_SCHEMA,
  PRICE_CSV_SCHEMA,
  PRODUCT_CSV_SCHEMA,
  VARIANT_CSV_SCHEMA,
} from "@shared/research/admin-data-exchange/product-control-csv";
import {
  PRICE_AUDIENCES,
  PRODUCT_MEDIA_KINDS,
} from "@shared/research/product-admin";
import { PRODUCT_LANES } from "@shared/research/catalog";
import { parseAdminCsv, serializeAdminCsv } from "./csv";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_CODE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{1,95}$/;
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MEDIA_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

const DOMAIN_MESSAGES = {
  required_value: "A required CSV value is missing.",
  invalid_identifier: "CSV identifier format is invalid.",
  invalid_text: "CSV text value is invalid.",
  invalid_json: "CSV JSON value is invalid.",
  invalid_enum: "CSV value is not an allowed option.",
  invalid_boolean: "CSV boolean must be exactly true or false.",
  invalid_integer: "CSV integer is invalid.",
  invalid_date: "CSV date must be a valid RFC 3339 timestamp.",
  invalid_date_range: "CSV effective-date range is invalid.",
  invalid_storage_reference: "CSV storage key reference is invalid.",
  duplicate_identifier: "CSV contains a duplicate canonical identifier.",
  duplicate_business_key: "CSV contains a duplicate business key.",
  unknown_product_binding: "CSV references an unknown product identifier.",
  unknown_variant_binding: "CSV references an unknown variant identifier.",
  variant_product_mismatch:
    "CSV variant is not bound to the specified product identifier.",
} as const;

type DomainCode = keyof typeof DOMAIN_MESSAGES;
type AnyRecord = AdminCsvRecord<ProductControlCsvField>;

function schemaFor(profile: ProductControlCsvProfile): AdminCsvSchema<any> {
  if (profile === "products") return PRODUCT_CSV_SCHEMA;
  if (profile === "variants") return VARIANT_CSV_SCHEMA;
  if (profile === "prices") return PRICE_CSV_SCHEMA;
  return MEDIA_CSV_SCHEMA;
}

function columnFor(
  profile: ProductControlCsvProfile,
  field: ProductControlCsvField | undefined,
): number | undefined {
  if (!field) return undefined;
  const index = schemaFor(profile).columns.findIndex(
    (column: { key: string }) => column.key === field,
  );
  return index < 0 ? undefined : index + 1;
}

function domainError(
  profile: ProductControlCsvProfile,
  code: DomainCode,
  row: number,
  field: ProductControlCsvField,
): ProductControlCsvValidationError {
  return {
    code,
    profile,
    scope: "field",
    message: DOMAIN_MESSAGES[code],
    row,
    column: columnFor(profile, field),
    field,
  };
}

function mapCsvErrors(
  profile: ProductControlCsvProfile,
  errors: readonly AdminCsvValidationError<any>[],
): ProductControlCsvValidationError[] {
  return errors.map((item) => {
    const field =
      typeof item.field === "string"
        ? (item.field as ProductControlCsvField)
        : undefined;
    return {
      code: item.code,
      profile,
      scope: item.scope,
      message: item.message,
      ...(item.row === undefined ? {} : { row: item.row }),
      ...(item.column === undefined ? {} : { column: item.column }),
      ...(field === undefined ? {} : { field }),
    };
  });
}

function requiredText(
  profile: ProductControlCsvProfile,
  record: AnyRecord,
  row: number,
  field: ProductControlCsvField,
  errors: ProductControlCsvValidationError[],
  max: number,
): string | undefined {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    errors.push(domainError(profile, "required_value", row, field));
    return undefined;
  }
  if (value.trim() === "" || value.length > max) {
    errors.push(domainError(profile, "invalid_text", row, field));
    return undefined;
  }
  return value;
}

function optionalText(
  profile: ProductControlCsvProfile,
  record: AnyRecord,
  row: number,
  field: ProductControlCsvField,
  errors: ProductControlCsvValidationError[],
  max: number,
): string | null | undefined {
  const value = record[field];
  if (typeof value !== "string") {
    errors.push(domainError(profile, "required_value", row, field));
    return undefined;
  }
  if (value === "") return null;
  if (value.trim() === "" || value.length > max) {
    errors.push(domainError(profile, "invalid_text", row, field));
    return undefined;
  }
  return value;
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
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

function identifier(
  profile: ProductControlCsvProfile,
  record: AnyRecord,
  row: number,
  field: ProductControlCsvField,
  errors: ProductControlCsvValidationError[],
): string | undefined {
  const value = requiredText(profile, record, row, field, errors, 36);
  if (value === undefined) return undefined;
  if (!UUID.test(value)) {
    errors.push(domainError(profile, "invalid_identifier", row, field));
    return undefined;
  }
  return value;
}

function exactPattern(
  profile: ProductControlCsvProfile,
  record: AnyRecord,
  row: number,
  field: ProductControlCsvField,
  errors: ProductControlCsvValidationError[],
  pattern: RegExp,
  max: number,
): string | undefined {
  const value = requiredText(profile, record, row, field, errors, max);
  if (value === undefined) return undefined;
  if (!pattern.test(value)) {
    errors.push(domainError(profile, "invalid_identifier", row, field));
    return undefined;
  }
  return value;
}

function exactEnum<T extends string>(
  profile: ProductControlCsvProfile,
  record: AnyRecord,
  row: number,
  field: ProductControlCsvField,
  errors: ProductControlCsvValidationError[],
  allowed: readonly T[],
): T | undefined {
  const value = requiredText(profile, record, row, field, errors, 120);
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) {
    errors.push(domainError(profile, "invalid_enum", row, field));
    return undefined;
  }
  return value as T;
}

function exactBoolean(
  profile: ProductControlCsvProfile,
  record: AnyRecord,
  row: number,
  field: ProductControlCsvField,
  errors: ProductControlCsvValidationError[],
): boolean | undefined {
  const value = record[field];
  if (value !== "true" && value !== "false") {
    errors.push(
      domainError(
        profile,
        value === "" ? "required_value" : "invalid_boolean",
        row,
        field,
      ),
    );
    return undefined;
  }
  return value === "true";
}

function exactInteger(
  profile: ProductControlCsvProfile,
  record: AnyRecord,
  row: number,
  field: ProductControlCsvField,
  errors: ProductControlCsvValidationError[],
  maximum = Number.MAX_SAFE_INTEGER,
): number | undefined {
  const value = record[field];
  if (value === "") {
    errors.push(domainError(profile, "required_value", row, field));
    return undefined;
  }
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    errors.push(domainError(profile, "invalid_integer", row, field));
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    errors.push(domainError(profile, "invalid_integer", row, field));
    return undefined;
  }
  return parsed;
}

function exactDate(
  profile: ProductControlCsvProfile,
  record: AnyRecord,
  row: number,
  field: ProductControlCsvField,
  errors: ProductControlCsvValidationError[],
  optional = false,
): string | null | undefined {
  const value = record[field];
  if (value === "" && optional) return null;
  if (value === "") {
    errors.push(domainError(profile, "required_value", row, field));
    return undefined;
  }
  if (!RFC3339.test(value) || !Number.isFinite(Date.parse(value))) {
    errors.push(domainError(profile, "invalid_date", row, field));
    return undefined;
  }
  return value;
}

function aliases(
  record: AnyRecord,
  row: number,
  errors: ProductControlCsvValidationError[],
): string[] | undefined {
  const value = record.aliasesJson;
  if (value === "") {
    errors.push(domainError("products", "required_value", row, "aliasesJson"));
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (item) =>
          typeof item !== "string" ||
          item.trim() === "" ||
          item !== item.trim() ||
          item.length > 120 ||
          !isWellFormedUnicode(item) ||
          containsProhibitedControl(item),
      ) ||
      new Set(parsed).size !== parsed.length
    ) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    errors.push(domainError("products", "invalid_json", row, "aliasesJson"));
    return undefined;
  }
}

function storageReference(
  record: AnyRecord,
  row: number,
  errors: ProductControlCsvValidationError[],
): string | undefined {
  const value = requiredText(
    "media",
    record,
    row,
    "storageKey",
    errors,
    1024,
  );
  if (value === undefined) return undefined;
  const segments = value.split("/");
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("://") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    errors.push(
      domainError("media", "invalid_storage_reference", row, "storageKey"),
    );
    return undefined;
  }
  return value;
}

function productCommand(
  record: AnyRecord,
  row: number,
  errors: ProductControlCsvValidationError[],
): ProductCsvDraftCommand | null {
  const productId = identifier(
    "products",
    record,
    row,
    "productId",
    errors,
  );
  const productCode = exactPattern(
    "products",
    record,
    row,
    "productCode",
    errors,
    PRODUCT_CODE,
    64,
  );
  const slug = exactPattern(
    "products",
    record,
    row,
    "slug",
    errors,
    SLUG,
    120,
  );
  const displayName = requiredText(
    "products",
    record,
    row,
    "displayName",
    errors,
    240,
  );
  const canonicalName = requiredText(
    "products",
    record,
    row,
    "canonicalName",
    errors,
    240,
  );
  const parsedAliases = aliases(record, row, errors);
  const lane = exactEnum(
    "products",
    record,
    row,
    "lane",
    errors,
    PRODUCT_LANES,
  );
  const category = requiredText(
    "products",
    record,
    row,
    "category",
    errors,
    120,
  );
  const classification = requiredText(
    "products",
    record,
    row,
    "classification",
    errors,
    120,
  );
  if (
    productId === undefined ||
    productCode === undefined ||
    slug === undefined ||
    displayName === undefined ||
    canonicalName === undefined ||
    parsedAliases === undefined ||
    lane === undefined ||
    category === undefined ||
    classification === undefined
  ) {
    return null;
  }
  return {
    kind: "product_draft",
    productId,
    input: {
      productCode,
      slug,
      displayName,
      canonicalName,
      aliases: parsedAliases,
      lane,
      category,
      classification,
    },
  };
}

function variantCommand(
  record: AnyRecord,
  row: number,
  errors: ProductControlCsvValidationError[],
): VariantCsvDraftCommand | null {
  const variantId = identifier(
    "variants",
    record,
    row,
    "variantId",
    errors,
  );
  const productId = identifier(
    "variants",
    record,
    row,
    "productId",
    errors,
  );
  const sku = exactPattern(
    "variants",
    record,
    row,
    "sku",
    errors,
    SKU,
    96,
  );
  const catalogNumber = optionalText(
    "variants",
    record,
    row,
    "catalogNumber",
    errors,
    120,
  );
  const label = requiredText(
    "variants",
    record,
    row,
    "label",
    errors,
    160,
  );
  const strength = optionalText(
    "variants",
    record,
    row,
    "strength",
    errors,
    120,
  );
  const size = optionalText(
    "variants",
    record,
    row,
    "size",
    errors,
    120,
  );
  const format = optionalText(
    "variants",
    record,
    row,
    "format",
    errors,
    120,
  );
  const presentation = optionalText(
    "variants",
    record,
    row,
    "presentation",
    errors,
    240,
  );
  const shippingClass = optionalText(
    "variants",
    record,
    row,
    "shippingClass",
    errors,
    120,
  );
  const memberEligible = exactBoolean(
    "variants",
    record,
    row,
    "memberEligible",
    errors,
  );
  const sortOrder = exactInteger(
    "variants",
    record,
    row,
    "sortOrder",
    errors,
  );
  if (
    variantId === undefined ||
    productId === undefined ||
    sku === undefined ||
    catalogNumber === undefined ||
    label === undefined ||
    strength === undefined ||
    size === undefined ||
    format === undefined ||
    presentation === undefined ||
    shippingClass === undefined ||
    memberEligible === undefined ||
    sortOrder === undefined
  ) {
    return null;
  }
  return {
    kind: "variant_draft",
    variantId,
    productId,
    input: {
      sku,
      catalogNumber,
      label,
      strength,
      size,
      format,
      presentation,
      shippingClass,
      memberEligible,
      sortOrder,
    },
  };
}

function priceCommand(
  record: AnyRecord,
  row: number,
  errors: ProductControlCsvValidationError[],
): PriceCsvDraftCommand | null {
  const priceId = identifier("prices", record, row, "priceId", errors);
  const productId = identifier("prices", record, row, "productId", errors);
  const variantId = identifier("prices", record, row, "variantId", errors);
  const audience = exactEnum(
    "prices",
    record,
    row,
    "audience",
    errors,
    PRICE_AUDIENCES,
  );
  const amountCents = exactInteger(
    "prices",
    record,
    row,
    "amountCents",
    errors,
  );
  const currency = exactEnum(
    "prices",
    record,
    row,
    "currency",
    errors,
    ["USD"] as const,
  );
  const effectiveAt = exactDate(
    "prices",
    record,
    row,
    "effectiveAt",
    errors,
  );
  const expiresAt = exactDate(
    "prices",
    record,
    row,
    "expiresAt",
    errors,
    true,
  );
  const approvalNote = optionalText(
    "prices",
    record,
    row,
    "approvalNote",
    errors,
    1000,
  );
  if (
    effectiveAt !== undefined &&
    effectiveAt !== null &&
    expiresAt !== undefined &&
    expiresAt !== null &&
    Date.parse(expiresAt) <= Date.parse(effectiveAt)
  ) {
    errors.push(
      domainError("prices", "invalid_date_range", row, "expiresAt"),
    );
  }
  if (
    priceId === undefined ||
    productId === undefined ||
    variantId === undefined ||
    audience === undefined ||
    amountCents === undefined ||
    currency === undefined ||
    effectiveAt === undefined ||
    effectiveAt === null ||
    expiresAt === undefined ||
    approvalNote === undefined ||
    (expiresAt !== null && Date.parse(expiresAt) <= Date.parse(effectiveAt))
  ) {
    return null;
  }
  return {
    kind: "price_draft",
    priceId,
    productId,
    input: {
      variantId,
      audience,
      amountCents,
      currency,
      effectiveAt,
      expiresAt,
      approvalNote,
    },
  };
}

function mediaCommand(
  record: AnyRecord,
  row: number,
  errors: ProductControlCsvValidationError[],
): MediaCsvDraftCommand | null {
  const mediaId = identifier("media", record, row, "mediaId", errors);
  const productId = identifier("media", record, row, "productId", errors);
  const storageKey = storageReference(record, row, errors);
  const kind = exactEnum(
    "media",
    record,
    row,
    "kind",
    errors,
    PRODUCT_MEDIA_KINDS,
  );
  const filename = requiredText(
    "media",
    record,
    row,
    "filename",
    errors,
    240,
  );
  const contentType = requiredText(
    "media",
    record,
    row,
    "contentType",
    errors,
    120,
  );
  if (contentType !== undefined && !MEDIA_CONTENT_TYPES.has(contentType)) {
    errors.push(domainError("media", "invalid_enum", row, "contentType"));
  }
  const sizeBytes = exactInteger(
    "media",
    record,
    row,
    "sizeBytes",
    errors,
    MAX_MEDIA_BYTES,
  );
  if (sizeBytes === 0) {
    errors.push(domainError("media", "invalid_integer", row, "sizeBytes"));
  }
  const altText = requiredText(
    "media",
    record,
    row,
    "altText",
    errors,
    500,
  );
  const sortOrder = exactInteger(
    "media",
    record,
    row,
    "sortOrder",
    errors,
  );
  if (
    mediaId === undefined ||
    productId === undefined ||
    storageKey === undefined ||
    kind === undefined ||
    filename === undefined ||
    contentType === undefined ||
    !MEDIA_CONTENT_TYPES.has(contentType) ||
    sizeBytes === undefined ||
    sizeBytes === 0 ||
    altText === undefined ||
    sortOrder === undefined
  ) {
    return null;
  }
  return {
    kind: "media_metadata_draft",
    mediaId,
    productId,
    storageKey,
    input: {
      kind,
      filename,
      contentType,
      sizeBytes,
      altText,
      sortOrder,
    },
  };
}

function addDuplicateErrors<T>(
  profile: ProductControlCsvProfile,
  commands: readonly T[],
  errors: ProductControlCsvValidationError[],
  selectors: readonly {
    field: ProductControlCsvField;
    value: (command: T) => string;
    code: "duplicate_identifier" | "duplicate_business_key";
  }[],
): void {
  for (const selector of selectors) {
    const seen = new Set<string>();
    commands.forEach((command, index) => {
      const value = selector.value(command);
      if (seen.has(value)) {
        errors.push(
          domainError(profile, selector.code, index + 2, selector.field),
        );
      }
      seen.add(value);
    });
  }
}

function parseProfile<T, TField extends ProductControlCsvField>(
  input: Uint8Array | string,
  profile: ProductControlCsvProfile,
  schema: AdminCsvSchema<TField>,
  mapper: (
    record: AnyRecord,
    row: number,
    errors: ProductControlCsvValidationError[],
  ) => T | null,
  duplicateSelectors: readonly {
    field: ProductControlCsvField;
    value: (command: T) => string;
    code: "duplicate_identifier" | "duplicate_business_key";
  }[],
  options: ProductControlCsvParseOptions = {},
): ProductControlCsvResult<T> {
  const parsed = parseAdminCsv(input, schema, options);
  if (!parsed.ok) {
    return { ok: false, errors: mapCsvErrors(profile, parsed.errors) };
  }
  const errors: ProductControlCsvValidationError[] = [];
  const commands: T[] = [];
  parsed.records.forEach((record, index) => {
    const command = mapper(record as AnyRecord, index + 2, errors);
    if (command) commands.push(command);
  });
  if (errors.length === 0) {
    addDuplicateErrors(profile, commands, errors, duplicateSelectors);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, commands, byteLength: parsed.byteLength };
}

function applyBindingErrors(
  result: ProductControlCsvResult<any>,
  bundle: ProductControlCsvDraftBundle,
  bindings: ProductControlCsvBindingContext | undefined,
): typeof result {
  if (!result.ok || !bindings) return result;
  const relationship = validateProductControlCsvRelationships(bundle, bindings);
  return relationship.ok ? result : relationship;
}

export function parseProductCsv(
  input: Uint8Array | string,
  options: ProductControlCsvParseOptions = {},
): ProductControlCsvResult<ProductCsvDraftCommand> {
  return parseProfile(
    input,
    "products",
    PRODUCT_CSV_SCHEMA,
    productCommand,
    [
      {
        field: "productId",
        value: (command) => command.productId,
        code: "duplicate_identifier",
      },
      {
        field: "productCode",
        value: (command) => command.input.productCode,
        code: "duplicate_business_key",
      },
      {
        field: "slug",
        value: (command) => command.input.slug,
        code: "duplicate_business_key",
      },
    ],
    options,
  );
}

export function parseVariantCsv(
  input: Uint8Array | string,
  options: ProductControlCsvParseOptions = {},
): ProductControlCsvResult<VariantCsvDraftCommand> {
  const result = parseProfile(
    input,
    "variants",
    VARIANT_CSV_SCHEMA,
    variantCommand,
    [
      {
        field: "variantId",
        value: (command) => command.variantId,
        code: "duplicate_identifier",
      },
      {
        field: "sku",
        value: (command) => command.input.sku,
        code: "duplicate_business_key",
      },
    ],
    options,
  );
  return applyBindingErrors(
    result,
    { variants: result.ok ? result.commands : [] },
    options.bindings,
  );
}

export function parsePriceCsv(
  input: Uint8Array | string,
  options: ProductControlCsvParseOptions = {},
): ProductControlCsvResult<PriceCsvDraftCommand> {
  const result = parseProfile(
    input,
    "prices",
    PRICE_CSV_SCHEMA,
    priceCommand,
    [
      {
        field: "priceId",
        value: (command) => command.priceId,
        code: "duplicate_identifier",
      },
      {
        field: "effectiveAt",
        value: (command) =>
          `${command.input.variantId}\u0000${command.input.audience}\u0000${command.input.effectiveAt}`,
        code: "duplicate_business_key",
      },
    ],
    options,
  );
  return applyBindingErrors(
    result,
    { prices: result.ok ? result.commands : [] },
    options.bindings,
  );
}

export function parseMediaCsv(
  input: Uint8Array | string,
  options: ProductControlCsvParseOptions = {},
): ProductControlCsvResult<MediaCsvDraftCommand> {
  const result = parseProfile(
    input,
    "media",
    MEDIA_CSV_SCHEMA,
    mediaCommand,
    [
      {
        field: "mediaId",
        value: (command) => command.mediaId,
        code: "duplicate_identifier",
      },
      {
        field: "storageKey",
        value: (command) => command.storageKey,
        code: "duplicate_business_key",
      },
    ],
    options,
  );
  return applyBindingErrors(
    result,
    { media: result.ok ? result.commands : [] },
    options.bindings,
  );
}

export function validateProductControlCsvRelationships(
  bundle: ProductControlCsvDraftBundle,
  bindings: ProductControlCsvBindingContext = {},
): ProductControlCsvRelationshipResult {
  const errors: ProductControlCsvValidationError[] = [];
  const products = new Set(bindings.productIds ?? []);
  bundle.products?.forEach((command) => products.add(command.productId));
  const productKnowledge =
    bindings.productIds !== undefined || bundle.products !== undefined;

  const variants = new Map<string, string>(
    Object.entries(bindings.variantProductIds ?? {}),
  );
  bundle.variants?.forEach((command, index) => {
    const known = variants.get(command.variantId);
    if (known !== undefined && known !== command.productId) {
      errors.push(
        domainError(
          "variants",
          "variant_product_mismatch",
          index + 2,
          "productId",
        ),
      );
    } else {
      variants.set(command.variantId, command.productId);
    }
    if (productKnowledge && !products.has(command.productId)) {
      errors.push(
        domainError(
          "variants",
          "unknown_product_binding",
          index + 2,
          "productId",
        ),
      );
    }
  });
  const variantKnowledge =
    bindings.variantProductIds !== undefined || bundle.variants !== undefined;

  bundle.prices?.forEach((command, index) => {
    if (productKnowledge && !products.has(command.productId)) {
      errors.push(
        domainError(
          "prices",
          "unknown_product_binding",
          index + 2,
          "productId",
        ),
      );
    }
    const productId = variants.get(command.input.variantId);
    if (variantKnowledge && productId === undefined) {
      errors.push(
        domainError(
          "prices",
          "unknown_variant_binding",
          index + 2,
          "variantId",
        ),
      );
    } else if (productId !== undefined && productId !== command.productId) {
      errors.push(
        domainError(
          "prices",
          "variant_product_mismatch",
          index + 2,
          "productId",
        ),
      );
    }
  });

  bundle.media?.forEach((command, index) => {
    if (productKnowledge && !products.has(command.productId)) {
      errors.push(
        domainError(
          "media",
          "unknown_product_binding",
          index + 2,
          "productId",
        ),
      );
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true };
}

function exportResult(
  profile: ProductControlCsvProfile,
  result: AdminCsvSerializeResult,
): ProductControlCsvExportResult {
  return result.ok
    ? result
    : { ok: false, errors: mapCsvErrors(profile, result.errors) };
}

function validateExportRecords<T>(
  profile: ProductControlCsvProfile,
  records: readonly AnyRecord[],
  mapper: (
    record: AnyRecord,
    row: number,
    errors: ProductControlCsvValidationError[],
  ) => T | null,
  duplicateSelectors: readonly {
    field: ProductControlCsvField;
    value: (command: T) => string;
    code: "duplicate_identifier" | "duplicate_business_key";
  }[],
): ProductControlCsvValidationError[] {
  const errors: ProductControlCsvValidationError[] = [];
  const commands: T[] = [];
  records.forEach((record, index) => {
    const command = mapper(record, index + 2, errors);
    if (command) commands.push(command);
  });
  if (errors.length === 0) {
    addDuplicateErrors(profile, commands, errors, duplicateSelectors);
  }
  return errors;
}

export function exportProductCsv(
  sources: readonly ProductCsvExportSource[],
  options: ProductControlCsvSerializeOptions = {},
): ProductControlCsvExportResult {
  const records: AnyRecord[] = sources.map((source) => ({
    productId: source.id,
    productCode: source.productCode,
    slug: source.slug,
    displayName: source.displayName,
    canonicalName: source.canonicalName,
    aliasesJson: JSON.stringify(source.aliases),
    lane: source.lane,
    category: source.category,
    classification: source.classification,
  })) as AnyRecord[];
  const errors = validateExportRecords(
    "products",
    records,
    productCommand,
    [
      {
        field: "productId",
        value: (command) => command.productId,
        code: "duplicate_identifier",
      },
      {
        field: "productCode",
        value: (command) => command.input.productCode,
        code: "duplicate_business_key",
      },
      {
        field: "slug",
        value: (command) => command.input.slug,
        code: "duplicate_business_key",
      },
    ],
  );
  if (errors.length) return { ok: false, errors };
  return exportResult(
    "products",
    serializeAdminCsv(records, PRODUCT_CSV_SCHEMA, options),
  );
}

export function exportVariantCsv(
  sources: readonly VariantCsvExportSource[],
  options: ProductControlCsvSerializeOptions = {},
): ProductControlCsvExportResult {
  const records: AnyRecord[] = sources.map((source) => ({
    variantId: source.id,
    productId: source.productId,
    sku: source.sku,
    catalogNumber: source.catalogNumber ?? "",
    label: source.label,
    strength: source.strength ?? "",
    size: source.size ?? "",
    format: source.format ?? "",
    presentation: source.presentation ?? "",
    shippingClass: source.shippingClass ?? "",
    memberEligible: String(source.memberEligible),
    sortOrder: String(source.sortOrder),
  })) as AnyRecord[];
  const errors = validateExportRecords(
    "variants",
    records,
    variantCommand,
    [
      {
        field: "variantId",
        value: (command) => command.variantId,
        code: "duplicate_identifier",
      },
      {
        field: "sku",
        value: (command) => command.input.sku,
        code: "duplicate_business_key",
      },
    ],
  );
  if (errors.length) return { ok: false, errors };
  return exportResult(
    "variants",
    serializeAdminCsv(records, VARIANT_CSV_SCHEMA, options),
  );
}

export function exportPriceCsv(
  sources: readonly PriceCsvExportSource[],
  options: ProductControlCsvSerializeOptions = {},
): ProductControlCsvExportResult {
  const records: AnyRecord[] = sources.map((source) => ({
    priceId: source.id,
    productId: source.productId,
    variantId: source.variantId,
    audience: source.audience,
    amountCents: String(source.amountCents),
    currency: source.currency,
    effectiveAt: source.effectiveAt,
    expiresAt: source.expiresAt ?? "",
    approvalNote: source.approvalNote ?? "",
  })) as AnyRecord[];
  const errors = validateExportRecords("prices", records, priceCommand, [
    {
      field: "priceId",
      value: (command) => command.priceId,
      code: "duplicate_identifier",
    },
    {
      field: "effectiveAt",
      value: (command) =>
        `${command.input.variantId}\u0000${command.input.audience}\u0000${command.input.effectiveAt}`,
      code: "duplicate_business_key",
    },
  ]);
  if (errors.length) return { ok: false, errors };
  return exportResult(
    "prices",
    serializeAdminCsv(records, PRICE_CSV_SCHEMA, options),
  );
}

export function exportMediaCsv(
  sources: readonly MediaCsvExportSource[],
  options: ProductControlCsvSerializeOptions = {},
): ProductControlCsvExportResult {
  const records: AnyRecord[] = sources.map((source) => ({
    mediaId: source.id,
    productId: source.productId,
    storageKey: source.storageKey ?? "",
    kind: source.kind,
    filename: source.filename,
    contentType: source.contentType,
    sizeBytes: String(source.sizeBytes),
    altText: source.altText,
    sortOrder: String(source.sortOrder),
  })) as AnyRecord[];
  const errors = validateExportRecords("media", records, mediaCommand, [
    {
      field: "mediaId",
      value: (command) => command.mediaId,
      code: "duplicate_identifier",
    },
    {
      field: "storageKey",
      value: (command) => command.storageKey,
      code: "duplicate_business_key",
    },
  ]);
  if (errors.length) return { ok: false, errors };
  return exportResult(
    "media",
    serializeAdminCsv(records, MEDIA_CSV_SCHEMA, options),
  );
}
