import assert from 'node:assert/strict';

// Serialized into the real page. Read-only; no DOM, style, scroll or network writes.
export function measureStudioViewport(panel) {
  if (!panel) return null;
  const rect = element => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  };
  const visual = window.visualViewport;
  const left = visual?.offsetLeft ?? 0;
  const width = visual?.width ?? document.documentElement.clientWidth;
  const textRects = [];
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  let node, textNodes = 0, limitExceeded = false;
  while ((node = walker.nextNode())) {
    if (++textNodes > 1024) { limitExceeded = true; break; }
    if (!node.textContent?.trim() || node.parentElement?.closest('select,option,script,style')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width <= 0 || r.height <= 0) continue;
      if (textRects.length === 256) { limitExceeded = true; break; }
      textRects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
    }
    range.detach();
    if (limitExceeded) break;
  }
  const retry = [...panel.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Retry preview');
  const ancestors = [];
  for (let element = panel.parentElement; element && ancestors.length < 8; element = element.parentElement) {
    const css = getComputedStyle(element);
    ancestors.push({ tag: element.tagName, classes: String(element.className).slice(0, 160),
      rect: rect(element), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      display: css.display, gridTemplateColumns: css.gridTemplateColumns.slice(0, 160),
      minWidth: css.minWidth, overflowX: css.overflowX });
  }
  return {
    viewport: { left, right: left + width, width, visualViewportAvailable: Boolean(visual),
      layoutClientWidth: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth },
    panel: rect(panel),
    selector: rect(panel.querySelector('#preview-exact-variant')),
    status: rect(panel.querySelector('[role="status"]')),
    article: rect(panel.querySelector('article')),
    retry: rect(retry),
    textRects, textNodes, limitExceeded, ancestors,
  };
}

export function assertStudioViewportFit(sample, { viewportWidth, articleExpected, retryExpected }) {
  const tolerance = 2;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  assert(sample && sample.viewport, 'VIEWPORT_MEASUREMENT_MISSING');
  const v = sample.viewport;
  assert([v.left, v.right, v.width].every(finite) && v.width > 0
    && Math.abs(v.right - v.left - v.width) < 0.01, 'VISUAL_VIEWPORT_INVALID');
  assert(finite(viewportWidth) && viewportWidth > 0
    && Math.abs(v.width - viewportWidth) <= tolerance, 'VISUAL_VIEWPORT_WIDTH_MISMATCH');
  assert(sample.limitExceeded === false, 'VIEWPORT_TEXT_MEASUREMENT_INCOMPLETE');
  const inside = (r, label) => {
    assert(r && [r.left, r.right, r.top, r.bottom, r.width, r.height].every(finite)
      && r.width > 0 && r.height > 0 && Math.abs(r.right - r.left - r.width) < 0.01, label + '_RECT_INVALID');
    assert(r.left >= v.left - tolerance && r.right <= v.right + tolerance, label + '_OUTSIDE_VISUAL_VIEWPORT');
  };
  inside(sample.panel, 'PREVIEW_PANEL');
  inside(sample.selector, 'VARIANT_SELECTOR');
  inside(sample.status, 'PREVIEW_STATUS');
  assert.equal(Boolean(sample.article), articleExpected, 'PREVIEW_ARTICLE_PRESENCE');
  if (articleExpected) inside(sample.article, 'PREVIEW_ARTICLE');
  assert.equal(Boolean(sample.retry), retryExpected, 'RETRY_PRESENCE');
  if (retryExpected) inside(sample.retry, 'RETRY_BUTTON');
  assert(Array.isArray(sample.textRects) && sample.textRects.length > 0 && sample.textRects.length <= 256,
    'VIEWPORT_TEXT_RECTS_MISSING');
  for (const r of sample.textRects) inside(r, 'PREVIEW_TEXT');
  // documentWidth is recorded, deliberately never used as the allowed right edge.
  // Vertical overflow is ordinary scrolling; this assertion tests horizontal fit.
  return true;
}

