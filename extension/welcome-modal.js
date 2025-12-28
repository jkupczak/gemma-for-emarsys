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
            <li><b>Drag-and-Drop Snippets</b> Drag and drop custom ESL snippets into your email editor. Create, edit, and delete snippets from the Snippets tab in the vertical navigation. You can also import and export snippets as JSON.</li>
            <li><b>Text Highlighting</b> Automatically highlight important text in the email editor preview. Edit what text is highlighted and what color the highlight is in the Settings panel.</li>
            <li><b>Mobile Previews</b> See a mobile preview of your email right next to your desktop view while you make edits. This is turned on by default and can be toggled from the settings menu or the purple phone icon in the bottom left of the editor. You can also drag the mobile preview left and right to change the size. The settings panel lets you adjust the scaling too. <em>(You'll also see a mobile preview when you load a contact preview)</em></li>
            <li><b>Custom Color Swatches</b> Custom color swatches are now permanent! Emarsys doesn't remember what colors you used when editing an email. But Gemma does. You can also add default presets that will always display at the top of the color picker (up to 8) from the settings panel.</li>
            <li><b>Blocks Panel</b> Choose how many blocks to display per row in the blocks panel (1, 2, or 3 per row). More blocks per row means less scrolling to find what you need!</li>
            <li><b>Links Panel</b> Get alerted when you have trackable links that are set to not be tracked. That's unusual, so lets make you aware of it. Also, remodaled! This thing was a visual mess and difficult to manage. New modifications make it more readable and useable.</li>
            <li><b>Preheader Readability</b> The Preheader text box now increases in height if your preheader is very long. Goodbye scrollbar! See the entire preheader at once for easier editing.</li>
            <li><b>Fullscreen Editing</b> Go fullscreen for a bigger view of your email. Use the purple expand icon in the bottom left of the email editor to modify your layout. This increases the total viewable area of your email by over 40%!</li>
            <li><b>Keyboard Shortcuts</b> Save a draft with keyboard shortcuts! CTRL+S and CMD+S now save your email draft instantly. CMD+/ and CTRL+/ will toggle the mobile preview pane on and off. No more dragging your mouse around to save or toggle features!</li>
            <li><b>Unsaved Draft Alerts</b> Speaking of saving, if your email has unsaved changes you'll now see an animated emoji in the Google Chrome tab until you save it!</li>
            <li><b>Helpful Tab Titles</b> Ever have multiple emails open at once and lost track of which is which? Emarsys names each tab the same: "Email Campaigns | Channels | Emarsys Marketing Platform". That's not helpful. Gemma renames your tabs to use your email name instead!</li>
            <li><b>Custom Block Toolbar</b> You can now customize the content block toolbar to show or hide icons based on your preferences.</li>
            <li><b>Copy Campaign Title</b> Hover over the campaign title in the header to see a copy icon. Click it to copy the campaign name to your clipboard!</li>
            <li><b>Pin Favorite Blocks</b> Click the pin icon (📌) on any block in the blocks panel to pin it to the top. Pinned blocks stay at the top of the grid and persist across page loads!</li>
            <li><b>Hide Unwanted Blocks</b> Click the eye icon (👁️) on any block to hide it permanently. Hidden blocks can be shown again using the toggle button in the blocks panel header.</li>
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

// Close button click - close modal and open settings panel
  closeButton.addEventListener('click', () => {
    closeModal();
    // Open settings panel if available
    if (window.openGemmaSettings) {
      window.openGemmaSettings();
    }
  });

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

// Function to inject welcome modal CSS
function injectWelcomeModalCSS() {
  // Check if CSS is already injected
  if (document.getElementById('gem-welcome-modal-styles')) {
    return;
  }

  const css = `
    .gem-welcome-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .gem-welcome-modal-content {
        background: var(--token-box-default-background, #ffffff);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        max-width: 600px;
        max-height: 80vh;
        margin: 20px;
        position: relative;
        display: flex;
        flex-direction: column;
    }

    .gem-welcome-modal-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 30px 40px 25px;
        border-radius: 12px 12px 0 0;
        text-align: center;
    }

    .gem-welcome-modal-header h2 {
        margin: 0 0 10px 0;
        font-size: 28px;
        font-weight: 700;
    }

    .gem-welcome-modal-header p {
        margin: 0;
        font-size: 16px;
        opacity: 0.9;
    }

    .gem-welcome-modal-body {
        padding: 30px 40px;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
    }

    .gem-welcome-modal-body h3 {
        margin: 0 0 20px 0;
        color: var(--token-font-default, #333333);
        font-size: 20px;
        font-weight: 600;
    }

    .gem-welcome-modal-features {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .gem-welcome-modal-features li {
        margin-bottom: 16px;
        padding-left: 24px;
        position: relative;
        line-height: 1.5;
        color: var(--token-font-default, #333333);
    }

    .gem-welcome-modal-features li b {
        font-weight: 800;
    }

    .gem-welcome-modal-features li:before {
        content: "✨";
        position: absolute;
        left: 0;
        top: 0;
        font-size: 16px;
    }

    .gem-welcome-modal-footer {
        padding: 20px 40px 30px;
        text-align: center;
        border-top: 1px solid var(--token-box-default-border, #e0e0e0);
    }

    .gem-welcome-modal-button {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 25px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .gem-welcome-modal-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
    }

    .gem-scrollable {
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
    }

    .gem-scrollable::-webkit-scrollbar {
        width: 6px;
    }

    .gem-scrollable::-webkit-scrollbar-track {
        background: transparent;
    }

    .gem-scrollable::-webkit-scrollbar-thumb {
        background-color: rgba(0, 0, 0, 0.2);
        border-radius: 3px;
    }

    .gem-scrollable::-webkit-scrollbar-thumb:hover {
        background-color: rgba(0, 0, 0, 0.3);
    }
  `;

  const style = document.createElement('style');
  style.id = 'gem-welcome-modal-styles';
  style.textContent = css;
  document.head.appendChild(style);

  console.log("[Gem] Welcome modal CSS injected");
}

// Function to show the welcome modal (used by initializeWelcomeModal)
function showWelcomeModal() {
  // Inject CSS first
  injectWelcomeModalCSS();

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

  // Inject CSS first
  injectWelcomeModalCSS();

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
