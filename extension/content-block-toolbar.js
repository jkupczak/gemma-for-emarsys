console.log("[gem] content-block-toolbar.js loaded");

// Content Block Toolbar management - CSS-only approach
function initializeContentBlockToolbar() {
  console.log("[gem] Initializing content block toolbar management");

  // Apply initial settings as CSS classes on body
  applyToolbarSettingsAsClasses();

  // Watch for setting changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "sync") return;

    // Check if chrome APIs are still available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      return;
    }

    // Check if any toolbar settings changed
    const toolbarSettings = [
      'manageOptionalContent',
      'predictRecommendationSettings',
      'productFinder',
      'productSource',
      'saveToReuse',
      'resetBlock'
    ];

    const hasToolbarChange = toolbarSettings.some(setting =>
      changes.hasOwnProperty(setting)
    );

    if (hasToolbarChange) {
      console.log("[gem] Toolbar settings changed, reapplying CSS classes");
      applyToolbarSettingsAsClasses();
    }
  });
}

function applyToolbarSettingsAsClasses() {
  chrome.storage.sync.get({
    manageOptionalContent: "hide-if-disabled",
    predictRecommendationSettings: "hide-if-disabled",
    productFinder: "always-show",
    productSource: "hide-if-disabled",
    saveToReuse: "always-show",
    resetBlock: "always-show"
  }, (settings) => {
    console.log("[gem] Applying toolbar settings as CSS classes:", settings);

    // Remove all existing toolbar classes
    document.body.classList.forEach(className => {
      if (className.startsWith('gem-toolbar-')) {
        document.body.classList.remove(className);
      }
    });

    // Add classes based on settings
    Object.entries(settings).forEach(([setting, value]) => {
      document.body.classList.add(`gem-toolbar-${setting}-${value}`);
    });
  });
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentBlockToolbar);
} else {
  initializeContentBlockToolbar();
}
