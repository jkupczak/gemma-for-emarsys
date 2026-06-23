(function () {
  console.log("[Gem][CustomPaste] TinyMCE 4 dynamic paste patch starting...");

  // Live config updated by custom-paste-loader.js
  let config = Object.assign({
    enabled: true,
    allowBold: true,
    allowItalic: true,
    allowStrikethrough: true,
    allowUnderline: true,
    allowSuperscript: true,
    allowAnchor: true
  }, (window.GEM_CUSTOM_PASTE_CONFIG || {}));

  // Receive live config updates from the content-script loader (cross-world safe).
  window.addEventListener('gem-custom-paste-config', (e) => {
    try {
      const next = e && e.detail ? e.detail : {};
      config = Object.assign({}, config, next);
      rebuildAllPatches();
    } catch (_) {}
  });

  // Track active patches by editor id
  const activePatches = new Map();
  let domObserver = null;

  function destroyAllPatches() {
    try {
      for (const [, patch] of activePatches.entries()) {
        try { patch && patch.destroy && patch.destroy(); } catch (_) {}
      }
      activePatches.clear();
    } catch (_) {}
  }

  function rebuildAllPatches() {
    // For simplicity/reliability: tear down and re-attach based on current config.
    destroyAllPatches();
    if (!config.enabled) return;
    syncEditors();
  }

  // Expose a small controller for debugging / loader integration
  window.gemCustomPasteController = {
    destroyAllPatches,
    rebuildAllPatches
  };

  // Back-compat / debugging helper (works only in page context)
  window.gemCustomPasteUpdateConfig = function gemCustomPasteUpdateConfig(next) {
    config = Object.assign({}, config, (next || {}));
    rebuildAllPatches();
  };

  function trimClipboardContentEdges(html) {
    // Trim leading/trailing whitespace, invisible characters, and linebreaks
    // BEFORE any other modification/sanitization.
    try {
      let s = String(html ?? '');
      // Remove common invisible edge characters (incl. zero-width, BOM) and whitespace
      const edge = /^[\s\u00A0\u1680\u2000-\u200A\u200B\u200C\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\s\u00A0\u1680\u2000-\u200A\u200B\u200C\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF]+$/g;
      s = s.replace(edge, '');
      if (!s) return '';

      // Also trim leading/trailing empty HTML nodes like <br> or <p><br></p>
      const container = document.createElement('div');
      container.innerHTML = s;

      const invisible = /[\s\u00A0\u1680\u2000-\u200A\u200B\u200C\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF]/g;
      const isEffectivelyEmptyText = (t) => !String(t || '').replace(invisible, '');
      const elementIsEmpty = (el) => {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        // Never treat ESL token spans as empty
        if (el.matches && el.matches('span[e-token]')) return false;
        const txt = el.textContent || '';
        if (!isEffectivelyEmptyText(txt)) return false;
        // If it contains any non-whitespace elements besides BR, keep it
        const meaningful = el.querySelector && el.querySelector('img,svg,video,iframe,object,embed,span[e-token]');
        if (meaningful) return false;
        // If it only contains BRs/whitespace, it's empty
        const els = el.querySelectorAll ? Array.from(el.querySelectorAll('*')) : [];
        const nonBr = els.find((n) => n.tagName && n.tagName.toUpperCase() !== 'BR');
        return !nonBr;
      };

      const isTokenSpan = (el) => !!(el && el.matches && el.matches('span[e-token]'));
      const isWrapperTag = (tag) => tag === 'P' || tag === 'DIV' || tag === 'SPAN';

      // Deep trim: removes edge whitespace/<br> even if nested inside wrapper elements.
      const trimSideDeep = (rootEl, fromStart) => {
        while (true) {
          const node = fromStart ? rootEl.firstChild : rootEl.lastChild;
          if (!node) break;

          if (node.nodeType === Node.COMMENT_NODE) {
            node.remove();
            continue;
          }

          if (node.nodeType === Node.TEXT_NODE) {
            if (isEffectivelyEmptyText(node.textContent)) {
              node.remove();
              continue;
            }
            break;
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName ? node.tagName.toUpperCase() : '';

            // Direct <br> at the edge
            if (tag === 'BR') {
              node.remove();
              continue;
            }

            // Never recurse into token spans; treat them as content.
            if (!isTokenSpan(node)) {
              // Recurse into wrappers to remove nested trailing/leading <br> and whitespace.
              if (isWrapperTag(tag)) {
                trimSideDeep(node, fromStart);
              }
            }

            // If the edge node is now an empty wrapper, remove it and continue trimming.
            if (!isTokenSpan(node) && isWrapperTag(tag) && elementIsEmpty(node)) {
              node.remove();
              continue;
            }
          }

          break;
        }
      };

      trimSideDeep(container, true);
      trimSideDeep(container, false);

      const out = container.innerHTML;
      return String(out || '').replace(edge, '');
    } catch (_) {
      return String(html ?? '').trim();
    }
  }

  function sanitizeHTML(html) {
    html = trimClipboardContentEdges(html);
    html = html.replace(/<meta[^>]+>/gi, "");
  
    const container = document.createElement("div");
    container.innerHTML = html;

    // Remove <style> / <script> entirely (do NOT preserve their text children)
    try {
      container.querySelectorAll('style, script').forEach((n) => n.remove());
    } catch (_) {}

    // Remove HTML comments that can come from sources like Google Sheets
    try {
      const commentWalker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT, null, false);
      const comments = [];
      while (commentWalker.nextNode()) comments.push(commentWalker.currentNode);
      comments.forEach((c) => c && c.remove && c.remove());
    } catch (_) {}
  
    const allowedTags = new Set(["SPAN", "BR"]); // always allow SPAN/BR (tokens + line breaks)
    if (config.allowBold) {
      allowedTags.add("B"); allowedTags.add("STRONG");
    }
    if (config.allowItalic) {
      allowedTags.add("EM"); allowedTags.add("I");
    }
    if (config.allowStrikethrough) {
      allowedTags.add("STRIKE");
    }
    if (config.allowUnderline) {
      allowedTags.add("U");
    }
    if (config.allowSuperscript) {
      allowedTags.add("SUP");
    }
    if (config.allowAnchor) {
      allowedTags.add("A");
    }
  
    const allowedStyleProps = [];
    if (config.allowBold) allowedStyleProps.push("font-weight");
    if (config.allowItalic) allowedStyleProps.push("font-style");
    if (config.allowUnderline || config.allowStrikethrough) allowedStyleProps.push("text-decoration");
  
    const tokenAllowedAttrs = new Set([
      "e-token",
      "token-template",
      "token-content",
      "token-meta",
      "class",
      "contenteditable"
    ]);
  
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ELEMENT,
      null,
      false
    );
  
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
  
    nodes.forEach(node => {
  
      const tag = node.tagName;
  
      // 🔥 Remove disallowed tags but keep children
      if (!allowedTags.has(tag)) {
        const parent = node.parentNode;
        while (node.firstChild) {
          parent.insertBefore(node.firstChild, node);
        }
        parent.removeChild(node);
        return;
      }
  
      // 🔥 Replace <span>&nbsp;</span> with normal space
      if (
        tag === "SPAN" &&
        node.attributes.length === 0 &&
        node.innerHTML.trim() === "&nbsp;"
      ) {
        node.replaceWith(document.createTextNode(" "));
        return;
      }
  
      // 🔥 Remove all data-* attributes
      [...node.attributes].forEach(attr => {
        if (attr.name.startsWith("data-")) {
          node.removeAttribute(attr.name);
        }
      });
  
      // 🔥 Special handling for <a>
      if (tag === "A") {
        [...node.attributes].forEach(attr => {
          if (attr.name !== "href") {
            node.removeAttribute(attr.name);
          }
        });
      }
  
      // 🔥 Special handling for <span e-token>
      else if (tag === "SPAN" && node.hasAttribute("e-token")) {
  
        [...node.attributes].forEach(attr => {
          if (
            attr.name !== "style" &&
            !tokenAllowedAttrs.has(attr.name)
          ) {
            node.removeAttribute(attr.name);
          }
        });
      }
  
      // 🔥 Normal span handling
      else {
        [...node.attributes].forEach(attr => {
          if (attr.name !== "style") {
            node.removeAttribute(attr.name);
          }
        });
      }
  
      // 🔥 Clean inline styles
      const style = node.getAttribute("style");

      if (style) {
      
        // 🔥 If this is a token span, preserve all styles
        if (node.tagName === "SPAN" && node.hasAttribute("e-token")) {
          // Do nothing — keep original style intact
        }
      
        // 🔥 Otherwise restrict styles
        else {
          const cleaned = [];
      
          allowedStyleProps.forEach(prop => {
            const match = style.match(
              new RegExp(prop + "\\s*:\\s*([^;]+)", "i")
            );
            if (match) {
              let value = match[1].trim();
              if (prop === "text-decoration") {
                // Only keep underline/line-through based on settings
                const parts = value.split(/\s+/).filter(Boolean);
                const kept = parts.filter((p) => {
                  const v = p.toLowerCase();
                  if (v === "underline") return !!config.allowUnderline;
                  if (v === "line-through") return !!config.allowStrikethrough;
                  return false;
                });
                if (!kept.length) return;
                value = kept.join(" ");
              }
              cleaned.push(`${prop}: ${value}`);
            }
          });
      
          if (cleaned.length) {
            node.setAttribute("style", cleaned.join("; "));
          } else {
            node.removeAttribute("style");
          }
        }
      }
      
  
      // 🔥 Remove empty spans (but NEVER remove e-token spans)
      if (
        tag === "SPAN" &&
        !node.hasAttribute("e-token") &&
        !node.getAttribute("style") &&
        !node.textContent.trim()
      ) {
        node.remove();
      }
    });
  
    return container.innerHTML;
  }
  


  function patchEditor(ed) {
    if (!ed || activePatches.has(ed.id)) return;

    if (!ed.initialized) {
      ed.on("init", () => patchEditor(ed));
      return;
    }

    const body = ed.getBody();
    const doc = ed.getDoc();
    if (!body || !doc) return;

    console.log("[Gem][CustomPaste] Patching live editor:", ed.id);

    let savedRange = null;

    function saveCaret() {
      const sel = doc.getSelection();
      if (sel && sel.rangeCount) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }

    function handlePaste(event) {
      // If disabled, let Emarsys handle paste normally.
      if (!config.enabled) return;
      let html = event.clipboardData?.getData("text/html");
      if (!html) return;
      html = trimClipboardContentEdges(html);

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!savedRange) {
        console.warn("[Gem][CustomPaste] No caret saved for", ed.id);
        return;
      }

      const cleaned = sanitizeHTML(html);

      const sel = doc.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);

      ed.selection.setRng(savedRange);

      ed.execCommand("mceInsertContent", false, cleaned);
      ed.nodeChanged();
    }

    body.addEventListener("mouseup", saveCaret);
    body.addEventListener("keyup", saveCaret);
    body.addEventListener("focus", saveCaret);
    body.addEventListener("paste", handlePaste, true);

    activePatches.set(ed.id, {
      destroy() {
        body.removeEventListener("mouseup", saveCaret);
        body.removeEventListener("keyup", saveCaret);
        body.removeEventListener("focus", saveCaret);
        body.removeEventListener("paste", handlePaste, true);
      }
    });
  }

  function cleanupDestroyedEditors() {
    const liveIds = new Set((window.tinymce && window.tinymce.editors ? window.tinymce.editors : []).map(e => e.id));

    for (const [id, patch] of activePatches.entries()) {
      if (!liveIds.has(id)) {
        console.log("[Gem][CustomPaste] Cleaning up destroyed editor:", id);
        patch.destroy();
        activePatches.delete(id);
      }
    }
  }

  function syncEditors() {
    if (!config.enabled) return;
    cleanupDestroyedEditors();
    (window.tinymce && window.tinymce.editors ? window.tinymce.editors : []).forEach(patchEditor);
  }

  function waitForTinyMceAndBody(start) {
    const maxMs = 20000;
    const tick = () => {
      if (document.body && window.tinymce && Array.isArray(window.tinymce.editors)) {
        start();
        return;
      }
      if (Date.now() - begin > maxMs) return;
      setTimeout(tick, 250);
    };
    const begin = Date.now();
    tick();
  }

  waitForTinyMceAndBody(() => {
    // Initial sync
    syncEditors();

    // Watch for DOM changes (Emarsys duplication)
    domObserver = new MutationObserver(() => {
      syncEditors();
    });

    domObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log("[Gem][CustomPaste] Dynamic TinyMCE 4 patch installed.");
  });
})();
