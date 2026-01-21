console.log("[gem] header-copy-icon.js loaded");

// Header title copy functionality
function initializeHeaderCopyIcon() {
  console.log("[gem] Initializing header copy icon");

  // Function to add copy icon to header
  function addCopyIconToHeader(headerElement) {
    // Check if icon already exists
    if (headerElement.querySelector('.gem-header-copy-icon')) {
      return;
    }

    // Create copy icon
    const copyIcon = document.createElement('span');
    copyIcon.className = 'gem-header-copy-icon';
    copyIcon.style.cssText = `
      display: inline-block;
      margin-left: 12px;
      cursor: pointer;
      opacity: 0.6;
      transition: opacity 0.2s ease;
      vertical-align: middle;
      font-size: 11px;
      user-select: none;
      box-shadow: 0 0 0 2px;
      line-height: 24px;
      padding: 0 6px;
      border-radius: 8px
    `;

    // Add hover effects
    copyIcon.addEventListener('mouseenter', () => {
      copyIcon.style.opacity = '1';
    });

    copyIcon.addEventListener('mouseleave', () => {
      copyIcon.style.opacity = '0.6';
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

    // Append icon to header
    headerElement.appendChild(copyIcon);
  }

  // Function to remove copy icon from header
  function removeCopyIconFromHeader(headerElement) {
    const icon = headerElement.querySelector('.gem-header-copy-icon');
    if (icon) {
      headerElement.removeChild(icon);
    }
  }

  // Set up hover listeners for existing headers
  function setupHeaderHoverListeners() {
    const headers = document.querySelectorAll('cb-header h1');

    headers.forEach(header => {
      // Add hover listeners
      header.addEventListener('mouseenter', () => {
        addCopyIconToHeader(header);
      });

      header.addEventListener('mouseleave', (e) => {
        // Only remove if not hovering over the icon itself
        setTimeout(() => {
          if (!header.matches(':hover') && !header.querySelector('.gem-header-copy-icon:hover')) {
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
