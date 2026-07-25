import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs", "qa", "evidence");
const baseURL = process.env.QA_BASE_URL;

if (!baseURL) {
  console.error("Set QA_BASE_URL to the reviewed local or deployed build before capturing UI evidence.");
  process.exit(1);
}

fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const scenarios = [
  { name: "desktop-populated-home", path: "/", viewport: { width: 1440, height: 1000 } },
  { name: "mobile-375-home", path: "/", viewport: { width: 375, height: 812 } },
  { name: "empty-concepts", path: "/concepts", viewport: { width: 1440, height: 1000 } },
  { name: "form-waitlist", path: "/waitlist", viewport: { width: 375, height: 812 } },
  { name: "unavailable-member-sign-in", path: "/research/member", viewport: { width: 1440, height: 1000 } },
];

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    const page = await context.newPage();
    await page.goto(new URL(scenario.path, baseURL).toString(), { waitUntil: "networkidle" });
    await page.addStyleTag({
      content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}.reveal{opacity:1!important;transform:none!important}",
    });
    await page.screenshot({
      path: path.join(output, `${scenario.name}.jpg`),
      fullPage: true,
      type: "jpeg",
      quality: 72,
    });
    await context.close();
    console.log(`Captured ${scenario.name}`);
  }
} finally {
  await browser.close();
}
