console.log("[Gem] welcome-modal.js loaded");

// Helper function to create modal HTML
function createWelcomeModalHTML() {
  return `
    <div class="gem-welcome-modal" id="gem-welcome-modal">
      <div class="gem-welcome-modal-content">
        <div class="gem-welcome-modal-header">
          <h2>Welcome to Gemma! 🎉</h2>
          <p>Thanks for installing the ultimate Emarsys email editor enhancement</p>
        </div>
        <div class="gem-welcome-modal-body gem-scrollable">
          <h3>What's New in Gemma</h3>
          <ul class="gem-welcome-modal-features">
            <li><b>Text Highlighting</b> Automatically highlight important text in the email editor preview. Edit what text is highlighted and what color the highlight is in the Settings panel.</li>
            <li><b>Mobile Preview</b> See a mobile preview of your email right next to your desktop preview while you edit. This is turned on by default and can be toggled from the settings menu or the purple phone icon in the bottom left of the editor. You can also drag the mobile preview left and right to change the size. The settings panel lets you adjust the scaling too.</li>
            <li><b>Custom Color Swatches</b> Custom color swatches are now permanent! Emarsys doesn't remember what colors you used when editing an email. But Gemma does. You can also add default presets that will always display at the top of the color picker (up to 8) from the settings panel.</li>
            <li><b>Condensed Blocks Panel</b> The Blocks panel layout has been condensed so now more draggable blocks fit on your screen at once. Less scrolling to find what you need!</li>
            <li><b>Links Panel</b> The Links panel layout has been cleaned up. This thing is a mess and difficult to use. New modifications make it more readable and useable.</li>
            <li><b>Preheader Readability</b> The Preheader text box now increases in height if your preheader is very long. So long scrollbar. See the entire preheader at once for easier editing.</li>
            <li><b>Fullscreen Editing</b> Go fullscreen for a bigger view of your email. Use the purple expand icon in the bottom left of the email editor to modify your layout. This increases the total viewable area of your email by 34.6%!</li>
            <li><b>Keyboard Shortcuts</b> Save a draft with keyboard shortcuts! CTRL+S and CMD+S now save your email draft instantly. No more dragging your mouse up to the corner to save.</li>
            <li><b>Unsaved Draft Alerts</b> Speaking of saving, if your email has unsaved changes you'll now see an animated emoji in the Google Chrome tab until you save it!</li>
          </ul>
        </div>
        <div class="gem-welcome-modal-footer">
          <button class="gem-welcome-modal-button" id="gem-welcome-modal-close">
            Let's go! 🚀
          </button>
        </div>
      </div>
    </div>
  `;
}

// Helper function to set up modal event handlers
function setupModalHandlers(modal) {
  const closeButton = document.getElementById('gem-welcome-modal-close');

  // Close modal function
  function closeModal() {
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  }

  // Close button click
  closeButton.addEventListener('click', closeModal);

  // ESC key handler
  function handleEscape(event) {
    if (event.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  }
  document.addEventListener('keydown', handleEscape);

  // Click outside to close
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  return closeModal;
}

// Welcome Modal for Gemma
function initializeWelcomeModal() {
  console.log("[Gem] Initializing welcome modal...");

  // Check if we should show the welcome modal
  chrome.storage.sync.get(['welcomeModalShown', 'extensionVersion'], (result) => {
    const currentVersion = chrome.runtime.getManifest().version;
    const lastShownVersion = result.extensionVersion;
    const hasBeenShown = result.welcomeModalShown;

    console.log("[Gem] Welcome modal check:", {
      currentVersion,
      lastShownVersion,
      hasBeenShown
    });

    // Show modal if:
    // 1. Never shown before, OR
    // 2. Version has changed (update)
    if (!hasBeenShown || lastShownVersion !== currentVersion) {
      console.log("[Gem] Showing welcome modal");
      showWelcomeModal();

      // Mark as shown and store current version
      chrome.storage.sync.set({
        welcomeModalShown: true,
        extensionVersion: currentVersion
      });
    } else {
      console.log("[Gem] Welcome modal already shown, skipping");
    }
  });
}

// Function to show the welcome modal (used by initializeWelcomeModal)
function showWelcomeModal() {
  // Create modal HTML
  const modalHTML = createWelcomeModalHTML();

  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modal = document.getElementById('gem-welcome-modal');

  // Set up event handlers
  setupModalHandlers(modal);

  console.log("[Gem] Welcome modal displayed");
}

// Function to manually show the welcome modal (for settings panel)
window.showWelcomeModal = function() {
  // Remove any existing modal first
  const existingModal = document.getElementById('gem-welcome-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal HTML
  const modalHTML = createWelcomeModalHTML();

  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modal = document.getElementById('gem-welcome-modal');

  // Set up event handlers
  setupModalHandlers(modal);

  console.log("[Gem] Welcome modal shown manually");
};

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWelcomeModal);
} else {
  initializeWelcomeModal();
}
