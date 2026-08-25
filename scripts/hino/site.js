(() => {
  "use strict";

  const header = document.querySelector(".site-header");
  const menu = document.querySelector("#mobile-menu");
  const toggle = document.querySelector(".menu-toggle");
  const closeButton = document.querySelector(".mobile-menu__close");

  function menuItems() {
    return menu
      ? [...menu.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      : [];
  }

  function setMenu(open, restoreFocus = false) {
    if (!header || !menu || !toggle) return;
    header.dataset.open = open ? "true" : "false";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Close" : "Menu";
    toggle.tabIndex = open ? -1 : 0;
    menu.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";

    const items = menuItems();
    for (const item of items) item.tabIndex = open ? 0 : -1;
    if (open) window.requestAnimationFrame(() => items[0]?.focus());
    if (!open && restoreFocus) window.requestAnimationFrame(() => toggle.focus());
  }

  if (header) {
    const updateScrolled = () => {
      header.dataset.scrolled = window.scrollY > 24 ? "true" : "false";
    };
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
  }

  toggle?.addEventListener("click", () => setMenu(header?.dataset.open !== "true"));
  closeButton?.addEventListener("click", () => setMenu(false, true));
  menu?.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("keydown", (event) => {
    if (header?.dataset.open !== "true") return;
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu(false, true);
      return;
    }
    if (event.key !== "Tab") return;
    const items = menuItems();
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const catalog = document.querySelector(".catalog-browser");
  if (catalog) {
    const search = catalog.querySelector('input[type="search"]');
    const family = catalog.querySelector("select");
    const count = catalog.querySelector(".catalog-result-count");
    const list = catalog.querySelector(".catalog-list");
    const items = [...catalog.querySelectorAll(".catalog-list > li")];
    const empty = document.createElement("p");
    empty.className = "catalog-empty";
    empty.setAttribute("role", "status");
    empty.textContent = "No catalog entry matches those filters.";

    const filter = () => {
      const query = search?.value.trim().toLowerCase() ?? "";
      const selectedFamily = family?.value ?? "All research items";
      let visible = 0;

      for (const item of items) {
        const itemFamily = item.querySelector(".catalog-item__format span")?.textContent?.trim() ?? "";
        const searchable = item.textContent?.toLowerCase() ?? "";
        const matches =
          (selectedFamily === "All research items" || selectedFamily === itemFamily) &&
          (!query || searchable.includes(query));
        item.hidden = !matches;
        if (matches) visible += 1;
      }

      if (count) count.textContent = `Showing ${visible} of ${items.length} entries`;
      empty.remove();
      if (visible === 0) list?.insertAdjacentElement("afterend", empty);
    };

    search?.addEventListener("input", filter);
    family?.addEventListener("change", filter);
  }

  const videoIds = ["9iGir_DXeMU", "PHMouuOEst8", "3t_sry94H_s"];
  document.querySelectorAll(".video-consent").forEach((button, index) => {
    button.addEventListener("click", () => {
      const id = videoIds[index];
      if (!id) return;
      const iframe = document.createElement("iframe");
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}`;
      iframe.tabIndex = 0;
      iframe.title = button.getAttribute("aria-label")?.replace("Load embedded video: ", "") ?? "Video";
      button.replaceWith(iframe);
      window.requestAnimationFrame(() => iframe.focus());
    });
  });

  const form = document.querySelector(".contact-form");
  if (form) {
    const reason = form.querySelector('select[name="reason"]');
    const grid = form.querySelector(".contact-form__grid");
    const contextPrompts = {
      Training: ["Training goal or format", "Private session, group experience, event, or another format"],
      Speaking: ["Event or audience", "Organization, audience, event date, and location"],
      Media: ["Outlet and request", "Publication, format, topic, deadline, and requested materials"],
      "Brand partnerships": ["Organization and brief", "Brand, campaign idea, timing, and expected role"],
      "The Hino Collective": ["Collective context", "Your role, organization, and what you want to understand"],
      "The Reset Retreat": ["Retreat question", "What would help before you use the official ITA wait list?"],
      Merchandise: ["Merchandise question", "Item or order context; final support stays with the canonical store"],
      "Xenios Research support": [
        "Research support context",
        "Organization and nonclinical research question; do not include medical information",
      ],
    };

    function clearStatus() {
      form.querySelector(".form-status")?.remove();
    }

    function updateContext() {
      form.querySelector('[data-contact-context="true"]')?.remove();
      const prompt = contextPrompts[reason?.value];
      if (!prompt || !grid) return;
      const label = document.createElement("label");
      label.className = "contact-form__wide";
      label.dataset.contactContext = "true";
      const span = document.createElement("span");
      span.textContent = prompt[0];
      const input = document.createElement("input");
      input.name = "context";
      input.placeholder = prompt[1];
      input.required = true;
      label.append(span, input);
      grid.append(label);
    }

    const params = new URLSearchParams(window.location.search);
    const pathReasons = {
      training: "Training",
      speaking: "Speaking",
      media: "Media",
      partnerships: "Brand partnerships",
      collective: "The Hino Collective",
      retreat: "The Reset Retreat",
      merchandise: "Merchandise",
      research: "Xenios Research support",
      general: "General inquiry",
    };
    const initialReason = params.get("reason") ?? pathReasons[params.get("path") ?? ""];
    if (reason && initialReason && [...reason.options].some((option) => option.value === initialReason)) {
      reason.value = initialReason;
    }
    updateContext();
    reason?.addEventListener("change", () => {
      clearStatus();
      updateContext();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      clearStatus();
      const status = document.createElement("div");
      status.className = "form-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.textContent =
        "Inquiry reviewed locally. Submission routing is intentionally disabled until an operational destination and privacy language are approved.";
      form.append(status);
    });

    if (window.location.hash === "#inquiry") {
      window.requestAnimationFrame(() => document.querySelector("#inquiry")?.focus());
    }
  }
})();
