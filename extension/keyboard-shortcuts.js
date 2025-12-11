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
          // Remove existing listener if present
          iframeDoc.removeEventListener('keydown', handleKeyDown, true);

          // Add the keyboard shortcut handler to the iframe
          iframeDoc.addEventListener('keydown', handleKeyDown, true);

          console.log("[Gem] Injected keyboard shortcuts into iframe");
        }
      } catch (error) {
        console.log("[Gem] Could not inject into iframe (cross-origin):", error);
      }
    }

    // Inject into existing iframes
    const existingIframes = document.querySelectorAll('iframe');
    existingIframes.forEach(injectIntoIframe);

    // Monitor for new iframes being added
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === 'IFRAME') {
            // Wait a bit for the iframe to load its content
            setTimeout(() => {
              injectIntoIframe(node);
            }, 1000);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also listen for iframe load events
    document.addEventListener('load', (event) => {
      if (event.target.tagName === 'IFRAME') {
        setTimeout(() => {
          injectIntoIframe(event.target);
        }, 500);
      }
    }, true);

    // Periodically check and reinject into iframes (for dynamic content)
    setInterval(() => {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach((iframe) => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iframeDoc) {
            // Check if our handler is already attached
            const hasHandler = iframeDoc._gemKeyboardHandler;
            if (!hasHandler) {
              iframeDoc.addEventListener('keydown', handleKeyDown, true);
              iframeDoc._gemKeyboardHandler = true;
              console.log("[Gem] Periodically injected keyboard shortcuts into iframe");
            }
          }
        } catch (error) {
          // Ignore cross-origin errors
        }
      });
    }, 3000); // Check every 3 seconds
  }

  // Keyboard event handler
  function handleKeyDown(event) {
    // Check for CMD+S (Mac) or CTRL+S (Windows/Linux)
    const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key === 's';

    if (isSaveShortcut) {
      console.log("[Gem] Save shortcut detected:", event.metaKey ? 'CMD+S' : 'CTRL+S', "in context:", event.target.ownerDocument === document ? "main" : "iframe");

      // Prevent default browser save behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

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
