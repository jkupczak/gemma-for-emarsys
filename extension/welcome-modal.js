console.log("[Gem] welcome-modal.js loaded");

// Helper function to create modal HTML
function createWelcomeModalHTML() {
  return `
    <div class="gem-welcome-modal" id="gem-welcome-modal">
      <div class="gem-welcome-modal-content">
        <div class="gem-welcome-modal-header">
          <div>
            <h2>Welcome to Gemma! 🎉</h2>
            <p>Thanks for installing the ultimate Emarsys email editor enhancement</p>
          </div>
          <div class="gem-welcome-modal-footer">
            <button class="gem-welcome-modal-button" id="gem-welcome-modal-close">
              Let's go! 🚀
            </button>
          </div>
        </div>
        <div class="gem-welcome-modal-body gem-scrollable">
          <h3>Feature List</h3>
          <ul class="gem-welcome-modal-features">
            <li><b>Drag-and-Drop Snippets</b> Drag and drop custom ESL snippets into your email editor. Create, edit, pin, categorize, and delete snippets from the Snippets tab in the vertical navigation. You can also import and export snippets as shareable JSON.</li>
            <li><b>Fullscreen Email Editing</b> Go fullscreen for a bigger view of your email. Use the purple expand icon in the bottom left of the email editor to modify your layout. This increases the total viewable area of your email by over 40%!</li>
            <li>
              <b>Convert ESL to Tokens</b> Instantly <b>convert plain text ESL into ESL tokens</b> by clicking the convert icon <span class="gem-e-icon"></span> wherever you see it.
            </li>
            <li>
              <b>Keyword Swapping</b> You can now quickly swap keywords you define with your own custom snippets. Click the swap icon <span class="gem-e-icon">&#xF0DE;</span> in the content block toolbar, the preheader box, or the subject line to swap matching keywords with their corresponding snippets.
            </li>
            <li>
              <b>Block Targeting Previews</b> Quickly see at a glance whether a block is targeting a specific audience or not with handly overlays that wrap around your blocks. You can also toggle this from the email preview toolbar.
            </li>
            <li><b>Rich Paste</b> Bold? Italics? You got it! Normally styled text that you copy and paste into your emails are reformatted to plain text. But not anymore! Gemma preserves bold, italics, underlines, links and more when copying and pasting from outside sources, or even from one content block to another.</li>
            <li><b>Image Picker</b> When adding an image to your email you'll now get a preview of it right next to the image editor. Makes adding ALT text much easier! You can also browse Recent Images and Favorite Images; last-used times appear in Image Details.</li>
            <li>
              <b>Preflight QA</b> Highlight important text, accessibility issues, image alt text, and more in the email editor preview. See a breakdown of your email's preflight QA results in the new Preflight QA panel.
            </li>
            <li><b>Mobile Previews</b> See a mobile preview of your email right next to your desktop view while you make edits. This is turned on by default and can be toggled from the settings menu or the <span class="gem-e-icon">&#xF133;</span> icon in the bottom left of the editor. You can also adjust width of it by dragging it or editing it in the settings panel.</li>
            <li><b>Custom Color Swatches</b> Custom color swatches are now permanent! Emarsys doesn't remember what colors you used when editing an email. But Gemma does. You can also add default presets that will always display at the top of the color picker (up to 8) from the settings panel.</li>
            </li>
            <li><b>Notes</b> Keep notes right in Emarsys! Find the Notes nav item in the vertical navigation and start taking notes right from any page.</li>
            <li><b>ALT Text Preview</b> Make it easier to QA ALT text by showing it when you hover over images in the email editor preview.</li>
            <li><b>Recent Campaigns</b> See a list of your most recent campaigns in the left navigation. Click on a campaign to open it in a new tab. Click the pin icon to pin a campaign to the top of the list.</li>
          </ul>

          <div style="margin-top: 40px;">
          <hr style="margin-bottom: 40px;">
            <h3>Full List of Changes</h3>
            <h4>Email Editor (r=contentBlocks/campaign)</h4>

            <h5>General Improvements</h5>
            <ul>
              <li>Instantly convert plain text ESL into ESL tokens by clicking on a convert icon <span class="gem-e-icon"></span> in the content block toolbar, the new Snippets panel, in the subject line, and in the preheader box. Tokens will be named after a matching snippet name if it exists. If no matching snippet name is found, Gemma will try to give it an appropriate name. If it can't, the token will be named "ESL snippet".</li>
              <li>Hover over the campaign title in the header to see a copy icon. Click it to <b>copy the campaign name</b> to your clipboard!</li>
              <li><b>Unsaved Draft Alerts</b> If your email has unsaved changes you'll now see an animated emoji in the Google Chrome tab until you save it.</li>
              <li>Normally, Emarsys names each Google Chrome tab the same: "Email Campaigns | Channels | Emarsys Marketing Platform". Tabs are now named after your emails' title instead.</li>  
              <li>A Save progress indicator has been added to the header of the email editor. This allows you to see the progress of your save operation in real time, even when you can't see the "Save" button.</li>  
            </ul>

            <h5>Email Basics Panel</h5>
            <ul>
              <li>Added "Keyword Swap" buttons to the subject line and preheader boxes to allow for quick swapping of keywords with snippets.</li>
              <li>Preheader box now increases in height if it is very long. See the entire preheader at once for easier editing.</li>
              <li>Hid the "AI" buttons that required an account upgrade from the subject line and preheader boxes if the user does not have access to them.</li>
            </ul>
            
            <h5>Blocks Panel</h5>
            <ul>
              <li>Users can adjust the view to show 1, 2, or 3 blocks per row.</li>
              <li>Click the pin icon (📌) on any block in the blocks panel to pin it to the top. Pinned blocks stay at the top of the grid.</li>
              <li>Click the eye icon (👁️) on any block to hide it. Hidden blocks can be shown again using the toggle button in the blocks panel header.</li>
              <li>The "Default Blocks" and "Saved Blocks" headers are now sticky and scroll with the panel.</li>
            </ul>

            <h5>Snippets Panel</h5>
            <ul>
              <li>A new snippets panel has been added to the vertical navigation.</li>
              <li>Users can drag and drop custom ESL snippets into the email editor. Create, edit, favorite, categorize, and delete snippets from the Snippets tab in the vertical navigation. You can also import and export snippets as shareable JSON.</li>
              <li>Snippets can be searched and filtered by category, favorite, and keyword swappable.</li>
            </ul>

            <h5>Style Settings Panel</h5>
            <ul>
              <li>Inputs and their labels are now condensed onto the same row so that more settings are visible at once.</li>
            </ul>

            <h5>Image Properties Dialog</h5>
            <ul>
              <li>Shortcut: Double-clicking an editable image in the email preview instantly opens the Image Properties dialog.</li>
              <li>The selected image is now displayed at the top for both desktop and mobile views.</li>
              <li>The Advanced settings panel is now automatically expanded for easier access to image dimensions.</li>
              <li>The dialog has been expanded to fullscreen to allow for a new image selection panel.</li>
              <ul>
                <li>Images can now be quickly selected without opening the Media DB popup window.</li>
                <li>Images are listed in two views: "Recent Images" or "Favorite Images".</li>
                  <ul>
                    <li>Images can be favorited to keep them in a separate list for quick access.</li>
                    <li>Recent Images combines images you have seen in the Media DB with last-used timestamps when you insert an image in the editor.</li>
                    <li>Image Details shows Last Seen and Last Used for each recent image.</li>
                  </ul>
                <li>Images are displayed in either a table or customizable grid view.</li>
                <li>Recent Images and Favorite Images can be searched by name, url, path, and more.</li>
                <li>Favorites are grouped by category, translation, or language.</li>
                <li>Favorites can be enriched with metadata: search keyword, category, language, translation, alt text, and width. The latter two will be automatically inserted for you if you choose the image.</li>
                <li>Shortcut: Pressing 'Enter' now initiates a click on the "OK" button to accept your changes and close the dialog.</li>
                <li>Shortcut: Pressing 'CMD+D' or 'CTRL+D' toggles the desktop and mobile tabs.</li>
              </ul>
            </ul>

            <h5>Content Block Editing</h5>
            <ul>
              <li>Pasting rich text (bold, italic, strikethrough, underline, superscript, links) is now supported. Settings can be tweaked int he Settings panel.</li>
              <li>Content block toolbar now features a "Convert ESL to Tokens" button to convert plain text ESL into ESL tokens.</li>
              <li>Content block toolbar now features a "Keyword Swap" button to quickly swap keywords with snippets.</li>
              <li>Content block toolbar can be customized to show or hide most icons based on preferences you set in the settings panel.</li>
            </ul>

            <h5>Emarsys Scripting Language snippet Dialog</h5>
            <ul>
              <li>Shortcut: Double-clicking an ESL token in the email preview instantly opens the ESL snippet editor dialog.</li>
              <li>"OK" button is disabled while ESL code is actively being validated to help prevent accidental submission of invalid code.</li>
            </ul>

            <h5>Link Editor Dialog</h5>
            <ul>
              <li>The users focus is immediately applied to the URL input so you can start typing your URL instantly.</li>
            </ul>

            <h4>Media DB Popup Window (r=MediaDB/popup)</h4>
            <ul>
              <li>File table is now zebra striped for easier readability.</li>
              <li>Columns can be toggled on/off from the Gemma settings panel.</li>
              <li>"Media Database" page headline is now hidden.</li>
              <li>File icons now have larger clickable areas and are visually larger.</li>
            </ul>

            <h4>Email Campaign List (r=emailCampaignList/index)</h4>
            <ul>
              <li>Email table is now zebra striped for easier readability.</li>
              <li>The "Created" filter can now be cleared on page load to load all emails by default. Must be turned on in the settings panel.</li>
            </ul>

          </div>
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
