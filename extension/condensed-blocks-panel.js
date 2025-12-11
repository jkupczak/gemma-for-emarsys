console.log("[gem] condensed-blocks-panel.js loaded");

const CONDENSED_SELECTOR = "cb-available-block-list .block-templates";
let condensedObserver = null;
let condensedEnabled = false;

function addCondensedClass() {
  const nodes = document.querySelectorAll(CONDENSED_SELECTOR);
  nodes.forEach((el) => el.classList.add("gem-enhanced-blocks-panel"));
}

function removeCondensedClass() {
  const nodes = document.querySelectorAll(CONDENSED_SELECTOR);
  nodes.forEach((el) => el.classList.remove("gem-enhanced-blocks-panel"));
}

function ensureObserver() {
  if (condensedObserver) return;

  condensedObserver = new MutationObserver(() => {
    if (!condensedEnabled) return;
    addCondensedClass();
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

function applyCondensedSetting(enable) {
  condensedEnabled = enable;

  if (condensedEnabled) {
    ensureObserver();
    addCondensedClass();
  } else {
    removeCondensedClass();
    stopObserver();
  }
}

// Initial load
chrome.storage.sync.get({ enableCondensedBlocksPanel: true }, (settings) => {
  applyCondensedSetting(settings.enableCondensedBlocksPanel);
});

// React to setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.enableCondensedBlocksPanel) {
    applyCondensedSetting(changes.enableCondensedBlocksPanel.newValue);
  }
});

