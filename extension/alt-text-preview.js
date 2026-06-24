console.log("[Gem] alt-text-preview.js loaded");

(function () {
  "use strict";

  const IFRAME_SELECTOR = "iframe.e-contentblocks-preview__iframe-desktop";
  const BUTTON_GROUP_SELECTOR = "cb-campaign-preview .e-buttongroup";
  const ANCHOR_SELECTOR = "cb-highlight-editables-switch";
  const OVERLAY_CONTAINER_ID = "gem-alt-text-overlay-container";
  const STORAGE_OVERLAY_ACTIVE_KEY = "gemAltTextPreviewOverlayActive";

  let isActive = false;
  let settingEnabled = true;
  let settingVisibility = "always-show";
  let overlayContainer = null;
  let iframeMutationObserver = null;
  let lifecycleUnsub = null;
  let currentIframe = null;
  let debounceTimer = null;
  let hoverHandler = null;
  let hoverLeaveHandler = null;
  let hoveredImgId = null;
  let buttonEl = null;

  function debounce(fn, delay = 150) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, delay);
  }

  // ── Settings ─────────────────────────────────────────

  function loadSettings(callback) {
    chrome.storage.sync.get({
      gemAltTextPreviewEnabled: true,
      gemAltTextVisibility: "always-show",
      [STORAGE_OVERLAY_ACTIVE_KEY]: true
    }, (result) => {
      settingEnabled = result.gemAltTextPreviewEnabled !== false;
      settingVisibility = result.gemAltTextVisibility || "always-show";
      const overlayActive = result[STORAGE_OVERLAY_ACTIVE_KEY] !== false;
      isActive = settingEnabled && overlayActive;
      if (callback) callback();
    });
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "sync") return;

    if (changes.gemAltTextPreviewEnabled) {
      settingEnabled = changes.gemAltTextPreviewEnabled.newValue !== false;
      if (settingEnabled) {
        chrome.storage.sync.get({ [STORAGE_OVERLAY_ACTIVE_KEY]: true }, (r) => {
          const overlayOn = r[STORAGE_OVERLAY_ACTIVE_KEY] !== false;
          isActive = overlayOn;
          if (buttonEl) buttonEl.classList.toggle("e-btn-active", isActive);
          if (isActive) enable();
          else disable();
        });
      } else {
        if (isActive) disable();
        isActive = false;
        if (buttonEl) buttonEl.classList.remove("e-btn-active");
      }
    }

    if (changes[STORAGE_OVERLAY_ACTIVE_KEY] && settingEnabled) {
      isActive = changes[STORAGE_OVERLAY_ACTIVE_KEY].newValue !== false;
      if (buttonEl) buttonEl.classList.toggle("e-btn-active", isActive);
      if (isActive) enable();
      else disable();
      if (typeof window.gemSyncCompactEmailToolsFeatureMenuItems === 'function') {
        window.gemSyncCompactEmailToolsFeatureMenuItems();
      }
    }

    if (changes.gemAltTextVisibility) {
      settingVisibility = changes.gemAltTextVisibility.newValue || "always-show";
    }

    if (changes.gemAltTextVisibility && isActive && settingEnabled && currentIframe) {
      renderOverlays(currentIframe);
    }
  });

  // ── Button injection ──────────────────────────────────

  function injectButton() {
    if (document.getElementById("altTextPreviewButton")) return;

    const anchor = document.querySelector(ANCHOR_SELECTOR);
    if (!anchor) return;

    const buttonGroup = anchor.closest(".e-buttongroup");
    if (!buttonGroup) return;

    const wrapper = document.createElement("e-tooltip");
    wrapper.setAttribute("placement", "bottom");
    wrapper.setAttribute("content", "ALT Text Preview");
    wrapper.innerHTML =
      '<button id="altTextPreviewButton" type="button" class="e-btn e-btn-onlyicon e-svgclickfix" aria-description="" aria-label="ALT Text Preview">' +
        '<e-icon icon="image"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon"></div></div></e-icon>' +
      "</button>";

    anchor.insertAdjacentElement("afterend", wrapper);

    buttonEl = wrapper.querySelector("#altTextPreviewButton");
    buttonEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    if (settingEnabled && isActive) {
      buttonEl.classList.add("e-btn-active");
    }

    console.log("[Gem] ALT Text Preview button injected");
  }

  function waitForButtonGroup() {
    if (document.querySelector(BUTTON_GROUP_SELECTOR) && document.querySelector(ANCHOR_SELECTOR)) {
      injectButton();
      return;
    }

    window.gemDomWatchWaitFor(BUTTON_GROUP_SELECTOR, function () {
      if (document.querySelector(ANCHOR_SELECTOR)) injectButton();
    });
  }

  // ── Toggle ────────────────────────────────────────────

  function toggle() {
    if (!settingEnabled) {
      try {
        chrome.storage.sync.set({ gemAltTextPreviewEnabled: true });
      } catch (_) {}
      return;
    }

    isActive = !isActive;

    if (buttonEl) {
      buttonEl.classList.toggle("e-btn-active", isActive);
    }

    if (isActive) {
      enable();
    } else {
      disable();
    }

    try {
      chrome.storage.sync.set({ [STORAGE_OVERLAY_ACTIVE_KEY]: isActive });
    } catch (_) {}

    if (typeof window.gemSyncCompactEmailToolsFeatureMenuItems === 'function') {
      window.gemSyncCompactEmailToolsFeatureMenuItems();
    }
  }

  function enable() {
    watchIframeLifecycle();
    waitForIframeReady(bindToIframe);
  }

  function disable() {
    if (lifecycleUnsub) {
      lifecycleUnsub();
      lifecycleUnsub = null;
    }
    if (iframeMutationObserver) {
      iframeMutationObserver.disconnect();
      iframeMutationObserver = null;
    }
    removeHoverListeners();
    clearOverlays();
    hoveredImgId = null;
    currentIframe = null;
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // ── Iframe readiness ──────────────────────────────────

  function waitForIframeReady(callback) {
    function tryReady() {
      const iframe = document.querySelector(IFRAME_SELECTOR);
      if (!iframe) return false;
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return false;
      callback(iframe);
      return true;
    }

    if (tryReady()) return;

    window.gemDomWatchWaitFor(IFRAME_SELECTOR, function () {
      tryReady();
    });
  }

  // ── Overlay container ─────────────────────────────────

  function ensureOverlayContainer(doc) {
    if (overlayContainer && overlayContainer.ownerDocument === doc && overlayContainer.isConnected) {
      return overlayContainer;
    }

    overlayContainer = doc.createElement("div");
    overlayContainer.id = OVERLAY_CONTAINER_ID;
    Object.assign(overlayContainer.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "999999",
    });

    doc.body.appendChild(overlayContainer);
    return overlayContainer;
  }

  function clearOverlays() {
    if (overlayContainer) {
      overlayContainer.remove();
      overlayContainer = null;
    }
  }

  // ── Hover support ─────────────────────────────────────

  function attachHoverListeners(iframe) {
    detachHoverHandlers();

    const doc = iframe.contentDocument;
    if (!doc) return;

    const onMouseMove = (e) => {
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      let foundImgId = null;
      const images = doc.querySelectorAll("img");
      for (const img of images) {
        const rect = img.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 &&
            mouseX >= rect.left && mouseX <= rect.right &&
            mouseY >= rect.top && mouseY <= rect.bottom) {
          foundImgId = getImgId(img);
          break;
        }
      }

      if (foundImgId === hoveredImgId) return;

      if (hoveredImgId && overlayContainer) {
        const prev = overlayContainer.querySelector('[data-gem-img-id="' + hoveredImgId + '"]');
        if (prev) prev.style.opacity = "0";
      }

      hoveredImgId = foundImgId;

      if (hoveredImgId && overlayContainer) {
        const next = overlayContainer.querySelector('[data-gem-img-id="' + hoveredImgId + '"]');
        if (next) next.style.opacity = "1";
      }
    };

    const onMouseLeave = () => {
      if (hoveredImgId && overlayContainer) {
        const prev = overlayContainer.querySelector('[data-gem-img-id="' + hoveredImgId + '"]');
        if (prev) prev.style.opacity = "0";
      }
      hoveredImgId = null;
    };

    doc.addEventListener("mousemove", onMouseMove);
    doc.addEventListener("mouseleave", onMouseLeave);

    hoverHandler = onMouseMove;
    hoverLeaveHandler = onMouseLeave;
  }

  function detachHoverHandlers() {
    if (hoverHandler && currentIframe) {
      try {
        const doc = currentIframe.contentDocument;
        if (doc) {
          doc.removeEventListener("mousemove", hoverHandler);
          doc.removeEventListener("mouseleave", hoverLeaveHandler);
        }
      } catch (_) {}
    }
    hoverHandler = null;
    hoverLeaveHandler = null;
  }

  function removeHoverListeners() {
    detachHoverHandlers();
    hoveredImgId = null;
  }

  function getImgId(img) {
    if (!img._gemAltId) {
      img._gemAltId = "gem-alt-" + Math.random().toString(36).slice(2, 10);
    }
    return img._gemAltId;
  }

  // ── Render overlays on images ─────────────────────────

  function renderOverlays(iframe) {
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;

    const win = doc.defaultView || iframe.contentWindow;
    if (!win) return;

    const container = ensureOverlayContainer(doc);
    container.innerHTML = "";

    const isHoverMode = settingVisibility === "show-on-hover";

    if (isHoverMode) {
      attachHoverListeners(iframe);
    } else {
      removeHoverListeners();
    }

    const scrollX = win.scrollX || 0;
    const scrollY = win.scrollY || 0;

    const images = doc.querySelectorAll("img");

    images.forEach((img) => {
      const alt = (img.getAttribute("alt") || "").trim();
      const rect = img.getBoundingClientRect();

      if (!rect.width || !rect.height) return;

      const imgId = getImgId(img);
      const isHovered = isHoverMode && hoveredImgId === imgId;

      const overlay = doc.createElement("div");
      overlay.className = "gem-alt-text-overlay";
      overlay.setAttribute("data-gem-img-id", imgId);
      Object.assign(overlay.style, {
        position: "absolute",
        left: (rect.left + scrollX) + "px",
        top: (rect.top + scrollY) + "px",
        width: rect.width + "px",
        height: rect.height + "px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        overflow: "hidden",
        boxSizing: "border-box",
        padding: "0px",
        background: alt ? "rgba(0, 0, 0, 0.55)" : "rgba(180, 30, 30, 0.45)",
        border: alt ? "2px solid rgba(255, 255, 255, 0.3)" : "2px dashed rgba(255, 80, 80, 0.6)",
        transition: "opacity 0.15s ease",
        opacity: isHoverMode ? (isHovered ? "1" : "0") : "1",
      });

      const label = doc.createElement("span");
      Object.assign(label.style, {
        color: "#fff",
        fontSize: "12px",
        lineHeight: "1.3",
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
        wordBreak: "break-word",
        textShadow: "0 1px 3px rgba(0,0,0,0.8)",
        maxHeight: "100%",
        overflow: "hidden",
      });
      label.textContent = alt || "(no alt text)";
      if (!alt) label.style.fontStyle = "italic";

      overlay.appendChild(label);
      container.appendChild(overlay);
    });
  }

  function isGemElement(el) {
    if (el.id && el.id.startsWith("gem-")) return true;
    if (el.classList) {
      for (const cls of el.classList) {
        if (cls.startsWith("gem-")) return true;
      }
    }
    return false;
  }

  function isInsideGemOverlay(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el) {
      if (el.id && el.id.startsWith("gem-")) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ── Bind to iframe ────────────────────────────────────

  function bindToIframe(iframe) {
    currentIframe = iframe;

    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;

    debounce(() => renderOverlays(iframe));

    if (iframeMutationObserver) {
      iframeMutationObserver.disconnect();
      iframeMutationObserver = null;
    }

    iframeMutationObserver = new MutationObserver((mutations) => {
      if (iframe !== currentIframe) return;

      let onlyOverlayChanges = true;
      for (const m of mutations) {
        if (isInsideGemOverlay(m.target)) continue;

        const hasNonGemNode = (nodes) =>
          Array.from(nodes).some((n) => n.nodeType === 1 && !isGemElement(n));

        if (
          hasNonGemNode(m.addedNodes) ||
          hasNonGemNode(m.removedNodes) ||
          m.type === "characterData" ||
          m.type === "attributes"
        ) {
          onlyOverlayChanges = false;
          break;
        }
      }

      if (onlyOverlayChanges) return;

      debounce(() => renderOverlays(iframe));
    });

    iframeMutationObserver.observe(doc.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  }

  // ── Iframe lifecycle watcher ──────────────────────────

  function watchIframeLifecycle() {
    if (lifecycleUnsub) {
      lifecycleUnsub();
      lifecycleUnsub = null;
    }

    lifecycleUnsub = window.gemDomWatchSubscribe(function () {
      if (!isActive) return;

      const iframe = document.querySelector(IFRAME_SELECTOR);

      if (!iframe && currentIframe) {
        currentIframe = null;
        clearOverlays();
        if (iframeMutationObserver) {
          iframeMutationObserver.disconnect();
          iframeMutationObserver = null;
        }
        removeHoverListeners();
      }

      if (iframe && iframe !== currentIframe) {
        waitForIframeReady(bindToIframe);
      }
    });
  }

  // ── Init ──────────────────────────────────────────────

  loadSettings(() => {
    if (isActive) {
      enable();
    }
    waitForButtonGroup();
  });

  window.gemToggleAltTextPreview = function gemToggleAltTextPreview() {
    toggle();
    return isActive;
  };

  window.gemIsAltTextPreviewActive = function gemIsAltTextPreviewActive() {
    return !!(settingEnabled && isActive);
  };
})();
