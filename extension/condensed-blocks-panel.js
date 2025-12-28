console.log("[gem] condensed-blocks-panel.js loaded");

const CONDENSED_SELECTOR = "main.e-layout__content section.e-contentblocks-navigation_section";
let condensedObserver = null;
let condensedEnabled = false;

function addCondensedClass(layout) {
  const nodes = document.querySelectorAll(CONDENSED_SELECTOR);
  nodes.forEach((el) => {
    el.classList.add("gem-enhanced-blocks-panel");
    if (layout === "2") {
      el.classList.add("gem-enhanced-blocks-panel--2");
    } else if (layout === "3") {
      el.classList.add("gem-enhanced-blocks-panel--3");
    }
  });
}

function removeAllCondensedClasses() {
  const nodes = document.querySelectorAll(CONDENSED_SELECTOR);
  nodes.forEach((el) => {
    el.classList.remove("gem-enhanced-blocks-panel");
    el.classList.remove("gem-enhanced-blocks-panel--2");
    el.classList.remove("gem-enhanced-blocks-panel--3");
  });
}

function ensureObserver() {
  if (condensedObserver) return;

  condensedObserver = new MutationObserver(() => {
    // Check if chrome APIs are available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      return;
    }

    // Get current layout setting and reapply classes
    chrome.storage.sync.get({ blocksPanelLayout: "2" }, (settings) => {
      // Check again if chrome APIs are still available after async call
      if (!chrome || !chrome.storage || !chrome.storage.sync) {
        console.warn("[Gem] Chrome storage API became unavailable during async call");
        return;
      }

      const layout = settings.blocksPanelLayout;
      if (layout === "2" || layout === "3") {
        addCondensedClass(layout);
      }
    });
  });

  condensedObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function stopObserver() {
  if (condensedObserver) {
    condensedObserver.disconnect();
    condensedObserver = null;
  }
}

// Cleanup function for when page unloads
function cleanupCondensedBlocks() {
  stopObserver();
}

function applyCondensedSetting(layout) {
  // Remove all existing classes first
  removeAllCondensedClasses();

  if (layout === "2" || layout === "3") {
    ensureObserver();
    addCondensedClass(layout);
  } else {
    stopObserver();
  }
}

// Initial load
chrome.storage.sync.get({ blocksPanelLayout: "2" }, (settings) => {
  applyCondensedSetting(settings.blocksPanelLayout);
});

// React to setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.blocksPanelLayout) {
    applyCondensedSetting(changes.blocksPanelLayout.newValue);
  }
});

// Clean up observers when page unloads to prevent "Extension context invalidated" errors
window.addEventListener('unload', cleanupCondensedBlocks);
window.addEventListener('beforeunload', cleanupCondensedBlocks);

