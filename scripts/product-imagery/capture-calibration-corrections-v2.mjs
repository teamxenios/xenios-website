import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchChromium } from "../evidence/lib/chrome.mjs";
import { CdpConnection, PageSession } from "../evidence/lib/cdp.mjs";
import { startFounderPreviewServer } from "./serve-founder-preview.mjs";
import { ROOT, DIRECTORY } from "./build-calibration-corrections-v2.mjs";
import { hashBytes } from "./framing-receipt.mjs";

const widths = [1440, 768, 390, 320];
const server = await startFounderPreviewServer();
let browser, connection;
const captures = [];
try {
  browser = await launchChromium();
  connection = await new CdpConnection(browser.wsUrl).open();
  for (const width of widths) {
    const page = await PageSession.create(connection);
    try {
      await page.enforceNetworkBoundary(server.origin);
      await page.setViewport({ width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      await page.navigate(`${server.origin}/evidence/calibration-corrections-v2/review.html`, { maxSettleMs: 12000 });
      await page.evaluate("Promise.all(Array.from(document.images, image => image.decode()))");
      const state = await page.evaluate(`(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth, studies: document.querySelectorAll('[data-study]').length,
        images: Array.from(document.images, i => ({ src: new URL(i.currentSrc).pathname, naturalWidth:i.naturalWidth,
          naturalHeight:i.naturalHeight, loaded:i.complete && i.naturalWidth>0, objectFit:getComputedStyle(i).objectFit,
          filter:getComputedStyle(i).filter, blend:getComputedStyle(i).mixBlendMode })) }))()`);
      assert.equal(state.width, width); assert.ok(state.scrollWidth <= state.clientWidth + 1);
      assert.equal(state.studies, 3); assert.equal(state.images.length, 6);
      for (const i of state.images) {
        assert.equal(i.loaded, true); assert.equal(i.objectFit, "contain"); assert.equal(i.filter, "none");
        assert.equal(i.blend, "normal"); assert.equal(i.naturalWidth, i.naturalHeight);
        const body = Buffer.from(await (await fetch(`${server.origin}${i.src}`)).arrayBuffer());
        const sourcePath = `docs/product-imagery${i.src}`;
        assert.equal(hashBytes(body), hashBytes(readFileSync(resolve(ROOT, sourcePath))));
        i.sha256 = hashBytes(body);
      }
      assert.deepEqual(page.console.filter(e => e.level === "error" || e.level === "assert"), []);
      assert.deepEqual(page.networkBoundaryViolations, []);
      const shot = await page.screenshot({ fullPage: true, maxHeight: 12000 });
      const path = `${DIRECTORY}/review-${width}.png`;
      writeFileSync(resolve(ROOT, path), shot.bytes);
      captures.push({ width, path, sha256: hashBytes(shot.bytes), coverage: shot.coverage, state,
        brokenImages: 0, overflow: false, sourcePixelsVerified: true, networkBoundaryViolations: [] });
      console.log(`PASS ${width}: 6 unchanged images, no overflow`);
    } finally { await page.close(); }
  }
  writeFileSync(resolve(ROOT, DIRECTORY, "browser-evidence.json"), `${JSON.stringify({ schemaVersion: 1,
    kind: "private_calibration_contact_sheet_browser_review", capturedAtUtc: new Date().toISOString(),
    browser: { name: browser.browserName, version: browser.browserVersion, revision: browser.revision },
    pageSha256: hashBytes(readFileSync(resolve(ROOT, DIRECTORY, "review.html"))),
    cssSha256: hashBytes(readFileSync(resolve(ROOT, DIRECTORY, "review.css"))),
    captures, independentAcceptance: false, founderPreviewChanged: false, publicRuntimeEligibility: false }, null, 2)}\n`);
} finally {
  if (connection) await connection.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await server.close();
}
