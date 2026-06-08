console.log("[gem] header-copy-icon.js loaded");

// Header title copy functionality
function initializeHeaderCopyIcon() {
  console.log("[gem] Initializing header copy icon");

  function buildHeaderActionBaseStyle() {
    return `
      display: inline-block;
      margin-left: 8px;
      cursor: pointer;
      opacity: 0.6;
      transition: opacity 0.2s ease;
      vertical-align: middle;
      font-size: 11px;
      user-select: none;
      line-height: 24px;
      padding: 0 6px;
      border-radius: 8px
    `;
  }

  function clickEmailSettingsButton() {
    const btn = document.querySelector('button[analytics-action="Clicked_StepsItemAction_EmailSetting"]');
    if (!btn) {
      console.warn('[Gem] Email settings button not found');
      return;
    }
    btn.click();
  }

  // Function to add copy icon to header
  function addCopyIconToHeader(headerElement) {
    // Check if icons already exist
    if (headerElement.querySelector('.gem-header-copy-icon') || headerElement.querySelector('.gem-header-edit-icon')) {
      return;
    }

    // Create copy icon
    const copyIcon = document.createElement('span');
    copyIcon.className = 'gem-header-copy-icon';
    copyIcon.style.cssText = buildHeaderActionBaseStyle();

    const editIcon = document.createElement('span');
    editIcon.className = 'gem-header-edit-icon';
    editIcon.style.cssText = buildHeaderActionBaseStyle();
    editIcon.innerHTML = `
      <gem-e-icon icon="edit" color="inherit">
        <div aria-hidden="true" class="e-icon-wrapper">
          <div class="e-icon e-icon-table text-color-inherit">&#xF0CE;</div>
        </div>
      </gem-e-icon>
    `.trim();

    // Add hover effects
    copyIcon.addEventListener('mouseenter', () => {
      copyIcon.style.opacity = '1';
    });

    copyIcon.addEventListener('mouseleave', () => {
      copyIcon.style.opacity = '0.6';
    });

    editIcon.addEventListener('mouseenter', () => {
      editIcon.style.opacity = '1';
    });

    editIcon.addEventListener('mouseleave', () => {
      editIcon.style.opacity = '0.6';
    });

    // Add click handler to copy text
    copyIcon.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Get the campaign name from the specific span element
      const campaignNameElement = headerElement.querySelector('cb-campaign-name span');
      const textToCopy = campaignNameElement ? campaignNameElement.textContent.trim() : headerElement.textContent.trim();

      try {
        await navigator.clipboard.writeText(textToCopy);
        console.log('[Gem] Copied to clipboard:', textToCopy);

        // Visual feedback - temporarily change icon
        const originalHTML = copyIcon.innerHTML;
        copyIcon.classList.add('gem-header-copy-icon-success');
        copyIcon.style.opacity = '1';

        setTimeout(() => {
          copyIcon.innerHTML = originalHTML;
          copyIcon.style.opacity = '0.6';
        }, 2000);

      } catch (err) {
        console.error('[Gem] Failed to copy text:', err);

        // Fallback for older browsers
        const campaignNameElement = headerElement.querySelector('cb-campaign-name span');
        const fallbackTextToCopy = campaignNameElement ? campaignNameElement.textContent.trim() : headerElement.textContent.trim();

        const textArea = document.createElement('textarea');
        textArea.value = fallbackTextToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand('copy');
          console.log('[Gem] Copied to clipboard (fallback):', textToCopy);

          // Visual feedback
          const originalHTML = copyIcon.innerHTML;
          copyIcon.innerHTML = '✅';
          copyIcon.style.opacity = '1';

          setTimeout(() => {
            copyIcon.innerHTML = originalHTML;
            copyIcon.style.opacity = '0.6';
          }, 1000);

        } catch (fallbackErr) {
          console.error('[Gem] Fallback copy failed:', fallbackErr);
        }

        document.body.removeChild(textArea);
      }
    });

    // Open campaign editor modal
    editIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clickEmailSettingsButton();
    });

    // Append icon to header
    headerElement.appendChild(copyIcon);
    headerElement.appendChild(editIcon);
  }

  // Function to remove copy icon from header
  function removeCopyIconFromHeader(headerElement) {
    const copyIcon = headerElement.querySelector('.gem-header-copy-icon');
    if (copyIcon) headerElement.removeChild(copyIcon);
    const editIcon = headerElement.querySelector('.gem-header-edit-icon');
    if (editIcon) headerElement.removeChild(editIcon);
  }

  // Set up hover listeners for existing headers
  function setupHeaderHoverListeners() {
    const headers = document.querySelectorAll('cb-header h1');

    headers.forEach(header => {
      if (header.dataset.gemHeaderCopyHandlersBound === 'true') return;
      header.dataset.gemHeaderCopyHandlersBound = 'true';
      // Add hover listeners
      header.addEventListener('mouseenter', () => {
        addCopyIconToHeader(header);
      });

      header.addEventListener('mouseleave', (e) => {
        // Only remove if not hovering over the icon itself
        setTimeout(() => {
          if (
            !header.matches(':hover') &&
            !header.querySelector('.gem-header-copy-icon:hover') &&
            !header.querySelector('.gem-header-edit-icon:hover')
          ) {
            removeCopyIconFromHeader(header);
          }
        }, 100);
      });
    });
  }

  // Initial setup
  setupHeaderHoverListeners();

  // Watch for new headers being added to the DOM
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if a new cb-header h1 was added
          if (node.matches && node.matches('cb-header h1')) {
            setupHeaderHoverListeners();
          }

          // Check descendants
          if (node.querySelectorAll) {
            const newHeaders = node.querySelectorAll('cb-header h1');
            if (newHeaders.length > 0) {
              setupHeaderHoverListeners();
            }
          }
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeHeaderCopyIcon);
} else {
  initializeHeaderCopyIcon();
}
