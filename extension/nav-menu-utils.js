console.log("[gem] nav-menu-utils.js loaded");

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
   * @param {{ id: string, text: string, icon: string, iconFallbacks?: string[], onActivate: Function, className?: string, logoUrl?: string }} opts
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

    if (opts.logoUrl) {
      scheduleUi5LogoPatch(item, opts.logoUrl);
    }

    return item;
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
        const iconEl =
          root.querySelector("ui5-icon") ||
          root.querySelector(".ui5-sn-item-icon") ||
          root.querySelector("[class*='icon']");
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
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeUi5Collapsed);
  } else {
    observeUi5Collapsed();
  }
})();
