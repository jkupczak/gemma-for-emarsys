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
const PREHEADER_WRAP_CLASS = "gem-preheader-highlight-wrap";
const PREHEADER_SHELL_CLASS = "gem-text-highlight-preheader-shell";
const PREHEADER_SHELL_ID = "gem-text-highlight-preheader-shell";
const LANGUAGE_SELECTOR = "vce-languages-selector";
const LOCALE_SELECTOR = "cb-multilanguage-locale-selector";
const PREVIEW_CONTAINER_SELECTOR = "vce-iframes-container";
const PREHEADER_BURST_INTERVAL_MS = 100;
const PREHEADER_BURST_MS = 2000;
const PREHEADER_FOCUS_SYNC_MS = 100;

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
let preheaderOverlayShell = null;
let preheaderOverlayWrap = null;
let textareaMirror = null;
let iframeMutationObserver = null;
let lifecycleUnsub = null;
let preheaderLifecycleUnsub = null;
let lastPreheaderValue = null;
let currentPreheaderHost = null;
let preheaderHostInputHandler = null;
let preheaderBurstTimer = null;
let preheaderBurstStopTimer = null;
let preheaderLanguageObserver = null;
let preheaderLanguageSelectorObserver = null;
let preheaderPreviewObserver = null;
let preheaderLanguageWatchUnsub = null;
let preheaderLanguageSetupScheduled = false;
let preheaderLanguageClickHandler = null;
let preheaderHostObserver = null;
let preheaderValueHookTarget = null;
let lastPreheaderLanguageValue = null;
let currentIframe = null;
let currentPreheaderTextarea = null;
let textHighlightsPaused = false;
let scrollHandler = null;
let resizeHandler = null;
let pageViewportHandler = null;
let preheaderScrollRaf = null;
let preheaderEditWatchInstalled = false;
let preheaderFocusSyncTimer = null;
let preheaderHighlightRefreshRaf = null;
let preheaderDocumentInputHandler = null;
let preheaderDocumentBeforeInputHandler = null;
let preheaderDocumentPasteHandler = null;
let preheaderDocumentCutHandler = null;
let preheaderDocumentKeyupHandler = null;
let preheaderDocumentFocusInHandler = null;
let preheaderDocumentFocusOutHandler = null;
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

function isPreheaderTextareaElement(el) {
  return !!(
    el &&
    el.nodeType === Node.ELEMENT_NODE &&
    el.matches &&
    el.matches(PREHEADER_TEXTAREA_SELECTOR)
  );
}

function queuePreheaderHighlightRefresh() {
  if (textHighlightsPaused) return;
  if (preheaderHighlightRefreshRaf) return;
  preheaderHighlightRefreshRaf = requestAnimationFrame(() => {
    preheaderHighlightRefreshRaf = null;
    highlightMatchesInPreheader();
  });
}

function handlePreheaderTextareaEdit(target) {
  if (!isPreheaderTextareaElement(target)) return;
  const host = target.closest("cb-preheader");
  if (target !== currentPreheaderTextarea || host !== currentPreheaderHost) {
    bindToPreheader(target);
    return;
  }
  queuePreheaderHighlightRefresh();
}

function tickPreheaderFocusSync() {
  const textarea = currentPreheaderTextarea;
  if (!textarea || !textarea.isConnected || document.activeElement !== textarea) {
    stopPreheaderFocusSync();
    return;
  }
  const value = String(textarea.value || "");
  if (value === lastPreheaderValue) return;
  highlightMatchesInPreheader();
}

function startPreheaderFocusSync(textarea) {
  stopPreheaderFocusSync();
  if (!textarea) return;
  tickPreheaderFocusSync();
  preheaderFocusSyncTimer = setInterval(tickPreheaderFocusSync, PREHEADER_FOCUS_SYNC_MS);
}

function stopPreheaderFocusSync() {
  if (!preheaderFocusSyncTimer) return;
  clearInterval(preheaderFocusSyncTimer);
  preheaderFocusSyncTimer = null;
}

function installPreheaderEditWatch() {
  if (preheaderEditWatchInstalled) return;
  preheaderEditWatchInstalled = true;

  preheaderDocumentInputHandler = (event) => handlePreheaderTextareaEdit(event.target);
  preheaderDocumentBeforeInputHandler = (event) => handlePreheaderTextareaEdit(event.target);
  preheaderDocumentPasteHandler = (event) => handlePreheaderTextareaEdit(event.target);
  preheaderDocumentCutHandler = (event) => handlePreheaderTextareaEdit(event.target);
  preheaderDocumentKeyupHandler = (event) => {
    if (event.key === "Enter" || event.key.length === 1) {
      handlePreheaderTextareaEdit(event.target);
    }
  };
  preheaderDocumentFocusInHandler = (event) => {
    if (!isPreheaderTextareaElement(event.target)) return;
    bindToPreheader(event.target);
    startPreheaderFocusSync(event.target);
  };
  preheaderDocumentFocusOutHandler = (event) => {
    if (!isPreheaderTextareaElement(event.target)) return;
    stopPreheaderFocusSync();
    queuePreheaderHighlightRefresh();
  };

  document.addEventListener("input", preheaderDocumentInputHandler, true);
  document.addEventListener("beforeinput", preheaderDocumentBeforeInputHandler, true);
  document.addEventListener("paste", preheaderDocumentPasteHandler, true);
  document.addEventListener("cut", preheaderDocumentCutHandler, true);
  document.addEventListener("keyup", preheaderDocumentKeyupHandler, true);
  document.addEventListener("focusin", preheaderDocumentFocusInHandler, true);
  document.addEventListener("focusout", preheaderDocumentFocusOutHandler, true);
}

function removePreheaderEditWatch() {
  if (!preheaderEditWatchInstalled) return;
  preheaderEditWatchInstalled = false;
  stopPreheaderFocusSync();
  if (preheaderHighlightRefreshRaf) {
    cancelAnimationFrame(preheaderHighlightRefreshRaf);
    preheaderHighlightRefreshRaf = null;
  }
  if (preheaderDocumentInputHandler) {
    document.removeEventListener("input", preheaderDocumentInputHandler, true);
    preheaderDocumentInputHandler = null;
  }
  if (preheaderDocumentBeforeInputHandler) {
    document.removeEventListener("beforeinput", preheaderDocumentBeforeInputHandler, true);
    preheaderDocumentBeforeInputHandler = null;
  }
  if (preheaderDocumentPasteHandler) {
    document.removeEventListener("paste", preheaderDocumentPasteHandler, true);
    preheaderDocumentPasteHandler = null;
  }
  if (preheaderDocumentCutHandler) {
    document.removeEventListener("cut", preheaderDocumentCutHandler, true);
    preheaderDocumentCutHandler = null;
  }
  if (preheaderDocumentKeyupHandler) {
    document.removeEventListener("keyup", preheaderDocumentKeyupHandler, true);
    preheaderDocumentKeyupHandler = null;
  }
  if (preheaderDocumentFocusInHandler) {
    document.removeEventListener("focusin", preheaderDocumentFocusInHandler, true);
    preheaderDocumentFocusInHandler = null;
  }
  if (preheaderDocumentFocusOutHandler) {
    document.removeEventListener("focusout", preheaderDocumentFocusOutHandler, true);
    preheaderDocumentFocusOutHandler = null;
  }
}

function clearPreheaderHighlightBoxesInWrap(wrap) {
  if (!wrap) return;
  wrap.querySelectorAll(`.${PREHEADER_SHELL_CLASS}`).forEach((shell) => {
    shell.innerHTML = "";
  });
  wrap.querySelectorAll(".gem-text-highlight").forEach((box) => box.remove());
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

function createLocalHighlightBox(doc, rect, color) {
  const box = doc.createElement("div");
  box.className = "gem-text-highlight";
  Object.assign(box.style, {
    position: "absolute",
    left: (rect.left - 1) + "px",
    top: (rect.top - 1) + "px",
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

function isPreheaderTextareaVisible(textarea) {
  if (!textarea || !textarea.isConnected) return false;
  const rect = textarea.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function resolvePreheaderTextarea() {
  const active = document.activeElement;
  if (
    active &&
    active.nodeType === Node.ELEMENT_NODE &&
    active.matches &&
    active.matches(PREHEADER_TEXTAREA_SELECTOR)
  ) {
    return active;
  }

  if (
    currentPreheaderTextarea &&
    currentPreheaderTextarea.isConnected &&
    isPreheaderTextareaVisible(currentPreheaderTextarea)
  ) {
    return currentPreheaderTextarea;
  }

  const textareas = document.querySelectorAll(PREHEADER_TEXTAREA_SELECTOR);
  for (const textarea of textareas) {
    if (isPreheaderTextareaVisible(textarea)) return textarea;
  }

  return textareas[0] || null;
}

function findPreheaderWrap(textarea) {
  if (textarea) {
    const wrap = textarea.closest(`.${PREHEADER_WRAP_CLASS}`);
    if (wrap) {
      preheaderOverlayWrap = wrap;
      return wrap;
    }
  }
  if (preheaderOverlayWrap && preheaderOverlayWrap.isConnected) {
    return preheaderOverlayWrap;
  }
  return null;
}

function removeExtraPreheaderOverlayShells(wrap, keepShell) {
  if (!wrap) return;
  wrap.querySelectorAll(`.${PREHEADER_SHELL_CLASS}`).forEach((shell) => {
    if (shell !== keepShell) shell.remove();
  });
}

function reconcilePreheaderOverlayShell(wrap) {
  if (!wrap) return null;

  const shells = wrap.querySelectorAll(`.${PREHEADER_SHELL_CLASS}`);
  let shell = shells[0] || null;

  if (
    preheaderOverlayShell &&
    preheaderOverlayShell.isConnected &&
    preheaderOverlayShell.parentElement === wrap
  ) {
    shell = preheaderOverlayShell;
  }

  removeExtraPreheaderOverlayShells(wrap, shell);
  preheaderOverlayShell = shell;
  return shell;
}

function clearPreheaderOverlayShells(wrap) {
  if (wrap && wrap.isConnected) {
    wrap.querySelectorAll(`.${PREHEADER_SHELL_CLASS}`).forEach((shell) => shell.remove());
  }
  preheaderOverlayShell = null;
}

function clearPreheaderOverlays() {
  const wrap = findPreheaderWrap(currentPreheaderTextarea);
  clearPreheaderOverlayShells(wrap);

  if (wrap && wrap.isConnected) {
    const textarea = wrap.querySelector("textarea");
    const parent = wrap.parentNode;
    if (textarea && parent) {
      parent.insertBefore(textarea, wrap);
    }
    wrap.remove();
  }
  preheaderOverlayWrap = null;
}

function clearOverlays() {
  clearIframeOverlays();
  clearPreheaderOverlays();
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

function ensurePreheaderHighlightWrap(textarea) {
  if (!textarea || !textarea.parentNode) return null;

  const existingWrap = textarea.closest(`.${PREHEADER_WRAP_CLASS}`);
  if (existingWrap) {
    preheaderOverlayWrap = existingWrap;
    return existingWrap;
  }

  const wrap = document.createElement("div");
  wrap.className = PREHEADER_WRAP_CLASS;
  Object.assign(wrap.style, {
    position: "relative",
    display: "block",
    width: "100%"
  });

  const parent = textarea.parentNode;
  parent.insertBefore(wrap, textarea);
  wrap.appendChild(textarea);
  preheaderOverlayWrap = wrap;
  return wrap;
}

function ensurePreheaderOverlayShell(textarea) {
  if (textHighlightsPaused) return null;

  const wrap = ensurePreheaderHighlightWrap(textarea);
  if (!wrap) return null;

  let shell = reconcilePreheaderOverlayShell(wrap);
  if (shell && shell.isConnected && shell.parentElement === wrap) {
    return shell;
  }

  shell = document.createElement("div");
  shell.id = PREHEADER_SHELL_ID;
  shell.className = PREHEADER_SHELL_CLASS;
  Object.assign(shell.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    pointerEvents: "none"
  });
  wrap.appendChild(shell);
  removeExtraPreheaderOverlayShells(wrap, shell);
  preheaderOverlayShell = shell;
  return shell;
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

function resolvePreheaderOverlayShell(textarea) {
  if (!textarea) return null;
  ensurePreheaderOverlayShell(textarea);
  const wrap = textarea.closest(`.${PREHEADER_WRAP_CLASS}`);
  if (!wrap) return preheaderOverlayShell;

  const shells = wrap.querySelectorAll(`.${PREHEADER_SHELL_CLASS}`);
  const shell = shells.length ? shells[shells.length - 1] : preheaderOverlayShell;
  if (shell) {
    removeExtraPreheaderOverlayShells(wrap, shell);
    preheaderOverlayShell = shell;
  }
  return shell;
}

function rebuildPreheaderHighlightBoxes(textarea, opts = {}) {
  const notify = opts.notify !== false;
  const shell = resolvePreheaderOverlayShell(textarea);
  if (!textarea || !shell) {
    if (notify) notifyHighlightsRendered(0);
    return 0;
  }

  clearPreheaderHighlightBoxesInWrap(textarea.closest(`.${PREHEADER_WRAP_CLASS}`));
  shell.innerHTML = "";

  const raw = String(textarea.value || "");
  if (!raw || !PLACEHOLDERS.length) {
    if (notify) notifyHighlightsRendered(0);
    return 0;
  }

  const mirror = syncTextareaMirror(textarea);
  const textNode = mirror.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    if (notify) notifyHighlightsRendered(0);
    return 0;
  }

  const shellRect = shell.getBoundingClientRect();
  const clipRect = {
    left: 0,
    top: 0,
    right: shellRect.width,
    bottom: shellRect.height,
    width: shellRect.width,
    height: shellRect.height
  };
  let overlayCount = 0;

  forEachHighlightMatch(raw, (startIndex, matchLength, color) => {
    const endIndex = Math.min(startIndex + matchLength, textNode.nodeValue.length);
    if (endIndex <= startIndex) return;

    const range = document.createRange();
    range.setStart(textNode, startIndex);
    range.setEnd(textNode, endIndex);

    const rects = range.getClientRects();
    for (const rect of rects) {
      const local = {
        left: rect.left - shellRect.left,
        top: rect.top - shellRect.top,
        right: rect.right - shellRect.left,
        bottom: rect.bottom - shellRect.top,
        width: rect.width,
        height: rect.height
      };
      const visible = intersectVisibleRect(local, clipRect);
      if (!visible || !visible.width || !visible.height) continue;
      shell.appendChild(createLocalHighlightBox(document, visible, color));
      overlayCount += 1;
    }

    range.detach();
  });

  if (notify) notifyHighlightsRendered(overlayCount);
  return overlayCount;
}

function rememberPreheaderValue(textarea) {
  lastPreheaderValue = textarea ? String(textarea.value || "") : null;
}

function highlightMatchesInPreheader() {
  if (textHighlightsPaused) return;

  const textarea = resolvePreheaderTextarea();

  if (!textarea) {
    clearPreheaderOverlays();
    lastPreheaderValue = null;
    notifyHighlightsRendered(0);
    return;
  }

  if (textarea !== currentPreheaderTextarea) {
    bindToPreheader(textarea);
    return;
  }

  ensurePreheaderOverlayShell(textarea);
  rebuildPreheaderHighlightBoxes(textarea, { notify: true });
  rememberPreheaderValue(textarea);
}

function syncPreheaderHighlightState() {
  const textarea = resolvePreheaderTextarea();
  if (!textarea) {
    if (currentPreheaderTextarea) unbindPreheader();
    lastPreheaderValue = null;
    return;
  }

  const host = textarea.closest("cb-preheader");
  if (textarea !== currentPreheaderTextarea || host !== currentPreheaderHost) {
    bindToPreheader(textarea);
    return;
  }

  const value = String(textarea.value || "");
  const valueChanged = value !== lastPreheaderValue;
  const shell = resolvePreheaderOverlayShell(textarea);
  const shellMissing = !shell || !shell.isConnected;

  if (valueChanged || shellMissing) {
    debounceNamed("preheader", highlightMatchesInPreheader);
  }
}

function invalidatePreheaderCachedValue() {
  lastPreheaderValue = null;
}

function getPreheaderLanguageOptions(selector) {
  if (!selector) return [];
  return Array.from(selector.querySelectorAll("e-select-option"));
}

function getSelectedPreheaderLanguageValue(options) {
  for (const opt of options) {
    if (!opt || opt.nodeType !== Node.ELEMENT_NODE) continue;
    const attr = opt.getAttribute && opt.getAttribute("selected");
    const selected =
      attr === "true" ||
      attr === "selected" ||
      (attr === "" && opt.hasAttribute && opt.hasAttribute("selected")) ||
      (typeof opt.selected === "boolean" && opt.selected);
    if (selected) {
      return opt.getAttribute("value") || opt.id || String(opt.textContent || "").trim();
    }
  }
  return null;
}

function stopPreheaderBurstSync() {
  if (preheaderBurstTimer) {
    clearInterval(preheaderBurstTimer);
    preheaderBurstTimer = null;
  }
  if (preheaderBurstStopTimer) {
    clearTimeout(preheaderBurstStopTimer);
    preheaderBurstStopTimer = null;
  }
}

function syncPreheaderBurstTick() {
  if (textHighlightsPaused) return;

  const textarea = resolvePreheaderTextarea();
  if (!textarea) return;

  const host = textarea.closest("cb-preheader");
  if (textarea !== currentPreheaderTextarea || host !== currentPreheaderHost) {
    bindToPreheader(textarea);
    return;
  }

  const value = String(textarea.value || "");
  const shell = resolvePreheaderOverlayShell(textarea);
  if (value === lastPreheaderValue && shell && shell.isConnected) return;

  highlightMatchesInPreheader();
}

function startPreheaderBurstSync() {
  stopPreheaderBurstSync();
  syncPreheaderBurstTick();
  preheaderBurstTimer = setInterval(syncPreheaderBurstTick, PREHEADER_BURST_INTERVAL_MS);
  preheaderBurstStopTimer = setTimeout(stopPreheaderBurstSync, PREHEADER_BURST_MS);
}

function requestPreheaderContentRefresh() {
  if (textHighlightsPaused) return;
  invalidatePreheaderCachedValue();
  startPreheaderBurstSync();
}

function onPreheaderPreviewContentChange() {
  if (textHighlightsPaused) return;
  requestPreheaderContentRefresh();
}

function readSelectedLanguageValue(selector) {
  if (!selector) return null;
  const options = getPreheaderLanguageOptions(selector);
  if (options.length < 2) return null;
  return getSelectedPreheaderLanguageValue(options);
}

function notePreheaderLanguageSelectionChange() {
  let selectedValue = null;
  for (const selectorName of [LANGUAGE_SELECTOR, LOCALE_SELECTOR]) {
    const selector = document.querySelector(selectorName);
    const value = readSelectedLanguageValue(selector);
    if (value) {
      selectedValue = value;
      break;
    }
  }
  if (!selectedValue || selectedValue === lastPreheaderLanguageValue) return;
  lastPreheaderLanguageValue = selectedValue;
  requestPreheaderContentRefresh();
}

function handlePreheaderLanguageSelectionChange() {
  notePreheaderLanguageSelectionChange();
}

function attachPreheaderLanguageObserversForSelector(selectorName) {
  const selector = document.querySelector(selectorName);
  if (!selector) return;

  const options = getPreheaderLanguageOptions(selector);
  if (!lastPreheaderLanguageValue) {
    const selectedValue = getSelectedPreheaderLanguageValue(options);
    if (selectedValue) lastPreheaderLanguageValue = selectedValue;
  }

  if (!preheaderLanguageSelectorObserver) {
    preheaderLanguageSelectorObserver = new MutationObserver(() => {
      schedulePreheaderLanguageWatchSetup();
    });
  }
  preheaderLanguageSelectorObserver.observe(selector, { childList: true, subtree: true });

  if (!options.length) return;

  if (!preheaderLanguageObserver) {
    preheaderLanguageObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some(
        (mutation) => mutation.type === "attributes" && mutation.attributeName === "selected"
      );
      if (relevant) handlePreheaderLanguageSelectionChange();
    });
  }
  options.forEach((opt) => {
    preheaderLanguageObserver.observe(opt, { attributes: true, attributeFilter: ["selected"] });
  });
}

function attachPreheaderLanguageClickListener() {
  if (preheaderLanguageClickHandler) return;
  preheaderLanguageClickHandler = (event) => {
    const target = event && event.target;
    if (!target || !target.closest) return;
    const option = target.closest("e-select-option");
    if (!option) return;
    if (!option.closest(LANGUAGE_SELECTOR) && !option.closest(LOCALE_SELECTOR)) return;
    requestPreheaderContentRefresh();
  };
  document.addEventListener("click", preheaderLanguageClickHandler, true);
}

function detachPreheaderLanguageClickListener() {
  if (!preheaderLanguageClickHandler) return;
  document.removeEventListener("click", preheaderLanguageClickHandler, true);
  preheaderLanguageClickHandler = null;
}

function detachPreheaderLanguageObservers() {
  if (preheaderLanguageObserver) {
    preheaderLanguageObserver.disconnect();
    preheaderLanguageObserver = null;
  }
  if (preheaderLanguageSelectorObserver) {
    preheaderLanguageSelectorObserver.disconnect();
    preheaderLanguageSelectorObserver = null;
  }
  if (preheaderPreviewObserver) {
    preheaderPreviewObserver.disconnect();
    preheaderPreviewObserver = null;
  }
}

function attachPreheaderLanguageObservers() {
  detachPreheaderLanguageObservers();
  attachPreheaderLanguageObserversForSelector(LANGUAGE_SELECTOR);
  attachPreheaderLanguageObserversForSelector(LOCALE_SELECTOR);
  attachPreheaderLanguageClickListener();
}

function attachPreheaderPreviewObserver() {
  const container = document.querySelector(PREVIEW_CONTAINER_SELECTOR);
  if (!container) return;

  if (preheaderPreviewObserver) {
    preheaderPreviewObserver.disconnect();
    preheaderPreviewObserver = null;
  }

  preheaderPreviewObserver = new MutationObserver((mutations) => {
    const changed = mutations.some(
      (mutation) => mutation.type === "attributes" && mutation.attributeName === "content"
    );
    if (changed) onPreheaderPreviewContentChange();
  });
  preheaderPreviewObserver.observe(container, { attributes: true, attributeFilter: ["content"] });
}

function setupPreheaderLanguageWatch() {
  attachPreheaderLanguageObservers();
  attachPreheaderPreviewObserver();
}

function schedulePreheaderLanguageWatchSetup() {
  if (preheaderLanguageSetupScheduled) return;
  preheaderLanguageSetupScheduled = true;
  requestAnimationFrame(() => {
    preheaderLanguageSetupScheduled = false;
    setupPreheaderLanguageWatch();
  });
}

function watchPreheaderLanguageChanges() {
  if (preheaderLanguageWatchUnsub) {
    preheaderLanguageWatchUnsub();
    preheaderLanguageWatchUnsub = null;
  }

  setupPreheaderLanguageWatch();
  if (typeof window.gemDomWatchSubscribe === "function") {
    preheaderLanguageWatchUnsub = window.gemDomWatchSubscribe(schedulePreheaderLanguageWatchSetup);
  }
}

function stopPreheaderLanguageWatch() {
  stopPreheaderBurstSync();
  if (preheaderLanguageWatchUnsub) {
    preheaderLanguageWatchUnsub();
    preheaderLanguageWatchUnsub = null;
  }
  detachPreheaderLanguageObservers();
  detachPreheaderLanguageClickListener();
  lastPreheaderLanguageValue = null;
}

function attachPreheaderHostObserver(host) {
  detachPreheaderHostObserver();
  if (!host) return;
  preheaderHostObserver = new MutationObserver(() => {
    syncPreheaderHighlightState();
  });
  preheaderHostObserver.observe(host, { childList: true, subtree: true });
}

function detachPreheaderHostObserver() {
  if (!preheaderHostObserver) return;
  preheaderHostObserver.disconnect();
  preheaderHostObserver = null;
}

function attachPreheaderValueHook(textarea) {
  detachPreheaderValueHook();
  if (!textarea) return;

  const proto = HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (!desc || typeof desc.get !== "function" || typeof desc.set !== "function") return;

  preheaderValueHookTarget = textarea;
  const nativeGet = desc.get;
  const nativeSet = desc.set;

  Object.defineProperty(textarea, "value", {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      return nativeGet.call(this);
    },
    set(next) {
      const prev = nativeGet.call(this);
      nativeSet.call(this, next);
      if (String(prev ?? "") !== String(next ?? "")) {
        queuePreheaderHighlightRefresh();
      }
    }
  });
}

function detachPreheaderValueHook() {
  if (!preheaderValueHookTarget) return;
  const textarea = preheaderValueHookTarget;
  preheaderValueHookTarget = null;

  const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  if (!desc) return;
  try {
    Object.defineProperty(textarea, "value", {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () {
        return desc.get.call(this);
      },
      set: function (next) {
        desc.set.call(this, next);
      }
    });
  } catch (_) {
    try {
      delete textarea.value;
    } catch (_) {}
  }
}

function attachPreheaderHostListeners(host) {
  detachPreheaderHostListeners();
  if (!host) return;
  currentPreheaderHost = host;
  preheaderHostInputHandler = onPreheaderInput;
  host.addEventListener("input", preheaderHostInputHandler, true);
  host.addEventListener("change", preheaderHostInputHandler, true);
}

function detachPreheaderHostListeners() {
  if (currentPreheaderHost && preheaderHostInputHandler) {
    currentPreheaderHost.removeEventListener("input", preheaderHostInputHandler, true);
    currentPreheaderHost.removeEventListener("change", preheaderHostInputHandler, true);
  }
  currentPreheaderHost = null;
  preheaderHostInputHandler = null;
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
  window.removeEventListener("resize", pageViewportHandler);
  pageViewportHandler = null;
}

function schedulePreheaderTextareaRebuild() {
  if (textHighlightsPaused) return;
  if (preheaderScrollRaf) return;
  preheaderScrollRaf = requestAnimationFrame(() => {
    preheaderScrollRaf = null;
    const textarea = resolvePreheaderTextarea();
    if (!textarea || !textarea.isConnected) return;
    if (textarea !== currentPreheaderTextarea) {
      bindToPreheader(textarea);
      return;
    }
    ensurePreheaderOverlayShell(textarea);
    const shell = resolvePreheaderOverlayShell(textarea);
    if (!shell || !shell.isConnected) {
      highlightMatchesInPreheader();
      return;
    }
    rebuildPreheaderHighlightBoxes(textarea, { notify: false });
  });
}

function attachPageViewportListeners() {
  if (pageViewportHandler) return;
  pageViewportHandler = () => {
    if (textHighlightsPaused) return;
    debounceNamed("preheader", highlightMatchesInPreheader);
  };
  window.addEventListener("resize", pageViewportHandler);
}

function detachPreheaderTextareaListeners() {
  if (!currentPreheaderTextarea) return;
  currentPreheaderTextarea.removeEventListener("input", onPreheaderInput);
  currentPreheaderTextarea.removeEventListener("change", onPreheaderInput);
  currentPreheaderTextarea.removeEventListener("scroll", onPreheaderTextareaScroll);
  detachPreheaderValueHook();
}

function unbindPreheader() {
  detachPreheaderTextareaListeners();
  detachPreheaderHostListeners();
  detachPreheaderHostObserver();
  currentPreheaderTextarea = null;
  lastPreheaderValue = null;
  clearPreheaderOverlays();
}

function onPreheaderInput(event) {
  handlePreheaderTextareaEdit(event && event.target);
}

function onPreheaderTextareaScroll() {
  schedulePreheaderTextareaRebuild();
}

function bindToPreheader(textarea) {
  if (!textarea) {
    unbindPreheader();
    return;
  }

  const host = textarea.closest("cb-preheader");
  if (currentPreheaderTextarea === textarea && currentPreheaderHost === host) return;

  if (currentPreheaderTextarea) {
    detachPreheaderTextareaListeners();
    detachPreheaderHostListeners();
    detachPreheaderHostObserver();
  } else {
    const orphanWrap = textarea.closest(`.${PREHEADER_WRAP_CLASS}`);
    if (orphanWrap) {
      preheaderOverlayWrap = orphanWrap;
      clearPreheaderOverlayShells(orphanWrap);
    }
  }

  currentPreheaderTextarea = textarea;
  attachPreheaderHostListeners(host);
  attachPreheaderHostObserver(host);
  attachPreheaderValueHook(textarea);
  textarea.addEventListener("input", onPreheaderInput);
  textarea.addEventListener("change", onPreheaderInput);
  textarea.addEventListener("scroll", onPreheaderTextareaScroll, { passive: true });
  highlightMatchesInPreheader();
}

function watchPreheaderLifecycle() {
  if (preheaderLifecycleUnsub) {
    preheaderLifecycleUnsub();
    preheaderLifecycleUnsub = null;
  }

  const sync = () => {
    syncPreheaderHighlightState();
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
  installPreheaderEditWatch();
  watchPreheaderLanguageChanges();
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
  stopPreheaderLanguageWatch();
  removePreheaderEditWatch();
  if (iframeMutationObserver) {
    iframeMutationObserver.disconnect();
    iframeMutationObserver = null;
  }

  removeViewportListeners();
  removePageViewportListeners();
  if (preheaderScrollRaf) {
    cancelAnimationFrame(preheaderScrollRaf);
    preheaderScrollRaf = null;
  }
  unbindPreheader();
  if (textareaMirror) {
    textareaMirror.remove();
    textareaMirror = null;
  }

  clearOverlays();

  currentIframe = null;
  Object.keys(debounceTimers).forEach((key) => {
    clearTimeout(debounceTimers[key]);
    delete debounceTimers[key];
  });
}
