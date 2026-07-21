console.log("[Gem] verticalnav-enhancer.js loaded");

function migrateLegacyFocusLayoutClass(body) {
  if (!body) return;
  if (body.classList.contains("gem-expanded")) {
    body.classList.remove("gem-expanded");
    body.classList.add("gem-focus-layout");
  }
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
  const content = document.querySelector("body");
  if (!content) return;

  migrateLegacyFocusLayoutClass(content);
  if (!content.classList.contains("gem-focus-layout")) {
    content.classList.add("gem-focus-layout");
  }
}

function deactivateFocusLayout() {
  const content = document.querySelector("body");
  if (!content) return;
  if (content.classList.contains("gem-focus-layout")) {
    content.classList.remove("gem-focus-layout");
  }
}

chrome.storage.sync.get({ fullscreenActive: false }, (settings) => {
  if (settings.fullscreenActive) {
    waitForElement("main.e-layout__content", () => {
      activateFocusLayout();
    });
  }
});

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
