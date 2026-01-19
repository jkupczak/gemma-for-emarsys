console.log("[Gem] overlay-panel-controls.js loaded");

// ------------------------------------------------------------
// Compact Email Tools Dropdown
// ------------------------------------------------------------

function initializeCompactEmailTools() {
  console.log("[Gem] Initializing compact email tools dropdown");

  // Wait for the navigation section to appear
  waitForElement('.e-contentblocks-navigation_section', (navSection) => {
    console.log("[Gem] Content blocks navigation section found, adding compact tools");

    // Create the compact tools container
    const compactToolsDiv = document.createElement('div');
    compactToolsDiv.className = 'gem-compact-email-tools';
    compactToolsDiv.style.display = 'none';

    // Create the dropdown container
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'gem-compact-email-tools-dropdown';

    // Create the select element
    const selectElement = document.createElement('select');
    selectElement.className = 'e-input e-input-sm gem-email-tools-select';

    // Add options
    const options = [
      { value: 'general-settings', text: 'General Settings' },
      { value: 'content-creation', text: 'Content Creation', default: true },
      { value: 'campaign-check', text: 'Campaign Check' },
      { value: 'scheduling', text: 'Scheduling' }
    ];

    options.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.text;
      if (option.default) {
        optionElement.selected = true;
      }
      selectElement.appendChild(optionElement);
    });

    // Handle selection changes
    selectElement.addEventListener('change', (event) => {
      const selectedValue = event.target.value;
      console.log(`[Gem] Email tools dropdown changed to: ${selectedValue}`);

      // Click the appropriate button based on selection
      switch (selectedValue) {
        case 'general-settings':
          clickEmailToolButton('details');
          break;
        case 'campaign-check':
          clickEmailToolButton('deliveryadvisor');
          break;
        case 'scheduling':
          clickEmailToolButton('schedule');
          break;
        case 'content-creation':
          // No click needed for content creation (default)
          break;
      }
    });

    dropdownContainer.appendChild(selectElement);
    compactToolsDiv.appendChild(dropdownContainer);

    // Add the save button element
    const saveButtonHtml = `
      <gem-cb-draft-save-button class="cb-header-button e-layout__action">
        <button class="e-btn e-btn-primary" aria-label="" disabled="">
          <div class="e-btn__loading">
            <e-spinner data-size="small">
              <div aria-atomic="true" aria-live="assertive" class="e-spinner">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="e-spinner-svg e-spinner-svg-small">
                  <title>Loading</title>
                  <circle cx="50" cy="50" class="e-spinner-circle e-spinner-circle-small e-spinner-svg__circle_base" r="40"></circle>
                  <circle cx="50" cy="50" class="e-spinner-circle e-spinner-circle-small e-spinner-svg__circle_01 e-spinner-svg__circle_01-small" r="40"></circle>
                  <circle cx="50" cy="50" class="e-spinner-circle e-spinner-circle-small e-spinner-svg__circle_02 e-spinner-svg__circle_02-small" r="40"></circle>
                  <circle cx="50" cy="50" class="e-spinner-circle e-spinner-circle-small e-spinner-svg__circle_03 e-spinner-svg__circle_03-small" r="40"></circle>
                </svg>
              </div>
            </e-spinner>
          </div>
          Saved
        </button>
      </gem-cb-draft-save-button>
    `;

    const saveButtonContainer = document.createElement('div');
    saveButtonContainer.innerHTML = saveButtonHtml;
    const saveButtonElement = saveButtonContainer.firstElementChild;
    compactToolsDiv.appendChild(saveButtonElement);

    // Add click handler to our save button
    const ourSaveButton = saveButtonElement.querySelector('button');
    ourSaveButton.addEventListener('click', () => {
      const originalSaveButton = document.querySelector('cb-draft-save-button button');
      if (originalSaveButton) {
        console.log('[Gem] Clicking original save button');
        originalSaveButton.click();
      } else {
        console.log('[Gem] Original save button not found');
      }
    });

    // Set up observers to sync disabled state and loading classes
    setupSaveButtonSync();

    // Add as the first child of the navigation section
    navSection.insertBefore(compactToolsDiv, navSection.firstChild);

    console.log("[Gem] Compact email tools dropdown added successfully");
  });
}

function clickEmailToolButton(buttonType) {
  const selector = `.e-steps__progress button[onclick*="${buttonType}"]`;
  const button = document.querySelector(selector);

  if (button) {
    console.log(`[Gem] Clicking ${buttonType} button:`, button);
    button.click();
  } else {
    console.log(`[Gem] Could not find ${buttonType} button with selector: ${selector}`);
  }
}

function setupSaveButtonSync() {
  console.log('[Gem] Setting up save button synchronization');

  // Function to sync the disabled state
  function syncDisabledState() {
    const originalButton = document.querySelector('cb-draft-save-button button');
    const ourButton = document.querySelector('gem-cb-draft-save-button button');

    if (originalButton && ourButton) {
      const isDisabled = originalButton.disabled;
      if (ourButton.disabled !== isDisabled) {
        console.log(`[Gem] Syncing disabled state: ${isDisabled}`);
        ourButton.disabled = isDisabled;

        // Update text content based on disabled state
        // Find the text node (should be the last child after the loading div)
        const textNode = Array.from(ourButton.childNodes).find(node =>
          node.nodeType === Node.TEXT_NODE && node.textContent.trim()
        );

        if (isDisabled) {
          if (textNode) {
            textNode.textContent = 'Saved';
          }
          // Ensure loading element is present when disabled
          if (!ourButton.querySelector('.e-btn__loading')) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'e-btn__loading';
            loadingDiv.innerHTML = `
              <e-spinner data-size="small">
                <div aria-atomic="true" aria-live="assertive" class="e-spinner">
                  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="e-spinner-svg e-spinner-svg-small">
                    <title>Loading</title>
                    <circle cx="50" cy="50" class="e-spinner-circle e-spinner-circle-small e-spinner-svg__circle_base" r="40"></circle>
                    <circle cx="50" cy="50" class="e-spinner-circle e-spinner-circle-small e-spinner-svg__circle_01 e-spinner-svg__circle_01-small" r="40"></circle>
                    <circle cx="50" cy="50" class="e-spinner-circle e-spinner-circle-small e-spinner-svg__circle_02 e-spinner-svg__circle_02-small" r="40"></circle>
                    <circle cx="50" cy="50" class="e-spinner-circle e-spinner-circle-small e-spinner-svg__circle_03 e-spinner-svg__circle_03-small" r="40"></circle>
                  </svg>
                </div>
              </e-spinner>
            `;
            ourButton.insertBefore(loadingDiv, ourButton.firstChild);
          }
        } else {
          if (textNode) {
            textNode.textContent = 'Save Draft';
          }
          // Remove loading element when enabled
          const loadingElement = ourButton.querySelector('.e-btn__loading');
          if (loadingElement) {
            loadingElement.remove();
          }
        }
      }
    }
  }

  // Function to sync the loading element classes
  function syncLoadingClasses() {
    const originalLoading = document.querySelector('cb-draft-save-button button .e-btn__loading');
    const ourLoading = document.querySelector('gem-cb-draft-save-button button .e-btn__loading');

    if (originalLoading && ourLoading) {
      const originalClasses = Array.from(originalLoading.classList);
      const ourClasses = Array.from(ourLoading.classList);

      // Remove classes that are not in the original
      ourClasses.forEach(className => {
        if (!originalClasses.includes(className)) {
          ourLoading.classList.remove(className);
        }
      });

      // Add classes that are in the original but not in ours
      originalClasses.forEach(className => {
        if (!ourClasses.includes(className)) {
          ourLoading.classList.add(className);
        }
      });
    }
  }

  // Set up MutationObserver for the original button
  const originalButton = document.querySelector('cb-draft-save-button button');
  if (originalButton) {
    const buttonObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
          syncDisabledState();
        }
      });
    });

    buttonObserver.observe(originalButton, {
      attributes: true,
      attributeFilter: ['disabled']
    });

    console.log('[Gem] Set up observer for original save button disabled state');
  }

  // Set up MutationObserver for the loading element
  const originalLoading = document.querySelector('cb-draft-save-button button .e-btn__loading');
  if (originalLoading) {
    const loadingObserver = new MutationObserver(() => {
      syncLoadingClasses();
    });

    loadingObserver.observe(originalLoading, {
      attributes: true,
      attributeFilter: ['class']
    });

    console.log('[Gem] Set up observer for original save button loading classes');
  }

  // Initial sync
  setTimeout(() => {
    syncDisabledState();
    syncLoadingClasses();
  }, 100);

  // Set up periodic sync as a fallback (in case observers miss something)
  setInterval(() => {
    syncDisabledState();
    syncLoadingClasses();
  }, 1000);
}





// No longer needed since we're moving the original element instead of cloning

// Handle overlay panel controls, including Escape key functionality
function initializeOverlayPanelControls() {
  console.log("[Gem] Initializing overlay panel controls");

  // Function to handle Escape key presses
  function handleEscapeKey(event) {
    // Only handle Escape key
    if (event.key === 'Escape' || event.code === 'Escape' || event.keyCode === 27) {
    // If our modals are open, ESC should close them (and NOT the underlying
    // Image Properties dialog). We must suppress Emarsys' ESC handler in this case.
    const metaModal = document.getElementById('gem-favorite-image-meta-modal');
    if (metaModal) {
      try { metaModal.remove(); } catch (_) {}
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }

    // Check for category modal
    const categoryModal = document.getElementById('gem-favorite-category-modal');
    if (categoryModal) {
      try { categoryModal.remove(); } catch (_) {}
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }

    // Check for image details modal
    const detailsModal = document.getElementById('gem-seen-image-details-modal');
    if (detailsModal) {
      try { detailsModal.remove(); } catch (_) {}
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }

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

    // Debug sequence for image preview tracing
    let gemImagePreviewDebugSeq = 0;

    const GEM_RECENT_IMAGES_STORAGE_KEY = 'gemRecentlyUsedImages';
    const GEM_RECENT_IMAGES_MAX = 100;
    const GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY = 'gemRecentlySeenImages';
    const GEM_RECENTLY_SEEN_IMAGES_MAX = 250;
    const GEM_FAVORITE_IMAGES_STORAGE_KEY = 'gemFavoriteImages';
    const GEM_FAVORITE_IMAGES_MAX = 1000;
    const GEM_FAVORITE_IMAGE_META_STORAGE_KEY = 'gemFavoriteImageMeta';
    // Consolidated storage for favorites with metadata
    const GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY = 'gemFavoriteImagesConsolidated';
    const GEM_FAVORITE_IMAGE_CATEGORY_COLLAPSE_KEY = 'gemFavoriteImageCategoryCollapse';
    const GEM_RECENTLY_SEEN_IMAGE_GROUP_COLLAPSE_KEY = 'gemRecentlySeenImageGroupCollapse';
    const GEM_RECENT_IMAGES_BTN_CLASS = 'gem-recent-images-btn';
    const GEM_RECENT_IMAGES_PICKER_PREFS_KEY = 'gemRecentImagesPickerPrefs';
    const GEM_IMAGE_PROPERTIES_SEARCH_KEY = 'gemImagePropertiesSearch';

    function getRecentImagesPickerPrefs(callback) {
      try {
        chrome.storage.sync.get(
          {
            [GEM_RECENT_IMAGES_PICKER_PREFS_KEY]: {
              view: 'table',
              density: 'small',
              source: 'recent', // recent | favorites | seen
              gridCols: 6, // grid columns (3-8)
              favGroupBy: 'category', // category | language | translation
              seenGroupBy: 'path' // path | date
            }
          },
          (result) => {
            const prefs = result && result[GEM_RECENT_IMAGES_PICKER_PREFS_KEY];
            const view = prefs && (prefs.view === 'grid' ? 'grid' : 'table');
            const density = prefs && (prefs.density === 'medium' || prefs.density === 'large' ? prefs.density : 'small');
            const source =
              prefs && (prefs.source === 'favorites' ? 'favorites' : (prefs.source === 'seen' ? 'seen' : 'recent'));
            const gridColsRaw = prefs && Number(prefs.gridCols);
            const gridCols =
              Number.isFinite(gridColsRaw) ? Math.min(8, Math.max(3, Math.round(gridColsRaw))) : 6;
          const favGroupBy =
            prefs && (prefs.favGroupBy === 'language' ? 'language' : (prefs.favGroupBy === 'translation' ? 'translation' : 'category'));
          const seenGroupBy =
            prefs && (prefs.seenGroupBy === 'date' ? 'date' : 'path');
            callback({ view, density, source, gridCols, favGroupBy, seenGroupBy });
          }
        );
      } catch (e) {
        callback({ view: 'table', density: 'small', source: 'recent', gridCols: 6, favGroupBy: 'category', seenGroupBy: 'path' });
      }
    }

    function saveRecentImagesPickerPrefs(prefs) {
      try {
        const view = prefs && (prefs.view === 'grid' ? 'grid' : 'table');
        const density = prefs && (prefs.density === 'medium' || prefs.density === 'large' ? prefs.density : 'small');
        const source =
          prefs && (prefs.source === 'favorites' ? 'favorites' : (prefs.source === 'seen' ? 'seen' : 'recent'));
        const gridColsRaw = prefs && Number(prefs.gridCols);
        const gridCols = Number.isFinite(gridColsRaw) ? Math.min(8, Math.max(3, Math.round(gridColsRaw))) : 6;
        const favGroupBy =
          prefs && (prefs.favGroupBy === 'language' ? 'language' : (prefs.favGroupBy === 'translation' ? 'translation' : 'category'));
        const seenGroupBy =
          prefs && (prefs.seenGroupBy === 'date' ? 'date' : 'path');
        chrome.storage.sync.set({
          [GEM_RECENT_IMAGES_PICKER_PREFS_KEY]: { view, density, source, gridCols, favGroupBy, seenGroupBy }
        });
      } catch (_) {}
    }

    function normalizeRecentImageUrlCandidate(raw) {
      let s = String(raw || '');
      // Common zero-width fillers and their serialized forms
      s = s
        .replace(/&ZeroWidthSpace;/gi, '')
        .replace(/&#8203;/g, '')
        .replace(/&#x200B;/gi, '')
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
      s = s.trim();

      // Reject obvious placeholders / non-URLs
      if (!s) return '';
      if (s === 'null') return '';
      if (s === 'http://example.com/image.png') return '';
      if (/\s/.test(s)) return ''; // URLs in this field shouldn't contain whitespace
      if (/[<>]/.test(s)) return '';

      const looksLikeUrl =
        /^https?:\/\/.+/i.test(s) ||
        /^\/\/.+/i.test(s) ||
        /^data:image\/.+/i.test(s);

      return looksLikeUrl ? s : '';
    }

    function looksLikeImageUrl(url) {
      const s = String(url || '');
      if (!s) return false;
      if (/^data:image\//i.test(s)) return true;
      // Common image extensions (allow query/hash)
      return /\.(png|jpe?g|gif|webp|svg|avif|bmp|tiff?)(\?|#|$)/i.test(s);
    }

    // Use the same normalization rules for the preview, so we don't keep "changing" URLs
    // due to invisible characters or formatting differences.
    function normalizePreviewImageUrl(raw) {
      return normalizeRecentImageUrlCandidate(raw) || '';
    }

    function formatRecentImageDate(ts) {
      try {
        return new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }).format(new Date(ts));
      } catch (e) {
        return new Date(ts).toDateString();
      }
    }

    function getRecentImages(callback) {
      try {
        chrome.storage.local.get({ [GEM_RECENT_IMAGES_STORAGE_KEY]: [] }, (result) => {
          const list = result && result[GEM_RECENT_IMAGES_STORAGE_KEY];
          const raw = Array.isArray(list) ? list : [];
          // Prune invalid entries (e.g., ZeroWidthSpace) on read
          const cleaned = raw
            .map((x) => {
              const url = normalizeRecentImageUrlCandidate(x && x.url);
              const ts = (x && typeof x.ts === 'number') ? x.ts : 0;
              const friendlyFilename = (x && typeof x.friendlyFilename === 'string') ? x.friendlyFilename : '';
              return url ? { url, ts, friendlyFilename } : null;
            })
            .filter(Boolean);
          if (cleaned.length !== raw.length) {
            console.log('[Gem][RecentImages] Pruned invalid recent image entries:', raw.length - cleaned.length);
            saveRecentImages(cleaned);
          }
          callback(cleaned);
        });
      } catch (e) {
        callback([]);
      }
    }

    function saveRecentImages(list, callback) {
      try {
        chrome.storage.local.set({ [GEM_RECENT_IMAGES_STORAGE_KEY]: list }, () => {
          callback && callback();
        });
      } catch (e) {
        callback && callback();
      }
    }

    function upsertRecentImageUrl(url) {
      const u = normalizeRecentImageUrlCandidate(url);
      if (!u) {
        if (url) console.log('[Gem][RecentImages] Ignoring non-image/invalid URL candidate:', url);
        return;
      }

      const now = Date.now();
      getRecentImages((list) => {
        const next = Array.isArray(list) ? [...list] : [];
        const idx = next.findIndex((x) => x && typeof x.url === 'string' && x.url === u);
        if (idx >= 0) {
          console.log('[Gem][RecentImages] URL already exists, bumping timestamp:', u);
          next[idx] = { url: u, ts: now, friendlyFilename: (next[idx] && next[idx].friendlyFilename) || '' };
        } else {
          console.log('[Gem][RecentImages] Adding new URL:', u);
          next.push({ url: u, ts: now, friendlyFilename: '' });
        }

        // Keep max size by trimming oldest
        next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        while (next.length > GEM_RECENT_IMAGES_MAX) next.shift();

        saveRecentImages(next);
      });
    }

    // ------------------------------------------------------------
    // Recently Seen (Media DB)
    // ------------------------------------------------------------

    function getRecentlySeenImages(callback) {
      try {
        chrome.storage.local.get({ [GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]: [] }, (result) => {
          const list = result && result[GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY];
          const raw = Array.isArray(list) ? list : [];
          const cleaned = raw
            .map((x) => {
              const url = normalizeRecentImageUrlCandidate(x && x.url);
              const ts = (x && typeof x.ts === 'number') ? x.ts : 0;
              const path = (x && typeof x.path === 'string') ? x.path : '';
              const friendlyFilename = (x && typeof x.friendlyFilename === 'string') ? x.friendlyFilename : '';
              return (url && looksLikeImageUrl(url)) ? { url, ts, path, friendlyFilename } : null;
            })
            .filter(Boolean);
          if (cleaned.length !== raw.length) {
            console.log('[Gem][RecentlySeen] Pruned invalid entries:', raw.length - cleaned.length);
            saveRecentlySeenImages(cleaned);
          }
          callback(cleaned);
        });
      } catch (e) {
        callback([]);
      }
    }

    function saveRecentlySeenImages(list, callback) {
      try {
        chrome.storage.local.set({ [GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]: list }, () => {
          callback && callback();
        });
      } catch (e) {
        callback && callback();
      }
    }

    function upsertRecentlySeenImage(url, path) {
      const u = normalizeRecentImageUrlCandidate(url);
      if (!u || !looksLikeImageUrl(u)) return;
      const p = (typeof path === 'string') ? path.trim() : '';
      const now = Date.now();
      getRecentlySeenImages((list) => {
        const next = Array.isArray(list) ? [...list] : [];
        const idx = next.findIndex((x) => x && x.url === u);
        if (idx >= 0) {
          next[idx] = { url: u, ts: now, path: p || (next[idx] && next[idx].path) || '' };
        } else {
          next.push({ url: u, ts: now, path: p || '' });
        }
        next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        while (next.length > GEM_RECENTLY_SEEN_IMAGES_MAX) next.shift();
        saveRecentlySeenImages(next);
      });
    }

    // ------------------------------------------------------------
    // Favorite Images
    // ------------------------------------------------------------

    function getFavoriteImages(callback) {
      try {
        chrome.storage.local.get({ [GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY]: [] }, (result) => {
          const consolidated = result && result[GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY];
          const raw = Array.isArray(consolidated) ? consolidated : [];
          const cleaned = raw
            .map((x) => {
              const url = normalizeRecentImageUrlCandidate(x && x.url);
              const ts = (x && typeof x.ts === 'number') ? x.ts : 0;
              return url ? { url, ts } : null;
            })
            .filter(Boolean);
          if (cleaned.length !== raw.length) {
            console.log('[Gem][FavoriteImages] Pruned invalid favorite image entries:', raw.length - cleaned.length);
            saveFavoriteImages(cleaned);
          }
          callback(cleaned);
        });
      } catch (e) {
        callback([]);
      }
    }

    function saveFavoriteImages(list, callback) {
      try {
        // Get existing consolidated data to preserve metadata
        chrome.storage.local.get({ [GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY]: [] }, (result) => {
          const existing = result && result[GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY];
          const existingMap = new Map();
          if (Array.isArray(existing)) {
            existing.forEach(item => {
              if (item && item.url) {
                existingMap.set(item.url, item);
              }
            });
          }

          // Create new consolidated list with preserved metadata
          const consolidated = list.map(({ url, ts }) => {
            const existingItem = existingMap.get(url);
            return {
              url,
              ts,
              meta: (existingItem && existingItem.meta) || {}
            };
          });

          chrome.storage.local.set({ [GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY]: consolidated }, () => {
            callback && callback();
          });
        });
      } catch (e) {
        callback && callback();
      }
    }

    function toggleFavoriteImageUrl(url, callback) {
      const u = normalizeRecentImageUrlCandidate(url);
      if (!u) return callback && callback(false);

      const now = Date.now();
      getFavoriteImages((list) => {
        const next = Array.isArray(list) ? [...list] : [];
        const idx = next.findIndex((x) => x && typeof x.url === 'string' && x.url === u);
        let isFav = false;
        if (idx >= 0) {
          next.splice(idx, 1);
          isFav = false;
        } else {
          next.push({ url: u, ts: now });
          isFav = true;
        }

        // Keep max size by trimming oldest
        next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        while (next.length > GEM_FAVORITE_IMAGES_MAX) next.shift();

        saveFavoriteImages(next, () => {
          // Clean up metadata for unfavorited items
          if (!isFav) {
            getFavoriteImageMetaMap((metaMap) => {
              const updatedMeta = { ...metaMap };
              delete updatedMeta[u];
              saveFavoriteImageMetaMap(updatedMeta, () => {
                callback && callback(isFav);
              });
            });
          } else {
            callback && callback(isFav);
          }
        });
      });
    }

    function ensureFavoriteImageUrl(url, callback) {
      const u = normalizeRecentImageUrlCandidate(url);
      if (!u) return callback && callback(false);
      const now = Date.now();
      getFavoriteImages((list) => {
        const next = Array.isArray(list) ? [...list] : [];
        const idx = next.findIndex((x) => x && typeof x.url === 'string' && x.url === u);
        if (idx >= 0) {
          next[idx] = { url: u, ts: now };
        } else {
          next.push({ url: u, ts: now });
        }
        next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        while (next.length > GEM_FAVORITE_IMAGES_MAX) next.shift();
        saveFavoriteImages(next, () => callback && callback(true));
      });
    }

    // ------------------------------------------------------------
    // Favorite Image Metadata (per URL)
    // ------------------------------------------------------------

    function getFavoriteImageMetaMap(callback) {
      try {
        chrome.storage.local.get({ [GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY]: [] }, (result) => {
          const consolidated = result && result[GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY];
          const map = {};
          if (Array.isArray(consolidated)) {
            consolidated.forEach(item => {
              if (item && item.url && item.meta) {
                map[item.url] = item.meta;
              }
            });
          }
          callback(map);
        });
      } catch (e) {
        callback({});
      }
    }

    function saveFavoriteImageMetaMap(map, callback) {
      try {
        // Get existing consolidated data
        chrome.storage.local.get({ [GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY]: [] }, (result) => {
          const existing = result && result[GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY];
          const updated = [];

          if (Array.isArray(existing)) {
            existing.forEach(item => {
              if (item && item.url) {
                updated.push({
                  url: item.url,
                  ts: item.ts || 0,
                  meta: (map && map[item.url]) || {}
                });
              }
            });
          }

          chrome.storage.local.set({ [GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY]: updated }, () => {
            callback && callback();
          });
        });
      } catch (e) {
        callback && callback();
      }
    }

    function upsertFavoriteImageMeta(url, meta, callback) {
      const u = normalizeRecentImageUrlCandidate(url);
      if (!u) return callback && callback(false);
      const normalizeWidth = (w) => {
        const n =
          (typeof w === 'number') ? w :
          (typeof w === 'string' ? parseInt(w.trim(), 10) : NaN);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : '';
      };
      const clean = {
        category: (meta && typeof meta.category === 'string') ? meta.category.trim() : '',
        keyword: (meta && typeof meta.keyword === 'string') ? meta.keyword.trim() : '',
        language: (meta && typeof meta.language === 'string') ? meta.language.trim() : '',
        altText: (meta && typeof meta.altText === 'string') ? meta.altText.trim() : '',
        translation: (meta && typeof meta.translation === 'string') ? meta.translation.trim() : '',
        width: normalizeWidth(meta && meta.width)
      };
      getFavoriteImageMetaMap((map) => {
        const next = { ...(map || {}) };
        next[u] = clean;
        saveFavoriteImageMetaMap(next, () => callback && callback(true));
      });
    }

    // ------------------------------------------------------------
    // Favorite Category collapse state
    // ------------------------------------------------------------

    function getFavoriteCategoryCollapseMap(callback) {
      try {
        chrome.storage.local.get({ [GEM_FAVORITE_IMAGE_CATEGORY_COLLAPSE_KEY]: {} }, (result) => {
          const map = (result && result[GEM_FAVORITE_IMAGE_CATEGORY_COLLAPSE_KEY]) || {};
          callback(map && typeof map === 'object' ? map : {});
        });
      } catch (e) {
        callback({});
      }
    }

    function saveFavoriteCategoryCollapseMap(map, callback) {
      try {
        chrome.storage.local.set({ [GEM_FAVORITE_IMAGE_CATEGORY_COLLAPSE_KEY]: map || {} }, () => {
          callback && callback();
        });
      } catch (e) {
        callback && callback();
      }
    }

    function getRecentlySeenImageGroupCollapseMap(callback) {
      try {
        chrome.storage.local.get({ [GEM_RECENTLY_SEEN_IMAGE_GROUP_COLLAPSE_KEY]: {} }, (result) => {
          const map = (result && result[GEM_RECENTLY_SEEN_IMAGE_GROUP_COLLAPSE_KEY]) || {};
          callback(map && typeof map === 'object' ? map : {});
        });
      } catch (e) {
        callback({});
      }
    }

    function saveRecentlySeenImageGroupCollapseMap(map, callback) {
      try {
        chrome.storage.local.set({ [GEM_RECENTLY_SEEN_IMAGE_GROUP_COLLAPSE_KEY]: map || {} }, () => {
          callback && callback();
        });
      } catch (e) {
        callback && callback();
      }
    }

    function getActiveImageUrlCodeMirror(modal) {
      // There can be two different vce-codemirror instances, but only one is present at a time.
      const vceCmEl = modal.querySelector('vce-codemirror');
      const cmEl = modal.querySelector('vce-codemirror .CodeMirror');
      if (!vceCmEl && !cmEl) return { cmEl: null, cmInstance: null, value: '' };

      // If CodeMirror is present, grab its instance even if we end up reading the URL from attributes.
      const cmInstance = cmEl ? (cmEl.CodeMirror || null) : null;

      // Most reliable: Emarsys stores the URL in the `html` attribute on vce-codemirror / vce-html-editor.
      const attrUrl =
        (vceCmEl && typeof vceCmEl.getAttribute === 'function' ? (vceCmEl.getAttribute('html') || '').trim() : '') ||
        ((modal.querySelector('vce-html-editor')?.getAttribute('html') || '').trim());
      if (attrUrl) {
        return { cmEl: cmEl || null, cmInstance, value: normalizeRecentImageUrlCandidate(attrUrl) || '' };
      }

      if (cmInstance && typeof cmInstance.getValue === 'function') {
        return { cmEl, cmInstance, value: normalizeRecentImageUrlCandidate(cmInstance.getValue()) || '' };
      }

      // DOM fallback: rendered line content
      let value = '';
      if (cmEl) {
        const pre = cmEl.querySelector('pre.CodeMirror-line');
        if (pre && pre.textContent) value = (pre.textContent || '').trim();
      }

      if (!value) {
        const textarea = (cmEl && cmEl.querySelector('textarea')) || modal.querySelector('vce-codemirror textarea');
        value = textarea ? (textarea.value || '').trim() : ((cmEl && cmEl.textContent) ? cmEl.textContent.trim() : '');
      }
      return { cmEl, cmInstance: null, value: normalizeRecentImageUrlCandidate(value) || '' };
    }

    function setActiveImageUrlCodeMirror(modal, url) {
      const u = (url || '').trim();
      if (!u) return false;

      console.log('[Gem][RecentImages][SetUrl] Attempting to set URL:', u);

      // Prefer the Image URL field's CodeMirror specifically (avoid other codemirrors in the dialog/page).
      const contentRoot = modal.querySelector('.e-dialog__content') || modal;
      const allVceCm = Array.from(contentRoot.querySelectorAll('vce-codemirror'));
      console.log('[Gem][RecentImages][SetUrl] vce-codemirror count in dialog content:', allVceCm.length);

      allVceCm.slice(0, 5).forEach((el, i) => {
        const attr = (el.getAttribute && el.getAttribute('html')) ? el.getAttribute('html') : '';
        const hasCm = !!el.querySelector('.CodeMirror');
        console.log(`[Gem][RecentImages][SetUrl] vce-codemirror[${i}] has .CodeMirror=${hasCm} htmlAttr="${(attr || '').slice(0, 80)}"`, el);
      });

      // Heuristic: pick vce-codemirror with placeholder containing "image" if possible
      const bestVceCm =
        allVceCm.find((el) => ((el.getAttribute('placeholder') || '').toLowerCase().includes('image'))) ||
        allVceCm[0] ||
        null;

      const cmEl = bestVceCm ? bestVceCm.querySelector('.CodeMirror') : null;
      const cmInstance = cmEl ? (cmEl.CodeMirror || null) : null;

      if (!bestVceCm || !cmEl) {
        console.warn('[Gem][RecentImages][SetUrl] No CodeMirror element found for Image URL field.');
        return false;
      }

      const before = (() => {
        try {
          if (cmInstance && typeof cmInstance.getValue === 'function') return cmInstance.getValue();
        } catch (_) {}
        const pre = cmEl.querySelector('pre.CodeMirror-line');
        return pre ? (pre.textContent || '') : '';
      })();
      console.log('[Gem][RecentImages][SetUrl] Before value:', (before || '').slice(0, 200));

      if (cmInstance && typeof cmInstance.setValue === 'function') {
        cmInstance.setValue('');
        cmInstance.setValue(u);
        try {
          cmInstance.focus && cmInstance.focus();
        } catch (_) {}
        const after = (() => {
          try {
            if (typeof cmInstance.getValue === 'function') return cmInstance.getValue();
          } catch (_) {}
          return '';
        })();
        console.log('[Gem][RecentImages][SetUrl] After value (cm.getValue):', (after || '').slice(0, 200));

        // Emarsys often treats these html attributes as the source of truth; keep them in sync.
        try { bestVceCm.setAttribute('html', u); } catch (_) {}
        try {
          const htmlEditor = bestVceCm.closest('vce-code-editor')?.querySelector('vce-html-editor');
          if (htmlEditor) htmlEditor.setAttribute('html', u);
        } catch (_) {}

        return (after || '').trim() === u;
      }

      const textarea = cmEl.querySelector('textarea') || modal.querySelector('vce-codemirror textarea');
      if (textarea) {
        textarea.value = u;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        try { bestVceCm.setAttribute('html', u); } catch (_) {}
        return true;
      }

      return false;
    }

    function ensureMobileAlternateImageEnabled(modal) {
      try {
        const altRadio = modal.querySelector('#imageVisibilitySwitch_useAlternateImage');
        if (!altRadio) return false; // not in Mobile tab / not available
        if (altRadio.checked) return false;

        // Prefer clicking the label (closer to real user action)
        const label = modal.querySelector('label[for="imageVisibilitySwitch_useAlternateImage"]');
        if (label) {
          label.click();
        } else {
          altRadio.click();
        }
        return true; // changed
      } catch (_) {
        return false;
      }
    }

    function setActiveImageUrlCodeMirrorWithRetry(modal, url, attempts = 10, delayMs = 80, onSuccess = null) {
      const ok = setActiveImageUrlCodeMirror(modal, url);
      if (ok) {
        try { onSuccess && onSuccess(); } catch (_) {}
        return true;
      }
      if (attempts <= 0) return false;
      setTimeout(() => setActiveImageUrlCodeMirrorWithRetry(modal, url, attempts - 1, delayMs, onSuccess), delayMs);
      return false;
    }

    function setImageAltTextInput(modal, altText) {
      const t = (altText || '').trim();
      if (!t) return false;
      try {
        const input = modal.querySelector('input.e-input[placeholder="Image alternative text"]');
        if (!input) return false;
        input.value = t;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch (_) {
        return false;
      }
    }

    function setImageWidthInput(modal, width) {
      const n = (typeof width === 'number') ? width : parseInt(String(width || '').trim(), 10);
      if (!Number.isFinite(n) || n <= 0) return false;
      const value = String(Math.trunc(n));
      try {
        // Preferred selector (Chrome supports :has); fallback below if needed.
        let input = null;
        try {
          input = modal.querySelector(".e-accordion .e-grid:has(option[value='px']) > .e-cell:first-child input");
        } catch (_) {}
        if (!input) {
          const grids = Array.from(modal.querySelectorAll('.e-accordion .e-grid'));
          const grid = grids.find((g) => g && g.querySelector && g.querySelector("option[value='px']"));
          input = grid ? grid.querySelector('.e-cell:first-child input') : null;
        }
        if (!input) return false;

        input.value = value;
        try { input.focus(); } catch (_) {}
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        try { input.blur(); } catch (_) {}
        return true;
      } catch (_) {
        return false;
      }
    }

    function showRecentImagesPicker(modal, opts = {}) {
      const leftPanelContainer = modal.querySelector('#gem-image-properties-left-panel');
      if (!leftPanelContainer) return;

      // Create picker container once
      let picker = leftPanelContainer.querySelector('#gem-recent-images-picker');
      if (!picker) {
        picker = document.createElement('div');
        picker.id = 'gem-recent-images-picker';
        picker.className = 'gem-scrollable';
        picker.style.height = '100%';
        picker.style.width = '100%';
        picker.style.display = '';
        picker.style.overflow = 'auto';
        picker.style.background = 'var(--token-box-alternate-background)';
        picker.style.overflowY = 'scroll';
        picker.style.boxSizing = 'border-box';
        leftPanelContainer.appendChild(picker);

        // Load persistent search values and set up picker
        chrome.storage.sync.get({ [GEM_IMAGE_PROPERTIES_SEARCH_KEY]: {} }, (result) => {
          const searches = result[GEM_IMAGE_PROPERTIES_SEARCH_KEY] || {};

          // Set search values from storage or defaults
          picker.dataset.gemFavoriteImagesSearch = searches.favorites || '';
          picker.dataset.gemSeenImagesSearch = searches.seen || '';

          // Default source view
          if (!picker.dataset.gemRecentImagesSource) {
            picker.dataset.gemRecentImagesSource = 'recent'; // recent | favorites
          }
          if (!picker.dataset.gemFavoriteImagesGroupBy) {
            picker.dataset.gemFavoriteImagesGroupBy = 'category'; // category | language | translation
          }
          if (!picker.dataset.gemRecentImagesGridCols) {
            picker.dataset.gemRecentImagesGridCols = '6'; // 3-8
          }
          if (!picker.dataset.gemCollapseExpandAction) {
            picker.dataset.gemCollapseExpandAction = 'collapse'; // collapse | expand
          }

          }); // Close chrome.storage.sync.get callback

          // Delegate clicks for selecting
          picker.addEventListener('click', (e) => {
            const catToggleBtn = e.target.closest && e.target.closest('.gem-fav-cat-toggle');
            if (catToggleBtn) {
              e.preventDefault();
              e.stopPropagation();
              const groupKey = catToggleBtn.getAttribute('data-group-key') || '';
              getFavoriteCategoryCollapseMap((map) => {
                const next = { ...(map || {}) };
                // Back-compat: older builds stored raw category keys (no prefix).
                let legacyKey = null;
                if (groupKey.startsWith('category:')) {
                  legacyKey = groupKey.slice('category:'.length);
                }
                const cur = (next[groupKey] != null) ? !!next[groupKey] : (legacyKey != null ? !!next[legacyKey] : false);
                next[groupKey] = !cur;
                if (legacyKey != null && legacyKey !== groupKey && legacyKey in next) {
                  delete next[legacyKey];
                }
                saveFavoriteCategoryCollapseMap(next, () => showRecentImagesPicker(modal));
              });
              return;
            }

          const seenCatToggleBtn = e.target.closest && e.target.closest('.gem-seen-cat-toggle');
          if (seenCatToggleBtn) {
            e.preventDefault();
            e.stopPropagation();
            const groupKey = seenCatToggleBtn.getAttribute('data-group-key') || '';
            getRecentlySeenImageGroupCollapseMap((map) => {
              const next = { ...(map || {}) };
              const cur = !!next[groupKey];
              next[groupKey] = !cur;
              saveRecentlySeenImageGroupCollapseMap(next, () => showRecentImagesPicker(modal));
            });
            return;
          }

          const sourceTab = e.target.closest && e.target.closest('.e-tabs__title[data-tab]');
          if (sourceTab) {
            e.preventDefault();
            e.stopPropagation();
            const tabValue = sourceTab.getAttribute('data-tab') || '';
            const v = (tabValue === 'favorites') ? 'favorites' : (tabValue === 'seen' ? 'seen' : 'recent');
            picker.dataset.gemRecentImagesSource = v;
            saveRecentImagesPickerPrefs({
              view: picker.dataset.gemRecentImagesView || 'table',
              density: picker.dataset.gemRecentImagesGridDensity || 'small',
              source: v,
              gridCols: Number(picker.dataset.gemRecentImagesGridCols || 6),
              favGroupBy: picker.dataset.gemFavoriteImagesGroupBy || 'category',
              seenGroupBy: picker.dataset.gemSeenImagesGroupBy || 'path'
            });
            showRecentImagesPicker(modal);
            return;
          }

          const collapseExpandAllBtn = e.target.closest && e.target.closest('.gem-collapse-expand-all-btn');
          if (collapseExpandAllBtn) {
            e.preventDefault();
            e.stopPropagation();
            const currentSource = picker.dataset.gemRecentImagesSource || 'recent';

            // Determine the appropriate action based on current group states
            const determineAction = (collapseMap, groupHeaders) => {
              if (!groupHeaders.length) return 'collapse'; // Default if no groups

              // Check current state of all groups
              const groupStates = Array.from(groupHeaders).map(header => {
                const groupKey = header.getAttribute('data-group-key') || '';
                // Handle legacy keys for favorites
                let checkKey = groupKey;
                if (currentSource === 'favorites' && groupKey.startsWith('category:')) {
                  const legacyKey = groupKey.slice('category:'.length);
                  checkKey = collapseMap[legacyKey] !== undefined ? legacyKey : groupKey;
                }
                return collapseMap[checkKey];
              }).filter(state => state !== undefined);

              const collapsedCount = groupStates.filter(state => state === true).length;
              const totalGroups = groupStates.length;

              if (collapsedCount === totalGroups) {
                // All groups are collapsed -> expand all
                return 'expand';
              } else if (collapsedCount === 0) {
                // All groups are expanded -> collapse all
                return 'collapse';
              } else {
                // Mixed state -> use opposite of last action
                const lastAction = picker.dataset.gemCollapseExpandAction || 'collapse';
                return lastAction === 'collapse' ? 'expand' : 'collapse';
              }
            };

            if (currentSource === 'favorites') {
              getFavoriteCategoryCollapseMap((map) => {
                const collapseMap = map || {};
                const groupHeaders = picker.querySelectorAll('.gem-fav-cat-header');
                const action = determineAction(collapseMap, groupHeaders);
                const shouldCollapse = action === 'collapse';

                const next = { ...collapseMap };

                // Apply the determined action to all groups
                groupHeaders.forEach(header => {
                  const groupKey = header.getAttribute('data-group-key') || '';
                  if (groupKey) {
                    // Handle legacy keys for backward compatibility
                    let legacyKey = null;
                    if (groupKey.startsWith('category:')) {
                      legacyKey = groupKey.slice('category:'.length);
                    }
                    next[groupKey] = shouldCollapse;
                    if (legacyKey != null && legacyKey !== groupKey) {
                      next[legacyKey] = shouldCollapse;
                    }
                  }
                });

                saveFavoriteCategoryCollapseMap(next, () => {
                  // Store the action we just performed
                  picker.dataset.gemCollapseExpandAction = action;
                  showRecentImagesPicker(modal);
                });
              });
            } else if (currentSource === 'seen') {
              getRecentlySeenImageGroupCollapseMap((map) => {
                const collapseMap = map || {};
                const groupHeaders = picker.querySelectorAll('.gem-seen-cat-header');
                const action = determineAction(collapseMap, groupHeaders);
                const shouldCollapse = action === 'collapse';

                const next = { ...collapseMap };

                // Apply the determined action to all groups
                groupHeaders.forEach(header => {
                  const groupKey = header.getAttribute('data-group-key') || '';
                  if (groupKey) {
                    next[groupKey] = shouldCollapse;
                  }
                });

                saveRecentlySeenImageGroupCollapseMap(next, () => {
                  // Store the action we just performed
                  picker.dataset.gemCollapseExpandAction = action;
                  showRecentImagesPicker(modal);
                });
              });
            }
            return;
          }

          const catEditBtn = e.target.closest && e.target.closest('.gem-fav-cat-edit');
          if (catEditBtn) {
            e.preventDefault();
            e.stopPropagation();
            const catKey = catEditBtn.getAttribute('data-cat') || '';
            openFavoriteCategoryModal(modal, catKey);
            return;
          }

          const addFavBtn = e.target.closest && e.target.closest('.gem-favorite-images-add-btn');
          if (addFavBtn) {
            e.preventDefault();
            e.stopPropagation();
            openFavoriteImageMetaModal(modal, '', { mode: 'create' });
            return;
          }

          const editBtn = e.target.closest && e.target.closest('.gem-recent-image-edit-btn');
          if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            const url = editBtn.getAttribute('data-url') || '';
            openFavoriteImageMetaModal(modal, url, { mode: 'edit' });
            return;
          }

          const infoBtn = e.target.closest && e.target.closest('.gem-recent-image-info-btn');
          if (infoBtn) {
            e.preventDefault();
            e.stopPropagation();
            const url = infoBtn.getAttribute('data-url') || '';
            openRecentlySeenImageDetailsModal(modal, url);
            return;
          }

          const favBtn = e.target.closest && e.target.closest('.gem-recent-image-fav-btn');
          if (favBtn) {
            e.preventDefault();
            e.stopPropagation();
            const url = favBtn.getAttribute('data-url') || '';
            const beforeScroll = picker.scrollTop || 0;
            toggleFavoriteImageUrl(url, () => {
              // Re-render and preserve scroll position
              showRecentImagesPicker(modal);
              setTimeout(() => { try { picker.scrollTop = beforeScroll; } catch (_) {} }, 0);
            });
            return;
          }

          // Source changes are handled via the dropdown (change event)

          const btn = e.target.closest && e.target.closest('.gem-recent-image-use-btn');
          if (!btn) return;
          const url = btn.getAttribute('data-url') || '';
          console.log('[Gem][RecentImages][SetUrl] Use clicked for url:', url);
          const normalizedUrl = normalizeRecentImageUrlCandidate(url);

          const applyMetaSideEffects = () => {
            if (!normalizedUrl) return;
            getFavoriteImageMetaMap((map) => {
              const meta = (map && typeof map === 'object') ? map[normalizedUrl] : null;
              if (!meta) return;
              const alt = meta && typeof meta.altText === 'string' ? meta.altText.trim() : '';
              if (alt) setImageAltTextInput(modal, alt);
              const w = meta && (typeof meta.width === 'number' || typeof meta.width === 'string') ? meta.width : '';
              if (w) setImageWidthInput(modal, w);
            });
          };

          const switchedMobileRadio = ensureMobileAlternateImageEnabled(modal);
          if (switchedMobileRadio) {
            // Emarsys may re-render the URL editor after switching radios; retry setting URL.
            setActiveImageUrlCodeMirrorWithRetry(modal, url, 12, 90, applyMetaSideEffects);
          } else {
            const ok = setActiveImageUrlCodeMirror(modal, url);
            if (!ok) {
              console.warn('[Gem][RecentImages] Failed to set image URL into active CodeMirror. Leaving picker open.');
              return;
            }
            applyMetaSideEffects();
          }
          upsertRecentImageUrl(url);
        });

        // Favorites/Seen search + grid slider (avoid focus loss by debouncing rerender)
        picker.addEventListener('input', (e) => {
          const favSearchInput = e.target && e.target.closest && e.target.closest('.gem-favorite-images-search');
          const seenSearchInput = e.target && e.target.closest && e.target.closest('.gem-seen-images-search');
          const searchInput = favSearchInput || seenSearchInput;

          if (searchInput) {
            const isFavSearch = !!favSearchInput;
            const searchValue = searchInput.value || '';
            const searchKey = isFavSearch ? 'favorites' : 'seen';

            // Update dataset for immediate UI feedback
            picker.dataset[isFavSearch ? 'gemFavoriteImagesSearch' : 'gemSeenImagesSearch'] = searchValue;

            // Save to persistent storage
            chrome.storage.sync.get({ [GEM_IMAGE_PROPERTIES_SEARCH_KEY]: {} }, (result) => {
              const searches = result[GEM_IMAGE_PROPERTIES_SEARCH_KEY] || {};
              searches[searchKey] = searchValue;
              chrome.storage.sync.set({ [GEM_IMAGE_PROPERTIES_SEARCH_KEY]: searches });
            });

            picker._gemSearchFocus = {
              value: searchValue,
              start: searchInput.selectionStart ?? null,
              end: searchInput.selectionEnd ?? null
            };
            clearTimeout(picker._gemSearchDebounceT);
            picker._gemSearchDebounceT = setTimeout(() => {
              showRecentImagesPicker(modal, { contentOnly: true });
            }, 60);
            return;
          }

          const slider = e.target && e.target.closest && e.target.closest('.gem-fav-grid-cols-slider');
          if (slider) {
            const v = Math.min(8, Math.max(3, Number(slider.value || 6)));
            picker.dataset.gemRecentImagesGridCols = String(v);
            picker.style.setProperty('--gem-recent-grid-cols', String(v));
          }
        }, true);

        picker.addEventListener('change', (e) => {
          const groupSel = e.target && e.target.closest && e.target.closest('.gem-fav-groupby-select');
          if (groupSel) {
            const v = groupSel.value === 'language' ? 'language' : (groupSel.value === 'translation' ? 'translation' : 'category');
            picker.dataset.gemFavoriteImagesGroupBy = v;
            saveRecentImagesPickerPrefs({
              view: picker.dataset.gemRecentImagesView || 'table',
              density: picker.dataset.gemRecentImagesGridDensity || 'small',
              source: picker.dataset.gemRecentImagesSource || 'recent',
              gridCols: Number(picker.dataset.gemRecentImagesGridCols || 6),
              favGroupBy: v,
              seenGroupBy: picker.dataset.gemSeenImagesGroupBy || 'path'
            });
            showRecentImagesPicker(modal);
            return;
          }

          const seenGroupSel = e.target && e.target.closest && e.target.closest('.gem-seen-groupby-select');
          if (seenGroupSel) {
            const v = seenGroupSel.value === 'date' ? 'date' : 'path';
            picker.dataset.gemSeenImagesGroupBy = v;
            saveRecentImagesPickerPrefs({
              view: picker.dataset.gemRecentImagesView || 'table',
              density: picker.dataset.gemRecentImagesGridDensity || 'small',
              source: picker.dataset.gemRecentImagesSource || 'recent',
              gridCols: Number(picker.dataset.gemRecentImagesGridCols || 6),
              seenGroupBy: v
            });
            showRecentImagesPicker(modal);
            return;
          }

          const slider = e.target && e.target.closest && e.target.closest('.gem-fav-grid-cols-slider');
          if (slider) {
            const v = Math.min(8, Math.max(3, Number(slider.value || 6)));
            picker.dataset.gemRecentImagesGridCols = String(v);
            picker.style.setProperty('--gem-recent-grid-cols', String(v));
            saveRecentImagesPickerPrefs({
              view: picker.dataset.gemRecentImagesView || 'table',
              density: picker.dataset.gemRecentImagesGridDensity || 'small',
              source: picker.dataset.gemRecentImagesSource || 'recent',
              gridCols: v,
              favGroupBy: picker.dataset.gemFavoriteImagesGroupBy || 'category',
              seenGroupBy: picker.dataset.gemSeenImagesGroupBy || 'path'
            });
          }
        }, true);

        // Toggle view (table vs grid)
        picker.addEventListener('click', (e) => {
          const toggleBtn = e.target.closest && e.target.closest('.gem-recent-images-toggle-view-btn');
          if (!toggleBtn) return;
          picker.dataset.gemRecentImagesView = picker.dataset.gemRecentImagesView === 'grid' ? 'table' : 'grid';
          saveRecentImagesPickerPrefs({
            view: picker.dataset.gemRecentImagesView,
            density: picker.dataset.gemRecentImagesGridDensity || 'small',
            source: picker.dataset.gemRecentImagesSource || 'recent',
            gridCols: Number(picker.dataset.gemRecentImagesGridCols || 6),
            favGroupBy: picker.dataset.gemFavoriteImagesGroupBy || 'category',
            seenGroupBy: picker.dataset.gemSeenImagesGroupBy || 'path'
          });
          // Re-render (stay open)
          showRecentImagesPicker(modal);
        });
      }

      // Load persisted prefs once per picker lifetime
      if (picker.dataset.gemRecentImagesPrefsLoaded !== 'true') {
        picker.dataset.gemRecentImagesPrefsLoaded = 'true';
        getRecentImagesPickerPrefs((prefs) => {
          picker.dataset.gemRecentImagesView = prefs.view;
          picker.dataset.gemRecentImagesGridDensity = prefs.density;
          picker.dataset.gemRecentImagesSource = prefs.source;
          picker.dataset.gemRecentImagesGridCols = String(prefs.gridCols || 6);
          picker.dataset.gemFavoriteImagesGroupBy = prefs.favGroupBy || 'category';
          picker.dataset.gemSeenImagesGroupBy = prefs.seenGroupBy || 'path';
          picker.style.setProperty('--gem-recent-grid-cols', String(prefs.gridCols || 6));
          showRecentImagesPicker(modal);
        });
        return;
      }

      // Render
      const source =
        picker.dataset.gemRecentImagesSource === 'favorites' ? 'favorites' :
        picker.dataset.gemRecentImagesSource === 'seen' ? 'seen' :
        'recent';

      const getList = (cb) => {
        if (source === 'favorites') return getFavoriteImages(cb);
        if (source === 'seen') return getRecentlySeenImages(cb);
        return getRecentImages(cb);
      };

      // We always need favorites to render star state in the Recent list.
      getFavoriteImages((favList) => {
        const favSet = new Set((Array.isArray(favList) ? favList : []).map((x) => x && x.url).filter(Boolean));

        getFavoriteImageMetaMap((metaMap) => {
          const meta = (metaMap && typeof metaMap === 'object') ? metaMap : {};


          getList((list) => {
          const render = (listForRender) => {
          const rows = (Array.isArray(listForRender) ? [...listForRender] : [])
            .filter((x) => x && typeof x.url === 'string' && x.url.trim())
            .sort((a, b) => (b.ts || 0) - (a.ts || 0));

          const escape = (s) =>
            String(s)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');

          const viewMode = picker.dataset.gemRecentImagesView === 'grid' ? 'grid' : 'table';
          const toggleLabel = viewMode === 'grid' ? 'Show Table' : 'Show Grid';
          const gridCols = Math.min(8, Math.max(3, Number(picker.dataset.gemRecentImagesGridCols || 6)));
          picker.style.setProperty('--gem-recent-grid-cols', String(gridCols));

          const title =
            source === 'favorites' ? 'Favorites' :
            source === 'seen' ? 'Recently Seen' :
            'Recently Used';
          const addFavoriteBtn = source === 'favorites'
            ? `<button class="e-btn gem-favorite-images-add-btn" type="button">Add</button>`
            : '';

          const sourceTabs = `
              <div class="e-tabs__title ${source === 'recent' ? 'e-tabs__title-active' : ''}" data-tab="recent">
                <div class="e-tabs__separator">Recently Used</div>
              </div>
              <div class="e-tabs__title ${source === 'seen' ? 'e-tabs__title-active' : ''}" data-tab="seen">
                <div class="e-tabs__separator">Recently Seen</div>
              </div>
              <div class="e-tabs__title ${source === 'favorites' ? 'e-tabs__title-active' : ''}" data-tab="favorites">
                <div class="e-tabs__separator">Favorites</div>
              </div>
          `.trim();

          const groupBy =
            (picker.dataset.gemFavoriteImagesGroupBy === 'language') ? 'language' :
            (picker.dataset.gemFavoriteImagesGroupBy === 'translation') ? 'translation' :
            'category';
          const seenGroupBy =
            (picker.dataset.gemSeenImagesGroupBy === 'date') ? 'date' : 'path';
          const groupBySelect = (source === 'favorites')
            ? `
              <label style="font-size:12px; opacity:0.75; white-space:nowrap;">Group by</label>
              <select class="e-select gem-fav-groupby-select" style="height:36px; width:auto;">
                <option value="category" ${groupBy === 'category' ? 'selected' : ''}>Category</option>
                <option value="language" ${groupBy === 'language' ? 'selected' : ''}>Language</option>
                <option value="translation" ${groupBy === 'translation' ? 'selected' : ''}>Translation</option>
              </select>
            `.trim()
            : (source === 'seen')
            ? `
              <label style="font-size:12px; opacity:0.75; white-space:nowrap;">Group by</label>
              <select class="e-select gem-seen-groupby-select" style="height:36px; width:auto;">
                <option value="path" ${seenGroupBy === 'path' ? 'selected' : ''}>Folder Path</option>
                <option value="date" ${seenGroupBy === 'date' ? 'selected' : ''}>Last Seen</option>
              </select>
            `.trim()
            : '';

          const favSearch = (source === 'favorites' || source === 'seen')
            ? `
              <div id="gem-search-container" style="margin-top:8px;padding:0 16px;display: flex;gap: 8px;align-items: center;">
                ${groupBySelect}
                <input class="e-input e-input-search ${source === 'favorites' ? 'gem-favorite-images-search' : 'gem-seen-images-search'}" placeholder="Search ${source === 'favorites' ? 'favorites' : 'recently seen'}" type="search" value="${escape(source === 'favorites' ? (picker.dataset.gemFavoriteImagesSearch || '') : (picker.dataset.gemSeenImagesSearch || ''))}">
              </div>
            `.trim()
            : '';

          const currentAction = picker.dataset.gemCollapseExpandAction || 'collapse';
          const actionLabel = currentAction === 'collapse' ? 'Collapse all groups' : 'Expand all groups';
          const collapseExpandAllBtn = (source === 'favorites' || source === 'seen')
            ? `<button class="e-btn e-btn-borderless e-btn-onlyicon gem-collapse-expand-all-btn" type="button" data-action="${escape(currentAction)}" aria-label="${escape(actionLabel)}" title="${escape(actionLabel)}">⇅</button>`
            : '';

          const gridColsControl = (viewMode === 'grid')
            ? `
              <div style="display:flex; align-items:center; gap:8px;">
                <label style="font-size:12px; opacity:0.75;">Cols</label>
                <input class="gem-fav-grid-cols-slider" type="range" min="3" max="8" step="1" value="${escape(String(gridCols))}">
              </div>
            `.trim()
            : '';

          const header = `
            <div id="gem-image-list-header" style="padding:0 0 16px; background: var(--token-box-alternate-background); position:sticky; z-index:3; top:0">
            <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:10px; background-color: var(--token-tab-default-background);">
              <div style="display:flex; gap:10px; align-items:center; width:100%;">
                <div class="e-tabs e-tabs-dialogheader">
                ${sourceTabs}
                ${addFavoriteBtn}
                <div style="display:flex; gap:10px; align-items:center; justify-content:flex-end; margin-left:auto;">
                  ${collapseExpandAllBtn}
                  ${gridColsControl}
                  <button class="e-btn gem-recent-images-toggle-view-btn" type="button">${toggleLabel}</button>
                </div>
                </div>
              </div>
            </div>
            ${favSearch}
            </div>
          `.trim();

          const empty = rows.length === 0
            ? (source === 'favorites'
              ? '<div style="margin-top:10px; padding:0 16px 16px 16px; opacity:0.7;">No favorites yet. Favorite an image from "Recently Used" or "Recently Seen".</div>'
              : (source === 'seen'
                ? '<div style="margin-top:10px; padding:0 16px 16px 16px; opacity:0.7;">No recently seen images yet. Browse Media DB images to start collecting them.</div>'
                : '<div style="margin-top:10px; padding:0 16px 16px 16px; opacity:0.7;">No recently used images yet. Open an image properties dialog with an image URL to start collecting them.</div>'))
            : '';

          const dateLabel =
            source === 'seen' ? 'Last Seen' :
            'Last Used';

          // Favorites view: group by category OR language, collapsible, searchable, sorted.
          if (source === 'favorites') {
            const q = String(picker.dataset.gemFavoriteImagesSearch || '').trim().toLowerCase();

            // Build last-used map from recent images so we can sort missing-altText items by last used.
            getRecentImages((recentList) => {
              const lastUsedMap = new Map((Array.isArray(recentList) ? recentList : []).map((x) => [x.url, x.ts || 0]));

              getFavoriteCategoryCollapseMap((collapseMap) => {
                const collapse = collapseMap || {};

                const items = rows.map((r) => {
                  const url = r.url || '';
                  const m = meta[url] || {};
                  const category = (m.category || '').trim();
                  const keyword = (m.keyword || '').trim();
                  const language = (m.language || '').trim();
                  const altText = (m.altText || '').trim();
                  const translation = (m.translation || '').trim();
                  const lastUsed = lastUsedMap.get(url) || r.ts || 0;
                  return { url, category, keyword, language, altText, translation, lastUsed };
                });

                const matchesQuery = (it) => {
                  if (!q) return true;
                  const hay = `${it.altText} ${it.keyword} ${it.language} ${it.translation}`.toLowerCase();
                  return hay.includes(q);
                };
                const filtered = items.filter(matchesQuery);

                const groupMap = new Map();
                filtered.forEach((it) => {
                  const g =
                    groupBy === 'language' ? (it.language || '') :
                    groupBy === 'translation' ? (it.translation || '') :
                    (it.category || '');
                  if (!groupMap.has(g)) groupMap.set(g, []);
                  groupMap.get(g).push(it);
                });

                const groupKeys = Array.from(groupMap.keys());
                groupKeys.sort((a, b) => {
                  const aa = (a || '').toLowerCase();
                  const bb = (b || '').toLowerCase();
                  if (!aa) return 1; // Uncategorized / No Language Set last
                  if (!bb) return -1;
                  return aa.localeCompare(bb);
                });

                const renderGroupHeader = (gKey, count) => {
                  const label = gKey
                    ? gKey
                    : (groupBy === 'language'
                      ? 'No Language Set'
                      : (groupBy === 'translation' ? 'No Translation Available' : 'Uncategorized'));
                  const storageKey = `${groupBy}:${gKey || ''}`;
                  // Back-compat: older builds stored raw category keys (no prefix).
                  const legacyKey = (groupBy === 'category') ? (gKey || '') : null;
                  const isCollapsedRaw = !!collapse[storageKey] || (legacyKey != null && !!collapse[legacyKey]);
                  // While searching, always expand groups that have matches (groups without matches aren't rendered).
                  const isCollapsed = !q && isCollapsedRaw;
                  const caret = isCollapsed ? '▸' : '▾';
                  const showEdit = groupBy === 'category';
                  return `
                    <div class="gem-fav-cat-header" data-group-key="${escape(storageKey)}" data-cat="${escape(gKey)}">
                      <button class="e-btn e-btn-borderless e-btn-onlyicon gem-fav-cat-toggle" type="button" data-group-key="${escape(storageKey)}" aria-label="Toggle" title="Toggle">
                        ${caret}
                      </button>
                      <div class="gem-fav-cat-title">
                        <span class="gem-fav-cat-name">${escape(label)}</span>
                        <span class="gem-fav-cat-count">${count}</span>
                      </div>
                      ${showEdit ? `
                        <button class="e-btn e-btn-borderless e-btn-onlyicon gem-fav-cat-edit" type="button" data-cat="${escape(gKey)}" aria-label="Edit category" title="Edit category">
                          ✎
                        </button>
                      ` : ''}
                    </div>
                  `.trim();
                };

                const renderGridItem = (it) => {
                  const editTitle = 'Edit metadata';
                  const label =
                    (groupBy === 'translation')
                      ? ((it.language || '').trim())
                      : (((it.translation || '').trim()) || ((it.altText || '').trim()));
                  return `
                    <div class="gem-recent-image-tile gem-checkered-canvas" title="${escape(it.url)}">
                      <button class="gem-recent-image-edit-btn" type="button" data-url="${escape(it.url)}" aria-label="${editTitle}" title="${editTitle}">
                        ✎
                      </button>
                      <img class="gem-recent-image-thumb gem-checkered-canvas" src="${escape(it.url)}" alt="" />
                      <div class="gem-recent-image-overlay">
                        <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(it.url)}">
                          Add To Page
                        </button>
                      </div>
                      <div class="gem-recent-image-meta">${label ? `<div class="gem-recent-image-meta2" title="${escape(label)}">${escape(label)}</div>` : ''}</div>
                    </div>
                  `;
                };

                const renderTableRows = (catItems) => {
                  return catItems.map((it) => {
                    const metaText = [it.altText, it.keyword, it.language].filter(Boolean).join(' • ');
                    return `
                      <tr>
                        <td style="padding:6px; width:140px; vertical-align:middle;">
                          <img class="gem-checkered-canvas" src="${escape(it.url)}" style="display:block; width:128px; height:70px; object-fit:contain; border-radius:4px;" />
                        </td>
                        <td style="padding:6px; vertical-align:middle; word-break:break-word;">${escape(it.url)}</td>
                        <td style="padding:6px; vertical-align:middle;">
                          <div>${escape(formatRecentImageDate(it.lastUsed || 0))}</div>
                          ${metaText ? `<div class="gem-recent-image-meta2" title="${escape(metaText)}">${escape(metaText)}</div>` : ''}
                        </td>
                        <td style="padding:6px; vertical-align:middle; text-align:right; white-space:nowrap;">
                          <button class="e-btn e-btn-borderless e-btn-onlyicon gem-recent-image-edit-btn gem-recent-image-edit-btn--table" type="button" data-url="${escape(it.url)}" aria-label="Edit metadata" title="Edit metadata">
                            <span class="gem-recent-image-edit">✎</span>
                          </button>
                          <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(it.url)}">
                            Add To Page
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('');
                };

                const buildCategorySections = () => {
                  return groupKeys.map((gKey) => {
                    const catItems = groupMap.get(gKey) || [];
                    // Sort: altText present alpha; no altText last by lastUsed desc
                    catItems.sort((a, b) => {
                      const aa = (a.altText || '').trim();
                      const bb = (b.altText || '').trim();
                      const hasA = !!aa;
                      const hasB = !!bb;
                      if (hasA && hasB) return aa.toLowerCase().localeCompare(bb.toLowerCase());
                      if (hasA && !hasB) return -1;
                      if (!hasA && hasB) return 1;
                      return (b.lastUsed || 0) - (a.lastUsed || 0);
                    });

                    const headerHtml = renderGroupHeader(gKey, catItems.length);
                    const storageKey = `${groupBy}:${gKey || ''}`;
                    const legacyKey = (groupBy === 'category') ? (gKey || '') : null;
                    const isCollapsedRaw = !!collapse[storageKey] || (legacyKey != null && !!collapse[legacyKey]);
                    const isCollapsed = !q && isCollapsedRaw;
                    if (viewMode === 'grid') {
                      return `
                        <div class="gem-fav-cat-section" style="padding:0 16px">
                          ${headerHtml}
                          ${isCollapsed ? '' : `
                            <div class="gem-recent-images-grid">
                              ${catItems.map(renderGridItem).join('')}
                            </div>
                          `}
                        </div>
                      `;
                    }

                    return `
                      <div class="gem-fav-cat-section" style="padding:0 16px">
                        ${headerHtml}
                        ${isCollapsed ? '' : `
                          <table data-e-version="2" class="e-table e-table-bordered gem-recent-images-table" style="width:100%; font-size: 14px; margin-top:8px;">
                            <thead>
                              <tr>
                                <th style="width:140px;">Preview</th>
                                <th>URL</th>
                                <th style="width:160px;">${dateLabel}</th>
                                <th style="width:160px; text-align:right;">Use</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${renderTableRows(catItems)}
                            </tbody>
                          </table>
                        `}
                      </div>
                    `;
                  }).join('');
                };

                // For content-only updates (search changes), preserve header and update only content
                if (opts.contentOnly && picker.querySelector('#gem-image-list-header')) {
                  const contentContainer = document.createElement('div');
                  contentContainer.innerHTML = `
                    ${q && groupKeys.length === 0 ? '<div style="padding:0 16px 16px 16px; opacity:0.7;">No matches.</div>' : ''}
                    ${buildCategorySections()}
                    ${!q ? empty : ''}
                  `.trim();
                  // Replace everything after the header
                  const header = picker.querySelector('#gem-image-list-header');
                  if (header) {
                    // Remove all siblings after header
                    let nextSibling = header.nextSibling;
                    while (nextSibling) {
                      const toRemove = nextSibling;
                      nextSibling = nextSibling.nextSibling;
                      toRemove.remove();
                    }
                    // Add new content
                    while (contentContainer.firstChild) {
                      picker.appendChild(contentContainer.firstChild);
                    }
                  }
                } else {
                  picker.innerHTML = `
                    ${header}
                    ${q && groupKeys.length === 0 ? '<div style="padding:0 16px 16px 16px; opacity:0.7;">No matches.</div>' : ''}
                    ${buildCategorySections()}
                    ${!q ? empty : ''}
                  `.trim();
                }

                // Focus restoration no longer needed since header is preserved during content-only updates
              });
            });
            return;
          }

          // Recently Seen view: group by path OR date, collapsible, searchable, sorted.
          if (source === 'seen') {
            const q = String(picker.dataset.gemSeenImagesSearch || '').trim().toLowerCase();

            getRecentlySeenImageGroupCollapseMap((collapseMap) => {
              const collapse = collapseMap || {};

              const items = rows.map((r) => {
                const url = r.url || '';
                const ts = r.ts || 0;
                const path = (r.path || '').trim();
                const friendlyFilename = (r.friendlyFilename || '').trim();
                return { url, ts, path, friendlyFilename };
              });

              const matchesQuery = (it) => {
                if (!q) return true;
                const hay = `${it.friendlyFilename} ${it.path} ${it.url}`.toLowerCase();
                return hay.includes(q);
              };
              const filtered = items.filter(matchesQuery);

              const groupMap = new Map();
              filtered.forEach((it) => {
                const g = seenGroupBy === 'date'
                  ? formatRecentImageDate(it.ts).split(',')[0] // Group by date part only (e.g., "January 12, 2026" -> "January 12")
                  : (it.path || '');
                if (!groupMap.has(g)) groupMap.set(g, []);
                groupMap.get(g).push(it);
              });

              const groupKeys = Array.from(groupMap.keys());
              groupKeys.sort((a, b) => {
                // Handle empty groups - they should be last
                const aEmpty = !a || (a || '').trim() === '';
                const bEmpty = !b || (b || '').trim() === '';

                if (aEmpty && bEmpty) return 0;
                if (aEmpty) return 1;
                if (bEmpty) return -1;

                // For path grouping, sort by most recent timestamp in the group
                if (seenGroupBy === 'path') {
                  const aItems = groupMap.get(a) || [];
                  const bItems = groupMap.get(b) || [];
                  const aMaxTs = Math.max(...aItems.map(item => item.ts || 0));
                  const bMaxTs = Math.max(...bItems.map(item => item.ts || 0));
                  return bMaxTs - aMaxTs; // Most recent first
                }

                // For date grouping, sort alphabetically
                const aa = (a || '').toLowerCase();
                const bb = (b || '').toLowerCase();
                return aa.localeCompare(bb);
              });

              const renderGroupHeader = (gKey, count) => {
                const label = gKey
                  ? (seenGroupBy === 'date' ? gKey : gKey)
                  : (seenGroupBy === 'date' ? 'Unknown Date' : 'No Path');
                const storageKey = `seen:${seenGroupBy}:${gKey || ''}`;
                const isCollapsedRaw = !!collapse[storageKey];
                // While searching, always expand groups that have matches (groups without matches aren't rendered).
                const isCollapsed = !q && isCollapsedRaw;
                const caret = isCollapsed ? '▸' : '▾';
                return `
                  <div class="gem-seen-cat-header" data-group-key="${escape(storageKey)}" data-cat="${escape(gKey)}">
                    <button class="e-btn e-btn-borderless e-btn-onlyicon gem-seen-cat-toggle" type="button" data-group-key="${escape(storageKey)}" aria-label="Toggle" title="Toggle">
                      ${caret}
                    </button>
                    <div class="gem-seen-cat-title">
                      <span class="gem-seen-cat-name">${escape(label)}</span>
                      <span class="gem-seen-cat-count">${count}</span>
                    </div>
                  </div>
                `.trim();
              };

              const renderGridItem = (it) => {
                const url = it.url || '';
                const ts = it.ts || 0;
                const isFav = favSet.has(url);
                const star = isFav ? '★' : '☆';
                const starTitle = isFav ? 'Unfavorite' : 'Favorite';
                const friendlyFilename = it.friendlyFilename || '';
                return `
                  <div class="gem-recent-image-tile" title="${escape(url)}">
                    <button class="gem-recent-image-info-btn" type="button" data-url="${escape(url)}" aria-label="View image details" title="View image details">
                      ℹ
                    </button>
                    <button class="gem-recent-image-fav-btn ${isFav ? 'gem-recent-image-fav-btn--active' : ''}" type="button" data-url="${escape(url)}" aria-label="${starTitle}" title="${starTitle}">
                      ${star}
                    </button>
                    <img class="gem-recent-image-thumb gem-checkered-canvas" src="${escape(url)}" alt="" />
                    <div class="gem-recent-image-overlay">
                      <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(url)}">
                        Add To Page
                      </button>
                    </div>
                    <div class="gem-recent-image-meta">
                      <div class="gem-recent-image-date" title="${escape(friendlyFilename || url)}">${escape(friendlyFilename || url)}</div>
                    </div>
                  </div>
                `;
              };

              const renderTableRows = (catItems) => {
                return catItems.map((it) => {
                  const url = it.url || '';
                  const ts = it.ts || 0;
                  const friendlyFilename = it.friendlyFilename || '';
                  const isFav = favSet.has(url);
                  const star = isFav ? '★' : '☆';
                  const starTitle = isFav ? 'Unfavorite' : 'Favorite';
                  return `
                    <tr>
                      <td style="padding:6px; width:140px; vertical-align:middle; position:relative;">
                        <img class="gem-checkered-canvas" src="${escape(url)}" style="display:block; width:128px; height:70px; object-fit:contain; border-radius:4px;" />
                        <button class="gem-recent-image-info-btn gem-recent-image-info-btn--table" type="button" data-url="${escape(url)}" aria-label="View image details" title="View image details" style="position:absolute; top:8px; left:8px; background:rgba(255,255,255,0.9); border:1px solid #ccc; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer;">
                          ℹ
                        </button>
                      </td>
                      <td style="padding:6px; vertical-align:middle; word-break:break-word;">${escape(friendlyFilename || url)}</td>
                      <td style="padding:6px; vertical-align:middle;">${escape(formatRecentImageDate(ts))}</td>
                      <td style="padding:6px; vertical-align:middle; text-align:right; white-space:nowrap;">
                        <button class="e-btn e-btn-borderless e-btn-onlyicon gem-recent-image-fav-btn gem-recent-image-fav-btn--table ${isFav ? 'gem-recent-image-fav-btn--active' : ''}" type="button" data-url="${escape(url)}" aria-label="${starTitle}" title="${starTitle}">
                          ${star}
                        </button>
                        <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(url)}">
                          Use
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('');
              };

              const buildCategorySections = () => {
                return groupKeys.map((gKey) => {
                  const catItems = groupMap.get(gKey) || [];
                  // Sort by timestamp (most recent first)
                  catItems.sort((a, b) => (b.ts || 0) - (a.ts || 0));

                  const headerHtml = renderGroupHeader(gKey, catItems.length);
                  const storageKey = `seen:${seenGroupBy}:${gKey || ''}`;
                  const isCollapsedRaw = !!collapse[storageKey];
                  const isCollapsed = !q && isCollapsedRaw;
                  if (viewMode === 'grid') {
                    return `
                      <div class="gem-seen-cat-section" style="padding:0 16px">
                        ${headerHtml}
                        ${isCollapsed ? '' : `
                          <div class="gem-recent-images-grid">
                            ${catItems.map(renderGridItem).join('')}
                          </div>
                        `}
                      </div>
                    `;
                  }

                  return `
                    <div class="gem-seen-cat-section" style="padding:0 16px">
                      ${headerHtml}
                      ${isCollapsed ? '' : `
                        <table data-e-version="2" class="e-table e-table-bordered gem-recent-images-table" style="width:100%; font-size: 14px; margin-top:8px;">
                          <thead>
                            <tr>
                              <th style="width:140px;">Preview</th>
                              <th>Filename</th>
                              <th style="width:160px;">${dateLabel}</th>
                              <th style="width:160px; text-align:right;">Use</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${renderTableRows(catItems)}
                          </tbody>
                        </table>
                      `}
                    </div>
                  `;
                }).join('');
              };

              // For content-only updates (search changes), preserve header and update only content
              if (opts.contentOnly && picker.querySelector('#gem-image-list-header')) {
                const contentContainer = document.createElement('div');
                contentContainer.innerHTML = `
                  ${q && groupKeys.length === 0 ? '<div style="padding:0 16px 16px 16px; opacity:0.7;">No matches.</div>' : ''}
                  ${buildCategorySections()}
                  ${!q ? empty : ''}
                `.trim();

                // Replace everything after the header
                const header = picker.querySelector('#gem-image-list-header');
                if (header) {
                  // Remove all siblings after header
                  let nextSibling = header.nextSibling;
                  while (nextSibling) {
                    const toRemove = nextSibling;
                    nextSibling = nextSibling.nextSibling;
                    toRemove.remove();
                  }
                  // Add new content
                  while (contentContainer.firstChild) {
                    picker.appendChild(contentContainer.firstChild);
                  }
                }
              } else {
                picker.innerHTML = `
                  ${header}
                  ${q && groupKeys.length === 0 ? '<div style="padding:0 16px 16px 16px; opacity:0.7;">No matches.</div>' : ''}
                  ${buildCategorySections()}
                  ${!q ? empty : ''}
                `.trim();
              }
            });
            return;
          }

          // Filter rows for seen source if searching
          let filteredRows = rows;
          if (source === 'seen') {
            const q = String(picker.dataset.gemSeenImagesSearch || '').trim().toLowerCase();
            if (q) {
              filteredRows = rows.filter((r) => {
                const friendlyFilename = (r && typeof r.friendlyFilename === 'string') ? r.friendlyFilename : '';
                const path = (r && typeof r.path === 'string') ? r.path : '';
                const url = r.url || '';
                const hay = `${friendlyFilename} ${path} ${url}`.toLowerCase();
                return hay.includes(q);
              });
            }
          }

          // Existing behavior for Recent list (ungrouped)
          const seenSearchQuery = source === 'seen' ? String(picker.dataset.gemSeenImagesSearch || '').trim() : '';
          const noMatches = source === 'seen' && seenSearchQuery && filteredRows.length === 0
            ? '<div style="opacity:0.7; margin-top:10px;">No matches.</div>'
            : '';

          // For content-only updates (search changes), preserve header and update only content
          const contentHtml = viewMode === 'grid'
            ? `
                ${noMatches}
                <div class="gem-recent-images-grid">
                  ${filteredRows.map((r) => {
                    const url = r.url || '';
                    const ts = r.ts || 0;
                    const friendlyFilename = (r && typeof r.friendlyFilename === 'string') ? r.friendlyFilename : '';
                    const isFav = favSet.has(url);
                    const star = isFav ? '★' : '☆';
                    const starTitle = isFav ? 'Unfavorite' : 'Favorite';
                    return `
                      <div class="gem-recent-image-tile" title="${escape(url)}">
                        ${source === 'seen' ? `
                          <button class="gem-recent-image-info-btn" type="button" data-url="${escape(url)}" aria-label="View image details" title="View image details">
                            ℹ
                          </button>
                        ` : ''}
                        <button class="gem-recent-image-fav-btn ${isFav ? 'gem-recent-image-fav-btn--active' : ''}" type="button" data-url="${escape(url)}" aria-label="${starTitle}" title="${starTitle}">
                          ${star}
                        </button>
                        <img class="gem-recent-image-thumb gem-checkered-canvas" src="${escape(url)}" alt="" />
                        <div class="gem-recent-image-overlay">
                          <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(url)}">
                            Add To Page
                          </button>
                        </div>
                        <div class="gem-recent-image-meta">
                          ${source === 'seen'
                            ? `<div class="gem-recent-image-date" title="${escape(friendlyFilename || url)}">${escape(friendlyFilename || url)}</div>`
                            : (source === 'recent' && friendlyFilename
                              ? `<div class="gem-recent-image-date" title="${escape(friendlyFilename)}">${escape(friendlyFilename)}</div>`
                              : '')}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
                ${empty}
              `.trim()
            : `
                ${noMatches}
                <div style="padding:0 16px 16px">
                <table data-e-version="2" class="e-table e-table-bordered gem-recent-images-table" style="width:100%; font-size: 14 px;">
                  <thead>
                    <tr>
                      <th style="width:140px;">Preview</th>
                      <th>${source === 'seen' ? 'Filename' : (source === 'recent' ? 'Name' : 'URL')}</th>
                      <th style="width:160px;">${escape(dateLabel)}</th>
                      <th style="width:160px; text-align:right;">Use</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredRows.map((r) => {
                      const url = r.url || '';
                      const ts = r.ts || 0;
                      const friendlyFilename = (r && typeof r.friendlyFilename === 'string') ? r.friendlyFilename : '';
                      const isFav = favSet.has(url);
                      const star = isFav ? '★' : '☆';
                      const starTitle = isFav ? 'Unfavorite' : 'Favorite';
                      return `
                        <tr>
                          <td style="padding:6px; width:140px; vertical-align:middle; position:relative;">
                            <img class="gem-checkered-canvas" src="${escape(url)}" style="display:block; width:128px; height:70px; object-fit:contain; border-radius:4px;" />
                            ${source === 'seen' ? `
                              <button class="gem-recent-image-info-btn gem-recent-image-info-btn--table" type="button" data-url="${escape(url)}" aria-label="View image details" title="View image details" style="position:absolute; top:8px; left:8px; background:rgba(255,255,255,0.9); border:1px solid #ccc; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer;">
                                ℹ
                              </button>
                            ` : ''}
                          </td>
                          <td style="padding:6px; vertical-align:middle; word-break:break-word;">${escape(source === 'seen' ? (friendlyFilename || url) : (source === 'recent' ? (friendlyFilename || url) : url))}</td>
                          <td style="padding:6px; vertical-align:middle;">${escape(formatRecentImageDate(ts))}</td>
                          <td style="padding:6px; vertical-align:middle; text-align:right; white-space:nowrap;">
                            <button class="e-btn e-btn-borderless e-btn-onlyicon gem-recent-image-fav-btn gem-recent-image-fav-btn--table ${isFav ? 'gem-recent-image-fav-btn--active' : ''}" type="button" data-url="${escape(url)}" aria-label="${starTitle}" title="${starTitle}">
                              ${star}
                            </button>
                            <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(url)}">
                              Use
                            </button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
                </div>
              `.trim();

          if (opts.contentOnly && picker.querySelector('#gem-image-list-header')) {
            // Replace everything after the header
            const header = picker.querySelector('#gem-image-list-header');
            if (header) {
              // Remove all siblings after header
              let nextSibling = header.nextSibling;
              while (nextSibling) {
                const toRemove = nextSibling;
                nextSibling = nextSibling.nextSibling;
                toRemove.remove();
              }
              // Add new content
              const contentContainer = document.createElement('div');
              contentContainer.innerHTML = contentHtml;
              while (contentContainer.firstChild) {
                picker.appendChild(contentContainer.firstChild);
              }
            }
          } else {
            picker.innerHTML = `
              ${header}
              ${contentHtml}
            `.trim();
          }
          }; // render

          if (source !== 'recent') {
            render(list);
            return;
          }

          // Before displaying Recently Used, enrich it from Recently Seen (copy friendlyFilename where available).
          getRecentlySeenImages((seenList) => {
            const seenMap = new Map(
              (Array.isArray(seenList) ? seenList : [])
                .filter((x) => x && x.url && x.friendlyFilename)
                .map((x) => [x.url, x.friendlyFilename])
            );
            if (!seenMap.size) {
              render(list);
              return;
            }

            let changed = 0;
            const merged = (Array.isArray(list) ? list : []).map((r) => {
              const url = r && r.url;
              if (!url) return r;
              const ff = seenMap.get(url);
              if (!ff) return r;
              if (r.friendlyFilename === ff) return r;
              changed += 1;
              return { ...(r || {}), friendlyFilename: ff };
            });
            if (changed) saveRecentImages(merged);
            render(merged);
          });
          });
        });
      });
    }

    function openFavoriteCategoryModal(modal, catKey) {
      const key = (catKey || '');
      const label = key ? key : 'Uncategorized';

      const existing = document.getElementById('gem-favorite-category-modal');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'gem-favorite-category-modal';
      overlay.className = 'gem-favorite-image-meta-modal';
      overlay.innerHTML = `
        <div class="gem-favorite-image-meta-modal__backdrop"></div>
        <div class="gem-favorite-image-meta-modal__panel" role="dialog" aria-modal="true">
          <div class="gem-favorite-image-meta-modal__header">
            <div style="font-weight:600;">Category</div>
            <button class="e-btn e-btn-borderless e-btn-onlyicon gem-favorite-image-meta-modal__close" type="button" aria-label="Close">✕</button>
          </div>
          <div class="gem-favorite-image-meta-modal__body">
            <div class="e-field">
              <label class="e-field__label">Name</label>
              <input class="e-input gem-fav-cat-name-input" type="text" value="${label.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />
            </div>
            <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
              <button class="e-btn e-btn-secondary gem-fav-cat-export" type="button">Copy JSON</button>
              <button class="e-btn e-btn-danger gem-fav-cat-unfav" type="button">Unfavorite All</button>
            </div>
          </div>
          <div class="gem-favorite-image-meta-modal__footer">
            <button class="e-btn e-btn-secondary gem-fav-cat-cancel" type="button">Cancel</button>
            <button class="e-btn e-btn-primary gem-fav-cat-save" type="button">Save</button>
          </div>
        </div>
      `.trim();

      const host = modal || document.body;
      host.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelector('.gem-favorite-image-meta-modal__backdrop')?.addEventListener('click', close);
      overlay.querySelector('.gem-favorite-image-meta-modal__close')?.addEventListener('click', close);
      overlay.querySelector('.gem-fav-cat-cancel')?.addEventListener('click', close);

      const getCategoryItems = (cb) => {
        getFavoriteImages((favList) => {
          const favMap = new Map((Array.isArray(favList) ? favList : []).map((x) => [x && x.url, x && x.ts]).filter(([url]) => url));
          getFavoriteImageMetaMap((metaMap) => {
            const meta = metaMap || {};
            const items = Array.from(favMap.keys()).map((url) => {
              const m = meta[url] || {};
              const c = (m.category || '').trim();
              const ts = favMap.get(url) || Date.now();
              return { url, meta: m, category: c, ts };
            }).filter((it) => (key ? it.category === key : !it.category));
            cb(items);
          });
        });
      };

      overlay.querySelector('.gem-fav-cat-export')?.addEventListener('click', () => {
        getCategoryItems((items) => {
          const out = items.map((it) => ({ url: it.url, ts: it.ts, ...(it.meta || {}) }));
          const json = JSON.stringify(out, null, 2);
          try {
            navigator.clipboard.writeText(json);
          } catch (_) {}
          alert('Copied JSON to clipboard.');
        });
      });

      overlay.querySelector('.gem-fav-cat-unfav')?.addEventListener('click', () => {
        if (!confirm(`Unfavorite all images in "${label}"?`)) return;
        getCategoryItems((items) => {
          const removeSet = new Set(items.map((x) => x.url));
          getFavoriteImages((favList) => {
            const nextFavList = (Array.isArray(favList) ? favList : []).filter((x) => x && x.url && !removeSet.has(x.url));
            saveFavoriteImages(nextFavList, () => {
              // Also clean up metadata for removed items
              getFavoriteImageMetaMap((metaMap) => {
                const updatedMeta = { ...metaMap };
                removeSet.forEach(url => {
                  delete updatedMeta[url];
                });
                saveFavoriteImageMetaMap(updatedMeta, () => {
                  close();
                  showRecentImagesPicker(modal);
                });
              });
            });
          });
        });
      });

      overlay.querySelector('.gem-fav-cat-save')?.addEventListener('click', () => {
        const newNameRaw = overlay.querySelector('.gem-fav-cat-name-input')?.value || '';
        const newName = newNameRaw.trim();
        if (!newName) {
          alert('Please enter a category name.');
          return;
        }
        const newKey = newName;
        getFavoriteImageMetaMap((metaMap) => {
          const nextMeta = { ...(metaMap || {}) };
          Object.keys(nextMeta).forEach((url) => {
            const m = nextMeta[url];
            const c = (m && m.category ? String(m.category).trim() : '');
            const matches = key ? (c === key) : !c;
            if (matches) {
              nextMeta[url] = { ...(m || {}), category: newKey };
            }
          });
          saveFavoriteImageMetaMap(nextMeta, () => {
            // Migrate collapse state
            getFavoriteCategoryCollapseMap((collapseMap) => {
              const cm = { ...(collapseMap || {}) };
              const oldPrefixed = `category:${key || ''}`;
              const newPrefixed = `category:${newKey || ''}`;
              // Back-compat: might exist as raw category key (older builds) OR prefixed key (newer builds).
              const existingVal = (cm[oldPrefixed] != null) ? cm[oldPrefixed] : cm[key];
              if (existingVal != null) {
                cm[newPrefixed] = existingVal;
              }
              delete cm[key];
              delete cm[oldPrefixed];
              saveFavoriteCategoryCollapseMap(cm, () => {
                close();
                showRecentImagesPicker(modal);
              });
            });
          });
        });
      });
    }

    function openRecentlySeenImageDetailsModal(modal, url) {
      const u = normalizeRecentImageUrlCandidate(url);
      if (!u) return;

      // Remove any existing modal
      const existing = document.getElementById('gem-seen-image-details-modal');
      if (existing) existing.remove();

      // Get the image data from recently seen list
      getRecentlySeenImages((seenList) => {
        const seenItem = (Array.isArray(seenList) ? seenList : []).find((x) => x && x.url === u);
        if (!seenItem) return;

        const friendlyFilename = (seenItem.friendlyFilename || '');
        const path = (seenItem.path || '');
        const ts = seenItem.ts || 0;

        const overlay = document.createElement('div');
        overlay.id = 'gem-seen-image-details-modal';
        overlay.className = 'gem-seen-image-details-modal';
        overlay.innerHTML = `
          <div class="gem-seen-image-details-modal__backdrop"></div>
          <div class="gem-seen-image-details-modal__panel" role="dialog" aria-modal="true">
            <div class="gem-seen-image-details-modal__header">
              <div style="font-weight:600;">Image Details</div>
              <button class="e-btn e-btn-borderless e-btn-onlyicon gem-seen-image-details-modal__close" type="button" aria-label="Close">
                ✕
              </button>
            </div>
            <div class="gem-seen-image-details-modal__thumbrow gem-checkered-canvas">
              <img class="gem-checkered-canvas" src="${u.replace(/"/g, '&quot;')}" alt="" style="max-width:400px; max-height:300px;" />
            </div>
            <div class="gem-seen-image-details-modal__body">
              <div class="gem-seen-image-details-modal__metadata">
                <div class="e-field">
                  <label class="e-field__label">URL</label>
                  <div class="gem-seen-image-details-modal__url">${u.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                </div>
                ${friendlyFilename ? `
                  <div class="e-field">
                    <label class="e-field__label">Filename</label>
                    <div>${friendlyFilename.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                  </div>
                ` : ''}
                ${path ? `
                  <div class="e-field">
                    <label class="e-field__label">Path</label>
                    <div>${path.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                  </div>
                ` : ''}
                <div class="e-field">
                  <label class="e-field__label">Last Seen</label>
                  <div>${formatRecentImageDate(ts)}</div>
                </div>
              </div>
            </div>
          </div>
        `.trim();

        document.body.appendChild(overlay);

        // Event handlers
        const closeModal = () => overlay.remove();

        overlay.addEventListener('click', (e) => {
          if (e.target === overlay || e.target.classList.contains('gem-seen-image-details-modal__backdrop') || e.target.classList.contains('gem-seen-image-details-modal__close')) {
            closeModal();
          }
        });

        overlay.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            closeModal();
            e.preventDefault();
            e.stopPropagation();
          }
        });

        // Focus the close button for accessibility
        const closeBtn = overlay.querySelector('.gem-seen-image-details-modal__close');
        if (closeBtn) {
          try { closeBtn.focus(); } catch (_) {}
        }
      });
    }

    function openFavoriteImageMetaModal(modal, url, opts = {}) {
      const mode = (opts && opts.mode === 'create') ? 'create' : 'edit';
      const u = normalizeRecentImageUrlCandidate(url);
      if (mode !== 'create' && !u) return;

      // Remove any existing modal
      const existing = document.getElementById('gem-favorite-image-meta-modal');
      if (existing) existing.remove();

      getFavoriteImages((favList) => {
        const favSet = new Set((Array.isArray(favList) ? favList : []).map((x) => x && x.url).filter(Boolean));
        const isFav = mode === 'create' ? false : favSet.has(u);

        getFavoriteImageMetaMap((map) => {
          const metaKey = mode === 'create' ? '' : u;
          const meta = (map && typeof map === 'object' && metaKey && map[metaKey]) ? map[metaKey] : {};
          const category = (meta.category || '');
          const keyword = (meta.keyword || '');
          const language = (meta.language || '');
          const altText = (meta.altText || '');
          const translation = (meta.translation || '');
          const width = (meta.width || '');
          const startingUrl = mode === 'create' ? '' : u;

        const overlay = document.createElement('div');
        overlay.id = 'gem-favorite-image-meta-modal';
        overlay.className = 'gem-favorite-image-meta-modal';
        overlay.innerHTML = `
          <div class="gem-favorite-image-meta-modal__backdrop"></div>
          <div class="gem-favorite-image-meta-modal__panel" role="dialog" aria-modal="true">
            <div class="gem-favorite-image-meta-modal__header">
              <div style="font-weight:600;">${mode === 'create' ? 'Add Favorite Image' : 'Edit Image Metadata'}</div>
              ${mode === 'create' ? `
                <div class="gem-modal-mode-tabs">
                  <button class="gem-modal-mode-tab gem-modal-mode-tab--active" data-mode="manual" type="button">Manual Entry</button>
                  <button class="gem-modal-mode-tab" data-mode="json" type="button">JSON Import</button>
                </div>
              ` : ''}
              <button class="e-btn e-btn-borderless e-btn-onlyicon gem-favorite-image-meta-modal__close" type="button" aria-label="Close">
                ✕
              </button>
            </div>
            <div class="gem-favorite-image-meta-modal__body">
              <div class="gem-modal-content gem-modal-content--manual gem-modal-content--active">
                ${mode === 'create' ? `
                  <div class="e-field">
                    <label class="e-field__label">Image URL</label>
                    <input class="e-input gem-favorite-image-meta-url" type="text" value="" placeholder="https://example.com/image.png" />
                  </div>
                ` : `
                  <div class="gem-favorite-image-meta-modal__thumbrow">
                    <img class="gem-checkered-canvas" src="${u.replace(/"/g, '&quot;')}" alt="" />
                    <div class="gem-favorite-image-meta-modal__url">${u.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                  </div>
                `}
                <div class="e-field">
                  <label class="e-field__label">Category</label>
                  <input class="e-input gem-favorite-image-meta-category" type="text" value="${String(category).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />
                </div>
                <div class="e-field">
                  <label class="e-field__label">Keyword</label>
                  <input class="e-input gem-favorite-image-meta-keyword" type="text" value="${String(keyword).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />
                </div>
                <div class="e-field">
                  <label class="e-field__label">Language</label>
                  <input class="e-input gem-favorite-image-meta-language" type="text" value="${String(language).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />
                </div>
                <div class="e-field">
                  <label class="e-field__label">Image alternative text</label>
                  <input class="e-input gem-favorite-image-meta-alttext" type="text" value="${String(altText).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />
                </div>
                <div class="e-field">
                  <label class="e-field__label">Translation</label>
                  <input class="e-input gem-favorite-image-meta-translation" type="text" value="${String(translation).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />
                </div>
                <div class="e-field">
                  <label class="e-field__label">Width</label>
                  <input class="e-input gem-favorite-image-meta-width" type="number" inputmode="numeric" step="1" min="1" value="${String(width).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />
                </div>
              </div>
              ${mode === 'create' ? `
                <div class="gem-modal-content gem-modal-content--json">
                  <div class="e-field">
                    <label class="e-field__label">JSON Import</label>
                    <textarea class="e-input gem-favorite-image-meta-json" rows="12" placeholder='Paste JSON array of favorite images, e.g.:\n[\n  {\n    "url": "https://example.com/image1.jpg",\n    "category": "product",\n    "keyword": "summer collection",\n    "altText": "Beautiful summer dress"\n  },\n  {\n    "url": "https://example.com/image2.jpg",\n    "category": "banner",\n    "altText": "Hero banner"\n  }\n]'></textarea>
                  </div>
                  <div style="font-size: 14px; color: var(--token-comment); margin-top: 8px;">
                    Import multiple favorite images at once using JSON format. All metadata fields are optional.
                  </div>
                </div>
              ` : ''}
            </div>
            <div class="gem-favorite-image-meta-modal__footer" style="display:flex; align-items:center; justify-content:space-between;">
              <div style="display:flex; align-items:center; gap:10px;">
                ${mode === 'edit' ? `
                  <button class="e-btn e-btn-borderless e-btn-onlyicon gem-favorite-image-meta-favtoggle" type="button" aria-label="${isFav ? 'Unfavorite' : 'Favorite'}" title="${isFav ? 'Unfavorite' : 'Favorite'}">
                    <span class="gem-recent-image-star">${isFav ? '★' : '☆'}</span>
                  </button>
                ` : ''}
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                <button class="e-btn e-btn-secondary gem-favorite-image-meta-cancel" type="button">Cancel</button>
                <button class="e-btn e-btn-primary gem-favorite-image-meta-save" type="button">Save</button>
              </div>
            </div>
          </div>
        `.trim();

        const host = modal || document.body;
        host.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.gem-favorite-image-meta-modal__backdrop')?.addEventListener('click', close);
        overlay.querySelector('.gem-favorite-image-meta-modal__close')?.addEventListener('click', close);
        overlay.querySelector('.gem-favorite-image-meta-cancel')?.addEventListener('click', close);

        // Mode switching for create mode
        if (mode === 'create') {
          const modeTabs = overlay.querySelectorAll('.gem-modal-mode-tab');
          const manualContent = overlay.querySelector('.gem-modal-content--manual');
          const jsonContent = overlay.querySelector('.gem-modal-content--json');

          modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
              const selectedMode = tab.getAttribute('data-mode');

              // Update tab active states
              modeTabs.forEach(t => t.classList.remove('gem-modal-mode-tab--active'));
              tab.classList.add('gem-modal-mode-tab--active');

              // Update content visibility
              if (selectedMode === 'manual') {
                manualContent.classList.add('gem-modal-content--active');
                jsonContent.classList.remove('gem-modal-content--active');
              } else if (selectedMode === 'json') {
                manualContent.classList.remove('gem-modal-content--active');
                jsonContent.classList.add('gem-modal-content--active');
              }
            });
          });
        }

        overlay.querySelector('.gem-favorite-image-meta-favtoggle')?.addEventListener('click', () => {
          const targetUrl = startingUrl;
          if (!targetUrl) return;
          toggleFavoriteImageUrl(targetUrl, () => {
            // Update icon immediately
            getFavoriteImages((nextFavList) => {
              const nextSet = new Set((Array.isArray(nextFavList) ? nextFavList : []).map((x) => x && x.url).filter(Boolean));
              const nowFav = nextSet.has(targetUrl);
              const btn = overlay.querySelector('.gem-favorite-image-meta-favtoggle');
              if (btn) {
                btn.setAttribute('aria-label', nowFav ? 'Unfavorite' : 'Favorite');
                btn.setAttribute('title', nowFav ? 'Unfavorite' : 'Favorite');
                const starEl = btn.querySelector('.gem-recent-image-star');
                if (starEl) starEl.textContent = nowFav ? '★' : '☆';
              }
              showRecentImagesPicker(modal);
            });
          });
        });

        overlay.querySelector('.gem-favorite-image-meta-save')?.addEventListener('click', () => {
          // Check if JSON import mode is active
          const activeTab = overlay.querySelector('.gem-modal-mode-tab--active');
          const isJsonMode = activeTab && activeTab.getAttribute('data-mode') === 'json';

          if (isJsonMode && mode === 'create') {
            // JSON import mode
            const jsonText = overlay.querySelector('.gem-favorite-image-meta-json')?.value || '';
            if (!jsonText.trim()) {
              alert('Please enter JSON data to import.');
              return;
            }

            try {
              const importData = JSON.parse(jsonText);
              if (!Array.isArray(importData)) {
                throw new Error('JSON must be an array of image objects.');
              }

              let successCount = 0;
              let errorCount = 0;
              const now = Date.now();

              // Validate all items first
              const validItems = [];
              importData.forEach((item, index) => {
                if (typeof item !== 'object' || !item) {
                  console.error(`Item ${index} is not a valid object:`, item);
                  errorCount++;
                  return;
                }

                const url = item.url;
                if (!url || typeof url !== 'string') {
                  console.error(`Item ${index} missing valid URL:`, item);
                  errorCount++;
                  return;
                }

                const normalizedUrl = normalizeRecentImageUrlCandidate(url);
                if (!normalizedUrl) {
                  console.error(`Item ${index} has invalid URL:`, url);
                  errorCount++;
                  return;
                }

                validItems.push({
                  normalizedUrl,
                  meta: (({ url: _, ts: __, ...rest }) => rest)(item),
                  originalTs: (typeof item.ts === 'number' && item.ts > 0) ? item.ts : now
                });
              });

              if (validItems.length === 0) {
                alert(`Import failed: No valid items found. ${errorCount} errors.`);
                return;
              }

              // Process valid items sequentially to avoid race conditions
              let currentIndex = 0;

              const processNext = () => {
                if (currentIndex >= validItems.length) {
                  // All done
                  const message = `Import complete: ${successCount} successful, ${errorCount} errors.`;
                  alert(message);
                  close();
                  showRecentImagesPicker(modal);
                  return;
                }

                const item = validItems[currentIndex];
                currentIndex++;

                // Add to favorites with timestamp
                ensureFavoriteImageUrl(item.normalizedUrl, () => {
                  // Save metadata if any exists
                  if (Object.keys(item.meta).length > 0) {
                    upsertFavoriteImageMeta(item.normalizedUrl, item.meta, () => {
                      successCount++;
                      processNext();
                    });
                  } else {
                    successCount++;
                    processNext();
                  }
                });
              };

              processNext();

            } catch (e) {
              alert('Invalid JSON format. Please check your JSON syntax.\n\nError: ' + e.message);
              return;
            }
          } else {
            // Manual entry mode (existing logic)
            const rawUrl = mode === 'create'
              ? (overlay.querySelector('.gem-favorite-image-meta-url')?.value || '')
              : startingUrl;
            const targetUrl = normalizeRecentImageUrlCandidate(rawUrl);
            if (!targetUrl) {
              alert('Please enter a valid image URL.');
              return;
            }
            const cat = overlay.querySelector('.gem-favorite-image-meta-category')?.value || '';
            const key = overlay.querySelector('.gem-favorite-image-meta-keyword')?.value || '';
            const lang = overlay.querySelector('.gem-favorite-image-meta-language')?.value || '';
            const alt = overlay.querySelector('.gem-favorite-image-meta-alttext')?.value || '';
            const trn = overlay.querySelector('.gem-favorite-image-meta-translation')?.value || '';
            const widthRaw = overlay.querySelector('.gem-favorite-image-meta-width')?.value || '';
            const widthNum = parseInt(String(widthRaw || '').trim(), 10);
            const widthClean = Number.isFinite(widthNum) && widthNum > 0 ? Math.trunc(widthNum) : '';

            const incoming = {
              category: (cat || '').trim(),
              keyword: (key || '').trim(),
              language: (lang || '').trim(),
              altText: (alt || '').trim(),
              translation: (trn || '').trim(),
              width: widthClean
            };

            if (mode === 'create') {
              // Ensure it exists in favorites, then save metadata.
              ensureFavoriteImageUrl(targetUrl, () => {
                // Merge with existing metadata; do not overwrite existing values with blanks.
                getFavoriteImageMetaMap((map) => {
                  const existing = (map && typeof map === 'object' && map[targetUrl]) ? map[targetUrl] : {};
                  const merged = {
                    category: incoming.category || (existing.category || ''),
                    keyword: incoming.keyword || (existing.keyword || ''),
                    language: incoming.language || (existing.language || ''),
                    altText: incoming.altText || (existing.altText || ''),
                    translation: incoming.translation || (existing.translation || ''),
                    width: (incoming.width !== '' ? incoming.width : (existing.width || ''))
                  };
                  upsertFavoriteImageMeta(targetUrl, merged, () => {
                    close();
                    showRecentImagesPicker(modal);
                  });
                });
              });
              return;
            }

            // Edit mode: save metadata without forcing favorite status (star toggle controls that).
            upsertFavoriteImageMeta(targetUrl, incoming, () => {
              close();
              showRecentImagesPicker(modal);
            });
          }
        });
        });
      });
    }

    // Picker is now always visible; no toggle behavior needed.

    function debugDumpDialogButtons(modal, label = '') {
      try {
        const content = modal.querySelector('.e-dialog__content') || modal;
        const btns = Array.from(content.querySelectorAll('button.e-btn')).slice(0, 30);
        console.log(`[Gem][RecentImages] Button dump ${label} (count=${btns.length}):`);
        btns.forEach((b, i) => {
          const text = (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
          console.log(`  [${i}] class="${b.className}" text="${text}"`, b);
        });
        const secondary = Array.from(content.querySelectorAll('button.e-btn.e-btn-secondary'));
        console.log(`[Gem][RecentImages] Secondary buttons in content: ${secondary.length}`);
      } catch (e) {
        console.log('[Gem][RecentImages] Button dump failed:', e);
      }
    }

    function findRecentImagesAnchorButton(modal, rootHint = null) {
      // Requested path:
      // e-float-container .e-dialog__content .e-field__label .e-cell .e-btn.e-btn-secondary
      //
      // In practice, Emarsys can change the DOM structure, so we search progressively.
      const roots = [rootHint, modal, modal.querySelector('.e-dialog__content'), modal.querySelector('.e-dialog__container')]
        .filter(Boolean);

      for (const root of roots) {
        const exact =
          root.querySelector('.e-dialog__content .e-field__label .e-cell .e-btn.e-btn-secondary') ||
          root.querySelector('.e-field__label .e-cell .e-btn.e-btn-secondary');
        if (exact) return exact;

        // Fallback: any secondary button inside dialog content
        const anySecondary = root.querySelector('.e-dialog__content .e-btn.e-btn-secondary') || root.querySelector('.e-btn.e-btn-secondary');
        if (anySecondary) return anySecondary;
      }

      return null;
    }

    function ensureRecentImagesButton(modal, container, dialogActive = null) {
      if (modal.querySelector(`.${GEM_RECENT_IMAGES_BTN_CLASS}`)) {
        console.log('[Gem][RecentImages] Button already exists, skipping insert.');
        return;
      }

      const tryInsert = () => {
        if (modal.querySelector(`.${GEM_RECENT_IMAGES_BTN_CLASS}`)) return true;
        const anchorBtn = findRecentImagesAnchorButton(modal, dialogActive || container);
        if (!anchorBtn) {
          return false;
        }

        console.log('[Gem][RecentImages] Found anchor button, inserting Recent Images button after it.', anchorBtn);
        // Ensure the button cell is flex with a 10px gap (Media DB + Recent Images)
        const btnWrap = anchorBtn.parentElement;
        if (btnWrap && btnWrap.style) {
          btnWrap.style.display = 'flex';
          btnWrap.style.gap = '10px';
          btnWrap.style.alignItems = 'center';
        }
        const recentBtn = document.createElement('button');
        recentBtn.className = `e-btn ${GEM_RECENT_IMAGES_BTN_CLASS}`;
        recentBtn.type = 'button';
        recentBtn.textContent = 'Recent Images';
        recentBtn.addEventListener('click', () => toggleRecentImagesPicker(modal));
        anchorBtn.insertAdjacentElement('afterend', recentBtn);
        return true;
      };

      // Attempt immediately
      if (tryInsert()) return;

      debugDumpDialogButtons(modal, '(initial)');
      console.log('[Gem][RecentImages] Anchor button not found yet; starting observer retry.');
      if (container && !container._gemRecentImagesButtonObserver) {
        container._gemRecentImagesButtonObserver = new MutationObserver(() => {
          if (tryInsert()) {
            console.log('[Gem][RecentImages] Inserted button via observer; disconnecting.');
            try { container._gemRecentImagesButtonObserver.disconnect(); } catch (_) {}
            container._gemRecentImagesButtonObserver = null;
            return;
          }
          // Occasionally dump for debugging
          container._gemRecentImagesBtnTries = (container._gemRecentImagesBtnTries || 0) + 1;
          if (container._gemRecentImagesBtnTries % 25 === 0) {
            debugDumpDialogButtons(modal, `(retry x${container._gemRecentImagesBtnTries})`);
          }
        });
        container._gemRecentImagesButtonObserver.observe(modal, { childList: true, subtree: true });
      }
    }

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
      console.log("[Gem][RecentImages] modifyImagePropertiesModal called");

      const previewLog = (...args) => {
        try { console.log('[gem-image-preview]', ...args); } catch (_) {}
      };

      // Find the dialog active element
      const dialogActive = (modal && modal.matches && modal.matches('.e-dialog-active'))
        ? modal
        : modal.querySelector('.e-dialog-active');
      if (!dialogActive) {
        console.log("[Gem] Dialog active element not found");
        previewLog('abort: dialogActive not found', { modalTag: modal && modal.tagName, modalClass: modal && modal.className });
        return;
      }
      previewLog('dialogActive resolved', { modalTag: modal && modal.tagName, modalClass: modal && modal.className, dialogActiveTag: dialogActive.tagName, dialogActiveClass: dialogActive.className });

      // Apply flex styles to the dialog active element
      dialogActive.style.flexDirection = 'row-reverse';
      dialogActive.style.alignItems = 'stretch';
      dialogActive.style.padding = '0';
      dialogActive.classList.add('gem-enhanced-image-properties-dialog');
      console.log("[Gem] Applied flex styles and class to dialog-active element:", dialogActive);

      // Find the container element
      const container = dialogActive.querySelector('div.e-dialog__container');
      if (!container) {
        console.log("[Gem] Image Properties modal container not found");
        previewLog('abort: container not found');
        return;
      }
      if (!container._gemPreviewDebugId) {
        gemImagePreviewDebugSeq += 1;
        container._gemPreviewDebugId = gemImagePreviewDebugSeq;
      }
      previewLog('container resolved', { debugId: container._gemPreviewDebugId });

      // Check if already modified to avoid duplicate modifications
      if (container._gemModified) {
        console.log("[Gem] Image Properties modal already modified");
        return;
      }

      // ------------------------------------------------------------
      // Cleanup / teardown (prevents MutationObserver feedback loops on close)
      // ------------------------------------------------------------

      const cleanupImagePropertiesModal = () => {
        if (container._gemIsClosing) return;
        container._gemIsClosing = true;
        try { container._gemContainerObserver && container._gemContainerObserver.disconnect(); } catch (_) {}
        try { container._gemAccordionObserver && container._gemAccordionObserver.disconnect(); } catch (_) {}
        try { container._gemHtmlEditorObserver && container._gemHtmlEditorObserver.disconnect(); } catch (_) {}
        try { container._gemRecentImagesCmObserver && container._gemRecentImagesCmObserver.disconnect(); } catch (_) {}
        try { container._gemRecentImagesButtonObserver && container._gemRecentImagesButtonObserver.disconnect(); } catch (_) {}
        try { container._gemModalDetachObserver && container._gemModalDetachObserver.disconnect(); } catch (_) {}
        try { container._gemPreviewRemovalObserver && container._gemPreviewRemovalObserver.disconnect(); } catch (_) {}
        try {
          if (container._gemStorageChangeHandler) {
            chrome.storage.onChanged.removeListener(container._gemStorageChangeHandler);
          }
        } catch (_) {}
        try { clearTimeout(container._gemRecentlySeenRefreshT); } catch (_) {}

        container._gemContainerObserver = null;
        container._gemAccordionObserver = null;
        container._gemHtmlEditorObserver = null;
        container._gemRecentImagesCmObserver = null;
        container._gemRecentImagesButtonObserver = null;
        container._gemModalDetachObserver = null;
        container._gemPreviewRemovalObserver = null;
        container._gemStorageChangeHandler = null;
        container._gemRecentlySeenRefreshT = null;
        previewLog('cleanup complete', { debugId: container._gemPreviewDebugId });
      };
      container._gemCleanupImagePropertiesModal = cleanupImagePropertiesModal;

      // Call cleanup on explicit close button click.
      if (!container._gemCloseClickBound) {
        container._gemCloseClickBound = true;
        modal.addEventListener('click', (e) => {
          const btn = e.target && e.target.closest && e.target.closest('button[aria-label="Close Dialog"], .e-dialog__close');
          if (!btn) return;
          cleanupImagePropertiesModal();
        }, true);
      }

      // Call cleanup when modal is detached from DOM.
      if (!container._gemModalDetachObserver) {
        const parent = modal.parentNode;
        if (parent) {
          container._gemModalDetachObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
              for (const n of m.removedNodes || []) {
                if (n === modal) {
                  cleanupImagePropertiesModal();
                  return;
                }
              }
            }
          });
          try {
            container._gemModalDetachObserver.observe(parent, { childList: true });
          } catch (_) {}
        }
      }

      // Store reference to the preview images for later updates (one per tab)
      let previewImgDesktop = container._gemPreviewImgDesktop || null;
      let previewImgMobile = container._gemPreviewImgMobile || null;

      // Apply inline styles to the container
      container.style.maxWidth = '40%';
      container.style.width = '720px';
      container.style.overflow = 'hidden';

      // Create and insert the new left panel div before the container
      const leftPanelContainer = document.createElement('div');
      leftPanelContainer.id = 'gem-image-properties-left-panel';
      leftPanelContainer.style.height = '100%';
      leftPanelContainer.style.width = '100%';
      leftPanelContainer.style.zIndex = '9';

      // Insert before the container element
      dialogActive.insertBefore(leftPanelContainer, container);

      // Persistent preview canvas (kept on the container) so tab switching doesn't destroy it.
      // We'll move this same element into the current dialog content as needed.
      let previewCanvas = container._gemPreviewCanvas || modal.querySelector('#gem-image-preview-canvas');
      if (!previewCanvas) {
        previewCanvas = document.createElement('div');
        previewCanvas.id = 'gem-image-preview-canvas';
        previewCanvas.classList.add('gem-checkered-canvas');

        // previewCanvas.style.minHeight = '140px';
        // Responsive height that scales down on short screens, prevents layout jumping when the image loads/decodes.
        // previewCanvas.style.maxHeight = 'min(340px, calc(100vh - 200px))';
        previewCanvas.style.padding = '16px';
        previewCanvas.style.width = '100%';
        previewCanvas.style.height = '100%';
        previewCanvas.style.boxSizing = 'border-box';
      }
      container._gemPreviewCanvas = previewCanvas;

      // Hidden parking lot keeps the preview node (and <img>) in the DOM even if Emarsys
      // temporarily re-renders the dialog content, which helps prevent reloading/flashing.
      let previewParkingLot = container._gemPreviewParkingLot;
      if (!previewParkingLot) {
        previewParkingLot = document.createElement('div');
        previewParkingLot.id = 'gem-image-preview-parkinglot';
        previewParkingLot.style.display = 'none';
        // Add parking lot to dialog header instead of container
        const dialogHeader = container.querySelector('.e-dialog__header') || modal.querySelector('.e-dialog__header');
        if (dialogHeader) {
          dialogHeader.appendChild(previewParkingLot);
        } else {
          // Fallback to container if header not found
          container.appendChild(previewParkingLot);
        }
        container._gemPreviewParkingLot = previewParkingLot;
      }

      const getActivePreviewTab = () => {
        const active = modal.querySelector('.e-tabs__title-active[data-tab]');
        const domTab = active && active.getAttribute('data-tab');
        const last = container._gemPreviewLastTab;
        // Emarsys can delay updating the active-tab class until after CodeMirror blur.
        // If we have a recent user intent (last clicked tab), trust it over the DOM.
        if (last) {
          const normalizedLast = last === 'mobile' ? 'mobile' : 'desktop';
          // If DOM agrees, great; if DOM disagrees, DOM is likely stale—keep last.
          if (domTab && (domTab === 'mobile' ? 'mobile' : 'desktop') === normalizedLast) {
            return normalizedLast;
          }
          return normalizedLast;
        }

        if (domTab) {
          const normalizedDom = domTab === 'mobile' ? 'mobile' : 'desktop';
          // Seed lastTab on first read so future logic can rely on it.
          container._gemPreviewLastTab = normalizedDom;
          return normalizedDom;
        }

        return 'desktop';
      };

      const ensurePreviewImgs = () => {
        // Ensure base layout once
        previewCanvas.style.display = 'flex';
        previewCanvas.style.justifyContent = 'center';

        if (!previewImgDesktop) {
          previewImgDesktop = document.createElement('img');
          previewImgDesktop.dataset.gemPreviewTab = 'desktop';
          try {
            previewImgDesktop.loading = 'eager';
            previewImgDesktop.decoding = 'async';
          } catch (_) {}

          previewImgDesktop.style.maxWidth = '100%';
          previewImgDesktop.style.maxHeight = '100%';
          previewImgDesktop.style.objectFit = 'contain';
          previewImgDesktop.style.width = 'auto';
          previewImgDesktop.style.height = 'auto';
          previewImgDesktop.style.display = 'none';

          previewImgDesktop.onload = () => {
            // Image sizing no longer needed
          };

          previewImgDesktop.onerror = () => {
            console.log("[Gem] Failed to load desktop image:", previewImgDesktop.src);
            previewLog('img error', { debugId: container._gemPreviewDebugId, tab: 'desktop', src: previewImgDesktop.src });
            previewImgDesktop.style.display = 'none';
            // Reset border color on error
            previewCanvas.style.borderColor = 'var(--token-border-default)';
          };
          previewImgDesktop.onload = () => {
            console.log("[Gem] Desktop image loaded successfully:", previewImgDesktop.src);
            previewLog('img load', { debugId: container._gemPreviewDebugId, tab: 'desktop', src: previewImgDesktop.src });
            // Add visual indicator that image loaded successfully
            previewCanvas.style.borderColor = 'var(--token-border-success)';
          };
          previewCanvas.appendChild(previewImgDesktop);
          container._gemPreviewImgDesktop = previewImgDesktop;
          previewLog('created preview img', { debugId: container._gemPreviewDebugId, tab: 'desktop' });
        }

        if (!previewImgMobile) {
          previewImgMobile = document.createElement('img');
          previewImgMobile.dataset.gemPreviewTab = 'mobile';
          try {
            previewImgMobile.loading = 'eager';
            previewImgMobile.decoding = 'async';
          } catch (_) {}

          previewImgMobile.style.maxWidth = '100%';
          previewImgMobile.style.maxHeight = '100%'; 
          previewImgMobile.style.objectFit = 'contain';
          previewImgMobile.style.width = 'auto';
          previewImgMobile.style.height = 'auto';
          previewImgMobile.style.display = 'none';

          previewImgMobile.onload = () => {
            // Image sizing no longer needed
          };

          previewImgMobile.onerror = () => {
            console.log("[Gem] Failed to load mobile image:", previewImgMobile.src);
            previewLog('img error', { debugId: container._gemPreviewDebugId, tab: 'mobile', src: previewImgMobile.src });
            previewImgMobile.style.display = 'none';
            // Reset border color on error
            previewCanvas.style.borderColor = 'var(--token-border-default)';
          };
          previewImgMobile.onload = () => {
            console.log("[Gem] Mobile image loaded successfully:", previewImgMobile.src);
            previewLog('img load', { debugId: container._gemPreviewDebugId, tab: 'mobile', src: previewImgMobile.src });
            // Add visual indicator that image loaded successfully
            previewCanvas.style.borderColor = 'var(--token-border-success)';
          };
          previewCanvas.appendChild(previewImgMobile);
          container._gemPreviewImgMobile = previewImgMobile;
          previewLog('created preview img', { debugId: container._gemPreviewDebugId, tab: 'mobile' });
        }
      };

      const syncPreviewVisibilityToTab = () => {
        ensurePreviewImgs();
        const active = getActivePreviewTab();
        const dUrl = container._gemPreviewImgUrlDesktop || '';
        const mUrl = container._gemPreviewImgUrlMobile || '';

        // Only show the image for the active tab if it has a URL
        const desktopShouldShow = active === 'desktop' && !!dUrl;
        const mobileShouldShow = active === 'mobile' && !!mUrl;
        previewImgDesktop.style.display = desktopShouldShow ? 'block' : 'none';
        previewImgMobile.style.display = mobileShouldShow ? 'block' : 'none';

        previewLog('preview visibility', {
          debugId: container._gemPreviewDebugId,
          active,
          canvas: { display: previewCanvas.style.display, visibility: previewCanvas.style.visibility },
          desktop: { shouldShow: desktopShouldShow, url: dUrl, display: previewImgDesktop.style.display },
          mobile: { shouldShow: mobileShouldShow, url: mUrl, display: previewImgMobile.style.display }
        });
      };

      const ensurePreviewCanvasPlacement = () => {
        const dialogContent = container.querySelector('div.e-dialog__content') || modal.querySelector('div.e-dialog__content');
        if (!dialogContent) {
          try {
            if (previewCanvas.parentNode !== previewParkingLot) {
              previewParkingLot.appendChild(previewCanvas);
              previewLog('preview parked (no dialogContent)', { debugId: container._gemPreviewDebugId });
            }
          } catch (_) {}
          return;
        }
        // Position preview canvas inside the dialog header
        const dialogHeader = container.querySelector('.e-dialog__header') || modal.querySelector('.e-dialog__header');
        if (!dialogHeader) {
          // Fallback: position as sibling to parking lot
          const targetParent = previewParkingLot.parentNode;
          const targetIndex = Array.from(targetParent.children).indexOf(previewParkingLot);
          if (previewCanvas.parentNode !== targetParent) {
            try { previewCanvas.remove(); } catch (_) {}
            previewCanvas.style.display = 'block';
            targetParent.insertBefore(previewCanvas, targetParent.children[targetIndex]);
            previewLog('preview inserted before header (fallback)', { debugId: container._gemPreviewDebugId });
          }
          return;
        }

        // Position inside the dialog header as first child
        if (previewCanvas.parentNode !== dialogHeader) {
          try { previewCanvas.remove(); } catch (_) {}
          previewCanvas.style.display = 'block';
          dialogHeader.insertBefore(previewCanvas, dialogHeader.firstChild);
          previewLog('preview inserted inside header', { debugId: container._gemPreviewDebugId });
        } else if (previewCanvas !== dialogHeader.firstChild) {
          // Ensure it's positioned as first child of header
          dialogHeader.insertBefore(previewCanvas, dialogHeader.firstChild);
          previewLog('preview repositioned inside header', { debugId: container._gemPreviewDebugId });
        }
      };

      // Place it initially
      ensurePreviewCanvasPlacement();
      syncPreviewVisibilityToTab();

      // Debug: Watch for preview canvas removal
      if (!container._gemPreviewRemovalObserver) {
        container._gemPreviewRemovalObserver = new MutationObserver((mutations) => {
          if (container._gemIsClosing) return;
          mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
              mutation.removedNodes.forEach((node) => {
                if (node === previewCanvas || (node.contains && node.contains(previewCanvas))) {
                  previewLog('preview canvas REMOVED from DOM', {
                    debugId: container._gemPreviewDebugId,
                    removedNode: node.tagName + (node.id ? '#' + node.id : ''),
                    parentWas: previewCanvas.parentNode ? previewCanvas.parentNode.tagName + (previewCanvas.parentNode.id ? '#' + previewCanvas.parentNode.id : '') : 'null'
                  });
                }
              });
            }
          });
        });

        // Observe the container and its subtree for childList changes
        try {
          container._gemPreviewRemovalObserver.observe(container, {
            childList: true,
            subtree: true
          });
        } catch (e) {
          previewLog('failed to observe for preview removal', { debugId: container._gemPreviewDebugId, error: e.message });
        }
      }

      // On tab interaction, toggle visibility instantly (do NOT touch src).
      // Emarsys focuses CodeMirror on tab click; their active class update can be delayed until blur,
      // so we optimistically use the clicked tab's data-tab.
      if (!container._gemPreviewTabClickBound) {
        container._gemPreviewTabClickBound = true;
        modal.addEventListener('pointerdown', (e) => {
          const tabEl = e.target && e.target.closest && e.target.closest('.e-tabs__title[data-tab]');
          if (!tabEl) return;
          const clicked = tabEl.getAttribute('data-tab') === 'mobile' ? 'mobile' : 'desktop';
          container._gemPreviewLastTab = clicked;
          // Run immediately so the preview swaps before Emarsys shifts focus into CodeMirror.
          ensurePreviewCanvasPlacement();
          syncPreviewVisibilityToTab();
        }, true);

        // Also run after the click settles (in case Emarsys updates classes asynchronously)
        modal.addEventListener('click', (e) => {
          const tabEl = e.target && e.target.closest && e.target.closest('.e-tabs__title[data-tab]');
          if (!tabEl) return;
          setTimeout(() => {
            ensurePreviewCanvasPlacement();
            syncPreviewVisibilityToTab();
          }, 0);
        }, true);
      }

      // Recent Images panel is always visible now
      showRecentImagesPicker(modal);

      // Emarsys can re-render dialog content right after open (especially when our picker loads prefs),
      // which may temporarily detach the preview canvas and park it. Re-attach a few times to ensure
      // the preview is visible on first open.
      const ensurePreviewCanvasPlacedSoon = () => {
        let tries = 0;
        const tick = () => {
          if (container._gemIsClosing || !container.isConnected || !modal.isConnected) return;
          try {
            ensurePreviewCanvasPlacement();
            syncPreviewVisibilityToTab();
          } catch (_) {}
          // Check if preview canvas is properly positioned before the dialog header
          const dialogHeader = container.querySelector('.e-dialog__header') || modal.querySelector('.e-dialog__header');
          if (dialogHeader && previewCanvas.nextSibling === dialogHeader) return;
          tries += 1;
          if (tries === 1 || tries === 5 || tries === 9) {
            previewLog('ensurePreviewCanvasPlacedSoon retry', { debugId: container._gemPreviewDebugId, tries });
          }
          if (tries < 10) setTimeout(tick, 50);
        };
        setTimeout(tick, 0);
      };
      ensurePreviewCanvasPlacedSoon();

      // Live refresh: if "Recently Seen" is the active list, update immediately as new images are logged.
      if (!container._gemStorageChangeHandler) {
        container._gemStorageChangeHandler = (changes, namespace) => {
          try {
            if (namespace !== 'local' && namespace !== 'sync') return;
            if (!changes || !changes.gemRecentlySeenImages) return;
            if (container._gemIsClosing || !container.isConnected || !modal.isConnected) return;
            const picker = modal.querySelector('#gem-recent-images-picker');
            if (!picker) return;
            if (picker.dataset.gemRecentImagesSource !== 'seen') return;
            clearTimeout(container._gemRecentlySeenRefreshT);
            container._gemRecentlySeenRefreshT = setTimeout(() => {
              if (container._gemIsClosing || !container.isConnected || !modal.isConnected) return;
              showRecentImagesPicker(modal);
              // In case Emarsys repaints content while refreshing the picker, keep the preview attached.
              ensurePreviewCanvasPlacedSoon();
            }, 60);
          } catch (_) {}
        };
        try { chrome.storage.onChanged.addListener(container._gemStorageChangeHandler); } catch (_) {}
      }

      // Function to update the active tab image in preview canvas (desktop/mobile have distinct <img>)
      const updateImageInPreviewCanvas = (rawUrl) => {
        const imageUrl = normalizePreviewImageUrl(rawUrl);
        console.log("[Gem] Updating image in preview canvas:", imageUrl);
        previewLog('updateImageInPreviewCanvas', { debugId: container._gemPreviewDebugId, rawUrl, imageUrl });

        if (imageUrl && imageUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) && imageUrl !== 'null') {
          // Ensure the canvas is in the active tab content before manipulating DOM
          ensurePreviewCanvasPlacement();
          ensurePreviewImgs();

          const active = getActivePreviewTab();
          const key = active === 'mobile' ? '_gemPreviewImgUrlMobile' : '_gemPreviewImgUrlDesktop';
          const img = active === 'mobile' ? previewImgMobile : previewImgDesktop;
          const lastUrl = container[key] || '';
          const currentSrcAttr = img.getAttribute('src') || '';
          // Only set src when it truly changed (prevents unnecessary re-requests).
          previewLog('preview src check', { debugId: container._gemPreviewDebugId, active, key, lastUrl, currentSrcAttr, next: imageUrl });
          if (lastUrl !== imageUrl || currentSrcAttr !== imageUrl) {
            container[key] = imageUrl;
            img.setAttribute('src', imageUrl);
            previewLog('preview src set', { debugId: container._gemPreviewDebugId, active, src: imageUrl });
            previewLog('img src attribute set', { debugId: container._gemPreviewDebugId, active, url: imageUrl, imgSrc: img.src });
            // Image sizing no longer needed
          }
          syncPreviewVisibilityToTab();
        } else {
          // Hide the active tab image if URL is not valid or null (disabled state)
          const active = getActivePreviewTab();
          if (active === 'mobile' && previewImgMobile) previewImgMobile.style.display = 'none';
          if (active === 'desktop' && previewImgDesktop) previewImgDesktop.style.display = 'none';
          previewLog('preview hidden (invalid url)', { debugId: container._gemPreviewDebugId, active, imageUrl });
        }
      };

      // Find and inject the initial image into the preview
      const htmlEditor = container.querySelector('vce-html-editor');
      previewLog('initial htmlEditor check', {
        debugId: container._gemPreviewDebugId,
        found: !!htmlEditor,
        disabled: !!(htmlEditor && htmlEditor.classList && htmlEditor.classList.contains('e-input-disabled')),
        htmlAttr: htmlEditor && htmlEditor.getAttribute ? htmlEditor.getAttribute('html') : null
      });
      if (htmlEditor && htmlEditor.getAttribute('html') && !htmlEditor.classList.contains('e-input-disabled')) {
        const imageUrl = normalizePreviewImageUrl(htmlEditor.getAttribute('html'));
        updateImageInPreviewCanvas(imageUrl);
        // Collect recent image immediately on open
        if (imageUrl) upsertRecentImageUrl(imageUrl);
      }

      // Set up observer to watch for vce-html-editor element changes
      let htmlEditorObserver = null;

      const setupHtmlEditorObserver = (htmlEditor) => {
        if (htmlEditorObserver) {
          htmlEditorObserver.disconnect();
        }
        previewLog('setupHtmlEditorObserver', {
          debugId: container._gemPreviewDebugId,
          disabled: !!(htmlEditor && htmlEditor.classList && htmlEditor.classList.contains('e-input-disabled')),
          htmlAttr: htmlEditor && htmlEditor.getAttribute ? htmlEditor.getAttribute('html') : null
        });

        // Watch for attribute changes on the vce-html-editor element
        htmlEditorObserver = new MutationObserver((mutations) => {
          if (container._gemIsClosing || !container.isConnected || !modal.isConnected) return;
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && (mutation.attributeName === 'html' || mutation.attributeName === 'class')) {
              const target = mutation.target;
              const hasDisabledClass = target.classList.contains('e-input-disabled');
              const newImageUrl = normalizePreviewImageUrl(target.getAttribute('html'));

              console.log("[Gem] vce-html-editor attribute changed:", mutation.attributeName, "disabled:", hasDisabledClass);
              previewLog('htmlEditor mutation', { debugId: container._gemPreviewDebugId, attr: mutation.attributeName, disabled: hasDisabledClass, htmlAttr: target.getAttribute('html'), newImageUrl });

              if (hasDisabledClass) {
                // If disabled, hide any existing image
                updateImageInPreviewCanvas(null);
              } else if (newImageUrl) {
                // If not disabled and has URL, update image
                updateImageInPreviewCanvas(newImageUrl);
                // Collect into recent images list
                upsertRecentImageUrl(newImageUrl);
              }
            }
          });
        });
        container._gemHtmlEditorObserver = htmlEditorObserver;

        htmlEditorObserver.observe(htmlEditor, {
          attributes: true,
          attributeFilter: ['html', 'class']
        });

        // Update image with current URL only if not disabled
        if (!htmlEditor.classList.contains('e-input-disabled')) {
          const currentImageUrl = normalizePreviewImageUrl(htmlEditor.getAttribute('html'));
          updateImageInPreviewCanvas(currentImageUrl);
          if (currentImageUrl) upsertRecentImageUrl(currentImageUrl);
        }

        console.log("[Gem] Set up attribute observer for vce-html-editor");
      };

      // Watch for vce-html-editor being added/removed from container
      const containerObserver = new MutationObserver((mutations) => {
        if (container._gemIsClosing || !container.isConnected || !modal.isConnected) return;
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            const currentHtmlEditor = container.querySelector('vce-html-editor');
            // Emarsys re-renders Desktop/Mobile tab content; when our preview node gets removed,
            // immediately park it in a hidden container so the image stays "alive" in DOM.
            try {
              mutation.removedNodes && mutation.removedNodes.forEach((n) => {
                if (!container._gemPreviewCanvas || !container._gemPreviewParkingLot) return;
                if (n === container._gemPreviewCanvas || (n.querySelector && n.querySelector('#gem-image-preview-canvas') === container._gemPreviewCanvas)) {
                  if (container._gemPreviewCanvas.parentNode !== container._gemPreviewParkingLot) {
                    container._gemPreviewParkingLot.appendChild(container._gemPreviewCanvas);
                  }
                }
              });
            } catch (_) {}

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
                  // Don't clear preview on tab switches; desktop/mobile may swap editors in/out.
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
      container._gemContainerObserver = containerObserver;

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
        if (container._gemIsClosing || !container.isConnected || !modal.isConnected) return;
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
      container._gemAccordionObserver = accordionObserver;

      // Mark as modified
      container._gemModified = true;

      // ------------------------------------------------------------
      // Recent Images (always visible) + CodeMirror URL tracking
      // ------------------------------------------------------------
      // Remove the old "Recent Images" toggle button if it exists (picker is always visible now)
      try {
        const oldBtn = modal.querySelector(`.${GEM_RECENT_IMAGES_BTN_CLASS}`);
        if (oldBtn) oldBtn.remove();
      } catch (_) {}

      // Watch for CodeMirror input field swapping in/out, and store the current URL whenever it appears.
      if (!container._gemRecentImagesCmObserver) {
        console.log('[Gem][RecentImages] Setting up CodeMirror observer');
        container._gemRecentImagesCmObserver = new MutationObserver(() => {
          if (container._gemIsClosing || !container.isConnected || !modal.isConnected) return;
          const { cmEl, value } = getActiveImageUrlCodeMirror(modal);
          if (!cmEl) return;
          if (cmEl && container._gemLastSeenImageUrlCmEl !== cmEl) {
            container._gemLastSeenImageUrlCmEl = cmEl;
            if (value) upsertRecentImageUrl(value);
          } else if (cmEl && value) {
            // Also upsert if value changed (best-effort)
            if (container._gemLastSeenImageUrlValue !== value) {
              container._gemLastSeenImageUrlValue = value;
              upsertRecentImageUrl(value);
            }
          }
        });
        container._gemRecentImagesCmObserver.observe(container, { childList: true, subtree: true });
      }

      // Initial capture on open
      setTimeout(() => {
        const { value } = getActiveImageUrlCodeMirror(modal);
        console.log('[Gem][RecentImages] Initial CodeMirror URL value:', value);
        if (value) upsertRecentImageUrl(value);
      }, 150);

      console.log("[Gem] Image Properties modal modification complete");
    }

    // Monitor for modal appearance
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
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

  // Initialize the compact email tools dropdown
  initializeCompactEmailTools();

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

  // Initialize keyword swap functionality (may not be loaded yet)
  function tryInitializeKeywordSwap() {
    if (window.initializeKeywordSwap) {
      console.log("[Gem] Calling initializeKeywordSwap");
      window.initializeKeywordSwap();
      return true;
    }
    return false;
  }

  // Try immediately
  if (!tryInitializeKeywordSwap()) {
    // If not loaded yet, check periodically for up to 5 seconds
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (tryInitializeKeywordSwap()) {
        clearInterval(checkInterval);
      } else if (attempts >= 50) { // 50 * 100ms = 5 seconds
        console.log("[Gem] Keyword swap initialization timed out - function not found");
        clearInterval(checkInterval);
      }
    }, 100);
  }

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