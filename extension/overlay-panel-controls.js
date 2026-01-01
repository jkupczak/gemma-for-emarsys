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

  // Function to handle Image Properties modal modifications
  function initializeImagePropertiesModalHandler() {
    console.log("[Gem] Initializing Image Properties modal handler");

    // Function to check if a modal is the Image Properties modal
    function isImagePropertiesModal(modal) {
      const titleSpan = modal.querySelector('span.e-dialog__title');
      const isImageProperties = titleSpan && titleSpan.textContent.trim() === 'Image Properties';
      if (isImageProperties) {
        console.log("[Gem] Found Image Properties modal:", modal, "classes:", modal.className);
      }
      return isImageProperties;
    }

    // Function to modify the Image Properties modal
    function modifyImagePropertiesModal(modal) {
      console.log("[Gem] Modifying Image Properties modal, modal element:", modal);

      // Find the dialog active element
      const dialogActive = modal.querySelector('.e-dialog-active');
      if (!dialogActive) {
        console.log("[Gem] Dialog active element not found");
        return;
      }

      // Apply flex styles to the dialog active element
      dialogActive.style.flexDirection = 'row';
      dialogActive.style.alignItems = 'stretch';
      dialogActive.classList.add('gem-enhanced-image-properties-dialog');
      console.log("[Gem] Applied flex styles and class to dialog-active element:", dialogActive);

      // Find the container element
      const container = dialogActive.querySelector('div.e-dialog__container');
      if (!container) {
        console.log("[Gem] Image Properties modal container not found");
        return;
      }

      // Check if already modified to avoid duplicate modifications
      if (container._gemModified) {
        console.log("[Gem] Image Properties modal already modified");
        return;
      }

      // Store reference to the left panel for later updates
      let leftPanelImage = null;

      // Apply inline styles to the container
      container.style.maxWidth = '580px';
      container.style.width = '580px';
      container.style.overflow = 'hidden';

      // Create and insert the new left panel div before the container
      const leftPanel = document.createElement('div');
      leftPanel.style.height = '100%';
      leftPanel.style.borderRadius = '8px 0 0 8px';
      leftPanel.style.zIndex = '9';
      leftPanel.style.width = '100%';
      leftPanel.style.backgroundColor = 'var(--token-box-default-background)';
      leftPanel.style.backgroundImage = 'linear-gradient(45deg, var(--token-background-strong) 25%, transparent 25%, transparent 75%, var(--token-background-strong) 75%, var(--token-background-strong)), linear-gradient(45deg, var(--token-background-strong) 25%, transparent 25%, transparent 75%, var(--token-background-strong) 75%, var(--token-background-strong))';
      leftPanel.style.backgroundPosition = '0 0, 10px 10px';
      leftPanel.style.backgroundSize = '20px 20px';

      // Insert before the container element
      dialogActive.insertBefore(leftPanel, container);

      // Function to update or create image in left panel
      const updateImageInLeftPanel = (imageUrl) => {
        console.log("[Gem] Updating image in left panel:", imageUrl);

        if (imageUrl && imageUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) && imageUrl !== 'null') {
          // Create image element if it doesn't exist
          if (!leftPanelImage) {
            leftPanelImage = document.createElement('img');
            leftPanelImage.style.maxWidth = '100%';
            leftPanelImage.style.maxHeight = '100%';
            leftPanelImage.style.width = 'auto';
            leftPanelImage.style.height = 'auto';
            leftPanelImage.style.display = 'block';

            // Clear existing content and add image
            leftPanel.innerHTML = '';
            leftPanel.style.display = 'flex';
            leftPanel.style.alignItems = 'center';
            leftPanel.style.justifyContent = 'center';
            leftPanel.appendChild(leftPanelImage);
          }

          // Update image source
          leftPanelImage.src = imageUrl;

          // Handle image load error
          leftPanelImage.onerror = () => {
            console.log("[Gem] Failed to load image:", imageUrl);
            leftPanelImage.style.display = 'none';
          };

          // Handle image load success
          leftPanelImage.onload = () => {
            console.log("[Gem] Image loaded successfully:", imageUrl);
            leftPanelImage.style.display = 'block';
          };
        } else {
          // Hide image if URL is not valid or null (disabled state)
          if (leftPanelImage) {
            leftPanelImage.style.display = 'none';
          }
        }
      };

      // Find and inject the initial image into the left panel
      const htmlEditor = container.querySelector('vce-html-editor');
      if (htmlEditor && htmlEditor.getAttribute('html') && !htmlEditor.classList.contains('e-input-disabled')) {
        const imageUrl = htmlEditor.getAttribute('html').trim();
        updateImageInLeftPanel(imageUrl);
      }

      // Set up observer to watch for vce-html-editor element changes
      let htmlEditorObserver = null;

      const setupHtmlEditorObserver = (htmlEditor) => {
        if (htmlEditorObserver) {
          htmlEditorObserver.disconnect();
        }

        // Watch for attribute changes on the vce-html-editor element
        htmlEditorObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && (mutation.attributeName === 'html' || mutation.attributeName === 'class')) {
              const target = mutation.target;
              const hasDisabledClass = target.classList.contains('e-input-disabled');
              const newImageUrl = target.getAttribute('html')?.trim();

              console.log("[Gem] vce-html-editor attribute changed:", mutation.attributeName, "disabled:", hasDisabledClass);

              if (hasDisabledClass) {
                // If disabled, hide any existing image
                updateImageInLeftPanel(null);
              } else if (newImageUrl) {
                // If not disabled and has URL, update image
                updateImageInLeftPanel(newImageUrl);
              }
            }
          });
        });

        htmlEditorObserver.observe(htmlEditor, {
          attributes: true,
          attributeFilter: ['html', 'class']
        });

        // Update image with current URL only if not disabled
        if (!htmlEditor.classList.contains('e-input-disabled')) {
          const currentImageUrl = htmlEditor.getAttribute('html')?.trim();
          updateImageInLeftPanel(currentImageUrl);
        }

        console.log("[Gem] Set up attribute observer for vce-html-editor");
      };

      // Watch for vce-html-editor being added/removed from container
      const containerObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            const currentHtmlEditor = container.querySelector('vce-html-editor');

            // Check if element was added
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'VCE-HTML-EDITOR' || node.querySelector('vce-html-editor')) {
                  console.log("[Gem] vce-html-editor element added to DOM");
                  const htmlEditor = node.tagName === 'VCE-HTML-EDITOR' ? node : node.querySelector('vce-html-editor');
                  if (htmlEditor) {
                    setupHtmlEditorObserver(htmlEditor);
                  }
                }
              }
            });

            // Check if element was removed
            mutation.removedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'VCE-HTML-EDITOR' || node.querySelector('vce-html-editor')) {
                  console.log("[Gem] vce-html-editor element removed from DOM");
                  if (htmlEditorObserver) {
                    htmlEditorObserver.disconnect();
                    htmlEditorObserver = null;
                  }
                  // Clear the image when the editor is removed
                  updateImageInLeftPanel(null);
                }
              }
            });

            // If element exists but we don't have an observer, set it up
            if (currentHtmlEditor && !htmlEditorObserver) {
              console.log("[Gem] vce-html-editor found but no observer active, setting up");
              setupHtmlEditorObserver(currentHtmlEditor);
            }
          }
        });
      });

      containerObserver.observe(container, {
        childList: true,
        subtree: true
      });

      // Check for existing element and set up observer
      const existingHtmlEditor = container.querySelector('vce-html-editor');
      if (existingHtmlEditor) {
        setupHtmlEditorObserver(existingHtmlEditor);
      }

      console.log("[Gem] Set up container observer for vce-html-editor changes");

      // Auto-expand the "Advanced settings" accordion
      const expandAdvancedSettings = () => {
        const advancedSettingsLabel = container.querySelector('label.e-accordion__title');
        if (advancedSettingsLabel && advancedSettingsLabel.textContent.trim() === 'Advanced settings') {
          advancedSettingsLabel.classList.add('e-accordion__title-active');
          console.log("[Gem] Auto-expanded Advanced settings accordion");
        }
      };

      // Try to expand immediately
      expandAdvancedSettings();

      // Also watch for the accordion to be added if it's not there yet
      const accordionObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const label = node.querySelector ?
                  node.querySelector('label.e-accordion__title') :
                  (node.tagName === 'LABEL' && node.classList.contains('e-accordion__title') ? node : null);
                if (label && label.textContent.trim() === 'Advanced settings') {
                  label.classList.add('e-accordion__title-active');
                  console.log("[Gem] Auto-expanded Advanced settings accordion (added)");
                }
              }
            });
          }
        });
      });

      accordionObserver.observe(container, {
        childList: true,
        subtree: true
      });

      // Mark as modified
      container._gemModified = true;

      console.log("[Gem] Image Properties modal modification complete");
    }

    // Monitor for modal appearance
    const observer = new MutationObserver((mutations) => {
      console.log("[Gem] Mutation observer fired, checking for Image Properties modal");
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            console.log("[Gem] Checking added node:", node.tagName, node.className);

            // Check if this is an Image Properties modal
            if (isImagePropertiesModal(node)) {
              console.log("[Gem] Image Properties modal detected");
              // Use setTimeout to ensure the modal is fully rendered
              setTimeout(() => modifyImagePropertiesModal(node), 100);
            }

            // Also check within added subtrees
            const imagePropertiesModals = node.querySelectorAll ?
              node.querySelectorAll('.e-float-container-default') : [];
            imagePropertiesModals.forEach(modal => {
              if (isImagePropertiesModal(modal)) {
                console.log("[Gem] Image Properties modal detected in subtree");
                setTimeout(() => modifyImagePropertiesModal(modal), 100);
              }
            });

            // Also check for any element containing the title span
            const titleSpans = node.querySelectorAll ?
              node.querySelectorAll('span.e-dialog__title') : [];
            titleSpans.forEach(span => {
              if (span.textContent.trim() === 'Image Properties') {
                console.log("[Gem] Found Image Properties title span, checking parent modal");
                // Find the modal container (could be multiple levels up)
                let modalElement = span.closest('.e-float-container-default') ||
                                   span.closest('.e-dialog-active') ||
                                   span.closest('[class*="dialog"]');
                if (modalElement && isImagePropertiesModal(modalElement)) {
                  console.log("[Gem] Image Properties modal detected via title span");
                  setTimeout(() => modifyImagePropertiesModal(modalElement), 100);
                }
              }
            });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Fallback: periodically check for Image Properties modal
    const checkInterval = setInterval(() => {
      const existingModal = document.querySelector('.e-float-container-default');
      if (existingModal && isImagePropertiesModal(existingModal)) {
        console.log("[Gem] Image Properties modal found via periodic check");
        modifyImagePropertiesModal(existingModal);
        clearInterval(checkInterval); // Stop checking once found
      }
    }, 1000); // Check every second

    // Stop checking after 30 seconds to avoid infinite checking
    setTimeout(() => {
      clearInterval(checkInterval);
      console.log("[Gem] Stopped periodic checking for Image Properties modal");
    }, 30000);

    console.log("[Gem] Image Properties modal handler initialized");
  }

  // Initialize the Image Properties modal handler
  initializeImagePropertiesModalHandler();

  // Function to handle link editor modal focus
  function initializeLinkEditorFocus() {
    console.log("[Gem] Initializing link editor focus handler");

    // Function to check if a modal is the link editor modal
    function isLinkEditorModal(modal) {
      const linkEditor = modal.querySelector('cb-personalizable-input-with-context.link-editor-url.mce-component');
      return linkEditor !== null;
    }

    // Function to focus the URL input in the link editor
    function focusLinkEditorUrl(modal) {
      console.log("[Gem] Focusing link editor URL input");

      // Find the textarea inside the CodeMirror editor
      const textarea = modal.querySelector('vce-codemirror textarea');
      if (textarea) {
        console.log("[Gem] Found URL textarea, focusing...");
        // Use setTimeout to ensure the modal is fully rendered
        setTimeout(() => {
          textarea.focus();
          // Also try to set cursor to end of text
          if (textarea.setSelectionRange) {
            const len = textarea.value.length;
            textarea.setSelectionRange(len, len);
          }
          console.log("[Gem] URL textarea focused successfully");
        }, 100);
      } else {
        console.log("[Gem] URL textarea not found in link editor modal");
      }
    }

    // Monitor for link editor modal appearance
    const linkEditorObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this is a link editor modal
            if (isLinkEditorModal(node)) {
              console.log("[Gem] Link editor modal detected");
              focusLinkEditorUrl(node);
            }

            // Also check within added subtrees
            const linkEditors = node.querySelectorAll ?
              node.querySelectorAll('cb-personalizable-input-with-context.link-editor-url.mce-component') : [];
            if (linkEditors.length > 0) {
              console.log("[Gem] Link editor modal detected in subtree");
              // Find the modal container
              let modalContainer = node;
              while (modalContainer && !isLinkEditorModal(modalContainer)) {
                modalContainer = modalContainer.parentElement;
              }
              if (modalContainer) {
                focusLinkEditorUrl(modalContainer);
              }
            }
          }
        });
      });
    });

    linkEditorObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log("[Gem] Link editor focus handler initialized");
  }

  // Initialize the link editor focus handler
  initializeLinkEditorFocus();

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