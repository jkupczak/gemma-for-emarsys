console.log("keyboard-shortcuts.js loaded");

// Keyboard shortcuts for saving content
// CMD+S (Mac) or CTRL+S (Windows/Linux) to trigger the save button

function initializeKeyboardShortcuts() {
  console.log("[Gem] Initializing keyboard shortcuts...");

  // Function to find and click the save button
  function triggerSave() {
    const saveButton = document.querySelector('cb-draft-save-button button.e-btn');

    if (saveButton) {
      console.log("[Gem] Save button found, triggering click...");
      saveButton.click();

      // Optional: Provide visual feedback
      showSaveFeedback();
    } else {
      console.log("[Gem] Save button not found");
    }
  }

  // Function to show brief visual feedback
  function showSaveFeedback() {
    // Create a temporary overlay to show save feedback
    const overlay = document.createElement('div');
    overlay.textContent = 'Saving...';
    overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    document.body.appendChild(overlay);

    // Fade in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    // Remove after 2 seconds
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 300);
    }, 2000);
  }

  // Function to monitor iframes and inject keyboard shortcuts
  function monitorIframesForKeyboardShortcuts() {
    console.log("[Gem] Monitoring iframes for keyboard shortcuts...");

    // Function to inject keyboard shortcuts into an iframe
    function injectIntoIframe(iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          // Check if our handler is already attached to avoid duplicates
          if (iframeDoc._gemKeyboardHandler) {
            return; // Already injected
          }

          // Add the keyboard shortcut handler to the iframe
          iframeDoc.addEventListener('keydown', handleKeyDown, true);
          iframeDoc._gemKeyboardHandler = true;

          console.log("[Gem] Injected keyboard shortcuts into iframe");
        }
      } catch (error) {
        console.log("[Gem] Could not inject into iframe (cross-origin):", error);
      }
    }

    // Function to wait for iframe to be ready and inject
    function waitForIframeReady(iframe) {
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        // Iframe is already loaded
        injectIntoIframe(iframe);
      } else {
        // Wait for iframe to load
        iframe.addEventListener('load', () => {
          // Give it a moment for content to be ready
          setTimeout(() => {
            injectIntoIframe(iframe);
          }, 100);
        });

        // Also try periodically for up to 5 seconds in case load event doesn't fire
        let attempts = 0;
        const checkReady = () => {
          attempts++;
          try {
            if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
              injectIntoIframe(iframe);
              return;
            }
            if (attempts < 50) { // Check for up to 5 seconds (50 * 100ms)
              setTimeout(checkReady, 100);
            }
          } catch (error) {
            // Cross-origin, stop checking
          }
        };
        setTimeout(checkReady, 100);
      }
    }

    // Inject into existing iframes
    const existingIframes = document.querySelectorAll('iframe');
    existingIframes.forEach(waitForIframeReady);

    // Monitor for new iframes being added
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === 'IFRAME') {
            waitForIframeReady(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Keyboard event handler
  function handleKeyDown(event) {
    // Check for CMD+S (Mac) or CTRL+S (Windows/Linux)
    const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key === 's';

    if (isSaveShortcut) {
      // Check if this event is coming from our cloned iframe
      const isFromCloneIframe = event.target && event.target.ownerDocument &&
        event.target.ownerDocument.defaultView &&
        event.target.ownerDocument.defaultView.frameElement &&
        event.target.ownerDocument.defaultView.frameElement.classList &&
        event.target.ownerDocument.defaultView.frameElement.classList.contains('iframe-duplicate');

      console.log("[Gem] Save shortcut detected:", event.metaKey ? 'CMD+S' : 'CTRL+S',
        "in context:", isFromCloneIframe ? "cloned-iframe" : (event.target.ownerDocument === document ? "main" : "iframe"));

      // Prevent default browser save behavior - be more aggressive for cloned iframe
      if (isFromCloneIframe) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        // Additional prevention for cloned iframe events
        setTimeout(() => {
          const preventAgain = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              window.removeEventListener('keydown', preventAgain, true);
            }
          };
          window.addEventListener('keydown', preventAgain, true);
        }, 0);
      } else {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      // Trigger save
      triggerSave();

      // Return false to ensure no further processing
      return false;
    }
  }

  // Attach event listeners to window to catch events from anywhere (including iframes)
  window.addEventListener('keydown', handleKeyDown, true); // Use capture phase

  // Also attach to document for redundancy
  document.addEventListener('keydown', handleKeyDown, true);

  // Monitor iframes and inject keyboard shortcuts into them
  monitorIframesForKeyboardShortcuts();

  console.log("[Gem] Keyboard shortcuts initialized - CMD+S / CTRL+S will trigger save");
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeKeyboardShortcuts);
} else {
  initializeKeyboardShortcuts();
}
