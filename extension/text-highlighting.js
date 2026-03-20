console.log("text-highlighting.js loaded");

// Global variables for dynamic configuration
let PLACEHOLDERS = [];

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

// Default highlight terms for first-time users
const DEFAULT_HIGHLIGHT_TERMS = {
  "(price)": { color: "rgba(245, 46, 132, 0.40)", isRegex: false },
  "\{\{[^”“‘’}]+\}\}": { color: "rgba(255, 230, 0, 0.40)", isRegex: true },
  "((\$|£)( |\xA0)?\d+|\d+( |\xA0)?€)": { color: "rgba(255, 230, 0, 0.40)", isRegex: true },
  "(name)": { color: "rgba(0, 180, 255, 0.40)", isRegex: false },
  "(LearnLangAll)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_a_ENG)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_ALL)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_l_ALL)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_d_ALL)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_d_l_ALL)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(Lernsprache_a_FRA)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(Lernsprache_fem_FRA)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_d_l_ITA)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(LearnLangAll)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_for_SWE)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_nominative)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_locative)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_genitive)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_adjective)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false },
  "(learnlang_locative_po)": { color: "rgba(120, 255, 120, 0.40)", isRegex: false }
};

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
      PLACEHOLDERS = Object.entries(highlightTerms).map(([term, termData]) => {
        // Handle both old format (string) and new format (object)
        const color = typeof termData === 'string' ? termData : termData.color;
        const isRegex = typeof termData === 'object' ? termData.isRegex : false;

        return {
          term: term,
          termLower: isRegex ? null : term.toLowerCase(), // Only lowercase for non-regex
          color: color,
          isRegex: isRegex,
          regex: isRegex ? compileRegex(term) : null
        };
      });

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
    let needsReinit = false;

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
      PLACEHOLDERS = Object.entries(changes.highlightTerms.newValue).map(([term, termData]) => {
        // Handle both old format (string) and new format (object)
        const color = typeof termData === 'string' ? termData : termData.color;
        const isRegex = typeof termData === 'object' ? termData.isRegex : false;

        return {
          term: term,
          termLower: isRegex ? null : term.toLowerCase(), // Only lowercase for non-regex
          color: color,
          isRegex: isRegex,
          regex: isRegex ? compileRegex(term) : null
        };
      });
      console.log("[Gem] Highlight terms updated, re-highlighting...");

      // Re-highlight existing content
      if (currentIframe) {
        debounce(() => highlightMatchesInIframe(currentIframe));
      }
    }
  }
});

// Load initial configuration
loadHighlightConfig();

// ---------------------------------------------

let overlayContainer = null;
let iframeMutationObserver = null;
let lifecycleObserver = null;
let debounceTimer = null;
let currentIframe = null;

// Simple debounce helper
function debounce(fn, delay = 150) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}

// Completely remove overlays (container stays or is recreated as needed)
function clearOverlays() {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
  }
}

// Ensure we have a single overlay container in the given document
function ensureOverlayContainer(doc) {
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

// MAIN highlight function
function highlightMatchesInIframe(iframe) {
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return;

  const win = doc.defaultView || iframe.contentWindow;
  if (!win) return;

  const container = ensureOverlayContainer(doc);

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

    for (const placeholder of PLACEHOLDERS) {
      const { term, termLower, color, isRegex, regex } = placeholder;

      if (isRegex && regex) {
        // Handle regex matching
        let match;
        while ((match = regex.exec(raw)) !== null) {
          const startIndex = match.index;
          const matchLength = match[0].length;

          // Create range for this match
          const range = doc.createRange();
          range.setStart(textNode, startIndex);
          range.setEnd(textNode, startIndex + matchLength);

          const rects = range.getClientRects();
          for (const rect of rects) {
            if (!rect.width || !rect.height) continue;

            const box = doc.createElement("div");
            box.className = "gem-text-highlight";
            Object.assign(box.style, {
              position: "absolute",
              left: (rect.left + scrollX - 1) + "px",
              top: (rect.top + scrollY - 1) + "px",
              width: rect.width + "px",
              height: rect.height + "px",
              background: color,
              boxShadow: "0 0 0 1px rgb(0 0 0 / 0.1), inset 0 0 0 1px rgb(0 0 0 / 0.3)",
              borderRadius: "4px",
              padding: "2px 1px",
              pointerEvents: "none"
            });

            container.appendChild(box);
          }

          range.detach();

          // Prevent infinite loops with zero-width matches
          if (matchLength === 0) {
            regex.lastIndex++;
          }
        }

        // Reset regex lastIndex for next text node
        regex.lastIndex = 0;

      } else if (termLower) {
        // Handle plain text matching (case-insensitive)
        const termLen = termLower.length;
        if (!termLen) continue;

        let startIndex = 0;
        while (true) {
          const index = raw.toLowerCase().indexOf(termLower, startIndex);
          if (index === -1) break;

          const range = doc.createRange();
          range.setStart(textNode, index);
          range.setEnd(textNode, index + termLen);

          const rects = range.getClientRects();
          for (const rect of rects) {
            if (!rect.width || !rect.height) continue;

            const box = doc.createElement("div");
            box.className = "gem-text-highlight";
            Object.assign(box.style, {
              position: "absolute",
              left: (rect.left + scrollX - 1) + "px",
              top: (rect.top + scrollY - 1) + "px",
              width: rect.width + "px",
              height: rect.height + "px",
              background: color,
              boxShadow: "0 0 0 1px rgb(0 0 0 / 0.1), inset 0 0 0 1px rgb(0 0 0 / 0.3)",
              borderRadius: "4px",
              padding: "2px 1px",
              pointerEvents: "none"
            });

            container.appendChild(box);
          }

          range.detach();
          startIndex = index + termLen;
        }
      }
    }
  }
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

  const obs = new MutationObserver(() => {
    if (tryReady()) obs.disconnect();
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true
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

// Called when iframe is found or re-added
function bindToIframe(iframe) {
  currentIframe = iframe;

  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return;

  // Initial highlight
  debounce(() => highlightMatchesInIframe(iframe));

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
    debounce(() => highlightMatchesInIframe(iframe));
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
  if (lifecycleObserver) {
    lifecycleObserver.disconnect();
    lifecycleObserver = null;
  }

  lifecycleObserver = new MutationObserver(() => {
    const iframe = document.querySelector(TARGET_IFRAME_SELECTOR);

    // Case 1: iframe disappeared
    if (!iframe && currentIframe) {
      currentIframe = null;
      clearOverlays();
      if (iframeMutationObserver) {
        iframeMutationObserver.disconnect();
        iframeMutationObserver = null;
      }
    }

    // Case 2: iframe re-added or changed instance
    if (iframe && iframe !== currentIframe) {
      waitForIframeReady(bindToIframe);
    }
  });

  lifecycleObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

// Initialize highlighting functionality
function initializeHighlighting() {
  // Start lifecycle watching + wait for first iframe
  watchIframeLifecycle();
  waitForIframeReady(bindToIframe);
}

// Disable highlighting functionality
function disableHighlighting() {
  // Disconnect observers
  if (lifecycleObserver) {
    lifecycleObserver.disconnect();
    lifecycleObserver = null;
  }
  if (iframeMutationObserver) {
    iframeMutationObserver.disconnect();
    iframeMutationObserver = null;
  }

  // Clear current overlays
  clearOverlays();

  // Reset state
  currentIframe = null;
  clearTimeout(debounceTimer);
  debounceTimer = null;
}
