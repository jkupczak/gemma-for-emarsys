console.log("[Gem] mobile-contact-preview.js LOADED");

// ----------------------------------------------------------
// mobile-contact-preview.js
// Handles duplication of contact preview iframes
// ----------------------------------------------------------

(function() {
  let originalIframe = null;
  let duplicateContainer = null;
  let duplicateIframe = null;
  let isObserving = false;

  // ------------------------------------------------------------
  // Main initialization
  // ------------------------------------------------------------
  function initializeContactPreviewDuplication() {
    console.log("[Gem] Initializing contact preview duplication");

    // Start observing for the original iframe
    observeForOriginalIframe();
  }

  // ------------------------------------------------------------
  // Observe for the original iframe
  // ------------------------------------------------------------
  function observeForOriginalIframe() {
    if (isObserving) return;

    const checkForIframe = () => {
      const iframe = document.querySelector('e-float-container .cp-contact_preview__content iframe');
      if (iframe && iframe !== originalIframe) {
        console.log("[Gem] Original contact preview iframe detected");
        originalIframe = iframe;
        handleOriginalIframeFound(iframe);
      }
    };

    if (typeof gemDomWatchSubscribe === 'function') {
      gemDomWatchSubscribe(checkForIframe);
    } else {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            checkForIframe();
          }
        });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    isObserving = true;
    console.log("[Gem] Observing for contact preview iframe");
  }

  // ------------------------------------------------------------
  // Handle when original iframe is found
  // ------------------------------------------------------------
  function handleOriginalIframeFound(iframe) {
    // Check if we already have a duplicate - if so, just update it
    if (duplicateContainer) {
      console.log("[Gem] Duplicate already exists, updating content");
      syncIframeContent();
      return;
    }

    // Create the duplicate
    createDuplicateIframe();

    // Start monitoring for content changes
    monitorIframeContent();
  }

  // ------------------------------------------------------------
  // Create duplicate iframe container and iframe
  // ------------------------------------------------------------
  function createDuplicateIframe() {
    const targetElement = document.querySelector('e-float-container main.e-layout__content .cp-contact_preview_section_container');
    if (!targetElement) {
      console.log("[Gem] Target element not found for duplicate placement");
      return;
    }

    // Create container div
    duplicateContainer = document.createElement('div');
    duplicateContainer.id = 'gem-contact-preview-duplicate';
    duplicateContainer.style.cssText = `
      margin: 0 12px;
      border: 1px solid var(--token-box-default-border);
      border-radius: 8px;
      overflow: hidden;
      position: relative;
    `;

    // Create iframe
    duplicateIframe = document.createElement('iframe');
    duplicateIframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    `;

    duplicateContainer.appendChild(duplicateIframe);

    // Insert after target element
    targetElement.insertAdjacentElement('afterend', duplicateContainer);

    console.log("[Gem] Created duplicate contact preview iframe");

    // Initial content sync
    syncIframeContent();

    // Set up custom scrollbars after content is loaded
    setupCustomScrollbars(duplicateIframe, duplicateContainer);
  }

  // ------------------------------------------------------------
  // Sync content from original to duplicate iframe
  // ------------------------------------------------------------
  function syncIframeContent() {
    if (!originalIframe || !duplicateIframe) return;

    try {
      const originalDoc = originalIframe.contentDocument;
      const duplicateDoc = duplicateIframe.contentDocument;

      if (!originalDoc || !duplicateDoc) return;

      // Serialize the original HTML to a string
      const originalHTML = originalDoc.documentElement.outerHTML;

      // Parse it into a temporary DOM so we can remove scripts
      const parser = new DOMParser();
      const tempDoc = parser.parseFromString(originalHTML, "text/html");

      // Remove all <script> tags from the temp document
      tempDoc.querySelectorAll("script").forEach(script => script.remove());

      // Remove spellcheck attribute from body element if present
      const body = tempDoc.querySelector("body");
      if (body && body.hasAttribute("spellcheck")) {
        body.removeAttribute("spellcheck");
      }

      // Write to duplicate iframe
      duplicateDoc.open();
      duplicateDoc.write(tempDoc.documentElement.outerHTML);
      duplicateDoc.close();

      // Inject CSS to hide scrollbars while maintaining scrollability
      const scrollbarStyle = duplicateDoc.createElement('style');
      scrollbarStyle.textContent = `
        html, body {
          margin: 0 !important;
          padding: 0 !important;
        }
        /* Hide scrollbars in Webkit browsers (Chrome, Safari, Edge) */
        ::-webkit-scrollbar:vertical {
          display: none !important;
        }
        /* Hide scrollbars in Firefox */
        * {
          scrollbar-width: none !important;
        }
      `;
      if (duplicateDoc.head) {
        duplicateDoc.head.appendChild(scrollbarStyle);
      }

      // Re-setup scrollbars after content update
      setupCustomScrollbars(duplicateIframe, duplicateContainer);

      console.log("[Gem] Synced contact preview iframe content");
    } catch (error) {
      console.error("[Gem] Error syncing contact preview iframe:", error);
    }
  }

  // ------------------------------------------------------------
  // Monitor for content changes in original iframe
  // ------------------------------------------------------------
  function monitorIframeContent() {
    if (!originalIframe) return;

    // Use MutationObserver to watch for changes in the iframe's document
    const observer = new MutationObserver((mutations) => {
      // Debounce the sync to avoid too frequent updates
      clearTimeout(observer.syncTimeout);
      observer.syncTimeout = setTimeout(() => {
        syncIframeContent();
      }, 500); // Wait 500ms after last change
    });

    // Start observing when the iframe loads
    const checkIframeLoaded = () => {
      if (originalIframe.contentDocument) {
        observer.observe(originalIframe.contentDocument.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
        console.log("[Gem] Monitoring contact preview iframe content changes");
      } else {
        // Try again later
        setTimeout(checkIframeLoaded, 100);
      }
    };

    originalIframe.addEventListener('load', checkIframeLoaded);
    checkIframeLoaded(); // Check immediately in case it's already loaded
  }

  // ------------------------------------------------------------
  // Set up custom scrollbars for the duplicate iframe
  // ------------------------------------------------------------
  function setupCustomScrollbars(iframe, container) {
    if (!iframe || !container) return;

    // Clean up any existing scrollbars first
    const existingScrollbars = container.querySelectorAll('.gem-custom-scrollbar');
    existingScrollbars.forEach(scrollbar => scrollbar.remove());

    // Clean up any existing scrollbar references
    if (iframe._gemScrollbar) {
      console.log('[Gem] Cleaning up existing scrollbar reference');
      if (iframe._gemScrollbar.destroy) {
        iframe._gemScrollbar.destroy();
      }
      delete iframe._gemScrollbar;
    }

    let vIsDragging = false;
    let vDragStartY = 0;
    let vThumbStartTop = 0;
    let hIsDragging = false;
    let hDragStartX = 0;
    let hThumbStartLeft = 0;
    let scrollTimeout;
    let iframeDoc;

    // Get iframe document
    function getIframeDoc() {
      if (!iframeDoc) {
        iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      }
      return iframeDoc;
    }

    // Update scrollbar visibility
    function showScrollbar() {
      const needsVertical = checkVerticalScrollNeeded();
      const needsHorizontal = checkHorizontalScrollNeeded();

      if (needsVertical) {
        vScrollbarContainer.style.opacity = '1';
      }
      if (needsHorizontal) {
        hScrollbarContainer.style.opacity = '1';
      }

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!vIsDragging && !hIsDragging &&
            !container.matches(':hover') &&
            !vScrollbarContainer.matches(':hover') &&
            !hScrollbarContainer.matches(':hover')) {
          vScrollbarContainer.style.opacity = checkVerticalScrollNeeded() ? '0' : '0';
          hScrollbarContainer.style.opacity = checkHorizontalScrollNeeded() ? '0' : '0';
        }
      }, 1000);
    }

    // Check if vertical scrolling is needed
    function checkVerticalScrollNeeded() {
      const doc = getIframeDoc();
      if (!doc || !doc.documentElement) return false;
      const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
      const clientHeight = doc.documentElement.clientHeight || doc.body.clientHeight;
      return scrollHeight > clientHeight;
    }

    // Check if horizontal scrolling is needed
    function checkHorizontalScrollNeeded() {
      const doc = getIframeDoc();
      if (!doc || !doc.documentElement) return false;
      const scrollWidth = doc.documentElement.scrollWidth || doc.body.scrollWidth;
      const clientWidth = doc.documentElement.clientWidth || doc.body.clientWidth;
      return scrollWidth > clientWidth;
    }

    // Calculate and update scrollbar positions
    function updateScrollbar() {
      const doc = getIframeDoc();
      if (!doc || !doc.documentElement) return;

      const needsVertical = checkVerticalScrollNeeded();
      const needsHorizontal = checkHorizontalScrollNeeded();

      // Update vertical scrollbar
      const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop;
      const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
      const clientHeight = doc.documentElement.clientHeight || doc.body.clientHeight;

      if (needsVertical) {
        vScrollbarContainer.style.display = 'block';

        // Adjust track height if horizontal scrollbar is also present (leave 12px gap)
        const containerHeight = container.offsetHeight;
        const adjustedHeight = needsHorizontal ? containerHeight - 16 : containerHeight - 8; // Account for 4px top/bottom margins

        vScrollbarTrack.style.height = `${adjustedHeight}px`;

        const trackHeight = vScrollbarTrack.offsetHeight;
        const thumbHeight = Math.max(40, (clientHeight / scrollHeight) * trackHeight);
        const thumbTop = (scrollTop / (scrollHeight - clientHeight)) * (trackHeight - thumbHeight);

        vScrollbarThumb.style.height = `${thumbHeight}px`;
        vScrollbarThumb.style.top = `${thumbTop}px`;
      } else {
        vScrollbarContainer.style.display = 'none';
      }

      // Update horizontal scrollbar
      const scrollLeft = doc.documentElement.scrollLeft || doc.body.scrollLeft;
      const scrollWidth = doc.documentElement.scrollWidth || doc.body.scrollWidth;
      const clientWidth = doc.documentElement.clientWidth || doc.body.clientWidth;

      if (needsHorizontal) {
        hScrollbarContainer.style.display = 'block';

        // Adjust track width if vertical scrollbar is also present (leave 12px gap)
        const containerWidth = container.offsetWidth;
        const adjustedWidth = needsVertical ? containerWidth - 16 : containerWidth - 8; // Account for 4px left/right margins

        hScrollbarTrack.style.width = `${adjustedWidth}px`;

        const trackWidth = hScrollbarTrack.offsetWidth;
        const thumbWidth = Math.max(40, (clientWidth / scrollWidth) * trackWidth);
        const thumbLeft = (scrollLeft / (scrollWidth - clientWidth)) * (trackWidth - thumbWidth);

        hScrollbarThumb.style.width = `${thumbWidth}px`;
        hScrollbarThumb.style.left = `${thumbLeft}px`;
      } else {
        hScrollbarContainer.style.display = 'none';
      }
    }

    // Handle iframe scroll
    function handleIframeScroll() {
      updateScrollbar();
      showScrollbar();
    }

    // Handle mouse wheel on scrollbar area
    function handleWheel(e) {
      e.preventDefault();
      const doc = getIframeDoc();
      if (!doc) return;

      const deltaY = e.deltaY || e.detail || (e.wheelDelta * -1);
      const deltaX = e.deltaX || 0;

      // Handle vertical scrolling
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        const scrollAmount = deltaY > 0 ? 100 : -100;
        doc.documentElement.scrollTop += scrollAmount;
        doc.body.scrollTop += scrollAmount;
      } else {
        // Handle horizontal scrolling
        const scrollAmount = deltaX > 0 ? 100 : -100;
        doc.documentElement.scrollLeft += scrollAmount;
        doc.body.scrollLeft += scrollAmount;
      }

      updateScrollbar();
      showScrollbar();
    }

    // Handle vertical thumb drag
    function handleVerticalThumbMouseDown(e) {
      e.preventDefault();
      vIsDragging = true;
      vDragStartY = e.clientY;
      vThumbStartTop = parseFloat(vScrollbarThumb.style.top) || 0;

      vScrollbarThumb.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

      function handleMouseMove(e) {
        if (!vIsDragging) return;

        const deltaY = e.clientY - vDragStartY;
        const trackHeight = vScrollbarTrack.offsetHeight;
        const thumbHeight = vScrollbarThumb.offsetHeight;
        const newTop = Math.max(0, Math.min(trackHeight - thumbHeight, vThumbStartTop + deltaY));

        vScrollbarThumb.style.top = `${newTop}px`;

        // Update iframe scroll position
        const doc = getIframeDoc();
        if (doc) {
          const scrollRatio = newTop / (trackHeight - thumbHeight);
          const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
          const clientHeight = doc.documentElement.clientHeight || doc.body.clientHeight;
          const scrollTop = scrollRatio * (scrollHeight - clientHeight);

          doc.documentElement.scrollTop = scrollTop;
          doc.body.scrollTop = scrollTop;
        }
      }

      function handleMouseUp() {
        vIsDragging = false;
        vScrollbarThumb.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    // Handle horizontal thumb drag
    function handleHorizontalThumbMouseDown(e) {
      e.preventDefault();
      hIsDragging = true;
      hDragStartX = e.clientX;
      hThumbStartLeft = parseFloat(hScrollbarThumb.style.left) || 0;

      hScrollbarThumb.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

      function handleMouseMove(e) {
        if (!hIsDragging) return;

        const deltaX = e.clientX - hDragStartX;
        const trackWidth = hScrollbarTrack.offsetWidth;
        const thumbWidth = hScrollbarThumb.offsetWidth;
        const newLeft = Math.max(0, Math.min(trackWidth - thumbWidth, hThumbStartLeft + deltaX));

        hScrollbarThumb.style.left = `${newLeft}px`;

        // Update iframe scroll position
        const doc = getIframeDoc();
        if (doc) {
          const scrollRatio = newLeft / (trackWidth - thumbWidth);
          const scrollWidth = doc.documentElement.scrollWidth || doc.body.scrollWidth;
          const clientWidth = doc.documentElement.clientWidth || doc.body.clientWidth;
          const scrollLeft = scrollRatio * (scrollWidth - clientWidth);

          doc.documentElement.scrollLeft = scrollLeft;
          doc.body.scrollLeft = scrollLeft;
        }
      }

      function handleMouseUp() {
        hIsDragging = false;
        hScrollbarThumb.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    // Create vertical scrollbar
    const vScrollbarContainer = document.createElement('div');
    vScrollbarContainer.className = 'gem-custom-scrollbar gem-custom-scrollbar-vertical';
    Object.assign(vScrollbarContainer.style, {
      position: 'absolute',
      top: '4px',
      right: '2px',
      width: '12px',
      height: 'calc(100% - 8px)',
      background: 'transparent',
      zIndex: '10',
      opacity: '0',
      transition: 'opacity 0.2s ease',
      pointerEvents: 'auto'
    });

    const vScrollbarTrack = document.createElement('div');
    vScrollbarTrack.className = 'gem-scrollbar-track gem-scrollbar-track-vertical';
    Object.assign(vScrollbarTrack.style, {
      position: 'absolute',
      top: '0',
      right: '2px',
      width: '8px',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.1)',
      borderRadius: '4px',
      pointerEvents: 'auto'
    });

    const vScrollbarThumb = document.createElement('div');
    vScrollbarThumb.className = 'gem-scrollbar-thumb gem-scrollbar-thumb-vertical';
    Object.assign(vScrollbarThumb.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      width: '8px',
      height: '40px',
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '4px',
      cursor: 'pointer',
      pointerEvents: 'auto',
      transition: 'background-color 0.2s ease'
    });

    vScrollbarTrack.appendChild(vScrollbarThumb);
    vScrollbarContainer.appendChild(vScrollbarTrack);
    container.appendChild(vScrollbarContainer);

    // Create horizontal scrollbar
    const hScrollbarContainer = document.createElement('div');
    hScrollbarContainer.className = 'gem-custom-scrollbar gem-custom-scrollbar-horizontal';
    Object.assign(hScrollbarContainer.style, {
      position: 'absolute',
      bottom: '2px',
      left: '4px',
      height: '12px',
      width: 'calc(100% - 8px)',
      background: 'transparent',
      zIndex: '10',
      opacity: '0',
      transition: 'opacity 0.2s ease',
      pointerEvents: 'auto'
    });

    const hScrollbarTrack = document.createElement('div');
    hScrollbarTrack.className = 'gem-scrollbar-track gem-scrollbar-track-horizontal';
    Object.assign(hScrollbarTrack.style, {
      position: 'absolute',
      bottom: '2px',
      left: '0',
      height: '8px',
      width: '100%',
      background: 'rgba(0, 0, 0, 0.1)',
      borderRadius: '4px',
      pointerEvents: 'auto'
    });

    const hScrollbarThumb = document.createElement('div');
    hScrollbarThumb.className = 'gem-scrollbar-thumb gem-scrollbar-thumb-horizontal';
    Object.assign(hScrollbarThumb.style, {
      position: 'absolute',
      bottom: '0',
      left: '0',
      height: '8px',
      width: '40px',
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '4px',
      cursor: 'pointer',
      pointerEvents: 'auto',
      transition: 'background-color 0.2s ease'
    });

    hScrollbarTrack.appendChild(hScrollbarThumb);
    hScrollbarContainer.appendChild(hScrollbarTrack);
    container.appendChild(hScrollbarContainer);

    // Set up event listeners
    const doc = getIframeDoc();
    if (doc) {
      doc.addEventListener('scroll', handleIframeScroll, { passive: true });

      // Update scrollbar when content changes
      const resizeObserver = new ResizeObserver(() => {
        setTimeout(updateScrollbar, 100); // Debounce for performance
      });
      resizeObserver.observe(doc.documentElement);
    }

    // Add event listeners for vertical scrollbar
    vScrollbarContainer.addEventListener('wheel', handleWheel);
    vScrollbarThumb.addEventListener('mousedown', handleVerticalThumbMouseDown);

    // Add event listeners for horizontal scrollbar
    hScrollbarContainer.addEventListener('wheel', handleWheel);
    hScrollbarThumb.addEventListener('mousedown', handleHorizontalThumbMouseDown);

    // Add hover listeners to the container (iframe wrapper) to show scrollbars
    container.addEventListener('mouseenter', showScrollbar);
    container.addEventListener('mouseleave', () => {
      if (!vIsDragging && !hIsDragging) {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          if (!container.matches(':hover') &&
              !vScrollbarContainer.matches(':hover') &&
              !hScrollbarContainer.matches(':hover')) {
            vScrollbarContainer.style.opacity = checkVerticalScrollNeeded() ? '0' : '0';
            hScrollbarContainer.style.opacity = checkHorizontalScrollNeeded() ? '0' : '0';
          }
        }, 200);
      }
    });

    // Initial update
    updateScrollbar();

    // Store references for cleanup if needed
    iframe._gemScrollbar = {
      vContainer: vScrollbarContainer,
      hContainer: hScrollbarContainer,
      destroy: function() {
        if (doc) {
          doc.removeEventListener('scroll', handleIframeScroll);
        }
        vScrollbarContainer.remove();
        hScrollbarContainer.remove();
      }
    };
  }

  // ------------------------------------------------------------
  // Cleanup function (if needed)
  // ------------------------------------------------------------
  function cleanup() {
    if (duplicateContainer && duplicateContainer.parentNode) {
      duplicateContainer.parentNode.removeChild(duplicateContainer);
      duplicateContainer = null;
      duplicateIframe = null;
    }
    originalIframe = null;
    isObserving = false;
  }

  // ------------------------------------------------------------
  // Expose cleanup function globally (optional)
  // ------------------------------------------------------------
  window.cleanupContactPreviewDuplication = cleanup;

  // ------------------------------------------------------------
  // Initialize when DOM is ready
  // ------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContactPreviewDuplication);
  } else {
    initializeContactPreviewDuplication();
  }

})();
