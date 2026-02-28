console.log("verticalnav-enhancer.js loaded");

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
    });
  } else {
    console.log("[Gem] Fullscreen was not active, skipping activation");
  }
});

// Check if mobile view was visible on previous page load and restore it
chrome.storage.sync.get({ mobileViewVisible: true }, (settings) => {
  console.log("[Gem] Mobile view check - settings:", settings);
  console.log("[Gem] Mobile view check - mobileViewVisible:", settings.mobileViewVisible);

  if (!settings.mobileViewVisible) {
    console.log("[Gem] Mobile view was hidden, waiting for mobile frame...");

    // Wait for the mobile frame to be available before hiding it
    waitForElement("#gem-mobile-frame", (mobileFrame) => {
      console.log("[Gem] Mobile frame found, hiding mobile view...");
      mobileFrame.style.display = "none";
    });
  } else {
    console.log("[Gem] Mobile view was visible, keeping default state");
  }
});

// ------------------------------------------------------------
// verticalnav-enhancer.js
// Injects gear + expand icons into <e-verticalnav-menu>
// ------------------------------------------------------------

const EXPAND_SVG = `
  <e-tooltip placement="right" content="Expand View (` + window.GEM_MOD_KEY + `+Shift+f)" role="tooltip" aria-description="Expand View">
    <svg style="vertical-align:middle" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="var(--token-tab-selected-text)"><path d="M120-120v-240h80v104l124-124 56 56-124 124h104v80H120Zm480 0v-80h104L580-324l56-56 124 124v-104h80v240H600ZM324-580 200-704v104h-80v-240h240v80H256l124 124-56 56Zm312 0-56-56 124-124H600v-80h240v240h-80v-104L636-580Z"/></svg>
  </e-tooltip>
`;

const MOBILE_SVG = `
  <e-tooltip placement="right" content="Mobile View (` + window.GEM_MOD_KEY + `+/)" role="tooltip" aria-description="Mobile View">
    <svg style="vertical-align:middle" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="var(--token-tab-selected-text)"><path d="M280-40q-33 0-56.5-23.5T200-120v-720q0-33 23.5-56.5T280-920h400q33 0 56.5 23.5T760-840v124q18 7 29 22t11 34v80q0 19-11 34t-29 22v404q0 33-23.5 56.5T680-40H280Zm0-80h400v-720H280v720Zm0 0v-720 720Zm120-40h160q17 0 28.5-11.5T600-200q0-17-11.5-28.5T560-240H400q-17 0-28.5 11.5T360-200q0 17 11.5 28.5T400-160Z"/></svg>
  </e-tooltip>
`

// ------------------------------------------------------------
// Utility: wait for an element to appear
// ------------------------------------------------------------
function waitForElement(selector, callback) {
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
  expand.innerHTML = EXPAND_SVG;
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

      // Store the fullscreen state
      chrome.storage.sync.set({ fullscreenActive: isNowExpanded }, () => {
        console.log("[Gem] Expand click - State saved to storage:", isNowExpanded);
      });

    } else {
      console.log("[Gem] Expand click - ERROR: Could not find content element");
    }
  });

  const mobile = document.createElement("div");
  mobile.innerHTML = MOBILE_SVG;
  Object.assign(mobile.style, {
    cursor: "pointer",
    order: "2",
    width: "100%",
    textAlign: "center",
    padding: "10px 0"
  });
  mobile.addEventListener("click", () => {
    console.log("[Gem] Mobile button clicked");

    const mobileFrame = document.getElementById("gem-mobile-frame");
    console.log("[Gem] Mobile click - Mobile frame found:", mobileFrame);

    if (mobileFrame) {
      const isVisible = mobileFrame.style.display !== "none";
      console.log("[Gem] Mobile click - Was visible:", isVisible);

      mobileFrame.style.display = isVisible ? "none" : "block";

      const isNowVisible = mobileFrame.style.display !== "none";
      console.log("[Gem] Mobile click - Now visible:", isNowVisible);

      // Store the mobile view visibility state
      chrome.storage.sync.set({ mobileViewVisible: isNowVisible }, () => {
        console.log("[Gem] Mobile click - State saved to storage:", isNowVisible);
      });
    } else {
      console.log("[Gem] Mobile click - ERROR: Could not find #gem-mobile-frame element");
    }
  });

  bar.appendChild(expand);
  bar.appendChild(mobile);

  return bar;
}

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
    if (currentSearchInput) {
      currentSearchInput.removeEventListener('input', handleInput);
      currentSearchInput.removeEventListener('change', handleInput);
    }

    currentSearchInput = searchInput;

    // Function to handle input changes
    function handleInput() {
      updateSearchClass(searchInput);
    }

    // Add event listeners
    searchInput.addEventListener('input', handleInput);
    searchInput.addEventListener('change', handleInput);

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
      console.log("[Gem] Block search input not found");
    }
  }

  // Watch for the search input to appear in the DOM
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node contains the search input
            const searchInput = node.querySelector ?
              node.querySelector('cb-available-block-list .e-contentblocks-blocktemplatelist .e-input') :
              null;

            if (searchInput) {
              console.log("[Gem] Search input appeared in DOM");
              setupSearchInputMonitoring(searchInput);
            }

            // Also check if the node itself is the search input
            if (node.matches && node.matches('cb-available-block-list .e-contentblocks-blocktemplatelist .e-input')) {
              console.log("[Gem] Search input node added directly");
              setupSearchInputMonitoring(node);
            }
          }
        });

        // Check if the search input was removed
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && node.matches('cb-available-block-list .e-contentblocks-blocktemplatelist .e-input')) {
              console.log("[Gem] Search input removed from DOM");
              if (currentSearchInput === node) {
                currentSearchInput = null;
                // Remove the class when search input is removed
                const blockList = document.querySelector('cb-available-block-list');
                if (blockList) {
                  blockList.classList.remove('gem-searching-block-list-active');
                }
              }
            }
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

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

  // Also re-inject if the menu is replaced in DOM
  const obs = new MutationObserver(() => {
    const newMenu = document.querySelector("e-verticalnav-menu");
    if (newMenu && !newMenu.querySelector(".gem-nav-icons")) {
      console.log("[Gem] Navigation menu changed, re-injecting icons");
      injectIcons(newMenu);
    }
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
});

// Initialize block search monitoring
initializeBlockSearchMonitoring();
