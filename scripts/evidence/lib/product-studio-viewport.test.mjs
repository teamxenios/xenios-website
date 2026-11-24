import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertStudioViewportFit } from './product-studio-viewport.mjs';

const rect = (left, right, top = 0, height = 24) =>
  ({ left, right, top, bottom: top + height, width: right - left, height });
const sample = () => ({
  viewport: { left: 0, right: 375, width: 375, visualViewportAvailable: true,
    layoutClientWidth: 375, documentWidth: 582 },
  panel: rect(0, 375, -100, 1100), selector: rect(24, 351), status: rect(24, 351),
  article: rect(24, 351, 600, 450), retry: null,
  textRects: [rect(24, 327), rect(24, 240, 950)], textNodes: 2, limitExceeded: false,
});
const available = { viewportWidth: 375, articleExpected: true, retryExpected: false };

test('valid preview fits actual viewport even with an unrelated wider document and vertical scroll', () => {
  assert.equal(assertStudioViewportFit(sample(), available), true);
});
test('actual old 560 panel and 582 document on 375 fail despite the old contained predicate', () => {
  const s = sample(); s.panel = rect(0, 560);
  const old = { scrollWidth: 560, clientWidth: 560 };
  assert(old.scrollWidth <= old.clientWidth + 1);
  assert.throws(() => assertStudioViewportFit(s, available), /PREVIEW_PANEL_OUTSIDE_VISUAL_VIEWPORT/);
});
test('a fitting panel cannot hide an overwide native selector', () => {
  const s = sample(); s.selector = rect(24, 557);
  assert.throws(() => assertStudioViewportFit(s, available), /VARIANT_SELECTOR_OUTSIDE_VISUAL_VIEWPORT/);
});
test('wrapped visible text must fit even when its enclosing elements fit', () => {
  const s = sample(); s.textRects.push(rect(24, 580));
  assert.throws(() => assertStudioViewportFit(s, available), /PREVIEW_TEXT_OUTSIDE_VISUAL_VIEWPORT/);
});
test('retry state requires a visible horizontally fitting actual button', () => {
  const s = sample(); s.article = null; s.retry = rect(24, 160);
  const options = { viewportWidth: 375, articleExpected: false, retryExpected: true };
  assert.equal(assertStudioViewportFit(s, options), true);
  s.retry = rect(310, 440);
  assert.throws(() => assertStudioViewportFit(s, options), /RETRY_BUTTON_OUTSIDE_VISUAL_VIEWPORT/);
});
test('unavailable state cannot claim retry fit without the actual button', () => {
  const s = sample(); s.article = null;
  assert.throws(() => assertStudioViewportFit(s,
    { viewportWidth: 375, articleExpected: false, retryExpected: true }), /RETRY_PRESENCE/);
});
test('mobile emulation cannot silently qualify a wider actual visual viewport', () => {
  const s = sample(); s.viewport = { ...s.viewport, right: 582, width: 582 };
  assert.throws(() => assertStudioViewportFit(s, available), /VISUAL_VIEWPORT_WIDTH_MISMATCH/);
});
test('left clipping is rejected and actual visual viewport offset is respected', () => {
  const s = sample(); s.panel = rect(-10, 365);
  assert.throws(() => assertStudioViewportFit(s, available), /PREVIEW_PANEL_OUTSIDE_VISUAL_VIEWPORT/);
  const shifted = sample();
  shifted.viewport = { ...shifted.viewport, left: 15, right: 390 };
  for (const key of ['panel', 'selector', 'status', 'article'])
    shifted[key] = { ...shifted[key], left: shifted[key].left + 15, right: shifted[key].right + 15 };
  shifted.textRects = shifted.textRects.map(r => ({ ...r, left: r.left + 15, right: r.right + 15 }));
  assert.equal(assertStudioViewportFit(shifted, available), true);
});
test('missing, nonfinite, hidden, truncated and empty measurements fail closed', () => {
  assert.throws(() => assertStudioViewportFit(null, available), /MEASUREMENT_MISSING/);
  const bad = sample(); bad.selector.left = NaN;
  assert.throws(() => assertStudioViewportFit(bad, available), /RECT_INVALID/);
  const hidden = sample(); hidden.selector.height = 0;
  assert.throws(() => assertStudioViewportFit(hidden, available), /RECT_INVALID/);
  const truncated = sample(); truncated.limitExceeded = true;
  assert.throws(() => assertStudioViewportFit(truncated, available), /MEASUREMENT_INCOMPLETE/);
  const empty = sample(); empty.textRects = [];
  assert.throws(() => assertStudioViewportFit(empty, available), /TEXT_RECTS_MISSING/);
});
test('ready and unavailable article presence stays tied to the functional state', () => {
  const s = sample(); s.article = null;
  assert.throws(() => assertStudioViewportFit(s, available), /ARTICLE_PRESENCE/);
});
test('all three endpoints remain measured against the viewport instead of documentWidth', () => {
  for (const key of ['status', 'article']) {
    const s = sample(); s[key] = rect(24, 582);
    assert.throws(() => assertStudioViewportFit(s, available), /OUTSIDE_VISUAL_VIEWPORT/);
  }
});
test('current driver invokes real DOM measurement and comparator before capture with failed evidence retained', () => {
  const source = readFileSync(new URL('../product-studio-browser.mjs', import.meta.url), 'utf8');
  const measurement = source.indexOf('const viewportFit = await page.evaluate');
  const evidence = source.indexOf('result.viewportMeasurements.push', measurement);
  const assertion = source.indexOf('assertStudioViewportFit(viewportFit', evidence);
  const screenshot = source.indexOf('const image = await page.screenshot', assertion);
  assert(measurement > 0 && measurement < evidence && evidence < assertion && assertion < screenshot);
  assert(source.includes('measureStudioViewport.toString()'));
  assert(source.includes('viewportWidth: width, ...sample, viewportFit'));
  assert(source.includes('assert(sample.contained,'));
  assert(source.includes('assertWholeRun(page, final?.counts)'));
});

