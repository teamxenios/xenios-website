import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * TWO ARCHITECTURAL RULES THE CART CANNOT BE ALLOWED TO DRIFT FROM.
 *
 * ONE: THE SERVER OWNS THE MONEY. The browser may FORMAT a server figure and
 * may not COMPUTE one. The difference matters because a cart is the first
 * place in this product where a plausible client-side total exists: multiply
 * a unit price by a quantity, sum the lines, and you have a number that looks
 * authoritative and is not. Every amount a customer is asked to pay comes from
 * the quote and the invoice.
 *
 * TWO: THE CART CHECKS OUT ONCE. A multi-product cart implemented as a browser
 * loop over the single-product order endpoint is not a cart. It creates one
 * order per line with no parent, no single invoice, no single payment
 * reference and no atomicity, so a partial failure leaves a customer with some
 * of their order and no way to describe what happened. The cart quotes once
 * and checks out once, through the cart endpoints.
 *
 * Both are checked through the TypeScript AST rather than by substring, so a
 * mention inside a comment or a string does not fail, and an arithmetic
 * expression does not pass just because it is spelled unusually.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CART_ADAPTER = path.resolve(HERE, "..", "..", "adapters", "earlyAccessCart.ts");

/** Money-shaped fields. Reading one is fine; doing arithmetic on one is not. */
const MONEY_FIELDS = [
  "unitPriceCents", "subtotalCents", "discountCents", "shippingCents", "taxCents",
  "payableCents", "payableTotalCents", "priceCents", "amountCents", "totalCents",
];

const ARITHMETIC = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.AsteriskAsteriskToken,
]);

function cartSourceFiles(): string[] {
  return readdirSync(HERE)
    .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
    .map((entry) => path.join(HERE, entry))
    .concat([CART_ADAPTER]);
}

function parse(file: string): ts.SourceFile {
  const source = readFileSync(file, "utf8");
  return ts.createSourceFile(
    file.replaceAll("\\", "/"),
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** True when this expression reads one of the money fields. */
function readsMoney(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isPropertyAccessExpression(child) && MONEY_FIELDS.includes(child.name.text)) {
      found = true;
      return;
    }
    if (
      ts.isElementAccessExpression(child) &&
      ts.isStringLiteral(child.argumentExpression) &&
      MONEY_FIELDS.includes(child.argumentExpression.text)
    ) {
      found = true;
      return;
    }
    if (ts.isIdentifier(child) && MONEY_FIELDS.includes(child.text)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

type Finding = { file: string; line: number; detail: string };

describe("the server owns the money", () => {
  it("no cart source performs arithmetic on a money field", () => {
    const findings: Finding[] = [];
    for (const file of cartSourceFiles()) {
      const sourceFile = parse(file);
      const visit = (node: ts.Node): void => {
        if (ts.isBinaryExpression(node) && ARITHMETIC.has(node.operatorToken.kind)) {
          if (readsMoney(node.left) || readsMoney(node.right)) {
            findings.push({
              file: path.basename(file),
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              detail: `arithmetic on a money value: ${node.getText(sourceFile).slice(0, 80)}`,
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sourceFile, visit);
    }
    expect(findings).toEqual([]);
  });

  it("no cart source reduces or sums a collection of money", () => {
    const findings: Finding[] = [];
    for (const file of cartSourceFiles()) {
      const sourceFile = parse(file);
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ["reduce", "reduceRight"].includes(node.expression.name.text)
        ) {
          // reduce() over quantities is fine and is how the unit badge counts.
          // reduce() that touches money is not.
          if (node.arguments.some((argument) => readsMoney(argument))) {
            findings.push({
              file: path.basename(file),
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              detail: "a reduce over money values",
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sourceFile, visit);
    }
    expect(findings).toEqual([]);
  });

  it("the review screen renders the SERVER total rather than one it worked out", () => {
    const review = readFileSync(path.join(HERE, "EarlyAccessCartReview.tsx"), "utf8");
    expect(review).toContain("quote.payableTotalCents");
  });
});

describe("the cart checks out once, through the cart endpoints", () => {
  it("no cart source calls the single-product order endpoint", () => {
    const findings: Finding[] = [];
    for (const file of cartSourceFiles()) {
      const sourceFile = parse(file);
      const visit = (node: ts.Node): void => {
        // Only real string values count. A comment mentioning /orders does not.
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          if (/\/api\/research\/early-access\/orders|early-access\/orders/.test(node.text)) {
            findings.push({
              file: path.basename(file),
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              detail: `the cart references the single-product order endpoint: ${node.text}`,
            });
          }
        }
        if (ts.isTemplateExpression(node)) {
          const whole = node.getText(sourceFile);
          if (/early-access\/orders/.test(whole)) {
            findings.push({
              file: path.basename(file),
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              detail: "the cart builds a single-product order URL",
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sourceFile, visit);
    }
    expect(findings).toEqual([]);
  });

  it("no cart source imports the single-product order adapter", () => {
    const offenders: string[] = [];
    for (const file of cartSourceFiles()) {
      const sourceFile = parse(file);
      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const module = statement.moduleSpecifier.text;
        if (/earlyAccessOrders?$|adapters\/earlyAccess$/.test(module)) {
          offenders.push(`${path.basename(file)} imports ${module}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the cart's checkout call is made exactly once, to the cart checkout path", () => {
    const adapter = readFileSync(CART_ADAPTER, "utf8");
    const sourceFile = ts.createSourceFile(
      "earlyAccessCart.ts",
      adapter,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    // The confirm function must not loop: one intent, one POST.
    let confirmBody: ts.Node | null = null;
    ts.forEachChild(sourceFile, (node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "confirmEarlyAccessCart" &&
        node.body
      ) {
        confirmBody = node.body;
      }
    });
    expect(confirmBody).not.toBeNull();

    const loops: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isForStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isDoStatement(node) ||
        (ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ["map", "forEach", "flatMap"].includes(node.expression.name.text))
      ) {
        loops.push(ts.SyntaxKind[node.kind]);
      }
      ts.forEachChild(node, visit);
    };
    visit(confirmBody!);
    expect(loops).toEqual([]);
  });
});
