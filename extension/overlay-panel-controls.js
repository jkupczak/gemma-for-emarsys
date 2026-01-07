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

    const GEM_RECENT_IMAGES_STORAGE_KEY = 'gemRecentImages';
    const GEM_RECENT_IMAGES_MAX = 100;
    const GEM_RECENT_IMAGES_BTN_CLASS = 'gem-recent-images-btn';
    const GEM_RECENT_IMAGES_PICKER_PREFS_KEY = 'gemRecentImagesPickerPrefs';

    function getRecentImagesPickerPrefs(callback) {
      try {
        chrome.storage.sync.get(
          {
            [GEM_RECENT_IMAGES_PICKER_PREFS_KEY]: {
              view: 'table',
              density: 'small'
            }
          },
          (result) => {
            const prefs = result && result[GEM_RECENT_IMAGES_PICKER_PREFS_KEY];
            const view = prefs && (prefs.view === 'grid' ? 'grid' : 'table');
            const density = prefs && (prefs.density === 'medium' || prefs.density === 'large' ? prefs.density : 'small');
            callback({ view, density });
          }
        );
      } catch (e) {
        callback({ view: 'table', density: 'small' });
      }
    }

    function saveRecentImagesPickerPrefs(prefs) {
      try {
        const view = prefs && (prefs.view === 'grid' ? 'grid' : 'table');
        const density = prefs && (prefs.density === 'medium' || prefs.density === 'large' ? prefs.density : 'small');
        chrome.storage.sync.set({
          [GEM_RECENT_IMAGES_PICKER_PREFS_KEY]: { view, density }
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
        chrome.storage.sync.get({ [GEM_RECENT_IMAGES_STORAGE_KEY]: [] }, (result) => {
          const list = result && result[GEM_RECENT_IMAGES_STORAGE_KEY];
          const raw = Array.isArray(list) ? list : [];
          // Prune invalid entries (e.g., ZeroWidthSpace) on read
          const cleaned = raw
            .map((x) => {
              const url = normalizeRecentImageUrlCandidate(x && x.url);
              const ts = (x && typeof x.ts === 'number') ? x.ts : 0;
              return url ? { url, ts } : null;
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
        chrome.storage.sync.set({ [GEM_RECENT_IMAGES_STORAGE_KEY]: list }, () => {
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
          next[idx] = { url: u, ts: now };
        } else {
          console.log('[Gem][RecentImages] Adding new URL:', u);
          next.push({ url: u, ts: now });
        }

        // Keep max size by trimming oldest
        next.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        while (next.length > GEM_RECENT_IMAGES_MAX) next.shift();

        saveRecentImages(next);
      });
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

    function showRecentImagesPicker(modal) {
      const leftPanelContainer = modal.querySelector('#gem-image-properties-left-panel');
      const previewCanvas = modal.querySelector('#gem-image-preview-canvas');
      if (!leftPanelContainer || !previewCanvas) return;

      // Create picker container once
      let picker = leftPanelContainer.querySelector('#gem-recent-images-picker');
      if (!picker) {
        picker = document.createElement('div');
        picker.id = 'gem-recent-images-picker';
        picker.className = 'gem-scrollable';
        picker.style.height = '100%';
        picker.style.width = '100%';
        picker.style.display = 'none';
        picker.style.overflow = 'auto';
        picker.style.background = 'var(--token-box-default-background)';
        picker.style.padding = '16px';
        picker.style.boxSizing = 'border-box';
        leftPanelContainer.appendChild(picker);

        // Delegate clicks for selecting
        picker.addEventListener('click', (e) => {
          const btn = e.target.closest && e.target.closest('.gem-recent-image-use-btn');
          if (!btn) return;
          const url = btn.getAttribute('data-url') || '';
          console.log('[Gem][RecentImages][SetUrl] Use clicked for url:', url);
          const ok = setActiveImageUrlCodeMirror(modal, url);
          if (!ok) {
            console.warn('[Gem][RecentImages] Failed to set image URL into active CodeMirror. Leaving picker open.');
            return;
          }
          upsertRecentImageUrl(url);
          // Close picker and restore preview
          picker.style.display = 'none';
          previewCanvas.style.display = '';
        });

        // Toggle view (table vs grid)
        picker.addEventListener('click', (e) => {
          const toggleBtn = e.target.closest && e.target.closest('.gem-recent-images-toggle-view-btn');
          if (!toggleBtn) return;
          picker.dataset.gemRecentImagesView = picker.dataset.gemRecentImagesView === 'grid' ? 'table' : 'grid';
          saveRecentImagesPickerPrefs({
            view: picker.dataset.gemRecentImagesView,
            density: picker.dataset.gemRecentImagesGridDensity || 'small'
          });
          // Re-render (stay open)
          showRecentImagesPicker(modal);
        });

        // Grid density (small/medium/large) - only affects grid view
        picker.addEventListener('click', (e) => {
          const densityBtn = e.target.closest && e.target.closest('.gem-recent-images-density-btn');
          if (!densityBtn) return;
          const cur = picker.dataset.gemRecentImagesGridDensity || 'small';
          const next = cur === 'small' ? 'medium' : (cur === 'medium' ? 'large' : 'small');
          picker.dataset.gemRecentImagesGridDensity = next;
          saveRecentImagesPickerPrefs({
            view: picker.dataset.gemRecentImagesView || 'table',
            density: picker.dataset.gemRecentImagesGridDensity
          });
          showRecentImagesPicker(modal);
        });

        // Close button
        picker.addEventListener('click', (e) => {
          const closeBtn = e.target.closest && e.target.closest('.gem-recent-images-close-btn');
          if (!closeBtn) return;
          picker.style.display = 'none';
          previewCanvas.style.display = '';
        });
      }

      // Load persisted prefs once per picker lifetime
      if (picker.dataset.gemRecentImagesPrefsLoaded !== 'true') {
        picker.dataset.gemRecentImagesPrefsLoaded = 'true';
        getRecentImagesPickerPrefs((prefs) => {
          picker.dataset.gemRecentImagesView = prefs.view;
          picker.dataset.gemRecentImagesGridDensity = prefs.density;
          showRecentImagesPicker(modal);
        });
        // Keep preview hidden while we load prefs; render will happen in callback
        previewCanvas.style.display = 'none';
        picker.style.display = '';
        return;
      }

      // Render
      getRecentImages((list) => {
        const rows = (Array.isArray(list) ? [...list] : [])
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
        const density = picker.dataset.gemRecentImagesGridDensity || 'small';
        const densityLabel =
          density === 'large' ? 'Large' :
          density === 'medium' ? 'Medium' :
          'Small';

        const header = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <div style="font-weight:600;">Recent Images</div>
            <div style="display:flex; gap:10px; align-items:center;">
              ${viewMode === 'grid' ? `<button class="e-btn e-btn-secondary gem-recent-images-density-btn" type="button">Density: ${densityLabel}</button>` : ''}
              <button class="e-btn e-btn-secondary gem-recent-images-toggle-view-btn" type="button">${toggleLabel}</button>
              <button class="e-btn e-btn-secondary gem-recent-images-close-btn" type="button">Back</button>
            </div>
          </div>
        `.trim();

        const empty = rows.length === 0
          ? '<div style="margin-top:10px; opacity:0.7;">No recent images yet. Open an image properties dialog with an image URL to start collecting them.</div>'
          : '';

        if (viewMode === 'grid') {
          picker.innerHTML = `
            ${header}
            <div class="gem-recent-images-grid">
              ${rows.map((r) => {
                const url = r.url || '';
                const ts = r.ts || 0;
                return `
                  <div class="gem-recent-image-tile" title="${escape(url)}">
                    <img class="gem-recent-image-thumb gem-bg-pattern" src="${escape(url)}" alt="" />
                    <div class="gem-recent-image-overlay">
                      <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(url)}">
                        <e-icon icon="plus" type="table">
                          <div class="e-icon-wrapper">
                            <div class="e-icon e-icon-table">&#xF155;</div>
                          </div>
                        </e-icon>
                        Add To Page
                      </button>
                    </div>
                    <div class="gem-recent-image-meta">
                      <div class="gem-recent-image-date">${escape(formatRecentImageDate(ts))}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            ${empty}
          `.trim();
        } else {
          picker.innerHTML = `
            ${header}
            <table data-e-version="2" class="e-table e-table-bordered gem-recent-images-table" style="width:100%; font-size: 14 px;">
              <thead>
                <tr>
                  <th style="width:140px;">Preview</th>
                  <th>URL</th>
                  <th style="width:160px;">Last Used</th>
                  <th style="width:140px; text-align:right;">Use</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r) => {
                  const url = r.url || '';
                  const ts = r.ts || 0;
                  return `
                    <tr>
                      <td style="padding:6px; width:140px; vertical-align:middle;">
                        <img class="gem-bg-pattern" src="${escape(url)}" style="display:block; width:128px; height:70px; object-fit:contain; border-radius:4px;" />
                      </td>
                      <td style="padding:6px; vertical-align:middle; word-break:break-word;">${escape(url)}</td>
                      <td style="padding:6px; vertical-align:middle;">${escape(formatRecentImageDate(ts))}</td>
                      <td style="padding:6px; vertical-align:middle; text-align:right;">
                        <button class="e-btn e-btn-primary gem-recent-image-use-btn" type="button" data-url="${escape(url)}">
                          <e-icon icon="plus" type="table">
                            <div class="e-icon-wrapper">
                              <div class="e-icon e-icon-table">&#xF155;</div>
                            </div>
                          </e-icon>
                          Add To Page
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            ${empty}
          `.trim();
        }
      });

      // Toggle display
      previewCanvas.style.display = 'none';
      picker.style.display = '';
    }

    function toggleRecentImagesPicker(modal) {
      const leftPanelContainer = modal.querySelector('#gem-image-properties-left-panel');
      const previewCanvas = modal.querySelector('#gem-image-preview-canvas');
      const picker = leftPanelContainer && leftPanelContainer.querySelector('#gem-recent-images-picker');
      if (!leftPanelContainer || !previewCanvas) return;

      if (picker && picker.style.display !== 'none') {
        picker.style.display = 'none';
        previewCanvas.style.display = '';
        return;
      }

      showRecentImagesPicker(modal);
    }

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

      // Find the dialog active element
      const dialogActive = modal.querySelector('.e-dialog-active');
      if (!dialogActive) {
        console.log("[Gem] Dialog active element not found");
        return;
      }

      // Apply flex styles to the dialog active element
      dialogActive.style.flexDirection = 'row';
      dialogActive.style.alignItems = 'stretch';
      dialogActive.style.padding = '54px 0';
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
      const leftPanelContainer = document.createElement('div');
      leftPanelContainer.id = 'gem-image-properties-left-panel';
      leftPanelContainer.style.height = '100%';
      leftPanelContainer.style.width = '100%';
      leftPanelContainer.style.zIndex = '9';

      // Create and insert the new left panel div before the container
      const leftPanel = document.createElement('div');
      leftPanel.id = 'gem-image-preview-canvas';
      leftPanel.style.backgroundColor = 'var(--token-box-default-background)';
      leftPanel.style.backgroundImage = 'linear-gradient(45deg, var(--token-background-strong) 25%, transparent 25%, transparent 75%, var(--token-background-strong) 75%, var(--token-background-strong)), linear-gradient(45deg, var(--token-background-strong) 25%, transparent 25%, transparent 75%, var(--token-background-strong) 75%, var(--token-background-strong))';
      leftPanel.style.backgroundPosition = '0 0, 10px 10px';
      leftPanel.style.backgroundSize = '20px 20px';
      leftPanel.style.height = '100%';
      leftPanel.style.width = '100%';

      leftPanelContainer.appendChild(leftPanel);

      // Insert before the container element
      dialogActive.insertBefore(leftPanelContainer, container);

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
        // Collect recent image immediately on open
        if (imageUrl) upsertRecentImageUrl(imageUrl);
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
                // Collect into recent images list
                upsertRecentImageUrl(newImageUrl);
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
          if (currentImageUrl) upsertRecentImageUrl(currentImageUrl);
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

      // ------------------------------------------------------------
      // Recent Images button + CodeMirror URL tracking
      // ------------------------------------------------------------

      // Insert button after the existing secondary button in the label row (with retries)
      ensureRecentImagesButton(modal, container, dialogActive);

      // Emarsys re-renders parts of this dialog when switching Desktop/Mobile tabs,
      // which can remove our injected button. Keep it present by re-applying on:
      // - tab clicks
      // - DOM changes where the button is missing
      const scheduleEnsureRecentImagesButton = () => {
        if (container._gemRecentImagesEnsureScheduled) return;
        container._gemRecentImagesEnsureScheduled = true;
        setTimeout(() => {
          container._gemRecentImagesEnsureScheduled = false;
          // If the button disappeared, re-insert it.
          if (!modal.querySelector(`.${GEM_RECENT_IMAGES_BTN_CLASS}`)) {
            console.log('[Gem][RecentImages] Button missing after re-render; re-inserting.');
            ensureRecentImagesButton(modal, container, dialogActive);
          }
        }, 75);
      };

      if (!dialogActive._gemRecentImagesTabClickBound) {
        dialogActive._gemRecentImagesTabClickBound = true;
        dialogActive.addEventListener('click', (e) => {
          const tab = e.target && e.target.closest && e.target.closest('.e-tabs__title');
          if (!tab) return;
          console.log('[Gem][RecentImages] Tab click detected:', tab.getAttribute('data-tab') || (tab.textContent || '').trim());
          scheduleEnsureRecentImagesButton();
        }, true);
      }

      if (!dialogActive._gemRecentImagesRerenderObserver) {
        dialogActive._gemRecentImagesRerenderObserver = new MutationObserver(() => {
          if (!modal.querySelector(`.${GEM_RECENT_IMAGES_BTN_CLASS}`)) {
            scheduleEnsureRecentImagesButton();
          }
        });
        dialogActive._gemRecentImagesRerenderObserver.observe(dialogActive, { childList: true, subtree: true });
      }

      // Watch for CodeMirror input field swapping in/out, and store the current URL whenever it appears.
      if (!container._gemRecentImagesCmObserver) {
        console.log('[Gem][RecentImages] Setting up CodeMirror observer');
        container._gemRecentImagesCmObserver = new MutationObserver(() => {
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