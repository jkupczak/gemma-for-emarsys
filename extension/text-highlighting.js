console.log("[Gem] text-highlighting.js loaded");

// Global variables for dynamic configuration
let PLACEHOLDERS = [];
const GEM_TEXT_HIGHLIGHTS_RENDERED_EVENT = "gem:text-highlights-rendered";

function normalizeHighlightMode(mode) {
  if (mode === 'notify') return 'notify';
  if (mode === 'disabled') return 'disabled';
  return 'highlight';
}

function normalizeHighlightTermData(termData) {
  if (typeof termData === 'string') {
    return {
      color: termData,
      isRegex: false,
      mode: 'highlight'
    };
  }
  const data = termData && typeof termData === 'object' ? termData : {};
  return {
    color: typeof data.color === 'string' ? data.color : 'rgba(255, 255, 0, 0.40)',
    isRegex: !!data.isRegex,
    mode: normalizeHighlightMode(data.mode)
  };
}

// Compile regex safely
function compileRegex(pattern) {
  try {
    return new RegExp(pattern, 'gi'); // Global, case-insensitive
  } catch (error) {
    console.warn("[Gem] Invalid regex pattern:", pattern, error);
    return null;
  }
}

// ---------------- CONFIG ---------------------

const TARGET_IFRAME_SELECTOR =
  ".e-contentblocks-preview__iframe.e-contentblocks-preview__iframe-desktop";
const PREHEADER_TEXTAREA_SELECTOR = "cb-preheader textarea";

const TEXTAREA_MIRROR_STYLE_PROPS = [
  "direction",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize"
];

// Default highlight terms for first-time users (none).
const DEFAULT_HIGHLIGHT_TERMS = {};

// Load highlight configuration from storage
function loadHighlightConfig() {
  // First check if highlightTerms exists in storage (to determine if user has customized)
  chrome.storage.sync.get(['highlightTerms'], (result) => {
    let highlightTerms;

    if (result.highlightTerms === undefined) {
      // First-time user: use defaults and save them
      console.log("[Gem] First-time user detected, initializing with default highlight terms");
      highlightTerms = DEFAULT_HIGHLIGHT_TERMS;
      chrome.storage.sync.set({ highlightTerms: highlightTerms });
    } else {
      // Existing user: use their stored terms (even if empty)
      console.log("[Gem] Using existing user highlight terms");
      highlightTerms = result.highlightTerms;
    }

    // Now get the enableHighlighting setting
    chrome.storage.sync.get({ enableHighlighting: true }, (settings) => {
      // Update global PLACEHOLDERS
      PLACEHOLDERS = Object.entries(highlightTerms)
        .map(([term, termData]) => {
          const normalized = normalizeHighlightTermData(termData);
          return {
            term,
            mode: normalized.mode,
            termLower: normalized.isRegex ? null : term.toLowerCase(), // Only lowercase for non-regex
            color: normalized.color,
            isRegex: normalized.isRegex,
            regex: normalized.isRegex ? compileRegex(term) : null
          };
        })
        .filter((entry) => entry.mode !== 'disabled');

      console.log("[Gem] Loaded highlight configuration:", highlightTerms);

      // Initialize highlighting if enabled
      if (settings.enableHighlighting) {
        initializeHighlighting();
      }
    });
  });
}

// Listen for setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    // Check if chrome APIs are still available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      return;
    }

    if (changes.enableHighlighting) {
      if (changes.enableHighlighting.newValue) {
        initializeHighlighting();
      } else {
        disableHighlighting();
      }
      return;
    }

    if (changes.highlightTerms) {
      // Update PLACEHOLDERS and re-highlight if active
      PLACEHOLDERS = Object.entries(changes.highlightTerms.newValue)
        .map(([term, termData]) => {
          const normalized = normalizeHighlightTermData(termData);
          return {
            term,
            mode: normalized.mode,
            termLower: normalized.isRegex ? null : term.toLowerCase(), // Only lowercase for non-regex
            color: normalized.color,
            isRegex: normalized.isRegex,
            regex: normalized.isRegex ? compileRegex(term) : null
          };
        })
        .filter((entry) => entry.mode !== 'disabled');
      console.log("[Gem] Highlight terms updated, re-highlighting...");

      debounceNamed("all", refreshAllHighlights);
    }
  }
});

// Load initial configuration
loadHighlightConfig();

// ---------------------------------------------

let overlayContainer = null;
let pageOverlayContainer = null;
let textareaMirror = null;
let iframeMutationObserver = null;
let lifecycleUnsub = null;
let preheaderLifecycleUnsub = null;
let currentIframe = null;
let currentPreheaderTextarea = null;
let textHighlightsPaused = false;
let scrollHandler = null;
let resizeHandler = null;
let pageViewportHandler = null;
const debounceTimers = {};

window.gemPauseTextHighlights = function () {
  textHighlightsPaused = true;
  clearOverlays();
};

window.gemResumeTextHighlights = function () {
  textHighlightsPaused = false;
  debounceNamed("all", refreshAllHighlights);
};

function debounceNamed(key, fn, delay = 150) {
  clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(fn, delay);
}

function refreshAllHighlights() {
  if (textHighlightsPaused) return;
  if (currentIframe && currentIframe.isConnected) {
    highlightMatchesInIframe(currentIframe);
  }
  highlightMatchesInPreheader();
}

function notifyHighlightsRendered(overlayCount) {
  window.dispatchEvent(new CustomEvent(GEM_TEXT_HIGHLIGHTS_RENDERED_EVENT, {
    detail: {
      overlayCount: overlayCount || 0,
      ts: Date.now()
    }
  }));
}

function createHighlightBox(doc, rect, color, offsetX, offsetY, position) {
  const box = doc.createElement("div");
  box.className = "gem-text-highlight";
  Object.assign(box.style, {
    position: position || "absolute",
    left: (rect.left + offsetX - 1) + "px",
    top: (rect.top + offsetY - 1) + "px",
    width: rect.width + "px",
    height: rect.height + "px",
    background: color,
    boxShadow: "0 0 0 1px rgb(0 0 0 / 0.1), inset 0 0 0 1px rgb(0 0 0 / 0.3)",
    borderRadius: "4px",
    padding: "2px 1px",
    pointerEvents: "none"
  });
  return box;
}

function forEachHighlightMatch(raw, onMatch) {
  if (!raw) return;

  for (const placeholder of PLACEHOLDERS) {
    const { termLower, color, isRegex, regex } = placeholder;

    if (isRegex && regex) {
      let match;
      while ((match = regex.exec(raw)) !== null) {
        const startIndex = match.index;
        const matchLength = match[0].length;
        if (matchLength > 0) onMatch(startIndex, matchLength, color);
        if (matchLength === 0) regex.lastIndex++;
      }
      regex.lastIndex = 0;
      continue;
    }

    if (!termLower) continue;
    const termLen = termLower.length;
    if (!termLen) continue;

    const lowerRaw = raw.toLowerCase();
    let startIndex = 0;
    while (true) {
      const index = lowerRaw.indexOf(termLower, startIndex);
      if (index === -1) break;
      onMatch(index, termLen, color);
      startIndex = index + termLen;
    }
  }
}

function intersectVisibleRect(rect, clipRect) {
  const left = Math.max(rect.left, clipRect.left);
  const top = Math.max(rect.top, clipRect.top);
  const right = Math.min(rect.right, clipRect.right);
  const bottom = Math.min(rect.bottom, clipRect.bottom);
  if (right <= left || bottom <= top) return null;
  return {
    left: left,
    top: top,
    right: right,
    bottom: bottom,
    width: right - left,
    height: bottom - top
  };
}

function clearIframeOverlays() {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
  }
}

function clearPageOverlays() {
  if (pageOverlayContainer) {
    pageOverlayContainer.innerHTML = "";
  }
}

function clearOverlays() {
  clearIframeOverlays();
  clearPageOverlays();
}

function ensureOverlayContainer(doc) {
  if (textHighlightsPaused) return null;

  if (
    overlayContainer &&
    overlayContainer.ownerDocument === doc &&
    overlayContainer.isConnected
  ) {
    return overlayContainer;
  }

  overlayContainer = doc.createElement("div");
  overlayContainer.id = "gem-text-highlight-container";
  overlayContainer.style.position = "absolute";
  overlayContainer.style.left = "0";
  overlayContainer.style.top = "0";
  overlayContainer.style.width = "100%";
  overlayContainer.style.height = "100%";
  overlayContainer.style.pointerEvents = "none";
  overlayContainer.style.zIndex = "999999";

  doc.body.appendChild(overlayContainer);
  return overlayContainer;
}

function ensurePageOverlayContainer() {
  if (textHighlightsPaused) return null;

  if (pageOverlayContainer && pageOverlayContainer.isConnected) {
    return pageOverlayContainer;
  }

  pageOverlayContainer = document.createElement("div");
  pageOverlayContainer.id = "gem-text-highlight-page-container";
  Object.assign(pageOverlayContainer.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "999999"
  });
  (document.documentElement || document.body).appendChild(pageOverlayContainer);
  return pageOverlayContainer;
}

function ensureTextareaMirror() {
  if (textareaMirror && textareaMirror.isConnected) return textareaMirror;

  textareaMirror = document.createElement("div");
  textareaMirror.id = "gem-text-highlight-textarea-mirror";
  textareaMirror.setAttribute("aria-hidden", "true");
  Object.assign(textareaMirror.style, {
    position: "fixed",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1"
  });
  (document.documentElement || document.body).appendChild(textareaMirror);
  return textareaMirror;
}

function syncTextareaMirror(textarea) {
  const mirror = ensureTextareaMirror();
  const cs = window.getComputedStyle(textarea);
  const rect = textarea.getBoundingClientRect();

  TEXTAREA_MIRROR_STYLE_PROPS.forEach((prop) => {
    try {
      mirror.style[prop] = cs[prop];
    } catch (_) {}
  });

  Object.assign(mirror.style, {
    position: "fixed",
    left: rect.left + "px",
    top: rect.top + "px",
    width: rect.width + "px",
    height: rect.height + "px",
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    opacity: "0",
    pointerEvents: "none"
  });

  mirror.textContent = textarea.value || "";
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;
  return mirror;
}

function highlightMatchesInPreheader() {
  if (textHighlightsPaused) return;

  const textarea = currentPreheaderTextarea && currentPreheaderTextarea.isConnected
    ? currentPreheaderTextarea
    : document.querySelector(PREHEADER_TEXTAREA_SELECTOR);

  const container = ensurePageOverlayContainer();
  if (!container) return;
  container.innerHTML = "";

  if (!textarea) {
    notifyHighlightsRendered(0);
    return;
  }

  const raw = String(textarea.value || "");
  if (!raw || !PLACEHOLDERS.length) {
    notifyHighlightsRendered(0);
    return;
  }

  const mirror = syncTextareaMirror(textarea);
  const textNode = mirror.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    notifyHighlightsRendered(0);
    return;
  }

  const clipRect = textarea.getBoundingClientRect();
  let overlayCount = 0;

  forEachHighlightMatch(raw, (startIndex, matchLength, color) => {
    const endIndex = Math.min(startIndex + matchLength, textNode.nodeValue.length);
    if (endIndex <= startIndex) return;

    const range = document.createRange();
    range.setStart(textNode, startIndex);
    range.setEnd(textNode, endIndex);

    const rects = range.getClientRects();
    for (const rect of rects) {
      const visible = intersectVisibleRect(rect, clipRect);
      if (!visible || !visible.width || !visible.height) continue;
      container.appendChild(createHighlightBox(document, visible, color, 0, 0, "fixed"));
      overlayCount += 1;
    }

    range.detach();
  });

  notifyHighlightsRendered(overlayCount);
}

// MAIN highlight function
function highlightMatchesInIframe(iframe) {
  if (textHighlightsPaused) return;

  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return;

  const win = doc.defaultView || iframe.contentWindow;
  if (!win) return;

  const container = ensureOverlayContainer(doc);
  if (!container) return;

  // Clear existing boxes but keep container
  container.innerHTML = "";

  const scrollX = win.scrollX || 0;
  const scrollY = win.scrollY || 0;

  // Walk visible text nodes
  const walker = doc.createTreeWalker(
    doc.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (isInsideGemOverlay(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let textNode;
  while ((textNode = walker.nextNode())) {
    const raw = textNode.nodeValue;
    const maxLen = raw.length;

    forEachHighlightMatch(raw, (startIndex, matchLength, color) => {
      const endIndex = Math.min(startIndex + matchLength, maxLen);
      if (endIndex <= startIndex) return;

      const range = doc.createRange();
      range.setStart(textNode, startIndex);
      range.setEnd(textNode, endIndex);

      const rects = range.getClientRects();
      for (const rect of rects) {
        if (!rect.width || !rect.height) continue;
        container.appendChild(createHighlightBox(doc, rect, color, scrollX, scrollY, "absolute"));
      }

      range.detach();
    });
  }

  notifyHighlightsRendered(container.childElementCount || 0);
}

function removeViewportListeners() {
  if (scrollHandler && currentIframe) {
    try {
      const win = currentIframe.contentWindow;
      if (win) {
        win.removeEventListener('scroll', scrollHandler);
        win.removeEventListener('resize', resizeHandler);
      }
    } catch (_) {}
  }
  scrollHandler = null;
  resizeHandler = null;
}

function attachViewportListeners(iframe) {
  removeViewportListeners();

  const win = iframe.contentWindow;
  if (!win) return;

  const onViewportChange = () => {
    if (iframe !== currentIframe || textHighlightsPaused) return;
    debounceNamed("iframe", () => highlightMatchesInIframe(iframe));
  };

  scrollHandler = onViewportChange;
  resizeHandler = onViewportChange;
  win.addEventListener('scroll', scrollHandler, { passive: true });
  win.addEventListener('resize', resizeHandler);
}

function removePageViewportListeners() {
  if (!pageViewportHandler) return;
  window.removeEventListener("scroll", pageViewportHandler, true);
  window.removeEventListener("resize", pageViewportHandler);
  pageViewportHandler = null;
}

function attachPageViewportListeners() {
  if (pageViewportHandler) return;
  pageViewportHandler = () => {
    if (textHighlightsPaused) return;
    debounceNamed("preheader", highlightMatchesInPreheader);
  };
  window.addEventListener("scroll", pageViewportHandler, true);
  window.addEventListener("resize", pageViewportHandler);
}

function unbindPreheader() {
  if (currentPreheaderTextarea) {
    currentPreheaderTextarea.removeEventListener("input", onPreheaderInput);
    currentPreheaderTextarea.removeEventListener("scroll", onPreheaderInput);
  }
  currentPreheaderTextarea = null;
  clearPageOverlays();
}

function onPreheaderInput() {
  debounceNamed("preheader", highlightMatchesInPreheader);
}

function bindToPreheader(textarea) {
  if (!textarea) {
    unbindPreheader();
    return;
  }
  if (currentPreheaderTextarea === textarea) return;

  unbindPreheader();
  currentPreheaderTextarea = textarea;
  textarea.addEventListener("input", onPreheaderInput);
  textarea.addEventListener("scroll", onPreheaderInput, { passive: true });
  highlightMatchesInPreheader();
}

function watchPreheaderLifecycle() {
  if (preheaderLifecycleUnsub) {
    preheaderLifecycleUnsub();
    preheaderLifecycleUnsub = null;
  }

  const sync = () => {
    const textarea = document.querySelector(PREHEADER_TEXTAREA_SELECTOR);
    if (textarea) bindToPreheader(textarea);
    else if (currentPreheaderTextarea) unbindPreheader();
  };

  sync();
  preheaderLifecycleUnsub = window.gemDomWatchSubscribe(sync);
}

// Observe DOM until iframe appears with a ready document + body
function waitForIframeReady(callback) {
  function tryReady() {
    const iframe = document.querySelector(TARGET_IFRAME_SELECTOR);
    if (!iframe) return false;

    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return false;

    callback(iframe);
    return true;
  }

  if (tryReady()) return;

  window.gemDomWatchWaitFor(TARGET_IFRAME_SELECTOR, function () {
    tryReady();
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
    if (isGemElement(el)) return true;
    el = el.parentElement;
  }
  return false;
}

// Called when iframe is found or re-added
function bindToIframe(iframe) {
  currentIframe = iframe;

  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return;

  attachViewportListeners(iframe);

  // Initial highlight
  debounceNamed("iframe", () => highlightMatchesInIframe(iframe));

  // Rehighlight on DOM changes inside iframe
  if (iframeMutationObserver) {
    iframeMutationObserver.disconnect();
    iframeMutationObserver = null;
  }

  iframeMutationObserver = new MutationObserver((mutations) => {
    // If iframe is no longer current, ignore
    if (iframe !== currentIframe) return;

    // Ignore mutations that are only about our overlay container / highlight boxes
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

    if (onlyOverlayChanges) {
      // All mutations came from our own highlight overlays → ignore
      return;
    }

    // Real change → rehighlight (debounced)
    debounceNamed("iframe", () => highlightMatchesInIframe(iframe));
  });

  iframeMutationObserver.observe(doc.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true
  });
}

// Watch the top-level DOM so we detect iframe removal + re-addition
function watchIframeLifecycle() {
  if (lifecycleUnsub) {
    lifecycleUnsub();
    lifecycleUnsub = null;
  }

  lifecycleUnsub = window.gemDomWatchSubscribe(function () {
    const iframe = document.querySelector(TARGET_IFRAME_SELECTOR);

    if (!iframe && currentIframe) {
      currentIframe = null;
      clearIframeOverlays();
      if (iframeMutationObserver) {
        iframeMutationObserver.disconnect();
        iframeMutationObserver = null;
      }
      removeViewportListeners();
    }

    if (iframe && iframe !== currentIframe) {
      waitForIframeReady(bindToIframe);
    }
  });
}

// Initialize highlighting functionality
function initializeHighlighting() {
  watchIframeLifecycle();
  waitForIframeReady(bindToIframe);
  attachPageViewportListeners();
  watchPreheaderLifecycle();
}

// Disable highlighting functionality
function disableHighlighting() {
  if (lifecycleUnsub) {
    lifecycleUnsub();
    lifecycleUnsub = null;
  }
  if (preheaderLifecycleUnsub) {
    preheaderLifecycleUnsub();
    preheaderLifecycleUnsub = null;
  }
  if (iframeMutationObserver) {
    iframeMutationObserver.disconnect();
    iframeMutationObserver = null;
  }

  removeViewportListeners();
  removePageViewportListeners();
  unbindPreheader();
  if (textareaMirror) {
    textareaMirror.remove();
    textareaMirror = null;
  }
  if (pageOverlayContainer) {
    pageOverlayContainer.remove();
    pageOverlayContainer = null;
  }

  clearOverlays();

  currentIframe = null;
  Object.keys(debounceTimers).forEach((key) => {
    clearTimeout(debounceTimers[key]);
    delete debounceTimers[key];
  });
}
