console.log("[Gem] verticalnav-enhancer.js loaded");

function migrateLegacyFocusLayoutClass(root) {
  const el = root || document.documentElement;
  if (!el) return;
  if (el.classList.contains("gem-expanded")) {
    el.classList.remove("gem-expanded");
    el.classList.add("gem-focus-layout");
  }
  try {
    const body = document.body;
    if (body) {
      if (body.classList.contains("gem-expanded")) body.classList.remove("gem-expanded");
      if (body.classList.contains("gem-focus-layout")) {
        body.classList.remove("gem-focus-layout");
        el.classList.add("gem-focus-layout");
      }
    }
  } catch (_) {}
}

function waitForElement(selector, callback) {
  if (typeof gemDomWatchWaitFor === 'function') {
    gemDomWatchWaitFor(selector, callback);
    return;
  }

  const el = document.querySelector(selector);
  if (el) return callback(el);

  const obs = new MutationObserver(() => {
    const elNow = document.querySelector(selector);
    if (elNow) {
      obs.disconnect();
      callback(elNow);
    }
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function updateNavToggleIcons() {}

window.updateNavToggleIcons = updateNavToggleIcons;

function activateFocusLayout() {
  if (window.gemFocusLayout && typeof window.gemFocusLayout.setActive === 'function') {
    window.gemFocusLayout.setActive(true);
    return;
  }
  const root = document.documentElement;
  if (!root) return;
  migrateLegacyFocusLayoutClass(root);
  root.classList.add("gem-focus-layout");
}

function deactivateFocusLayout() {
  if (window.gemFocusLayout && typeof window.gemFocusLayout.setActive === 'function') {
    window.gemFocusLayout.setActive(false);
    return;
  }
  const root = document.documentElement;
  if (!root) return;
  root.classList.remove("gem-focus-layout");
  root.classList.remove("gem-focus-layout:full");
  try {
    if (document.body) {
      document.body.classList.remove("gem-focus-layout");
      document.body.classList.remove("gem-focus-layout:full");
    }
  } catch (_) {}
}

// Early boot script usually applies this at document_start; keep a sync restore
// here without waiting on Emarsys DOM.
chrome.storage.sync.get(
  { fullscreenActive: false, gemFocusLayoutType: 'full' },
  (settings) => {
    if (window.gemFocusLayout && typeof window.gemFocusLayout.setType === 'function') {
      window.gemFocusLayout.setType(settings.gemFocusLayoutType);
    }
    if (settings.fullscreenActive) {
      activateFocusLayout();
    } else {
      migrateLegacyFocusLayoutClass(document.documentElement);
      if (window.gemFocusLayout && typeof window.gemFocusLayout.setType === 'function') {
        window.gemFocusLayout.setType(settings.gemFocusLayoutType);
      }
    }
  }
);

chrome.storage.sync.get({ mobileViewVisible: true }, (settings) => {
  if (!settings.mobileViewVisible) {
    waitForElement("#gem-mobile-frame", (mobileFrame) => {
      chrome.storage.sync.get({ mobileViewVisible: true }, (current) => {
        if (current.mobileViewVisible === false) {
          mobileFrame.style.display = "none";
        }
      });
    });
  }
});

function initializeBlockSearchMonitoring() {
  let currentSearchInput = null;
  let currentSearchInputHandler = null;
  let searchScanScheduled = false;

  function updateSearchClass(searchInput) {
    const blockList = document.querySelector('cb-available-block-list');
    if (!blockList) return;

    const hasValue = searchInput && searchInput.value && searchInput.value.trim().length > 0;
    blockList.classList.toggle('gem-searching-block-list-active', !!hasValue);
  }

  function setupSearchInputMonitoring(searchInput) {
    if (currentSearchInput === searchInput) return;

    if (currentSearchInput && currentSearchInputHandler) {
      currentSearchInput.removeEventListener('input', currentSearchInputHandler);
      currentSearchInput.removeEventListener('change', currentSearchInputHandler);
    }

    currentSearchInput = searchInput;
    currentSearchInputHandler = function handleInput() {
      updateSearchClass(searchInput);
    };

    searchInput.addEventListener('input', currentSearchInputHandler);
    searchInput.addEventListener('change', currentSearchInputHandler);
    updateSearchClass(searchInput);
  }

  function findAndMonitorSearchInput() {
    const searchInput = document.querySelector('cb-available-block-list .e-contentblocks-blocktemplatelist .e-input');

    if (searchInput) {
      setupSearchInputMonitoring(searchInput);
      return;
    }

    if (currentSearchInput && currentSearchInputHandler) {
      currentSearchInput.removeEventListener('input', currentSearchInputHandler);
      currentSearchInput.removeEventListener('change', currentSearchInputHandler);
    }
    currentSearchInput = null;
    currentSearchInputHandler = null;

    const blockList = document.querySelector('cb-available-block-list');
    if (blockList) {
      blockList.classList.remove('gem-searching-block-list-active');
    }
  }

  function scheduleSearchInputScan() {
    if (searchScanScheduled) return;
    searchScanScheduled = true;
    requestAnimationFrame(() => {
      searchScanScheduled = false;
      findAndMonitorSearchInput();
    });
  }

  if (typeof gemDomWatchSubscribe === 'function') {
    gemDomWatchSubscribe((mutations) => {
      const shouldRescan = mutations.some((mutation) => {
        if (mutation.type !== 'childList') return false;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });
      if (shouldRescan) scheduleSearchInputScan();
    });
  } else {
    const observer = new MutationObserver((mutations) => {
      const shouldRescan = mutations.some((mutation) => {
        if (mutation.type !== 'childList') return false;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });
      if (shouldRescan) scheduleSearchInputScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  findAndMonitorSearchInput();
}

initializeBlockSearchMonitoring();
