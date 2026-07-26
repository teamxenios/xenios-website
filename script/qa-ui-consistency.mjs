import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = process.env.QA_REPO_ROOT
  ? path.resolve(process.env.QA_REPO_ROOT)
  : scriptRoot;
const clientRoot = path.join(root, "client", "src");
const baselinePath = path.join(scriptRoot, "qa", "ui-consistency-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function occurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

const cssFiles = walk(clientRoot).filter((file) => file.endsWith(".css"));
const css = cssFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
const prohibitedUiPackages = [
  "@angular/material",
  "@chakra-ui/react",
  "@mui/material",
  "antd",
  "bootstrap",
  "bulma",
  "mantine",
  "semantic-ui-react",
];
const installedProhibitedPackages = prohibitedUiPackages.filter((name) => name in dependencies);
const externalFontImports = cssFiles.flatMap((file) => {
  const text = fs.readFileSync(file, "utf8");
  return /@import\s+url\([^)]*(?:fonts\.googleapis|use\.typekit)/i.test(text)
    ? [path.relative(root, file).replaceAll("\\", "/")]
    : [];
});

const metrics = {
  rawColorLiterals: occurrences(css, /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/gi),
  gradientDeclarations: occurrences(css, /(?:linear|radial|conic)-gradient\(/gi),
  shadowDeclarations: occurrences(css, /\bbox-shadow\s*:/gi),
  fontFamilyDeclarations: occurrences(css, /\bfont-family\s*:/gi),
  largeRadiusDeclarations: occurrences(css, /\bborder-radius\s*:\s*(?:2[4-9]|[3-9]\d|\d{3,})px/gi),
  customButtonSelectors: occurrences(css, /\.[a-z0-9_-]*(?:btn|button)[a-z0-9_-]*[\s,:.{]/gi),
};

let failed = false;
for (const [metric, value] of Object.entries(metrics)) {
  const maximum = baseline.maximums[metric];
  const status = value <= maximum ? "PASS" : "FAIL";
  console.log(`${status} ${metric}: ${value} / ${maximum}`);
  if (value > maximum) failed = true;
}

if (installedProhibitedPackages.length > 0) {
  failed = true;
  console.error(`FAIL prohibited UI packages: ${installedProhibitedPackages.join(", ")}`);
} else {
  console.log("PASS no prohibited duplicate UI framework dependencies");
}

if (externalFontImports.length > 0) {
  failed = true;
  console.error(`FAIL external font imports outside the established stack: ${externalFontImports.join(", ")}`);
} else {
  console.log("PASS no unauthorized external font imports");
}

if (failed) {
  console.error("UI consistency budget changed. Review the visual system with Website 2 before updating the baseline.");
  process.exitCode = 1;
}
