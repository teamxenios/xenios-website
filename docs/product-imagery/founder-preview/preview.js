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
    String(value)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());

  function productCard(row, compact = false) {
    return `
      <article class="product-card" data-canonical-id="${esc(row.canonicalId)}" data-asset-job="${esc(row.image.jobId)}">
        <figure class="product-visual">
          <img src="${esc(row.image.src)}" width="${row.image.width}" height="${row.image.height}"
            alt="Provisional ${esc(titleCase(row.image.assetImageClass))} study for ${esc(row.name)}" loading="lazy" />
          <span class="visual-flag">Provisional ${row.image.visualMode.includes("state") ? "state" : "class"} visual</span>
        </figure>
        <div class="product-card-body">
          <div class="card-meta">
            <span class="pill ${esc(row.pathway.key)}">${esc(row.pathway.label)}</span>
            <span class="pill">${esc(row.canonicalId)}</span>
          </div>
          <h3>${esc(row.name)}</h3>
          <p class="specification">${esc(row.specification)}</p>
          ${compact ? "" : `<div class="price-line"><span>Price state</span><strong>${esc(row.pathway.price)}</strong></div>`}
          <a class="card-cta" href="product-detail.html?id=${encodeURIComponent(row.canonicalId)}">${esc(row.pathway.cta)}</a>
        </div>
      </article>`;
  }

  function renderHome() {
    const featured = data.featuredCanonicalIds.map((id) => rowsById.get(id)).filter(Boolean);
    return `
      <div class="page-shell">
        <section class="hero">
          <div class="hero-copy">
            <p class="eyebrow">Xenios Health</p>
            <h1>A calmer way to navigate <span class="gradient-word">research and care.</span></h1>
            <p class="lead">One considered catalog. Clear pathways. Product identity and presentation kept separate from commerce authority.</p>
            <div class="hero-actions">
              <a class="button light" href="index.html?view=products">Explore 423 products</a>
              <a class="button ghost" href="index.html?view=care">Review Care pathway</a>
            </div>
          </div>
          <div class="hero-art" aria-label="Abstract premium liquid visual">
            <div class="liquid-orb" aria-hidden="true"></div>
            <p class="orb-label"><strong>Private design study</strong><br />Organic material language, quiet typography, and no implied package or manufacturer.</p>
          </div>
        </section>
        <section class="truth-strip" aria-label="Catalog accounting">
          <div class="truth-stat"><strong>426</strong><span>reviewed source rows</span></div>
          <div class="truth-stat"><strong>424</strong><span>canonical variants</span></div>
          <div class="truth-stat"><strong>423</strong><span>customer visual slots</span></div>
          <div class="truth-stat"><strong>0</strong><span>images approved for public use</span></div>
        </section>
        <section class="section">
          <div class="content-width">
            <div class="section-heading">
              <div><p class="eyebrow">Featured</p><h2>Start with what matters.</h2><p>Recognizable identities use the same canonical image reference on cards and detail views. Every image below remains private and provisional.</p></div>
              <a class="button ghost" href="index.html?view=featured">View Featured</a>
            </div>
            <div class="product-grid">${featured.slice(0, 8).map((row) => productCard(row, true)).join("")}</div>
          </div>
        </section>
        <section class="section dark-section">
          <div class="content-width">
            <div class="section-heading"><div><p class="eyebrow">One catalog, distinct pathways</p><h2>Clarity before action.</h2><p>Presentation explains the next step without inventing price, availability, or transaction eligibility.</p></div></div>
            <div class="pathway-grid">
              <article class="pathway-card"><span class="number">01</span><h3>Research</h3><p>Browse exact identity and specification. Runtime Product Control supplies any price and request capability.</p></article>
              <article class="pathway-card"><span class="number">02</span><h3>Care</h3><p>Provider review stays visibly distinct from Research. Care pricing is withheld from this static preview.</p></article>
              <article class="pathway-card"><span class="number">03</span><h3>Quote and held</h3><p>Quote-only and held identities remain present with an honest non-transaction state and a clear next step.</p></article>
            </div>
          </div>
        </section>
        <section class="section">
          <div class="content-width care-feature">
            <div class="care-copy">
              <p class="eyebrow">Xenios Care</p>
              <h2>Care begins with review.</h2>
              <p>Clinical formulations use a provider-guided pathway, subject to applicable state availability and pharmacy requirements. This prototype contains no checkout and makes no suitability claim.</p>
              <a class="button" href="index.html?view=care">See the Care presentation</a>
            </div>
            <div class="care-art" aria-label="Abstract Care pathway artwork"></div>
          </div>
        </section>
        <section class="section">
          <div class="content-width">
            <div class="section-heading"><div><p class="eyebrow">On the horizon</p><h2>Coming soon, without overclaiming.</h2><p>Names only. No logos, packaging, partnership claims, price, or checkout.</p></div></div>
            ${comingSoonCards()}
          </div>
        </section>
        <section class="section">
          <div class="content-width">
            ${boundaryNote()}
          </div>
        </section>
        <section class="section dark-section">
          <div class="content-width">
            <div class="section-heading"><div><p class="eyebrow">Batch 0 visual grammar</p><h2>Twenty-five studies, still under review.</h2><p>The contact sheet is evidence, not a public asset library. Exact output hashes and provenance remain in the imagery manifests.</p></div></div>
            <figure class="contact-sheet"><img src="${esc(data.batch0ContactSheet.src)}" alt="Batch 0 contact sheet with 25 provisional class and state studies" /><figcaption>25 of 25 rendered. 0 approved. 0 public. No derivative is authorized for runtime use.</figcaption></figure>
          </div>
        </section>
      </div>`;
  }

  function comingSoonCards() {
    return `<div class="coming-grid">${data.comingSoon
      .map(
        (item) => `<article class="coming-card"><span class="coming-status">${esc(item.status)}</span><h3>${esc(item.name)}</h3><p>Intentional non-image presentation. Details and transaction pathways are not announced.</p></article>`,
      )
      .join("")}</div>`;
  }

  function boundaryNote() {
    return `<aside class="boundary-note"><div class="boundary-icon">i</div><div><h3>Prototype boundary</h3><p>These 423 slots are joined from the frozen 424-variant core candidate at ${esc(data.sources.coreCatalog.commit.slice(0, 12))}. The candidate is not independently accepted, Batch 0 is not approved, and media/commerce integration is not accepted. Image state does not create or remove catalog, price, availability, quote, cart, workflow, or fulfillment authority.</p></div></aside>`;
  }

  function renderProducts() {
    const categories = [...new Set(data.rows.map((row) => row.category))].sort();
    return `
      <div class="page-shell">
        <section class="catalog-hero"><div class="content-width"><p class="eyebrow">Products</p><h1>Browse the complete visual catalog.</h1><p class="lead">All 423 customer targets have a deliberate visual slot. Search by exact name or specification, then filter by category or pathway.</p></div></section>
        <section class="content-width catalog-results">
          <div class="catalog-tools" role="search">
            <div class="field"><label for="catalog-search">Search</label><input id="catalog-search" type="search" placeholder="Product, specification, or ID" autocomplete="off" /></div>
            <div class="field"><label for="catalog-category">Category</label><select id="catalog-category"><option value="">All categories</option>${categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}</select></div>
            <div class="field"><label for="catalog-pathway">Pathway</label><select id="catalog-pathway"><option value="">All pathways</option><option value="research">Research</option><option value="care">Care</option><option value="held">Held</option><option value="quote">Quote only</option><option value="pending">Binding pending</option></select></div>
            <output class="result-count" id="catalog-count">423 products</output>
          </div>
          <div class="product-grid" id="catalog-grid">${data.rows.map((row) => productCard(row)).join("")}</div>
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
      count.textContent = `${filtered.length} ${filtered.length === 1 ? "product" : "products"}`;
      grid.innerHTML = filtered.length
        ? filtered.map((row) => productCard(row)).join("")
        : `<div class="empty-state"><h3>No exact matches</h3><p>Try a broader name, specification, category, or pathway.</p></div>`;
    };
    search.addEventListener("input", update);
    category.addEventListener("change", update);
    pathway.addEventListener("change", update);
  }

  function renderFeatured() {
    const featured = data.featuredCanonicalIds.map((id) => rowsById.get(id)).filter(Boolean);
    return `
      <div class="page-shell">
        <section class="subpage-hero"><div class="content-width"><p class="eyebrow">Featured products</p><h1>High-visibility identity, consistently presented.</h1><p class="lead">Featured, catalog, and detail surfaces resolve to one canonical row and one provisional asset reference.</p></div></section>
        <section class="section"><div class="content-width"><div class="product-grid">${featured.map((row) => productCard(row)).join("")}</div></div></section>
        <section class="section"><div class="content-width">${boundaryNote()}</div></section>
      </div>`;
  }

  function selectedDetailRow() {
    const requested = params.get("id");
    if (requested && rowsById.has(requested)) return rowsById.get(requested);
    const sample = params.get("sample");
    if (sample && data.representativeCanonicalIds[sample]) {
      return rowsById.get(data.representativeCanonicalIds[sample]);
    }
    return rowsById.get(data.representativeCanonicalIds.research) || data.rows[0];
  }

  function renderDetail() {
    const row = selectedDetailRow();
    const related = data.rows
      .filter((candidate) => candidate.category === row.category && candidate.canonicalId !== row.canonicalId)
      .slice(0, 4);
    return `
      <div class="page-shell" data-detail-canonical-id="${esc(row.canonicalId)}" data-detail-asset-job="${esc(row.image.jobId)}">
        <div class="content-width detail-layout">
          <figure class="detail-media">
            <img src="${esc(row.image.src)}" width="${row.image.width}" height="${row.image.height}" alt="Provisional ${esc(titleCase(row.image.assetImageClass))} study for ${esc(row.name)}" />
            <span class="visual-flag">Private provisional visual</span>
          </figure>
          <section class="detail-copy">
            <div class="badge-row"><span class="pill ${esc(row.pathway.key)}">${esc(row.pathway.label)}</span><span class="pill">${esc(row.canonicalId)}</span></div>
            <h1>${esc(row.name)}</h1>
            <p class="detail-spec">${esc(row.specification)}</p>
            <div class="detail-facts">
              <div class="detail-fact"><span>Authorized form</span><strong>${esc(row.dosageForm)}</strong></div>
              <div class="detail-fact"><span>Price state</span><strong>${esc(row.pathway.price)}</strong></div>
              <div class="detail-fact"><span>Pathway</span><strong>${esc(row.pathway.label)}</strong></div>
              <div class="detail-fact"><span>Visual class</span><strong>${esc(titleCase(row.imageClass))}</strong></div>
              <div class="detail-fact"><span>Visual state</span><strong>Provisional, private, not publication-approved</strong></div>
            </div>
            <div class="detail-action">
              <strong>${esc(row.pathway.cta)}</strong>
              <p>${esc(row.pathway.explanation)} This static preview does not submit a request or establish availability.</p>
              <span class="button light" aria-disabled="true">Prototype action only</span>
            </div>
            <ul class="disclosure-list">
              <li>Catalog visibility does not establish availability, suitability, or purchase eligibility.</li>
              <li>The card and this detail view use the same canonical identity and Batch 0 asset job: ${esc(row.image.jobId)}.</li>
              <li>No package, manufacturer, certification, clinical benefit, or partner relationship is asserted.</li>
            </ul>
          </section>
        </div>
        ${related.length ? `<section class="section"><div class="content-width"><div class="section-heading"><div><p class="eyebrow">Same category</p><h2>Continue exploring.</h2></div></div><div class="product-grid">${related.map((item) => productCard(item, true)).join("")}</div></div></section>` : ""}
      </div>`;
  }

  function renderCare() {
    const careRows = data.rows.filter((row) => row.pathway.key === "care").slice(0, 8);
    return `
      <div class="page-shell">
        <section class="subpage-hero"><div class="content-width"><p class="eyebrow">Xenios Care</p><h1>A guided pathway, never a disguised cart.</h1><p class="lead">242 Care rows remain visible with Care pricing withheld and provider review clearly separated from Research requests.</p></div></section>
        <section class="section dark-section"><div class="content-width"><div class="section-heading"><div><p class="eyebrow">Care pathway</p><h2>Understand the next step.</h2><p>This is a presentation study only. Eligibility, state availability, pharmacy requirements, clinical review, and price remain outside imagery authority.</p></div></div><div class="pathway-grid"><article class="pathway-card"><span class="number">01</span><h3>Choose a topic</h3><p>Begin with the need or category, not a treatment promise.</p></article><article class="pathway-card"><span class="number">02</span><h3>Complete review</h3><p>Required intake and provider review stay explicit before any fulfillment path.</p></article><article class="pathway-card"><span class="number">03</span><h3>See governed status</h3><p>Account and status surfaces explain what is known without inventing progress.</p></article></div></div></section>
        <section class="section"><div class="content-width"><div class="section-heading"><div><p class="eyebrow">Care catalog preview</p><h2>Same identity, distinct pathway.</h2></div></div><div class="product-grid">${careRows.map((row) => productCard(row)).join("")}</div></div></section>
      </div>`;
  }

  function renderJourneys() {
    return `
      <div class="page-shell">
        <section class="subpage-hero"><div class="content-width"><p class="eyebrow">Customer journeys</p><h1>Request, quote, status, account, support.</h1><p class="lead">Structural presentation for the full customer loop, with no live forms, customer data, payment, or external service.</p></div></section>
        <section class="section"><div class="content-width journey-grid">
          <article class="journey-panel"><p class="eyebrow">Request presentation</p><h3>From identity to a governed request</h3><p>The selected product, variant, price state, and pathway stay visible before the customer proceeds.</p><ol class="step-list"><li><b>1</b><span>Confirm exact product and specification</span></li><li><b>2</b><span>Review pathway and truthful price state</span></li><li><b>3</b><span>Sign in or recover access</span></li><li><b>4</b><span>Submit through the runtime authority</span></li></ol></article>
          <article class="journey-panel"><p class="eyebrow">Quote review</p><h3>Economics stay explicit</h3><p>A quote-only product never appears as free or directly purchasable. The visual carries no price authority.</p><div class="detail-facts"><div class="detail-fact"><span>Product</span><strong>Exact canonical identity</strong></div><div class="detail-fact"><span>Price</span><strong>Price on request</strong></div><div class="detail-fact"><span>Next step</span><strong>Request a quote</strong></div></div></article>
          <article class="journey-panel"><p class="eyebrow">Order status</p><h3>Progress without guesswork</h3><p>One clear timeline distinguishes request received, review, confirmed next step, and completion.</p><ol class="timeline"><li><b>1</b><span><strong>Request received</strong><br />Identity and timestamp recorded</span></li><li><b>2</b><span><strong>Review in progress</strong><br />No availability or payment claim implied</span></li><li><b>3</b><span><strong>Next step confirmed</strong><br />Customer sees the governed action</span></li></ol></article>
          <article class="journey-panel"><p class="eyebrow">Account and order history</p><h3>A quiet record of what happened</h3><p>Prototype rows are synthetic labels, not customer or payment evidence.</p><div class="account-row"><strong>Request XR-0124</strong><span>Under review</span><span>View status</span></div><div class="account-row"><strong>Quote XQ-0087</strong><span>Action needed</span><span>Review quote</span></div><div class="account-row"><strong>Care intake XC-0041</strong><span>Received</span><span>View pathway</span></div></article>
          <article class="journey-panel wide"><p class="eyebrow">Help and support</p><h3>Answers close to the moment of uncertainty.</h3><p>Product identity questions, Care pathway guidance, quote help, account recovery, and order-status support share one clear destination. No prototype button sends a real message.</p><div class="badge-row"><span class="pill">Product help</span><span class="pill">Care guidance</span><span class="pill">Quote support</span><span class="pill">Account recovery</span><span class="pill">Order status</span></div></article>
        </div></section>
      </div>`;
  }

  function renderComingSoon() {
    return `<div class="page-shell"><section class="subpage-hero"><div class="content-width"><p class="eyebrow">Coming soon</p><h1>Reserved space without implied commitments.</h1><p class="lead">These two concepts remain outside the 423-product catalog. There is no logo, package, partnership claim, price, or checkout.</p></div></section><section class="section"><div class="content-width">${comingSoonCards()}</div></section></div>`;
  }

  function renderReview() {
    const page = Math.max(1, Number(params.get("page") || 1));
    const requestedLimit = Number(params.get("limit") || data.rows.length);
    const limit = Math.max(1, Math.min(data.rows.length, requestedLimit));
    const offset = (page - 1) * limit;
    const shown = data.rows.slice(offset, offset + limit);
    const totalPages = Math.ceil(data.rows.length / limit);
    return `
      <section class="qa-shell" data-review-page="${page}" data-review-count="${shown.length}">
        <div class="qa-head">
          <div><p class="eyebrow">Founder and QA review</p><h1>423-target visual grid</h1><p class="lead">Every customer target has a canonical identity and a deliberate private visual slot. No visual below is final or public.</p></div>
          <div class="qa-summary"><div><strong>${data.counts.customerTargets}</strong><span>targets</span></div><div><strong>${data.counts.provisionalVisualSlots}</strong><span>provisional</span></div><div><strong>${data.counts.finalExactAssets}</strong><span>final</span></div></div>
        </div>
        <div class="qa-toolbar">
          <div class="field"><label for="qa-search">Search grid</label><input id="qa-search" type="search" placeholder="Name, ID, class, or specification" autocomplete="off" /></div>
          <div class="field"><label for="qa-pathway">Pathway</label><select id="qa-pathway"><option value="">All pathways</option><option value="research">Research</option><option value="care">Care</option><option value="held">Held</option><option value="quote">Quote only</option><option value="pending">Binding pending</option></select></div>
          <div class="field"><label for="qa-visual">Visual state</label><select id="qa-visual"><option value="">All visual states</option><option value="provisional">Provisional</option><option value="final">Final</option><option value="fallback">Fallback</option></select></div>
          <output class="result-count" id="qa-count">${shown.length} rows</output>
        </div>
        <div class="qa-table-wrap"><table class="qa-table"><thead><tr><th>Visual</th><th>Canonical ID</th><th>Product</th><th>Current image or fallback</th><th>Image class</th><th>Pathway / status</th><th>Finality</th><th>Binding</th></tr></thead><tbody id="qa-body">${shown.map(reviewRow).join("")}</tbody></table></div>
        ${totalPages > 1 ? `<div class="qa-pager"><span>Evidence page ${page} of ${totalPages}, rows ${offset + 1}-${Math.min(offset + limit, data.rows.length)} of 423.</span><div>${page > 1 ? `<a href="catalog-review.html?page=${page - 1}&limit=${limit}">Previous</a>` : ""} ${page < totalPages ? `<a href="catalog-review.html?page=${page + 1}&limit=${limit}">Next</a>` : ""}</div></div>` : `<div class="qa-pager"><span>All 423 customer targets shown in one scrollable view.</span><a href="index.html?view=products">Customer catalog preview</a></div>`}
      </section>`;
  }

  function reviewRow(row) {
    return `<tr data-canonical-id="${esc(row.canonicalId)}" data-search="${esc(`${row.canonicalId} ${row.name} ${row.specification} ${row.imageClass}`.toLowerCase())}" data-pathway="${esc(row.pathway.key)}" data-visual="${esc(row.finality)}">
      <td data-label="Visual"><img class="qa-thumb" src="${esc(row.image.src)}" width="64" height="64" alt="Provisional ${esc(titleCase(row.image.assetImageClass))} visual" loading="lazy" /></td>
      <td data-label="Canonical ID" class="qa-code">${esc(row.canonicalId)}</td>
      <td data-label="Product" class="qa-name"><strong>${esc(row.name)}</strong><span>${esc(row.specification)}</span></td>
      <td data-label="Image or fallback"><strong>${esc(row.image.jobId)}</strong><br /><span>${esc(titleCase(row.image.visualMode))}</span></td>
      <td data-label="Image class" class="qa-code">${esc(row.imageClass)}</td>
      <td data-label="Pathway"><span class="pill ${esc(row.pathway.key)}">${esc(row.pathway.label)}</span><br />${esc(row.pathway.price)}</td>
      <td data-label="Finality"><strong>Provisional</strong><br />Exact render missing</td>
      <td data-label="Binding">${esc(titleCase(row.bindingState.state))}</td>
    </tr>`;
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
        const show =
          (!needle || row.dataset.search.includes(needle)) &&
          (!pathway.value || row.dataset.pathway === pathway.value) &&
          (!visual.value || row.dataset.visual === visual.value);
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
    return `
      <div class="wire-shell">
        <section class="wire-title"><div class="wire-label"><span>Structural map</span><span>Desktop and mobile reflow</span></div><h1>Xenios Health information architecture</h1><p>Low-fidelity hierarchy for founder review. Boxes indicate function, not final visual styling.</p></section>
        <section class="wire-section" id="wire-home"><div class="wire-label"><span>01 / Global navigation + home</span><span>Entry and orientation</span></div><div class="wire-grid"><div class="wire-box dark wire-span-8 wire-xl">Hero: positioning, Research / Care choice, primary actions</div><div class="wire-box wire-span-4 wire-xl">Abstract visual / no product claim</div><div class="wire-box white wire-span-3">426 source</div><div class="wire-box white wire-span-3">424 canonical</div><div class="wire-box white wire-span-3">423 customer</div><div class="wire-box white wire-span-3">0 public images</div><div class="wire-box white wire-span-12">Featured shelf: canonical card identities</div></div></section>
        <section class="wire-section" id="wire-catalog"><div class="wire-label"><span>02 / Catalog</span><span>Discovery</span></div><div class="wire-grid"><div class="wire-box white wire-span-12">Search + category + pathway filters + result count</div>${Array.from({ length: 8 }, (_, index) => `<div class="wire-box wire-span-3 wire-tall">Product card ${index + 1}: visual / exact name / spec / price state / pathway / CTA</div>`).join("")}<div class="wire-box white wire-span-12">Pagination or continuous review</div></div></section>
        <section class="wire-section" id="wire-detail"><div class="wire-label"><span>03 / Product detail</span><span>Identity continuity</span></div><div class="wire-grid"><div class="wire-box wire-span-6 wire-xl">Same canonical image identity as product card</div><div class="wire-box white wire-span-6 wire-xl">Name / form and strength / price state / pathway / CTA / support / disclosures</div></div></section>
        <section class="wire-section" id="wire-care"><div class="wire-label"><span>04 / Care + request / quote</span><span>Distinct pathways</span></div><div class="wire-grid"><div class="wire-box dark wire-span-4 wire-tall">Care: provider review and eligibility</div><div class="wire-box white wire-span-4 wire-tall">Research request: identity and authority handoff</div><div class="wire-box wire-span-4 wire-tall">Quote-only: no price or cart implied</div><div class="wire-box white wire-span-12">Held state: visible reason and truthful next step</div></div></section>
        <section class="wire-section" id="wire-account"><div class="wire-label"><span>05 / Status + account + support</span><span>After the request</span></div><div class="wire-grid"><div class="wire-box white wire-span-4 wire-tall">Order / request progress timeline</div><div class="wire-box white wire-span-4 wire-tall">Account and order history</div><div class="wire-box white wire-span-4 wire-tall">Help, recovery, and support</div></div></section>
        <section class="wire-section"><div class="wire-label"><span>06 / Internal visual QA</span><span>All 423 targets</span></div><div class="wire-grid"><div class="wire-box wire-span-12 wire-tall">Dense grid: ID / name / visual / class / status / pathway / finality</div><div class="wire-box white wire-span-6">Batch 0 contact sheet</div><div class="wire-box white wire-span-6">Batch 1 candidate ledger</div></div></section>
      </div>`;
  }

  const renderers = {
    home: renderHome,
    products: renderProducts,
    featured: renderFeatured,
    detail: renderDetail,
    care: renderCare,
    journeys: renderJourneys,
    coming: renderComingSoon,
    review: renderReview,
    wireframe: renderWireframe,
  };
  const render = renderers[view] || renderHome;
  app.innerHTML = render();
  if (view === "products") activateCatalogFilters();
  if (view === "review") activateReviewFilters();
  document.documentElement.dataset.previewReady = "true";
  window.__XENIOS_PREVIEW_READY__ = {
    view,
    customerTargets: data.rows.length,
    renderedCards: document.querySelectorAll(".product-card").length,
    reviewRows: document.querySelectorAll("#qa-body tr").length,
  };
})();
