// link-highlight-preview.js — glow/pip overlays on links in the desktop preview iframe
(function () {
  'use strict';

  const IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe-desktop';
  const OVERLAY_CONTAINER_ID = 'gem-link-highlight-overlay-container';
  const STYLE_ID = 'gem-link-highlight-styles';
  const STORAGE_OVERLAY_ACTIVE_KEY = 'gemLinkHighlightOverlayActive';
  const STORAGE_PREVIEW_ENABLED_KEY = 'gemLinkHighlightPreviewEnabled';
  const STORAGE_SHOW_URLS_KEY = 'gemLinkHighlightShowUrls';
  const LABEL_MIN_WIDTH_PX = 100;

  const LINK_HIGHLIGHT_CSS = `
.gem-link-highlight-overlay {
  background: rgba(37, 99, 235, 0.12);
  box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.55);
  border-radius: 2px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gem-link-highlight-pip {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.95);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.85);
}
.gem-link-highlight-label {
  color: #fff;
  font-size: 10px;
  line-height: 1.2;
  font-family: system-ui, -apple-system, sans-serif;
  text-align: center;
  word-break: break-all;
  padding: 2px 10px;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
  background: rgba(37, 99, 235, 0.72);
  border-radius: 2px;
}
  `.trim();

  let isActive = false;
  let settingEnabled = true;
  let showUrls = false;
  let overlayContainer = null;
  let iframeMutationObserver = null;
  let lifecycleUnsub = null;
  let currentIframe = null;
  let debounceTimer = null;
  let scrollHandler = null;
  let resizeHandler = null;

  function debounce(fn, delay = 150) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, delay);
  }

  function loadSettings(callback) {
    chrome.storage.sync.get({
      [STORAGE_PREVIEW_ENABLED_KEY]: true,
      [STORAGE_SHOW_URLS_KEY]: 'hide-urls',
      [STORAGE_OVERLAY_ACTIVE_KEY]: false,
    }, (result) => {
      settingEnabled = result[STORAGE_PREVIEW_ENABLED_KEY] !== false;
      showUrls = result[STORAGE_SHOW_URLS_KEY] === 'show-urls';
      const overlayActive = result[STORAGE_OVERLAY_ACTIVE_KEY] === true;
      isActive = settingEnabled && overlayActive;
      if (callback) callback();
    });
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync') return;

    if (changes[STORAGE_PREVIEW_ENABLED_KEY]) {
      settingEnabled = changes[STORAGE_PREVIEW_ENABLED_KEY].newValue !== false;
      if (settingEnabled) {
        chrome.storage.sync.get({ [STORAGE_OVERLAY_ACTIVE_KEY]: false }, (result) => {
          const overlayOn = result[STORAGE_OVERLAY_ACTIVE_KEY] === true;
          isActive = overlayOn;
          if (isActive) enable();
          else disable();
          syncMenuIndicators();
        });
      } else {
        if (isActive) disable();
        isActive = false;
        syncMenuIndicators();
      }
    }

    if (changes[STORAGE_OVERLAY_ACTIVE_KEY] && settingEnabled) {
      isActive = changes[STORAGE_OVERLAY_ACTIVE_KEY].newValue === true;
      if (isActive) enable();
      else disable();
      syncMenuIndicators();
    }

    if (changes[STORAGE_SHOW_URLS_KEY]) {
      showUrls = changes[STORAGE_SHOW_URLS_KEY].newValue === 'show-urls';
      if (isActive && settingEnabled && currentIframe) {
        debounce(() => renderOverlays(currentIframe));
      }
    }
  });

  function syncMenuIndicators() {
    if (typeof window.gemSyncCompactEmailToolsFeatureMenuItems === 'function') {
      window.gemSyncCompactEmailToolsFeatureMenuItems();
    }
  }

  function toggle() {
    if (!settingEnabled) {
      try {
        chrome.storage.sync.set({ [STORAGE_PREVIEW_ENABLED_KEY]: true });
      } catch (_) {}
      return;
    }

    isActive = !isActive;

    if (isActive) {
      enable();
    } else {
      disable();
    }

    try {
      chrome.storage.sync.set({ [STORAGE_OVERLAY_ACTIVE_KEY]: isActive });
    } catch (_) {}

    syncMenuIndicators();
  }

  function enable() {
    watchIframeLifecycle();
    waitForIframeReady(bindToIframe);
  }

  function disable() {
    if (lifecycleUnsub) {
      lifecycleUnsub();
      lifecycleUnsub = null;
    }
    if (iframeMutationObserver) {
      iframeMutationObserver.disconnect();
      iframeMutationObserver = null;
    }
    removeViewportListeners();
    clearOverlays();
    currentIframe = null;
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  function waitForIframeReady(callback) {
    function tryReady() {
      const iframe = document.querySelector(IFRAME_SELECTOR);
      if (!iframe) return false;
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return false;
      callback(iframe);
      return true;
    }

    if (tryReady()) return;

    if (typeof window.gemDomWatchWaitFor === 'function') {
      window.gemDomWatchWaitFor(IFRAME_SELECTOR, function () {
        tryReady();
      });
    }
  }

  function ensureOverlayStyles(doc) {
    if (!doc || doc.getElementById(STYLE_ID)) return;

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = LINK_HIGHLIGHT_CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function removeOverlayStyles(doc) {
    if (!doc) return;
    const style = doc.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  function ensureOverlayContainer(doc) {
    if (overlayContainer && overlayContainer.ownerDocument === doc && overlayContainer.isConnected) {
      return overlayContainer;
    }

    ensureOverlayStyles(doc);

    overlayContainer = doc.createElement('div');
    overlayContainer.id = OVERLAY_CONTAINER_ID;
    Object.assign(overlayContainer.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '999999',
    });

    doc.body.appendChild(overlayContainer);
    return overlayContainer;
  }

  function clearOverlays() {
    if (overlayContainer) {
      const doc = overlayContainer.ownerDocument;
      overlayContainer.remove();
      overlayContainer = null;
      if (doc) removeOverlayStyles(doc);
    }
  }

  function isGemElement(el) {
    if (!el) return false;
    if (el.id && el.id.startsWith('gem-')) return true;
    if (el.classList) {
      for (const cls of el.classList) {
        if (cls.startsWith('gem-')) return true;
      }
    }
    return false;
  }

  function isInsideGemOverlay(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el) {
      if (el.id && el.id.startsWith('gem-')) return true;
      el = el.parentElement;
    }
    return false;
  }

  function truncateHref(href, maxLen = 48) {
    const raw = String(href || '').trim();
    if (!raw) return '(no href)';
    if (raw.length <= maxLen) return raw;
    return raw.slice(0, maxLen - 1) + '…';
  }

  function getAnchorId(anchor) {
    if (!anchor._gemLinkHighlightId) {
      anchor._gemLinkHighlightId = 'gem-link-' + Math.random().toString(36).slice(2, 10);
    }
    return anchor._gemLinkHighlightId;
  }

  function renderOverlays(iframe) {
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;

    const win = doc.defaultView || iframe.contentWindow;
    if (!win) return;

    const container = ensureOverlayContainer(doc);
    container.innerHTML = '';

    const scrollX = win.scrollX || 0;
    const scrollY = win.scrollY || 0;

    doc.querySelectorAll('a[href]').forEach((anchor) => {
      if (isGemElement(anchor)) return;

      const href = String(anchor.getAttribute('href') || '').trim();
      if (!href) return;

      const rect = anchor.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const overlay = doc.createElement('div');
      overlay.className = 'gem-link-highlight-overlay';
      overlay.setAttribute('data-gem-link-id', getAnchorId(anchor));
      Object.assign(overlay.style, {
        position: 'absolute',
        left: (rect.left + scrollX) + 'px',
        top: (rect.top + scrollY) + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        pointerEvents: 'none',
        boxSizing: 'border-box',
      });

      const pip = doc.createElement('span');
      pip.className = 'gem-link-highlight-pip';
      pip.setAttribute('aria-hidden', 'true');
      overlay.appendChild(pip);

      if (showUrls && rect.width >= LABEL_MIN_WIDTH_PX) {
        const label = doc.createElement('span');
        label.className = 'gem-link-highlight-label';
        label.textContent = truncateHref(href);
        overlay.appendChild(label);
      }

      container.appendChild(overlay);
    });
  }

  function removeViewportListeners() {
    if (scrollHandler && currentIframe) {
      try {
        const win = currentIframe.contentWindow;
        if (win) {
          win.removeEventListener('scroll', scrollHandler);
          win.removeEventListener('resize', resizeHandler);
        }
      } catch (_) {}
    }
    scrollHandler = null;
    resizeHandler = null;
  }

  function attachViewportListeners(iframe) {
    removeViewportListeners();

    const win = iframe.contentWindow;
    if (!win) return;

    const onViewportChange = () => {
      if (iframe !== currentIframe || !isActive) return;
      debounce(() => renderOverlays(iframe));
    };

    scrollHandler = onViewportChange;
    resizeHandler = onViewportChange;
    win.addEventListener('scroll', scrollHandler, { passive: true });
    win.addEventListener('resize', resizeHandler);
  }

  function bindToIframe(iframe) {
    currentIframe = iframe;

    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;

    attachViewportListeners(iframe);
    debounce(() => renderOverlays(iframe));

    if (iframeMutationObserver) {
      iframeMutationObserver.disconnect();
      iframeMutationObserver = null;
    }

    iframeMutationObserver = new MutationObserver((mutations) => {
      if (iframe !== currentIframe) return;

      let onlyOverlayChanges = true;
      for (const m of mutations) {
        if (isInsideGemOverlay(m.target)) continue;

        const hasNonGemNode = (nodes) =>
          Array.from(nodes).some((n) => n.nodeType === 1 && !isGemElement(n));

        if (
          hasNonGemNode(m.addedNodes)
          || hasNonGemNode(m.removedNodes)
          || m.type === 'characterData'
          || m.type === 'attributes'
        ) {
          onlyOverlayChanges = false;
          break;
        }
      }

      if (onlyOverlayChanges) return;

      debounce(() => renderOverlays(iframe));
    });

    iframeMutationObserver.observe(doc.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  }

  function watchIframeLifecycle() {
    if (lifecycleUnsub) {
      lifecycleUnsub();
      lifecycleUnsub = null;
    }

    if (typeof window.gemDomWatchSubscribe !== 'function') return;

    lifecycleUnsub = window.gemDomWatchSubscribe(function () {
      if (!isActive) return;

      const iframe = document.querySelector(IFRAME_SELECTOR);

      if (!iframe && currentIframe) {
        currentIframe = null;
        clearOverlays();
        if (iframeMutationObserver) {
          iframeMutationObserver.disconnect();
          iframeMutationObserver = null;
        }
        removeViewportListeners();
      }

      if (iframe && iframe !== currentIframe) {
        waitForIframeReady(bindToIframe);
      }
    });
  }

  loadSettings(() => {
    if (isActive) {
      enable();
    }
  });

  window.gemToggleLinkHighlightPreview = function gemToggleLinkHighlightPreview() {
    toggle();
    return isActive;
  };

  window.gemIsLinkHighlightPreviewActive = function gemIsLinkHighlightPreviewActive() {
    return !!(settingEnabled && isActive);
  };
})();
