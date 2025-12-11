console.log("toggle-page-elements.js loaded");

// Toggle page elements based on user settings
// Currently handles: Finish Editing Button (cb-save-button)

function initializePageElementToggling() {
  console.log("[Gem] Initializing page element toggling...");

  // Load initial settings and apply them
  chrome.storage.sync.get({ showFinishEditingBtn: true }, (settings) => {
    console.log("[Gem] Loaded page element settings:", settings);

    // Apply initial state
    applyFinishEditingButtonState(settings.showFinishEditingBtn);

    // Start monitoring for the element
    monitorFinishEditingButton(settings.showFinishEditingBtn);
  });

  // Listen for setting changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.showFinishEditingBtn) {
      const newValue = changes.showFinishEditingBtn.newValue;
      console.log("[Gem] Finish editing button setting changed to:", newValue);
      applyFinishEditingButtonState(newValue);
    }
  });
}

// Apply the finish editing button visibility state
function applyFinishEditingButtonState(shouldShow) {
  const button = document.querySelector('cb-save-button');
  if (button) {
    button.style.display = shouldShow ? '' : 'none';
    console.log("[Gem] Applied finish editing button state:", shouldShow ? 'visible' : 'hidden');
  } else {
    console.log("[Gem] Finish editing button not found for state application");
  }
}

// Monitor for the finish editing button appearing in the DOM
function monitorFinishEditingButton(shouldShow) {
  console.log("[Gem] Starting to monitor for finish editing button...");

  // Check for existing button
  const existingButton = document.querySelector('cb-save-button');
  if (existingButton) {
    applyFinishEditingButtonState(shouldShow);
  }

  // Monitor for new buttons being added
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if this node is the finish editing button
          if (node.tagName === 'CB-SAVE-BUTTON') {
            console.log("[Gem] Finish editing button detected in DOM");
            applyFinishEditingButtonState(shouldShow);
          }

          // Also check children of added nodes
          const buttons = node.querySelectorAll ? node.querySelectorAll('cb-save-button') : [];
          buttons.forEach(button => {
            console.log("[Gem] Finish editing button detected in added subtree");
            applyFinishEditingButtonState(shouldShow);
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also periodically check for the button (in case it gets replaced or modified)
  setInterval(() => {
    const button = document.querySelector('cb-save-button');
    if (button) {
      const currentDisplay = button.style.display;
      const expectedDisplay = shouldShow ? '' : 'none';

      // Reload current setting to ensure we have the latest state
      chrome.storage.sync.get({ showFinishEditingBtn: true }, (settings) => {
        const expectedDisplay = settings.showFinishEditingBtn ? '' : 'none';
        if (currentDisplay !== expectedDisplay) {
          console.log("[Gem] Periodic check found mismatched finish editing button state, correcting...");
          applyFinishEditingButtonState(settings.showFinishEditingBtn);
        }
      });
    }
  }, 2000); // Check every 2 seconds
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePageElementToggling);
} else {
  initializePageElementToggling();
}
