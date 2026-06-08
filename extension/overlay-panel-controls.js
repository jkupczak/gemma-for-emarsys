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
  if (setupSaveButtonSync._initialized) return;
  setupSaveButtonSync._initialized = true;

  console.log('[Gem] Setting up save button synchronization');
  let observedOriginalButton = null;
  let observedOriginalLoading = null;
  let buttonObserver = null;
  let loadingObserver = null;
  let syncScheduled = false;

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

  function attachButtonObserver() {
    const originalButton = document.querySelector('cb-draft-save-button button');
    if (observedOriginalButton === originalButton) return;

    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }

    observedOriginalButton = originalButton || null;
    if (!originalButton) return;

    buttonObserver = new MutationObserver((mutations) => {
      const disabledChanged = mutations.some((mutation) =>
        mutation.type === 'attributes' && mutation.attributeName === 'disabled'
      );
      if (disabledChanged) {
        scheduleSync();
      }
    });

    buttonObserver.observe(originalButton, {
      attributes: true,
      attributeFilter: ['disabled']
    });

    console.log('[Gem] Set up observer for original save button disabled state');
  }

  function attachLoadingObserver() {
    const originalLoading = document.querySelector('cb-draft-save-button button .e-btn__loading');
    if (observedOriginalLoading === originalLoading) return;

    if (loadingObserver) {
      loadingObserver.disconnect();
      loadingObserver = null;
    }

    observedOriginalLoading = originalLoading || null;
    if (!originalLoading) return;

    loadingObserver = new MutationObserver(() => {
      scheduleSync();
    });

    loadingObserver.observe(originalLoading, {
      attributes: true,
      attributeFilter: ['class']
    });

    console.log('[Gem] Set up observer for original save button loading classes');
  }

  function runSync() {
    attachButtonObserver();
    attachLoadingObserver();
    syncDisabledState();
    syncLoadingClasses();
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      runSync();
    });
  }

  const root = document.body || document.documentElement;
  if (root) {
    const rootObserver = new MutationObserver((mutations) => {
      const hasStructuralChange = mutations.some((mutation) =>
        mutation.type === 'childList' &&
        (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
      );
      if (hasStructuralChange) {
        scheduleSync();
      }
    });
    rootObserver.observe(root, {
      childList: true,
      subtree: true
    });
  }

  // Initial sync plus one delayed pass for late-rendered elements.
  scheduleSync();
  setTimeout(scheduleSync, 100);
}





// No longer needed since we're moving the original element instead of cloning

// Handle overlay panel controls, including Escape key functionality
function initializeOverlayPanelControls() {
  console.log("[Gem] Initializing overlay panel controls");

  function gemMediaDbIframeFieldHasTypingFocus(ev) {
    try {
      const w = ev.view;
      const fe = w && w.frameElement;
      if (!fe || !fe.classList || !fe.classList.contains('gem-media-db-iframe') || !w.document) return false;
      const ae = w.document.activeElement;
      if (!ae) return false;
      const tag = (ae.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (ae.isContentEditable) return true;
      if (ae.closest && ae.closest('[contenteditable="true"]')) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

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

    if (gemMediaDbIframeFieldHasTypingFocus(event)) {
      return;
    }
    try {
      const w = event.view;
      const fe = w && w.frameElement;
      if (fe && fe.classList && fe.classList.contains('gem-media-db-iframe')) {
        const dialogEl = fe.closest('.e-dialog.e-dialog-active') || fe.closest('.e-dialog-active');
        if (dialogEl) {
          const closeBtn =
            dialogEl.querySelector('button[aria-label="Close Dialog"]') ||
            dialogEl.querySelector('.e-dialog__close') ||
            dialogEl.querySelector('button.e-dialog__close');
          if (closeBtn) {
            closeBtn.click();
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return false;
          }
        }
      }
    } catch (_) {}

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

    function bindEscapeShortcutIframeReload(iframe) {
      if (!iframe || iframe._gemEscapeShortcutIframeLoadBound) return;
      iframe._gemEscapeShortcutIframeLoadBound = true;
      iframe.addEventListener('load', () => {
        setTimeout(() => injectIntoIframe(iframe), 50);
      });
    }

    // Function to wait for iframe to be ready and inject
    function waitForIframeReady(iframe) {
      bindEscapeShortcutIframeReload(iframe);
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        // Iframe is already loaded
        injectIntoIframe(iframe);
      } else {
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

    // Monitor for new iframes being added (including nested, e.g. Media DB in image picker)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.tagName === 'IFRAME') {
            waitForIframeReady(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll('iframe').forEach(waitForIframeReady);
          }
        });
      });
    });

    const obsRoot = document.body || document.documentElement;
    observer.observe(obsRoot, {
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

    /** Pooled Media DB iframe (Image Picker): preloaded off-DOM, kept when switching tabs / closing dialog. */
    let gemMediaDbPickerPoolHost = null;
    let gemMediaDbPickerIframeEl = null;
    let gemMediaDbPickerIframeSessionForSrc = null;
    const GEM_MEDIA_DB_IFRAME_DEBUG = (() => {
      try {
        if (window.__GEM_MEDIA_DB_IFRAME_DEBUG__ != null) return !!window.__GEM_MEDIA_DB_IFRAME_DEBUG__;
        return localStorage.getItem('gemMediaDbIframeDebug') === '1';
      } catch (_) {
        return false;
      }
    })();
    function gemMediaDbDbg(...args) {
      if (!GEM_MEDIA_DB_IFRAME_DEBUG) return;
      try { console.log('[Gem][MediaDbIframe]', ...args); } catch (_) {}
    }
    try {
      window.setGemMediaDbIframeDebug = function setGemMediaDbIframeDebug(enabled) {
        const on = !!enabled;
        try {
          localStorage.setItem('gemMediaDbIframeDebug', on ? '1' : '0');
          window.__GEM_MEDIA_DB_IFRAME_DEBUG__ = on;
        } catch (_) {}
        console.log(`[Gem][MediaDbIframe] debug ${on ? 'enabled' : 'disabled'}; reload page to apply.`);
      };
    } catch (_) {}
    /** Modal used for insert-from-iframe; updated on each showRecentImagesPicker call. */
    let gemMediaDbIframeClickModalRef = null;
    let gemMediaDbParentThemeObserver = null;

    const GEM_LEGACY_RECENT_IMAGES_STORAGE_KEY = 'gemRecentlyUsedImages';
    const GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY = 'gemRecentlySeenImages';
    const LAST_USED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
    const GEM_RECENTLY_SEEN_IMAGES_MAX_SETTING_KEY = 'gemRecentlySeenImagesMax';
    let recentlySeenMax = 300;
    const GEM_FAVORITE_IMAGES_STORAGE_KEY = 'gemFavoriteImages';
    const GEM_FAVORITE_IMAGES_MAX = 1000;
    const GEM_FAVORITE_IMAGE_META_STORAGE_KEY = 'gemFavoriteImageMeta';
    // Consolidated storage for favorites with metadata
    const GEM_FAVORITE_IMAGES_CONSOLIDATED_KEY = 'gemFavoriteImagesConsolidated';
    const GEM_FAVORITE_IMAGE_CATEGORY_COLLAPSE_KEY = 'gemFavoriteImageCategoryCollapse';
    const GEM_RECENTLY_SEEN_IMAGE_GROUP_COLLAPSE_KEY = 'gemRecentlySeenImageGroupCollapse';
    const GEM_RECENT_IMAGES_BTN_CLASS = 'gem-recent-images-btn';
    const GEM_RECENT_IMAGES_PICKER_PREFS_KEY = 'gemRecentImagesPickerPrefs';
    /** Once true, first-open onboarding no longer forces the Media Database tab. */
    const GEM_IMAGE_PICKER_MEDIA_DB_INTRO_KEY = 'gemImagePickerMediaDbTabIntroShown';
    const GEM_SEARCH_PILLS_KEY = 'gemSearchPills';
    const GEM_SEARCH_PILL_ACTIVE_KEY = 'gemSearchPillActive';
    const GEM_IMAGE_SEARCH_TEXT_KEY = 'gemImageSearchText';

    const PILL_CTX_SEEN = 1;
    const PILL_CTX_FAV = 2;
    const PILL_CTX_BOTH = 3;

    // In-memory collapse overrides for groups manually collapsed while a search
    // is active. Cleared whenever search terms change so that a new search
    // auto-expands all groups again, but preserved while the same search is
    // active so the user can collapse groups at will.
    const _gemFavSearchCollapseOverride = {};
    const _gemSeenSearchCollapseOverride = {};
    let _gemFavSearchKey = null;
    let _gemSeenSearchKey = null;

    function toMinifiedPill(p) {
      const mp = { t: p.term, c: p.context || PILL_CTX_BOTH };
      if (p.isRegex) mp.r = 1;
      if (p.label) mp.l = p.label;
      return mp;
    }

    function fromMinifiedPill(mp) {
      return {
        term: String(mp.t || '').trim(),
        isRegex: !!mp.r,
        label: mp.l ? String(mp.l).trim() : '',
        context: mp.c || PILL_CTX_BOTH,
        active: true
      };
    }

    function pillCompositeKey(p) {
      const term = p.term || p.t || '';
      const ctx = p.context || p.c || PILL_CTX_BOTH;
      return `${term}:${ctx}`;
    }

    function hydratePills(minifiedArr, activeMap) {
      return (Array.isArray(minifiedArr) ? minifiedArr : []).map((mp) => {
        if (!mp || typeof mp !== 'object') return null;
        const pill = fromMinifiedPill(mp);
        if (!pill.term) return null;
        const key = pillCompositeKey(pill);
        if (activeMap && key in activeMap) pill.active = !!activeMap[key];
        return pill;
      }).filter(Boolean);
    }

    function pillsForContext(pills, ctx) {
      return (pills || [])
        .map((p, i) => ({ ...p, _idx: i }))
        .filter((p) => p.context === ctx || p.context === PILL_CTX_BOTH);
    }

    function matchIndicesForContext(full, ctx) {
      const indices = [];
      (full || []).forEach((p, i) => {
        if (p && (p.context === ctx || p.context === PILL_CTX_BOTH)) indices.push(i);
      });
      return indices;
    }

    function mergeReorderedSubset(full, ctx, orderedSubsetGlobalIndices) {
      const fullArr = Array.isArray(full) ? [...full] : [];
      const matchIndices = matchIndicesForContext(fullArr, ctx);
      if (orderedSubsetGlobalIndices.length !== matchIndices.length) return fullArr;
      const matchSet = new Set(matchIndices);
      for (let k = 0; k < orderedSubsetGlobalIndices.length; k++) {
        if (!matchSet.has(orderedSubsetGlobalIndices[k])) return fullArr;
      }
      const set = new Set(matchIndices);
      const reorderedSubset = orderedSubsetGlobalIndices.map((i) => fullArr[i]);
      let j = 0;
      return fullArr.map((p, i) => (set.has(i) ? reorderedSubset[j++] : p));
    }

    function destroyGemSearchPillSortables(picker) {
      if (!picker || !picker._gemPillSortables) return;
      picker._gemPillSortables.forEach((s) => {
        try {
          s.destroy();
        } catch (_) {}
      });
      picker._gemPillSortables = [];
    }

    function initGemSearchPillSortables(picker, modal) {
      if (!picker || !picker.isConnected || typeof Sortable === 'undefined') return;
      destroyGemSearchPillSortables(picker);
      picker._gemPillSortables = [];
      picker.querySelectorAll('.gem-search-pills').forEach((container) => {
        const src = container.getAttribute('data-pills-source') || '';
        if (src !== 'favorites' && src !== 'seen') return;
        if (!container.querySelector('.gem-search-pill')) return;
        const sortable = Sortable.create(container, {
          animation: 150,
          draggable: '.gem-search-pill',
          filter: '.gem-search-pill-remove',
          preventOnFilter: false,
          ghostClass: 'gem-search-pill--sortable-ghost',
          chosenClass: 'gem-search-pill--sortable-chosen',
          dragClass: 'gem-search-pill--sortable-drag',
          onEnd: (evt) => {
            if (evt.oldIndex === evt.newIndex) return;
            const sourceAttr = evt.to.getAttribute('data-pills-source') || '';
            const ctx =
              sourceAttr === 'favorites' ? PILL_CTX_FAV : sourceAttr === 'seen' ? PILL_CTX_SEEN : null;
            if (ctx == null) return;
            const orderedSubsetGlobalIndices = Array.from(evt.to.querySelectorAll('.gem-search-pill'))
              .map((el) => parseInt(el.getAttribute('data-index') || '-1', 10))
              .filter((i) => i >= 0);
            const full = picker._gemSearchPills || [];
            const merged = mergeReorderedSubset(full, ctx, orderedSubsetGlobalIndices);
            picker._gemSearchPills = merged;
            saveSearchPills(merged);
            showRecentImagesPicker(modal, { contentOnly: true });
          }
        });
        picker._gemPillSortables.push(sortable);
      });
    }

    function scheduleGemSearchPillSortableRefresh(picker, modal) {
      if (!picker || !modal) return;
      if (picker._gemPillSortableRafId != null) {
        try {
          cancelAnimationFrame(picker._gemPillSortableRafId);
        } catch (_) {}
        picker._gemPillSortableRafId = null;
      }
      picker._gemPillSortableRafId = requestAnimationFrame(() => {
        picker._gemPillSortableRafId = null;
        initGemSearchPillSortables(picker, modal);
      });
    }

    function clearGemSearchPillRemoveConfirmState(picker) {
      if (!picker) return;
      picker._gemPillRemovePendingIndex = null;
      picker.querySelectorAll('.gem-search-pill-remove--confirm').forEach((btn) => {
        btn.classList.remove('gem-search-pill-remove--confirm');
        btn.setAttribute('aria-label', 'Remove');
        btn.removeAttribute('title');
      });
    }

    function buildActiveMap(pills) {
      const map = {};
      (pills || []).forEach((p) => {
        if (!p.active) map[pillCompositeKey(p)] = 0;
      });
      return map;
    }

    function saveSearchPills(pills) {
      chrome.storage.sync.set({ [GEM_SEARCH_PILLS_KEY]: (pills || []).map(toMinifiedPill) });
      chrome.storage.local.set({ [GEM_SEARCH_PILL_ACTIVE_KEY]: buildActiveMap(pills) });
    }

    // One-time migration from old pill format to new consolidated format
    (function migrateSearchPills() {
      try {
        chrome.storage.sync.get({
          gemImagePropertiesSearchPillsFavorites: null,
          gemImagePropertiesSearchPillsSeen: null,
          gemImagePropertiesSearch: null,
          [GEM_SEARCH_PILLS_KEY]: null
        }, (result) => {
          if (result[GEM_SEARCH_PILLS_KEY] !== null) return;
          const oldFav = result.gemImagePropertiesSearchPillsFavorites;
          const oldSeen = result.gemImagePropertiesSearchPillsSeen;
          if (!oldFav && !oldSeen) return;

          const pills = [];
          const activeMap = {};
          const seen = new Set();

          (Array.isArray(oldFav) ? oldFav : []).forEach((p) => {
            if (!p || !p.term) return;
            const key = p.term.toLowerCase();
            const matchInSeen = (Array.isArray(oldSeen) ? oldSeen : []).find(
              (s) => s && s.term && s.term.toLowerCase() === key
            );
            const ctx = matchInSeen ? PILL_CTX_BOTH : PILL_CTX_FAV;
            const mp = { t: p.term, c: ctx };
            if (p.isRegex || (matchInSeen && matchInSeen.isRegex)) mp.r = 1;
            const label = p.label || (matchInSeen && matchInSeen.label) || '';
            if (label) mp.l = label;
            pills.push(mp);
            const active = p.active !== false && (!matchInSeen || matchInSeen.active !== false);
            if (!active) activeMap[`${p.term}:${ctx}`] = 0;
            seen.add(key);
          });

          (Array.isArray(oldSeen) ? oldSeen : []).forEach((p) => {
            if (!p || !p.term) return;
            if (seen.has(p.term.toLowerCase())) return;
            const mp = { t: p.term, c: PILL_CTX_SEEN };
            if (p.isRegex) mp.r = 1;
            if (p.label) mp.l = p.label;
            pills.push(mp);
            if (p.active === false) activeMap[`${p.term}:${PILL_CTX_SEEN}`] = 0;
          });

          chrome.storage.sync.set({ [GEM_SEARCH_PILLS_KEY]: pills });
          chrome.storage.local.set({ [GEM_SEARCH_PILL_ACTIVE_KEY]: activeMap });

          const oldSearch = result.gemImagePropertiesSearch;
          if (oldSearch && typeof oldSearch === 'object') {
            chrome.storage.local.set({
              [GEM_IMAGE_SEARCH_TEXT_KEY]: {
                favorites: oldSearch.favorites || '',
                seen: oldSearch.seen || ''
              }
            });
          }

          chrome.storage.sync.remove([
            'gemImagePropertiesSearchPillsFavorites',
            'gemImagePropertiesSearchPillsSeen',
            'gemImagePropertiesSearch'
          ]);
        });
      } catch (_) {}
    })();

    function normalizeRecentlySeenMax(value) {
      const n = (typeof value === 'number') ? value : parseInt(String(value ?? ''), 10);
      if (!Number.isFinite(n)) return 300;
      return Math.min(2000, Math.max(50, Math.trunc(n)));
    }

    function pruneRecentlySeenImagesToLimit(list, limit, nowMs) {
      const now = typeof nowMs === 'number' ? nowMs : Date.now();
      if (!Array.isArray(list) || list.length <= limit) return list;
      const next = [...list];
      function isProtectedEntry(x) {
        const lu = x && typeof x.lastUsed === 'number' ? x.lastUsed : null;
        return lu != null && (now - lu) <= LAST_USED_RETENTION_MS;
      }
      function removeOneSmallestTsUnprotected() {
        let bestIdx = -1;
        let bestTs = Infinity;
        for (let i = 0; i < next.length; i++) {
          const x = next[i];
          if (isProtectedEntry(x)) continue;
          const t = (x && typeof x.ts === 'number') ? x.ts : 0;
          if (t < bestTs) {
            bestTs = t;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          next.splice(bestIdx, 1);
          return true;
        }
        return false;
      }
      function removeOneSmallestTsAny() {
        let bestIdx = -1;
        let bestTs = Infinity;
        for (let i = 0; i < next.length; i++) {
          const x = next[i];
          const t = (x && typeof x.ts === 'number') ? x.ts : 0;
          if (t < bestTs) {
            bestTs = t;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          next.splice(bestIdx, 1);
          return true;
        }
        return false;
      }
      while (next.length > limit) {
        if (!removeOneSmallestTsUnprotected()) {
          if (!removeOneSmallestTsAny()) break;
        }
      }
      return next;
    }

    // Load the setting once; keep it updated via the storage change handler below.
    try {
      chrome.storage.sync.get({ [GEM_RECENTLY_SEEN_IMAGES_MAX_SETTING_KEY]: recentlySeenMax }, (res) => {
        recentlySeenMax = normalizeRecentlySeenMax(res && res[GEM_RECENTLY_SEEN_IMAGES_MAX_SETTING_KEY]);
      });
    } catch (_) {}

    function normalizeRecentImagesPickerFavSortBy(raw) {
      if (raw === 'language' || raw === 'translation') return raw;
      return 'category';
    }

    function normalizeRecentImagesPickerSeenSortBy(raw) {
      if (raw === 'path' || raw === 'lastUsed' || raw === 'filename') return raw;
      return 'lastSeen';
    }

    function normalizeRecentImagesPickerSortOrder(raw) {
      return raw === 'asc' ? 'asc' : 'desc';
    }

    function normalizeRecentImagesPickerSource(raw) {
      if (raw === 'mediaDb' || raw === 'favorites' || raw === 'seen') return raw;
      return 'seen';
    }

    function getRecentImagesPickerPrefs(callback) {
      try {
        chrome.storage.local.get(
          {
            [GEM_RECENT_IMAGES_PICKER_PREFS_KEY]: {
              view: 'grid',
              density: 'small',
              source: 'seen',
              listThumbs: false,
              gridCols: 6,
              favGroupBy: 'category',
              seenGroupBy: 'path',
              favSortBy: 'category',
              seenSortBy: 'lastSeen',
              favSortOrder: 'desc',
              seenSortOrder: 'desc'
            }
          },
          (result) => {
            const prefs = result && result[GEM_RECENT_IMAGES_PICKER_PREFS_KEY];
            const view = prefs && (prefs.view === 'grid' ? 'grid' : 'table');
            const density = prefs && (prefs.density === 'medium' || prefs.density === 'large' ? prefs.density : 'small');
            const source = normalizeRecentImagesPickerSource(prefs && prefs.source);
            const listThumbs = !!(prefs && prefs.listThumbs);
            const gridColsRaw = prefs && Number(prefs.gridCols);
            const gridCols =
              Number.isFinite(gridColsRaw) ? Math.min(10, Math.max(2, Math.round(gridColsRaw))) : 6;
          const favGroupBy =
            prefs && (prefs.favGroupBy === 'language' ? 'language' : (prefs.favGroupBy === 'translation' ? 'translation' : (prefs.favGroupBy === 'none' ? 'none' : 'category')));
          const sg = prefs && prefs.seenGroupBy;
          const seenGroupBy =
            sg === 'none' ? 'none' : (sg === 'date' ? 'date' : (sg === 'lastUsed' ? 'lastUsed' : 'path'));
            const favSortBy = normalizeRecentImagesPickerFavSortBy(prefs && prefs.favSortBy);
            const seenSortBy = normalizeRecentImagesPickerSeenSortBy(prefs && prefs.seenSortBy);
            const favSortOrder = normalizeRecentImagesPickerSortOrder(prefs && prefs.favSortOrder);
            const seenSortOrder = normalizeRecentImagesPickerSortOrder(prefs && prefs.seenSortOrder);
            callback({ view, density, source, listThumbs, gridCols, favGroupBy, seenGroupBy, favSortBy, seenSortBy, favSortOrder, seenSortOrder });
          }
        );
      } catch (e) {
        callback({
          view: 'grid', density: 'small', source: normalizeRecentImagesPickerSource('seen'), listThumbs: false, gridCols: 6,
          favGroupBy: 'category', seenGroupBy: 'path',
          favSortBy: 'category', seenSortBy: 'lastSeen', favSortOrder: 'desc', seenSortOrder: 'desc'
        });
      }
    }

    function saveRecentImagesPickerPrefs(prefs) {
      try {
        const view = prefs && (prefs.view === 'grid' ? 'grid' : 'table');
        const density = prefs && (prefs.density === 'medium' || prefs.density === 'large' ? prefs.density : 'small');
        const source = normalizeRecentImagesPickerSource(prefs && prefs.source);
        const listThumbs = !!(prefs && prefs.listThumbs);
        const gridColsRaw = prefs && Number(prefs.gridCols);
        const gridCols = Number.isFinite(gridColsRaw) ? Math.min(10, Math.max(2, Math.round(gridColsRaw))) : 6;
        const favGroupBy =
          prefs && (prefs.favGroupBy === 'language' ? 'language' : (prefs.favGroupBy === 'translation' ? 'translation' : (prefs.favGroupBy === 'none' ? 'none' : 'category')));
        const sg = prefs && prefs.seenGroupBy;
        const seenGroupBy =
          sg === 'none' ? 'none' : (sg === 'date' ? 'date' : (sg === 'lastUsed' ? 'lastUsed' : 'path'));
        const favSortBy = normalizeRecentImagesPickerFavSortBy(prefs && prefs.favSortBy);
        const seenSortBy = normalizeRecentImagesPickerSeenSortBy(prefs && prefs.seenSortBy);
        const favSortOrder = normalizeRecentImagesPickerSortOrder(prefs && prefs.favSortOrder);
        const seenSortOrder = normalizeRecentImagesPickerSortOrder(prefs && prefs.seenSortOrder);
        chrome.storage.local.set({
          [GEM_RECENT_IMAGES_PICKER_PREFS_KEY]: {
            view, density, source, listThumbs, gridCols, favGroupBy, seenGroupBy,
            favSortBy, seenSortBy, favSortOrder, seenSortOrder
          }
        });
      } catch (_) {}
    }

    function buildRecentImagesPickerPrefsPayload(picker, patch = {}) {
      const p = patch || {};
      return {
        view: p.view != null ? p.view : (picker.dataset.gemRecentImagesView || 'grid'),
        density: p.density != null ? p.density : (picker.dataset.gemRecentImagesGridDensity || 'small'),
        source: normalizeRecentImagesPickerSource(
          p.source != null ? p.source : (picker.dataset.gemRecentImagesSource || 'seen')
        ),
        listThumbs: p.listThumbs != null ? !!p.listThumbs : picker.dataset.gemRecentImagesListThumbs === '1',
        gridCols: p.gridCols != null ? p.gridCols : Number(picker.dataset.gemRecentImagesGridCols || 6),
        favGroupBy: p.favGroupBy != null ? p.favGroupBy : (picker.dataset.gemFavoriteImagesGroupBy || 'category'),
        seenGroupBy: p.seenGroupBy != null ? p.seenGroupBy : (picker.dataset.gemSeenImagesGroupBy || 'path'),
        favSortBy: p.favSortBy != null ? p.favSortBy : (picker.dataset.gemFavoriteImagesSortBy || 'category'),
        seenSortBy: p.seenSortBy != null ? p.seenSortBy : (picker.dataset.gemSeenImagesSortBy || 'lastSeen'),
        favSortOrder: p.favSortOrder != null ? p.favSortOrder : (picker.dataset.gemFavoriteImagesSortOrder || 'desc'),
        seenSortOrder: p.seenSortOrder != null ? p.seenSortOrder : (picker.dataset.gemSeenImagesSortOrder || 'desc')
      };
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

    function inferActiveImagePropertiesTab(modal) {
      if (!modal || !modal.querySelector) return 'desktop';
      try {
        // Prefer the mounted editor scope over tab-title classes (which can be transiently duplicated).
        const editor = modal.querySelector('vce-html-editor');
        if (editor && editor.closest) {
          const scope = editor.closest('.e-dialog__content') || editor;
          const hasMobileVisibilityControls = !!(scope.querySelector && scope.querySelector('#imageVisibilitySwitch_showImageOnMobile, #imageVisibilitySwitch_hideImageOnMobile, #imageVisibilitySwitch_useAlternateImage'));
          if (hasMobileVisibilityControls) return 'mobile';
          return 'desktop';
        }
      } catch (_) {}
      try {
        const activeTabEl = modal.querySelector('.e-tabs__title.e-tabs__title-active[data-tab="mobile"], .e-tabs__title.e-tabs__title-active[data-tab="desktop"]');
        return (activeTabEl && activeTabEl.getAttribute('data-tab') === 'mobile') ? 'mobile' : 'desktop';
      } catch (_) {}
      return 'desktop';
    }

    function collectSelectedImageUrlsForPicker(modal) {
      const urls = new Set();
      const addSingle = (raw) => {
        const normalized = normalizeRecentImageUrlCandidate(raw);
        if (normalized) {
          urls.clear();
          urls.add(normalized);
        }
      };
      if (!modal) return urls;
      const activeTab = inferActiveImagePropertiesTab(modal);

      try {
        const activeEditor = getActiveImageUrlCodeMirror(modal);
        const activeEditorUrl = activeEditor && activeEditor.value;
        if (activeEditorUrl) {
          addSingle(activeEditorUrl);
          return urls;
        }
      } catch (_) {}

      try {
        const container =
          modal.querySelector('.e-dialog.e-dialog-active .e-dialog__container') ||
          modal.querySelector('.e-dialog-active .e-dialog__container') ||
          modal.querySelector('.e-dialog__container');
        if (container) {
          if (activeTab === 'mobile') {
            addSingle(container._gemPreviewImgUrlMobile);
            const mobileImg = container._gemPreviewImgMobile;
            if (!urls.size && mobileImg) addSingle(mobileImg.getAttribute('src') || mobileImg.src || '');
          } else {
            addSingle(container._gemPreviewImgUrlDesktop);
            const desktopImg = container._gemPreviewImgDesktop;
            if (!urls.size && desktopImg) addSingle(desktopImg.getAttribute('src') || desktopImg.src || '');
          }
        }
      } catch (_) {}

      if (!urls.size) {
        if (activeTab === 'mobile') addSingle(modal._gemPendingLastUsedImageUrlMobile);
        else addSingle(modal._gemPendingLastUsedImageUrlDesktop);
      }

      return urls;
    }

    function applySelectedImageClassToMediaDbIframe(iframe, selectedUrls) {
      if (!iframe || !iframe.contentDocument) return;
      const doc = iframe.contentDocument;
      const selected = selectedUrls instanceof Set ? selectedUrls : new Set();
      const nodes = Array.from(doc.querySelectorAll('.file-thumbnail.card-wrapper, tr.file-table-row'));
      nodes.forEach((node) => {
        try {
          const clip = node.querySelector && node.querySelector('[copy-to-clipboard]');
          const rawUrl = clip && clip.getAttribute ? (clip.getAttribute('copy-to-clipboard') || '') : '';
          const normalized = normalizeRecentImageUrlCandidate(rawUrl);
          node.classList.toggle('gem-selected-image', !!(normalized && selected.has(normalized)));
        } catch (_) {}
      });
    }

    function refreshSelectedImageMatchesInPicker(modal) {
      if (!modal || !modal.querySelector) return;
      const selectedUrls = collectSelectedImageUrlsForPicker(modal);
      const picker = modal.querySelector('#gem-recent-images-picker');
      if (picker) {
        const isSelected = (rawUrl) => {
          const normalized = normalizeRecentImageUrlCandidate(rawUrl);
          return !!(normalized && selectedUrls.has(normalized));
        };
        Array.from(picker.querySelectorAll('.gem-img-picker-tile')).forEach((tile) => {
          try {
            const btn = tile.querySelector('.gem-recent-image-use-btn[data-url]');
            const rawUrl = btn && btn.getAttribute ? (btn.getAttribute('data-url') || '') : '';
            tile.classList.toggle('gem-selected-image', isSelected(rawUrl));
          } catch (_) {}
        });
        Array.from(picker.querySelectorAll('.gem-picker-list-table tbody tr')).forEach((row) => {
          try {
            const btn = row.querySelector('.gem-recent-image-use-btn[data-url]');
            const rawUrl = btn && btn.getAttribute ? (btn.getAttribute('data-url') || '') : '';
            row.classList.toggle('gem-selected-image', isSelected(rawUrl));
          } catch (_) {}
        });
      }
      applySelectedImageClassToMediaDbIframe(gemMediaDbPickerIframeEl, selectedUrls);
    }

    function looksLikeImageUrl(url) {
      const s = String(url || '');
      if (!s) return false;
      if (/^data:image\//i.test(s)) return true;
      // Common image extensions (allow query/hash)
      return /\.(png|jpe?g|gif|webp|svg|avif|bmp|tiff?)(\?|#|$)/i.test(s);
    }

    (function migrateRecentlyUsedIntoRecentlySeen() {
      try {
        chrome.storage.sync.get({ [GEM_RECENTLY_SEEN_IMAGES_MAX_SETTING_KEY]: 300 }, (syncRes) => {
          const max = normalizeRecentlySeenMax(syncRes && syncRes[GEM_RECENTLY_SEEN_IMAGES_MAX_SETTING_KEY]);
          chrome.storage.local.get(
            {
              [GEM_LEGACY_RECENT_IMAGES_STORAGE_KEY]: null,
              [GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]: []
            },
            (res) => {
              const legacy = res && res[GEM_LEGACY_RECENT_IMAGES_STORAGE_KEY];
              if (!legacy || !Array.isArray(legacy) || legacy.length === 0) return;
              const seenRaw = res && res[GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY];
              const seen = Array.isArray(seenRaw) ? seenRaw : [];
              const byUrl = new Map();
              seen.forEach((x) => {
                const url = normalizeRecentImageUrlCandidate(x && x.url);
                if (!url || !looksLikeImageUrl(url)) return;
                const ts = (x && typeof x.ts === 'number') ? x.ts : 0;
                const path = (x && typeof x.path === 'string') ? x.path : '';
                const friendlyFilename = (x && typeof x.friendlyFilename === 'string') ? x.friendlyFilename : '';
                const lastUsed = (x && typeof x.lastUsed === 'number') ? x.lastUsed : undefined;
                const row = { url, ts, path, friendlyFilename };
                if (lastUsed != null) row.lastUsed = lastUsed;
                byUrl.set(url, row);
              });
              legacy.forEach((old) => {
                const url = normalizeRecentImageUrlCandidate(old && old.url);
                if (!url || !looksLikeImageUrl(url)) return;
                const migratedTs = (old && typeof old.ts === 'number') ? old.ts : Date.now();
                const ff = (old && typeof old.friendlyFilename === 'string') ? old.friendlyFilename : '';
                const cur = byUrl.get(url);
                if (cur) {
                  const curLu = typeof cur.lastUsed === 'number' ? cur.lastUsed : 0;
                  const merged = {
                    ...cur,
                    lastUsed: Math.max(curLu, migratedTs)
                  };
                  byUrl.set(url, merged);
                } else {
                  byUrl.set(url, {
                    url,
                    ts: migratedTs,
                    lastUsed: migratedTs,
                    path: '',
                    friendlyFilename: ff
                  });
                }
              });
              let next = Array.from(byUrl.values());
              next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
              next = pruneRecentlySeenImagesToLimit(next, max, Date.now());
              chrome.storage.local.set({ [GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]: next }, () => {
                try {
                  chrome.storage.local.remove(GEM_LEGACY_RECENT_IMAGES_STORAGE_KEY);
                } catch (_) {}
              });
            }
          );
        });
      } catch (_) {}
    })();

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
              const lastUsed = (x && typeof x.lastUsed === 'number') ? x.lastUsed : undefined;
              if (!url || !looksLikeImageUrl(url)) return null;
              const row = { url, ts, path, friendlyFilename };
              if (lastUsed != null) row.lastUsed = lastUsed;
              return row;
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
          const prev = next[idx];
          const row = {
            url: u,
            ts: now,
            path: p || (prev && prev.path) || '',
            friendlyFilename: (prev && prev.friendlyFilename) || ''
          };
          if (typeof prev.lastUsed === 'number') row.lastUsed = prev.lastUsed;
          next[idx] = row;
        } else {
          next.push({ url: u, ts: now, path: p || '' });
        }
        next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const pruned = pruneRecentlySeenImagesToLimit(next, recentlySeenMax, now);
        saveRecentlySeenImages(pruned);
      });
    }

    // IMPORTANT: keep this scoped to explicit user actions that set an image URL
    // (insert/use/edit flows). Passive captures during picker open can trigger a
    // "seen" list rerender and swallow the first interaction in the picker UI.
    function recordImageLastUsed(url) {
      const u = normalizeRecentImageUrlCandidate(url);
      if (!u) {
        if (url) console.log('[Gem][RecentImages] Ignoring non-image/invalid URL candidate:', url);
        return;
      }
      if (!looksLikeImageUrl(u)) return;
      const now = Date.now();
      getRecentlySeenImages((list) => {
        const next = Array.isArray(list) ? [...list] : [];
        const idx = next.findIndex((x) => x && x.url === u);
        if (idx >= 0) {
          const prev = next[idx];
          next[idx] = {
            url: u,
            ts: prev.ts || now,
            path: prev.path || '',
            friendlyFilename: prev.friendlyFilename || '',
            lastUsed: now
          };
        } else {
          next.push({ url: u, ts: now, lastUsed: now, path: '', friendlyFilename: '' });
        }
        next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const pruned = pruneRecentlySeenImagesToLimit(next, recentlySeenMax, now);
        saveRecentlySeenImages(pruned);
      });
    }

    function recordImagesLastUsed(urls) {
      const listIn = Array.isArray(urls) ? urls : [];
      const normalizedUnique = [];
      const seen = new Set();
      listIn.forEach((raw) => {
        const u = normalizeRecentImageUrlCandidate(raw);
        if (!u || !looksLikeImageUrl(u)) return;
        if (seen.has(u)) return;
        seen.add(u);
        normalizedUnique.push(u);
      });
      if (!normalizedUnique.length) return;
      const now = Date.now();
      getRecentlySeenImages((list) => {
        const next = Array.isArray(list) ? [...list] : [];
        normalizedUnique.forEach((u) => {
          const idx = next.findIndex((x) => x && x.url === u);
          if (idx >= 0) {
            const prev = next[idx];
            next[idx] = {
              url: u,
              ts: prev.ts || now,
              path: prev.path || '',
              friendlyFilename: prev.friendlyFilename || '',
              lastUsed: now
            };
          } else {
            next.push({ url: u, ts: now, lastUsed: now, path: '', friendlyFilename: '' });
          }
        });
        next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const pruned = pruneRecentlySeenImagesToLimit(next, recentlySeenMax, now);
        saveRecentlySeenImages(pruned);
      });
    }

    function isLastUsedDebugEnabled() {
      try {
        if (window.gemIsDebugLoggingEnabled) return !!window.gemIsDebugLoggingEnabled();
        if (typeof window.GEM_DEBUG === 'boolean') return window.GEM_DEBUG;
      } catch (_) {}
      return false;
    }

    function logLastUsedDebug(message, details = null) {
      if (!isLastUsedDebugEnabled()) return;
      if (details != null) {
        console.log('[Gem][LastUsedDebug]', message, details);
      } else {
        console.log('[Gem][LastUsedDebug]', message);
      }
    }

    function insertImageUrlIntoImagePropertiesModal(modal, url) {
      const normalizedUrl = normalizeRecentImageUrlCandidate(url);
      const getCurrentImagePropsContainer = () => {
        const dialogActive = modal.querySelector('div.e-dialog.e-dialog-active') || modal.querySelector('.e-dialog.e-dialog-active');
        return dialogActive ? dialogActive.querySelector('div.e-dialog__container') : null;
      };
      const rememberInsertedImageUrl = () => {
        if (!normalizedUrl) return;
        const stateHost = modal;
        // Prefer inferring from the currently mounted/visible editor rather than active tab class,
        // because Emarsys can transiently keep multiple tab titles marked active.
        const editor = modal.querySelector('vce-html-editor');
        let activeTab = null;
        if (editor && editor.closest) {
          const scope = editor.closest('.e-dialog__content') || editor;
          const hasMobileVisibilityControls = !!(scope.querySelector && scope.querySelector('#imageVisibilitySwitch_showImageOnMobile, #imageVisibilitySwitch_hideImageOnMobile, #imageVisibilitySwitch_useAlternateImage'));
          activeTab = hasMobileVisibilityControls ? 'mobile' : 'desktop';
        }
        if (!activeTab) {
          const activeTabEl = modal.querySelector('.e-tabs__title.e-tabs__title-active[data-tab="mobile"], .e-tabs__title.e-tabs__title-active[data-tab="desktop"]');
          activeTab = (activeTabEl && activeTabEl.getAttribute('data-tab') === 'mobile') ? 'mobile' : 'desktop';
        }
        if (activeTab === 'mobile') {
          stateHost._gemPendingLastUsedImageUrlMobile = normalizedUrl;
        } else {
          stateHost._gemPendingLastUsedImageUrlDesktop = normalizedUrl;
        }
        logLastUsedDebug('rememberInsertedImageUrl', {
          activeTab,
          normalizedUrl,
          pendingDesktop: stateHost._gemPendingLastUsedImageUrlDesktop || '',
          pendingMobile: stateHost._gemPendingLastUsedImageUrlMobile || ''
        });
      };
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
        setActiveImageUrlCodeMirrorWithRetry(modal, url, 12, 90, () => {
          rememberInsertedImageUrl();
          applyMetaSideEffects();
        });
      } else {
        const ok = setActiveImageUrlCodeMirror(modal, url);
        if (!ok) {
          console.warn('[Gem][RecentImages] Failed to set image URL into active CodeMirror. Leaving picker open.');
          return;
        }
        rememberInsertedImageUrl();
        applyMetaSideEffects();
      }
    }

    function getGemMediaDbPickerIframeSrc() {
      let sessionId = '';
      try {
        sessionId = new URL(window.location.href).searchParams.get('session_id') || '';
      } catch (_) {
        sessionId = '';
      }
      if (!sessionId) return '';
      return `https://suite8.emarsys.net/bootstrap.php?r=MediaDB/popup&session_id=${encodeURIComponent(sessionId)}&insert_callback=true`;
    }

    function ensureGemMediaDbPickerPoolHost() {
      if (gemMediaDbPickerPoolHost && gemMediaDbPickerPoolHost.isConnected) return gemMediaDbPickerPoolHost;
      const host = document.createElement('div');
      host.id = 'gem-media-db-picker-pool-host';
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText =
        'position:fixed;left:-200vw;top:-200vh;width:1280px;height:900px;overflow:hidden;opacity:1;pointer-events:none;z-index:0;border:0;margin:0;padding:0;';
      document.body.appendChild(host);
      gemMediaDbPickerPoolHost = host;
      return host;
    }

    function ensureGemMediaDbPaneEl() {
      ensureGemMediaDbPickerPoolHost();
      let pane = document.getElementById('gem-media-db-pane');
      if (!pane) {
        pane = document.createElement('div');
        pane.id = 'gem-media-db-pane';
        pane.className = 'gem-scrollable';
        pane.style.height = '100%';
        pane.style.width = '100%';
        pane.style.display = 'none';
        pane.style.background = 'var(--token-box-alternate-background)';
        pane.style.boxSizing = 'border-box';
        gemMediaDbPickerPoolHost.appendChild(pane);
      }
      return pane;
    }

    function rehomeGemMediaDbPaneToPool() {
      try {
        const pane = document.getElementById('gem-media-db-pane');
        if (!pane) return;
        ensureGemMediaDbPickerPoolHost();
        gemMediaDbDbg('rehome pane -> pool', {
          from: pane.parentNode && pane.parentNode.id,
          to: gemMediaDbPickerPoolHost && gemMediaDbPickerPoolHost.id
        });
        pane.style.display = 'none';
        if (pane.parentNode !== gemMediaDbPickerPoolHost) {
          gemMediaDbPickerPoolHost.appendChild(pane);
        }
      } catch (_) {}
    }

    function rehomeGemMediaDbPickerIframeToPool() {
      try {
        if (!gemMediaDbPickerIframeEl) return;
        ensureGemMediaDbPickerPoolHost();
        if (gemMediaDbPickerIframeEl.parentNode !== gemMediaDbPickerPoolHost) {
          gemMediaDbPickerPoolHost.appendChild(gemMediaDbPickerIframeEl);
        }
      } catch (_) {}
    }

    function rehomeGemMediaDbPickerIframeFromPickerIfPresent(picker) {
      try {
        if (!picker) return;
        const found = picker.querySelector('.gem-media-db-iframe');
        if (found && found === gemMediaDbPickerIframeEl) {
          ensureGemMediaDbPickerPoolHost();
          gemMediaDbPickerPoolHost.appendChild(gemMediaDbPickerIframeEl);
        }
      } catch (_) {}
    }

    function unbindGemMediaDbPickerIframeDocClick() {
      const iframe = gemMediaDbPickerIframeEl;
      disconnectGemMediaDbIframeLayoutSync(iframe);
      if (!iframe || !iframe._gemMediaDbDocClickFn || !iframe._gemMediaDbClickDocRef) return;
      try {
        iframe._gemMediaDbClickDocRef.removeEventListener('click', iframe._gemMediaDbDocClickFn, true);
      } catch (_) {}
      iframe._gemMediaDbDocClickFn = null;
      iframe._gemMediaDbClickDocRef = null;
    }

    function teardownGemMediaDbIframeBridge(picker) {
      unbindGemMediaDbPickerIframeDocClick();
      if (picker) picker._gemMediaDbBridge = null;
    }

    function getGemMediaDbIframeViewModeFromDoc(doc) {
      if (!doc) return 'unknown';
      try {
        if (doc.querySelector('[data-e-tooltip="List view"]')) return 'grid';
        if (doc.querySelector('[data-e-tooltip="Thumbnails"]')) return 'list';
        // Emarsys UI variants (tooltip/title/aria) — keep grid/list sync best-effort.
        if (doc.querySelector('[data-e-tooltip*="List view" i], [title*="List view" i], [aria-label*="List view" i]')) return 'grid';
        if (doc.querySelector('[data-e-tooltip*="Thumbnails" i], [title*="Thumbnails" i], [aria-label*="Thumbnails" i]')) return 'list';
      } catch (_) {}
      return 'unknown';
    }

    /** Root node for the Media DB upload widget (Angular template uses `mediadb-upload` on a div). */
    function findMediaDbUploadRoot(doc) {
      if (!doc || !doc.querySelector) return null;
      return (
        doc.querySelector('.mediadb-upload')
        || doc.querySelector('div.mediadb-upload')
        || doc.querySelector('.e-layout__action.mediadb-upload')
      );
    }

    /**
     * Open the native file picker / Emarsys upload UI. Must run synchronously (or microtask) from the
     * user's click on our Upload button — async timers break the user-activation chain for <input type="file">.
     */
    function tryClickMediaDbUploadInIframe(iframe) {
      try {
        const iframeRef = iframe && iframe.isConnected ? iframe : gemMediaDbPickerIframeEl;
        const doc = iframeRef && iframeRef.contentDocument;
        const root = findMediaDbUploadRoot(doc);
        if (!root) return false;
        const fileInput = root.querySelector('input.mediadb-upload__input[type="file"], input[type="file"].mediadb-upload__input');
        if (fileInput) {
          fileInput.click();
          return true;
        }
        root.click();
        return true;
      } catch (_) {
        return false;
      }
    }

    /** Align Media DB iframe thumbnails vs list with `picker.dataset.gemRecentImagesView` (grid | table). */
    function applyGemRecentImagesViewToMediaDbIframe(iframe, recentPicker) {
      if (!iframe) return;
      const rp = recentPicker || (iframe.closest && iframe.closest('#gem-recent-images-picker'));
      if (!rp) return;
      const doc = iframe.contentDocument;
      if (!doc) return;
      const wantGrid = rp.dataset.gemRecentImagesView === 'grid';
      const mode = getGemMediaDbIframeViewModeFromDoc(doc);
      if (mode === 'unknown') return;
      const inner =
        wantGrid && mode === 'list'
          ? doc.querySelector('[data-e-tooltip="Thumbnails"]')
          : (!wantGrid && mode === 'grid' ? doc.querySelector('[data-e-tooltip="List view"]') : null);
      if (!inner) return;
      try {
        inner.click();
      } catch (_) {}
    }

    /**
     * After iframe load / Media DB tab shown, push persisted grid|table preference into the iframe.
     * Suppresses iframe→dataset sync briefly so a transient list layout does not overwrite prefs.
     */
    function scheduleApplyMediaDbViewFromPicker(iframe) {
      const rp = iframe && iframe.closest && iframe.closest('#gem-recent-images-picker');
      if (!iframe || !rp) return;
      if (normalizeRecentImagesPickerSource(rp.dataset.gemRecentImagesSource || 'seen') !== 'mediaDb') return;
      try {
        if (iframe._gemMediaDbApplyBootstrapT) clearTimeout(iframe._gemMediaDbApplyBootstrapT);
      } catch (_) {}
      iframe._gemMediaDbApplyingPickerViewToIframe = true;
      const run = () => applyGemRecentImagesViewToMediaDbIframe(iframe, rp);
      run();
      setTimeout(run, 60);
      setTimeout(run, 200);
      setTimeout(run, 500);
      iframe._gemMediaDbApplyBootstrapT = setTimeout(() => {
        iframe._gemMediaDbApplyingPickerViewToIframe = false;
        iframe._gemMediaDbApplyBootstrapT = null;
        run();
        scheduleGemMediaDbLayoutChromeRefresh(iframe);
      }, 620);
    }

    function disconnectGemMediaDbIframeLayoutSync(iframe) {
      if (!iframe) return;
      try {
        if (iframe._gemMediaDbApplyBootstrapT) {
          clearTimeout(iframe._gemMediaDbApplyBootstrapT);
          iframe._gemMediaDbApplyBootstrapT = null;
        }
      } catch (_) {}
      iframe._gemMediaDbApplyingPickerViewToIframe = false;
      try {
        if (iframe._gemMediaDbLayoutObserver) {
          iframe._gemMediaDbLayoutObserver.disconnect();
          iframe._gemMediaDbLayoutObserver = null;
        }
        if (iframe._gemMediaDbLayoutRaf) {
          cancelAnimationFrame(iframe._gemMediaDbLayoutRaf);
          iframe._gemMediaDbLayoutRaf = 0;
        }
      } catch (_) {}
    }

    function updateGemMediaDbPickerHeaderChrome(recentPicker, iframe) {
      if (!recentPicker || !iframe) return;
      const doc = iframe.contentDocument;
      const content = recentPicker.querySelector('#gem-image-picker-content');
      if (!content) return;
      const colsWrap = content.querySelector('.gem-img-picker-cols-control');
      const segmented = content.querySelector('.gem-image-picker-view-segmented');
      const gridOpt = content.querySelector('.gem-image-picker-view-option[data-view-target="grid"]');
      const listOpt = content.querySelector('.gem-image-picker-view-option[data-view-target="table"]');
      const hasViewControl = !!(segmented || gridOpt || listOpt);
      if (!colsWrap && !hasViewControl) return;
      const mode = getGemMediaDbIframeViewModeFromDoc(doc);
      const gridCols = Math.min(10, Math.max(2, Number(recentPicker.dataset.gemRecentImagesGridCols || 6)));
      if (colsWrap) {
        colsWrap.style.display = mode === 'grid' ? 'flex' : 'none';
      }
      if (segmented) segmented.classList.toggle('gem-image-picker-view-segmented--disabled', mode === 'unknown');
      if (gridOpt) {
        gridOpt.disabled = mode === 'unknown';
        gridOpt.classList.toggle('gem-image-picker-view-option--active', mode === 'grid');
      }
      if (listOpt) {
        listOpt.disabled = mode === 'unknown';
        listOpt.classList.toggle('gem-image-picker-view-option--active', mode === 'list');
      }
      const uploadBtn = content.querySelector('.gem-mediadb-upload-btn');
      if (uploadBtn) {
        // Do not tie Upload to grid/list detection; Emarsys can change tooltips and leave mode "unknown"
        // while the upload control is still present — that would leave the button disabled forever.
        const uploadRoot = findMediaDbUploadRoot(doc);
        const angularDisabled = uploadRoot && (
          uploadRoot.classList.contains('mediadb-upload--disabled')
          || uploadRoot.classList.contains('mediadb-upload--uploading')
        );
        uploadBtn.disabled = !uploadRoot || !!angularDisabled;
      }
      if (doc && doc.documentElement) {
        if (mode === 'grid') {
          doc.documentElement.style.setProperty('--gem-recent-grid-cols', String(gridCols));
        } else {
          doc.documentElement.style.removeProperty('--gem-recent-grid-cols');
        }
      }

      // User (or Emarsys UI) toggled view inside the iframe — keep picker + prefs in sync for all tabs.
      if (!iframe._gemMediaDbApplyingPickerViewToIframe) {
        const modeForPicker = getGemMediaDbIframeViewModeFromDoc(doc);
        if (modeForPicker === 'grid' || modeForPicker === 'list') {
          const viewFromIframe = modeForPicker === 'grid' ? 'grid' : 'table';
          const curView = recentPicker.dataset.gemRecentImagesView === 'grid' ? 'grid' : 'table';
          if (viewFromIframe !== curView) {
            recentPicker.dataset.gemRecentImagesView = viewFromIframe === 'grid' ? 'grid' : 'table';
            saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(recentPicker, { view: recentPicker.dataset.gemRecentImagesView }));
          }
        }
      }
      try {
        const modalRef = gemMediaDbIframeClickModalRef;
        const selectedUrls = collectSelectedImageUrlsForPicker(modalRef);
        applySelectedImageClassToMediaDbIframe(iframe, selectedUrls);
      } catch (_) {}
    }

    function waitForMediaDbUploadAndClick(iframe, opts) {
      const timeoutMs = (opts && opts.timeoutMs) || 15000;
      const intervalMs = (opts && opts.intervalMs) || 50;
      if (tryClickMediaDbUploadInIframe(iframe)) return Promise.resolve(true);
      return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          try {
            if (tryClickMediaDbUploadInIframe(iframe)) {
              resolve(true);
              return;
            }
          } catch (_) {}
          if (Date.now() - start >= timeoutMs) {
            resolve(false);
            return;
          }
          setTimeout(tick, intervalMs);
        };
        setTimeout(tick, intervalMs);
      });
    }

    function triggerGemMediaDbUploadFromPicker(picker, modal) {
      if (!picker || !modal) return;
      if (!getGemMediaDbPickerIframeSrc()) return;
      const cur = normalizeRecentImagesPickerSource(picker.dataset.gemRecentImagesSource || 'seen');
      const runWait = () => void waitForMediaDbUploadAndClick(gemMediaDbPickerIframeEl);
      if (cur !== 'mediaDb') {
        picker.dataset.gemRecentImagesSource = 'mediaDb';
        saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { source: 'mediaDb' }));
        showRecentImagesPicker(modal);
        // Stay on the user-activation chain: sync first, then one microtask (not rAF/delays first).
        if (tryClickMediaDbUploadInIframe(gemMediaDbPickerIframeEl)) return;
        queueMicrotask(() => {
          if (tryClickMediaDbUploadInIframe(gemMediaDbPickerIframeEl)) return;
          runWait();
        });
      } else {
        if (tryClickMediaDbUploadInIframe(gemMediaDbPickerIframeEl)) return;
        queueMicrotask(() => {
          if (tryClickMediaDbUploadInIframe(gemMediaDbPickerIframeEl)) return;
          runWait();
        });
      }
    }

    function notifyGemMediaDbIframeLayoutChange(iframe) {
      if (!iframe || !iframe.isConnected) return;
      const recentPicker = iframe.closest && iframe.closest('#gem-recent-images-picker');
      if (!recentPicker) return;
      if (normalizeRecentImagesPickerSource(recentPicker.dataset.gemRecentImagesSource || 'seen') !== 'mediaDb') return;
      updateGemMediaDbPickerHeaderChrome(recentPicker, iframe);
    }

    function scheduleGemMediaDbLayoutChromeRefresh(iframe) {
      if (!iframe) return;
      if (iframe._gemMediaDbLayoutRaf) return;
      iframe._gemMediaDbLayoutRaf = requestAnimationFrame(() => {
        iframe._gemMediaDbLayoutRaf = 0;
        notifyGemMediaDbIframeLayoutChange(iframe);
      });
    }

    function setupGemMediaDbIframeLayoutSync(iframe) {
      if (!iframe) return;
      disconnectGemMediaDbIframeLayoutSync(iframe);
      const doc = iframe.contentDocument;
      if (!doc) return;
      const root = doc.body || doc.documentElement;
      if (!root) return;
      try {
        const obs = new MutationObserver(() => scheduleGemMediaDbLayoutChromeRefresh(iframe));
        obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-e-tooltip', 'class'] });
        iframe._gemMediaDbLayoutObserver = obs;
      } catch (_) {}
      scheduleGemMediaDbLayoutChromeRefresh(iframe);
    }

    /** Copy Gemma / FLIPPER theme classes from the parent page <html> to the iframe document <html>. */
    function syncGemThemeClassesToMediaDbIframeDoc(doc) {
      if (!doc || !doc.documentElement) return;
      const parentHtml = document.documentElement;
      const target = doc.documentElement;
      if (!parentHtml || !target) return;
      const themeLike = (c) => c.startsWith('gem-theme-') || c.startsWith('FLIPPER-theme-');
      const toRemove = [];
      target.classList.forEach((c) => {
        if (themeLike(c)) toRemove.push(c);
      });
      toRemove.forEach((c) => target.classList.remove(c));
      parentHtml.classList.forEach((c) => {
        if (themeLike(c)) target.classList.add(c);
      });
    }

    /** theme.css + media-database.css when Media DB is embedded in our Image Picker iframe only. */
    function injectGemmaStylesIntoMediaDbIframeForImagePicker(doc) {
      if (!doc || !doc.head) return;
      try {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) return;
        const inject = (filename, linkId) => {
          if (doc.getElementById(linkId)) return;
          const link = doc.createElement('link');
          link.id = linkId;
          link.rel = 'stylesheet';
          link.setAttribute('data-gem-image-picker-inject', '1');
          link.href = chrome.runtime.getURL(filename);
          doc.head.appendChild(link);
        };
        inject('css--global-styles.css', 'gem-media-db-iframe-global');
        inject('css--theme.css', 'gem-media-db-iframe-theme');
        inject('css--media-database.css', 'gem-media-db-iframe-database');
      } catch (_) {}
    }

    function setupMediaDbPreviewDialogNavigation(doc) {
      if (!doc || doc._gemMediaDbPreviewNavSetup) return;
      doc._gemMediaDbPreviewNavSetup = true;

      const toUrlParts = (raw) => {
        let absHref = '';
        try {
          absHref = new URL(String(raw || ''), doc.location.href).href;
        } catch (_) {
          absHref = String(raw || '');
        }
        let noQuery = absHref;
        let pathname = '';
        let file = '';
        try {
          const u = new URL(absHref, doc.location.href);
          noQuery = `${u.origin}${u.pathname}`;
          pathname = u.pathname || '';
          file = pathname.split('/').filter(Boolean).pop() || '';
        } catch (_) {
          noQuery = String(absHref || '').split('?')[0];
          pathname = noQuery;
          file = pathname.split('/').filter(Boolean).pop() || '';
        }
        return { absHref, noQuery, pathname, file };
      };

      const getCycleUrls = () => {
        const scoped = Array.from(doc.querySelectorAll('.e-mediadb-section__content .e-table .file-table-row [copy-to-clipboard]'));
        const broad = Array.from(doc.querySelectorAll('[copy-to-clipboard]'));
        const nodes = scoped.length > 0 ? scoped : broad;
        const out = [];
        const seen = new Set();
        nodes.forEach((n) => {
          const v = n && n.getAttribute ? (n.getAttribute('copy-to-clipboard') || '') : '';
          if (!v) return;
          const p = toUrlParts(v);
          if (!p.absHref) return;
          const dedupeKey = p.noQuery || p.pathname || p.file || p.absHref;
          if (!dedupeKey || seen.has(dedupeKey)) return;
          seen.add(dedupeKey);
          out.push({
            href: p.absHref,
            key: p.noQuery,
            path: p.pathname,
            file: p.file
          });
        });
        return out;
      };

      const ensureDialogFooter = (dialog) => {
        if (!dialog) return;
        const content = dialog.querySelector('.ngdialog-content');
        const img = content && content.querySelector('img.preview-image');
        if (!content || !img) return;

        let footer = content.querySelector('.gem-mediadb-preview-footer');
        if (!footer) {
          footer = doc.createElement('div');
          footer.className = 'gem-mediadb-preview-footer';
          footer.innerHTML = `
            <div class="gem-image-nav-group">
              <button class="e-btn e-btn-borderless e-btn-onlyicon gem-image-nav-btn gem-mediadb-preview-prev" type="button" aria-label="Previous image" title="Previous image">‹</button>
              <button class="e-btn e-btn-borderless e-btn-onlyicon gem-image-nav-btn gem-mediadb-preview-next" type="button" aria-label="Next image" title="Next image">›</button>
            </div>
          `.trim();
          content.appendChild(footer);
        }

        const render = () => {
          const urls = getCycleUrls();
          const cur = toUrlParts(img.getAttribute('src') || img.src || '');
          let idx = urls.findIndex((u) => u.key === cur.noQuery);
          if (idx < 0) idx = urls.findIndex((u) => u.path && u.path === cur.pathname);
          if (idx < 0) idx = urls.findIndex((u) => u.file && cur.file && u.file === cur.file);
          const prevBtn = footer.querySelector('.gem-mediadb-preview-prev');
          const nextBtn = footer.querySelector('.gem-mediadb-preview-next');
          if (prevBtn) prevBtn.disabled = !(idx > 0);
          if (nextBtn) nextBtn.disabled = !(idx >= 0 && idx < urls.length - 1);
          footer._gemCycleUrls = urls;
          footer._gemCycleIndex = idx;
        };

        const navigate = (delta) => {
          const urls = footer._gemCycleUrls || getCycleUrls();
          const idx = Number.isFinite(footer._gemCycleIndex) ? footer._gemCycleIndex : -1;
          if (idx < 0) return;
          const nextIdx = idx + delta;
          if (nextIdx < 0 || nextIdx >= urls.length) return;
          const next = urls[nextIdx];
          if (!next || !next.href) return;
          img.setAttribute('src', next.href);
          render();
        };

        if (!footer._gemNavBound) {
          footer._gemNavBound = true;
          footer.querySelector('.gem-mediadb-preview-prev')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(-1);
          });
          footer.querySelector('.gem-mediadb-preview-next')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(1);
          });
        }

        if (!img._gemPreviewNavObserver) {
          const obs = new MutationObserver(() => render());
          obs.observe(img, { attributes: true, attributeFilter: ['src'] });
          img._gemPreviewNavObserver = obs;
        }

        render();
      };

      const applyToOpenDialogs = () => {
        const dialogs = Array.from(doc.querySelectorAll('#ngdialog3.mediadb-dialog, .ngdialog.mediadb-dialog'));
        dialogs.forEach((d) => ensureDialogFooter(d));
      };

      if (!doc._gemMediaDbPreviewKeydown) {
        const onKeydown = (e) => {
          const dialog = doc.querySelector('#ngdialog3.mediadb-dialog, .ngdialog.mediadb-dialog');
          if (!dialog) return;
          const footer = dialog.querySelector('.gem-mediadb-preview-footer');
          if (!footer) return;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            footer.querySelector('.gem-mediadb-preview-prev')?.click();
            return;
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            footer.querySelector('.gem-mediadb-preview-next')?.click();
          }
        };
        doc.addEventListener('keydown', onKeydown, true);
        doc._gemMediaDbPreviewKeydown = onKeydown;
      }

      if (!doc._gemMediaDbPreviewObserver) {
        const observer = new MutationObserver(() => applyToOpenDialogs());
        observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
        doc._gemMediaDbPreviewObserver = observer;
      }

      applyToOpenDialogs();
    }

    function wireGemMediaDbPickerIframeAfterDocReady(iframe) {
      if (!iframe) return;
      const doc = iframe.contentDocument;
      if (!doc) return;
      injectGemmaStylesIntoMediaDbIframeForImagePicker(doc);
      syncGemThemeClassesToMediaDbIframeDoc(doc);
      setupMediaDbPreviewDialogNavigation(doc);
      unbindGemMediaDbPickerIframeDocClick();
      const clickFn = (ev) => {
        const modal = gemMediaDbIframeClickModalRef;
        if (!modal || !modal.isConnected) return;
        const el = ev.target;
        if (!el || !el.closest) return;
        const trigger = el.closest("a[title='Add To Page']") || el.closest('button.test-insert-action');
        if (!trigger) return;
        const sourceItem = trigger.closest('.file-table-row, .file-thumbnail, .card-wrapper');
        if (!sourceItem) return;
        const clip = sourceItem.querySelector('[copy-to-clipboard]');
        const rawUrl = clip && clip.getAttribute && clip.getAttribute('copy-to-clipboard');
        if (!rawUrl || !String(rawUrl).trim()) return;
        ev.preventDefault();
        ev.stopPropagation();
        insertImageUrlIntoImagePropertiesModal(modal, rawUrl);
      };
      doc.addEventListener('click', clickFn, true);
      iframe._gemMediaDbDocClickFn = clickFn;
      iframe._gemMediaDbClickDocRef = doc;
      setupGemMediaDbIframeLayoutSync(iframe);
      scheduleApplyMediaDbViewFromPicker(iframe);
    }

    function ensureGemMediaDbParentThemeObserver() {
      if (gemMediaDbParentThemeObserver) return;
      try {
        gemMediaDbParentThemeObserver = new MutationObserver(() => {
          const iframe = gemMediaDbPickerIframeEl;
          const doc = iframe && iframe.contentDocument;
          if (!doc) return;
          syncGemThemeClassesToMediaDbIframeDoc(doc);
        });
        gemMediaDbParentThemeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class']
        });
      } catch (_) {}
    }

    function attachGemMediaDbPickerIframeLoadHook(iframe) {
      if (!iframe || iframe._gemMediaDbPickerLoadHooked) return;
      iframe._gemMediaDbPickerLoadHooked = true;
      iframe.addEventListener('load', () => {
        gemMediaDbDbg('iframe load', { src: iframe.getAttribute('src') || iframe.src || '' });
        wireGemMediaDbPickerIframeAfterDocReady(iframe);
      });
    }

    function ensureGemMediaDbPickerIframePreloaded() {
      const src = getGemMediaDbPickerIframeSrc();
      if (!src) return;

      ensureGemMediaDbPickerPoolHost();
      ensureGemMediaDbParentThemeObserver();

      if (!gemMediaDbPickerIframeEl) {
        const iframe = document.createElement('iframe');
        iframe.className = 'gem-media-db-iframe';
        iframe.title = 'Media Database';
        iframe.setAttribute('data-gem-media-db-pool', '1');
        iframe.loading = 'eager';
        gemMediaDbPickerPoolHost.appendChild(iframe);
        gemMediaDbPickerIframeEl = iframe;
        gemMediaDbPickerIframeSessionForSrc = src;
        attachGemMediaDbPickerIframeLoadHook(iframe);
        gemMediaDbDbg('set src (create)', src);
        iframe.src = src;
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
          wireGemMediaDbPickerIframeAfterDocReady(iframe);
        }
        return;
      }

      // Important: do not touch src after first creation. Reassigning src causes reloads.
      attachGemMediaDbPickerIframeLoadHook(gemMediaDbPickerIframeEl);
      gemMediaDbPickerIframeSessionForSrc = gemMediaDbPickerIframeSessionForSrc || src;
    }

    function scheduleGemMediaDbPickerIframePreload() {
      const run = () => {
        try {
          ensureGemMediaDbPickerIframePreloaded();
        } catch (_) {}
      };
      // Prime immediately so the first Image Picker open is already warm.
      run();
      try {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(run, { timeout: 8000 });
        } else {
          setTimeout(run, 200);
        }
      } catch (_) {
        setTimeout(run, 200);
      }
    }

    function setupGemMediaDbIframeBridge(picker, modal) {
      if (!picker || !modal) return;
      gemMediaDbIframeClickModalRef = modal;
      picker._gemImagePropsModalRef = modal;

      ensureGemMediaDbPickerIframePreloaded();
      const wrap = picker.querySelector('.gem-media-db-wrap');
      if (!gemMediaDbPickerIframeEl || !wrap) return;

      unbindGemMediaDbPickerIframeDocClick();
      gemMediaDbDbg('bridge setup start', {
        wrapParent: wrap.parentNode && wrap.parentNode.id,
        iframeParent: gemMediaDbPickerIframeEl.parentNode && gemMediaDbPickerIframeEl.parentNode.id,
        iframeSrcAttr: gemMediaDbPickerIframeEl.getAttribute('src') || '',
        iframeSrcProp: gemMediaDbPickerIframeEl.src || '',
        iframeReadyState: gemMediaDbPickerIframeEl.contentDocument && gemMediaDbPickerIframeEl.contentDocument.readyState,
        iframeHref: (() => {
          try { return gemMediaDbPickerIframeEl.contentWindow && gemMediaDbPickerIframeEl.contentWindow.location && gemMediaDbPickerIframeEl.contentWindow.location.href; } catch (_) { return '(unavailable)'; }
        })()
      });
      if (gemMediaDbPickerIframeEl.parentNode !== wrap) {
        gemMediaDbDbg('reparent into media tab', {
          from: gemMediaDbPickerIframeEl.parentNode && gemMediaDbPickerIframeEl.parentNode.id,
          to: wrap.id || '(no-id)'
        });
        wrap.appendChild(gemMediaDbPickerIframeEl);
      }

      const iframe = gemMediaDbPickerIframeEl;
      attachGemMediaDbPickerIframeLoadHook(iframe);
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        wireGemMediaDbPickerIframeAfterDocReady(iframe);
      } else {
        syncGemThemeClassesToMediaDbIframeDoc(iframe.contentDocument);
      }

      picker._gemMediaDbBridge = { iframe, pool: true };
      scheduleApplyMediaDbViewFromPicker(iframe);
    }

    // ------------------------------------------------------------
    // Favorite Images
    // ------------------------------------------------------------

    function getFavoriteImages(callback) {
      try {
        window.gemFavImages.read((consolidated) => {
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
        window.gemFavImages.read((existing) => {
          const existingMap = new Map();
          if (Array.isArray(existing)) {
            existing.forEach(item => {
              if (item && item.url) {
                existingMap.set(item.url, item);
              }
            });
          }

          const consolidated = list.map(({ url, ts }) => {
            const existingItem = existingMap.get(url);
            return {
              url,
              ts,
              meta: (existingItem && existingItem.meta) || {}
            };
          });

          window.gemFavImages.write(consolidated, () => {
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
        window.gemFavImages.read((consolidated) => {
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
        window.gemFavImages.read((existing) => {
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

          window.gemFavImages.write(updated, () => {
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
      getFavoriteImageMetaMap((map) => {
        const next = { ...(map || {}) };
        const existing = (next && next[u] && typeof next[u] === 'object') ? next[u] : {};
        const clean = {
          category: (meta && typeof meta.category === 'string') ? meta.category.trim() : '',
          language: (meta && typeof meta.language === 'string') ? meta.language.trim() : '',
          altText: (meta && typeof meta.altText === 'string') ? meta.altText.trim() : '',
          translation: (meta && typeof meta.translation === 'string') ? meta.translation.trim() : '',
          width: normalizeWidth(meta && meta.width),
          // Read-only metadata sourced from Recently Seen; never user-authored.
          friendlyFilename: (existing && typeof existing.friendlyFilename === 'string') ? existing.friendlyFilename.trim() : ''
        };
        next[u] = clean;
        saveFavoriteImageMetaMap(next, () => callback && callback(true));
      });
    }

    function syncFavoriteFilenameFromRecentlySeen(url, friendlyFilename, callback) {
      const u = normalizeRecentImageUrlCandidate(url);
      const ff = String(friendlyFilename || '').trim();
      if (!u || !ff) return callback && callback(false);
      getFavoriteImages((favList) => {
        const isFav = (Array.isArray(favList) ? favList : []).some((x) => x && x.url === u);
        if (!isFav) return callback && callback(false);
        getFavoriteImageMetaMap((map) => {
          const next = { ...(map || {}) };
          const existing = (next[u] && typeof next[u] === 'object') ? next[u] : {};
          const current = (typeof existing.friendlyFilename === 'string') ? existing.friendlyFilename.trim() : '';
          if (current === ff) return callback && callback(false);
          next[u] = { ...existing, friendlyFilename: ff };
          saveFavoriteImageMetaMap(next, () => callback && callback(true));
        });
      });
    }

    function syncFavoriteFilenamesFromRecentlySeenList(seenList, callback) {
      const rows = Array.isArray(seenList) ? seenList : [];
      const filenameByUrl = new Map();
      rows.forEach((row) => {
        const u = normalizeRecentImageUrlCandidate(row && row.url);
        const ff = String((row && row.friendlyFilename) || '').trim();
        if (!u || !ff) return;
        filenameByUrl.set(u, ff);
      });
      if (!filenameByUrl.size) return callback && callback(false);
      getFavoriteImages((favList) => {
        const favSet = new Set((Array.isArray(favList) ? favList : []).map((x) => x && x.url).filter(Boolean));
        if (!favSet.size) return callback && callback(false);
        getFavoriteImageMetaMap((map) => {
          const next = { ...(map || {}) };
          let changed = false;
          filenameByUrl.forEach((ff, u) => {
            if (!favSet.has(u)) return;
            const existing = (next[u] && typeof next[u] === 'object') ? next[u] : {};
            const current = String(existing.friendlyFilename || '').trim();
            if (current === ff) return;
            next[u] = { ...existing, friendlyFilename: ff };
            changed = true;
          });
          if (!changed) return callback && callback(false);
          saveFavoriteImageMetaMap(next, () => callback && callback(true));
        });
      });
    }

    function initializeFavoriteFilenameSyncFromRecentlySeen() {
      if (initializeFavoriteFilenameSyncFromRecentlySeen._initialized) return;
      initializeFavoriteFilenameSyncFromRecentlySeen._initialized = true;
      try {
        chrome.storage.onChanged.addListener((changes, namespace) => {
          if (namespace !== 'local' || !changes || !changes[GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY]) return;
          const nextVal = changes[GEM_RECENTLY_SEEN_IMAGES_STORAGE_KEY].newValue;
          syncFavoriteFilenamesFromRecentlySeenList(Array.isArray(nextVal) ? nextVal : []);
        });
      } catch (_) {}
      getRecentlySeenImages((list) => {
        syncFavoriteFilenamesFromRecentlySeenList(list);
      });
    }
    try { window.initializeFavoriteFilenameSyncFromRecentlySeen = initializeFavoriteFilenameSyncFromRecentlySeen; } catch (_) {}

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

    function normalizeImageAltSwapMode(mode) {
      return mode === 'plain' ? 'plain' : 'token';
    }

    function normalizeImageAltSwapMatchRule(v) {
      if (v === 'whole') return 'whole';
      return 'partial';
    }

    function normalizeImageAltSwapInitiateFrom(v) {
      if (v === 'panel' || v === 'toolbar') return v;
      return 'anywhere';
    }

    function normalizeImageAltSwapKeywordsFromSnippet(snippet) {
      if (!snippet) return [];

      if (Array.isArray(snippet.swapKeywords)) {
        const cleaned = snippet.swapKeywords
          .map((k) => ({
            keyword: (k && typeof k.keyword === 'string') ? k.keyword.trim() : '',
            mode: normalizeImageAltSwapMode(k && k.mode),
            matchRule: normalizeImageAltSwapMatchRule(k && k.matchRule),
            initiateFrom: normalizeImageAltSwapInitiateFrom(k && k.initiateFrom)
          }))
          .filter((k) => !!k.keyword);

        const seen = new Set();
        const unique = [];
        cleaned.forEach((k) => {
          if (seen.has(k.keyword)) return;
          seen.add(k.keyword);
          unique.push(k);
        });
        return unique;
      }

      const legacyKeyword = (snippet.swapKeyword && typeof snippet.swapKeyword === 'string') ? snippet.swapKeyword.trim() : '';
      if (!legacyKeyword) return [];
      return [{ keyword: legacyKeyword, mode: normalizeImageAltSwapMode(snippet.swapMode), matchRule: 'partial', initiateFrom: 'anywhere' }];
    }

    function createImageAltSwapKeywordRegex(keyword, matchRule) {
      const escaped = String(keyword || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!escaped) return null;
      return normalizeImageAltSwapMatchRule(matchRule) === 'whole'
        ? new RegExp(`\\b${escaped}\\b`, 'g')
        : new RegExp(escaped, 'g');
    }

    function loadSnippetsForImageAltSwap(callback) {
      if (typeof window.getSnippets === 'function') {
        window.getSnippets((snippets) => callback(Array.isArray(snippets) ? snippets : []));
        return;
      }
      if (typeof window.gemLoadSnippets === 'function') {
        window.gemLoadSnippets((snippets) => callback(Array.isArray(snippets) ? snippets : []));
        return;
      }
      chrome.storage.sync.get({ gemSnippets: [] }, (result) => {
        const snippets = result && Array.isArray(result.gemSnippets) ? result.gemSnippets : [];
        callback(snippets);
      });
    }

    function performImageAltTextKeywordSwap(modal, inputEl = null) {
      const input = inputEl || modal.querySelector('input.e-input[placeholder="Image alternative text"]');
      if (!input) {
        window.gemShowToast && window.gemShowToast('Unable to access image alternative text.', { type: 'error', duration: 3000 });
        return;
      }

      const originalText = String(input.value || '');
      if (!originalText.trim()) {
        window.gemShowToast && window.gemShowToast('Image alternative text is empty.', { type: 'info', duration: 3000 });
        return;
      }

      loadSnippetsForImageAltSwap((snippets) => {
        const swappableSnippets = (snippets || []).filter((snippet) =>
          normalizeImageAltSwapKeywordsFromSnippet(snippet).some((r) => r && r.keyword && r.initiateFrom !== 'toolbar' && r.initiateFrom !== 'panel')
        );

        if (!swappableSnippets.length) {
          window.gemShowToast && window.gemShowToast('No snippets with keyword swap rules found.', { type: 'info', duration: 3000 });
          return;
        }

        let modifiedText = originalText;
        let totalSwaps = 0;

        swappableSnippets.forEach((snippet) => {
          const rules = normalizeImageAltSwapKeywordsFromSnippet(snippet)
            .filter((r) => r && r.keyword && r.initiateFrom !== 'toolbar' && r.initiateFrom !== 'panel');

          rules.forEach((rule) => {
            const regex = createImageAltSwapKeywordRegex(rule.keyword, rule.matchRule);
            if (!regex) return;
            const matches = modifiedText.match(regex);
            if (!matches || !matches.length) return;
            totalSwaps += matches.length;
            modifiedText = modifiedText.replace(regex, (snippet && snippet.content) ? snippet.content : (snippet && snippet.name) ? snippet.name : '');
          });
        });

        if (!totalSwaps) {
          window.gemShowToast && window.gemShowToast('No matching keywords found to swap.', { type: 'info', duration: 3000 });
          return;
        }

        input.value = modifiedText;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('keydown', { bubbles: true }));
        input.dispatchEvent(new Event('keyup', { bubbles: true }));
        try {
          if (document.activeElement !== input) {
            input.focus();
            input.blur();
          }
        } catch (_) {}

        window.gemShowToast && window.gemShowToast(`Performed ${totalSwaps} keyword swap${totalSwaps === 1 ? '' : 's'} in image alternative text.`, { type: 'success', duration: 3500 });
      });
    }

    function ensureImageAltTextSwapButton(modal) {
      const input = modal.querySelector('input.e-input[placeholder="Image alternative text"]');
      if (!input) return;

      const row = input.closest('.e-grid.e-grid-xsmall') || input.closest('.e-grid');
      if (!row) return;
      if (row.querySelector('.gem-image-alt-swap-keywords-btn')) return;

      const actionCell = document.createElement('div');
      actionCell.className = 'e-cell e-cell-xsmall gem-image-alt-swap-cell';
      actionCell.style.display = 'flex';
      actionCell.style.alignItems = 'center';
      actionCell.style.justifyContent = 'flex-end';
      actionCell.style.paddingLeft = '8px';

      const swapButton = document.createElement('button');
      swapButton.className = 'e-btn e-btn-sm gem-image-alt-swap-keywords-btn';
      swapButton.type = 'button';
      swapButton.title = 'Swap Keywords';
      swapButton.setAttribute('aria-label', 'Swap Keywords');
      swapButton.style.minWidth = 'unset';
      swapButton.style.padding = '0 2px 0 10px';
      swapButton.innerHTML = `
        <gem-e-icon icon="style" color="inherit">
          <div aria-hidden="true" class="e-icon-wrapper">
            <div class="e-icon text-color-inherit">&#xF0DE;</div>
          </div>
        </gem-e-icon>
      `;
      swapButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        performImageAltTextKeywordSwap(modal, input);
      });

      actionCell.appendChild(swapButton);
      row.appendChild(actionCell);
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

      gemMediaDbIframeClickModalRef = modal;
      gemMediaDbDbg('show picker', { contentOnly: !!opts.contentOnly });

      let pickerPre = leftPanelContainer.querySelector('#gem-recent-images-picker');
      if (pickerPre) {
        destroyGemSearchPillSortables(pickerPre);
      }

      function sanitizeSearchAgainstActivePills(rawValue, pills) {
        const raw = String(rawValue || '').trim();
        if (!raw) return '';
        const activeTerms = new Set(
          (Array.isArray(pills) ? pills : [])
            .filter((p) => p && p.active)
            .map((p) => String((p && p.term) || '').trim().toLowerCase())
            .filter(Boolean)
        );
        if (activeTerms.size === 0) return raw;
        if (activeTerms.has(raw.toLowerCase())) return '';
        return raw;
      }

      const buildSharedImagePickerHeader = ({ sourceTabs, addFavoriteBtn = '', rightControls = '', searchBlock = '' }) => `
            <div class="gem-image-list-header" style="padding:0; background: var(--token-box-alternate-background); position:sticky; z-index:3; top:0">
            <div style="border-radius: 0 0 0 6px; border: 1px solid var(--token-box-default-border);border-top: 0; border-right: 0; display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:10px; background-color: var(--token-tab-default-background);">
              <div style="display:flex; gap:10px; align-items:center; width:100%;">
                <div class="e-tabs e-tabs-dialogheader">
                ${sourceTabs}
                ${addFavoriteBtn}
                <div class="gem-image-picker-controls">
                  ${rightControls}
                </div>
                </div>
              </div>
            </div>
            ${searchBlock}
            </div>
          `.trim();

      const buildSharedImagePickerControls = ({
        collapseExpandAllBtn = '',
        gridColsControl = '',
        listThumbsToggleControl = '',
        currentView = 'grid',
        viewToggleDisabled = false,
        uploadControl = '',
        addFavoriteControl = ''
      } = {}) => `
            <div class="gem-image-picker-shared-controls" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              ${collapseExpandAllBtn}
              ${gridColsControl}
              ${listThumbsToggleControl}
              <div class="gem-image-picker-view-segmented${viewToggleDisabled ? ' gem-image-picker-view-segmented--disabled' : ''}" role="group" aria-label="Image view mode">
                <button type="button" class="gem-image-picker-view-option ${currentView === 'grid' ? 'gem-image-picker-view-option--active' : ''}" data-view-target="grid"${viewToggleDisabled ? ' disabled' : ''}><span class="gem-image-picker-view-option__label">Grid</span></button>
                <button type="button" class="gem-image-picker-view-option ${currentView === 'table' ? 'gem-image-picker-view-option--active' : ''}" data-view-target="table"${viewToggleDisabled ? ' disabled' : ''}><span class="gem-image-picker-view-option__label">List</span></button>
              </div>
              ${uploadControl}
              ${addFavoriteControl}
            </div>
          `.trim();

      const buildGridColsControl = ({
        value = 6,
        hidden = false,
        extraInputClasses = ''
      } = {}) => {
        const v = Math.min(10, Math.max(2, Number(value || 6)));
        const extra = String(extraInputClasses || '').trim();
        const inputClasses = ['gem-fav-grid-cols-slider', extra].filter(Boolean).join(' ');
        return `
              <div class="gem-img-picker-cols-control"${hidden ? ' style="display:none;align-items:center;gap:8px;"' : ''}>
                <span aria-label="Columns" title="Columns"><e-icon icon="th-large"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon">&#xF17E;</div></div></e-icon></span>
                <input class="${inputClasses}" type="range" min="2" max="10" step="1" value="${escape(String(v))}">
              </div>
            `.trim();
      };

      const buildRowMenuTrigger = (url, source, isFav) => `
            <button
              type="button"
              class="gem-image-row-menu gem-image-row-menu-trigger"
              aria-label="More actions"
              title="More actions"
              aria-haspopup="menu"
              aria-expanded="false"
              data-url="${String(url || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}"
              data-source="${String(source || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}"
              data-is-fav="${isFav ? '1' : '0'}"
            ></button>
          `.trim();

      const ensureSharedRowMenuPopover = (pickerHost) => {
        let popover = document.getElementById('gem-image-row-menu-popover-single');
        if (popover) return popover;
        popover = document.createElement('div');
        popover.id = 'gem-image-row-menu-popover-single';
        popover.className = 'e-dropdown e-dropdown-popper e-popover gem-image-row-menu-popover gem-image-row-menu-popover--floating';
        popover.innerHTML = `
          <div class="e-dropdown__content e-dropdown__content-visible e-popover">
            <span class="e-dropdown__item gem-image-row-menu-item" data-action="add-to-page"><e-icon icon="plus" type="table"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon e-icon-table">&#xF155;</div></div></e-icon>Add To Page</span>
            <span class="e-dropdown__item gem-image-row-menu-item" data-action="preview"><e-icon icon="eye" type="table"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon e-icon-table">&#xF0DD;</div></div></e-icon>Preview</span>
            <span class="e-dropdown__item gem-image-row-menu-item" data-action="copy-url"><e-icon icon="files" type="table"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon e-icon-table">&#xF0F4;</div></div></e-icon>Copy URL</span>
            <span class="e-dropdown__item gem-image-row-menu-item gem-image-row-menu-item--favorite" data-action="favorite-toggle"><e-icon icon="star" type="table"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon e-icon-table">&#xF175;</div></div></e-icon><span class="gem-image-row-menu-favorite-label">Add to Favorites</span></span>
          </div>
          <div class="e-popover__arrow"></div>
        `.trim();
        (pickerHost || document.body).appendChild(popover);
        return popover;
      };

      const formatPickerSearchTermsHtml = (terms) => {
        const list = Array.isArray(terms) ? terms : [];
        if (!list.length) return '';
        const escapeHtml = (s) =>
          String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        const decodeTermForDisplay = (rawTerm) => {
          const raw = String(rawTerm || '');
          try {
            // Show human-readable regex/text terms when storage contains URL-encoded content.
            return decodeURIComponent(raw);
          } catch (_) {
            return raw;
          }
        };
        const tokens = list.map((o) => {
          const raw = escapeHtml(decodeTermForDisplay(o && o.term));
          const text = o && o.isRegex ? `/${raw}/` : raw;
          return `<strong>${text}</strong>`;
        });
        if (tokens.length === 1) return tokens[0];
        if (tokens.length === 2) return `${tokens[0]} and ${tokens[1]}`;
        return `${tokens.slice(0, -1).join(', ')}, and ${tokens[tokens.length - 1]}`;
      };

      // Create picker container once
      let picker = leftPanelContainer.querySelector('#gem-recent-images-picker');
      if (!picker) {
        picker = document.createElement('div');
        picker.id = 'gem-recent-images-picker';
        picker.className = 'gem-scrollable';
        picker.style.height = '100%';
        picker.style.width = '100%';
        picker.style.display = '';
        picker.style.background = 'var(--token-box-alternate-background)';
        picker.style.boxSizing = 'border-box';
        picker._gemSearchPills = [];
        leftPanelContainer.appendChild(picker);

        // Load persistent search values and pills, set up picker
        chrome.storage.sync.get({ [GEM_SEARCH_PILLS_KEY]: [] }, (syncResult) => {
          chrome.storage.local.get({
            [GEM_SEARCH_PILL_ACTIVE_KEY]: {},
            [GEM_IMAGE_SEARCH_TEXT_KEY]: {}
          }, (localResult) => {
          const activeMap = localResult[GEM_SEARCH_PILL_ACTIVE_KEY] || {};
          const allPills = hydratePills(syncResult[GEM_SEARCH_PILLS_KEY], activeMap);
          picker._gemSearchPills = allPills;

          const searches = localResult[GEM_IMAGE_SEARCH_TEXT_KEY] || {};
          const favPills = pillsForContext(allPills, PILL_CTX_FAV);
          const seenPills = pillsForContext(allPills, PILL_CTX_SEEN);

          const favoriteSearchRaw = searches.favorites || '';
          const seenSearchRaw = searches.seen || '';
          const nextFavoriteSearch = sanitizeSearchAgainstActivePills(favoriteSearchRaw, favPills);
          const nextSeenSearch = sanitizeSearchAgainstActivePills(seenSearchRaw, seenPills);
          picker.dataset.gemFavoriteImagesSearch = nextFavoriteSearch;
          picker.dataset.gemSeenImagesSearch = nextSeenSearch;

          if (nextFavoriteSearch !== String(favoriteSearchRaw || '').trim() || nextSeenSearch !== String(seenSearchRaw || '').trim()) {
            chrome.storage.local.set({
              [GEM_IMAGE_SEARCH_TEXT_KEY]: { favorites: nextFavoriteSearch, seen: nextSeenSearch }
            });
          }

          // Default source view
          if (!picker.dataset.gemRecentImagesSource) {
            picker.dataset.gemRecentImagesSource = 'seen';
          }
          if (!picker.dataset.gemFavoriteImagesGroupBy) {
            picker.dataset.gemFavoriteImagesGroupBy = 'category'; // category | language | translation
          }
          if (!picker.dataset.gemFavoriteImagesSortBy) {
            picker.dataset.gemFavoriteImagesSortBy = 'category';
          }
          if (!picker.dataset.gemSeenImagesSortBy) {
            picker.dataset.gemSeenImagesSortBy = 'lastSeen';
          }
          if (!picker.dataset.gemFavoriteImagesSortOrder) {
            picker.dataset.gemFavoriteImagesSortOrder = 'desc';
          }
          if (!picker.dataset.gemSeenImagesSortOrder) {
            picker.dataset.gemSeenImagesSortOrder = 'desc';
          }
          if (!picker.dataset.gemRecentImagesGridCols) {
            picker.dataset.gemRecentImagesGridCols = '6'; // 3-8
          }
          if (!picker.dataset.gemCollapseExpandAction) {
            picker.dataset.gemCollapseExpandAction = 'collapse'; // collapse | expand
          }

          }); // Close chrome.storage.local.get callback
        }); // Close chrome.storage.sync.get callback

          // Delegate clicks for selecting
          picker.addEventListener('click', (e) => {
            const getSharedRowMenu = () => document.getElementById('gem-image-row-menu-popover-single');
            const closeRowMenus = () => {
              picker.querySelectorAll('.gem-image-row-menu-trigger[aria-expanded="true"]').forEach((trigger) => {
                trigger.setAttribute('aria-expanded', 'false');
              });
              const popover = getSharedRowMenu();
              if (popover) {
                popover.classList.remove('gem-image-row-menu-popover--visible');
                const arrowClear = popover.querySelector('.e-popover__arrow');
                if (arrowClear) arrowClear.style.left = '';
              }
              picker._gemRowMenuContext = null;
            };
            const inRowMenu = e.target.closest && (e.target.closest('.gem-image-row-menu') || e.target.closest('#gem-image-row-menu-popover-single'));
            if (!inRowMenu) closeRowMenus();

            const rowMenuTrigger = e.target.closest && e.target.closest('.gem-image-row-menu-trigger');
            if (rowMenuTrigger) {
              e.preventDefault();
              e.stopPropagation();
              const wasOpen = rowMenuTrigger.getAttribute('aria-expanded') === 'true';
              closeRowMenus();
              if (!wasOpen) {
                rowMenuTrigger.setAttribute('aria-expanded', 'true');
                const popover = ensureSharedRowMenuPopover(picker);
                const source = rowMenuTrigger.getAttribute('data-source') || '';
                const url = rowMenuTrigger.getAttribute('data-url') || '';
                const isFav = rowMenuTrigger.getAttribute('data-is-fav') === '1';
                picker._gemRowMenuContext = { source, url, isFav };
                const favLabel = popover.querySelector('.gem-image-row-menu-favorite-label');
                if (favLabel) favLabel.textContent = isFav ? 'Unfavorite' : 'Add to Favorites';

                popover.classList.add('gem-image-row-menu-popover--visible');
                const rect = rowMenuTrigger.getBoundingClientRect();
                const popRect = popover.getBoundingClientRect();
                const margin = 8;
                const popoverXOffset = 20;
                const left = Math.max(
                  margin,
                  Math.min(window.innerWidth - popRect.width - margin, rect.right - popRect.width + popoverXOffset)
                );
                const top = Math.min(window.innerHeight - popRect.height - margin, rect.bottom + 6);
                popover.style.left = `${left}px`;
                popover.style.top = `${Math.max(margin, top)}px`;

                const arrowEl = popover.querySelector('.e-popover__arrow');
                if (arrowEl) {
                  const ARROW_SIZE = 10;
                  const inset = 8;
                  const triggerCenterX = rect.left + rect.width / 2;
                  const placeArrow = () => {
                    const popW = popover.offsetWidth || popover.getBoundingClientRect().width;
                    let arrowLeft = triggerCenterX - left - ARROW_SIZE / 2;
                    arrowLeft = Math.max(inset, Math.min(popW - ARROW_SIZE - inset, arrowLeft));
                    arrowEl.style.left = `${arrowLeft}px`;
                  };
                  requestAnimationFrame(placeArrow);
                }
              }
              return;
            }

            const rowMenuItem = e.target.closest && e.target.closest('#gem-image-row-menu-popover-single .gem-image-row-menu-item[data-action]');
            if (rowMenuItem) {
              e.preventDefault();
              e.stopPropagation();
              const action = rowMenuItem.getAttribute('data-action') || '';
              const ctx = picker._gemRowMenuContext || {};
              const source = ctx.source || '';
              const url = ctx.url || '';
              closeRowMenus();
              if (!url) return;

              if (action === 'add-to-page') {
                insertImageUrlIntoImagePropertiesModal(modal, url);
                return;
              }
              if (action === 'preview') {
                if (source === 'favorites') {
                  openFavoriteImageMetaModal(modal, url, { mode: 'edit' });
                } else {
                  openRecentlySeenImageDetailsModal(modal, url);
                }
                return;
              }
              if (action === 'copy-url') {
                const copyFallback = () => {
                  try {
                    const ta = document.createElement('textarea');
                    ta.value = url;
                    ta.setAttribute('readonly', '');
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    ta.remove();
                    if (window.gemShowToast) window.gemShowToast('Copied image URL.', { type: 'success', duration: 2200 });
                  } catch (_) {
                    if (window.gemShowToast) window.gemShowToast('Could not copy URL.', { type: 'error', duration: 2600 });
                  }
                };
                try {
                  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(() => {
                      if (window.gemShowToast) window.gemShowToast('Copied image URL.', { type: 'success', duration: 2200 });
                    }).catch(copyFallback);
                  } else {
                    copyFallback();
                  }
                } catch (_) {
                  copyFallback();
                }
                return;
              }
              if (action === 'favorite-toggle') {
                toggleFavoriteImageUrl(url, (isFavNow) => {
                  const nextFav = !!isFavNow;
                  // Update all overflow triggers for this URL without full table rebuild.
                  picker.querySelectorAll(`.gem-image-row-menu-trigger[data-url="${CSS.escape(url)}"]`).forEach((trigger) => {
                    trigger.setAttribute('data-is-fav', nextFav ? '1' : '0');
                  });
                  // Keep existing star button affordances in sync where present (grid tiles, details views).
                  picker.querySelectorAll(`.gem-recent-image-fav-btn[data-url="${CSS.escape(url)}"]`).forEach((btn) => {
                    btn.classList.toggle('gem-recent-image-fav-btn--active', nextFav);
                    const title = nextFav ? 'Unfavorite' : 'Favorite';
                    btn.setAttribute('title', title);
                    btn.setAttribute('aria-label', title);
                    btn.textContent = nextFav ? '★' : '☆';
                  });
                  const pop = getSharedRowMenu();
                  const favLabel = pop && pop.querySelector('.gem-image-row-menu-favorite-label');
                  if (favLabel && picker._gemRowMenuContext && picker._gemRowMenuContext.url === url) {
                    favLabel.textContent = nextFav ? 'Unfavorite' : 'Add to Favorites';
                  }

                  // In Favorites source, an unfavorite changes row membership; refresh that list.
                  if (source === 'favorites' && !nextFav) {
                    showRecentImagesPicker(modal);
                  }
                });
                return;
              }
            }

            const settingsBtn = e.target.closest && e.target.closest('.gem-search-settings-btn');
            if (settingsBtn) {
              e.preventDefault();
              e.stopPropagation();
              if (window.openGemmaSettings) window.openGemmaSettings('saved-searches');
              return;
            }
            const orderToggle = e.target.closest && e.target.closest('.gem-image-picker-order-toggle');
            if (orderToggle) {
              e.preventDefault();
              e.stopPropagation();
              const ctx = orderToggle.getAttribute('data-order-context') || '';
              const cur =
                ctx === 'favorites'
                  ? normalizeRecentImagesPickerSortOrder(picker.dataset.gemFavoriteImagesSortOrder)
                  : normalizeRecentImagesPickerSortOrder(picker.dataset.gemSeenImagesSortOrder);
              const next = cur === 'desc' ? 'asc' : 'desc';
              if (ctx === 'favorites') {
                picker.dataset.gemFavoriteImagesSortOrder = next;
                saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { favSortOrder: next }));
              } else if (ctx === 'seen') {
                picker.dataset.gemSeenImagesSortOrder = next;
                saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { seenSortOrder: next }));
              }
              showRecentImagesPicker(modal);
              return;
            }
            const regexToggle = e.target.closest && e.target.closest('.gem-regex-toggle');
            if (regexToggle) {
              e.preventDefault();
              e.stopPropagation();
              const regexSource = regexToggle.getAttribute('data-regex-source') || '';
              const dataKey = regexSource === 'favorites' ? 'gemFavRegex' : 'gemSeenRegex';
              const isActive = picker.dataset[dataKey] === '1';
              picker.dataset[dataKey] = isActive ? '0' : '1';
              regexToggle.classList.toggle('gem-regex-toggle--active', !isActive);
              regexToggle.setAttribute('aria-pressed', String(!isActive));
              showRecentImagesPicker(modal, { contentOnly: true });
              return;
            }
            const removeBtn = e.target.closest && e.target.closest('.gem-search-pill-remove');
            if (removeBtn) {
              e.preventDefault();
              e.stopPropagation();
              const pillEl = removeBtn.closest && removeBtn.closest('.gem-search-pill');
              if (!pillEl) return;
              const idx = parseInt(pillEl.getAttribute('data-index') || '-1', 10);
              const pills = picker._gemSearchPills || [];
              if (idx < 0 || idx >= pills.length) return;
              pills.splice(idx, 1);
              picker._gemSearchPills = pills;
              saveSearchPills(pills);
              showRecentImagesPicker(modal, { contentOnly: true });
              return;
            }
            const pillEl2 = e.target.closest && e.target.closest('.gem-search-pill');
            if (pillEl2 && !e.target.closest('.gem-search-pill-remove')) {
              e.preventDefault();
              e.stopPropagation();
              const idx2 = parseInt(pillEl2.getAttribute('data-index') || '-1', 10);
              const pills2 = picker._gemSearchPills || [];
              if (idx2 < 0 || idx2 >= pills2.length) return;

              const isCurrentlyInactive = !pills2[idx2].active;
              if (e.metaKey && isCurrentlyInactive) {
                // Cmd+click on an inactive pill: activate it exclusively, deactivate all others
                const pillsContainer = pillEl2.closest && pillEl2.closest('.gem-search-pills');
                const source = (pillsContainer && pillsContainer.getAttribute('data-pills-source')) || '';
                const ctx = source === 'favorites' ? PILL_CTX_FAV : PILL_CTX_SEEN;
                pills2.forEach((p, i) => {
                  if (!p || (p.context !== ctx && p.context !== undefined)) return;
                  pills2[i] = { ...p, active: i === idx2 };
                });
                picker._gemSearchPills = pills2;
                chrome.storage.local.set({ [GEM_SEARCH_PILL_ACTIVE_KEY]: buildActiveMap(pills2) });

                // Clear the search input for this context
                const isFav = source === 'favorites';
                const searchInputEl = picker.querySelector(isFav ? '.gem-favorite-images-search' : '.gem-seen-images-search');
                if (searchInputEl) searchInputEl.value = '';
                picker.dataset[isFav ? 'gemFavoriteImagesSearch' : 'gemSeenImagesSearch'] = '';
                chrome.storage.local.set({
                  [GEM_IMAGE_SEARCH_TEXT_KEY]: {
                    favorites: picker.dataset.gemFavoriteImagesSearch || '',
                    seen: picker.dataset.gemSeenImagesSearch || ''
                  }
                });
              } else {
                pills2[idx2].active = !pills2[idx2].active;
                picker._gemSearchPills = pills2;
                chrome.storage.local.set({ [GEM_SEARCH_PILL_ACTIVE_KEY]: buildActiveMap(pills2) });
              }

              showRecentImagesPicker(modal, { contentOnly: true });
              return;
            }
            const catToggleBtn = e.target.closest && e.target.closest('.gem-fav-cat-toggle');
            if (catToggleBtn) {
              e.preventDefault();
              e.stopPropagation();
              const groupKey = catToggleBtn.getAttribute('data-group-key') || '';
              // While search is active, toggle the in-memory override instead of
              // persisting to storage. This lets groups stay collapsed/expanded
              // for the duration of the search without affecting the persistent state.
              const favQRaw = String(picker.dataset.gemFavoriteImagesSearch || '').trim();
              const favSearchPills = pillsForContext(picker._gemSearchPills || [], PILL_CTX_FAV);
              const favSearchActive = favQRaw.length > 0 || favSearchPills.some(p => p.active && p.term);
              if (favSearchActive) {
                const cur = !!_gemFavSearchCollapseOverride[groupKey];
                if (cur) { delete _gemFavSearchCollapseOverride[groupKey]; }
                else { _gemFavSearchCollapseOverride[groupKey] = true; }
                showRecentImagesPicker(modal, { contentOnly: true });
                return;
              }
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

          const seenRemoveGroupBtn = e.target.closest && e.target.closest('.gem-seen-cat-remove-group');
          if (seenRemoveGroupBtn) {
            e.preventDefault();
            e.stopPropagation();
            const header = seenRemoveGroupBtn.closest && seenRemoveGroupBtn.closest('.gem-picker-cat-header');
            if (!header) return;
            const gKey = header.getAttribute('data-cat') || '';
            const seenGroupByAttr = header.getAttribute('data-seen-groupby') || 'path';
            getRecentlySeenImages((list) => {
              const raw = Array.isArray(list) ? list : [];
              const SEEN_LAST_USED_NONE = '__gem_last_used_none__';
              const filtered = raw.filter((item) => {
                if (seenGroupByAttr === 'date') {
                  return formatRecentImageDate(item.ts || 0).split(',')[0] !== gKey;
                }
                if (seenGroupByAttr === 'lastUsed') {
                  if (gKey === SEEN_LAST_USED_NONE) {
                    return typeof item.lastUsed === 'number' && item.lastUsed > 0;
                  }
                  return formatRecentImageDate(item.lastUsed || 0).split(',')[0] !== gKey;
                }
                return (item.path || '') !== gKey;
              });
              saveRecentlySeenImages(filtered, () => showRecentImagesPicker(modal));
            });
            return;
          }
          const seenCatToggleBtn = e.target.closest && e.target.closest('.gem-seen-cat-toggle');
          if (seenCatToggleBtn) {
            e.preventDefault();
            e.stopPropagation();
            const groupKey = seenCatToggleBtn.getAttribute('data-group-key') || '';
            // Same in-memory override pattern as favorites — during active search,
            // don't touch storage; just toggle the ephemeral override.
            const seenQRaw = String(picker.dataset.gemSeenImagesSearch || '').trim();
            const seenSearchPills = pillsForContext(picker._gemSearchPills || [], PILL_CTX_SEEN);
            const seenSearchActive = seenQRaw.length > 0 || seenSearchPills.some(p => p.active && p.term);
            if (seenSearchActive) {
              const cur = !!_gemSeenSearchCollapseOverride[groupKey];
              if (cur) { delete _gemSeenSearchCollapseOverride[groupKey]; }
              else { _gemSeenSearchCollapseOverride[groupKey] = true; }
              showRecentImagesPicker(modal, { contentOnly: true });
              return;
            }
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
            const v = normalizeRecentImagesPickerSource(tabValue === 'favorites' ? 'favorites' : (tabValue === 'mediaDb' ? 'mediaDb' : 'seen'));
            picker.dataset.gemRecentImagesSource = v;
            saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { source: v }));
            showRecentImagesPicker(modal);
            return;
          }

          const viewOptionBtn = e.target.closest && e.target.closest('.gem-image-picker-view-option[data-view-target]');
          if (viewOptionBtn && !viewOptionBtn.disabled) {
            e.preventDefault();
            e.stopPropagation();
            const nextView = viewOptionBtn.getAttribute('data-view-target') === 'table' ? 'table' : 'grid';
            const activeSource = normalizeRecentImagesPickerSource(picker.dataset.gemRecentImagesSource || 'seen');
            if (activeSource === 'mediaDb') {
              const iframeEl = gemMediaDbPickerIframeEl;
              const idoc = iframeEl && iframeEl.contentDocument;
              const mode = getGemMediaDbIframeViewModeFromDoc(idoc);
              const currentView = mode === 'grid' ? 'grid' : (mode === 'list' ? 'table' : '');
              if (!currentView || nextView === currentView) return;
              const inner =
                mode === 'list'
                  ? (idoc && idoc.querySelector('[data-e-tooltip="Thumbnails"]'))
                  : (mode === 'grid' ? (idoc && idoc.querySelector('[data-e-tooltip="List view"]')) : null);
              if (mode === 'list' || mode === 'grid') {
                if (iframeEl) iframeEl._gemMediaDbApplyingPickerViewToIframe = true;
                picker.dataset.gemRecentImagesView = nextView === 'grid' ? 'grid' : 'table';
                saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { view: picker.dataset.gemRecentImagesView }));
                if (inner) inner.click();
                if (iframeEl) {
                  setTimeout(() => {
                    iframeEl._gemMediaDbApplyingPickerViewToIframe = false;
                    scheduleGemMediaDbLayoutChromeRefresh(iframeEl);
                  }, 350);
                }
              }
            } else {
              const curView = picker.dataset.gemRecentImagesView === 'grid' ? 'grid' : 'table';
              if (nextView !== curView) {
                picker.dataset.gemRecentImagesView = nextView;
                saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { view: picker.dataset.gemRecentImagesView }));
                showRecentImagesPicker(modal);
              }
            }
            return;
          }

          const mdUploadBtn = e.target.closest && e.target.closest('.gem-mediadb-upload-btn');
          if (mdUploadBtn && !mdUploadBtn.disabled) {
            e.preventDefault();
            e.stopPropagation();
            triggerGemMediaDbUploadFromPicker(picker, modal);
            return;
          }
          const listThumbsBtn = e.target.closest && e.target.closest('.gem-list-thumbs-toggle-btn');
          if (listThumbsBtn) {
            e.preventDefault();
            e.stopPropagation();
            const isOn = picker.dataset.gemRecentImagesListThumbs === '1';
            picker.dataset.gemRecentImagesListThumbs = isOn ? '0' : '1';
            saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { listThumbs: picker.dataset.gemRecentImagesListThumbs === '1' }));
            showRecentImagesPicker(modal);
            return;
          }

          const collapseExpandAllBtn = e.target.closest && e.target.closest('.gem-collapse-expand-all-btn');
          if (collapseExpandAllBtn) {
            e.preventDefault();
            e.stopPropagation();
            const currentSource = picker.dataset.gemRecentImagesSource || 'seen';

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
              const favQRaw = String(picker.dataset.gemFavoriteImagesSearch || '').trim();
              const favSearchPills = pillsForContext(picker._gemSearchPills || [], PILL_CTX_FAV);
              const favSearchActive = favQRaw.length > 0 || favSearchPills.some(p => p.active && p.term);

              if (favSearchActive) {
                // During search: determine action from the in-memory override map,
                // then apply it there rather than touching persistent storage.
                const groupHeaders = picker.querySelectorAll('.gem-picker-cat-header');
                const overrideStates = Array.from(groupHeaders).map(h => {
                  const k = h.getAttribute('data-group-key') || '';
                  return k in _gemFavSearchCollapseOverride ? !!_gemFavSearchCollapseOverride[k] : false;
                });
                const allCollapsed = overrideStates.length > 0 && overrideStates.every(Boolean);
                const action = allCollapsed ? 'expand' : 'collapse';
                const shouldCollapse = action === 'collapse';
                groupHeaders.forEach(header => {
                  const groupKey = header.getAttribute('data-group-key') || '';
                  if (groupKey) {
                    if (shouldCollapse) { _gemFavSearchCollapseOverride[groupKey] = true; }
                    else { delete _gemFavSearchCollapseOverride[groupKey]; }
                  }
                });
                picker.dataset.gemCollapseExpandAction = action;
                showRecentImagesPicker(modal, { contentOnly: true });
              } else {
                getFavoriteCategoryCollapseMap((map) => {
                  const collapseMap = map || {};
                  const groupHeaders = picker.querySelectorAll('.gem-picker-cat-header');
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
              }
            } else if (currentSource === 'seen') {
              const seenQRaw = String(picker.dataset.gemSeenImagesSearch || '').trim();
              const seenSearchPills = pillsForContext(picker._gemSearchPills || [], PILL_CTX_SEEN);
              const seenSearchActive = seenQRaw.length > 0 || seenSearchPills.some(p => p.active && p.term);

              if (seenSearchActive) {
                const groupHeaders = picker.querySelectorAll('.gem-picker-cat-header');
                const overrideStates = Array.from(groupHeaders).map(h => {
                  const k = h.getAttribute('data-group-key') || '';
                  return k in _gemSeenSearchCollapseOverride ? !!_gemSeenSearchCollapseOverride[k] : false;
                });
                const allCollapsed = overrideStates.length > 0 && overrideStates.every(Boolean);
                const action = allCollapsed ? 'expand' : 'collapse';
                const shouldCollapse = action === 'collapse';
                groupHeaders.forEach(header => {
                  const groupKey = header.getAttribute('data-group-key') || '';
                  if (groupKey) {
                    if (shouldCollapse) { _gemSeenSearchCollapseOverride[groupKey] = true; }
                    else { delete _gemSeenSearchCollapseOverride[groupKey]; }
                  }
                });
                picker.dataset.gemCollapseExpandAction = action;
                showRecentImagesPicker(modal, { contentOnly: true });
              } else {
                getRecentlySeenImageGroupCollapseMap((map) => {
                  const collapseMap = map || {};
                  const groupHeaders = picker.querySelectorAll('.gem-picker-cat-header');
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
          insertImageUrlIntoImagePropertiesModal(modal, url);
        });

        // Enter/Tab on search input: add terms as pills
        picker.addEventListener('keydown', (e) => {
          const favSearchInput = e.target && e.target.closest && e.target.closest('.gem-favorite-images-search');
          const seenSearchInput = e.target && e.target.closest && e.target.closest('.gem-seen-images-search');
          const searchInput = favSearchInput || seenSearchInput;
          if (!searchInput) return;
          if (e.key !== 'Enter' && e.key !== 'Tab') return;
          const raw = (searchInput.value || '').trim();
          if (!raw) return;
          e.preventDefault();
          const tokens = [raw];
          if (tokens.length === 0) return;
          const isFav = !!favSearchInput;
          const regexOn = picker.dataset[isFav ? 'gemFavRegex' : 'gemSeenRegex'] === '1';
          const ctx = isFav ? PILL_CTX_FAV : PILL_CTX_SEEN;
          const pills = picker._gemSearchPills || [];
          const contextPills = pillsForContext(pills, ctx);
          const existingTerms = new Set(contextPills.map((p) => (p.term || '').toLowerCase()));
          let changed = false;
          for (const t of tokens) {
            const term = String(t).trim();
            if (!term) continue;
            const normalizedTerm = term.toLowerCase();
            if (existingTerms.has(normalizedTerm)) {
              // Enter on an existing saved term should reactivate that pill
              // (instead of silently clearing input and doing nothing).
              contextPills.forEach((p) => {
                if (!p) return;
                const pTerm = String((p && p.term) || '').trim().toLowerCase();
                if (pTerm !== normalizedTerm) return;
                const idx = Number(p._idx);
                if (!Number.isInteger(idx) || idx < 0 || idx >= pills.length) return;
                if (pills[idx] && !pills[idx].active) {
                  pills[idx].active = true;
                  changed = true;
                }
              });
              continue;
            }
            existingTerms.add(term.toLowerCase());
            pills.push({ term, active: true, isRegex: regexOn, label: '', context: ctx });
            changed = true;
          }
          searchInput.value = '';
          picker.dataset[isFav ? 'gemFavoriteImagesSearch' : 'gemSeenImagesSearch'] = '';
          chrome.storage.local.set({ [GEM_IMAGE_SEARCH_TEXT_KEY]: { favorites: picker.dataset.gemFavoriteImagesSearch || '', seen: picker.dataset.gemSeenImagesSearch || '' } });
          if (changed) {
            picker._gemSearchPills = pills;
            saveSearchPills(pills);
          }
          showRecentImagesPicker(modal, { contentOnly: true });
        }, true);

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

            chrome.storage.local.set({
              [GEM_IMAGE_SEARCH_TEXT_KEY]: {
                favorites: picker.dataset.gemFavoriteImagesSearch || '',
                seen: picker.dataset.gemSeenImagesSearch || ''
              }
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
            const v = Math.min(10, Math.max(2, Number(slider.value || 6)));
            picker.dataset.gemRecentImagesGridCols = String(v);
            picker.style.setProperty('--gem-recent-grid-cols', String(v));
            if (normalizeRecentImagesPickerSource(picker.dataset.gemRecentImagesSource || 'seen') === 'mediaDb') {
              const iframeEl = gemMediaDbPickerIframeEl;
              const idoc = iframeEl && iframeEl.contentDocument;
              if (idoc && idoc.documentElement && getGemMediaDbIframeViewModeFromDoc(idoc) === 'grid') {
                idoc.documentElement.style.setProperty('--gem-recent-grid-cols', String(v));
              }
            }
          }
        }, true);

        picker.addEventListener('change', (e) => {
          const groupSel = e.target && e.target.closest && e.target.closest('.gem-fav-groupby-select');
          if (groupSel) {
            const v = groupSel.value === 'language' ? 'language' : (groupSel.value === 'translation' ? 'translation' : (groupSel.value === 'none' ? 'none' : 'category'));
            picker.dataset.gemFavoriteImagesGroupBy = v;
            saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { favGroupBy: v }));
            showRecentImagesPicker(modal);
            return;
          }

          const seenGroupSel = e.target && e.target.closest && e.target.closest('.gem-seen-groupby-select');
          if (seenGroupSel) {
            const v =
              seenGroupSel.value === 'date' ? 'date' :
              (seenGroupSel.value === 'lastUsed' ? 'lastUsed' :
              (seenGroupSel.value === 'none' ? 'none' : 'path'));
            picker.dataset.gemSeenImagesGroupBy = v;
            saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { seenGroupBy: v }));
            showRecentImagesPicker(modal);
            return;
          }

          const favSortSel = e.target && e.target.closest && e.target.closest('.gem-fav-sortby-select');
          if (favSortSel) {
            picker.dataset.gemFavoriteImagesSortBy = normalizeRecentImagesPickerFavSortBy(favSortSel.value);
            saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { favSortBy: picker.dataset.gemFavoriteImagesSortBy }));
            showRecentImagesPicker(modal);
            return;
          }

          const seenSortSel = e.target && e.target.closest && e.target.closest('.gem-seen-sortby-select');
          if (seenSortSel) {
            picker.dataset.gemSeenImagesSortBy = normalizeRecentImagesPickerSeenSortBy(seenSortSel.value);
            saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { seenSortBy: picker.dataset.gemSeenImagesSortBy }));
            showRecentImagesPicker(modal);
            return;
          }

          const slider = e.target && e.target.closest && e.target.closest('.gem-fav-grid-cols-slider');
          if (slider) {
            const v = Math.min(10, Math.max(2, Number(slider.value || 6)));
            picker.dataset.gemRecentImagesGridCols = String(v);
            picker.style.setProperty('--gem-recent-grid-cols', String(v));
            if (normalizeRecentImagesPickerSource(picker.dataset.gemRecentImagesSource || 'seen') === 'mediaDb') {
              const iframeEl = gemMediaDbPickerIframeEl;
              const idoc = iframeEl && iframeEl.contentDocument;
              if (idoc && idoc.documentElement && getGemMediaDbIframeViewModeFromDoc(idoc) === 'grid') {
                idoc.documentElement.style.setProperty('--gem-recent-grid-cols', String(v));
              }
            }
            saveRecentImagesPickerPrefs(buildRecentImagesPickerPrefsPayload(picker, { gridCols: v }));
          }
        }, true);

        // Shared view toggle is handled in the main delegated click handler above.
      }

      if (picker) picker._gemImagePropsModalRef = modal;

      let pickerContent = picker.querySelector('#gem-image-picker-content');
      if (!pickerContent) {
        pickerContent = document.createElement('div');
        pickerContent.id = 'gem-image-picker-content';
        picker.appendChild(pickerContent);
      }

      // Load persisted prefs once per picker lifetime
      if (picker.dataset.gemRecentImagesPrefsLoaded !== 'true') {
        picker.dataset.gemRecentImagesPrefsLoaded = 'true';
        getRecentImagesPickerPrefs((prefs) => {
          chrome.storage.local.get({ [GEM_IMAGE_PICKER_MEDIA_DB_INTRO_KEY]: false }, (introRes) => {
            const introShown = !!(introRes && introRes[GEM_IMAGE_PICKER_MEDIA_DB_INTRO_KEY]);
            let applied = prefs;
            if (!introShown) {
              applied = { ...prefs, source: 'mediaDb' };
              saveRecentImagesPickerPrefs(applied);
              try {
                chrome.storage.local.set({ [GEM_IMAGE_PICKER_MEDIA_DB_INTRO_KEY]: true });
              } catch (_) {}
            }
            picker.dataset.gemRecentImagesView = applied.view;
            picker.dataset.gemRecentImagesGridDensity = applied.density;
            picker.dataset.gemRecentImagesSource = normalizeRecentImagesPickerSource(applied.source);
            picker.dataset.gemRecentImagesListThumbs = applied.listThumbs ? '1' : '0';
            picker.dataset.gemRecentImagesGridCols = String(applied.gridCols || 6);
            picker.dataset.gemFavoriteImagesGroupBy = applied.favGroupBy || 'category';
            picker.dataset.gemSeenImagesGroupBy = applied.seenGroupBy || 'path';
            picker.dataset.gemFavoriteImagesSortBy = applied.favSortBy || 'category';
            picker.dataset.gemSeenImagesSortBy = applied.seenSortBy || 'lastSeen';
            picker.dataset.gemFavoriteImagesSortOrder = applied.favSortOrder || 'desc';
            picker.dataset.gemSeenImagesSortOrder = applied.seenSortOrder || 'desc';
            picker.style.setProperty('--gem-recent-grid-cols', String(applied.gridCols || 6));
            showRecentImagesPicker(modal);
          });
        });
        return;
      }

      // Render

      const source = normalizeRecentImagesPickerSource(picker.dataset.gemRecentImagesSource || 'seen');
      gemMediaDbDbg('render source', { source });

      if (source === 'mediaDb') {
        destroyGemSearchPillSortables(picker);
        picker.style.display = '';
        const iframeSrc = getGemMediaDbPickerIframeSrc();

        const sourceTabs = `
              <div class="e-tabs__title ${source === 'mediaDb' ? 'e-tabs__title-active' : ''}" data-tab="mediaDb">
                <div class="e-tabs__separator">Media Database</div>
              </div>
              <div class="e-tabs__title ${source === 'seen' ? 'e-tabs__title-active' : ''}" data-tab="seen">
                <div class="e-tabs__separator">Recent Images</div>
              </div>
              <div class="e-tabs__title ${source === 'favorites' ? 'e-tabs__title-active' : ''}" data-tab="favorites">
                <div class="e-tabs__separator">Favorite Images</div>
              </div>
          `.trim();
        const gridColsMedia = Math.min(10, Math.max(2, Number(picker.dataset.gemRecentImagesGridCols || 6)));
        picker.style.setProperty('--gem-recent-grid-cols', String(gridColsMedia));
        const mediaDbGridColsControl = buildGridColsControl({
          value: gridColsMedia,
          hidden: true,
          extraInputClasses: 'gem-mediadb-grid-cols-slider'
        });
        const mediaDbUploadControl = iframeSrc
          ? `<button type="button" class="e-btn e-btn-primary gem-mediadb-upload-btn" disabled><e-icon icon="cloud-upload"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon">&#xF0AC;</div></div></e-icon>Upload</button>`
          : '';
        const mediaDbRightControls = buildSharedImagePickerControls({
          gridColsControl: mediaDbGridColsControl,
          currentView: picker.dataset.gemRecentImagesView === 'grid' ? 'grid' : 'table',
          viewToggleDisabled: true,
          uploadControl: mediaDbUploadControl
        });
        const header = buildSharedImagePickerHeader({ sourceTabs, rightControls: mediaDbRightControls });
        pickerContent.innerHTML = header;

        let mediaPane = ensureGemMediaDbPaneEl();
        if (mediaPane.parentNode !== picker) {
          picker.appendChild(mediaPane);
        }
        mediaPane.style.display = '';

        const hasWrap = !!mediaPane.querySelector('.gem-media-db-wrap');
        const hasMissing = !!mediaPane.querySelector('.gem-media-db-missing-session');
        if (iframeSrc) {
          if (!hasWrap) {
            mediaPane.innerHTML = `
              <div class="gem-media-db-wrap">
                <div class="gem-media-db-loading-spinner" aria-hidden="true"></div>
              </div>
            `.trim();
          }
          ensureGemMediaDbPickerIframePreloaded();
          setupGemMediaDbIframeBridge(mediaPane, modal);
          try {
            applySelectedImageClassToMediaDbIframe(gemMediaDbPickerIframeEl, collectSelectedImageUrlsForPicker(modal));
          } catch (_) {}
        } else if (!hasMissing) {
          mediaPane.innerHTML = `<div class="gem-media-db-missing-session" style="padding:16px; opacity:0.85;">Media Database requires a <code>session_id</code> in the page URL. Open the editor from Emarsys with a valid session and try again.</div>`;
        }
        return;
      }

      picker.style.display = '';
      const existingMediaPane = picker.querySelector('#gem-media-db-pane');
      if (existingMediaPane) {
        existingMediaPane.style.display = 'none';
        if (existingMediaPane.parentNode !== picker) {
          picker.appendChild(existingMediaPane);
        }
      }

      const getList = (cb) => {
        if (source === 'favorites') return getFavoriteImages(cb);
        return getRecentlySeenImages(cb);
      };

      // We always need favorites to render star state in the Recent list.
      getFavoriteImages((favList) => {
        const favSet = new Set((Array.isArray(favList) ? favList : []).map((x) => x && x.url).filter(Boolean));

        getFavoriteImageMetaMap((metaMap) => {
          const meta = (metaMap && typeof metaMap === 'object') ? metaMap : {};


          getList((list) => {
          const render = (listForRender) => {
          const rows = (Array.isArray(listForRender) ? [...listForRender] : [])
            .filter((x) => x && typeof x.url === 'string' && x.url.trim());
          const selectedImageUrls = collectSelectedImageUrlsForPicker(modal);
          const isSelectedImageUrl = (rawUrl) => {
            const normalized = normalizeRecentImageUrlCandidate(rawUrl);
            return !!(normalized && selectedImageUrls.has(normalized));
          };

          const escape = (s) =>
            String(s)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');

          const viewMode = picker.dataset.gemRecentImagesView === 'grid' ? 'grid' : 'table';
          const listThumbsOn = picker.dataset.gemRecentImagesListThumbs === '1';
          const gridCols = Math.min(10, Math.max(2, Number(picker.dataset.gemRecentImagesGridCols || 6)));
          picker.style.setProperty('--gem-recent-grid-cols', String(gridCols));

          const title =
            source === 'favorites' ? 'Favorite Images' :
            'Recent Images';
          const addFavoriteBtn = '';

          const sourceTabs = `
              <div class="e-tabs__title ${source === 'mediaDb' ? 'e-tabs__title-active' : ''}" data-tab="mediaDb">
                <div class="e-tabs__separator">Media Database</div>
              </div>
              <div class="e-tabs__title ${source === 'seen' ? 'e-tabs__title-active' : ''}" data-tab="seen">
                <div class="e-tabs__separator">Recent Images</div>
              </div>
              <div class="e-tabs__title ${source === 'favorites' ? 'e-tabs__title-active' : ''}" data-tab="favorites">
                <div class="e-tabs__separator">Favorite Images</div>
              </div>
          `.trim();

          const groupBy =
            (picker.dataset.gemFavoriteImagesGroupBy === 'language') ? 'language' :
            (picker.dataset.gemFavoriteImagesGroupBy === 'translation') ? 'translation' :
            (picker.dataset.gemFavoriteImagesGroupBy === 'none') ? 'none' :
            'category';
          const sgRaw = picker.dataset.gemSeenImagesGroupBy;
          const seenGroupBy =
            sgRaw === 'none' ? 'none' :
            sgRaw === 'date' ? 'date' : (sgRaw === 'lastUsed' ? 'lastUsed' : 'path');
          const favSortByRaw = picker.dataset.gemFavoriteImagesSortBy;
          const favSortBy = normalizeRecentImagesPickerFavSortBy(favSortByRaw);
          const seenSortByRaw = picker.dataset.gemSeenImagesSortBy;
          const seenSortBy = normalizeRecentImagesPickerSeenSortBy(seenSortByRaw);
          const favSortOrder = normalizeRecentImagesPickerSortOrder(picker.dataset.gemFavoriteImagesSortOrder);
          const seenSortOrder = normalizeRecentImagesPickerSortOrder(picker.dataset.gemSeenImagesSortOrder);
          const favSortDesc = favSortOrder === 'desc';
          const seenSortDesc = seenSortOrder === 'desc';

          const cmpFieldEmptyLastStr = (aRaw, bRaw, desc) => {
            const a = String(aRaw || '').trim();
            const b = String(bRaw || '').trim();
            const aEmpty = !a;
            const bEmpty = !b;
            if (aEmpty && bEmpty) return 0;
            if (aEmpty) return 1;
            if (bEmpty) return -1;
            const c = a.localeCompare(b, undefined, { sensitivity: 'base' });
            return desc ? -c : c;
          };

          const getFavSortFieldStr = (it, sortBy) => {
            if (sortBy === 'language') return it.language || '';
            if (sortBy === 'translation') return it.translation || '';
            return it.category || '';
          };

          const compareFavPickerItems = (a, b, sortBy, desc) => {
            let c = cmpFieldEmptyLastStr(getFavSortFieldStr(a, sortBy), getFavSortFieldStr(b, sortBy), desc);
            if (c !== 0) return c;
            return String(a.url || '').localeCompare(String(b.url || ''), undefined, { sensitivity: 'base' });
          };

          const favGroupRepString = (catItems, sortBy, desc) => {
            const strs = catItems.map((it) => String(getFavSortFieldStr(it, sortBy) || '').trim()).filter(Boolean);
            if (strs.length === 0) return '';
            if (desc) {
              return strs.reduce((best, s) => (s.localeCompare(best, undefined, { sensitivity: 'base' }) >= 0 ? s : best));
            }
            return strs.reduce((best, s) => (s.localeCompare(best, undefined, { sensitivity: 'base' }) <= 0 ? s : best));
          };

          const cmpFavGroupBucketKey = (ga, gb) => {
            const aa = String(ga || '').toLowerCase().trim();
            const bb = String(gb || '').toLowerCase().trim();
            if (!aa && !bb) return 0;
            if (!aa) return 1;
            if (!bb) return -1;
            return aa.localeCompare(bb);
          };

          const sortFavGroupKeysByRepresentative = (keys, groupMap, sortBy, desc) => {
            keys.sort((ka, kb) => {
              const itemsA = groupMap.get(ka) || [];
              const itemsB = groupMap.get(kb) || [];
              const repA = favGroupRepString(itemsA, sortBy, desc);
              const repB = favGroupRepString(itemsB, sortBy, desc);
              let c = cmpFieldEmptyLastStr(repA, repB, desc);
              if (c !== 0) return c;
              return cmpFavGroupBucketKey(ka, kb);
            });
          };

          const getSeenSortNum = (it, sortBy) => {
            if (sortBy === 'lastSeen') return Number(it.ts) || 0;
            if (sortBy === 'lastUsed') {
              return (typeof it.lastUsed === 'number' && it.lastUsed > 0) ? it.lastUsed : 0;
            }
            return 0;
          };

          const getSeenSortStr = (it, sortBy) => {
            if (sortBy === 'path') return String(it.path || '').trim();
            if (sortBy === 'filename') {
              const f = String(it.friendlyFilename || '').trim();
              return f || String(it.url || '').trim();
            }
            return '';
          };

          const cmpSeenNumEmptyLast = (na, nb, desc) => {
            const aWeak = !(Number(na) > 0);
            const bWeak = !(Number(nb) > 0);
            if (aWeak && bWeak) return 0;
            if (aWeak) return 1;
            if (bWeak) return -1;
            return desc ? (nb - na) : (na - nb);
          };

          const compareSeenGroupReps = (ra, rb, sortBy, desc) => {
            if (sortBy === 'lastSeen' || sortBy === 'lastUsed') {
              return cmpSeenNumEmptyLast(ra, rb, desc);
            }
            return cmpFieldEmptyLastStr(ra, rb, desc);
          };

          const compareSeenPickerItems = (a, b, sortBy, desc) => {
            if (sortBy === 'lastSeen' || sortBy === 'lastUsed') {
              const va = getSeenSortNum(a, sortBy);
              const vb = getSeenSortNum(b, sortBy);
              let c = cmpSeenNumEmptyLast(va, vb, desc);
              if (c !== 0) return c;
              return String(a.url || '').localeCompare(String(b.url || ''), undefined, { sensitivity: 'base' });
            }
            let c = cmpFieldEmptyLastStr(getSeenSortStr(a, sortBy), getSeenSortStr(b, sortBy), desc);
            if (c !== 0) return c;
            return String(a.url || '').localeCompare(String(b.url || ''), undefined, { sensitivity: 'base' });
          };

          const seenGroupRep = (items, sortBy, desc) => {
            if (sortBy === 'lastSeen' || sortBy === 'lastUsed') {
              const nums = items.map((it) => getSeenSortNum(it, sortBy)).filter((n) => n > 0);
              if (nums.length === 0) return 0;
              return desc ? Math.max(...nums) : Math.min(...nums);
            }
            const strs = items.map((it) => String(getSeenSortStr(it, sortBy) || '').trim()).filter(Boolean);
            if (strs.length === 0) return '';
            if (desc) {
              return strs.reduce((best, s) => (s.localeCompare(best, undefined, { sensitivity: 'base' }) >= 0 ? s : best));
            }
            return strs.reduce((best, s) => (s.localeCompare(best, undefined, { sensitivity: 'base' }) <= 0 ? s : best));
          };

          const cmpSeenGroupBucketKeyTie = (ka, kb, seenGroupByMode) => {
            if (seenGroupByMode === 'path' || seenGroupByMode === 'date') {
              const aEmpty = !String(ka || '').trim();
              const bEmpty = !String(kb || '').trim();
              if (aEmpty && bEmpty) return 0;
              if (aEmpty) return 1;
              if (bEmpty) return -1;
            }
            return String(ka || '').localeCompare(String(kb || ''), undefined, { sensitivity: 'base' });
          };

          const sortSeenGroupKeysByRepresentative = (keys, groupMap, seenSortByLocal, desc, SEEN_LAST_USED_SENTINEL, seenGroupByMode) => {
            keys.sort((ka, kb) => {
              if (seenGroupByMode === 'lastUsed') {
                if (ka === SEEN_LAST_USED_SENTINEL && kb === SEEN_LAST_USED_SENTINEL) return 0;
                if (ka === SEEN_LAST_USED_SENTINEL) return 1;
                if (kb === SEEN_LAST_USED_SENTINEL) return -1;
              }
              const repA = seenGroupRep(groupMap.get(ka) || [], seenSortByLocal, desc);
              const repB = seenGroupRep(groupMap.get(kb) || [], seenSortByLocal, desc);
              let c = compareSeenGroupReps(repA, repB, seenSortByLocal, desc);
              if (c !== 0) return c;
              return cmpSeenGroupBucketKeyTie(ka, kb, seenGroupByMode);
            });
          };

          const groupBySelect = (source === 'favorites')
            ? `
              <div class="gem-image-picker-filter-stack">
              <label>Group by</label>
              <select class="e-select gem-fav-groupby-select gem-image-picker-groupby-select" style="width:auto;">
                <option value="category" ${groupBy === 'category' ? 'selected' : ''}>Category</option>
                <option value="language" ${groupBy === 'language' ? 'selected' : ''}>Language</option>
                <option value="translation" ${groupBy === 'translation' ? 'selected' : ''}>Translation</option>
                <option value="none" ${groupBy === 'none' ? 'selected' : ''}>No Grouping</option>
              </select>
              </div>
            `.trim()
            : (source === 'seen')
            ? `
              <div class="gem-image-picker-filter-stack">
              <label style="font-size:12px; opacity:0.75; white-space:nowrap;">Group by</label>
              <select class="e-select gem-seen-groupby-select gem-image-picker-groupby-select" style="width:auto;">
                <option value="path" ${seenGroupBy === 'path' ? 'selected' : ''}>Folder Path</option>
                <option value="date" ${seenGroupBy === 'date' ? 'selected' : ''}>Last Seen</option>
                <option value="lastUsed" ${seenGroupBy === 'lastUsed' ? 'selected' : ''}>Last Used</option>
                <option value="none" ${seenGroupBy === 'none' ? 'selected' : ''}>No Grouping</option>
              </select>
              </div>
            `.trim()
            : '';

          const favOrderAria =
            favSortOrder === 'desc'
              ? 'Sort order: descending. Activate to use ascending order.'
              : 'Sort order: ascending. Activate to use descending order.';
          const seenOrderAria =
            seenSortOrder === 'desc'
              ? 'Sort order: descending. Activate to use ascending order.'
              : 'Sort order: ascending. Activate to use descending order.';
          const orderIconStack = (orderClass, dataContext, ariaLabel) => `
              <div class="gem-image-picker-filter-stack gem-image-picker-filter-stack--order-icons">
                <button type="button" class="gem-image-picker-order-toggle e-btn e-btn-borderless ${orderClass}" data-order-context="${dataContext}" aria-label="${escape(ariaLabel)}">
                  <span class="gem-image-picker-order-toggle__icons">
                    <span class="gem-image-picker-order-icon gem-image-picker-order-icon--up">
                      <e-icon icon="caret-up">
                        <div aria-hidden="true" class="e-icon-wrapper">
                          <div class="e-icon">&#xF172;</div>
                        </div>
                      </e-icon>
                    </span>
                    <span class="gem-image-picker-order-icon gem-image-picker-order-icon--down">
                      <e-icon icon="caret-down">
                        <div aria-hidden="true" class="e-icon-wrapper">
                          <div class="e-icon">&#xF173;</div>
                        </div>
                      </e-icon>
                    </span>
                  </span>
                </button>
              </div>
            `.trim();

          const sortByOrderControls = (source === 'favorites')
            ? `
              <div class="gem-image-picker-filter-stack">
              <label>Sort by</label>
              <select class="e-select gem-fav-sortby-select gem-image-picker-groupby-select" style="width:auto;">
                <option value="category" ${favSortBy === 'category' ? 'selected' : ''}>Category</option>
                <option value="language" ${favSortBy === 'language' ? 'selected' : ''}>Language</option>
                <option value="translation" ${favSortBy === 'translation' ? 'selected' : ''}>Translation</option>
              </select>
              </div>
              ${orderIconStack(
                `gem-image-picker-order-toggle--${favSortOrder}`,
                'favorites',
                favOrderAria
              )}
            `.trim()
            : (source === 'seen')
            ? `
              <div class="gem-image-picker-filter-stack">
              <label style="font-size:12px; opacity:0.75; white-space:nowrap;">Sort by</label>
              <select class="e-select gem-seen-sortby-select gem-image-picker-groupby-select" style="width:auto;">
                <option value="path" ${seenSortBy === 'path' ? 'selected' : ''}>Folder Path</option>
                <option value="lastSeen" ${seenSortBy === 'lastSeen' ? 'selected' : ''}>Last Seen</option>
                <option value="lastUsed" ${seenSortBy === 'lastUsed' ? 'selected' : ''}>Last Used</option>
                <option value="filename" ${seenSortBy === 'filename' ? 'selected' : ''}>Name</option>
              </select>
              </div>
              ${orderIconStack(
                `gem-image-picker-order-toggle--${seenSortOrder}`,
                'seen',
                seenOrderAria
              )}
            `.trim()
            : '';

          const ctx = source === 'favorites' ? PILL_CTX_FAV : PILL_CTX_SEEN;
          const pillsForSource = pillsForContext(picker._gemSearchPills, ctx);
          const pillsHtml = pillsForSource.map((p) => {
            const active = !!p.active;
            const term = (p && typeof p.term === 'string') ? p.term : '';
            if (!term) return '';
            const displayText = (p.label && p.isRegex) ? p.label : term;
            const titleAttr = (p.label && p.isRegex) ? ` title="${escape(term)}"` : '';
            const regexBadge = p.isRegex ? '<span class="gem-search-pill-regex" title="Regex">.*</span>' : '';
            return `<span class="gem-search-pill ${active ? 'gem-search-pill--active' : ''}" data-term="${escape(term)}" data-index="${p._idx}"${titleAttr}><span class="gem-search-pill-remove" aria-label="Remove">×</span><span class="gem-search-pill-text">${escape(displayText)}</span>${regexBadge}</span>`;
          }).filter(Boolean).join('');
          const regexActive = source === 'favorites' ? picker.dataset.gemFavRegex === '1' : picker.dataset.gemSeenRegex === '1';
          const favSearch = (source === 'favorites' || source === 'seen')
            ? `
              <div id="gem-search-container" style="margin-top:12px;padding:0 16px 0 0;display:flex; flex-direction: column; gap:0;align-items:flex-start;">
                <div style="flex:1;display:flex;flex-direction:row;gap:12px;min-width:100%;">
                  <div class="gem-search-input-wrap" style="width:100%">
                    <input class="e-input e-input-search gem-image-search ${source === 'favorites' ? 'gem-favorite-images-search' : 'gem-seen-images-search'}" placeholder="Search ${source === 'favorites' ? 'favorite images' : 'recent images'}" type="search" value="${escape(source === 'favorites' ? (picker.dataset.gemFavoriteImagesSearch || '') : (picker.dataset.gemSeenImagesSearch || ''))}">
                    <button type="button" class="gem-regex-toggle ${regexActive ? 'gem-regex-toggle--active' : ''}" title="Use regular expression" aria-pressed="${regexActive ? 'true' : 'false'}" data-regex-source="${source}">.*</button>
                  </div>
                <div class="gem-search-group-by-container">
                  ${groupBySelect}
                  ${sortByOrderControls}
                </div>
                <button type="button" class="gem-search-settings-btn" title="Manage saved searches">⚙</button>
                </div>
                  <div class="gem-search-pills" data-pills-source="${source}">
                    ${pillsHtml}
                  </div>
              </div>
            `.trim()
            : '';

          const currentAction = picker.dataset.gemCollapseExpandAction || 'collapse';
          const actionLabel = currentAction === 'collapse' ? 'Collapse all groups' : 'Expand all groups';
          const groupingActive =
            (source === 'favorites' && groupBy !== 'none') ||
            (source === 'seen' && seenGroupBy !== 'none');
          const collapseExpandAllBtn = (source === 'favorites' || source === 'seen') && groupingActive
            ? `<button class="e-btn e-btn-borderless e-btn-onlyicon gem-collapse-expand-all-btn" type="button" data-action="${escape(currentAction)}" aria-label="${escape(actionLabel)}" title="${escape(actionLabel)}">⇅</button>`
            : '';

          const gridColsControl = (viewMode === 'grid')
            ? buildGridColsControl({ value: gridCols })
            : '';
          const listThumbsToggleControl = (viewMode === 'table' && (source === 'favorites' || source === 'seen'))
            ? `<button class="e-btn gem-list-thumbs-toggle-btn ${listThumbsOn ? 'e-btn-primary' : ''}" type="button" title="Toggle list thumbnails">List Thumbs: ${listThumbsOn ? 'On' : 'Off'}</button>`
            : '';

          const header = buildSharedImagePickerHeader({
            sourceTabs,
            addFavoriteBtn,
            rightControls: buildSharedImagePickerControls({
              collapseExpandAllBtn,
              gridColsControl,
              listThumbsToggleControl,
              currentView: viewMode === 'grid' ? 'grid' : 'table',
              addFavoriteControl: source === 'favorites'
                ? `<button type="button" class="e-btn e-btn-primary gem-favorite-images-add-btn"><e-icon icon="star"><div aria-hidden="true" class="e-icon-wrapper"><div class="e-icon">&#xF175;</div></div></e-icon>Add Favorite</button>`
                : ''
            }),
            searchBlock: favSearch
          });

          const empty = rows.length === 0
            ? (source === 'favorites'
              ? '<div class="gem-img-picker-search-results">No favorites yet. Favorite an image from Recent Images or add one here.</div>'
              : '<div class="gem-img-picker-search-results">No recent images yet. Browse Media DB images or use an image in the editor to start collecting them.</div>')
            : '';

          const dateLabel = 'Last Seen';

          // Favorites view: group by category OR language, collapsible, searchable, sorted.
          if (source === 'favorites') {
            const qRaw = String(picker.dataset.gemFavoriteImagesSearch || '').trim();
            const favPills = pillsForContext(picker._gemSearchPills, PILL_CTX_FAV);
            const favRegexOn = picker.dataset.gemFavRegex === '1';
            const terms = [
              ...favPills.filter((p) => p.active).map((p) => ({ term: (p.term || '').toLowerCase().trim(), isRegex: !!p.isRegex })).filter((o) => o.term),
              ...(qRaw ? [{ term: qRaw.toLowerCase(), isRegex: favRegexOn }] : [])
            ];

            // When terms change, clear manual collapse overrides so new searches
            // auto-expand all groups. While the same search is active, overrides
            // persist so users can freely collapse groups.
            const _favTermsKey = terms.map(t => t.term + (t.isRegex ? '/r' : '')).join('\x00');
            if (_favTermsKey !== _gemFavSearchKey) {
              _gemFavSearchKey = _favTermsKey;
              Object.keys(_gemFavSearchCollapseOverride).forEach(k => delete _gemFavSearchCollapseOverride[k]);
            }

            // Build last-used map from recent images so we can sort missing-altText items by last used.
            getRecentlySeenImages((seenForLu) => {
              const lastUsedMap = new Map();
              (Array.isArray(seenForLu) ? seenForLu : []).forEach((x) => {
                if (!x || !x.url) return;
                const lu = typeof x.lastUsed === 'number' ? x.lastUsed : 0;
                lastUsedMap.set(x.url, lu);
              });

              getFavoriteCategoryCollapseMap((collapseMap) => {
                const collapse = collapseMap || {};

                const items = rows.map((r) => {
                  const url = r.url || '';
                  const m = meta[url] || {};
                  const category = (m.category || '').trim();
                  const language = (m.language || '').trim();
                  const altText = (m.altText || '').trim();
                  const translation = (m.translation || '').trim();
                  const friendlyFilename = (m.friendlyFilename || '').trim();
                  const lastUsed = lastUsedMap.get(url) || r.ts || 0;
                  return { url, category, language, altText, translation, friendlyFilename, lastUsed };
                });

                const matchesQuery = (it) => {
                  if (terms.length === 0) return true;
                  const hay = `${it.altText} ${it.language} ${it.translation} ${it.category} ${it.url}`.toLowerCase();
                  return terms.every((o) => {
                    if (o.isRegex) {
                      try { return new RegExp(o.term, 'i').test(hay); } catch (_) { /* fall through */ }
                    }
                    return hay.includes(o.term);
                  });
                };
                const filtered = items.filter(matchesQuery);
                const termsDisplay = formatPickerSearchTermsHtml(terms);
                const searchSummary = terms.length > 0 && filtered.length > 0
                  ? `<div class="gem-img-picker-search-results">Found ${filtered.length} matches for ${termsDisplay}.</div>`
                  : '';

                const effectiveGroupBy = groupBy === 'none' ? 'category' : groupBy;

                const groupMap = new Map();
                if (groupBy !== 'none') {
                  filtered.forEach((it) => {
                    const g =
                      groupBy === 'language' ? (it.language || '') :
                      groupBy === 'translation' ? (it.translation || '') :
                      (it.category || '');
                    if (!groupMap.has(g)) groupMap.set(g, []);
                    groupMap.get(g).push(it);
                  });
                }

                const groupKeys = Array.from(groupMap.keys());
                if (groupBy !== 'none') {
                  sortFavGroupKeysByRepresentative(groupKeys, groupMap, favSortBy, favSortDesc);
                }

                if (terms.length === 0 && groupBy !== 'none') {
                  const validKeys = new Set(groupKeys.map(gKey => `${groupBy}:${gKey || ''}`));
                  const pruned = {};
                  let changed = false;
                  for (const [k, v] of Object.entries(collapse)) {
                    const matchesPrefix = k.startsWith(`${groupBy}:`);
                    const isLegacyCategory = groupBy === 'category' && !k.includes(':');
                    if ((matchesPrefix && !validKeys.has(k)) ||
                        (isLegacyCategory && !validKeys.has(`category:${k}`))) {
                      changed = true;
                    } else {
                      pruned[k] = v;
                    }
                  }
                  if (changed) {
                    saveFavoriteCategoryCollapseMap(pruned);
                  }
                }

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
                  const isCollapsed = terms.length > 0
                    ? (storageKey in _gemFavSearchCollapseOverride ? !!_gemFavSearchCollapseOverride[storageKey] : false)
                    : isCollapsedRaw;
                  const caret = isCollapsed ? '▸' : '▾';
                  const showEdit = groupBy === 'category';
                  return `
                    <div class="gem-picker-cat-header" data-group-key="${escape(storageKey)}" data-cat="${escape(gKey)}">
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
                    (effectiveGroupBy === 'translation')
                      ? ((it.language || '').trim())
                      : (((it.translation || '').trim()) || ((it.altText || '').trim()));

                  // Extra metadata to show under the primary label (varies by Group By)
                  const extraPartsRaw =
                    (effectiveGroupBy === 'category')
                      ? [((it.language || '').trim()), ((it.translation || '').trim())]
                      : (effectiveGroupBy === 'translation')
                        ? [((it.category || '').trim()), ((it.language || '').trim())]
                        : [((it.category || '').trim()), ((it.translation || '').trim())]; // language
                  const extraParts = extraPartsRaw
                    .filter((v) => !!v && v !== label);
                  const extraText = extraParts.join(' • ');
                  const selectedClass = isSelectedImageUrl(it.url) ? ' gem-selected-image' : '';
                  return `
                    <div class="gem-img-picker-tile gem-checkered-canvas${selectedClass}">
                      <button class="gem-recent-image-edit-btn" type="button" data-url="${escape(it.url)}" aria-label="${editTitle}" title="${editTitle}">
                        ✎
                      </button>
                      <img class="gem-recent-image-thumb gem-checkered-canvas" src="${escape(it.url)}" alt="" />
                      <div class="gem-recent-image-overlay">
                        <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(it.url)}">
                          Insert
                        </button>
                      </div>
                      <div class="gem-recent-image-meta">
                        ${label ? `<div class="gem-recent-image-meta2 gem-recent-image-meta2--first" title="${escape(label)}">${escape(label)}</div>` : ''}
                        ${extraText ? `<div class="gem-recent-image-meta2 gem-recent-image-meta2--second" title="${escape(extraText)}">${escape(extraText)}</div>` : ''}
                      </div>
                    </div>
                  `;
                };

                const renderTableRows = (catItems) => {
                  const deriveFilenameFromUrl = (rawUrl) => {
                    const u = String(rawUrl || '').trim();
                    if (!u) return '';
                    try {
                      const parsed = new URL(u, window.location.href);
                      const pathname = String(parsed.pathname || '');
                      const seg = pathname.split('/').filter(Boolean).pop() || '';
                      return seg || u;
                    } catch (_) {
                      const noHash = u.split('#')[0];
                      const noQuery = noHash.split('?')[0];
                      const seg = noQuery.split('/').filter(Boolean).pop() || '';
                      return seg || u;
                    }
                  };
                  const renderRowMenu = (url, source, isFav) => {
                    return buildRowMenuTrigger(url, source, isFav);
                  };
                  return catItems.map((it) => {
                    const metaText = [it.altText].filter(Boolean).join(' • ');
                    const filename = (it.friendlyFilename || '').trim() || deriveFilenameFromUrl(it.url);
                    const colA = (effectiveGroupBy === 'category')
                      ? (it.language || '')
                      : (effectiveGroupBy === 'translation')
                        ? (it.category || '')
                        : (it.category || ''); // language
                    const colB = (effectiveGroupBy === 'category')
                      ? (it.translation || '')
                      : (effectiveGroupBy === 'translation')
                        ? (it.language || '')
                        : (it.translation || ''); // language
                    const previewCell = listThumbsOn
                      ? `<td style="padding:6px; width:140px; vertical-align:middle;">
                          <img class="gem-checkered-canvas" src="${escape(it.url)}" style="display:block; width:128px; height:70px; object-fit:contain; border-radius:4px;" />
                        </td>`
                      : '';
                    return `
                      <tr class="${isSelectedImageUrl(it.url) ? 'gem-selected-image' : ''}">
                        ${previewCell}
                        <td>${escape(filename)}</td>
                        <td>${escape(colA || '')}</td>
                        <td>${escape(colB || '')}</td>
                        <td>
                          <div>${escape(formatRecentImageDate(it.lastUsed || 0))}</div>
                          ${metaText ? `<div class="gem-recent-image-meta2" title="${escape(metaText)}">${escape(metaText)}</div>` : ''}
                        </td>
                        <td>
                          <div class="gem-image-row-actions">
                            <button class="e-btn e-btn-borderless e-btn-onlyicon gem-recent-image-edit-btn gem-recent-image-edit-btn--table" type="button" data-url="${escape(it.url)}" aria-label="Edit metadata" title="Edit metadata">
                              <span class="gem-recent-image-edit">✎</span>
                            </button>
                            <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(it.url)}">
                              Insert
                            </button>
                            ${renderRowMenu(it.url, 'favorites', true)}
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('');
                };

                const buildCategorySections = () => {
                  if (groupBy === 'none') {
                    const sortedItems = [...filtered];
                    sortedItems.sort((a, b) => compareFavPickerItems(a, b, favSortBy, favSortDesc));
                    if (viewMode === 'grid') {
                      return `
                        <div class="gem-picker-cat-section gem-picker-cat-section--not-collapsible gem-picker-cat-section--expanded">
                          <div class="gem-recent-images-grid">
                            ${sortedItems.map(renderGridItem).join('')}
                          </div>
                        </div>
                      `.trim();
                    }
                    return `
                      <div class="gem-picker-cat-section gem-picker-cat-section--not-collapsible gem-picker-cat-section--expanded">
                        <div class="gem-picker-list-table-wrapper"><table data-e-version="2" class="e-table e-table-condensed gem-picker-list-table" style="width:100%; font-size: 14px">
                          <thead>
                            <tr>
                              ${listThumbsOn ? '<th style="width:140px;">Preview</th>' : ''}
                              <th>Name</th>
                              <th style="width:140px;">Language</th>
                              <th style="width:140px;">Translation</th>
                              <th style="width:160px;">${dateLabel}</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            ${renderTableRows(sortedItems)}
                          </tbody>
                        </table></div>
                      </div>
                    `.trim();
                  }
                  return groupKeys.map((gKey) => {
                    const catItems = groupMap.get(gKey) || [];
                    catItems.sort((a, b) => compareFavPickerItems(a, b, favSortBy, favSortDesc));

                    const headerHtml = renderGroupHeader(gKey, catItems.length);
                    const storageKey = `${groupBy}:${gKey || ''}`;
                    const legacyKey = (groupBy === 'category') ? (gKey || '') : null;
                    const isCollapsedRaw = !!collapse[storageKey] || (legacyKey != null && !!collapse[legacyKey]);
                    const isCollapsed = terms.length > 0
                      ? (storageKey in _gemFavSearchCollapseOverride ? !!_gemFavSearchCollapseOverride[storageKey] : false)
                      : isCollapsedRaw;
                    const sectionStateClass = isCollapsed ? 'gem-picker-cat-section--collapsed' : 'gem-picker-cat-section--expanded';
                    const sectionCollapseClass = 'gem-picker-cat-section--collapsible';
                    if (viewMode === 'grid') {
                      return `
                        <div class="gem-picker-cat-section ${sectionCollapseClass} ${sectionStateClass}">
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
                      <div class="gem-picker-cat-section ${sectionCollapseClass} ${sectionStateClass}">
                        ${headerHtml}
                        ${isCollapsed ? '' : `
                          <div class="gem-picker-list-table-wrapper"><table data-e-version="2" class="e-table e-table-condensed gem-picker-list-table" style="width:100%; font-size: 14px">
                            <thead>
                              <tr>
                                ${listThumbsOn ? '<th style="width:140px;">Preview</th>' : ''}
                                <th>Name</th>
                                <th style="width:140px;">${effectiveGroupBy === 'category' ? 'Language' : (effectiveGroupBy === 'translation' ? 'Category' : 'Category')}</th>
                                <th style="width:140px;">${effectiveGroupBy === 'category' ? 'Translation' : (effectiveGroupBy === 'translation' ? 'Language' : 'Translation')}</th>
                                <th style="width:160px;">${dateLabel}</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              ${renderTableRows(catItems)}
                            </tbody>
                          </table></div>
                        `}
                      </div>
                    `;
                  }).join('');
                };

                // For content-only updates (search changes), preserve header and update only content
                if (opts.contentOnly && pickerContent.querySelector('.gem-image-list-header')) {
                  const contentContainer = document.createElement('div');
                  contentContainer.innerHTML = `
                    ${searchSummary}
                    ${terms.length > 0 && filtered.length === 0 ? `<div class="gem-img-picker-search-results">No matches found for ${termsDisplay}.</div>` : ''}
                    <div class="gem-img-picker-list-wrapper">
                    ${buildCategorySections()}
                    </div>
                    ${terms.length === 0 ? empty : ''}
                  `.trim();
                  // Replace everything after the header
                  const header = pickerContent.querySelector('.gem-image-list-header');
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
                      pickerContent.appendChild(contentContainer.firstChild);
                    }
                  }
                  const pillsContainerFav = pickerContent.querySelector('.gem-search-pills[data-pills-source="favorites"]');
                  if (pillsContainerFav) {
                    const favPillsForUpdate = pillsForContext(picker._gemSearchPills, PILL_CTX_FAV);
                    pillsContainerFav.innerHTML = favPillsForUpdate.map((p) => {
                      const active = !!p.active;
                      const term = (p && typeof p.term === 'string') ? p.term : '';
                      if (!term) return '';
                      const displayText = (p.label && p.isRegex) ? p.label : term;
                      const titleAttr = (p.label && p.isRegex) ? ` title="${escape(term)}"` : '';
                      const regexBadge = p.isRegex ? '<span class="gem-search-pill-regex" title="Regex">.*</span>' : '';
                      return `<span class="gem-search-pill ${active ? 'gem-search-pill--active' : ''}" data-term="${escape(term)}" data-index="${p._idx}"${titleAttr}><span class="gem-search-pill-remove" aria-label="Remove">×</span><span class="gem-search-pill-text">${escape(displayText)}</span>${regexBadge}</span>`;
                    }).filter(Boolean).join('');
                  }
                } else {
                  pickerContent.innerHTML = `
                    ${header}
                    ${searchSummary}
                    ${terms.length > 0 && filtered.length === 0 ? `<div class="gem-img-picker-search-results">No matches found for ${termsDisplay}.</div>` : ''}
                    <div class="gem-img-picker-list-wrapper">
                    ${buildCategorySections()}
                    </div>
                    ${terms.length === 0 ? empty : ''}
                  `.trim();
                }

                scheduleGemSearchPillSortableRefresh(picker, modal);

                // Focus restoration no longer needed since header is preserved during content-only updates
              });
            });
            return;
          }

          // Recently Seen view: group by path OR date, collapsible, searchable, sorted.
          if (source === 'seen') {
            const qRaw = String(picker.dataset.gemSeenImagesSearch || '').trim();
            const seenPills = pillsForContext(picker._gemSearchPills, PILL_CTX_SEEN);
            const seenRegexOn = picker.dataset.gemSeenRegex === '1';
            const seenTerms = [
              ...seenPills.filter((p) => p.active).map((p) => ({ term: (p.term || '').toLowerCase().trim(), isRegex: !!p.isRegex })).filter((o) => o.term),
              ...(qRaw ? [{ term: qRaw.toLowerCase(), isRegex: seenRegexOn }] : [])
            ];

            const _seenTermsKey = seenTerms.map(t => t.term + (t.isRegex ? '/r' : '')).join('\x00');
            if (_seenTermsKey !== _gemSeenSearchKey) {
              _gemSeenSearchKey = _seenTermsKey;
              Object.keys(_gemSeenSearchCollapseOverride).forEach(k => delete _gemSeenSearchCollapseOverride[k]);
            }

            getRecentlySeenImageGroupCollapseMap((collapseMap) => {
              const collapse = collapseMap || {};

              const SEEN_LAST_USED_NONE = '__gem_last_used_none__';
              const items = rows.map((r) => {
                const url = r.url || '';
                const ts = r.ts || 0;
                const path = (r.path || '').trim();
                const friendlyFilename = (r.friendlyFilename || '').trim();
                const lastUsed = (typeof r.lastUsed === 'number') ? r.lastUsed : undefined;
                return { url, ts, path, friendlyFilename, lastUsed };
              });

              const matchesQuery = (it) => {
                if (seenTerms.length === 0) return true;
                const hay = `${it.friendlyFilename} ${it.path} ${it.url}`.toLowerCase();
                return seenTerms.every((o) => {
                  if (o.isRegex) {
                    try { return new RegExp(o.term, 'i').test(hay); } catch (_) { /* fall through */ }
                  }
                  return hay.includes(o.term);
                });
              };
              const filtered = items.filter(matchesQuery);
              const seenTermsDisplay = formatPickerSearchTermsHtml(seenTerms);
              const searchSummary = seenTerms.length > 0 && filtered.length > 0
                ? `<div class="gem-img-picker-search-results">Found ${filtered.length} matches for ${seenTermsDisplay}.</div>`
                : '';

              const groupMap = new Map();
              let groupKeys = [];
              if (seenGroupBy !== 'none') {
                filtered.forEach((it) => {
                  let g;
                  if (seenGroupBy === 'lastUsed') {
                    g = (typeof it.lastUsed === 'number' && it.lastUsed > 0)
                      ? formatRecentImageDate(it.lastUsed).split(',')[0]
                      : SEEN_LAST_USED_NONE;
                  } else if (seenGroupBy === 'date') {
                    g = formatRecentImageDate(it.ts).split(',')[0];
                  } else {
                    g = it.path || '';
                  }
                  if (!groupMap.has(g)) groupMap.set(g, []);
                  groupMap.get(g).push(it);
                });

                groupKeys = Array.from(groupMap.keys());
                sortSeenGroupKeysByRepresentative(groupKeys, groupMap, seenSortBy, seenSortDesc, SEEN_LAST_USED_NONE, seenGroupBy);

                if (seenTerms.length === 0) {
                  const prefix = `seen:${seenGroupBy}:`;
                  const validKeys = new Set(groupKeys.map(gKey => `${prefix}${gKey || ''}`));
                  const pruned = {};
                  let changed = false;
                  for (const [k, v] of Object.entries(collapse)) {
                    if (k.startsWith(prefix) && !validKeys.has(k)) {
                      changed = true;
                    } else {
                      pruned[k] = v;
                    }
                  }
                  if (changed) {
                    saveRecentlySeenImageGroupCollapseMap(pruned);
                  }
                }
              }

              const renderGroupHeader = (gKey, count) => {
                const label = gKey === SEEN_LAST_USED_NONE
                  ? 'Not Used Recently'
                  : (gKey
                    ? ((seenGroupBy === 'date' || seenGroupBy === 'lastUsed') ? gKey : gKey)
                    : ((seenGroupBy === 'date' || seenGroupBy === 'lastUsed') ? 'Unknown Date' : 'No Path'));
                const storageKey = `seen:${seenGroupBy}:${gKey === SEEN_LAST_USED_NONE ? SEEN_LAST_USED_NONE : (gKey || '')}`;
                const isCollapsedRaw = !!collapse[storageKey];
                const isCollapsed = seenTerms.length > 0
                  ? (storageKey in _gemSeenSearchCollapseOverride ? !!_gemSeenSearchCollapseOverride[storageKey] : false)
                  : isCollapsedRaw;
                const caret = isCollapsed ? '▸' : '▾';
                return `
                  <div class="gem-picker-cat-header" data-group-key="${escape(storageKey)}" data-cat="${escape(gKey)}" data-seen-groupby="${escape(seenGroupBy)}">
                    <button class="e-btn e-btn-borderless e-btn-onlyicon gem-seen-cat-toggle" type="button" data-group-key="${escape(storageKey)}" aria-label="Toggle" title="Toggle">
                      ${caret}
                    </button>
                    <div class="gem-seen-cat-title">
                      <span class="gem-seen-cat-name">${escape(label)}</span>
                      <span class="gem-seen-cat-count">${count}</span>
                    </div>
                    <button class="e-btn e-btn-borderless e-btn-onlyicon gem-seen-cat-remove-group" type="button" data-group-key="${escape(storageKey)}" data-cat="${escape(gKey)}" data-seen-groupby="${escape(seenGroupBy)}" aria-label="Remove group" title="Remove all images in this group">×</button>
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
                let usedNoticeHtml = '';
                if (typeof it.lastUsed === 'number' && it.lastUsed > 0) {
                  const lu = new Date(it.lastUsed);
                  const now = new Date();
                  const luDay = new Date(lu.getFullYear(), lu.getMonth(), lu.getDate()).getTime();
                  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                  const dayDiff = Math.round((today - luDay) / (24 * 60 * 60 * 1000));
                  const usedLabel = dayDiff <= 0 ? 'Used today' : `Used ${dayDiff} day${dayDiff === 1 ? '' : 's'} ago`;
                  usedNoticeHtml = `
                    <div class="gem-recent-image-used-notice">${escape(usedLabel)}</div>
                  `.trim();
                }
                const selectedClass = isSelectedImageUrl(url) ? ' gem-selected-image' : '';
                return `
                  <div class="gem-img-picker-tile${selectedClass}">
                    <button class="gem-recent-image-info-btn" type="button" data-url="${escape(url)}" aria-label="View image details" title="View image details">
                      ℹ
                    </button>
                    <button class="gem-recent-image-fav-btn ${isFav ? 'gem-recent-image-fav-btn--active' : ''}" type="button" data-url="${escape(url)}" aria-label="${starTitle}" title="${starTitle}">
                      ${star}
                    </button>
                    <img class="gem-recent-image-thumb gem-checkered-canvas" src="${escape(url)}" alt="" />
                    ${usedNoticeHtml}
                    <div class="gem-recent-image-overlay">
                      <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(url)}">
                        Insert
                      </button>
                    </div>
                    <div class="gem-recent-image-meta">
                      <div class="gem-recent-image-date" title="${escape(friendlyFilename || url)}">${escape(friendlyFilename || url)}</div>
                    </div>
                  </div>
                `;
              };

              const renderTableRows = (catItems) => {
                const renderRowMenu = (url, source, isFav) => {
                  return buildRowMenuTrigger(url, source, isFav);
                };
                return catItems.map((it) => {
                  const url = it.url || '';
                  const ts = it.ts || 0;
                  const friendlyFilename = it.friendlyFilename || '';
                  const isFav = favSet.has(url);
                  const previewCell = listThumbsOn
                    ? `<td style="padding:6px; width:140px; vertical-align:middle; position:relative;">
                        <img class="gem-checkered-canvas" src="${escape(url)}" style="display:block; width:128px; height:70px; object-fit:contain; border-radius:4px;" />
                        <button class="gem-recent-image-info-btn gem-recent-image-info-btn--table" type="button" data-url="${escape(url)}" aria-label="View image details" title="View image details" style="position:absolute; top:8px; left:8px; background:rgba(255,255,255,0.9); border:1px solid #ccc; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer;">
                          ℹ
                        </button>
                      </td>`
                    : '';
                  return `
                    <tr class="${isSelectedImageUrl(url) ? 'gem-selected-image' : ''}">
                      ${previewCell}
                      <td>${escape(friendlyFilename || url)}</td>
                      <td>${escape(formatRecentImageDate(ts))}</td>
                      <td>
                        <div class="gem-image-row-actions">
                          <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(url)}">
                            Use
                          </button>
                          ${renderRowMenu(url, 'seen', isFav)}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('');
              };

              const buildCategorySections = () => {
                if (seenGroupBy === 'none') {
                  const flatItems = [...filtered];
                  flatItems.sort((a, b) => compareSeenPickerItems(a, b, seenSortBy, seenSortDesc));
                  if (viewMode === 'grid') {
                    return `
                      <div class="gem-picker-cat-section gem-picker-cat-section--not-collapsible gem-picker-cat-section--expanded">
                        <div class="gem-recent-images-grid">
                          ${flatItems.map(renderGridItem).join('')}
                        </div>
                      </div>
                    `.trim();
                  }
                  return `
                    <div class="gem-picker-cat-section gem-picker-cat-section--not-collapsible gem-picker-cat-section--expanded">
                      <div class="gem-picker-list-table-wrapper"><table data-e-version="2" class="e-table e-table-condensed gem-picker-list-table" style="width:100%; font-size: 14px">
                        <thead>
                          <tr>
                            ${listThumbsOn ? '<th style="width:140px;">Preview</th>' : ''}
                            <th>Name</th>
                            <th style="width:160px;">${dateLabel}</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          ${renderTableRows(flatItems)}
                        </tbody>
                      </table></div>
                    </div>
                  `.trim();
                }
                return groupKeys.map((gKey) => {
                  const catItems = groupMap.get(gKey) || [];
                  catItems.sort((a, b) => compareSeenPickerItems(a, b, seenSortBy, seenSortDesc));

                  const headerHtml = renderGroupHeader(gKey, catItems.length);
                  const storageKey = `seen:${seenGroupBy}:${gKey === SEEN_LAST_USED_NONE ? SEEN_LAST_USED_NONE : (gKey || '')}`;
                  const isCollapsedRaw = !!collapse[storageKey];
                  const isCollapsed = seenTerms.length > 0
                    ? (storageKey in _gemSeenSearchCollapseOverride ? !!_gemSeenSearchCollapseOverride[storageKey] : false)
                    : isCollapsedRaw;
                  const sectionStateClass = isCollapsed ? 'gem-picker-cat-section--collapsed' : 'gem-picker-cat-section--expanded';
                  const sectionCollapseClass = 'gem-picker-cat-section--collapsible';
                  if (viewMode === 'grid') {
                    return `
                      <div class="gem-picker-cat-section ${sectionCollapseClass} ${sectionStateClass}">
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
                    <div class="gem-picker-cat-section ${sectionCollapseClass} ${sectionStateClass}">
                      ${headerHtml}
                      ${isCollapsed ? '' : `
                        <div class="gem-picker-list-table-wrapper"><table data-e-version="2" class="e-table e-table-condensed gem-picker-list-table" style="width:100%; font-size: 14px">
                          <thead>
                            <tr>
                              ${listThumbsOn ? '<th style="width:140px;">Preview</th>' : ''}
                              <th>Name</th>
                              <th style="width:160px;">${dateLabel}</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            ${renderTableRows(catItems)}
                          </tbody>
                        </table></div>
                      `}
                    </div>
                  `;
                }).join('');
              };

              // For content-only updates (search changes), preserve header and update only content
              if (opts.contentOnly && pickerContent.querySelector('.gem-image-list-header')) {
                const contentContainer = document.createElement('div');
                contentContainer.innerHTML = `
                  ${searchSummary}
                  ${seenTerms.length > 0 && filtered.length === 0 ? `<div class="gem-img-picker-search-results">No matches found for ${seenTermsDisplay}.</div>` : ''}
                  <div class="gem-img-picker-list-wrapper">
                  ${buildCategorySections()}
                  </div>
                  ${seenTerms.length === 0 ? empty : ''}
                `.trim();

                // Replace everything after the header
                const header = pickerContent.querySelector('.gem-image-list-header');
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
                    pickerContent.appendChild(contentContainer.firstChild);
                  }
                }
                const pillsContainerSeen = pickerContent.querySelector('.gem-search-pills[data-pills-source="seen"]');
                if (pillsContainerSeen) {
                  const seenPillsForUpdate = pillsForContext(picker._gemSearchPills, PILL_CTX_SEEN);
                  pillsContainerSeen.innerHTML = seenPillsForUpdate.map((p) => {
                    const active = !!p.active;
                    const term = (p && typeof p.term === 'string') ? p.term : '';
                    if (!term) return '';
                    const displayText = (p.label && p.isRegex) ? p.label : term;
                    const titleAttr = (p.label && p.isRegex) ? ` title="${escape(term)}"` : '';
                    const regexBadge = p.isRegex ? '<span class="gem-search-pill-regex" title="Regex">.*</span>' : '';
                    return `<span class="gem-search-pill ${active ? 'gem-search-pill--active' : ''}" data-term="${escape(term)}" data-index="${p._idx}"${titleAttr}><span class="gem-search-pill-remove" aria-label="Remove">×</span><span class="gem-search-pill-text">${escape(displayText)}</span>${regexBadge}</span>`;
                  }).filter(Boolean).join('');
                }
              } else {
                pickerContent.innerHTML = `
                  ${header}
                  ${searchSummary}
                  ${seenTerms.length > 0 && filtered.length === 0 ? `<div class="gem-img-picker-search-results">No matches found for ${seenTermsDisplay}.</div>` : ''}
                  <div class="gem-img-picker-list-wrapper">
                  ${buildCategorySections()}
                  </div>
                  ${seenTerms.length === 0 ? empty : ''}
                `.trim();
              }

              scheduleGemSearchPillSortableRefresh(picker, modal);
            });
            return;
          }

          }; // render

          render(list);
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
      overlay.className = 'gem-image-modal gem-favorite-image-meta-modal';
      overlay.innerHTML = `
        <div class="gem-image-modal__backdrop"></div>
        <div class="gem-image-modal__panel" role="dialog" aria-modal="true">
          <div class="gem-image-modal__header">
            <div style="font-weight:600;">Category</div>
            <button class="e-btn e-btn-borderless e-btn-onlyicon gem-image-modal__close" type="button" aria-label="Close">✕</button>
          </div>
          <div class="gem-image-modal__body">
            <div class="e-field">
              <label class="e-field__label">Name</label>
              <input class="e-input gem-fav-cat-name-input" type="text" value="${label.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />
            </div>
            <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
              <button class="e-btn e-btn-secondary gem-fav-cat-export" type="button">Copy JSON</button>
              <button class="e-btn e-btn-danger gem-fav-cat-unfav" type="button">Unfavorite All</button>
            </div>
          </div>
          <div class="gem-image-modal__footer">
            <div class="gem-image-modal__footer-left"></div>
            <div class="gem-image-modal__footer-right">
              <button class="e-btn cancel-btn gem-fav-cat-cancel" type="button">Cancel</button>
              <button class="e-btn e-btn-primary gem-fav-cat-save" type="button">Save</button>
            </div>
          </div>
        </div>
      `.trim();

      const host = modal || document.body;
      host.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelector('.gem-image-modal__backdrop')?.addEventListener('click', close);
      overlay.querySelector('.gem-image-modal__close')?.addEventListener('click', close);
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

    function buildGemImageModalPanelHTML(opts) {
      const {
        title = '',
        headerExtra = '',
        previewImgSrc = '',
        bodyHtml = '',
        footerLeftHtml = '',
        footerRightHtml = ''
      } = opts;
      const hasPreview = !!previewImgSrc;
      const safeImgSrc = (previewImgSrc || '').replace(/"/g, '&quot;');
      return `
        <div class="gem-image-modal__backdrop"></div>
        <div class="gem-image-modal__panel" role="dialog" aria-modal="true">
          <div class="gem-image-modal__header">
            <div style="font-weight:600;">${title}</div>
            ${headerExtra}
            <button class="e-btn e-btn-borderless e-btn-onlyicon gem-image-modal__close" type="button" aria-label="Close">✕</button>
          </div>
          <div class="gem-image-modal__content">
            ${hasPreview ? `<div class="gem-image-modal__preview gem-checkered-canvas"><img src="${safeImgSrc}" alt="" /></div>` : ''}
            <div class="gem-image-modal__body">${bodyHtml}</div>
          </div>
          <div class="gem-image-modal__footer">
            <div class="gem-image-modal__footer-left">${footerLeftHtml}</div>
            <div class="gem-image-modal__footer-right">${footerRightHtml}</div>
          </div>
        </div>
      `.trim();
    }

    function getImagePickerNavigableUrls(modal) {
      try {
        const pickerContent = modal && modal.querySelector ? modal.querySelector('#gem-image-picker-content') : null;
        if (!pickerContent) return [];
        const buttons = Array.from(pickerContent.querySelectorAll('.gem-recent-image-use-btn[data-url]'));
        const urls = [];
        const seen = new Set();
        buttons.forEach((btn) => {
          const raw = btn.getAttribute('data-url') || '';
          const u = normalizeRecentImageUrlCandidate(raw);
          if (!u || seen.has(u)) return;
          seen.add(u);
          urls.push(u);
        });
        return urls;
      } catch (_) {
        return [];
      }
    }

    function openRecentlySeenImageDetailsModal(modal, url) {
      const u = normalizeRecentImageUrlCandidate(url);
      if (!u) return;

      const existing = document.getElementById('gem-seen-image-details-modal');
      if (existing) existing.remove();

      getRecentlySeenImages((seenList) => {
        let seenArr = Array.isArray(seenList) ? seenList : [];
        const fallbackUrls = seenArr.map((x) => x && x.url).filter(Boolean);
        const pickerUrls = getImagePickerNavigableUrls(modal);
        let orderedUrls = pickerUrls.length > 0 ? pickerUrls : fallbackUrls;
        let currentUrl = u;
        if (!orderedUrls.includes(currentUrl) && orderedUrls.length > 0) currentUrl = orderedUrls[0];

        const footerLeftHtml = `
          <div class="gem-image-nav-group">
            <button class="e-btn e-btn-borderless e-btn-onlyicon gem-image-nav-btn gem-image-nav-prev" type="button" aria-label="Previous image" title="Previous image">‹</button>
            <button class="e-btn e-btn-borderless e-btn-onlyicon gem-image-nav-btn gem-image-nav-next" type="button" aria-label="Next image" title="Next image">›</button>
          </div>
          <button class="e-btn e-btn-borderless e-btn-onlyicon gem-seen-image-details-favtoggle" type="button" aria-label="Favorite" title="Favorite">
            <span class="gem-recent-image-star">☆</span>
          </button>
        `.trim();

        const footerRightHtml = `
          <button class="e-btn e-btn-secondary gem-seen-image-details-remove" type="button">Remove</button>
          <button class="e-btn gem-seen-image-details-cancel" type="button">Cancel</button>
          <button class="e-btn e-btn-primary gem-seen-image-details-add-to-page" type="button">Insert</button>
        `.trim();

        const overlay = document.createElement('div');
        overlay.id = 'gem-seen-image-details-modal';
        overlay.className = 'gem-image-modal gem-seen-image-details-modal';
        overlay.innerHTML = buildGemImageModalPanelHTML({
          title: 'Image Details',
          previewImgSrc: currentUrl,
          bodyHtml: `
            <div class="gem-image-modal__metadata">
              <div class="e-field"><label class="e-field__label">URL</label><div class="gem-image-modal__url gem-seen-details-url"></div></div>
              <div class="e-field gem-seen-details-filename-row"><label class="e-field__label">Name</label><div class="gem-seen-details-filename" style="word-wrap: break-word;"></div></div>
              <div class="e-field gem-seen-details-path-row"><label class="e-field__label">Path</label><div class="gem-seen-details-path"></div></div>
              <div class="e-field"><label class="e-field__label">Last Seen</label><div class="gem-seen-details-last-seen"></div></div>
              <div class="e-field"><label class="e-field__label">Last Used</label><div class="gem-seen-details-last-used"></div></div>
            </div>
          `.trim(),
          footerLeftHtml,
          footerRightHtml
        });
        document.body.appendChild(overlay);

        const onWindowKeydown = (e) => {
          if (!overlay.isConnected) return;
          if (e.key === 'Escape') {
            closeModal();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (e.key === 'ArrowLeft') {
            navToOffset(-1);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (e.key === 'ArrowRight') {
            navToOffset(1);
            e.preventDefault();
            e.stopPropagation();
          }
        };
        const closeModal = () => {
          try { window.removeEventListener('keydown', onWindowKeydown, true); } catch (_) {}
          overlay.remove();
        };
        const getIndex = () => orderedUrls.indexOf(currentUrl);
        const navToOffset = (delta) => {
          const idx = getIndex();
          if (idx < 0) return;
          const nextIdx = idx + delta;
          if (nextIdx < 0 || nextIdx >= orderedUrls.length) return;
          currentUrl = orderedUrls[nextIdx];
          renderCurrent();
        };

        const renderCurrent = () => {
          const seenItem = seenArr.find((x) => x && x.url === currentUrl) || { url: currentUrl, ts: Date.now(), path: '', friendlyFilename: '' };
          const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const filename = seenItem.friendlyFilename || '';
          const path = seenItem.path || '';
          const lastUsedTs = typeof seenItem.lastUsed === 'number' ? seenItem.lastUsed : null;
          const img = overlay.querySelector('.gem-image-modal__preview img');
          if (img) img.src = currentUrl;
          const urlEl = overlay.querySelector('.gem-seen-details-url');
          if (urlEl) urlEl.innerHTML = esc(currentUrl);
          const filenameRow = overlay.querySelector('.gem-seen-details-filename-row');
          const filenameEl = overlay.querySelector('.gem-seen-details-filename');
          if (filenameRow) filenameRow.style.display = filename ? '' : 'none';
          if (filenameEl) filenameEl.innerHTML = esc(filename);
          const pathRow = overlay.querySelector('.gem-seen-details-path-row');
          const pathEl = overlay.querySelector('.gem-seen-details-path');
          if (pathRow) pathRow.style.display = path ? '' : 'none';
          if (pathEl) pathEl.innerHTML = esc(path);
          const lastSeenEl = overlay.querySelector('.gem-seen-details-last-seen');
          if (lastSeenEl) lastSeenEl.textContent = formatRecentImageDate(seenItem.ts || 0);
          const lastUsedEl = overlay.querySelector('.gem-seen-details-last-used');
          if (lastUsedEl) lastUsedEl.textContent = lastUsedTs != null ? formatRecentImageDate(lastUsedTs) : '—';

          getFavoriteImages((favList) => {
            const favSet = new Set((Array.isArray(favList) ? favList : []).map((x) => x && x.url).filter(Boolean));
            const nowFav = favSet.has(currentUrl);
            const btn = overlay.querySelector('.gem-seen-image-details-favtoggle');
            if (btn) {
              btn.setAttribute('aria-label', nowFav ? 'Unfavorite' : 'Favorite');
              btn.setAttribute('title', nowFav ? 'Unfavorite' : 'Favorite');
              const starEl = btn.querySelector('.gem-recent-image-star');
              if (starEl) starEl.textContent = nowFav ? '★' : '☆';
            }
          });

          const idx = getIndex();
          const prevBtn = overlay.querySelector('.gem-image-nav-prev');
          const nextBtn = overlay.querySelector('.gem-image-nav-next');
          const canPrev = idx > 0;
          const canNext = idx >= 0 && idx < orderedUrls.length - 1;
          if (prevBtn) prevBtn.disabled = !canPrev;
          if (nextBtn) nextBtn.disabled = !canNext;
        };

        overlay.addEventListener('click', (e) => {
          if (e.target === overlay || e.target.classList.contains('gem-image-modal__backdrop') || e.target.classList.contains('gem-image-modal__close')) {
            closeModal();
          }
        });
        overlay.querySelector('.gem-seen-image-details-cancel')?.addEventListener('click', closeModal);
        overlay.querySelector('.gem-seen-image-details-add-to-page')?.addEventListener('click', () => {
          insertImageUrlIntoImagePropertiesModal(modal, currentUrl);
          closeModal();
        });
        overlay.querySelector('.gem-seen-image-details-remove')?.addEventListener('click', () => {
          const prevIdx = orderedUrls.indexOf(currentUrl);
          const nextSeen = (Array.isArray(seenArr) ? seenArr : []).filter((x) => x && x.url !== currentUrl);
          saveRecentlySeenImages(nextSeen, () => {
            seenArr = nextSeen;
            orderedUrls = (Array.isArray(orderedUrls) ? orderedUrls : []).filter((x) => x && x !== currentUrl);
            if (orderedUrls.length === 0) {
              closeModal();
              showRecentImagesPicker(modal);
              return;
            }
            const fallbackIdx = Math.max(0, Math.min(prevIdx, orderedUrls.length - 1));
            currentUrl = orderedUrls[fallbackIdx] || orderedUrls[0];
            renderCurrent();
            showRecentImagesPicker(modal);
          });
        });
        overlay.querySelector('.gem-seen-image-details-favtoggle')?.addEventListener('click', () => {
          toggleFavoriteImageUrl(currentUrl, () => renderCurrent());
        });
        overlay.querySelector('.gem-image-nav-prev')?.addEventListener('click', () => navToOffset(-1));
        overlay.querySelector('.gem-image-nav-next')?.addEventListener('click', () => navToOffset(1));
        window.addEventListener('keydown', onWindowKeydown, true);

        renderCurrent();
        const closeBtn = overlay.querySelector('.gem-image-modal__close');
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
          const language = (meta.language || '');
          const altText = (meta.altText || '');
          const translation = (meta.translation || '');
          const width = (meta.width || '');
          const friendlyFilename = (meta.friendlyFilename || '');
          const startingUrl = mode === 'create' ? '' : u;
          const orderedUrls = mode === 'edit' ? (() => {
            const fromPicker = getImagePickerNavigableUrls(modal);
            if (fromPicker.length > 0) return fromPicker;
            return (Array.isArray(favList) ? favList : []).map((x) => x && x.url).filter(Boolean);
          })() : [];
          let currentUrl = startingUrl;
          if (mode === 'edit' && !orderedUrls.includes(currentUrl) && orderedUrls.length > 0) {
            currentUrl = orderedUrls[0];
          }

        const headerExtra = mode === 'create' ? `
          <div class="gem-modal-mode-tabs">
            <button class="gem-modal-mode-tab gem-modal-mode-tab--active" data-mode="manual" type="button">Manual Entry</button>
            <button class="gem-modal-mode-tab" data-mode="json" type="button">JSON Import</button>
          </div>
        ` : '';

        const metaFieldsHtml = `
          <div class="e-field gem-favorite-image-meta-filename-row" ${friendlyFilename ? '' : 'style="display:none;"'}>
            <label class="e-field__label">Name</label>
            <div class="gem-image-modal__url gem-favorite-image-meta-filename">${String(friendlyFilename).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>
          <div class="e-field">
            <label class="e-field__label">Category</label>
            <input class="e-input gem-favorite-image-meta-category" type="text" value="${String(category).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />
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
        `.trim();

        const bodyHtml = mode === 'edit'
          ? `
            <div class="e-field">
              <label class="e-field__label">URL</label>
              <div class="gem-image-modal__url">${u.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
            ${metaFieldsHtml}
          `.trim()
          : `
            <div class="gem-modal-content gem-modal-content--manual gem-modal-content--active">
              <div class="e-field">
                <label class="e-field__label">Image URL</label>
                <input class="e-input gem-favorite-image-meta-url" type="text" value="" placeholder="https://example.com/image.png" />
              </div>
              ${metaFieldsHtml}
            </div>
            <div class="gem-modal-content gem-modal-content--json">
              <div class="e-field">
                <label class="e-field__label">JSON Import</label>
                <textarea class="e-input gem-favorite-image-meta-json" rows="12" placeholder='Paste JSON array of favorite images, e.g.:\n[\n  {\n    "url": "https://example.com/image1.jpg",\n    "category": "product",\n    "altText": "Beautiful summer dress"\n  },\n  {\n    "url": "https://example.com/image2.jpg",\n    "category": "banner",\n    "altText": "Hero banner"\n  }\n]'></textarea>
              </div>
              <div style="font-size: 14px; color: var(--token-comment); margin-top: 8px;">
                Import multiple favorite images at once using JSON format. All metadata fields are optional.
              </div>
            </div>
          `.trim();

        const footerLeftHtml = mode === 'edit' ? `
          <div class="gem-image-nav-group">
            <button class="e-btn e-btn-borderless e-btn-onlyicon gem-image-nav-btn gem-image-nav-prev" type="button" aria-label="Previous image" title="Previous image">‹</button>
            <button class="e-btn e-btn-borderless e-btn-onlyicon gem-image-nav-btn gem-image-nav-next" type="button" aria-label="Next image" title="Next image">›</button>
          </div>
          <button class="e-btn e-btn-borderless e-btn-onlyicon gem-favorite-image-meta-favtoggle" type="button" aria-label="${isFav ? 'Unfavorite' : 'Favorite'}" title="${isFav ? 'Unfavorite' : 'Favorite'}">
            <span class="gem-recent-image-star">${isFav ? '★' : '☆'}</span>
          </button>
        ` : '';

        const footerRightHtml = `
          <button class="e-btn cancel-btn gem-favorite-image-meta-cancel" type="button">Cancel</button>
          <button class="e-btn e-btn-primary gem-favorite-image-meta-save" type="button">Save</button>
        `.trim();

        const overlay = document.createElement('div');
        overlay.id = 'gem-favorite-image-meta-modal';
        overlay.className = 'gem-image-modal gem-favorite-image-meta-modal';
        overlay.innerHTML = buildGemImageModalPanelHTML({
          title: mode === 'create' ? 'Add Favorite Image' : 'Edit Image Metadata',
          headerExtra,
          previewImgSrc: mode === 'edit' ? currentUrl : '',
          bodyHtml,
          footerLeftHtml,
          footerRightHtml
        });

        const host = modal || document.body;
        host.appendChild(overlay);

        const onWindowKeydown = (e) => {
          if (!overlay.isConnected) return;
          if (e.key === 'Escape') {
            close();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (mode !== 'edit') return;
          const t = e.target;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
          if (e.key === 'ArrowLeft') {
            navMetaToOffset(-1);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (e.key === 'ArrowRight') {
            navMetaToOffset(1);
            e.preventDefault();
            e.stopPropagation();
          }
        };
        const close = () => {
          try { window.removeEventListener('keydown', onWindowKeydown, true); } catch (_) {}
          overlay.remove();
        };
        overlay.querySelector('.gem-image-modal__backdrop')?.addEventListener('click', close);
        overlay.querySelector('.gem-image-modal__close')?.addEventListener('click', close);
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

        const renderCurrentMeta = () => {
          if (mode !== 'edit') return;
          const targetUrl = currentUrl;
          const img = overlay.querySelector('.gem-image-modal__preview img');
          if (img) img.src = targetUrl;
          const urlEl = overlay.querySelector('.gem-image-modal__url');
          if (urlEl) {
            urlEl.innerHTML = targetUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          }
          getFavoriteImageMetaMap((liveMap) => {
            const liveMeta = (liveMap && typeof liveMap === 'object' && liveMap[targetUrl]) ? liveMap[targetUrl] : {};
            const catInput = overlay.querySelector('.gem-favorite-image-meta-category');
            const langInput = overlay.querySelector('.gem-favorite-image-meta-language');
            const altInput = overlay.querySelector('.gem-favorite-image-meta-alttext');
            const trnInput = overlay.querySelector('.gem-favorite-image-meta-translation');
            const widthInput = overlay.querySelector('.gem-favorite-image-meta-width');
            const filenameRow = overlay.querySelector('.gem-favorite-image-meta-filename-row');
            const filenameEl = overlay.querySelector('.gem-favorite-image-meta-filename');
            if (catInput) catInput.value = liveMeta.category || '';
            if (langInput) langInput.value = liveMeta.language || '';
            if (altInput) altInput.value = liveMeta.altText || '';
            if (trnInput) trnInput.value = liveMeta.translation || '';
            if (widthInput) widthInput.value = liveMeta.width || '';
            const ff = (typeof liveMeta.friendlyFilename === 'string') ? liveMeta.friendlyFilename.trim() : '';
            if (filenameRow) filenameRow.style.display = ff ? '' : 'none';
            if (filenameEl) filenameEl.textContent = ff;
          });
          getFavoriteImages((liveFavList) => {
            const liveSet = new Set((Array.isArray(liveFavList) ? liveFavList : []).map((x) => x && x.url).filter(Boolean));
            const nowFav = liveSet.has(targetUrl);
            const btn = overlay.querySelector('.gem-favorite-image-meta-favtoggle');
            if (btn) {
              btn.setAttribute('aria-label', nowFav ? 'Unfavorite' : 'Favorite');
              btn.setAttribute('title', nowFav ? 'Unfavorite' : 'Favorite');
              const starEl = btn.querySelector('.gem-recent-image-star');
              if (starEl) starEl.textContent = nowFav ? '★' : '☆';
            }
          });
          const idx = orderedUrls.indexOf(currentUrl);
          const prevBtn = overlay.querySelector('.gem-image-nav-prev');
          const nextBtn = overlay.querySelector('.gem-image-nav-next');
          if (prevBtn) prevBtn.disabled = !(idx > 0);
          if (nextBtn) nextBtn.disabled = !(idx >= 0 && idx < orderedUrls.length - 1);
        };

        const navMetaToOffset = (delta) => {
          if (mode !== 'edit') return;
          const idx = orderedUrls.indexOf(currentUrl);
          if (idx < 0) return;
          const nextIdx = idx + delta;
          if (nextIdx < 0 || nextIdx >= orderedUrls.length) return;
          currentUrl = orderedUrls[nextIdx];
          renderCurrentMeta();
        };

        overlay.querySelector('.gem-favorite-image-meta-favtoggle')?.addEventListener('click', () => {
          const targetUrl = mode === 'edit' ? currentUrl : startingUrl;
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
        overlay.querySelector('.gem-image-nav-prev')?.addEventListener('click', () => navMetaToOffset(-1));
        overlay.querySelector('.gem-image-nav-next')?.addEventListener('click', () => navMetaToOffset(1));

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
              : currentUrl;
            const targetUrl = normalizeRecentImageUrlCandidate(rawUrl);
            if (!targetUrl) {
              alert('Please enter a valid image URL.');
              return;
            }
            const cat = overlay.querySelector('.gem-favorite-image-meta-category')?.value || '';
            const lang = overlay.querySelector('.gem-favorite-image-meta-language')?.value || '';
            const alt = overlay.querySelector('.gem-favorite-image-meta-alttext')?.value || '';
            const trn = overlay.querySelector('.gem-favorite-image-meta-translation')?.value || '';
            const widthRaw = overlay.querySelector('.gem-favorite-image-meta-width')?.value || '';
            const widthNum = parseInt(String(widthRaw || '').trim(), 10);
            const widthClean = Number.isFinite(widthNum) && widthNum > 0 ? Math.trunc(widthNum) : '';

            const incoming = {
              category: (cat || '').trim(),
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
                    language: incoming.language || (existing.language || ''),
                    altText: incoming.altText || (existing.altText || ''),
                    translation: incoming.translation || (existing.translation || ''),
                    width: (incoming.width !== '' ? incoming.width : (existing.width || '')),
                    friendlyFilename: (typeof existing.friendlyFilename === 'string') ? existing.friendlyFilename : ''
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

        window.addEventListener('keydown', onWindowKeydown, true);

        if (mode === 'edit') renderCurrentMeta();
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
        try {
          rehomeGemMediaDbPaneToPool();
          unbindGemMediaDbPickerIframeDocClick();
          gemMediaDbIframeClickModalRef = null;
        } catch (_) {}
        try { container._gemContainerObserver && container._gemContainerObserver.disconnect(); } catch (_) {}
        try { container._gemAccordionObserver && container._gemAccordionObserver.disconnect(); } catch (_) {}
        try { container._gemHtmlEditorObserver && container._gemHtmlEditorObserver.disconnect(); } catch (_) {}
        try { container._gemRecentImagesCmObserver && container._gemRecentImagesCmObserver.disconnect(); } catch (_) {}
        try { container._gemRecentImagesButtonObserver && container._gemRecentImagesButtonObserver.disconnect(); } catch (_) {}
        try { container._gemModalDetachObserver && container._gemModalDetachObserver.disconnect(); } catch (_) {}
        try { container._gemPreviewRemovalObserver && container._gemPreviewRemovalObserver.disconnect(); } catch (_) {}
        try { container._gemPreviewTabStateObserver && container._gemPreviewTabStateObserver.disconnect(); } catch (_) {}
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
        container._gemPreviewTabStateObserver = null;
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
      container.style.maxWidth = '480px';
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
        const active = modal.querySelector('.e-tabs__title.e-tabs__title-active[data-tab="mobile"], .e-tabs__title.e-tabs__title-active[data-tab="desktop"]');
        const domTab = active && active.getAttribute('data-tab');
        if (domTab === 'mobile') return 'mobile';
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

      const getMobilePreviewVisibilityMode = () => {
        const sameRadio = modal.querySelector('#imageVisibilitySwitch_showImageOnMobile');
        const hideRadio = modal.querySelector('#imageVisibilitySwitch_hideImageOnMobile');
        const altRadio = modal.querySelector('#imageVisibilitySwitch_useAlternateImage');
        if (!sameRadio && !hideRadio && !altRadio) return null;
        if (altRadio && altRadio.checked) return 'alternate';
        if (hideRadio && hideRadio.checked) return 'hide';
        if (sameRadio && sameRadio.checked) return 'same';
        return null;
      };

      const getMobileAlternatePreviewUrl = () => {
        const altRadio = modal.querySelector('#imageVisibilitySwitch_useAlternateImage');
        let scopedCm = null;
        let scope = altRadio;
        while (!scopedCm && scope && scope !== modal) {
          scopedCm = scope.querySelector && scope.querySelector('vce-codemirror[html]');
          scope = scope.parentElement;
        }
        const cmHtml = ((scopedCm || modal.querySelector('vce-codemirror[html]'))?.getAttribute('html') || '').trim();
        const fromAttr = normalizePreviewImageUrl(cmHtml);
        if (fromAttr) return fromAttr;
        const { value } = getActiveImageUrlCodeMirror(modal);
        return normalizePreviewImageUrl(value);
      };

      const inferPreviewTabFromEditor = (htmlEditorEl) => {
        if (!htmlEditorEl) return null;
        const scope = htmlEditorEl.closest && htmlEditorEl.closest('.e-dialog__content');
        const root = scope || htmlEditorEl;
        const hasMobileVisibilityControls = !!(root.querySelector && root.querySelector('#imageVisibilitySwitch_showImageOnMobile, #imageVisibilitySwitch_hideImageOnMobile, #imageVisibilitySwitch_useAlternateImage'));
        return hasMobileVisibilityControls ? 'mobile' : 'desktop';
      };

      const storeTrackedImageUrlForTab = (tab, rawUrl) => {
        const normalized = normalizeRecentImageUrlCandidate(rawUrl);
        if (!normalized) {
          logLastUsedDebug('storeTrackedImageUrlForTab skipped invalid URL', { tab, rawUrl });
          return;
        }
        const stateHost = modal;
        if (tab === 'mobile') {
          stateHost._gemPendingLastUsedImageUrlMobile = normalized;
        } else {
          stateHost._gemPendingLastUsedImageUrlDesktop = normalized;
        }
        logLastUsedDebug('storeTrackedImageUrlForTab stored', {
          tab,
          rawUrl,
          normalized,
          pendingDesktop: stateHost._gemPendingLastUsedImageUrlDesktop || '',
          pendingMobile: stateHost._gemPendingLastUsedImageUrlMobile || ''
        });
      };

      const getTrackedImageUrlsForCommit = () => {
        const urls = new Set();
        const sources = [];
        const add = (value, source) => {
          const normalized = normalizeRecentImageUrlCandidate(value);
          if (!normalized) {
            if (value) {
              sources.push({ source, raw: String(value), normalized: '' });
            }
            return;
          }
          urls.add(normalized);
          sources.push({ source, raw: String(value), normalized });
        };
        add(modal._gemPendingLastUsedImageUrlDesktop, 'pendingDesktop');
        add(modal._gemPendingLastUsedImageUrlMobile, 'pendingMobile');
        // Preview cache is tab-scoped and survives editor/tab re-renders.
        add(container._gemPreviewImgUrlDesktop, 'previewDesktop');
        add(container._gemPreviewImgUrlMobile, 'previewMobile');
        const { value: activeEditorValue } = getActiveImageUrlCodeMirror(modal);
        add(activeEditorValue, 'activeEditor');
        const committedUrls = Array.from(urls);
        logLastUsedDebug('getTrackedImageUrlsForCommit', {
          activePreviewTab: getActivePreviewTab(),
          pendingDesktop: modal._gemPendingLastUsedImageUrlDesktop || '',
          pendingMobile: modal._gemPendingLastUsedImageUrlMobile || '',
          previewDesktop: container._gemPreviewImgUrlDesktop || '',
          previewMobile: container._gemPreviewImgUrlMobile || '',
          activeEditorValue: activeEditorValue || '',
          sources,
          committedUrls
        });
        return committedUrls;
      };

      const syncMobilePreviewSourceFromControls = () => {
        ensurePreviewImgs();
        const mobileMode = getMobilePreviewVisibilityMode();
        const desktopSrcAttr = normalizePreviewImageUrl(previewImgDesktop.getAttribute('src') || '');
        const dUrl = desktopSrcAttr || container._gemPreviewImgUrlDesktop || '';
        let nextMobileUrl = normalizePreviewImageUrl(previewImgMobile.getAttribute('src') || '') || container._gemPreviewImgUrlMobile || '';

        if (mobileMode === 'alternate') {
          const mobileAltUrl = getMobileAlternatePreviewUrl();
          if (mobileAltUrl) nextMobileUrl = mobileAltUrl;
        } else if (mobileMode === 'same') {
          const desktopUrlForMobile = desktopSrcAttr || dUrl;
          if (desktopUrlForMobile) nextMobileUrl = desktopUrlForMobile;
        }

        if (nextMobileUrl) {
          container._gemPreviewImgUrlMobile = nextMobileUrl;
          if ((previewImgMobile.getAttribute('src') || '') !== nextMobileUrl) {
            previewImgMobile.setAttribute('src', nextMobileUrl);
          }
        }
      };

      const syncPreviewVisibilityToTab = () => {
        ensurePreviewImgs();
        const active = getActivePreviewTab();
        const desktopSrcAttr = normalizePreviewImageUrl(previewImgDesktop.getAttribute('src') || '');
        const dUrl = desktopSrcAttr || container._gemPreviewImgUrlDesktop || '';
        const mUrl = normalizePreviewImageUrl(previewImgMobile.getAttribute('src') || '') || container._gemPreviewImgUrlMobile || '';
        const mobileMode = active === 'mobile' ? getMobilePreviewVisibilityMode() : null;

        // Only show the image for the active tab if it has a URL
        const desktopShouldShow = active === 'desktop' && !!dUrl;
        const mobileShouldShow = active === 'mobile' && mobileMode !== 'hide' && !!mUrl;
        previewImgDesktop.style.display = desktopShouldShow ? 'block' : 'none';
        previewImgMobile.style.display = mobileShouldShow ? 'block' : 'none';

        previewLog('preview visibility', {
          debugId: container._gemPreviewDebugId,
          active,
          mobileMode,
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
      ensureImageAltTextSwapButton(modal);

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

      // React to real tab state changes (active class), not click intent.
      if (!container._gemPreviewTabStateObserver) {
        container._gemPreviewTabStateObserver = new MutationObserver((mutations) => {
          if (container._gemIsClosing || !container.isConnected || !modal.isConnected) return;
          let shouldSync = false;

          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
              const target = mutation.target;
              if (target && target.matches && target.matches('.e-tabs__title[data-tab="desktop"], .e-tabs__title[data-tab="mobile"]')) {
                shouldSync = true;
                break;
              }
            }
          }

          if (!shouldSync) return;
          setTimeout(() => {
            if (getActivePreviewTab() === 'mobile') {
              syncMobilePreviewSourceFromControls();
            }
            ensurePreviewCanvasPlacement();
            syncPreviewVisibilityToTab();
            ensureImageAltTextSwapButton(modal);
          }, 0);
        });

        try {
          container._gemPreviewTabStateObserver.observe(modal, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
          });
        } catch (_) {}
      }

      // Keep the mobile preview in sync with Image Visibility radio changes.
      if (!container._gemPreviewMobileVisibilityBound) {
        container._gemPreviewMobileVisibilityBound = true;
        modal.addEventListener('change', (e) => {
          const target = e.target;
          if (!(target instanceof HTMLElement)) return;
          if (!target.matches('#imageVisibilitySwitch_showImageOnMobile, #imageVisibilitySwitch_hideImageOnMobile, #imageVisibilitySwitch_useAlternateImage')) return;
          setTimeout(() => {
            syncMobilePreviewSourceFromControls();
            ensurePreviewCanvasPlacement();
            syncPreviewVisibilityToTab();
            ensureImageAltTextSwapButton(modal);
            refreshSelectedImageMatchesInPicker(modal);
          }, 0);
        }, true);
      }

      // Recent Images panel is always visible now.
      // Track first-open time so storage-driven seen-list refreshes can be ignored
      // for a brief stabilization window and not steal the first click.
      container._gemRecentImagesPickerOpenedAt = Date.now();
      showRecentImagesPicker(modal);
      refreshSelectedImageMatchesInPicker(modal);

      if (!container._gemSelectedImageRealtimeBound) {
        container._gemSelectedImageRealtimeBound = true;
        modal.addEventListener('input', (e) => {
          const target = e.target;
          if (!(target instanceof HTMLElement)) return;
          if (
            target.matches('vce-codemirror textarea') ||
            !!target.closest('vce-codemirror .CodeMirror')
          ) {
            refreshSelectedImageMatchesInPicker(modal);
          }
        }, true);
      }

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
            ensureImageAltTextSwapButton(modal);
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

            // Keep Recently Seen max setting in sync (source of truth is sync storage)
            if (namespace === 'sync' && changes && changes[GEM_RECENTLY_SEEN_IMAGES_MAX_SETTING_KEY]) {
              recentlySeenMax = normalizeRecentlySeenMax(changes[GEM_RECENTLY_SEEN_IMAGES_MAX_SETTING_KEY].newValue);
            }

            // Live-sync search pills when edited externally (e.g. settings panel)
            if (changes && (
              (namespace === 'sync' && changes[GEM_SEARCH_PILLS_KEY]) ||
              (namespace === 'local' && changes[GEM_SEARCH_PILL_ACTIVE_KEY])
            )) {
              if (!container._gemIsClosing && container.isConnected && modal.isConnected) {
                const picker = modal.querySelector('#gem-recent-images-picker');
                if (picker) {
                  chrome.storage.sync.get({ [GEM_SEARCH_PILLS_KEY]: [] }, (sr) => {
                    chrome.storage.local.get({ [GEM_SEARCH_PILL_ACTIVE_KEY]: {} }, (lr) => {
                      picker._gemSearchPills = hydratePills(sr[GEM_SEARCH_PILLS_KEY], lr[GEM_SEARCH_PILL_ACTIVE_KEY]);
                      showRecentImagesPicker(modal, { contentOnly: true });
                    });
                  });
                }
              }
            }

            if (!changes || !changes.gemRecentlySeenImages) return;
            if (container._gemIsClosing || !container.isConnected || !modal.isConnected) return;
            const picker = modal.querySelector('#gem-recent-images-picker');
            if (!picker) return;
            if (picker.dataset.gemRecentImagesSource !== 'seen') return;
            const openedAt = Number(container._gemRecentImagesPickerOpenedAt || 0);
            if (openedAt > 0 && (Date.now() - openedAt) < 500) return;
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

      // Function to update preview image in a specific tab context (desktop/mobile have distinct <img>)
      const updateImageInPreviewCanvas = (rawUrl, preferredTab = null) => {
        const imageUrl = normalizePreviewImageUrl(rawUrl);
        console.log("[Gem] Updating image in preview canvas:", imageUrl);
        previewLog('updateImageInPreviewCanvas', { debugId: container._gemPreviewDebugId, rawUrl, imageUrl, preferredTab });

        const targetTab = preferredTab === 'mobile' || preferredTab === 'desktop'
          ? preferredTab
          : getActivePreviewTab();

        if (imageUrl && imageUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) && imageUrl !== 'null') {
          // Ensure the canvas is in the active tab content before manipulating DOM
          ensurePreviewCanvasPlacement();
          ensurePreviewImgs();

          const key = targetTab === 'mobile' ? '_gemPreviewImgUrlMobile' : '_gemPreviewImgUrlDesktop';
          const img = targetTab === 'mobile' ? previewImgMobile : previewImgDesktop;
          const lastUrl = container[key] || '';
          const currentSrcAttr = img.getAttribute('src') || '';
          // Only set src when it truly changed (prevents unnecessary re-requests).
          previewLog('preview src check', { debugId: container._gemPreviewDebugId, targetTab, key, lastUrl, currentSrcAttr, next: imageUrl });
          if (lastUrl !== imageUrl || currentSrcAttr !== imageUrl) {
            container[key] = imageUrl;
            img.setAttribute('src', imageUrl);
            previewLog('preview src set', { debugId: container._gemPreviewDebugId, targetTab, src: imageUrl });
            previewLog('img src attribute set', { debugId: container._gemPreviewDebugId, targetTab, url: imageUrl, imgSrc: img.src });
            // Image sizing no longer needed
          }
          syncPreviewVisibilityToTab();
          refreshSelectedImageMatchesInPicker(modal);
        } else {
          // Hide the relevant tab image if URL is not valid or null (disabled state)
          if (targetTab === 'mobile' && previewImgMobile) previewImgMobile.style.display = 'none';
          if (targetTab === 'desktop' && previewImgDesktop) previewImgDesktop.style.display = 'none';
          previewLog('preview hidden (invalid url)', { debugId: container._gemPreviewDebugId, targetTab, imageUrl });
          refreshSelectedImageMatchesInPicker(modal);
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
        updateImageInPreviewCanvas(imageUrl, inferPreviewTabFromEditor(htmlEditor));
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
              const tabContext = inferPreviewTabFromEditor(target);

              console.log("[Gem] vce-html-editor attribute changed:", mutation.attributeName, "disabled:", hasDisabledClass);
              previewLog('htmlEditor mutation', { debugId: container._gemPreviewDebugId, attr: mutation.attributeName, disabled: hasDisabledClass, htmlAttr: target.getAttribute('html'), newImageUrl, tabContext });

              if (hasDisabledClass) {
                // Mobile "Show same image" can disable the mobile URL editor; in that case
                // derive preview from visibility controls instead of hiding it.
                if (tabContext === 'mobile') {
                  syncMobilePreviewSourceFromControls();
                  ensurePreviewCanvasPlacement();
                  syncPreviewVisibilityToTab();
                  refreshSelectedImageMatchesInPicker(modal);
                } else {
                  // Desktop disabled means hide desktop preview.
                  updateImageInPreviewCanvas(null, tabContext);
                }
              } else if (newImageUrl) {
                // If not disabled and has URL, update image
                updateImageInPreviewCanvas(newImageUrl, tabContext);
                // Track values for commit-time "Last Used" updates.
                storeTrackedImageUrlForTab(tabContext, newImageUrl);
                refreshSelectedImageMatchesInPicker(modal);
              } else if (tabContext === 'mobile') {
                // Keep mobile preview aligned with radio state even when no direct URL is present.
                syncMobilePreviewSourceFromControls();
                ensurePreviewCanvasPlacement();
                syncPreviewVisibilityToTab();
                refreshSelectedImageMatchesInPicker(modal);
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
          const tabContext = inferPreviewTabFromEditor(htmlEditor);
          updateImageInPreviewCanvas(currentImageUrl, tabContext);
          storeTrackedImageUrlForTab(tabContext, currentImageUrl);
          refreshSelectedImageMatchesInPicker(modal);
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

            // Desktop tab content can be re-rendered independently; keep alt-text swap button injected.
            ensureImageAltTextSwapButton(modal);
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

      if (!modal._gemLastUsedCommitBound) {
        modal._gemLastUsedCommitBound = true;
        modal.addEventListener('click', (e) => {
          const target = e.target;
          if (!(target instanceof Element)) return;
          const okButton = target.closest('.e-dialog__container button.ok-btn');
          if (!okButton) return;
          const urls = getTrackedImageUrlsForCommit();
          logLastUsedDebug('OK clicked; committing lastUsed URLs', { urls, buttonText: (okButton.textContent || '').trim() });
          recordImagesLastUsed(urls);
        }, true);
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

      // Do not auto-capture existing URL values on open.
      // "Recently used" should only update from explicit image insert/edit actions.

      console.log("[Gem] Image Properties modal modification complete");
    }

    function scheduleImagePropertiesModalInit(modal, source = '') {
      if (!modal || modal.nodeType !== Node.ELEMENT_NODE) return;
      if (!isImagePropertiesModal(modal)) return;
      if (modal._gemImagePropsModifyScheduled) return;
      modal._gemImagePropsModifyScheduled = true;
      if (source) {
        console.log(`[Gem] Image Properties modal detected (${source})`);
      } else {
        console.log("[Gem] Image Properties modal detected");
      }
      setTimeout(() => {
        try {
          modal._gemImagePropsModifyScheduled = false;
          if (!modal.isConnected) return;
          modifyImagePropertiesModal(modal);
        } catch (_) {
          modal._gemImagePropsModifyScheduled = false;
        }
      }, 100);
    }

    function collectImagePropertiesModalCandidates(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return [];
      const out = [];
      const seen = new Set();
      const add = (el) => {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
        if (seen.has(el)) return;
        seen.add(el);
        out.push(el);
      };

      if (node.matches && node.matches('.e-float-container-default')) {
        add(node);
      }
      if (node.querySelectorAll) {
        node.querySelectorAll('.e-float-container-default').forEach(add);
      }

      const titleNodes = [];
      if (node.matches && node.matches('span.e-dialog__title')) {
        titleNodes.push(node);
      }
      if (node.querySelectorAll) {
        node.querySelectorAll('span.e-dialog__title').forEach((n) => titleNodes.push(n));
      }
      titleNodes.forEach((span) => {
        if ((span.textContent || '').trim() !== 'Image Properties') return;
        const modalElement = span.closest('.e-float-container-default') ||
                             span.closest('.e-dialog-active') ||
                             span.closest('[class*="dialog"]');
        add(modalElement);
      });

      return out;
    }

    // Single deterministic watcher for Image Properties modal lifecycle.
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          const candidates = collectImagePropertiesModalCandidates(node);
          candidates.forEach((candidate) => scheduleImagePropertiesModalInit(candidate, 'mutation'));
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial check for already-rendered modals (single pass; no interval polling).
    try {
      const existingModals = Array.from(document.querySelectorAll('.e-float-container-default'));
      existingModals.forEach((modal) => scheduleImagePropertiesModalInit(modal, 'initial-scan'));
    } catch (_) {}

    console.log("[Gem] Image Properties modal handler initialized");
  }

  // Initialize the Image Properties modal handler
  initializeImagePropertiesModalHandler();
  if (typeof initializeFavoriteFilenameSyncFromRecentlySeen === 'function') {
    initializeFavoriteFilenameSyncFromRecentlySeen();
  } else if (typeof window.initializeFavoriteFilenameSyncFromRecentlySeen === 'function') {
    window.initializeFavoriteFilenameSyncFromRecentlySeen();
  }

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
    const readyEventName = 'gem:keyword-swap-ready';
    const onKeywordSwapReady = () => {
      tryInitializeKeywordSwap();
    };
    window.addEventListener(readyEventName, onKeywordSwapReady, { once: true });

    // Fallback: if the ready event is missed, check periodically for up to 5 seconds.
    let attempts = 0;
    const maxAttempts = 20; // 20 * 250ms = 5 seconds
    const checkInterval = setInterval(() => {
      attempts++;
      if (tryInitializeKeywordSwap()) {
        window.removeEventListener(readyEventName, onKeywordSwapReady);
        clearInterval(checkInterval);
      } else if (attempts >= maxAttempts) {
        console.log("[Gem] Keyword swap initialization timed out - function not found");
        window.removeEventListener(readyEventName, onKeywordSwapReady);
        clearInterval(checkInterval);
      }
    }, 250);
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
