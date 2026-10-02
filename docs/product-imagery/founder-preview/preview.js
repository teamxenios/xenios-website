(() => {
  "use strict";

  const data = window.XENIOS_FOUNDER_PREVIEW_DATA;
  const app = document.querySelector("#app");
  if (!data || !app) throw new Error("Founder preview data or root is missing");
  if (data.counts.customerTargets !== 423 || data.rows.length !== 423) {
    throw new Error("Founder preview refuses a catalog denominator other than 423");
  }

  const params = new URLSearchParams(window.location.search);
  const defaultView = document.body.dataset.defaultView || "home";
  const view = params.get("view") || defaultView;
  const rowsById = new Map(data.rows.map((row) => [row.canonicalId, row]));
  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const titleCase = (value) =>
    String(value ?? "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());

  const representatives = Object.fromEntries(
    Object.entries(data.representativeCanonicalIds).map(([key, id]) => [key, rowsById.get(id)]),
  );

  function statusBadge(row) {
    return `<span class="status-badge ${esc(row.pathway.key)}">${esc(row.pathway.label)}</span>`;
  }

  function mediaBlock(row, { ratio = "square", label = "Proposed square media", fallback = false } = {}) {
    if (fallback) {
      return `<div class="product-media ${esc(ratio)}" data-media-policy="safe-fallback"><div class="media-fallback"><div><strong>Approved image unavailable</strong><p class="fine-print">The product remains identifiable by text. No substitute image is borrowed.</p></div></div><span class="media-policy-label">Safe fallback · no borrowed asset</span></div>`;
    }
    return `<figure class="product-media ${esc(ratio)}" data-media-policy="${esc(ratio)}-contain" data-asset-sha256="${esc(row.image.outputSha256)}">
      <img data-safe-image src="${esc(row.image.src)}" width="${row.image.width}" height="${row.image.height}" alt="Private provisional ${esc(titleCase(row.image.assetImageClass))} study for ${esc(row.name)}" loading="lazy" />
      <span class="media-policy-label">${esc(label)} · contain · unchanged pixels</span>
    </figure>`;
  }

  function facts(row) {
    return `<dl class="fact-grid">
      <div class="fact"><dt>Category</dt><dd>${esc(row.category)}</dd></div>
      <div class="fact"><dt>Price state</dt><dd>${esc(row.pathway.price)}</dd></div>
    </dl>`;
  }

  function currentPolicyCard(row, { compact = false } = {}) {
    return `<article class="product-card current-policy-card" data-canonical-id="${esc(row.canonicalId)}" data-policy="current-core-no-image">
      <div class="policy-kicker">Current Core · text-only public / Early Access policy</div>
      <div class="product-card-body">
        <div class="card-meta"><span class="mono-label text-muted">${esc(titleCase(row.family))}</span>${statusBadge(row)}</div>
        <h3>${esc(row.name)}</h3>
        <p class="specification mono-label">${esc(row.specification)}</p>
        <p class="summary body-s">${esc(row.pathway.explanation)}</p>
        ${compact ? "" : facts(row)}
        <a class="card-cta primary" href="product-detail.html?id=${encodeURIComponent(row.canonicalId)}">${esc(row.pathway.cta)}</a>
      </div>
    </article>`;
  }

  function proposedProductCard(row, { compact = false, fallback = false } = {}) {
    return `<article class="product-card" data-canonical-id="${esc(row.canonicalId)}" data-asset-job="${esc(row.image.jobId)}" data-policy="proposed-square-image">
      <div class="policy-kicker">Proposed Xenios Health · private decision study</div>
      ${mediaBlock(row, { fallback })}
      <div class="product-card-body">
        <div class="card-meta"><span class="mono-label text-muted">${esc(titleCase(row.family))}</span>${statusBadge(row)}</div>
        <h3>${esc(row.name)}</h3>
        <p class="specification mono-label">${esc(row.specification)}</p>
        <p class="summary body-s">${esc(row.pathway.explanation)}</p>
        ${compact ? "" : facts(row)}
        <a class="card-cta primary" href="product-detail.html?id=${encodeURIComponent(row.canonicalId)}">${esc(row.pathway.cta)}</a>
      </div>
    </article>`;
  }

  function boundaryNote() {
    return `<aside class="boundary-note"><h3>Authority boundary</h3><p>These 423 private slots remain joined to the frozen catalog candidate at ${esc(data.sources.coreCatalog.commit.slice(0, 12))}. Core UI reference c0e25c73 is separate UI evidence. Neither source is image approval, publication authority, Product Control authority, price release, runtime integration, deployment authority, or production approval.</p></aside>`;
  }

  function renderHome() {
    const featured = data.featuredCanonicalIds.map((id) => rowsById.get(id)).filter(Boolean);
    return `<div class="page-shell">
      <section class="hero">
        <div class="container-x hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">Private Core-converged prototype</p>
            <h1>Clear pathways for research and care.</h1>
            <p class="lead">This corrected preview uses the dominant current Xenios public shell, typography, spacing, buttons, cards, and breakpoints. Product media remains an explicitly proposed future policy.</p>
            <div class="hero-actions"><a class="btn btn-primary" href="index.html?view=products">Explore products</a><a class="btn btn-secondary" href="index.html?view=decisions">Compare founder decisions</a></div>
          </div>
          <aside class="hero-aside"><div class="accent-rule" aria-hidden="true"></div><p class="mono-label">What changed</p><h2>Core UI first. Imagery proposal second.</h2><p class="body-s text-muted">No black gradient hero, orb artwork, pill-button language, hidden crop, vignette, saturation, tint, or invented public product route.</p></aside>
        </div>
      </section>
      <section class="truth-strip" aria-label="Catalog accounting">
        <div class="truth-stat"><strong>426</strong><span>reviewed source rows</span></div>
        <div class="truth-stat"><strong>424</strong><span>canonical variants</span></div>
        <div class="truth-stat"><strong>423</strong><span>private visual slots</span></div>
        <div class="truth-stat"><strong>0</strong><span>public image approvals</span></div>
      </section>
      <section class="section">
        <div class="container-x">
          <div class="section-heading"><div><p class="eyebrow">Proposed placement</p><h2>Featured products in the real UI language.</h2><p>The product card anatomy follows current Core controls and spacing. The square media slot is intentionally labeled as a proposal, not production truth.</p></div><a class="btn btn-ghost" href="index.html?view=cards">Compare no-image policy</a></div>
          <div class="product-grid">${featured.slice(0, 8).map((row) => proposedProductCard(row, { compact: true })).join("")}</div>
        </div>
      </section>
      <section class="section dark" id="how-it-works">
        <div class="container-x"><div class="section-heading"><div><p class="eyebrow">One catalog, governed pathways</p><h2>Identity is not commerce authority.</h2><p>Imagery explains an identity or state without creating a price, availability, request, order, or fulfillment right.</p></div></div><div class="pathway-grid">
          <article class="pathway-card"><span class="number">01</span><h3>Research</h3><p>Educational catalog context remains separate from medical advice and personal recommendation.</p></article>
          <article class="pathway-card"><span class="number">02</span><h3>Care</h3><p>Provider review, state availability, and pharmacy requirements remain explicit.</p></article>
          <article class="pathway-card"><span class="number">03</span><h3>Held and quote-only</h3><p>Restricted identities remain visible without a purchase affordance or invented price.</p></article>
        </div></div>
      </section>
      <section class="section soft" id="quality"><div class="container-x"><div class="section-heading"><div><p class="eyebrow">Frozen calibration</p><h2>Six studies preserved exactly.</h2><p>The same six private calibration assets are used only to test placement. No new image was rendered and Batch 1 remains blocked.</p></div></div><figure class="contact-sheet"><a href="calibration.html"><img data-safe-image src="${esc(data.calibration.contactSheet.src)}" alt="Six-study private global art-direction calibration contact sheet" /></a><figcaption>6 rendered · 0 approved · 0 public · 0 Batch 1 render authorizations</figcaption></figure></div></section>
      <section class="section" id="partners"><div class="container-x">${boundaryNote()}</div></section>
      <span id="about" hidden></span><span id="careers" hidden></span>
    </div>`;
  }

  function renderProducts() {
    const categories = [...new Set(data.rows.map((row) => row.category))].sort();
    const requestedLimit = Number(params.get("limit") || 12);
    const pageSize = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 24)
      : 12;
    const firstPage = data.rows.slice(0, pageSize);
    return `<div class="page-shell">
      <section class="page-hero"><div class="container-x"><p class="eyebrow">Products · proposed media placement</p><h1>Browse exact identities and governed states.</h1><p class="lead">The current public policy is text-only. This private surface shows the proposed square-image alternative without changing Core or creating a transaction path.</p></div></section>
      <section class="container-x catalog-results">
        <div class="catalog-tools" id="catalog-controls" role="search">
          <div class="field"><label for="catalog-search">Search products</label><input id="catalog-search" type="search" placeholder="Name, specification, or ID" autocomplete="off" /></div>
          <div class="field"><label for="catalog-category">Category</label><select id="catalog-category"><option value="">All categories</option>${categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}</select></div>
          <div class="field"><label for="catalog-pathway">Pathway</label><select id="catalog-pathway"><option value="">All pathways</option><option value="research">Research</option><option value="care">Care</option><option value="held">Held</option><option value="quote">Quote only</option><option value="pending">Binding pending</option></select></div>
          <output class="result-count" id="catalog-count">423 products · showing ${pageSize}</output>
        </div>
        <div class="decision-note"><p><strong>Proposal, not approval:</strong> every card below uses a 1:1 contain slot with unchanged source pixels. Current Core public cards remain no-image until Samuel decides otherwise.</p></div>
        <div class="product-grid" id="catalog-grid" style="margin-top: 24px">${firstPage.map((row) => proposedProductCard(row)).join("")}</div>
      </section>
    </div>`;
  }

  function activateCatalogFilters() {
    const search = document.querySelector("#catalog-search");
    const category = document.querySelector("#catalog-category");
    const pathway = document.querySelector("#catalog-pathway");
    const grid = document.querySelector("#catalog-grid");
    const count = document.querySelector("#catalog-count");
    if (!search || !category || !pathway || !grid || !count) return;
    const update = () => {
      const needle = search.value.trim().toLowerCase();
      const filtered = data.rows.filter(
        (row) =>
          (!needle || `${row.name} ${row.specification} ${row.canonicalId}`.toLowerCase().includes(needle)) &&
          (!category.value || row.category === category.value) &&
          (!pathway.value || row.pathway.key === pathway.value),
      );
      const hasFilter = Boolean(needle || category.value || pathway.value);
      const visible = hasFilter ? filtered : filtered.slice(0, pageSize);
      count.textContent = hasFilter
        ? `${filtered.length} ${filtered.length === 1 ? "product" : "products"}`
        : `${filtered.length} products · showing ${visible.length}`;
      grid.innerHTML = visible.length
        ? visible.map((row) => proposedProductCard(row)).join("")
        : `<div class="empty-state"><h3>No exact matches</h3><p>Try a broader name, specification, category, or pathway.</p></div>`;
      installImageFallbacks();
    };
    search.addEventListener("input", update);
    category.addEventListener("change", update);
    pathway.addEventListener("change", update);
  }

  function renderFeatured() {
    const featured = data.featuredCanonicalIds.map((id) => rowsById.get(id)).filter(Boolean);
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Featured · private proposal</p><h1>Current hierarchy, proposed imagery.</h1><p class="lead">The eight high-visibility identities use the current Core card rhythm and one canonical private asset reference across card and detail.</p></div></section><section class="section"><div class="container-x"><div class="product-grid">${featured.map((row) => proposedProductCard(row)).join("")}</div></div></section><section class="section soft"><div class="container-x">${boundaryNote()}</div></section></div>`;
  }

  function selectedDetailRow() {
    const requested = params.get("id");
    if (requested && rowsById.has(requested)) return rowsById.get(requested);
    const sample = params.get("sample");
    if (sample && data.representativeCanonicalIds[sample]) return rowsById.get(data.representativeCanonicalIds[sample]);
    return representatives.research || data.rows[0];
  }

  function detailSurface(row, { ratio = "square", current = false, fallback = false } = {}) {
    const media = fallback
      ? `<div class="detail-media ${esc(ratio)}">${mediaBlock(row, { ratio, fallback: true })}</div>`
      : `<figure class="detail-media ${esc(ratio)}" data-asset-sha256="${esc(row.image.outputSha256)}"><img data-safe-image src="${esc(row.image.src)}" width="${row.image.width}" height="${row.image.height}" alt="Private provisional ${esc(titleCase(row.image.assetImageClass))} study for ${esc(row.name)}" /><span class="media-policy-label">${current ? "Current member slot · 4:3 contain" : "Proposed slot · 1:1 contain · same pixels"}</span></figure>`;
    return `<div class="detail-layout" data-detail-canonical-id="${esc(row.canonicalId)}" data-detail-asset-job="${esc(row.image.jobId)}" data-detail-policy="${current ? "current-member-4x3" : "proposed-square"}">
      ${media}
      <section class="detail-copy">
        <div class="badge-row"><span class="mono-label text-muted">${esc(row.canonicalId)}</span>${statusBadge(row)}</div>
        <h1>${esc(row.name)}</h1><p class="detail-spec">${esc(row.specification)}</p>
        <div class="detail-facts"><div class="detail-fact"><span>Form</span><strong>${esc(row.dosageForm)}</strong></div><div class="detail-fact"><span>Price state</span><strong>${esc(row.pathway.price)}</strong></div><div class="detail-fact"><span>Pathway</span><strong>${esc(row.pathway.label)}</strong></div><div class="detail-fact"><span>Image status</span><strong>Private, provisional, not publication-approved</strong></div></div>
        <div class="detail-action"><strong>${esc(row.pathway.cta)}</strong><p>${esc(row.pathway.explanation)} This static preview cannot submit, reserve, prescribe, quote, or order.</p><span class="btn btn-primary" aria-disabled="true">Prototype action only</span></div>
        <ul class="disclosure-list"><li>Catalog visibility does not establish availability, suitability, or purchase eligibility.</li><li>Card and detail use the exact same source asset SHA-256: ${esc(row.image.outputSha256)}</li><li>No package, manufacturer, certification, clinical benefit, or partner relationship is asserted.</li></ul>
      </section>
    </div>`;
  }

  function renderDetail() {
    const row = selectedDetailRow();
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Proposed product detail · private only</p><h1>Intentional square media placement.</h1><p class="lead">This is not a live public product route. Current Core public slugs remain unavailable, and member detail media remains 4:3 where present.</p></div></section><div class="container-x">${detailSurface(row)}</div><section class="section soft"><div class="container-x">${boundaryNote()}</div></section></div>`;
  }

  function renderCards() {
    const ordered = [
      ["Research", representatives.research],
      ["Care", representatives.care],
      ["Held", representatives.held],
      ["Quote only", representatives.quote],
      ["Packaging unverified", representatives.pending],
    ];
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Founder decision D · public imagery</p><h1>No-image policy versus image-enabled policy.</h1><p class="lead">Each pair holds product identity, state, copy, and action constant. Only the proposed media policy changes.</p></div></section>${ordered.map(([label, row]) => `<section class="comparison-section ${label === "Care" || label === "Quote only" ? "soft" : ""}"><div class="container-x"><div class="section-heading"><div><p class="eyebrow">${esc(label)}</p><h2>${esc(row.name)} · ${esc(row.specification)}</h2><p>Current Core remains authoritative on pathways. The right side tests one square private asset without implying production approval.</p></div></div><div class="comparison-pair">${currentPolicyCard(row)}${proposedProductCard(row, { fallback: label === "Packaging unverified" })}</div></div></section>`).join("")}</div>`;
  }

  function renderDetails() {
    const row = representatives.research;
    const pending = representatives.pending;
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Founder decision E · media geometry</p><h1>Current 4:3 member slot versus proposed 1:1 slot.</h1><p class="lead">Both views use the exact same frozen source pixels with contain. No saturation, grade, vignette, tint, or crop is applied.</p></div></section><section class="comparison-section"><div class="container-x"><div class="comparison-pair"><article class="comparison-card"><div class="comparison-label"><span>Current Core member presentation</span><span>4:3</span></div><div class="comparison-body">${detailSurface(row, { ratio: "landscape", current: true })}</div></article><article class="comparison-card"><div class="comparison-label proposed"><span>Proposed Xenios Health presentation</span><span>1:1</span></div><div class="comparison-body">${detailSurface(row)}</div></article></div></div></section><section class="comparison-section soft"><div class="container-x"><div class="section-heading"><div><p class="eyebrow">Safe fallback</p><h2>No approved image means no borrowed image.</h2><p>The fallback preserves identity and state without selecting a lookalike product.</p></div></div>${detailSurface(pending, { fallback: true })}</div></section></div>`;
  }

  function renderCare() {
    const careRows = data.rows.filter((row) => row.pathway.key === "care").slice(0, 6);
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Care · source-faithful shell</p><h1>Care begins with licensed review.</h1><p class="lead">Clinical formulations remain distinct from Research. Eligibility, state availability, pharmacy requirements, clinical review, and price stay outside imagery authority.</p><div class="hero-actions"><a class="btn btn-primary" href="index.html?view=journeys">Start Care</a><a class="btn btn-secondary" href="index.html?view=decisions">Review proposals</a></div></div></section><section class="section dark"><div class="container-x"><div class="pathway-grid"><article class="pathway-card"><span class="number">01</span><h3>Choose a topic</h3><p>Start with a need or category, never a treatment promise.</p></article><article class="pathway-card"><span class="number">02</span><h3>Complete review</h3><p>Required intake and licensed review remain explicit.</p></article><article class="pathway-card"><span class="number">03</span><h3>See governed status</h3><p>Account and status surfaces show only recorded progress.</p></article></div></div></section><section class="section"><div class="container-x"><div class="section-heading"><div><p class="eyebrow">Proposed Care card placement</p><h2>Private media test, not a Care offer.</h2></div><a class="btn btn-ghost" href="index.html?view=cards">Compare text-only</a></div><div class="product-grid">${careRows.map((row) => proposedProductCard(row)).join("")}</div></div></section><section class="section soft"><div class="container-x"><aside class="secure-notice"><h3>Care boundary</h3><p>This prototype gives no diagnosis, prescription, dosing, emergency, or medical advice. If this is an emergency, call 911 or seek immediate local emergency care.</p></aside></div></section></div>`;
  }

  function renderStateDetail(state) {
    const row = representatives[state];
    const label = state === "quote" ? "Quote-only" : state === "held" ? "Held" : "Packaging-unverified";
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">${esc(label)} state</p><h1>${esc(row.name)} stays visible without becoming orderable.</h1><p class="lead">The image is private presentation evidence. Text remains the authority for price, availability, binding, and next action.</p></div></section><div class="container-x">${detailSurface(row, { fallback: state === "pending" })}</div><section class="section soft"><div class="container-x"><div class="comparison-pair">${currentPolicyCard(row)}${proposedProductCard(row, { fallback: state === "pending" })}</div></div></section></div>`;
  }

  function renderJourneys() {
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Current Core route families</p><h1>Account and status remain separate governed surfaces.</h1><p class="lead">These synthetic panels mirror current Core hierarchy and terminology without real credentials, customer data, payment evidence, or hosted services.</p></div></section><section class="section"><div class="container-x journey-grid"><article class="journey-panel"><p class="eyebrow">Status</p><h3>Check a request</h3><p>Use the exact reference and contact details from a submission. This prototype performs no lookup.</p><div class="field"><label for="status-reference">Reference</label><input id="status-reference" value="XR-EXAMPLE" readonly /></div><span class="btn btn-primary" aria-disabled="true">Check status</span></article><article class="journey-panel"><p class="eyebrow">Account</p><h3>Sign in securely</h3><p>Access protected history and actions only after authentication. This preview has no session or credential handling.</p><div class="field"><label for="account-email">Email</label><input id="account-email" value="founder-preview@example.invalid" readonly /></div><span class="btn btn-primary" aria-disabled="true">Continue</span></article><article class="journey-panel"><p class="eyebrow">Recorded progress</p><h3>Request timeline</h3><ol class="timeline"><li><b>1</b><span><strong>Request received</strong><br />Identity and timestamp recorded</span></li><li><b>2</b><span><strong>Review in progress</strong><br />No availability or payment claim implied</span></li><li><b>3</b><span><strong>Next step confirmed</strong><br />Only the governed action appears</span></li></ol></article><article class="journey-panel"><p class="eyebrow">Order history</p><h3>Synthetic account rows</h3><div class="account-row"><strong>Request XR-0124</strong><span>Under review</span></div><div class="account-row"><strong>Quote XQ-0087</strong><span>Action needed</span></div><div class="account-row"><strong>Care intake XC-0041</strong><span>Received</span></div></article><article class="journey-panel wide"><p class="eyebrow">Support</p><h3>Help near the point of uncertainty.</h3><p>Product identity questions, access recovery, request status, and Care questions route separately. No combined preview control claims to replace those Core flows.</p></article></div></section></div>`;
  }

  function renderComingSoon() {
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Coming soon</p><h1>Names only, without implied launch.</h1><p class="lead">No logos, packaging, price, checkout, partner relationship, or availability claim is shown.</p></div></section><section class="section"><div class="container-x"><div class="coming-grid">${data.comingSoon.map((item) => `<article class="coming-card"><span class="coming-status">${esc(item.status)}</span><h3>${esc(item.name)}</h3><p class="text-muted">Intentional non-image presentation. Details and transaction pathways are not announced.</p></article>`).join("")}</div></div></section></div>`;
  }

  function decisionPair(title, currentBody, proposedBody, note) {
    return `<section class="comparison-section"><div class="container-x"><div class="section-heading"><div><p class="eyebrow">Founder decision</p><h2>${esc(title)}</h2><p>${esc(note)}</p></div></div><div class="comparison-pair"><article class="comparison-card"><div class="comparison-label"><span>Current Core</span><span>Observed</span></div><div class="comparison-body">${currentBody}</div></article><article class="comparison-card"><div class="comparison-label proposed"><span>Proposed Xenios Health</span><span>Decision required</span></div><div class="comparison-body">${proposedBody}</div></article></div></div></section>`;
  }

  function renderDecisions() {
    const row = representatives.research;
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Five decisions, no silent adoption</p><h1>See the choices in the real Xenios UI.</h1><p class="lead">The left column records current Core. The right column is a private proposal. Nothing on this page changes production policy.</p></div></section>
      ${decisionPair("A. Header brand", `<div class="brand-demo"><img src="brand/xenios-mark-transparent.png" alt="" /><span>Xenios</span></div><p class="body-s text-muted">Current brand authority: Xenios.</p>`, `<div class="brand-demo"><img src="brand/xenios-mark-transparent.png" alt="" /><span>Xenios Health</span></div><p class="body-s text-muted">Proposed Health-experience wordmark.</p>`, "Choose whether the Health experience keeps the generic public name or adopts a Health-specific label.")}
      ${decisionPair("B. Primary action language", `<div class="cta-demo"><span class="btn btn-primary">Start Care</span><span class="legacy-pill">Legacy green pill</span></div><p class="body-s text-muted">Core is internally mixed. The dominant public shell already uses black rectangular primary actions.</p>`, `<div class="cta-demo"><span class="btn btn-primary">Primary action</span><span class="btn btn-secondary">Secondary action</span></div><p class="body-s text-muted">Proposed consistent rectangular system.</p>`, "Choose whether later Core work should remove the remaining green-pill island.")}
      ${decisionPair("C. Purple-to-teal accent", `<div class="accent-demo"><span class="mono-label text-pulse">Current active token</span><h3>Flat purple emphasis</h3><p class="body-s text-muted">Teal exists as a token but is not an approved global gradient system.</p></div>`, `<div class="accent-demo restrained"><div class="accent-rule"></div><h3>Restrained divider and focus emphasis</h3><p class="body-s text-muted">No giant gradient headline and no image recoloring.</p></div>`, "Choose whether a restrained purple-to-teal accent becomes part of the Health UI.")}
      ${decisionPair("D. Public product imagery", currentPolicyCard(row, { compact: true }), proposedProductCard(row, { compact: true }), "Choose between current text-only public cards and an intentional image-enabled catalog with a safe fallback.")}
      ${decisionPair("E. Canonical media shape", `<div>${mediaBlock(row, { ratio: "landscape", label: "Current member slot · 4:3 contain" })}</div><p class="body-s text-muted">Current optional member media behavior.</p>`, `<div>${mediaBlock(row, { ratio: "square", label: "Proposed canonical slot · 1:1 contain" })}</div><p class="body-s text-muted">Proposed same-pixels card and detail geometry.</p>`, "Choose whether future Product Control media should standardize on a square canonical slot.")}
      <section class="section soft"><div class="container-x">${boundaryNote()}</div></section>
    </div>`;
  }

  function renderCoreEvidence() {
    const images = [
      ["Current public homepage", "/evidence/ui-convergence/core-reference/core-home-desktop-1440.png", "Actual Core render at c0e25c73"],
      ["Current public Research shell", "/evidence/ui-convergence/core-reference/core-research-desktop-1440.png", "Actual signed-out Core render"],
      ["Current Early Access cards", "/evidence/ui-convergence/core-reference/core-early-access-desktop-1440.png", "Actual current text-only product-card treatment"],
      ["Current Products gateway", "/evidence/ui-convergence/core-reference/core-products-desktop-1440.png", "Actual public route; not a product grid"],
      ["Current unavailable public slug", "/evidence/ui-convergence/core-reference/core-product-slug-desktop-1440.png", "Actual public detail behavior"],
      ["Current Care shell", "/evidence/ui-convergence/core-reference/core-care-desktop-1440.png", "Actual signed-out Core render"],
      ["Current status", "/evidence/ui-convergence/core-reference/core-status-desktop-1440.png", "Actual signed-out Core render"],
      ["Synthetic order-request cards", "/evidence/ui-convergence/core-reference/core-synthetic-catalog-order-request-cards-desktop-1440.png", "Actual Core component with synthetic rows"],
      ["Synthetic member catalog", "/evidence/ui-convergence/core-synthetic-c0e25c73/synthetic/captures/catalog-synthetic--default--chromium--1440--01.png", "Exact Core component at 1440; UI presentation only"],
      ["Synthetic member catalog mobile", "/evidence/ui-convergence/core-synthetic-c0e25c73/synthetic/captures/catalog-synthetic--default--chromium--390--01.png", "Exact Core component at 390; UI presentation only"],
      ["Synthetic member detail", "/evidence/ui-convergence/core-synthetic-c0e25c73/synthetic/captures/product-detail-synthetic--default--chromium--1440--01.png", "Exact Core component at 1440; UI presentation only"],
      ["Synthetic member detail mobile", "/evidence/ui-convergence/core-synthetic-c0e25c73/synthetic/captures/product-detail-synthetic--default--chromium--390--01.png", "Exact Core component at 390; UI presentation only"],
      ["Synthetic account overview", "/evidence/ui-convergence/core-account-synthetic-c0e25c73/account-overview-synthetic--default--chromium--1440--01.png", "Exact Core dev-only fixture at 1440; UI presentation only"],
      ["Synthetic account overview mobile", "/evidence/ui-convergence/core-account-synthetic-c0e25c73/account-overview-synthetic--default--chromium--390--01.png", "Exact Core dev-only fixture at 390; UI presentation only"],
      ["Synthetic order history", "/evidence/ui-convergence/core-account-synthetic-c0e25c73/orders-synthetic--default--chromium--1440--01.png", "Exact Core dev-only fixture at 1440; UI presentation only"],
      ["Synthetic order history mobile", "/evidence/ui-convergence/core-account-synthetic-c0e25c73/orders-synthetic--default--chromium--390--01.png", "Exact Core dev-only fixture at 390; UI presentation only"],
      ["Synthetic order detail", "/evidence/ui-convergence/core-account-synthetic-c0e25c73/order-detail-synthetic--default--chromium--1440--01.png", "Exact Core dev-only fixture at 1440; UI presentation only"],
      ["Synthetic order detail mobile", "/evidence/ui-convergence/core-account-synthetic-c0e25c73/order-detail-synthetic--default--chromium--390--01.png", "Exact Core dev-only fixture at 390; UI presentation only"],
    ];
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Rendered Core evidence</p><h1>Actual current UI, not a reconstructed mood board.</h1><p class="lead">These screenshots were captured from exact Core source c0e25c73 by Claude review ae5c410 and repository-owned synthetic harnesses. Member, account, and order views use only dev-only fixtures; no real credentials or customer data were used.</p></div></section><section class="section"><div class="container-x evidence-grid">${images.map(([title, src, note]) => `<figure class="evidence-card"><img data-safe-image src="${esc(src)}" alt="${esc(title)}" loading="lazy" /><figcaption><strong>${esc(title)}</strong><span>${esc(note)}</span></figcaption></figure>`).join("")}</div></section><section class="section soft"><div class="container-x"><aside class="boundary-note"><h3>Evidence limitation</h3><p>Public screenshots are actual renders. Synthetic product, account, and order components prove presentation only; they do not prove authentication, route guards, API adapters, live Product Control, pricing, payment, fulfillment, or commerce behavior.</p></aside></div></section></div>`;
  }

  function renderThreeWayComparison() {
    const comparisons = [
      {
        title: "Global home shell",
        note: "The corrected candidate mirrors the dominant public Core shell. Any Health-specific brand change remains decision A.",
        actual: ["Actual Core home", "/evidence/ui-convergence/core-reference/core-home-desktop-1440.png", "c0e25c73 public render"],
        old: ["Old founder preview", "/evidence/founder-preview/home-desktop-1440.png", "8b06da56 custom parallel shell"],
        proposed: ["Corrected private candidate", "/evidence/ui-convergence/corrected-preview/home-desktop-1440.png", "Core-converged proposal; not accepted"],
      },
      {
        title: "Member catalog and cards",
        note: "Actual member catalog presentation is kept distinct from the proposal to add public imagery.",
        actual: ["Actual Core synthetic catalog", "/evidence/ui-convergence/core-synthetic-c0e25c73/synthetic/captures/catalog-synthetic--default--chromium--1440--01.png", "Exact Core component; UI presentation only"],
        old: ["Old image-led products", "/evidence/founder-preview/products-desktop-1440.png", "8b06da56 drift baseline"],
        proposed: ["Proposed Core-style products", "/evidence/ui-convergence/corrected-preview/products-desktop-1440.png", "Private image-policy proposal"],
      },
      {
        title: "Member product detail",
        note: "The same frozen pixels are shown with contain; public product detail remains unavailable in Core.",
        actual: ["Actual Core synthetic detail", "/evidence/ui-convergence/core-synthetic-c0e25c73/synthetic/captures/product-detail-synthetic--default--chromium--1440--01.png", "Exact Core component; UI presentation only"],
        old: ["Old preview detail", "/evidence/founder-preview/research-detail-desktop-1440.png", "8b06da56 reconstructed detail"],
        proposed: ["Proposed geometry comparison", "/evidence/ui-convergence/corrected-preview/product-detail-comparison-desktop-1440.png", "Current 4:3 versus proposed 1:1"],
      },
      {
        title: "Private account overview",
        note: "The exact Core column uses the dev-only synthetic fixture harness and does not prove authentication.",
        actual: ["Actual Core synthetic account", "/evidence/ui-convergence/core-account-synthetic-c0e25c73/account-overview-synthetic--default--chromium--1440--01.png", "Exact Core fixture; UI presentation only"],
        old: ["Old combined account/status", "/evidence/founder-preview/status-account-support-desktop-1440.png", "8b06da56 hand-built approximation"],
        proposed: ["Corrected account/status study", "/evidence/ui-convergence/corrected-preview/account-status-desktop-1440.png", "Private proposal; no session"],
      },
      {
        title: "Commerce and order history",
        note: "Core's real presentation separates commerce records from Care and membership. The preview columns remain non-transactional studies.",
        actual: ["Actual Core synthetic history", "/evidence/ui-convergence/core-account-synthetic-c0e25c73/orders-synthetic--default--chromium--1440--01.png", "Exact Core fixture; UI presentation only"],
        old: ["Old combined history panel", "/evidence/founder-preview/status-account-support-desktop-1440.png", "No authenticated or live commerce proof"],
        proposed: ["Corrected governed-state panel", "/evidence/ui-convergence/corrected-preview/account-status-desktop-1440.png", "No payment, order, or fulfillment authority"],
      },
      {
        title: "Care pathway",
        note: "The proposed surface converges on Core hierarchy while keeping all clinical, state, and pharmacy authority outside imagery.",
        actual: ["Actual Core Care", "/evidence/ui-convergence/core-reference/core-care-desktop-1440.png", "c0e25c73 public render"],
        old: ["Old preview Care", "/evidence/founder-preview/care-desktop-1440.png", "8b06da56 dark pathway drift"],
        proposed: ["Corrected Care candidate", "/evidence/ui-convergence/corrected-preview/care-desktop-1440.png", "Core-converged private proposal"],
      },
    ];
    const card = (column, entry, className = "") => `<article class="triptych-card ${esc(className)}"><div class="triptych-label"><span>${esc(column)}</span><strong>${esc(entry[0])}</strong></div><a class="triptych-shot" href="${esc(entry[1])}" aria-label="Open full ${esc(entry[0])} screenshot"><img data-safe-image src="${esc(entry[1])}" alt="${esc(entry[0])}" loading="eager" /></a><p>${esc(entry[2])}</p></article>`;
    return `<div class="page-shell"><section class="page-hero"><div class="container-x"><p class="eyebrow">Complete A / B / C review package</p><h1>Actual Core, old preview, proposed delta.</h1><p class="lead">Every image below is labeled by authority. The complete 207-row machine-readable matrix records surface, actual Core behavior, old preview behavior, proposed Xenios Health delta, accidental versus intentional status, and required action.</p><div class="hero-actions"><a class="btn btn-primary" href="../UI_CONVERGENCE_THREE_WAY_MATRIX_2026-10-01.json">Open 207-row matrix</a><a class="btn btn-secondary" href="index.html?view=decisions">Review A-E decisions</a></div></div></section><section class="section"><div class="container-x triptych-stack">${comparisons.map((comparison) => `<section class="triptych-group"><div class="section-heading"><div><p class="eyebrow">Three-way evidence</p><h2>${esc(comparison.title)}</h2><p>${esc(comparison.note)}</p></div></div><div class="triptych-grid">${card("A · ACTUAL CORE", comparison.actual, "actual")}${card("B · CURRENT / OLD PREVIEW", comparison.old, "old")}${card("C · PROPOSED XENIOS HEALTH", comparison.proposed, "proposed")}</div></section>`).join("")}</div></section><section class="section soft"><div class="container-x"><aside class="boundary-note"><h3>No approval is implied</h3><p>This comparison grants no image, founder-decision, Core, catalog, Product Control, price, commerce, runtime, publication, deployment, hosted-write, managed-SQL, or production authority.</p></aside></div></section></div>`;
  }

  function renderReview() {
    const limitParam = Number(params.get("limit") || 423);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 423) : 423;
    const totalPages = Math.ceil(data.rows.length / limit);
    const requestedPage = Number(params.get("page") || 1);
    const page = Number.isInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
    const offset = (page - 1) * limit;
    const shown = data.rows.slice(offset, offset + limit);
    return `<section class="container-x qa-shell"><div class="section-heading"><div><p class="eyebrow">Full catalog QA</p><h1 class="display-m">423 private media placements.</h1><p>Every row remains provisional. The table verifies canonical identity, unchanged source asset, pathway, binding, and image finality.</p></div><a class="btn btn-secondary" href="index.html?view=cards">Compare policy</a></div>${boundaryNote()}<div class="qa-controls" id="qa-controls" style="margin-top: 24px"><div class="field"><label for="qa-search">Search</label><input id="qa-search" type="search" placeholder="ID, name, specification, or class" autocomplete="off" /></div><div class="field"><label for="qa-pathway">Pathway</label><select id="qa-pathway"><option value="">All pathways</option><option value="research">Research</option><option value="care">Care</option><option value="held">Held</option><option value="quote">Quote only</option><option value="pending">Binding pending</option></select></div><div class="field"><label for="qa-visual">Visual state</label><select id="qa-visual"><option value="">All visual states</option><option value="provisional">Provisional</option><option value="final">Final</option><option value="fallback">Fallback</option></select></div><output class="result-count" id="qa-count">${shown.length} rows</output></div><div class="qa-table-wrap"><table class="qa-table"><thead><tr><th>Visual</th><th>Canonical ID</th><th>Product</th><th>Private source</th><th>Image class</th><th>Pathway / status</th><th>Finality</th><th>Binding</th></tr></thead><tbody id="qa-body">${shown.map(reviewRow).join("")}</tbody></table></div>${totalPages > 1 ? `<div class="qa-pager"><span>Evidence page ${page} of ${totalPages}, rows ${offset + 1}-${Math.min(offset + limit, data.rows.length)} of 423.</span><div>${page > 1 ? `<a href="catalog-review.html?page=${page - 1}&limit=${limit}">Previous</a>` : ""} ${page < totalPages ? `<a href="catalog-review.html?page=${page + 1}&limit=${limit}">Next</a>` : ""}</div></div>` : `<div class="qa-pager"><span>All 423 customer targets shown in one full-page evidence view.</span><a href="index.html?view=products">Product preview</a></div>`}</section>`;
  }

  function reviewRow(row) {
    return `<tr data-canonical-id="${esc(row.canonicalId)}" data-search="${esc(`${row.canonicalId} ${row.name} ${row.specification} ${row.imageClass}`.toLowerCase())}" data-pathway="${esc(row.pathway.key)}" data-visual="${esc(row.finality)}"><td><img class="qa-thumb" data-safe-image src="${esc(row.image.src)}" width="64" height="64" alt="Private provisional ${esc(titleCase(row.image.assetImageClass))} visual" loading="lazy" /></td><td class="qa-code">${esc(row.canonicalId)}</td><td class="qa-name"><strong>${esc(row.name)}</strong><span>${esc(row.specification)}</span></td><td><strong>${esc(row.image.jobId)}</strong><br /><span>${esc(row.image.outputSha256.slice(0, 12))}</span></td><td class="qa-code">${esc(row.imageClass)}</td><td>${statusBadge(row)}<br />${esc(row.pathway.price)}</td><td><strong>Provisional</strong><br />Exact render missing</td><td>${esc(titleCase(row.bindingState.state))}</td></tr>`;
  }

  function activateReviewFilters() {
    const search = document.querySelector("#qa-search");
    const pathway = document.querySelector("#qa-pathway");
    const visual = document.querySelector("#qa-visual");
    const count = document.querySelector("#qa-count");
    const tableRows = [...document.querySelectorAll("#qa-body tr")];
    if (!search || !pathway || !visual || !count) return;
    const update = () => {
      const needle = search.value.trim().toLowerCase();
      let visible = 0;
      for (const row of tableRows) {
        const show = (!needle || row.dataset.search.includes(needle)) && (!pathway.value || row.dataset.pathway === pathway.value) && (!visual.value || row.dataset.visual === visual.value);
        row.hidden = !show;
        if (show) visible += 1;
      }
      count.textContent = `${visible} rows`;
    };
    search.addEventListener("input", update);
    pathway.addEventListener("change", update);
    visual.addEventListener("change", update);
  }

  function renderWireframe() {
    return `<div class="container-x wire-shell"><section class="wire-title"><div class="wire-label"><span>Source-faithful structure</span><span>Core c0e25c73</span></div><h1 class="display-m">Xenios UI convergence map</h1><p>Boxes record current hierarchy. Proposed imagery is isolated inside the product comparisons.</p></section><section class="wire-section" id="wire-home"><div class="wire-label"><span>01 / Global shell + home</span><span>Current Core baseline</span></div><div class="wire-grid"><div class="wire-box dark wire-span-8 wire-xl">White sticky header, Core nav, restrained hero, black rectangular actions</div><div class="wire-box wire-span-4 wire-xl">Clarity information card, no invented orb</div><div class="wire-box wire-span-3">426 source</div><div class="wire-box wire-span-3">424 canonical</div><div class="wire-box wire-span-3">423 private slots</div><div class="wire-box wire-span-3">0 public approvals</div></div></section><section class="wire-section" id="wire-catalog"><div class="wire-label"><span>02 / Products</span><span>Decision comparison</span></div><div class="wire-grid"><div class="wire-box wire-span-12">Current no-image card versus proposed square contain card</div>${Array.from({ length: 4 }, (_, index) => `<div class="wire-box wire-span-3 wire-tall">State ${index + 1}: exact identity, pathway, price state, CTA</div>`).join("")}</div></section><section class="wire-section" id="wire-detail"><div class="wire-label"><span>03 / Detail</span><span>Geometry comparison</span></div><div class="wire-grid"><div class="wire-box wire-span-6 wire-xl">Current member 4:3 contain or approved-image-unavailable fallback</div><div class="wire-box wire-span-6 wire-xl">Proposed 1:1 contain, same canonical pixels</div></div></section><section class="wire-section" id="wire-care"><div class="wire-label"><span>04 / Care + restricted states</span><span>Truth first</span></div><div class="wire-grid"><div class="wire-box dark wire-span-4 wire-tall">Care: licensed review and eligibility</div><div class="wire-box wire-span-4 wire-tall">Quote-only: no direct price or cart</div><div class="wire-box wire-span-4 wire-tall">Held / unverified: no order affordance</div></div></section><section class="wire-section" id="wire-account"><div class="wire-label"><span>05 / Status + account</span><span>Separate Core routes</span></div><div class="wire-grid"><div class="wire-box wire-span-6 wire-tall">Public status lookup and recorded timeline</div><div class="wire-box wire-span-6 wire-tall">Protected account and history presentation</div></div></section></div>`;
  }

  function installImageFallbacks() {
    for (const image of document.querySelectorAll("img[data-safe-image]")) {
      const replace = () => {
        const parent = image.parentElement;
        if (!parent || !image.isConnected) return;
        const fallback = document.createElement("div");
        fallback.className = "media-fallback";
        fallback.innerHTML = "<div><strong>Image unavailable</strong><p class=\"fine-print\">Text identity remains available.</p></div>";
        image.replaceWith(fallback);
      };
      image.addEventListener("error", replace, { once: true });
      if (image.complete && image.naturalWidth === 0) replace();
    }
  }

  const renderers = {
    home: renderHome,
    products: renderProducts,
    featured: renderFeatured,
    detail: renderDetail,
    cards: renderCards,
    details: renderDetails,
    care: renderCare,
    held: () => renderStateDetail("held"),
    quote: () => renderStateDetail("quote"),
    pending: () => renderStateDetail("pending"),
    journeys: renderJourneys,
    coming: renderComingSoon,
    decisions: renderDecisions,
    core: renderCoreEvidence,
    "three-way": renderThreeWayComparison,
    review: renderReview,
    wireframe: renderWireframe,
  };
  const render = renderers[view] || renderHome;
  app.innerHTML = render();
  if (view === "products") activateCatalogFilters();
  if (view === "review") activateReviewFilters();
  installImageFallbacks();
  document.documentElement.dataset.previewReady = "true";
  window.__XENIOS_PREVIEW_READY__ = {
    view,
    customerTargets: data.rows.length,
    renderedCards: document.querySelectorAll(".product-card").length,
    reviewRows: document.querySelectorAll("#qa-body tr").length,
    coreUiReferenceSha: "c0e25c73a0d789829ea213e2ee040c68e06f0a75",
    imageryBaselineSha: "8b06da560978c8c4b1ce325da8813373bffbc845",
    previewOnlyImageManipulation: false,
  };
})();
