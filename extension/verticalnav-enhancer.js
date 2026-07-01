console.log("[Gem] verticalnav-enhancer.js loaded");

// Check if fullscreen was active on previous page load and restore it
chrome.storage.sync.get({ fullscreenActive: false }, (settings) => {
  console.log("[Gem] Fullscreen check - settings:", settings);
  console.log("[Gem] Fullscreen check - fullscreenActive:", settings.fullscreenActive);

  if (settings.fullscreenActive) {
    console.log("[Gem] Fullscreen was active, waiting for content element...");

    // Wait for the content element to be available before activating fullscreen
    waitForElement("main.e-layout__content", (contentElement) => {
      console.log("[Gem] Content element now available, activating fullscreen...");
      activateFullscreenMode();
      updateNavToggleIcons();
    });
  } else {
    console.log("[Gem] Fullscreen was not active, skipping activation");
    updateNavToggleIcons();
  }
});

// Check if mobile view was visible on previous page load and restore it
chrome.storage.sync.get({ mobileViewVisible: true }, (settings) => {
  console.log("[Gem] Mobile view check - settings:", settings);
  console.log("[Gem] Mobile view check - mobileViewVisible:", settings.mobileViewVisible);

  if (!settings.mobileViewVisible) {
    console.log("[Gem] Mobile view was hidden, waiting for mobile frame...");

    // Wait for the mobile frame to be available before hiding it. Re-read storage
    // when the frame appears — the user may have shown the pane (shortcut/button)
    // before this callback runs, and we must not clobber that with a stale hide.
    waitForElement("#gem-mobile-frame", (mobileFrame) => {
      chrome.storage.sync.get({ mobileViewVisible: true }, (current) => {
        if (current.mobileViewVisible === false) {
          console.log("[Gem] Mobile frame found, hiding mobile view (storage still hidden)...");
          mobileFrame.style.display = "none";
        } else {
          console.log("[Gem] Mobile frame found; storage says visible — not forcing hide");
        }
        updateNavToggleIcons();
      });
    });
  } else {
    console.log("[Gem] Mobile view was visible, keeping default state");
    updateNavToggleIcons();
  }
});

// ------------------------------------------------------------
// verticalnav-enhancer.js
// Injects gear + expand icons into <e-verticalnav-menu>
// ------------------------------------------------------------

const EXPAND_ICON_OFF = '&#61658;';
const EXPAND_ICON_ON = '&#61618;';
const MOBILE_ICON_OFF = '&#61747;';
const MOBILE_ICON_ON = '&#61746;';

function getExpandSvg(iconEntity = EXPAND_ICON_OFF) {
  return `
    <div class="gem-e-verticalnavitem"><e-tooltip placement="right" content="Focus Editor (` + window.GEM_MOD_KEY + `+Shift+F)" role="tooltip" aria-description="Focus Editor">
      <div class="e-verticalnavitem__icon e-svgclickfix">
        <gem-e-icon icon="mediadb"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon gem-expand-icon-glyph">${iconEntity}</div></div></gem-e-icon>
      </div>
    </e-tooltip></div>
  `;
}

function getMobileSvg(iconEntity = MOBILE_ICON_OFF) {
  return `
    <div class="gem-e-verticalnavitem"><e-tooltip placement="right" content="Mobile Sidepanel (` + window.GEM_MOD_KEY + `+Shift+M)" role="tooltip" aria-description="Mobile Sidepanel">
      <div class="e-verticalnavitem__icon e-svgclickfix">
        <gem-e-icon icon="mediadb"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon gem-mobile-icon-glyph">${iconEntity}</div></div></gem-e-icon>
      </div>
    </e-tooltip></div>
  `;
}

function isMobileViewVisible() {
  if (typeof window.gemGetMobilePreviewUserVisible === "function") {
    return window.gemGetMobilePreviewUserVisible();
  }
  const mobileFrame = document.getElementById("gem-mobile-frame");
  if (!mobileFrame) return true;
  return mobileFrame.style.display !== "none";
}

function updateNavToggleIcons() {
  const expandGlyph = document.querySelector('.gem-expand-icon-glyph');
  if (expandGlyph) {
    const isExpanded = !!(document.body && document.body.classList.contains("gem-expanded"));
    expandGlyph.innerHTML = isExpanded ? EXPAND_ICON_ON : EXPAND_ICON_OFF;
  }

  const mobileGlyph = document.querySelector('.gem-mobile-icon-glyph');
  if (mobileGlyph) {
    mobileGlyph.innerHTML = isMobileViewVisible() ? MOBILE_ICON_ON : MOBILE_ICON_OFF;
  }
}

// ------------------------------------------------------------
// Utility: wait for an element to appear
// ------------------------------------------------------------
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

function setupNavToggleIconObservers() {
  if (window.__gemNavToggleIconObserversInstalled) return;
  window.__gemNavToggleIconObserversInstalled = true;

  const body = document.body;
  if (body) {
    const onBodyClassChange = (mutations) => {
      const classChanged = mutations.some((mutation) =>
        mutation.type === 'attributes' && mutation.attributeName === 'class'
      );
      if (classChanged) {
        updateNavToggleIcons();
      }
    };

    if (typeof gemDomWatchObserveAttributes === 'function') {
      gemDomWatchObserveAttributes(body, onBodyClassChange, ['class']);
    } else {
      const bodyObserver = new MutationObserver(onBodyClassChange);
      bodyObserver.observe(body, {
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  waitForElement("#gem-mobile-frame", (mobileFrame) => {
    updateNavToggleIcons();

    const mobileFrameObserver = new MutationObserver((mutations) => {
      const displayChanged = mutations.some((mutation) =>
        mutation.type === 'attributes' &&
        (mutation.attributeName === 'style' || mutation.attributeName === 'class')
      );
      if (displayChanged) {
        updateNavToggleIcons();
      }
    });

    mobileFrameObserver.observe(mobileFrame, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  });
}

// ------------------------------------------------------------
// Create icon container
// ------------------------------------------------------------
function createIconBar() {
  const bar = document.createElement("div");
  bar.className = "gem-nav-icons";

  Object.assign(bar.style, {
    display: "flex",
    alignItems: "center",
    padding: "8px 0 12px",
    color: "#666",
    userSelect: "none", 
    flexDirection: "column",
    width: "inherit",
    position: "absolute",
    bottom: "0",
    borderTop: "1px solid var(--token-box-default-border)",
  });
  const expand = document.createElement("div");
  expand.innerHTML = getExpandSvg();
  Object.assign(expand.style, {
    cursor: "pointer",
    order: "3",
    width: "100%",
    textAlign: "center",
    padding: "10px 0"
  });
  expand.addEventListener("click", () => {
    console.log("[Gem] Expand button clicked");

    const content = document.querySelector("body");
    console.log("[Gem] Expand click - Content element found:", content);

    if (content) {
      const wasExpanded = content.classList.contains("gem-expanded");
      console.log("[Gem] Expand click - Was expanded:", wasExpanded);

      content.classList.toggle("gem-expanded");

      const isNowExpanded = content.classList.contains("gem-expanded");
      console.log("[Gem] Expand click - Now expanded:", isNowExpanded);
      updateNavToggleIcons();

      // Store the fullscreen state
      chrome.storage.sync.set({ fullscreenActive: isNowExpanded }, () => {
        console.log("[Gem] Expand click - State saved to storage:", isNowExpanded);
      });

    } else {
      console.log("[Gem] Expand click - ERROR: Could not find content element");
    }
  });

  const mobile = document.createElement("div");
  mobile.className = "gem-mobile-nav-toggle";
  mobile.innerHTML = getMobileSvg();
  Object.assign(mobile.style, {
    cursor: "pointer",
    order: "2",
    width: "100%",
    textAlign: "center",
    padding: "10px 0"
  });
  mobile.addEventListener("click", () => {
    console.log("[Gem] Mobile button clicked");

    const toggled = typeof window.gemToggleMobilePreview === "function" && window.gemToggleMobilePreview();
    if (!toggled && typeof window.gemIsMobilePreviewToggleBlocked === "function" && window.gemIsMobilePreviewToggleBlocked()) {
      console.log("[Gem] Mobile click ignored — Inbox Preview is active");
    }
  });

  bar.appendChild(expand);
  bar.appendChild(mobile);
  updateNavToggleIcons();
  if (typeof window.gemUpdateMobilePreviewToggleUi === "function") {
    window.gemUpdateMobilePreviewToggleUi();
  }

  return bar;
}

window.updateNavToggleIcons = updateNavToggleIcons;

// ------------------------------------------------------------
// Inject UI into <e-verticalnav-menu>
// ------------------------------------------------------------
function injectIcons(menu) {
  if (menu.querySelector(".gem-nav-icons")) {
    // Avoid double injecting
    return;
  }

  const iconBar = createIconBar();
  menu.appendChild(iconBar);
}

// ------------------------------------------------------------
// Fullscreen mode activation/deactivation functions
// ------------------------------------------------------------
function activateFullscreenMode() {
  console.log("[Gem] activateFullscreenMode() called");

  const content = document.querySelector("body");
  console.log("[Gem] Content element found:", content);

  if (content) {
    const alreadyExpanded = content.classList.contains("gem-expanded");
    console.log("[Gem] Content already expanded:", alreadyExpanded);

    if (!alreadyExpanded) {
      content.classList.add("gem-expanded");
      console.log("[Gem] Fullscreen mode activated - class added");
      updateNavToggleIcons();

    } else {
      console.log("[Gem] Fullscreen mode already active - skipping");
    }
  } else {
    console.log("[Gem] ERROR: Could not find main.e-layout__content element");
  }
}

function deactivateFullscreenMode() {
  console.log("[Gem] deactivateFullscreenMode() called");

  const content = document.querySelector("body");
  console.log("[Gem] Content element found:", content);

  if (content) {
    const isExpanded = content.classList.contains("gem-expanded");
    console.log("[Gem] Content currently expanded:", isExpanded);

    if (isExpanded) {
      content.classList.remove("gem-expanded");
      console.log("[Gem] Fullscreen mode deactivated - class removed");
      updateNavToggleIcons();

    } else {
      console.log("[Gem] Fullscreen mode already inactive - skipping");
    }
  } else {
    console.log("[Gem] ERROR: Could not find main.e-layout__content element");
  }
}

// ------------------------------------------------------------
// Block search monitoring
// ------------------------------------------------------------
function initializeBlockSearchMonitoring() {
  console.log("[Gem] Initializing block search monitoring");

  let currentSearchInput = null;
  let currentSearchInputHandler = null;
  let searchScanScheduled = false;

  // Function to update the search class based on input value
  function updateSearchClass(searchInput) {
    const blockList = document.querySelector('cb-available-block-list');
    if (!blockList) return;

    const hasValue = searchInput && searchInput.value && searchInput.value.trim().length > 0;

    if (hasValue) {
      blockList.classList.add('gem-searching-block-list-active');
      console.log("[Gem] Added gem-searching-block-list-active class");
    } else {
      blockList.classList.remove('gem-searching-block-list-active');
      console.log("[Gem] Removed gem-searching-block-list-active class");
    }
  }

  // Function to setup search input monitoring
  function setupSearchInputMonitoring(searchInput) {
    if (currentSearchInput === searchInput) return; // Already monitoring this input

    // Clean up previous monitoring
    if (currentSearchInput && currentSearchInputHandler) {
      currentSearchInput.removeEventListener('input', currentSearchInputHandler);
      currentSearchInput.removeEventListener('change', currentSearchInputHandler);
    }

    currentSearchInput = searchInput;
    currentSearchInputHandler = function handleInput() {
      updateSearchClass(searchInput);
    };

    // Add event listeners
    searchInput.addEventListener('input', currentSearchInputHandler);
    searchInput.addEventListener('change', currentSearchInputHandler);

    // Check initial state
    updateSearchClass(searchInput);

    console.log("[Gem] Set up search input monitoring");
  }

  // Function to find and monitor the search input
  function findAndMonitorSearchInput() {
    const searchInput = document.querySelector('cb-available-block-list .e-contentblocks-blocktemplatelist .e-input');

    if (searchInput) {
      console.log("[Gem] Found block search input, setting up monitoring");
      setupSearchInputMonitoring(searchInput);
    } else {
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
  }

  function scheduleSearchInputScan() {
    if (searchScanScheduled) return;
    searchScanScheduled = true;
    requestAnimationFrame(() => {
      searchScanScheduled = false;
      findAndMonitorSearchInput();
    });
  }

  // Watch for the search input to appear in the DOM
  if (typeof gemDomWatchSubscribe === 'function') {
    gemDomWatchSubscribe((mutations) => {
      const shouldRescan = mutations.some((mutation) => {
        if (mutation.type !== 'childList') return false;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });
      if (shouldRescan) {
        scheduleSearchInputScan();
      }
    });
  } else {
    const observer = new MutationObserver((mutations) => {
      const shouldRescan = mutations.some((mutation) => {
        if (mutation.type !== 'childList') return false;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });
      if (shouldRescan) {
        scheduleSearchInputScan();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Check for existing search input
  findAndMonitorSearchInput();

  console.log("[Gem] Block search monitoring initialized");
}

// ------------------------------------------------------------
// Watch for nav menu appearing or being replaced
// ------------------------------------------------------------
waitForElement("e-verticalnav-menu", (menu) => {
  console.log("[Gem] Navigation menu found, injecting icons");
  injectIcons(menu);
  setupNavToggleIconObservers();
  updateNavToggleIcons();

  // Also re-inject if the menu is replaced in DOM
  if (typeof gemDomWatchSubscribe === 'function') {
    gemDomWatchSubscribe(() => {
      const newMenu = document.querySelector("e-verticalnav-menu");
      if (newMenu && !newMenu.querySelector(".gem-nav-icons")) {
        console.log("[Gem] Navigation menu changed, re-injecting icons");
        injectIcons(newMenu);
        updateNavToggleIcons();
      }
    });
  } else {
    const obs = new MutationObserver(() => {
      const newMenu = document.querySelector("e-verticalnav-menu");
      if (newMenu && !newMenu.querySelector(".gem-nav-icons")) {
        console.log("[Gem] Navigation menu changed, re-injecting icons");
        injectIcons(newMenu);
        updateNavToggleIcons();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
});

// Initialize block search monitoring
initializeBlockSearchMonitoring();
