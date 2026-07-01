// gem-layer-stack.js — dynamic z-index for Gemma panels, drawers, and modals
(function () {
  try {
    if (window.__gemLayerStackInstalled) return;
    window.__gemLayerStackInstalled = true;

    var GEM_LAYER_MAX = 2147483000;

    var GEM_LAYER_TIER_FLOOR = {
      settings: 9000,
      drawerBackdrop: 99000,
      drawer: 99100,
      modal: 100000,
      toast: 200000
    };

    var GEM_LAYER_SCAN_SELECTORS = [
      "#gem-settings-panel",
      "#gem-notes-panel",
      "#gem-notes-backdrop",
      ".gem-recent-campaigns-panel",
      ".gem-recent-campaigns-backdrop",
      "#gem-keyboard-shortcuts-modal",
      "#gem-welcome-modal",
      "#gem-compare-modal",
      "[data-gem-layer-z]"
    ];

    function gemLayerParseZIndex(value) {
      var n = parseInt(String(value || ""), 10);
      return Number.isFinite(n) ? n : 0;
    }

    function gemLayerIsParticipating(el) {
      if (!el || !el.isConnected) return false;

      var id = el.id || "";
      var cls = el.classList;

      if (id === "gem-settings-panel") {
        var right = el.style && el.style.right;
        return right === "0" || right === "0px";
      }

      if (id === "gem-notes-panel" || id === "gem-notes-backdrop") {
        return el.dataset && el.dataset.gemPanelOpen === "1";
      }

      if (cls && cls.contains("gem-recent-campaigns-panel")) {
        return cls.contains("gem-recent-campaigns-panel--open");
      }

      if (cls && cls.contains("gem-recent-campaigns-backdrop")) {
        return cls.contains("gem-recent-campaigns-backdrop--open");
      }

      if (el.dataset && el.dataset.gemLayerRaised === "1") return true;
      if (id === "gem-keyboard-shortcuts-modal" || id === "gem-welcome-modal" || id === "gem-compare-modal") return true;

      try {
        var cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        if (parseFloat(cs.opacity) === 0) {
          if (cls && cls.contains("gem-recent-campaigns-backdrop")) return false;
          if (id === "gem-notes-backdrop") return false;
        }
        return cs.position === "fixed" || cs.position === "absolute" || cs.position === "sticky";
      } catch (_) {
        return false;
      }
    }

    function gemLayerScanMaxZIndex(excludeEl) {
      var max = 0;
      var root = document;

      GEM_LAYER_SCAN_SELECTORS.forEach(function (selector) {
        try {
          root.querySelectorAll(selector).forEach(function (el) {
            if (el === excludeEl || !gemLayerIsParticipating(el)) return;
            var fromData = el.dataset && el.dataset.gemLayerZ;
            var z = fromData ? gemLayerParseZIndex(fromData) : 0;
            if (!z) {
              try {
                z = gemLayerParseZIndex(window.getComputedStyle(el).zIndex);
              } catch (_) {}
            }
            if (!z && el.style && el.style.zIndex) {
              z = gemLayerParseZIndex(el.style.zIndex);
            }
            if (z > max) max = z;
          });
        } catch (_) {}
      });

      return max;
    }

    function gemLayerRaise(el, options) {
      if (!el) return 0;
      var opts = options && typeof options === "object" ? options : {};
      var tier = opts.tier || "modal";
      var floor = GEM_LAYER_TIER_FLOOR[tier] || GEM_LAYER_TIER_FLOOR.modal;
      var currentMax = gemLayerScanMaxZIndex(el);
      var z = Math.min(GEM_LAYER_MAX, Math.max(floor, currentMax + 1));

      el.style.zIndex = String(z);
      if (el.dataset) {
        el.dataset.gemLayerRaised = "1";
        el.dataset.gemLayerZ = String(z);
        el.dataset.gemLayerTier = tier;
      }
      return z;
    }

    function gemLayerRelease(el) {
      if (!el || !el.dataset) return;
      delete el.dataset.gemLayerRaised;
      delete el.dataset.gemLayerZ;
      delete el.dataset.gemLayerTier;
    }

    var gemLayerEscapeUnsubs = [];

    function gemLayerBindEscape(onEscape, options) {
      var opts = options && typeof options === "object" ? options : {};
      var whileConnected = opts.whileConnected;
      var handler = function (e) {
        if (e.key !== "Escape" && e.code !== "Escape") return;
        if (typeof whileConnected === "function" && !whileConnected()) return;
        if (typeof onEscape !== "function") return;
        onEscape(e);
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }
      };

      document.addEventListener("keydown", handler, true);
      window.addEventListener("keydown", handler, true);

      function injectIntoIframe(iframe) {
        try {
          if (typeof window.gemIsGemStrippedEmbedIframe === 'function' && window.gemIsGemStrippedEmbedIframe(iframe)) return;
          var iframeDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
          if (!iframeDoc || iframeDoc._gemLayerEscapeHandler) return;
          iframeDoc.addEventListener("keydown", handler, true);
          iframeDoc._gemLayerEscapeHandler = handler;
        } catch (_) {}
      }

      try {
        document.querySelectorAll("iframe").forEach(injectIntoIframe);
      } catch (_) {}

      var unsub = function () {
        document.removeEventListener("keydown", handler, true);
        window.removeEventListener("keydown", handler, true);
        try {
          document.querySelectorAll("iframe").forEach(function (iframe) {
            try {
              var iframeDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
              if (iframeDoc && iframeDoc._gemLayerEscapeHandler === handler) {
                iframeDoc.removeEventListener("keydown", handler, true);
                delete iframeDoc._gemLayerEscapeHandler;
              }
            } catch (_) {}
          });
        } catch (_) {}
      };

      gemLayerEscapeUnsubs.push(unsub);
      return unsub;
    }

    window.gemLayerRaise = gemLayerRaise;
    window.gemLayerRelease = gemLayerRelease;
    window.gemLayerScanMaxZIndex = gemLayerScanMaxZIndex;
    window.gemLayerBindEscape = gemLayerBindEscape;
  } catch (_) {}
})();
