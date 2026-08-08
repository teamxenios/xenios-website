/**
 * F6: THE BROWSER PERSISTENCE AUDIT, DONE THROUGH THE COMPILER, NOT THROUGH GREP.
 *
 * WHY THIS EXISTS AT ALL.
 *
 * The check it replaces was `expect(source).not.toContain("email:")` over two
 * hardcoded files. Text matching over source is the wrong instrument for this
 * question in both directions, and both directions were observed:
 *
 *   FALSE PASS. A regex for `.setItem(` cannot see `store?.setItem(...)`, an
 *   aliased `const s = sessionStorage`, a `storage()` helper that returns one,
 *   or a payload wrapped in `satisfies` / `as`. Every one of those writes to
 *   browser storage and none of them match.
 *
 *   FALSE FAIL. The only occurrence of the string `localStorage` anywhere in
 *   the Early Access persistence path is inside a COMMENT in
 *   `pendingOrderStore.ts` explaining why sessionStorage is used instead. A
 *   substring test for "localStorage" fails on a comment that exists to say
 *   the rule is being followed.
 *
 * So this reads the code the way the compiler does. `localStorage` counts when
 * it is an identifier REFERENCE in the abstract syntax tree, which a comment
 * and a regex literal are not.
 *
 * WHAT IT PROVES.
 *
 *   1. No `localStorage` reference in the Early Access persistence path.
 *   2. Every storage write goes to a KNOWN key. A dynamic or unrecognized key
 *      is a finding, so a new bucket cannot appear unreviewed.
 *   3. Every payload is PROVABLE and within that key's allowed field set.
 *   4. No forbidden field (contact, address, identity, money, payment, proof,
 *      supplier, credential) reaches browser storage under any key.
 *   5. `history.pushState` / `replaceState` carry exactly `earlyAccess` and
 *      `step`.
 *
 * IT FAILS CLOSED. Missing root, an empty scan, an unreadable file, a parse
 * error, an unresolvable storage payload and an internal exception are all
 * FINDINGS. The one and only way to pass is a scan that read real files and
 * proved every write. A detector that cannot see is never reported as a
 * detector that saw nothing.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export type StorageFinding = Readonly<{
  code: string;
  file: string;
  line: number;
  message: string;
}>;

export type StorageAuditResult = Readonly<{
  scannedFiles: readonly string[];
  storageWrites: number;
  historyWrites: number;
  findings: readonly StorageFinding[];
}>;

/** The Early Access browser persistence path, relative to the repository root. */
export const EARLY_ACCESS_STORAGE_ROOT = "client/src/research/early-access";

/**
 * The complete allowed browser-storage surface.
 *
 * `scalar` means the value must be a plain string (an opaque server-issued
 * number, or a random key), never a structured payload. `fields` lists every
 * property name allowed anywhere inside a stored object, including nested
 * ones. Anything not listed is a finding, which is the point: adding a field
 * to browser storage requires editing this table, and editing this table is a
 * reviewable diff.
 */
export type KeyPolicy =
  | Readonly<{ kind: "scalar"; note: string }>
  | Readonly<{ kind: "object"; fields: readonly string[]; note: string }>;

export const EARLY_ACCESS_STORAGE_POLICY: Readonly<Record<string, KeyPolicy>> = Object.freeze({
  "xenios.research.earlyAccess.cart.v1": Object.freeze({
    kind: "object" as const,
    fields: Object.freeze(["version", "items", "productId", "variantId", "quantity"]),
    note: "the browser basket: intent only, no contact, money or identity",
  }),
  "xenios.research.earlyAccess.cartAttempt.v2": Object.freeze({
    kind: "scalar" as const,
    note: "one random cart idempotency key; not authentication and not ownership",
  }),
  "xenios.research.earlyAccess.lastCartCheckout.v1": Object.freeze({
    kind: "scalar" as const,
    note: "a server-issued cart checkout number used only as a recovery pointer",
  }),
  "xenios.earlyAccess.pendingOrder.v1": Object.freeze({
    kind: "object" as const,
    fields: Object.freeze([
      "idempotencyKey",
      "productId",
      "variantId",
      "quantity",
      "fingerprint",
    ]),
    note: "one in-flight single-product attempt: a random key plus a non-authorizing digest",
  }),
  "xenios.earlyAccess.lastOrder.v1": Object.freeze({
    kind: "scalar" as const,
    note: "a server-issued order number used only as a recovery pointer",
  }),
});

/**
 * Names that may never appear in browser storage under ANY key, checked
 * independently of the per-key allow list so that widening a key's field set
 * cannot quietly widen this.
 */
export const FORBIDDEN_STORAGE_FIELDS: readonly string[] = Object.freeze([
  "email", "phone", "recipient", "recipientName", "name", "line1", "line2",
  "address", "street", "city", "region", "state", "postalCode", "zip", "country",
  "customerRef", "customerId", "sessionId", "session", "continuity", "credential",
  "accessCode", "password", "token", "secret",
  "price", "unitPrice", "unitPriceCents", "subtotal", "subtotalCents", "discount",
  "discountCents", "shipping", "shippingCents", "tax", "taxCents", "payable",
  "payableCents", "payableTotalCents", "total", "amount", "amountCents", "currency",
  "paymentReference", "paymentState", "invoice", "invoiceNumber", "receipt",
  "proof", "proofRef", "evidenceRef", "sha256",
  "supplier", "supplierId", "supplierSku",
]);

/** The only keys `history.state` may carry on the Early Access path. */
export const ALLOWED_HISTORY_FIELDS: readonly string[] = Object.freeze(["earlyAccess", "step"]);

const STORAGE_GLOBALS = new Set(["sessionStorage", "localStorage"]);
const STORAGE_METHODS = new Set(["setItem", "getItem", "removeItem", "key", "clear"]);
const HISTORY_METHODS = new Set(["pushState", "replaceState"]);

/**
 * The filesystem seam. Real by default; injectable so the auditor's own
 * fail-closed behavior (missing root, unreadable file) is testable without
 * breaking a real filesystem to produce it.
 */
export type StorageAuditFs = Readonly<{
  listFiles(root: string): readonly string[];
  readFile(file: string): string;
}>;

export const nodeStorageAuditFs: StorageAuditFs = Object.freeze({
  listFiles(root: string): readonly string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full);
      }
    };
    walk(root);
    return out.sort();
  },
  readFile(file: string): string {
    return readFileSync(file, "utf8");
  },
});

function normalize(file: string): string {
  return file.replaceAll("\\", "/");
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Strip `satisfies T`, `as T`, `as const`, parentheses and non-null `!`. */
function unwrap(node: ts.Expression): ts.Expression {
  let current: ts.Expression = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current)) { current = current.expression; continue; }
    if (ts.isAsExpression(current)) { current = current.expression; continue; }
    if (ts.isSatisfiesExpression(current)) { current = current.expression; continue; }
    if (ts.isNonNullExpression(current)) { current = current.expression; continue; }
    if (ts.isTypeAssertionExpression(current)) { current = current.expression; continue; }
    return current;
  }
}

type FileScope = {
  /** Identifier -> the storage global it ultimately refers to. */
  storageAliases: Map<string, "sessionStorage" | "localStorage">;
  /** Function name -> the storage global every one of its returns yields. */
  storageFunctions: Map<string, "sessionStorage" | "localStorage">;
  /** Const identifier -> its initializer, for tracing keys and payloads. */
  bindings: Map<string, ts.Expression>;
  /**
   * `type X = ...` declarations, so a payload handed in as a typed parameter
   * is provable from its DECLARED shape. Without this, every store function
   * that takes its record as an argument (which is all of them) would be
   * unprovable, and an auditor that fails on all real code gets switched off.
   */
  typeAliases: Map<string, ts.TypeNode>;
  /** `interface X { ... }` members, same purpose as the aliases above. */
  interfaces: Map<string, readonly ts.TypeElement[]>;
  /** Identifier -> its declared type, for parameters and annotated variables. */
  valueTypes: Map<string, ts.TypeNode>;
  /**
   * Types this auditor INFERRED for a binding the source does not annotate,
   * currently the element parameter of a `.map(...)` callback. Checked before
   * lexical resolution, because lexical resolution would find the unannotated
   * parameter and learn nothing from it.
   */
  overrides: Map<string, ts.TypeNode>;
};

function withOverride(scope: FileScope, name: string, type: ts.TypeNode): FileScope {
  const overrides = new Map(scope.overrides);
  overrides.set(name, type);
  return { ...scope, overrides };
}

/**
 * Resolve an identifier the way the language does: from the use site outward,
 * nearest declaration wins.
 *
 * A flat file-wide map of name to initializer is WRONG, and was wrong here in
 * a way that mattered. `cartStore.ts` declares `const cart` twice, once in the
 * function that writes the basket and once in the function that clears it. The
 * flat map kept whichever came last, so the auditor analysed the EMPTY cart and
 * would have passed a write that put contact details in the real one. The
 * mutation suite caught exactly that, which is what a mutation suite is for.
 */
function lexicalBinding(
  name: string,
  from: ts.Node | undefined,
): Readonly<{ initializer?: ts.Expression; type?: ts.TypeNode }> | null {
  let node: ts.Node | undefined = from;
  while (node) {
    if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseClause(node)) {
      for (const statement of node.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
            return Object.freeze({ initializer: declaration.initializer, type: declaration.type });
          }
        }
      }
    }
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node)
    ) {
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name) && parameter.name.text === name) {
          return Object.freeze({ initializer: parameter.initializer, type: parameter.type });
        }
      }
    }
    node = node.parent;
  }
  return null;
}

/**
 * Which storage global this expression denotes, or null.
 *
 * Understands `sessionStorage`, `window.sessionStorage`, `globalThis.x`,
 * optional chaining (`window?.sessionStorage`), a `??` fallback whose left
 * side is storage, an alias identifier, and a call to a storage-returning
 * helper. This is the whole point of the AST: every one of these is invisible
 * to a `.setItem(` regex.
 */
function storageKindOf(node: ts.Expression, scope: FileScope): "sessionStorage" | "localStorage" | null {
  const expression = unwrap(node);

  if (ts.isIdentifier(expression)) {
    if (STORAGE_GLOBALS.has(expression.text)) {
      return expression.text as "sessionStorage" | "localStorage";
    }
    return scope.storageAliases.get(expression.text) ?? null;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    if (STORAGE_GLOBALS.has(expression.name.text)) {
      return expression.name.text as "sessionStorage" | "localStorage";
    }
    return null;
  }

  if (ts.isElementAccessExpression(expression)) {
    const argument = unwrap(expression.argumentExpression);
    if (ts.isStringLiteral(argument) && STORAGE_GLOBALS.has(argument.text)) {
      return argument.text as "sessionStorage" | "localStorage";
    }
    return null;
  }

  if (ts.isCallExpression(expression)) {
    const callee = unwrap(expression.expression);
    if (ts.isIdentifier(callee)) return scope.storageFunctions.get(callee.text) ?? null;
    return null;
  }

  if (ts.isBinaryExpression(expression)) {
    // `storage() ?? null`, `a || b`: storage on either side makes it storage.
    const operator = expression.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.QuestionQuestionToken ||
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      return (
        storageKindOf(expression.left, scope) ?? storageKindOf(expression.right, scope)
      );
    }
    return null;
  }

  if (ts.isConditionalExpression(expression)) {
    return (
      storageKindOf(expression.whenTrue, scope) ?? storageKindOf(expression.whenFalse, scope)
    );
  }

  return null;
}

function returnedExpressions(body: ts.Node): ts.Expression[] {
  const out: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      if (node !== body) return; // do not cross into a nested function
    }
    if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

function buildScope(sourceFile: ts.SourceFile): FileScope {
  const scope: FileScope = {
    storageAliases: new Map(),
    storageFunctions: new Map(),
    bindings: new Map(),
    typeAliases: new Map(),
    interfaces: new Map(),
    valueTypes: new Map(),
    overrides: new Map(),
  };

  // Collect every binding first, everywhere (not only at module level), so a
  // helper declared below its use is still resolved.
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer) scope.bindings.set(node.name.text, node.initializer);
      if (node.type) scope.valueTypes.set(node.name.text, node.type);
    }
    if (ts.isTypeAliasDeclaration(node)) scope.typeAliases.set(node.name.text, node.type);
    if (ts.isInterfaceDeclaration(node)) scope.interfaces.set(node.name.text, node.members);
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.type) {
      scope.valueTypes.set(node.name.text, node.type);
    }
    ts.forEachChild(node, collect);
  };
  ts.forEachChild(sourceFile, collect);

  // Fixpoint: aliases can be defined in terms of helpers and helpers in terms
  // of aliases, so iterate until nothing new is learned.
  for (let pass = 0; pass < 4; pass += 1) {
    const before = scope.storageAliases.size + scope.storageFunctions.size;

    const learn = (node: ts.Node): void => {
      if (
        (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.body
      ) {
        const returns = returnedExpressions(node.body);
        const kinds = returns.map((expression) => storageKindOf(expression, scope));
        const found = kinds.find((kind) => kind !== null);
        if (found) scope.storageFunctions.set(node.name.text, found);
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const initializer = unwrap(node.initializer);
        if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
          const body = initializer.body;
          const returns = ts.isBlock(body) ? returnedExpressions(body) : [body];
          const found = returns
            .map((expression) => storageKindOf(expression, scope))
            .find((kind) => kind !== null);
          if (found) scope.storageFunctions.set(node.name.text, found);
        } else {
          const kind = storageKindOf(node.initializer, scope);
          if (kind) scope.storageAliases.set(node.name.text, kind);
        }
      }
      ts.forEachChild(node, learn);
    };
    ts.forEachChild(sourceFile, learn);

    if (scope.storageAliases.size + scope.storageFunctions.size === before) break;
  }

  return scope;
}

/** A statically provable string, or null. */
function staticString(node: ts.Expression | undefined, scope: FileScope, depth = 0): string | null {
  if (!node || depth > 24) return null;
  const expression = unwrap(node);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isIdentifier(expression)) {
    const local = lexicalBinding(expression.text, expression);
    if (local?.initializer) return staticString(local.initializer, scope, depth + 1);
    const bound = scope.bindings.get(expression.text);
    return bound ? staticString(bound, scope, depth + 1) : null;
  }
  return null;
}

type PayloadShape =
  | Readonly<{ kind: "object"; fields: readonly string[] }>
  | Readonly<{ kind: "scalar" }>
  | Readonly<{ kind: "unprovable"; why: string }>;

const SCALAR_TYPE_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.BigIntKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.UndefinedKeyword,
]);

/**
 * The DECLARED shape of a type, which is how a payload passed in as a typed
 * parameter is proven. Understands type literals, `Readonly<T>`, arrays,
 * `readonly T[]`, unions, local aliases and interfaces, string-literal unions,
 * and `(typeof CONST_ARRAY)[number]` over an `as const` list of strings.
 */
function shapeFromType(node: ts.TypeNode | undefined, scope: FileScope, depth = 0): PayloadShape {
  if (!node) return Object.freeze({ kind: "unprovable" as const, why: "no declared type" });
  if (depth > 24) return Object.freeze({ kind: "unprovable" as const, why: "type resolution too deep" });

  if (ts.isParenthesizedTypeNode(node)) return shapeFromType(node.type, scope, depth + 1);
  if (SCALAR_TYPE_KINDS.has(node.kind)) return Object.freeze({ kind: "scalar" as const });
  if (ts.isLiteralTypeNode(node)) return Object.freeze({ kind: "scalar" as const });

  if (ts.isTypeOperatorNode(node)) {
    // `readonly T[]` and `keyof T`. Only the readonly modifier is transparent.
    if (node.operator === ts.SyntaxKind.ReadonlyKeyword) {
      return shapeFromType(node.type, scope, depth + 1);
    }
    return Object.freeze({ kind: "unprovable" as const, why: "an unsupported type operator" });
  }

  if (ts.isArrayTypeNode(node)) return shapeFromType(node.elementType, scope, depth + 1);

  if (ts.isTypeLiteralNode(node)) return membersShape(node.members, scope, depth);

  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    const fields: string[] = [];
    let sawObject = false;
    for (const member of node.types) {
      const inner = shapeFromType(member, scope, depth + 1);
      if (inner.kind === "unprovable") return inner;
      if (inner.kind === "object") {
        sawObject = true;
        fields.push(...inner.fields);
      }
    }
    return sawObject
      ? Object.freeze({ kind: "object" as const, fields: Object.freeze([...new Set(fields)]) })
      : Object.freeze({ kind: "scalar" as const });
  }

  if (ts.isIndexedAccessTypeNode(node)) {
    // `(typeof STEPS)[number]` over an `as const` array of string literals.
    // The parentheses are part of the syntax here, so unwrap them first.
    let object: ts.TypeNode = node.objectType;
    while (ts.isParenthesizedTypeNode(object)) object = object.type;
    if (
      node.indexType.kind === ts.SyntaxKind.NumberKeyword &&
      ts.isTypeQueryNode(object) &&
      ts.isIdentifier(object.exprName)
    ) {
      const bound = scope.bindings.get(object.exprName.text);
      if (bound) {
        const list = unwrap(bound);
        if (
          ts.isArrayLiteralExpression(list) &&
          list.elements.length > 0 &&
          list.elements.every((element) => ts.isStringLiteral(unwrap(element)))
        ) {
          return Object.freeze({ kind: "scalar" as const });
        }
      }
    }
    return Object.freeze({ kind: "unprovable" as const, why: "an indexed access type" });
  }

  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const name = node.typeName.text;
    const args = node.typeArguments;
    if ((name === "Readonly" || name === "ReadonlyArray" || name === "Array") && args?.length) {
      return shapeFromType(args[0]!, scope, depth + 1);
    }
    const alias = scope.typeAliases.get(name);
    if (alias) return shapeFromType(alias, scope, depth + 1);
    const members = scope.interfaces.get(name);
    if (members) return membersShape(members, scope, depth);
    return Object.freeze({
      kind: "unprovable" as const,
      why: `the type '${name}' is not declared in this file, so its shape cannot be proven here`,
    });
  }

  return Object.freeze({
    kind: "unprovable" as const,
    why: `a type of kind ${ts.SyntaxKind[node.kind]} this auditor cannot prove`,
  });
}

function membersShape(
  members: readonly ts.TypeElement[],
  scope: FileScope,
  depth: number,
): PayloadShape {
  const fields: string[] = [];
  for (const member of members) {
    if (!ts.isPropertySignature(member)) {
      return Object.freeze({
        kind: "unprovable" as const,
        why: "a type member that is not a plain property (an index signature or method could carry anything)",
      });
    }
    const name = member.name;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
      fields.push(name.text);
    } else {
      return Object.freeze({ kind: "unprovable" as const, why: "an unsupported property name in a type" });
    }
    const nested = shapeFromType(member.type, scope, depth + 1);
    if (nested.kind === "unprovable") return nested;
    if (nested.kind === "object") fields.push(...nested.fields);
  }
  return Object.freeze({ kind: "object" as const, fields: Object.freeze([...new Set(fields)]) });
}

/** The element type of `readonly T[]`, `T[]` or `ReadonlyArray<T>`. */
function elementType(node: ts.TypeNode | undefined): ts.TypeNode | undefined {
  if (!node) return undefined;
  if (ts.isParenthesizedTypeNode(node)) return elementType(node.type);
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) {
    return elementType(node.type);
  }
  if (ts.isArrayTypeNode(node)) return node.elementType;
  if (
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    (node.typeName.text === "ReadonlyArray" || node.typeName.text === "Array") &&
    node.typeArguments?.length
  ) {
    return node.typeArguments[0];
  }
  return undefined;
}

function objectFields(node: ts.ObjectLiteralExpression, scope: FileScope, depth: number): PayloadShape {
  const fields: string[] = [];
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) {
      const inner = payloadShape(property.expression, scope, depth + 1);
      if (inner.kind === "unprovable") {
        return Object.freeze({
          kind: "unprovable" as const,
          why: `a spread whose shape cannot be proven (${inner.why})`,
        });
      }
      if (inner.kind === "object") fields.push(...inner.fields);
      continue;
    }
    const name = property.name;
    if (!name) return Object.freeze({ kind: "unprovable" as const, why: "a property with no name" });
    if (ts.isComputedPropertyName(name)) {
      const literal = staticString(name.expression, scope);
      if (literal === null) {
        return Object.freeze({
          kind: "unprovable" as const,
          why: "a computed property name that is not a literal",
        });
      }
      fields.push(literal);
    } else if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
      fields.push(name.text);
    } else {
      return Object.freeze({ kind: "unprovable" as const, why: "an unsupported property name" });
    }

    // Nested objects and arrays of objects contribute their own field names,
    // and a nested value this auditor cannot prove makes the WHOLE payload
    // unprovable. Dropping an unresolvable nested value would be the exact
    // failure this file exists to prevent: an unreadable branch reported as
    // nothing found.
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const value = ts.isPropertyAssignment(property)
        ? property.initializer
        : scope.bindings.get(property.name.text);
      const nested = value
        ? payloadShape(value, scope, depth + 1)
        : shapeFromType(
            scope.overrides.get((property.name as ts.Identifier).text) ??
              lexicalBinding((property.name as ts.Identifier).text, property)?.type,
            scope,
            depth + 1,
          );
      if (nested.kind === "unprovable") {
        return Object.freeze({
          kind: "unprovable" as const,
          why: `the value of '${(property.name as ts.Identifier).text}' cannot be proven (${nested.why})`,
        });
      }
      if (nested.kind === "object") fields.push(...nested.fields);
    }
  }
  return Object.freeze({ kind: "object" as const, fields: Object.freeze([...new Set(fields)]) });
}

/**
 * What is actually being written. Resolves through `JSON.stringify`, `satisfies`,
 * `as`, parentheses, a const alias, a `.map(...)` over object literals, and
 * `Object.freeze`. Anything it cannot prove is reported as unprovable, never
 * assumed safe.
 */
export function payloadShape(node: ts.Expression, scope: FileScope, depth = 0): PayloadShape {
  if (depth > 24) return Object.freeze({ kind: "unprovable" as const, why: "resolution too deep" });
  const expression = unwrap(node);

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return Object.freeze({ kind: "scalar" as const });
  }
  if (ts.isTemplateExpression(expression)) return Object.freeze({ kind: "scalar" as const });
  if (ts.isNumericLiteral(expression) || ts.isBigIntLiteral(expression)) {
    return Object.freeze({ kind: "scalar" as const });
  }
  if (
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(expression) && expression.text === "undefined")
  ) {
    return Object.freeze({ kind: "scalar" as const });
  }

  if (ts.isObjectLiteralExpression(expression)) return objectFields(expression, scope, depth);

  if (ts.isArrayLiteralExpression(expression)) {
    const fields: string[] = [];
    for (const element of expression.elements) {
      const inner = payloadShape(element, scope, depth + 1);
      if (inner.kind === "unprovable") return inner;
      if (inner.kind === "object") fields.push(...inner.fields);
    }
    return Object.freeze({ kind: "object" as const, fields: Object.freeze([...new Set(fields)]) });
  }

  if (ts.isIdentifier(expression)) {
    const injected = scope.overrides.get(expression.text);
    if (injected) return shapeFromType(injected, scope, depth + 1);
    // Nearest declaration wins, resolved from THIS use site outward.
    const local = lexicalBinding(expression.text, expression);
    if (local?.initializer) return payloadShape(local.initializer, scope, depth + 1);
    // A typed parameter is the normal way a store function receives its
    // record, so fall back to the DECLARED type. That is a proof, not a
    // guess: the compiler refuses any caller whose argument does not match it.
    if (local?.type) return shapeFromType(local.type, scope, depth + 1);
    return Object.freeze({
      kind: "unprovable" as const,
      why: `the value comes from '${expression.text}', which this file neither defines nor types`,
    });
  }

  if (ts.isCallExpression(expression)) {
    const callee = unwrap(expression.expression);
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "JSON" &&
      callee.name.text === "stringify" &&
      expression.arguments.length > 0
    ) {
      return payloadShape(expression.arguments[0]!, scope, depth + 1);
    }
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "Object" &&
      (callee.name.text === "freeze" || callee.name.text === "assign") &&
      expression.arguments.length > 0
    ) {
      return payloadShape(expression.arguments[0]!, scope, depth + 1);
    }
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === "map") {
      const mapper = expression.arguments[0];
      if (mapper && (ts.isArrowFunction(mapper) || ts.isFunctionExpression(mapper))) {
        // Bind the callback's element parameter to the element type of the
        // array being mapped, so `items.map((item) => ({...item}))` is proven
        // from `items: readonly BrowserCartItem[]` rather than abandoned.
        let inner = scope;
        const source = unwrap(callee.expression);
        const element =
          ts.isIdentifier(source) ? elementType(scope.valueTypes.get(source.text)) : undefined;
        const parameter = mapper.parameters[0];
        if (element && parameter && ts.isIdentifier(parameter.name)) {
          inner = withOverride(scope, parameter.name.text, element);
        }
        const body = mapper.body;
        const returns = ts.isBlock(body) ? returnedExpressions(body) : [body];
        const fields: string[] = [];
        for (const returned of returns) {
          const shape = payloadShape(returned, inner, depth + 1);
          if (shape.kind === "unprovable") return shape;
          if (shape.kind === "object") fields.push(...shape.fields);
        }
        return Object.freeze({ kind: "object" as const, fields: Object.freeze([...new Set(fields)]) });
      }
    }
    return Object.freeze({
      kind: "unprovable" as const,
      why: "the value is produced by a call this auditor cannot follow",
    });
  }

  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return Object.freeze({
      kind: "unprovable" as const,
      why: "the value is read from an object this auditor cannot follow",
    });
  }

  if (ts.isBinaryExpression(expression)) {
    const left = payloadShape(expression.left, scope, depth + 1);
    const right = payloadShape(expression.right, scope, depth + 1);
    if (left.kind === "scalar" && right.kind === "scalar") return Object.freeze({ kind: "scalar" as const });
    if (left.kind === "unprovable") return left;
    if (right.kind === "unprovable") return right;
    const fields = [
      ...(left.kind === "object" ? left.fields : []),
      ...(right.kind === "object" ? right.fields : []),
    ];
    return Object.freeze({ kind: "object" as const, fields: Object.freeze([...new Set(fields)]) });
  }

  return Object.freeze({
    kind: "unprovable" as const,
    why: `an expression of kind ${ts.SyntaxKind[expression.kind]} this auditor cannot prove`,
  });
}

function isHistoryTarget(node: ts.Expression): boolean {
  const expression = unwrap(node);
  if (ts.isIdentifier(expression)) return expression.text === "history";
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === "history";
  return false;
}

function auditFile(
  file: string,
  source: string,
  displayName: string,
  findings: StorageFinding[],
  counters: { storageWrites: number; historyWrites: number },
): void {
  const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(displayName, source, ts.ScriptTarget.Latest, true, scriptKind);

  // TypeScript's parser is error tolerant: it returns a tree for input it could
  // not fully understand. A tree built from a file the parser choked on cannot
  // support any claim about that file, so a parse diagnostic is a FINDING and
  // the file is not analyzed further. This is the case a detector that
  // swallowed its own errors and printed "0" would have reported as clean.
  const parseDiagnostics = (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  if (parseDiagnostics && parseDiagnostics.length > 0) {
    const first = parseDiagnostics[0]!;
    findings.push({
      code: "PARSE_ERROR",
      file: displayName,
      line: 1,
      message: `TypeScript could not parse this file, so nothing about it is proven: ${ts.flattenDiagnosticMessageText(first.messageText, " ")}`,
    });
    return;
  }

  const scope = buildScope(sourceFile);

  const visit = (node: ts.Node): void => {
    // 1. Any localStorage identifier REFERENCE. A comment or a regex literal
    //    mentioning it is not a reference and does not reach here, which is
    //    exactly why this is an AST walk and not a substring search.
    if (ts.isIdentifier(node) && node.text === "localStorage") {
      const parent = node.parent;
      const isDeclarationName =
        parent &&
        (ts.isVariableDeclaration(parent) || ts.isPropertySignature(parent) || ts.isParameter(parent)) &&
        (parent as { name?: ts.Node }).name === node;
      if (!isDeclarationName) {
        findings.push({
          code: "LOCAL_STORAGE_REFERENCE",
          file: displayName,
          line: lineOf(sourceFile, node),
          message:
            "localStorage is referenced in the Early Access persistence path. The pilot identity is session scoped, so its memory must die with the session.",
        });
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);

      // 2. Storage operations, including optional-chained and aliased ones.
      if (ts.isPropertyAccessExpression(callee) && STORAGE_METHODS.has(callee.name.text)) {
        const kind = storageKindOf(callee.expression, scope);
        if (kind !== null) {
          const line = lineOf(sourceFile, node);
          if (kind === "localStorage") {
            findings.push({
              code: "LOCAL_STORAGE_REFERENCE",
              file: displayName,
              line,
              message: `localStorage.${callee.name.text} is called in the Early Access persistence path.`,
            });
          }
          if (callee.name.text === "setItem") {
            counters.storageWrites += 1;
            auditWrite(node, scope, displayName, line, findings);
          }
        }
      }

      // 3. History writes.
      if (
        ts.isPropertyAccessExpression(callee) &&
        HISTORY_METHODS.has(callee.name.text) &&
        isHistoryTarget(callee.expression)
      ) {
        counters.historyWrites += 1;
        auditHistory(node, scope, displayName, lineOf(sourceFile, node), findings);
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
}

function auditWrite(
  call: ts.CallExpression,
  scope: FileScope,
  file: string,
  line: number,
  findings: StorageFinding[],
): void {
  const keyArgument = call.arguments[0];
  const valueArgument = call.arguments[1];
  const key = staticString(keyArgument, scope);

  if (key === null) {
    findings.push({
      code: "UNKNOWN_STORAGE_KEY",
      file,
      line,
      message:
        "the storage key is not a statically provable literal, so a new browser bucket could appear without review",
    });
    return;
  }

  const policy = EARLY_ACCESS_STORAGE_POLICY[key];
  if (policy === undefined) {
    findings.push({
      code: "UNKNOWN_STORAGE_KEY",
      file,
      line,
      message: `'${key}' is not in the reviewed Early Access storage policy. Add it there, with its allowed fields, before writing to it.`,
    });
    return;
  }

  if (valueArgument === undefined) {
    findings.push({
      code: "UNPROVABLE_PAYLOAD",
      file,
      line,
      message: `setItem('${key}') was called with no value`,
    });
    return;
  }

  const shape = payloadShape(valueArgument, scope);

  if (shape.kind === "unprovable") {
    findings.push({
      code: "UNPROVABLE_PAYLOAD",
      file,
      line,
      message: `what is written to '${key}' cannot be proven: ${shape.why}. An unprovable payload is a finding, never an assumption of safety.`,
    });
    return;
  }

  if (policy.kind === "scalar") {
    if (shape.kind !== "scalar") {
      findings.push({
        code: "FORBIDDEN_PAYLOAD_FIELD",
        file,
        line,
        message: `'${key}' is a scalar recovery pointer (${policy.note}) but a structured object is being written to it: ${shape.fields.join(", ")}`,
      });
    }
    return;
  }

  if (shape.kind === "scalar") return; // narrower than allowed is fine

  for (const field of shape.fields) {
    if (FORBIDDEN_STORAGE_FIELDS.includes(field)) {
      findings.push({
        code: "FORBIDDEN_PAYLOAD_FIELD",
        file,
        line,
        message: `'${field}' may never be written to browser storage, and it is being written to '${key}'`,
      });
      continue;
    }
    if (!policy.fields.includes(field)) {
      findings.push({
        code: "FORBIDDEN_PAYLOAD_FIELD",
        file,
        line,
        message: `'${field}' is not in the reviewed field set for '${key}' (${policy.fields.join(", ")})`,
      });
    }
  }
}

function auditHistory(
  call: ts.CallExpression,
  scope: FileScope,
  file: string,
  line: number,
  findings: StorageFinding[],
): void {
  const stateArgument = call.arguments[0];
  if (stateArgument === undefined) return;
  const shape = payloadShape(stateArgument, scope);

  if (shape.kind === "unprovable") {
    findings.push({
      code: "UNPROVABLE_HISTORY_STATE",
      file,
      line,
      message: `what is pushed into history.state cannot be proven: ${shape.why}`,
    });
    return;
  }
  if (shape.kind === "scalar") return;

  for (const field of shape.fields) {
    if (!ALLOWED_HISTORY_FIELDS.includes(field)) {
      findings.push({
        code: "FORBIDDEN_HISTORY_FIELD",
        file,
        line,
        message: `history.state may carry exactly ${ALLOWED_HISTORY_FIELDS.join(" and ")}; '${field}' is not allowed`,
      });
    }
  }
}

/**
 * Run the audit.
 *
 * Every failure mode of the auditor ITSELF is a finding: this function never
 * reports an empty findings list because it could not look.
 */
export function auditStoragePolicy(input: {
  readonly root: string;
  readonly repoRoot?: string;
  readonly fs?: StorageAuditFs;
}): StorageAuditResult {
  const fs = input.fs ?? nodeStorageAuditFs;
  const findings: StorageFinding[] = [];
  const counters = { storageWrites: 0, historyWrites: 0 };
  const scanned: string[] = [];
  const repoRoot = input.repoRoot ?? input.root;

  let files: readonly string[] = [];
  try {
    files = fs.listFiles(input.root);
  } catch (error) {
    return Object.freeze({
      scannedFiles: Object.freeze([]),
      storageWrites: 0,
      historyWrites: 0,
      findings: Object.freeze([
        {
          code: "MISSING_ROOT",
          file: normalize(input.root),
          line: 0,
          message: `the storage audit root could not be listed, so nothing was checked: ${(error as Error).message}`,
        },
      ]),
    });
  }

  if (files.length === 0) {
    return Object.freeze({
      scannedFiles: Object.freeze([]),
      storageWrites: 0,
      historyWrites: 0,
      findings: Object.freeze([
        {
          code: "EMPTY_SCAN",
          file: normalize(input.root),
          line: 0,
          message:
            "the storage audit matched zero files. A scan that reads nothing proves nothing, so this is a failure, not a clean result.",
        },
      ]),
    });
  }

  for (const file of files) {
    const displayName = normalize(relative(repoRoot, file) || file);
    let source: string;
    try {
      source = fs.readFile(file);
    } catch (error) {
      findings.push({
        code: "UNREADABLE_FILE",
        file: displayName,
        line: 0,
        message: `this file is in the audited path but could not be read, so nothing about it is proven: ${(error as Error).message}`,
      });
      continue;
    }
    scanned.push(displayName);
    try {
      auditFile(file, source, displayName, findings, counters);
    } catch (error) {
      // An exception inside the detector is a failed audit, never a pass.
      findings.push({
        code: "AUDITOR_FAILED",
        file: displayName,
        line: 0,
        message: `the storage auditor threw while analyzing this file, so its result is unknown: ${(error as Error).message}`,
      });
    }
  }

  return Object.freeze({
    scannedFiles: Object.freeze(scanned),
    storageWrites: counters.storageWrites,
    historyWrites: counters.historyWrites,
    findings: Object.freeze(findings),
  });
}

function isCli(): boolean {
  return Boolean(
    process.argv[1] &&
      resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(),
  );
}

if (isCli()) {
  const repoRoot = process.cwd();
  const result = auditStoragePolicy({
    root: resolve(repoRoot, EARLY_ACCESS_STORAGE_ROOT),
    repoRoot,
  });
  if (result.findings.length > 0) {
    for (const finding of result.findings) {
      console.error(`${finding.code}: ${finding.file}:${finding.line} ${finding.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Browser storage policy accepted: ${result.scannedFiles.length} Early Access source files scanned, ` +
        `${result.storageWrites} storage writes and ${result.historyWrites} history writes proven against the reviewed policy.`,
    );
  }
}
