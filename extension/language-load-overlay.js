// language-load-overlay.js
// Shows a lightweight overlay spinner while a new language version loads.
(function () {
  const LOG_PREFIX = '[Gem][LanguageLoadOverlay]';
  const OVERLAY_ID = 'gem-language-load-overlay';
  const STYLE_ID = 'gem-language-load-style';
  const OVERLAY_TIMEOUT_MS = 20000;

  let lastSelectedValue = null;
  let languageObserver = null;
  let selectorObserver = null;
  let containerObserver = null;
  let rootObserver = null;
  let overlayTimeout = null;
  let setupScheduled = false;

  function getRootDocument() {
    try {
      return window.top && window.top.document ? window.top.document : document;
    } catch (_) {
      return document;
    }
  }

  function ensureStyle(rootDoc) {
    if (!rootDoc || rootDoc.getElementById(STYLE_ID)) return;
    const style = rootDoc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .gem-language-load-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.75);
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms ease;
        z-index: 9999;
      }
      .gem-language-load-overlay.is-visible {
        opacity: 1;
        pointer-events: auto;
      }
      .gem-language-load-spinner {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        border: 6px solid rgba(255,255,255,0.65);
        border-top-color: var(--token-blue-300, #93c5fd);
        animation: gem-language-load-spin 0.8s linear infinite;
      }
      @keyframes gem-language-load-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    (rootDoc.head || rootDoc.documentElement || rootDoc.body).appendChild(style);
  }

  function getIframesContainer() {
    const rootDoc = getRootDocument();
    return rootDoc.querySelector('vce-iframes-container');
  }

  function getMobilePreviewContainer() {
    const rootDoc = getRootDocument();
    return rootDoc.querySelector('.gem-iframe-wrapper');
  }

  function ensureOverlay(container, overlayId) {
    if (!container) return null;
    const rootDoc = container.ownerDocument || getRootDocument();
    ensureStyle(rootDoc);

    let overlay = rootDoc.getElementById(overlayId);
    if (!overlay) {
      overlay = rootDoc.createElement('div');
      overlay.id = overlayId;
      overlay.className = 'gem-language-load-overlay';
      overlay.innerHTML = '<div class="gem-language-load-spinner" role="status" aria-label="Loading"></div>';
    }

    const computed = rootDoc.defaultView && rootDoc.defaultView.getComputedStyle
      ? rootDoc.defaultView.getComputedStyle(container)
      : null;
    if (!computed || computed.position === 'static') {
      container.style.position = 'relative';
    }

    if (overlay.parentElement !== container) {
      container.appendChild(overlay);
    }

    return overlay;
  }

  function showOverlay(reason) {
    const container = getIframesContainer();
    const mobileContainer = getMobilePreviewContainer();
    let shown = 0;
    if (container) {
      const overlay = ensureOverlay(container, OVERLAY_ID);
      if (overlay) {
        overlay.classList.add('is-visible');
        shown += 1;
      }
    }
    if (mobileContainer) {
      const mobileOverlay = ensureOverlay(mobileContainer, `${OVERLAY_ID}-mobile`);
      if (mobileOverlay) {
        mobileOverlay.classList.add('is-visible');
        shown += 1;
      }
    }
    if (!shown) return;
    console.log(LOG_PREFIX, 'Overlay shown', reason ? `(${reason})` : '');

    if (overlayTimeout) clearTimeout(overlayTimeout);
    overlayTimeout = setTimeout(() => {
      overlayTimeout = null;
      hideOverlay('timeout');
    }, OVERLAY_TIMEOUT_MS);
  }

  function hideOverlay(reason) {
    const rootDoc = getRootDocument();
    const overlay = rootDoc.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.remove('is-visible');
    const mobileOverlay = rootDoc.getElementById(`${OVERLAY_ID}-mobile`);
    if (mobileOverlay) mobileOverlay.classList.remove('is-visible');
    if (overlayTimeout) {
      clearTimeout(overlayTimeout);
      overlayTimeout = null;
    }
    if (reason) {
      console.log(LOG_PREFIX, 'Overlay hidden', `(${reason})`);
    }
  }

  function getLanguageSelector() {
    const rootDoc = getRootDocument();
    return rootDoc.querySelector('vce-languages-selector');
  }

  function getLanguageOptions(selector) {
    if (!selector) return [];
    return Array.from(selector.querySelectorAll('e-select-option'));
  }

  function getSelectedValue(options) {
    for (const opt of options) {
      if (!opt || opt.nodeType !== Node.ELEMENT_NODE) continue;
      const attr = opt.getAttribute && opt.getAttribute('selected');
      const selected =
        attr === 'true' ||
        attr === 'selected' ||
        (attr === '' && opt.hasAttribute && opt.hasAttribute('selected')) ||
        (typeof opt.selected === 'boolean' && opt.selected);
      if (selected) {
        return opt.getAttribute('value') || opt.id || (opt.textContent || '').trim();
      }
    }
    return null;
  }

  function handleLanguageSelectionChange() {
    const selector = getLanguageSelector();
    if (!selector) return;
    const options = getLanguageOptions(selector);
    if (options.length < 2) return;
    const selectedValue = getSelectedValue(options);
    if (!selectedValue) return;
    if (selectedValue === lastSelectedValue) return;
    lastSelectedValue = selectedValue;
    showOverlay('language-change');
  }

  function attachLanguageObserver() {
    const selector = getLanguageSelector();
    if (!selector) return;

    if (selectorObserver) selectorObserver.disconnect();
    selectorObserver = new MutationObserver(() => scheduleSetup());
    selectorObserver.observe(selector, { childList: true, subtree: true });

    const options = getLanguageOptions(selector);
    if (languageObserver) languageObserver.disconnect();
    if (!options.length) return;

    lastSelectedValue = getSelectedValue(options);
    languageObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => m.type === 'attributes' && m.attributeName === 'selected');
      if (relevant) handleLanguageSelectionChange();
    });
    options.forEach((opt) => {
      languageObserver.observe(opt, { attributes: true, attributeFilter: ['selected'] });
    });
  }

  function attachContainerObserver() {
    const container = getIframesContainer();
    if (!container) return;
    if (containerObserver) containerObserver.disconnect();
    containerObserver = new MutationObserver((mutations) => {
      const changed = mutations.some((m) => m.type === 'attributes' && m.attributeName === 'content');
      if (changed) hideOverlay('iframe-content-change');
    });
    containerObserver.observe(container, { attributes: true, attributeFilter: ['content'] });
  }

  function scheduleSetup() {
    if (setupScheduled) return;
    setupScheduled = true;
    requestAnimationFrame(() => {
      setupScheduled = false;
      attachLanguageObserver();
      attachContainerObserver();
    });
  }

  function init() {
    scheduleSetup();
    if (rootObserver) return;
    const rootDoc = getRootDocument();
    if (!rootDoc || !rootDoc.body) return;
    rootObserver = new MutationObserver(() => scheduleSetup());
    rootObserver.observe(rootDoc.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
