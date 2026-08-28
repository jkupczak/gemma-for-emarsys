console.log("[Gem] nav-menu-utils.js loaded");

/**
 * Dual-menu helpers for Emarsys main navigation.
 * Legacy: e-navigation / ul.e-navigation__menu_list
 * New:    e-side-navigation / ui5-side-navigation-ds-nav
 */
(function () {
  const LEGACY_NAV_SELECTOR = "ul.e-navigation__menu_list";
  const UI5_HOST_SELECTOR = "e-side-navigation";
  const UI5_ROOT_SELECTOR = "ui5-side-navigation-ds-nav";
  const UI5_ITEM_TAG = "ui5-side-navigation-item-ds-nav";

  function getNavFlavor(root = document) {
    try {
      if (root.querySelector(UI5_ROOT_SELECTOR) || root.querySelector(UI5_HOST_SELECTOR)) {
        return "ui5";
      }
      if (root.querySelector(LEGACY_NAV_SELECTOR) || root.querySelector("e-navigation")) {
        return "legacy";
      }
    } catch (_) {}
    return null;
  }

  function getLegacyNavLists(root = document) {
    try {
      return Array.from(root.querySelectorAll(LEGACY_NAV_SELECTOR));
    } catch (_) {
      return [];
    }
  }

  function getUi5NavRoots(root = document) {
    try {
      return Array.from(root.querySelectorAll(UI5_ROOT_SELECTOR));
    } catch (_) {
      return [];
    }
  }

  /** Prefer UI5 when present; otherwise legacy lists. */
  function getNavHosts(root = document) {
    const ui5 = getUi5NavRoots(root);
    if (ui5.length) return { flavor: "ui5", hosts: ui5 };
    const legacy = getLegacyNavLists(root);
    if (legacy.length) return { flavor: "legacy", hosts: legacy };
    return { flavor: null, hosts: [] };
  }

  function syncUi5CollapsedAttrs(item, navRoot) {
    if (!item || !navRoot) return;
    try {
      const sample = navRoot.querySelector(`${UI5_ITEM_TAG}:not([id^="gem-nav-"])`);
      if (sample && sample.hasAttribute("side-nav-collapsed")) {
        item.setAttribute("side-nav-collapsed", sample.getAttribute("side-nav-collapsed") || "");
      } else if (navRoot.hasAttribute("collapsed") || navRoot.closest?.(UI5_HOST_SELECTOR)?.hasAttribute("collapsed")) {
        item.setAttribute("side-nav-collapsed", "");
      } else {
        item.removeAttribute("side-nav-collapsed");
      }
      if (!item.hasAttribute("design")) item.setAttribute("design", "Default");
      if (!item.hasAttribute("desktop")) item.setAttribute("desktop", "");
    } catch (_) {}
  }

  /** Icons already rendered by Emarsys are the only ones guaranteed to paint. */
  function collectLoadedUi5Icons(navRoot) {
    const icons = new Set();
    try {
      (navRoot || document).querySelectorAll(`${UI5_ITEM_TAG}[icon]`).forEach((el) => {
        if (el.id && String(el.id).startsWith("gem-nav-")) return;
        const icon = String(el.getAttribute("icon") || "").trim();
        if (icon) icons.add(icon);
      });
    } catch (_) {}
    return icons;
  }

  function resolveUi5Icon(preferred, navRoot, fallbacks = []) {
    const loaded = collectLoadedUi5Icons(navRoot);
    const tryList = [preferred, ...(fallbacks || []), "home", "email", "curriculum", "bookmark-2"];

    if (loaded.size) {
      for (const raw of tryList) {
        const name = String(raw || "").trim();
        if (name && loaded.has(name)) return name;
      }
      if (loaded.has("home")) return "home";
      return loaded.values().next().value;
    }

    // Nav icons not collectible yet — never pick an unregistered preferred name
    // (blank icon + misaligned collapsed hover text). Use Emarsys-menu fallbacks.
    for (const raw of fallbacks || []) {
      const name = String(raw || "").trim();
      if (name) return name;
    }
    return "home";
  }

  function applyUi5ItemProps(item, opts) {
    if (!item || !opts) return;
    try {
      if (opts.icon) {
        item.setAttribute("icon", opts.icon);
        if ("icon" in item) item.icon = opts.icon;
      }
      if (opts.text != null) {
        item.setAttribute("text", opts.text);
        if ("text" in item) item.text = opts.text;
      }
      item.setAttribute("unselectable", "");
      if ("unselectable" in item) item.unselectable = true;
      item.setAttribute("design", "Default");
      item.setAttribute("desktop", "");
      item.setAttribute("ui5-side-navigation-item", "");
    } catch (_) {}
  }

  /**
   * Build a UI5 side-nav item that opens a Gemma panel (no href).
   * Prefer cloning an Emarsys item so the design-system CE upgrades cleanly,
   * and only use icon names already loaded on the page (unregistered SAP icons
   * render blank and shift collapsed hover text).
   * @param {{ id: string, text: string, icon: string, iconFallbacks?: string[], onActivate: Function, className?: string, logoUrl?: string, svgHtml?: string }} opts
   * @param {Element} [navRoot]
   */
  function buildUi5ActionItem(opts, navRoot) {
    const icon = resolveUi5Icon(opts.icon, navRoot, opts.iconFallbacks || []);
    const sample =
      navRoot &&
      navRoot.querySelector(`${UI5_ITEM_TAG}[icon]:not([id^="gem-nav-"])`);

    let item;
    try {
      item = sample ? sample.cloneNode(false) : document.createElement(UI5_ITEM_TAG);
    } catch (_) {
      item = document.createElement(UI5_ITEM_TAG);
    }

    try {
      ["href", "selected", "expanded", "target", "id", "class"].forEach((attr) => {
        item.removeAttribute(attr);
      });
      item.className = "";
    } catch (_) {}

    item.id = opts.id;
    item.classList.add("gem-ui5-nav-item");
    if (opts.className) item.classList.add(opts.className);

    applyUi5ItemProps(item, { text: opts.text, icon });

    const activate = (event) => {
      try {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (event && typeof event.stopPropagation === "function") event.stopPropagation();
      } catch (_) {}
      if (typeof opts.onActivate === "function") opts.onActivate(event);
    };

    item.addEventListener("click", activate);
    item.addEventListener("ui5-click", activate);

    // Re-apply props after CE upgrade / connect (attribute → property sync).
    const refresh = () => applyUi5ItemProps(item, { text: opts.text, icon });
    try {
      if (window.customElements && typeof customElements.whenDefined === "function") {
        customElements.whenDefined(UI5_ITEM_TAG).then(() => {
          refresh();
          requestAnimationFrame(refresh);
        });
      }
    } catch (_) {}
    requestAnimationFrame(refresh);

    if (opts.svgHtml) {
      scheduleUi5SvgPatch(item, opts.svgHtml);
    } else if (opts.logoUrl) {
      scheduleUi5LogoPatch(item, opts.logoUrl);
    }

    return item;
  }

  const GEM_NAV_ICON_SVGS = {
    recent:
      '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M574.5-774.5Q560-789 560-810t14.5-35.5Q589-860 610-860t35.5 14.5Q660-831 660-810t-14.5 35.5Q631-760 610-760t-35.5-14.5Zm0 660Q560-129 560-150t14.5-35.5Q589-200 610-200t35.5 14.5Q660-171 660-150t-14.5 35.5Q631-100 610-100t-35.5-14.5Zm160-520Q720-649 720-670t14.5-35.5Q749-720 770-720t35.5 14.5Q820-691 820-670t-14.5 35.5Q791-620 770-620t-35.5-14.5Zm0 380Q720-269 720-290t14.5-35.5Q749-340 770-340t35.5 14.5Q820-311 820-290t-14.5 35.5Q791-240 770-240t-35.5-14.5Zm60-190Q780-459 780-480t14.5-35.5Q809-530 830-530t35.5 14.5Q880-501 880-480t-14.5 35.5Q851-430 830-430t-35.5-14.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880v80q-134 0-227 93t-93 227q0 134 93 227t227 93v80Zm132-212L440-464v-216h80v184l148 148-56 56Z"/></svg>',
    notes:
      '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="M120-240v-80h480v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z"/></svg>',
    settings:
      '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/></svg>',
  };

  function applyLegacyNavSvg(rootEl, svgHtml) {
    if (!rootEl || !svgHtml) return;
    const icon = rootEl.querySelector(".e-icon") || rootEl.querySelector(".e-icon-wrapper");
    if (!icon) return;
    icon.innerHTML = svgHtml;
    icon.classList.add("gem-nav-custom-svg");
  }

  function findNativeUi5NavIcon(root) {
    if (!root) return null;
    return (
      root.querySelector("ui5-icon-ds-nav:not(.gem-ui5-nav-svg)") ||
      root.querySelector("ui5-icon:not(.gem-ui5-nav-svg)") ||
      root.querySelector(".ui5-sn-item-icon:not(.gem-ui5-nav-svg)")
    );
  }

  function applyUi5SvgPatch(root, svgHtml) {
    const iconEl = findNativeUi5NavIcon(root);
    if (!iconEl) return false;

    let wrap = root.querySelector(".gem-ui5-nav-svg");
    if (!wrap) {
      wrap = document.createElement("span");
      wrap.className = "ui5-sn-item-icon gem-ui5-nav-svg";
      wrap.setAttribute("aria-hidden", "true");
      wrap.innerHTML = svgHtml;
      Object.assign(wrap.style, {
        width: "1.25rem",
        height: "1.25rem",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: "0",
        color: "inherit",
      });
      const svg = wrap.querySelector("svg");
      if (svg) {
        svg.setAttribute("width", "20");
        svg.setAttribute("height", "20");
        svg.style.display = "block";
        svg.style.fill = "currentColor";
      }
      const parent = iconEl.parentNode;
      if (parent) parent.insertBefore(wrap, iconEl);
    }

    try {
      iconEl.style.setProperty("display", "none", "important");
      iconEl.setAttribute("hidden", "");
      iconEl.setAttribute("aria-hidden", "true");
    } catch (_) {}

    const logo = root.querySelector("img.gem-ui5-nav-logo");
    if (logo) logo.style.display = "none";
    return !!root.querySelector(".gem-ui5-nav-svg");
  }

  function scheduleUi5SvgPatch(item, svgHtml) {
    if (!item || !svgHtml) return;
    const tryPatch = (attempt) => {
      try {
        const root = item.shadowRoot;
        if (!root) {
          if (attempt < 40) setTimeout(() => tryPatch(attempt + 1), 50);
          return;
        }
        if (!item._gemUi5SvgObserved) {
          item._gemUi5SvgObserved = true;
          try {
            const mo = new MutationObserver(() => applyUi5SvgPatch(root, svgHtml));
            mo.observe(root, { childList: true, subtree: true });
          } catch (_) {}
        }
        if (!applyUi5SvgPatch(root, svgHtml) && attempt < 40) {
          setTimeout(() => tryPatch(attempt + 1), 50);
        }
      } catch (_) {
        if (attempt < 40) setTimeout(() => tryPatch(attempt + 1), 50);
      }
    };
    tryPatch(0);
  }

  function scheduleUi5LogoPatch(item, logoUrl) {
    if (!item || !logoUrl) return;
    const tryPatch = (attempt) => {
      try {
        const root = item.shadowRoot;
        if (!root) {
          if (attempt < 40) setTimeout(() => tryPatch(attempt + 1), 50);
          return;
        }
        const iconEl = findNativeUi5NavIcon(root);
        if (!iconEl) {
          if (attempt < 40) setTimeout(() => tryPatch(attempt + 1), 50);
          return;
        }
        let img = root.querySelector("img.gem-ui5-nav-logo");
        if (!img) {
          img = document.createElement("img");
          img.className = "gem-ui5-nav-logo";
          img.alt = "";
          img.setAttribute("aria-hidden", "true");
          img.src = logoUrl;
          Object.assign(img.style, {
            width: "1rem",
            height: "1rem",
            objectFit: "contain",
            display: "block",
            flexShrink: "0",
          });
          const parent = iconEl.parentNode;
          if (parent) parent.insertBefore(img, iconEl);
        } else {
          img.src = logoUrl;
        }
        try {
          iconEl.style.display = "none";
        } catch (_) {}
      } catch (_) {
        if (attempt < 40) setTimeout(() => tryPatch(attempt + 1), 50);
      }
    };
    tryPatch(0);
  }

  function insertRelativeToSettings(host, el, settingsId) {
    if (!host || !el) return;
    if (host.querySelector(`#${el.id}`)) return;
    const settingsItem = settingsId ? host.querySelector(`#${settingsId}`) : null;
    if (settingsItem) {
      host.insertBefore(el, settingsItem);
    } else {
      host.appendChild(el);
    }
  }

  /**
   * Insert recent between notes and settings when both exist.
   */
  function insertRecentRelative(host, recentEl, notesId, settingsId) {
    if (!host || !recentEl) return;
    if (host.querySelector(`#${recentEl.id}`)) return;
    const notesItem = notesId ? host.querySelector(`#${notesId}`) : null;
    const settingsItem = settingsId ? host.querySelector(`#${settingsId}`) : null;
    if (notesItem && settingsItem && notesItem.nextSibling === settingsItem) {
      host.insertBefore(recentEl, settingsItem);
    } else if (settingsItem) {
      host.insertBefore(recentEl, settingsItem);
    } else {
      host.appendChild(recentEl);
    }
  }

  function isNavRelatedNode(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (
        node.matches?.(LEGACY_NAV_SELECTOR) ||
        node.matches?.(UI5_ROOT_SELECTOR) ||
        node.matches?.(UI5_HOST_SELECTOR) ||
        node.matches?.("e-navigation")
      ) {
        return true;
      }
      return !!(
        node.querySelector?.(LEGACY_NAV_SELECTOR) ||
        node.querySelector?.(UI5_ROOT_SELECTOR) ||
        node.querySelector?.(UI5_HOST_SELECTOR) ||
        node.querySelector?.("e-navigation")
      );
    } catch (_) {
      return false;
    }
  }

  /**
   * Collect Emarsys nav links for the command palette (legacy + UI5).
   * @returns {{ sectionTitle: string, label: string, href: string }[]}
   */
  function collectEmarsysNavLinks() {
    const out = [];

    document.querySelectorAll(`${LEGACY_NAV_SELECTOR} > li`).forEach((li) => {
      const titleEl = li.querySelector(".e-navigation__action_text");
      const sectionTitle = titleEl ? String(titleEl.textContent || "").trim() : "";
      if (!sectionTitle) return;
      li.querySelectorAll(".e-navigation__submenu a.e-navigation__submenu_action").forEach((link) => {
        const label = String(link.textContent || "").replace(/\s+/g, " ").trim();
        const href = String(link.getAttribute("href") || link.href || "").trim();
        if (!label || !href || /^javascript:/i.test(href)) return;
        out.push({ sectionTitle, label, href });
      });
    });

    const pushUi5SubLinks = (sectionTitle, parentEl) => {
      if (!sectionTitle || !parentEl) return;
      parentEl.querySelectorAll("ui5-side-navigation-sub-item-ds-nav").forEach((sub) => {
        const label = String(sub.getAttribute("text") || "").trim();
        const href = String(sub.getAttribute("href") || "").trim();
        if (!label || !href || /^javascript:/i.test(href)) return;
        out.push({ sectionTitle, label, href });
      });
    };

    document.querySelectorAll(UI5_ITEM_TAG).forEach((item) => {
      if (item.id && String(item.id).startsWith("gem-nav-")) return;
      const sectionTitle = String(item.getAttribute("text") || "").trim();
      if (!sectionTitle) return;
      const href = String(item.getAttribute("href") || "").trim();
      if (href && !/^javascript:/i.test(href) && !item.querySelector("ui5-side-navigation-sub-item-ds-nav")) {
        out.push({ sectionTitle, label: sectionTitle, href });
        return;
      }
      pushUi5SubLinks(sectionTitle, item);
    });

    document.querySelectorAll("ui5-side-navigation-group-ds-nav").forEach((group) => {
      const groupTitle = String(group.getAttribute("text") || "").trim();
      group.querySelectorAll(`:scope > ${UI5_ITEM_TAG}`).forEach((item) => {
        const itemTitle = String(item.getAttribute("text") || "").trim();
        const sectionTitle = groupTitle && itemTitle ? `${groupTitle} › ${itemTitle}` : itemTitle || groupTitle;
        pushUi5SubLinks(sectionTitle, item);
      });
    });

    return out;
  }

  function refreshUi5CollapsedOnGemmaItems() {
    getUi5NavRoots().forEach((navRoot) => {
      ["gem-nav-notes-item", "gem-nav-recent-campaigns-item", "gem-nav-settings-item"].forEach((id) => {
        const el = navRoot.querySelector(`#${id}`);
        if (el) syncUi5CollapsedAttrs(el, navRoot);
      });
    });
  }

  function observeUi5Collapsed() {
    const bind = (host) => {
      if (!host || host._gemCollapsedObserved) return;
      host._gemCollapsedObserved = true;
      try {
        const mo = new MutationObserver(() => refreshUi5CollapsedOnGemmaItems());
        mo.observe(host, { attributes: true, attributeFilter: ["collapsed"] });
        const inner = host.querySelector(UI5_ROOT_SELECTOR);
        if (inner) mo.observe(inner, { attributes: true, attributeFilter: ["collapsed"] });
      } catch (_) {}
    };
    document.querySelectorAll(UI5_HOST_SELECTOR).forEach(bind);
    if (typeof window.gemDomWatchSubscribe === "function") {
      window.gemDomWatchSubscribe((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches?.(UI5_HOST_SELECTOR)) bind(node);
            else if (node.querySelectorAll) node.querySelectorAll(UI5_HOST_SELECTOR).forEach(bind);
          }
        }
      });
    }
  }

  window.gemNavMenu = {
    LEGACY_NAV_SELECTOR,
    UI5_HOST_SELECTOR,
    UI5_ROOT_SELECTOR,
    UI5_ITEM_TAG,
    getNavFlavor,
    getLegacyNavLists,
    getUi5NavRoots,
    getNavHosts,
    syncUi5CollapsedAttrs,
    buildUi5ActionItem,
    resolveUi5Icon,
    collectLoadedUi5Icons,
    insertRelativeToSettings,
    insertRecentRelative,
    isNavRelatedNode,
    collectEmarsysNavLinks,
    refreshUi5CollapsedOnGemmaItems,
    observeUi5Collapsed,
    GEM_NAV_ICON_SVGS,
    applyLegacyNavSvg,
    scheduleUi5SvgPatch,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeUi5Collapsed);
  } else {
    observeUi5Collapsed();
  }
})();
