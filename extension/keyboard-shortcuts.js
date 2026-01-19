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
    } else {
      console.log("[Gem] Save button not found");
    }
  }


  // Function to toggle mobile preview visibility
  function toggleMobilePreview() {
    // Check if chrome APIs are available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      return;
    }

    try {
      // Get current mobile preview visibility state
      chrome.storage.sync.get(['mobileViewVisible'], (result) => {
        // Check again if chrome APIs are still available after async call
        if (!chrome || !chrome.storage || !chrome.storage.sync) {
          console.warn("[Gem] Chrome storage API became unavailable during async call");
          return;
        }

        const currentState = result.mobileViewVisible !== false; // Default to true if undefined
        const newState = !currentState;

        console.log("[Gem] Toggling mobile preview:", currentState, "->", newState);

        // Update the setting in storage
        chrome.storage.sync.set({ mobileViewVisible: newState }, () => {
          if (chrome.runtime.lastError) {
            console.error("[Gem] Error toggling mobile preview:", chrome.runtime.lastError);
          }
        });
      });
    } catch (error) {
      console.error("[Gem] Error in toggleMobilePreview:", error);
    }
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

    // Check for CMD+/ (Mac) or CTRL+/ (Windows/Linux) - Mobile Preview Toggle
    const isMobilePreviewShortcut = (event.metaKey || event.ctrlKey) && event.key === '/';

    // Check for CMD+SHIFT+F (Mac) or CTRL+SHIFT+F (Windows/Linux) - Expanded Mode Toggle
    const isExpandedModeShortcut =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      !event.altKey &&
      (String(event.key || '').toLowerCase() === 'f');

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
    } else if (isMobilePreviewShortcut) {
      console.log("[Gem] Mobile preview toggle shortcut detected:", event.metaKey ? 'CMD+/' : 'CTRL+/');

      // Prevent default browser search behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Toggle mobile preview visibility
      toggleMobilePreview();

      // Return false to ensure no further processing
      return false;
    } else if (isExpandedModeShortcut) {
      console.log("[Gem] Expanded mode toggle shortcut detected:", event.metaKey ? 'CMD+SHIFT+F' : 'CTRL+SHIFT+F');

      // Don't trigger while typing
      const ae = (event.target && event.target.ownerDocument ? event.target.ownerDocument.activeElement : document.activeElement);
      if (ae) {
        const tag = (ae.tagName || '').toLowerCase();
        const isTypingTarget =
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          ae.isContentEditable;
        if (isTypingTarget) return;
      }

      // Prevent default browser find behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Toggle expanded mode (same behavior as the expand icon)
      try {
        const rootDoc = (() => {
          try { return window.top && window.top.document ? window.top.document : document; } catch (_) { return document; }
        })();
        const body = rootDoc && rootDoc.body;
        if (!body) return false;

        const wasExpanded = body.classList.contains("gem-expanded");
        body.classList.toggle("gem-expanded");
        const isNowExpanded = body.classList.contains("gem-expanded");
        console.log("[Gem] Expanded mode toggled:", wasExpanded, "->", isNowExpanded);

        // Persist state (used by verticalnav-enhancer.js restore)
        chrome.storage.sync.set({ fullscreenActive: isNowExpanded }, () => {
          if (chrome.runtime.lastError) {
            console.error("[Gem] Error saving expanded mode state:", chrome.runtime.lastError);
          }
        });
      } catch (error) {
        console.error("[Gem] Error toggling expanded mode:", error);
      }

      return false;
    }
  }

  // Attach event listeners to window to catch events from anywhere (including iframes)
  window.addEventListener('keydown', handleKeyDown, true); // Use capture phase

  // Also attach to document for redundancy
  document.addEventListener('keydown', handleKeyDown, true);

  // Monitor iframes and inject keyboard shortcuts into them
  monitorIframesForKeyboardShortcuts();

  console.log("[Gem] Keyboard shortcuts initialized - CMD+S / CTRL+S will trigger save, CMD+/ / CTRL+/ will toggle mobile preview");
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeKeyboardShortcuts);
} else {
  initializeKeyboardShortcuts();
}
