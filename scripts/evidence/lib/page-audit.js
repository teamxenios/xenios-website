// Browser-side accessibility / presentation audit. Evaluated inside the page via
// CDP Runtime.evaluate; must stay plain ES2020 with no imports. Returns JSON.
//
// The function is exported as a string so Node can inject it; the same source
// is unit-tested under jsdom for the pure geometry/ID/landmark logic.
export const PAGE_AUDIT_SOURCE = String.raw`(() => {
  const MIN = 44;
  const de = document.documentElement;
  const body = document.body;
  const vw = de.clientWidth;
  const vh = de.clientHeight;

  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const isInert = (el) => {
    for (let n = el; n; n = n.parentElement) {
      if (n.hasAttribute("inert")) return true;
      if (n.getAttribute("aria-hidden") === "true") return true;
    }
    return false;
  };
  const text = (el) =>
    (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.getAttribute("alt") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  const describe = (el) => {
    const parts = [];
    let n = el;
    let depth = 0;
    while (n && n.nodeType === 1 && depth < 6) {
      let part = n.tagName.toLowerCase();
      if (n.id) { part += "#" + n.id; parts.unshift(part); break; }
      const cls = (n.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) part += "." + cls.join(".");
      const parent = n.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === n.tagName);
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(n) + 1) + ")";
      }
      parts.unshift(part);
      n = parent;
      depth++;
    }
    return parts.join(" > ");
  };

  // ---- Horizontal overflow / clipping -------------------------------------
  const docScrollWidth = Math.max(de.scrollWidth, body ? body.scrollWidth : 0);
  const overflowOffenders = [];
  const clipped = [];
  const all = Array.from(document.querySelectorAll("body *"));
  for (const el of all) {
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.width <= docScrollWidth + 1 && overflowOffenders.length < 25) {
      overflowOffenders.push({ selector: describe(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), text: text(el) });
    }
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    // Visually-hidden (sr-only) boxes are 1x1 clips by design; skip them.
    const srOnly = el.clientWidth <= 1 && el.clientHeight <= 1;
    if (!srOnly && (ox === "hidden" || ox === "clip") && el.scrollWidth > el.clientWidth + 2 && el.textContent.trim() && clipped.length < 25) {
      // Text that is cut off inside a hidden-overflow box with no ellipsis.
      // Only count it when a text-carrying, non-decorative descendant actually
      // extends past the box; decorative aria-hidden art bleeding out is fine.
      if (cs.textOverflow !== "ellipsis") {
        const edge = r.right + 1;
        const culprit = Array.from(el.querySelectorAll("*")).find((d) => {
          if (isInert(d) || !isVisible(d)) return false;
          if (!Array.from(d.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
          return d.getBoundingClientRect().right > edge;
        });
        if (culprit) {
          clipped.push({ selector: describe(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, text: text(culprit), culprit: describe(culprit) });
        }
      }
    }
  }

  // ---- Interactive target geometry ---------------------------------------
  const interactiveSelector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"])';
  const targets = [];
  const undersized = [];
  for (const el of document.querySelectorAll(interactiveSelector)) {
    if (!isVisible(el) || isInert(el)) continue;
    if (el.matches("input[type=radio], input[type=checkbox]") && el.labels && el.labels.length) {
      // Labelled checkboxes/radios: the label is the target; size the union.
    }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // WCAG 2.5.8 exempts inline links in a block of text.
    const parentText = el.parentElement ? (el.parentElement.textContent || "").trim() : "";
    const inlineText = cs.display === "inline" && el.parentElement && parentText.length > (el.textContent || "").trim().length + 20;
    const rec = {
      selector: describe(el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || null,
      text: text(el),
      width: Math.round(r.width * 10) / 10,
      height: Math.round(r.height * 10) / 10,
      inlineText: Boolean(inlineText),
      offscreen: r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw,
    };
    targets.push(rec);
    if ((r.width < MIN || r.height < MIN) && !inlineText) undersized.push(rec);
  }

  // ---- Landmarks / headings / ids ----------------------------------------
  const mains = Array.from(document.querySelectorAll('main, [role="main"]'));
  const visibleMains = mains.filter((m) => !isInert(m) && getComputedStyle(m).display !== "none");
  const nestedMains = visibleMains.filter((m) => m.parentElement && m.parentElement.closest('main, [role="main"]'));
  const idCounts = {};
  for (const el of document.querySelectorAll("[id]")) {
    const id = el.id;
    if (!id) continue;
    idCounts[id] = (idCounts[id] || 0) + 1;
  }
  const duplicateIds = Object.entries(idCounts).filter(([, c]) => c > 1).map(([id, count]) => ({ id, count }));
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]"))
    .filter((h) => isVisible(h) && !isInert(h))
    .map((h) => ({ level: Number(h.getAttribute("aria-level")) || Number(h.tagName.slice(1)) || 2, text: text(h) }));
  const landmarks = {};
  for (const el of document.querySelectorAll("header, nav, main, footer, aside, form, section[aria-label], section[aria-labelledby], [role=banner], [role=navigation], [role=contentinfo], [role=complementary], [role=search], [role=region]")) {
    if (isInert(el)) continue;
    const role = el.getAttribute("role") || el.tagName.toLowerCase();
    landmarks[role] = (landmarks[role] || 0) + 1;
  }

  // ---- Forms / images / live regions / dialogs ----------------------------
  const unlabelled = [];
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea")) {
    if (!isVisible(el) || isInert(el)) continue;
    const labelled = (el.labels && el.labels.length > 0) || el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") || el.getAttribute("title");
    if (!labelled && unlabelled.length < 25) unlabelled.push({ selector: describe(el), type: el.getAttribute("type") || el.tagName.toLowerCase(), name: el.getAttribute("name") || null });
  }
  const imagesMissingAlt = [];
  for (const img of document.querySelectorAll("img")) {
    if (!isVisible(img) || isInert(img)) continue;
    if (!img.hasAttribute("alt") && img.getAttribute("role") !== "presentation" && imagesMissingAlt.length < 25) {
      imagesMissingAlt.push({ selector: describe(img), src: (img.getAttribute("src") || "").slice(0, 120) });
    }
  }
  const liveRegions = Array.from(document.querySelectorAll("[aria-live], [role=status], [role=alert], output")).length;
  const dialogs = Array.from(document.querySelectorAll("dialog, [role=dialog], [role=alertdialog]")).filter(isVisible).map((d) => ({
    selector: describe(d),
    ariaModal: d.getAttribute("aria-modal"),
    labelled: d.hasAttribute("aria-label") || d.hasAttribute("aria-labelledby"),
  }));
  const invalidAriaRefs = [];
  for (const el of document.querySelectorAll("[aria-labelledby], [aria-describedby], [aria-controls], [aria-errormessage]")) {
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-errormessage"]) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      for (const id of v.split(/\s+/)) {
        if (id && !document.getElementById(id) && invalidAriaRefs.length < 25) invalidAriaRefs.push({ selector: describe(el), attr, id });
      }
    }
  }
  const skipLink = Array.from(document.querySelectorAll('a[href^="#"]')).find((a) => /skip/i.test(a.textContent || a.getAttribute("aria-label") || ""));

  return {
    url: location.href,
    title: document.title,
    lang: de.getAttribute("lang") || null,
    viewport: { width: vw, height: vh, devicePixelRatio: window.devicePixelRatio },
    overflow: {
      documentScrollWidth: docScrollWidth,
      clientWidth: vw,
      horizontalOverflow: docScrollWidth > vw + 1,
      offenders: overflowOffenders,
      clippedText: clipped,
    },
    targets: { total: targets.length, undersized, undersizedCount: undersized.length, minimum: MIN },
    landmarks: {
      mainCount: visibleMains.length,
      nestedMainCount: nestedMains.length,
      mainSelectors: visibleMains.map(describe),
      counts: landmarks,
      skipLink: skipLink ? { text: text(skipLink), href: skipLink.getAttribute("href"), targetExists: Boolean(document.querySelector(skipLink.getAttribute("href"))) } : null,
    },
    headings: { h1Count: headings.filter((h) => h.level === 1).length, outline: headings.slice(0, 60) },
    duplicateIds,
    forms: { unlabelledControls: unlabelled },
    images: { missingAlt: imagesMissingAlt },
    liveRegions,
    dialogs,
    invalidAriaRefs,
    reducedMotionApplied: typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : false,
    forcedColorsActive: typeof matchMedia === "function" ? matchMedia("(forced-colors: active)").matches : false,
    bodyTextSample: (body ? (body.innerText || body.textContent || "") : "").replace(/\s+/g, " ").slice(0, 400),
  };
})()`;

/** Describe the currently focused element (evaluated after each Tab press). */
export const FOCUS_PROBE_SOURCE = String.raw`(() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { body: true };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const describe = (n) => {
    let s = n.tagName.toLowerCase();
    if (n.id) s += "#" + n.id;
    const cls = (n.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += "." + cls.join(".");
    return s;
  };
  const outlineVisible = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
  const boxShadow = Boolean(cs.boxShadow) && cs.boxShadow !== "none";
  // Compare against the element's unfocused styling to detect an indicator.
  const focusVisible = el.matches(":focus-visible");
  return {
    body: false,
    selector: describe(el),
    tag: el.tagName.toLowerCase(),
    text: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50),
    focusVisible,
    outlineVisible,
    boxShadow,
    indicator: Boolean(outlineVisible || boxShadow),
    inViewport: r.bottom > 0 && r.top < innerHeight,
    width: Math.round(r.width),
    height: Math.round(r.height),
    tabIndex: el.tabIndex,
  };
})()`;
