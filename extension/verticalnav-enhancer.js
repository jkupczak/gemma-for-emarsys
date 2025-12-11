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
    console.log("[Gem] Mobile view was hidden, waiting for iframe wrapper...");

    // Wait for the iframe wrapper to be available before hiding it
    waitForElement(".gem-iframe-wrapper", (iframeWrapper) => {
      console.log("[Gem] Iframe wrapper found, hiding mobile view...");
      iframeWrapper.style.display = "none";
    });
  } else {
    console.log("[Gem] Mobile view was visible, keeping default state");
  }
});

// ------------------------------------------------------------
// verticalnav-enhancer.js
// Injects gear + expand icons into <e-verticalnav-menu>
// ------------------------------------------------------------

// Optional SVG icons (clean, lightweight)
const GEAR_SVG = `
<svg style="vertical-align:middle" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#773dfd"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/></svg>
`;

const EXPAND_SVG = `
  <svg style="vertical-align:middle" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#773dfd"><path d="M120-120v-240h80v104l124-124 56 56-124 124h104v80H120Zm480 0v-80h104L580-324l56-56 124 124v-104h80v240H600ZM324-580 200-704v104h-80v-240h240v80H256l124 124-56 56Zm312 0-56-56 124-124H600v-80h240v240h-80v-104L636-580Z"/></svg>
`;

const MOBILE_SVG = `
  <svg style="vertical-align:middle" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#773dfd"><path d="M280-40q-33 0-56.5-23.5T200-120v-720q0-33 23.5-56.5T280-920h400q33 0 56.5 23.5T760-840v124q18 7 29 22t11 34v80q0 19-11 34t-29 22v404q0 33-23.5 56.5T680-40H280Zm0-80h400v-720H280v720Zm0 0v-720 720Zm120-40h160q17 0 28.5-11.5T600-200q0-17-11.5-28.5T560-240H400q-17 0-28.5 11.5T360-200q0 17 11.5 28.5T400-160Z"/></svg>
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

    const iframeWrapper = document.querySelector(".gem-iframe-wrapper");
    console.log("[Gem] Mobile click - Iframe wrapper found:", iframeWrapper);

    if (iframeWrapper) {
      const isVisible = iframeWrapper.style.display !== "none";
      console.log("[Gem] Mobile click - Was visible:", isVisible);

      iframeWrapper.style.display = isVisible ? "none" : "block";

      const isNowVisible = iframeWrapper.style.display !== "none";
      console.log("[Gem] Mobile click - Now visible:", isNowVisible);

      // Store the mobile view visibility state
      chrome.storage.sync.set({ mobileViewVisible: isNowVisible }, () => {
        console.log("[Gem] Mobile click - State saved to storage:", isNowVisible);
      });
    } else {
      console.log("[Gem] Mobile click - ERROR: Could not find .gem-iframe-wrapper element");
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

