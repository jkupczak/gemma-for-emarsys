console.log("[Gem] overlay-panel-controls.js loaded");

// Handle overlay panel controls, including Escape key functionality
function initializeOverlayPanelControls() {
  console.log("[Gem] Initializing overlay panel controls");

  // Function to handle Escape key presses
  function handleEscapeKey(event) {
    // Only handle Escape key
    if (event.key === 'Escape' || event.code === 'Escape' || event.keyCode === 27) {
      console.log("[Gem] Escape key pressed, checking for open overlay panels");

      // Check if there's an open overlay panel
      const overlayPanel = document.querySelector('.e-contentblocks-overlay_panel.e-contentblocks-overlay_panel-open');

      if (overlayPanel) {
        console.log("[Gem] Found open overlay panel, looking for close button");

        // Look for the close button
        const closeButton = document.querySelector('cb-overlay-panel .e-section__header a.e-section__action.e-clickable');

        if (closeButton) {
          console.log("[Gem] Found close button, clicking it");
          closeButton.click();

          // Prevent default and stop propagation
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return false;
        } else {
          console.log("[Gem] Close button not found");
        }
      } else {
        console.log("[Gem] No open overlay panels found");
      }
    }
  }

  // Function to monitor iframes and inject keyboard shortcuts
  function monitorIframesForEscapeKey() {
    console.log("[Gem] Monitoring iframes for Escape key handling...");

    // Function to inject Escape key handler into an iframe
    function injectIntoIframe(iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          // Check if our handler is already attached to avoid duplicates
          if (iframeDoc._gemEscapeHandler) {
            return; // Already injected
          }

          // Add the Escape key handler to the iframe
          iframeDoc.addEventListener('keydown', handleEscapeKey, true);
          iframeDoc._gemEscapeHandler = true;

          console.log("[Gem] Injected Escape key handler into iframe");
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

  // Attach event listeners to window and document to catch events from anywhere (including iframes)
  window.addEventListener('keydown', handleEscapeKey, true); // Use capture phase
  document.addEventListener('keydown', handleEscapeKey, true);

  // Monitor iframes and inject Escape key handler into them
  monitorIframesForEscapeKey();

  console.log("[Gem] Overlay panel controls initialized - Escape key will close open overlay panels");

  // Optional: Add debugging function
  window.debugOverlayPanels = function() {
    console.log("[Gem] DEBUG: Overlay panel status");
    const overlayPanel = document.querySelector('.e-contentblocks-overlay_panel');
    const isOpen = overlayPanel && overlayPanel.classList.contains('e-contentblocks-overlay_panel-open');
    const closeButton = document.querySelector('cb-overlay-panel .e-section__header a.e-section__action.e-clickable');

    console.log("[Gem] DEBUG: Overlay panel element:", overlayPanel);
    console.log("[Gem] DEBUG: Is panel open:", isOpen);
    console.log("[Gem] DEBUG: Close button element:", closeButton);
  };
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeOverlayPanelControls);
} else {
  initializeOverlayPanelControls();
}