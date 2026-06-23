console.log("[gem] condensed-blocks-panel.js loaded");

const CONDENSED_SELECTOR = "main.e-layout__content section.e-contentblocks-navigation_section";
let condensedUnsub = null;
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
  if (condensedUnsub) return;

  condensedUnsub = window.gemDomWatchSubscribe(function () {
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      return;
    }

    chrome.storage.sync.get({ blocksPanelLayout: "2" }, (settings) => {
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
}

function stopObserver() {
  if (condensedUnsub) {
    condensedUnsub();
    condensedUnsub = null;
  }
}

function cleanupCondensedBlocks() {
  stopObserver();
}

function applyCondensedSetting(layout) {
  removeAllCondensedClasses();

  if (layout === "2" || layout === "3") {
    ensureObserver();
    addCondensedClass(layout);
  } else {
    stopObserver();
  }
}

chrome.storage.sync.get({ blocksPanelLayout: "2" }, (settings) => {
  applyCondensedSetting(settings.blocksPanelLayout);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.blocksPanelLayout) {
    applyCondensedSetting(changes.blocksPanelLayout.newValue);
  }
});

window.addEventListener('unload', cleanupCondensedBlocks);
window.addEventListener('beforeunload', cleanupCondensedBlocks);
